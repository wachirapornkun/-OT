import * as XLSX from 'xlsx';
import {
  AnesthesiaProductivityInput,
  CATEGORY_LABELS,
  DEFAULT_ANESTHESIA_PRODUCTIVITY,
  DepartmentSettings,
  MonthlyShiftEntry,
  PersonMonthlySummary,
  RosterMonth,
  StaffCategory,
  StaffMember,
} from '../types/roster';
import { calculatePersonMonthlySummary } from './rosterCalculations';
import {
  formatMonthId,
  getBuddhistYear,
  getDaysInMonth,
  getDefaultHolidaysForMonth,
  getDefaultPayDateLabel,
  getDefaultPublicHolidaysForMonth,
  getThaiMonthYearLabel,
  parseMonthId,
  THAI_MONTHS_SHORT,
} from './thaiUtils';

export interface CategoryManpowerMetrics {
  category: StaffCategory | 'ALL';
  label: string;
  shortLabel: string;
  headcount: number;
  workingShifts: number;
  otMorningShifts: number;
  otAfternoonShifts: number;
  otNightShifts: number;
  publicHolidayShifts: number;
  regularOtShifts: number;
  workloadShifts: number;
  smcShifts: number;
  standbyShifts: number;
  countedOtShifts: number;
  totalActiveShifts: number;
  workingHours: number;
  otHours: number;
  totalActualHours: number;
  avgOtPerPerson: number;
  otFteEquivalent: number;
  totalEffectiveFte: number;
  otLoadRatioPercent: number;
  otBudgetBaht: number;
}

export interface AnesthesiaCaseBreakdownItem {
  key: 'ga' | 'gaComplex' | 'regional' | 'mac' | 'clinicVisit';
  label: string;
  sublabel: string;
  cases: number;
  hoursPerCase: number;
  requiredHours: number;
}

export interface AsaBreakdownItem {
  key: 'asa1' | 'asa2' | 'asa3' | 'asa4' | 'asa5';
  classCode: string;
  label: string;
  sublabel: string;
  directRefHours: number;
  indirectRefHours: number;
  cases: number;
  hoursPerCase: number;
  requiredHours: number;
}

export type ProductivityStatus = 'no-data' | 'under' | 'optimal' | 'overload';

export interface AnesthesiaProductivityResult {
  totalCases: number;
  asaBreakdown: AsaBreakdownItem[];
  caseBreakdown: AnesthesiaCaseBreakdownItem[];
  requiredNursingHours: number;
  actualNursingHours: number;
  actualWorkingOnlyHours: number;
  productivityPercent: number;
  baselineProductivityWithoutOtPercent: number;
  requiredFteAt100: number;
  reliefFactor: number;
  requiredFteWithRelief: number;
  currentHeadcount: number;
  fteGap: number; // เทียบภาระงาน 100% (บวก = ขาดอัตรากำลัง)
  fteWithReliefGap: number; // เทียบอัตรากำลังรวมเผื่อวันลา/อบรมตามสูตรกองการพยาบาล
  avgWeeklyHoursPerPerson: number; // ชม.ทำงานเฉลี่ย/สัปดาห์ต่อคน (เกณฑ์สภาการพยาบาล <= 52 ชม./สัปดาห์)
  status: ProductivityStatus;
  statusLabel: string;
  recommendation: string;
}

export interface MonthlyDashboardAnalysis {
  daysInMonth: number;
  standardWorkingDays: number;
  holidayDays: number;
  categories: Record<StaffCategory, CategoryManpowerMetrics>;
  all: CategoryManpowerMetrics;
  productivity: AnesthesiaProductivityResult;
}

export function resolveProductivityInput(
  month: RosterMonth,
): AnesthesiaProductivityInput {
  if (!month.productivity) {
    return { ...DEFAULT_ANESTHESIA_PRODUCTIVITY };
  }
  return {
    ...DEFAULT_ANESTHESIA_PRODUCTIVITY,
    ...month.productivity,
  };
}

function buildCategoryMetrics(
  category: StaffCategory | 'ALL',
  list: PersonMonthlySummary[],
  standardWorkingDays: number,
  input: AnesthesiaProductivityInput,
): CategoryManpowerMetrics {
  const headcount = list.length;
  let workingShifts = 0;
  let otMorningShifts = 0;
  let otAfternoonShifts = 0;
  let otNightShifts = 0;
  let publicHolidayShifts = 0;
  let workloadShifts = 0;
  let smcShifts = 0;
  let standbyShifts = 0;
  let otBudgetBaht = 0;

  for (const s of list) {
    workingShifts += s.workingDaysCount;
    otMorningShifts += s.otMorningDays.length;
    otAfternoonShifts += s.otAfternoonDays.length;
    otNightShifts += s.otNightDays.length;
    publicHolidayShifts += s.explicitPublicHolidayCount;
    workloadShifts += s.workloadCount;
    smcShifts += s.smcCount;
    standbyShifts += s.standbyCount;
    otBudgetBaht += s.regularOtTotal;
  }

  const regularOtShifts =
    otMorningShifts + otAfternoonShifts + otNightShifts + publicHolidayShifts;
  const countedOtShifts =
    regularOtShifts +
    (input.includeWorkloadInOt ? workloadShifts : 0) +
    (input.includeSmcInOt ? smcShifts : 0);
  const totalActiveShifts =
    workingShifts +
    countedOtShifts +
    (input.includeStandbyInHours ? standbyShifts : 0);

  const hoursPerShift = input.hoursPerShift > 0 ? input.hoursPerShift : 7;
  const workingHours = workingShifts * hoursPerShift;
  const otHours = countedOtShifts * hoursPerShift;
  const totalActualHours = totalActiveShifts * hoursPerShift;
  const avgOtPerPerson = headcount > 0 ? countedOtShifts / headcount : 0;
  const safeWorkDays = Math.max(1, standardWorkingDays);
  const otFteEquivalent = countedOtShifts / safeWorkDays;
  const totalEffectiveFte = totalActiveShifts / safeWorkDays;
  const otLoadRatioPercent =
    headcount > 0 ? (otFteEquivalent / headcount) * 100 : 0;

  const labelMap: Record<StaffCategory | 'ALL', string> = {
    RN: `${CATEGORY_LABELS.RN} (RN)`,
    PN: `${CATEGORY_LABELS.PN} (PN)`,
    NA: `${CATEGORY_LABELS.NA} (NA)`,
    ALL: 'รวมทุกสายงาน (RN + PN + NA)',
  };

  const shortMap: Record<StaffCategory | 'ALL', string> = {
    RN: 'RN',
    PN: 'PN',
    NA: 'NA',
    ALL: 'รวม',
  };

  return {
    category,
    label: labelMap[category],
    shortLabel: shortMap[category],
    headcount,
    workingShifts,
    otMorningShifts,
    otAfternoonShifts,
    otNightShifts,
    publicHolidayShifts,
    regularOtShifts,
    workloadShifts,
    smcShifts,
    standbyShifts,
    countedOtShifts,
    totalActiveShifts,
    workingHours,
    otHours,
    totalActualHours,
    avgOtPerPerson,
    otFteEquivalent,
    totalEffectiveFte,
    otLoadRatioPercent,
    otBudgetBaht,
  };
}

