'use strict';

/**
 * Định dạng hiển thị theo chuẩn Việt Nam dùng trên toàn bộ giao diện.
 */

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 4400000 -> '4.400.000' */
function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return nf0.format(n);
}

/** 4400000 -> '4.400.000đ' */
function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0đ';
  return `${nf0.format(Math.round(n))}đ`;
}

/** 25000 -> '25.000đ/giờ' */
function formatHourlyRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0đ/giờ';
  return `${nf0.format(Math.round(n))}đ/giờ`;
}

/** 6.5 -> '6,50' ; 6 -> '6' */
function formatHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : nf2.format(n);
}

/** 2 -> '2,00' (dùng cho hệ số lương) */
function formatCoefficient(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '1,00';
  return nf2.format(n);
}

/** '0901234567' -> '0901 234 567' */
function formatPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (s.length === 10) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  return s;
}

/** Rút gọn văn bản dài. */
function truncate(text, max = 60) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Chuyển giá trị bất kỳ sang số, mặc định 0. */
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  formatNumber,
  formatCurrency,
  formatHourlyRate,
  formatHours,
  formatCoefficient,
  formatPhone,
  truncate,
  toNumber,
};
