'use strict';

/**
 * Nghiệp vụ đơn từ và lương của nhân viên:
 *  - Chấm công bổ sung (UC04)
 *  - Đăng ký xin nghỉ / đổi ca / làm thay (UC06)
 *  - Ứng lương (UC09)
 *  - Kiểm tra phiếu lương và phản hồi sai sót (UC08)
 *
 * Mọi thông báo lỗi đều dùng đúng câu chữ trong đặc tả màn hình (mục 7.2.1).
 */

const { query, sql, withTransaction, txRequest } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');
const {
  nextMaCCBS,
  nextMaXN,
  nextMaDC,
  nextMaLT,
  nextMaUL,
  nextMaPH,
} = require('../utils/id');

/* -------------------------------------------------------------------------- */
/* Thông báo                                                                   */
/* -------------------------------------------------------------------------- */

const MSG_SUPPLEMENT_OK = 'Chấm công bổ sung thành công!';
const MSG_LEAVE_OK = 'Gửi yêu cầu thành công!';
const MSG_SWAP_OK = 'Gửi yêu cầu đổi ca thành công!';
const MSG_COVER_OK = 'Đăng ký nhận ca thành công!';
const MSG_ADVANCE_OK = 'Ứng lương thành công!';
const MSG_CONFIRM_OK = 'Xác nhận phiếu lương thành công!';
const MSG_FEEDBACK_OK = 'Gửi phản hồi thành công!';

const MSG_REQUIRED = 'Vui lòng điền đầy đủ thông tin';
const MSG_PICK_SHIFT = 'Vui lòng chọn ca làm.';
const MSG_TIME_OUT = 'Vui lòng nhập giờ ra.';
const MSG_REASON = 'Vui lòng bổ sung lý do.';
const MSG_TIME_ORDER = 'Giờ ra phải sau giờ vào của ca.';
const MSG_NOT_APPROVED = 'Phiếu lương kỳ này chưa được phê duyệt';

/* -------------------------------------------------------------------------- */
/* UC04 — Chấm công bổ sung                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Các ca đã diễn ra trong 21 ngày gần nhất để chọn khi gửi yêu cầu bổ sung.
 * @param {string} maNV
 */
