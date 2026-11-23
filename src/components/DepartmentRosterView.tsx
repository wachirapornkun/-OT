import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pencil, Printer, Search, X } from 'lucide-react';
import {
  CATEGORY_SHORT_LABELS,
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  MainShiftCode,
  PersonMonthlySummary,
  PublicHolidayShiftCode,
  RosterMonth,
  ShiftRowKey,
  StaffCategory,
} from '../types/roster';
import { saveShiftEntry, updateRosterMonthAdmin } from '../services/rosterService';
import { exportRosterAndReimbursementExcel } from '../utils/excelExport';
import { getDayOfWeek, getDaysInMonth, getThaiMonthYearLabel } from '../utils/thaiUtils';
import { ShiftCellDisplay } from './ShiftCellDisplay';

interface DepartmentRosterViewProps {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
  highlightStaffId?: string;
  onEditStaffShifts?: (staffId: string) => void;
  onOpenWorkloadRoster?: () => void;
  onOpenSmcRoster?: () => void;
  onPrintA4?: (title?: string) => void;
}

interface EditingCellState {
  staffId: string;
  staffName: string;
  ownerUid: string;
  rowKey: ShiftRowKey;
  day: number;
  currentValue: string;
}

export const DepartmentRosterView: React.FC<DepartmentRosterViewProps> = ({
  month,
  settings,
  summaries,
  highlightStaffId,
  onEditStaffShifts,
  onOpenWorkloadRoster,
  onOpenSmcRoster,
  onPrintA4,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [searchText, setSearchText] = useState('');
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [savingCell, setSavingCell] = useState(false);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Editable 16pt note under "วันหยุด" at top-right of the OT roster header (defaults to "OT")
  const resolvedHeaderNote = month.headerNote?.trim() ? month.headerNote : 'OT';
  const [headerNoteDraft, setHeaderNoteDraft] = useState<string>(resolvedHeaderNote);
  const headerNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNoteRef = useRef<string>(resolvedHeaderNote);
  const lastSavedNoteRef = useRef<string>(resolvedHeaderNote);
  const activeMonthIdRef = useRef<string>(month.monthId);

  useEffect(() => {
    const isMonthChanged = activeMonthIdRef.current !== month.monthId;
    const incomingNote = month.headerNote?.trim() ? month.headerNote : 'OT';
    if (isMonthChanged) {
      if (headerNoteTimerRef.current) {
        clearTimeout(headerNoteTimerRef.current);
        headerNoteTimerRef.current = null;
        if (latestNoteRef.current !== lastSavedNoteRef.current) {
          void updateRosterMonthAdmin(activeMonthIdRef.current, {
            headerNote: latestNoteRef.current,
          });
        }
      }
      activeMonthIdRef.current = month.monthId;
      setHeaderNoteDraft(incomingNote);
      latestNoteRef.current = incomingNote;
      lastSavedNoteRef.current = incomingNote;
    } else if (!headerNoteTimerRef.current && latestNoteRef.current === lastSavedNoteRef.current) {
      setHeaderNoteDraft(incomingNote);
      latestNoteRef.current = incomingNote;
      lastSavedNoteRef.current = incomingNote;
    }
  }, [month.monthId, month.headerNote]);

  useEffect(() => {
    return () => {
      if (headerNoteTimerRef.current) {
        clearTimeout(headerNoteTimerRef.current);
        headerNoteTimerRef.current = null;
        if (latestNoteRef.current !== lastSavedNoteRef.current) {
          void updateRosterMonthAdmin(activeMonthIdRef.current, {
            headerNote: latestNoteRef.current,
          });
        }
      }
    };
  }, []);

  const persistHeaderNote = async (value: string) => {
    const trimmedVal = value.slice(0, 120);
    if (trimmedVal === lastSavedNoteRef.current) return;
    lastSavedNoteRef.current = trimmedVal;
    await updateRosterMonthAdmin(month.monthId, { headerNote: trimmedVal });
  };

  const handleHeaderNoteChange = (val: string) => {
    const bounded = val.slice(0, 120);
    setHeaderNoteDraft(bounded);
    latestNoteRef.current = bounded;
    if (headerNoteTimerRef.current) {
      clearTimeout(headerNoteTimerRef.current);
    }
    headerNoteTimerRef.current = setTimeout(() => {
      headerNoteTimerRef.current = null;
      void persistHeaderNote(latestNoteRef.current);
    }, 500);
  };

  const handleHeaderNoteBlur = () => {
    if (headerNoteTimerRef.current) {
      clearTimeout(headerNoteTimerRef.current);
      headerNoteTimerRef.current = null;
    }
    void persistHeaderNote(latestNoteRef.current);
  };

  useEffect(() => {
    if (highlightStaffId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightStaffId]);

  const daysInMonth = getDaysInMonth(month.yearAD, month.monthNumber);
  const holidaySet = useMemo(() => new Set(month.holidays), [month.holidays]);
  const daysArray = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );
  const workingDaysTotal = daysInMonth - month.holidays.length;
  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);
  const specialRateLabel =
    settings.publicHolidayRateLabel?.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;

  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (categoryFilter !== 'ALL' && s.staff.category !== categoryFilter) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          s.staff.fullName.toLowerCase().includes(q) ||
          s.staff.positionLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summaries, categoryFilter, searchText]);

  const canEditStaffRow = () => month.status === 'open';

  const handleToggleHoliday = async (day: number) => {
    const nextHolidays = holidaySet.has(day)
      ? month.holidays.filter((d) => d !== day)
      : [...month.holidays, day].sort((a, b) => a - b);
    await updateRosterMonthAdmin(month.monthId, { holidays: nextHolidays });
  };

  const handleApplyCellEdit = async (newValue: string) => {
    if (!editingCell) return;
    const targetSummary = summaries.find((s) => s.staff.staffId === editingCell.staffId);
    if (!targetSummary) return;

    setSavingCell(true);
    try {
      const base = targetSummary.entry || {
        monthId: month.monthId,
        staffId: editingCell.staffId,
        ownerUid: editingCell.ownerUid || '',
        mainShifts: {},
        nightShifts: {},
        workloadShifts: {},
        standbyShifts: {},
        publicHolidayShifts: {},
        visibility: 'department' as const,
      };

      const nextMain = { ...base.mainShifts };
      const nextNight = { ...base.nightShifts };
      const nextWorkload = { ...base.workloadShifts };
      const nextStandby = { ...base.standbyShifts };
      const nextPublicHoliday = { ...(base.publicHolidayShifts || {}) };
      const dKey = String(editingCell.day);

      if (editingCell.rowKey === 'mainShifts') {
        if (newValue) nextMain[dKey] = newValue as MainShiftCode;
        else delete nextMain[dKey];
      } else if (editingCell.rowKey === 'nightShifts') {
        if (newValue) nextNight[dKey] = 'ด';
        else delete nextNight[dKey];
      } else if (editingCell.rowKey === 'standbyShifts') {
        if (newValue) nextStandby[dKey] = 'ด';
        else delete nextStandby[dKey];
      } else if (editingCell.rowKey === 'publicHolidayShifts') {
        if (newValue) nextPublicHoliday[dKey] = newValue as PublicHolidayShiftCode;
        else delete nextPublicHoliday[dKey];
      }

      await saveShiftEntry({
        monthId: month.monthId,
        staffId: editingCell.staffId,
        ownerUid: editingCell.ownerUid || '',
        mainShifts: nextMain,
        nightShifts: nextNight,
        workloadShifts: nextWorkload,
        standbyShifts: nextStandby,
        publicHolidayShifts: nextPublicHoliday,
        smcShifts: { ...(base.smcShifts || {}) },
      });
      setEditingCell(null);
    } finally {
      setSavingCell(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Screen-only Filter & Action Bar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'RN', 'PN', 'NA'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'ALL' ? 'ทั้งหมด' : CATEGORY_SHORT_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ค้นหาชื่อบุคลากร..."
              className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 w-52"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportRosterAndReimbursementExcel({
                month,
                settings,
                summaries: filteredSummaries,
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
                ? onPrintA4(`ตารางปฏิบัติงานประจำเดือน ${monthLabel}`)
                : window.print()
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            พิมพ์ตารางเวร (A4)
          </button>
        </div>
      </div>

      {/* Color Legend Strip (Screen Only) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            <strong className="text-slate-950">สีดำ</strong> = เวรทำการ (วันราชการ 08.00–16.00 น.)
          </span>
          <span>
            <strong className="text-red-600">สีแดง</strong> = เวร OT นอกเวลาราชการ (ช, บ, ด)
          </span>
          <span>
            <strong className="text-sky-600">สีฟ้า</strong> = เวรดึก Standby (ด)
          </span>
          <span>
            <strong className="text-fuchsia-600">สีชมพูบานเย็น</strong> = {specialRateLabel} (ช, บ, ด)
          </span>
          {onOpenWorkloadRoster && (
            <button
              type="button"
              onClick={onOpenWorkloadRoster}
              className="text-green-700 hover:text-green-800 font-semibold underline underline-offset-2 cursor-pointer"
            >
              ตารางเวร Workload →
            </button>
          )}
          {onOpenSmcRoster && (
            <button
              type="button"
              onClick={onOpenSmcRoster}
              className="text-purple-700 hover:text-purple-800 font-semibold underline underline-offset-2 cursor-pointer"
            >
              ตารางเวร SMC →
            </button>
          )}
        </div>
        <span className="text-slate-500">
          {month.status === 'open'
            ? 'คลิกเลขวันที่หัวตารางเพื่อสลับวันหยุด · คลิกที่ช่องใดก็ได้เพื่อแก้ไขเวรโดยตรง'
            : 'เดือนนี้ถูกล็อกแล้ว (ปลดล็อกได้ในเมนูตั้งค่าหากต้องการแก้ไข)'}
        </span>
      </div>

      {/* Official Department Roster Sheet */}
      <div className="print-full-width bg-white border border-slate-300 rounded-xl p-5 lg:p-6 overflow-hidden">
        {/* Official Header */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-start gap-3 mb-4">
          <div className="hidden sm:block" />
          <div className="text-center space-y-0.5">
            <h2 className="text-base lg:text-lg font-bold text-slate-950">
              ตารางปฏิบัติงานประจำเดือน {monthLabel}
            </h2>
            <p className="text-sm font-semibold text-slate-900">
              ชื่อหน่วยงาน {settings.departmentName}
            </p>
            <p className="text-xs text-slate-600">{settings.hospitalName}</p>
          </div>
          <div className="flex flex-col items-end text-right text-xs font-semibold text-slate-900 tabular-nums space-y-0.5">
            <div>วันทำการ {workingDaysTotal} วัน</div>
            <div>วันหยุด {month.holidays.length} วัน</div>
            <div className="pt-1 w-full max-w-[280px]">
              <input
                type="text"
                maxLength={120}
                value={headerNoteDraft}
                onChange={(e) => handleHeaderNoteChange(e.target.value)}
                onBlur={handleHeaderNoteBlur}
                placeholder="ใส่ข้อความ (ขนาด 16 pt)..."
                aria-label="ข้อความมุมขวาบนใต้จำนวนวันหยุด"
                className="w-full text-right text-[16pt] leading-tight font-bold text-slate-950 bg-slate-50/80 hover:bg-slate-100/80 focus:bg-white border border-dashed border-slate-300 focus:border-teal-600 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-600/30 placeholder:text-xs placeholder:font-normal placeholder:text-slate-400 print:border-transparent print:bg-transparent print:px-0 print:placeholder:text-transparent"
              />
            </div>
          </div>
        </div>

        {/* Roster Grid */}
        {filteredSummaries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg">
            ไม่พบรายชื่อบุคลากรตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-800 text-center text-[11px]">
              <thead>
                <tr className="bg-slate-50">
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-1.5 py-1 font-semibold text-slate-900 w-8"
                  >
                    ลำดับ
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-2 py-1 font-semibold text-slate-900 text-left min-w-[148px]"
                  >
                    ชื่อ - สกุล
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-2 py-1 font-semibold text-slate-900 min-w-[96px]"
                  >
                    ตำแหน่ง
                  </th>
                  <th
                    colSpan={daysInMonth}
                    className="border border-slate-700 py-0.5 font-semibold text-slate-900"
                  >
                    วันที่
                  </th>
                  <th
                    colSpan={4}
                    className="border border-slate-700 py-0.5 font-semibold text-slate-900"
                  >
                    หมายเหตุ
                  </th>
                </tr>
                <tr>
                  {daysArray.map((d) => {
                    const isHol = holidaySet.has(d);
                    return (
                      <th
                        key={d}
                        onClick={() => handleToggleHoliday(d)}
                        title={`คลิกเพื่อสลับวันที่ ${d} เป็นวันหยุด / วันทำการ`}
                        className={`border border-slate-700 px-0.5 py-1 font-mono font-bold tabular-nums min-w-[24px] cursor-pointer hover:opacity-85 ${
                          isHol ? 'bg-red-800 text-white' : 'bg-white text-slate-900'
                        }`}
                      >
                        {d}
                      </th>
                    );
                  })}
                  <th className="border border-slate-700 px-1 py-1 bg-slate-50 font-semibold w-8">
                    เช้า
                  </th>
                  <th className="border border-slate-700 px-1 py-1 bg-slate-50 font-semibold w-8">
                    บ/ด
                  </th>
                  <th className="border border-slate-700 px-1 py-1 bg-slate-50 font-semibold w-8">
                    OT
                  </th>
                  <th className="border border-slate-700 px-1 py-1 bg-slate-50 font-semibold w-8">
                    off
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaries.map((s, idx) => {
                  const editable = canEditStaffRow();
                  const isHighlighted = Boolean(highlightStaffId && s.staff.staffId === highlightStaffId);
                  const hasPublicHolidayRow = s.explicitPublicHolidayCount > 0;
                  return (
                    <React.Fragment key={s.staff.staffId}>
                      {/* Row 1: Main Shifts */}
                      <tr
                        ref={isHighlighted ? highlightedRowRef : undefined}
                        className={isHighlighted ? 'bg-teal-50/40 print:bg-white' : 'bg-white'}
                      >
                        <td className="border border-slate-600 px-1 py-1 font-mono tabular-nums font-semibold">
                          {idx + 1}
                        </td>
                        <td
                          className={`border border-slate-600 px-2 py-1 text-left font-semibold text-slate-950 whitespace-nowrap ${
                            isHighlighted ? 'bg-teal-50 print:bg-white' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>{s.staff.fullName}</span>
                            {onEditStaffShifts && (
                              <button
                                type="button"
                                onClick={() => onEditStaffShifts(s.staff.staffId)}
                                title="กลับไปแก้ไขเวรของบุคคลนี้"
                                className="no-print inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 hover:bg-teal-100 rounded transition-colors cursor-pointer"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                ลงเวร
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-600 px-1.5 py-1 font-medium text-slate-900 whitespace-nowrap">
                          {s.staff.positionLabel}
                        </td>
                        {daysArray.map((d) => {
                          const isHol = holidaySet.has(d);
                          const dowIdx = getDayOfWeek(month.yearAD, month.monthNumber, d);
                          const isWeekend = dowIdx === 0 || dowIdx === 6;
                          const val = s.entry?.mainShifts?.[String(d)];
                          return (
                            <td
                              key={d}
                              onClick={() =>
                                editable &&
                                setEditingCell({
                                  staffId: s.staff.staffId,
                                  staffName: s.staff.fullName,
                                  ownerUid: s.staff.ownerUid,
                                  rowKey: 'mainShifts',
                                  day: d,
                                  currentValue: val || '',
                                })
                              }
                              className={`border border-slate-500 px-0.5 py-1 ${
                                isHol ? 'bg-slate-100/70' : ''
                              } ${editable ? 'cursor-pointer hover:bg-teal-50' : ''}`}
                            >
                              <ShiftCellDisplay
                                rowKey="mainShifts"
                                value={val}
                                isHoliday={isHol}
                                isWeekend={isWeekend}
                                compact
                              />
                            </td>
                          );
                        })}
                        <td className="border border-slate-600 px-1 py-1 font-mono tabular-nums">
                          {s.workingDaysCount}
                        </td>
                        <td className="border border-slate-600 px-1 py-1 font-mono tabular-nums">
                          {s.afternoonNightRegularCount}
                        </td>
                        <td className="border border-slate-600 px-1 py-1 font-mono tabular-nums font-semibold text-red-700">
                          {s.mainRowOtCount}
                        </td>
                        <td className="border border-slate-600 px-1 py-1 font-mono tabular-nums">
                          {s.offCount}
                        </td>
                      </tr>

                      {/* Row 2: Night OT */}
                      <tr className="bg-white">
                        <td className="border border-slate-600 px-1 py-0.5" />
                        <td className="border border-slate-600 px-2 py-0.5 text-left text-[10px] text-slate-700 whitespace-nowrap">
                          {s.staff.positionSubLabel}
                        </td>
                        <td className="border border-slate-600 px-1.5 py-0.5 font-medium text-red-600 whitespace-nowrap">
                          เวรดึก
                        </td>
                        {daysArray.map((d) => {
                          const isHol = holidaySet.has(d);
                          const val = s.entry?.nightShifts?.[String(d)];
                          return (
                            <td
                              key={d}
                              onClick={() =>
                                editable &&
                                setEditingCell({
                                  staffId: s.staff.staffId,
                                  staffName: s.staff.fullName,
                                  ownerUid: s.staff.ownerUid,
                                  rowKey: 'nightShifts',
                                  day: d,
                                  currentValue: val || '',
                                })
                              }
                              className={`border border-slate-500 px-0.5 py-0.5 ${
                                isHol ? 'bg-slate-100/70' : ''
                              } ${editable ? 'cursor-pointer hover:bg-red-50' : ''}`}
                            >
                              <ShiftCellDisplay
                                rowKey="nightShifts"
                                value={val}
                                isHoliday={isHol}
                                compact
                              />
                            </td>
                          );
                        })}
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600 px-1 py-0.5 font-mono tabular-nums text-red-700">
                          {s.nightOtCount > 0 ? s.nightOtCount : ''}
                        </td>
                        <td className="border border-slate-600" />
                      </tr>

                      {/* Row 3: Standby Night (Workload shifts are separated into WorkloadRosterView) */}
                      <tr
                        className={`bg-white ${
                          hasPublicHolidayRow ? '' : 'border-b-2 border-slate-800'
                        }`}
                      >
                        <td className="border border-slate-600 px-1 py-0.5" />
                        <td className="border border-slate-600 px-2 py-0.5" />
                        <td className="border border-slate-600 px-1.5 py-0.5 font-medium text-sky-600 whitespace-nowrap">
                          เวรดึก Standby
                        </td>
                        {daysArray.map((d) => {
                          const isHol = holidaySet.has(d);
                          const val = s.entry?.standbyShifts?.[String(d)];
                          return (
                            <td
                              key={d}
                              onClick={() =>
                                editable &&
                                setEditingCell({
                                  staffId: s.staff.staffId,
                                  staffName: s.staff.fullName,
                                  ownerUid: s.staff.ownerUid,
                                  rowKey: 'standbyShifts',
                                  day: d,
                                  currentValue: val || '',
                                })
                              }
                              className={`border border-slate-500 px-0.5 py-0.5 ${
                                isHol ? 'bg-slate-100/70' : ''
                              } ${editable ? 'cursor-pointer hover:bg-sky-50' : ''}`}
                            >
                              <ShiftCellDisplay
                                rowKey="standbyShifts"
                                value={val}
                                isHoliday={isHol}
                                compact
                              />
                            </td>
                          );
                        })}
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600" />
                        <td className="border border-slate-600 px-1 py-0.5 font-mono tabular-nums text-sky-700">
                          {s.standbyCount > 0 ? s.standbyCount : ''}
                        </td>
                        <td className="border border-slate-600" />
                      </tr>

                      {/* Row 5 (Conditional): Public Holiday / Special Shifts — shown right after Standby only when data is entered */}
                      {hasPublicHolidayRow && (
                        <tr className="bg-white border-b-2 border-slate-800">
                          <td className="border border-slate-600 px-1 py-0.5" />
                          <td className="border border-slate-600 px-2 py-0.5" />
                          <td className="border border-slate-600 px-1.5 py-0.5 font-medium text-fuchsia-600 whitespace-nowrap">
                            {specialRateLabel}
                          </td>
                          {daysArray.map((d) => {
                            const isHol = holidaySet.has(d);
                            const val = s.entry?.publicHolidayShifts?.[String(d)];
                            return (
                              <td
                                key={d}
                                onClick={() =>
                                  editable &&
                                  setEditingCell({
                                    staffId: s.staff.staffId,
                                    staffName: s.staff.fullName,
                                    ownerUid: s.staff.ownerUid,
                                    rowKey: 'publicHolidayShifts',
                                    day: d,
                                    currentValue: val || '',
                                  })
                                }
                                className={`border border-slate-500 px-0.5 py-0.5 ${
                                  isHol ? 'bg-slate-100/70' : ''
                                } ${editable ? 'cursor-pointer hover:bg-fuchsia-50' : ''}`}
                              >
                                <ShiftCellDisplay
                                  rowKey="publicHolidayShifts"
                                  value={val}
                                  isHoliday={isHol}
                                  compact
                                />
                              </td>
                            );
                          })}
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600" />
                          <td className="border border-slate-600 px-1 py-0.5 font-mono tabular-nums font-semibold text-fuchsia-700">
                            {s.explicitPublicHolidayCount}
                          </td>
                          <td className="border border-slate-600" />
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Official Two-Column Signature Block */}
        <div className="print-avoid-break mt-8 grid grid-cols-2 gap-8 text-xs text-slate-900 px-4">
          <div className="text-center space-y-1">
            <div>ลงชื่อ...................................................ผู้จัดตารางปฏิบัติงาน</div>
            <div className="font-semibold">( {settings.schedulerName} )</div>
            <div>{settings.schedulerTitle}</div>
            <div>{settings.schedulerPosition}</div>
          </div>
          <div className="text-center space-y-1">
            <div>ลงชื่อ...................................................</div>
            <div className="font-semibold">( {settings.approverName} )</div>
            <div>{settings.approverTitle}</div>
            <div>{settings.approverPosition}</div>
          </div>
        </div>
      </div>

      {/* Inline Cell Edit Modal */}
      {editingCell && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{editingCell.staffName}</h3>
                <p className="text-xs text-slate-500">
                  วันที่ {editingCell.day} {monthLabel} ·{' '}
                  {editingCell.rowKey === 'mainShifts'
                    ? 'เวรทำการ / OT ช-บ'
                    : editingCell.rowKey === 'nightShifts'
                    ? 'เวรดึก OT (สีแดง)'
                    : editingCell.rowKey === 'standbyShifts'
                    ? 'เวรดึก Standby (สีฟ้า)'
                    : `${specialRateLabel} (สีชมพูบานเย็น)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {editingCell.rowKey === 'mainShifts' &&
                (['ช', 'ช/บ', 'บ', '0', 'vac', 'ป่วย', 'กิจ'] as MainShiftCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={savingCell}
                    onClick={() => handleApplyCellEdit(code)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      editingCell.currentValue === code
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {code}
                  </button>
                ))}

              {editingCell.rowKey === 'nightShifts' && (
                <button
                  type="button"
                  disabled={savingCell}
                  onClick={() => handleApplyCellEdit('ด')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    editingCell.currentValue === 'ด'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                  }`}
                >
                  ด (เวรดึก OT สีแดง)
                </button>
              )}

              {editingCell.rowKey === 'standbyShifts' && (
                <button
                  type="button"
                  disabled={savingCell}
                  onClick={() => handleApplyCellEdit('ด')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    editingCell.currentValue === 'ด'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-sky-600 border-sky-300 hover:bg-sky-50'
                  }`}
                >
                  ด (เวรดึก Standby สีฟ้า)
                </button>
              )}

              {editingCell.rowKey === 'publicHolidayShifts' &&
                (['ช', 'บ', 'ด', 'ช/บ', 'ช/ด', 'บ/ด', 'ช/บ/ด'] as PublicHolidayShiftCode[]).map(
                  (code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={savingCell}
                      onClick={() => handleApplyCellEdit(code)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                        editingCell.currentValue === code
                          ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                          : 'bg-white text-fuchsia-600 border-fuchsia-300 hover:bg-fuchsia-50'
                      }`}
                    >
                      {code}
                    </button>
                  ),
                )}

              <button
                type="button"
                disabled={savingCell}
                onClick={() => handleApplyCellEdit('')}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                ล้างช่องว่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
