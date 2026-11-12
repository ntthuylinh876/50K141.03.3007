'use strict';

/**
 * Nghiệp vụ duyệt đơn của Quản lý / Chủ quán:
 *  - M5: Duyệt đơn xin nghỉ / đổi ca (7.2.2.15 – 7.2.2.19)
 *  - M6: Duyệt đơn xin làm thay (7.2.2.20 – 7.2.2.24)
 *  - M7: Duyệt chấm công bổ sung (7.2.2.25 – 7.2.2.29)
 */

const { query, sql, withTransaction, txRequest } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');
const { nextMaCC } = require('../utils/id');

const MSG_LEAVE_APPROVED = 'Đã duyệt đơn xin nghỉ/ đổi ca!';
const MSG_LEAVE_REJECTED = 'Không duyệt đơn xin nghỉ/ đổi ca!';
const MSG_COVER_APPROVED = 'Đã duyệt đơn xin làm thay!';
const MSG_COVER_REJECTED = 'Không duyệt đơn xin làm thay!';
const MSG_SUPPLEMENT_APPROVED = 'Đã duyệt yêu cầu chấm công bổ sung!';
const MSG_SUPPLEMENT_REJECTED = 'Không duyệt yêu cầu chấm công bổ sung!';

const MSG_NO_REQUESTS = 'Không có đơn chờ duyệt!';
const MSG_NO_SUPPLEMENTS = 'Không có yêu cầu duyệt chấm công bổ sung!';

const STATUS_PENDING = 'Chờ duyệt';

