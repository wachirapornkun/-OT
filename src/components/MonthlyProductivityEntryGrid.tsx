import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
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
  ProductivityMode,
} from '../types/roster';
import {
  exportYearlyMonthlyBreakdownExcel,
  ProductivityStatus,
  YearlyDashboardSummary,
  YearRangeType,
} from '../utils/dashboardCalculations';
import { formatCurrency, getBuddhistYear } from '../utils/thaiUtils';

export interface ProductivityWeightValues {
  asa1HoursPerCase: number;
  asa2HoursPerCase: number;
  asa3HoursPerCase: number;
  asa4HoursPerCase: number;
  asa5HoursPerCase: number;
  gaHoursPerCase: number;
  gaComplexHoursPerCase: number;
  regionalHoursPerCase: number;
  macHoursPerCase: number;
  clinicVisitHoursPerCase: number;
}

export const DEFAULT_PRODUCTIVITY_WEIGHTS: ProductivityWeightValues = {
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

interface MonthlyProductivityEntryGridProps {
  yearAD: number;
  yearType: YearRangeType;
  activeMonthId: string;
  settings: DepartmentSettings;
  yearlySummary: YearlyDashboardSummary;
  resolvedInputsByMonthId: Record<string, AnesthesiaProductivityInput>;
  dirtyMonthIds: Record<string, boolean>;
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
  savingMonthId: string | null;
  savingAll: boolean;
  savedBanner: string;
  saveError: string;
  onChangeYearType: (type: YearRangeType) => void;
  onChangeYearAD: (yearAD: number) => void;
  onChangeGlobalReliefFactor: (factor: number) => void;
  onUpdateMonthField: (
    monthId: string,
    mode: ProductivityMode,
    field: keyof AnesthesiaProductivityInput,
    value: number,
    weights: ProductivityWeightValues,
  ) => void;
  onApplySharedWeights: (nextWeights: ProductivityWeightValues, targetMonthIds: string[]) => void;
  onSaveSingleMonth: (monthId: string) => void;
  onSaveAllDirty: () => void;
  onViewYearlyProductivityChart: () => void;
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

function getModeShortLabel(mode: ProductivityMode): string {
  if (mode === 'asa') return 'ASA I–V';
  if (mode === 'cases') return 'ประเภทบริการ';
  return 'ชั่วโมงรวม';
}

export const MonthlyProductivityEntryGrid: React.FC<MonthlyProductivityEntryGridProps> = ({
  yearAD,
  yearType,
  activeMonthId,
  settings,
  yearlySummary,
  resolvedInputsByMonthId,
  dirtyMonthIds,
  globalOptions,
  loading,
  savingMonthId,
  savingAll,
  savedBanner,
  saveError,
  onChangeYearType,
  onChangeYearAD,
  onChangeGlobalReliefFactor,
  onUpdateMonthField,
  onApplySharedWeights,
  onSaveSingleMonth,
  onSaveAllDirty,
  onViewYearlyProductivityChart,
  onOpenMonthDetail,
  onPrintA4,
}) => {
  const yearBE = getBuddhistYear(yearAD);
  const periodLabel = yearlySummary.periodLabel;
  const monthIds = useMemo(() => yearlySummary.months.map((m) => m.monthId), [yearlySummary.months]);

  const [entryMode, setEntryMode] = useState<ProductivityMode>('asa');
  const autoDetectedYearRef = useRef<string>('');

  // Shared editable NHPP weights across the 12-month grid (defaults to MOPH Nursing Division ASA standards)
  const [weights, setWeights] = useState<ProductivityWeightValues>(DEFAULT_PRODUCTIVITY_WEIGHTS);

  // Sync initial entry mode & weights once per year view from saved months (so data saved in 'cases'/'directHours' appears right away)
  useEffect(() => {
    const viewKey = `${yearType}_${yearAD}`;
    if (loading) return;
    if (autoDetectedYearRef.current === viewKey) return;

    const savedRows = yearlySummary.months.filter((m) => m.hasProductivityData);
    if (savedRows.length > 0) {
      const preferred =
        savedRows.find((m) => m.monthId === activeMonthId) || savedRows[0];
      const preferredInput = resolvedInputsByMonthId[preferred.monthId];
      if (preferredInput) {
        setEntryMode(preferredInput.mode);
        setWeights({
          asa1HoursPerCase: preferredInput.asa1HoursPerCase,
          asa2HoursPerCase: preferredInput.asa2HoursPerCase,
          asa3HoursPerCase: preferredInput.asa3HoursPerCase,
          asa4HoursPerCase: preferredInput.asa4HoursPerCase,
          asa5HoursPerCase: preferredInput.asa5HoursPerCase,
          gaHoursPerCase: preferredInput.gaHoursPerCase,
          gaComplexHoursPerCase: preferredInput.gaComplexHoursPerCase,
          regionalHoursPerCase: preferredInput.regionalHoursPerCase,
          macHoursPerCase: preferredInput.macHoursPerCase,
          clinicVisitHoursPerCase: preferredInput.clinicVisitHoursPerCase,
        });
      }
      autoDetectedYearRef.current = viewKey;
    }
  }, [yearAD, yearType, loading, activeMonthId, yearlySummary.months, resolvedInputsByMonthId]);

  const updateSharedWeight = (weightKey: keyof ProductivityWeightValues, rawValue: string) => {
    const parsed = Math.max(0, Math.min(48, Number(rawValue) || 0));
    const nextWeights = { ...weights, [weightKey]: parsed };
    setWeights(nextWeights);
    onApplySharedWeights(nextWeights, monthIds);
  };

  const handleResetStandardWeights = () => {
    setWeights(DEFAULT_PRODUCTIVITY_WEIGHTS);
    onApplySharedWeights(DEFAULT_PRODUCTIVITY_WEIGHTS, monthIds);
  };

  // Column sums for the 12-month footer (numbers align 1:1 with yearlySummary!)
  const columnTotals = useMemo(() => {
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
    let directHoursSum = 0;

    for (const m of yearlySummary.months) {
      const input = resolvedInputsByMonthId[m.monthId] || DEFAULT_ANESTHESIA_PRODUCTIVITY;
      asaTotals.asa1Cases += input.asa1Cases;
      asaTotals.asa2Cases += input.asa2Cases;
      asaTotals.asa3Cases += input.asa3Cases;
      asaTotals.asa4Cases += input.asa4Cases;
      asaTotals.asa5Cases += input.asa5Cases;
      serviceTotals.gaCases += input.gaCases;
      serviceTotals.gaComplexCases += input.gaComplexCases;
      serviceTotals.regionalCases += input.regionalCases;
      serviceTotals.macCases += input.macCases;
      serviceTotals.clinicVisitCases += input.clinicVisitCases;
      directHoursSum += input.directRequiredHours;
    }

    return { asaTotals, serviceTotals, directHoursSum };
  }, [yearlySummary.months, resolvedInputsByMonthId]);

  const dirtyCountInGrid = useMemo(
    () => monthIds.filter((id) => Boolean(dirtyMonthIds[id])).length,
    [monthIds, dirtyMonthIds],
  );

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

          {/* Right Save / View 12-Month Chart / Export / Print Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={dirtyCountInGrid === 0 || savingAll}
              onClick={onSaveAllDirty}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {savingAll
                ? 'กำลังบันทึก...'
                : dirtyCountInGrid > 0
                ? `บันทึกทั้งหมด (${dirtyCountInGrid} เดือน)`
                : 'บันทึกครบแล้ว'}
            </button>
            <button
              type="button"
              onClick={onViewYearlyProductivityChart}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50/70 hover:bg-teal-100/70 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              ดูกราฟ 12 เดือน
            </button>
            <button
              type="button"
              onClick={() =>
                exportYearlyMonthlyBreakdownExcel({
                  summary: yearlySummary,
                  settings,
                  hoursPerShift: globalOptions.hoursPerShift,
                  reliefFactor: globalOptions.reliefFactor,
                  staffScope: globalOptions.staffScope,
                })
              }
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

        {/* Second Toolbar Row: Relief Factor + Live Sync Status + Reset Standard Weights */}
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
            {saveError && (
              <span className="text-xs font-semibold text-rose-700">{saveError}</span>
            )}
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

      {/* Live 12-Month Linked Productivity Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <span className="font-semibold text-slate-800">
            เชื่อมข้อมูลสรุป 12 เดือนอัตโนมัติ ({yearlySummary.monthsWithProductivity}/12 เดือน)
          </span>
          <span className="text-slate-600 font-mono tabular-nums">
            รวมเคส <strong className="text-slate-950">{formatCurrency(yearlySummary.totalCases)}</strong> ราย
          </span>
          <span className="text-slate-600 font-mono tabular-nums">
            Productivity ทั้งปี{' '}
            <strong className={getStatusTextClass(yearlySummary.annualStatus)}>
              {yearlySummary.monthsWithProductivity > 0 && yearlySummary.totalActualHours > 0
                ? `${yearlySummary.annualProductivityPercent.toFixed(1)}%`
                : '—'}
            </strong>
          </span>
          <span className="text-slate-600 font-mono tabular-nums">
            สูตร สธ. (×{globalOptions.reliefFactor.toFixed(1)}){' '}
            <strong className="text-teal-800">
              {yearlySummary.monthsWithProductivity > 0
                ? `${yearlySummary.avgRequiredFteWithRelief.toFixed(2)} อัตรา`
                : '—'}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onViewYearlyProductivityChart}
          className="no-print text-xs font-semibold text-teal-800 hover:text-teal-950 hover:underline underline-offset-2 whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          เปิดดูกราฟและรายงาน 12 เดือน →
        </button>
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
                    <th className="px-4 py-3 text-left whitespace-nowrap min-w-[155px]">เดือน</th>

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
                  {yearlySummary.months.map((row) => {
                    const monthId = row.monthId;
                    const input =
                      resolvedInputsByMonthId[monthId] || DEFAULT_ANESTHESIA_PRODUCTIVITY;
                    const isDirty = Boolean(dirtyMonthIds[monthId]);
                    const isCurrent = monthId === activeMonthId;
                    const isSavingRow = savingMonthId === monthId;
                    const hasOtherModeData =
                      row.hasProductivityData && input.mode !== entryMode;

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
                          <div className="text-[10px] text-slate-500 tabular-nums flex flex-wrap items-center gap-1.5">
                            <span>{row.standardWorkingDays} วันทำการ</span>
                            {isDirty && (
                              <span className="font-semibold text-amber-700">· ยังไม่บันทึก</span>
                            )}
                            {hasOtherModeData && (
                              <button
                                type="button"
                                onClick={() => setEntryMode(input.mode)}
                                className="no-print text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer"
                                title="คลิกเพื่อสลับไปดูโหมดที่เดือนนี้บันทึกไว้"
                              >
                                · ใช้แบบ {getModeShortLabel(input.mode)}
                              </button>
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
                                  onUpdateMonthField(
                                    monthId,
                                    'asa',
                                    col.caseKey,
                                    Math.max(0, Number(e.target.value) || 0),
                                    weights,
                                  )
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
                                  onUpdateMonthField(
                                    monthId,
                                    'cases',
                                    col.caseKey,
                                    Math.max(0, Number(e.target.value) || 0),
                                    weights,
                                  )
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
                                onUpdateMonthField(
                                  monthId,
                                  'directHours',
                                  'directRequiredHours',
                                  Math.max(0, Number(e.target.value) || 0),
                                  weights,
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
                            onClick={() => onSaveSingleMonth(monthId)}
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
                      รวม / เฉลี่ยทั้งปี ({yearlySummary.monthsWithProductivity} เดือน)
                    </td>

                    {entryMode === 'asa' &&
                      ASA_COLUMNS.map((col) => (
                        <td
                          key={col.caseKey}
                          className="px-2 py-3 text-right font-mono tabular-nums"
                        >
                          {formatCurrency(columnTotals.asaTotals[col.caseKey])}
                        </td>
                      ))}

                    {entryMode === 'cases' &&
                      SERVICE_COLUMNS.map((col) => (
                        <td
                          key={col.caseKey}
                          className="px-2 py-3 text-right font-mono tabular-nums"
                        >
                          {formatCurrency(columnTotals.serviceTotals[col.caseKey])}
                        </td>
                      ))}

                    {entryMode === 'directHours' && (
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {columnTotals.directHoursSum.toFixed(1)} ชม.
                      </td>
                    )}

                    {entryMode !== 'directHours' && (
                      <td className="px-2.5 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(yearlySummary.totalCases)}
                      </td>
                    )}

                    <td className="px-2.5 py-3 text-right font-mono tabular-nums text-teal-800">
                      {yearlySummary.totalRequiredHours > 0
                        ? yearlySummary.totalRequiredHours.toFixed(1)
                        : '—'}
                    </td>

                    <td className="px-2.5 py-3 text-right font-mono tabular-nums">
                      {yearlySummary.totalActualHours > 0
                        ? yearlySummary.totalActualHours.toFixed(1)
                        : '—'}
                    </td>

                    <td
                      className={`px-3 py-3 text-right font-mono tabular-nums ${getStatusTextClass(
                        yearlySummary.annualStatus,
                      )}`}
                    >
                      {yearlySummary.monthsWithProductivity > 0 && yearlySummary.totalActualHours > 0
                        ? `${yearlySummary.annualProductivityPercent.toFixed(1)}%`
                        : '—'}
                    </td>

                    <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {yearlySummary.monthsWithProductivity > 0
                        ? `${yearlySummary.avgRequiredFteWithRelief.toFixed(2)} อัตรา`
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
              ข้อมูลทุกเดือนที่กรอกในตารางนี้เชื่อมกับ <strong>สรุปแนวโน้ม 12 เดือน</strong> และ{' '}
              <strong>เจาะลึกเดือน</strong> แบบเรียลไทม์ทันที — กด <strong>บันทึก</strong> หรือ{' '}
              <strong>บันทึกทั้งหมด</strong> เพื่อเก็บถาวรลงฐานข้อมูล
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
