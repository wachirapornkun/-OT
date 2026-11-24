import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Printer,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  AnesthesiaProductivityInput,
  DEFAULT_ANESTHESIA_PRODUCTIVITY,
  DepartmentSettings,
  MonthlyShiftEntry,
  ProductivityMode,
  RosterMonth,
  StaffMember,
} from '../types/roster';
import { saveMonthProductivity } from '../services/rosterService';
import { calculatePersonMonthlySummary } from '../utils/rosterCalculations';
import {
  calculateMonthlyDashboard,
  exportYearlyMonthlyBreakdownExcel,
  getMonthIdsForYear,
  MonthlyComparisonRow,
  ProductivityStatus,
  resolveProductivityInput,
  YearlyDashboardSummary,
  YearRangeType,
} from '../utils/dashboardCalculations';
import {
  formatCurrency,
  getBuddhistYear,
  getDefaultHolidaysForMonth,
  getDefaultPayDateLabel,
  getDefaultPublicHolidaysForMonth,
  getThaiMonthYearLabel,
  parseMonthId,
  THAI_MONTHS_SHORT,
} from '../utils/thaiUtils';

interface MonthlyProductivityEntryGridProps {
  yearAD: number;
  yearType: YearRangeType;
  activeMonthId: string;
  activeStaff: StaffMember[];
  settings: DepartmentSettings;
  monthsById: Record<string, RosterMonth>;
  entriesByMonthId: Record<string, Record<string, MonthlyShiftEntry>>;
  liveActiveMonth: RosterMonth;
  liveActiveEntries: Record<string, MonthlyShiftEntry>;
  globalOptions: Pick<
    AnesthesiaProductivityInput,
    | 'staffScope'
    | 'hoursPerShift'
    | 'reliefFactor'
    | 'includeWorkloadInOt'
    | 'includeSmcInOt'
    | 'includeStandbyInHours'
  >;
  loading: boolean;
  onChangeYearType: (type: YearRangeType) => void;
  onChangeYearAD: (yearAD: number) => void;
  onChangeGlobalReliefFactor: (factor: number) => void;
  onMonthProductivitySaved: (monthId: string, saved: AnesthesiaProductivityInput) => void;
  onOpenMonthDetail: (monthId: string) => void;
  onPrintA4?: (title?: string) => void;
}

const ASA_COLUMNS: {
  caseKey: 'asa1Cases' | 'asa2Cases' | 'asa3Cases' | 'asa4Cases' | 'asa5Cases';
  weightKey:
    | 'asa1HoursPerCase'
    | 'asa2HoursPerCase'
    | 'asa3HoursPerCase'
    | 'asa4HoursPerCase'
    | 'asa5HoursPerCase';
  shortLabel: string;
  tooltip: string;
  defaultHours: number;
}[] = [
  {
    caseKey: 'asa1Cases',
    weightKey: 'asa1HoursPerCase',
    shortLabel: 'ASA I',
    tooltip: 'สุขภาพดีปกติ (โดยตรง 2.78 + โดยอ้อม 0.75 ชม.)',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa1HoursPerCase,
  },
  {
    caseKey: 'asa2Cases',
    weightKey: 'asa2HoursPerCase',
    shortLabel: 'ASA II',
    tooltip: 'โรคประจำตัวเล็กน้อย (โดยตรง 4.35 + โดยอ้อม 0.98 ชม.)',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa2HoursPerCase,
  },
  {
    caseKey: 'asa3Cases',
    weightKey: 'asa3HoursPerCase',
    shortLabel: 'ASA III',
    tooltip: 'โรคประจำตัวรุนแรง (โดยตรง 5.20 + โดยอ้อม 1.44 ชม.)',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa3HoursPerCase,
  },
  {
    caseKey: 'asa4Cases',
    weightKey: 'asa4HoursPerCase',
    shortLabel: 'ASA IV',
    tooltip: 'โรครุนแรงคุกคามชีวิต (โดยตรง 5.52 + โดยอ้อม 1.60 ชม.)',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa4HoursPerCase,
  },
  {
    caseKey: 'asa5Cases',
    weightKey: 'asa5HoursPerCase',
    shortLabel: 'ASA V',
    tooltip: 'วิกฤตขั้นรุนแรง เสี่ยงเสียชีวิต (โดยตรง 6.00 + โดยอ้อม 1.53 ชม.)',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa5HoursPerCase,
  },
];

