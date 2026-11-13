'use strict';

/**
 * UC13.3 — Cập nhật bảng lương (đề xuất chỉnh sửa phiếu lương).
 *
 * Luồng theo SRS:
 *   1. Quản lý đối chiếu phiếu lương, sửa giờ vào/giờ ra/tiền phạt/tiền ứng và
 *      nhập "Lý do chỉnh sửa" rồi bấm "Gửi đề xuất" (7.2.2.51).
 *      → Ghi một bản ghi `PhanHoiLuong` với `NoiDungDeXuat` (JSON) và trạng thái
 *        "Chờ chủ quán duyệt". **Phiếu lương chưa thay đổi.**
 *   2. Chủ quán mở màn "Chủ quán xét đề xuất" (ảnh Cập nhật bảng lương 10):
 *      thấy giá trị hiện tại và giá trị đề xuất của từng ca, lý do của quản lý.
 *      - Duyệt  → áp giá trị đề xuất, tính lại phiếu lương.
 *      - Không duyệt → giữ nguyên phiếu lương.
 *   3. Hạn điều chỉnh = `BangLuong.NgayChiTra` (ngày 05 tháng sau):
 *      - Trong hạn: sửa thẳng phiếu của kỳ.
 *      - Quá hạn: không sửa kỳ cũ, cộng/trừ phần chênh lệch vào
 *        `PhieuLuong.ChenhLechKetChuyen` của kỳ kế tiếp (BR-UC13.1-08).
 *
 * Cách phân biệt trong `PhanHoiLuong`:
 *   - Phản hồi của nhân viên (UC08): `NoiDungDeXuat IS NULL`.
 *   - Đề xuất của quản lý (UC13.3): `NoiDungDeXuat IS NOT NULL`.
 */

const { query, sql, withTransaction, txRequest } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');
const fmt = require('../utils/format');
const { nextMaPH } = require('../utils/id');

/** Trạng thái đề xuất (cột PhanHoiLuong.TrangThai). */
const STATUS = Object.freeze({
  PENDING: 'Chờ chủ quán duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
});

/** Bảng lương phải ở trạng thái này mới nhận đề xuất (UC13.3 pre-condition). */
const PERIOD_APPROVED = 'Đã duyệt';

/** Vai trò chủ quán — người duyệt đề xuất, không phải người gửi đề xuất. */
const ROLE_OWNER = 'owner';

const MSG_PROPOSED = 'Chỉnh sửa phiếu lương cần duyệt!';
const MSG_APPROVED = 'Đã cập nhật lại phiếu lương!';
const MSG_CARRY = 'Quá hạn chỉnh sửa, lương sẽ được kết chuyển sang kỳ sau!';
const MSG_REJECTED = 'Không duyệt chỉnh sửa lương!';
const MSG_EMPTY = 'Chưa có đề xuất chỉnh sửa nào!';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/* -------------------------------------------------------------------------- */
/* Tiện ích                                                                    */
/* -------------------------------------------------------------------------- */