/**
 * Computes monthly OT breakdown by RN/PN/NA, FTE manpower equivalents,
 * and MOPH Nursing Division Anesthesiology Productivity (%).
 */
export function calculateMonthlyDashboard(
  month: RosterMonth,
  summaries: PersonMonthlySummary[],
  input: AnesthesiaProductivityInput,
): MonthlyDashboardAnalysis {
  const daysInMonth = getDaysInMonth(month.yearAD, month.monthNumber);
  const holidayDays = month.holidays.length;
  const standardWorkingDays = Math.max(1, daysInMonth - holidayDays);

  const rnList = summaries.filter((s) => s.staff.category === 'RN');
  const pnList = summaries.filter((s) => s.staff.category === 'PN');
  const naList = summaries.filter((s) => s.staff.category === 'NA');

  const categories: Record<StaffCategory, CategoryManpowerMetrics> = {
    RN: buildCategoryMetrics('RN', rnList, standardWorkingDays, input),
    PN: buildCategoryMetrics('PN', pnList, standardWorkingDays, input),
    NA: buildCategoryMetrics('NA', naList, standardWorkingDays, input),
  };

  const all = buildCategoryMetrics('ALL', summaries, standardWorkingDays, input);

  // Mode 1 (Official MOPH Nursing Division): ASA Physical Status Class I–V
  const asaBreakdown: AsaBreakdownItem[] = [
    {
      key: 'asa1',
      classCode: 'ASA I',
      label: 'ผู้ป่วยประเภทที่ 1 (ASA Class I)',
      sublabel: 'สุขภาพแข็งแรงปกติ ไม่มีโรคประจำตัว (โดยตรง 2.78 + โดยอ้อม 0.75 ชม.)',
      directRefHours: 2.78,
      indirectRefHours: 0.75,
      cases: input.asa1Cases,
      hoursPerCase: input.asa1HoursPerCase,
      requiredHours: input.asa1Cases * input.asa1HoursPerCase,
    },
    {
      key: 'asa2',
      classCode: 'ASA II',
      label: 'ผู้ป่วยประเภทที่ 2 (ASA Class II)',
      sublabel: 'มีโรคประจำตัวเล็กน้อย ควบคุมอาการได้ (โดยตรง 4.35 + โดยอ้อม 0.98 ชม.)',
      directRefHours: 4.35,
      indirectRefHours: 0.98,
      cases: input.asa2Cases,
      hoursPerCase: input.asa2HoursPerCase,
      requiredHours: input.asa2Cases * input.asa2HoursPerCase,
    },
    {
      key: 'asa3',
      classCode: 'ASA III',
      label: 'ผู้ป่วยประเภทที่ 3 (ASA Class III)',
      sublabel: 'มีโรคประจำตัวรุนแรง จำกัดการทำกิจกรรม (โดยตรง 5.20 + โดยอ้อม 1.44 ชม.)',
      directRefHours: 5.2,
      indirectRefHours: 1.44,
      cases: input.asa3Cases,
      hoursPerCase: input.asa3HoursPerCase,
      requiredHours: input.asa3Cases * input.asa3HoursPerCase,
    },
    {
      key: 'asa4',
      classCode: 'ASA IV',
      label: 'ผู้ป่วยประเภทที่ 4 (ASA Class IV)',
      sublabel: 'โรครุนแรงคุกคามชีวิตตลอดเวลา (โดยตรง 5.52 + โดยอ้อม 1.60 ชม.)',
      directRefHours: 5.52,
      indirectRefHours: 1.6,
      cases: input.asa4Cases,
      hoursPerCase: input.asa4HoursPerCase,
      requiredHours: input.asa4Cases * input.asa4HoursPerCase,
    },
    {
      key: 'asa5',
      classCode: 'ASA V',
      label: 'ผู้ป่วยประเภทที่ 5 (ASA Class V)',
      sublabel: 'ผู้ป่วยวิกฤตขั้นรุนแรง เสี่ยงเสียชีวิตหากไม่ผ่าตัด (โดยตรง 6.00 + โดยอ้อม 1.53 ชม.)',
      directRefHours: 6.0,
      indirectRefHours: 1.53,
      cases: input.asa5Cases,
      hoursPerCase: input.asa5HoursPerCase,
      requiredHours: input.asa5Cases * input.asa5HoursPerCase,
    },
  ];

  // Mode 2 (Alternative): Anesthesia Technique / Service Type
  const caseBreakdown: AnesthesiaCaseBreakdownItem[] = [
    {
      key: 'ga',
      label: 'General Anesthesia (GA ทั่วไป)',
      sublabel: 'ดมยาสลบทั่วไป เตรียมผู้ป่วย + ดูแลในห้องผ่าตัด + PACU',
      cases: input.gaCases,
      hoursPerCase: input.gaHoursPerCase,
      requiredHours: input.gaCases * input.gaHoursPerCase,
    },
    {
      key: 'gaComplex',
      label: 'GA ซับซ้อน / ฉุกเฉิน (Major / Emergency)',
      sublabel: 'เคสผ่าตัดใหญ่ เคสฉุกเฉิน หรือผู้ป่วยวิกฤตที่ต้องการการดูแลใกล้ชิด',
      cases: input.gaComplexCases,
      hoursPerCase: input.gaComplexHoursPerCase,
      requiredHours: input.gaComplexCases * input.gaComplexHoursPerCase,
    },
    {
      key: 'regional',
      label: 'Regional Anesthesia (SB / Epidural / Block)',
      sublabel: 'ฉีดยาชาเข้าไขสันหลัง / เหนือดูรา / Nerve Block',
      cases: input.regionalCases,
      hoursPerCase: input.regionalHoursPerCase,
      requiredHours: input.regionalCases * input.regionalHoursPerCase,
    },
    {
      key: 'mac',
      label: 'MAC / TIVA / บริการนอกห้องผ่าตัด',
      sublabel: 'ส่องกล้อง / IV Sedation / หัตถการนอกห้องผ่าตัด',
      cases: input.macCases,
      hoursPerCase: input.macHoursPerCase,
      requiredHours: input.macCases * input.macHoursPerCase,
    },
    {
      key: 'clinicVisit',
      label: 'Pre-anesthetic / Post-op Visit / Pain Clinic',
      sublabel: 'ตรวจประเมินก่อนผ่าตัด เยี่ยมหลังผ่าตัด และคลินิกระงับปวด',
      cases: input.clinicVisitCases,
      hoursPerCase: input.clinicVisitHoursPerCase,
      requiredHours: input.clinicVisitCases * input.clinicVisitHoursPerCase,
    },
  ];

  const totalCases =
    input.mode === 'asa'
      ? asaBreakdown.reduce((sum, item) => sum + item.cases, 0)
      : input.mode === 'cases'
      ? caseBreakdown.reduce((sum, item) => sum + item.cases, 0)
      : 0;

  const requiredNursingHours =
    input.mode === 'asa'
      ? asaBreakdown.reduce((sum, item) => sum + item.requiredHours, 0)
      : input.mode === 'cases'
      ? caseBreakdown.reduce((sum, item) => sum + item.requiredHours, 0)
      : input.directRequiredHours;

  const scopeMetrics = input.staffScope === 'RN' ? categories.RN : all;
  const actualNursingHours = scopeMetrics.totalActualHours;
  const actualWorkingOnlyHours = scopeMetrics.workingHours;
  const hoursPerShift = input.hoursPerShift > 0 ? input.hoursPerShift : 7;
  const reliefFactor =
    input.reliefFactor >= 1 && input.reliefFactor <= 2
      ? input.reliefFactor
      : DEFAULT_ANESTHESIA_PRODUCTIVITY.reliefFactor;

  const productivityPercent =
    actualNursingHours > 0 ? (requiredNursingHours / actualNursingHours) * 100 : 0;
  const baselineProductivityWithoutOtPercent =
    actualWorkingOnlyHours > 0
      ? (requiredNursingHours / actualWorkingOnlyHours) * 100
      : 0;

  const requiredFteAt100 =
    requiredNursingHours / (standardWorkingDays * hoursPerShift);
  const requiredFteWithRelief = requiredFteAt100 * reliefFactor;
  const currentHeadcount = scopeMetrics.headcount;
  const fteGap = requiredFteAt100 - currentHeadcount;
  const fteWithReliefGap = requiredFteWithRelief - currentHeadcount;
  const weeksInMonth = daysInMonth / 7;
  const avgWeeklyHoursPerPerson =
    currentHeadcount > 0 && weeksInMonth > 0
      ? actualNursingHours / currentHeadcount / weeksInMonth
      : 0;

  let status: ProductivityStatus = 'no-data';
  let statusLabel = 'รอกรอกจำนวนผู้ป่วยวิสัญญีประจำเดือน';
  let recommendation =
    'กรอกจำนวนผู้ป่วยวิสัญญีแยกตามระดับ ASA Class I–V (เกณฑ์กองการพยาบาล) หรือตามประเภทบริการ เพื่อคำนวณค่า Productivity มาตรฐานกองการพยาบาล (90–110%) และอัตรากำลังที่ต้องการ';

  if (requiredNursingHours > 0 && actualNursingHours > 0) {
    if (productivityPercent > 110) {
      status = 'overload';
      statusLabel = 'สูงกว่าเกณฑ์มาตรฐานกองการพยาบาล (> 110% · Under Staffed)';
      recommendation =
        fteWithReliefGap > 0
          ? `ภาระงานวิสัญญีเกินอัตรากำลังที่มีอยู่แม้จะจัดเวร OT แล้ว (หากคิดรวมตัวคูณเผื่อวันลา ×${reliefFactor.toFixed(
              1,
            )} ตามสูตรกองการพยาบาล ควรมี ${requiredFteWithRelief.toFixed(
              2,
            )} อัตรา / ขาดประมาณ ${fteWithReliefGap.toFixed(2)} อัตรา)`
          : 'ภาระงานต่อชั่วโมงปฏิบัติงานสูงกว่าเกณฑ์ 110% ควรทบทวนแผนการจัดเวรและสัดส่วนการขึ้นเวรรายวัน';
    } else if (productivityPercent >= 90) {
      status = 'optimal';
      const isSweetSpot = productivityPercent >= 95 && productivityPercent <= 105;
      statusLabel = isSweetSpot
        ? 'อยู่ในเกณฑ์เหมาะสมที่สุดของกองการพยาบาล (95–105%)'
        : 'อยู่ในเกณฑ์มาตรฐานกองการพยาบาล (90–110%)';
      recommendation =
        baselineProductivityWithoutOtPercent > 110
          ? `Productivity รวมเวร OT อยู่ในเกณฑ์มาตรฐานกองการพยาบาล แต่หากไม่ขึ้นเวร OT ภาระงานจะสูงถึง ${baselineProductivityWithoutOtPercent.toFixed(
              1,
            )}% (ต้องอาศัย OT เทียบเท่า +${scopeMetrics.otFteEquivalent.toFixed(
              2,
            )} อัตรา และเมื่อคิดรวมตัวคูณเผื่อวันลา ×${reliefFactor.toFixed(
              1,
            )} ควรมีกำลังคน ${requiredFteWithRelief.toFixed(2)} อัตรา)`
          : `การจัดอัตรากำลังสอดคล้องกับภาระงานวิสัญญีในเดือนนี้อย่างเหมาะสมตามเกณฑ์กองการพยาบาล (เมื่อรวมตัวคูณเผื่อวันลา ×${reliefFactor.toFixed(
              1,
            )} ควรมีกำลังคน ${requiredFteWithRelief.toFixed(2)} อัตรา)`;
    } else {
      status = 'under';
      statusLabel = 'ต่ำกว่าเกณฑ์มาตรฐานกองการพยาบาล (< 90% · Over Staffed)';
      recommendation =
        'ชั่วโมงปฏิบัติงานจริงมากกว่าชั่วโมงที่ผู้ป่วยต้องการตามยอดเคสที่กรอก ควรตรวจสอบว่ากรอกยอดผู้ป่วยวิสัญญี (ASA I–V หรือเคสทั้งหมด) ครบถ้วนแล้ว หรือพิจารณาปรับลดเวร OT ที่เกินความจำเป็น';
    }
  } else if (requiredNursingHours > 0 && actualNursingHours === 0) {
    status = 'overload';
    statusLabel = 'ยังไม่มีข้อมูลการลงเวรในเดือนนี้';
    recommendation =
      'กรุณาลงตารางเวรในเดือนนี้ก่อน เพื่อให้ระบบคำนวณชั่วโมงปฏิบัติงานจริงและค่า Productivity ตามสูตรกองการพยาบาลได้อย่างถูกต้อง';
  }

  return {
    daysInMonth,
    standardWorkingDays,
    holidayDays,
    categories,
    all,
    productivity: {
      totalCases,
      asaBreakdown,
      caseBreakdown,
      requiredNursingHours,
      actualNursingHours,
      actualWorkingOnlyHours,
      productivityPercent,
      baselineProductivityWithoutOtPercent,
      requiredFteAt100,
      reliefFactor,
      requiredFteWithRelief,
      currentHeadcount,
      fteGap,
      fteWithReliefGap,
      avgWeeklyHoursPerPerson,
      status,
      statusLabel,
      recommendation,
    },
  };
}

