import React, { useEffect, useState } from 'react';
import { Check, Lock, Pencil, Save, Unlock } from 'lucide-react';
import {
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  RosterMonth,
} from '../types/roster';
import {
  saveDepartmentSettings,
  updateRosterMonthAdmin,
} from '../services/rosterService';
import {
  getDayOfWeek,
  getDaysInMonth,
  getThaiMonthYearLabel,
  THAI_WEEKDAYS_SHORT,
} from '../utils/thaiUtils';
import { getEffectivePublicHolidays } from '../utils/rosterCalculations';

interface DepartmentSettingsViewProps {
  settings: DepartmentSettings;
  month: RosterMonth;
}

export const DepartmentSettingsView: React.FC<DepartmentSettingsViewProps> = ({
  settings,
  month,
}) => {
  const [draft, setDraft] = useState<DepartmentSettings>(settings);
  const [payDateLabel, setPayDateLabel] = useState(month.payDateLabel);
  const [holidays, setHolidays] = useState<number[]>(month.holidays);
  const [publicHolidays, setPublicHolidays] = useState<number[]>(() =>
    getEffectivePublicHolidays(month),
  );
  const [holidayEditMode, setHolidayEditMode] = useState<'holiday' | 'publicHoliday'>('holiday');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingMonth, setSavingMonth] = useState(false);
  const [savedFlag, setSavedFlag] = useState<'settings' | 'month' | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    setPayDateLabel(month.payDateLabel);
    setHolidays(month.holidays);
    setPublicHolidays(getEffectivePublicHolidays(month));
  }, [month]);

  const daysInMonth = getDaysInMonth(month.yearAD, month.monthNumber);
  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);
  const specialRateLabel =
    draft.publicHolidayRateLabel?.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;

  const handleDayClick = (day: number) => {
    if (holidayEditMode === 'publicHoliday') {
      const isCurrentlyPub = publicHolidays.includes(day);
      if (isCurrentlyPub) {
        setPublicHolidays((prev) => prev.filter((d) => d !== day));
      } else {
        setPublicHolidays((prev) => [...prev, day].sort((a, b) => a - b));
        // วันหยุดนักขัตฤกษ์ถือเป็นวันหยุดราชการด้วยเสมอ
        setHolidays((prev) =>
          prev.includes(day) ? prev : [...prev, day].sort((a, b) => a - b),
        );
      }
      return;
    }

    const isCurrentlyHol = holidays.includes(day);
    if (isCurrentlyHol) {
      setHolidays((prev) => prev.filter((d) => d !== day));
      setPublicHolidays((prev) => prev.filter((d) => d !== day));
    } else {
      setHolidays((prev) => [...prev, day].sort((a, b) => a - b));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveDepartmentSettings(draft);
      setSavedFlag('settings');
      setTimeout(() => setSavedFlag(null), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveMonth = async () => {
    setSavingMonth(true);
    try {
      await updateRosterMonthAdmin(month.monthId, {
        holidays,
        publicHolidays,
        payDateLabel,
      });
      setSavedFlag('month');
      setTimeout(() => setSavedFlag(null), 3000);
    } finally {
      setSavingMonth(false);
    }
  };

  const handleToggleLock = async () => {
    setSavingMonth(true);
    try {
      await updateRosterMonthAdmin(month.monthId, {
        status: month.status === 'locked' ? 'open' : 'locked',
      });
    } finally {
      setSavingMonth(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Section 1: Current Month Holidays & Lock Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              ตั้งค่าวันหยุดราชการและสถานะตาราง — เดือน {monthLabel}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              วันทำการ {daysInMonth - holidays.length} วัน · วันหยุดทั้งหมด {holidays.length} วัน · {specialRateLabel} {publicHolidays.length} วัน
            </p>
          </div>
          <button
            type="button"
            disabled={savingMonth}
            onClick={handleToggleLock}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              month.status === 'locked'
                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {month.status === 'locked' ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                ปลดล็อกให้บุคลากรลงเวรได้
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                ล็อกตารางเดือนนี้เพื่อส่งเบิก
              </>
            )}
          </button>
        </div>

        {/* Mode Switcher: Regular Holiday vs Public Holiday */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setHolidayEditMode('holiday')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                holidayEditMode === 'holiday'
                  ? 'bg-red-800 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              คลิกกำหนดวันหยุดเสาร์-อาทิตย์ / ราชการ (สีแดง)
            </button>
            <button
              type="button"
              onClick={() => setHolidayEditMode('publicHoliday')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                holidayEditMode === 'publicHoliday'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              คลิกกำหนดวันที่ใช้: {specialRateLabel} (สีส้ม)
            </button>
          </div>
          <div className="text-[11px] text-slate-500">
            วันที่เลือกสีส้มจะใช้อัตรา &quot;{specialRateLabel}&quot; ที่กำหนดในตารางด้านล่าง
          </div>
        </div>

        <div className="grid grid-cols-7 sm:grid-cols-11 gap-1.5">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const isPub = publicHolidays.includes(day);
            const isHol = holidays.includes(day) || isPub;
            const dow = THAI_WEEKDAYS_SHORT[getDayOfWeek(month.yearAD, month.monthNumber, day)];
            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                className={`py-2 px-1 rounded-lg border text-center transition-colors cursor-pointer ${
                  isPub
                    ? 'bg-amber-600 text-white border-amber-700'
                    : isHol
                    ? 'bg-red-800 text-white border-red-900'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-mono font-bold tabular-nums">{day}</div>
                <div
                  className={`text-[10px] ${
                    isPub ? 'text-amber-100' : isHol ? 'text-red-100' : 'text-slate-400'
                  }`}
                >
                  {isPub ? `${dow} · นข.` : dow}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2 border-t border-slate-100">
          <div className="w-full sm:w-64">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ข้อความคอลัมน์ &quot;วัน เดือน ปี ผู้รับเงิน&quot;
            </label>
            <input
              type="text"
              value={payDateLabel}
              onChange={(e) => setPayDateLabel(e.target.value)}
              placeholder="เช่น พ.ย.-69"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="button"
            disabled={savingMonth}
            onClick={handleSaveMonth}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {savedFlag === 'month' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savingMonth
              ? 'กำลังบันทึก...'
              : savedFlag === 'month'
              ? 'บันทึกวันหยุดแล้ว'
              : 'บันทึกวันหยุดและเดือนผู้รับเงิน'}
          </button>
        </div>
      </div>

      {/* Section 2: Rates & Official Form Metadata */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-base font-bold text-slate-900">
            อัตราเงินตอบแทน (บาท/เวร) และข้อมูลหัวเอกสารราชการ
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ใช้คำนวณยอดเงินตอบแทนในตารางเบิกจ่ายและแสดงชื่อหน่วยงาน/ผู้ลงนามในเอกสารพิมพ์
          </p>
        </div>

        {/* Rate Matrix */}
        <div className="overflow-x-auto space-y-2">
          <table className="w-full text-sm border-collapse border border-slate-200 rounded-lg">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                <th className="px-4 py-2.5 text-left">กลุ่มตำแหน่ง</th>
                <th className="px-4 py-2.5 text-right text-red-700">เวร OT ปกติ (ช/บ/ด)</th>
                <th className="px-3 py-2 text-right text-amber-800 bg-amber-50/50">
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="relative inline-flex items-center">
                      <Pencil className="w-3 h-3 text-amber-600 absolute left-2 pointer-events-none" />
                      <input
                        type="text"
                        maxLength={100}
                        value={draft.publicHolidayRateLabel}
                        onChange={(e) =>
                          setDraft({ ...draft, publicHolidayRateLabel: e.target.value })
                        }
                        placeholder={DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel}
                        aria-label="แก้ไขชื่อหัวข้ออัตราค่าเวรวันหยุดนักขัตฤกษ์หรืออื่นๆ"
                        title="คลิกเพื่อแก้ไขข้อความหัวข้อนี้"
                        className="w-48 pl-6 pr-2 py-1 text-right text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-amber-400"
                      />
                    </div>
                    <span className="text-[10px] font-normal text-amber-700">
                      (ช/บ/ด · คลิกแก้ไขข้อความได้)
                    </span>
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right text-sky-700">เวรดึก Standby (ด)</th>
                <th className="px-4 py-2.5 text-right text-green-700">เวร Workload (ช*/บ*/ด*)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-3 font-medium text-slate-900">พยาบาลวิชาชีพ (RN)</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.rnOtRate}
                    onChange={(e) => setDraft({ ...draft, rnOtRate: Number(e.target.value) })}
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.rnPublicHolidayOtRate}
                    onChange={(e) =>
                      setDraft({ ...draft, rnPublicHolidayOtRate: Number(e.target.value) })
                    }
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-amber-300 bg-amber-50/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.rnStandbyRate}
                    onChange={(e) =>
                      setDraft({ ...draft, rnStandbyRate: Number(e.target.value) })
                    }
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  ไม่คิดเงิน (เบิกแยกตาราง)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-slate-900">ผู้ช่วยพยาบาล (PN)</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.pnOtRate}
                    onChange={(e) => setDraft({ ...draft, pnOtRate: Number(e.target.value) })}
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.pnPublicHolidayOtRate}
                    onChange={(e) =>
                      setDraft({ ...draft, pnPublicHolidayOtRate: Number(e.target.value) })
                    }
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-amber-300 bg-amber-50/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.pnStandbyRate}
                    onChange={(e) =>
                      setDraft({ ...draft, pnStandbyRate: Number(e.target.value) })
                    }
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  ไม่คิดเงิน (เบิกแยกตาราง)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-slate-900">พนักงานช่วยเหลือคนไข้ (NA)</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.naOtRate}
                    onChange={(e) => setDraft({ ...draft, naOtRate: Number(e.target.value) })}
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.naPublicHolidayOtRate}
                    onChange={(e) =>
                      setDraft({ ...draft, naPublicHolidayOtRate: Number(e.target.value) })
                    }
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-amber-300 bg-amber-50/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={draft.naStandbyRate}
                    onChange={(e) =>
                      setDraft({ ...draft, naStandbyRate: Number(e.target.value) })
                    }
                    className="w-28 px-2.5 py-1.5 text-right font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  ไม่คิดเงิน (เบิกแยกตาราง)
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-500">
            หมายเหตุ: ช่อง <strong className="text-amber-700">{specialRateLabel} (บาท/เวร)</strong> สามารถแก้ไขข้อความหัวข้อได้ตามต้องการ ใช้คำนวณเวร OT (ช/บ/ด) ที่ตรงกับวันที่เลือกสีส้มด้านบน และแยกแถวแสดงในตารางเบิกเงินให้อัตโนมัติเมื่ออัตราต่างจาก OT ปกติ
          </p>
        </div>

        {/* Hospital & Signatory Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ชื่อส่วนราชการ / โรงพยาบาล
            </label>
            <input
              type="text"
              required
              value={draft.hospitalName}
              onChange={(e) => setDraft({ ...draft, hospitalName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ชื่อหน่วยงาน / กลุ่มงาน
            </label>
            <input
              type="text"
              required
              value={draft.departmentName}
              onChange={(e) => setDraft({ ...draft, departmentName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
            />
          </div>

          <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-xs font-semibold text-slate-800">
              ผู้จัดตารางปฏิบัติงาน / หัวหน้ากลุ่มงาน
            </div>
            <input
              type="text"
              value={draft.schedulerName}
              onChange={(e) => setDraft({ ...draft, schedulerName: e.target.value })}
              placeholder="ชื่อ-สกุล"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
            <input
              type="text"
              value={draft.schedulerTitle}
              onChange={(e) => setDraft({ ...draft, schedulerTitle: e.target.value })}
              placeholder="ตำแหน่งสายงาน"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
            <input
              type="text"
              value={draft.schedulerPosition}
              onChange={(e) => setDraft({ ...draft, schedulerPosition: e.target.value })}
              placeholder="ตำแหน่งบริหาร"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
          </div>

          <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-xs font-semibold text-slate-800">
              หัวหน้าภารกิจ / ผู้รับรอง
            </div>
            <input
              type="text"
              value={draft.approverName}
              onChange={(e) => setDraft({ ...draft, approverName: e.target.value })}
              placeholder="ชื่อ-สกุล"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
            <input
              type="text"
              value={draft.approverTitle}
              onChange={(e) => setDraft({ ...draft, approverTitle: e.target.value })}
              placeholder="ตำแหน่งสายงาน"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
            <input
              type="text"
              value={draft.approverPosition}
              onChange={(e) => setDraft({ ...draft, approverPosition: e.target.value })}
              placeholder="ตำแหน่งบริหาร"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
          >
            {savedFlag === 'settings' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {savingSettings
              ? 'กำลังบันทึก...'
              : savedFlag === 'settings'
              ? 'บันทึกการตั้งค่าแล้ว'
              : 'บันทึกการตั้งค่าหน่วยงาน'}
          </button>
        </div>
      </form>
    </div>
  );
};
