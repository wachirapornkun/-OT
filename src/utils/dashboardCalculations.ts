import * as XLSX from 'xlsx';
import {
  AnesthesiaProductivityInput,
  CATEGORY_LABELS,
  DEFAULT_ANESTHESIA_PRODUCTIVITY,
  DepartmentSettings,
  PersonMonthlySummary,
  RosterMonth,
  StaffCategory,
} from '../types/roster';
import { getDaysInMonth, getThaiMonthYearLabel } from './thaiUtils';

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

export type ProductivityStatus = 'no-data' | 'under' | 'optimal' | 'overload';

export interface AnesthesiaProductivityResult {
  totalCases: number;
  caseBreakdown: AnesthesiaCaseBreakdownItem[];
  requiredNursingHours: number;
  actualNursingHours: number;
  actualWorkingOnlyHours: number;
  productivityPercent: number;
  baselineProductivityWithoutOtPercent: number;
  requiredFteAt100: number;
  currentHeadcount: number;
  fteGap: number; // positive = shortage (ขาดอัตรากำลัง), negative = surplus
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
 * and MOPH Anesthesiology Nursing Productivity (%).
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

  // Anesthesiology Nursing Productivity calculation (MOPH Nursing Division standard)
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
      label: 'GA ซับซ้อน / ฉุกเฉิน (ASA 3–5)',
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

  const totalCases = caseBreakdown.reduce((sum, item) => sum + item.cases, 0);
  const requiredNursingHours =
    input.mode === 'directHours'
      ? input.directRequiredHours
      : caseBreakdown.reduce((sum, item) => sum + item.requiredHours, 0);

  const scopeMetrics = input.staffScope === 'RN' ? categories.RN : all;
  const actualNursingHours = scopeMetrics.totalActualHours;
  const actualWorkingOnlyHours = scopeMetrics.workingHours;
  const hoursPerShift = input.hoursPerShift > 0 ? input.hoursPerShift : 7;

  const productivityPercent =
    actualNursingHours > 0 ? (requiredNursingHours / actualNursingHours) * 100 : 0;
  const baselineProductivityWithoutOtPercent =
    actualWorkingOnlyHours > 0
      ? (requiredNursingHours / actualWorkingOnlyHours) * 100
      : 0;

  const requiredFteAt100 =
    requiredNursingHours / (standardWorkingDays * hoursPerShift);
  const currentHeadcount = scopeMetrics.headcount;
  const fteGap = requiredFteAt100 - currentHeadcount;

  let status: ProductivityStatus = 'no-data';
  let statusLabel = 'รอกรอกปริมาณงานวิสัญญีประจำเดือน';
  let recommendation =
    'กรอกจำนวนผู้ป่วยวิสัญญีแยกตามประเภท (หรือกรอกชั่วโมงบริการรวม) เพื่อคำนวณค่า Productivity ตามเกณฑ์กองการพยาบาล กระทรวงสาธารณสุข (90–110%)';

  if (requiredNursingHours > 0 && actualNursingHours > 0) {
    if (productivityPercent > 110) {
      status = 'overload';
      statusLabel = 'สูงกว่าเกณฑ์มาตรฐาน (> 110% · ภาระงานเกินอัตรากำลัง)';
      recommendation =
        fteGap > 0
          ? `ภาระงานวิสัญญีเกินอัตรากำลังที่มีอยู่แม้จะจัดเวร OT เพิ่มแล้ว แนะนำพิจารณาขออัตรากำลัง${
              input.staffScope === 'RN' ? 'พยาบาลวิสัญญี (RN)' : 'บุคลากร'
            }เพิ่มประมาณ ${fteGap.toFixed(2)} อัตรา เพื่อให้ Productivity อยู่ในเกณฑ์ 90–110%`
          : 'ภาระงานต่อชั่วโมงปฏิบัติงานสูงกว่าเกณฑ์ 110% ควรทบทวนแผนการจัดเวรและสัดส่วนการขึ้นเวรรายวัน';
    } else if (productivityPercent >= 90) {
      status = 'optimal';
      statusLabel = 'อยู่ในเกณฑ์มาตรฐานกองการพยาบาล (90–110%)';
      recommendation =
        baselineProductivityWithoutOtPercent > 110
          ? `อัตรากำลังที่จัดขึ้นเวร (รวม OT) อยู่ในเกณฑ์เหมาะสม 90–110% แต่หากไม่ขึ้นเวร OT ภาระงานจะสูงถึง ${baselineProductivityWithoutOtPercent.toFixed(
              1,
            )}% (เทียบเท่าขาดคน ${scopeMetrics.otFteEquivalent.toFixed(2)} อัตรา)`
          : 'การจัดอัตรากำลังสอดคล้องกับภาระงานวิสัญญีในเดือนนี้อย่างเหมาะสมตามเกณฑ์มาตรฐาน 90–110%';
    } else {
      status = 'under';
      statusLabel = 'ต่ำกว่าเกณฑ์มาตรฐาน (< 90%)';
      recommendation =
        'ชั่วโมงการพยาบาลที่จัดขึ้นเวรมากกว่าชั่วโมงที่ต้องการตามยอดเคสที่กรอก ควรตรวจสอบว่ากรอกยอดผู้ป่วย/หัตถการครบถ้วนแล้ว หรือพิจารณาปรับลดเวร OT ที่เกินความจำเป็น';
    }
  } else if (requiredNursingHours > 0 && actualNursingHours === 0) {
    status = 'overload';
    statusLabel = 'ยังไม่มีข้อมูลการลงเวรในเดือนนี้';
    recommendation =
      'กรุณาลงตารางเวรในเดือนนี้ก่อน เพื่อให้ระบบคำนวณชั่วโมงปฏิบัติงานจริงและค่า Productivity ได้อย่างถูกต้อง';
  }

