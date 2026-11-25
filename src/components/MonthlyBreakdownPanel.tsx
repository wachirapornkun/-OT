import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Printer,
  RefreshCw,
  Save,
  Table2,
} from 'lucide-react';
import { DepartmentSettings } from '../types/roster';
import {
  exportYearlyMonthlyBreakdownExcel,
  MonthlyComparisonRow,
  ProductivityStatus,
  YearlyDashboardSummary,
  YearRangeType,
} from '../utils/dashboardCalculations';
import { formatCurrency } from '../utils/thaiUtils';

export type YearlyChartMetric = 'shiftMix' | 'otShifts' | 'otFte' | 'productivity';

interface MonthlyBreakdownPanelProps {
  summary: YearlyDashboardSummary;
  settings: DepartmentSettings;
  activeMonthId: string;
  loading: boolean;
  yearType: YearRangeType;
  yearAD: number;
  hoursPerShift: number;
  reliefFactor: number;
  staffScope: 'RN' | 'ALL';
  chartMetric: YearlyChartMetric;
  dirtyMonthIds?: Record<string, boolean>;
  savingAll?: boolean;
  onChangeChartMetric: (metric: YearlyChartMetric) => void;
  onChangeYearType: (type: YearRangeType) => void;
  onChangeYearAD: (yearAD: number) => void;
  onRefresh: () => void;
  onSaveAllDirty?: () => void;
  onOpenMonthlyEntry?: () => void;
  onOpenMonthDetail: (monthId: string) => void;
  onPrintA4?: (title?: string) => void;
}

function getStatusTextClass(status: ProductivityStatus): string {
  if (status === 'optimal') return 'text-emerald-700';
  if (status === 'overload') return 'text-rose-700';
  if (status === 'under') return 'text-amber-700';
  return 'text-slate-400';
}

function getStatusBarClass(status: ProductivityStatus): string {
  if (status === 'optimal') return 'bg-emerald-300 ring-1 ring-inset ring-emerald-400/35';
  if (status === 'overload') return 'bg-rose-300 ring-1 ring-inset ring-rose-400/35';
  if (status === 'under') return 'bg-amber-200 ring-1 ring-inset ring-amber-400/40';
  return 'bg-slate-200';
}

function getStatusShortLabel(status: ProductivityStatus): string {
  if (status === 'optimal') return 'มาตรฐาน 90–110%';
  if (status === 'overload') return 'เกินเกณฑ์ >110%';
  if (status === 'under') return 'ต่ำกว่าเกณฑ์ <90%';
  return 'ยังไม่กรอกเคส';
}

