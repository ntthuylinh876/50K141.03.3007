'use strict';

/**
 * Nghiệp vụ lịch làm việc:
 *  - Đăng ký ca làm (UC05): nhân viên gửi lịch rảnh / ca mong muốn cho tuần tới.
 *  - Xem lịch làm việc (UC07): lịch đã được phân công trong tuần.
 *
 * Quyết định đã chốt:
 *  C13 — DangKyCaLam.LichRanh lưu danh sách ngày ISO ngăn cách bởi dấu phẩy.
 *  C9  — Ngày lễ lấy từ config/holidays.json, dùng chung với quy tắc định biên
 *        "cuối tuần và ngày lễ: 2 nhân viên/ca" (BR-UC5-02).
 */

const { query, sql } = require('../config/db');
const { badRequest } = require('../utils/http-error');
const dt = require('../utils/datetime');
const { isHoliday } = require('../utils/payroll');
const { nextMaDK } = require('../utils/id');

const MSG_EMPTY_SELECTION = 'Vui lòng chọn ít nhất một ca làm!';
const MSG_FULL = 'Đã có đủ số lượng nhân viên cho ca này!';
const MSG_REGISTER_OK = 'Đăng ký ca làm thành công';
const MSG_NO_SHIFT_WEEK = 'Bạn chưa có ca làm việc nào trong tuần này';

/**
 * Định biên của một ca trong một ngày (BR-UC5-02).
 * Cuối tuần hoặc ngày lễ: 2 nhân viên/ca, các ngày khác: 1 nhân viên/ca.
 */
function capacityOf(caLam, ngayISO) {
  const weekendOrHoliday = dt.isWeekend(ngayISO) || isHoliday(ngayISO);
  return weekendOrHoliday ? caLam.soNVCuoiTuan : caLam.soNVNgayThuong;
}

/** Danh sách 3 ca làm của quán, sắp theo giờ bắt đầu. */
async function getShifts() {
  const result = await query(
    `SELECT MaCa, TenCa, GioBatDau, GioKetThuc, SoNVNgayThuong, SoNVCuoiTuan
       FROM CaLam
      ORDER BY GioBatDau`,
  );

  return result.recordset.map((row) => ({
    maCa: String(row.MaCa).trim(),
    tenCa: row.TenCa,
    gioBatDau: dt.toHM(row.GioBatDau),
    gioKetThuc: dt.toHM(row.GioKetThuc),
    soNVNgayThuong: row.SoNVNgayThuong,
    soNVCuoiTuan: row.SoNVCuoiTuan,
  }));
}

/** Tuần đăng ký kế tiếp (thứ Hai của tuần sau). */
function nextWeekStart(todayISO) {
  return dt.addDaysISO(dt.startOfWeekISO(todayISO), 7);
}

/** Tiêu đề "02/11/2026 - 08/11/2026". */
function rangeLabel(startISO) {
  return `${dt.formatDateVN(startISO)} - ${dt.formatDateVN(dt.addDaysISO(startISO, 6))}`;
}

/**
 * Dữ liệu cho màn hình Đăng ký ca làm (UC05).
 * @param {string} maNV
 */
