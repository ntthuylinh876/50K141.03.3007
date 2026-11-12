'use strict';

/**
 * Nghiệp vụ nhóm màn hình Quản lý lương của Quản lý / Chủ quán:
 *  - M9  Bảng lương            (7.2.2.37 – 7.2.2.39)
 *  - M10 Duyệt bảng lương      (7.2.2.40 – 7.2.2.45)
 *  - M11 Cập nhật bảng lương   (7.2.2.46 – 7.2.2.53)
 *
 * Quy ước tính toán bám theo src/utils/payroll.js (đã dùng khi sinh dữ liệu):
 *  - Mỗi dòng ChiTietLuong là một ca: Thực nhận = Số giờ × Đơn giá × Hệ số − Phạt.
 *  - Phiếu lương: Thực nhận = Lương giờ làm + Chênh lệch kết chuyển − Phạt − Ứng.
 *  - Cột "Ứng" trên từng ca hiển thị 0 (quyết định C15); tổng ứng nằm ở phiếu lương.
 */

const { query, sql, withTransaction, txRequest } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');
const fmt = require('../utils/format');
const { nextMaCC } = require('../utils/id');

/* -------------------------------------------------------------------------- */
/* Thông báo                                                                   */
/* -------------------------------------------------------------------------- */

const MSG_APPROVED = 'Bảng lương đã được gửi chủ quán duyệt!';
const MSG_APPROVED_FINAL = 'Bảng lương đã được duyệt!';
const MSG_REJECTED = 'Không duyệt bảng lương!';
const MSG_UPDATED = 'Cập nhật bảng lương thành công!';
const MSG_NO_ERROR = 'Phát hiện không có sai sót với phiếu lương!';
const MSG_CORRECTION = 'Chỉnh sửa phiếu lương cần duyệt!';
const MSG_NO_PERIOD = 'Chưa có bảng lương nào!';
const MSG_OWNER_APPROVES_FIRST = 'Chờ quản lý duyệt trước.';

/** Vai trò chủ quán — duyệt bước cuối (BR-UC13.2-01). */
const ROLE_OWNER = 'owner';

const STATUS = Object.freeze({
  PENDING: 'Chưa duyệt',
  WAITING_OWNER: 'Chờ chủ quán duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
});

const PAGE_SIZE = 8;

/** Nhãn trạng thái kèm lớp badge tương ứng. */
function statusMeta(tinhTrang) {
  const value = String(tinhTrang || '').trim();
  if (value === STATUS.APPROVED) return { label: value, tone: 'success' };
  if (value === STATUS.WAITING_OWNER) return { label: value, tone: 'info' };
  if (value === STATUS.REJECTED) return { label: value, tone: 'danger' };
  if (value === STATUS.PENDING) return { label: value, tone: 'warning' };
  return { label: value, tone: 'neutral' };
}