const SERVICE_COLUMNS: {
  caseKey: 'gaCases' | 'gaComplexCases' | 'regionalCases' | 'macCases' | 'clinicVisitCases';
  weightKey:
    | 'gaHoursPerCase'
    | 'gaComplexHoursPerCase'
    | 'regionalHoursPerCase'
    | 'macHoursPerCase'
    | 'clinicVisitHoursPerCase';
  shortLabel: string;
  tooltip: string;
  defaultHours: number;
}[] = [
  {
    caseKey: 'gaCases',
    weightKey: 'gaHoursPerCase',
    shortLabel: 'GA ทั่วไป',
    tooltip: 'ดมยาสลบทั่วไป + PACU',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.gaHoursPerCase,
  },
  {
    caseKey: 'gaComplexCases',
    weightKey: 'gaComplexHoursPerCase',
    shortLabel: 'GA ซับซ้อน',
    tooltip: 'เคสผ่าตัดใหญ่ / ฉุกเฉิน / วิกฤต',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.gaComplexHoursPerCase,
  },
  {
    caseKey: 'regionalCases',
    weightKey: 'regionalHoursPerCase',
    shortLabel: 'Regional',
    tooltip: 'SB / Epidural / Nerve Block',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.regionalHoursPerCase,
  },
  {
    caseKey: 'macCases',
    weightKey: 'macHoursPerCase',
    shortLabel: 'MAC/TIVA',
    tooltip: 'ส่องกล้อง / IV Sedation / นอก OR',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.macHoursPerCase,
  },
  {
    caseKey: 'clinicVisitCases',
    weightKey: 'clinicVisitHoursPerCase',
    shortLabel: 'Visit/Pain',
    tooltip: 'Pre-op / Post-op Visit / Pain Clinic',
    defaultHours: DEFAULT_ANESTHESIA_PRODUCTIVITY.clinicVisitHoursPerCase,
  },
];

function getStatusTextClass(status: ProductivityStatus): string {
  if (status === 'optimal') return 'text-emerald-700';
  if (status === 'overload') return 'text-rose-700';
  if (status === 'under') return 'text-amber-700';
  return 'text-slate-400';
}

