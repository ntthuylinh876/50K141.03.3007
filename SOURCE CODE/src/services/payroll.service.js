'use strict';

/**
 * UC13.1 — Tổng hợp giờ làm và tính lương (BR-UC13.1-01 … -09).
 *
 * Cách dùng:
 *   - Tự động: src/jobs/payroll.job.js chạy định kỳ và sinh bảng lương cho
 *     tháng vừa kết thúc (BR-UC13.1-01).
 *   - Chạy tay: node scripts/payroll.js --month=YYYY-MM
 *
 * Quyết định đã chốt:
 *   - Chỉ sinh cho tháng ĐÃ KẾT THÚC; không sinh cho tháng đang diễn ra.
 *   - Kỳ đã có bảng lương → bỏ qua, không ghi đè (kể cả kỳ đã sửa tay).
 *   - Chênh lệch kết chuyển để 0; phần phát sinh do sửa lương sau kỳ sẽ xử lý
 *     ở luồng đề xuất chỉnh sửa (UC13.3).
 *
 * Công thức nằm ở src/utils/payroll.js; file này chỉ đọc dữ liệu, gọi công thức
 * và ghi kết quả vào BangLuong / PhieuLuong / ChiTietLuong.
 */

const { query, sql, withTransaction, txRequest } = require('../config/db');
const payroll = require('../utils/payroll');
const dt = require('../utils/datetime');
const { maBangLuong } = require('../utils/id');

const STATUS_PENDING = 'Chưa duyệt';

/** Trạng thái kết quả của một lần sinh bảng lương. */
const RESULT = Object.freeze({
  CREATED: 'created',
  EXISTS: 'exists',
  NOT_ENDED: 'not-ended',
  EMPTY: 'empty',
  RUNNING: 'running',
});

/** Chặn hai lượt sinh chạy chồng nhau trong cùng tiến trình. */
let running = false;

const pad2 = (n) => String(n).padStart(2, '0');

/* -------------------------------------------------------------------------- */
/* Mốc thời gian của kỳ lương                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Thông tin thuần của một kỳ lương.
 * BR-UC13.1-01: kỳ = từ 01 đến ngày cuối tháng; chi trả ngày 05 tháng sau.
 *
 * @param {number} year
 * @param {number} month 1…12
 * @returns {{year:number, month:number, maBL:string, startISO:string,
 *            endISO:string, payISO:string, nextStartISO:string}}
 */
function periodMeta(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('Kỳ lương không hợp lệ.');
  }

  const range = dt.monthRangeISO(y, m);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;

  return {
    year: y,
    month: m,
    maBL: maBangLuong(m, y),
    startISO: range.start,
    endISO: range.end,
    payISO: `${nextYear}-${pad2(nextMonth)}-05`,
    nextStartISO: `${nextYear}-${pad2(nextMonth)}-01`,
  };
}

/**
 * Tháng liền trước của một ngày ISO.
 * @param {string} todayISO
 * @returns {{year:number, month:number}}
 */
