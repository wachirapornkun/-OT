import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardCheck,
  ClipboardList,
  Database,
  Eraser,
  Lock,
  Printer,
  Save,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  MainShiftCode,
  MonthlyShiftEntry,
  NightShiftCode,
  PublicHolidayShiftCode,
  RosterMonth,
  ShiftRowKey,
  SmcShiftCode,
  StaffCategory,
  StaffMember,
  StandbyShiftCode,
  WorkloadShiftCode,
} from '../types/roster';
import {
  claimStaffProfile,
  createOwnStaffProfile,
  createStaffMember,
  saveShiftEntry,
  seedOctober2569DepartmentData,
  updatePublicHolidayRateLabel,
} from '../services/rosterService';
import {
  calculatePersonMonthlySummary,
  formatDayList,
} from '../utils/rosterCalculations';
import {
  formatCurrency,
  getDayOfWeek,
  getDaysInMonth,
  getThaiMonthYearLabel,
  numberToThaiBahtText,
  THAI_WEEKDAYS_SHORT,
} from '../utils/thaiUtils';
import { ShiftCellDisplay } from './ShiftCellDisplay';
import { QuickDateEntryCard } from './QuickDateEntryCard';

interface MyShiftEntryViewProps {
  currentUserUid: string;
  currentUserEmail: string;
  currentUserDisplayName: string;
  isAdmin: boolean;
  ownedStaff: StaffMember | null;
  selectedStaffId: string;
  onSelectStaffId: (staffId: string) => void;
  staffList: StaffMember[];
  month: RosterMonth;
  entriesByStaffId: Record<string, MonthlyShiftEntry>;
  settings: DepartmentSettings;
  onOpenDepartmentRoster: (staffId?: string) => void;
  onOpenWorkloadRoster?: (staffId?: string) => void;
  onOpenSmcRoster?: (staffId?: string) => void;
  onPrintA4?: (title?: string) => void;
}

type ActiveBrush =
  | { row: 'mainShifts'; value: MainShiftCode; label: string }
  | { row: 'nightShifts'; value: NightShiftCode; label: string }
  | { row: 'workloadShifts'; value: WorkloadShiftCode; label: string }
  | { row: 'standbyShifts'; value: StandbyShiftCode; label: string }
  | { row: 'publicHolidayShifts'; value: PublicHolidayShiftCode; label: string }
  | { row: 'smcShifts'; value: SmcShiftCode; label: string }
  | { row: 'eraser'; value: ''; label: string };

const MAIN_BRUSHES: { value: MainShiftCode; label: string; desc: string; colorClass: string }[] = [
  { value: 'ช', label: 'ช', desc: 'ทำการ(ดำ) / วันหยุด=OT(แดง)', colorClass: 'text-slate-950 border-slate-300' },
  { value: 'ช/บ', label: 'ช/บ', desc: 'เช้า+OT บ่าย', colorClass: 'text-red-600 border-red-200' },
  { value: 'บ', label: 'บ', desc: 'OT บ่าย (สีแดง)', colorClass: 'text-red-600 border-red-200' },
  { value: '0', label: '0', desc: 'หยุด (Off - เสาร์/อาทิตย์และวันหยุดแสดงสีแดง)', colorClass: 'text-red-600 border-red-200' },
  { value: 'vac', label: 'vac', desc: 'ลาพักผ่อน', colorClass: 'text-slate-900 border-slate-300' },
  { value: 'ป่วย', label: 'ป่วย', desc: 'ลาป่วย', colorClass: 'text-slate-900 border-slate-300' },
  { value: 'กิจ', label: 'กิจ', desc: 'ลากิจ', colorClass: 'text-slate-900 border-slate-300' },
];

const WORKLOAD_BRUSHES: { value: WorkloadShiftCode; label: string }[] = [
  { value: 'ช*', label: 'ช*' },
  { value: 'บ*', label: 'บ*' },
  { value: 'ด*', label: 'ด*' },
  { value: 'ช*/บ*', label: 'ช*/บ*' },
];

const PUBLIC_HOLIDAY_BRUSHES: { value: PublicHolidayShiftCode; label: string }[] = [
  { value: 'ช', label: 'ช' },
  { value: 'บ', label: 'บ' },
  { value: 'ด', label: 'ด' },
  { value: 'ช/บ', label: 'ช/บ' },
];

