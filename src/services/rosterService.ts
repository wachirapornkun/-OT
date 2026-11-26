import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  OCTOBER_2569_HOLIDAYS,
  OCTOBER_2569_MONTH_ID,
  OCTOBER_2569_PAY_LABEL,
  OCTOBER_2569_PUBLIC_HOLIDAYS,
  SEED_OCTOBER_2569_DATA,
} from '../data/seedOctober2569';
import {
  AnesthesiaProductivityInput,
  DEFAULT_ANESTHESIA_PRODUCTIVITY,
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  MainShiftCode,
  MonthlyShiftEntry,
  NightShiftCode,
  PublicHolidayShiftCode,
  RosterMonth,
  SmcShiftCode,
  StaffCategory,
  StaffMember,
  StandbyShiftCode,
  UserAccount,
  WorkloadShiftCode,
} from '../types/roster';
import {
  getDefaultHolidaysForMonth,
  getDefaultPayDateLabel,
  getDefaultPublicHolidaysForMonth,
  parseMonthId,
} from '../utils/thaiUtils';

function sanitizeId(raw: string, maxLen = 64): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, maxLen);
  return cleaned || `id_${Date.now()}`;
}

export function cleanShiftMap<T extends string>(
  raw: Record<string, T>,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw)) {
    const dayNum = Number(k);
    if (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31 && v && v.trim() !== '') {
      result[String(dayNum)] = v;
    }
  }
  return result;
}

export async function checkIsAdmin(
  uid: string,
  email: string | null,
  emailVerified = false,
): Promise<boolean> {
  if (emailVerified && email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (error) {
    // Non-admin read of non-existent doc still allowed for own uid; treat permission error safely
    console.warn('Admin check fallback:', error);
    return false;
  }
}

export function subscribeIsAdmin(
  uid: string,
  email: string | null,
  emailVerified: boolean,
  onChange: (isAdmin: boolean) => void,
): Unsubscribe {
  if (emailVerified && email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
    onChange(true);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'admins', uid),
    (snap) => {
      onChange(snap.exists());
    },
    (error) => {
      console.warn('Admin subscription fallback:', error);
      onChange(false);
    },
  );
}

export function subscribeAllUserAccountsAdmin(
  onData: (accounts: UserAccount[]) => void,
): Unsubscribe {
  const path = 'userAccounts';
  return onSnapshot(
    collection(db, 'userAccounts'),
    (snapshot) => {
      const list: UserAccount[] = snapshot.docs.map((d) => {
        const raw = d.data() as Partial<UserAccount>;
        return {
          uid: raw.uid || d.id,
          email: raw.email || '',
          displayName: raw.displayName || '',
          linkedStaffId: raw.linkedStaffId || '',
          role: raw.role === 'admin' ? 'admin' : 'staff',
        };
      });
      list.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'th'));
      onData(list);
    },
    (error) => {
      console.warn('Unable to list user accounts:', error);
      onData([]);
      void path;
    },
  );
}

export function subscribeAdminUids(onData: (adminUids: string[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.id));
    },
    (error) => {
      console.warn('Unable to list admin UIDs:', error);
      onData([]);
    },
  );
}