  return {
    daysInMonth,
    standardWorkingDays,
    holidayDays,
    categories,
    all,
    productivity: {
      totalCases,
      caseBreakdown,
      requiredNursingHours,
      actualNursingHours,
      actualWorkingOnlyHours,
      productivityPercent,
      baselineProductivityWithoutOtPercent,
      requiredFteAt100,
      currentHeadcount,
      fteGap,
      status,
      statusLabel,
      recommendation,
    },
  };
}

/**
 * Exports the Monthly OT, FTE Manpower & Anesthesiology Productivity Dashboard to Excel (.xlsx).
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

  // Sheet 2: Anesthesiology Nursing Productivity
  const p = analysis.productivity;
  const prodRows: (string | number)[][] = [
    [`รายงาน Productivity งานการพยาบาลวิสัญญี ประจำเดือน ${monthLabel}`],
    [
      `ขอบเขตบุคลากร: ${
        input.staffScope === 'RN' ? 'พยาบาลวิชาชีพ (RN) เท่านั้น' : 'ทีมการพยาบาลทั้งหมด (RN+PN+NA)'
      } · เกณฑ์ ${input.hoursPerShift} ชม./เวร`,
    ],
    [],
    ['ประเภทบริการวิสัญญี', 'จำนวนราย (เคส)', 'ชั่วโมงการพยาบาล/ราย (NHPP)', 'ชั่วโมงที่ต้องการรวม (ชม.)'],
    ...(input.mode === 'cases'
      ? p.caseBreakdown.map((item) => [
          item.label,
          item.cases,
          item.hoursPerCase,
          Number(item.requiredHours.toFixed(2)),
        ])
      : [['กรอกชั่วโมงบริการวิสัญญีรวมโดยตรง', '-', '-', Number(input.directRequiredHours.toFixed(2))]]),
    [],
    ['ตัวชี้วัด Productivity', 'ผลลัพธ์'],
    ['ชั่วโมงการพยาบาลที่ต้องการทั้งหมด (ชม.)', Number(p.requiredNursingHours.toFixed(2))],
    ['ชั่วโมงการพยาบาลที่จัดให้ปฏิบัติงานจริง (รวม OT) (ชม.)', Number(p.actualNursingHours.toFixed(2))],
    ['ชั่วโมงในเวลาราชการอย่างเดียว (ไม่รวม OT) (ชม.)', Number(p.actualWorkingOnlyHours.toFixed(2))],
    ['Productivity งานวิสัญญีจริง (%)', Number(p.productivityPercent.toFixed(2))],
    ['Productivity หากไม่ขึ้นเวร OT (%)', Number(p.baselineProductivityWithoutOtPercent.toFixed(2))],
    ['อัตรากำลังที่มีอยู่จริง (คน)', p.currentHeadcount],
    ['อัตรากำลังที่ต้องการตามเกณฑ์ 100% (อัตรา)', Number(p.requiredFteAt100.toFixed(2))],
    ['ส่วนต่างอัตรากำลัง ขาด(+)/เกิน(-) (อัตรา)', Number(p.fteGap.toFixed(2))],
    ['ผลการประเมิน', p.statusLabel],
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

  XLSX.writeFile(wb, `แดชบอร์ด_OT_อัตรากำลัง_Productivity_${month.monthId}.xlsx`);
}
