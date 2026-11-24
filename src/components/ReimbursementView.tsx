import React, { useMemo, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  PersonMonthlySummary,
  RosterMonth,
  StaffCategory,
} from '../types/roster';
import { exportRosterAndReimbursementExcel } from '../utils/excelExport';
import { formatDayList } from '../utils/rosterCalculations';
import {
  formatCurrency,
  getThaiMonthYearLabel,
  numberToThaiBahtText,
} from '../utils/thaiUtils';

interface ReimbursementViewProps {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
  onPrintA4?: (title?: string) => void;
}

type ReimbursementTab = 'ot' | 'workload' | 'individual';

export const ReimbursementView: React.FC<ReimbursementViewProps> = ({
  month,
  settings,
  summaries,
  onPrintA4,
}) => {
  const [activeTab, setActiveTab] = useState<ReimbursementTab>('ot');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [searchText, setSearchText] = useState('');
  const [includeZero, setIncludeZero] = useState(false);

  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);
  const specialRateLabel =
    settings.publicHolidayRateLabel?.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;

  const baseFiltered = useMemo(() => {
    return summaries.filter((s) => {
      if (categoryFilter !== 'ALL' && s.staff.category !== categoryFilter) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          s.staff.fullName.toLowerCase().includes(q) ||
          CATEGORY_LABELS[s.staff.category].toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summaries, categoryFilter, searchText]);

  const otList = useMemo(
    () => baseFiltered.filter((s) => includeZero || s.regularOtTotal > 0),
    [baseFiltered, includeZero],
  );

  const workloadList = useMemo(
    () => baseFiltered.filter((s) => includeZero || s.workloadCount > 0),
    [baseFiltered, includeZero],
  );

  const grandRegularOt = useMemo(
    () => otList.reduce((acc, s) => acc + s.regularOtTotal, 0),
    [otList],
  );

  const grandPublicHolidayOt = useMemo(
    () => otList.reduce((acc, s) => acc + s.publicHolidayOtAmount, 0),
    [otList],
  );

  const totalPublicHolidayShifts = useMemo(
    () => otList.reduce((acc, s) => acc + s.publicHolidayOtCount, 0),
    [otList],
  );

  const totalWorkloadShifts = useMemo(
    () => workloadList.reduce((acc, s) => acc + s.workloadCount, 0),
    [workloadList],
  );

  const totalOtShifts = useMemo(
    () =>
      otList.reduce(
        (acc, s) =>
          acc +
          s.otMorningDays.length +
          s.otAfternoonDays.length +
          s.otNightDays.length +
          s.explicitPublicHolidayCount +
          s.standbyDays.length,
        0,
      ),
    [otList],
  );

  return (
    <div className="space-y-5">
      {/* Top KPI Summary Strip (Screen Only) */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">
            ยอดเบิกค่าเวร OT + {specialRateLabel} + Standby
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-teal-800">
            {formatCurrency(grandRegularOt)}{' '}
            <span className="text-sm font-normal text-slate-500">บาท</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            {numberToThaiBahtText(grandRegularOt)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">
            จำนวนเวรที่เบิกในตารางนี้ (OT + {specialRateLabel} + Standby)
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {totalOtShifts}{' '}
            <span className="text-sm font-normal text-slate-500">เวร</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            ผู้มีสิทธิ์เบิก {otList.length} คน
            {totalPublicHolidayShifts > 0 && (
              <span className="text-fuchsia-700 font-medium">
                {' '}
                · {specialRateLabel} {totalPublicHolidayShifts} เวร (
                {formatCurrency(grandPublicHolidayOt)} บ.)
              </span>
            )}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">เวร Workload (ช*, บ*, ด* สีเขียว)</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-green-700">
            {totalWorkloadShifts}{' '}
            <span className="text-sm font-normal text-slate-500">เวร</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {workloadList.length} คน · ไม่นำไปคิดเงิน (เบิกแยกตาราง)
          </div>
        </div>
      </div>

      {/* Controls Toolbar (Screen Only) */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('ot')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'ot'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              หลักฐานเบิก OT (รวม {specialRateLabel} / Standby)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workload')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'workload'
                  ? 'bg-white text-green-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              สรุปวันเวร Workload (ไม่คิดเงิน)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('individual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'individual'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              สรุปรายบุคคล
            </button>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | StaffCategory)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="ALL">ทุกตำแหน่ง</option>
            <option value="RN">{CATEGORY_SHORT_LABELS.RN}</option>
            <option value="PN">{CATEGORY_SHORT_LABELS.PN}</option>
            <option value="NA">{CATEGORY_SHORT_LABELS.NA}</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ค้นหาชื่อ..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 w-44"
            />
          </div>

          {activeTab !== 'individual' && (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(e) => setIncludeZero(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              แสดงผู้ที่ยอดเป็น 0
            </label>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportRosterAndReimbursementExcel({
                month,
                settings,
                summaries: baseFiltered,
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            ส่งออก Excel
          </button>
          <button
            type="button"
            onClick={() => {
              const titleByTab: Record<ReimbursementTab, string> = {
                ot: `หลักฐานการจ่ายเงินตอบแทน OT ประจำเดือน ${monthLabel}`,
                workload: `สรุปวันที่ปฏิบัติงานเวร Workload ประจำเดือน ${monthLabel}`,
                individual: `สรุปยอดเบิกค่าเวรรายบุคคล ประจำเดือน ${monthLabel}`,
              };
              if (onPrintA4) {
                onPrintA4(titleByTab[activeTab]);
              } else {
                window.print();
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            พิมพ์เอกสารเบิกเงิน (A4)
          </button>
        </div>
      </div>

      {/* TAB 1: Official Regular OT + Standby Reimbursement Table (Black text throughout, except Standby in Sky Blue) */}
      {activeTab === 'ot' && (
        <div className="print-full-width thai-sarabun-doc bg-white border border-slate-300 rounded-xl p-5 lg:p-7 overflow-hidden text-black">
          <div className="text-center space-y-0.5 mb-4 text-black">
            <h2 className="doc-title text-base lg:text-lg leading-snug font-bold text-black">
              หลักฐานการจ่ายเงินตอบแทนการปฏิบัติงานนอกเวลาราชการ
            </h2>
            <p className="doc-subtitle text-sm font-semibold text-black">
              ชื่อส่วนราชการ {settings.hospitalName} ประจำเดือน {monthLabel}
            </p>
          </div>

          {otList.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg">
              ยังไม่มีรายการเบิกจ่ายค่าเวร OT ในเดือนนี้
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="doc-table w-full border-collapse border border-slate-800 text-[13px] leading-snug text-black">
                <thead>
                  <tr className="bg-slate-50 text-black font-semibold text-center">
                    <th className="border border-slate-700 px-1.5 py-2 w-10">ลำดับ</th>
                    <th className="border border-slate-700 px-2.5 py-2 min-w-[155px]">ชื่อ - สกุล</th>
                    <th className="border border-slate-700 px-2 py-2 min-w-[115px]">ตำแหน่ง</th>
                    <th className="border border-slate-700 px-2 py-2 w-20">อัตราเงินตอบแทน</th>
                    <th
                      colSpan={2}
                      className="border border-slate-700 px-2.5 py-2 min-w-[210px]"
                    >
                      วันที่ที่ปฏิบัติงานนอกเวลาราชการ
                    </th>
                    <th className="border border-slate-700 px-2 py-2 w-20">รวมเวลาปฏิบัติงาน</th>
                    <th className="border border-slate-700 px-2 py-2 w-20">จำนวนเงิน</th>
                    <th className="border border-slate-700 px-1.5 py-2 w-16">หักภาษีที่รับเงิน</th>
                    <th className="border border-slate-700 px-2 py-2 w-20">คงรับจริง</th>
                    <th className="border border-slate-700 px-2 py-2 w-20">วัน เดือน ปี ผู้รับเงิน</th>
                    <th className="border border-slate-700 px-2 py-2 min-w-[104px]">ลายมือชื่อ</th>
                    <th className="border border-slate-700 px-2 py-2 min-w-[78px]">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {otList.map((s, idx) => {
                    const pubShiftRows = [
                      { code: 'ช', days: s.publicHolidayOtMorningDays },
                      { code: 'บ', days: s.publicHolidayOtAfternoonDays },
                      { code: 'ด', days: s.publicHolidayOtNightDays },
                    ].filter((item) => item.days.length > 0);
                    const hasPubRows = pubShiftRows.length > 0;
                    const personRowCount = 4 + pubShiftRows.length;
                    const braceHeightClass =
                      personRowCount >= 7
                        ? 'doc-brace-7'
                        : personRowCount === 6
                        ? 'doc-brace-6'
                        : personRowCount === 5
                        ? 'doc-brace-5'
                        : 'doc-brace-4';

                    return (
                      <React.Fragment key={s.staff.staffId}>
                        {/* Row 1: ช */}
                        <tr
                          data-person-group={idx}
                          className={`text-black${
                            idx > 0 && idx % 8 === 0 ? ' print-page-break-before' : ''
                          }`}
                        >
                          <td className="border border-slate-600 px-1.5 py-1 text-center tabular-nums font-semibold">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-600 px-2.5 py-1 font-medium text-black whitespace-nowrap">
                            {s.staff.fullName}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-black whitespace-nowrap">
                            {CATEGORY_LABELS[s.staff.category]}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                            {formatCurrency(s.otRate)}
                          </td>
                          <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-black w-8">
                            ช
                          </td>
                          <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-black">
                            {formatDayList(
                              s.hasDistinctPublicHolidayRate ? s.regularOtMorningDays : s.otMorningDays,
                            )}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                            {(s.hasDistinctPublicHolidayRate ? s.regularOtMorningDays : s.otMorningDays).length}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums">
                            {formatCurrency(s.otMorningAmount)}
                          </td>
                          <td className="border border-slate-600 px-1.5 py-1 text-center text-black">
                            -
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums">
                            {formatCurrency(s.otMorningAmount)}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center whitespace-nowrap">
                            {month.payDateLabel}
                          </td>
                          {/* ลายมือชื่อพร้อมปีกกาเชื่อมทุกแถวของบุคคลนี้เหมือนต้นฉบับ */}
                          <td
                            rowSpan={personRowCount}
                            className="border border-slate-600 border-b-2 border-b-slate-800 px-1.5 py-1 align-middle text-black"
                          >
                            <div className="flex items-center gap-1.5">
                              <svg
                                viewBox="0 0 18 100"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                                className={`w-3.5 shrink-0 text-black ${braceHeightClass}`}
                              >
                                <path
                                  d="M 2 2 C 9 2, 10 6, 10 13 L 10 42 C 10 47, 12 49, 16 50 C 12 51, 10 53, 10 58 L 10 87 C 10 94, 9 98, 2 98"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              </svg>
                              <span className="flex-1 min-w-[60px]" />
                            </div>
                          </td>
                          {/* หมายเหตุ (ยอดรวมรายบุคคล) */}
                          <td
                            rowSpan={personRowCount}
                            className="border border-slate-600 border-b-2 border-b-slate-800 px-2 py-1 align-middle text-right font-bold tabular-nums text-black whitespace-nowrap"
                          >
                            {formatCurrency(s.regularOtTotal)}
                          </td>
                        </tr>

                        {/* Row 2: บ */}
                        <tr data-person-group={idx} className="text-black">
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                            {formatCurrency(s.otRate)}
                          </td>
                          <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-black">
                            บ
                          </td>
                          <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-black">
                            {formatDayList(
                              s.hasDistinctPublicHolidayRate ? s.regularOtAfternoonDays : s.otAfternoonDays,
                            )}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                            {(s.hasDistinctPublicHolidayRate ? s.regularOtAfternoonDays : s.otAfternoonDays).length}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums">
                            {formatCurrency(s.otAfternoonAmount)}
                          </td>
                          <td className="border border-slate-600 px-1.5 py-1 text-center text-black">
                            -
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums">
                            {formatCurrency(s.otAfternoonAmount)}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center">&quot;</td>
                        </tr>

                        {/* Row 3: ด */}
                        <tr data-person-group={idx} className="text-black">
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                            {formatCurrency(s.otRate)}
                          </td>
                          <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-black">
                            ด
                          </td>
                          <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-black">
                            {formatDayList(
                              s.hasDistinctPublicHolidayRate ? s.regularOtNightDays : s.otNightDays,
                            )}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                            {(s.hasDistinctPublicHolidayRate ? s.regularOtNightDays : s.otNightDays).length}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums">
                            {formatCurrency(s.otNightAmount)}
                          </td>
                          <td className="border border-slate-600 px-1.5 py-1 text-center text-black">
                            -
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums">
                            {formatCurrency(s.otNightAmount)}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center">&quot;</td>
                        </tr>

                        {/* Row 4: เวรดึก Standby (สีฟ้า เหมือนต้นฉบับ) */}
                        <tr
                          data-person-group={idx}
                          className={`text-sky-600 ${hasPubRows ? '' : 'border-b-2 border-slate-800'}`}
                        >
                          <td className="border border-slate-600" />
                          <td
                            colSpan={2}
                            className="border border-slate-600 px-2 py-1 text-center font-medium text-sky-600"
                          >
                            เวรดึก Standby
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums text-sky-600">
                            {formatCurrency(s.standbyRate)}
                          </td>
                          <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-sky-600">
                            ด
                          </td>
                          <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-sky-600">
                            {formatDayList(s.standbyDays)}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center tabular-nums text-sky-600">
                            {s.standbyDays.length}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums text-sky-600">
                            {formatCurrency(s.standbyAmount)}
                          </td>
                          <td className="border border-slate-600 px-1.5 py-1 text-center text-sky-600">
                            -
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-right tabular-nums text-sky-600">
                            {formatCurrency(s.standbyAmount)}
                          </td>
                          <td className="border border-slate-600 px-2 py-1 text-center text-sky-600">&quot;</td>
                        </tr>

                        {/* Row 5+: เวรนักขัตฤกษ์ / เวรพิเศษ (ตัวอักษรสีดำทั้งหมด) */}
                        {pubShiftRows.map((item, pIdx) => {
                          const isLastPubRow = pIdx === pubShiftRows.length - 1;
                          const rowAmount = item.days.length * s.publicHolidayOtRate;
                          return (
                            <tr
                              key={item.code}
                              data-person-group={idx}
                              className={`bg-white text-black ${
                                isLastPubRow ? 'border-b-2 border-slate-800' : ''
                              }`}
                            >
                              <td className="border border-slate-600" />
                              <td
                                colSpan={2}
                                className="border border-slate-600 px-2 py-1 text-center font-medium text-black"
                              >
                                {pIdx === 0 ? specialRateLabel : ''}
                              </td>
                              <td className="border border-slate-600 px-2 py-1 text-center tabular-nums text-black">
                                {formatCurrency(s.publicHolidayOtRate)}
                              </td>
                              <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-black">
                                {item.code}
                              </td>
                              <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-black">
                                {formatDayList(item.days)}
                              </td>
                              <td className="border border-slate-600 px-2 py-1 text-center tabular-nums text-black">
                                {item.days.length}
                              </td>
                              <td className="border border-slate-600 px-2 py-1 text-right tabular-nums text-black">
                                {formatCurrency(rowAmount)}
                              </td>
                              <td className="border border-slate-600 px-1.5 py-1 text-center text-black">
                                -
                              </td>
                              <td className="border border-slate-600 px-2 py-1 text-right tabular-nums text-black">
                                {formatCurrency(rowAmount)}
                              </td>
                              <td className="border border-slate-600 px-2 py-1 text-center text-black">&quot;</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  {/* Grand Total Row */}
                  <tr data-print-total-row="true" className="bg-slate-100 font-bold text-black">
                    <td colSpan={7} className="border border-slate-700 px-3 py-2 text-right">
                      รวมทั้งสิ้น
                    </td>
                    <td className="border border-slate-700 px-2 py-2 text-right tabular-nums">
                      {formatCurrency(grandRegularOt)}
                    </td>
                    <td className="border border-slate-700 px-1.5 py-2 text-center">-</td>
                    <td className="border border-slate-700 px-2 py-2 text-right tabular-nums">
                      {formatCurrency(grandRegularOt)}
                    </td>
                    <td colSpan={3} className="border border-slate-700 px-2 py-2 text-right tabular-nums">
                      {formatCurrency(grandRegularOt)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Thai Baht Text + Official 3-Column Signature Block */}
          <div
            data-print-footer="true"
            className="doc-signature print-avoid-break mt-4 space-y-6 text-[13px] text-black"
          >
            <div className="flex flex-wrap items-center gap-6 px-2">
              <span className="font-semibold">รวมทั้งสิ้น (ตัวอักษร)</span>
              <span className="font-bold text-sm">{numberToThaiBahtText(grandRegularOt)}</span>
            </div>
            <div className="px-2 text-black">
              ขอรับรองว่าผู้มีรายชื่อข้างต้นได้มาปฏิบัติงานนอกเวลาจริง
            </div>
            <div className="grid grid-cols-3 gap-6 pt-3 text-center text-black">
              <div className="space-y-1">
                <div>ลงชื่อ...........................................หัวหน้ากลุ่มงาน</div>
                <div className="font-semibold">( {settings.schedulerName} )</div>
                <div>{settings.schedulerTitle}</div>
                <div>{settings.schedulerPosition}</div>
              </div>
              <div className="space-y-1">
                <div>ลงชื่อ...........................................หัวหน้าภารกิจ</div>
                <div className="font-semibold">( {settings.approverName} )</div>
                <div>{settings.approverTitle}</div>
                <div>{settings.approverPosition}</div>
              </div>
              <div className="space-y-1">
                <div>ลงชื่อ...........................................ผู้จ่ายเงิน</div>
                <div className="text-black">( ........................................... )</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Workload Shift Log (ช*, บ*, ด* — Green, Dates & Count Only, No Money) */}
      {activeTab === 'workload' && (
        <div className="print-full-width thai-sarabun-doc bg-white border border-slate-300 rounded-xl p-5 lg:p-7 overflow-hidden">
          <div className="text-center space-y-0.5 mb-4">
            <h2 className="doc-title text-base lg:text-lg leading-snug font-bold text-slate-950">
              สรุปวันที่ปฏิบัติงานเวร Workload (ช*, บ*, ด*) — ไม่คิดเงินในตาราง OT
            </h2>
            <p className="doc-subtitle text-sm font-semibold text-slate-900">
              {settings.departmentName} · {settings.hospitalName} ประจำเดือน {monthLabel}
            </p>
            <p className="doc-subtitle text-xs text-slate-600">
              แสดงเฉพาะวันที่และจำนวนเวรสีเขียวเพื่อใช้อ้างอิงลงตารางเบิกแยกต่างหาก
            </p>
          </div>

          {workloadList.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg">
              ยังไม่มีรายการเวร Workload (ช*, บ*, ด*) ในเดือนนี้
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="doc-table w-full border-collapse border border-slate-800 text-[13px] leading-snug">
                <thead>
                  <tr className="bg-slate-50 text-slate-950 font-semibold text-center">
                    <th className="border border-slate-700 px-1.5 py-2 w-10">ลำดับ</th>
                    <th className="border border-slate-700 px-2.5 py-2 min-w-[175px]">ชื่อ - สกุล</th>
                    <th className="border border-slate-700 px-2 py-2 min-w-[130px]">ตำแหน่ง</th>
                    <th
                      colSpan={2}
                      className="border border-slate-700 px-2.5 py-2 min-w-[260px]"
                    >
                      วันที่ปฏิบัติงาน Workload (ช* / บ* / ด* สีเขียว)
                    </th>
                    <th className="border border-slate-700 px-2 py-2 w-24">จำนวนเวร</th>
                    <th className="border border-slate-700 px-2 py-2 w-28">รวมรายบุคคล</th>
                    <th className="border border-slate-700 px-2 py-2 w-40">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {workloadList.map((s, idx) => (
                    <React.Fragment key={s.staff.staffId}>
                      {/* Row 1: ช* */}
                      <tr
                        data-person-group={idx}
                        className={idx > 0 && idx % 8 === 0 ? 'print-page-break-before' : undefined}
                      >
                        <td className="border border-slate-600 px-1.5 py-1 text-center tabular-nums font-semibold">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-600 px-2.5 py-1 font-medium text-slate-950 whitespace-nowrap">
                          {s.staff.fullName}
                        </td>
                        <td className="border border-slate-600 px-2 py-1 text-slate-900 whitespace-nowrap">
                          {CATEGORY_LABELS[s.staff.category]}
                        </td>
                        <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-green-700 w-10">
                          ช*
                        </td>
                        <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-slate-900">
                          {formatDayList(s.workloadMorningDays) || '-'}
                        </td>
                        <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                          {s.workloadMorningDays.length}
                        </td>
                        <td className="border border-slate-600 px-2 py-1" />
                        <td className="border border-slate-600 px-2 py-1 text-slate-600 text-center">
                          เบิกแยกตาราง
                        </td>
                      </tr>

                      {/* Row 2: บ* */}
                      <tr data-person-group={idx}>
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-green-700">
                          บ*
                        </td>
                        <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-slate-900">
                          {formatDayList(s.workloadAfternoonDays) || '-'}
                        </td>
                        <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                          {s.workloadAfternoonDays.length}
                        </td>
                        <td className="border border-slate-600 px-2 py-1" />
                        <td className="border border-slate-600 px-2 py-1" />
                      </tr>

                      {/* Row 3: ด* */}
                      <tr data-person-group={idx} className="border-b-2 border-slate-800">
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600 border-r-0 px-2 py-1 text-center font-semibold text-green-700">
                          ด*
                        </td>
                        <td className="border border-slate-600 border-l-0 px-2 py-1 tabular-nums text-slate-900">
                          {formatDayList(s.workloadNightDays) || '-'}
                        </td>
                        <td className="border border-slate-600 px-2 py-1 text-center tabular-nums">
                          {s.workloadNightDays.length}
                        </td>
                        <td className="border border-slate-600 px-2 py-1 text-center font-bold tabular-nums text-green-800 bg-green-50/40">
                          {s.workloadCount} เวร
                        </td>
                        <td className="border border-slate-600 px-2 py-1 text-slate-600 text-center">
                          ไม่รวมคิดเงิน OT
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}

                  <tr
                    data-print-total-row="true"
                    className="bg-slate-100 font-bold text-slate-950"
                  >
                    <td colSpan={5} className="border border-slate-700 px-3 py-2 text-right">
                      รวมจำนวนเวร Workload ทั้งสิ้น
                    </td>
                    <td className="border border-slate-700 px-2 py-2 text-center tabular-nums">
                      {totalWorkloadShifts}
                    </td>
                    <td className="border border-slate-700 px-2 py-2 text-center tabular-nums text-green-800">
                      {totalWorkloadShifts} เวร
                    </td>
                    <td className="border border-slate-700 px-2 py-2 text-center font-normal text-slate-700">
                      ไม่คิดเงิน (เบิกแยกตาราง)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Individual Summary Table (OT + Public Holiday + Standby; Workload Count Only) */}
      {activeTab === 'individual' && (
        <div className="print-full-width thai-sarabun-doc bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="doc-title text-base lg:text-lg leading-snug font-bold text-slate-900">
                สรุปยอดเบิกค่าเวรรายบุคคล (OT ปกติ + Standby + {specialRateLabel} · ไม่คิดเงินเวร Workload)
              </h2>
              <p className="doc-subtitle text-xs text-slate-600">
                {settings.departmentName} · ประจำเดือน {monthLabel}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="doc-table w-full text-[13px] leading-snug border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                  <th className="px-3 py-2.5 text-center w-12">ลำดับ</th>
                  <th className="px-4 py-2.5 text-left">ชื่อ - สกุล</th>
                  <th className="px-3 py-2.5 text-left">ตำแหน่ง</th>
                  <th className="px-3 py-2.5 text-right">วันทำการ</th>
                  <th className="px-3 py-2.5 text-right text-red-600">OT ปกติ (ช/บ/ด)</th>
                  <th className="px-3 py-2.5 text-right text-sky-600">Standby</th>
                  <th className="px-3 py-2.5 text-right text-fuchsia-600">{specialRateLabel}</th>
                  <th className="px-3 py-2.5 text-right text-green-700">Workload (ไม่คิดเงิน)</th>
                  <th className="px-4 py-2.5 text-right text-teal-800">รวมเบิก OT สุทธิ (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {baseFiltered.map((s, idx) => {
                  const regularOnlyCount = s.hasDistinctPublicHolidayRate
                    ? s.regularOtMorningDays.length +
                      s.regularOtAfternoonDays.length +
                      s.regularOtNightDays.length
                    : s.otMorningDays.length +
                      s.otAfternoonDays.length +
                      s.otNightDays.length;
                  const regularOnlyBaht =
                    s.otMorningAmount + s.otAfternoonAmount + s.otNightAmount;
                  return (
                    <tr
                      key={s.staff.staffId}
                      data-person-group={idx}
                      className={`hover:bg-slate-50/70${
                        idx > 0 && idx % 8 === 0 ? ' print-page-break-before' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-900 whitespace-nowrap">
                        {s.staff.fullName}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {CATEGORY_LABELS[s.staff.category]}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {s.workingDaysCount}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">
                        {formatCurrency(regularOnlyBaht)}{' '}
                        <span className="text-slate-500">({regularOnlyCount})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-sky-600">
                        {formatCurrency(s.standbyAmount)}{' '}
                        <span className="text-slate-500">({s.standbyCount})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-fuchsia-700">
                        {s.publicHolidayOtCount > 0 ? (
                          <>
                            {formatCurrency(s.publicHolidayOtAmount)}{' '}
                            <span className="text-fuchsia-500">({s.publicHolidayOtCount})</span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-green-700">
                        {s.workloadCount > 0 ? `${s.workloadCount} เวร` : '-'}
                      </td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums text-teal-800">
                        {formatCurrency(s.regularOtTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-950">
                  <td colSpan={6} className="px-4 py-2.5 text-right">
                    รวมทั้งหมด ({baseFiltered.length} คน) ·{' '}
                    {numberToThaiBahtText(
                      baseFiltered.reduce((acc, s) => acc + s.regularOtTotal, 0),
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-fuchsia-800">
                    {formatCurrency(
                      baseFiltered.reduce((acc, s) => acc + s.publicHolidayOtAmount, 0),
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-800">
                    {baseFiltered.reduce((acc, s) => acc + s.workloadCount, 0)} เวร
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-900">
                    {formatCurrency(
                      baseFiltered.reduce((acc, s) => acc + s.regularOtTotal, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
