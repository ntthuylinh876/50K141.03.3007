'use strict';

/**
 * Xử lý phản hồi phiếu lương của nhân viên (UC08 — luồng thay thế 4a).
 *
 * Nhân viên gửi phản hồi với TrangThai = 'Chờ xử lý' và NoiDungDeXuat = NULL.
 * Quản lý / Chủ quán xem danh sách và đánh dấu đã xử lý (TrangThai = 'Đã xử lý',
 * ghi nhận MaQL là người xử lý).
 *
 * Các dòng có NoiDungDeXuat khác NULL là đề xuất chỉnh sửa lương của Quản lý
 * (O3 — 7.2.3.45) và được xử lý ở màn "Chủ quán xét đề xuất", KHÔNG thuộc màn này.
 *
 * Không đổi CSDL: dùng các cột có sẵn của bảng PhanHoiLuong.
 */

const { query, sql } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');

const STATUS = Object.freeze({
  PENDING: 'Chờ xử lý',
  PROCESSED: 'Đã xử lý',
});

const MSG_PROCESSED = 'Đã đánh dấu xử lý phản hồi!';
const MSG_ALREADY_PROCESSED = 'Phản hồi này đã được xử lý.';
const MSG_NOT_FOUND = 'Không tìm thấy phản hồi.';
const MSG_NO_FEEDBACK = 'Không có phản hồi phiếu lương nào!';

/** Nhãn + màu trạng thái để view dùng chung. */
function statusMeta(status) {
  if (status === STATUS.PROCESSED) return { label: status, tone: 'success' };
  return { label: STATUS.PENDING, tone: 'warning' };
}

/** "10:26 28/10/2026" */
function formatSentAt(value) {
  const iso = dt.toISODate(value);
  if (!iso) return '';
  const date = value instanceof Date ? value : new Date(value);
  const hm = Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${hm} ${dt.formatDateVN(iso)}`.trim();
}

function mapRow(row) {
  return {
    id: String(row.MaPH).trim(),
    maNV: String(row.MaNV || '').trim(),
    hoTen: row.HoTen,
    maPL: String(row.MaPL || '').trim(),
    kyLabel: `Tháng ${String(row.Thang).padStart(2, '0')}/${row.Nam}`,
    lyDo: row.LyDo,
    ngayGui: formatSentAt(row.NgayGui),
    trangThai: row.TrangThai,
    status: statusMeta(row.TrangThai),
    isPending: row.TrangThai === STATUS.PENDING,
    nguoiXuLy: row.NguoiXuLy || '',
  };
}

/**
 * Danh sách phản hồi phiếu lương của nhân viên, mới nhất trước.
 * @param {{ limit?: number }} [options]
 */
async function getFeedbacks(options = {}) {
  const limit = Number(options.limit) || 60;
  const result = await query(
    `SELECT TOP (@limit) ph.MaPH, ph.NgayGui, ph.LyDo, ph.TrangThai,
            nv.MaNV, nv.HoTen,
            pl.MaPL, bl.Thang, bl.Nam,
            ql.HoTen AS NguoiXuLy
       FROM PhanHoiLuong ph
       JOIN NhanVien nv ON nv.MaNV = ph.MaNV
       LEFT JOIN PhieuLuong pl ON pl.MaPL = ph.MaPL
       LEFT JOIN BangLuong bl ON bl.MaBL = pl.MaBL
       LEFT JOIN QuanLy ql ON ql.MaQL = ph.MaQL
      WHERE ph.NoiDungDeXuat IS NULL
      ORDER BY CASE WHEN ph.TrangThai = N'Chờ xử lý' THEN 0 ELSE 1 END,
               ph.NgayGui DESC`,
    { limit: { type: sql.Int, value: limit } },
  );
  return result.recordset.map(mapRow);
}

/** Số phản hồi đang chờ xử lý (hiện trên banner). */
async function countPending() {
  const result = await query(
    `SELECT COUNT(*) AS total
       FROM PhanHoiLuong
      WHERE TrangThai = @pending AND NoiDungDeXuat IS NULL`,
    { pending: { type: sql.NVarChar(20), value: STATUS.PENDING } },
  );
  return Number(result.recordset[0]?.total || 0);
}

/**
 * Đánh dấu phản hồi đã được xử lý.
 * @param {string} maPH
 * @param {string} maQL người xử lý
 */
async function markProcessed(maPH, maQL) {
  const id = String(maPH || '').trim();
  const result = await query(
    `UPDATE PhanHoiLuong
        SET TrangThai = @processed, MaQL = @maQL
      WHERE MaPH = @maPH
        AND NoiDungDeXuat IS NULL
        AND TrangThai = @pending`,
    {
      processed: { type: sql.NVarChar(20), value: STATUS.PROCESSED },
      pending: { type: sql.NVarChar(20), value: STATUS.PENDING },
      maQL: { type: sql.Char(10), value: maQL },
      maPH: { type: sql.Char(10), value: id },
    },
  );

  if (result.rowsAffected[0]) return MSG_PROCESSED;

  const exists = await query(
    `SELECT TrangThai FROM PhanHoiLuong
      WHERE MaPH = @maPH AND NoiDungDeXuat IS NULL`,
    { maPH: { type: sql.Char(10), value: id } },
  );
  if (!exists.recordset[0]) throw notFound(MSG_NOT_FOUND);
  throw badRequest(MSG_ALREADY_PROCESSED);
}

module.exports = {
  STATUS,
  MSG_PROCESSED,
  MSG_ALREADY_PROCESSED,
  MSG_NOT_FOUND,
  MSG_NO_FEEDBACK,
  statusMeta,
  formatSentAt,
  getFeedbacks,
  countPending,
  markProcessed,
};