export async function grantAdminRole(targetUid: string): Promise<void> {
  const cleanUid = sanitizeId(targetUid, 128);
  const path = `admins/${cleanUid}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      createdAt: serverTimestamp(),
    });
    const acctRef = doc(db, 'userAccounts', cleanUid);
    const acctSnap = await getDoc(acctRef);
    if (acctSnap.exists()) {
      batch.update(acctRef, {
        role: 'admin',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function revokeAdminRole(targetUid: string): Promise<void> {
  const cleanUid = sanitizeId(targetUid, 128);
  const path = `admins/${cleanUid}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'admins', cleanUid));
    const acctRef = doc(db, 'userAccounts', cleanUid);
    const acctSnap = await getDoc(acctRef);
    if (acctSnap.exists()) {
      batch.update(acctRef, {
        role: 'staff',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function ensureUserAccount(params: {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}): Promise<UserAccount> {
  const path = `userAccounts/${params.uid}`;
  const ref = doc(db, 'userAccounts', params.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as UserAccount;
      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName || params.displayName,
        linkedStaffId: data.linkedStaffId || '',
        role: params.isAdmin ? 'admin' : data.role || 'staff',
      };
    }

    const newAccount = {
      uid: params.uid,
      email: params.email.slice(0, 254),
      displayName: (params.displayName || params.email.split('@')[0] || 'ผู้ใช้งาน').slice(0, 120),
      linkedStaffId: '',
      role: params.isAdmin ? 'admin' : 'staff',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, newAccount);
    return {
      uid: params.uid,
      email: newAccount.email,
      displayName: newAccount.displayName,
      linkedStaffId: '',
      role: newAccount.role as 'staff' | 'admin',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserLinkedStaffId(uid: string, linkedStaffId: string): Promise<void> {
  const path = `userAccounts/${uid}`;
  try {
    await updateDoc(doc(db, 'userAccounts', uid), {
      linkedStaffId: linkedStaffId ? sanitizeId(linkedStaffId, 64) : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeDepartmentSettings(
  onData: (settings: DepartmentSettings) => void,
): Unsubscribe {
  const path = 'settings/department';
  return onSnapshot(
    doc(db, 'settings', 'department'),
    (snap) => {
      if (snap.exists()) {
        const raw = snap.data() as Partial<DepartmentSettings>;
        const merged: DepartmentSettings = {
          ...DEFAULT_DEPARTMENT_SETTINGS,
          ...raw,
          rnPublicHolidayOtRate:
            raw.rnPublicHolidayOtRate ?? raw.rnOtRate ?? DEFAULT_DEPARTMENT_SETTINGS.rnPublicHolidayOtRate,
          pnPublicHolidayOtRate:
            raw.pnPublicHolidayOtRate ?? raw.pnOtRate ?? DEFAULT_DEPARTMENT_SETTINGS.pnPublicHolidayOtRate,
          naPublicHolidayOtRate:
            raw.naPublicHolidayOtRate ?? raw.naOtRate ?? DEFAULT_DEPARTMENT_SETTINGS.naPublicHolidayOtRate,
          publicHolidayRateLabel:
            raw.publicHolidayRateLabel?.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel,
        };
        onData(merged);
      } else {
        onData(DEFAULT_DEPARTMENT_SETTINGS);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export async function saveDepartmentSettings(settings: DepartmentSettings): Promise<void> {
  const path = 'settings/department';
  const ref = doc(db, 'settings', 'department');
  try {
    const rnOtRate = Math.max(0, Math.min(50000, Number(settings.rnOtRate) || 0));
    const pnOtRate = Math.max(0, Math.min(50000, Number(settings.pnOtRate) || 0));
    const naOtRate = Math.max(0, Math.min(50000, Number(settings.naOtRate) || 0));
    const payload = {
      hospitalName: settings.hospitalName.trim().slice(0, 160) || DEFAULT_DEPARTMENT_SETTINGS.hospitalName,
      departmentName: settings.departmentName.trim().slice(0, 160) || DEFAULT_DEPARTMENT_SETTINGS.departmentName,
      schedulerName: settings.schedulerName.trim().slice(0, 120),
      schedulerTitle: settings.schedulerTitle.trim().slice(0, 160),
      schedulerPosition: settings.schedulerPosition.trim().slice(0, 160),
      approverName: settings.approverName.trim().slice(0, 120),
      approverTitle: settings.approverTitle.trim().slice(0, 160),
      approverPosition: settings.approverPosition.trim().slice(0, 160),
      rnOtRate,
      rnWorkloadRate: Math.max(0, Math.min(50000, Number(settings.rnWorkloadRate) || 0)),
      rnStandbyRate: Math.max(0, Math.min(50000, Number(settings.rnStandbyRate) || 0)),
      rnPublicHolidayOtRate: Math.max(
        0,
        Math.min(50000, Number(settings.rnPublicHolidayOtRate ?? rnOtRate) || 0),
      ),
      pnOtRate,
      pnWorkloadRate: Math.max(0, Math.min(50000, Number(settings.pnWorkloadRate) || 0)),
      pnStandbyRate: Math.max(0, Math.min(50000, Number(settings.pnStandbyRate) || 0)),
      pnPublicHolidayOtRate: Math.max(
        0,
        Math.min(50000, Number(settings.pnPublicHolidayOtRate ?? pnOtRate) || 0),
      ),
      naOtRate,
      naWorkloadRate: Math.max(0, Math.min(50000, Number(settings.naWorkloadRate) || 0)),
      naStandbyRate: Math.max(0, Math.min(50000, Number(settings.naStandbyRate) || 0)),
      naPublicHolidayOtRate: Math.max(
        0,
        Math.min(50000, Number(settings.naPublicHolidayOtRate ?? naOtRate) || 0),
      ),
      publicHolidayRateLabel:
        (settings.publicHolidayRateLabel || '').trim().slice(0, 100) ||
        DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel,
      visibility: 'department' as const,
      updatedAt: serverTimestamp(),
    };
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const { visibility: _v, ...updatePayload } = payload;
      await updateDoc(ref, updatePayload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updatePublicHolidayRateLabel(label: string): Promise<void> {
  const path = 'settings/department';
  const ref = doc(db, 'settings', 'department');
  try {
    const cleaned =
      label.trim().slice(0, 100) || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        publicHolidayRateLabel: cleaned,
        updatedAt: serverTimestamp(),
      });
    } else {
      await saveDepartmentSettings({
        ...DEFAULT_DEPARTMENT_SETTINGS,
        publicHolidayRateLabel: cleaned,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeStaffList(onData: (staff: StaffMember[]) => void): Unsubscribe {
  const path = 'staff';
  const q = query(
    collection(db, 'staff'),
    where('visibility', '==', 'department'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StaffMember[] = snapshot.docs.map((d) => d.data() as StaffMember);
      list.sort((a, b) => a.orderIndex - b.orderIndex || a.fullName.localeCompare(b.fullName, 'th'));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function createStaffMember(input: {
  fullName: string;
  category: StaffCategory;
  positionLabel: string;
  positionSubLabel: string;
  orderIndex: number;
  ownerUid: string;
  staffId?: string;
}): Promise<string> {
  const staffId = sanitizeId(
    input.staffId || `${input.category.toLowerCase()}_${Date.now().toString(36)}`,
    64,
  );
  const path = `staff/${staffId}`;
  try {
    await setDoc(doc(db, 'staff', staffId), {
      staffId,
      orderIndex: Math.max(1, Math.min(999, Math.round(input.orderIndex || 1))),
      fullName: input.fullName.trim().slice(0, 120),
      category: input.category,
      positionLabel: input.positionLabel.trim().slice(0, 100),
      positionSubLabel: input.positionSubLabel.trim().slice(0, 120),
      ownerUid: input.ownerUid ? sanitizeId(input.ownerUid, 128) : '',
      active: true,
      visibility: 'department',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return staffId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStaffMemberAdmin(
  staffId: string,
  updates: Partial<Pick<StaffMember, 'orderIndex' | 'fullName' | 'category' | 'positionLabel' | 'positionSubLabel' | 'ownerUid' | 'active'>>,
): Promise<void> {
  const path = `staff/${staffId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.orderIndex !== undefined) {
      clean.orderIndex = Math.max(1, Math.min(999, Math.round(updates.orderIndex)));
    }
    if (updates.fullName !== undefined) clean.fullName = updates.fullName.trim().slice(0, 120);
    if (updates.category !== undefined) clean.category = updates.category;
    if (updates.positionLabel !== undefined) clean.positionLabel = updates.positionLabel.trim().slice(0, 100);
    if (updates.positionSubLabel !== undefined) clean.positionSubLabel = updates.positionSubLabel.trim().slice(0, 120);
    if (updates.ownerUid !== undefined) clean.ownerUid = updates.ownerUid ? sanitizeId(updates.ownerUid, 128) : '';
    if (updates.active !== undefined) clean.active = Boolean(updates.active);

    await updateDoc(doc(db, 'staff', staffId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Atomically binds an unclaimed staff profile to the signed-in user's account
 * so each regular login can edit ONLY their own shifts.
 */
export async function claimStaffProfile(
  staffId: string,
  uid: string,
  accountFallback?: { email: string; displayName: string },
): Promise<void> {
  const cleanStaffId = sanitizeId(staffId, 64);
  const cleanUid = sanitizeId(uid, 128);
  const path = `staff/${cleanStaffId}`;
  try {
    const acctRef = doc(db, 'userAccounts', cleanUid);
    const acctSnap = await getDoc(acctRef);
    if (!acctSnap.exists()) {
      await ensureUserAccount({
        uid: cleanUid,
        email: accountFallback?.email || `${cleanUid}@bangphli.local`,
        displayName: accountFallback?.displayName || 'ผู้ใช้งาน',
        isAdmin: false,
      });
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'staff', cleanStaffId), {
      ownerUid: cleanUid,
      updatedAt: serverTimestamp(),
    });
    batch.update(acctRef, {
      linkedStaffId: cleanStaffId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Atomically creates a new staff profile owned by the signed-in regular user
 * and binds their userAccount to it in a single Firestore batch.
 */
export async function createOwnStaffProfile(
  input: {
    fullName: string;
    category: StaffCategory;
    positionLabel: string;
    positionSubLabel: string;
    orderIndex: number;
  },
  uid: string,
  accountFallback?: { email: string; displayName: string },
): Promise<string> {
  const cleanUid = sanitizeId(uid, 128);
  const staffId = sanitizeId(`${input.category.toLowerCase()}_${Date.now().toString(36)}`, 64);
  const path = `staff/${staffId}`;
  try {
    const acctRef = doc(db, 'userAccounts', cleanUid);
    const acctSnap = await getDoc(acctRef);
    if (!acctSnap.exists()) {
      await ensureUserAccount({
        uid: cleanUid,
        email: accountFallback?.email || `${cleanUid}@bangphli.local`,
        displayName: accountFallback?.displayName || input.fullName.trim() || 'ผู้ใช้งาน',
        isAdmin: false,
      });
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'staff', staffId), {
      staffId,
      orderIndex: Math.max(1, Math.min(999, Math.round(input.orderIndex || 1))),
      fullName: input.fullName.trim().slice(0, 120),
      category: input.category,
      positionLabel: input.positionLabel.trim().slice(0, 100),
      positionSubLabel: input.positionSubLabel.trim().slice(0, 120),
      ownerUid: cleanUid,
      active: true,
      visibility: 'department',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(acctRef, {
      linkedStaffId: staffId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return staffId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Admin-only: unlinks a staff profile from its bound user account so the user can re-bind.
 */
export async function unlinkStaffProfileAdmin(
  staffId: string,
  previousOwnerUid: string,
): Promise<void> {
  const cleanStaffId = sanitizeId(staffId, 64);
  const path = `staff/${cleanStaffId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'staff', cleanStaffId), {
      ownerUid: '',
      updatedAt: serverTimestamp(),
    });
    if (previousOwnerUid) {
      const cleanPrevUid = sanitizeId(previousOwnerUid, 128);
      const acctRef = doc(db, 'userAccounts', cleanPrevUid);
      const acctSnap = await getDoc(acctRef);
      if (acctSnap.exists() && acctSnap.data()?.linkedStaffId === cleanStaffId) {
        batch.update(acctRef, {
          linkedStaffId: '',
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStaffMember(staffId: string): Promise<void> {
  const path = `staff/${staffId}`;
  try {
    await deleteDoc(doc(db, 'staff', staffId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function ensureRosterMonth(monthId: string): Promise<RosterMonth> {
  const path = `months/${monthId}`;
  const ref = doc(db, 'months', monthId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as RosterMonth;
    }
    const { yearAD, monthNumber } = parseMonthId(monthId);
    const holidays =
      monthId === OCTOBER_2569_MONTH_ID
        ? OCTOBER_2569_HOLIDAYS
        : getDefaultHolidaysForMonth(yearAD, monthNumber);
    const publicHolidays =
      monthId === OCTOBER_2569_MONTH_ID
        ? OCTOBER_2569_PUBLIC_HOLIDAYS
        : getDefaultPublicHolidaysForMonth(yearAD, monthNumber);
    const payDateLabel =
      monthId === OCTOBER_2569_MONTH_ID
        ? OCTOBER_2569_PAY_LABEL
        : getDefaultPayDateLabel(yearAD, monthNumber);

    const docData = {
      monthId,
      yearAD,
      monthNumber,
      holidays,
      publicHolidays,
      payDateLabel,
      status: 'open' as const,
      visibility: 'department' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, docData);
    return {
      monthId,
      yearAD,
      monthNumber,
      holidays,
      publicHolidays,
      payDateLabel,
      status: 'open',
      visibility: 'department',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeRosterMonth(
  monthId: string,
  onData: (month: RosterMonth | null) => void,
): Unsubscribe {
  const path = `months/${monthId}`;
  return onSnapshot(
    doc(db, 'months', monthId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as RosterMonth) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

function sanitizeProductivityInput(
  raw: Partial<AnesthesiaProductivityInput>,
): AnesthesiaProductivityInput {
  const clampNum = (val: unknown, fallback: number, min: number, max: number) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;
  };
  const validMode =
    raw.mode === 'asa' || raw.mode === 'cases' || raw.mode === 'directHours'
      ? raw.mode
      : DEFAULT_ANESTHESIA_PRODUCTIVITY.mode;
  return {
    mode: validMode,
    staffScope: raw.staffScope === 'ALL' ? 'ALL' : 'RN',
    hoursPerShift: clampNum(raw.hoursPerShift, DEFAULT_ANESTHESIA_PRODUCTIVITY.hoursPerShift, 1, 24),
    reliefFactor: clampNum(raw.reliefFactor, DEFAULT_ANESTHESIA_PRODUCTIVITY.reliefFactor, 1, 2),
    includeWorkloadInOt: Boolean(
      raw.includeWorkloadInOt ?? DEFAULT_ANESTHESIA_PRODUCTIVITY.includeWorkloadInOt,
    ),
    includeSmcInOt: Boolean(raw.includeSmcInOt ?? DEFAULT_ANESTHESIA_PRODUCTIVITY.includeSmcInOt),
    includeStandbyInHours: Boolean(
      raw.includeStandbyInHours ?? DEFAULT_ANESTHESIA_PRODUCTIVITY.includeStandbyInHours,
    ),
    asa1Cases: clampNum(raw.asa1Cases, 0, 0, 100000),
    asa1HoursPerCase: clampNum(
      raw.asa1HoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.asa1HoursPerCase,
      0,
      48,
    ),
    asa2Cases: clampNum(raw.asa2Cases, 0, 0, 100000),
    asa2HoursPerCase: clampNum(
      raw.asa2HoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.asa2HoursPerCase,
      0,
      48,
    ),
    asa3Cases: clampNum(raw.asa3Cases, 0, 0, 100000),
    asa3HoursPerCase: clampNum(
      raw.asa3HoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.asa3HoursPerCase,
      0,
      48,
    ),
    asa4Cases: clampNum(raw.asa4Cases, 0, 0, 100000),
    asa4HoursPerCase: clampNum(
      raw.asa4HoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.asa4HoursPerCase,
      0,
      48,
    ),
    asa5Cases: clampNum(raw.asa5Cases, 0, 0, 100000),
    asa5HoursPerCase: clampNum(
      raw.asa5HoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.asa5HoursPerCase,
      0,
      48,
    ),
    gaCases: clampNum(raw.gaCases, 0, 0, 100000),
    gaHoursPerCase: clampNum(
      raw.gaHoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.gaHoursPerCase,
      0,
      48,
    ),
    gaComplexCases: clampNum(raw.gaComplexCases, 0, 0, 100000),
    gaComplexHoursPerCase: clampNum(
      raw.gaComplexHoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.gaComplexHoursPerCase,
      0,
      48,
    ),
    regionalCases: clampNum(raw.regionalCases, 0, 0, 100000),
    regionalHoursPerCase: clampNum(
      raw.regionalHoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.regionalHoursPerCase,
      0,
      48,
    ),
    macCases: clampNum(raw.macCases, 0, 0, 100000),
    macHoursPerCase: clampNum(
      raw.macHoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.macHoursPerCase,
      0,
      48,
    ),
    clinicVisitCases: clampNum(raw.clinicVisitCases, 0, 0, 100000),
    clinicVisitHoursPerCase: clampNum(
      raw.clinicVisitHoursPerCase,
      DEFAULT_ANESTHESIA_PRODUCTIVITY.clinicVisitHoursPerCase,
      0,
      48,
    ),
    directRequiredHours: clampNum(raw.directRequiredHours, 0, 0, 500000),
  };
}

export async function updateRosterMonthAdmin(
  monthId: string,
  updates: Partial<
    Pick<
      RosterMonth,
      | 'holidays'
      | 'publicHolidays'
      | 'payDateLabel'
      | 'status'
      | 'headerNote'
      | 'workloadHeaderNote'
      | 'smcHeaderNote'
      | 'productivity'
    >
  >,
): Promise<void> {
  const path = `months/${monthId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.holidays !== undefined) {
      clean.holidays = Array.from(
        new Set(updates.holidays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)),
      ).sort((a, b) => a - b);
    }
    if (updates.publicHolidays !== undefined) {
      clean.publicHolidays = Array.from(
        new Set(updates.publicHolidays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)),
      ).sort((a, b) => a - b);
    }
    if (updates.payDateLabel !== undefined) {
      clean.payDateLabel = updates.payDateLabel.trim().slice(0, 40);
    }
    if (updates.headerNote !== undefined) {
      clean.headerNote = updates.headerNote.slice(0, 120);
    }
    if (updates.workloadHeaderNote !== undefined) {
      clean.workloadHeaderNote = updates.workloadHeaderNote.slice(0, 120);
    }
    if (updates.smcHeaderNote !== undefined) {
      clean.smcHeaderNote = updates.smcHeaderNote.slice(0, 120);
    }
    if (updates.productivity !== undefined) {
      clean.productivity = sanitizeProductivityInput(updates.productivity);
    }
    if (updates.status !== undefined) {
      clean.status = updates.status;
    }
    await updateDoc(doc(db, 'months', monthId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Ensures the target month document exists and persists sanitized monthly Productivity parameters.
 */
export async function saveMonthProductivity(
  monthId: string,
  productivity: Partial<AnesthesiaProductivityInput>,
): Promise<AnesthesiaProductivityInput> {
  const sanitized = sanitizeProductivityInput(productivity);
  await ensureRosterMonth(monthId);
  await updateRosterMonthAdmin(monthId, { productivity: sanitized });
  return sanitized;
}

export function subscribeMonthEntries(
  monthId: string,
  onData: (entriesByStaffId: Record<string, MonthlyShiftEntry>) => void,
): Unsubscribe {
  const path = `months/${monthId}/entries`;
  const q = query(
    collection(db, 'months', monthId, 'entries'),
    where('visibility', '==', 'department'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, MonthlyShiftEntry> = {};
      snapshot.docs.forEach((d) => {
        const entry = d.data() as MonthlyShiftEntry;
        map[entry.staffId] = entry;
      });
      onData(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function saveShiftEntry(params: {
  monthId: string;
  staffId: string;
  ownerUid: string;
  mainShifts: Record<string, MainShiftCode>;
  nightShifts: Record<string, NightShiftCode>;
  workloadShifts: Record<string, WorkloadShiftCode>;
  standbyShifts: Record<string, StandbyShiftCode>;
  publicHolidayShifts?: Record<string, PublicHolidayShiftCode>;
  smcShifts?: Record<string, SmcShiftCode>;
}): Promise<void> {
  const path = `months/${params.monthId}/entries/${params.staffId}`;
  const ref = doc(db, 'months', params.monthId, 'entries', params.staffId);
  try {
    await ensureRosterMonth(params.monthId);
    const existingSnap = await getDoc(ref);
    const cleanedMain = cleanShiftMap(params.mainShifts);
    const cleanedNight = cleanShiftMap(params.nightShifts);
    const cleanedWorkload = cleanShiftMap(params.workloadShifts);
    const cleanedStandby = cleanShiftMap(params.standbyShifts);
    const cleanedPublicHoliday = cleanShiftMap(params.publicHolidayShifts || {});
    const cleanedSmc = cleanShiftMap(params.smcShifts || {});

    if (existingSnap.exists()) {
      await updateDoc(ref, {
        mainShifts: cleanedMain,
        nightShifts: cleanedNight,
        workloadShifts: cleanedWorkload,
        standbyShifts: cleanedStandby,
        publicHolidayShifts: cleanedPublicHoliday,
        smcShifts: cleanedSmc,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        monthId: params.monthId,
        staffId: params.staffId,
        ownerUid: params.ownerUid ? sanitizeId(params.ownerUid, 128) : '',
        mainShifts: cleanedMain,
        nightShifts: cleanedNight,
        workloadShifts: cleanedWorkload,
        standbyShifts: cleanedStandby,
        publicHolidayShifts: cleanedPublicHoliday,
        smcShifts: cleanedSmc,
        visibility: 'department',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Seeds the authentic Bang Phli Hospital October 2569 (2026-10) department roster
 * matching the 6 uploaded official forms (13 staff, 110,660 Baht regular OT total).
 */
export async function seedOctober2569DepartmentData(adminUid = ''): Promise<void> {
  const path = `months/${OCTOBER_2569_MONTH_ID}`;
  try {
    // 1. Save department settings if not already customized
    await saveDepartmentSettings(DEFAULT_DEPARTMENT_SETTINGS);

    // 2. Ensure October 2569 month doc exists and is open (Master Gate parent requirement)
    const monthRef = doc(db, 'months', OCTOBER_2569_MONTH_ID);
    const monthSnap = await getDoc(monthRef);
    if (!monthSnap.exists()) {
      await setDoc(monthRef, {
        monthId: OCTOBER_2569_MONTH_ID,
        yearAD: 2026,
        monthNumber: 10,
        holidays: OCTOBER_2569_HOLIDAYS,
        publicHolidays: OCTOBER_2569_PUBLIC_HOLIDAYS,
        payDateLabel: OCTOBER_2569_PAY_LABEL,
        status: 'open',
        visibility: 'department',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(monthRef, {
        holidays: OCTOBER_2569_HOLIDAYS,
        publicHolidays: OCTOBER_2569_PUBLIC_HOLIDAYS,
        payDateLabel: OCTOBER_2569_PAY_LABEL,
        status: 'open',
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Batch create staff documents first (required by entries Master Gate exists() check)
    const staffBatch = writeBatch(db);
    for (const item of SEED_OCTOBER_2569_DATA) {
      const sRef = doc(db, 'staff', item.staffId);
      const sSnap = await getDoc(sRef);
      const assignedUid = adminUid && item.staffId === 'rn_01_wachiraporn' ? adminUid : '';
      if (!sSnap.exists()) {
        staffBatch.set(sRef, {
          staffId: item.staffId,
          orderIndex: item.orderIndex,
          fullName: item.fullName,
          category: item.category,
          positionLabel: item.positionLabel,
          positionSubLabel: item.positionSubLabel,
          ownerUid: assignedUid,
          active: true,
          visibility: 'department',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    await staffBatch.commit();

    // 4. Batch create/update October 2569 shift entries
    const entriesBatch = writeBatch(db);
    for (const item of SEED_OCTOBER_2569_DATA) {
      const eRef = doc(db, 'months', OCTOBER_2569_MONTH_ID, 'entries', item.staffId);
      const eSnap = await getDoc(eRef);
      const assignedUid = adminUid && item.staffId === 'rn_01_wachiraporn' ? adminUid : '';
      if (!eSnap.exists()) {
        entriesBatch.set(eRef, {
          monthId: OCTOBER_2569_MONTH_ID,
          staffId: item.staffId,
          ownerUid: assignedUid,
          mainShifts: cleanShiftMap(item.mainShifts),
          nightShifts: cleanShiftMap(item.nightShifts),
          workloadShifts: cleanShiftMap(item.workloadShifts),
          standbyShifts: cleanShiftMap(item.standbyShifts),
          visibility: 'department',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        entriesBatch.update(eRef, {
          mainShifts: cleanShiftMap(item.mainShifts),
          nightShifts: cleanShiftMap(item.nightShifts),
          workloadShifts: cleanShiftMap(item.workloadShifts),
          standbyShifts: cleanShiftMap(item.standbyShifts),
          updatedAt: serverTimestamp(),
        });
      }
    }
    await entriesBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Fetches existing RosterMonth docs and their shift entries for a requested list of monthIds
 * (e.g., 12 months of a fiscal or calendar year) using rules-compliant department visibility queries.
 */
export async function fetchYearlyMonthsAndEntries(monthIds: string[]): Promise<{
  monthsById: Record<string, RosterMonth>;
  entriesByMonthId: Record<string, Record<string, MonthlyShiftEntry>>;
}> {
  const targetSet = new Set(monthIds);
  const monthsById: Record<string, RosterMonth> = {};
  const entriesByMonthId: Record<string, Record<string, MonthlyShiftEntry>> = {};

  try {
    const monthsQuery = query(
      collection(db, 'months'),
      where('visibility', '==', 'department'),
    );
    const monthsSnap = await getDocs(monthsQuery);
    monthsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as RosterMonth;
      const id = data.monthId || docSnap.id;
      if (targetSet.has(id)) {
        monthsById[id] = data;
      }
    });

    const existingIds = monthIds.filter((id) => Boolean(monthsById[id]));
    await Promise.all(
      existingIds.map(async (monthId) => {
        const entriesQuery = query(
          collection(db, 'months', monthId, 'entries'),
          where('visibility', '==', 'department'),
        );
        const entriesSnap = await getDocs(entriesQuery);
        const map: Record<string, MonthlyShiftEntry> = {};
        entriesSnap.docs.forEach((d) => {
          const entry = d.data() as MonthlyShiftEntry;
          map[entry.staffId] = entry;
        });
        entriesByMonthId[monthId] = map;
      }),
    );

    return { monthsById, entriesByMonthId };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'months');
    return { monthsById, entriesByMonthId };
  }
}

/**
 * Real-time subscription to all department RosterMonth documents so monthly Productivity
 * edits saved in any tab immediately sync with the 12-month summary and charts.
 */
export function subscribeDepartmentMonths(
  onData: (monthsById: Record<string, RosterMonth>) => void,
): Unsubscribe {
  const path = 'months';
  const q = query(collection(db, 'months'), where('visibility', '==', 'department'));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, RosterMonth> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as RosterMonth;
        const id = data.monthId || docSnap.id;
        map[id] = data;
      });
      onData(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}