/** 6 -> '6h'; 3.8333 -> '3h50p'. */
function formatHoursShort(value) {
  const total = Math.round(Number(value) * 60);
  if (!Number.isFinite(total) || total <= 0) return '0h';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${m}p`;
}

/** 1 -> '1'; 1.5 -> '1,5'. */
function formatCoefficientShort(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/** Chuỗi tiền cho ô nhập: 50000 -> '50000'. */
function toMoneyInput(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

/* -------------------------------------------------------------------------- */
/* Kỳ lương                                                                    */
/* -------------------------------------------------------------------------- */

function mapPeriod(row) {
  const startISO = dt.toISODate(row.NgayBatDau);
  const endISO = dt.toISODate(row.NgayKetThuc);
  const payISO = dt.toISODate(row.NgayChiTra);
  return {
    maBL: String(row.MaBL).trim(),
    thang: Number(row.Thang),
    nam: Number(row.Nam),
    label: `Tháng ${String(row.Thang).padStart(2, '0')}/${row.Nam}`,
    startISO,
    endISO,
    payISO,
    rangeLabel: `${dt.formatDateVN(startISO)} – ${dt.formatDateVN(endISO)}`,
    payLabel: dt.formatDateVN(payISO),
    tinhTrang: String(row.TinhTrang || '').trim(),
    status: statusMeta(row.TinhTrang),
    soPhieu: Number(row.SoPhieu || 0),
  };
}

/** Danh sách kỳ lương, mới nhất trước. */
async function getPeriods() {
  const result = await query(
    `SELECT bl.MaBL, bl.Thang, bl.Nam, bl.TinhTrang,
            bl.NgayBatDau, bl.NgayKetThuc, bl.NgayChiTra,
            (SELECT COUNT(*) FROM PhieuLuong pl WHERE pl.MaBL = bl.MaBL) AS SoPhieu
       FROM BangLuong bl
      ORDER BY bl.Nam DESC, bl.Thang DESC`,
  );

  const periods = result.recordset.map(mapPeriod);
  return periods.map((item, index) => ({ ...item, isCurrent: index === 0 }));
}

/** Một kỳ lương theo mã. */
async function getPeriod(maBL) {
  const result = await query(
    `SELECT bl.MaBL, bl.Thang, bl.Nam, bl.TinhTrang,
            bl.NgayBatDau, bl.NgayKetThuc, bl.NgayChiTra,
            (SELECT COUNT(*) FROM PhieuLuong pl WHERE pl.MaBL = bl.MaBL) AS SoPhieu
       FROM BangLuong bl
      WHERE bl.MaBL = @maBL`,
    { maBL: { type: sql.Char(10), value: String(maBL || '').trim() } },
  );

  const row = result.recordset[0];
  return row ? mapPeriod(row) : null;
}

/** Kỳ lương gần nhất (dùng cho màn Cập nhật bảng lương). */
async function getLatestPeriod() {
  const result = await query(
    `SELECT TOP 1 bl.MaBL, bl.Thang, bl.Nam, bl.TinhTrang,
            bl.NgayBatDau, bl.NgayKetThuc, bl.NgayChiTra,
            (SELECT COUNT(*) FROM PhieuLuong pl WHERE pl.MaBL = bl.MaBL) AS SoPhieu
       FROM BangLuong bl
      ORDER BY bl.Nam DESC, bl.Thang DESC`,
  );

  const row = result.recordset[0];
  return row ? mapPeriod(row) : null;
}

/* -------------------------------------------------------------------------- */
/* M9 — Bảng lương                                                             */
/* -------------------------------------------------------------------------- */

/** Các phiếu lương của một kỳ (màn Tổng hợp lương nhân viên). */
async function getPayrollSummary(maBL) {
  const period = await getPeriod(maBL);
  if (!period) throw notFound('Không tìm thấy bảng lương.');

  const result = await query(
    `SELECT pl.MaPL, nv.MaNV, nv.HoTen,
            pl.TongGioLam, pl.LuongTheoGioLam, pl.TienPhat,
            pl.TienUngLuong, pl.ChenhLechKetChuyen
       FROM PhieuLuong pl
       JOIN NhanVien nv ON nv.MaNV = pl.MaND
      WHERE pl.MaBL = @maBL
      ORDER BY nv.HoTen`,
    { maBL: { type: sql.Char(10), value: period.maBL } },
  );

  const rows = result.recordset.map((row) => {
    const luong = Number(row.LuongTheoGioLam);
    const phat = Number(row.TienPhat);
    const ung = Number(row.TienUngLuong);
    const chenhLech = Number(row.ChenhLechKetChuyen);
    return {
      maPL: String(row.MaPL).trim(),
      maNV: String(row.MaNV).trim(),
      hoTen: row.HoTen,
      tongGio: Number(row.TongGioLam),
      tongGioLabel: `${fmt.formatHours(Number(row.TongGioLam))} h`,
      luong,
      luongLabel: fmt.formatNumber(luong),
      phat,
      phatLabel: fmt.formatNumber(phat),
      ung,
      ungLabel: fmt.formatNumber(ung),
      chenhLech,
      thucNhan: Math.round(luong + chenhLech - phat - ung),
    };
  });

  return {
    period,
    rows: rows.map((row) => ({ ...row, thucNhanLabel: fmt.formatNumber(row.thucNhan) })),
    isEmpty: rows.length === 0,
  };
}

/**
 * Chi tiết các ca của một phiếu lương trong kỳ (có phân trang 8 dòng/trang).
 * @param {string} maBL
 * @param {string} maNV
 * @param {number} page
 */
async function getPayrollDetail(maBL, maNV, page) {
  const period = await getPeriod(maBL);
  if (!period) throw notFound('Không tìm thấy bảng lương.');

  const slipResult = await query(
    `SELECT pl.MaPL, pl.TongGioLam, pl.LuongTheoGioLam, pl.TienPhat,
            pl.TienUngLuong, pl.ChenhLechKetChuyen,
            nv.MaNV, nv.HoTen
       FROM PhieuLuong pl
       JOIN NhanVien nv ON nv.MaNV = pl.MaND
      WHERE pl.MaBL = @maBL AND pl.MaND = @maNV`,
    {
      maBL: { type: sql.Char(10), value: period.maBL },
      maNV: { type: sql.Char(10), value: String(maNV || '').trim() },
    },
  );

  const slip = slipResult.recordset[0];
  if (!slip) throw notFound('Không tìm thấy phiếu lương của nhân viên này.');

  const rows = await getPayslipLines(String(slip.MaPL).trim(), 'asc');

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (current - 1) * PAGE_SIZE;

  return {
    period,
    slip: {
      maPL: String(slip.MaPL).trim(),
      maNV: String(slip.MaNV).trim(),
      hoTen: slip.HoTen,
      tongGio: Number(slip.TongGioLam),
      thucNhan: Math.round(
        Number(slip.LuongTheoGioLam)
          + Number(slip.ChenhLechKetChuyen)
          - Number(slip.TienPhat)
          - Number(slip.TienUngLuong),
      ),
    },
    rows: rows.slice(start, start + PAGE_SIZE),
    totalRows: rows.length,
    page: current,
    totalPages,
    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
}

/* -------------------------------------------------------------------------- */
/* Dòng chi tiết lương                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Các dòng chi tiết lương của một phiếu.
 * @param {string} maPL
 * @param {'asc'|'desc'} order
 */
async function getPayslipLines(maPL, order = 'asc') {
  const result = await query(
    `SELECT ct.MaCTL, ct.SoGioLam, ct.HeSoNgay, ct.MucLuong,
            ct.PhatDiTre, ct.PhatBoCa, ct.MaLich,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.MaCa, ca.TenCa, ca.GioBatDau, ca.GioKetThuc,
            cc.GioVao, cc.GioRa
       FROM ChiTietLuong ct
       JOIN LichLamViec llv ON llv.MaLich = ct.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       LEFT JOIN ChamCong cc ON cc.MaLich = llv.MaLich
      WHERE ct.MaPL = @maPL
      ORDER BY llv.NgayLam ${order === 'desc' ? 'DESC' : 'ASC'}, ca.GioBatDau`,
    { maPL: { type: sql.Char(10), value: maPL } },
  );

  return result.recordset.map((row) => {
    const soGio = Number(row.SoGioLam);
    const heSo = Number(row.HeSoNgay);
    const donGia = Number(row.MucLuong);
    const phat = Number(row.PhatDiTre) + Number(row.PhatBoCa);
    return {
      maCTL: String(row.MaCTL).trim(),
      maLich: String(row.MaLich).trim(),
      ngayISO: row.NgayISO,
      ngay: dt.formatDateVN(row.NgayISO),
      ngayLong: dt.formatDateLongVN(row.NgayISO),
      maCa: String(row.MaCa).trim(),
      tenCa: row.TenCa,
      khungGio: `${dt.toHM(row.GioBatDau)} – ${dt.toHM(row.GioKetThuc)}`,
      gioVao: dt.toHM(row.GioVao),
      gioRa: dt.toHM(row.GioRa),
      gioVaoLabel: dt.toHM(row.GioVao) || '-',
      gioRaLabel: dt.toHM(row.GioRa) || '-',
      soGio,
      soGioLabel: formatHoursShort(soGio),
      heSo,
      heSoLabel: formatCoefficientShort(heSo),
      donGia,
      donGiaLabel: fmt.formatNumber(donGia),
      phat,
      phatLabel: fmt.formatNumber(phat),
      ung: 0,
      ungLabel: '0',
      thucNhan: Math.round(soGio * donGia * heSo - phat),
    };
  }).map((row) => ({ ...row, thucNhanLabel: fmt.formatNumber(row.thucNhan) }));
}

/** Tính lại tổng hợp của một phiếu lương từ các dòng chi tiết. */
async function recalcPayslip(maPL) {
  await query(
    `UPDATE pl
        SET TongGioLam = t.TongGioLam,
            LuongTheoGioLam = t.LuongTheoGioLam,
            TienPhat = t.TienPhat
       FROM PhieuLuong pl
       CROSS APPLY (
         SELECT SUM(ct.SoGioLam) AS TongGioLam,
                SUM(ct.SoGioLam * ct.MucLuong * ct.HeSoNgay) AS LuongTheoGioLam,
                SUM(ct.PhatDiTre + ct.PhatBoCa) AS TienPhat
           FROM ChiTietLuong ct
          WHERE ct.MaPL = pl.MaPL
       ) t
      WHERE pl.MaPL = @maPL`,
    { maPL: { type: sql.Char(10), value: maPL } },
  );
}

/* -------------------------------------------------------------------------- */
/* M10 — Duyệt bảng lương                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Kỳ lương cần duyệt theo vai trò (BR-UC13.2-01):
 *  - Quản lý: kỳ "Chưa duyệt" gần nhất; nếu không có thì hiện kỳ đang chờ
 *    chủ quán để biết tình trạng (7.2.2.45).
 *  - Chủ quán: kỳ "Chờ chủ quán duyệt" gần nhất; nếu không có thì hiện kỳ
 *    "Chưa duyệt" kèm ghi chú "Chờ quản lý duyệt trước".
 *
 * @param {string} [role] vai trò người dùng hiện tại
 */
async function getApprovalPeriod(role) {
  const isOwner = role === ROLE_OWNER;
  const primary = isOwner ? STATUS.WAITING_OWNER : STATUS.PENDING;
  const secondary = isOwner ? STATUS.PENDING : STATUS.WAITING_OWNER;

  const result = await query(
    `SELECT TOP 1 bl.MaBL, bl.Thang, bl.Nam, bl.TinhTrang,
            bl.NgayBatDau, bl.NgayKetThuc, bl.NgayChiTra,
            (SELECT COUNT(*) FROM PhieuLuong pl WHERE pl.MaBL = bl.MaBL) AS SoPhieu
       FROM BangLuong bl
      WHERE bl.TinhTrang IN (@primary, @secondary)
      ORDER BY CASE WHEN bl.TinhTrang = @primary THEN 0 ELSE 1 END,
               bl.Nam DESC, bl.Thang DESC`,
    {
      primary: { type: sql.NVarChar(20), value: primary },
      secondary: { type: sql.NVarChar(20), value: secondary },
    },
  );

  const row = result.recordset[0];
  if (!row) {
    return { period: null, rows: [], isEmpty: true, canApprove: false, pendingManager: false };
  }

  const period = mapPeriod(row);
  const summary = await getPayrollSummary(period.maBL);

  return {
    period,
    rows: summary.rows,
    isEmpty: summary.isEmpty,
    canApprove: period.tinhTrang === primary,
    pendingManager: isOwner && period.tinhTrang === STATUS.PENDING,
  };
}

/**
 * Bước duyệt tương ứng với vai trò (BR-UC13.2-01).
 *  - Quản lý: "Chưa duyệt" → "Chờ chủ quán duyệt".
 *  - Chủ quán: "Chờ chủ quán duyệt" → "Đã duyệt".
 *
 * @param {string} [role]
 * @returns {{from: string, to: string, message: string}}
 */
function approvalTransition(role) {
  if (role === ROLE_OWNER) {
    return { from: STATUS.WAITING_OWNER, to: STATUS.APPROVED, message: MSG_APPROVED_FINAL };
  }
  return { from: STATUS.PENDING, to: STATUS.WAITING_OWNER, message: MSG_APPROVED };
}

/**
 * Duyệt bảng lương theo vai trò (BR-UC13.2-01):
 *  - Quản lý: "Chưa duyệt" → "Chờ chủ quán duyệt".
 *  - Chủ quán: "Chờ chủ quán duyệt" → "Đã duyệt".
 *
 * @param {string} maBL
 * @param {string} [role]
 */
async function approvePayroll(maBL, role) {
  const period = await getPeriod(maBL);
  if (!period) throw notFound('Không tìm thấy bảng lương.');

  const step = approvalTransition(role);

  if (period.tinhTrang !== step.from) {
    throw badRequest(
      role === ROLE_OWNER
        ? 'Bảng lương này không ở trạng thái chờ chủ quán duyệt.'
        : 'Bảng lương này không ở trạng thái chờ quản lý duyệt.',
    );
  }

  await query(
    `UPDATE BangLuong SET TinhTrang = @to WHERE MaBL = @maBL AND TinhTrang = @from`,
    {
      to: { type: sql.NVarChar(20), value: step.to },
      from: { type: sql.NVarChar(20), value: step.from },
      maBL: { type: sql.Char(10), value: period.maBL },
    },
  );

  return step.message;
}

/**
 * Không duyệt bảng lương ở bước mà vai trò hiện tại phụ trách.
 * CSDL không có cột lưu lý do không duyệt nên lý do chỉ dùng để xác nhận thao tác.
 *
 * @param {string} maBL
 * @param {string} [role]
 */
async function rejectPayroll(maBL, role) {
  const period = await getPeriod(maBL);
  if (!period) throw notFound('Không tìm thấy bảng lương.');

  const from = approvalTransition(role).from;
  if (period.tinhTrang !== from) {
    throw badRequest('Bảng lương này không ở bước duyệt của bạn.');
  }

  await query(
    `UPDATE BangLuong SET TinhTrang = @status WHERE MaBL = @maBL AND TinhTrang = @from`,
    {
      status: { type: sql.NVarChar(20), value: STATUS.REJECTED },
      from: { type: sql.NVarChar(20), value: from },
      maBL: { type: sql.Char(10), value: period.maBL },
    },
  );

  return MSG_REJECTED;
}

/**
 * Chi tiết một phiếu trong màn Duyệt bảng lương (kèm cờ theo vai trò).
 * Quản lý chỉ sửa được kỳ "Chưa duyệt"; chủ quán chỉ duyệt, không sửa.
 */
async function getApprovalDetail(maBL, maNV, page, role) {
  const detail = await getPayrollDetail(maBL, maNV, page);
  const isOwner = role === ROLE_OWNER;
  const tinhTrang = detail.period.tinhTrang;

  return {
    ...detail,
    editable: !isOwner && tinhTrang === STATUS.PENDING,
    canApprove: isOwner ? tinhTrang === STATUS.WAITING_OWNER : tinhTrang === STATUS.PENDING,
    pendingManager: isOwner && tinhTrang === STATUS.PENDING,
  };
}

/**
 * Lưu tiền phạt của nhiều dòng ca trong cùng một lần gửi (màn Duyệt bảng lương).
 * Mỗi dòng trong form có tên `phat_<MaCTL>`.
 *
 * @param {string} maBL
 * @param {string} maPL
 * @param {Record<string, unknown>} body dữ liệu form
 */
async function updatePayrollLines(maBL, maPL, body, role) {
  const period = await getPeriod(maBL);
  if (!period) throw notFound('Không tìm thấy bảng lương.');
  if (role === ROLE_OWNER) {
    throw badRequest('Chỉ quản lý được chỉnh sửa bảng lương.');
  }
  if (period.tinhTrang !== STATUS.PENDING) {
    throw badRequest('Bảng lương này không ở trạng thái chờ duyệt.');
  }

  const maPLValue = String(maPL || '').trim();
  const linesResult = await query(
    `SELECT ct.MaCTL
       FROM ChiTietLuong ct
       JOIN PhieuLuong pl ON pl.MaPL = ct.MaPL
      WHERE ct.MaPL = @maPL AND pl.MaBL = @maBL`,
    {
      maPL: { type: sql.Char(10), value: maPLValue },
      maBL: { type: sql.Char(10), value: period.maBL },
    },
  );

  const maCTLs = linesResult.recordset.map((row) => String(row.MaCTL).trim());
  if (!maCTLs.length) throw notFound('Không tìm thấy phiếu lương cần sửa.');

  const entries = maCTLs.map((maCTL) => {
    const raw = body ? body[`phat_${maCTL}`] : undefined;
    const phat = Number(raw);
    if (!Number.isFinite(phat) || phat < 0) {
      throw badRequest('Tiền phạt không hợp lệ.', { phat: 'Tiền phạt không hợp lệ.' });
    }
    return { maCTL, phat: Math.round(phat) };
  });

  await withTransaction(async (tx) => {
    for (const entry of entries) {
      await txRequest(tx)
        .input('maCTL', sql.Char(10), entry.maCTL)
        .input('maPL', sql.Char(10), maPLValue)
        .input('phat', sql.Decimal(18, 2), entry.phat)
        .query(
          `UPDATE ChiTietLuong
              SET PhatDiTre = @phat, PhatBoCa = 0
            WHERE MaCTL = @maCTL AND MaPL = @maPL`,
        );
    }
  });

  await recalcPayslip(maPLValue);
  return MSG_UPDATED;
}

/* -------------------------------------------------------------------------- */
/* M11 — Cập nhật bảng lương                                                   */
/* -------------------------------------------------------------------------- */

/** Danh sách phiếu lương của một kỳ (màn Danh sách phiếu lương). */
async function getPayslipList(maBL) {
  const period = maBL ? await getPeriod(maBL) : await getLatestPeriod();
  if (!period) {
    return { period: null, periods: [], rows: [], isEmpty: true };
  }

  const summary = await getPayrollSummary(period.maBL);
  return {
    period,
    periods: await getPeriods(),
    rows: summary.rows.map((row) => ({
      maPL: row.maPL,
      maNV: row.maNV,
      hoTen: row.hoTen,
      thucNhan: row.thucNhan,
      thucNhanLabel: fmt.formatCurrency(row.thucNhan),
    })),
    isEmpty: summary.isEmpty,
  };
}

/** Chi tiết phiếu lương theo từng ca (màn Chi tiết phiếu lương). */
async function getPayslipDetail(maPL) {
  const result = await query(
    `SELECT pl.MaPL, pl.MaBL, pl.TongGioLam, pl.LuongTheoGioLam, pl.TienPhat,
            pl.TienUngLuong, pl.ChenhLechKetChuyen,
            bl.Thang, bl.Nam, bl.TinhTrang,
            nv.MaNV, nv.HoTen
       FROM PhieuLuong pl
       JOIN BangLuong bl ON bl.MaBL = pl.MaBL
       JOIN NhanVien nv ON nv.MaNV = pl.MaND
      WHERE pl.MaPL = @maPL`,
    { maPL: { type: sql.Char(10), value: String(maPL || '').trim() } },
  );

  const slip = result.recordset[0];
  if (!slip) throw notFound('Không tìm thấy phiếu lương.');

  const maPLValue = String(slip.MaPL).trim();
  const rows = await getPayslipLines(maPLValue, 'desc');

  return {
    slip: {
      maPL: maPLValue,
      maBL: String(slip.MaBL).trim(),
      maNV: String(slip.MaNV).trim(),
      hoTen: slip.HoTen,
      kyLabel: `Tháng ${String(slip.Thang).padStart(2, '0')}/${slip.Nam}`,
      tinhTrang: String(slip.TinhTrang || '').trim(),
      status: statusMeta(slip.TinhTrang),
      tongGio: Number(slip.TongGioLam),
      luongTheoGio: Number(slip.LuongTheoGioLam),
      phat: Number(slip.TienPhat),
      ung: Number(slip.TienUngLuong),
      chenhLech: Number(slip.ChenhLechKetChuyen),
      thucNhan: Math.round(
        Number(slip.LuongTheoGioLam)
          + Number(slip.ChenhLechKetChuyen)
          - Number(slip.TienPhat)
          - Number(slip.TienUngLuong),
      ),
    },
    rows,
    firstRow: rows[0] || null,
    isEmpty: rows.length === 0,
  };
}

/** Một dòng chi tiết kèm giờ chấm công và giờ theo lịch làm. */
async function getLineContext(maPL, maCTL) {
  const result = await query(
    `SELECT ct.MaCTL, ct.SoGioLam, ct.HeSoNgay, ct.MucLuong,
            ct.PhatDiTre, ct.PhatBoCa, ct.MaLich,
            pl.MaPL, pl.MaBL, pl.TienUngLuong, pl.ChenhLechKetChuyen,
            nv.MaNV, nv.HoTen,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc,
            cc.GioVao, cc.GioRa
       FROM ChiTietLuong ct
       JOIN PhieuLuong pl ON pl.MaPL = ct.MaPL
       JOIN NhanVien nv ON nv.MaNV = pl.MaND
       JOIN LichLamViec llv ON llv.MaLich = ct.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       LEFT JOIN ChamCong cc ON cc.MaLich = llv.MaLich
      WHERE ct.MaPL = @maPL AND ct.MaCTL = @maCTL`,
    {
      maPL: { type: sql.Char(10), value: String(maPL || '').trim() },
      maCTL: { type: sql.Char(10), value: String(maCTL || '').trim() },
    },
  );

  const row = result.recordset[0];
  if (!row) throw notFound('Không tìm thấy dòng lương cần đối chiếu.');

  return {
    maCTL: String(row.MaCTL).trim(),
    maPL: String(row.MaPL).trim(),
    maBL: String(row.MaBL).trim(),
    maLich: String(row.MaLich).trim(),
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    ngayISO: row.NgayISO,
    ngay: dt.formatDateVN(row.NgayISO),
    tenCa: row.TenCa,
    gioVao: dt.toHM(row.GioVao),
    gioRa: dt.toHM(row.GioRa),
    gioBatDau: dt.toHM(row.GioBatDau),
    gioKetThuc: dt.toHM(row.GioKetThuc),
    soGio: Number(row.SoGioLam),
    heSo: Number(row.HeSoNgay),
    donGia: Number(row.MucLuong),
    phat: Number(row.PhatDiTre) + Number(row.PhatBoCa),
    ung: Number(row.TienUngLuong),
  };
}

/** Màn Đối chiếu chấm công và lịch làm (7.2.2.48). */
async function getComparison(maPL, maCTL) {
  const line = await getLineContext(maPL, maCTL);

  return {
    line,
    cards: [
      {
        key: 'payslip',
        title: 'Phiếu lương hiện tại',
        dateLabel: line.ngay,
        gioVao: line.gioVao || '-',
        gioRa: line.gioRa || '-',
        isMismatch: line.gioVao !== line.gioBatDau,
      },
      {
        key: 'attendance',
        title: 'Dữ liệu chấm công',
        dateLabel: line.ngay,
        gioVao: line.gioVao || '-',
        gioRa: line.gioRa || '-',
        isMismatch: line.gioVao !== line.gioBatDau,
      },
      {
        key: 'schedule',
        title: 'Lịch làm',
        dateLabel: line.ngay,
        gioVao: line.gioBatDau,
        gioRa: line.gioKetThuc,
        isMismatch: false,
      },
    ],
  };
}

/**
 * Ghi nhận "Không có sai sót".
 * CSDL không có bảng thông báo quản lý → nhân viên, nên chỉ trả câu xác nhận.
 */
async function confirmNoError() {
  return MSG_NO_ERROR;
}

/** Dữ liệu màn Chỉnh sửa phiếu lương (7.2.2.51). */
async function getPayslipEditor(maPL, maCTL) {
  const line = await getLineContext(maPL, maCTL);
  return {
    line,
    form: {
      gioVao: line.gioVao || '',
      gioRa: line.gioRa || '',
      phat: toMoneyInput(line.phat),
      ung: toMoneyInput(line.ung),
      lyDo: '',
    },
  };
}

/**
 * Lưu đề xuất chỉnh sửa phiếu lương.
 *
 * - Ghi giờ vào/ra mới vào ChamCong (nguồn dữ liệu chấm công).
 * - Tính lại Số giờ làm và Phạt của dòng ChiTietLuong.
 * - Cập nhật tiền ứng (nếu có) và tính lại tổng hợp PhieuLuong.
 * - Lý do chỉnh sửa không có cột lưu trong CSDL → chỉ dùng cho thông báo.
 */
async function savePayslipCorrection(maPL, maCTL, input) {
  const line = await getLineContext(maPL, maCTL);

  const gioVao = String(input.gioVao || '').trim();
  const gioRa = String(input.gioRa || '').trim();
  const phat = Number(input.phat);
  const ung = Number(input.ung);

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const fieldErrors = {};
  if (gioVao && !timePattern.test(gioVao)) fieldErrors.gioVao = 'Giờ vào không hợp lệ.';
  if (gioRa && !timePattern.test(gioRa)) fieldErrors.gioRa = 'Giờ ra không hợp lệ.';
  if (!Number.isFinite(phat) || phat < 0) fieldErrors.phat = 'Tiền phạt không hợp lệ.';
  if (!Number.isFinite(ung) || ung < 0) fieldErrors.ung = 'Tiền ứng không hợp lệ.';
  if (Object.keys(fieldErrors).length) {
    throw badRequest('Vui lòng kiểm tra lại dữ liệu sửa.', fieldErrors);
  }

  const soGio = gioVao && gioRa ? dt.hoursBetween(gioVao, gioRa) : 0;

  await withTransaction(async (tx) => {
    const existing = await txRequest(tx)
      .input('maLich', sql.Char(10), line.maLich)
      .query('SELECT MaCC FROM ChamCong WHERE MaLich = @maLich');

    if (existing.recordset.length) {
      await txRequest(tx)
        .input('maLich', sql.Char(10), line.maLich)
        .input('gioVao', sql.VarChar(8), gioVao ? dt.toHMS(gioVao) : null)
        .input('gioRa', sql.VarChar(8), gioRa ? dt.toHMS(gioRa) : null)
        .query(
          `UPDATE ChamCong SET GioVao = @gioVao, GioRa = @gioRa WHERE MaLich = @maLich`,
        );
    } else if (gioVao || gioRa) {
      const maCC = await nextMaCC();

      await txRequest(tx)
        .input('maCC', sql.Char(10), maCC)
        .input('maLich', sql.Char(10), line.maLich)
        .input('gioVao', sql.VarChar(8), gioVao ? dt.toHMS(gioVao) : null)
        .input('gioRa', sql.VarChar(8), gioRa ? dt.toHMS(gioRa) : null)
        .query(
          `INSERT INTO ChamCong (MaCC, MaLich, GioVao, GioRa)
           VALUES (@maCC, @maLich, @gioVao, @gioRa)`,
        );
    }

    await txRequest(tx)
      .input('maCTL', sql.Char(10), line.maCTL)
      .input('soGio', sql.Decimal(9, 2), soGio)
      .input('phat', sql.Decimal(18, 2), Math.round(phat))
      .query(
        `UPDATE ChiTietLuong
            SET SoGioLam = @soGio, PhatDiTre = @phat, PhatBoCa = 0
          WHERE MaCTL = @maCTL`,
      );

    await txRequest(tx)
      .input('maPL', sql.Char(10), line.maPL)
      .input('ung', sql.Decimal(18, 2), Math.round(ung))
      .query(`UPDATE PhieuLuong SET TienUngLuong = @ung WHERE MaPL = @maPL`);
  });

  await recalcPayslip(line.maPL);
  return MSG_CORRECTION;
}

module.exports = {
  MSG_APPROVED,
  MSG_APPROVED_FINAL,
  MSG_REJECTED,
  MSG_UPDATED,
  MSG_NO_ERROR,
  MSG_CORRECTION,
  MSG_NO_PERIOD,
  MSG_OWNER_APPROVES_FIRST,
  STATUS,
  statusMeta,
  approvalTransition,
  getPeriods,
  getPeriod,
  getLatestPeriod,
  getPayrollSummary,
  getPayrollDetail,
  getPayslipLines,
  getApprovalPeriod,
  approvePayroll,
  rejectPayroll,
  getApprovalDetail,
  updatePayrollLines,
  getPayslipList,
  getPayslipDetail,
  getComparison,
  confirmNoError,
  getPayslipEditor,
  savePayslipCorrection,
};