export const MonthlyBreakdownPanel: React.FC<MonthlyBreakdownPanelProps> = ({
  summary,
  settings,
  activeMonthId,
  loading,
  yearType,
  yearAD,
  hoursPerShift,
  reliefFactor,
  staffScope,
  chartMetric,
  dirtyMonthIds = {},
  savingAll = false,
  onChangeChartMetric,
  onChangeYearType,
  onChangeYearAD,
  onRefresh,
  onSaveAllDirty,
  onOpenMonthlyEntry,
  onOpenMonthDetail,
  onPrintA4,
}) => {
  const unsavedCount = useMemo(
    () => summary.months.filter((m) => dirtyMonthIds[m.monthId]).length,
    [summary.months, dirtyMonthIds],
  );

  const maxShiftMix = useMemo(
    () =>
      Math.max(
        20,
        ...summary.months.map(
          (m) => m.workingShifts + m.regularOtShifts + m.workloadShifts + m.smcShifts,
        ),
      ),
    [summary.months],
  );

  const maxOtShifts = useMemo(
    () => Math.max(10, ...summary.months.map((m) => m.totalOtShifts)),
    [summary.months],
  );

  const maxOtFte = useMemo(
    () => Math.max(1, ...summary.months.map((m) => m.totalOtFte)),
    [summary.months],
  );

  const prodChartMax = 150;

  return (
    <div className="space-y-6">
      {/* Year Range & Export Toolbar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Fiscal vs Calendar Year Switcher */}
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
              {yearType === 'fiscal' ? `ปีงบฯ ${summary.yearBE}` : `พ.ศ. ${summary.yearBE}`}
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

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'กำลังโหลด...' : 'อัปเดตข้อมูล'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenMonthlyEntry && (
            <button
              type="button"
              onClick={onOpenMonthlyEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50/70 hover:bg-teal-100/70 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Table2 className="w-3.5 h-3.5" />
              กรอก/แก้ไข Productivity
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              exportYearlyMonthlyBreakdownExcel({
                summary,
                settings,
                hoursPerShift,
                reliefFactor,
                staffScope,
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            ส่งออก Excel (12 เดือน)
          </button>
          <button
            type="button"
            onClick={() =>
              onPrintA4
                ? onPrintA4(`สรุปรายเดือน OT อัตรากำลัง และ Productivity ${summary.periodLabel}`)
                : window.print()
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            พิมพ์รายงาน (A4)
          </button>
        </div>
      </div>

      {/* Live Unsaved Productivity Sync Notice */}
      {unsavedCount > 0 && onSaveAllDirty && (
        <div className="no-print bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-900">
            <strong>เชื่อมข้อมูลเรียลไทม์แล้ว:</strong> กราฟและตาราง 12 เดือนด้านล่างกำลังแสดงยอด Productivity ที่เพิ่งกรอก ({unsavedCount} เดือนยังไม่บันทึกลงฐานข้อมูล)
          </div>
          <button
            type="button"
            disabled={savingAll}
            onClick={onSaveAllDirty}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingAll ? 'กำลังบันทึก...' : `บันทึกทั้งหมด (${unsavedCount} เดือน)`}
          </button>
        </div>
      )}

      {/* Printable 12-Month Report Root */}
      <div className="print-full-width space-y-6">
        {/* Report Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight">
              รายงานสรุปยอด OT อัตรากำลัง และ Productivity งานวิสัญญี (แยกรายเดือน)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {settings.departmentName} · {settings.hospitalName} ·{' '}
              <strong className="text-slate-900">{summary.periodLabel}</strong>
            </p>
          </div>
          <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
            ฐาน {staffScope === 'RN' ? 'เฉพาะ RN' : 'ทั้งทีม RN+PN+NA'} · เกณฑ์ {hoursPerShift}{' '}
            ชม./เวร · สูตรเผื่อวันลา ×{reliefFactor.toFixed(1)}
          </div>
        </div>

        {/* 1. Annual 4-Column Executive KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              ยอดเวร OT สะสมทั้งปี ({summary.monthsWithShifts} เดือนที่มีข้อมูล)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
                {formatCurrency(summary.totalOtShifts)}
              </span>
              <span className="text-sm text-slate-500">เวร</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              RN {formatCurrency(summary.totalRnOtShifts)} · PN{' '}
              {formatCurrency(summary.totalPnOtShifts)} · NA{' '}
              {formatCurrency(summary.totalNaOtShifts)} เวร
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              ยอดเบิก OT รวมทั้งปี {formatCurrency(summary.totalOtBudgetBaht)} บาท
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              อัตรากำลังเทียบเท่าจาก OT เฉลี่ย/เดือน
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-teal-800">
                +{summary.avgMonthlyOtFte.toFixed(2)}
              </span>
              <span className="text-sm text-slate-500">อัตรา/เดือน</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              RN +{summary.avgRnOtFte.toFixed(2)} · PN +{summary.avgPnOtFte.toFixed(2)} · NA +
              {summary.avgNaOtFte.toFixed(2)}
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              เฉลี่ยเฉพาะเดือนที่มีการลงเวร ({summary.monthsWithShifts} เดือน)
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              ปริมาณงานวิสัญญีสะสม ({summary.monthsWithProductivity} เดือนที่บันทึกเคส)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
                {formatCurrency(summary.totalCases)}
              </span>
              <span className="text-sm text-slate-500">ราย</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              ชม.ที่ผู้ป่วยต้องการรวม {formatCurrency(Math.round(summary.totalRequiredHours))} ชม.
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              ชม.ปฏิบัติงานจริงรวม {formatCurrency(Math.round(summary.totalActualHours))} ชม.
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              Productivity เฉลี่ยทั้งปี (เกณฑ์กองการพยาบาล)
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums ${getStatusTextClass(
                  summary.annualStatus,
                )}`}
              >
                {summary.monthsWithProductivity > 0
                  ? `${summary.annualProductivityPercent.toFixed(1)}%`
                  : '—'}
              </span>
              <span className="text-xs text-slate-500">เกณฑ์ 90–110%</span>
            </div>
            <div className="text-xs text-slate-600 tabular-nums">
              {getStatusShortLabel(summary.annualStatus)}
            </div>
            <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
              {summary.monthsWithProductivity > 0
                ? `ไม่มี OT: ${summary.annualBaselineWithoutOtPercent.toFixed(1)}% · สูตร สธ.: ${summary.avgRequiredFteWithRelief.toFixed(2)} อัตรา`
                : 'คลิกที่เดือนด้านล่างเพื่อกรอกยอดเคส ASA'}
            </div>
          </div>
        </div>

        {/* 2. 12-Month Visual Comparison Pastel Column Chart */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-950">
                1. กราฟเปรียบเทียบแนวโน้มรายเดือน (12 เดือน)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                โทนสีพาสเทลสบายตา · คลิกที่แท่งกราฟของแต่ละเดือนเพื่อเปิดดูและแก้ไขข้อมูล OT / เคสวิสัญญีของเดือนนั้น
              </p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start xl:self-auto shrink-0">
              <button
                type="button"
                onClick={() => onChangeChartMetric('shiftMix')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartMetric === 'shiftMix'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทำการ / OT / WL / SMC
              </button>
              <button
                type="button"
                onClick={() => onChangeChartMetric('otShifts')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartMetric === 'otShifts'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ยอดเวร OT (RN/PN/NA)
              </button>
              <button
                type="button"
                onClick={() => onChangeChartMetric('otFte')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartMetric === 'otFte'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                OT FTE (อัตรา)
              </button>
              <button
                type="button"
                onClick={() => onChangeChartMetric('productivity')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartMetric === 'productivity'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Productivity (%) สธ.
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Soft Pastel Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              {chartMetric === 'shiftMix' ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-slate-300 border border-slate-400/50 inline-block" />
                    วันทำการ
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-rose-300 border border-rose-400/50 inline-block" />
                    OT ปกติ+นักขัตฯ
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-300 border border-emerald-400/50 inline-block" />
                    Workload
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-purple-300 border border-purple-400/50 inline-block" />
                    SMC
                  </span>
                </div>
              ) : chartMetric === 'otShifts' || chartMetric === 'otFte' ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-teal-300 border border-teal-400/50 inline-block" />
                    RN (พยาบาลวิชาชีพ)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-sky-300 border border-sky-400/50 inline-block" />
                    PN (ผู้ช่วยพยาบาล)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-400/50 inline-block" />
                    NA (ช่วยเหลือคนไข้)
                  </span>
                  {chartMetric === 'otFte' && (
                    <span className="text-slate-400">· เวร OT ÷ วันทำการของแต่ละเดือน</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-300 border border-emerald-400/50 inline-block" />
                    เกณฑ์มาตรฐานกองการพยาบาล (90–110%)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-rose-300 border border-rose-400/50 inline-block" />
                    เกินเกณฑ์ (&gt; 110%)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-400/50 inline-block" />
                    ต่ำกว่าเกณฑ์ (&lt; 90%)
                  </span>
                </div>
              )}
              <span className="text-slate-400">คลิกเดือนเพื่อเจาะลึก</span>
            </div>

            {/* 12-Month Soft Pastel Column Chart */}
            <div className="relative pt-6 pb-2">
              {/* Subtle horizontal reference gridlines */}
              <div className="pointer-events-none absolute inset-x-0 bottom-[30px] h-[180px] flex flex-col justify-between">
                <div className="border-t border-dashed border-slate-200/70" />
                <div className="border-t border-dashed border-slate-200/60" />
                <div className="border-t border-dashed border-slate-200/60" />
                <div className="border-t border-slate-200" />
              </div>

              {/* 90-110% soft pastel reference band when viewing Productivity */}
              {chartMetric === 'productivity' && (
                <div
                  style={{
                    bottom: `${(90 / prodChartMax) * 180 + 30}px`,
                    height: `${(20 / prodChartMax) * 180}px`,
                  }}
                  className="pointer-events-none absolute left-0 right-0 bg-emerald-50/80 border-y border-dashed border-emerald-300 flex items-center justify-end pr-2 z-0"
                >
                  <span className="text-[10px] font-mono text-emerald-700">เกณฑ์ สธ. 90–110%</span>
                </div>
              )}

              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-end relative z-10">
                {summary.months.map((m) => {
                  const isCurrent = m.monthId === activeMonthId;
                  const totalMixShifts =
                    m.workingShifts + m.regularOtShifts + m.workloadShifts + m.smcShifts;

                  const topLabel =
                    chartMetric === 'shiftMix'
                      ? totalMixShifts > 0
                        ? String(totalMixShifts)
                        : '—'
                      : chartMetric === 'otShifts'
                      ? m.totalOtShifts > 0
                        ? String(m.totalOtShifts)
                        : '—'
                      : chartMetric === 'otFte'
                      ? m.totalOtFte > 0
                        ? `+${m.totalOtFte.toFixed(1)}`
                        : '—'
                      : m.hasProductivityData
                      ? `${m.productivityPercent.toFixed(0)}%`
                      : '—';

                  const workH = (m.workingShifts / maxShiftMix) * 180;
                  const regOtH = (m.regularOtShifts / maxShiftMix) * 180;
                  const wlH = (m.workloadShifts / maxShiftMix) * 180;
                  const smcH = (m.smcShifts / maxShiftMix) * 180;

                  const rnH = (m.rnOtShifts / maxOtShifts) * 180;
                  const pnH = (m.pnOtShifts / maxOtShifts) * 180;
                  const naH = (m.naOtShifts / maxOtShifts) * 180;

                  const rnFteH = (m.rnOtFte / maxOtFte) * 180;
                  const pnFteH = (m.pnOtFte / maxOtFte) * 180;
                  const naFteH = (m.naOtFte / maxOtFte) * 180;

                  const prodH = m.hasProductivityData
                    ? Math.min(180, (m.productivityPercent / prodChartMax) * 180)
                    : 0;

                  return (
                    <button
                      key={m.monthId}
                      type="button"
                      onClick={() => onOpenMonthDetail(m.monthId)}
                      className={`group flex flex-col items-center gap-1.5 rounded-lg p-1 transition-colors cursor-pointer ${
                        isCurrent ? 'bg-teal-50/70' : 'hover:bg-slate-50/90'
                      }`}
                      title={`คลิกเพื่อเปิดดูข้อมูลเดือน ${m.fullLabel}`}
                    >
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-700 h-4">
                        {topLabel}
                      </span>

                      <div className="w-full max-w-[38px] h-[180px] flex flex-col justify-end gap-px rounded-t-lg bg-slate-50/80 border border-slate-200/50 p-0.5 overflow-hidden relative">
                        {chartMetric === 'shiftMix' ? (
                          <>
                            {smcH > 0 && (
                              <div
                                style={{ height: `${smcH}px` }}
                                className="w-full bg-purple-300 ring-1 ring-inset ring-purple-400/35 rounded-t-sm transition-opacity duration-150 group-hover:opacity-90"
                                title={`SMC ${m.smcShifts} เวร`}
                              />
                            )}
                            {wlH > 0 && (
                              <div
                                style={{ height: `${wlH}px` }}
                                className="w-full bg-emerald-300 ring-1 ring-inset ring-emerald-400/35 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`Workload ${m.workloadShifts} เวร`}
                              />
                            )}
                            {regOtH > 0 && (
                              <div
                                style={{ height: `${regOtH}px` }}
                                className="w-full bg-rose-300 ring-1 ring-inset ring-rose-400/35 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`OT ปกติ+นักขัตฯ ${m.regularOtShifts} เวร`}
                              />
                            )}
                            {workH > 0 && (
                              <div
                                style={{ height: `${workH}px` }}
                                className="w-full bg-slate-300 ring-1 ring-inset ring-slate-400/30 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`วันทำการ ${m.workingShifts} เวร`}
                              />
                            )}
                          </>
                        ) : chartMetric === 'otShifts' ? (
                          <>
                            {naH > 0 && (
                              <div
                                style={{ height: `${naH}px` }}
                                className="w-full bg-amber-200 ring-1 ring-inset ring-amber-400/40 rounded-t-sm transition-opacity duration-150 group-hover:opacity-90"
                                title={`NA ${m.naOtShifts} เวร`}
                              />
                            )}
                            {pnH > 0 && (
                              <div
                                style={{ height: `${pnH}px` }}
                                className="w-full bg-sky-300 ring-1 ring-inset ring-sky-400/35 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`PN ${m.pnOtShifts} เวร`}
                              />
                            )}
                            {rnH > 0 && (
                              <div
                                style={{ height: `${rnH}px` }}
                                className="w-full bg-teal-300 ring-1 ring-inset ring-teal-400/35 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`RN ${m.rnOtShifts} เวร`}
                              />
                            )}
                          </>
                        ) : chartMetric === 'otFte' ? (
                          <>
                            {naFteH > 0 && (
                              <div
                                style={{ height: `${naFteH}px` }}
                                className="w-full bg-amber-200 ring-1 ring-inset ring-amber-400/40 rounded-t-sm transition-opacity duration-150 group-hover:opacity-90"
                                title={`NA OT FTE +${m.naOtFte.toFixed(2)} อัตรา`}
                              />
                            )}
                            {pnFteH > 0 && (
                              <div
                                style={{ height: `${pnFteH}px` }}
                                className="w-full bg-sky-300 ring-1 ring-inset ring-sky-400/35 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`PN OT FTE +${m.pnOtFte.toFixed(2)} อัตรา`}
                              />
                            )}
                            {rnFteH > 0 && (
                              <div
                                style={{ height: `${rnFteH}px` }}
                                className="w-full bg-teal-300 ring-1 ring-inset ring-teal-400/35 rounded-xs transition-opacity duration-150 group-hover:opacity-90"
                                title={`RN OT FTE +${m.rnOtFte.toFixed(2)} อัตรา`}
                              />
                            )}
                          </>
                        ) : (
                          prodH > 0 && (
                            <div
                              style={{ height: `${prodH}px` }}
                              className={`w-full rounded-t-md transition-opacity duration-150 group-hover:opacity-90 ${getStatusBarClass(
                                m.status,
                              )}`}
                              title={`Productivity ${m.productivityPercent.toFixed(1)}%`}
                            />
                          )
                        )}
                      </div>

                      <span
                        className={`text-[11px] whitespace-nowrap ${
                          isCurrent
                            ? 'font-bold text-teal-800'
                            : 'font-medium text-slate-600 group-hover:text-slate-900'
                        }`}
                      >
                        {m.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Full 12-Month Breakdown Table */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-950">
                2. ตารางสรุปแยกเป็นรายเดือน ({summary.periodLabel})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                แสดงยอด OT แยก RN/PN/NA, อัตรากำลังเทียบเท่า (OT FTE), งบ OT และ Productivity ตามสูตรกองการพยาบาลครบทั้ง 12 เดือน
              </p>
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              คลิกชื่อเดือนเพื่อเข้าไปกรอกเคส ASA หรือแก้ไขเวร
            </div>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-9 w-full bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs sm:text-[13px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="px-4 py-3 text-left whitespace-nowrap">เดือน</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap bg-slate-100/60">
                      วันทำการ
                    </th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap bg-teal-50/70 text-teal-800">
                      OT RN
                    </th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap bg-sky-50/70 text-sky-800">
                      OT PN
                    </th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap bg-amber-50/70 text-amber-800">
                      OT NA
                    </th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">OT รวม</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap bg-teal-50/60 text-teal-800">
                      OT FTE
                    </th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">ยอดเบิก (บาท)</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">เคส (ราย)</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">ชม.ต้องการ / จริง</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Productivity (%)</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      สูตร สธ. (×{reliefFactor.toFixed(1)})
                    </th>
                    <th className="no-print px-3 py-3 text-right whitespace-nowrap">เปิดเดือน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.months.map((m: MonthlyComparisonRow) => {
                    const isCurrent = m.monthId === activeMonthId;
                    return (
                      <tr
                        key={m.monthId}
                        className={`transition-colors ${
                          isCurrent ? 'bg-teal-50/50' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onOpenMonthDetail(m.monthId)}
                            className="text-left font-semibold text-slate-900 hover:text-teal-800 hover:underline underline-offset-2 cursor-pointer"
                          >
                            {m.fullLabel}
                          </button>
                          {isCurrent && (
                            <span className="ml-2 text-[11px] font-medium text-teal-700">
                              · กำลังดู
                            </span>
                          )}
                          {dirtyMonthIds[m.monthId] && (
                            <span className="ml-2 text-[11px] font-medium text-amber-700">
                              · ยังไม่บันทึก
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums text-slate-600">
                          {m.standardWorkingDays}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums text-teal-800">
                          {m.hasShiftData ? m.rnOtShifts : '—'}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums text-sky-800">
                          {m.hasShiftData ? m.pnOtShifts : '—'}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums text-amber-800">
                          {m.hasShiftData ? m.naOtShifts : '—'}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums font-bold text-slate-950">
                          {m.hasShiftData ? m.totalOtShifts : '—'}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums font-semibold text-teal-800">
                          {m.hasShiftData ? `+${m.totalOtFte.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-900">
                          {m.hasShiftData ? formatCurrency(m.otBudgetBaht) : '—'}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono tabular-nums text-slate-700">
                          {m.totalCases > 0 ? formatCurrency(m.totalCases) : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {m.hasProductivityData
                            ? `${m.requiredNursingHours.toFixed(0)} / ${m.actualNursingHours.toFixed(0)}`
                            : m.hasShiftData
                            ? `— / ${m.actualNursingHours.toFixed(0)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {m.hasProductivityData ? (
                            <div>
                              <span
                                className={`font-bold ${getStatusTextClass(m.status)}`}
                              >
                                {m.productivityPercent.toFixed(1)}%
                              </span>
                              <div className="text-[10px] text-slate-400">
                                ไม่มี OT {m.baselineProductivityWithoutOtPercent.toFixed(0)}%
                              </div>
                            </div>
                          ) : onOpenMonthlyEntry ? (
                            <button
                              type="button"
                              onClick={onOpenMonthlyEntry}
                              className="text-xs font-sans text-teal-700 hover:text-teal-900 hover:underline underline-offset-2 cursor-pointer"
                            >
                              + กรอกเคส
                            </button>
                          ) : (
                            <span className="text-slate-400">ยังไม่กรอก</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {m.hasProductivityData ? (
                            <div>
                              <span className="font-semibold text-slate-900">
                                {m.requiredFteWithRelief.toFixed(2)} อัตรา
                              </span>
                              <div
                                className={`text-[10px] ${
                                  m.fteWithReliefGap > 0.2
                                    ? 'text-rose-700'
                                    : m.fteWithReliefGap < -0.2
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {m.fteWithReliefGap > 0
                                  ? `ขาด +${m.fteWithReliefGap.toFixed(2)}`
                                  : `เกิน ${m.fteWithReliefGap.toFixed(2)}`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="no-print px-3 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onOpenMonthDetail(m.monthId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 border border-teal-200 rounded-md transition-colors cursor-pointer"
                          >
                            <span>เจาะลึก</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-950">
                    <td className="px-4 py-3 whitespace-nowrap">
                      รวม / เฉลี่ยทั้งปี ({summary.monthsWithShifts} เดือน)
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-slate-500">
                      —
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-teal-800">
                      {formatCurrency(summary.totalRnOtShifts)}
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-sky-800">
                      {formatCurrency(summary.totalPnOtShifts)}
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-amber-800">
                      {formatCurrency(summary.totalNaOtShifts)}
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(summary.totalOtShifts)}
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-teal-800">
                      +{summary.avgMonthlyOtFte.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(summary.totalOtBudgetBaht)}
                    </td>
                    <td className="px-2.5 py-3 text-right font-mono tabular-nums">
                      {summary.totalCases > 0 ? formatCurrency(summary.totalCases) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {summary.monthsWithProductivity > 0
                        ? `${summary.totalRequiredHours.toFixed(0)} / ${summary.totalActualHours.toFixed(0)}`
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono tabular-nums ${getStatusTextClass(
                        summary.annualStatus,
                      )}`}
                    >
                      {summary.monthsWithProductivity > 0
                        ? `${summary.annualProductivityPercent.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {summary.monthsWithProductivity > 0
                        ? `${summary.avgRequiredFteWithRelief.toFixed(2)} อัตรา`
                        : '—'}
                    </td>
                    <td className="no-print px-3 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
