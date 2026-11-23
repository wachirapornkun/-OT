import {
  DepartmentSettings,
  MainShiftCode,
  MonthlyShiftEntry,
  PersonMonthlySummary,
  RosterMonth,
  StaffCategory,
  StaffMember,
} from '../types/roster';
import {
  OCTOBER_2569_MONTH_ID,
  OCTOBER_2569_PUBLIC_HOLIDAYS,
} from '../data/seedOctober2569';
import { getDaysInMonth } from './thaiUtils';

export function getEffectivePublicHolidays(month: RosterMonth): number[] {
  if (month.publicHolidays !== undefined) {
    return month.publicHolidays;
  }
  return month.monthId === OCTOBER_2569_MONTH_ID ? OCTOBER_2569_PUBLIC_HOLIDAYS : [];
}

export function getRatesForCategory(
  category: StaffCategory,
  settings: DepartmentSettings,
): { otRate: number; publicHolidayOtRate: number; workloadRate: number; standbyRate: number } {
  switch (category) {
    case 'RN':
      return {
        otRate: settings.rnOtRate,
        publicHolidayOtRate: settings.rnPublicHolidayOtRate ?? settings.rnOtRate,
        workloadRate: settings.rnWorkloadRate,
        standbyRate: settings.rnStandbyRate,
      };
    case 'PN':
      return {
        otRate: settings.pnOtRate,
        publicHolidayOtRate: settings.pnPublicHolidayOtRate ?? settings.pnOtRate,
        workloadRate: settings.pnWorkloadRate,
        standbyRate: settings.pnStandbyRate,
      };
    case 'NA':
      return {
        otRate: settings.naOtRate,
        publicHolidayOtRate: settings.naPublicHolidayOtRate ?? settings.naOtRate,
        workloadRate: settings.naWorkloadRate,
        standbyRate: settings.naStandbyRate,
      };
  }
}

export function isWorkingLeaveOrDay(code: MainShiftCode | undefined): boolean {
  return code === 'ช' || code === 'ป่วย' || code === 'กิจ' || code === 'vac';
}

/**
 * Computes exact monthly shift counts, day lists, and OT/Public-Holiday/Workload/Standby
 * reimbursement amounts matching the hospital's official 4-section roster & reimbursement rules.
 */
