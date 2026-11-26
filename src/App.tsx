import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  Printer,
  QrCode,
  Settings,
  ShieldCheck,
  Stethoscope,
  User as UserIcon,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL } from './firebase';
import {
  CATEGORY_SHORT_LABELS,
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  MonthlyShiftEntry,
  RosterMonth,
  StaffMember,
} from './types/roster';
import {
  ensureRosterMonth,
  ensureUserAccount,
  subscribeDepartmentSettings,
  subscribeIsAdmin,
  subscribeMonthEntries,
  subscribeRosterMonth,
  subscribeStaffList,
  updateUserLinkedStaffId,
} from './services/rosterService';
import { OCTOBER_2569_MONTH_ID } from './data/seedOctober2569';
import { calculatePersonMonthlySummary } from './utils/rosterCalculations';
import {
  formatMonthId,
  getCurrentMonthId,
  getDefaultHolidaysForMonth,
  getDefaultPayDateLabel,
  getDefaultPublicHolidaysForMonth,
  getThaiMonthYearLabel,
  parseMonthId,
} from './utils/thaiUtils';
import { getDisplayUsername } from './utils/authHelpers';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthLoginView } from './components/AuthLoginView';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { MyShiftEntryView } from './components/MyShiftEntryView';
import { DepartmentRosterView } from './components/DepartmentRosterView';
import { WorkloadRosterView } from './components/WorkloadRosterView';
import { SmcRosterView } from './components/SmcRosterView';
import { ReimbursementView } from './components/ReimbursementView';
import { DashboardView } from './components/DashboardView';
import { StaffDirectoryView } from './components/StaffDirectoryView';
import { DepartmentSettingsView } from './components/DepartmentSettingsView';
import { PrintA4Modal } from './components/PrintA4Modal';
import {
  copyTextToClipboard,
  getShareableAppUrl,
  ShareLinkModal,
} from './components/ShareLinkModal';
import { A4Orientation } from './utils/a4Print';

type ActiveView =
  | 'my-shifts'
  | 'roster'
  | 'workload-roster'
  | 'smc-roster'
  | 'reimbursement'
  | 'dashboard'
  | 'staff'
  | 'settings';

const SELECTED_STAFF_STORAGE_KEY = 'bangphli_selected_staff_id';

const NAV_ITEMS: { id: ActiveView; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'my-shifts', label: 'ลงเวรของฉัน', icon: CalendarCheck },
  { id: 'roster', label: 'ตาราง OT', icon: ClipboardList },
  { id: 'workload-roster', label: 'ตารางเวร Workload', icon: ClipboardCheck },
  { id: 'smc-roster', label: 'ตารางเวร SMC', icon: Stethoscope },
  { id: 'reimbursement', label: 'ตารางเบิกเงิน OT', icon: FileSpreadsheet },
  { id: 'dashboard', label: 'แดชบอร์ด OT & Productivity', icon: BarChart3 },
  { id: 'staff', label: 'จัดการบุคลากร', icon: Users },
  { id: 'settings', label: 'ตั้งค่าอัตราและวันหยุด', icon: Settings },
];

