import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  CalendarRange,
  Check,
  Download,
  Printer,
  RotateCcw,
  Save,
  Table2,
  Users,
} from 'lucide-react';
import {
  AnesthesiaProductivityInput,
  CATEGORY_SHORT_LABELS,
  DEFAULT_ANESTHESIA_PRODUCTIVITY,
  DepartmentSettings,
  MonthlyShiftEntry,
  PersonMonthlySummary,
  RosterMonth,
  StaffCategory,
  StaffMember,
} from '../types/roster';
import {
  fetchYearlyMonthsAndEntries,
  updateRosterMonthAdmin,
} from '../services/rosterService';
import {
  calculateMonthlyDashboard,
  calculateYearlyMonthlyBreakdown,
  exportDashboardExcel,
  getFiscalYearADFromMonth,
  getMonthIdsForYear,
  resolveProductivityInput,
  YearRangeType,
} from '../utils/dashboardCalculations';
import {
  formatCurrency,
  getDefaultHolidaysForMonth,
  getDefaultPayDateLabel,
  getDefaultPublicHolidaysForMonth,
  getThaiMonthYearLabel,
  parseMonthId,
} from '../utils/thaiUtils';
import { MonthlyBreakdownPanel } from './MonthlyBreakdownPanel';
import { MonthlyProductivityEntryGrid } from './MonthlyProductivityEntryGrid';

interface DashboardViewProps {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
  activeStaff: StaffMember[];
  entriesByStaffId: Record<string, MonthlyShiftEntry>;
  onSelectMonthId?: (monthId: string) => void;
  onEditStaffShifts?: (staffId: string) => void;
  onPrintA4?: (title?: string) => void;
}

const CATEGORY_BAR_COLORS: Record<
  StaffCategory,
  { accent: string; soft: string; text: string }
