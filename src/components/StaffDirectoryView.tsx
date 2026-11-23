import React, { useMemo, useState } from 'react';
import {
  Check,
  Database,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  StaffCategory,
  StaffMember,
} from '../types/roster';
import {
  createStaffMember,
  deleteStaffMember,
  seedOctober2569DepartmentData,
  updateStaffMemberAdmin,
} from '../services/rosterService';

interface StaffDirectoryViewProps {
  staffList: StaffMember[];
  onSwitchToOctober2569: () => void;
}

export const StaffDirectoryView: React.FC<StaffDirectoryViewProps> = ({
  staffList,
  onSwitchToOctober2569,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | StaffCategory>('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add form state
  const [fullName, setFullName] = useState('');
  const [category, setCategory] = useState<StaffCategory>('RN');
  const [positionLabel, setPositionLabel] = useState('วิสัญญีพยาบาล');
  const [positionSubLabel, setPositionSubLabel] = useState('พยาบาลวิชาชีพปฏิบัติการ');
  const [orderIndex, setOrderIndex] = useState(staffList.length + 1);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal state
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

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
    if (!fullName.trim()) return;
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
    if (!editingStaff) return;
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

  const handleSeedSample = async () => {
    setSeeding(true);
    setSeedDone(false);
    try {
      await seedOctober2569DepartmentData('');
      setSeedDone(true);
      onSwitchToOctober2569();
      setTimeout(() => setSeedDone(false), 4000);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">รายชื่อบุคลากรในหน่วยงาน</h2>
          <p className="text-xs text-slate-500">
            ทั้งหมด {counts.ALL} คน · พยาบาลวิชาชีพ {counts.RN} · ผู้ช่วยพยาบาล {counts.PN} · พนักงานช่วยเหลือคนไข้ {counts.NA}
          </p>
        </div>

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
      </div>

      {/* Inline Add Staff Form */}
      {showAddForm && (
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
            <button
              type="button"
              onClick={handleSeedSample}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
            >
              <Database className="w-4 h-4" />
              นำเข้าข้อมูลตัวอย่าง กลุ่มงานการพยาบาลวิสัญญี (ต.ค. 2569)
            </button>
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
                  <th className="px-4 py-3 text-left">สถานะในตาราง</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((s) => (
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
                    <td className="px-4 py-3 text-xs">
                      {s.active ? (
                        <span className="text-teal-700 font-medium">แสดงในตารางเวร</span>
                      ) : (
                        <span className="text-slate-400">ซ่อนจากตารางเวร</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Staff Modal */}
      {editingStaff && (
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
