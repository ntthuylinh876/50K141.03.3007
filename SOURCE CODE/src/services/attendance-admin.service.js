'use strict';

/**
 * Nghiệp vụ màn hình Dữ liệu chấm công của Quản lý (7.2.2.30 – 7.2.2.36).
 *
 * Bộ lọc gồm Thời gian (Ngày / Tuần), Nhân viên và Ca làm. Khi chọn một nhân
 * viên cụ thể, màn hình hiển thị thêm 3 thẻ tổng hợp (giờ làm, đi trễ, bỏ ca)
 * và bảng rút gọn Ngày – Giờ vào – Giờ ra.
 */

const { query, sql } = require('../config/db');
const dt = require('../utils/datetime');
const { buildWeeksOfMonth } = require('./admin-schedule.service');

const MSG_NO_DATA = 'Không có dữ liệu chấm công!';
const NGUONG_DI_TRE_PHUT = 10;

/** Giờ vào có bị tính là đi trễ không. */
function isLate(gioVao, gioBatDau) {
  if (!gioVao || !gioBatDau) return false;
  return dt.hmToMinutes(gioVao) - dt.hmToMinutes(gioBatDau) >= NGUONG_DI_TRE_PHUT;
}

/** Số giờ làm thực tế của một dòng (0 nếu thiếu giờ vào/ra). */
function hoursOf(gioVao, gioRa) {
  if (!gioVao || !gioRa) return 0;
  return dt.hoursBetween(gioVao, gioRa);
}

