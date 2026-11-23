import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, Pencil } from 'lucide-react';
import {
  DEFAULT_DEPARTMENT_SETTINGS,
  MainShiftCode,
  NightShiftCode,
  PersonMonthlySummary,
  PublicHolidayShiftCode,
  SmcShiftCode,
  StandbyShiftCode,
  WorkloadShiftCode,
} from '../types/roster';
import { formatDayList } from '../utils/rosterCalculations';
import { parseDayListInput } from '../utils/thaiUtils';

interface QuickDateEntryCardProps {
  staffName: string;
  monthLabel: string;
  daysInMonth: number;
  holidays: number[];
  currentMainShifts: Record<string, MainShiftCode>;
  liveSummary: PersonMonthlySummary | null;
  publicHolidayLabel: string;
  onChangePublicHolidayLabel: (label: string) => void;
  saving: boolean;
  onApplyToGrid: (
    next: {
      mainShifts: Record<string, MainShiftCode>;
      nightShifts: Record<string, NightShiftCode>;
      workloadShifts: Record<string, WorkloadShiftCode>;
      standbyShifts: Record<string, StandbyShiftCode>;
      publicHolidayShifts: Record<string, PublicHolidayShiftCode>;
      smcShifts: Record<string, SmcShiftCode>;
    },
    andSave: boolean,
  ) => Promise<void> | void;
  onOpenDepartmentRoster?: () => void;
}

