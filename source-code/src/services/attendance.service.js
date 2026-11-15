'use strict';

/**
 * Nghiệp vụ chấm công: Chấm công (UC02) và Check out (UC03).
 *
 * Cả hai dùng CHUNG hàm kiểm tra Wi-Fi `assertCafeWifi` (quyết định C10).
 */

const { query, sql } = require('../config/db');
const { badRequest, conflict } = require('../utils/http-error');
const { assertCafeWifi } = require('../middleware/wifi');
const dt = require('../utils/datetime');
const { nextMaCC } = require('../utils/id');

const MSG_CHECKIN_OK = 'Chấm công thành công!';
const MSG_CHECKOUT_OK = 'Check out thành công!';
const MSG_NO_SHIFT = 'Hôm nay bạn không có ca làm việc nào.';
const MSG_ALREADY_IN = 'Bạn đã chấm công ca này rồi.';
const MSG_NOT_CHECKED_IN = 'Bạn chưa chấm công vào ca nào hôm nay.';
const MSG_ALREADY_OUT = 'Bạn đã check out rồi.';

/**
 * Lấy các ca làm việc của một nhân viên trong một ngày, kèm dữ liệu chấm công.
 * @param {string} maNV
 * @param {string} ngayISO 'YYYY-MM-DD'
 */
async function getShiftsOfDay(maNV, ngayISO) {
  const result = await query(
    `SELECT llv.MaLich,
            llv.NgayLam,
            llv.MaCa,
            ca.TenCa,
            ca.GioBatDau,
            ca.GioKetThuc,
            cc.MaCC,
            cc.GioVao,
            cc.GioRa
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       LEFT JOIN ChamCong cc ON cc.MaLich = llv.MaLich
      WHERE llv.MaNV = @maNV
        AND llv.NgayLam = @ngay
      ORDER BY ca.GioBatDau`,
    {
      maNV: { type: sql.Char(10), value: maNV },
      ngay: { type: sql.VarChar(10), value: ngayISO },
    },
  );

  return result.recordset.map((row) => ({
    maLich: String(row.MaLich).trim(),
    ngayLam: dt.toISODate(row.NgayLam),
    maCa: String(row.MaCa).trim(),
    tenCa: row.TenCa,
    gioBatDau: dt.toHM(row.GioBatDau),
    gioKetThuc: dt.toHM(row.GioKetThuc),
    maCC: row.MaCC ? String(row.MaCC).trim() : null,
    gioVao: dt.toHM(row.GioVao),
    gioRa: dt.toHM(row.GioRa),
  }));
}

/**
 * Lịch làm việc của một nhân viên trong tuần.
 * @param {string} maNV
 * @param {string} weekStartISO Thứ Hai của tuần
 */
async function getWeekSchedule(maNV, weekStartISO) {
  const days = dt.weekDaysISO(weekStartISO);
  const start = days[0];
  const end = days[6];

  const result = await query(
    `SELECT llv.NgayLam,
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
      start: { type: sql.VarChar(10), value: start },
      end: { type: sql.VarChar(10), value: end },
    },
  );

  const byDate = new Map();
  for (const row of result.recordset) {
    const iso = dt.toISODate(row.NgayLam);
    if (!byDate.has(iso)) byDate.set(iso, []);
    byDate.get(iso).push({
      tenCa: row.TenCa,
      gioBatDau: dt.toHM(row.GioBatDau),
      gioKetThuc: dt.toHM(row.GioKetThuc),
    });
  }

  return days.map((iso) => ({
    iso,
    label: dt.weekdayShortVN(iso),
    dateVN: dt.formatDayMonthVN(iso),
    isToday: iso === dt.todayISO(),
    shifts: byDate.get(iso) || [],
  }));
}

/**
 * Bối cảnh chấm công hôm nay để render trang chủ nhân viên.
 * @param {string} maNV
 */
async function getTodayContext(maNV) {
  const today = dt.todayISO();
  const shifts = await getShiftsOfDay(maNV, today);
  const week = await getWeekSchedule(maNV, today);

  const current = shifts[0] || null;
  const canCheckIn = shifts.some((s) => !s.gioVao);
  const canCheckOut = shifts.some((s) => s.gioVao && !s.gioRa);

  return {
    today,
    todayLong: dt.formatDateLongVN(today),
    shifts,
    current,
    week,
    canCheckIn,
    canCheckOut,
  };
}

/**
 * Chấm công vào ca (UC02).
 * @param {string} maNV
 * @param {import('express').Request} req  cần cho kiểm tra Wi-Fi
 * @returns {Promise<string>} thông báo thành công
 */
async function checkIn(maNV, req) {
  assertCafeWifi(req); // BR-UC2-01

  const today = dt.todayISO();
  const shifts = await getShiftsOfDay(maNV, today);

  if (shifts.length === 0) throw badRequest(MSG_NO_SHIFT);

  const target = shifts.find((s) => !s.gioVao);
  if (!target) throw conflict(MSG_ALREADY_IN);

  const maCC = await nextMaCC();
  await query(
    `INSERT INTO ChamCong (MaCC, MaLich, GioVao, GioRa)
     VALUES (@maCC, @maLich, @gioVao, NULL)`,
    {
      maCC: { type: sql.Char(10), value: maCC },
      maLich: { type: sql.Char(10), value: target.maLich },
      gioVao: { type: sql.VarChar(8), value: dt.nowTime() },
    },
  );

  return MSG_CHECKIN_OK;
}

/**
 * Check out (UC03).
 * @param {string} maNV
 * @param {import('express').Request} req
 * @returns {Promise<string>} thông báo thành công
 */
async function checkOut(maNV, req) {
  assertCafeWifi(req); // BR-UC3-01

  const today = dt.todayISO();
  const shifts = await getShiftsOfDay(maNV, today);

  const open = shifts.find((s) => s.gioVao && !s.gioRa);
  if (!open) {
    const anyCheckedIn = shifts.some((s) => s.gioVao);
    throw badRequest(anyCheckedIn ? MSG_ALREADY_OUT : MSG_NOT_CHECKED_IN);
  }

  await query(
    `UPDATE ChamCong
        SET GioRa = @gioRa
      WHERE MaCC = @maCC`,
    {
      maCC: { type: sql.Char(10), value: open.maCC },
      gioRa: { type: sql.VarChar(8), value: dt.nowTime() },
    },
  );

  return MSG_CHECKOUT_OK;
}

module.exports = {
  MSG_CHECKIN_OK,
  MSG_CHECKOUT_OK,
  MSG_NO_SHIFT,
  MSG_ALREADY_IN,
  MSG_NOT_CHECKED_IN,
  MSG_ALREADY_OUT,
  getShiftsOfDay,
  getWeekSchedule,
  getTodayContext,
  checkIn,
  checkOut,
};