/** 12 tháng gần nhất để chọn nhanh. */
function buildMonthOptions(dateISO) {
  const iso = dt.toISODate(dateISO) || dt.todayISO();
  const [year, month] = iso.split('-').map(Number);
  const options = [];

  for (let i = -6; i <= 5; i += 1) {
    const d = new Date(year, month - 1 + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({
      value,
      label: `Tháng ${String(d.getMonth() + 1).padStart(2, '0')} ${d.getFullYear()}`,
      isSelected: value === `${iso.slice(0, 7)}`,
    });
  }

  return options;
}

/** Lịch tháng của ngày đang chọn (Thứ Hai là cột đầu). */
function buildCalendar(dateISO) {
  const iso = dt.toISODate(dateISO) || dt.todayISO();
  const [year, month] = iso.split('-').map(Number);
  const range = dt.monthRangeISO(year, month);
  const firstIdx = dt.weekdayIndex(range.start);
  const leading = firstIdx === 0 ? 6 : firstIdx - 1;

  const cells = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= range.days; day += 1) {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, value, isSelected: value === iso });
  }

  return {
    year,
    month,
    label: `Tháng ${String(month).padStart(2, '0')} ${year}`,
    cells,
    prevMonth: `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`,
    nextMonth: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`,
  };
}

/** Danh sách nhân viên và ca làm cho bộ lọc. */
async function getFilterOptions() {
  const [employees, shifts] = await Promise.all([
    query(`SELECT MaNV, HoTen FROM NhanVien WHERE TinhTrang <> N'Đã nghỉ' ORDER BY HoTen`),
    query(`SELECT MaCa, TenCa, GioBatDau, GioKetThuc FROM CaLam ORDER BY GioBatDau`),
  ]);

  return {
    employees: employees.recordset.map((row) => ({
      maNV: String(row.MaNV).trim(),
      hoTen: row.HoTen,
    })),
    shifts: shifts.recordset.map((row) => ({
      maCa: String(row.MaCa).trim(),
      tenCa: row.TenCa,
      khungGio: `${dt.toHM(row.GioBatDau)} - ${dt.toHM(row.GioKetThuc)}`,
      label: `${row.TenCa} (${dt.toHM(row.GioBatDau)} - ${dt.toHM(row.GioKetThuc)})`,
    })),
  };
}

/**
 * Dữ liệu màn hình Dữ liệu chấm công.
 * @param {{mode?: string, date?: string, weekStart?: string, maNV?: string, maCa?: string}} filters
 */
async function getAttendanceData(filters = {}) {
  const today = dt.todayISO();
  const mode = filters.mode === 'tuan' ? 'tuan' : 'ngay';
  const selectedDate = dt.toISODate(filters.date) || today;
  const selectedWeek = dt.startOfWeekISO(filters.weekStart || selectedDate);

  const from = mode === 'ngay' ? selectedDate : selectedWeek;
  const to = mode === 'ngay' ? selectedDate : dt.addDaysISO(selectedWeek, 6);

  const maNV = String(filters.maNV || '').trim();
  const maCa = String(filters.maCa || '').trim();

  const params = {
    from: { type: sql.VarChar(10), value: from },
    to: { type: sql.VarChar(10), value: to },
  };
  if (maNV) params.maNV = { type: sql.Char(10), value: maNV };
  if (maCa) params.maCa = { type: sql.Char(10), value: maCa };

  const [options, rowsResult] = await Promise.all([
    getFilterOptions(),
    query(
      `SELECT CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
              nv.MaNV, nv.HoTen,
              ca.MaCa, ca.TenCa, ca.GioBatDau, ca.GioKetThuc,
              cc.GioVao, cc.GioRa
         FROM LichLamViec llv
         JOIN NhanVien nv ON nv.MaNV = llv.MaNV
         JOIN CaLam ca ON ca.MaCa = llv.MaCa
         LEFT JOIN ChamCong cc ON cc.MaLich = llv.MaLich
        WHERE llv.NgayLam BETWEEN @from AND @to
          ${maNV ? 'AND llv.MaNV = @maNV' : ''}
          ${maCa ? 'AND llv.MaCa = @maCa' : ''}
        ORDER BY llv.NgayLam, ca.GioBatDau, nv.HoTen`,
      params,
    ),
  ]);

  const rows = rowsResult.recordset.map((row) => {
    const gioVao = dt.toHM(row.GioVao);
    const gioRa = dt.toHM(row.GioRa);
    const gioBatDau = dt.toHM(row.GioBatDau);
    const gioKetThuc = dt.toHM(row.GioKetThuc);
    return {
      ngayISO: row.NgayISO,
      ngay: dt.formatDateVN(row.NgayISO),
      maNV: String(row.MaNV).trim(),
      hoTen: row.HoTen,
      maCa: String(row.MaCa).trim(),
      tenCa: row.TenCa,
      khungGio: `${gioBatDau} - ${gioKetThuc}`,
      gioVao,
      gioRa,
      gioVaoLabel: gioVao || '-',
      gioRaLabel: gioRa || '-',
      isLate: isLate(gioVao, gioBatDau),
      isAbsent: !gioVao,
      soGio: hoursOf(gioVao, gioRa),
    };
  });

  const selectedEmployee = options.employees.find((item) => item.maNV === maNV) || null;
  const selectedShift = options.shifts.find((item) => item.maCa === maCa) || null;

  let summary = null;
  if (selectedEmployee) {
    summary = {
      tongGio: Math.round(rows.reduce((sum, row) => sum + row.soGio, 0) * 100) / 100,
      soCaTre: rows.filter((row) => row.isLate).length,
      soCaBo: rows.filter((row) => row.isAbsent).length,
    };
  }

  const month = buildCalendar(selectedDate);
  const weeks = buildWeeksOfMonth(selectedDate);
  weeks.weeks = weeks.weeks.map((item) => ({
    ...item,
    isSelected: item.weekStart === selectedWeek,
  }));

  return {
    mode,
    selectedDate,
    selectedWeek,
    selectedDateLabel: dt.formatDateVN(selectedDate),
    selectedWeekLabel: (() => {
      const start = selectedWeek;
      const end = dt.addDaysISO(start, 6);
      const [, sm, sd] = start.split('-');
      const [ey, em, ed] = end.split('-');
      return `${sd}/${sm} – ${ed}/${em}/${ey}`;
    })(),
    maNV,
    maCa,
    selectedEmployee,
    selectedShift,
    employees: options.employees,
    shifts: options.shifts,
    rows,
    summary,
    isEmpty: rows.length === 0,
    emptyMessage: MSG_NO_DATA,
    calendar: month,
    monthOptions: buildMonthOptions(selectedDate),
    weeks,
  };
}

module.exports = {
  MSG_NO_DATA,
  getAttendanceData,
  getFilterOptions,
  buildCalendar,
  buildMonthOptions,
};
