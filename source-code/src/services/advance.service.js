'use strict';

/**
 * Duyệt yêu cầu ứng lương (UC09 → UC13.1).
 *
 * Nhân viên gửi yêu cầu với TrangThai = 'Chờ duyệt'; Quản lý / Chủ quán duyệt
 * ở màn "Duyệt ứng lương". Chỉ khoản 'Đã duyệt' mới được trừ vào phiếu lương
 * khi sinh bảng lương (xem payroll.service.loadApprovedAdvances).
 *
 * Không đổi CSDL: dùng các cột có sẵn của bảng UngLuong.
 */

const { query, sql } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');
const fmt = require('../utils/format');

const STATUS = Object.freeze({
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
});

const MSG_APPROVED = 'Đã duyệt yêu cầu ứng lương!';
const MSG_REJECTED = 'Không duyệt yêu cầu ứng lương!';
const MSG_NO_REQUESTS = 'Không có yêu cầu ứng lương nào!';
const MSG_NOT_PENDING = 'Yêu cầu ứng lương này đã được xử lý.';
const MSG_NOT_FOUND = 'Không tìm thấy yêu cầu ứng lương.';

/** Nhãn + màu trạng thái để view dùng chung. */
function statusMeta(status) {
  if (status === STATUS.APPROVED) return { label: status, tone: 'success' };
  if (status === STATUS.REJECTED) return { label: status, tone: 'danger' };
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
  const amount = Number(row.SoTien);
  return {
    id: String(row.MaUL).trim(),
    maNV: String(row.MaNV || '').trim(),
    hoTen: row.HoTen,
    ngayGui: formatSentAt(row.NgayGui),
    soTien: amount,
    soTienLabel: fmt.formatCurrency(amount),
    trangThai: row.TrangThai,
    status: statusMeta(row.TrangThai),
    isPending: row.TrangThai === STATUS.PENDING,
    lyDo: row.LyDo,
    nguoiDuyet: row.NguoiDuyet || '',
  };
}

/**
 * Danh sách yêu cầu ứng lương, mới nhất trước.
 * @param {{ limit?: number }} [options]
 */
async function getAdvances(options = {}) {
  const limit = Number(options.limit) || 60;
  const result = await query(
    `SELECT TOP (@limit) ul.MaUL, ul.NgayGui, ul.SoTien, ul.TrangThai, ul.LyDo,
            nv.MaNV, nv.HoTen,
            ql.HoTen AS NguoiDuyet
       FROM UngLuong ul
       JOIN NhanVien nv ON nv.MaNV = ul.MaNV
       LEFT JOIN QuanLy ql ON ql.MaQL = ul.MaQL
      ORDER BY ul.NgayGui DESC`,
    { limit: { type: sql.Int, value: limit } },
  );
  return result.recordset.map(mapRow);
}

/** Số yêu cầu đang chờ duyệt (hiện trên banner). */
async function countPending() {
  const result = await query(
    `SELECT COUNT(*) AS total FROM UngLuong WHERE TrangThai = @pending`,
    { pending: { type: sql.NVarChar(20), value: STATUS.PENDING } },
  );
  return Number(result.recordset[0]?.total || 0);
}

async function load(maUL) {
  const result = await query(
    `SELECT ul.MaUL, ul.NgayGui, ul.SoTien, ul.TrangThai, ul.LyDo,
            nv.MaNV, nv.HoTen
       FROM UngLuong ul
       JOIN NhanVien nv ON nv.MaNV = ul.MaNV
      WHERE ul.MaUL = @maUL`,
    { maUL: { type: sql.Char(10), value: String(maUL || '').trim() } },
  );
  const row = result.recordset[0];
  if (!row) throw notFound(MSG_NOT_FOUND);
  return row;
}

async function setStatus(maUL, status, maQL) {
  const row = await load(maUL);
  if (row.TrangThai !== STATUS.PENDING) throw badRequest(MSG_NOT_PENDING);

  const result = await query(
    `UPDATE UngLuong
        SET TrangThai = @status, MaQL = @maQL
      WHERE MaUL = @maUL AND TrangThai = @pending`,
    {
      status: { type: sql.NVarChar(20), value: status },
      pending: { type: sql.NVarChar(20), value: STATUS.PENDING },
      maQL: { type: sql.Char(10), value: maQL },
      maUL: { type: sql.Char(10), value: String(maUL).trim() },
    },
  );
  if (!result.rowsAffected[0]) throw badRequest(MSG_NOT_PENDING);
  return row;
}

/** Duyệt — khoản ứng sẽ được gắn vào phiếu lương khi sinh kỳ tương ứng. */
async function approveAdvance(maUL, maQL) {
  await setStatus(maUL, STATUS.APPROVED, maQL);
  return MSG_APPROVED;
}

/** Từ chối — khoản ứng không được trừ vào lương. */
async function rejectAdvance(maUL, maQL) {
  await setStatus(maUL, STATUS.REJECTED, maQL);
  return MSG_REJECTED;
}

module.exports = {
  STATUS,
  MSG_APPROVED,
  MSG_REJECTED,
  MSG_NO_REQUESTS,
  MSG_NOT_PENDING,
  MSG_NOT_FOUND,
  statusMeta,
  formatSentAt,
  getAdvances,
  countPending,
  approveAdvance,
  rejectAdvance,
};