export const QuickDateEntryCard: React.FC<QuickDateEntryCardProps> = ({
  staffName,
  monthLabel,
  daysInMonth,
  holidays,
  currentMainShifts,
  liveSummary,
  publicHolidayLabel,
  onChangePublicHolidayLabel,
  saving,
  onApplyToGrid,
  onOpenDepartmentRoster,
}) => {
  // 1. OT ช / บ / ด สีแดง
  const [otMorningInput, setOtMorningInput] = useState('');
  const [otAfternoonInput, setOtAfternoonInput] = useState('');
  const [otNightInput, setOtNightInput] = useState('');
  // 2. Workload * สีเขียว (ช*, บ*, ด*)
  const [wlMorningInput, setWlMorningInput] = useState('');
  const [wlAfternoonInput, setWlAfternoonInput] = useState('');
  const [wlNightInput, setWlNightInput] = useState('');
  // 3. Standby ด สีฟ้า/น้ำเงิน
  const [standbyInput, setStandbyInput] = useState('');
  // 4. เวรนักขัตฤกษ์ (แก้ไขชื่อได้) ช / บ / ด สีชมพูบานเย็น
  const [pubMorningInput, setPubMorningInput] = useState('');
  const [pubAfternoonInput, setPubAfternoonInput] = useState('');
  const [pubNightInput, setPubNightInput] = useState('');
  // 5. เวร SMC สีม่วง (แยกตาราง SMC)
  const [smcInput, setSmcInput] = useState('');

  // Local editable label for Box 4 synced with settings.publicHolidayRateLabel
  const [labelDraft, setLabelDraft] = useState(
    publicHolidayLabel || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel,
  );
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedLabelRef = useRef<string>(publicHolidayLabel);

  useEffect(() => {
    if (!labelTimerRef.current) {
      setLabelDraft(publicHolidayLabel || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel);
      lastSavedLabelRef.current = publicHolidayLabel;
    }
  }, [publicHolidayLabel]);

  useEffect(() => {
    return () => {
      if (labelTimerRef.current) {
        clearTimeout(labelTimerRef.current);
      }
    };
  }, []);

  const handleLabelChange = (val: string) => {
    const bounded = val.slice(0, 100);
    setLabelDraft(bounded);
    if (labelTimerRef.current) {
      clearTimeout(labelTimerRef.current);
    }
    labelTimerRef.current = setTimeout(() => {
      labelTimerRef.current = null;
      const trimmed = bounded.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;
      if (trimmed !== lastSavedLabelRef.current) {
        lastSavedLabelRef.current = trimmed;
        onChangePublicHolidayLabel(trimmed);
      }
    }, 500);
  };

  const handleLabelBlur = () => {
    if (labelTimerRef.current) {
      clearTimeout(labelTimerRef.current);
      labelTimerRef.current = null;
    }
    const trimmed = labelDraft.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;
    setLabelDraft(trimmed);
    if (trimmed !== lastSavedLabelRef.current) {
      lastSavedLabelRef.current = trimmed;
      onChangePublicHolidayLabel(trimmed);
    }
  };

  const [autoFillWorking, setAutoFillWorking] = useState(true);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  const syncKey = liveSummary
    ? [
        liveSummary.staff.staffId,
        monthLabel,
        formatDayList(liveSummary.otMorningDays),
        formatDayList(liveSummary.otAfternoonDays),
        formatDayList(liveSummary.otNightDays),
        formatDayList(liveSummary.workloadMorningDays),
        formatDayList(liveSummary.workloadAfternoonDays),
        formatDayList(liveSummary.workloadNightDays),
        formatDayList(liveSummary.standbyDays),
        formatDayList(liveSummary.explicitPublicHolidayMorningDays),
        formatDayList(liveSummary.explicitPublicHolidayAfternoonDays),
        formatDayList(liveSummary.explicitPublicHolidayNightDays),
        formatDayList(liveSummary.smcDays),
      ].join('|')
    : '';

  useEffect(() => {
    if (!liveSummary) return;
    setOtMorningInput(formatDayList(liveSummary.otMorningDays));
    setOtAfternoonInput(formatDayList(liveSummary.otAfternoonDays));
    setOtNightInput(formatDayList(liveSummary.otNightDays));
    setWlMorningInput(formatDayList(liveSummary.workloadMorningDays));
    setWlAfternoonInput(formatDayList(liveSummary.workloadAfternoonDays));
    setWlNightInput(formatDayList(liveSummary.workloadNightDays));
    setStandbyInput(formatDayList(liveSummary.standbyDays));
    setPubMorningInput(formatDayList(liveSummary.explicitPublicHolidayMorningDays));
    setPubAfternoonInput(formatDayList(liveSummary.explicitPublicHolidayAfternoonDays));
    setPubNightInput(formatDayList(liveSummary.explicitPublicHolidayNightDays));
    setSmcInput(formatDayList(liveSummary.smcDays));
    setWarningMsg(null);
  }, [syncKey]);

  const buildNextShifts = () => {
    const pOtMorning = parseDayListInput(otMorningInput, daysInMonth);
    const pOtAfternoon = parseDayListInput(otAfternoonInput, daysInMonth);
    const pOtNight = parseDayListInput(otNightInput, daysInMonth);
    const pWlMorning = parseDayListInput(wlMorningInput, daysInMonth);
    const pWlAfternoon = parseDayListInput(wlAfternoonInput, daysInMonth);
    const pWlNight = parseDayListInput(wlNightInput, daysInMonth);
    const pStandby = parseDayListInput(standbyInput, daysInMonth);
    const pPubMorning = parseDayListInput(pubMorningInput, daysInMonth);
    const pPubAfternoon = parseDayListInput(pubAfternoonInput, daysInMonth);
    const pPubNight = parseDayListInput(pubNightInput, daysInMonth);
    const pSmc = parseDayListInput(smcInput, daysInMonth);

    const allInvalid = [
      ...pOtMorning.invalidTokens,
      ...pOtAfternoon.invalidTokens,
      ...pOtNight.invalidTokens,
      ...pWlMorning.invalidTokens,
      ...pWlAfternoon.invalidTokens,
      ...pWlNight.invalidTokens,
      ...pStandby.invalidTokens,
      ...pPubMorning.invalidTokens,
      ...pPubAfternoon.invalidTokens,
      ...pPubNight.invalidTokens,
      ...pSmc.invalidTokens,
    ];

    const holidaySet = new Set(holidays);
    const otMSet = new Set(pOtMorning.days);
    const otASet = new Set(pOtAfternoon.days);
    const otNSet = new Set(pOtNight.days);
    const wlMSet = new Set(pWlMorning.days);
    const wlASet = new Set(pWlAfternoon.days);
    const wlNSet = new Set(pWlNight.days);
    const sbSet = new Set(pStandby.days);
    const pubMSet = new Set(pPubMorning.days);
    const pubASet = new Set(pPubAfternoon.days);
    const pubNSet = new Set(pPubNight.days);
    const smcSet = new Set(pSmc.days);

    const nonHolidayOtMorning = pOtMorning.days.filter((d) => !holidaySet.has(d));

    const warnings: string[] = [];
    if (allInvalid.length > 0) {
      warnings.push(
        `ข้ามค่าวันที่ไม่ถูกต้อง (ต้องอยู่ระหว่าง 1–${daysInMonth}): ${allInvalid.join(', ')}`,
      );
    }
    if (nonHolidayOtMorning.length > 0) {
      warnings.push(
        `วันที่ ${nonHolidayOtMorning.join(', ')} เป็นวันราชการปกติ เวร ช จะแสดงเป็นเวรทำการสีดำ (หากต้องการเป็น OT ช สีแดง ให้ตั้งวันนั้นเป็นวันหยุดในหน้าตั้งค่า)`,
      );
    }
    setWarningMsg(warnings.length > 0 ? warnings.join(' · ') : null);

    const nextMain: Record<string, MainShiftCode> = {};
    const nextNight: Record<string, NightShiftCode> = {};
    const nextWorkload: Record<string, WorkloadShiftCode> = {};
    const nextStandby: Record<string, StandbyShiftCode> = {};
    const nextPublicHoliday: Record<string, PublicHolidayShiftCode> = {};
    const nextSmc: Record<string, SmcShiftCode> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const k = String(d);
      const isHol = holidaySet.has(d);
      const prevMain = currentMainShifts[k];
      const isExistingLeave =
        prevMain === 'ป่วย' || prevMain === 'กิจ' || prevMain === 'vac';

      // Row 1: เวรทำการ (สีดำ) + เวร OT ช/บ (สีแดง)
      if (!isHol) {
        if (isExistingLeave && !otASet.has(d) && !otMSet.has(d)) {
          nextMain[k] = prevMain;
        } else if (otASet.has(d)) {
          if (autoFillWorking || prevMain === 'ช' || prevMain === 'ช/บ' || otMSet.has(d)) {
            nextMain[k] = 'ช/บ';
          } else {
            nextMain[k] = 'บ';
          }
        } else if (autoFillWorking || otMSet.has(d) || prevMain === 'ช' || prevMain === 'ช/บ') {
          nextMain[k] = 'ช';
        } else if (prevMain === '0') {
          nextMain[k] = '0';
        }
      } else {
        if (otMSet.has(d) && otASet.has(d)) {
          nextMain[k] = 'ช/บ';
        } else if (otMSet.has(d)) {
          nextMain[k] = 'ช';
        } else if (otASet.has(d)) {
          nextMain[k] = 'บ';
        } else if (autoFillWorking && !otNSet.has(d)) {
          nextMain[k] = '0';
        } else if (prevMain === '0') {
          nextMain[k] = '0';
        }
      }

      // Row 2: เวรดึก OT (ด สีแดง)
      if (otNSet.has(d)) {
        nextNight[k] = 'ด';
      }

      // Row 3: เวร Workload * สีเขียว (รองรับ ช*, บ*, ด* และเวรควบในวันเดียวกัน)
      const wlParts: string[] = [];
      if (wlMSet.has(d)) wlParts.push('ช*');
      if (wlASet.has(d)) wlParts.push('บ*');
      if (wlNSet.has(d)) wlParts.push('ด*');
      if (wlParts.length > 0) {
        nextWorkload[k] = wlParts.join('/') as WorkloadShiftCode;
      }

      // Row 4: เวรดึก Standby (ด สีฟ้า/น้ำเงิน)
      if (sbSet.has(d)) {
        nextStandby[k] = 'ด';
      }

      // Row 5: เวรนักขัตฤกษ์ (ช, บ, ด สีชมพูบานเย็น — ต่อจาก Standby)
      const pubParts: string[] = [];
      if (pubMSet.has(d)) pubParts.push('ช');
      if (pubASet.has(d)) pubParts.push('บ');
      if (pubNSet.has(d)) pubParts.push('ด');
      if (pubParts.length > 0) {
        nextPublicHoliday[k] = pubParts.join('/') as PublicHolidayShiftCode;
      }

      // Row 6: เวร SMC (สีม่วง — แยกตาราง SMC)
      if (smcSet.has(d)) {
        nextSmc[k] = 'SMC';
      }
    }

    const wlTotal =
      pWlMorning.days.length + pWlAfternoon.days.length + pWlNight.days.length;
    const pubTotal =
      pPubMorning.days.length + pPubAfternoon.days.length + pPubNight.days.length;
    const smcTotal = pSmc.days.length;
    const totalPlaced =
      pOtMorning.days.length +
      pOtAfternoon.days.length +
      pOtNight.days.length +
      wlTotal +
      pStandby.days.length +
      pubTotal +
      smcTotal;
    const activeLabel = labelDraft.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;

    return {
      shifts: {
        mainShifts: nextMain,
        nightShifts: nextNight,
        workloadShifts: nextWorkload,
        standbyShifts: nextStandby,
        publicHolidayShifts: nextPublicHoliday,
        smcShifts: nextSmc,
      },
      summaryText: `นำเวรลงตารางเรียบร้อย (OT ช ${pOtMorning.days.length} · บ ${pOtAfternoon.days.length} · ด ${pOtNight.days.length} · Workload ${wlTotal} · Standby ${pStandby.days.length}${
        pubTotal > 0 ? ` · ${activeLabel} ${pubTotal}` : ''
      }${smcTotal > 0 ? ` · SMC ${smcTotal}` : ''} รวม ${totalPlaced} เวร)`,
    };
  };

  const handleApply = async (andNavigateToRoster: boolean) => {
    const { shifts, summaryText } = buildNextShifts();
    await onApplyToGrid(shifts, true);
    if (andNavigateToRoster && onOpenDepartmentRoster) {
      onOpenDepartmentRoster();
      return;
    }
    setAppliedMsg(`${summaryText} และซิงก์เข้าตาราง OT แล้ว`);
    setTimeout(() => setAppliedMsg(null), 6000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            กรอกวันที่ลงเวรแบบรวดเร็ว — {staffName} ({monthLabel})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            พิมพ์เลขวันที่คั่นด้วยลูกน้ำ (,) หรือเว้นวรรค เช่น{' '}
            <span className="font-mono">3, 10, 25, 31</span> แล้วกดปุ่มนำวันที่ลงตาราง
            ระบบจะใส่ตัวอักษรเวรตามสีและช่องให้อัตโนมัติ
          </p>
        </div>
      </div>

      {/* 5 Color-Coded Input Boxes: Red OT, Green Workload, Blue Standby, Fuchsia Public Holiday, Orange SMC */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4 items-stretch">
        {/* Box 1: OT สีแดง (ช, บ, ด) */}
        <div className="p-3.5 bg-red-50/45 border border-red-200 rounded-lg flex flex-col justify-between gap-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-red-700">
              <span>1. ช่องเวร OT (ช / บ / ด สีแดง)</span>
              <span className="font-mono text-[11px] font-medium text-red-600/80">= วันที่</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-ot-morning"
                  className="w-9 text-xs font-bold text-red-600 shrink-0 text-center"
                >
                  ช =
                </label>
                <input
                  id="quick-ot-morning"
                  type="text"
                  value={otMorningInput}
                  onChange={(e) => setOtMorningInput(e.target.value)}
                  placeholder="เช่น 3, 10, 25, 31"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-ot-afternoon"
                  className="w-9 text-xs font-bold text-red-600 shrink-0 text-center"
                >
                  บ =
                </label>
                <input
                  id="quick-ot-afternoon"
                  type="text"
                  value={otAfternoonInput}
                  onChange={(e) => setOtAfternoonInput(e.target.value)}
                  placeholder="เช่น 3, 10, 19, 20, 25"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-ot-night"
                  className="w-9 text-xs font-bold text-red-600 shrink-0 text-center"
                >
                  ด =
                </label>
                <input
                  id="quick-ot-night"
                  type="text"
                  value={otNightInput}
                  onChange={(e) => setOtNightInput(e.target.value)}
                  placeholder="เช่น 2, 6, 8, 10, 16"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            ใส่ <strong className="text-red-600">ช</strong> (วันหยุด) /{' '}
            <strong className="text-red-600">บ</strong> แถว 1 และ{' '}
            <strong className="text-red-600">ด</strong> แถว 2 (สีแดง)
          </p>
        </div>

        {/* Box 2: Workload * สีเขียว (ช*, บ*, ด*) */}
        <div className="p-3.5 bg-green-50/45 border border-green-200 rounded-lg flex flex-col justify-between gap-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-green-800">
              <span>2. ช่องเวร * (ช* / บ* / ด* สีเขียว)</span>
              <span className="font-mono text-[11px] font-medium text-green-700/80">= วันที่</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-wl-morning"
                  className="w-9 text-xs font-bold text-green-700 shrink-0 text-center"
                >
                  ช* =
                </label>
                <input
                  id="quick-wl-morning"
                  type="text"
                  value={wlMorningInput}
                  onChange={(e) => setWlMorningInput(e.target.value)}
                  placeholder="เช่น 13, 23"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-wl-afternoon"
                  className="w-9 text-xs font-bold text-green-700 shrink-0 text-center"
                >
                  บ* =
                </label>
                <input
                  id="quick-wl-afternoon"
                  type="text"
                  value={wlAfternoonInput}
                  onChange={(e) => setWlAfternoonInput(e.target.value)}
                  placeholder="เช่น 1, 5, 7, 9, 12, 15"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-wl-night"
                  className="w-9 text-xs font-bold text-green-700 shrink-0 text-center"
                >
                  ด* =
                </label>
                <input
                  id="quick-wl-night"
                  type="text"
                  value={wlNightInput}
                  onChange={(e) => setWlNightInput(e.target.value)}
                  placeholder="เช่น 14, 21"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-600 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            ใส่ <strong className="text-green-700">ช* บ* ด*</strong> สีเขียวลงแถวที่ 3 (Work load)
          </p>
        </div>

        {/* Box 3: Standby ด น้ำเงิน/ฟ้า */}
        <div className="p-3.5 bg-sky-50/50 border border-sky-200 rounded-lg flex flex-col justify-between gap-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-sky-700">
              <span>3. ช่อง Standby ด (สีฟ้า/น้ำเงิน)</span>
              <span className="font-mono text-[11px] font-medium text-sky-600/80">= วันที่</span>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="quick-standby"
                className="w-9 text-xs font-bold text-sky-600 shrink-0 text-center"
              >
                ด =
              </label>
              <input
                id="quick-standby"
                type="text"
                value={standbyInput}
                onChange={(e) => setStandbyInput(e.target.value)}
                placeholder="เช่น 4, 11, 13, 20, 21"
                className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-sky-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600 text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            ใส่ <strong className="text-sky-600">ด</strong> สีฟ้าลงแถวที่ 4 (เวรดึก Standby)
          </p>
        </div>

        {/* Box 4: เวรนักขัตฤกษ์ (แก้ไขข้อความได้) ช, บ, ด สีชมพูบานเย็น */}
        <div className="p-3.5 bg-fuchsia-50/50 border border-fuchsia-200 rounded-lg flex flex-col justify-between gap-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-fuchsia-700 shrink-0">4.</span>
              <div className="relative flex-1 min-w-0">
                <Pencil className="w-3 h-3 text-fuchsia-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  maxLength={100}
                  value={labelDraft}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onBlur={handleLabelBlur}
                  placeholder="เวรนักขัตฤกษ์"
                  aria-label="แก้ไขชื่อช่องเวรนักขัตฤกษ์"
                  title="คลิกเพื่อแก้ไขข้อความชื่อเวรช่องที่ 4"
                  className="w-full pl-6 pr-2 py-0.5 text-xs font-bold text-fuchsia-800 bg-white/90 border border-fuchsia-300 rounded-md focus:outline-none focus:ring-2 focus:ring-fuchsia-500 placeholder:text-fuchsia-400"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-pub-morning"
                  className="w-9 text-xs font-bold text-fuchsia-600 shrink-0 text-center"
                >
                  ช =
                </label>
                <input
                  id="quick-pub-morning"
                  type="text"
                  value={pubMorningInput}
                  onChange={(e) => setPubMorningInput(e.target.value)}
                  placeholder="เช่น 13, 23"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-fuchsia-300 rounded-md focus:outline-none focus:ring-2 focus:ring-fuchsia-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-pub-afternoon"
                  className="w-9 text-xs font-bold text-fuchsia-600 shrink-0 text-center"
                >
                  บ =
                </label>
                <input
                  id="quick-pub-afternoon"
                  type="text"
                  value={pubAfternoonInput}
                  onChange={(e) => setPubAfternoonInput(e.target.value)}
                  placeholder="เช่น 13, 23"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-fuchsia-300 rounded-md focus:outline-none focus:ring-2 focus:ring-fuchsia-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="quick-pub-night"
                  className="w-9 text-xs font-bold text-fuchsia-600 shrink-0 text-center"
                >
                  ด =
                </label>
                <input
                  id="quick-pub-night"
                  type="text"
                  value={pubNightInput}
                  onChange={(e) => setPubNightInput(e.target.value)}
                  placeholder="เช่น 13, 23"
                  className="w-full min-w-0 px-2.5 py-1 text-sm font-mono bg-white border border-fuchsia-300 rounded-md focus:outline-none focus:ring-2 focus:ring-fuchsia-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            ใส่ <strong className="text-fuchsia-600">ช บ ด</strong> สีชมพูบานเย็น (ลงต่อจากเวรดึก Standby เมื่อมีข้อมูล)
          </p>
        </div>

        {/* Box 5: เวร SMC สีม่วง (แยกตาราง SMC) */}
        <div className="p-3.5 bg-purple-50/50 border border-purple-200 rounded-lg flex flex-col justify-between gap-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-purple-700">
              <span>5. ช่องเวร SMC (สีม่วง)</span>
              <span className="font-mono text-[11px] font-medium text-purple-600/80">= วันที่</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <label
                htmlFor="quick-smc"
                className="w-11 text-xs font-bold text-purple-700 shrink-0 text-center"
              >
                SMC =
              </label>
              <input
                id="quick-smc"
                type="text"
                value={smcInput}
                onChange={(e) => setSmcInput(e.target.value)}
                placeholder="เช่น 3, 10, 17, 24"
                className="w-full min-w-0 px-2.5 py-1.5 text-sm font-mono bg-white border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            ใส่ <strong className="text-purple-700">SMC</strong> สีม่วงลงแถวเวร SMC (แยกแสดงที่ตารางเวร SMC)
          </p>
        </div>
      </div>

      {/* Warnings / Confirmation */}
      {warningMsg && (
        <div className="px-3.5 py-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
          {warningMsg}
        </div>
      )}
      {appliedMsg && (
        <div className="px-3.5 py-2 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{appliedMsg}</span>
          </div>
          {onOpenDepartmentRoster && (
            <button
              type="button"
              onClick={onOpenDepartmentRoster}
              className="inline-flex items-center gap-1 font-semibold text-teal-800 underline hover:text-teal-950 whitespace-nowrap cursor-pointer"
            >
              เปิดดูในตาราง OT
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoFillWorking}
            onChange={(e) => setAutoFillWorking(e.target.checked)}
            className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
          />
          เติมเวรทำการ <strong className="text-slate-950">ช (สีดำ)</strong> ในวันราชการ และ{' '}
          <strong className="text-red-600">0 (สีแดง)</strong> ในวันเสาร์-อาทิตย์/วันหยุดให้อัตโนมัติ (คงวันลาเดิมไว้)
        </label>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleApply(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-teal-700" />
            {saving ? 'กำลังซิงก์...' : 'นำวันที่ลงตารางเวร'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleApply(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>ลงตารางและไปตาราง OT</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
