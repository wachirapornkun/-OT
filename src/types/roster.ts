export type StaffCategory = 'RN' | 'PN' | 'NA';

export type MainShiftCode = '' | 'ช' | 'บ' | 'ช/บ' | '0' | 'ป่วย' | 'กิจ' | 'vac';
export type NightShiftCode = '' | 'ด';
export type WorkloadShiftCode =
  | ''
  | 'ช*'
  | 'บ*'
  | 'ด*'
  | 'ช*/บ*'
  | 'ช*/ด*'
  | 'บ*/ด*'
  | 'ช*/บ*/ด*';
export type StandbyShiftCode = '' | 'ด';
export type PublicHolidayShiftCode =
  | ''
  | 'ช'
  | 'บ'
  | 'ด'
  | 'ช/บ'
  | 'ช/ด'
  | 'บ/ด'
  | 'ช/บ/ด';
export type SmcShiftCode = '' | 'SMC';

export type ShiftRowKey =
  | 'mainShifts'
  | 'nightShifts'
  | 'workloadShifts'
  | 'standbyShifts'
  | 'publicHolidayShifts'
  | 'smcShifts';

export interface DepartmentSettings {
  hospitalName: string;
  departmentName: string;
  schedulerName: string;
  schedulerTitle: string;
  schedulerPosition: string;
  approverName: string;
  approverTitle: string;
  approverPosition: string;
  rnOtRate: number;
  rnWorkloadRate: number;
  rnStandbyRate: number;
  rnPublicHolidayOtRate: number;
  pnOtRate: number;
  pnWorkloadRate: number;
  pnStandbyRate: number;
  pnPublicHolidayOtRate: number;
  naOtRate: number;
  naWorkloadRate: number;
  naStandbyRate: number;
  naPublicHolidayOtRate: number;
  publicHolidayRateLabel: string;
  visibility: 'department';
}

export interface StaffMember {
  staffId: string;
  orderIndex: number;
  fullName: string;
  category: StaffCategory;
  positionLabel: string;
  positionSubLabel: string;
  ownerUid: string;
  active: boolean;
  visibility: 'department';
}

export interface RosterMonth {
  monthId: string; // YYYY-MM (AD)
  yearAD: number;
  monthNumber: number; // 1..12
  holidays: number[]; // 1..31 (วันหยุดราชการ + เสาร์-อาทิตย์)
  publicHolidays?: number[]; // 1..31 (วันหยุดนักขัตฤกษ์ที่ใช้อัตราค่าเวรนักขัตฤกษ์)
  payDateLabel: string; // e.g., พ.ย.-69
  headerNote?: string; // ข้อความมุมขวาบนตาราง OT (16pt, default 'OT')
  workloadHeaderNote?: string; // ข้อความมุมขวาบนตาราง Workload (16pt, default 'Workload')
  smcHeaderNote?: string; // ข้อความมุมขวาบนตาราง SMC (16pt, default 'SMC')
  status: 'open' | 'locked';
  visibility: 'department';
}

export interface MonthlyShiftEntry {
  monthId: string;
  staffId: string;
  ownerUid: string;
  mainShifts: Record<string, MainShiftCode>;
  nightShifts: Record<string, NightShiftCode>;
  workloadShifts: Record<string, WorkloadShiftCode>;
  standbyShifts: Record<string, StandbyShiftCode>;
  publicHolidayShifts?: Record<string, PublicHolidayShiftCode>;
  smcShifts?: Record<string, SmcShiftCode>;
  visibility: 'department';
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  linkedStaffId: string;
  role: 'staff' | 'admin';
}

export interface PersonMonthlySummary {
  staff: StaffMember;
  entry: MonthlyShiftEntry | null;
  // Roster summary columns (หมายเหตุ)
  workingDaysCount: number; // เช้า (วันทำการ + ป่วย + กิจ + vac)
  afternoonNightRegularCount: number; // บ/ด ทำการ (ปกติ 0)
  mainRowOtCount: number; // OT ช + OT บ ในแถวที่ 1
  offCount: number; // off (0)
  nightOtCount: number; // แถวที่ 2 เวรดึก OT
  workloadCount: number; // แถวที่ 3 Work load (ช*, บ*, ด*)
  standbyCount: number; // แถวที่ 4 เวรดึก Standby