/** Giờ gửi đơn dạng "10:26 28/10/2026". */
function formatSentAt(value) {
  const iso = dt.toISODate(value);
  if (!iso) return '';
  const date = value instanceof Date ? value : new Date(value);
  const hm = Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${hm} ${dt.formatDateVN(iso)}`.trim();
}

/* -------------------------------------------------------------------------- */
/* Danh sách chờ duyệt                                                         */
/* -------------------------------------------------------------------------- */

/** Đơn xin nghỉ đang chờ duyệt. */
async function getPendingLeaves() {
  const result = await query(
    `SELECT xn.MaXN, xn.NgayGui, xn.LyDo,
            nv.MaNV, nv.HoTen
       FROM DonXinNghi xn
       JOIN NhanVien nv ON nv.MaNV = xn.MaNV
      WHERE xn.TrangThai = @pending
      ORDER BY xn.NgayGui DESC`,
    { pending: { type: sql.NVarChar(20), value: STATUS_PENDING } },
  );

  return result.recordset.map((row) => ({
    id: String(row.MaXN).trim(),
    kind: 'leave',
    kindLabel: 'Xin nghỉ',
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    lyDo: row.LyDo,
    ngayGui: formatSentAt(row.NgayGui),
    trangThai: STATUS_PENDING,
  }));
}

/** Đơn đổi ca đang chờ duyệt. */
async function getPendingSwaps() {
  const result = await query(
    `SELECT dc.MaDC, dc.NgayGui, dc.LyDo,
            nv.MaNV, nv.HoTen
       FROM DonDoiCa dc
       JOIN NhanVien nv ON nv.MaNV = dc.MaNV
      WHERE dc.TrangThai = @pending
      ORDER BY dc.NgayGui DESC`,
    { pending: { type: sql.NVarChar(20), value: STATUS_PENDING } },
  );

  return result.recordset.map((row) => ({
    id: String(row.MaDC).trim(),
    kind: 'swap',
    kindLabel: 'Đổi ca',
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    lyDo: row.LyDo,
    ngayGui: formatSentAt(row.NgayGui),
    trangThai: STATUS_PENDING,
  }));
}

/** Gộp đơn xin nghỉ và đơn đổi ca, mới nhất trước. */
async function getPendingLeaveAndSwap() {
  const [leaves, swaps] = await Promise.all([getPendingLeaves(), getPendingSwaps()]);
  return [...leaves, ...swaps].sort((a, b) => (a.ngayGui < b.ngayGui ? 1 : -1));
}

/** Đơn xin làm thay đang chờ duyệt. */
async function getPendingCovers() {
  const result = await query(
    `SELECT lt.MaLT, lt.NgayGui, lt.LyDo,
            nv.MaNV, nv.HoTen
       FROM DonLamThay lt
       JOIN NhanVien nv ON nv.MaNV = lt.MaNV
      WHERE lt.TrangThai = @pending
      ORDER BY lt.NgayGui DESC`,
    { pending: { type: sql.NVarChar(20), value: STATUS_PENDING } },
  );

  return result.recordset.map((row) => ({
    id: String(row.MaLT).trim(),
    kind: 'cover',
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    lyDo: row.LyDo,
    ngayGui: formatSentAt(row.NgayGui),
    trangThai: STATUS_PENDING,
  }));
}

/** Yêu cầu chấm công bổ sung đang chờ duyệt. */
async function getPendingSupplements() {
  const result = await query(
    `SELECT bs.MaCCBS, bs.NgayGui, bs.LyDo,
            nv.MaNV, nv.HoTen,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa
       FROM ChamCongBoSung bs
       JOIN NhanVien nv ON nv.MaNV = bs.MaNV
       LEFT JOIN LichLamViec llv ON llv.MaLich = bs.MaLich
       LEFT JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE bs.TrangThai = @pending
      ORDER BY bs.NgayGui DESC`,
    { pending: { type: sql.NVarChar(20), value: STATUS_PENDING } },
  );

  return result.recordset.map((row) => ({
    id: String(row.MaCCBS).trim(),
    kind: 'supplement',
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    ngayLam: dt.formatDateVN(row.NgayISO),
    tenCa: row.TenCa || '',
    lyDo: row.LyDo,
    ngayGui: formatSentAt(row.NgayGui),
    trangThai: STATUS_PENDING,
  }));
}

/* -------------------------------------------------------------------------- */
/* Chi tiết đơn                                                                */
/* -------------------------------------------------------------------------- */

/** Một ca làm dạng "Thứ Sáu, 30/10/2026 · Ca sáng · 06:00 – 12:00". */
function shiftLabel(row) {
  const ngay = dt.formatDateLongVN(row.NgayISO);
  const gio = `${dt.toHM(row.GioBatDau)} – ${dt.toHM(row.GioKetThuc)}`;
  return `${ngay} · ${row.TenCa} · ${gio}`;
}

async function getLeaveDetail(maXN) {
  const result = await query(
    `SELECT xn.MaXN, xn.NgayGui, xn.LyDo, xn.TrangThai,
            nv.MaNV, nv.HoTen
       FROM DonXinNghi xn
       JOIN NhanVien nv ON nv.MaNV = xn.MaNV
      WHERE xn.MaXN = @id`,
    { id: { type: sql.Char(10), value: maXN } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy đơn xin nghỉ.');

  const shiftsResult = await query(
    `SELECT CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc
       FROM CT_XinNghi ct
       JOIN LichLamViec llv ON llv.MaLich = ct.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE ct.MaXN = @id
      ORDER BY llv.NgayLam, ca.GioBatDau`,
    { id: { type: sql.Char(10), value: maXN } },
  );

  return {
    id: String(request.MaXN).trim(),
    kind: 'leave',
    kindLabel: 'Đơn xin nghỉ',
    title: 'Chi tiết đơn xin nghỉ/ đổi ca',
    backHref: '/quan-ly/duyet-don/xin-nghi-doi-ca',
    hoTen: request.HoTen,
    ngayGui: formatSentAt(request.NgayGui),
    trangThai: request.TrangThai,
    isPending: request.TrangThai === STATUS_PENDING,
    shifts: shiftsResult.recordset.map((row) => ({
      label: shiftLabel(row),
    })),
    shiftLabel: shiftsResult.recordset.map((row) => shiftLabel(row)).join('; '),
    lyDo: request.LyDo,
    reasonLabel: 'Lý do',
    approveUrl: `/quan-ly/duyet-don/xin-nghi-doi-ca/${String(request.MaXN).trim()}/duyet`,
    rejectUrl: `/quan-ly/duyet-don/xin-nghi-doi-ca/${String(request.MaXN).trim()}/khong-duyet`,
    approveMessage: MSG_LEAVE_APPROVED,
    rejectMessage: MSG_LEAVE_REJECTED,
  };
}

async function getSwapDetail(maDC) {
  const result = await query(
    `SELECT dc.MaDC, dc.NgayGui, dc.LyDo, dc.TrangThai,
            nv.MaNV, nv.HoTen,
            CONVERT(char(10), g.NgayLam, 23) AS NgayGoc,
            cg.TenCa AS CaGoc, cg.GioBatDau AS GioGoc, cg.GioKetThuc AS GioGocKT,
            CONVERT(char(10), m.NgayLam, 23) AS NgayDoi,
            cm.TenCa AS CaDoi, cm.GioBatDau AS GioDoi, cm.GioKetThuc AS GioDoiKT,
            nd.HoTen AS NguoiDoi
       FROM DonDoiCa dc
       JOIN NhanVien nv ON nv.MaNV = dc.MaNV
       JOIN LichLamViec g ON g.MaLich = dc.MaLichGoc
       JOIN CaLam cg ON cg.MaCa = g.MaCa
       JOIN LichLamViec m ON m.MaLich = dc.MaLichMuonDoi
       JOIN CaLam cm ON cm.MaCa = m.MaCa
       JOIN NhanVien nd ON nd.MaNV = m.MaNV
      WHERE dc.MaDC = @id`,
    { id: { type: sql.Char(10), value: maDC } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy đơn đổi ca.');

  const goc = shiftLabel({
    NgayISO: request.NgayGoc,
    TenCa: request.CaGoc,
    GioBatDau: request.GioGoc,
    GioKetThuc: request.GioGocKT,
  });
  const doi = shiftLabel({
    NgayISO: request.NgayDoi,
    TenCa: request.CaDoi,
    GioBatDau: request.GioDoi,
    GioKetThuc: request.GioDoiKT,
  });

  return {
    id: String(request.MaDC).trim(),
    kind: 'swap',
    kindLabel: 'Đơn đổi ca',
    title: 'Chi tiết đơn xin nghỉ/ đổi ca',
    backHref: '/quan-ly/duyet-don/xin-nghi-doi-ca',
    hoTen: request.HoTen,
    ngayGui: formatSentAt(request.NgayGui),
    trangThai: request.TrangThai,
    isPending: request.TrangThai === STATUS_PENDING,
    shiftLabel: goc,
    swapTarget: doi,
    swapTargetName: request.NguoiDoi,
    lyDo: request.LyDo,
    reasonLabel: 'Lý do',
    approveUrl: `/quan-ly/duyet-don/xin-nghi-doi-ca/${String(request.MaDC).trim()}/duyet`,
    rejectUrl: `/quan-ly/duyet-don/xin-nghi-doi-ca/${String(request.MaDC).trim()}/khong-duyet`,
    approveMessage: MSG_LEAVE_APPROVED,
    rejectMessage: MSG_LEAVE_REJECTED,
  };
}

async function getCoverDetail(maLT) {
  const result = await query(
    `SELECT lt.MaLT, lt.NgayGui, lt.LyDo, lt.TrangThai,
            nv.MaNV, nv.HoTen,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc
       FROM DonLamThay lt
       JOIN NhanVien nv ON nv.MaNV = lt.MaNV
       JOIN LichLamViec llv ON llv.MaLich = lt.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE lt.MaLT = @id`,
    { id: { type: sql.Char(10), value: maLT } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy đơn xin làm thay.');

  return {
    id: String(request.MaLT).trim(),
    kind: 'cover',
    kindLabel: 'Đơn xin làm thay',
    title: 'Chi tiết đơn xin nghỉ/ đổi ca',
    backHref: '/quan-ly/duyet-don/lam-thay',
    hoTen: request.HoTen,
    ngayGui: formatSentAt(request.NgayGui),
    trangThai: request.TrangThai,
    isPending: request.TrangThai === STATUS_PENDING,
    shiftLabel: shiftLabel(request),
    lyDo: request.LyDo,
    reasonLabel: 'Lý do',
    approveUrl: `/quan-ly/duyet-don/lam-thay/${String(request.MaLT).trim()}/duyet`,
    rejectUrl: `/quan-ly/duyet-don/lam-thay/${String(request.MaLT).trim()}/khong-duyet`,
    approveMessage: MSG_COVER_APPROVED,
    rejectMessage: MSG_COVER_REJECTED,
  };
}

async function getSupplementDetail(maCCBS) {
  const result = await query(
    `SELECT bs.MaCCBS, bs.NgayGui, bs.LyDo, bs.TrangThai,
            bs.GioVaoThucTe, bs.GioRaThucTe,
            nv.MaNV, nv.HoTen,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc
       FROM ChamCongBoSung bs
       JOIN NhanVien nv ON nv.MaNV = bs.MaNV
       LEFT JOIN LichLamViec llv ON llv.MaLich = bs.MaLich
       LEFT JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE bs.MaCCBS = @id`,
    { id: { type: sql.Char(10), value: maCCBS } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy yêu cầu chấm công bổ sung.');

  return {
    id: String(request.MaCCBS).trim(),
    kind: 'supplement',
    kindLabel: 'Yêu cầu chấm công bổ sung',
    title: 'Chi tiết yêu cầu chấm công bổ sung',
    backHref: '/quan-ly/cham-cong/duyet-bo-sung',
    hoTen: request.HoTen,
    ngayGui: formatSentAt(request.NgayGui),
    trangThai: request.TrangThai,
    isPending: request.TrangThai === STATUS_PENDING,
    ngayLam: request.NgayISO ? dt.formatDateVN(request.NgayISO) : '',
    tenCa: request.TenCa || '',
    gioVao: dt.toHM(request.GioVaoThucTe),
    gioRa: dt.toHM(request.GioRaThucTe),
    lyDo: request.LyDo,
    reasonLabel: 'Lý do',
    approveUrl: `/quan-ly/cham-cong/duyet-bo-sung/${String(request.MaCCBS).trim()}/duyet`,
    rejectUrl: `/quan-ly/cham-cong/duyet-bo-sung/${String(request.MaCCBS).trim()}/khong-duyet`,
    approveMessage: MSG_SUPPLEMENT_APPROVED,
    rejectMessage: MSG_SUPPLEMENT_REJECTED,
  };
}

/** Nhận diện loại đơn theo tiền tố mã. */
function detectKind(id) {
  const value = String(id || '').trim().toUpperCase();
  if (value.startsWith('XN')) return 'leave';
  if (value.startsWith('DC')) return 'swap';
  if (value.startsWith('LT')) return 'cover';
  if (value.startsWith('CCBS')) return 'supplement';
  return null;
}

/** Chi tiết đơn theo mã (dùng chung cho trang chi tiết). */
async function getRequestDetail(id) {
  const kind = detectKind(id);
  if (kind === 'leave') return getLeaveDetail(String(id).trim());
  if (kind === 'swap') return getSwapDetail(String(id).trim());
  if (kind === 'cover') return getCoverDetail(String(id).trim());
  if (kind === 'supplement') return getSupplementDetail(String(id).trim());
  throw notFound('Không tìm thấy đơn.');
}

/* -------------------------------------------------------------------------- */
/* Duyệt / không duyệt                                                         */
/* -------------------------------------------------------------------------- */

async function setStatus(table, idColumn, id, status, maQL) {
  await query(
    `UPDATE ${table}
        SET TrangThai = @status, MaQL = @maQL
      WHERE ${idColumn} = @id`,
    {
      status: { type: sql.NVarChar(20), value: status },
      maQL: { type: sql.Char(10), value: maQL },
      id: { type: sql.Char(10), value: id },
    },
  );
}

/**
 * Duyệt đơn xin nghỉ: giữ nguyên LichLamViec để ca vẫn hiện trong danh sách
 * "ca thiếu người" cho đồng nghiệp đăng ký làm thay (đúng luồng UC06).
 */
async function approveLeave(maXN, maQL) {
  await setStatus('DonXinNghi', 'MaXN', maXN, 'Đã duyệt', maQL);
  return MSG_LEAVE_APPROVED;
}

async function rejectLeave(maXN, maQL) {
  await setStatus('DonXinNghi', 'MaXN', maXN, 'Từ chối', maQL);
  return MSG_LEAVE_REJECTED;
}

/** Duyệt đổi ca: hoán đổi nhân viên của hai dòng lịch làm việc. */
async function approveSwap(maDC, maQL) {
  const result = await query(
    `SELECT MaLichGoc, MaLichMuonDoi FROM DonDoiCa WHERE MaDC = @id`,
    { id: { type: sql.Char(10), value: maDC } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy đơn đổi ca.');

  const goc = String(request.MaLichGoc).trim();
  const doi = String(request.MaLichMuonDoi).trim();

  await withTransaction(async (tx) => {
    const rows = await txRequest(tx)
      .input('goc', sql.Char(10), goc)
      .input('doi', sql.Char(10), doi)
      .query(
        `SELECT MaLich, MaNV FROM LichLamViec WHERE MaLich IN (@goc, @doi)`,
      );

    const byId = new Map(rows.recordset.map((row) => [String(row.MaLich).trim(), String(row.MaNV).trim()]));
    const nvGoc = byId.get(goc);
    const nvDoi = byId.get(doi);
    if (!nvGoc || !nvDoi) throw badRequest('Không tìm thấy ca làm cần đổi.');

    await txRequest(tx)
      .input('goc', sql.Char(10), goc)
      .input('doi', sql.Char(10), doi)
      .input('nvGoc', sql.Char(10), nvGoc)
      .input('nvDoi', sql.Char(10), nvDoi)
      .query(
        `UPDATE LichLamViec SET MaNV = @nvDoi WHERE MaLich = @goc;
         UPDATE LichLamViec SET MaNV = @nvGoc WHERE MaLich = @doi;`,
      );

    await txRequest(tx)
      .input('id', sql.Char(10), maDC)
      .input('maQL', sql.Char(10), maQL)
      .query(`UPDATE DonDoiCa SET TrangThai = N'Đã duyệt', MaQL = @maQL WHERE MaDC = @id`);
  });

  return MSG_LEAVE_APPROVED;
}

async function rejectSwap(maDC, maQL) {
  await setStatus('DonDoiCa', 'MaDC', maDC, 'Từ chối', maQL);
  return MSG_LEAVE_REJECTED;
}

/** Duyệt làm thay: chuyển ca cho người nhận ca. */
async function approveCover(maLT, maQL) {
  const result = await query(
    `SELECT lt.MaLich, lt.MaNV, lt.TrangThai,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO
       FROM DonLamThay lt
       JOIN LichLamViec llv ON llv.MaLich = lt.MaLich
      WHERE lt.MaLT = @id`,
    { id: { type: sql.Char(10), value: maLT } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy đơn xin làm thay.');
  if (request.TrangThai !== STATUS_PENDING) {
    throw badRequest('Đơn này đã được xử lý.');
  }

  await withTransaction(async (tx) => {
    await txRequest(tx)
      .input('maLich', sql.Char(10), String(request.MaLich).trim())
      .input('maNV', sql.Char(10), String(request.MaNV).trim())
      .query(`UPDATE LichLamViec SET MaNV = @maNV WHERE MaLich = @maLich`);

    await txRequest(tx)
      .input('id', sql.Char(10), maLT)
      .input('maQL', sql.Char(10), maQL)
      .query(`UPDATE DonLamThay SET TrangThai = N'Đã duyệt', MaQL = @maQL WHERE MaLT = @id`);
  });

  return MSG_COVER_APPROVED;
}

async function rejectCover(maLT, maQL) {
  await setStatus('DonLamThay', 'MaLT', maLT, 'Từ chối', maQL);
  return MSG_COVER_REJECTED;
}

/**
 * Duyệt chấm công bổ sung: ghi giờ thực tế vào ChamCong để tính lương.
 * Nếu ca chưa có bản ghi chấm công thì tạo mới.
 */
async function approveSupplement(maCCBS, maQL) {
  const result = await query(
    `SELECT MaCCBS, MaLich, GioVaoThucTe, GioRaThucTe, TrangThai
       FROM ChamCongBoSung
      WHERE MaCCBS = @id`,
    { id: { type: sql.Char(10), value: maCCBS } },
  );

  const request = result.recordset[0];
  if (!request) throw notFound('Không tìm thấy yêu cầu chấm công bổ sung.');
  if (request.TrangThai !== STATUS_PENDING) {
    throw badRequest('Yêu cầu này đã được xử lý.');
  }
  if (!request.MaLich) throw badRequest('Yêu cầu không gắn với ca làm nào.');

  const maLich = String(request.MaLich).trim();
  const gioVao = dt.toHMS(request.GioVaoThucTe);
  const gioRa = dt.toHMS(request.GioRaThucTe);

  await withTransaction(async (tx) => {
    const existing = await txRequest(tx)
      .input('maLich', sql.Char(10), maLich)
      .query(`SELECT MaCC FROM ChamCong WHERE MaLich = @maLich`);

    if (existing.recordset.length) {
      await txRequest(tx)
        .input('maLich', sql.Char(10), maLich)
        .input('gioVao', sql.VarChar(8), gioVao)
        .input('gioRa', sql.VarChar(8), gioRa)
        .query(
          `UPDATE ChamCong
              SET GioVao = @gioVao, GioRa = @gioRa
            WHERE MaLich = @maLich`,
        );
    } else {
      const maCC = await nextMaCC();
      await txRequest(tx)
        .input('maCC', sql.Char(10), maCC)
        .input('maLich', sql.Char(10), maLich)
        .input('gioVao', sql.VarChar(8), gioVao)
        .input('gioRa', sql.VarChar(8), gioRa)
        .query(
          `INSERT INTO ChamCong (MaCC, MaLich, GioVao, GioRa)
           VALUES (@maCC, @maLich, @gioVao, @gioRa)`,
        );
    }

    await txRequest(tx)
      .input('id', sql.Char(10), maCCBS)
      .input('maQL', sql.Char(10), maQL)
      .query(
        `UPDATE ChamCongBoSung
            SET TrangThai = N'Đã duyệt', MaQL = @maQL
          WHERE MaCCBS = @id`,
      );
  });

  return MSG_SUPPLEMENT_APPROVED;
}

async function rejectSupplement(maCCBS, maQL) {
  await setStatus('ChamCongBoSung', 'MaCCBS', maCCBS, 'Từ chối', maQL);
  return MSG_SUPPLEMENT_REJECTED;
}

module.exports = {
  MSG_LEAVE_APPROVED,
  MSG_LEAVE_REJECTED,
  MSG_COVER_APPROVED,
  MSG_COVER_REJECTED,
  MSG_SUPPLEMENT_APPROVED,
  MSG_SUPPLEMENT_REJECTED,
  MSG_NO_REQUESTS,
  MSG_NO_SUPPLEMENTS,
  getPendingLeaves,
  getPendingSwaps,
  getPendingLeaveAndSwap,
  getPendingCovers,
  getPendingSupplements,
  getLeaveDetail,
  getSwapDetail,
  getCoverDetail,
  getSupplementDetail,
  getRequestDetail,
  approveLeave,
  rejectLeave,
  approveSwap,
  rejectSwap,
  approveCover,
  rejectCover,
  approveSupplement,
  rejectSupplement,
};