export const MonthlyProductivityEntryGrid: React.FC<MonthlyProductivityEntryGridProps> = ({
  yearAD,
  yearType,
  activeMonthId,
  activeStaff,
  settings,
  monthsById,
  entriesByMonthId,
  liveActiveMonth,
  liveActiveEntries,
  globalOptions,
  loading,
  onChangeYearType,
  onChangeYearAD,
  onChangeGlobalReliefFactor,
  onMonthProductivitySaved,
  onOpenMonthDetail,
  onPrintA4,
}) => {
  const monthIds = useMemo(() => getMonthIdsForYear(yearAD, yearType), [yearAD, yearType]);
  const yearBE = getBuddhistYear(yearAD);
  const periodLabel =
    yearType === 'fiscal'
      ? `ปีงบประมาณ ${yearBE} (ต.ค. ${yearBE - 1} – ก.ย. ${yearBE})`
      : `ปีปฏิทิน พ.ศ. ${yearBE} (ม.ค. – ธ.ค. ${yearBE})`;

  const [entryMode, setEntryMode] = useState<ProductivityMode>('asa');
  const [draftsByMonthId, setDraftsByMonthId] = useState<
    Record<string, AnesthesiaProductivityInput>
  >({});
  const [dirtyMonthIds, setDirtyMonthIds] = useState<Record<string, boolean>>({});
  const [savingMonthId, setSavingMonthId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string>('');

  // Shared editable NHPP weights across the 12-month grid (defaults to MOPH Nursing Division ASA standards)
  const [weights, setWeights] = useState({
    asa1HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa1HoursPerCase,
    asa2HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa2HoursPerCase,
    asa3HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa3HoursPerCase,
    asa4HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa4HoursPerCase,
    asa5HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa5HoursPerCase,
    gaHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.gaHoursPerCase,
    gaComplexHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.gaComplexHoursPerCase,
    regionalHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.regionalHoursPerCase,
    macHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.macHoursPerCase,
    clinicVisitHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.clinicVisitHoursPerCase,
  });

  // Synchronize clean months from Firestore whenever year or fetched months update
  useEffect(() => {
    setDraftsByMonthId((prev) => {
      const next: Record<string, AnesthesiaProductivityInput> = {};
      for (const monthId of monthIds) {
        if (dirtyMonthIds[monthId] && prev[monthId]) {
          next[monthId] = prev[monthId];
          continue;
        }
        const sourceMonth =
          liveActiveMonth.monthId === monthId ? liveActiveMonth : monthsById[monthId];
        next[monthId] = sourceMonth
          ? resolveProductivityInput(sourceMonth)
          : { ...DEFAULT_ANESTHESIA_PRODUCTIVITY };
      }
      return next;
    });
  }, [monthIds, monthsById, liveActiveMonth]);

  // Clear dirty flags when switching year or yearType
  useEffect(() => {
    setDirtyMonthIds({});
    setSavedBanner('');
  }, [yearAD, yearType]);

  const updateMonthNumberField = (
    monthId: string,
    field: keyof AnesthesiaProductivityInput,
    rawValue: string,
  ) => {
    const parsed = Math.max(0, Number(rawValue) || 0);
    setDraftsByMonthId((prev) => {
      const current = prev[monthId] || { ...DEFAULT_ANESTHESIA_PRODUCTIVITY };
      return {
        ...prev,
        [monthId]: {
          ...current,
          mode: entryMode,
          ...weights,
          [field]: parsed,
        },
      };
    });
    setDirtyMonthIds((prev) => ({ ...prev, [monthId]: true }));
    setSavedBanner('');
  };

  const updateSharedWeight = (weightKey: keyof typeof weights, rawValue: string) => {
    const parsed = Math.max(0, Math.min(48, Number(rawValue) || 0));
    setWeights((prev) => ({ ...prev, [weightKey]: parsed }));
    // Apply updated weight to any month in the grid that already has cases or is dirty
    setDraftsByMonthId((prev) => {
      const next: Record<string, AnesthesiaProductivityInput> = {};
      for (const mId of monthIds) {
        const cur = prev[mId] || { ...DEFAULT_ANESTHESIA_PRODUCTIVITY };
        next[mId] = { ...cur, [weightKey]: parsed };
      }
      return next;
    });
    const touched: Record<string, boolean> = { ...dirtyMonthIds };
    for (const mId of monthIds) {
      const cur = draftsByMonthId[mId];
      if (
        cur &&
        (cur.asa1Cases > 0 ||
          cur.asa2Cases > 0 ||
          cur.asa3Cases > 0 ||
          cur.asa4Cases > 0 ||
          cur.asa5Cases > 0 ||
          cur.gaCases > 0 ||
          cur.gaComplexCases > 0 ||
          cur.regionalCases > 0 ||
          cur.macCases > 0 ||
          cur.clinicVisitCases > 0)
      ) {
        touched[mId] = true;
      }
    }
    setDirtyMonthIds(touched);
  };

  const handleResetStandardWeights = () => {
    const std = {
      asa1HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa1HoursPerCase,
      asa2HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa2HoursPerCase,
      asa3HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa3HoursPerCase,
      asa4HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa4HoursPerCase,
      asa5HoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.asa5HoursPerCase,
      gaHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.gaHoursPerCase,
      gaComplexHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.gaComplexHoursPerCase,
      regionalHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.regionalHoursPerCase,
      macHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.macHoursPerCase,
      clinicVisitHoursPerCase: DEFAULT_ANESTHESIA_PRODUCTIVITY.clinicVisitHoursPerCase,
    };
    setWeights(std);
    setDraftsByMonthId((prev) => {
      const next: Record<string, AnesthesiaProductivityInput> = {};
      for (const mId of monthIds) {
        const cur = prev[mId] || { ...DEFAULT_ANESTHESIA_PRODUCTIVITY };
        next[mId] = { ...cur, ...std };
      }
      return next;
    });
  };

  // Compute live 12-month results reflecting every keystroke immediately
  const computedRows = useMemo(() => {
    return monthIds.map((monthId) => {
      const { yearAD: mYear, monthNumber: mNum } = parseMonthId(monthId);
      const isLive = liveActiveMonth.monthId === monthId;
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

      const entriesMap = isLive ? liveActiveEntries : entriesByMonthId[monthId] || {};
      const draftRow = draftsByMonthId[monthId] || resolveProductivityInput(baseMonth);

      const effectiveInput: AnesthesiaProductivityInput = {
        ...draftRow,
        mode: entryMode,
        ...weights,
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
      const analysis = calculateMonthlyDashboard(baseMonth, summaries, effectiveInput);
      const prod = analysis.productivity;
      const hasShiftData = analysis.all.totalActiveShifts > 0 || analysis.all.standbyShifts > 0;
      const shortBE = String(getBuddhistYear(mYear)).slice(-2);

      const row: MonthlyComparisonRow = {
        monthId,
        yearAD: mYear,
        monthNumber: mNum,
        shortLabel: `${THAI_MONTHS_SHORT[mNum - 1]} ${shortBE}`,
        fullLabel: getThaiMonthYearLabel(mYear, mNum),
        hasShiftData,
        hasProductivityData: prod.requiredNursingHours > 0,
        standardWorkingDays: analysis.standardWorkingDays,
        workingShifts: analysis.all.workingShifts,
        regularOtShifts: analysis.all.regularOtShifts,
        workloadShifts: effectiveInput.includeWorkloadInOt ? analysis.all.workloadShifts : 0,
        smcShifts: effectiveInput.includeSmcInOt ? analysis.all.smcShifts : 0,
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

      return {
        monthId,
        input: effectiveInput,
        row,
        isDirty: Boolean(dirtyMonthIds[monthId]),
      };
    });
  }, [
    monthIds,
    liveActiveMonth,
    liveActiveEntries,
    monthsById,
    entriesByMonthId,
    draftsByMonthId,
    entryMode,
    weights,
    globalOptions,
    activeStaff,
    settings,
    dirtyMonthIds,
  ]);

  const totals = useMemo(() => {
    const asaTotals = {
      asa1Cases: 0,
      asa2Cases: 0,
      asa3Cases: 0,
      asa4Cases: 0,
      asa5Cases: 0,
    };
    const serviceTotals = {
      gaCases: 0,
      gaComplexCases: 0,
      regionalCases: 0,
      macCases: 0,
      clinicVisitCases: 0,
    };
    let totalCases = 0;
    let totalRequiredHours = 0;
    let totalActualHours = 0;
    let totalWorkingOnlyHours = 0;
    let monthsWithProd = 0;
    let sumFteWithRelief = 0;
    let sumFteGap = 0;

    for (const item of computedRows) {
      asaTotals.asa1Cases += item.input.asa1Cases;
      asaTotals.asa2Cases += item.input.asa2Cases;
      asaTotals.asa3Cases += item.input.asa3Cases;
      asaTotals.asa4Cases += item.input.asa4Cases;
      asaTotals.asa5Cases += item.input.asa5Cases;
      serviceTotals.gaCases += item.input.gaCases;
      serviceTotals.gaComplexCases += item.input.gaComplexCases;
      serviceTotals.regionalCases += item.input.regionalCases;
      serviceTotals.macCases += item.input.macCases;
      serviceTotals.clinicVisitCases += item.input.clinicVisitCases;

      totalCases += item.row.totalCases;
      if (item.row.hasProductivityData) {
        monthsWithProd += 1;
        totalRequiredHours += item.row.requiredNursingHours;
        totalActualHours += item.row.actualNursingHours;
        totalWorkingOnlyHours += item.row.actualWorkingOnlyHours;
        sumFteWithRelief += item.row.requiredFteWithRelief;
        sumFteGap += item.row.fteWithReliefGap;
      }
    }

    const annualProductivity =
      totalActualHours > 0 ? (totalRequiredHours / totalActualHours) * 100 : 0;
    const annualBaselineWithoutOt =
      totalWorkingOnlyHours > 0 ? (totalRequiredHours / totalWorkingOnlyHours) * 100 : 0;
    const avgFteWithRelief = monthsWithProd > 0 ? sumFteWithRelief / monthsWithProd : 0;
    const avgFteGap = monthsWithProd > 0 ? sumFteGap / monthsWithProd : 0;

    let status: ProductivityStatus = 'no-data';
    if (totalRequiredHours > 0 && totalActualHours > 0) {
      if (annualProductivity > 110) status = 'overload';
      else if (annualProductivity >= 90) status = 'optimal';
      else status = 'under';
    }

    return {
      asaTotals,
      serviceTotals,
      totalCases,
      totalRequiredHours,
      totalActualHours,
      annualProductivity,
      annualBaselineWithoutOt,
      monthsWithProd,
      avgFteWithRelief,
      avgFteGap,
      status,
    };
  }, [computedRows]);

  const dirtyList = useMemo(
    () => computedRows.filter((item) => item.isDirty),
    [computedRows],
  );

  const handleSaveSingleMonth = async (monthId: string) => {
    const target = computedRows.find((r) => r.monthId === monthId);
    if (!target) return;
    setSavingMonthId(monthId);
    try {
      const saved = await saveMonthProductivity(monthId, target.input);
      onMonthProductivitySaved(monthId, saved);
      setDirtyMonthIds((prev) => {
        const next = { ...prev };
        delete next[monthId];
        return next;
      });
      setSavedBanner(`บันทึกข้อมูลเดือน ${target.row.fullLabel} เรียบร้อยแล้ว`);
      window.setTimeout(() => setSavedBanner(''), 3000);
    } finally {
      setSavingMonthId(null);
    }
  };

  const handleSaveAllDirty = async () => {
    if (dirtyList.length === 0) return;
    setSavingAll(true);
    try {
      const results = await Promise.all(
        dirtyList.map(async (item) => {
          const saved = await saveMonthProductivity(item.monthId, item.input);
          return { monthId: item.monthId, saved };
        }),
      );
      results.forEach(({ monthId, saved }) => {
        onMonthProductivitySaved(monthId, saved);
      });
      setDirtyMonthIds({});
      setSavedBanner(`บันทึกข้อมูล Productivity ครบ ${results.length} เดือนเรียบร้อยแล้ว`);
      window.setTimeout(() => setSavedBanner(''), 3500);
    } finally {
      setSavingAll(false);
    }
  };

  const handleExportGridExcel = () => {
    const rows = computedRows.map((item) => item.row);
    const shiftMonths = rows.filter((r) => r.hasShiftData);
    const shiftDiv = Math.max(1, shiftMonths.length);
    const summaryForExport: YearlyDashboardSummary = {
      yearAD,
      yearBE,
      yearType,
      periodLabel,
      months: rows,
      monthsWithShifts: shiftMonths.length,
      monthsWithProductivity: totals.monthsWithProd,
      totalRnOtShifts: rows.reduce((s, m) => s + m.rnOtShifts, 0),
      totalPnOtShifts: rows.reduce((s, m) => s + m.pnOtShifts, 0),
      totalNaOtShifts: rows.reduce((s, m) => s + m.naOtShifts, 0),
      totalOtShifts: rows.reduce((s, m) => s + m.totalOtShifts, 0),
      avgMonthlyOtFte:
        shiftMonths.length > 0
          ? shiftMonths.reduce((s, m) => s + m.totalOtFte, 0) / shiftDiv
          : 0,
      avgRnOtFte:
        shiftMonths.length > 0
          ? shiftMonths.reduce((s, m) => s + m.rnOtFte, 0) / shiftDiv
          : 0,
      avgPnOtFte:
        shiftMonths.length > 0
          ? shiftMonths.reduce((s, m) => s + m.pnOtFte, 0) / shiftDiv
          : 0,
      avgNaOtFte:
        shiftMonths.length > 0
          ? shiftMonths.reduce((s, m) => s + m.naOtFte, 0) / shiftDiv
          : 0,
      totalOtBudgetBaht: rows.reduce((s, m) => s + m.otBudgetBaht, 0),
      totalCases: totals.totalCases,
      totalRequiredHours: totals.totalRequiredHours,
      totalActualHours: totals.totalActualHours,
      totalWorkingOnlyHours: rows.reduce((s, m) => s + m.actualWorkingOnlyHours, 0),
      annualProductivityPercent: totals.annualProductivity,
      annualBaselineWithoutOtPercent: totals.annualBaselineWithoutOt,
      avgRequiredFteAt100:
        totals.monthsWithProd > 0
          ? rows
              .filter((r) => r.hasProductivityData)
              .reduce((s, m) => s + m.requiredFteAt100, 0) / totals.monthsWithProd
          : 0,
      avgRequiredFteWithRelief: totals.avgFteWithRelief,
      avgFteWithReliefGap: totals.avgFteGap,
      annualStatus: totals.status,
    };

    exportYearlyMonthlyBreakdownExcel({
      summary: summaryForExport,
      settings,
      hoursPerShift: globalOptions.hoursPerShift,
      reliefFactor: globalOptions.reliefFactor,
      staffScope: globalOptions.staffScope,
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar: Fiscal/Calendar Year + Input Mode + Save All */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Fiscal / Calendar Year Toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeYearType('fiscal')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  yearType === 'fiscal'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ปีงบประมาณ (ต.ค.–ก.ย.)
              </button>
              <button
                type="button"
                onClick={() => onChangeYearType('calendar')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  yearType === 'calendar'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ปีปฏิทิน (ม.ค.–ธ.ค.)
              </button>
            </div>

            {/* Year Stepper */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeYearAD(yearAD - 1)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                aria-label="ปีก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                {yearType === 'fiscal' ? `ปีงบฯ ${yearBE}` : `พ.ศ. ${yearBE}`}
              </span>
              <button
                type="button"
                onClick={() => onChangeYearAD(yearAD + 1)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                aria-label="ปีถัดไป"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Entry Mode Selector */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setEntryMode('asa')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  entryMode === 'asa'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ASA I–V (กองการพยาบาล)
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('cases')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  entryMode === 'cases'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                แยกประเภทบริการ
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('directHours')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  entryMode === 'directHours'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                กรอกชั่วโมงรวม
              </button>
            </div>
          </div>

          {/* Right Save / Export / Print Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={dirtyList.length === 0 || savingAll}
              onClick={() => void handleSaveAllDirty()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {savingAll
                ? 'กำลังบันทึก...'
                : dirtyList.length > 0
                ? `บันทึกทั้งหมด (${dirtyList.length} เดือน)`
                : 'บันทึกครบแล้ว'}
            </button>
            <button
              type="button"
              onClick={handleExportGridExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              ส่งออก Excel
            </button>
            <button
              type="button"
              onClick={() =>
                onPrintA4
                  ? onPrintA4(`ตารางกรอกข้อมูล Productivity วิสัญญีรายเดือน ${periodLabel}`)
                  : window.print()
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              พิมพ์ A4
            </button>
          </div>
        </div>

        {/* Second Toolbar Row: Relief Factor + Standard NHPP Weights Quick Editor */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-600 whitespace-nowrap">
              ตัวคูณเผื่อวันลา (กองการพยาบาล):
            </span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { val: 1.0, label: '×1.0' },
                { val: 1.2, label: '×1.2 (ลาปกติ)' },
                { val: 1.4, label: '×1.4 (24 ชม. สธ.)' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => onChangeGlobalReliefFactor(opt.val)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    Math.abs(globalOptions.reliefFactor - opt.val) < 0.01
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {savedBanner && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="w-4 h-4 shrink-0" />
                {savedBanner}
              </span>
            )}
            {entryMode !== 'directHours' && (
              <button
                type="button"
                onClick={handleResetStandardWeights}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                คืนค่าชั่วโมงมาตรฐาน สธ.
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Printable Monthly Entry Table */}
      <div className="print-full-width space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight">
              ตารางบันทึกข้อมูล Productivity งานการพยาบาลวิสัญญี รายเดือน (12 เดือน)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {settings.departmentName} · {settings.hospitalName} ·{' '}
              <strong className="text-slate-900">{periodLabel}</strong>
            </p>
          </div>
          <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
            สูตรกองการพยาบาล = (ชม.ที่ผู้ป่วยต้องการ ÷ ชม.ปฏิบัติงานจริง) × 100 · เกณฑ์ 90–110%
          </div>
        </div>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs sm:text-[13px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="px-4 py-3 text-left whitespace-nowrap min-w-[145px]">เดือน</th>

                    {entryMode === 'asa' &&
                      ASA_COLUMNS.map((col) => (
                        <th
                          key={col.caseKey}
                          className="px-2 py-2.5 text-center whitespace-nowrap"
                          title={col.tooltip}
                        >
                          <div className="text-slate-900 font-bold">{col.shortLabel}</div>
                          <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-normal text-slate-500">
                            <input
                              type="number"
                              min={0}
                              max={48}
                              step={0.01}
                              value={weights[col.weightKey]}
                              onChange={(e) => updateSharedWeight(col.weightKey, e.target.value)}
                              aria-label={`ชั่วโมงต่อราย ${col.shortLabel}`}
                              className="no-print w-14 px-1 py-0.5 text-center font-mono tabular-nums text-[11px] bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                            />
                            <span className="print-only font-mono">
                              {weights[col.weightKey]}
                            </span>
                            <span>ชม.</span>
                          </div>
                        </th>
                      ))}

                    {entryMode === 'cases' &&
                      SERVICE_COLUMNS.map((col) => (
                        <th
                          key={col.caseKey}
                          className="px-2 py-2.5 text-center whitespace-nowrap"
                          title={col.tooltip}
                        >
                          <div className="text-slate-900 font-bold">{col.shortLabel}</div>
                          <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-normal text-slate-500">
                            <input
                              type="number"
                              min={0}
                              max={48}
                              step={0.25}
                              value={weights[col.weightKey]}
                              onChange={(e) => updateSharedWeight(col.weightKey, e.target.value)}
                              aria-label={`ชั่วโมงต่อราย ${col.shortLabel}`}
                              className="no-print w-14 px-1 py-0.5 text-center font-mono tabular-nums text-[11px] bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                            />
                            <span className="print-only font-mono">
                              {weights[col.weightKey]}
                            </span>
                            <span>ชม.</span>
                          </div>
                        </th>
                      ))}

                    {entryMode === 'directHours' && (
                      <th className="px-3 py-3 text-right whitespace-nowrap min-w-[180px]">
                        ชั่วโมงบริการวิสัญญีรวม (ชม./เดือน)
                      </th>
                    )}

                    {entryMode !== 'directHours' && (
                      <th className="px-2.5 py-3 text-right whitespace-nowrap">รวมเคส</th>
                    )}
                    <th className="px-2.5 py-3 text-right whitespace-nowrap text-teal-800">
                      ชม.ต้องการ
                    </th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">
                      ชม.ปฏิบัติงานจริง
                    </th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      Productivity (%)
                    </th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      สูตร สธ. (×{globalOptions.reliefFactor.toFixed(1)})
                    </th>
                    <th className="no-print px-3 py-3 text-right whitespace-nowrap">บันทึก</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {computedRows.map(({ monthId, input, row, isDirty }) => {
                    const isCurrent = monthId === activeMonthId;
                    const isSavingRow = savingMonthId === monthId;
                    return (
                      <tr
                        key={monthId}
                        className={`transition-colors ${
                          isDirty
                            ? 'bg-amber-50/40'
                            : isCurrent
                            ? 'bg-teal-50/40'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenMonthDetail(monthId)}
                              className="font-semibold text-slate-900 hover:text-teal-800 hover:underline underline-offset-2 text-left cursor-pointer"
                              title={`เปิดดูรายละเอียด OT และรายบุคคลเดือน ${row.fullLabel}`}
                            >
                              {row.fullLabel}
                            </button>
                            <ExternalLink className="no-print w-3 h-3 text-slate-300 shrink-0" />
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums">
                            {row.standardWorkingDays} วันทำการ
                            {isDirty && (
                              <span className="ml-1.5 font-semibold text-amber-700">
                                · ยังไม่บันทึก
                              </span>
                            )}
                          </div>
                        </td>

                        {entryMode === 'asa' &&
                          ASA_COLUMNS.map((col) => (
                            <td key={col.caseKey} className="px-1.5 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                step={1}
                                value={input[col.caseKey] === 0 ? '' : input[col.caseKey]}
                                placeholder="0"
                                onChange={(e) =>
                                  updateMonthNumberField(monthId, col.caseKey, e.target.value)
                                }
                                aria-label={`${col.shortLabel} เดือน ${row.fullLabel}`}
                                className="w-[72px] px-2 py-1.5 text-right font-mono tabular-nums text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                              />
                            </td>
                          ))}

                        {entryMode === 'cases' &&
                          SERVICE_COLUMNS.map((col) => (
                            <td key={col.caseKey} className="px-1.5 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                step={1}
                                value={input[col.caseKey] === 0 ? '' : input[col.caseKey]}
                                placeholder="0"
                                onChange={(e) =>
                                  updateMonthNumberField(monthId, col.caseKey, e.target.value)
                                }
                                aria-label={`${col.shortLabel} เดือน ${row.fullLabel}`}
                                className="w-[72px] px-2 py-1.5 text-right font-mono tabular-nums text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                              />
                            </td>
                          ))}

                        {entryMode === 'directHours' && (
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={500000}
                              step={0.5}
                              value={input.directRequiredHours === 0 ? '' : input.directRequiredHours}
                              placeholder="0.0"
                              onChange={(e) =>
                                updateMonthNumberField(
                                  monthId,
                                  'directRequiredHours',
                                  e.target.value,
                                )
                              }
                              aria-label={`ชั่วโมงบริการรวม เดือน ${row.fullLabel}`}
                              className="w-36 px-2.5 py-1.5 text-right font-mono tabular-nums text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                            />
                          </td>
                        )}

                        {entryMode !== 'directHours' && (
                          <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {row.totalCases > 0 ? formatCurrency(row.totalCases) : '—'}
                          </td>
                        )}

                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-teal-800">
                          {row.requiredNursingHours > 0
                            ? `${row.requiredNursingHours.toFixed(1)}`
                            : '—'}
                        </td>

                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {row.actualNursingHours > 0
                            ? `${row.actualNursingHours.toFixed(1)}`
                            : '—'}
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {row.hasProductivityData ? (
                            row.actualNursingHours > 0 ? (
                              <div>
                                <span
                                  className={`font-bold ${getStatusTextClass(row.status)}`}
                                >
                                  {row.productivityPercent.toFixed(1)}%
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  ไม่มี OT {row.baselineProductivityWithoutOtPercent.toFixed(0)}%
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-amber-700">ยังไม่ลงเวร</span>
                            )
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {row.hasProductivityData ? (
                            <div>
                              <span className="font-semibold text-slate-900">
                                {row.requiredFteWithRelief.toFixed(2)}
                              </span>
                              <div
                                className={`text-[10px] ${
                                  row.fteWithReliefGap > 0.2
                                    ? 'text-rose-700'
                                    : row.fteWithReliefGap < -0.2
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {row.fteWithReliefGap > 0
                                  ? `ขาด +${row.fteWithReliefGap.toFixed(2)}`
                                  : `เกิน ${row.fteWithReliefGap.toFixed(2)}`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="no-print px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!isDirty || isSavingRow || savingAll}
                            onClick={() => void handleSaveSingleMonth(monthId)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                              isDirty
                                ? 'bg-teal-700 text-white hover:bg-teal-800'
                                : 'bg-slate-100 text-slate-400 cursor-default'
                            }`}
                          >
                            <Save className="w-3 h-3" />
                            <span>{isSavingRow ? '...' : 'บันทึก'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-950">
                    <td className="px-4 py-3 whitespace-nowrap">
                      รวม / เฉลี่ยทั้งปี ({totals.monthsWithProd} เดือน)
                    </td>

                    {entryMode === 'asa' &&
                      ASA_COLUMNS.map((col) => (
                        <td
                          key={col.caseKey}
                          className="px-2 py-3 text-right font-mono tabular-nums"
                        >
                          {formatCurrency(totals.asaTotals[col.caseKey])}
                        </td>
                      ))}

                    {entryMode === 'cases' &&
                      SERVICE_COLUMNS.map((col) => (
                        <td
                          key={col.caseKey}
                          className="px-2 py-3 text-right font-mono tabular-nums"
                        >
                          {formatCurrency(totals.serviceTotals[col.caseKey])}
                        </td>
                      ))}

                    {entryMode === 'directHours' && (
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {totals.totalRequiredHours.toFixed(1)} ชม.
                      </td>
                    )}

                    {entryMode !== 'directHours' && (
                      <td className="px-2.5 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(totals.totalCases)}
                      </td>
                    )}

                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-teal-800">
                      {totals.totalRequiredHours > 0 ? totals.totalRequiredHours.toFixed(1) : '—'}
                    </td>

                    <td className="px-2.5 py-3 text-right font-mono tabular-nums">
                      {totals.totalActualHours > 0 ? totals.totalActualHours.toFixed(1) : '—'}
                    </td>

                    <td
                      className={`px-3 py-3 text-right font-mono tabular-nums ${getStatusTextClass(
                        totals.status,
                      )}`}
                    >
                      {totals.monthsWithProd > 0 && totals.totalActualHours > 0
                        ? `${totals.annualProductivity.toFixed(1)}%`
                        : '—'}
                    </td>

                    <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {totals.monthsWithProd > 0
                        ? `${totals.avgFteWithRelief.toFixed(2)} อัตรา`
                        : '—'}
                    </td>

                    <td className="no-print px-3 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Bottom Guidance Note */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              พิมพ์จำนวนผู้ป่วยวิสัญญีแต่ละเดือนแล้วกด <strong>Tab</strong> เพื่อเลื่อนช่องถัดไปได้ทันที — ระบบดึงชั่วโมงปฏิบัติงานจริง (เวรทำการ + OT) ของแต่ละเดือนมาคำนวณ Productivity ให้อัตโนมัติ
            </span>
            <span className="font-mono tabular-nums text-slate-500">
              เกณฑ์กองการพยาบาล: &lt;90% ล้นงาน · 90–110% มาตรฐาน · &gt;110% เกินอัตรากำลัง
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