export const MyShiftEntryView: React.FC<MyShiftEntryViewProps> = ({
  currentUserUid,
  currentUserEmail,
  currentUserDisplayName,
  isAdmin,
  ownedStaff,
  selectedStaffId,
  onSelectStaffId,
  staffList,
  month,
  entriesByStaffId,
  settings,
  onOpenDepartmentRoster,
  onOpenWorkloadRoster,
  onOpenSmcRoster,
  onPrintA4,
}) => {
  const activeStaffList = useMemo(() => staffList.filter((s) => s.active), [staffList]);

  // Regular users are strictly locked to their own bound staff profile; Admin can choose any active staff
  const targetStaff = useMemo(() => {
    if (!isAdmin) {
      return ownedStaff;
    }
    return (
      activeStaffList.find((s) => s.staffId === selectedStaffId) ||
      activeStaffList[0] ||
      null
    );
  }, [isAdmin, ownedStaff, activeStaffList, selectedStaffId]);

  // One-time self-binding state for regular users who haven't claimed their name yet
  const [candidateStaffId, setCandidateStaffId] = useState<string>('');
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const [showCreateOwnInBinding, setShowCreateOwnInBinding] = useState(false);

  // Quick add new staff form state (Admin quick add or self-profile creation)
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<StaffCategory>('RN');
  const [newPosLabel, setNewPosLabel] = useState('วิสัญญีพยาบาล');
  const [newPosSub, setNewPosSub] = useState('พยาบาลวิชาชีพปฏิบัติการ');
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  // Local editable draft of shifts for instant click-painting
  const existingEntry = targetStaff ? entriesByStaffId[targetStaff.staffId] || null : null;

  const [mainShifts, setMainShifts] = useState<Record<string, MainShiftCode>>({});
  const [nightShifts, setNightShifts] = useState<Record<string, NightShiftCode>>({});
  const [workloadShifts, setWorkloadShifts] = useState<Record<string, WorkloadShiftCode>>({});
  const [standbyShifts, setStandbyShifts] = useState<Record<string, StandbyShiftCode>>({});
  const [publicHolidayShifts, setPublicHolidayShifts] = useState<
    Record<string, PublicHolidayShiftCode>
  >({});
  const [smcShifts, setSmcShifts] = useState<Record<string, SmcShiftCode>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Active brush tool
  const [activeBrush, setActiveBrush] = useState<ActiveBrush>({
    row: 'mainShifts',
    value: 'ช/บ',
    label: 'ช/บ',
  });
  const [activeWorkloadCode, setActiveWorkloadCode] = useState<WorkloadShiftCode>('บ*');
  const [activePublicHolidayCode, setActivePublicHolidayCode] =
    useState<PublicHolidayShiftCode>('ช');

  // Refs for race-free debounced auto-sync to Combined Roster (Part 1)
  const loadedContextKeyRef = useRef<string>('');
  const localVersionRef = useRef<number>(0);
  const savedVersionRef = useRef<number>(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMetaRef = useRef<{
    monthId: string;
    staffId: string;
    ownerUid: string;
    canEdit: boolean;
  } | null>(null);
  const latestDraftRef = useRef<{
    mainShifts: Record<string, MainShiftCode>;
    nightShifts: Record<string, NightShiftCode>;
    workloadShifts: Record<string, WorkloadShiftCode>;
    standbyShifts: Record<string, StandbyShiftCode>;
    publicHolidayShifts: Record<string, PublicHolidayShiftCode>;
    smcShifts: Record<string, SmcShiftCode>;
  }>({
    mainShifts: {},
    nightShifts: {},
    workloadShifts: {},
    standbyShifts: {},
    publicHolidayShifts: {},
    smcShifts: {},
  });

  const canEdit = useMemo(() => {
    if (!targetStaff) return false;
    if (isAdmin) return true;
    return month.status === 'open' && targetStaff.ownerUid === currentUserUid;
  }, [targetStaff, isAdmin, month.status, currentUserUid]);

  useEffect(() => {
    const contextKey = `${targetStaff?.staffId || ''}|${month.monthId}`;
    const isContextSwitch = loadedContextKeyRef.current !== contextKey;
    if (isContextSwitch) {
      if (autoSaveTimerRef.current && pendingMetaRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        if (pendingMetaRef.current.canEdit && localVersionRef.current > savedVersionRef.current) {
          const { canEdit: _c, ...saveMeta } = pendingMetaRef.current;
          void saveShiftEntry({
            ...saveMeta,
            ...latestDraftRef.current,
          });
        }
      }
      loadedContextKeyRef.current = contextKey;
      localVersionRef.current = 0;
      savedVersionRef.current = 0;
      pendingMetaRef.current = targetStaff
        ? {
            monthId: month.monthId,
            staffId: targetStaff.staffId,
            ownerUid: targetStaff.ownerUid || (isAdmin ? '' : currentUserUid),
            canEdit,
          }
        : null;
    } else if (pendingMetaRef.current) {
      pendingMetaRef.current.canEdit = canEdit;
    }

    if (isContextSwitch || localVersionRef.current === savedVersionRef.current) {
      const nextMain = existingEntry?.mainShifts ? { ...existingEntry.mainShifts } : {};
      const nextNight = existingEntry?.nightShifts ? { ...existingEntry.nightShifts } : {};
      const nextWorkload = existingEntry?.workloadShifts ? { ...existingEntry.workloadShifts } : {};
      const nextStandby = existingEntry?.standbyShifts ? { ...existingEntry.standbyShifts } : {};
      const nextPublicHoliday = existingEntry?.publicHolidayShifts
        ? { ...existingEntry.publicHolidayShifts }
        : {};
      const nextSmc = existingEntry?.smcShifts ? { ...existingEntry.smcShifts } : {};
      setMainShifts(nextMain);
      setNightShifts(nextNight);
      setWorkloadShifts(nextWorkload);
      setStandbyShifts(nextStandby);
      setPublicHolidayShifts(nextPublicHoliday);
      setSmcShifts(nextSmc);
      latestDraftRef.current = {
        mainShifts: nextMain,
        nightShifts: nextNight,
        workloadShifts: nextWorkload,
        standbyShifts: nextStandby,
        publicHolidayShifts: nextPublicHoliday,
        smcShifts: nextSmc,
      };
      setIsDirty(false);
    }
  }, [targetStaff?.staffId, targetStaff?.ownerUid, month.monthId, existingEntry, isAdmin, currentUserUid, canEdit]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        if (
          pendingMetaRef.current &&
          pendingMetaRef.current.canEdit &&
          localVersionRef.current > savedVersionRef.current
        ) {
          const { canEdit: _c, ...saveMeta } = pendingMetaRef.current;
          void saveShiftEntry({
            ...saveMeta,
            ...latestDraftRef.current,
          });
        }
      }
    };
  }, []);

  const daysInMonth = getDaysInMonth(month.yearAD, month.monthNumber);
  const holidaySet = useMemo(() => new Set(month.holidays), [month.holidays]);
  const daysArray = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );
  const specialRateLabel =
    settings.publicHolidayRateLabel?.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;

  const liveSummary = useMemo(() => {
    if (!targetStaff) return null;
    const draftEntry: MonthlyShiftEntry = {
      monthId: month.monthId,
      staffId: targetStaff.staffId,
      ownerUid: targetStaff.ownerUid || '',
      mainShifts,
      nightShifts,
      workloadShifts,
      standbyShifts,
      publicHolidayShifts,
      smcShifts,
      visibility: 'department',
    };
    return calculatePersonMonthlySummary(targetStaff, draftEntry, month, settings);
  }, [
    targetStaff,
    month,
    settings,
    mainShifts,
    nightShifts,
    workloadShifts,
    standbyShifts,
    publicHolidayShifts,
    smcShifts,
  ]);

  const handleCategoryPreset = (cat: StaffCategory) => {
    setNewCategory(cat);
    if (cat === 'RN') {
      setNewPosLabel('วิสัญญีพยาบาล');
      setNewPosSub('พยาบาลวิชาชีพปฏิบัติการ');
    } else if (cat === 'PN') {
      setNewPosLabel('ผู้ช่วยพยาบาล');
      setNewPosSub('');
    } else {
      setNewPosLabel('พนักงานช่วยเหลือคนไข้');
      setNewPosSub('');
    }
  };

  const handleCreateOwnProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setOnboardingBusy(true);
    setBindError(null);
    try {
      const nextOrder =
        staffList.reduce((max, s) => Math.max(max, s.orderIndex), 0) + 1;
      let newId: string;
      if (isAdmin) {
        newId = await createStaffMember({
          fullName: newName.trim(),
          category: newCategory,
          positionLabel: newPosLabel.trim() || CATEGORY_LABELS[newCategory],
          positionSubLabel: newPosSub.trim(),
          orderIndex: nextOrder,
          ownerUid: '',
        });
      } else {
        newId = await createOwnStaffProfile(
          {
            fullName: newName.trim(),
            category: newCategory,
            positionLabel: newPosLabel.trim() || CATEGORY_LABELS[newCategory],
            positionSubLabel: newPosSub.trim(),
            orderIndex: nextOrder,
          },
          currentUserUid,
          { email: currentUserEmail, displayName: currentUserDisplayName },
        );
      }
      onSelectStaffId(newId);
      setNewName('');
      setShowAddStaffModal(false);
      setShowCreateOwnInBinding(false);
    } catch (err) {
      console.error('Create profile failed:', err);
      setBindError('ไม่สามารถสร้างรายชื่อได้ในขณะนี้ กรุณาลองใหม่อีกครั้งหรือติดต่อ Admin');
    } finally {
      setOnboardingBusy(false);
    }
  };

  const handleConfirmClaimStaff = async () => {
    if (!candidateStaffId) return;
    const chosen = activeStaffList.find((s) => s.staffId === candidateStaffId);
    if (!chosen || chosen.ownerUid) {
      setBindError('รายชื่อนี้ถูกผูกบัญชีไปแล้ว กรุณาเลือกรายชื่อที่ยังไม่ถูกผูกบัญชี หรือติดต่อ Admin');
      return;
    }
    setBindingBusy(true);
    setBindError(null);
    try {
      await claimStaffProfile(chosen.staffId, currentUserUid, {
        email: currentUserEmail,
        displayName: currentUserDisplayName,
      });
      onSelectStaffId(chosen.staffId);
    } catch (err) {
      console.error('Claim staff failed:', err);
      setBindError('ไม่สามารถผูกบัญชีกับรายชื่อนี้ได้ (อาจถูกผู้อื่นผูกไปแล้ว) กรุณาลองใหม่หรือติดต่อ Admin');
    } finally {
      setBindingBusy(false);
    }
  };

  const persistDraftNow = async (
    draft: {
      mainShifts: Record<string, MainShiftCode>;
      nightShifts: Record<string, NightShiftCode>;
      workloadShifts: Record<string, WorkloadShiftCode>;
      standbyShifts: Record<string, StandbyShiftCode>;
      publicHolidayShifts: Record<string, PublicHolidayShiftCode>;
      smcShifts: Record<string, SmcShiftCode>;
    },
    versionAtSave: number,
  ) => {
    if (!targetStaff || !canEdit) return;
    setSaving(true);
    try {
      await saveShiftEntry({
        monthId: month.monthId,
        staffId: targetStaff.staffId,
        ownerUid: targetStaff.ownerUid || (isAdmin ? '' : currentUserUid),
        mainShifts: draft.mainShifts,
        nightShifts: draft.nightShifts,
        workloadShifts: draft.workloadShifts,
        standbyShifts: draft.standbyShifts,
        publicHolidayShifts: draft.publicHolidayShifts,
        smcShifts: draft.smcShifts,
      });
      savedVersionRef.current = Math.max(savedVersionRef.current, versionAtSave);
      if (localVersionRef.current <= savedVersionRef.current) {
        setIsDirty(false);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const commitLocalDraftAndAutoSync = (nextDraft: {
    mainShifts: Record<string, MainShiftCode>;
    nightShifts: Record<string, NightShiftCode>;
    workloadShifts: Record<string, WorkloadShiftCode>;
    standbyShifts: Record<string, StandbyShiftCode>;
    publicHolidayShifts: Record<string, PublicHolidayShiftCode>;
    smcShifts: Record<string, SmcShiftCode>;
  }) => {
    latestDraftRef.current = nextDraft;
    setMainShifts(nextDraft.mainShifts);
    setNightShifts(nextDraft.nightShifts);
    setWorkloadShifts(nextDraft.workloadShifts);
    setStandbyShifts(nextDraft.standbyShifts);
    setPublicHolidayShifts(nextDraft.publicHolidayShifts);
    setSmcShifts(nextDraft.smcShifts);

    localVersionRef.current += 1;
    const version = localVersionRef.current;
    setIsDirty(true);
    setSavedNotice(false);

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void persistDraftNow(latestDraftRef.current, version);
    }, 500);
  };

  const handleCellClick = (rowKey: ShiftRowKey, day: number) => {
    if (!canEdit) return;
    const dKey = String(day);
    const curr = latestDraftRef.current;
    const nextMain = { ...curr.mainShifts };
    const nextNight = { ...curr.nightShifts };
    const nextWorkload = { ...curr.workloadShifts };
    const nextStandby = { ...curr.standbyShifts };
    const nextPublicHoliday = { ...curr.publicHolidayShifts };
    const nextSmc = { ...curr.smcShifts };

    if (activeBrush.row === 'eraser') {
      if (rowKey === 'mainShifts') {
        delete nextMain[dKey];
      } else if (rowKey === 'nightShifts') {
        delete nextNight[dKey];
      } else if (rowKey === 'workloadShifts') {
        delete nextWorkload[dKey];
      } else if (rowKey === 'standbyShifts') {
        delete nextStandby[dKey];
      } else if (rowKey === 'publicHolidayShifts') {
        delete nextPublicHoliday[dKey];
      } else if (rowKey === 'smcShifts') {
        delete nextSmc[dKey];
      }
    } else if (rowKey === 'mainShifts') {
      const paintVal: MainShiftCode =
        activeBrush.row === 'mainShifts' ? activeBrush.value : 'ช';
      if (nextMain[dKey] === paintVal) {
        delete nextMain[dKey];
      } else {
        nextMain[dKey] = paintVal;
      }
    } else if (rowKey === 'nightShifts') {
      if (nextNight[dKey] === 'ด') {
        delete nextNight[dKey];
      } else {
        nextNight[dKey] = 'ด';
      }
    } else if (rowKey === 'workloadShifts') {
      const wlVal =
        activeBrush.row === 'workloadShifts' ? activeBrush.value : activeWorkloadCode;
      if (nextWorkload[dKey] === wlVal) {
        delete nextWorkload[dKey];
      } else {
        nextWorkload[dKey] = wlVal;
      }
    } else if (rowKey === 'standbyShifts') {
      if (nextStandby[dKey] === 'ด') {
        delete nextStandby[dKey];
      } else {
        nextStandby[dKey] = 'ด';
      }
    } else if (rowKey === 'publicHolidayShifts') {
      const pubVal =
        activeBrush.row === 'publicHolidayShifts'
          ? activeBrush.value
          : activePublicHolidayCode;
      if (nextPublicHoliday[dKey] === pubVal) {
        delete nextPublicHoliday[dKey];
      } else {
        nextPublicHoliday[dKey] = pubVal;
      }
    } else if (rowKey === 'smcShifts') {
      if (nextSmc[dKey]) {
        delete nextSmc[dKey];
      } else {
        nextSmc[dKey] = 'SMC';
      }
    }

    commitLocalDraftAndAutoSync({
      mainShifts: nextMain,
      nightShifts: nextNight,
      workloadShifts: nextWorkload,
      standbyShifts: nextStandby,
      publicHolidayShifts: nextPublicHoliday,
      smcShifts: nextSmc,
    });
  };

  const handleAutoFillWorkingDays = () => {
    if (!canEdit) return;
    const curr = latestDraftRef.current;
    const nextMain = { ...curr.mainShifts };
    for (let d = 1; d <= daysInMonth; d++) {
      const dKey = String(d);
      if (!nextMain[dKey]) {
        nextMain[dKey] = holidaySet.has(d) ? '0' : 'ช';
      }
    }
    commitLocalDraftAndAutoSync({
      ...curr,
      mainShifts: nextMain,
    });
  };

  const handleApplyQuickDates = async (
    next: {
      mainShifts: Record<string, MainShiftCode>;
      nightShifts: Record<string, NightShiftCode>;
      workloadShifts: Record<string, WorkloadShiftCode>;
      standbyShifts: Record<string, StandbyShiftCode>;
      publicHolidayShifts: Record<string, PublicHolidayShiftCode>;
      smcShifts: Record<string, SmcShiftCode>;
    },
    andSave: boolean,
  ) => {
    if (!targetStaff || !canEdit) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    latestDraftRef.current = next;
    setMainShifts(next.mainShifts);
    setNightShifts(next.nightShifts);
    setWorkloadShifts(next.workloadShifts);
    setStandbyShifts(next.standbyShifts);
    setPublicHolidayShifts(next.publicHolidayShifts);
    setSmcShifts(next.smcShifts);
    localVersionRef.current += 1;
    const version = localVersionRef.current;
    setIsDirty(true);
    setSavedNotice(false);

    if (andSave) {
      await persistDraftNow(next, version);
    }
  };

  const handleSave = async () => {
    if (!targetStaff || !canEdit) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    await persistDraftNow(latestDraftRef.current, localVersionRef.current);
  };

  const handleGoToDepartmentRoster = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (targetStaff && canEdit && localVersionRef.current > savedVersionRef.current) {
      await persistDraftNow(latestDraftRef.current, localVersionRef.current);
    }
    onOpenDepartmentRoster(targetStaff?.staffId);
  };

  const handleGoToWorkloadRoster = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (targetStaff && canEdit && localVersionRef.current > savedVersionRef.current) {
      await persistDraftNow(latestDraftRef.current, localVersionRef.current);
    }
    onOpenWorkloadRoster?.(targetStaff?.staffId);
  };

  const handleGoToSmcRoster = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (targetStaff && canEdit && localVersionRef.current > savedVersionRef.current) {
      await persistDraftNow(latestDraftRef.current, localVersionRef.current);
    }
    onOpenSmcRoster?.(targetStaff?.staffId);
  };

  // Non-admin user who has NOT yet bound their login account to their own staff profile
  if (!isAdmin && !targetStaff) {
    const unclaimedStaff = activeStaffList.filter((s) => !s.ownerUid);
    const claimedStaff = activeStaffList.filter((s) => Boolean(s.ownerUid));
    const selectedCandidate = unclaimedStaff.find((s) => s.staffId === candidateStaffId) || null;

    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900">
                ยืนยันชื่อบุคลากรเพื่อผูกกับบัญชีของคุณ (ทำครั้งเดียว)
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                เพื่อป้องกันการลงเวรผิดคน ระบบกำหนดให้แต่ละบัญชีสามารถลงและแก้ไขเวรได้เฉพาะชื่อของตนเองเท่านั้น ไม่สามารถลงข้อมูลให้ผู้อื่นได้ (ยกเว้น Admin)
              </p>
            </div>
          </div>

          {bindError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{bindError}</span>
            </div>
          )}

          {activeStaffList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700">
                  เลือกชื่อของคุณจากรายชื่อที่ยังไม่ได้ผูกบัญชี ({unclaimedStaff.length} รายชื่อว่าง)
                </div>
                {claimedStaff.length > 0 && (
                  <span className="text-[11px] text-slate-400">
                    ผูกบัญชีแล้ว {claimedStaff.length} คน
                  </span>
                )}
              </div>

              {unclaimedStaff.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                  {unclaimedStaff.map((s) => {
                    const isSelected = candidateStaffId === s.staffId;
                    return (
                      <button
                        key={s.staffId}
                        type="button"
                        onClick={() => {
                          setCandidateStaffId(s.staffId);
                          setBindError(null);
                        }}
                        className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-teal-50 border-teal-600 ring-1 ring-teal-600'
                            : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {s.orderIndex}. {s.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {CATEGORY_LABELS[s.category]} · {s.positionLabel}
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-teal-700 border-teal-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  รายชื่อบุคลากรทั้งหมดในหน่วยงานถูกผูกบัญชีแล้ว หากชื่อของคุณถูกผูกผิดบัญชี กรุณาติดต่อ Admin เพื่อปลดการผูกบัญชี หรือสร้างรายชื่อใหม่ด้านล่างหากยังไม่มีชื่อในระบบ
                </div>
              )}

              {selectedCandidate && (
                <div className="p-3.5 rounded-lg bg-teal-50/70 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-teal-900 space-y-0.5">
                    <div className="font-semibold">
                      คุณกำลังเลือกผูกบัญชีกับ: {selectedCandidate.fullName}
                    </div>
                    <div className="text-[11px] text-teal-700">
                      หลังยืนยันแล้ว บัญชีนี้จะแก้ไขเวรได้เฉพาะชื่อนี้เท่านั้น (หากเลือกผิด แจ้ง Admin ปลดล็อกได้)
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={bindingBusy}
                    onClick={() => void handleConfirmClaimStaff()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {bindingBusy ? 'กำลังยืนยัน...' : 'ยืนยันผูกบัญชีเป็นชื่อของฉัน'}
                  </button>
                </div>
              )}

              {claimedStaff.length > 0 && (
                <details className="text-xs text-slate-500 pt-1">
                  <summary className="cursor-pointer hover:text-slate-700 font-medium">
                    ดูรายชื่อที่ผูกบัญชีแล้ว ({claimedStaff.length} คน — ไม่สามารถเลือกซ้ำได้)
                  </summary>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {claimedStaff.map((s) => (
                      <div
                        key={s.staffId}
                        className="px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {s.orderIndex}. {s.fullName}
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 shrink-0">
                          ผูกบัญชีแล้ว
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Create own new profile if not in list */}
          <div className="pt-3 border-t border-slate-100">
            {activeStaffList.length > 0 && !showCreateOwnInBinding ? (
              <button
                type="button"
                onClick={() => setShowCreateOwnInBinding(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                ไม่พบชื่อของคุณในรายการ? สร้างรายชื่อของฉันใหม่
              </button>
            ) : (
              <form onSubmit={handleCreateOwnProfile} className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                    <UserPlus className="w-4 h-4 text-teal-700" />
                    <span>สร้างรายชื่อบุคลากรของฉันใหม่</span>
                  </div>
                  {activeStaffList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCreateOwnInBinding(false)}
                      className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      ซ่อน
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      ชื่อ - นามสกุล (พร้อมคำนำหน้า)
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="เช่น น.ส.สมหญิง ใจดี"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      กลุ่มตำแหน่ง (กำหนดอัตราค่าเวรอัตโนมัติ)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['RN', 'PN', 'NA'] as StaffCategory[]).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleCategoryPreset(cat)}
                          className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            newCategory === cat
                              ? 'bg-teal-700 text-white border-teal-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {CATEGORY_LABELS[cat]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        ชื่อตำแหน่งที่แสดงในตารางเวร
                      </label>
                      <input
                        type="text"
                        required
                        value={newPosLabel}
                        onChange={(e) => setNewPosLabel(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        ระดับตำแหน่ง (บรรทัดรอง ไม่บังคับ)
                      </label>
                      <input
                        type="text"
                        value={newPosSub}
                        onChange={(e) => setNewPosSub(e.target.value)}
                        placeholder="เช่น พยาบาลวิชาชีพชำนาญการ"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={onboardingBusy || !newName.trim()}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {onboardingBusy ? 'กำลังบันทึก...' : 'สร้างรายชื่อของฉันและผูกบัญชีทันที'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Admin initial empty state: no staff records in DB yet
  if (!targetStaff) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">
              เริ่มต้นใช้งานตารางเวรประจำเดือน (สิทธิ์ Admin)
            </h2>
            <p className="text-sm text-slate-600">
              นำเข้ารายชื่อและข้อมูลตัวอย่างของกลุ่มงาน (13 คน) หรือเพิ่มรายชื่อบุคลากรใหม่ด้านล่างเพื่อเริ่มลงเวรได้ทันที
            </p>
          </div>
          <button
            type="button"
            disabled={onboardingBusy}
            onClick={async () => {
              setOnboardingBusy(true);
              try {
                await seedOctober2569DepartmentData(currentUserUid);
                onSelectStaffId('rn_01_wachiraporn');
              } finally {
                setOnboardingBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Database className="w-4 h-4" />
            {onboardingBusy ? 'กำลังนำเข้าข้อมูล...' : 'นำเข้าข้อมูลตัวอย่าง ต.ค. 2569 (13 คน)'}
          </button>
        </div>

        <form
          onSubmit={handleCreateOwnProfile}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <UserPlus className="w-5 h-5 text-teal-700" />
            <h3>เพิ่มรายชื่อบุคลากรใหม่</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ชื่อ - นามสกุล (พร้อมคำนำหน้า)
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น น.ส.สมหญิง ใจดี"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                กลุ่มตำแหน่ง (กำหนดอัตราค่าเวรอัตโนมัติ)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['RN', 'PN', 'NA'] as StaffCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryPreset(cat)}
                    className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      newCategory === cat
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อตำแหน่งที่แสดงในตารางเวร
                </label>
                <input
                  type="text"
                  required
                  value={newPosLabel}
                  onChange={(e) => setNewPosLabel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ระดับตำแหน่ง (บรรทัดรอง ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={newPosSub}
                  onChange={(e) => setNewPosSub(e.target.value)}
                  placeholder="เช่น พยาบาลวิชาชีพชำนาญการ"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={onboardingBusy || !newName.trim()}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            {onboardingBusy ? 'กำลังบันทึก...' : 'เพิ่มรายชื่อและเริ่มลงเวร'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Staff Header + Action Controls */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{CATEGORY_LABELS[targetStaff.category]}</span>
            <span aria-hidden="true">·</span>
            <span>อัตรา OT {formatCurrency(liveSummary?.otRate || 0)} บ./เวร</span>
            {(liveSummary?.hasDistinctPublicHolidayRate ||
              (liveSummary?.publicHolidayOtCount || 0) > 0) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-fuchsia-700 font-medium">
                  {specialRateLabel} {formatCurrency(liveSummary?.publicHolidayOtRate || 0)} บ./เวร
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>Standby {formatCurrency(liveSummary?.standbyRate || 0)} บ./เวร</span>
            <span aria-hidden="true">·</span>
            <span>ประจำเดือน {getThaiMonthYearLabel(month.yearAD, month.monthNumber)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin ? (
              <>
                <select
                  value={targetStaff.staffId}
                  onChange={(e) => onSelectStaffId(e.target.value)}
                  aria-label="เลือกชื่อบุคลากรเพื่อลงเวร (สิทธิ์ Admin)"
                  className="text-base sm:text-lg font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {activeStaffList.map((s) => (
                    <option key={s.staffId} value={s.staffId}>
                      {s.orderIndex}. {s.fullName} ({CATEGORY_LABELS[s.category]})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  เพิ่มชื่อใหม่
                </button>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-md whitespace-nowrap">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  สิทธิ์ Admin (ลงเวรให้ทุกคนได้)
                </span>
              </>
            ) : (
              <>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {targetStaff.orderIndex}. {targetStaff.fullName}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap">
                  <Lock className="w-3 h-3 text-teal-700" />
                  ลงเวรเฉพาะของตนเอง
                </span>
              </>
            )}
            {month.status === 'locked' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <Lock className="w-3.5 h-3.5" />
                {isAdmin
                  ? 'เดือนนี้ถูกล็อกสำหรับผู้ใช้ทั่วไป (Admin สามารถแก้ไขได้)'
                  : 'เดือนนี้ถูกล็อกแล้ว (ปลดล็อกได้โดย Admin)'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={handleAutoFillWorkingDays}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                เติมเวรทำการ (ช) วันราชการทั้งหมด
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isDirty
                    ? 'bg-slate-800 hover:bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              >
                {savedNotice || (!isDirty && !saving) ? (
                  <Check className="w-3.5 h-3.5 text-teal-600" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving
                  ? 'กำลังซิงก์...'
                  : isDirty
                  ? 'บันทึกทันที'
                  : 'ซิงก์อัตโนมัติแล้ว'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void handleGoToDepartmentRoster()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>ไปตาราง OT</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          {onOpenWorkloadRoster && (
            <button
              type="button"
              onClick={() => void handleGoToWorkloadRoster()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-green-800 bg-green-50 hover:bg-green-100 border border-green-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>ตารางเวร Workload</span>
            </button>
          )}
          {onOpenSmcRoster && (
            <button
              type="button"
              onClick={() => void handleGoToSmcRoster()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>ตารางเวร SMC</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const title = `ตารางเวรรายบุคคล ${targetStaff.fullName} ประจำเดือน ${getThaiMonthYearLabel(month.yearAD, month.monthNumber)}`;
              if (onPrintA4) onPrintA4(title);
              else window.print();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-teal-700" />
            <span>พิมพ์ A4</span>
          </button>
        </div>
      </div>

      {/* Optional Quick Inline Add Staff Form (Admin only) */}
      {isAdmin && showAddStaffModal && (
        <form
          onSubmit={handleCreateOwnProfile}
          className="no-print bg-white border border-teal-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">เพิ่มรายชื่อบุคลากรใหม่เข้าสู่ตารางเวร</h3>
            <button
              type="button"
              onClick={() => setShowAddStaffModal(false)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ปิด
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อ - สกุล</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น น.ส.สมหญิง ใจดี"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">กลุ่มตำแหน่ง</label>
              <select
                value={newCategory}
                onChange={(e) => handleCategoryPreset(e.target.value as StaffCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="RN">พยาบาลวิชาชีพ (RN)</option>
                <option value="PN">ผู้ช่วยพยาบาล (PN)</option>
                <option value="NA">พนักงานช่วยเหลือคนไข้ (NA)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ตำแหน่งในตาราง</label>
              <input
                type="text"
                required
                value={newPosLabel}
                onChange={(e) => setNewPosLabel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={onboardingBusy || !newName.trim()}
                className="w-full px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                {onboardingBusy ? 'กำลังบันทึก...' : 'บันทึกรายชื่อใหม่'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Quick 4-Box Color-Coded Date Entry Card */}
      {canEdit && (
        <div className="no-print">
          <QuickDateEntryCard
            staffName={targetStaff.fullName}
            monthLabel={getThaiMonthYearLabel(month.yearAD, month.monthNumber)}
            daysInMonth={daysInMonth}
            holidays={month.holidays}
            currentMainShifts={mainShifts}
            liveSummary={liveSummary}
            publicHolidayLabel={specialRateLabel}
            onChangePublicHolidayLabel={(label) => void updatePublicHolidayRateLabel(label)}
            saving={saving}
            onApplyToGrid={handleApplyQuickDates}
            onOpenDepartmentRoster={() => void handleGoToDepartmentRoster()}
          />
        </div>
      )}

      {/* Interactive 5-Section Paint Palette */}
      {canEdit && (
        <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              แถบเครื่องมือเลือกสัญลักษณ์เวร (คลิกเลือกสัญลักษณ์ แล้วคลิกที่ช่องวันที่ในตารางด้านล่าง)
            </h3>
            <button
              type="button"
              onClick={() => setActiveBrush({ row: 'eraser', value: '', label: 'ล้างช่อง' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeBrush.row === 'eraser'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              ยางลบ (ล้างช่อง)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
            {/* Section 1: Main Shifts (Black working + Red OT) */}
            <div className="md:col-span-2 xl:col-span-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                แถว 1: เวรทำการ (<span className="text-slate-950">ดำ</span>) / OT ช-บ (<span className="text-red-600">แดง</span>)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MAIN_BRUSHES.map((b) => {
                  const isActive =
                    activeBrush.row === 'mainShifts' && activeBrush.value === b.value;
                  return (
                    <button
                      key={b.value}
                      type="button"
                      title={b.desc}
                      onClick={() =>
                        setActiveBrush({ row: 'mainShifts', value: b.value, label: b.label })
                      }
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900'
                          : `bg-white hover:bg-slate-100 ${b.colorClass}`
                      }`}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Night OT (Red) */}
            <div className="xl:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-red-700">แถว 2: เวรดึก OT</div>
              <button
                type="button"
                onClick={() => setActiveBrush({ row: 'nightShifts', value: 'ด', label: 'ด (OT)' })}
                className={`w-full px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  activeBrush.row === 'nightShifts'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                }`}
              >
                ด (เวรดึก สีแดง)
              </button>
            </div>

            {/* Section 3: Workload OT (Green) */}
            <div className="xl:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-green-700">แถว 3: Workload</div>
              <div className="flex flex-wrap gap-1">
                {WORKLOAD_BRUSHES.map((wb) => {
                  const isActive =
                    activeBrush.row === 'workloadShifts' && activeBrush.value === wb.value;
                  return (
                    <button
                      key={wb.value}
                      type="button"
                      onClick={() => {
                        setActiveWorkloadCode(wb.value);
                        setActiveBrush({
                          row: 'workloadShifts',
                          value: wb.value,
                          label: wb.label,
                        });
                      }}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                      }`}
                    >
                      {wb.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Standby Night (Blue) */}
            <div className="xl:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-sky-700">แถว 4: Standby</div>
              <button
                type="button"
                onClick={() =>
                  setActiveBrush({ row: 'standbyShifts', value: 'ด', label: 'ด (Standby)' })
                }
                className={`w-full px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  activeBrush.row === 'standbyShifts'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'
                }`}
              >
                ด (Standby สีฟ้า)
              </button>
            </div>

            {/* Section 5: Public Holiday / Special Shifts (Fuchsia/Magenta) */}
            <div className="xl:col-span-2 p-3.5 bg-fuchsia-50/40 border border-fuchsia-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-fuchsia-700 truncate" title={specialRateLabel}>
                แถว 5: {specialRateLabel}
              </div>
              <div className="flex flex-wrap gap-1">
                {PUBLIC_HOLIDAY_BRUSHES.map((pb) => {
                  const isActive =
                    activeBrush.row === 'publicHolidayShifts' && activeBrush.value === pb.value;
                  return (
                    <button
                      key={pb.value}
                      type="button"
                      onClick={() => {
                        setActivePublicHolidayCode(pb.value);
                        setActiveBrush({
                          row: 'publicHolidayShifts',
                          value: pb.value,
                          label: pb.label,
                        });
                      }}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                          : 'bg-white text-fuchsia-600 border-fuchsia-200 hover:bg-fuchsia-50'
                      }`}
                    >
                      {pb.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 6: SMC Shifts (Purple) */}
            <div className="md:col-span-2 xl:col-span-3 p-3.5 bg-purple-50/40 border border-purple-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-purple-700">
                แถว 6: เวร SMC (สีม่วง — แยกตาราง SMC)
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveBrush({ row: 'smcShifts', value: 'SMC', label: 'SMC' })
                }
                className={`w-full px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  activeBrush.row === 'smcShifts'
                    ? 'bg-purple-700 text-white border-purple-700'
                    : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                }`}
              >
                SMC (เวร SMC สีม่วง)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Individual A4 Container (6-Row Grid + Live Personal Reimbursement Summary) */}
      <div className="print-full-width space-y-6">
        <div className="print-only thai-sarabun-doc text-center space-y-0.5 mb-2">
          <h2 className="doc-title text-lg font-bold leading-snug text-slate-950">
            ตารางปฏิบัติงานรายบุคคล ประจำเดือน {getThaiMonthYearLabel(month.yearAD, month.monthNumber)}
          </h2>
          <p className="doc-subtitle text-sm font-semibold text-slate-900">
            {targetStaff.fullName} ({targetStaff.positionLabel}) · {settings.departmentName}
          </p>
          <p className="doc-subtitle text-xs text-slate-700">{settings.hospitalName}</p>
        </div>

      {/* 6-Row Interactive Monthly Shift Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              ตารางลงเวร 6 ส่วน — ประจำเดือน {getThaiMonthYearLabel(month.yearAD, month.monthNumber)}
            </div>
            <div className="text-xs text-slate-500 tabular-nums mt-0.5">
              วันทำการ {daysInMonth - month.holidays.length} วัน · วันหยุด {month.holidays.length} วัน (ทุกการแก้ไขเชื่อมโยงเข้าตาราง OT / Workload / SMC อัตโนมัติ)
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleGoToDepartmentRoster()}
            className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>ดูในตาราง OT</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-100 border-b border-r border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-800 min-w-[165px]">
                  ประเภทเวร (6 ส่วน)
                </th>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const dow = THAI_WEEKDAYS_SHORT[getDayOfWeek(month.yearAD, month.monthNumber, d)];
                  return (
                    <th
                      key={d}
                      className={`border-b border-r border-slate-300 px-1 py-1.5 min-w-[36px] ${
                        isHol ? 'bg-red-800 text-white' : 'bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="text-[11px] font-bold font-mono tabular-nums leading-tight">
                        {d}
                      </div>
                      <div
                        className={`text-[10px] leading-tight ${
                          isHol ? 'text-red-100' : 'text-slate-500'
                        }`}
                      >
                        {dow}
                      </div>
                    </th>
                  );
                })}
                <th className="border-b border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 min-w-[74px]">
                  รวมเวร
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Working & OT ช/บ */}
              <tr className="border-b border-slate-200">
                <td className="sticky left-0 z-10 bg-white border-r border-slate-300 px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-slate-900">1. เวรทำการ / OT ช-บ</div>
                  <div className="text-[11px] text-slate-500">ทำการ (ดำ) · OT (แดง)</div>
                </td>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const dowIdx = getDayOfWeek(month.yearAD, month.monthNumber, d);
                  const isWeekend = dowIdx === 0 || dowIdx === 6;
                  const val = mainShifts[String(d)];
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick('mainShifts', d)}
                      className={`border-r border-slate-200 h-11 px-0.5 select-none transition-colors ${
                        isHol ? 'bg-red-50/40' : 'bg-white'
                      } ${canEdit ? 'cursor-pointer hover:bg-teal-50' : ''}`}
                    >
                      <ShiftCellDisplay
                        rowKey="mainShifts"
                        value={val}
                        isHoliday={isHol}
                        isWeekend={isWeekend}
                      />
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-2 py-1 text-xs font-mono tabular-nums text-slate-800">
                  <div>ทำการ {liveSummary?.workingDaysCount || 0}</div>
                  <div className="text-red-600 font-semibold">OT {liveSummary?.mainRowOtCount || 0}</div>
                </td>
              </tr>

              {/* Row 2: Night OT */}
              <tr className="border-b border-slate-200">
                <td className="sticky left-0 z-10 bg-white border-r border-slate-300 px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-red-600">2. เวรดึก (OT)</div>
                  <div className="text-[11px] text-slate-500">คลิกเพื่อสลับ ด (สีแดง)</div>
                </td>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const val = nightShifts[String(d)];
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick('nightShifts', d)}
                      className={`border-r border-slate-200 h-10 px-0.5 select-none transition-colors ${
                        isHol ? 'bg-red-50/40' : 'bg-white'
                      } ${canEdit ? 'cursor-pointer hover:bg-red-50' : ''}`}
                    >
                      <ShiftCellDisplay rowKey="nightShifts" value={val} isHoliday={isHol} />
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-2 py-1 text-xs font-mono font-semibold tabular-nums text-red-600">
                  {liveSummary?.nightOtCount || 0}
                </td>
              </tr>

              {/* Row 3: Workload OT */}
              <tr className="border-b border-slate-200">
                <td className="sticky left-0 z-10 bg-white border-r border-slate-300 px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-green-700">3. เวร Workload</div>
                  <div className="text-[11px] text-slate-500">ช*, บ*, ด* (สีเขียว)</div>
                </td>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const val = workloadShifts[String(d)];
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick('workloadShifts', d)}
                      className={`border-r border-slate-200 h-10 px-0.5 select-none transition-colors ${
                        isHol ? 'bg-red-50/40' : 'bg-white'
                      } ${canEdit ? 'cursor-pointer hover:bg-green-50' : ''}`}
                    >
                      <ShiftCellDisplay rowKey="workloadShifts" value={val} isHoliday={isHol} />
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-2 py-1 text-xs font-mono font-semibold tabular-nums text-green-700">
                  {liveSummary?.workloadCount || 0}
                </td>
              </tr>

              {/* Row 4: Standby Night */}
              <tr className="border-b border-slate-200">
                <td className="sticky left-0 z-10 bg-white border-r border-slate-300 px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-sky-600">4. เวรดึก Standby</div>
                  <div className="text-[11px] text-slate-500">คลิกเพื่อสลับ ด (สีฟ้า)</div>
                </td>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const val = standbyShifts[String(d)];
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick('standbyShifts', d)}
                      className={`border-r border-slate-200 h-10 px-0.5 select-none transition-colors ${
                        isHol ? 'bg-red-50/40' : 'bg-white'
                      } ${canEdit ? 'cursor-pointer hover:bg-sky-50' : ''}`}
                    >
                      <ShiftCellDisplay rowKey="standbyShifts" value={val} isHoliday={isHol} />
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-2 py-1 text-xs font-mono font-semibold tabular-nums text-sky-600">
                  {liveSummary?.standbyCount || 0}
                </td>
              </tr>

              {/* Row 5: Public Holiday / Special Shifts (Fuchsia/Magenta - shown after Standby in Part 1 if entered) */}
              <tr className="border-b border-slate-200">
                <td className="sticky left-0 z-10 bg-white border-r border-slate-300 px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-fuchsia-600">
                    5. {specialRateLabel}
                  </div>
                  <div className="text-[11px] text-slate-500">ช, บ, ด (สีชมพูบานเย็น)</div>
                </td>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const val = publicHolidayShifts[String(d)];
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick('publicHolidayShifts', d)}
                      className={`border-r border-slate-200 h-10 px-0.5 select-none transition-colors ${
                        isHol ? 'bg-red-50/40' : 'bg-white'
                      } ${canEdit ? 'cursor-pointer hover:bg-fuchsia-50' : ''}`}
                    >
                      <ShiftCellDisplay
                        rowKey="publicHolidayShifts"
                        value={val}
                        isHoliday={isHol}
                      />
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-2 py-1 text-xs font-mono font-semibold tabular-nums text-fuchsia-600">
                  {liveSummary?.explicitPublicHolidayCount || 0}
                </td>
              </tr>

              {/* Row 6: SMC Shifts (Purple - displayed separately in SmcRosterView) */}
              <tr>
                <td className="sticky left-0 z-10 bg-white border-r border-slate-300 px-3 py-2.5 text-left">
                  <div className="text-xs font-semibold text-purple-700">6. เวร SMC</div>
                  <div className="text-[11px] text-slate-500">SMC (สีม่วง)</div>
                </td>
                {daysArray.map((d) => {
                  const isHol = holidaySet.has(d);
                  const val = smcShifts[String(d)];
                  return (
                    <td
                      key={d}
                      onClick={() => handleCellClick('smcShifts', d)}
                      className={`border-r border-slate-200 h-10 px-0.5 select-none transition-colors ${
                        isHol ? 'bg-red-50/40' : 'bg-white'
                      } ${canEdit ? 'cursor-pointer hover:bg-purple-50' : ''}`}
                    >
                      <ShiftCellDisplay rowKey="smcShifts" value={val} isHoliday={isHol} />
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-2 py-1 text-xs font-mono font-semibold tabular-nums text-purple-700">
                  {liveSummary?.smcCount || 0}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Individual Reimbursement Preview */}
      {liveSummary && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              สรุปยอดเบิกจ่ายค่าเวรรายบุคคล (คำนวณอัตโนมัติจากตารางด้านบน)
            </h3>
            <div className="text-xs text-slate-500">
              รวมเบิก OT + Standby{liveSummary.publicHolidayOtCount > 0 ? ` + ${specialRateLabel}` : ''} ={' '}
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatCurrency(liveSummary.regularOtTotal)} บาท
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5 text-left">รายการเวรนอกเวลาราชการ</th>
                  <th className="px-4 py-2.5 text-right">อัตรา (บาท)</th>
                  <th className="px-4 py-2.5 text-left">วันที่ปฏิบัติงาน</th>
                  <th className="px-4 py-2.5 text-right">จำนวนเวร</th>
                  <th className="px-4 py-2.5 text-right">จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 font-medium text-red-600">เวร OT เช้า (ช)</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {formatCurrency(liveSummary.otRate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                    {formatDayList(
                      liveSummary.hasDistinctPublicHolidayRate
                        ? liveSummary.regularOtMorningDays
                        : liveSummary.otMorningDays,
                    ) || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {liveSummary.hasDistinctPublicHolidayRate
                      ? liveSummary.regularOtMorningDays.length
                      : liveSummary.otMorningDays.length}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(liveSummary.otMorningAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-red-600">เวร OT บ่าย (บ)</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {formatCurrency(liveSummary.otRate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                    {formatDayList(
                      liveSummary.hasDistinctPublicHolidayRate
                        ? liveSummary.regularOtAfternoonDays
                        : liveSummary.otAfternoonDays,
                    ) || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {liveSummary.hasDistinctPublicHolidayRate
                      ? liveSummary.regularOtAfternoonDays.length
                      : liveSummary.otAfternoonDays.length}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(liveSummary.otAfternoonAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-red-600">เวร OT ดึก (ด)</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {formatCurrency(liveSummary.otRate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                    {formatDayList(
                      liveSummary.hasDistinctPublicHolidayRate
                        ? liveSummary.regularOtNightDays
                        : liveSummary.otNightDays,
                    ) || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {liveSummary.hasDistinctPublicHolidayRate
                      ? liveSummary.regularOtNightDays.length
                      : liveSummary.otNightDays.length}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(liveSummary.otNightAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-sky-600">เวรดึก Standby (ด)</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {formatCurrency(liveSummary.standbyRate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                    {formatDayList(liveSummary.standbyDays) || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {liveSummary.standbyDays.length}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(liveSummary.standbyAmount)}
                  </td>
                </tr>
                {[
                  { label: `${specialRateLabel} เช้า (ช)`, days: liveSummary.publicHolidayOtMorningDays },
                  { label: `${specialRateLabel} บ่าย (บ)`, days: liveSummary.publicHolidayOtAfternoonDays },
                  { label: `${specialRateLabel} ดึก (ด)`, days: liveSummary.publicHolidayOtNightDays },
                ]
                  .filter((item) => item.days.length > 0)
                  .map((item) => (
                    <tr key={item.label} className="bg-fuchsia-50/40">
                      <td className="px-4 py-2.5 font-medium text-fuchsia-700">{item.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-fuchsia-700">
                        {formatCurrency(liveSummary.publicHolidayOtRate)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-fuchsia-900">
                        {formatDayList(item.days)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-fuchsia-900">
                        {item.days.length}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-fuchsia-900">
                        {formatCurrency(item.days.length * liveSummary.publicHolidayOtRate)}
                      </td>
                    </tr>
                  ))}
                <tr className="bg-slate-50/80 font-semibold">
                  <td colSpan={3} className="px-4 py-2.5 text-slate-900">
                    รวมเบิกค่าเวร OT + Standby
                    {liveSummary.publicHolidayOtCount > 0 ? ` + ${specialRateLabel}` : ''} (
                    {numberToThaiBahtText(liveSummary.regularOtTotal)})
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                    {liveSummary.otMorningDays.length +
                      liveSummary.otAfternoonDays.length +
                      liveSummary.otNightDays.length +
                      liveSummary.explicitPublicHolidayCount +
                      liveSummary.standbyDays.length}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-teal-800">
                    {formatCurrency(liveSummary.regularOtTotal)}
                  </td>
                </tr>
                <tr className="bg-green-50/25">
                  <td className="px-4 py-2.5 font-medium text-green-700">
                    เวร Workload (ช*, บ*, ด*)
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-400">
                    -
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                    {[
                      liveSummary.workloadMorningDays.length
                        ? `ช*: ${formatDayList(liveSummary.workloadMorningDays)}`
                        : '',
                      liveSummary.workloadAfternoonDays.length
                        ? `บ*: ${formatDayList(liveSummary.workloadAfternoonDays)}`
                        : '',
                      liveSummary.workloadNightDays.length
                        ? `ด*: ${formatDayList(liveSummary.workloadNightDays)}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-green-700 font-semibold">
                    {liveSummary.workloadCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                    ไม่คิดเงิน (เบิกแยกตาราง)
                  </td>
                </tr>
                <tr className="bg-purple-50/30">
                  <td className="px-4 py-2.5 font-medium text-purple-700">
                    เวร SMC
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-400">
                    -
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                    {formatDayList(liveSummary.smcDays) || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-purple-700 font-semibold">
                    {liveSummary.smcCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                    แยกตารางเวร SMC
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