function previousMonth(todayISO) {
  const iso = dt.toISODate(todayISO);
  if (!iso) throw new Error('Ngày không hợp lệ.');
  const [year, month] = iso.split('-').map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/* -------------------------------------------------------------------------- */
/* Dựng dữ liệu thuần (không truy vấn CSDL) — dùng cho kiểm thử                */
/* -------------------------------------------------------------------------- */

/**
 * Dựng toàn bộ dòng của một kỳ lương từ dữ liệu đã đọc sẵn.
 *
 * @param {Object} input
 * @param {string} input.maBL
 * @param {Array<Object>} input.shifts   Các ca của kỳ (xem loadPeriodShifts)
 * @param {Array<Object>} [input.advances] Khoản ứng đã duyệt, chưa gắn phiếu
 * @param {() => string} input.nextMaPL
 * @param {() => string} input.nextMaCTL
 * @returns {{payslips: Array, details: Array, advanceLinks: Array}}
 */
function buildPeriodPayroll({ maBL, shifts, advances = [], nextMaPL, nextMaCTL }) {
  const byEmployee = new Map();

  for (const shift of shifts) {
    const list = byEmployee.get(shift.maNV) || [];
    list.push(shift);
    byEmployee.set(shift.maNV, list);
  }

  const payslips = [];
  const details = [];
  const advanceLinks = [];

  for (const [maNV, ownShifts] of byEmployee) {
    const lines = ownShifts.map((shift) =>
      payroll.computeShiftLine({
        ngayLam: shift.ngayISO,
        gioBatDauCa: shift.gioBatDau,
        gioVao: shift.gioVao,
        gioRa: shift.gioRa,
        mucLuong: shift.mucLuong,
        tinhTrang: shift.tinhTrang,
        ngayVaoLam: shift.ngayVaoLam,
        coDonNghiDaDuyet: shift.coDonNghi === true,
      }),
    );

    const ownAdvances = advances.filter((item) => item.maNV === maNV);
    const tienUngLuong = ownAdvances.reduce(
      (sum, item) => sum + Number(item.soTien || 0),
      0,
    );

    // BR-UC13.1-02 … -09
    const summary = payroll.computePayslip({
      lines,
      tienUngLuong,
      chenhLechKetChuyen: 0,
    });

    const maPL = nextMaPL();

    payslips.push({
      MaPL: maPL,
      TongGioLam: summary.tongGioLam,
      LuongTheoGioLam: summary.luongTheoGioLam,
      TienPhat: summary.tienPhat,
      TienUngLuong: summary.tienUngLuong,
      ChenhLechKetChuyen: summary.chenhLechKetChuyen,
      MaBL: maBL,
      MaND: maNV,
    });

    ownShifts.forEach((shift, index) => {
      const line = lines[index];
      details.push({
        MaCTL: nextMaCTL(),
        SoGioLam: line.soGioLam,
        HeSoNgay: line.heSoNgay,
        MucLuong: line.mucLuong,
        PhatDiTre: line.phatDiTre,
        PhatBoCa: line.phatBoCa,
        MaLich: shift.maLich,
        MaPL: maPL,
      });
    });

    for (const advance of ownAdvances) {
      advanceLinks.push({ maUL: advance.maUL, maPL });
    }
  }

  return { payslips, details, advanceLinks };
}

/* -------------------------------------------------------------------------- */
/* Đọc dữ liệu                                                                 */
/* -------------------------------------------------------------------------- */

/** Kỳ này đã có bảng lương chưa (theo mã hoặc theo tháng/năm). */
async function periodExists(meta) {
  const result = await query(
    `SELECT TOP 1 MaBL
       FROM BangLuong
      WHERE MaBL = @maBL OR (Nam = @year AND Thang = @month)`,
    {
      maBL: { type: sql.Char(10), value: meta.maBL },
      year: { type: sql.Int, value: meta.year },
      month: { type: sql.Int, value: meta.month },
    },
  );
  return result.recordset.length > 0;
}

/**
 * Các ca làm việc trong kỳ, kèm chấm công và cờ đơn nghỉ đã duyệt.
 * Chấm công bổ sung đã duyệt được ghi thẳng vào ChamCong ở màn duyệt (UC12.1),
 * nên chỉ cần đọc ChamCong.
 */
async function loadPeriodShifts(startISO, endISO) {
  const result = await query(
    `SELECT llv.MaLich,
            llv.MaNV,
            nv.HoTen,
            nv.MucLuong,
            nv.TinhTrang,
            CONVERT(char(10), nv.NgayVaoLam, 23) AS NgayVaoLamISO,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.GioBatDau,
            cc.GioVao,
            cc.GioRa,
            CASE WHEN EXISTS (
                SELECT 1
                  FROM CT_XinNghi ct
                  JOIN DonXinNghi xn ON xn.MaXN = ct.MaXN
                 WHERE ct.MaLich = llv.MaLich
                   AND xn.TrangThai = N'Đã duyệt'
            ) THEN 1 ELSE 0 END AS CoDonNghi
       FROM LichLamViec llv
       JOIN NhanVien nv ON nv.MaNV = llv.MaNV
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       OUTER APPLY (
           SELECT TOP 1 GioVao, GioRa
             FROM ChamCong
            WHERE MaLich = llv.MaLich
            ORDER BY MaCC DESC
       ) cc
      WHERE llv.NgayLam >= CONVERT(date, @start, 23)
        AND llv.NgayLam <= CONVERT(date, @end, 23)
      ORDER BY llv.NgayLam, ca.GioBatDau, llv.MaNV`,
    {
      start: { type: sql.VarChar(10), value: startISO },
      end: { type: sql.VarChar(10), value: endISO },
    },
  );

  return result.recordset.map((row) => ({
    maLich: String(row.MaLich).trim(),
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
    mucLuong: Number(row.MucLuong),
    tinhTrang: String(row.TinhTrang || '').trim(),
    ngayVaoLam: row.NgayVaoLamISO,
    ngayISO: row.NgayISO,
    gioBatDau: dt.toHM(row.GioBatDau),
    gioVao: dt.toHM(row.GioVao),
    gioRa: dt.toHM(row.GioRa),
    coDonNghi: Boolean(row.CoDonNghi),
  }));
}

/** Khoản ứng đã duyệt, chưa gắn vào phiếu lương nào, gửi trong kỳ. */
async function loadApprovedAdvances(startISO, nextStartISO) {
  const result = await query(
    `SELECT MaUL, MaNV, SoTien
       FROM UngLuong
      WHERE TrangThai = N'Đã duyệt'
        AND MaPL IS NULL
        AND NgayGui >= CONVERT(date, @start, 23)
        AND NgayGui < CONVERT(date, @nextStart, 23)
      ORDER BY NgayGui, MaUL`,
    {
      start: { type: sql.VarChar(10), value: startISO },
      nextStart: { type: sql.VarChar(10), value: nextStartISO },
    },
  );

  return result.recordset.map((row) => ({
    maUL: String(row.MaUL).trim(),
    maNV: String(row.MaNV).trim(),
    soTien: Number(row.SoTien),
  }));
}

/** Số thứ tự lớn nhất của một bảng mã (PL00001, CTL00001…). */
async function maxSequence(table, column, prefix) {
  const result = await query(
    `SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(${column}, ${prefix.length + 1}, 10) AS INT)), 0) AS maxSo
       FROM ${table}
      WHERE ${column} LIKE @pattern`,
    { pattern: { type: sql.VarChar(20), value: `${prefix}%` } },
  );
  return Number(result.recordset[0]?.maxSo || 0);
}

/* -------------------------------------------------------------------------- */
/* Ghi dữ liệu                                                                 */
/* -------------------------------------------------------------------------- */

/** Chèn nhiều dòng bằng một câu lệnh (chia lô để không vượt giới hạn tham số). */
async function insertRows(tx, table, columns, rows, chunkSize = 100) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const request = txRequest(tx);
    const tuples = chunk.map((row, rowIndex) => {
      const names = columns.map((column, columnIndex) => {
        const name = `p${rowIndex}_${columnIndex}`;
        request.input(name, row[column]);
        return `@${name}`;
      });
      return `(${names.join(', ')})`;
    });

    await request.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
    );
  }
}