async function getSupplementaryContext(maNV) {
  const today = dt.todayISO();
  const from = dt.addDaysISO(today, -21);

  const result = await query(
    `SELECT llv.MaLich,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa,
            ca.GioBatDau,
            ca.GioKetThuc,
            cc.GioVao,
            cc.GioRa,
            bs.MaCCBS,
            bs.TrangThai AS TrangThaiBoSung
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       LEFT JOIN ChamCong cc ON cc.MaLich = llv.MaLich
       OUTER APPLY (
         SELECT TOP 1 MaCCBS, TrangThai
           FROM ChamCongBoSung
          WHERE MaLich = llv.MaLich AND MaNV = llv.MaNV
          ORDER BY NgayGui DESC
       ) bs
      WHERE llv.MaNV = @maNV
        AND llv.NgayLam BETWEEN @from AND @today
      ORDER BY llv.NgayLam DESC, ca.GioBatDau`,
    {
      maNV: { type: sql.Char(10), value: maNV },
      from: { type: sql.VarChar(10), value: from },
      today: { type: sql.VarChar(10), value: today },
    },
  );

  const shifts = result.recordset.map((row) => {
    const ngayISO = row.NgayISO;
    return {
      maLich: String(row.MaLich).trim(),
      ngayISO,
      tenCa: row.TenCa,
      gioBatDau: dt.toHM(row.GioBatDau),
      gioKetThuc: dt.toHM(row.GioKetThuc),
      gioVao: dt.toHM(row.GioVao),
      gioRa: dt.toHM(row.GioRa),
      maCCBS: row.MaCCBS ? String(row.MaCCBS).trim() : null,
      trangThai: row.TrangThaiBoSung || null,
      ngayLabel: dt.formatDateLongVN(ngayISO),
      label: `${dt.formatDateLongVN(ngayISO)} · ${row.TenCa} · ${dt.toHM(row.GioBatDau)} – ${dt.toHM(row.GioKetThuc)}`,
    };
  });

  const history = await query(
    `SELECT TOP 10 bs.MaCCBS, bs.NgayGui, bs.LyDo, bs.TrangThai,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa
       FROM ChamCongBoSung bs
       JOIN LichLamViec llv ON llv.MaLich = bs.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE bs.MaNV = @maNV
      ORDER BY bs.NgayGui DESC`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  return {
    shifts,
    history: history.recordset.map((row) => ({
      maCCBS: String(row.MaCCBS).trim(),
      ngayGui: dt.formatDateVN(dt.toISODate(row.NgayGui)),
      ngayLam: dt.formatDateVN(row.NgayISO),
      tenCa: row.TenCa,
      lyDo: row.LyDo,
      trangThai: row.TrangThai,
    })),
  };
}

/**
 * Gửi yêu cầu chấm công bổ sung (UC04).
 * @param {string} maNV
 * @param {{maLich?: string, gioRa?: string, lyDo?: string}} payload
 */
async function createSupplementary(maNV, payload) {
  const maLich = String(payload.maLich || '').trim();
  const gioRa = String(payload.gioRa || '').trim();
  const lyDo = String(payload.lyDo || '').trim();

  const fieldErrors = {};
  if (!maLich) fieldErrors.maLich = MSG_PICK_SHIFT;
  if (!gioRa) fieldErrors.gioRa = MSG_TIME_OUT;
  if (!lyDo) fieldErrors.lyDo = MSG_REASON;
  if (Object.keys(fieldErrors).length) {
    throw badRequest(Object.values(fieldErrors)[0], fieldErrors);
  }

  const shiftResult = await query(
    `SELECT llv.MaLich,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.GioBatDau
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE llv.MaLich = @maLich AND llv.MaNV = @maNV`,
    {
      maLich: { type: sql.Char(10), value: maLich },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  const shift = shiftResult.recordset[0];
  if (!shift) throw notFound('Không tìm thấy ca làm của bạn.');

  const gioVao = dt.toHM(shift.GioBatDau);
  if (dt.hmToMinutes(gioRa) <= dt.hmToMinutes(gioVao)) {
    throw badRequest(MSG_TIME_ORDER, { gioRa: MSG_TIME_ORDER });
  }

  const maCCBS = await nextMaCCBS();
  await query(
    `INSERT INTO ChamCongBoSung
       (MaCCBS, GioVaoThucTe, GioRaThucTe, MaLich, MaNV, MaQL, NgayGui, LyDo, TrangThai)
     VALUES
       (@maCCBS, @gioVao, @gioRa, @maLich, @maNV, NULL, GETDATE(), @lyDo, N'Chờ duyệt')`,
    {
      maCCBS: { type: sql.Char(10), value: maCCBS },
      gioVao: { type: sql.VarChar(8), value: `${gioVao}:00` },
      gioRa: { type: sql.VarChar(8), value: `${gioRa}:00` },
      maLich: { type: sql.Char(10), value: maLich },
      maNV: { type: sql.Char(10), value: maNV },
      lyDo: { type: sql.NVarChar(510), value: lyDo },
    },
  );

  return MSG_SUPPLEMENT_OK;
}

/* -------------------------------------------------------------------------- */
/* UC06 — Xin nghỉ / Đổi ca / Làm thay                                         */
/* -------------------------------------------------------------------------- */

/** Đồng nghiệp còn làm việc (trừ chính mình). */
async function getColleagues(maNV) {
  const result = await query(
    `SELECT MaNV, HoTen, ViTri
       FROM NhanVien
      WHERE MaNV <> @maNV AND TinhTrang <> N'Đã nghỉ'
      ORDER BY HoTen`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  return result.recordset.map((row) => ({
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    viTri: row.ViTri,
  }));
}

/**
 * Các ca đang thiếu người (có đơn xin nghỉ đang chờ/đã duyệt và chưa có ai nhận).
 */
async function getEmptyShifts(maNV) {
  const today = dt.todayISO();

  const result = await query(
    `SELECT llv.MaLich,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc,
            nv.HoTen,
            xn.TrangThai AS TrangThaiNghi
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       JOIN NhanVien nv ON nv.MaNV = llv.MaNV
       JOIN CT_XinNghi ct ON ct.MaLich = llv.MaLich
       JOIN DonXinNghi xn ON xn.MaXN = ct.MaXN
      WHERE llv.NgayLam >= @today
        AND llv.MaNV <> @maNV
        AND xn.TrangThai IN (N'Chờ duyệt', N'Đã duyệt')
        AND NOT EXISTS (
              SELECT 1 FROM DonLamThay lt
               WHERE lt.MaLich = llv.MaLich
                 AND lt.TrangThai IN (N'Chờ duyệt', N'Đã duyệt'))
      ORDER BY llv.NgayLam, ca.GioBatDau`,
    {
      today: { type: sql.VarChar(10), value: today },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  const seen = new Set();
  return result.recordset
    .filter((row) => {
      const key = String(row.MaLich).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      maLich: String(row.MaLich).trim(),
      ngayISO: row.NgayISO,
      ngayLabel: dt.formatDateLongVN(row.NgayISO),
      tenCa: row.TenCa,
      thoiGian: `${dt.toHM(row.GioBatDau)} – ${dt.toHM(row.GioKetThuc)}`,
      nguoiNghi: row.HoTen,
      trangThai: row.TrangThaiNghi === 'Đã duyệt' ? 'Đang thiếu người' : 'Sắp trống',
    }));
}

/** Lịch sử đơn của nhân viên (nghỉ, đổi ca, làm thay). */
async function getMyRequests(maNV) {
  const leaves = await query(
    `SELECT TOP 10 xn.MaXN, xn.NgayGui, xn.LyDo, xn.TrangThai,
            CONVERT(char(10), xn.NgayBatDau, 23) AS TuNgay,
            CONVERT(char(10), xn.NgayKetThuc, 23) AS DenNgay,
            (SELECT COUNT(*) FROM CT_XinNghi ct WHERE ct.MaXN = xn.MaXN) AS SoCa
       FROM DonXinNghi xn
      WHERE xn.MaNV = @maNV
      ORDER BY xn.NgayGui DESC`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  const swaps = await query(
    `SELECT TOP 10 dc.MaDC, dc.NgayGui, dc.LyDo, dc.TrangThai,
            CONVERT(char(10), g.NgayLam, 23) AS NgayGoc,
            cg.TenCa AS CaGoc,
            CONVERT(char(10), m.NgayLam, 23) AS NgayDoi,
            cm.TenCa AS CaDoi,
            nv.HoTen AS NguoiDoi
       FROM DonDoiCa dc
       JOIN LichLamViec g ON g.MaLich = dc.MaLichGoc
       JOIN CaLam cg ON cg.MaCa = g.MaCa
       JOIN LichLamViec m ON m.MaLich = dc.MaLichMuonDoi
       JOIN CaLam cm ON cm.MaCa = m.MaCa
       JOIN NhanVien nv ON nv.MaNV = m.MaNV
      WHERE dc.MaNV = @maNV
      ORDER BY dc.NgayGui DESC`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  const covers = await query(
    `SELECT TOP 10 lt.MaLT, lt.NgayGui, lt.LyDo, lt.TrangThai,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc
       FROM DonLamThay lt
       JOIN LichLamViec llv ON llv.MaLich = lt.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE lt.MaNV = @maNV
      ORDER BY lt.NgayGui DESC`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  return {
    leaves: leaves.recordset.map((row) => ({
      ma: String(row.MaXN).trim(),
      ngayGui: dt.formatDateVN(dt.toISODate(row.NgayGui)),
      thoiGian: row.TuNgay === row.DenNgay
        ? dt.formatDateVN(row.TuNgay)
        : `${dt.formatDateVN(row.TuNgay)} - ${dt.formatDateVN(row.DenNgay)}`,
      soCa: row.SoCa,
      lyDo: row.LyDo,
      trangThai: row.TrangThai,
    })),
    swaps: swaps.recordset.map((row) => ({
      ma: String(row.MaDC).trim(),
      ngayGui: dt.formatDateVN(dt.toISODate(row.NgayGui)),
      noiDung: `${dt.formatDateVN(row.NgayGoc)} (${row.CaGoc}) ↔ ${dt.formatDateVN(row.NgayDoi)} (${row.CaDoi}) - ${row.NguoiDoi}`,
      lyDo: row.LyDo,
      trangThai: row.TrangThai,
    })),
    covers: covers.recordset.map((row) => ({
      ma: String(row.MaLT).trim(),
      ngayGui: dt.formatDateVN(dt.toISODate(row.NgayGui)),
      noiDung: `${dt.formatDateVN(row.NgayISO)} · ${row.TenCa} · ${dt.toHM(row.GioBatDau)} – ${dt.toHM(row.GioKetThuc)}`,
      lyDo: row.LyDo,
      trangThai: row.TrangThai,
    })),
  };
}

/**
 * Gửi đơn xin nghỉ (UC06).
 * @param {string} maNV
 * @param {{phuongThuc?: string, maLich?: string, lyDo?: string}} payload
 */
async function createLeave(maNV, payload) {
  const maLich = String(payload.maLich || '').trim();
  const lyDo = String(payload.lyDo || '').trim();
  const caNgay = payload.phuongThuc === 'ngay';

  if (!maLich || !lyDo) {
    throw badRequest(MSG_REQUIRED, {
      ...(maLich ? {} : { maLich: MSG_REQUIRED }),
      ...(lyDo ? {} : { lyDo: MSG_REQUIRED }),
    });
  }

  const shiftResult = await query(
    `SELECT llv.MaLich, CONVERT(char(10), llv.NgayLam, 23) AS NgayISO
       FROM LichLamViec llv
      WHERE llv.MaLich = @maLich AND llv.MaNV = @maNV`,
    {
      maLich: { type: sql.Char(10), value: maLich },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  const shift = shiftResult.recordset[0];
  if (!shift) throw notFound('Không tìm thấy ca làm của bạn.');

  // Phương thức nghỉ (C14): nghỉ cả ngày = mọi ca của ngày đó,
  // nghỉ theo ca = chỉ ca được chọn.
  const targetResult = caNgay
    ? await query(
      `SELECT MaLich FROM LichLamViec WHERE MaNV = @maNV AND NgayLam = @ngay`,
      {
        maNV: { type: sql.Char(10), value: maNV },
        ngay: { type: sql.VarChar(10), value: shift.NgayISO },
      },
    )
    : { recordset: [{ MaLich: shift.MaLich }] };

  const maXN = await nextMaXN();

  await withTransaction(async (tx) => {
    await txRequest(tx)
      .input('maXN', sql.Char(10), maXN)
      .input('lyDo', sql.NVarChar(510), lyDo)
      .input('tuNgay', sql.VarChar(10), shift.NgayISO)
      .input('denNgay', sql.VarChar(10), shift.NgayISO)
      .input('maNV', sql.Char(10), maNV)
      .query(`INSERT INTO DonXinNghi
                (MaXN, NgayGui, LyDo, TrangThai, NgayBatDau, NgayKetThuc, MaNV, MaQL)
              VALUES
                (@maXN, GETDATE(), @lyDo, N'Chờ duyệt', @tuNgay, @denNgay, @maNV, NULL)`);

    for (const row of targetResult.recordset) {
      await txRequest(tx)
        .input('maXN', sql.Char(10), maXN)
        .input('maLich', sql.Char(10), String(row.MaLich).trim())
        .query(`INSERT INTO CT_XinNghi (MaXN, MaLich) VALUES (@maXN, @maLich)`);
    }
  });

  return MSG_LEAVE_OK;
}

/**
 * Gửi đơn đổi ca (UC06 — luồng thay thế 3a).
 * @param {string} maNV
 * @param {{maLichGoc?: string, maLichMuonDoi?: string, lyDo?: string}} payload
 */
async function createSwap(maNV, payload) {
  const maLichGoc = String(payload.maLichGoc || '').trim();
  const maLichMuonDoi = String(payload.maLichMuonDoi || '').trim();
  const lyDo = String(payload.lyDo || '').trim();

  if (!maLichGoc || !maLichMuonDoi || !lyDo) {
    throw badRequest(MSG_REQUIRED, { lyDo: MSG_REQUIRED });
  }

  const check = await query(
    `SELECT g.MaNV AS NguoiGoc, m.MaNV AS NguoiDoi,
            CONVERT(char(10), g.NgayLam, 23) AS NgayGoc
       FROM LichLamViec g
       JOIN LichLamViec m ON m.MaLich = @maLichMuonDoi
      WHERE g.MaLich = @maLichGoc`,
    {
      maLichGoc: { type: sql.Char(10), value: maLichGoc },
      maLichMuonDoi: { type: sql.Char(10), value: maLichMuonDoi },
    },
  );

  const row = check.recordset[0];
  if (!row) throw notFound('Không tìm thấy ca làm cần đổi.');
  if (String(row.NguoiGoc).trim() !== maNV) {
    throw badRequest('Ca làm gốc không thuộc về bạn.');
  }
  if (String(row.NguoiDoi).trim() === maNV) {
    throw badRequest('Vui lòng chọn ca của đồng nghiệp khác.');
  }
  if (row.NgayGoc < dt.todayISO()) {
    throw badRequest('Chỉ được đổi ca chưa diễn ra.');
  }

  const maDC = await nextMaDC();
  await query(
    `INSERT INTO DonDoiCa
       (MaDC, NgayGui, LyDo, TrangThai, MaLichGoc, MaLichMuonDoi, MaNV, MaQL)
     VALUES
       (@maDC, GETDATE(), @lyDo, N'Chờ duyệt', @maLichGoc, @maLichMuonDoi, @maNV, NULL)`,
    {
      maDC: { type: sql.Char(10), value: maDC },
      lyDo: { type: sql.NVarChar(510), value: lyDo },
      maLichGoc: { type: sql.Char(10), value: maLichGoc },
      maLichMuonDoi: { type: sql.Char(10), value: maLichMuonDoi },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  return MSG_SWAP_OK;
}

/**
 * Đăng ký nhận ca làm thay (UC06 — luồng thay thế 3b).
 * @param {string} maNV
 * @param {string} maLich
 */
async function createCover(maNV, maLich) {
  const id = String(maLich || '').trim();
  if (!id) throw badRequest('Vui lòng chọn ca làm cần nhận.');

  const empty = await getEmptyShifts(maNV);
  if (!empty.some((shift) => shift.maLich === id)) {
    throw badRequest('Ca làm này đã có người nhận.');
  }

  const maLT = await nextMaLT();
  await query(
    `INSERT INTO DonLamThay (MaLT, NgayGui, LyDo, TrangThai, MaLich, MaNV, MaQL)
     VALUES (@maLT, GETDATE(), N'Đăng ký nhận ca làm thay', N'Chờ duyệt', @maLich, @maNV, NULL)`,
    {
      maLT: { type: sql.Char(10), value: maLT },
      maLich: { type: sql.Char(10), value: id },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  return MSG_COVER_OK;
}

/* -------------------------------------------------------------------------- */
/* UC09 — Ứng lương                                                            */
/* -------------------------------------------------------------------------- */

const ADVANCE_AMOUNTS = Object.freeze([500000, 1000000, 2000000]);

/**
 * Ghi nhận yêu cầu ứng lương (BR-UC9-01).
 * @param {string} maNV
 * @param {number|string} soTien
 */
async function createAdvance(maNV, soTien) {
  const amount = Number(soTien);
  if (!ADVANCE_AMOUNTS.includes(amount)) {
    throw badRequest('Vui lòng chọn mức ứng lương.', {
      soTien: 'Vui lòng chọn mức ứng lương.',
    });
  }

  const maUL = await nextMaUL();
  await query(
    `INSERT INTO UngLuong (MaUL, NgayGui, LyDo, TrangThai, SoTien, MaPL, MaNV, MaQL)
     VALUES (@maUL, GETDATE(), N'Ứng lương', N'Chờ duyệt', @soTien, NULL, @maNV, NULL)`,
    {
      maUL: { type: sql.Char(10), value: maUL },
      soTien: { type: sql.Decimal(18, 2), value: amount },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  return MSG_ADVANCE_OK;
}

/** Lịch sử ứng lương của nhân viên. */
async function getAdvanceHistory(maNV) {
  const result = await query(
    `SELECT TOP 10 MaUL, NgayGui, SoTien, TrangThai
       FROM UngLuong
      WHERE MaNV = @maNV
      ORDER BY NgayGui DESC`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  return result.recordset.map((row) => ({
    ma: String(row.MaUL).trim(),
    ngayGui: dt.formatDateVN(dt.toISODate(row.NgayGui)),
    soTien: Number(row.SoTien),
    trangThai: row.TrangThai,
  }));
}

/* -------------------------------------------------------------------------- */
/* UC08 — Kiểm tra phiếu lương                                                 */
/* -------------------------------------------------------------------------- */

/** Trạng thái bảng lương được phép hiển thị phiếu lương (BR-UC8-01). */
function isPayslipVisible(tinhTrang) {
  return tinhTrang === 'Đã duyệt' || tinhTrang === 'Đã chi trả';
}

/** Nhãn trạng thái và màu chấm tròn theo đặc tả màn hình. */
function statusMeta(tinhTrang) {
  if (tinhTrang === 'Đã chi trả') {
    return { label: 'Đã chi trả', tone: 'success' };
  }
  if (tinhTrang === 'Đã duyệt') {
    return { label: 'Đã duyệt hoàn tất', tone: 'success' };
  }
  if (tinhTrang === 'Chờ chủ quán duyệt') {
    return { label: 'Chờ chủ quán duyệt', tone: 'warning' };
  }
  return { label: 'Chưa được phê duyệt', tone: 'danger' };
}

/**
 * Dữ liệu màn hình Kiểm tra phiếu lương (UC08).
 * @param {string} maNV
 * @param {string} [maBL]
 */
async function getPayslipContext(maNV, maBL) {
  const periods = await query(
    `SELECT bl.MaBL, bl.Thang, bl.Nam, bl.TinhTrang, bl.NgayChiTra
       FROM PhieuLuong pl
       JOIN BangLuong bl ON bl.MaBL = pl.MaBL
      WHERE pl.MaND = @maNV
      ORDER BY bl.Nam DESC, bl.Thang DESC`,
    { maNV: { type: sql.Char(10), value: maNV } },
  );

  const list = periods.recordset.map((row) => ({
    maBL: String(row.MaBL).trim(),
    thang: row.Thang,
    nam: row.Nam,
    label: `Tháng ${row.Thang}/${row.Nam}`,
    tinhTrang: row.TinhTrang,
    ngayChiTra: dt.formatDateVN(dt.toISODate(row.NgayChiTra)),
  }));

  if (list.length === 0) {
    return { periods: [], selected: null, payslip: null, details: [], feedbacks: [] };
  }

  const selected = list.find((p) => p.maBL === maBL) || list[0];

  const slipResult = await query(
    `SELECT pl.MaPL, pl.TongGioLam, pl.LuongTheoGioLam, pl.TienPhat,
            pl.TienUngLuong, pl.ChenhLechKetChuyen, pl.MaBL,
            bl.Thang, bl.Nam, bl.TinhTrang, bl.NgayBatDau, bl.NgayKetThuc, bl.NgayChiTra,
            nv.MucLuong, nv.HoTen, nv.ViTri
       FROM PhieuLuong pl
       JOIN BangLuong bl ON bl.MaBL = pl.MaBL
       JOIN NhanVien nv ON nv.MaNV = pl.MaND
      WHERE pl.MaND = @maNV AND pl.MaBL = @maBL`,
    {
      maNV: { type: sql.Char(10), value: maNV },
      maBL: { type: sql.Char(10), value: selected.maBL },
    },
  );

  const slip = slipResult.recordset[0];
  if (!slip) throw notFound('Không tìm thấy phiếu lương.');

  const detailResult = await query(
    `SELECT ct.MaCTL, ct.SoGioLam, ct.HeSoNgay, ct.MucLuong,
            ct.PhatDiTre, ct.PhatBoCa,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa, ca.GioBatDau, ca.GioKetThuc,
            cc.GioVao, cc.GioRa
       FROM ChiTietLuong ct
       JOIN LichLamViec llv ON llv.MaLich = ct.MaLich
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       LEFT JOIN ChamCong cc ON cc.MaLich = llv.MaLich
      WHERE ct.MaPL = @maPL
      ORDER BY llv.NgayLam, ca.GioBatDau`,
    { maPL: { type: sql.Char(10), value: String(slip.MaPL).trim() } },
  );

  const details = detailResult.recordset.map((row) => ({
    maCTL: String(row.MaCTL).trim(),
    ngay: dt.formatDateVN(row.NgayISO),
    ngayLabel: dt.formatDateLongVN(row.NgayISO),
    tenCa: row.TenCa,
    gioVao: dt.toHM(row.GioVao) || '--:--',
    gioRa: dt.toHM(row.GioRa) || '--:--',
    soGio: Number(row.SoGioLam),
    heSo: Number(row.HeSoNgay),
    mucLuong: Number(row.MucLuong),
    phatDiTre: Number(row.PhatDiTre),
    phatBoCa: Number(row.PhatBoCa),
    thanhTien: Math.round(Number(row.SoGioLam) * Number(row.MucLuong) * Number(row.HeSoNgay)),
  }));

  const heSoValues = [...new Set(details.map((d) => d.heSo))].sort((a, b) => a - b);
  const heSoLabel = heSoValues.length === 0
    ? '1'
    : heSoValues.length === 1
      ? String(heSoValues[0])
      : `${heSoValues[0]} – ${heSoValues[heSoValues.length - 1]}`;

  const feedbackResult = await query(
    `SELECT MaPH, NgayGui, LyDo, TrangThai
       FROM PhanHoiLuong
      WHERE MaPL = @maPL AND MaNV = @maNV
      ORDER BY NgayGui DESC`,
    {
      maPL: { type: sql.Char(10), value: String(slip.MaPL).trim() },
      maNV: { type: sql.Char(10), value: maNV },
    },
  );

  const luongTheoGioLam = Number(slip.LuongTheoGioLam);
  const chenhLech = Number(slip.ChenhLechKetChuyen);
  const tienPhat = Number(slip.TienPhat);
  const tienUng = Number(slip.TienUngLuong);
  const thucNhan = Math.round(luongTheoGioLam + chenhLech - tienPhat - tienUng);
  const meta = statusMeta(slip.TinhTrang);

  return {
    periods: list,
    selected,
    status: meta,
    canView: isPayslipVisible(slip.TinhTrang),
    payslip: {
      maPL: String(slip.MaPL).trim(),
      thang: slip.Thang,
      nam: slip.Nam,
      kyLabel: `Tháng ${slip.Thang}/${slip.Nam}`,
      tuNgay: dt.formatDateVN(dt.toISODate(slip.NgayBatDau)),
      denNgay: dt.formatDateVN(dt.toISODate(slip.NgayKetThuc)),
      ngayChiTra: dt.formatDateVN(dt.toISODate(slip.NgayChiTra)),
      mucLuong: Number(slip.MucLuong),
      tongGioLam: Number(slip.TongGioLam),
      luongTheoGioLam,
      heSoLabel,
      tienPhat,
      tienUng,
      chenhLech,
      thucNhan,
      hoTen: slip.HoTen,
      viTri: slip.ViTri,
      tinhTrang: slip.TinhTrang,
    },
    details,
    feedbacks: feedbackResult.recordset.map((row) => ({
      ma: String(row.MaPH).trim(),
      ngayGui: dt.formatDateVN(dt.toISODate(row.NgayGui)),
      lyDo: row.LyDo,
      trangThai: row.TrangThai,
    })),
  };
}

/**
 * Nhân viên xác nhận phiếu lương đúng (UC08 — bước 5).
 * @param {string} maNV
 * @param {string} maBL
 */
async function confirmPayslip(maNV, maBL) {
  const context = await getPayslipContext(maNV, maBL);
  if (!context.canView) throw badRequest(MSG_NOT_APPROVED);
  return MSG_CONFIRM_OK;
}

/**
 * Gửi phản hồi sai sót cho phiếu lương (UC08 — luồng thay thế 4a).
 * @param {string} maNV
 * @param {string} maBL
 * @param {string} lyDo
 */
async function createPayslipFeedback(maNV, maBL, lyDo) {
  const reason = String(lyDo || '').trim().slice(0, 100);
  if (!reason) {
    throw badRequest('Vui lòng nhập lý do.', { lyDo: 'Vui lòng nhập lý do.' });
  }

  const context = await getPayslipContext(maNV, maBL);
  if (!context.canView) throw badRequest(MSG_NOT_APPROVED);

  const maPH = await nextMaPH();
  await query(
    `INSERT INTO PhanHoiLuong (MaPH, NgayGui, LyDo, TrangThai, MaNV, MaQL, MaPL)
     VALUES (@maPH, GETDATE(), @lyDo, N'Chờ xử lý', @maNV, NULL, @maPL)`,
    {
      maPH: { type: sql.Char(10), value: maPH },
      lyDo: { type: sql.NVarChar(100), value: reason },
      maNV: { type: sql.Char(10), value: maNV },
      maPL: { type: sql.Char(10), value: context.payslip.maPL },
    },
  );

  return MSG_FEEDBACK_OK;
}

module.exports = {
  ADVANCE_AMOUNTS,
  MSG_SUPPLEMENT_OK,
  MSG_LEAVE_OK,
  MSG_SWAP_OK,
  MSG_COVER_OK,
  MSG_ADVANCE_OK,
  MSG_CONFIRM_OK,
  MSG_FEEDBACK_OK,
  MSG_NOT_APPROVED,
  getSupplementaryContext,
  createSupplementary,
  getColleagues,
  getEmptyShifts,
  getMyRequests,
  createLeave,
  createSwap,
  createCover,
  createAdvance,
  getAdvanceHistory,
  isPayslipVisible,
  statusMeta,
  getPayslipContext,
  confirmPayslip,
  createPayslipFeedback,
};
