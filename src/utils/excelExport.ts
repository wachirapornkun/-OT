import * as XLSX from 'xlsx';
import {
  CATEGORY_LABELS,
  DEFAULT_DEPARTMENT_SETTINGS,
  DepartmentSettings,
  PersonMonthlySummary,
  RosterMonth,
} from '../types/roster';
import { formatDayList } from './rosterCalculations';
import {
  getDaysInMonth,
  getThaiMonthYearLabel,
  numberToThaiBahtText,
} from './thaiUtils';

export function exportRosterAndReimbursementExcel(params: {
  month: RosterMonth;
  settings: DepartmentSettings;
  summaries: PersonMonthlySummary[];
}): void {
  const { month, settings, summaries } = params;
  const daysCount = getDaysInMonth(month.yearAD, month.monthNumber);
  const monthLabel = getThaiMonthYearLabel(month.yearAD, month.monthNumber);
  const workingDaysTotal = daysCount - month.holidays.length;

  const wb = XLSX.utils.book_new();

  // =========================================================================
  // Sheet 1: ตารางปฏิบัติงานประจำเดือน (ส่วนที่ 1)
  // =========================================================================
  const dayHeaders = Array.from({ length: daysCount }, (_, i) => String(i + 1));
  const rosterRows: (string | number)[][] = [
    [`ตารางปฏิบัติงานประจำเดือน ${monthLabel}`],
    [`ชื่อหน่วยงาน ${settings.departmentName} — ${settings.hospitalName}`],
    [
      `วันทำการ ${workingDaysTotal} วัน | วันหยุด ${month.holidays.length} วัน | ${
        month.headerNote?.trim() || 'OT'
      }`,
    ],
    [],
    ['ลำดับ', 'ชื่อ - สกุล', 'ตำแหน่ง / ประเภทเวร', ...dayHeaders, 'เช้า', 'บ/ด', 'OT/จำนวนเวร', 'off'],
  ];

  const specialRateLabel =
    settings.publicHolidayRateLabel?.trim() || DEFAULT_DEPARTMENT_SETTINGS.publicHolidayRateLabel;

  summaries.forEach((s, idx) => {
    const mainCells = dayHeaders.map((d) => s.entry?.mainShifts?.[d] || '');
    const nightCells = dayHeaders.map((d) => s.entry?.nightShifts?.[d] || '');
    const sbCells = dayHeaders.map((d) => s.entry?.standbyShifts?.[d] || '');
    const pubCells = dayHeaders.map((d) => s.entry?.publicHolidayShifts?.[d] || '');

    rosterRows.push([
      idx + 1,
      s.staff.fullName,
      s.staff.positionLabel,
      ...mainCells,
      s.workingDaysCount,
      s.afternoonNightRegularCount,
      s.mainRowOtCount,
      s.offCount,
    ]);
    rosterRows.push([
      '',
      s.staff.positionSubLabel,
      'เวรดึก (OT)',
      ...nightCells,
      '',
      '',
      s.nightOtCount,
      '',
    ]);
    rosterRows.push([
      '',
      '',
      'เวรดึก Standby',
      ...sbCells,
      '',
      '',
      s.standbyCount,
      '',
    ]);
    if (s.explicitPublicHolidayCount > 0) {
      rosterRows.push([
        '',
        '',
        specialRateLabel,
        ...pubCells,
        '',
        '',
        s.explicitPublicHolidayCount,
        '',
      ]);
    }
  });

  const wsRoster = XLSX.utils.aoa_to_sheet(rosterRows);
  XLSX.utils.book_append_sheet(wb, wsRoster, 'ตารางปฏิบัติงาน');

  // =========================================================================
  // Sheet 2: ตารางปฏิบัติงานเวร Workload (แยกตารางเฉพาะ ช*, บ*, ด*)
  // =========================================================================
  const wlRosterRows: (string | number)[][] = [
    [`ตารางปฏิบัติงานเวร Workload ประจำเดือน ${monthLabel}`],
    [`ชื่อหน่วยงาน ${settings.departmentName} — ${settings.hospitalName}`],
    [
      `วันทำการ ${workingDaysTotal} วัน | วันหยุด ${month.holidays.length} วัน | ${
        month.workloadHeaderNote?.trim() || 'Workload'
      }`,
    ],
    [],
    ['ลำดับ', 'ชื่อ - สกุล', 'ตำแหน่ง', ...dayHeaders, 'ช*', 'บ*', 'ด*', 'รวม'],
  ];

  let wlTotalM = 0;
  let wlTotalA = 0;
  let wlTotalN = 0;
  let wlGrandTotal = 0;

  summaries.forEach((s, idx) => {
    const wlCells = dayHeaders.map((d) => s.entry?.workloadShifts?.[d] || '');
    wlTotalM += s.workloadMorningDays.length;
    wlTotalA += s.workloadAfternoonDays.length;
    wlTotalN += s.workloadNightDays.length;
    wlGrandTotal += s.workloadCount;

    wlRosterRows.push([
      idx + 1,
      s.staff.fullName,
      s.staff.positionLabel,
      ...wlCells,
      s.workloadMorningDays.length || '',
      s.workloadAfternoonDays.length || '',
      s.workloadNightDays.length || '',
      s.workloadCount || '',
    ]);
  });

  wlRosterRows.push([
    '',
    `รวมจำนวนเวร Workload ทั้งสิ้น (${summaries.length} คน)`,
    '',
    ...dayHeaders.map(() => ''),
    wlTotalM,
    wlTotalA,
    wlTotalN,
    wlGrandTotal,
  ]);

  const wsWlRoster = XLSX.utils.aoa_to_sheet(wlRosterRows);
  XLSX.utils.book_append_sheet(wb, wsWlRoster, 'ตารางเวร_Workload');

  // =========================================================================
  // Sheet 3: ตารางปฏิบัติงานเวร SMC (แยกตารางเฉพาะ SMC)
  // =========================================================================
  const smcRosterRows: (string | number)[][] = [
    [`ตารางปฏิบัติงานเวร SMC ประจำเดือน ${monthLabel}`],
    [`ชื่อหน่วยงาน ${settings.departmentName} — ${settings.hospitalName}`],
    [
      `วันทำการ ${workingDaysTotal} วัน | วันหยุด ${month.holidays.length} วัน | ${
        month.smcHeaderNote?.trim() || 'SMC'
      }`,
    ],
    [],
    ['ลำดับ', 'ชื่อ - สกุล', 'ตำแหน่ง', ...dayHeaders, 'รวม'],
  ];

  let smcGrandTotal = 0;

  summaries.forEach((s, idx) => {
    const smcCells = dayHeaders.map((d) => (s.entry?.smcShifts?.[d] ? 'SMC' : ''));
    smcGrandTotal += s.smcCount;

    smcRosterRows.push([
      idx + 1,
      s.staff.fullName,
      s.staff.positionLabel,
      ...smcCells,
      s.smcCount || '',
    ]);
  });

  smcRosterRows.push([
    '',
    `รวมจำนวนเวร SMC ทั้งสิ้น (${summaries.length} คน)`,
    '',
    ...dayHeaders.map(() => ''),
    smcGrandTotal,
  ]);

  const wsSmcRoster = XLSX.utils.aoa_to_sheet(smcRosterRows);
  XLSX.utils.book_append_sheet(wb, wsSmcRoster, 'ตารางเวร_SMC');

  // =========================================================================
  // Sheet 2: หลักฐานการจ่ายเงินตอบแทน OT (ส่วนที่ 2 - เวร OT + Standby)
  // =========================================================================
  const otRows: (string | number)[][] = [
    ['หลักฐานการจ่ายเงินตอบแทนการปฏิบัติงานนอกเวลาราชการ'],
    [`ชื่อส่วนราชการ ${settings.hospitalName} ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'ชื่อ - สกุล',
      'ตำแหน่ง',
      'อัตราเงินตอบแทน',
      'เวร',
      'วันที่ที่ปฏิบัติงานนอกเวลาราชการ',
      'รวมเวลาปฏิบัติงาน',
      'จำนวนเงิน',
      'หักภาษีที่รับเงิน',
      'คงรับจริง',
      'วัน เดือน ปี ผู้รับเงิน',
      'ลายมือชื่อ',
      'หมายเหตุ (รวมรายบุคคล)',
    ],
  ];

  const eligibleOt = summaries.filter((s) => s.regularOtTotal > 0);
  let grandRegularOt = 0;

  eligibleOt.forEach((s, idx) => {
    grandRegularOt += s.regularOtTotal;
    const roleLabel = CATEGORY_LABELS[s.staff.category];

    const morningDays = s.hasDistinctPublicHolidayRate ? s.regularOtMorningDays : s.otMorningDays;
    const afternoonDays = s.hasDistinctPublicHolidayRate
      ? s.regularOtAfternoonDays
      : s.otAfternoonDays;
    const nightDays = s.hasDistinctPublicHolidayRate ? s.regularOtNightDays : s.otNightDays;

    otRows.push([
      idx + 1,
      s.staff.fullName,
      roleLabel,
      s.otRate,
      'ช',
      formatDayList(morningDays),
      morningDays.length,
      s.otMorningAmount,
      '-',
      s.otMorningAmount,
      month.payDateLabel,
      '',
      '',
    ]);
    otRows.push([
      '',
      '',
      '',
      s.otRate,
      'บ',
      formatDayList(afternoonDays),
      afternoonDays.length,
      s.otAfternoonAmount,
      '-',
      s.otAfternoonAmount,
      '"',
      '',
      '',
    ]);
    otRows.push([
      '',
      '',
      '',
      s.otRate,
      'ด',
      formatDayList(nightDays),
      nightDays.length,
      s.otNightAmount,
      '-',
      s.otNightAmount,
      '"',
      '',
      '',
    ]);
    const pubShiftRows = [
      { code: 'ช', days: s.publicHolidayOtMorningDays },
      { code: 'บ', days: s.publicHolidayOtAfternoonDays },
      { code: 'ด', days: s.publicHolidayOtNightDays },
    ].filter((item) => item.days.length > 0);
    const hasPubRows = pubShiftRows.length > 0;

    otRows.push([
      '',
      '',
      'เวรดึก Standby',
      s.standbyRate,
      'ด',
      formatDayList(s.standbyDays),
      s.standbyDays.length,
      s.standbyAmount,
      '-',
      s.standbyAmount,
      '"',
      '',
      hasPubRows ? '' : s.regularOtTotal,
    ]);

    pubShiftRows.forEach((item, pIdx) => {
      const isLastPubRow = pIdx === pubShiftRows.length - 1;
      const rowAmount = item.days.length * s.publicHolidayOtRate;
      otRows.push([
        '',
        '',
        pIdx === 0 ? specialRateLabel : '',
        s.publicHolidayOtRate,
        item.code,
        formatDayList(item.days),
        item.days.length,
        rowAmount,
        '-',
        rowAmount,
        '"',
        '',
        isLastPubRow ? s.regularOtTotal : '',
      ]);
    });
  });

  otRows.push([
    '',
    'รวมทั้งสิ้น (ตัวอักษร)',
    numberToThaiBahtText(grandRegularOt),
    '',
    '',
    '',
    '',
    grandRegularOt,
    '-',
    grandRegularOt,
    '',
    '',
    grandRegularOt,
  ]);

  const wsOt = XLSX.utils.aoa_to_sheet(otRows);
  XLSX.utils.book_append_sheet(wb, wsOt, 'เบิกจ่ายค่าเวร_OT');

  // =========================================================================
  // Sheet 3: สรุปวันปฏิบัติงาน Workload (ช*, บ*, ด* — ไม่คิดเงิน เบิกแยกตาราง)
  // =========================================================================
  const wlRows: (string | number)[][] = [
    ['สรุปวันที่ปฏิบัติงานเวร Workload (ช*, บ*, ด*) — ไม่คิดเงินในตาราง OT'],
    [`ชื่อส่วนราชการ ${settings.hospitalName} ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'ชื่อ - สกุล',
      'ตำแหน่ง',
      'เวร Workload',
      'วันที่ที่ปฏิบัติงาน',
      'จำนวนเวร',
      'รวมเวรรายบุคคล',
      'หมายเหตุ',
    ],
  ];

  const eligibleWl = summaries.filter((s) => s.workloadCount > 0);
  let totalWlShifts = 0;

  eligibleWl.forEach((s, idx) => {
    totalWlShifts += s.workloadCount;
    const roleLabel = CATEGORY_LABELS[s.staff.category];

    wlRows.push([
      idx + 1,
      s.staff.fullName,
      roleLabel,
      'ช*',
      formatDayList(s.workloadMorningDays),
      s.workloadMorningDays.length,
      '',
      'เบิกแยกตาราง',
    ]);
    wlRows.push([
      '',
      '',
      '',
      'บ*',
      formatDayList(s.workloadAfternoonDays),
      s.workloadAfternoonDays.length,
      '',
      '',
    ]);
    wlRows.push([
      '',
      '',
      '',
      'ด*',
      formatDayList(s.workloadNightDays),
      s.workloadNightDays.length,
      s.workloadCount,
      'ไม่รวมคิดเงิน OT',
    ]);
  });

  wlRows.push([
    '',
    'รวมจำนวนเวร Workload ทั้งสิ้น',
    '',
    '',
    '',
    totalWlShifts,
    totalWlShifts,
    'ไม่คิดเงิน (เบิกแยกตาราง)',
  ]);

  const wsWl = XLSX.utils.aoa_to_sheet(wlRows);
  XLSX.utils.book_append_sheet(wb, wsWl, 'สรุปวัน_Workload');

  XLSX.writeFile(wb, `ตารางเวรและเบิกจ่าย_OT_${month.monthId}.xlsx`);
}