async function getRegisterContext(maNV) {
  const today = dt.todayISO();
  const weekStart = nextWeekStart(today);
  const days = dt.weekDaysISO(weekStart);
  const weekEnd = days[6];

  const shifts = await getShifts();

  // Số nhân viên khác đã đăng ký ca này trong tuần đăng ký (bước 4 của UC05).
  // Chỉ tính đơn đăng ký, không tính lịch đã được quản lý xếp — vì lịch chính
  // thức là kết quả của việc duyệt đơn, nếu tính cả hai sẽ trùng.
  const registered = await query(
    `SELECT LichRanh, MaCa, MaNV
       FROM DangKyCaLam
      WHERE NgayGui >= DATEADD(DAY, -60, GETDATE())`,
  );

  const counts = new Map();
  const bump = (key) => counts.set(key, (counts.get(key) || 0) + 1);

  for (const row of registered.recordset) {
    const maNVRow = String(row.MaNV).trim();
    const maCa = String(row.MaCa).trim();
    for (const date of String(row.LichRanh || '').split(',')) {
      const iso = date.trim();
      if (!iso) continue;
      if (iso < weekStart || iso > weekEnd) continue;
      // Đăng ký của chính mình không tính vào định biên (sẽ được ghi đè khi gửi lại).
      if (maNVRow === maNV) continue;
      bump(`${iso}|${maCa}`);
    }
  }

  // Ô đã đăng ký của chính nhân viên này (để hiển thị sẵn trạng thái đã chọn).
  const mine = new Set();
  for (const row of registered.recordset) {
    if (String(row.MaNV).trim() !== maNV) continue;
    const maCa = String(row.MaCa).trim();
    for (const date of String(row.LichRanh || '').split(',')) {
      const iso = date.trim();
      if (iso) mine.add(`${iso}|${maCa}`);
    }
  }

  const board = days.map((iso) => ({
    iso,
    label: `${dt.weekdayShortVN(iso)} - ${dt.formatDayMonthVN(iso)}`,
    isWeekend: dt.isWeekend(iso) || isHoliday(iso),
    cells: shifts.map((ca) => {
      const key = `${iso}|${ca.maCa}`;
      const used = counts.get(key) || 0;
      const capacity = capacityOf(ca, iso);
      return {
        key,
        maCa: ca.maCa,
        tenCa: ca.tenCa,
        gioBatDau: ca.gioBatDau,
        gioKetThuc: ca.gioKetThuc,
        selected: mine.has(key),
        full: used >= capacity,
        used,
        capacity,
      };
    }),
  }));

  return {
    weekStart,
    weekEnd,
    weekLabel: rangeLabel(weekStart),
    shifts,
    board,
    // Đếm số ca đã đăng ký để hiển thị gợi ý dưới tiêu đề.
    selectedCount: mine.size,
  };
}

/**
 * Lưu đăng ký ca làm (UC05).
 * Mỗi ca được lưu thành một dòng DangKyCaLam với LichRanh là danh sách ngày.
 *
 * @param {string} maNV
 * @param {string[]} slots  mảng khóa 'YYYY-MM-DD|CA01'
 * @returns {Promise<string>} thông báo thành công
 */
async function saveRegistration(maNV, slots) {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw badRequest(MSG_EMPTY_SELECTION, { slots: MSG_EMPTY_SELECTION });
  }

  const context = await getRegisterContext(maNV);
  const allowed = new Map();
  for (const day of context.board) {
    for (const cell of day.cells) allowed.set(cell.key, cell);
  }

  // Gom ngày theo ca, đồng thời kiểm tra định biên và dữ liệu gửi lên.
  const byShift = new Map();
  for (const raw of slots) {
    const key = String(raw || '').trim();
    const cell = allowed.get(key);
    if (!cell) throw badRequest(MSG_EMPTY_SELECTION, { slots: MSG_EMPTY_SELECTION });
    if (cell.full && !cell.selected) {
      throw badRequest(MSG_FULL, { slots: MSG_FULL });
    }
    const [iso] = key.split('|');
    if (!byShift.has(cell.maCa)) byShift.set(cell.maCa, new Set());
    byShift.get(cell.maCa).add(iso);
  }

  // Ghi đè đăng ký cũ của nhân viên cho các ca có trong lần gửi này.
  for (const [maCa, dates] of byShift) {
    await query(
      `DELETE FROM DangKyCaLam WHERE MaNV = @maNV AND MaCa = @maCa`,
      {
        maNV: { type: sql.Char(10), value: maNV },
        maCa: { type: sql.Char(10), value: maCa },
      },
    );

    const maDK = await nextMaDK();
    await query(
      `INSERT INTO DangKyCaLam (MaDK, LichRanh, NgayGui, MaNV, MaCa)
       VALUES (@maDK, @lichRanh, GETDATE(), @maNV, @maCa)`,
      {
        maDK: { type: sql.Char(10), value: maDK },
        lichRanh: { type: sql.NVarChar(200), value: [...dates].sort().join(',') },
        maNV: { type: sql.Char(10), value: maNV },
        maCa: { type: sql.Char(10), value: maCa },
      },
    );
  }

  return MSG_REGISTER_OK;
}

