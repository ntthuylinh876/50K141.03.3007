'use strict';

/**
 * Nghiệp vụ quản lý ca làm của Quản lý / Chủ quán:
 *  - M3: Cập nhật ca làm (7.2.2.5 – 7.2.2.10)
 *  - M4: Xem danh sách ca làm (7.2.2.11 – 7.2.2.14)
 *
 * Mỗi dòng LichLamViec là MỘT nhân viên trong MỘT ca, nên "ca làm" của một ngày
 * được nhận diện bằng cặp (NgayLam, MaCa). Trang cập nhật hiển thị mỗi ca một
 * dòng và gộp tên các nhân viên được phân công.
 */

const { query, sql, withTransaction, txRequest } = require('../config/db');
const { badRequest, notFound } = require('../utils/http-error');
const dt = require('../utils/datetime');
const { nextMaLich } = require('../utils/id');

const MSG_UPDATE_OK = 'Cập nhật ca làm thành công!';
const MSG_SHIFT_PAST = 'Không thể cập nhật ca đã diễn ra';
const MSG_NO_SCHEDULE = 'Chưa có lịch làm việc cho thời gian này!';
const MSG_APPLY_OK = 'Đã áp dụng đăng ký ca làm!';
const MSG_APPLY_EMPTY = 'Vui lòng chọn nhân viên đăng ký để áp dụng.';
const MSG_APPLY_NONE = 'Không còn đăng ký nào cần áp dụng cho ca này.';