/**
 * Exports the Monthly OT, FTE Manpower & MOPH Nursing Division Anesthesiology Productivity Dashboard to Excel (.xlsx).
 */
export function exportDashboardExcel(params: {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
  input: AnesthesiaProductivityInput;
  analysis: MonthlyDashboardAnalysis;
}): void {
  const { month, settings, summaries, input, analysis } = params;
  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);
  const wb = XLSX.utils.book_new();

  // Sheet 1: OT & Manpower FTE Summary by Category
  const summaryRows: (string | number)[][] = [
    [`รายงานสรุปยอดเวร OT และอัตรากำลัง (FTE) ประจำเดือน ${monthLabel}`],
    [`${settings.departmentName} · ${settings.hospitalName}`],
    [
      `วันทำการในเดือน: ${analysis.standardWorkingDays} วัน · วันหยุด: ${analysis.holidayDays} วัน · เกณฑ์ชั่วโมง/เวร: ${input.hoursPerShift} ชม.`,
    ],
    [],
    [
      'สายงาน',
      'อัตรากำลังจริง (คน)',
      'เวรทำการ (เวร)',
      'OT ปกติ+นักขัตฤกษ์ (เวร)',
      'Workload (เวร)',
      'SMC (เวร)',
      'Standby (เวร)',
      'รวมเวรนอกเวลาที่คิด FTE',
      'เฉลี่ย OT/คน (เวร)',
      'เทียบเท่าอัตรากำลังจาก OT (อัตรา)',
      'อัตรากำลังรวมที่ต้องใช้จริง (อัตรา)',
      'ชั่วโมงปฏิบัติงานรวม (ชม.)',
      'ยอดเบิก OT สุทธิ (บาท)',
    ],
    ...(['RN', 'PN', 'NA'] as StaffCategory[]).map((cat) => {
      const m = analysis.categories[cat];
      return [
        m.label,
        m.headcount,
        m.workingShifts,
        m.regularOtShifts,
        m.workloadShifts,
        m.smcShifts,
        m.standbyShifts,
        m.countedOtShifts,
        Number(m.avgOtPerPerson.toFixed(2)),
        Number(m.otFteEquivalent.toFixed(2)),
        Number(m.totalEffectiveFte.toFixed(2)),
        Number(m.totalActualHours.toFixed(1)),
        m.otBudgetBaht,
      ];
    }),
    [
      analysis.all.label,
      analysis.all.headcount,
      analysis.all.workingShifts,
      analysis.all.regularOtShifts,
      analysis.all.workloadShifts,
      analysis.all.smcShifts,
      analysis.all.standbyShifts,
      analysis.all.countedOtShifts,
      Number(analysis.all.avgOtPerPerson.toFixed(2)),
      Number(analysis.all.otFteEquivalent.toFixed(2)),
      Number(analysis.all.totalEffectiveFte.toFixed(2)),
      Number(analysis.all.totalActualHours.toFixed(1)),
      analysis.all.otBudgetBaht,
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปOTและอัตรากำลัง');

  // Sheet 2: Anesthesiology Nursing Productivity (MOPH Nursing Division)
  const p = analysis.productivity;
  const modeLabel =
    input.mode === 'asa'
      ? 'จำแนกตามระดับ ASA Class I–V (เกณฑ์กองการพยาบาล)'
      : input.mode === 'cases'
      ? 'จำแนกตามประเภทบริการวิสัญญี'
      : 'กรอกชั่วโมงบริการรวมโดยตรง';

  const breakdownRows: (string | number)[][] =
    input.mode === 'asa'
      ? [
          [
            'ประเภทผู้ป่วย (ASA Class)',
            'จำนวนราย (เคส)',
            'ชั่วโมงการพยาบาล/ราย (NHPP)',
            'ชั่วโมงที่ต้องการรวม (ชม.)',
          ],
          ...p.asaBreakdown.map((item) => [
            item.label,
            item.cases,
            item.hoursPerCase,
            Number(item.requiredHours.toFixed(2)),
          ]),
        ]
      : input.mode === 'cases'
      ? [
          [
            'ประเภทบริการวิสัญญี',
            'จำนวนราย (เคส)',
            'ชั่วโมงการพยาบาล/ราย (NHPP)',
            'ชั่วโมงที่ต้องการรวม (ชม.)',
          ],
          ...p.caseBreakdown.map((item) => [
            item.label,
            item.cases,
            item.hoursPerCase,
            Number(item.requiredHours.toFixed(2)),
          ]),
        ]
      : [
          ['รายการ', 'จำนวนราย', 'NHPP', 'ชั่วโมงที่ต้องการรวม (ชม.)'],
          ['กรอกชั่วโมงบริการวิสัญญีรวมโดยตรง', '-', '-', Number(input.directRequiredHours.toFixed(2))],
        ];

  const prodRows: (string | number)[][] = [
    [`รายงาน Productivity งานการพยาบาลวิสัญญี ตามเกณฑ์กองการพยาบาล ประจำเดือน ${monthLabel}`],
    [
      `รูปแบบการคิด: ${modeLabel} · ขอบเขตบุคลากร: ${
        input.staffScope === 'RN' ? 'เฉพาะวิสัญญีพยาบาล (RN)' : 'ทั้งทีม (RN+PN+NA)'
      } · เกณฑ์ ${input.hoursPerShift} ชม./เวร · ตัวคูณเผื่อวันลา ×${p.reliefFactor.toFixed(1)}`,
    ],
    [],
    ...breakdownRows,
    [],
    ['ตัวชี้วัด Productivity และอัตรากำลังตามเกณฑ์กองการพยาบาล', 'ผลลัพธ์'],
    ['ชั่วโมงการพยาบาลที่ผู้ป่วยต้องการทั้งหมด (ตัวตั้ง) (ชม.)', Number(p.requiredNursingHours.toFixed(2))],
    ['ชั่วโมงที่บุคลากรปฏิบัติงานจริงรวม OT (ตัวหาร) (ชม.)', Number(p.actualNursingHours.toFixed(2))],
    ['ชั่วโมงในเวลาราชการอย่างเดียว (ไม่รวม OT) (ชม.)', Number(p.actualWorkingOnlyHours.toFixed(2))],
    ['Productivity งานวิสัญญีจริง (%) (เกณฑ์ สธ. 90–110%)', Number(p.productivityPercent.toFixed(2))],
    ['Productivity หากไม่ขึ้นเวร OT (%)', Number(p.baselineProductivityWithoutOtPercent.toFixed(2))],
    ['อัตรากำลังที่มีอยู่จริง (คน)', p.currentHeadcount],
    ['อัตรากำลังที่ต้องการตามภาระงาน 100% (อัตรา)', Number(p.requiredFteAt100.toFixed(2))],
    [`อัตรากำลังที่ควรมีรวมเผื่อวันลา/อบรม (×${p.reliefFactor.toFixed(1)}) (อัตรา)`, Number(p.requiredFteWithRelief.toFixed(2))],
    ['ส่วนต่างเทียบภาระงาน 100% ขาด(+)/เกิน(-) (อัตรา)', Number(p.fteGap.toFixed(2))],
    [`ส่วนต่างเทียบสูตรเผื่อวันลา ×${p.reliefFactor.toFixed(1)} ขาด(+)/เกิน(-) (อัตรา)`, Number(p.fteWithReliefGap.toFixed(2))],
    ['ชั่วโมงทำงานเฉลี่ยต่อคน/สัปดาห์ (เกณฑ์ความปลอดภัย ≤ 52 ชม.)', Number(p.avgWeeklyHoursPerPerson.toFixed(1))],
    ['ผลการประเมินตามเกณฑ์กองการพยาบาล', p.statusLabel],
  ];
  const wsProd = XLSX.utils.aoa_to_sheet(prodRows);
  XLSX.utils.book_append_sheet(wb, wsProd, 'Productivityวิสัญญี');

  // Sheet 3: Individual Staff OT Breakdown
  const staffRows: (string | number)[][] = [
    [`สรุปยอดเวร OT รายบุคคล ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'ชื่อ - สกุล',
      'สายงาน',
      'เวรทำการ',
      'OT เช้า',
      'OT บ่าย',
      'OT ดึก',
      'นักขัตฤกษ์',
      'Workload',
      'SMC',
      'Standby',
      'รวมเวรนอกเวลาที่คิด FTE',
      'เทียบเท่า FTE จาก OT',
      'ยอดเบิก OT (บาท)',
    ],
    ...summaries.map((s, idx) => {
      const regularOt =
        s.otMorningDays.length +
        s.otAfternoonDays.length +
        s.otNightDays.length +
        s.explicitPublicHolidayCount;
      const countedOt =
        regularOt +
        (input.includeWorkloadInOt ? s.workloadCount : 0) +
        (input.includeSmcInOt ? s.smcCount : 0);
      return [
        idx + 1,
        s.staff.fullName,
        s.staff.category,
        s.workingDaysCount,
        s.otMorningDays.length,
        s.otAfternoonDays.length,
        s.otNightDays.length,
        s.explicitPublicHolidayCount,
        s.workloadCount,
        s.smcCount,
        s.standbyCount,
        countedOt,
        Number((countedOt / analysis.standardWorkingDays).toFixed(2)),
        s.regularOtTotal,
      ];
    }),
  ];
  const wsStaff = XLSX.utils.aoa_to_sheet(staffRows);
  XLSX.utils.book_append_sheet(wb, wsStaff, 'ยอดOTรายบุคคล');

  XLSX.writeFile(wb, `แดชบอร์ด_OT_อัตรากำลัง_Productivity_กองการพยาบาล_${month.monthId}.xlsx`);
}

export type YearRangeType = 'fiscal' | 'calendar';

export interface MonthlyComparisonRow {
  monthId: string;
  yearAD: number;
  monthNumber: number;
  shortLabel: string; // e.g. ต.ค. 69
  fullLabel: string; // e.g. ตุลาคม 2569
  hasShiftData: boolean;
  hasProductivityData: boolean;
  standardWorkingDays: number;
  workingShifts: number;
  regularOtShifts: number;
  workloadShifts: number;
  smcShifts: number;
  rnOtShifts: number;
  pnOtShifts: number;
  naOtShifts: number;
  totalOtShifts: number;
  rnOtFte: number;
  pnOtFte: number;
  naOtFte: number;
  totalOtFte: number;
  totalEffectiveFte: number;
  otBudgetBaht: number;
  totalCases: number;
  requiredNursingHours: number;
  actualNursingHours: number;
  actualWorkingOnlyHours: number;
  productivityPercent: number;
  baselineProductivityWithoutOtPercent: number;
  requiredFteAt100: number;
  requiredFteWithRelief: number;
  fteWithReliefGap: number;
  status: ProductivityStatus;
}

export interface YearlyDashboardSummary {
  yearAD: number;
  yearBE: number;
  yearType: YearRangeType;
  periodLabel: string;
  months: MonthlyComparisonRow[];
  monthsWithShifts: number;
  monthsWithProductivity: number;
  totalRnOtShifts: number;
  totalPnOtShifts: number;
  totalNaOtShifts: number;
  totalOtShifts: number;
  avgMonthlyOtFte: number;
  avgRnOtFte: number;
  avgPnOtFte: number;
  avgNaOtFte: number;
  totalOtBudgetBaht: number;
  totalCases: number;
  totalRequiredHours: number;
  totalActualHours: number;
  totalWorkingOnlyHours: number;
  annualProductivityPercent: number;
  annualBaselineWithoutOtPercent: number;
  avgRequiredFteAt100: number;
  avgRequiredFteWithRelief: number;
  avgFteWithReliefGap: number;
  annualStatus: ProductivityStatus;
}

export function getFiscalYearADFromMonth(yearAD: number, monthNumber: number): number {
  // Thai MOPH Fiscal Year: Oct–Dec belong to next year's fiscal year
  return monthNumber >= 10 ? yearAD + 1 : yearAD;
}

export function getMonthIdsForYear(yearAD: number, yearType: YearRangeType): string[] {
  if (yearType === 'fiscal') {
    // Oct, Nov, Dec of (yearAD - 1) + Jan..Sep of yearAD
    const prevYear = yearAD - 1;
    return [
      formatMonthId(prevYear, 10),
      formatMonthId(prevYear, 11),
      formatMonthId(prevYear, 12),
      ...Array.from({ length: 9 }, (_, i) => formatMonthId(yearAD, i + 1)),
    ];
  }
  return Array.from({ length: 12 }, (_, i) => formatMonthId(yearAD, i + 1));
}

export function calculateYearlyMonthlyBreakdown(params: {
  yearAD: number;
  yearType: YearRangeType;
  activeStaff: StaffMember[];
  settings: DepartmentSettings;
  monthsById: Record<string, RosterMonth>;
  entriesByMonthId: Record<string, Record<string, MonthlyShiftEntry>>;
  globalOptions: Pick<
    AnesthesiaProductivityInput,
    | 'staffScope'
    | 'hoursPerShift'
    | 'reliefFactor'
    | 'includeWorkloadInOt'
    | 'includeSmcInOt'
    | 'includeStandbyInHours'
  >;
  draftsByMonthId?: Record<string, AnesthesiaProductivityInput>;
  liveActiveMonth?: RosterMonth;
  liveActiveEntries?: Record<string, MonthlyShiftEntry>;
  liveActiveDraft?: AnesthesiaProductivityInput;
}): YearlyDashboardSummary {
  const {
    yearAD,
    yearType,
    activeStaff,
    settings,
    monthsById,
    entriesByMonthId,
    globalOptions,
    draftsByMonthId,
    liveActiveMonth,
    liveActiveEntries,
    liveActiveDraft,
  } = params;

  const monthIds = getMonthIdsForYear(yearAD, yearType);
  const yearBE = getBuddhistYear(yearAD);
  const periodLabel =
    yearType === 'fiscal'
      ? `ปีงบประมาณ ${yearBE} (ต.ค. ${yearBE - 1} – ก.ย. ${yearBE})`
      : `ปีปฏิทิน พ.ศ. ${yearBE} (ม.ค. – ธ.ค. ${yearBE})`;

  const months: MonthlyComparisonRow[] = monthIds.map((monthId) => {
    const { yearAD: mYear, monthNumber: mNum } = parseMonthId(monthId);
    const isLive = liveActiveMonth && liveActiveMonth.monthId === monthId;

    const baseMonth: RosterMonth = isLive
      ? liveActiveMonth
      : monthsById[monthId] || {
          monthId,
          yearAD: mYear,
          monthNumber: mNum,
          holidays: getDefaultHolidaysForMonth(mYear, mNum),
          publicHolidays: getDefaultPublicHolidaysForMonth(mYear, mNum),
          payDateLabel: getDefaultPayDateLabel(mYear, mNum),
          status: 'open',
          visibility: 'department',
        };

    const entriesMap = isLive && liveActiveEntries ? liveActiveEntries : entriesByMonthId[monthId] || {};

    // Combine live/unsaved monthly productivity draft (if any) with saved month data & current global basis toggles
    const draftOverride = draftsByMonthId?.[monthId];
    const baseProd = draftOverride
      ? draftOverride
      : isLive && liveActiveDraft
      ? liveActiveDraft
      : resolveProductivityInput(baseMonth);

    const monthInput: AnesthesiaProductivityInput = {
      ...baseProd,
      staffScope: globalOptions.staffScope,
      hoursPerShift: globalOptions.hoursPerShift,
      reliefFactor: globalOptions.reliefFactor,
      includeWorkloadInOt: globalOptions.includeWorkloadInOt,
      includeSmcInOt: globalOptions.includeSmcInOt,
      includeStandbyInHours: globalOptions.includeStandbyInHours,
    };

    const summaries = activeStaff.map((staff) =>
      calculatePersonMonthlySummary(staff, entriesMap[staff.staffId] || null, baseMonth, settings),
    );

    const analysis = calculateMonthlyDashboard(baseMonth, summaries, monthInput);
    const prod = analysis.productivity;
    const hasShiftData = analysis.all.totalActiveShifts > 0 || analysis.all.standbyShifts > 0;
    const hasProductivityData = prod.requiredNursingHours > 0;
    const shortBE = String(getBuddhistYear(mYear)).slice(-2);

    return {
      monthId,
      yearAD: mYear,
      monthNumber: mNum,
      shortLabel: `${THAI_MONTHS_SHORT[mNum - 1]} ${shortBE}`,
      fullLabel: getThaiMonthYearLabel(mYear, mNum),
      hasShiftData,
      hasProductivityData,
      standardWorkingDays: analysis.standardWorkingDays,
      workingShifts: analysis.all.workingShifts,
      regularOtShifts: analysis.all.regularOtShifts,
      workloadShifts: monthInput.includeWorkloadInOt ? analysis.all.workloadShifts : 0,
      smcShifts: monthInput.includeSmcInOt ? analysis.all.smcShifts : 0,
      rnOtShifts: analysis.categories.RN.countedOtShifts,
      pnOtShifts: analysis.categories.PN.countedOtShifts,
      naOtShifts: analysis.categories.NA.countedOtShifts,
      totalOtShifts: analysis.all.countedOtShifts,
      rnOtFte: analysis.categories.RN.otFteEquivalent,
      pnOtFte: analysis.categories.PN.otFteEquivalent,
      naOtFte: analysis.categories.NA.otFteEquivalent,
      totalOtFte: analysis.all.otFteEquivalent,
      totalEffectiveFte: analysis.all.totalEffectiveFte,
      otBudgetBaht: analysis.all.otBudgetBaht,
      totalCases: prod.totalCases,
      requiredNursingHours: prod.requiredNursingHours,
      actualNursingHours: prod.actualNursingHours,
      actualWorkingOnlyHours: prod.actualWorkingOnlyHours,
      productivityPercent: prod.productivityPercent,
      baselineProductivityWithoutOtPercent: prod.baselineProductivityWithoutOtPercent,
      requiredFteAt100: prod.requiredFteAt100,
      requiredFteWithRelief: prod.requiredFteWithRelief,
      fteWithReliefGap: prod.fteWithReliefGap,
      status: prod.status,
    };
  });

  const shiftMonths = months.filter((m) => m.hasShiftData);
  const prodMonths = months.filter((m) => m.hasProductivityData);
  const shiftDivisor = Math.max(1, shiftMonths.length);
  const prodDivisor = Math.max(1, prodMonths.length);

  const totalRnOtShifts = months.reduce((s, m) => s + m.rnOtShifts, 0);
  const totalPnOtShifts = months.reduce((s, m) => s + m.pnOtShifts, 0);
  const totalNaOtShifts = months.reduce((s, m) => s + m.naOtShifts, 0);
  const totalOtShifts = months.reduce((s, m) => s + m.totalOtShifts, 0);
  const totalOtBudgetBaht = months.reduce((s, m) => s + m.otBudgetBaht, 0);

  const avgMonthlyOtFte =
    shiftMonths.length > 0
      ? shiftMonths.reduce((s, m) => s + m.totalOtFte, 0) / shiftDivisor
      : 0;
  const avgRnOtFte =
    shiftMonths.length > 0
      ? shiftMonths.reduce((s, m) => s + m.rnOtFte, 0) / shiftDivisor
      : 0;
  const avgPnOtFte =
    shiftMonths.length > 0
      ? shiftMonths.reduce((s, m) => s + m.pnOtFte, 0) / shiftDivisor
      : 0;
  const avgNaOtFte =
    shiftMonths.length > 0
      ? shiftMonths.reduce((s, m) => s + m.naOtFte, 0) / shiftDivisor
      : 0;

  const totalCases = months.reduce((s, m) => s + m.totalCases, 0);
  const totalRequiredHours = prodMonths.reduce((s, m) => s + m.requiredNursingHours, 0);
  // Weighted annual productivity uses actual hours of the months that have productivity inputs
  const totalActualHours = prodMonths.reduce((s, m) => s + m.actualNursingHours, 0);
  const totalWorkingOnlyHours = prodMonths.reduce((s, m) => s + m.actualWorkingOnlyHours, 0);

  const annualProductivityPercent =
    totalActualHours > 0 ? (totalRequiredHours / totalActualHours) * 100 : 0;
  const annualBaselineWithoutOtPercent =
    totalWorkingOnlyHours > 0 ? (totalRequiredHours / totalWorkingOnlyHours) * 100 : 0;

  const avgRequiredFteAt100 =
    prodMonths.length > 0
      ? prodMonths.reduce((s, m) => s + m.requiredFteAt100, 0) / prodDivisor
      : 0;
  const avgRequiredFteWithRelief =
    prodMonths.length > 0
      ? prodMonths.reduce((s, m) => s + m.requiredFteWithRelief, 0) / prodDivisor
      : 0;
  const avgFteWithReliefGap =
    prodMonths.length > 0
      ? prodMonths.reduce((s, m) => s + m.fteWithReliefGap, 0) / prodDivisor
      : 0;

  let annualStatus: ProductivityStatus = 'no-data';
  if (totalRequiredHours > 0 && totalActualHours > 0) {
    if (annualProductivityPercent > 110) annualStatus = 'overload';
    else if (annualProductivityPercent >= 90) annualStatus = 'optimal';
    else annualStatus = 'under';
  }

  return {
    yearAD,
    yearBE,
    yearType,
    periodLabel,
    months,
    monthsWithShifts: shiftMonths.length,
    monthsWithProductivity: prodMonths.length,
    totalRnOtShifts,
    totalPnOtShifts,
    totalNaOtShifts,
    totalOtShifts,
    avgMonthlyOtFte,
    avgRnOtFte,
    avgPnOtFte,
    avgNaOtFte,
    totalOtBudgetBaht,
    totalCases,
    totalRequiredHours,
    totalActualHours,
    totalWorkingOnlyHours,
    annualProductivityPercent,
    annualBaselineWithoutOtPercent,
    avgRequiredFteAt100,
    avgRequiredFteWithRelief,
    avgFteWithReliefGap,
    annualStatus,
  };
}

export function exportYearlyMonthlyBreakdownExcel(params: {
  summary: YearlyDashboardSummary;
  settings: DepartmentSettings;
  hoursPerShift: number;
  reliefFactor: number;
  staffScope: 'RN' | 'ALL';
}): void {
  const { summary, settings, hoursPerShift, reliefFactor, staffScope } = params;
  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [
    [`รายงานสรุปยอดเวร OT อัตรากำลัง และ Productivity งานวิสัญญี แยกรายเดือน — ${summary.periodLabel}`],
    [
      `${settings.departmentName} · ${settings.hospitalName} · ฐาน ${
        staffScope === 'RN' ? 'เฉพาะ RN' : 'ทั้งทีม RN+PN+NA'
      } · เกณฑ์ ${hoursPerShift} ชม./เวร · ตัวคูณเผื่อวันลา ×${reliefFactor.toFixed(1)}`,
    ],
    [],
    [
      'เดือน',
      'วันทำการ',
      'OT RN (เวร)',
      'OT PN (เวร)',
      'OT NA (เวร)',
      'OT รวม (เวร)',
      'OT FTE (อัตรา)',
      'ยอดเบิก OT (บาท)',
      'จำนวนเคสวิสัญญี (ราย)',
      'ชม.ที่ต้องการ (ชม.)',
      'ชม.ปฏิบัติงานจริง (ชม.)',
      'Productivity จริง (%)',
      'Productivity ไม่มี OT (%)',
      `อัตรากำลังสูตร สธ. ×${reliefFactor.toFixed(1)} (อัตรา)`,
      'ส่วนต่าง ขาด(+)/เกิน(-) (อัตรา)',
    ],
    ...summary.months.map((m) => [
      m.fullLabel,
      m.standardWorkingDays,
      m.rnOtShifts,
      m.pnOtShifts,
      m.naOtShifts,
      m.totalOtShifts,
      Number(m.totalOtFte.toFixed(2)),
      m.otBudgetBaht,
      m.totalCases,
      Number(m.requiredNursingHours.toFixed(1)),
      Number(m.actualNursingHours.toFixed(1)),
      m.hasProductivityData ? Number(m.productivityPercent.toFixed(2)) : '-',
      m.hasProductivityData ? Number(m.baselineProductivityWithoutOtPercent.toFixed(2)) : '-',
      m.hasProductivityData ? Number(m.requiredFteWithRelief.toFixed(2)) : '-',
      m.hasProductivityData ? Number(m.fteWithReliefGap.toFixed(2)) : '-',
    ]),
    [],
    [
      `รวม / เฉลี่ย (${summary.monthsWithShifts} เดือนที่มีเวร)`,
      '-',
      summary.totalRnOtShifts,
      summary.totalPnOtShifts,
      summary.totalNaOtShifts,
      summary.totalOtShifts,
      Number(summary.avgMonthlyOtFte.toFixed(2)),
      summary.totalOtBudgetBaht,
      summary.totalCases,
      Number(summary.totalRequiredHours.toFixed(1)),
      Number(summary.totalActualHours.toFixed(1)),
      summary.monthsWithProductivity > 0 ? Number(summary.annualProductivityPercent.toFixed(2)) : '-',
      summary.monthsWithProductivity > 0
        ? Number(summary.annualBaselineWithoutOtPercent.toFixed(2))
        : '-',
      summary.monthsWithProductivity > 0 ? Number(summary.avgRequiredFteWithRelief.toFixed(2)) : '-',
      summary.monthsWithProductivity > 0 ? Number(summary.avgFteWithReliefGap.toFixed(2)) : '-',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'สรุปรายเดือน12เดือน');
  const tag = summary.yearType === 'fiscal' ? `FY${summary.yearBE}` : `Y${summary.yearBE}`;
  XLSX.writeFile(wb, `สรุปรายเดือน_OT_Productivity_กองการพยาบาล_${tag}.xlsx`);
}