  // Day arrays for official reimbursement form (all OT days)
  otMorningDays: number[];
  otAfternoonDays: number[];
  otNightDays: number[];
  standbyDays: number[];

  // Split regular vs public-holiday OT days (used when publicHolidayOtRate !== otRate)
  regularOtMorningDays: number[];
  regularOtAfternoonDays: number[];
  regularOtNightDays: number[];
  publicHolidayOtMorningDays: number[];
  publicHolidayOtAfternoonDays: number[];
  publicHolidayOtNightDays: number[];
  publicHolidayOtCount: number;
  hasDistinctPublicHolidayRate: boolean;

  // Explicit 4th-box / 5th-row special public-holiday shifts (ช, บ, ด - Fuchsia)
  explicitPublicHolidayMorningDays: number[];
  explicitPublicHolidayAfternoonDays: number[];
  explicitPublicHolidayNightDays: number[];
  explicitPublicHolidayCount: number;

  workloadMorningDays: number[];
  workloadAfternoonDays: number[];
  workloadNightDays: number[];

  // SMC shifts (SMC — Purple, separate table)
  smcDays: number[];
  smcCount: number;

  // Applicable rates
  otRate: number;
  publicHolidayOtRate: number;
  workloadRate: number;
  standbyRate: number;

  // Monetary totals (Baht)
  otMorningAmount: number;
  otAfternoonAmount: number;
  otNightAmount: number;
  publicHolidayOtAmount: number;
  standbyAmount: number;
  regularOtTotal: number;

  workloadMorningAmount: number;
  workloadAfternoonAmount: number;
  workloadNightAmount: number;
  workloadTotal: number;

  grandTotal: number;
}

export const DEFAULT_DEPARTMENT_SETTINGS: DepartmentSettings = {
  hospitalName: 'โรงพยาบาลบางพลี จังหวัดสมุทรปราการ',
  departmentName: 'กลุ่มงานการพยาบาลวิสัญญี',
  schedulerName: 'นางสาววชิราภรณ์ กุลสันติธรรม',
  schedulerTitle: 'พยาบาลวิชาชีพชำนาญการพิเศษ (ด้านการพยาบาลวิสัญญี)',
  schedulerPosition: 'หัวหน้ากลุ่มงานการพยาบาลวิสัญญี',
  approverName: 'นางสาวจริยา จันทร์เรื่อง',
  approverTitle: 'พยาบาลวิชาชีพชำนาญการพิเศษ ปฏิบัติหน้าที่',
  approverPosition: 'รองผู้อำนวยการฝ่ายการพยาบาล',
  rnOtRate: 720,
  rnWorkloadRate: 720,
  rnStandbyRate: 360,
  rnPublicHolidayOtRate: 720,
  pnOtRate: 440,
  pnWorkloadRate: 440,
  pnStandbyRate: 220,
  pnPublicHolidayOtRate: 440,
  naOtRate: 400,
  naWorkloadRate: 400,
  naStandbyRate: 200,
  naPublicHolidayOtRate: 400,
  publicHolidayRateLabel: 'ค่าเวรวันหยุดนักขัตฤกษ์',
  visibility: 'department',
};

export const CATEGORY_LABELS: Record<StaffCategory, string> = {
  RN: 'พยาบาลวิชาชีพ',
  PN: 'ผู้ช่วยพยาบาล',
  NA: 'พนักงานช่วยเหลือคนไข้',
};

export const CATEGORY_SHORT_LABELS: Record<StaffCategory, string> = {
  RN: 'พยาบาล (RN)',
  PN: 'ผู้ช่วยพยาบาล (PN)',
  NA: 'ช่วยเหลือคนไข้ (NA)',
};
