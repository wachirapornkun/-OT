import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pencil, Printer, Search, X } from 'lucide-react';
import {
  CATEGORY_SHORT_LABELS,
  DepartmentSettings,
  PersonMonthlySummary,
  RosterMonth,
  SmcShiftCode,
  StaffCategory,
} from '../types/roster';
import { saveShiftEntry, updateRosterMonthAdmin } from '../services/rosterService';
import { exportRosterAndReimbursementExcel } from '../utils/excelExport';
import { getDaysInMonth, getThaiMonthYearLabel } from '../utils/thaiUtils';
import { ShiftCellDisplay } from './ShiftCellDisplay';

interface SmcRosterViewProps {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
  highlightStaffId?: string;
  onEditStaffShifts?: (staffId: string) => void;
  onPrintA4?: (title?: string) => void;
}

interface EditingSmcCellState {
  staffId: string;
  staffName: string;
  ownerUid: string;
  day: number;
  currentValue: string;
}

const SMC_CODE_OPTIONS: SmcShiftCode[] = ['SMC'];

export const SmcRosterView: React.FC<SmcRosterViewProps> = ({
  month,
  settings,
  summaries,
  highlightStaffId,
  onEditStaffShifts,
  onPrintA4,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [searchText, setSearchText] = useState('');
  const [onlyWithSmc, setOnlyWithSmc] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingSmcCellState | null>(null);
  const [savingCell, setSavingCell] = useState(false);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Editable 16pt note under "วันหยุด" at top-right of the SMC roster header (defaults to "SMC")
  const resolvedHeaderNote = month.smcHeaderNote?.trim() ? month.smcHeaderNote : 'SMC';
  const [headerNoteDraft, setHeaderNoteDraft] = useState<string>(resolvedHeaderNote);
  const headerNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNoteRef = useRef<string>(resolvedHeaderNote);
  const lastSavedNoteRef = useRef<string>(resolvedHeaderNote);
  const activeMonthIdRef = useRef<string>(month.monthId);

  useEffect(() => {
    const isMonthChanged = activeMonthIdRef.current !== month.monthId;
    const incomingNote = month.smcHeaderNote?.trim() ? month.smcHeaderNote : 'SMC';
    if (isMonthChanged) {
      if (headerNoteTimerRef.current) {
        clearTimeout(headerNoteTimerRef.current);
        headerNoteTimerRef.current = null;
        if (latestNoteRef.current !== lastSavedNoteRef.current) {
          void updateRosterMonthAdmin(activeMonthIdRef.current, {
            smcHeaderNote: latestNoteRef.current,
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
  }, [month.monthId, month.smcHeaderNote]);

  useEffect(() => {
    return () => {
      if (headerNoteTimerRef.current) {
        clearTimeout(headerNoteTimerRef.current);
        headerNoteTimerRef.current = null;
        if (latestNoteRef.current !== lastSavedNoteRef.current) {
          void updateRosterMonthAdmin(activeMonthIdRef.current, {
            smcHeaderNote: latestNoteRef.current,
          });
        }
      }
    };
  }, []);

  const persistHeaderNote = async (value: string) => {
    const trimmedVal = value.slice(0, 120);
    if (trimmedVal === lastSavedNoteRef.current) return;
    lastSavedNoteRef.current = trimmedVal;
    await updateRosterMonthAdmin(month.monthId, { smcHeaderNote: trimmedVal });
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

  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (categoryFilter !== 'ALL' && s.staff.category !== categoryFilter) return false;
      if (onlyWithSmc && s.smcCount === 0) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          s.staff.fullName.toLowerCase().includes(q) ||
          s.staff.positionLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summaries, categoryFilter, onlyWithSmc, searchText]);

  const totalSmcShifts = useMemo(() => {
    return filteredSummaries.reduce((acc, s) => acc + s.smcCount, 0);
  }, [filteredSummaries]);

  const editable = month.status === 'open';

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
        smcShifts: {},
        visibility: 'department' as const,
      };

      const nextSmc = { ...(base.smcShifts || {}) };
      const dKey = String(editingCell.day);

      if (newValue) {
        nextSmc[dKey] = newValue as SmcShiftCode;
      } else {
        delete nextSmc[dKey];
      }

      await saveShiftEntry({
        monthId: month.monthId,
        staffId: editingCell.staffId,
        ownerUid: editingCell.ownerUid || '',
        mainShifts: { ...base.mainShifts },
        nightShifts: { ...base.nightShifts },
        workloadShifts: { ...base.workloadShifts },
        standbyShifts: { ...base.standbyShifts },
        publicHolidayShifts: { ...(base.publicHolidayShifts || {}) },
        smcShifts: nextSmc,
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
              className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-52"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithSmc}
              onChange={(e) => setOnlyWithSmc(e.target.checked)}
              className="rounded border-slate-300 text-purple-700 focus:ring-purple-500"
            />
            <span>แสดงเฉพาะผู้มีเวร SMC</span>
          </label>
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
                ? onPrintA4(`ตารางปฏิบัติงานเวร SMC ประจำเดือน ${monthLabel}`)
                : window.print()
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            พิมพ์ตาราง SMC (A4)
          </button>
        </div>
      </div>

      {/* Color Legend Strip (Screen Only) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            <strong className="text-purple-700">สีม่วง (SMC)</strong> = เวร SMC
            (แยกตารางต่างหากจากตาราง OT และตาราง Workload)
          </span>
        </div>
        <span className="text-slate-500">
          {editable
            ? 'คลิกเลขวันที่หัวตารางเพื่อสลับวันหยุด · คลิกที่ช่องใดก็ได้เพื่อแก้ไขเวร SMC โดยตรง'
            : 'เดือนนี้ถูกล็อกแล้ว (ปลดล็อกได้ในเมนูตั้งค่าหากต้องการแก้ไข)'}
        </span>
      </div>

      {/* Official SMC Roster Sheet */}
      <div className="print-full-width thai-sarabun-doc bg-white border border-slate-300 rounded-xl p-5 lg:p-6 overflow-hidden">
        {/* Official Header */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-start gap-3 mb-4">
          <div className="hidden sm:block" />
          <div className="text-center space-y-0.5">
            <h2 className="doc-title text-base lg:text-lg leading-snug font-bold text-slate-950">
              ตารางปฏิบัติงานเวร SMC ประจำเดือน {monthLabel}
            </h2>
            <p className="doc-subtitle text-sm font-semibold text-slate-900">
              ชื่อหน่วยงาน {settings.departmentName}
            </p>
            <p className="doc-subtitle text-xs text-slate-600">{settings.hospitalName}</p>
          </div>
          <div className="doc-meta flex flex-col items-end text-right text-xs font-semibold text-slate-900 tabular-nums space-y-0.5">
            <div>วันทำการ {workingDaysTotal} วัน</div>
            <div>วันหยุด {month.holidays.length} วัน</div>
            <div className="pt-1 w-full max-w-[260px]">
              <input
                type="text"
                maxLength={120}
                value={headerNoteDraft}
                onChange={(e) => handleHeaderNoteChange(e.target.value)}
                onBlur={handleHeaderNoteBlur}
                placeholder="ใส่ข้อความ (ขนาด 16 pt)..."
                aria-label="ข้อความมุมขวาบนใต้จำนวนวันหยุด"
                className="doc-corner-note w-full text-right text-base leading-tight font-bold text-slate-950 bg-slate-50/80 hover:bg-slate-100/80 focus:bg-white border border-dashed border-slate-300 focus:border-purple-500 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500/30 placeholder:text-xs placeholder:font-normal placeholder:text-slate-400 print:border-transparent print:bg-transparent print:px-0 print:placeholder:text-transparent"
              />
            </div>
          </div>
        </div>

        {/* SMC Roster Grid */}
        {filteredSummaries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg">
            ไม่พบรายชื่อบุคลากรตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="doc-table w-full border-collapse border border-slate-800 text-center text-[12px] leading-tight">
              <thead>
                <tr className="bg-slate-50">
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-1.5 py-1 font-semibold text-slate-900 w-9"
                  >
                    ลำดับ
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-2 py-1 font-semibold text-slate-900 text-left min-w-[155px]"
                  >
                    ชื่อ - สกุล
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 px-2 py-1 font-semibold text-slate-900 min-w-[100px]"
                  >
                    ตำแหน่ง
                  </th>
                  <th
                    colSpan={daysInMonth}
                    className="border border-slate-700 py-0.5 font-semibold text-slate-900"
                  >
                    วันที่ (เวร SMC)
                  </th>
                  <th className="border border-slate-700 py-0.5 font-semibold text-slate-900">
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
                        className={`border border-slate-700 px-0.5 py-1 font-bold tabular-nums min-w-[28px] cursor-pointer hover:opacity-85 ${
                          isHol ? 'bg-red-800 text-white' : 'bg-white text-slate-900'
                        }`}
                      >
                        {d}
                      </th>
                    );
                  })}
                  <th className="border border-slate-700 px-1.5 py-1 bg-slate-50 font-semibold text-purple-800 whitespace-nowrap">
                    รวม
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaries.map((s, idx) => {
                  const isHighlighted = Boolean(
                    highlightStaffId && s.staff.staffId === highlightStaffId,
                  );
                  return (
                    <tr
                      key={s.staff.staffId}
                      ref={isHighlighted ? highlightedRowRef : undefined}
                      className={
                        isHighlighted
                          ? 'bg-purple-50/50 print:bg-white'
                          : 'bg-white hover:bg-slate-50/40'
                      }
                    >
                      <td className="border border-slate-600 px-1 py-1.5 tabular-nums font-semibold">
                        {idx + 1}
                      </td>
                      <td
                        className={`border border-slate-600 px-2 py-1.5 text-left whitespace-nowrap ${
                          isHighlighted ? 'bg-purple-50 print:bg-white' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div>
                            <div className="font-semibold text-slate-950 leading-tight">
                              {s.staff.fullName}
                            </div>
                            {s.staff.positionSubLabel && (
                              <div className="text-[11px] text-slate-600 leading-tight mt-0.5">
                                {s.staff.positionSubLabel}
                              </div>
                            )}
                          </div>
                          {onEditStaffShifts && (
                            <button
                              type="button"
                              onClick={() => onEditStaffShifts(s.staff.staffId)}
                              title="กลับไปแก้ไขเวรของบุคคลนี้"
                              className="no-print inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-100 rounded transition-colors cursor-pointer shrink-0"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              ลงเวร
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="border border-slate-600 px-1.5 py-1.5 font-medium text-slate-900 whitespace-nowrap">
                        <div>{s.staff.positionLabel}</div>
                        <div className="text-[11px] font-semibold text-purple-700">SMC</div>
                      </td>
                      {daysArray.map((d) => {
                        const isHol = holidaySet.has(d);
                        const val = s.entry?.smcShifts?.[String(d)];
                        return (
                          <td
                            key={d}
                            onClick={() =>
                              editable &&
                              setEditingCell({
                                staffId: s.staff.staffId,
                                staffName: s.staff.fullName,
                                ownerUid: s.staff.ownerUid,
                                day: d,
                                currentValue: val || '',
                              })
                            }
                            className={`border border-slate-500 px-0.5 py-1.5 ${
                              isHol ? 'bg-slate-100/70' : ''
                            } ${editable ? 'cursor-pointer hover:bg-purple-50' : ''}`}
                          >
                            <ShiftCellDisplay
                              rowKey="smcShifts"
                              value={val}
                              isHoliday={isHol}
                              docMode
                            />
                          </td>
                        );
                      })}
                      <td className="border border-slate-600 px-1.5 py-1.5 tabular-nums font-bold text-purple-800 bg-purple-50/40 print:bg-white">
                        {s.smcCount > 0 ? s.smcCount : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-950 border-t-2 border-slate-800">
                  <td colSpan={3 + daysInMonth} className="border border-slate-700 px-3 py-1.5 text-right">
                    รวมจำนวนเวร SMC ทั้งสิ้น ({filteredSummaries.length} คน)
                  </td>
                  <td className="border border-slate-700 px-1.5 py-1.5 tabular-nums text-purple-800">
                    {totalSmcShifts}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Official Two-Column Signature Block */}
        <div className="doc-signature print-avoid-break mt-8 grid grid-cols-2 gap-8 text-[13px] text-slate-900 px-4">
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

      {/* Inline SMC Cell Edit Modal */}
      {editingCell && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{editingCell.staffName}</h3>
                <p className="text-xs text-slate-500">
                  วันที่ {editingCell.day} {monthLabel} · เวร SMC (สีม่วง)
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
              {SMC_CODE_OPTIONS.map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={savingCell}
                  onClick={() => handleApplyCellEdit(code)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    editingCell.currentValue === code
                      ? 'bg-purple-700 text-white border-purple-700'
                      : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'
                  }`}
                >
                  {code}
                </button>
              ))}

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
