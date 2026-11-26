import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Database,
  Edit3,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  StaffCategory,
  StaffMember,
  UserAccount,
} from '../types/roster';
import {
  createStaffMember,
  deleteStaffMember,
  grantAdminRole,
  revokeAdminRole,
  seedOctober2569DepartmentData,
  subscribeAdminUids,
  subscribeAllUserAccountsAdmin,
  unlinkStaffProfileAdmin,
  updateStaffMemberAdmin,
} from '../services/rosterService';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../firebase';
import { getDisplayUsername } from '../utils/authHelpers';

interface StaffDirectoryViewProps {
  currentUserUid: string;
  isAdmin: boolean;
  isBootstrappedAdmin: boolean;
  staffList: StaffMember[];
  onSwitchToOctober2569: () => void;
}

export const StaffDirectoryView: React.FC<StaffDirectoryViewProps> = ({
  currentUserUid,
  isAdmin,
  isBootstrappedAdmin,
  staffList,
  onSwitchToOctober2569,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // Bootstrapped Admin account & role management
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [roleBusyUid, setRoleBusyUid] = useState<string | null>(null);

  // Add form state
  const [fullName, setFullName] = useState('');
  const [category, setCategory] = useState<StaffCategory>('RN');
  const [positionLabel, setPositionLabel] = useState('วิสัญญีพยาบาล');
  const [positionSubLabel, setPositionSubLabel] = useState('พยาบาลวิชาชีพปฏิบัติการ');
  const [orderIndex, setOrderIndex] = useState(staffList.length + 1);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal state
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    if (!isBootstrappedAdmin) {
      setUserAccounts([]);
      setAdminUids([]);
      return;
    }
    const unsubUsers = subscribeAllUserAccountsAdmin(setUserAccounts);
    const unsubAdmins = subscribeAdminUids(setAdminUids);
    return () => {
      unsubUsers();
      unsubAdmins();
    };
  }, [isBootstrappedAdmin]);

  const userAccountByUid = useMemo(() => {
    const map: Record<string, UserAccount> = {};
    userAccounts.forEach((u) => {
      map[u.uid] = u;
    });
    return map;
  }, [userAccounts]);

  const staffById = useMemo(() => {
    const map: Record<string, StaffMember> = {};
    staffList.forEach((s) => {
      map[s.staffId] = s;
    });
    return map;
  }, [staffList]);

  const adminUidSet = useMemo(() => new Set(adminUids), [adminUids]);

  const filteredStaff = useMemo(() => {
    if (categoryFilter === 'ALL') return staffList;
    return staffList.filter((s) => s.category === categoryFilter);
  }, [staffList, categoryFilter]);

  const counts = useMemo(
    () => ({
      ALL: staffList.length,
      RN: staffList.filter((s) => s.category === 'RN').length,
      PN: staffList.filter((s) => s.category === 'PN').length,
      NA: staffList.filter((s) => s.category === 'NA').length,
    }),
    [staffList],
  );

  const applyPreset = (cat: StaffCategory) => {
    setCategory(cat);
    if (cat === 'RN') {
      setPositionLabel('วิสัญญีพยาบาล');
      setPositionSubLabel('พยาบาลวิชาชีพปฏิบัติการ');
    } else if (cat === 'PN') {
      setPositionLabel('ผู้ช่วยพยาบาล');
      setPositionSubLabel('');
    } else {
      setPositionLabel('พนักงานช่วยเหลือคนไข้');
      setPositionSubLabel('');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !fullName.trim()) return;
    setSubmitting(true);
    try {
      await createStaffMember({
        fullName: fullName.trim(),
        category,
        positionLabel: positionLabel.trim() || CATEGORY_LABELS[category],
        positionSubLabel: positionSubLabel.trim(),
        orderIndex: Number(orderIndex) || staffList.length + 1,
        ownerUid: '',
      });
      setFullName('');
      setOrderIndex(staffList.length + 2);
      setShowAddForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingStaff) return;
    setSubmitting(true);
    try {
      await updateStaffMemberAdmin(editingStaff.staffId, {
        orderIndex: editingStaff.orderIndex,
        fullName: editingStaff.fullName,
        category: editingStaff.category,
        positionLabel: editingStaff.positionLabel,
        positionSubLabel: editingStaff.positionSubLabel,
        active: editingStaff.active,
      });
      setEditingStaff(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlinkStaff = async (staff: StaffMember) => {
    if (!isAdmin || !staff.ownerUid) return;
    setUnlinkingId(staff.staffId);
    try {
      await unlinkStaffProfileAdmin(staff.staffId, staff.ownerUid);
      setConfirmUnlinkId(null);
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleSeedSample = async () => {
    if (!isAdmin) return;
    setSeeding(true);
    setSeedDone(false);
    try {
      await seedOctober2569DepartmentData(currentUserUid);
      setSeedDone(true);
      onSwitchToOctober2569();
      setTimeout(() => setSeedDone(false), 4000);
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleAdminRole = async (acct: UserAccount, currentlyAdmin: boolean) => {
    if (!isBootstrappedAdmin) return;
    if (acct.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) return;
    setRoleBusyUid(acct.uid);
    try {
      if (currentlyAdmin) {
        await revokeAdminRole(acct.uid);
      } else {
        await grantAdminRole(acct.uid);
      }
    } finally {
      setRoleBusyUid(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">รายชื่อบุคลากรในหน่วยงาน</h2>
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5" />
                สิทธิ์ Admin
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md">
                <Lock className="w-3 h-3" />
                ดูรายชื่อเท่านั้น (จัดการได้เฉพาะ Admin)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            ทั้งหมด {counts.ALL} คน · พยาบาลวิชาชีพ {counts.RN} · ผู้ช่วยพยาบาล {counts.PN} · พนักงานช่วยเหลือคนไข้ {counts.NA}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {seedDone ? (
                <Check className="w-3.5 h-3.5 text-green-700" />
              ) : (
                <Database className="w-3.5 h-3.5 text-teal-700" />
              )}
              {seeding
                ? 'กำลังนำเข้าข้อมูล...'
                : seedDone
                ? 'นำเข้าข้อมูล ต.ค. 2569 แล้ว'
                : 'นำเข้าข้อมูลตัวอย่าง ต.ค. 2569 (13 คน)'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderIndex(staffList.length + 1);
                setShowAddForm((prev) => !prev);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มรายชื่อบุคลากร
            </button>
          </div>
        )}
      </div>

      {/* Inline Add Staff Form (Admin Only) */}
      {isAdmin && showAddForm && (
        <form
          onSubmit={handleAddStaff}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">เพิ่มบุคลากรใหม่เข้าสู่ตารางเวร</h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">ลำดับที่</label>
              <input
                type="number"
                min={1}
                max={999}
                required
                value={orderIndex}
                onChange={(e) => setOrderIndex(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อ - สกุล</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="เช่น น.ส.สมหญิง ใจดี"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">กลุ่มตำแหน่ง</label>
              <select
                value={category}
                onChange={(e) => applyPreset(e.target.value as StaffCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="RN">พยาบาลวิชาชีพ (RN)</option>
                <option value="PN">ผู้ช่วยพยาบาล (PN)</option>
                <option value="NA">พนักงานช่วยเหลือคนไข้ (NA)</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">ตำแหน่งในตาราง</label>
              <input
                type="text"
                required
                value={positionLabel}
                onChange={(e) => setPositionLabel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ระดับตำแหน่ง / บรรทัดรอง (ไม่บังคับ)
              </label>
              <input
                type="text"
                value={positionSubLabel}
                onChange={(e) => setPositionSubLabel(e.target.value)}
                placeholder="เช่น พยาบาลวิชาชีพชำนาญการ"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="md:col-span-6 flex items-end justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกรายชื่อ'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
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
            {cat === 'ALL' ? `ทั้งหมด (${counts.ALL})` : `${CATEGORY_LABELS[cat]} (${counts[cat]})`}
          </button>
        ))}
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredStaff.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">ยังไม่มีรายชื่อบุคลากรในระบบ</p>
            {isAdmin && (
              <button
                type="button"
                onClick={handleSeedSample}
                disabled={seeding}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                <Database className="w-4 h-4" />
                นำเข้าข้อมูลตัวอย่าง กลุ่มงานการพยาบาลวิสัญญี (ต.ค. 2569)
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3 text-center w-16">ลำดับ</th>
                  <th className="px-4 py-3 text-left">ชื่อ - สกุล</th>
                  <th className="px-4 py-3 text-left">กลุ่มตำแหน่ง</th>
                  <th className="px-4 py-3 text-left">ตำแหน่ง / ระดับ</th>
                  <th className="px-4 py-3 text-left">การผูกบัญชี Login</th>
                  <th className="px-4 py-3 text-left">สถานะในตาราง</th>
                  {isAdmin && <th className="px-4 py-3 text-right">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((s) => {
                  const isMine = Boolean(s.ownerUid && s.ownerUid === currentUserUid);
                  const linkedAccount = s.ownerUid ? userAccountByUid[s.ownerUid] : undefined;
                  return (
                    <tr
                      key={s.staffId}
                      className={`hover:bg-slate-50/70 ${!s.active ? 'opacity-55' : ''}`}
                    >
                      <td className="px-4 py-3 text-center font-mono text-xs tabular-nums text-slate-600">
                        {s.orderIndex}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {s.fullName}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                        {CATEGORY_LABELS[s.category]}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="text-slate-900 font-medium">{s.positionLabel}</div>
                        {s.positionSubLabel && (
                          <div className="text-slate-500">{s.positionSubLabel}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {s.ownerUid ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${
                                isMine ? 'text-teal-700' : 'text-slate-700'
                              }`}
                            >
                              <Link2 className="w-3.5 h-3.5 shrink-0" />
                              {isMine
                                ? 'บัญชีของคุณ'
                                : linkedAccount
                                ? linkedAccount.displayName || getDisplayUsername(linkedAccount.email)
                                : 'ผูกบัญชีแล้ว'}
                            </span>
                            {linkedAccount && !isMine && (
                              <span className="text-[11px] text-slate-400">
                                @{getDisplayUsername(linkedAccount.email)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">ยังไม่ผูกบัญชี</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {s.active ? (
                          <span className="text-teal-700 font-medium">แสดงในตารางเวร</span>
                        ) : (
                          <span className="text-slate-400">ซ่อนจากตารางเวร</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {s.ownerUid && (
                              confirmUnlinkId === s.staffId ? (
                                <div className="inline-flex items-center gap-1 mr-1">
                                  <button
                                    type="button"
                                    disabled={unlinkingId === s.staffId}
                                    onClick={() => void handleUnlinkStaff(s)}
                                    className="px-2 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded cursor-pointer disabled:opacity-50"
                                  >
                                    ยืนยันปลด
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmUnlinkId(null)}
                                    className="px-2 py-1 text-[11px] text-slate-600 bg-slate-100 rounded cursor-pointer"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  title="ปลดการผูกบัญชี Login (ให้เจ้าของเลือกผูกชื่อใหม่ได้)"
                                  onClick={() => setConfirmUnlinkId(s.staffId)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 border border-amber-200 rounded-md cursor-pointer"
                                >
                                  <Unlink className="w-3 h-3" />
                                  ปลดผูกบัญชี
                                </button>
                              )
                            )}
                            <button
                              type="button"
                              title="แก้ไขข้อมูลบุคลากร"
                              onClick={() => setEditingStaff(s)}
                              className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-md cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteId === s.staffId ? (
                              <div className="inline-flex items-center gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteStaffMember(s.staffId);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                                >
                                  ยืนยันลบ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 text-[11px] text-slate-600 bg-slate-100 rounded cursor-pointer"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                title="ลบรายชื่อ"
                                onClick={() => setConfirmDeleteId(s.staffId)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bootstrapped Admin Only: Manage Admin Privileges for Registered Users */}
      {isBootstrappedAdmin && userAccounts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                จัดการสิทธิ์ผู้ดูแลระบบ (Admin)
              </h3>
              <p className="text-xs text-slate-500">
                บัญชีที่ได้สิทธิ์ Admin จะสามารถลงและแก้ไขเวรแทนบุคลากรทุกคนได้ รวมถึงปลดการผูกบัญชีเมื่อมีคนเลือกชื่อผิด
              </p>
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {userAccounts.length} บัญชีที่ลงทะเบียน
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="px-4 py-2.5 text-left">ชื่อที่แสดง / บัญชี Login</th>
                  <th className="px-4 py-2.5 text-left">ผูกกับรายชื่อบุคลากร</th>
                  <th className="px-4 py-2.5 text-left">สิทธิ์ปัจจุบัน</th>
                  <th className="px-4 py-2.5 text-right">เปลี่ยนสิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userAccounts.map((acct) => {
                  const isMainAdmin = acct.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                  const isDelegatedAdmin = adminUidSet.has(acct.uid);
                  const effectiveAdmin = isMainAdmin || isDelegatedAdmin;
                  const boundStaff = acct.linkedStaffId ? staffById[acct.linkedStaffId] : undefined;
                  const actuallyOwnedStaff =
                    boundStaff && boundStaff.ownerUid === acct.uid
                      ? boundStaff
                      : staffList.find((s) => s.ownerUid === acct.uid);
                  return (
                    <tr key={acct.uid} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {acct.displayName || getDisplayUsername(acct.email)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          @{getDisplayUsername(acct.email)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {actuallyOwnedStaff ? (
                          <span className="font-medium">{actuallyOwnedStaff.fullName}</span>
                        ) : (
                          <span className="text-slate-400">ยังไม่ผูกชื่อ</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isMainAdmin ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Admin หลัก
                          </span>
                        ) : isDelegatedAdmin ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Admin
                          </span>
                        ) : (
                          <span className="text-slate-500">ผู้ใช้ทั่วไป (ลงเวรเฉพาะตนเอง)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {isMainAdmin ? (
                          <span className="text-[11px] text-slate-400">สิทธิ์หลักถาวร</span>
                        ) : (
                          <button
                            type="button"
                            disabled={roleBusyUid === acct.uid}
                            onClick={() => void handleToggleAdminRole(acct, effectiveAdmin)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer disabled:opacity-50 ${
                              effectiveAdmin
                                ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200'
                                : 'text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-200'
                            }`}
                          >
                            {effectiveAdmin ? (
                              <>
                                <ShieldOff className="w-3 h-3" />
                                ยกเลิก Admin
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-3 h-3" />
                                ตั้งเป็น Admin
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Staff Modal (Admin Only) */}
      {isAdmin && editingStaff && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">แก้ไขข้อมูลบุคลากร</h3>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ลำดับที่</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  required
                  value={editingStaff.orderIndex}
                  onChange={(e) =>
                    setEditingStaff({ ...editingStaff, orderIndex: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">กลุ่มตำแหน่ง</label>
                <select
                  value={editingStaff.category}
                  onChange={(e) =>
                    setEditingStaff({
                      ...editingStaff,
                      category: e.target.value as StaffCategory,
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="RN">พยาบาลวิชาชีพ (RN)</option>
                  <option value="PN">ผู้ช่วยพยาบาล (PN)</option>
                  <option value="NA">พนักงานช่วยเหลือคนไข้ (NA)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อ - สกุล</label>
                <input
                  type="text"
                  required
                  value={editingStaff.fullName}
                  onChange={(e) =>
                    setEditingStaff({ ...editingStaff, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ตำแหน่งในตาราง</label>
                <input
                  type="text"
                  required
                  value={editingStaff.positionLabel}
                  onChange={(e) =>
                    setEditingStaff({ ...editingStaff, positionLabel: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ระดับตำแหน่ง</label>
                <input
                  type="text"
                  value={editingStaff.positionSubLabel}
                  onChange={(e) =>
                    setEditingStaff({ ...editingStaff, positionSubLabel: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editingStaff.active}
                onChange={(e) =>
                  setEditingStaff({ ...editingStaff, active: e.target.checked })
                }
                className="rounded border-slate-300 text-teal-700"
              />
              แสดงรายชื่อในตารางปฏิบัติงานประจำเดือน
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