function WorkspaceApp({ user }: { user: User }) {
  // Always default to the live current calendar month and auto-advance when a new month begins
  const [currentMonthId, setCurrentMonthId] = useState<string>(() => getCurrentMonthId());
  const [selectedMonthId, setSelectedMonthId] = useState<string>(() => getCurrentMonthId());
  const [activeView, setActiveView] = useState<ActiveView>('my-shifts');
  const [highlightRosterStaffId, setHighlightRosterStaffId] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [shareModal, setShareModal] = useState<{ open: boolean; copied: boolean }>({
    open: false,
    copied: false,
  });
  const [signingOut, setSigningOut] = useState(false);
  const [accountDisplayName, setAccountDisplayName] = useState<string>(
    user.displayName || getDisplayUsername(user.email) || 'ผู้ใช้งาน',
  );
  const [printModal, setPrintModal] = useState<{
    open: boolean;
    title: string;
    defaultOrientation: A4Orientation;
  }>({
    open: false,
    title: 'เอกสารตารางเวร A4',
    defaultOrientation: 'landscape',
  });

  const shareUrl = useMemo(() => getShareableAppUrl(), []);

  const handleOpenShareLink = async () => {
    const copied = await copyTextToClipboard(shareUrl);
    setShareModal({ open: true, copied });
  };

  const userStaffStorageKey = `${SELECTED_STAFF_STORAGE_KEY}_${user.uid}`;

  // User-scoped remembered staff selection
  const [selectedStaffId, setSelectedStaffId] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(userStaffStorageKey) ||
        localStorage.getItem(SELECTED_STAFF_STORAGE_KEY) ||
        ''
      );
    } catch {
      return '';
    }
  });

  // Firestore real-time state
  const [settings, setSettings] = useState<DepartmentSettings>(DEFAULT_DEPARTMENT_SETTINGS);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rosterMonth, setRosterMonth] = useState<RosterMonth | null>(null);
  const [entriesByStaffId, setEntriesByStaffId] = useState<Record<string, MonthlyShiftEntry>>({});
  const [dataLoading, setDataLoading] = useState(true);

  const isBootstrappedAdmin = useMemo(
    () => Boolean(user.emailVerified && user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL),
    [user.email, user.emailVerified],
  );
  const [isAdmin, setIsAdmin] = useState<boolean>(isBootstrappedAdmin);

  const hasPasswordProvider = useMemo(
    () => user.providerData.some((provider) => provider.providerId === 'password'),
    [user.providerData],
  );
  const displayUsername = useMemo(() => getDisplayUsername(user.email), [user.email]);

  // The single staff profile owned by the signed-in user (derived authoritatively from staff.ownerUid)
  const ownedStaff = useMemo(
    () => staffList.find((s) => s.ownerUid === user.uid) || null,
    [staffList, user.uid],
  );

  // Regular users are strictly locked to their own bound staffId; Admin can switch to any staff
  const effectiveSelectedStaffId = isAdmin ? selectedStaffId : ownedStaff?.staffId || '';

  const handleSelectStaffId = (staffId: string, persistRemote = true) => {
    if (!isAdmin) {
      // Non-admin users can only ever select their own bound staff profile
      const targetId = ownedStaff?.staffId || staffId;
      if (ownedStaff && staffId !== ownedStaff.staffId) {
        return;
      }
      setSelectedStaffId(targetId);
      try {
        if (targetId) {
          localStorage.setItem(userStaffStorageKey, targetId);
        }
      } catch {
        // Ignore storage quota / private mode issues
      }
      return;
    }

    setSelectedStaffId(staffId);
    try {
      if (staffId) {
        localStorage.setItem(userStaffStorageKey, staffId);
      } else {
        localStorage.removeItem(userStaffStorageKey);
      }
    } catch {
      // Ignore storage quota / private mode issues
    }
    if (persistRemote) {
      void updateUserLinkedStaffId(user.uid, staffId).catch(() => {
        // Non-blocking sync; local selection still works immediately
      });
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      setSigningOut(false);
    }
  };

  // 0a. Real-time Admin privilege subscription (bootstrapped email or /admins/{uid})
  useEffect(() => {
    const unsubAdmin = subscribeIsAdmin(
      user.uid,
      user.email,
      Boolean(user.emailVerified),
      setIsAdmin,
    );
    return () => unsubAdmin();
  }, [user.uid, user.email, user.emailVerified]);

  // 0b. Sync authenticated user's profile in userAccounts/{uid}
  useEffect(() => {
    let cancelled = false;

    const syncAccount = async () => {
      try {
        const account = await ensureUserAccount({
          uid: user.uid,
          email: user.email || `${user.uid}@bangphli.local`,
          displayName: user.displayName || getDisplayUsername(user.email) || 'ผู้ใช้งาน',
          isAdmin: isBootstrappedAdmin,
        });
        if (cancelled) return;
        if (account.displayName) {
          setAccountDisplayName(account.displayName);
        }
        if (isAdmin && account.linkedStaffId) {
          setSelectedStaffId(account.linkedStaffId);
          try {
            localStorage.setItem(userStaffStorageKey, account.linkedStaffId);
          } catch {
            // Ignore storage issues
          }
        }
      } catch (err) {
        console.warn('Unable to sync user account profile:', err);
      }
    };

    void syncAccount();
    return () => {
      cancelled = true;
    };
  }, [user.uid, user.email, user.displayName, isBootstrappedAdmin, isAdmin, userStaffStorageKey]);

  // 1. Global settings & staff subscriptions (only mounted when authenticated)
  useEffect(() => {
    setDataLoading(true);
    const unsubSettings = subscribeDepartmentSettings(setSettings);
    const unsubStaff = subscribeStaffList((list) => {
      setStaffList(list);
      setDataLoading(false);
    });
    return () => {
      unsubSettings();
      unsubStaff();
    };
  }, []);

  // 2. Selected Month & Entries subscriptions
  useEffect(() => {
    let unsubMonth: (() => void) | undefined;
    let unsubEntries: (() => void) | undefined;
    let cancelled = false;

    const initMonth = async () => {
      await ensureRosterMonth(selectedMonthId);
      if (cancelled) return;
      unsubMonth = subscribeRosterMonth(selectedMonthId, setRosterMonth);
      unsubEntries = subscribeMonthEntries(selectedMonthId, setEntriesByStaffId);
    };

    void initMonth();

    return () => {
      cancelled = true;
      unsubMonth?.();
      unsubEntries?.();
    };
  }, [selectedMonthId]);

  // Keep currentMonthId synchronized with real calendar time (rolls over automatically into a new month)
  useEffect(() => {
    const syncLiveMonth = () => {
      const liveId = getCurrentMonthId();
      setCurrentMonthId((prevLiveId) => {
        if (prevLiveId !== liveId) {
          setSelectedMonthId((prevSelected) =>
            prevSelected === prevLiveId ? liveId : prevSelected,
          );
          return liveId;
        }
        return prevLiveId;
      });
    };

    const intervalId = window.setInterval(syncLiveMonth, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncLiveMonth();
      }
    };
    window.addEventListener('focus', syncLiveMonth);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncLiveMonth);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const effectiveMonth: RosterMonth = useMemo(() => {
    if (rosterMonth && rosterMonth.monthId === selectedMonthId) {
      return rosterMonth;
    }
    const { yearAD, monthNumber } = parseMonthId(selectedMonthId);
    return {
      monthId: selectedMonthId,
      yearAD,
      monthNumber,
      holidays: getDefaultHolidaysForMonth(yearAD, monthNumber),
      publicHolidays: getDefaultPublicHolidaysForMonth(yearAD, monthNumber),
      payDateLabel: getDefaultPayDateLabel(yearAD, monthNumber),
      status: 'open',
      visibility: 'department',
    };
  }, [rosterMonth, selectedMonthId]);

  const activeStaff = useMemo(() => staffList.filter((s) => s.active), [staffList]);

  // Auto-select first active staff ONLY for Admin when selection is empty or no longer exists
  useEffect(() => {
    if (!isAdmin || activeStaff.length === 0) return;
    const stillValid = activeStaff.some((s) => s.staffId === selectedStaffId);
    if (!stillValid) {
      handleSelectStaffId(ownedStaff?.staffId || activeStaff[0].staffId, false);
    }
  }, [isAdmin, activeStaff, selectedStaffId, ownedStaff?.staffId]);

  const summaries = useMemo(
    () =>
      activeStaff.map((staff) =>
        calculatePersonMonthlySummary(
          staff,
          entriesByStaffId[staff.staffId] || null,
          effectiveMonth,
          settings,
        ),
      ),
    [activeStaff, entriesByStaffId, effectiveMonth, settings],
  );

  const shiftMonth = (delta: number) => {
    const { yearAD, monthNumber } = parseMonthId(selectedMonthId);
    const nextDate = new Date(yearAD, monthNumber - 1 + delta, 1);
    setSelectedMonthId(formatMonthId(nextDate.getFullYear(), nextDate.getMonth() + 1));
  };

  const handleOpenDepartmentRoster = (staffId?: string) => {
    setHighlightRosterStaffId(staffId || effectiveSelectedStaffId);
    setActiveView('roster');
  };

  const handleOpenWorkloadRoster = (staffId?: string) => {
    setHighlightRosterStaffId(staffId || effectiveSelectedStaffId);
    setActiveView('workload-roster');
  };

  const handleOpenSmcRoster = (staffId?: string) => {
    setHighlightRosterStaffId(staffId || effectiveSelectedStaffId);
    setActiveView('smc-roster');
  };

  const handleEditStaffFromRoster = (staffId: string) => {
    if (!isAdmin && staffId !== ownedStaff?.staffId) {
      return;
    }
    if (isAdmin) {
      handleSelectStaffId(staffId);
    }
    setActiveView('my-shifts');
  };

  const currentNavLabel =
    NAV_ITEMS.find((item) => item.id === activeView)?.label || 'ลงเวรของฉัน';

  const isPrintableView =
    activeView === 'my-shifts' ||
    activeView === 'roster' ||
    activeView === 'workload-roster' ||
    activeView === 'smc-roster' ||
    activeView === 'reimbursement' ||
    activeView === 'dashboard';

  const handleOpenPrintA4 = (customTitle?: string, orientation: A4Orientation = 'landscape') => {
    const monthLabel = getThaiMonthYearLabel(effectiveMonth.yearAD, effectiveMonth.monthNumber);
    const defaultTitleByView: Record<ActiveView, string> = {
      'my-shifts': `ตารางเวรรายบุคคล ประจำเดือน ${monthLabel}`,
      roster: `ตารางปฏิบัติงานประจำเดือน ${monthLabel}`,
      'workload-roster': `ตารางปฏิบัติงานเวร Workload ประจำเดือน ${monthLabel}`,
      'smc-roster': `ตารางปฏิบัติงานเวร SMC ประจำเดือน ${monthLabel}`,
      reimbursement: `หลักฐานการเบิกจ่ายเงินตอบแทน OT ประจำเดือน ${monthLabel}`,
      dashboard: `แดชบอร์ดยอด OT อัตรากำลัง และ Productivity งานวิสัญญี ${monthLabel}`,
      staff: `รายชื่อบุคลากร ${settings.departmentName}`,
      settings: `ตั้งค่าอัตราและวันหยุด ${monthLabel}`,
    };
    setPrintModal({
      open: true,
      title: customTitle || defaultTitleByView[activeView],
      defaultOrientation: orientation,
    });
  };

  const getActivePrintableElement = () => {
    return document.querySelector<HTMLElement>('main .print-full-width');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (256px) */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="text-base font-bold text-slate-900 tracking-tight truncate">
            {settings.departmentName}
          </div>
          <div className="text-xs text-slate-500 truncate mt-0.5">
            {settings.hospitalName}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Staff Profile Switcher (Admin Only) / Bound Self Profile (Staff) & Account Box */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          {isAdmin ? (
            <div className="space-y-1.5">
              <label
                htmlFor="sidebar-staff-picker"
                className="flex items-center justify-between text-[11px] font-semibold text-teal-800"
              >
                <span>เลือกชื่อลงเวร (Admin)</span>
                <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              </label>
              {activeStaff.length > 0 ? (
                <select
                  id="sidebar-staff-picker"
                  value={effectiveSelectedStaffId}
                  onChange={(e) => handleSelectStaffId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {activeStaff.map((s) => (
                    <option key={s.staffId} value={s.staffId}>
                      {s.orderIndex}. {s.fullName} ({CATEGORY_SHORT_LABELS[s.category]})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-slate-500">ยังไม่มีรายชื่อบุคลากร</div>
              )}
            </div>
          ) : ownedStaff ? (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-teal-700">
                <Lock className="w-3 h-3 shrink-0" />
                <span>ลงเวรเฉพาะชื่อของตนเอง</span>
              </div>
              <div className="text-xs font-semibold text-slate-900 truncate" title={ownedStaff.fullName}>
                {ownedStaff.orderIndex}. {ownedStaff.fullName}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {CATEGORY_SHORT_LABELS[ownedStaff.category]}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setActiveView('my-shifts')}
              className="w-full text-left p-2.5 rounded-lg bg-amber-50 hover:bg-amber-100/80 border border-amber-200 transition-colors space-y-1 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>ยังไม่ได้ผูกชื่อของคุณ</span>
              </div>
              <div className="text-[11px] text-amber-700">
                กดเพื่อเลือกชื่อบุคลากรของตนเองก่อนลงเวร
              </div>
            </button>
          )}

          <div className="pt-2.5 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {accountDisplayName}
                  </span>
                  {isAdmin && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded shrink-0">
                      Admin
                    </span>
                  )}
                </div>
                {displayUsername && (
                  <div className="text-[11px] text-slate-500 truncate">
                    @{displayUsername}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {hasPasswordProvider && (
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">เปลี่ยนรหัส</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{signingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200">
            <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900 truncate">
                {settings.departmentName}
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-3">
              {isAdmin ? (
                activeStaff.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-teal-800">
                      <span>เลือกชื่อลงเวร (Admin)</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                    </label>
                    <select
                      value={effectiveSelectedStaffId}
                      onChange={(e) => {
                        handleSelectStaffId(e.target.value);
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {activeStaff.map((s) => (
                        <option key={s.staffId} value={s.staffId}>
                          {s.orderIndex}. {s.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : ownedStaff ? (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-teal-700">
                    <Lock className="w-3 h-3 shrink-0" />
                    <span>ลงเวรเฉพาะชื่อของตนเอง</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {ownedStaff.orderIndex}. {ownedStaff.fullName}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('my-shifts');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-0.5"
                >
                  <div className="text-[11px] font-semibold text-amber-800">
                    ยังไม่ได้ผูกชื่อของคุณ
                  </div>
                  <div className="text-[11px] text-amber-700">กดเพื่อเลือกชื่อก่อนลงเวร</div>
                </button>
              )}

              <div className="pt-2.5 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                    {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {accountDisplayName}
                      </span>
                      {isAdmin && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded shrink-0">
                          Admin
                        </span>
                      )}
                    </div>
                    {displayUsername && (
                      <div className="text-[11px] text-slate-500 truncate">
                        @{displayUsername}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {hasPasswordProvider && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setChangePasswordOpen(true);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>เปลี่ยนรหัส</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>{signingOut ? 'กำลังออก...' : 'ออกจากระบบ'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Bar */}
        <header className="no-print bg-white border-b border-slate-200 px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg"
              aria-label="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate">
                จัดการตารางเวร
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {currentNavLabel}
              </span>
            </div>
          </div>

          {/* Right Header Controls: Share Link + Print A4 + Month Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleOpenShareLink()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="คัดลอกลิงก์และสร้าง QR Code ส่งให้เพื่อนในแผนก"
            >
              <QrCode className="w-3.5 h-3.5 text-teal-700" />
              <span className="hidden md:inline">ส่งลิงก์ / QR</span>
              <span className="hidden sm:inline md:hidden">ลิงก์ / QR</span>
            </button>

            {isPrintableView && !dataLoading && (
              <button
                type="button"
                onClick={() => handleOpenPrintA4()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="เชื่อมต่อเครื่องพิมพ์ (Printer) และพิมพ์ขนาด A4"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">พิมพ์ A4</span>
              </button>
            )}

            {/* Month Switcher Control */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                aria-label="เดือนก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-2.5 text-xs font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                {getThaiMonthYearLabel(effectiveMonth.yearAD, effectiveMonth.monthNumber)}
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                aria-label="เดือนถัดไป"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {selectedMonthId !== currentMonthId && (
                <button
                  type="button"
                  onClick={() => setSelectedMonthId(currentMonthId)}
                  className="px-2 py-1 text-[11px] font-semibold text-teal-800 bg-white hover:bg-teal-50 border border-teal-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  title="กลับไปยังเดือนปัจจุบัน"
                >
                  เดือนนี้
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-8 min-w-0">
          {dataLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
              <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
              <div className="h-40 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : (
            <>
              {activeView === 'my-shifts' && (
                <MyShiftEntryView
                  currentUserUid={user.uid}
                  currentUserEmail={user.email || `${user.uid}@bangphli.local`}
                  currentUserDisplayName={accountDisplayName}
                  isAdmin={isAdmin}
                  ownedStaff={ownedStaff}
                  selectedStaffId={effectiveSelectedStaffId}
                  onSelectStaffId={handleSelectStaffId}
                  staffList={staffList}
                  month={effectiveMonth}
                  entriesByStaffId={entriesByStaffId}
                  settings={settings}
                  onOpenDepartmentRoster={handleOpenDepartmentRoster}
                  onOpenWorkloadRoster={handleOpenWorkloadRoster}
                  onOpenSmcRoster={handleOpenSmcRoster}
                  onPrintA4={(title) => handleOpenPrintA4(title)}
                />
              )}

              {activeView === 'roster' && (
                <DepartmentRosterView
                  currentUserUid={user.uid}
                  isAdmin={isAdmin}
                  month={effectiveMonth}
                  settings={settings}
                  summaries={summaries}
                  highlightStaffId={highlightRosterStaffId}
                  onEditStaffShifts={handleEditStaffFromRoster}
                  onOpenWorkloadRoster={() => handleOpenWorkloadRoster()}
                  onOpenSmcRoster={() => handleOpenSmcRoster()}
                  onPrintA4={(title) => handleOpenPrintA4(title)}
                />
              )}

              {activeView === 'workload-roster' && (
                <WorkloadRosterView
                  currentUserUid={user.uid}
                  isAdmin={isAdmin}
                  month={effectiveMonth}
                  settings={settings}
                  summaries={summaries}
                  highlightStaffId={highlightRosterStaffId}
                  onEditStaffShifts={handleEditStaffFromRoster}
                  onPrintA4={(title) => handleOpenPrintA4(title)}
                />
              )}

              {activeView === 'smc-roster' && (
                <SmcRosterView
                  currentUserUid={user.uid}
                  isAdmin={isAdmin}
                  month={effectiveMonth}
                  settings={settings}
                  summaries={summaries}
                  highlightStaffId={highlightRosterStaffId}
                  onEditStaffShifts={handleEditStaffFromRoster}
                  onPrintA4={(title) => handleOpenPrintA4(title)}
                />
              )}

              {activeView === 'reimbursement' && (
                <ReimbursementView
                  month={effectiveMonth}
                  settings={settings}
                  summaries={summaries}
                  onPrintA4={(title) => handleOpenPrintA4(title)}
                />
              )}

              {activeView === 'dashboard' && (
                <DashboardView
                  currentUserUid={user.uid}
                  isAdmin={isAdmin}
                  month={effectiveMonth}
                  settings={settings}
                  summaries={summaries}
                  activeStaff={activeStaff}
                  entriesByStaffId={entriesByStaffId}
                  onSelectMonthId={setSelectedMonthId}
                  onEditStaffShifts={handleEditStaffFromRoster}
                  onPrintA4={(title) => handleOpenPrintA4(title)}
                />
              )}

              {activeView === 'staff' && (
                <StaffDirectoryView
                  currentUserUid={user.uid}
                  isAdmin={isAdmin}
                  isBootstrappedAdmin={isBootstrappedAdmin}
                  staffList={staffList}
                  onSwitchToOctober2569={() => setSelectedMonthId(OCTOBER_2569_MONTH_ID)}
                />
              )}

              {activeView === 'settings' && (
                <DepartmentSettingsView
                  isAdmin={isAdmin}
                  settings={settings}
                  month={effectiveMonth}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Global A4 Printer & Preview Modal */}
      <PrintA4Modal
        isOpen={printModal.open}
        onClose={() => setPrintModal((prev) => ({ ...prev, open: false }))}
        documentTitle={printModal.title}
        defaultOrientation={printModal.defaultOrientation}
        getSourceElement={getActivePrintableElement}
      />

      {/* Change Password Modal (for Password-authenticated users) */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        user={user}
        onClose={() => setChangePasswordOpen(false)}
      />

      {/* Share Department Link Modal */}
      <ShareLinkModal
        isOpen={shareModal.open}
        onClose={() => setShareModal({ open: false, copied: false })}
        departmentName={settings.departmentName}
        hospitalName={settings.hospitalName}
        shareUrl={shareUrl}
        initialCopied={shareModal.copied}
      />
    </div>
  );
}

function AuthGate() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setCurrentUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl px-8 py-7 shadow-sm text-center space-y-3 max-w-sm w-full">
          <div className="w-10 h-10 mx-auto rounded-full border-2 border-teal-200 border-t-teal-700 animate-spin" />
          <div className="text-sm font-semibold text-slate-900">
            กำลังตรวจสอบสถานะการเข้าสู่ระบบ...
          </div>
          <div className="text-xs text-slate-500">
            {DEFAULT_DEPARTMENT_SETTINGS.departmentName} • {DEFAULT_DEPARTMENT_SETTINGS.hospitalName}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthLoginView />;
  }

  return <WorkspaceApp key={currentUser.uid} user={currentUser} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  );
}
