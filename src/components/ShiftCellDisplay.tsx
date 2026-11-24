import React from 'react';
import {
  MainShiftCode,
  NightShiftCode,
  PublicHolidayShiftCode,
  ShiftRowKey,
  SmcShiftCode,
  StandbyShiftCode,
  WorkloadShiftCode,
} from '../types/roster';

interface ShiftCellDisplayProps {
  rowKey: ShiftRowKey;
  value:
    | MainShiftCode
    | NightShiftCode
    | WorkloadShiftCode
    | StandbyShiftCode
    | PublicHolidayShiftCode
    | SmcShiftCode
    | undefined;
  isHoliday: boolean;
  isWeekend?: boolean;
  compact?: boolean;
  docMode?: boolean;
}

/**
 * Renders shift codes with exact hospital color-coding rules:
 * - Working shift (08.00-16.00 on working day): BLACK (#0F172A)
 * - OT shift (out of office hours: ช on holiday, บ any day, ด night): RED (#DC2626)
 * - Off shift (0) on weekends/holidays: RED (#DC2626)
 * - Workload OT shift (ช*, บ*, ด*): GREEN (#15803D)
 * - Standby Night shift (ด): BLUE (#0284C7)
 * - Public Holiday / Special shift (ช, บ, ด): FUCHSIA / MAGENTA (#C026D3)
 */
export const ShiftCellDisplay: React.FC<ShiftCellDisplayProps> = ({
  rowKey,
  value,
  isHoliday,
  isWeekend = false,
  compact = false,
  docMode = false,
}) => {
  if (!value) {
    return <span className="text-slate-300 select-none">&nbsp;</span>;
  }

  const sizeClass = docMode
    ? 'text-[12px] leading-tight'
    : compact
    ? 'text-[11px] leading-none'
    : 'text-[13px] leading-none';

  if (rowKey === 'mainShifts') {
    if (value === '0') {
      return (
        <span
          className={`${sizeClass} tabular-nums ${
            isWeekend || isHoliday
              ? 'font-semibold text-red-600'
              : 'font-medium text-slate-600'
          }`}
        >
          0
        </span>
      );
    }

    if (value === 'ป่วย' || value === 'กิจ' || value === 'vac') {
      return <span className={`${sizeClass} font-semibold text-slate-900`}>{value}</span>;
    }

    if (!isHoliday) {
      // Working day: ช is black (regular), บ is red (OT), ช/บ is black ช + red /บ
      if (value === 'ช') {
        return <span className={`${sizeClass} font-semibold text-slate-950`}>ช</span>;
      }
      if (value === 'บ') {
        return <span className={`${sizeClass} font-semibold text-red-600`}>บ</span>;
      }
      if (value === 'ช/บ') {
        return (
          <span className={`${sizeClass} font-semibold whitespace-nowrap`}>
            <span className="text-slate-950">ช</span>
            <span className="text-red-600">/บ</span>
          </span>
        );
      }
    } else {
      // Holiday / Weekend: ช, บ, ช/บ are ALL red (OT)
      return <span className={`${sizeClass} font-semibold text-red-600 whitespace-nowrap`}>{value}</span>;
    }
  }

  if (rowKey === 'nightShifts') {
    return <span className={`${sizeClass} font-semibold text-red-600`}>{value}</span>;
  }

  if (rowKey === 'workloadShifts') {
    return <span className={`${sizeClass} font-semibold text-green-700 whitespace-nowrap`}>{value}</span>;
  }

  if (rowKey === 'standbyShifts') {
    return <span className={`${sizeClass} font-semibold text-sky-600`}>{value}</span>;
  }

  if (rowKey === 'publicHolidayShifts') {
    return (
      <span className={`${sizeClass} font-semibold text-fuchsia-600 whitespace-nowrap`}>
        {value}
      </span>
    );
  }

  if (rowKey === 'smcShifts') {
    const smcSizeClass = docMode
      ? 'text-[10px] leading-tight tracking-tight'
      : compact
      ? 'text-[9px] leading-none tracking-tight'
      : 'text-[11px] leading-none tracking-tight';
    return (
      <span className={`${smcSizeClass} font-bold text-purple-700 whitespace-nowrap`}>
        SMC
      </span>
    );
  }

  return <span className={`${sizeClass} text-slate-900`}>{value}</span>;
};