/** 3.8333 → '3h50p'; 4 → '4h'. */
function formatHoursShort(value) {
  const totalMinutes = Math.round((Number(value) || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, '0')}p` : `${hours}h`;
}

/** Đọc JSON đề xuất; trả về null nếu hỏng. */
function parseProposal(text) {
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** Nhãn + màu hiển thị của trạng thái đề xuất (cột PhanHoiLuong.TrangThai). */
function proposalStatusMeta(trangThai) {
  const value = String(trangThai || '').trim();
  if (value === STATUS.APPROVED) return { label: value, tone: 'success' };
  if (value === STATUS.REJECTED) return { label: value, tone: 'danger' };
  if (value === STATUS.PENDING) return { label: value, tone: 'warning' };
  return { label: value, tone: 'neutral' };
}

/** 'YYYY-MM-DD' hoặc Date → 'dd/mm/yyyy'. */
function formatDate(value) {
  return dt.formatDateVN(dt.toISODate(value)) || '';
}

/* -------------------------------------------------------------------------- */
/* Dữ liệu một dòng lương                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Dòng ChiTietLuong kèm phiếu lương, kỳ và chấm công.
 * @param {string} maPL
 * @param {string} maCTL
 */
async function loadLine(maPL, maCTL) {
  const result = await query(
    `SELECT ct.MaCTL, ct.MaPL, ct.MaLich, ct.SoGioLam, ct.HeSoNgay, ct.MucLuong,
            ct.PhatDiTre, ct.PhatBoCa,
            pl.MaND, pl.MaBL, pl.TongGioLam, pl.LuongTheoGioLam, pl.TienPhat,
            pl.TienUngLuong, pl.ChenhLechKetChuyen,
            bl.Thang, bl.Nam, bl.TinhTrang,
            CONVERT(char(10), bl.NgayChiTra, 23) AS NgayChiTraISO,
            nv.HoTen,
            cc.GioVao, cc.GioRa
       FROM ChiTietLuong ct
       JOIN PhieuLuong pl ON pl.MaPL = ct.MaPL
       JOIN BangLuong bl ON bl.MaBL = pl.MaBL
       JOIN NhanVien nv ON nv.MaNV = pl.MaND
       LEFT JOIN ChamCong cc ON cc.MaLich = ct.MaLich
      WHERE ct.MaPL = @maPL AND ct.MaCTL = @maCTL`,
    {
      maPL: { type: sql.Char(10), value: String(maPL || '').trim() },
      maCTL: { type: sql.Char(10), value: String(maCTL || '').trim() },
    },
  );

  const row = result.recordset[0];
  if (!row) throw notFound('Không tìm thấy dòng lương cần chỉnh sửa.');

  const phat = Number(row.PhatDiTre) + Number(row.PhatBoCa);
  const ung = Number(row.TienUngLuong);
  const thucNhanThang = Math.round(
    Number(row.LuongTheoGioLam)
      + Number(row.ChenhLechKetChuyen)
      - Number(row.TienPhat)
      - Number(row.TienUngLuong),
  );

  return {
    maCTL: String(row.MaCTL).trim(),
    maPL: String(row.MaPL).trim(),
    maBL: String(row.MaBL).trim(),
    maLich: String(row.MaLich).trim(),
    maNV: String(row.MaND).trim(),
    hoTen: row.HoTen,
    thang: Number(row.Thang),
    nam: Number(row.Nam),
    tinhTrang: String(row.TinhTrang || '').trim(),
    ngayChiTraISO: row.NgayChiTraISO,
    kyLabel: `Tháng ${String(row.Thang).padStart(2, '0')}/${row.Nam}`,
    donGia: Number(row.MucLuong),
    heSo: Number(row.HeSoNgay),
    hienTai: {
      gioVao: dt.toHM(row.GioVao) || '',
      gioRa: dt.toHM(row.GioRa) || '',
      soGio: Number(row.SoGioLam),
      phat,
      ung,
      thucNhanCa: Math.round(Number(row.SoGioLam) * Number(row.MucLuong) * Number(row.HeSoNgay) - phat),
      thucNhanThang,
    },
  };
}

/**
 * Giá trị sau khi áp đề xuất. Các trường gửi lên là giá trị tuyệt đối nên luôn
 * tính lại từ giá trị hiện tại trong CSDL, tránh sai lệch nếu phiếu đã đổi.
 */
function applyValues(line, values) {
  const soGio = values.gioVao && values.gioRa
    ? dt.hoursBetween(values.gioVao, values.gioRa)
    : 0;
  const thucNhanCa = Math.round(soGio * line.donGia * line.heSo - values.phat);
  const thucNhanThang = Math.round(
    line.hienTai.thucNhanThang
      + (thucNhanCa - line.hienTai.thucNhanCa)
      - (values.ung - line.hienTai.ung),
  );

  return {
    gioVao: values.gioVao,
    gioRa: values.gioRa,
    soGio,
    phat: values.phat,
    ung: values.ung,
    thucNhanCa,
    thucNhanThang,
  };
}

/* -------------------------------------------------------------------------- */
/* Tạo đề xuất (quản lý)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Gửi đề xuất chỉnh sửa một ca trong phiếu lương.
 *
 * Đề xuất trùng ca đang chờ duyệt sẽ được ghi đè thay vì tạo bản ghi mới, để
 * chủ quán không phải duyệt hai đề xuất mâu thuẫn trên cùng một dòng.
 *
 * @param {string} maPL
 * @param {string} maCTL
 * @param {Object} input  { gioVao, gioRa, phat, ung, lyDo }
 * @param {string} maQL   mã quản lý gửi đề xuất
 * @param {string} [role] vai trò người gửi (chủ quán không gửi đề xuất)
 */
async function createProposal(maPL, maCTL, input, maQL, role) {
  if (role === ROLE_OWNER) {
    throw badRequest('Chủ quán xét đề xuất, không gửi đề xuất chỉnh sửa lương.');
  }

  const line = await loadLine(maPL, maCTL);

  if (line.tinhTrang !== PERIOD_APPROVED) {
    throw badRequest('Chỉ gửi đề xuất chỉnh sửa cho bảng lương đã duyệt.');
  }

  const gioVao = String(input.gioVao || '').trim();
  const gioRa = String(input.gioRa || '').trim();
  const phat = Number(input.phat);
  const ung = Number(input.ung);
  const lyDo = String(input.lyDo || '').trim();

  const fieldErrors = {};
  if (!gioVao) fieldErrors.gioVao = 'Vui lòng nhập giờ vào.';
  else if (!TIME_PATTERN.test(gioVao)) fieldErrors.gioVao = 'Giờ vào không hợp lệ.';
  if (!gioRa) fieldErrors.gioRa = 'Vui lòng nhập giờ ra.';
  else if (!TIME_PATTERN.test(gioRa)) fieldErrors.gioRa = 'Giờ ra không hợp lệ.';
  if (!Number.isFinite(phat) || phat < 0) fieldErrors.phat = 'Tiền phạt không hợp lệ.';
  if (!Number.isFinite(ung) || ung < 0) fieldErrors.ung = 'Tiền ứng không hợp lệ.';
  if (!lyDo) fieldErrors.lyDo = 'Vui lòng nhập lý do chỉnh sửa.';
  if (Object.keys(fieldErrors).length) {
    throw badRequest('Vui lòng kiểm tra lại dữ liệu sửa.', fieldErrors);
  }

  const deXuat = applyValues(line, {
    gioVao,
    gioRa,
    phat: Math.round(phat),
    ung: Math.round(ung),
  });

  const noiDung = JSON.stringify({
    maCTL: line.maCTL,
    maPL: line.maPL,
    truong: ['gioVao', 'gioRa', 'phat', 'ung'],
    cu: line.hienTai,
    moi: deXuat,
  });

  const pending = await query(
    `SELECT TOP 1 MaPH
       FROM PhanHoiLuong
      WHERE MaPL = @maPL
        AND NoiDungDeXuat IS NOT NULL
        AND TrangThai = @status
        AND JSON_VALUE(NoiDungDeXuat, '$.maCTL') = @maCTL
      ORDER BY NgayGui DESC`,
    {
      maPL: { type: sql.Char(10), value: line.maPL },
      maCTL: { type: sql.NVarChar(10), value: line.maCTL },
      status: { type: sql.NVarChar(20), value: STATUS.PENDING },
    },
  );

  const existing = pending.recordset[0];
  if (existing) {
    await query(
      `UPDATE PhanHoiLuong
          SET NgayGui = GETDATE(), LyDo = @lyDo, NoiDungDeXuat = @noiDung,
              MaQL = @maQL, TrangThai = @status
        WHERE MaPH = @maPH`,
      {
        maPH: { type: sql.Char(10), value: String(existing.MaPH).trim() },
        lyDo: { type: sql.NVarChar(255), value: lyDo },
        noiDung: { type: sql.NVarChar(sql.MAX), value: noiDung },
        maQL: { type: sql.Char(10), value: maQL },
        status: { type: sql.NVarChar(20), value: STATUS.PENDING },
      },
    );
    return MSG_PROPOSED;
  }

  const maPH = await nextMaPH();

  await query(
    `INSERT INTO PhanHoiLuong (MaPH, NgayGui, LyDo, TrangThai, MaNV, MaQL, MaPL, NoiDungDeXuat)
     VALUES (@maPH, GETDATE(), @lyDo, @status, @maNV, @maQL, @maPL, @noiDung)`,
    {
      maPH: { type: sql.Char(10), value: maPH },
      lyDo: { type: sql.NVarChar(255), value: lyDo },
      status: { type: sql.NVarChar(20), value: STATUS.PENDING },
      maNV: { type: sql.Char(10), value: line.maNV },
      maQL: { type: sql.Char(10), value: maQL },
      maPL: { type: sql.Char(10), value: line.maPL },
      noiDung: { type: sql.NVarChar(sql.MAX), value: noiDung },
    },
  );

  return MSG_PROPOSED;
}

/* -------------------------------------------------------------------------- */
/* Màn "Chủ quán xét đề xuất"                                                  */
/* -------------------------------------------------------------------------- */

/** Các đề xuất đang chờ chủ quán duyệt, kèm giá trị hiện tại và đề xuất. */
async function getReviewScreen({ today = dt.todayISO() } = {}) {
  const result = await query(
    `SELECT ph.MaPH, ph.NgayGui, ph.LyDo, ph.MaQL, ph.MaPL, ph.MaNV, ph.NoiDungDeXuat,
            nv.HoTen,
            bl.MaBL, bl.Thang, bl.Nam,
            CONVERT(char(10), bl.NgayChiTra, 23) AS NgayChiTraISO,
            ql.HoTen AS TenQuanLy
       FROM PhanHoiLuong ph
       LEFT JOIN NhanVien nv ON nv.MaNV = ph.MaNV
       LEFT JOIN PhieuLuong pl ON pl.MaPL = ph.MaPL
       LEFT JOIN BangLuong bl ON bl.MaBL = pl.MaBL
       LEFT JOIN QuanLy ql ON ql.MaQL = ph.MaQL
      WHERE ph.NoiDungDeXuat IS NOT NULL
        AND ph.TrangThai = @status
      ORDER BY ph.NgayGui, ph.MaPH`,
    { status: { type: sql.NVarChar(20), value: STATUS.PENDING } },
  );

  const todayISO = dt.toISODate(today) || dt.todayISO();
  const items = [];

  for (const row of result.recordset) {
    const noiDung = parseProposal(row.NoiDungDeXuat);
    if (!noiDung || !noiDung.moi) continue;

    let line = null;
    try {
      line = await loadLine(String(row.MaPL).trim(), noiDung.maCTL);
    } catch {
      line = null;
    }
    if (!line) continue;

    const deXuat = applyValues(line, {
      gioVao: String(noiDung.moi.gioVao || ''),
      gioRa: String(noiDung.moi.gioRa || ''),
      phat: Number(noiDung.moi.phat) || 0,
      ung: Number(noiDung.moi.ung) || 0,
    });

    const rows = [
      {
        label: 'Giờ vào - giờ ra',
        current: `${line.hienTai.gioVao || '-'} – ${line.hienTai.gioRa || '-'}`,
        proposed: `${deXuat.gioVao || '-'} – ${deXuat.gioRa || '-'}`,
      },
      {
        label: 'Số giờ làm',
        current: formatHoursShort(line.hienTai.soGio),
        proposed: formatHoursShort(deXuat.soGio),
      },
      {
        label: 'Phạt',
        current: fmt.formatCurrency(line.hienTai.phat),
        proposed: fmt.formatCurrency(deXuat.phat),
      },
      {
        label: 'Ứng',
        current: fmt.formatCurrency(line.hienTai.ung),
        proposed: fmt.formatCurrency(deXuat.ung),
      },
      {
        label: 'Thực nhận ca',
        current: fmt.formatCurrency(line.hienTai.thucNhanCa),
        proposed: fmt.formatCurrency(deXuat.thucNhanCa),
      },
      {
        label: 'Thực nhận tháng',
        current: fmt.formatCurrency(line.hienTai.thucNhanThang),
        proposed: fmt.formatCurrency(deXuat.thucNhanThang),
      },
    ];

    items.push({
      maPH: String(row.MaPH).trim(),
      maPL: line.maPL,
      hoTen: line.hoTen,
      kyLabel: line.kyLabel,
      nguoiDeXuat: row.TenQuanLy || 'Quản lý',
      lyDo: String(row.LyDo || '').trim(),
      rows,
      isOverdue: todayISO > line.ngayChiTraISO,
      ngayChiTraLabel: dt.formatDateVN(line.ngayChiTraISO),
    });
  }

  return { items, isEmpty: items.length === 0, emptyMessage: MSG_EMPTY };
}

/* -------------------------------------------------------------------------- */
/* Trạng thái đề xuất cho quản lý / danh sách phiếu lương                      */
/* -------------------------------------------------------------------------- */

/** Số đề xuất đang chờ chủ quán duyệt. */
async function countPendingProposals() {
  const result = await query(
    `SELECT COUNT(*) AS SoLuong
       FROM PhanHoiLuong
      WHERE NoiDungDeXuat IS NOT NULL AND TrangThai = @status`,
    { status: { type: sql.NVarChar(20), value: STATUS.PENDING } },
  );
  return Number(result.recordset[0]?.SoLuong || 0);
}

/**
 * Đề xuất mới nhất của từng dòng ca trong một phiếu lương, kèm trạng thái.
 * Dùng để quản lý biết dòng nào đang chờ duyệt / đã duyệt / bị từ chối.
 *
 * @param {string} maPL
 */
async function getPayslipProposals(maPL) {
  const result = await query(
    `SELECT ph.MaPH, ph.NgayGui, ph.LyDo, ph.TrangThai, ph.NoiDungDeXuat,
            ql.HoTen AS TenQuanLy
       FROM PhanHoiLuong ph
       LEFT JOIN QuanLy ql ON ql.MaQL = ph.MaQL
      WHERE ph.MaPL = @maPL AND ph.NoiDungDeXuat IS NOT NULL
      ORDER BY ph.NgayGui DESC, ph.MaPH DESC`,
    { maPL: { type: sql.Char(10), value: String(maPL || '').trim() } },
  );

  const latest = new Map();

  for (const row of result.recordset) {
    const noiDung = parseProposal(row.NoiDungDeXuat);
    if (!noiDung || !noiDung.maCTL) continue;

    const maCTL = String(noiDung.maCTL).trim();
    if (latest.has(maCTL)) continue;

    latest.set(maCTL, {
      maPH: String(row.MaPH).trim(),
      maCTL,
      ngayGui: formatDate(row.NgayGui),
      nguoiDeXuat: row.TenQuanLy || 'Quản lý',
      lyDo: String(row.LyDo || '').trim(),
      status: proposalStatusMeta(row.TrangThai),
      lyDoTuChoi: String(noiDung.ketQua?.lyDoTuChoi || '').trim(),
    });
  }

  return Array.from(latest.values());
}

/**
 * Nhật ký đề xuất chỉnh sửa lương (mới nhất trước) — cột `PhanHoiLuong` là nơi
 * lưu lịch sử theo quyết định C17.
 *
 * @param {{limit?: number}} [options]
 */
async function getProposalHistory({ limit = 20 } = {}) {
  const result = await query(
    `SELECT TOP (@limit) ph.MaPH, ph.NgayGui, ph.LyDo, ph.TrangThai, ph.NoiDungDeXuat,
            nv.HoTen, ql.HoTen AS TenQuanLy,
            pl.MaPL, bl.Thang, bl.Nam
       FROM PhanHoiLuong ph
       LEFT JOIN NhanVien nv ON nv.MaNV = ph.MaNV
       LEFT JOIN QuanLy ql ON ql.MaQL = ph.MaQL
       LEFT JOIN PhieuLuong pl ON pl.MaPL = ph.MaPL
       LEFT JOIN BangLuong bl ON bl.MaBL = pl.MaBL
      WHERE ph.NoiDungDeXuat IS NOT NULL
      ORDER BY ph.NgayGui DESC, ph.MaPH DESC`,
    { limit: { type: sql.Int, value: Math.max(1, Number(limit) || 20) } },
  );

  return result.recordset.map((row) => {
    const noiDung = parseProposal(row.NoiDungDeXuat);
    const ketQua = noiDung?.ketQua || {};

    return {
      maPH: String(row.MaPH).trim(),
      ngayGui: formatDate(row.NgayGui),
      hoTen: row.HoTen || '—',
      nguoiDeXuat: row.TenQuanLy || 'Quản lý',
      kyLabel: row.Thang ? `Tháng ${String(row.Thang).padStart(2, '0')}/${row.Nam}` : '—',
      maPL: row.MaPL ? String(row.MaPL).trim() : null,
      lyDo: String(row.LyDo || '').trim(),
      status: proposalStatusMeta(row.TrangThai),
      // Đề xuất duyệt sau hạn chi trả: giá trị không sửa vào kỳ cũ mà được
      // cộng/trừ vào kỳ sau, nên phải nói rõ kỳ nhận chênh lệch.
      carryLabel: ketQua.kieu === 'ket-chuyen' ? ketQua.kyDich || 'kỳ sau' : '',
      rejectReason: String(ketQua.lyDoTuChoi || '').trim(),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Duyệt / không duyệt đề xuất (chủ quán)                                      */
/* -------------------------------------------------------------------------- */

/** Đọc đề xuất đang chờ duyệt theo mã. */
async function loadPending(maPH) {
  const result = await query(
    `SELECT MaPH, MaPL, MaNV, TrangThai, LyDo, NoiDungDeXuat
       FROM PhanHoiLuong
      WHERE MaPH = @maPH AND NoiDungDeXuat IS NOT NULL`,
    { maPH: { type: sql.Char(10), value: String(maPH || '').trim() } },
  );

  const row = result.recordset[0];
  if (!row) throw notFound('Không tìm thấy đề xuất chỉnh sửa.');
  if (String(row.TrangThai).trim() !== STATUS.PENDING) {
    throw badRequest('Đề xuất này đã được xử lý.');
  }

  const noiDung = parseProposal(row.NoiDungDeXuat);
  if (!noiDung || !noiDung.moi) throw badRequest('Nội dung đề xuất không hợp lệ.');

  return {
    maPH: String(row.MaPH).trim(),
    maPL: String(row.MaPL).trim(),
    maNV: String(row.MaNV || '').trim(),
    lyDo: String(row.LyDo || '').trim(),
    noiDung,
  };
}

/** Ghi giờ chấm công mới (thêm dòng nếu ca chưa có). */
async function saveAttendance(tx, line, values) {
  const existing = await txRequest(tx)
    .input('maLich', sql.Char(10), line.maLich)
    .query('SELECT MaCC FROM ChamCong WHERE MaLich = @maLich');

  const gioVao = values.gioVao ? dt.toHMS(values.gioVao) : null;
  const gioRa = values.gioRa ? dt.toHMS(values.gioRa) : null;

  if (existing.recordset.length) {
    await txRequest(tx)
      .input('maLich', sql.Char(10), line.maLich)
      .input('gioVao', sql.VarChar(8), gioVao)
      .input('gioRa', sql.VarChar(8), gioRa)
      .query('UPDATE ChamCong SET GioVao = @gioVao, GioRa = @gioRa WHERE MaLich = @maLich');
    return;
  }

  if (!gioVao && !gioRa) return;

  const { nextMaCC } = require('../utils/id');
  const maCC = await nextMaCC();

  await txRequest(tx)
    .input('maCC', sql.Char(10), maCC)
    .input('maLich', sql.Char(10), line.maLich)
    .input('gioVao', sql.VarChar(8), gioVao)
    .input('gioRa', sql.VarChar(8), gioRa)
    .query(
      `INSERT INTO ChamCong (MaCC, MaLich, GioVao, GioRa)
       VALUES (@maCC, @maLich, @gioVao, @gioRa)`,
    );
}

/** Tính lại tổng hợp phiếu lương từ các dòng chi tiết. */
async function recalcPayslip(tx, maPL) {
  await txRequest(tx)
    .input('maPL', sql.Char(10), maPL)
    .query(
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
    );
}

/** Kỳ kế tiếp (tháng sau) của một kỳ lương. */
function nextPeriodOf(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Phiếu lương của một nhân viên trong kỳ kế tiếp (nếu có). */
async function findNextPayslip(maNV, year, month) {
  const target = nextPeriodOf(year, month);
  const result = await query(
    `SELECT TOP 1 pl.MaPL, bl.MaBL, bl.TinhTrang, pl.ChenhLechKetChuyen
       FROM PhieuLuong pl
       JOIN BangLuong bl ON bl.MaBL = pl.MaBL
      WHERE pl.MaND = @maNV AND bl.Nam = @year AND bl.Thang = @month`,
    {
      maNV: { type: sql.Char(10), value: maNV },
      year: { type: sql.Int, value: target.year },
      month: { type: sql.Int, value: target.month },
    },
  );

  const row = result.recordset[0];
  if (!row) {
    throw badRequest(
      `Chưa có bảng lương tháng ${String(target.month).padStart(2, '0')}/${target.year} ` +
        'để kết chuyển chênh lệch. Hãy sinh bảng lương kỳ đó trước.',
    );
  }

  return {
    maPL: String(row.MaPL).trim(),
    maBL: String(row.MaBL).trim(),
    tinhTrang: String(row.TinhTrang || '').trim(),
    chenhLech: Number(row.ChenhLechKetChuyen),
    target,
  };
}

/**
 * Chủ quán duyệt đề xuất: áp giá trị mới rồi tính lại phiếu lương.
 *
 * @param {string} maPH
 * @param {{today?: string, role?: string}} [options]
 * @returns {Promise<{message: string, mode: 'direct'|'carry', chenhLech?: number}>}
 */
async function approveProposal(maPH, { today = dt.todayISO(), role } = {}) {
  if (role && role !== ROLE_OWNER) {
    throw badRequest('Chỉ chủ quán được duyệt đề xuất chỉnh sửa lương.');
  }

  const proposal = await loadPending(maPH);
  const line = await loadLine(proposal.maPL, proposal.noiDung.maCTL);

  const values = {
    gioVao: String(proposal.noiDung.moi.gioVao || ''),
    gioRa: String(proposal.noiDung.moi.gioRa || ''),
    phat: Math.round(Number(proposal.noiDung.moi.phat) || 0),
    ung: Math.round(Number(proposal.noiDung.moi.ung) || 0),
  };
  const deXuat = applyValues(line, values);

  const todayISO = dt.toISODate(today) || dt.todayISO();
  const isOverdue = todayISO > line.ngayChiTraISO;

  // Quá hạn: chuyển chênh lệch sang kỳ sau, không sửa phiếu của kỳ đã chốt.
  const target = isOverdue
    ? await findNextPayslip(line.maNV, line.nam, line.thang)
    : null;

  const chenhLech = deXuat.thucNhanThang - line.hienTai.thucNhanThang;

  await withTransaction(async (tx) => {
    if (!isOverdue) {
      await saveAttendance(tx, line, values);

      await txRequest(tx)
        .input('maCTL', sql.Char(10), line.maCTL)
        .input('soGio', sql.Decimal(9, 2), deXuat.soGio)
        .input('phat', sql.Decimal(18, 2), deXuat.phat)
        .query(
          `UPDATE ChiTietLuong
              SET SoGioLam = @soGio, PhatDiTre = @phat, PhatBoCa = 0
            WHERE MaCTL = @maCTL`,
        );

      await txRequest(tx)
        .input('maPL', sql.Char(10), line.maPL)
        .input('ung', sql.Decimal(18, 2), deXuat.ung)
        .query('UPDATE PhieuLuong SET TienUngLuong = @ung WHERE MaPL = @maPL');

      await recalcPayslip(tx, line.maPL);
    } else if (chenhLech !== 0) {
      await txRequest(tx)
        .input('maPL', sql.Char(10), target.maPL)
        .input('chenhLech', sql.Decimal(18, 2), chenhLech)
        .query(
          `UPDATE PhieuLuong
              SET ChenhLechKetChuyen = ChenhLechKetChuyen + @chenhLech
            WHERE MaPL = @maPL`,
        );
    }

    const noiDung = JSON.stringify({
      ...proposal.noiDung,
      ketQua: {
        kieu: isOverdue ? 'ket-chuyen' : 'truc-tiep',
        chenhLech,
        ngayDuyet: todayISO,
        maPLDich: isOverdue ? target.maPL : line.maPL,
        maBLDich: isOverdue ? target.maBL : line.maBL,
        kyDich: isOverdue
          ? `Tháng ${String(target.target.month).padStart(2, '0')}/${target.target.year}`
          : null,
      },
    });

    await txRequest(tx)
      .input('maPH', sql.Char(10), proposal.maPH)
      .input('status', sql.NVarChar(20), STATUS.APPROVED)
      .input('noiDung', sql.NVarChar(sql.MAX), noiDung)
      .query(
        `UPDATE PhanHoiLuong
            SET TrangThai = @status, NoiDungDeXuat = @noiDung
          WHERE MaPH = @maPH`,
      );
  });

  return {
    message: isOverdue ? MSG_CARRY : MSG_APPROVED,
    mode: isOverdue ? 'carry' : 'direct',
    chenhLech,
  };
}

/**
 * Chủ quán không duyệt đề xuất: giữ nguyên phiếu lương.
 *
 * @param {string} maPH
 * @param {string} [lyDo] lý do không duyệt (lưu trong JSON, không có cột riêng)
 * @param {string} [role] vai trò người xử lý
 */
async function rejectProposal(maPH, lyDo = '', role) {
  if (role && role !== ROLE_OWNER) {
    throw badRequest('Chỉ chủ quán được từ chối đề xuất chỉnh sửa lương.');
  }

  const proposal = await loadPending(maPH);

  const noiDung = JSON.stringify({
    ...proposal.noiDung,
    ketQua: {
      kieu: 'tu-choi',
      lyDoTuChoi: String(lyDo || '').trim(),
      ngayTuChoi: dt.todayISO(),
    },
  });

  await query(
    `UPDATE PhanHoiLuong
        SET TrangThai = @status, NoiDungDeXuat = @noiDung
      WHERE MaPH = @maPH`,
    {
      maPH: { type: sql.Char(10), value: proposal.maPH },
      status: { type: sql.NVarChar(20), value: STATUS.REJECTED },
      noiDung: { type: sql.NVarChar(sql.MAX), value: noiDung },
    },
  );

  return MSG_REJECTED;
}

module.exports = {
  STATUS,
  PERIOD_APPROVED,
  ROLE_OWNER,
  MSG_PROPOSED,
  MSG_APPROVED,
  MSG_CARRY,
  MSG_REJECTED,
  MSG_EMPTY,
  formatHoursShort,
  proposalStatusMeta,
  applyValues,
  nextPeriodOf,
  createProposal,
  getReviewScreen,
  countPendingProposals,
  getPayslipProposals,
  getProposalHistory,
  approveProposal,
  rejectProposal,
};
