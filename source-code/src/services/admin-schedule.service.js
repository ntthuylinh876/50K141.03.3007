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
    maLich: String(row.MaLich).trim(),
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
  };
}

/**
 * Các bảng có khóa ngoại trỏ tới LichLamViec(MaLich).
 * Một dòng lịch đã được tham chiếu thì không được xóa/đổi nhân viên,
 * nếu không sẽ làm sai lệch dữ liệu chấm công, đơn từ và bảng lương.
 */
const SCHEDULE_REFERENCES = [
  { table: 'ChamCong', column: 'MaLich' },
  { table: 'CT_XinNghi', column: 'MaLich' },
  { table: 'DonDoiCa', column: 'MaLichGoc' },
  { table: 'DonDoiCa', column: 'MaLichMuonDoi' },
  { table: 'DonLamThay', column: 'MaLich' },
  { table: 'ChamCongBoSung', column: 'MaLich' },
  { table: 'ChiTietLuong', column: 'MaLich' },
];

/** Thông báo nghiệp vụ khi ca đã phát sinh dữ liệu liên quan. */
function msgScheduleLocked(ngayISO) {
  return `Ca ngày ${dt.formatDayMonthVN(ngayISO)} đã có dữ liệu chấm công hoặc đơn, không thể xóa`;
}

/**
 * Tìm các MaLich đang được tham chiếu bởi ChamCong, CT_XinNghi, DonDoiCa,
 * DonLamThay, ChamCongBoSung, ChiTietLuong.
 * @param {object} tx transaction đang mở
 * @param {string[]} maLiches
 * @returns {Promise<Set<string>>}
 */
async function findReferencedSchedules(tx, maLiches) {
  if (!maLiches.length) return new Set();

  const request = txRequest(tx);
  maLiches.forEach((id, i) => request.input(`l${i}`, sql.Char(10), id));
  const list = maLiches.map((_, i) => `@l${i}`).join(', ');
  const unionSql = SCHEDULE_REFERENCES.map(
    ({ table, column }) => `SELECT ${column} AS MaLich FROM ${table} WHERE ${column} IN (${list})`,
  ).join(' UNION ');

  const result = await request.query(
    `SELECT DISTINCT refs.MaLich FROM (${unionSql}) AS refs`,
  );
  return new Set(result.recordset.map((row) => String(row.MaLich).trim()));
}

/**
 * Lưu danh sách nhân viên của một ca (M3).
 *
 * Không xóa toàn bộ rồi thêm lại: so sánh lịch cũ với lịch mới theo từng
 * (ngày, ca, nhân viên) để giữ nguyên MãLịch đang được các bảng khác tham chiếu.
 *  - Nhân viên không đổi: giữ nguyên dòng.
 *  - Nhân viên mới: dùng lại dòng trống (UPDATE) nếu có, còn lại INSERT.
 *  - Nhân viên bị gỡ: chỉ DELETE khi dòng chưa có tham chiếu; nếu đã có
 *    chấm công/đơn/lương thì báo lỗi nghiệp vụ và rollback toàn bộ.
 *
 * @param {string} maCa
 * @param {string} ngayISO
 * @param {string[]} maNVs Danh sách nhân viên cuối cùng
 */
async function saveShift(maCa, ngayISO, maNVs) {
  const context = await getShiftEditor(maCa, ngayISO);
  if (context.isPast) throw badRequest(MSG_SHIFT_PAST);

  const desired = [...new Set((maNVs || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const current = context.inShift.map((row) => row.maNV);
  const hasChanges =
    desired.some((id) => !current.includes(id)) || current.some((id) => !desired.includes(id));
  if (!hasChanges) return MSG_UPDATE_OK;

  await withTransaction(async (tx) => {
    // Share the same lock key as employee self-registration; it also covers empty slots.
    await txRequest(tx)
      .input('lockKey', sql.VarChar(64), `schedule:${context.ngayISO}:${context.maCa}`)
      .query('SELECT pg_advisory_xact_lock(hashtextextended(@lockKey, 0))');
    const freshResult = await txRequest(tx)
      .input('ngay', sql.VarChar(10), context.ngayISO)
      .input('maCa', sql.Char(10), context.maCa)
      .query(
        `SELECT MaLich, MaNV
           FROM LichLamViec
          WHERE NgayLam = @ngay AND MaCa = @maCa
          FOR UPDATE`,
      );

    const rows = freshResult.recordset.map((row) => ({
      maLich: String(row.MaLich).trim(),
      maNV: String(row.MaNV).trim(),
    }));
    const currentIds = rows.map((row) => row.maNV);
    const toAdd = desired.filter((id) => !currentIds.includes(id));
    const toRemove = rows.filter((row) => !desired.includes(row.maNV));
    if (!toAdd.length && !toRemove.length) return;

    // Chặn xóa/đổi nhân viên của ca đã có dữ liệu liên quan.
    const referenced = await findReferencedSchedules(
      tx,
      toRemove.map((row) => row.maLich),
    );
    if (referenced.size > 0) throw badRequest(msgScheduleLocked(context.ngayISO));

    // Dòng bị gỡ nhưng chưa có tham chiếu: tận dụng để đổi nhân viên (UPDATE).
    const freeRows = toRemove.slice();
    const insertIds = [];
    toAdd.forEach((maNV, i) => {
      if (freeRows[i]) freeRows[i].newMaNV = maNV;
      else insertIds.push(maNV);
    });

    for (const row of freeRows) {
      if (row.newMaNV) {
        await txRequest(tx)
          .input('maLich', sql.Char(10), row.maLich)
          .input('maNV', sql.Char(10), row.newMaNV)
          .query('UPDATE LichLamViec SET MaNV = @maNV WHERE MaLich = @maLich');
      } else {
        await txRequest(tx)
          .input('maLich', sql.Char(10), row.maLich)
          .query('DELETE FROM LichLamViec WHERE MaLich = @maLich');
      }
    }

    for (const maNV of insertIds) {
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

  return MSG_UPDATE_OK;
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
  weekRangeLabel,
  buildWeekOptions,
  buildWeeksOfMonth,
  getShiftRows,
  getUpdateContext,
  getShiftEditor,
  saveShift,
  getListContext,
  isShiftPast,
};