/**
 * Sinh bảng lương của một kỳ.
 *
 * @param {Object} input
 * @param {number} input.year
 * @param {number} input.month
 * @param {string} [input.today] Ngày hiện tại dạng ISO (dùng cho kiểm thử)
 * @returns {Promise<{created:boolean, reason:string, maBL:string,
 *                    year:number, month:number, soPhieu?:number,
 *                    soDong?:number, soUng?:number, period?:Object}>}
 */
async function generateMonthlyPayroll({ year, month, today = dt.todayISO() } = {}) {
  const meta = periodMeta(year, month);

  // BR-UC13.1-01: chỉ tổng hợp sau khi kết ca ngày cuối tháng.
  if (meta.endISO >= dt.toISODate(today)) {
    return { created: false, reason: RESULT.NOT_ENDED, ...meta };
  }

  if (await periodExists(meta)) {
    return { created: false, reason: RESULT.EXISTS, ...meta };
  }

  const shifts = await loadPeriodShifts(meta.startISO, meta.endISO);
  if (shifts.length === 0) {
    return { created: false, reason: RESULT.EMPTY, ...meta };
  }

  const advances = await loadApprovedAdvances(meta.startISO, meta.nextStartISO);

  let plSequence = await maxSequence('PhieuLuong', 'MaPL', 'PL');
  let ctlSequence = await maxSequence('ChiTietLuong', 'MaCTL', 'CTL');
  const nextMaPL = () => `PL${String((plSequence += 1)).padStart(5, '0')}`;
  const nextMaCTL = () => `CTL${String((ctlSequence += 1)).padStart(5, '0')}`;

  const built = buildPeriodPayroll({
    maBL: meta.maBL,
    shifts,
    advances,
    nextMaPL,
    nextMaCTL,
  });

  const outcome = await withTransaction(async (tx) => {
    // Khóa kỳ lại để hai lượt chạy không sinh trùng.
    const duplicate = await txRequest(tx)
      .input('maBL', sql.Char(10), meta.maBL)
      .input('year', sql.Int, meta.year)
      .input('month', sql.Int, meta.month)
      .query(
        `SELECT TOP 1 MaBL
           FROM BangLuong WITH (UPDLOCK, HOLDLOCK)
          WHERE MaBL = @maBL OR (Nam = @year AND Thang = @month)`,
      );

    if (duplicate.recordset.length) return RESULT.EXISTS;

    await txRequest(tx)
      .input('maBL', sql.Char(10), meta.maBL)
      .input('thang', sql.Int, meta.month)
      .input('nam', sql.Int, meta.year)
      .input('start', sql.VarChar(10), meta.startISO)
      .input('end', sql.VarChar(10), meta.endISO)
      .input('pay', sql.VarChar(10), meta.payISO)
      .input('status', sql.NVarChar(20), STATUS_PENDING)
      .query(
        `INSERT INTO BangLuong
           (MaBL, Thang, Nam, NgayBatDau, NgayKetThuc, NgayChiTra, TinhTrang)
         VALUES
           (@maBL, @thang, @nam,
            CONVERT(date, @start, 23),
            CONVERT(date, @end, 23),
            CONVERT(date, @pay, 23),
            @status)`,
      );

    await insertRows(
      tx,
      'PhieuLuong',
      [
        'MaPL',
        'TongGioLam',
        'LuongTheoGioLam',
        'TienPhat',
        'TienUngLuong',
        'ChenhLechKetChuyen',
        'MaBL',
        'MaND',
      ],
      built.payslips,
    );

    await insertRows(
      tx,
      'ChiTietLuong',
      ['MaCTL', 'SoGioLam', 'HeSoNgay', 'MucLuong', 'PhatDiTre', 'PhatBoCa', 'MaLich', 'MaPL'],
      built.details,
    );

    for (const link of built.advanceLinks) {
      await txRequest(tx)
        .input('maUL', sql.Char(10), link.maUL)
        .input('maPL', sql.Char(10), link.maPL)
        .query(
          `UPDATE UngLuong
              SET MaPL = @maPL
            WHERE MaUL = @maUL
              AND MaPL IS NULL`,
        );
    }

    return RESULT.CREATED;
  });

  if (outcome !== RESULT.CREATED) {
    return { created: false, reason: RESULT.EXISTS, ...meta };
  }

  return {
    created: true,
    reason: RESULT.CREATED,
    ...meta,
    soPhieu: built.payslips.length,
    soDong: built.details.length,
    soUng: built.advanceLinks.length,
  };
}

/**
 * Kiểm tra và sinh bảng lương cho tháng liền trước (job định kỳ).
 * Bỏ qua nếu kỳ đã có, tháng chưa kết thúc hoặc không có ca nào.
 *
 * @param {{today?: string}} [options]
 */
async function runMonthlyPayrollCheck({ today = dt.todayISO() } = {}) {
  if (running) return { created: false, reason: RESULT.RUNNING };

  running = true;
  try {
    const target = previousMonth(today);
    const result = await generateMonthlyPayroll({ ...target, today });
    return { ...result, target };
  } finally {
    running = false;
  }
}

module.exports = {
  RESULT,
  periodMeta,
  previousMonth,
  buildPeriodPayroll,
  generateMonthlyPayroll,
  runMonthlyPayrollCheck,
};