> = {
  RN: { accent: 'bg-teal-300', soft: 'bg-teal-50', text: 'text-teal-700' },
  PN: { accent: 'bg-sky-300', soft: 'bg-sky-50', text: 'text-sky-700' },
  NA: { accent: 'bg-amber-200', soft: 'bg-amber-50', text: 'text-amber-700' },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  month,
  settings,
  summaries,
  activeStaff,
  entriesByStaffId,
  onSelectMonthId,
  onEditStaffShifts,
  onPrintA4,
}) => {
  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);

  const [dashboardTab, setDashboardTab] = useState<
    'monthly-entry' | 'yearly-breakdown' | 'month-detail'
  >('monthly-entry');
  const [yearType, setYearType] = useState<YearRangeType>('fiscal');
  const [selectedYearAD, setSelectedYearAD] = useState<number>(() =>
    getFiscalYearADFromMonth(month.yearAD, month.monthNumber),
  );
  const [yearlyMonthsById, setYearlyMonthsById] = useState<Record<string, RosterMonth>>({});
  const [yearlyEntriesByMonthId, setYearlyEntriesByMonthId] = useState<
    Record<string, Record<string, MonthlyShiftEntry>>
  >({});
  const [yearlyLoading, setYearlyLoading] = useState(false);

  const [draft, setDraft] = useState<AnesthesiaProductivityInput>(() =>
    resolveProductivityInput(month),
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [sortByOtDesc, setSortByOtDesc] = useState(true);

  const loadYearlyData = useCallback(async () => {
    const monthIds = getMonthIdsForYear(selectedYearAD, yearType);
    setYearlyLoading(true);
    try {
      const result = await fetchYearlyMonthsAndEntries(monthIds);
      setYearlyMonthsById(result.monthsById);
      setYearlyEntriesByMonthId(result.entriesByMonthId);
    } finally {
      setYearlyLoading(false);
    }
  }, [selectedYearAD, yearType]);

  useEffect(() => {
    void loadYearlyData();
  }, [loadYearlyData]);

  const handleChangeYearType = (nextType: YearRangeType) => {
    setYearType(nextType);
    if (nextType === 'fiscal') {
      setSelectedYearAD(getFiscalYearADFromMonth(month.yearAD, month.monthNumber));
    } else {
      setSelectedYearAD(month.yearAD);
    }
  };

  const handleOpenMonthDetail = (targetMonthId: string) => {
    if (onSelectMonthId && targetMonthId !== month.monthId) {
      onSelectMonthId(targetMonthId);
    }
    setDashboardTab('month-detail');
  };

  const handleMonthProductivitySaved = (
    savedMonthId: string,
    savedProductivity: AnesthesiaProductivityInput,
  ) => {
    setYearlyMonthsById((prev) => {
      const existing = prev[savedMonthId];
      if (existing) {
        return {
          ...prev,
          [savedMonthId]: {
            ...existing,
            productivity: savedProductivity,
          },
        };
      }
      const { yearAD: mYear, monthNumber: mNum } = parseMonthId(savedMonthId);
      return {
        ...prev,
        [savedMonthId]: {
          monthId: savedMonthId,
          yearAD: mYear,
          monthNumber: mNum,
          holidays: getDefaultHolidaysForMonth(mYear, mNum),
          publicHolidays: getDefaultPublicHolidaysForMonth(mYear, mNum),
          payDateLabel: getDefaultPayDateLabel(mYear, mNum),
          productivity: savedProductivity,
          status: 'open',
          visibility: 'department',
        },
      };
    });
    if (savedMonthId === month.monthId) {
      setDraft(savedProductivity);
      setHasUnsavedChanges(false);
    }
  };

  useEffect(() => {
    setDraft(resolveProductivityInput(month));
    setHasUnsavedChanges(false);
    setSavedNotice(false);
  }, [month.monthId, month.productivity]);

  const updateField = <K extends keyof AnesthesiaProductivityInput>(
    key: K,
    value: AnesthesiaProductivityInput[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
    setSavedNotice(false);
  };

  const handleSaveProductivity = async () => {
    setSaving(true);
    try {
      await updateRosterMonthAdmin(month.monthId, { productivity: draft });
      setYearlyMonthsById((prev) => ({
        ...prev,
        [month.monthId]: {
          ...(prev[month.monthId] || month),
          productivity: draft,
        },
      }));
      setHasUnsavedChanges(false);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaultWeights = () => {
    setDraft((prev) => ({
      ...prev,
      hoursPerShift: DEFAULT_ANESTHESIA_PRODUCTIVITY.hoursPerShift,
      reliefFactor: DEFAULT_ANESTHESIA_PRODUCTIVITY.reliefFactor,
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
    }));
    setHasUnsavedChanges(true);
    setSavedNotice(false);
  };

  const analysis = useMemo(
    () => calculateMonthlyDashboard(month, summaries, draft),
    [month, summaries, draft],
  );

  const yearlySummary = useMemo(
    () =>
      calculateYearlyMonthlyBreakdown({
        yearAD: selectedYearAD,
        yearType,
        activeStaff,
        settings,
        monthsById: yearlyMonthsById,
        entriesByMonthId: yearlyEntriesByMonthId,
        globalOptions: {
          staffScope: draft.staffScope,
          hoursPerShift: draft.hoursPerShift,
          reliefFactor: draft.reliefFactor,
          includeWorkloadInOt: draft.includeWorkloadInOt,
          includeSmcInOt: draft.includeSmcInOt,
          includeStandbyInHours: draft.includeStandbyInHours,
        },
        liveActiveMonth: month,
        liveActiveEntries: entriesByStaffId,
        liveActiveDraft: draft,
      }),
    [
      selectedYearAD,
      yearType,
      activeStaff,
      settings,
      yearlyMonthsById,
      yearlyEntriesByMonthId,
      draft,
      month,
      entriesByStaffId,
    ],
  );

  const staffRows = useMemo(() => {
    const filtered = summaries
      .filter((s) => categoryFilter === 'ALL' || s.staff.category === categoryFilter)
      .map((s) => {
        const regularOt =
          s.otMorningDays.length +
          s.otAfternoonDays.length +
          s.otNightDays.length +
          s.explicitPublicHolidayCount;
        const countedOt =
          regularOt +
          (draft.includeWorkloadInOt ? s.workloadCount : 0) +
          (draft.includeSmcInOt ? s.smcCount : 0);
        const fteFromOt = countedOt / analysis.standardWorkingDays;
        const totalShifts =
          s.workingDaysCount +
          countedOt +
          (draft.includeStandbyInHours ? s.standbyCount : 0);
        return {
          summary: s,
          regularOt,
          countedOt,
          fteFromOt,
          totalShifts,
          totalHours: totalShifts * draft.hoursPerShift,
        };
      });

    if (sortByOtDesc) {
      filtered.sort(
        (a, b) =>
          b.countedOt - a.countedOt ||
          b.summary.standbyCount - a.summary.standbyCount ||
          a.summary.staff.orderIndex - b.summary.staff.orderIndex,
      );
    }
    return filtered;
  }, [
    summaries,
    categoryFilter,
    draft.includeWorkloadInOt,
    draft.includeSmcInOt,
    draft.includeStandbyInHours,
    draft.hoursPerShift,
    analysis.standardWorkingDays,
    sortByOtDesc,
  ]);

  const maxStaffOt = useMemo(
    () => Math.max(1, ...staffRows.map((r) => r.countedOt)),
    [staffRows],
  );

  const maxCategoryTotalShifts = useMemo(
    () =>
      Math.max(
        1,
        analysis.categories.RN.totalActiveShifts,
        analysis.categories.PN.totalActiveShifts,
        analysis.categories.NA.totalActiveShifts,
      ),
    [analysis.categories],
  );

  const prod = analysis.productivity;
  const gaugeMax = 150;
  const clampedProdPos = Math.min(100, Math.max(0, (prod.productivityPercent / gaugeMax) * 100));
  const clampedBaselinePos = Math.min(
    100,
    Math.max(0, (prod.baselineProductivityWithoutOtPercent / gaugeMax) * 100),
  );

  const prodTextTone =
    prod.status === 'optimal'
      ? 'text-emerald-700'
      : prod.status === 'overload'
      ? 'text-rose-700'
      : prod.status === 'under'
      ? 'text-amber-700'
      : 'text-slate-500';

  const prodSurfaceTone =
    prod.status === 'optimal'
      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
      : prod.status === 'overload'
      ? 'bg-rose-50/80 border-rose-200 text-rose-900'
      : prod.status === 'under'
      ? 'bg-amber-50/80 border-amber-200 text-amber-900'
      : 'bg-slate-50 border-slate-200 text-slate-700';

  return (
    <div className="space-y-6">
      {/* Primary View Mode Tabs: Monthly Entry Grid vs 12-Month Summary vs Selected Month Detail */}
      <div className="no-print flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setDashboardTab('monthly-entry')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              dashboardTab === 'monthly-entry'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table2 className="w-4 h-4 shrink-0" />
            <span>กรอก Productivity รายเดือน</span>
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('yearly-breakdown')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              dashboardTab === 'yearly-breakdown'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarRange className="w-4 h-4 shrink-0" />
            <span>สรุปแนวโน้ม 12 เดือน</span>
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('month-detail')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              dashboardTab === 'month-detail'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>เจาะลึกเดือน {monthLabel}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => updateField('hoursPerShift', 7)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.hoursPerShift === 7
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 ชม./เวร (สธ.)
            </button>
            <button
              type="button"
              onClick={() => updateField('hoursPerShift', 8)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.hoursPerShift === 8
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8 ชม./เวร
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => updateField('staffScope', 'RN')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.staffScope === 'RN'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              เฉพาะ RN
            </button>
            <button
              type="button"
              onClick={() => updateField('staffScope', 'ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.staffScope === 'ALL'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              RN+PN+NA
            </button>
          </div>
        </div>
      </div>

      {dashboardTab === 'monthly-entry' ? (
        <MonthlyProductivityEntryGrid
          yearAD={selectedYearAD}
          yearType={yearType}
          activeMonthId={month.monthId}
          activeStaff={activeStaff}
          settings={settings}
          monthsById={yearlyMonthsById}
          entriesByMonthId={yearlyEntriesByMonthId}
          liveActiveMonth={month}
          liveActiveEntries={entriesByStaffId}
          globalOptions={{
            staffScope: draft.staffScope,
            hoursPerShift: draft.hoursPerShift,
            reliefFactor: draft.reliefFactor,
            includeWorkloadInOt: draft.includeWorkloadInOt,
            includeSmcInOt: draft.includeSmcInOt,
            includeStandbyInHours: draft.includeStandbyInHours,
          }}
          loading={yearlyLoading}
          onChangeYearType={handleChangeYearType}
          onChangeYearAD={setSelectedYearAD}
          onChangeGlobalReliefFactor={(factor) => updateField('reliefFactor', factor)}
          onMonthProductivitySaved={handleMonthProductivitySaved}
          onOpenMonthDetail={handleOpenMonthDetail}
          onPrintA4={onPrintA4}
        />
      ) : dashboardTab === 'yearly-breakdown' ? (
        <MonthlyBreakdownPanel
          summary={yearlySummary}
          settings={settings}
          activeMonthId={month.monthId}
          loading={yearlyLoading}
          yearType={yearType}
          yearAD={selectedYearAD}
          hoursPerShift={draft.hoursPerShift}
          reliefFactor={draft.reliefFactor}
          staffScope={draft.staffScope}
          onChangeYearType={handleChangeYearType}
          onChangeYearAD={setSelectedYearAD}
          onRefresh={() => void loadYearlyData()}
          onOpenMonthDetail={handleOpenMonthDetail}
          onPrintA4={onPrintA4}
        />
      ) : (
        <>
      {/* Screen-only Month Detail Toolbar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={draft.includeWorkloadInOt}
              onChange={(e) => updateField('includeWorkloadInOt', e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>นับเวร Workload ในยอด OT/FTE</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={draft.includeSmcInOt}
              onChange={(e) => updateField('includeSmcInOt', e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>นับเวร SMC ในยอด OT/FTE</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={draft.includeStandbyInHours}
              onChange={(e) => updateField('includeStandbyInHours', e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>นับเวร Standby ในชั่วโมงปฏิบัติงาน</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasUnsavedChanges && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveProductivity()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกค่าที่ปรับ'}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              exportDashboardExcel({
                month,
                settings,
                summaries,
                input: draft,
                analysis,
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            ส่งออก Excel
          </button>
          <button
            type="button"
            onClick={() =>
              onPrintA4
                ? onPrintA4(`แดชบอร์ดยอด OT อัตรากำลัง และ Productivity วิสัญญี ${monthLabel}`)
                : window.print()
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            พิมพ์รายงาน (A4)
          </button>
        </div>
      </div>

      {/* Printable Report Root */}
      <div className="print-full-width space-y-6">
        {/* Report Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight">
              แดชบอร์ดยอดเวร OT อัตรากำลัง และ Productivity งานการพยาบาลวิสัญญี
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {settings.departmentName} · {settings.hospitalName} · ประจำเดือน{' '}
              <strong className="text-slate-900">{monthLabel}</strong>
            </p>
          </div>
          <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
            วันทำการ {analysis.standardWorkingDays} วัน · วันหยุด {analysis.holidayDays} วัน · เกณฑ์{' '}
            {draft.hoursPerShift} ชม./เวร
          </div>
        </div>

        {/* 1. Executive 4-Column KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* KPI 1: Total OT Shifts */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              ยอดเวรนอกเวลา (OT) รวมทั้งเดือน
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
                {formatCurrency(analysis.all.countedOtShifts)}
              </span>
              <span className="text-sm text-slate-500">เวร</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              RN {analysis.categories.RN.countedOtShifts} · PN{' '}
              {analysis.categories.PN.countedOtShifts} · NA{' '}
              {analysis.categories.NA.countedOtShifts} เวร
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              เบิกจ่าย OT สุทธิ {formatCurrency(analysis.all.otBudgetBaht)} บาท
              {analysis.all.standbyShifts > 0 && ` · Standby ${analysis.all.standbyShifts} เวร`}
            </div>
          </div>

          {/* KPI 2: OT FTE Equivalent */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              อัตรากำลังเทียบเท่าจากเวร OT (OT FTE)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-teal-800">
                +{analysis.all.otFteEquivalent.toFixed(2)}
              </span>
              <span className="text-sm text-slate-500">อัตรา</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              RN +{analysis.categories.RN.otFteEquivalent.toFixed(2)} · PN +
              {analysis.categories.PN.otFteEquivalent.toFixed(2)} · NA +
              {analysis.categories.NA.otFteEquivalent.toFixed(2)}
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              คิดจากเวร OT ÷ {analysis.standardWorkingDays} วันทำการ ({analysis.all.otLoadRatioPercent.toFixed(1)}% ของกำลังคนจริง)
            </div>
          </div>

          {/* KPI 3: Total Effective FTE */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              อัตรากำลังรวมที่ปฏิบัติงานจริง (Effective FTE)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
                {analysis.all.totalEffectiveFte.toFixed(2)}
              </span>
              <span className="text-sm text-slate-500">อัตรา</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              อัตรากำลังจริงที่มี {analysis.all.headcount} คน (RN {analysis.categories.RN.headcount} · PN{' '}
              {analysis.categories.PN.headcount} · NA {analysis.categories.NA.headcount})
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              รวมชั่วโมงปฏิบัติงาน {formatCurrency(Math.round(analysis.all.totalActualHours))} ชม./เดือน
            </div>
          </div>

          {/* KPI 4: Anesthesiology Productivity (MOPH Nursing Division) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              Productivity ตามกองการพยาบาล ({draft.staffScope === 'RN' ? 'เฉพาะ RN' : 'RN+PN+NA'})
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums ${prodTextTone}`}>
                {prod.requiredNursingHours > 0 ? `${prod.productivityPercent.toFixed(1)}%` : '—'}
              </span>
              <span className="text-xs text-slate-500">เกณฑ์ 90–110%</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums truncate" title={prod.statusLabel}>
              {prod.requiredNursingHours > 0
                ? prod.status === 'optimal'
                  ? 'เหมาะสมตามเกณฑ์กองการพยาบาล'
                  : prod.status === 'overload'
                  ? 'เกินเกณฑ์ > 110% (Under Staffed)'
                  : 'ต่ำกว่าเกณฑ์ < 90% (Over Staffed)'
                : 'กรอกจำนวนผู้ป่วย ASA I–V ด้านล่าง'}
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              {prod.requiredNursingHours > 0
                ? `ไม่มี OT: ${prod.baselineProductivityWithoutOtPercent.toFixed(1)}% · สูตร สธ. (×${prod.reliefFactor.toFixed(1)}): ${prod.requiredFteWithRelief.toFixed(2)} อัตรา`
                : 'รองรับ ASA Class I–V · ประเภทเคส · ชม.รวม'}
            </div>
          </div>
        </div>

        {/* 2. OT & Manpower (FTE) Summary Table + Visual Bar Comparison by RN / PN / NA */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-950">
                1. สรุปยอดเวร OT และอัตรากำลังเทียบเท่า (FTE) แยกตามสายงาน RN / PN / NA
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                คำนวณอัตโนมัติจากตารางเวรประจำเดือน {monthLabel} · เทียบอัตรากำลังด้วยฐานวันทำการ{' '}
                {analysis.standardWorkingDays} วันทำการ/เดือน
              </p>
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              สูตร OT FTE = จำนวนเวรนอกเวลา ÷ {analysis.standardWorkingDays} วันทำการ
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs sm:text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="px-4 py-3 text-left whitespace-nowrap">สายงาน</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">กำลังคนจริง</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-slate-100/70 text-slate-700">
                    เวรทำการ
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-rose-50/70 text-rose-700">
                    OT ปกติ+นักขัตฯ
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-emerald-50/70 text-emerald-700">
                    Workload
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-purple-50/70 text-purple-700">
                    SMC
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-sky-50/70 text-sky-700">
                    Standby
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-slate-950">
                    รวม OT คิด FTE
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">เฉลี่ย/คน</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-teal-50/70 text-teal-800">
                    OT FTE (อัตรา)
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-slate-950">
                    FTE รวมจริง
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">ยอดเบิก OT (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(['RN', 'PN', 'NA'] as StaffCategory[]).map((cat) => {
                  const m = analysis.categories[cat];
                  return (
                    <tr key={cat} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {m.label}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800">
                        {m.headcount} คน
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 bg-slate-50/40">
                        {m.workingShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-rose-700 bg-rose-50/25">
                        {m.regularOtShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-700 bg-emerald-50/25">
                        {m.workloadShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-purple-700 bg-purple-50/25">
                        {m.smcShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-sky-700 bg-sky-50/25">
                        {m.standbyShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {m.countedOtShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                        {m.avgOtPerPerson.toFixed(1)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-teal-700 bg-teal-50/30">
                        +{m.otFteEquivalent.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {m.totalEffectiveFte.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(m.otBudgetBaht)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/80 border-t-2 border-slate-200 font-bold text-slate-950">
                  <td className="px-4 py-3 whitespace-nowrap">{analysis.all.label}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {analysis.all.headcount} คน
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                    {analysis.all.workingShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-rose-700">
                    {analysis.all.regularOtShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {analysis.all.workloadShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-purple-700">
                    {analysis.all.smcShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-sky-700">
                    {analysis.all.standbyShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {analysis.all.countedOtShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {analysis.all.avgOtPerPerson.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-teal-800">
                    +{analysis.all.otFteEquivalent.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {analysis.all.totalEffectiveFte.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatCurrency(analysis.all.otBudgetBaht)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Visual Soft Pastel Stacked Bar Comparison: Working vs OT / Workload / SMC */}
          <div className="px-5 py-5 border-t border-slate-200 bg-slate-50/50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold text-slate-800">
                  กราฟสัดส่วนเวรทำการ vs เวรนอกเวลา (OT / Workload / SMC) และอัตรากำลังเทียบเท่า
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  โทนสีพาสเทลตามสัญลักษณ์เวรเดิม · เทียบสัดส่วนภาระงานจริงของแต่ละสายงาน
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-300 border border-slate-400/50 inline-block" />
                  วันทำการ ({analysis.all.workingShifts})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-rose-300 border border-rose-400/50 inline-block" />
                  OT ปกติ+นักขัตฯ ({analysis.all.regularOtShifts})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-300 border border-emerald-400/50 inline-block" />
                  Workload ({analysis.all.workloadShifts})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-purple-300 border border-purple-400/50 inline-block" />
                  SMC ({analysis.all.smcShifts})
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {(['RN', 'PN', 'NA'] as StaffCategory[]).map((cat) => {
                const m = analysis.categories[cat];
                const workW = (m.workingShifts / maxCategoryTotalShifts) * 100;
                const otW = (m.regularOtShifts / maxCategoryTotalShifts) * 100;
                const wlCount = draft.includeWorkloadInOt ? m.workloadShifts : 0;
                const smcCount = draft.includeSmcInOt ? m.smcShifts : 0;
                const wlW = (wlCount / maxCategoryTotalShifts) * 100;
                const smcW = (smcCount / maxCategoryTotalShifts) * 100;
                const otSharePct =
                  m.totalActiveShifts > 0 ? (m.countedOtShifts / m.totalActiveShifts) * 100 : 0;

                return (
                  <div
                    key={cat}
                    className="grid grid-cols-1 sm:grid-cols-[175px_1fr_195px] items-center gap-2 sm:gap-3.5"
                  >
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {CATEGORY_SHORT_LABELS[cat]}{' '}
                      <span className="font-normal text-slate-500 tabular-nums">
                        ({m.headcount} คน)
                      </span>
                    </div>
                    <div className="h-7 bg-white border border-slate-200/80 rounded-lg p-1 flex items-center gap-0.5 overflow-hidden">
                      {workW > 0 && (
                        <div
                          style={{ width: `${workW}%` }}
                          className="bg-slate-300 ring-1 ring-inset ring-slate-400/30 h-full rounded-sm flex items-center justify-center overflow-hidden transition-opacity duration-150 hover:opacity-85"
                          title={`วันทำการ ${m.workingShifts} เวร`}
                        >
                          {workW >= 10 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-slate-700 px-1 truncate">
                              {m.workingShifts}
                            </span>
                          )}
                        </div>
                      )}
                      {otW > 0 && (
                        <div
                          style={{ width: `${otW}%` }}
                          className="bg-rose-300 ring-1 ring-inset ring-rose-400/35 h-full rounded-sm flex items-center justify-center overflow-hidden transition-opacity duration-150 hover:opacity-85"
                          title={`OT ปกติ+นักขัตฤกษ์ ${m.regularOtShifts} เวร`}
                        >
                          {otW >= 8 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-rose-950 px-1 truncate">
                              {m.regularOtShifts}
                            </span>
                          )}
                        </div>
                      )}
                      {wlW > 0 && (
                        <div
                          style={{ width: `${wlW}%` }}
                          className="bg-emerald-300 ring-1 ring-inset ring-emerald-400/35 h-full rounded-sm flex items-center justify-center overflow-hidden transition-opacity duration-150 hover:opacity-85"
                          title={`Workload ${wlCount} เวร`}
                        >
                          {wlW >= 7 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-emerald-950 px-1 truncate">
                              {wlCount}
                            </span>
                          )}
                        </div>
                      )}
                      {smcW > 0 && (
                        <div
                          style={{ width: `${smcW}%` }}
                          className="bg-purple-300 ring-1 ring-inset ring-purple-400/35 h-full rounded-sm flex items-center justify-center overflow-hidden transition-opacity duration-150 hover:opacity-85"
                          title={`SMC ${smcCount} เวร`}
                        >
                          {smcW >= 7 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-purple-950 px-1 truncate">
                              {smcCount}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      OT {m.countedOtShifts} เวร ({otSharePct.toFixed(0)}%) ·{' '}
                      <strong className={CATEGORY_BAR_COLORS[cat].text}>
                        +{m.otFteEquivalent.toFixed(2)}
                      </strong>
                    </div>
                  </div>
                );
              })}

              {/* Department Total Proportional Composition Bar */}
              {analysis.all.totalActiveShifts > 0 && (() => {
                const allWorkPct =
                  (analysis.all.workingShifts / analysis.all.totalActiveShifts) * 100;
                const allOtPct =
                  (analysis.all.regularOtShifts / analysis.all.totalActiveShifts) * 100;
                const allWl = draft.includeWorkloadInOt ? analysis.all.workloadShifts : 0;
                const allSmc = draft.includeSmcInOt ? analysis.all.smcShifts : 0;
                const allWlPct = (allWl / analysis.all.totalActiveShifts) * 100;
                const allSmcPct = (allSmc / analysis.all.totalActiveShifts) * 100;
                const totalOtPct =
                  (analysis.all.countedOtShifts / analysis.all.totalActiveShifts) * 100;

                return (
                  <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-[175px_1fr_195px] items-center gap-2 sm:gap-3.5">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      รวมทั้งแผนก{' '}
                      <span className="font-normal text-slate-500 tabular-nums">
                        (100%)
                      </span>
                    </div>
                    <div className="h-6 bg-white border border-slate-200/80 rounded-lg p-0.5 flex items-center gap-0.5 overflow-hidden">
                      {allWorkPct > 0 && (
                        <div
                          style={{ width: `${allWorkPct}%` }}
                          className="bg-slate-300 ring-1 ring-inset ring-slate-400/30 h-full rounded-sm flex items-center justify-center overflow-hidden"
                          title={`วันทำการ ${allWorkPct.toFixed(1)}% (${analysis.all.workingShifts} เวร)`}
                        >
                          {allWorkPct >= 14 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-slate-700 px-1 truncate">
                              ทำการ {allWorkPct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      {allOtPct > 0 && (
                        <div
                          style={{ width: `${allOtPct}%` }}
                          className="bg-rose-300 ring-1 ring-inset ring-rose-400/35 h-full rounded-sm flex items-center justify-center overflow-hidden"
                          title={`OT ปกติ+นักขัตฯ ${allOtPct.toFixed(1)}% (${analysis.all.regularOtShifts} เวร)`}
                        >
                          {allOtPct >= 11 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-rose-950 px-1 truncate">
                              OT {allOtPct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      {allWlPct > 0 && (
                        <div
                          style={{ width: `${allWlPct}%` }}
                          className="bg-emerald-300 ring-1 ring-inset ring-emerald-400/35 h-full rounded-sm flex items-center justify-center overflow-hidden"
                          title={`Workload ${allWlPct.toFixed(1)}% (${allWl} เวร)`}
                        >
                          {allWlPct >= 10 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-emerald-950 px-1 truncate">
                              WL {allWlPct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      {allSmcPct > 0 && (
                        <div
                          style={{ width: `${allSmcPct}%` }}
                          className="bg-purple-300 ring-1 ring-inset ring-purple-400/35 h-full rounded-sm flex items-center justify-center overflow-hidden"
                          title={`SMC ${allSmcPct.toFixed(1)}% (${allSmc} เวร)`}
                        >
                          {allSmcPct >= 10 && (
                            <span className="text-[10px] font-mono font-semibold tabular-nums text-purple-950 px-1 truncate">
                              SMC {allSmcPct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      OT {totalOtPct.toFixed(0)}% ·{' '}
                      <strong className="text-teal-700">
                        +{analysis.all.otFteEquivalent.toFixed(2)} อัตรา
                      </strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* 3. Anesthesiology Nursing Productivity Section (MOPH Nursing Division Standard) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: Monthly Anesthesia Case & Workload Input Table */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-950">
                  2. คำนวณ Productivity งานการพยาบาลวิสัญญี ตามเกณฑ์กองการพยาบาล
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  อ้างอิงสูตรกองการพยาบาล สำนักงานปลัดกระทรวงสาธารณสุข · จำแนกประเภทผู้ป่วยตาม ASA Class I–V (รวมกิจกรรมโดยตรง+โดยอ้อม)
                </p>
              </div>

              <div className="no-print flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start xl:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => updateField('mode', 'asa')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    draft.mode === 'asa'
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ASA I–V (กองการพยาบาล)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('mode', 'cases')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    draft.mode === 'cases'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  แยกประเภทบริการ
                </button>
                <button
                  type="button"
                  onClick={() => updateField('mode', 'directHours')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    draft.mode === 'directHours'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  กรอกชั่วโมงรวม
                </button>
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between gap-4">
              {/* Scope & Relief Factor Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600">
                    ฐานบุคลากรที่ปฏิบัติงานจริง (ตัวหาร)
                  </div>
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => updateField('staffScope', 'RN')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        draft.staffScope === 'RN'
                          ? 'bg-white text-teal-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      เฉพาะวิสัญญี (RN)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('staffScope', 'ALL')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        draft.staffScope === 'ALL'
                          ? 'bg-white text-teal-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ทั้งทีม (RN+PN+NA)
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600">
                    ตัวคูณเผื่อวันลา/อบรม (Relief Factor กองการพยาบาล)
                  </div>
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                      { val: 1.0, label: '×1.0 (ไม่เผื่อ)' },
                      { val: 1.2, label: '×1.2 (ลาปกติ)' },
                      { val: 1.4, label: '×1.4 (24 ชม. สธ.)' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => updateField('reliefFactor', opt.val)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          Math.abs(draft.reliefFactor - opt.val) < 0.01
                            ? 'bg-white text-teal-800 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {draft.mode === 'asa' ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs sm:text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 pr-2 text-left">
                          ระดับความเสี่ยงผู้ป่วยวิสัญญี (ASA Class)
                        </th>
                        <th className="py-2 px-2 text-right whitespace-nowrap w-28">
                          จำนวนราย (เคส)
                        </th>
                        <th className="py-2 px-2 text-right whitespace-nowrap w-28">
                          ชม./ราย (สธ.)
                        </th>
                        <th className="py-2 pl-2 text-right whitespace-nowrap w-28">
                          ชม.ที่ต้องการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prod.asaBreakdown.map((item) => {
                        const casesField = `${item.key}Cases` as keyof AnesthesiaProductivityInput;
                        const hoursField =
                          `${item.key}HoursPerCase` as keyof AnesthesiaProductivityInput;
                        return (
                          <tr key={item.key}>
                            <td className="py-2.5 pr-2">
                              <div className="font-semibold text-slate-900">{item.label}</div>
                              <div className="text-[11px] text-slate-500">{item.sublabel}</div>
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                step={1}
                                value={item.cases}
                                onChange={(e) =>
                                  updateField(
                                    casesField,
                                    Math.max(0, Number(e.target.value) || 0) as never,
                                  )
                                }
                                aria-label={`จำนวนราย ${item.label}`}
                                className="w-24 px-2.5 py-1.5 text-right font-mono tabular-nums text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                min={0}
                                max={48}
                                step={0.01}
                                value={item.hoursPerCase}
                                onChange={(e) =>
                                  updateField(
                                    hoursField,
                                    Math.max(0, Number(e.target.value) || 0) as never,
                                  )
                                }
                                aria-label={`ชั่วโมงต่อราย ${item.label}`}
                                className="w-20 px-2 py-1.5 text-right font-mono tabular-nums text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                              />
                            </td>
                            <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {item.requiredHours.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 font-bold text-slate-950">
                        <td className="py-3 pr-2">รวมผู้ป่วยวิสัญญี (ASA I–V) ทั้งเดือน</td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">
                          {formatCurrency(prod.totalCases)} ราย
                        </td>
                        <td className="py-3 px-2 text-right text-xs font-normal text-slate-500">
                          {prod.totalCases > 0
                            ? `เฉลี่ย ${(prod.requiredNursingHours / prod.totalCases).toFixed(2)} ชม./ราย`
                            : 'เฉลี่ย สธ. ~6.03 ชม.'}
                        </td>
                        <td className="py-3 pl-2 text-right font-mono tabular-nums text-teal-800">
                          {prod.requiredNursingHours.toFixed(1)} ชม.
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : draft.mode === 'cases' ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs sm:text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 pr-2 text-left">ประเภทบริการวิสัญญี</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap w-28">
                          จำนวนราย (เคส)
                        </th>
                        <th className="py-2 px-2 text-right whitespace-nowrap w-28">
                          ชม./ราย (NHPP)
                        </th>
                        <th className="py-2 pl-2 text-right whitespace-nowrap w-28">
                          ชม.ที่ต้องการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prod.caseBreakdown.map((item) => {
                        const casesField = `${item.key}Cases` as keyof AnesthesiaProductivityInput;
                        const hoursField =
                          `${item.key}HoursPerCase` as keyof AnesthesiaProductivityInput;
                        return (
                          <tr key={item.key}>
                            <td className="py-2.5 pr-2">
                              <div className="font-semibold text-slate-900">{item.label}</div>
                              <div className="text-[11px] text-slate-500">{item.sublabel}</div>
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                step={1}
                                value={item.cases}
                                onChange={(e) =>
                                  updateField(
                                    casesField,
                                    Math.max(0, Number(e.target.value) || 0) as never,
                                  )
                                }
                                aria-label={`จำนวนราย ${item.label}`}
                                className="w-24 px-2.5 py-1.5 text-right font-mono tabular-nums text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                min={0}
                                max={48}
                                step={0.25}
                                value={item.hoursPerCase}
                                onChange={(e) =>
                                  updateField(
                                    hoursField,
                                    Math.max(0, Number(e.target.value) || 0) as never,
                                  )
                                }
                                aria-label={`ชั่วโมงต่อราย ${item.label}`}
                                className="w-20 px-2 py-1.5 text-right font-mono tabular-nums text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                              />
                            </td>
                            <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {item.requiredHours.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 font-bold text-slate-950">
                        <td className="py-3 pr-2">รวมปริมาณงานวิสัญญีทั้งเดือน</td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">
                          {formatCurrency(prod.totalCases)} ราย
                        </td>
                        <td className="py-3 px-2 text-right text-xs font-normal text-slate-500">
                          {prod.totalCases > 0
                            ? `เฉลี่ย ${(prod.requiredNursingHours / prod.totalCases).toFixed(2)} ชม./ราย`
                            : '—'}
                        </td>
                        <td className="py-3 pl-2 text-right font-mono tabular-nums text-teal-800">
                          {prod.requiredNursingHours.toFixed(1)} ชม.
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="py-4 space-y-3">
                  <label
                    htmlFor="direct-required-hours"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    ชั่วโมงการพยาบาลวิสัญญีที่ต้องการรวมทั้งเดือน (จากรายงานสถิติห้องผ่าตัด / HIS)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="direct-required-hours"
                      type="number"
                      min={0}
                      max={500000}
                      step={0.5}
                      value={draft.directRequiredHours}
                      onChange={(e) =>
                        updateField(
                          'directRequiredHours',
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                      className="w-48 px-3 py-2 text-base font-mono tabular-nums font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                    <span className="text-sm text-slate-600">ชั่วโมง / เดือน</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    เหมาะสำหรับกรณีที่หน่วยงานมีผลรวมชั่วโมงบริการวิสัญญีจริงจากระบบห้องผ่าตัด (เวลาดมยาจริง + เวลาเตรียมและเยี่ยมก่อน/หลังผ่าตัด) อยู่แล้ว
                  </p>
                </div>
              )}

              {/* Save Action Bar */}
              <div className="no-print pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResetDefaultWeights}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  คืนค่ามาตรฐานกองการพยาบาล
                </button>

                <div className="flex items-center gap-3">
                  {savedNotice && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check className="w-4 h-4" />
                      บันทึกข้อมูลเดือน {monthLabel} แล้ว
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveProductivity()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล Productivity เดือนนี้'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Official MOPH Nursing Division Formula & FTE Gap Interpretation */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-700 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-950">
                    ผลวิเคราะห์ตามสูตรกองการพยาบาล
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  เกณฑ์ 90–110% (เหมาะสุด 95–105%)
                </span>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-lg border text-xs space-y-1 ${prodSurfaceTone}`}>
                <div className="font-bold">{prod.statusLabel}</div>
                <p className="leading-relaxed opacity-90">{prod.recommendation}</p>
              </div>

              {/* Live Substituted MOPH Nursing Division Equation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                <div className="font-semibold text-slate-700">
                  สูตรกองการพยาบาล (Productivity %)
                </div>
                <div className="text-[11px] text-slate-500">
                  = (ชั่วโมงการพยาบาลที่ผู้ป่วยต้องการ ÷ ชั่วโมงปฏิบัติงานจริง) × 100
                </div>
                <div className="font-mono tabular-nums text-xs text-slate-900 pt-0.5">
                  ={' '}
                  {prod.requiredNursingHours > 0 && prod.actualNursingHours > 0 ? (
                    <>
                      ({prod.requiredNursingHours.toFixed(1)} ÷ {prod.actualNursingHours.toFixed(1)})
                      × 100 ={' '}
                      <strong className={prodTextTone}>
                        {prod.productivityPercent.toFixed(2)}%
                      </strong>
                    </>
                  ) : (
                    <span className="text-slate-400">รอกรอกยอดผู้ป่วยและตารางเวร</span>
                  )}
                </div>
              </div>

              {/* Productivity Scale Bar (0% to 150%) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">ระดับ Productivity จริง (รวม OT)</span>
                  <span className={`font-mono font-bold tabular-nums text-base ${prodTextTone}`}>
                    {prod.requiredNursingHours > 0 ? `${prod.productivityPercent.toFixed(1)}%` : '—'}
                  </span>
                </div>

                <div className="relative h-4 rounded-md overflow-hidden flex border border-slate-200">
                  {/* 0-90% Over Staffed (60% of 150) */}
                  <div className="w-[60%] bg-amber-100/85 h-full" title="ต่ำกว่าเกณฑ์ (< 90% · Over Staffed)" />
                  {/* 90-110% Optimal (13.34% of 150) */}
                  <div
                    className="w-[13.34%] bg-emerald-200/75 border-x border-emerald-300 h-full"
                    title="เกณฑ์มาตรฐานกองการพยาบาล (90–110%)"
                  />
                  {/* 110-150% Under Staffed (26.66% of 150) */}
                  <div className="w-[26.66%] bg-rose-100/85 h-full" title="เกินอัตรากำลัง (> 110% · Under Staffed)" />

                  {prod.requiredNursingHours > 0 && (
                    <div
                      style={{ left: `${clampedProdPos}%` }}
                      className="absolute top-0 bottom-0 w-1 -ml-0.5 bg-slate-700 rounded-full"
                      title={`Productivity จริง ${prod.productivityPercent.toFixed(1)}%`}
                    />
                  )}
                </div>

                <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500">
                  <span>0%</span>
                  <span>90%</span>
                  <span>110%</span>
                  <span>150%+</span>
                </div>

                {prod.requiredNursingHours > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 text-slate-600">
                    <span>Productivity หากไม่ขึ้นเวร OT (เฉพาะเวรทำการ)</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {prod.baselineProductivityWithoutOtPercent.toFixed(1)}%
                    </span>
                  </div>
                )}
                {prod.requiredNursingHours > 0 &&
                  prod.baselineProductivityWithoutOtPercent > 0 && (
                    <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{ width: `${clampedBaselinePos}%` }}
                        className={`h-full rounded-full ${
                          prod.baselineProductivityWithoutOtPercent > 110
                            ? 'bg-rose-300'
                            : 'bg-slate-300'
                        }`}
                      />
                    </div>
                  )}
              </div>

              {/* Formula Audit & Safety Hours Check */}
              <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">ชั่วโมงการพยาบาลที่ต้องการ (ตัวตั้ง)</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                    {prod.requiredNursingHours.toFixed(1)} ชม.
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">ชั่วโมงปฏิบัติงานจริงรวม OT (ตัวหาร)</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                    {prod.actualNursingHours.toFixed(1)} ชม.
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">ชั่วโมงในเวลาราชการอย่างเดียว</span>
                  <span className="font-mono tabular-nums text-slate-700">
                    {prod.actualWorkingOnlyHours.toFixed(1)} ชม.
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <span className="text-slate-600">
                    ชั่วโมงเฉลี่ย/คน/สัปดาห์ (สภาการพยาบาล ≤ 52 ชม.)
                  </span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      prod.avgWeeklyHoursPerPerson > 52
                        ? 'text-rose-700'
                        : prod.avgWeeklyHoursPerPerson > 48
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {prod.avgWeeklyHoursPerPerson.toFixed(1)} ชม.
                  </span>
                </div>
              </div>
            </div>

            {/* FTE Requirement Summary Footer (Base FTE + MOPH Relief Factor) */}
            <div className="border-t border-slate-200 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-[11px] text-slate-500">กำลังคนจริง</div>
                <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900">
                  {prod.currentHeadcount}
                </div>
                <div className="text-[10px] text-slate-400">คน</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ต้องการ (100%)</div>
                <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-800">
                  {prod.requiredNursingHours > 0 ? prod.requiredFteAt100.toFixed(2) : '—'}
                </div>
                <div className="text-[10px] text-slate-400">อัตรา</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  สูตร สธ. (×{prod.reliefFactor.toFixed(1)})
                </div>
                <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-teal-800">
                  {prod.requiredNursingHours > 0 ? prod.requiredFteWithRelief.toFixed(2) : '—'}
                </div>
                <div className="text-[10px] text-slate-400">อัตรา (เผื่อลา)</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ส่วนต่าง (Gap)</div>
                <div
                  className={`mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums ${
                    prod.requiredNursingHours === 0
                      ? 'text-slate-400'
                      : prod.fteWithReliefGap > 0.2
                      ? 'text-rose-700'
                      : prod.fteWithReliefGap < -0.2
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {prod.requiredNursingHours > 0
                    ? `${prod.fteWithReliefGap > 0 ? '+' : ''}${prod.fteWithReliefGap.toFixed(2)}`
                    : '—'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {prod.requiredNursingHours === 0
                    ? 'อัตรา'
                    : prod.fteWithReliefGap > 0
                    ? 'ขาดอัตรา'
                    : 'เกินอัตรา'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Individual Staff OT Load & Balance Table */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-700 shrink-0" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-950">
                  3. สรุปยอดการขึ้นเวร OT รายบุคคล (ตรวจสอบความสมดุลภาระงาน)
                </h3>
                <p className="text-xs text-slate-500">
                  แสดงจำนวนเวร OT แยก ช/บ/ด, Workload, SMC, Standby และอัตรากำลังเทียบเท่าของแต่ละบุคคล
                </p>
              </div>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['ALL', 'RN', 'PN', 'NA'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat === 'ALL' ? 'ทั้งหมด' : cat}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSortByOtDesc((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                {sortByOtDesc ? 'เรียงตาม OT มาก → น้อย' : 'เรียงตามลำดับรายชื่อ'}
              </button>
            </div>
          </div>

          {staffRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              ไม่พบข้อมูลบุคลากรในสายงานที่เลือก
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs sm:text-[13px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="px-3 py-2.5 text-center w-10">ลำดับ</th>
                    <th className="px-4 py-2.5 text-left whitespace-nowrap">ชื่อ - สกุล</th>
                    <th className="px-2.5 py-2.5 text-center whitespace-nowrap">สายงาน</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap bg-slate-100/60 text-slate-700">
                      ทำการ
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap bg-rose-50/70 text-rose-700">
                      OT (ช/บ/ด)
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap bg-emerald-50/70 text-emerald-700">
                      Workload
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap bg-purple-50/70 text-purple-700">
                      SMC
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap bg-sky-50/70 text-sky-700">
                      Standby
                    </th>
                    <th className="px-3 py-2.5 text-left whitespace-nowrap min-w-[160px]">
                      รวมเวร OT (OT / WL / SMC)
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap bg-teal-50/70 text-teal-800">
                      OT FTE
                    </th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">ยอดเบิก (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffRows.map((row, idx) => {
                    const s = row.summary;
                    const otW = Math.min(100, (row.regularOt / maxStaffOt) * 100);
                    const wlVal = draft.includeWorkloadInOt ? s.workloadCount : 0;
                    const smcVal = draft.includeSmcInOt ? s.smcCount : 0;
                    const wlW = Math.min(100 - otW, (wlVal / maxStaffOt) * 100);
                    const smcW = Math.min(100 - otW - wlW, (smcVal / maxStaffOt) * 100);
                    return (
                      <tr
                        key={s.staff.staffId}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {onEditStaffShifts ? (
                            <button
                              type="button"
                              onClick={() => onEditStaffShifts(s.staff.staffId)}
                              className="text-left hover:text-teal-800 hover:underline underline-offset-2 cursor-pointer"
                            >
                              {s.staff.fullName}
                            </button>
                          ) : (
                            s.staff.fullName
                          )}
                        </td>
                        <td className="px-2.5 py-2.5 text-center font-semibold text-slate-600">
                          {s.staff.category}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {s.workingDaysCount}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-rose-700">
                          {row.regularOt}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                          {s.workloadCount > 0 ? s.workloadCount : '-'}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-purple-700">
                          {s.smcCount > 0 ? s.smcCount : '-'}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-sky-700">
                          {s.standbyCount > 0 ? s.standbyCount : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums font-bold text-slate-950 w-7 text-right shrink-0">
                              {row.countedOt}
                            </span>
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex gap-px p-px">
                              {otW > 0 && (
                                <div
                                  style={{ width: `${otW}%` }}
                                  className="h-full bg-rose-300 rounded-l-full"
                                  title={`OT ${row.regularOt} เวร`}
                                />
                              )}
                              {wlW > 0 && (
                                <div
                                  style={{ width: `${wlW}%` }}
                                  className="h-full bg-emerald-300"
                                  title={`Workload ${wlVal} เวร`}
                                />
                              )}
                              {smcW > 0 && (
                                <div
                                  style={{ width: `${smcW}%` }}
                                  className="h-full bg-purple-300 rounded-r-full"
                                  title={`SMC ${smcVal} เวร`}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-teal-700">
                          +{row.fteFromOt.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatCurrency(s.regularOtTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
};
