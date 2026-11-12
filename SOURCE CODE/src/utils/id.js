'use strict';

/**
 * Sinh mã khóa chính dạng chuỗi 10 ký tự (CHAR(10) trong CSDL).
 * Định dạng: <tiền tố><số thứ tự đệm 0>. Ví dụ NV001, LLV0001, PL00012.
 */

const { query, sql } = require('../config/db');

const PREFIX = Object.freeze({
  nhanVien: 'NV',
  quanLy: 'QL',
  caLam: 'CA',
  lichLamViec: 'LLV',
  chamCong: 'CC',
  chamCongBoSung: 'CCBS',
  dangKyCaLam: 'DK',
  donXinNghi: 'XN',
  donDoiCa: 'DC',
  donLamThay: 'LT',
  ungLuong: 'UL',
  phanHoiLuong: 'PH',
  bangLuong: 'BL',
  phieuLuong: 'PL',
  chiTietLuong: 'CTL',
});

/**
 * Sinh mã kế tiếp cho một bảng.
 *
 * @param {string} prefix      Tiền tố, ví dụ 'NV'
 * @param {string} table       Tên bảng (đã kiểm tra thuộc danh sách cho phép)
 * @param {string} column      Tên cột khóa chính
 * @param {number} digits      Số chữ số đệm
 * @returns {Promise<string>}  Mã mới, ví dụ 'NV011'
 */
async function nextId(prefix, table, column, digits) {
  // Danh sách trắng để tránh nội suy tên bảng/cột từ dữ liệu người dùng.
  const ALLOWED = new Set([
    'NhanVien.MaNV',
    'QuanLy.MaQL',
    'CaLam.MaCa',
    'LichLamViec.MaLich',
    'ChamCong.MaCC',
    'ChamCongBoSung.MaCCBS',
    'DangKyCaLam.MaDK',
    'DonXinNghi.MaXN',
    'DonDoiCa.MaDC',
    'DonLamThay.MaLT',
    'UngLuong.MaUL',
    'PhanHoiLuong.MaPH',
    'BangLuong.MaBL',
    'PhieuLuong.MaPL',
    'ChiTietLuong.MaCTL',
  ]);
  const key = `${table}.${column}`;
  if (!ALLOWED.has(key)) {
    throw new Error(`Không cho phép sinh mã cho bảng/cột: ${key}`);
  }

  const result = await query(
    `SELECT MAX(TRY_CAST(SUBSTRING(${column}, ${prefix.length + 1}, 10) AS INT)) AS maxSo
       FROM ${table}
      WHERE ${column} LIKE @pattern`,
    { pattern: { type: sql.VarChar(20), value: `${prefix}%` } },
  );

  const current = result.recordset[0]?.maxSo ?? 0;
  const next = Number(current) + 1;
  return prefix + String(next).padStart(digits, '0');
}

/** Sinh mã nhân viên mới: NV001… */
function nextMaNV() {
  return nextId(PREFIX.nhanVien, 'NhanVien', 'MaNV', 3);
}

/** Sinh mã quản lý mới: QL001… */
function nextMaQL() {
  return nextId(PREFIX.quanLy, 'QuanLy', 'MaQL', 3);
}

/** Sinh mã lịch làm việc: LLV0001… */
function nextMaLich() {
  return nextId(PREFIX.lichLamViec, 'LichLamViec', 'MaLich', 4);
}

/** Sinh mã chấm công: CC00001… */
function nextMaCC() {
  return nextId(PREFIX.chamCong, 'ChamCong', 'MaCC', 5);
}

/** Sinh mã phiếu lương: PL00001… */
function nextMaPL() {
  return nextId(PREFIX.phieuLuong, 'PhieuLuong', 'MaPL', 5);
}

/** Sinh mã chi tiết lương: CTL00001… */
function nextMaCTL() {
  return nextId(PREFIX.chiTietLuong, 'ChiTietLuong', 'MaCTL', 5);
}

/** Sinh mã chấm công bổ sung: CCBS00001… */
function nextMaCCBS() {
  return nextId(PREFIX.chamCongBoSung, 'ChamCongBoSung', 'MaCCBS', 5);
}

/** Sinh mã đăng ký ca làm: DK0001… */
function nextMaDK() {
  return nextId(PREFIX.dangKyCaLam, 'DangKyCaLam', 'MaDK', 4);
}

/** Sinh mã đơn xin nghỉ: XN0001… */
function nextMaXN() {
  return nextId(PREFIX.donXinNghi, 'DonXinNghi', 'MaXN', 4);
}

/** Sinh mã đơn đổi ca: DC0001… */
function nextMaDC() {
  return nextId(PREFIX.donDoiCa, 'DonDoiCa', 'MaDC', 4);
}

/** Sinh mã đơn làm thay: LT0001… */
function nextMaLT() {
  return nextId(PREFIX.donLamThay, 'DonLamThay', 'MaLT', 4);
}

/** Sinh mã phiếu ứng lương: UL0001… */
function nextMaUL() {
  return nextId(PREFIX.ungLuong, 'UngLuong', 'MaUL', 4);
}

/** Sinh mã phản hồi lương: PH0001… */
function nextMaPH() {
  return nextId(PREFIX.phanHoiLuong, 'PhanHoiLuong', 'MaPH', 4);
}

/**
 * Mã bảng lương theo kỳ: BL + YYYYMM, ví dụ 'BL202611'.
 * Mỗi kỳ chỉ có đúng một bảng lương nên mã này có thể suy ra từ kỳ.
 */
function maBangLuong(thang, nam) {
  return `BL${nam}${String(thang).padStart(2, '0')}`;
}

module.exports = {
  PREFIX,
  nextId,
  nextMaNV,
  nextMaQL,
  nextMaLich,
  nextMaCC,
  nextMaPL,
  nextMaCTL,
  nextMaCCBS,
  nextMaDK,
  nextMaXN,
  nextMaDC,
  nextMaLT,
  nextMaUL,
  nextMaPH,
  maBangLuong,
};
