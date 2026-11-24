export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// Common fixed Thai public holidays (monthNumber-day)
const FIXED_THAI_HOLIDAYS: Record<string, string> = {
  '1-1': 'วันขึ้นปีใหม่',
  '4-6': 'วันจักรี',
  '4-13': 'วันสงกรานต์',
  '4-14': 'วันสงกรานต์',
  '4-15': 'วันสงกรานต์',
  '5-4': 'วันฉัตรมงคล',
  '6-3': 'วันเฉลิมพระชนมพรรษาพระราชินี',
  '7-28': 'วันเฉลิมพระชนมพรรษา ร.10',
  '8-12': 'วันแม่แห่งชาติ',
  '10-13': 'วันนวมินทรมหาราช',
  '10-23': 'วันปิยมหาราช',
  '12-5': 'วันพ่อแห่งชาติ',
  '12-10': 'วันรัฐธรรมนูญ',
  '12-31': 'วันสิ้นปี',
};

export function getDaysInMonth(yearAD: number, monthNumber: number): number {
  return new Date(yearAD, monthNumber, 0).getDate();
}

export function getDayOfWeek(yearAD: number, monthNumber: number, day: number): number {
  return new Date(yearAD, monthNumber - 1, day).getDay(); // 0=Sun, 6=Sat
}

export function formatMonthId(yearAD: number, monthNumber: number): string {
  return `${yearAD}-${String(monthNumber).padStart(2, '0')}`;
}

export function getCurrentMonthId(referenceDate: Date = new Date()): string {
  return formatMonthId(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
}

export function parseMonthId(monthId: string): { yearAD: number; monthNumber: number } {
  const now = new Date();
  const [y, m] = monthId.split('-').map(Number);
  return {
    yearAD: y || now.getFullYear(),
    monthNumber: m || now.getMonth() + 1,
  };
}

export function getBuddhistYear(yearAD: number): number {
  return yearAD + 543;
}

export function getThaiMonthYearLabel(yearAD: number, monthNumber: number): string {
  const monthName = THAI_MONTHS[monthNumber - 1] || '';
  return `${monthName} ${getBuddhistYear(yearAD)}`;
}

export function getDefaultPayDateLabel(yearAD: number, monthNumber: number): string {
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYearAD = monthNumber === 12 ? yearAD + 1 : yearAD;
  const shortBE = String(getBuddhistYear(nextYearAD)).slice(-2);
  return `${THAI_MONTHS_SHORT[nextMonth - 1]}-${shortBE}`;
}

export function getDefaultPublicHolidaysForMonth(yearAD: number, monthNumber: number): number[] {
  const daysCount = getDaysInMonth(yearAD, monthNumber);
  const publicHolidays: number[] = [];
  for (let d = 1; d <= daysCount; d++) {
    const fixedKey = `${monthNumber}-${d}`;
    if (Boolean(FIXED_THAI_HOLIDAYS[fixedKey])) {
      publicHolidays.push(d);
    }
  }
  return publicHolidays;
}

export function getDefaultHolidaysForMonth(yearAD: number, monthNumber: number): number[] {
  const daysCount = getDaysInMonth(yearAD, monthNumber);
  const holidays: number[] = [];
  for (let d = 1; d <= daysCount; d++) {
    const dow = getDayOfWeek(yearAD, monthNumber, d);
    const fixedKey = `${monthNumber}-${d}`;
    if (dow === 0 || dow === 6 || Boolean(FIXED_THAI_HOLIDAYS[fixedKey])) {
      holidays.push(d);
    }
  }
  return holidays;
}

export function formatCurrency(amount: number): string {
  if (amount === 0) return '0';
  return amount.toLocaleString('en-US');
}

/**
 * Converts a numeric Baht amount to official Thai financial text (e.g. 110660 -> หนึ่งแสนหนึ่งหมื่นหกร้อยหกสิบบาทถ้วน)
 */
export function numberToThaiBahtText(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return 'ศูนย์บาทถ้วน';
  const rounded = Math.round(amount * 100) / 100;
  if (rounded === 0) return 'ศูนย์บาทถ้วน';

  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  const readInteger = (numStr: string): string => {
    const clean = numStr.replace(/^0+/, '');
    if (!clean) return '';
    if (clean.length > 6) {
      const upper = clean.slice(0, -6);
      const lower = clean.slice(-6);
      return `${readInteger(upper)}ล้าน${readInteger(lower)}`;
    }
    let result = '';
    const len = clean.length;
    for (let i = 0; i < len; i++) {
      const digit = Number(clean[i]);
      const pos = len - i - 1;
      if (digit === 0) continue;
      if (pos === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด';
      } else if (pos === 1 && digit === 2) {
        result += 'ยี่สิบ';
      } else if (pos === 1 && digit === 1) {
        result += 'สิบ';
      } else {
        result += digits[digit] + positions[pos];
      }
    }
    return result;
  };

  const [intPartStr, decPartStr = '00'] = rounded.toFixed(2).split('.');
  const bahtText = readInteger(intPartStr);
  const satangNum = Number(decPartStr);

  if (satangNum === 0) {
    return `${bahtText || 'ศูนย์'}บาทถ้วน`;
  }
  const satangText = readInteger(String(satangNum));
  return `${bahtText ? `${bahtText}บาท` : ''}${satangText}สตางค์`;
}

const THAI_DIGITS_MAP: Record<string, string> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
};

/**
 * Parses a flexible day-number string (e.g. "3, 10, 25, 31" or "3 10 19-20" or Thai digits)
 * into sorted unique valid days within 1..maxDay, plus any invalid tokens for inline feedback.
 */
export function parseDayListInput(
  raw: string,
  maxDay: number,
): { days: number[]; invalidTokens: string[] } {
  const normalized = raw
    .replace(/[๐-๙]/g, (ch) => THAI_DIGITS_MAP[ch] ?? ch)
    .trim();

  if (!normalized) {
    return { days: [], invalidTokens: [] };
  }

  const tokens = normalized.split(/[\s,;/、.]+/).filter(Boolean);
  const validSet = new Set<number>();
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 1 &&
        end >= start &&
        end <= maxDay
      ) {
        for (let d = start; d <= end; d++) {
          validSet.add(d);
        }
      } else {
        invalidTokens.push(token);
      }
      continue;
    }

    if (/^\d+$/.test(token)) {
      const num = Number(token);
      if (num >= 1 && num <= maxDay) {
        validSet.add(num);
      } else {
        invalidTokens.push(token);
      }
    } else {
      invalidTokens.push(token);
    }
  }

  return {
    days: Array.from(validSet).sort((a, b) => a - b),
    invalidTokens,
  };
}