export function calculatePersonMonthlySummary(
  staff: StaffMember,
  entry: MonthlyShiftEntry | null,
  month: RosterMonth,
  settings: DepartmentSettings,
): PersonMonthlySummary {
  const daysInMonth = getDaysInMonth(month.yearAD, month.monthNumber);
  const publicHolidays = getEffectivePublicHolidays(month);
  const publicHolidaySet = new Set(publicHolidays);
  const holidaySet = new Set([...month.holidays, ...publicHolidays]);

  let workingDaysCount = 0;
  const afternoonNightRegularCount = 0;
  let offCount = 0;

  const otMorningDays: number[] = [];
  const otAfternoonDays: number[] = [];
  const otNightDays: number[] = [];
  const standbyDays: number[] = [];

  const workloadMorningDays: number[] = [];
  const workloadAfternoonDays: number[] = [];
  const workloadNightDays: number[] = [];

  const explicitPublicHolidayMorningDays: number[] = [];
  const explicitPublicHolidayAfternoonDays: number[] = [];
  const explicitPublicHolidayNightDays: number[] = [];

  const smcDays: number[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const key = String(d);
    const isHoliday = holidaySet.has(d);

    const mainVal = entry?.mainShifts?.[key] || '';
    const nightVal = entry?.nightShifts?.[key] || '';
    const workloadVal = entry?.workloadShifts?.[key] || '';
    const standbyVal = entry?.standbyShifts?.[key] || '';
    const publicHolidayVal = entry?.publicHolidayShifts?.[key] || '';
    const smcVal = entry?.smcShifts?.[key] || '';

    // Section 1: Main shift row (Working [Black] & OT Morning/Afternoon [Red])
    if (mainVal) {
      if (mainVal === '0') {
        offCount += 1;
      } else if (!isHoliday) {
        // Working day (Mon-Fri non-holiday)
        if (isWorkingLeaveOrDay(mainVal)) {
          workingDaysCount += 1;
        } else if (mainVal === 'ช/บ') {
          // ช is working shift (Black), บ is OT Afternoon (Red)
          workingDaysCount += 1;
          otAfternoonDays.push(d);
        } else if (mainVal === 'บ') {
          // บ is OT Afternoon (Red)
          otAfternoonDays.push(d);
        }
      } else {
        // Holiday / Weekend / Public Holiday (Red header)
        if (mainVal === 'ช') {
          otMorningDays.push(d);
        } else if (mainVal === 'บ') {
          otAfternoonDays.push(d);
        } else if (mainVal === 'ช/บ') {
          otMorningDays.push(d);
          otAfternoonDays.push(d);
        } else if (mainVal === 'ป่วย' || mainVal === 'กิจ' || mainVal === 'vac') {
          workingDaysCount += 1;
        }
      }
    }

    // Section 2: Night OT (เวรดึก - Red)
    if (nightVal === 'ด') {
      otNightDays.push(d);
    }

    // Section 3: Workload OT (ช*, บ*, ด* - Green)
    if (workloadVal) {
      const parts = workloadVal.split('/');
      if (parts.includes('ช*')) workloadMorningDays.push(d);
      if (parts.includes('บ*')) workloadAfternoonDays.push(d);
      if (parts.includes('ด*')) workloadNightDays.push(d);
    }

    // Section 4: Standby Night (เวรดึก Standby - Blue)
    if (standbyVal === 'ด') {
      standbyDays.push(d);
    }

    // Section 5: Explicit Public Holiday / Special Shifts (ช, บ, ด - Fuchsia/Magenta)
    if (publicHolidayVal) {
      const parts = publicHolidayVal.split('/');
      if (parts.includes('ช')) explicitPublicHolidayMorningDays.push(d);
      if (parts.includes('บ')) explicitPublicHolidayAfternoonDays.push(d);
      if (parts.includes('ด')) explicitPublicHolidayNightDays.push(d);
    }

    // Section 6: SMC Shifts (SMC - Purple, separate table; any non-empty code counts as SMC)
    if (smcVal) {
      smcDays.push(d);
    }
  }

  const { otRate, publicHolidayOtRate, workloadRate, standbyRate } = getRatesForCategory(
    staff.category,
    settings,
  );
  const hasDistinctPublicHolidayRate = publicHolidayOtRate !== otRate;

  const regularOtMorningDays = otMorningDays.filter((d) => !publicHolidaySet.has(d));
  const regularOtAfternoonDays = otAfternoonDays.filter((d) => !publicHolidaySet.has(d));
  const regularOtNightDays = otNightDays.filter((d) => !publicHolidaySet.has(d));

  const dateBasedPubMorningDays = hasDistinctPublicHolidayRate
    ? otMorningDays.filter((d) => publicHolidaySet.has(d))
    : [];
  const dateBasedPubAfternoonDays = hasDistinctPublicHolidayRate
    ? otAfternoonDays.filter((d) => publicHolidaySet.has(d))
    : [];
  const dateBasedPubNightDays = hasDistinctPublicHolidayRate
    ? otNightDays.filter((d) => publicHolidaySet.has(d))
    : [];

  const explicitPublicHolidayCount =
    explicitPublicHolidayMorningDays.length +
    explicitPublicHolidayAfternoonDays.length +
    explicitPublicHolidayNightDays.length;

  const publicHolidayOtMorningDays = [
    ...dateBasedPubMorningDays,
    ...explicitPublicHolidayMorningDays,
  ].sort((a, b) => a - b);
  const publicHolidayOtAfternoonDays = [
    ...dateBasedPubAfternoonDays,
    ...explicitPublicHolidayAfternoonDays,
  ].sort((a, b) => a - b);
  const publicHolidayOtNightDays = [
    ...dateBasedPubNightDays,
    ...explicitPublicHolidayNightDays,
  ].sort((a, b) => a - b);

  const publicHolidayOtCount =
    publicHolidayOtMorningDays.length +
    publicHolidayOtAfternoonDays.length +
    publicHolidayOtNightDays.length;

  const otMorningAmount =
    (hasDistinctPublicHolidayRate ? regularOtMorningDays.length : otMorningDays.length) * otRate;
  const otAfternoonAmount =
    (hasDistinctPublicHolidayRate ? regularOtAfternoonDays.length : otAfternoonDays.length) *
    otRate;
  const otNightAmount =
    (hasDistinctPublicHolidayRate ? regularOtNightDays.length : otNightDays.length) * otRate;
  const publicHolidayOtAmount = publicHolidayOtCount * publicHolidayOtRate;
  const standbyAmount = standbyDays.length * standbyRate;
  const regularOtTotal =
    otMorningAmount + otAfternoonAmount + otNightAmount + publicHolidayOtAmount + standbyAmount;

  // เวร Workload (ช*, บ*, ด* สีเขียว) ไม่นำไปคิดเงินในตารางนี้ เพราะเบิกคนละตาราง
  const workloadMorningAmount = 0;
  const workloadAfternoonAmount = 0;
  const workloadNightAmount = 0;
  const workloadTotal = 0;

  const mainRowOtCount = otMorningDays.length + otAfternoonDays.length;
  const workloadCount =
    workloadMorningDays.length + workloadAfternoonDays.length + workloadNightDays.length;
  const smcCount = smcDays.length;

  return {
    staff,
    entry,
    workingDaysCount,
    afternoonNightRegularCount,
    mainRowOtCount,
    offCount,
    nightOtCount: otNightDays.length,
    workloadCount,
    standbyCount: standbyDays.length,
    otMorningDays,
    otAfternoonDays,
    otNightDays,
    standbyDays,
    regularOtMorningDays,
    regularOtAfternoonDays,
    regularOtNightDays,
    publicHolidayOtMorningDays,
    publicHolidayOtAfternoonDays,
    publicHolidayOtNightDays,
    publicHolidayOtCount,
    hasDistinctPublicHolidayRate,
    explicitPublicHolidayMorningDays,
    explicitPublicHolidayAfternoonDays,
    explicitPublicHolidayNightDays,
    explicitPublicHolidayCount,
    workloadMorningDays,
    workloadAfternoonDays,
    workloadNightDays,
    smcDays,
    smcCount,
    otRate,
    publicHolidayOtRate,
    workloadRate,
    standbyRate,
    otMorningAmount,
    otAfternoonAmount,
    otNightAmount,
    publicHolidayOtAmount,
    standbyAmount,
    regularOtTotal,
    workloadMorningAmount,
    workloadAfternoonAmount,
    workloadNightAmount,
    workloadTotal,
    grandTotal: regularOtTotal,
  };
}

export function formatDayList(days: number[]): string {
  return days.join(',');
}

export function formatPublicHolidayShiftList(summary: PersonMonthlySummary): string {
  const parts: string[] = [];
  if (summary.publicHolidayOtMorningDays.length > 0) {
    parts.push(`ช(${summary.publicHolidayOtMorningDays.join(',')})`);
  }
  if (summary.publicHolidayOtAfternoonDays.length > 0) {
    parts.push(`บ(${summary.publicHolidayOtAfternoonDays.join(',')})`);
  }
  if (summary.publicHolidayOtNightDays.length > 0) {
    parts.push(`ด(${summary.publicHolidayOtNightDays.join(',')})`);
  }
  return parts.join(' ');
}
