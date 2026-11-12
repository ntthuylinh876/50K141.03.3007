'use strict';

/**
 * Tiện ích ngày/giờ.
 *
 * Lưu ý quan trọng: cột DATE/TIME của SQL Server được driver trả về dạng đối tượng
 * Date theo giờ địa phương của máy chủ Node. Vì vậy KHÔNG dùng toISOString()
 * (hàm này chuyển sang UTC và có thể lệch 1 ngày). Luôn dùng các hàm dưới đây.
 */

const config = require('../config/env');

const TZ = config.timezone;

const WEEKDAY_VN = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

const WEEKDAY_SHORT_VN = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** Các thành phần ngày/giờ hiện tại theo múi giờ của quán. */
function nowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Hôm nay theo múi giờ quán, dạng 'YYYY-MM-DD'. */
function todayISO() {
  const p = nowParts();
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Giờ hiện tại theo múi giờ quán, dạng 'HH:mm:ss'. */
function nowTime() {
  const p = nowParts();
  return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** Giờ hiện tại dạng 'HH:mm'. */
function nowHM() {
  const p = nowParts();
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Chuẩn hóa một giá trị ngày bất kỳ về chuỗi 'YYYY-MM-DD'.
 * Nhận: Date, 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss', hoặc null.
 */
function toISODate(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (m) return m[1];
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return null;
}

/**
 * Chuẩn hóa giá trị giờ về 'HH:mm'.
 * Nhận Date (cột TIME của SQL Server), 'HH:mm:ss' hoặc 'HH:mm'.
 */
function toHM(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (m) return `${pad2(Number(m[1]))}:${m[2]}`;
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  return null;
}

/** Chuẩn hóa giá trị giờ về 'HH:mm:ss'. */
function toHMS(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
    if (m) return `${pad2(Number(m[1]))}:${m[2]}:${m[3] || '00'}`;
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
  }
  return null;
}

/** 'HH:mm' -> số phút tính từ 00:00. */
function hmToMinutes(hm) {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Cộng/trừ ngày trên chuỗi ISO. */
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** Thứ trong tuần của chuỗi ISO (0 = Chủ Nhật … 6 = Thứ Bảy). */
function weekdayIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Thứ Hai đầu tuần chứa ngày `iso`. */
function startOfWeekISO(iso) {
  const idx = weekdayIndex(iso);
  const diff = idx === 0 ? -6 : 1 - idx; // tuần bắt đầu từ Thứ Hai
  return addDaysISO(iso, diff);
}

/** Chủ Nhật cuối tuần chứa ngày `iso`. */
function endOfWeekISO(iso) {
  return addDaysISO(startOfWeekISO(iso), 6);
}

/** 7 ngày của tuần chứa `iso`, từ Thứ Hai đến Chủ Nhật. */
function weekDaysISO(iso) {
  const start = startOfWeekISO(iso);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

/** Khoảng ngày của một tháng. */
function monthRangeISO(year, month) {
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(last)}`,
    days: last,
  };
}

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy'. */
function formatDateVN(iso) {
  const s = toISODate(iso);
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** 'YYYY-MM-DD' -> 'dd/mm'. Dùng cho ô ngày trong lịch làm việc tuần. */
function formatDayMonthVN(iso) {
  const s = toISODate(iso);
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

/** 'YYYY-MM-DD' -> 'Thứ Hai, 03/11/2026'. */
function formatDateLongVN(iso) {
  const s = toISODate(iso);
  if (!s) return '';
  return `${WEEKDAY_VN[weekdayIndex(s)]}, ${formatDateVN(s)}`;
}

/** 'YYYY-MM-DD' -> 'T2' … 'CN'. */
function weekdayShortVN(iso) {
  const s = toISODate(iso);
  if (!s) return '';
  return WEEKDAY_SHORT_VN[weekdayIndex(s)];
}

/** 'YYYY-MM-DD' -> 'Thứ Hai'. */
function weekdayNameVN(iso) {
  const s = toISODate(iso);
  if (!s) return '';
  return WEEKDAY_VN[weekdayIndex(s)];
}

/** Ngày cuối tuần (Thứ Bảy hoặc Chủ Nhật). */
function isWeekend(iso) {
  const idx = weekdayIndex(iso);
  return idx === 0 || idx === 6;
}

/** Số giờ giữa hai mốc 'HH:mm' (làm tròn 2 chữ số). */
function hoursBetween(startHM, endHM) {
  const a = hmToMinutes(startHM);
  const b = hmToMinutes(endHM);
  if (a == null || b == null) return 0;
  const diff = b - a;
  if (diff <= 0) return 0;
  return Math.round((diff / 60) * 100) / 100;
}

module.exports = {
  TZ,
  WEEKDAY_VN,
  WEEKDAY_SHORT_VN,
  nowParts,
  todayISO,
  nowTime,
  nowHM,
  toISODate,
  toHM,
  toHMS,
  hmToMinutes,
  addDaysISO,
  weekdayIndex,
  startOfWeekISO,
  endOfWeekISO,
  weekDaysISO,
  monthRangeISO,
  formatDateVN,
  formatDayMonthVN,
  formatDateLongVN,
  weekdayShortVN,
  weekdayNameVN,
  isWeekend,
  hoursBetween,
};