/** Khoảng ngày hiển thị của một tuần: "09/11 – 15/11/2026". */
function weekRangeLabel(weekStartISO) {
  const start = dt.toISODate(weekStartISO);
  if (!start) return '';
  const end = dt.addDaysISO(start, 6);
  const [, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  return `${sd}/${sm} – ${ed}/${em}/${ey}`;
}

/** Danh sách các tuần quanh hôm nay để chọn nhanh. */
function buildWeekOptions(selectedWeekStart, weeksBack = 12, weeksForward = 12) {
  const today = dt.todayISO();
  const currentStart = dt.startOfWeekISO(today);
  const selected = dt.startOfWeekISO(selectedWeekStart || today);
  const options = [];

  for (let i = -weeksBack; i <= weeksForward; i += 1) {
    const start = dt.addDaysISO(currentStart, i * 7);
    options.push({
      weekStart: start,
      label: weekRangeLabel(start),
      isSelected: start === selected,
      isCurrent: start === currentStart,
    });
  }

  if (!options.some((item) => item.isSelected)) {
    options.push({
      weekStart: selected,
      label: weekRangeLabel(selected),
      isSelected: true,
      isCurrent: selected === currentStart,
    });
    options.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  }

  return options;
}

/**
 * Các dòng ca làm trong khoảng ngày, gộp nhân viên theo (ngày, ca).
 * @param {string} fromISO
 * @param {string} toISO
 * @param {string} [maCa]
 */
async function getShiftRows(fromISO, toISO, maCa) {
  const params = {
    from: { type: sql.VarChar(10), value: fromISO },
    to: { type: sql.VarChar(10), value: toISO },
  };
  if (maCa) params.maCa = { type: sql.Char(10), value: maCa };

  const result = await query(
    `SELECT llv.MaLich,
            CONVERT(char(10), llv.NgayLam, 23) AS NgayISO,
            ca.MaCa, ca.TenCa, ca.GioBatDau, ca.GioKetThuc,
            nv.MaNV, nv.HoTen
       FROM LichLamViec llv
       JOIN CaLam ca ON ca.MaCa = llv.MaCa
       JOIN NhanVien nv ON nv.MaNV = llv.MaNV
      WHERE llv.NgayLam BETWEEN @from AND @to
        ${maCa ? 'AND llv.MaCa = @maCa' : ''}
      ORDER BY llv.NgayLam, ca.GioBatDau, nv.HoTen`,
    params,
  );

  const rows = [];
  const index = new Map();

  for (const row of result.recordset) {
    const ngayISO = row.NgayISO;
    const maCaValue = String(row.MaCa).trim();
    const key = `${ngayISO}|${maCaValue}`;

    if (!index.has(key)) {
      const item = {
        key,
        ngayISO,
        ngayLabel: dt.formatDateLongVN(ngayISO),
        ngayShort: dt.formatDateVN(ngayISO),
        maCa: maCaValue,
        tenCa: row.TenCa,
        gioBatDau: dt.toHM(row.GioBatDau),
        gioKetThuc: dt.toHM(row.GioKetThuc),
        khungGio: `${dt.toHM(row.GioBatDau)}–${dt.toHM(row.GioKetThuc)}`,
        nhanViens: [],
      };
      index.set(key, item);
      rows.push(item);
    }

    index.get(key).nhanViens.push({
      maNV: String(row.MaNV).trim(),
      hoTen: row.HoTen,
    });
  }

  for (const row of rows) {
    row.tenNhanVien = row.nhanViens.map((nv) => nv.hoTen).join(', ');
    row.soNhanVien = row.nhanViens.length;
  }

  return rows;
}

/** Nhóm các dòng ca làm theo ngày để màn Xem danh sách hiển thị từng bảng. */
function groupByDay(rows) {
  const days = [];
  const index = new Map();

  for (const row of rows) {
    if (!index.has(row.ngayISO)) {
      const item = {
        ngayISO: row.ngayISO,
        ngayLabel: dt.formatDateLongVN(row.ngayISO),
        ngayShort: dt.formatDateVN(row.ngayISO),
        rows: [],
      };
      index.set(row.ngayISO, item);
      days.push(item);
    }
    index.get(row.ngayISO).rows.push(row);
  }

  return days;
}

/** Dữ liệu màn hình Cập nhật ca làm (M3 — danh sách tuần). */
async function getUpdateContext(weekStartISO) {
  const today = dt.todayISO();
  const weekStart = dt.startOfWeekISO(weekStartISO || today);
  const weekEnd = dt.addDaysISO(weekStart, 6);

  const rows = await getShiftRows(weekStart, weekEnd);

  return {
    weekStart,
    weekEnd,
    weekLabel: weekRangeLabel(weekStart),
    weekOptions: buildWeekOptions(weekStart),
    rows,
    isEmpty: rows.length === 0,
  };
}

/** Ca làm đã diễn ra chưa (theo ngày và giờ kết thúc). */
function isShiftPast(ngayISO, gioKetThuc) {
  const today = dt.todayISO();
  if (ngayISO < today) return true;
  if (ngayISO > today) return false;
  return dt.hmToMinutes(gioKetThuc) <= dt.hmToMinutes(dt.nowHM());
}

/** Dữ liệu màn hình Chỉnh sửa nhân viên trong ca (M3). */
async function getShiftEditor(maCa, ngayISO) {
  const maCaValue = String(maCa || '').trim();
  const ngay = dt.toISODate(ngayISO);

  const shiftResult = await query(
    `SELECT ca.MaCa, ca.TenCa, ca.GioBatDau, ca.GioKetThuc
       FROM CaLam ca
      WHERE ca.MaCa = @maCa`,
    { maCa: { type: sql.Char(10), value: maCaValue } },
  );

  const shift = shiftResult.recordset[0];
  if (!shift) throw notFound('Không tìm thấy ca làm.');

  const inShiftResult = await query(
    `SELECT llv.MaLich, nv.MaNV, nv.HoTen
       FROM LichLamViec llv
       JOIN NhanVien nv ON nv.MaNV = llv.MaNV
      WHERE llv.NgayLam = @ngay AND llv.MaCa = @maCa
      ORDER BY nv.HoTen`,
    {
      ngay: { type: sql.VarChar(10), value: ngay },
      maCa: { type: sql.Char(10), value: maCaValue },
    },
  );

  const inShift = inShiftResult.recordset.map((row) => ({
    maNV: String(row.MaNV).trim(),
    hoTen: row.HoTen,
  }));

  const selectedIds = inShift.map((row) => row.maNV);
  const notInShiftResult = await query(
    `SELECT MaNV, HoTen
       FROM NhanVien
      WHERE TinhTrang <> N'Đã nghỉ'
        AND MaNV NOT IN (${selectedIds.length ? selectedIds.map((_, i) => `@nv${i}`).join(', ') : "''"})
      ORDER BY HoTen`,
    Object.fromEntries(selectedIds.map((id, i) => [`nv${i}`, { type: sql.Char(10), value: id }])),
  );

  const gioBatDau = dt.toHM(shift.GioBatDau);
  const gioKetThuc = dt.toHM(shift.GioKetThuc);

  // Đăng ký ca của nhân viên (UC05) cho đúng ca + ngày này, trừ người đã có
  // trong lịch chính thức. LichRanh lưu danh sách ngày ISO ngăn cách bởi dấu phẩy.
  const registeredResult = await query(
    `SELECT dk.MaDK, dk.MaNV, nv.HoTen
       FROM DangKyCaLam dk
       JOIN NhanVien nv ON nv.MaNV = dk.MaNV
      WHERE dk.MaCa = @maCa
        AND dk.LichRanh LIKE '%' + @ngay + '%'
        AND nv.TinhTrang <> N'Đã nghỉ'
      ORDER BY nv.HoTen`,
    {
      maCa: { type: sql.Char(10), value: maCaValue },
      ngay: { type: sql.VarChar(10), value: ngay },
    },
  );

  const registered = registeredResult.recordset
    .map((row) => ({
      maNV: String(row.MaNV).trim(),
      hoTen: row.HoTen,
    }))
    .filter((row) => !selectedIds.includes(row.maNV));

  return {
    maCa: maCaValue,
    ngayISO: ngay,
    ngayLabel: dt.formatDateLongVN(ngay),
    tenCa: shift.TenCa,
    gioBatDau,
    gioKetThuc,
    khungGio: `${gioBatDau}–${gioKetThuc}`,
    isPast: isShiftPast(ngay, gioKetThuc),
    inShift,
    notInShift: notInShiftResult.recordset.map((row) => ({
      maNV: String(row.MaNV).trim(),
      hoTen: row.HoTen,
    })),
    registered,
    hasRegistered: registered.length > 0,
  };
}

/**
 * Lưu danh sách nhân viên của một ca (M3).
 * @param {string} maCa
 * @param {string} ngayISO
 * @param {string[]} maNVs Danh sách nhân viên cuối cùng
 */
async function saveShift(maCa, ngayISO, maNVs) {
  const context = await getShiftEditor(maCa, ngayISO);
  if (context.isPast) throw badRequest(MSG_SHIFT_PAST);

  const desired = [...new Set((maNVs || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const current = context.inShift.map((row) => row.maNV);
  const toRemove = current.filter((id) => !desired.includes(id));
  const toAdd = desired.filter((id) => !current.includes(id));

  if (toRemove.length || toAdd.length) {
    await withTransaction(async (tx) => {
      if (toRemove.length) {
        const request = txRequest(tx);
        toRemove.forEach((id, i) => request.input(`nv${i}`, sql.Char(10), id));
        await request
          .input('ngay', sql.VarChar(10), context.ngayISO)
          .input('maCa', sql.Char(10), context.maCa)
          .query(
            `DELETE FROM LichLamViec
              WHERE NgayLam = @ngay AND MaCa = @maCa
                AND MaNV IN (${toRemove.map((_, i) => `@nv${i}`).join(', ')})`,
          );
      }

      for (const maNV of toAdd) {
        const maLich = await nextMaLich();
        await txRequest(tx)
          .input('maLich', sql.Char(10), maLich)
          .input('ngay', sql.VarChar(10), context.ngayISO)
          .input('maCa', sql.Char(10), context.maCa)
          .input('maNV', sql.Char(10), maNV)
          .query(
            `INSERT INTO LichLamViec (MaLich, NgayLam, MaCa, MaNV)
             VALUES (@maLich, @ngay, @maCa, @maNV)`,
          );
      }
    });
  }

  return MSG_UPDATE_OK;
}

/**
 * Áp dụng đăng ký ca (UC05) vào lịch làm việc chính thức (M3).
 * Chỉ thêm nhân viên còn đăng ký cho đúng ca + ngày, không gỡ người đã xếp.
 *
 * @param {string} maCa
 * @param {string} ngayISO
 * @param {string[]} maNVs nhân viên đăng ký được chọn
 * @returns {Promise<string>} thông báo thành công
 */
async function applyRegistrations(maCa, ngayISO, maNVs) {
  const context = await getShiftEditor(maCa, ngayISO);
  if (context.isPast) throw badRequest(MSG_SHIFT_PAST);

  const selected = [...new Set((maNVs || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (selected.length === 0) throw badRequest(MSG_APPLY_EMPTY);

  const allowed = new Set(context.registered.map((row) => row.maNV));
  const toAdd = selected.filter((id) => allowed.has(id));
  if (toAdd.length === 0) throw badRequest(MSG_APPLY_NONE);

  const finalIds = context.inShift.map((row) => row.maNV).concat(toAdd);
  await saveShift(maCa, ngayISO, finalIds);

  return MSG_APPLY_OK;
}

/** Dữ liệu màn hình Xem danh sách ca làm (M4). */
async function getListContext({ mode, date, weekStart, maCa }) {
  const today = dt.todayISO();
  const viewMode = mode === 'tuan' ? 'tuan' : 'ngay';
  const selectedDate = dt.toISODate(date) || today;
  const selectedWeek = dt.startOfWeekISO(weekStart || selectedDate);

  const from = viewMode === 'ngay' ? selectedDate : selectedWeek;
  const to = viewMode === 'ngay' ? selectedDate : dt.addDaysISO(selectedWeek, 6);

  const [rows, shiftsResult] = await Promise.all([
    getShiftRows(from, to, maCa),
    query('SELECT MaCa, TenCa, GioBatDau, GioKetThuc FROM CaLam ORDER BY GioBatDau'),
  ]);

  const shifts = shiftsResult.recordset.map((row) => ({
    maCa: String(row.MaCa).trim(),
    tenCa: row.TenCa,
    khungGio: `${dt.toHM(row.GioBatDau)}–${dt.toHM(row.GioKetThuc)}`,
    isSelected: maCa ? String(row.MaCa).trim() === String(maCa).trim() : false,
  }));

  return {
    mode: viewMode,
    selectedDate,
    selectedWeek,
    weekLabel: weekRangeLabel(selectedWeek),
    dayLabel: dt.formatDateLongVN(selectedDate),
    weekOptions: buildWeekOptions(selectedWeek),
    shifts,
    selectedMaCa: maCa || '',
    days: groupByDay(rows),
    isEmpty: rows.length === 0,
    emptyMessage: MSG_NO_SCHEDULE,
  };
}

/** Các tuần trong tháng của một ngày, dùng cho bộ chọn tuần. */
function buildWeeksOfMonth(dateISO) {
  const iso = dt.toISODate(dateISO) || dt.todayISO();
  const [year, month] = iso.split('-').map(Number);
  const range = dt.monthRangeISO(year, month);
  const weeks = [];
  let cursor = dt.startOfWeekISO(range.start);
  let index = 1;

  while (cursor <= range.end) {
    weeks.push({
      weekStart: cursor,
      index,
      label: weekRangeLabel(cursor),
      isSelected: false,
    });
    cursor = dt.addDaysISO(cursor, 7);
    index += 1;
  }

  return { year, month, weeks, label: `Tháng ${String(month).padStart(2, '0')} ${year}` };
}

module.exports = {
  MSG_UPDATE_OK,
  MSG_SHIFT_PAST,
  MSG_NO_SCHEDULE,
  MSG_APPLY_OK,
  MSG_APPLY_EMPTY,
  MSG_APPLY_NONE,
  weekRangeLabel,
  buildWeekOptions,
  buildWeeksOfMonth,
  getShiftRows,
  getUpdateContext,
  getShiftEditor,
  saveShift,
  applyRegistrations,
  getListContext,
  isShiftPast,
};