/**
 * Lịch làm việc đã phân công của nhân viên trong một tuần (UC07).
 * @param {string} maNV
 * @param {string} [weekStartISO] mặc định là tuần hiện tại
 */
async function getWeekSchedule(maNV, weekStartISO) {
  const weekStart = weekStartISO || dt.startOfWeekISO(dt.todayISO());
  const days = dt.weekDaysISO(weekStart);
  const weekEnd = days[6];

  const result = await query(
    `SELECT llv.MaLich,
            llv.MaCa,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.TenCa,
            ca.GioBatDau,
            ca.GioKetThuc
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE llv.MaNV = @maNV
        AND llv.NgayLam BETWEEN @start AND @end
      ORDER BY llv.NgayLam, ca.GioBatDau`,
    {
      maNV: { type: sql.Char(10), value: maNV },
      start: { type: sql.VarChar(10), value: weekStart },
      end: { type: sql.VarChar(10), value: weekEnd },
    },
  );

  const byDate = new Map();
  for (const row of result.recordset) {
    const iso = row.NgayISO;
    if (!byDate.has(iso)) byDate.set(iso, []);
    byDate.get(iso).push({
      maLich: String(row.MaLich).trim(),
      maCa: String(row.MaCa).trim(),
      tenCa: row.TenCa,
      gioBatDau: dt.toHM(row.GioBatDau),
      gioKetThuc: dt.toHM(row.GioKetThuc),
    });
  }

  const today = dt.todayISO();
  const list = days.map((iso) => ({
    iso,
    label: `${dt.weekdayShortVN(iso)} - ${dt.formatDayMonthVN(iso)}`,
    isToday: iso === today,
    shifts: byDate.get(iso) || [],
  }));

  return {
    weekStart,
    weekEnd,
    weekLabel: rangeLabel(weekStart),
    weekShort: `${dt.formatDayMonthVN(weekStart)}-${dt.formatDayMonthVN(weekEnd)}`,
    isCurrentWeek: weekStart === dt.startOfWeekISO(today),
    prevWeek: dt.addDaysISO(weekStart, -7),
    nextWeek: dt.addDaysISO(weekStart, 7),
    days: list,
    totalShifts: list.reduce((sum, day) => sum + day.shifts.length, 0),
  };
}

/**
 * Các ca sắp tới của nhân viên (dùng cho đơn xin nghỉ / đổi ca).
 * @param {string} maNV
 * @param {number} [daysAhead]
 */
async function getUpcomingShifts(maNV, daysAhead = 28) {
  const today = dt.todayISO();
  const end = dt.addDaysISO(today, daysAhead);

  const result = await query(
    `SELECT llv.MaLich,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            llv.MaCa,
            ca.TenCa,
            ca.GioBatDau,
            ca.GioKetThuc
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
      WHERE llv.MaNV = @maNV
        AND llv.NgayLam BETWEEN @start AND @end
      ORDER BY llv.NgayLam, ca.GioBatDau`,
    {
      maNV: { type: sql.Char(10), value: maNV },
      start: { type: sql.VarChar(10), value: today },
      end: { type: sql.VarChar(10), value: end },
    },
  );

  return result.recordset.map((row) => ({
    maLich: String(row.MaLich).trim(),
    ngayISO: row.NgayISO,
    maCa: String(row.MaCa).trim(),
    tenCa: row.TenCa,
    gioBatDau: dt.toHM(row.GioBatDau),
    gioKetThuc: dt.toHM(row.GioKetThuc),
    ngayLabel: dt.formatDateLongVN(row.NgayISO),
    label: `${dt.formatDateLongVN(row.NgayISO)} · ${row.TenCa} · ${dt.toHM(row.GioBatDau)} – ${dt.toHM(row.GioKetThuc)}`,
  }));
}

module.exports = {
  MSG_EMPTY_SELECTION,
  MSG_FULL,
  MSG_REGISTER_OK,
  MSG_NO_SHIFT_WEEK,
  capacityOf,
  getShifts,
  nextWeekStart,
  rangeLabel,
  getRegisterContext,
  saveRegistration,
  getWeekSchedule,
  getUpcomingShifts,
};
