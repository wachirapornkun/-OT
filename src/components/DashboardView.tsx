import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  Check,
  Download,
  Printer,
  RotateCcw,
  Save,
  Users,
} from 'lucide-react';
import {
  AnesthesiaProductivityInput,
  CATEGORY_SHORT_LABELS,
  DEFAULT_ANESTHESIA_PRODUCTIVITY,
  DepartmentSettings,
  PersonMonthlySummary,
  RosterMonth,
  StaffCategory,
} from '../types/roster';
import { updateRosterMonthAdmin } from '../services/rosterService';
import {
  calculateMonthlyDashboard,
  exportDashboardExcel,
  resolveProductivityInput,
} from '../utils/dashboardCalculations';
import { formatCurrency, getThaiMonthYearLabel } from '../utils/thaiUtils';

interface DashboardViewProps {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
  onEditStaffShifts?: (staffId: string) => void;
  onPrintA4?: (title?: string) => void;
}

const CATEGORY_BAR_COLORS: Record<
  StaffCategory,
  { accent: string; soft: string; text: string }
> = {
  RN: { accent: 'bg-teal-700', soft: 'bg-teal-100', text: 'text-teal-800' },
  PN: { accent: 'bg-sky-700', soft: 'bg-sky-100', text: 'text-sky-800' },
  NA: { accent: 'bg-amber-600', soft: 'bg-amber-100', text: 'text-amber-800' },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  month,
  settings,
  summaries,
  onEditStaffShifts,
  onPrintA4,
}) => {
  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);

  const [draft, setDraft] = useState<AnesthesiaProductivityInput>(() =>
    resolveProductivityInput(month),
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [sortByOtDesc, setSortByOtDesc] = useState(true);

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
      ? 'text-red-700'
      : prod.status === 'under'
      ? 'text-amber-700'
      : 'text-slate-500';

  const prodSurfaceTone =
    prod.status === 'optimal'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : prod.status === 'overload'
      ? 'bg-red-50 border-red-200 text-red-900'
      : prod.status === 'under'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-slate-50 border-slate-200 text-slate-700';

  return (
    <div className="space-y-6">
      {/* Screen-only Toolbar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => updateField('hoursPerShift', 7)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.hoursPerShift === 7
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 ชม./เวร (เกณฑ์ สธ.)
            </button>
            <button
              type="button"
              onClick={() => updateField('hoursPerShift', 8)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.hoursPerShift === 8
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8 ชม./เวร
            </button>
          </div>

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

          {/* KPI 4: Anesthesiology Productivity */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              Productivity งานวิสัญญี ({draft.staffScope === 'RN' ? 'เฉพาะ RN' : 'RN+PN+NA'})
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
                  ? 'เหมาะสมตามเกณฑ์ สธ.'
                  : prod.status === 'overload'
                  ? 'เกินเกณฑ์ (ขาดอัตรากำลัง)'
                  : 'ต่ำกว่าเกณฑ์ 90%'
                : 'กรอกยอดเคสวิสัญญีด้านล่าง'}
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              {prod.requiredNursingHours > 0
                ? `หากไม่ขึ้น OT: ${prod.baselineProductivityWithoutOtPercent.toFixed(1)}% · ต้องการ ${prod.requiredFteAt100.toFixed(2)} อัตรา`
                : 'รองรับแยกประเภทเคส GA / Regional / MAC'}
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
                  <th className="px-3 py-3 text-right whitespace-nowrap">เวรทำการ</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-red-700">
                    OT ปกติ+นักขัตฯ
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-green-700">
                    Workload
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-purple-700">SMC</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-sky-700">Standby</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-slate-950">
                    รวม OT คิด FTE
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">เฉลี่ย/คน</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-teal-800">
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
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                        {m.workingShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-red-700">
                        {m.regularOtShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-green-700">
                        {m.workloadShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-purple-700">
                        {m.smcShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-sky-700">
                        {m.standbyShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-slate-950">
                        {m.countedOtShifts}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                        {m.avgOtPerPerson.toFixed(1)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-teal-800">
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
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-950">
                  <td className="px-4 py-3 whitespace-nowrap">{analysis.all.label}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {analysis.all.headcount} คน
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {analysis.all.workingShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-red-700">
                    {analysis.all.regularOtShifts}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-green-700">
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

          {/* Visual Stacked Bar Comparison: Working vs OT Shifts per Category */}
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800">
                สัดส่วนเวรทำการ vs เวรนอกเวลา (OT / Workload / SMC) แยกตามสายงาน
              </span>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-700 inline-block" />
                  เวรทำการ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block" />
                  OT ปกติ+นักขัตฯ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-green-600 inline-block" />
                  Workload
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-purple-600 inline-block" />
                  SMC
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              {(['RN', 'PN', 'NA'] as StaffCategory[]).map((cat) => {
                const m = analysis.categories[cat];
                const workW = (m.workingShifts / maxCategoryTotalShifts) * 100;
                const otW = (m.regularOtShifts / maxCategoryTotalShifts) * 100;
                const wlW =
                  ((draft.includeWorkloadInOt ? m.workloadShifts : 0) /
                    maxCategoryTotalShifts) *
                  100;
                const smcW =
                  ((draft.includeSmcInOt ? m.smcShifts : 0) / maxCategoryTotalShifts) *
                  100;

                return (
                  <div
                    key={cat}
                    className="grid grid-cols-1 sm:grid-cols-[175px_1fr_170px] items-center gap-2 sm:gap-3"
                  >
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {CATEGORY_SHORT_LABELS[cat]}{' '}
                      <span className="font-normal text-slate-500 tabular-nums">
                        ({m.headcount} คน)
                      </span>
                    </div>
                    <div className="h-5 bg-slate-200/80 rounded-md overflow-hidden flex">
                      {workW > 0 && (
                        <div
                          style={{ width: `${workW}%` }}
                          className="bg-slate-700 h-full"
                          title={`เวรทำการ ${m.workingShifts} เวร`}
                        />
                      )}
                      {otW > 0 && (
                        <div
                          style={{ width: `${otW}%` }}
                          className="bg-red-600 h-full"
                          title={`เวร OT ปกติ+นักขัตฤกษ์ ${m.regularOtShifts} เวร`}
                        />
                      )}
                      {wlW > 0 && (
                        <div
                          style={{ width: `${wlW}%` }}
                          className="bg-green-600 h-full"
                          title={`เวร Workload ${m.workloadShifts} เวร`}
                        />
                      )}
                      {smcW > 0 && (
                        <div
                          style={{ width: `${smcW}%` }}
                          className="bg-purple-600 h-full"
                          title={`เวร SMC ${m.smcShifts} เวร`}
                        />
                      )}
                    </div>
                    <div className="text-xs text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      OT {m.countedOtShifts} เวร ·{' '}
                      <strong className={CATEGORY_BAR_COLORS[cat].text}>
                        +{m.otFteEquivalent.toFixed(2)} อัตรา
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. Anesthesiology Nursing Productivity Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: Monthly Anesthesia Case & Workload Input Table */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-950">
                  2. คำนวณ Productivity งานการพยาบาลวิสัญญีประจำเดือน
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  กรอกจำนวนเคสผู้ป่วยวิสัญญี (หรือชั่วโมงบริการรวม) ระบบคำนวณเทียบชั่วโมงเวรจริงให้อัตโนมัติ
                </p>
              </div>

              <div className="no-print flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => updateField('mode', 'cases')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    draft.mode === 'cases'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  แยกประเภทเคส
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
              {/* Scope Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="text-xs font-semibold text-slate-700">
                  กลุ่มบุคลากรที่ใช้เป็นฐานชั่วโมงปฏิบัติงานจริง (ตัวหาร)
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => updateField('staffScope', 'RN')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      draft.staffScope === 'RN'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    เฉพาะพยาบาลวิสัญญี (RN)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('staffScope', 'ALL')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      draft.staffScope === 'ALL'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ทั้งทีม (RN + PN + NA)
                  </button>
                </div>
              </div>

              {draft.mode === 'cases' ? (
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
                    เหมาะสำหรับกรณีที่หน่วยงานมีผลรวมชั่วโมงบริการวิสัญญีจริงจากระบบห้องผ่าตัดอยู่แล้ว
                    และต้องการนำมาหารด้วยชั่วโมงปฏิบัติงานจริงของบุคลากรในเดือนนั้นโดยตรง
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
                  คืนค่ามาตรฐาน NHPP
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

          {/* Right: Productivity Gauge & FTE Gap Interpretation */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-700 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-950">
                    ผลวิเคราะห์ Productivity &amp; อัตรากำลัง
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  เกณฑ์ สธ. 90–110%
                </span>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-lg border text-xs space-y-1 ${prodSurfaceTone}`}>
                <div className="font-bold">{prod.statusLabel}</div>
                <p className="leading-relaxed opacity-90">{prod.recommendation}</p>
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
                  {/* 0-90% Under-utilized (60% of 150) */}
                  <div className="w-[60%] bg-amber-100 h-full" title="ต่ำกว่าเกณฑ์ (< 90%)" />
                  {/* 90-110% Optimal (13.33% of 150) */}
                  <div
                    className="w-[13.34%] bg-emerald-200 border-x border-emerald-400 h-full"
                    title="เกณฑ์มาตรฐาน สธ. (90–110%)"
                  />
                  {/* 110-150% Overload (26.66% of 150) */}
                  <div className="w-[26.66%] bg-red-100 h-full" title="เกินอัตรากำลัง (> 110%)" />

                  {prod.requiredNursingHours > 0 && (
                    <div
                      style={{ left: `${clampedProdPos}%` }}
                      className="absolute top-0 bottom-0 w-1 -ml-0.5 bg-slate-950"
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
                    <div className="relative h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{ width: `${clampedBaselinePos}%` }}
                        className={`h-full ${
                          prod.baselineProductivityWithoutOtPercent > 110
                            ? 'bg-red-500'
                            : 'bg-slate-500'
                        }`}
                      />
                    </div>
                  )}
              </div>

              {/* Formula Audit Breakdown */}
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
              </div>
            </div>

            {/* FTE Requirement Summary Footer */}
            <div className="border-t border-slate-200 pt-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[11px] text-slate-500">กำลังคนที่มีจริง</div>
                <div className="mt-0.5 text-lg font-bold font-mono tabular-nums text-slate-900">
                  {prod.currentHeadcount}
                </div>
                <div className="text-[10px] text-slate-400">คน</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ต้องการ (100%)</div>
                <div className="mt-0.5 text-lg font-bold font-mono tabular-nums text-teal-800">
                  {prod.requiredNursingHours > 0 ? prod.requiredFteAt100.toFixed(2) : '—'}
                </div>
                <div className="text-[10px] text-slate-400">อัตรา</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ส่วนต่าง (Gap)</div>
                <div
                  className={`mt-0.5 text-lg font-bold font-mono tabular-nums ${
                    prod.requiredNursingHours === 0
                      ? 'text-slate-400'
                      : prod.fteGap > 0.2
                      ? 'text-red-700'
                      : prod.fteGap < -0.2
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {prod.requiredNursingHours > 0
                    ? `${prod.fteGap > 0 ? '+' : ''}${prod.fteGap.toFixed(2)}`
                    : '—'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {prod.requiredNursingHours === 0
                    ? 'อัตรา'
                    : prod.fteGap > 0
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
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap">ทำการ</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap text-red-700">
                      OT (ช/บ/ด)
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap text-green-700">
                      Workload
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap text-purple-700">
                      SMC
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap text-sky-700">
                      Standby
                    </th>
                    <th className="px-3 py-2.5 text-left whitespace-nowrap min-w-[140px]">
                      รวมเวร OT (ภาระงาน)
                    </th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap text-teal-800">
                      OT FTE
                    </th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">ยอดเบิก (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffRows.map((row, idx) => {
                    const s = row.summary;
                    const barPct = Math.min(100, (row.countedOt / maxStaffOt) * 100);
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
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-red-700">
                          {row.regularOt}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-green-700">
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
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${barPct}%` }}
                                className={`h-full rounded-full ${
                                  CATEGORY_BAR_COLORS[s.staff.category].accent
                                }`}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-teal-800">
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
    </div>
  );
};
