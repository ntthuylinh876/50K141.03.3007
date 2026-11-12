'use strict';

/**
 * ============================================================================
 *  SEED DỮ LIỆU MẪU — Hệ thống chấm công & tính lương NICK & THE JUICE COFFEE
 * ============================================================================
 *
 *  Chạy:  npm run db:seed        (hoặc npm run db:setup để migrate + seed)
 *
 *  Nguyên tắc:
 *    - Dữ liệu nhân viên lấy ĐÚNG theo ảnh "Sửa thông tin nhân viên" trong doc/UI.
 *    - Mức lương lưu theo SRS BR-UC13.1-04: ĐƠN GIÁ GIỜ (đồng/giờ), không phải
 *      lương tháng (quyết định C6).
 *    - Lịch làm việc sinh cho 4 tháng (3 tháng đã qua + tháng hiện tại + 1 tuần
 *      tới) theo BR-UC5-02: ngày thường 1 NV/ca, cuối tuần & ngày lễ 2 NV/ca.
 *    - Bảng lương tính bằng chính hàm src/utils/payroll.js để bảo đảm số liệu
 *      trong CSDL khớp tuyệt đối với công thức của ứng dụng.
 *    - Script IDEMPOTENT: xóa sạch dữ liệu cũ rồi nạp lại, không đụng cấu trúc.
 */

const sql = require('mssql');
const { appConfig } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const dt = require('../src/utils/datetime');
const payroll = require('../src/utils/payroll');

/* -------------------------------------------------------------------------- */
/* Hằng số                                                                    */
/* -------------------------------------------------------------------------- */

/** Mật khẩu chung của 3 tài khoản demo. */
const DEMO_PASSWORD = '123456';

/** BR-UC5-01: quán có 3 ca làm. */
const CA_LAM = [
  { maCa: 'CA01', tenCa: 'Ca sáng', gioBatDau: '06:00:00', gioKetThuc: '12:00:00', soNVNgayThuong: 1, soNVCuoiTuan: 2 },
  { maCa: 'CA02', tenCa: 'Ca chiều', gioBatDau: '12:00:00', gioKetThuc: '18:00:00', soNVNgayThuong: 1, soNVCuoiTuan: 2 },
  { maCa: 'CA03', tenCa: 'Ca tối', gioBatDau: '18:00:00', gioKetThuc: '22:00:00', soNVNgayThuong: 1, soNVCuoiTuan: 2 },
];

const CA_BY_MA = new Map(CA_LAM.map((c) => [c.maCa, c]));

/** Tài khoản quản lý / chủ quán. QL002 là chủ quán. */
const QUAN_LY = [
  { maQL: 'QL001', hoTen: 'Nguyễn Minh Anh', soDienThoai: '0901234567' },
  { maQL: 'QL002', hoTen: 'Trần Chủ Quán', soDienThoai: '0909999999' },
];

const MA_QL = 'QL001'; // người duyệt mặc định trong dữ liệu mẫu

/**
 * 10 nhân viên — khớp ảnh doc/UI/Sửa thông tin nhân viên/Sửa thông tin nhân viên 1.png
 * MucLuong là ĐƠN GIÁ GIỜ theo BR-UC13.1-04 (23.000đ sau thử việc, 25.000đ quản lý).
 */
const NHAN_VIEN = [
  { maNV: 'NV001', hoTen: 'Nguyễn Minh Anh', soDienThoai: '0901234567', viTri: 'Quản lý', ngayVaoLam: '2023-08-12', tinhTrang: 'Chính thức', mucLuong: 25000, tenNganHang: 'VCB', soTaiKhoan: '1028882991' },
  { maNV: 'NV002', hoTen: 'Trần Quốc Việt', soDienThoai: '0908416225', viTri: 'Thu ngân', ngayVaoLam: '2024-01-05', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'MB', soTaiKhoan: '1180352644' },
  { maNV: 'NV003', hoTen: 'Lê Thúy Nga', soDienThoai: '0935920178', viTri: 'Pha chế', ngayVaoLam: '2024-03-18', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'TCB', soTaiKhoan: '1903886215' },
  { maNV: 'NV004', hoTen: 'Phạm Đình Huy', soDienThoai: '0977302441', viTri: 'Phục vụ', ngayVaoLam: '2025-11-02', tinhTrang: 'Thử việc', mucLuong: 23000, tenNganHang: 'ACB', soTaiKhoan: '2214008372' },
  { maNV: 'NV005', hoTen: 'Nguyễn Việt Đạt', soDienThoai: '0914673802', viTri: 'Pha chế', ngayVaoLam: '2024-09-21', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'VCB', soTaiKhoan: '1029119804' },
  { maNV: 'NV006', hoTen: 'Nguyễn Thị Thùy Linh', soDienThoai: '0914673803', viTri: 'Pha chế', ngayVaoLam: '2024-09-21', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'VCB', soTaiKhoan: '1029119803' },
  { maNV: 'NV007', hoTen: 'Phạm Thị Thùy', soDienThoai: '0914673804', viTri: 'Pha chế', ngayVaoLam: '2024-09-21', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'VCB', soTaiKhoan: '10291198047' },
  { maNV: 'NV008', hoTen: 'Lê Thuận Dũng', soDienThoai: '0914673805', viTri: 'Pha chế', ngayVaoLam: '2024-09-21', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'VCB', soTaiKhoan: '1029119805' },
  { maNV: 'NV009', hoTen: 'Nguyễn Hồng Sương', soDienThoai: '0914673806', viTri: 'Pha chế', ngayVaoLam: '2024-09-21', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'VCB', soTaiKhoan: '1029119806' },
  { maNV: 'NV010', hoTen: 'Huỳnh Thảo Uyên', soDienThoai: '0914673807', viTri: 'Pha chế', ngayVaoLam: '2024-09-21', tinhTrang: 'Chính thức', mucLuong: 23000, tenNganHang: 'VCB', soTaiKhoan: '1029119807' },
];

const EMP_BY_MA = new Map(NHAN_VIEN.map((e) => [e.maNV, e]));
const ALL_MA_NV = NHAN_VIEN.map((e) => e.maNV);

/** Nhân viên được gán ca hôm nay để tiện demo Chấm công / Check out. */
const DEMO_EMPLOYEE = 'NV005';

/**
 * Kế hoạch nghỉ phép ĐÃ DUYỆT (ảnh hưởng trực tiếp tới bảng lương:
 * ca nghỉ có phép không bị phạt 100.000đ — BR-UC13.1-07).
 * `monthOffset`: 0 = tháng hiện tại, -1 = tháng trước, …
 */
const LEAVE_PLAN = [
  { maNV: 'NV005', monthOffset: -3, count: 1, lyDo: 'Việc gia đình' },
  { maNV: 'NV003', monthOffset: -2, count: 1, lyDo: 'Khám bệnh định kỳ' },
  { maNV: 'NV006', monthOffset: -2, count: 2, lyDo: 'Về quê có việc' },
  { maNV: 'NV009', monthOffset: -1, count: 1, lyDo: 'Nghỉ phép cá nhân' },
  { maNV: 'NV010', monthOffset: -1, count: 1, lyDo: 'Dự đám cưới người thân' },
];

/**
 * Khoản ứng lương.
 *  - monthOffset: kỳ lương sẽ bị khấu trừ.
 *  - 'Đã duyệt' → gắn vào phiếu lương của kỳ đó (BR-UC9: tự động khấu trừ).
 *  - 'Chờ duyệt' → chưa gắn phiếu lương (MaPL = NULL).
 */
const UNG_LUONG = [
  { maNV: 'NV002', monthOffset: -3, soTien: 500000, lyDo: 'Ứng lương kỳ trước', trangThai: 'Đã duyệt' },
  { maNV: 'NV007', monthOffset: -2, soTien: 1000000, lyDo: 'Ứng lương', trangThai: 'Đã duyệt' },
  { maNV: 'NV008', monthOffset: -2, soTien: 500000, lyDo: 'Ứng lương', trangThai: 'Đã duyệt' },
  { maNV: 'NV005', monthOffset: -1, soTien: 1000000, lyDo: 'Ứng lương', trangThai: 'Chờ duyệt' },
  { maNV: 'NV010', monthOffset: -1, soTien: 2000000, lyDo: 'Ứng lương', trangThai: 'Chờ duyệt' },
];

/** Chênh lệch kết chuyển từ kỳ trước (BR-UC13.1-08). */
const CHENH_LECH = [
  { maNV: 'NV007', monthOffset: -2, soTien: 50000 },
  { maNV: 'NV006', monthOffset: -1, soTien: -20000 },
];

/** Trạng thái 3 kỳ lương mẫu. */
const BANG_LUONG_PLAN = [
  { monthOffset: -3, tinhTrang: 'Đã duyệt' },
  { monthOffset: -2, tinhTrang: 'Chờ chủ quán duyệt' },
  { monthOffset: -1, tinhTrang: 'Chưa duyệt' },
];

/* -------------------------------------------------------------------------- */
/* Tiện ích                                                                   */
/* -------------------------------------------------------------------------- */

const pad2 = (n) => String(n).padStart(2, '0');

/** Bộ sinh số giả ngẫu nhiên có hạt giống — chạy lại cho cùng kết quả. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates. */
function shuffle(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 'HH:mm:ss' + phút → 'HH:mm:ss'. */
function addMinutes(hms, delta) {
  const [h, m, s] = hms.split(':').map(Number);
  let total = h * 60 + m + delta;
  if (total < 0) total = 0;
  return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}:${pad2(s || 0)}`;
}

/** Cộng/trừ tháng. */
function shiftMonth({ year, month }, delta) {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

/** Bộ đếm mã theo tiền tố (chỉ dùng trong seed). */
const counters = new Map();
function nextId(prefix, digits) {
  const n = (counters.get(prefix) || 0) + 1;
  counters.set(prefix, n);
  return prefix + String(n).padStart(digits, '0');
}

/** Ngày giờ địa phương → Date. */
function localDate(isoDate, hour = 9, minute = 0) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

/* -------------------------------------------------------------------------- */
/* Kiểu dữ liệu tường minh cho các cột ngày/giờ                               */
/* -------------------------------------------------------------------------- */

/**
 * tedious yêu cầu cột DATE/DATETIME/TIME phải nhận đối tượng Date (chuỗi
 * 'HH:mm:ss' không được chấp nhận cho TIME). Vì vậy mọi giá trị ngày/giờ đều
 * được chuyển sang Date theo giờ ĐỊA PHƯƠNG — khớp với `useUTC: false` trong
 * src/config/db.js.
 */

function toDateValue(value) {
  if (value instanceof Date) return value;
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toDateTimeValue(value) {
  if (value instanceof Date) return value;
  return new Date(String(value).replace(' ', 'T'));
}

function toTimeValue(value) {
  if (value instanceof Date) return value;
  const [h, m, s] = String(value).split(':').map(Number);
  return new Date(1970, 0, 1, h, m, s || 0, 0);
}

const COLUMN_TYPES = {
  NgayLam: { type: sql.Date, cast: toDateValue },
  NgayBatDau: { type: sql.Date, cast: toDateValue },
  NgayKetThuc: { type: sql.Date, cast: toDateValue },
  NgayChiTra: { type: sql.Date, cast: toDateValue },
  NgayVaoLam: { type: sql.Date, cast: toDateValue },
  NgayGui: { type: sql.DateTime, cast: toDateTimeValue },
  GioBatDau: { type: sql.Time, cast: toTimeValue },
  GioKetThuc: { type: sql.Time, cast: toTimeValue },
  GioVao: { type: sql.Time, cast: toTimeValue },
  GioRa: { type: sql.Time, cast: toTimeValue },
  GioVaoThucTe: { type: sql.Time, cast: toTimeValue },
  GioRaThucTe: { type: sql.Time, cast: toTimeValue },
};

/**
 * Chèn nhiều dòng bằng một câu INSERT ... VALUES (...), (...) để giảm số lần
 * khứ hồi. Mọi giá trị đều truyền qua tham số hóa.
 */
async function insertRows(tx, table, columns, rows) {
  if (!rows.length) return;

  const maxParams = 1500;
  const chunkSize = Math.max(1, Math.floor(maxParams / columns.length));

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const request = new sql.Request(tx);
    const tuples = [];

    chunk.forEach((row, rowIndex) => {
      const placeholders = columns.map((col, colIndex) => {
        const name = `p${rowIndex}_${colIndex}`;
        const def = COLUMN_TYPES[col];
        if (def) request.input(name, def.type, def.cast(row[col]));
        else request.input(name, row[col]);
        return `@${name}`;
      });
      tuples.push(`(${placeholders.join(', ')})`);
    });

    await request.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Xóa dữ liệu cũ (theo thứ tự khóa ngoại)                                    */
/* -------------------------------------------------------------------------- */

const DELETE_ORDER = [
  'PhanHoiLuong',
  'UngLuong',
  'ChiTietLuong',
  'PhieuLuong',
  'BangLuong',
  'ChamCongBoSung',
  'ChamCong',
  'CT_XinNghi',
  'DonDoiCa',
  'DonLamThay',
  'DonXinNghi',
  'DangKyCaLam',
  'LichLamViec',
  'ChuQuan',
  'NhanVien',
  'QuanLy',
  'CaLam',
];

async function clearAll(tx) {
  for (const table of DELETE_ORDER) {
    await new sql.Request(tx).query(`DELETE FROM ${table}`);
  }
  console.log(`[SEED] Đã xóa dữ liệu cũ của ${DELETE_ORDER.length} bảng.`);
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 1 — Ca làm, tài khoản, nhân viên                                      */
/* -------------------------------------------------------------------------- */

async function seedCaLam(tx) {
  await insertRows(
    tx,
    'CaLam',
    ['MaCa', 'TenCa', 'GioBatDau', 'GioKetThuc', 'SoNVNgayThuong', 'SoNVCuoiTuan'],
    CA_LAM.map((c) => ({
      MaCa: c.maCa,
      TenCa: c.tenCa,
      GioBatDau: c.gioBatDau,
      GioKetThuc: c.gioKetThuc,
      SoNVNgayThuong: c.soNVNgayThuong,
      SoNVCuoiTuan: c.soNVCuoiTuan,
    })),
  );
  console.log(`[SEED] CaLam: ${CA_LAM.length} ca.`);
}

async function seedAccounts(tx, passwordHash) {
  await insertRows(
    tx,
    'QuanLy',
    ['MaQL', 'HoTen', 'SoDienThoai', 'MatKhau'],
    QUAN_LY.map((q) => ({
      MaQL: q.maQL,
      HoTen: q.hoTen,
      SoDienThoai: q.soDienThoai,
      MatKhau: passwordHash,
    })),
  );

  await insertRows(tx, 'ChuQuan', ['MaQL'], [{ MaQL: 'QL002' }]);

  await insertRows(
    tx,
    'NhanVien',
    [
      'MaNV',
      'HoTen',
      'SoDienThoai',
      'MatKhau',
      'ViTri',
      'NgayVaoLam',
      'TinhTrang',
      'MucLuong',
      'TenNganHang',
      'SoTaiKhoan',
    ],
    NHAN_VIEN.map((e) => ({
      MaNV: e.maNV,
      HoTen: e.hoTen,
      SoDienThoai: e.soDienThoai,
      MatKhau: passwordHash,
      ViTri: e.viTri,
      NgayVaoLam: e.ngayVaoLam,
      TinhTrang: e.tinhTrang,
      MucLuong: e.mucLuong,
      TenNganHang: e.tenNganHang,
      SoTaiKhoan: e.soTaiKhoan,
    })),
  );

  console.log(`[SEED] QuanLy: ${QUAN_LY.length} · NhanVien: ${NHAN_VIEN.length}.`);
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 2 — Dựng lịch làm việc, đơn nghỉ, chấm công (trong bộ nhớ)            */
/* -------------------------------------------------------------------------- */

function buildPlan(todayISO) {
  const rng = makeRng(20261101);

  const [todayYear, todayMonth] = todayISO.split('-').map(Number);
  const current = { year: todayYear, month: todayMonth };
  const months = [-3, -2, -1, 0].map((d) => shiftMonth(current, d));

  const rangeStart = dt.monthRangeISO(months[0].year, months[0].month).start;
  const rangeEnd = dt.addDaysISO(dt.monthRangeISO(months[3].year, months[3].month).end, 7);

  /* --- Lịch làm việc --------------------------------------------------- */
  const schedule = [];
  for (let d = rangeStart; d <= rangeEnd; d = dt.addDaysISO(d, 1)) {
    // BR-UC5-02: cuối tuần và ngày lễ 2 NV/ca, ngày thường 1 NV/ca.
    const capacity = dt.isWeekend(d) || payroll.isHoliday(d) ? 2 : 1;
    const pool = shuffle(ALL_MA_NV, rng);
    let cursor = 0;

    for (const ca of CA_LAM) {
      for (let k = 0; k < capacity; k += 1) {
        schedule.push({
          maLich: nextId('LLV', 4),
          ngayLam: d,
          maCa: ca.maCa,
          maNV: pool[cursor % pool.length],
        });
        cursor += 1;
      }
    }
  }

  /* --- Bảo đảm nhân viên demo có ca hôm nay để thử Chấm công ---------- */
  const nowHM = dt.nowHM();
  const todayRows = schedule.filter((s) => s.ngayLam === todayISO);
  const notEnded = todayRows.filter((s) => CA_BY_MA.get(s.maCa).gioKetThuc.slice(0, 5) > nowHM);
  const demoRowToday = todayRows.find((s) => s.maNV === DEMO_EMPLOYEE);

  if (!notEnded.some((s) => s.maNV === DEMO_EMPLOYEE)) {
    const target = notEnded[0] || todayRows[todayRows.length - 1];
    if (target) {
      if (demoRowToday && demoRowToday !== target) {
        // Hoán đổi để không ai bị trùng ca trong cùng ngày
        demoRowToday.maNV = target.maNV;
        target.maNV = DEMO_EMPLOYEE;
      } else {
        target.maNV = DEMO_EMPLOYEE;
      }
    }
  }

  /* --- Đơn xin nghỉ ĐÃ DUYỆT ------------------------------------------ */
  const leaves = [];
  const leaveSet = new Set();
  const ctXinNghi = [];

  for (const item of LEAVE_PLAN) {
    const target = shiftMonth(current, item.monthOffset);
    const range = dt.monthRangeISO(target.year, target.month);

    const own = schedule
      .filter((s) => s.maNV === item.maNV && s.ngayLam >= range.start && s.ngayLam <= range.end)
      .sort((a, b) => a.ngayLam.localeCompare(b.ngayLam));

    if (own.length === 0) continue;

    const picked = [];
    const step = Math.max(1, Math.floor(own.length / (item.count + 1)));
    for (let i = 0; i < item.count && i < own.length; i += 1) {
      picked.push(own[Math.min(own.length - 1, (i + 1) * step - 1)]);
    }

    const dates = picked.map((s) => s.ngayLam).sort();
    const maXN = nextId('XN', 4);

    leaves.push({
      MaXN: maXN,
      NgayGui: localDate(dt.addDaysISO(dates[0], -3), 20, 15),
      LyDo: item.lyDo,
      TrangThai: 'Đã duyệt',
      NgayBatDau: dates[0],
      NgayKetThuc: dates[dates.length - 1],
      MaNV: item.maNV,
      MaQL: MA_QL,
    });

    for (const shift of picked) {
      leaveSet.add(shift.maLich);
      ctXinNghi.push({ MaXN: maXN, MaLich: shift.maLich });
    }
  }

  /* --- Chấm công cho các ca đã kết thúc -------------------------------- */
  const attendance = [];
  const attendanceByMaLich = new Map();

  for (const shift of schedule) {
    if (shift.ngayLam > todayISO) continue;

    const ca = CA_BY_MA.get(shift.maCa);
    const caKetThucHM = ca.gioKetThuc.slice(0, 5);

    // Ca hôm nay chưa kết thúc → để trống cho người dùng thao tác thật.
    if (shift.ngayLam === todayISO && caKetThucHM >= nowHM) continue;
    // Ca hôm nay của nhân viên demo → luôn để trống (kể cả khi đã qua giờ tan
    // ca) để luôn có sẵn một ca mở cho việc thử Chấm công / Check out.
    if (shift.ngayLam === todayISO && shift.maNV === DEMO_EMPLOYEE) continue;
    // Ca nghỉ có phép → không có bản ghi chấm công, không bị phạt.
    if (leaveSet.has(shift.maLich)) continue;
    // ~8% ca bị bỏ không xin phép → phạt 100.000đ.
    if (rng() < 0.08) continue;

    const late = rng() < 0.1;
    const offset = late ? 10 + Math.floor(rng() * 16) : Math.floor(rng() * 8);
    const gioVao = addMinutes(ca.gioBatDau, offset);
    const gioRa = addMinutes(ca.gioKetThuc, -5 + Math.floor(rng() * 21));

    const record = {
      MaCC: nextId('CC', 5),
      MaLich: shift.maLich,
      GioVao: gioVao,
      GioRa: gioRa,
    };
    attendance.push(record);
    attendanceByMaLich.set(shift.maLich, record);
  }

  return {
    rng,
    todayISO,
    current,
    months,
    rangeStart,
    rangeEnd,
    schedule,
    leaves,
    ctXinNghi,
    leaveSet,
    attendance,
    attendanceByMaLich,
  };
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 3 — Ghi lịch làm việc, đơn nghỉ, chấm công                            */
/* -------------------------------------------------------------------------- */

async function seedSchedule(tx, plan) {
  await insertRows(
    tx,
    'LichLamViec',
    ['MaLich', 'NgayLam', 'MaCa', 'MaNV'],
    plan.schedule.map((s) => ({
      MaLich: s.maLich,
      NgayLam: s.ngayLam,
      MaCa: s.maCa,
      MaNV: s.maNV,
    })),
  );
  console.log(
    `[SEED] LichLamViec: ${plan.schedule.length} ca (${plan.rangeStart} → ${plan.rangeEnd}).`,
  );
}

async function seedLeaves(tx, plan) {
  await insertRows(
    tx,
    'DonXinNghi',
    ['MaXN', 'NgayGui', 'LyDo', 'TrangThai', 'NgayBatDau', 'NgayKetThuc', 'MaNV', 'MaQL'],
    plan.leaves,
  );
  await insertRows(tx, 'CT_XinNghi', ['MaXN', 'MaLich'], plan.ctXinNghi);
  console.log(
    `[SEED] DonXinNghi: ${plan.leaves.length} đơn đã duyệt (${plan.ctXinNghi.length} ca).`,
  );
}

async function seedAttendance(tx, plan) {
  await insertRows(
    tx,
    'ChamCong',
    ['MaCC', 'MaLich', 'GioVao', 'GioRa'],
    plan.attendance,
  );
  console.log(`[SEED] ChamCong: ${plan.attendance.length} bản ghi.`);
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 4 — Các đơn/đăng ký khác phục vụ demo các màn hình quản lý            */
/* -------------------------------------------------------------------------- */

async function seedOtherRequests(tx, plan) {
  const { schedule, todayISO } = plan;

  const futureShifts = schedule
    .filter((s) => s.ngayLam > todayISO)
    .sort((a, b) => a.ngayLam.localeCompare(b.ngayLam));

  const pickShift = (maNV, index) =>
    futureShifts.filter((s) => s.maNV === maNV)[index] || null;

  /* --- Đơn xin nghỉ / đổi ca CHỜ DUYỆT (ca tương lai) ----------------- */
  const pendingLeaves = [];
  const pendingCt = [];

  for (const [i, maNV] of ['NV002', 'NV004', 'NV008'].entries()) {
    const shift = pickShift(maNV, i);
    if (!shift) continue;

    const maXN = nextId('XN', 4);
    pendingLeaves.push({
      MaXN: maXN,
      NgayGui: localDate(dt.addDaysISO(todayISO, -1), 21, 5 + i),
      LyDo: ['Có việc riêng', 'Đi khám sức khỏe', 'Về quê'][i] || 'Việc riêng',
      TrangThai: 'Chờ duyệt',
      NgayBatDau: shift.ngayLam,
      NgayKetThuc: shift.ngayLam,
      MaNV: maNV,
      MaQL: null,
    });
    pendingCt.push({ MaXN: maXN, MaLich: shift.maLich });
  }

  // Một đơn đã bị từ chối để đủ trạng thái
  const rejectedShift = pickShift('NV007', 0);
  if (rejectedShift) {
    const maXN = nextId('XN', 4);
    pendingLeaves.push({
      MaXN: maXN,
      NgayGui: localDate(dt.addDaysISO(todayISO, -2), 19, 40),
      LyDo: 'Bận việc gia đình',
      TrangThai: 'Từ chối',
      NgayBatDau: rejectedShift.ngayLam,
      NgayKetThuc: rejectedShift.ngayLam,
      MaNV: 'NV007',
      MaQL: MA_QL,
    });
    pendingCt.push({ MaXN: maXN, MaLich: rejectedShift.maLich });
  }

  await insertRows(
    tx,
    'DonXinNghi',
    ['MaXN', 'NgayGui', 'LyDo', 'TrangThai', 'NgayBatDau', 'NgayKetThuc', 'MaNV', 'MaQL'],
    pendingLeaves,
  );
  await insertRows(tx, 'CT_XinNghi', ['MaXN', 'MaLich'], pendingCt);

  /* --- Đơn đổi ca ------------------------------------------------------ */
  const doiCa = [];
  const pairA = pickShift('NV003', 0);
  const pairB = pickShift('NV006', 0);
  if (pairA && pairB) {
    doiCa.push({
      MaDC: nextId('DC', 4),
      NgayGui: localDate(dt.addDaysISO(todayISO, -1), 20, 30),
      LyDo: 'Trùng lịch học, muốn đổi sang ca của đồng nghiệp',
      TrangThai: 'Chờ duyệt',
      MaLichGoc: pairA.maLich,
      MaLichMuonDoi: pairB.maLich,
      MaNV: 'NV003',
      MaQL: null,
    });
  }

  const pairC = pickShift('NV008', 1);
  const pairD = pickShift('NV010', 1);
  if (pairC && pairD) {
    doiCa.push({
      MaDC: nextId('DC', 4),
      NgayGui: localDate(dt.addDaysISO(todayISO, -2), 18, 10),
      LyDo: 'Có việc đột xuất',
      TrangThai: 'Chờ duyệt',
      MaLichGoc: pairC.maLich,
      MaLichMuonDoi: pairD.maLich,
      MaNV: 'NV008',
      MaQL: null,
    });
  }

  await insertRows(
    tx,
    'DonDoiCa',
    ['MaDC', 'NgayGui', 'LyDo', 'TrangThai', 'MaLichGoc', 'MaLichMuonDoi', 'MaNV', 'MaQL'],
    doiCa,
  );

  /* --- Đơn xin làm thay (nhận ca trống) -------------------------------- */
  const lamThay = [];
  const coverShifts = futureShifts.slice(0, 40);
  for (const [i, maNV] of ['NV004', 'NV009'].entries()) {
    const shift = coverShifts.filter((s) => s.maNV !== maNV)[i * 3];
    if (!shift) continue;
    lamThay.push({
      MaLT: nextId('LT', 4),
      NgayGui: localDate(dt.addDaysISO(todayISO, -1), 22, 0),
      LyDo: 'Muốn nhận thêm ca',
      TrangThai: 'Chờ duyệt',
      MaLich: shift.maLich,
      MaNV: maNV,
      MaQL: null,
    });
  }

  await insertRows(
    tx,
    'DonLamThay',
    ['MaLT', 'NgayGui', 'LyDo', 'TrangThai', 'MaLich', 'MaNV', 'MaQL'],
    lamThay,
  );

  /* --- Chấm công bổ sung ---------------------------------------------- */
  const boSung = [];
  const pastNoAttendance = schedule
    .filter((s) => s.ngayLam < todayISO && !plan.attendanceByMaLich.has(s.maLich) && !plan.leaveSet.has(s.maLich))
    .slice(0, 2);

  pastNoAttendance.forEach((shift, i) => {
    const ca = CA_BY_MA.get(shift.maCa);
    boSung.push({
      MaCCBS: nextId('CCBS', 5),
      GioVaoThucTe: ca.gioBatDau,
      GioRaThucTe: ca.gioKetThuc,
      MaLich: shift.maLich,
      MaNV: shift.maNV,
      MaQL: null,
      NgayGui: localDate(dt.addDaysISO(shift.ngayLam, 1), 8, 15 + i),
      LyDo: 'Quên chấm công do hết pin điện thoại',
      TrangThai: 'Chờ duyệt',
    });
  });

  // Một yêu cầu đã được duyệt trước đó
  const approvedShift = schedule.find(
    (s) =>
      s.ngayLam < dt.addDaysISO(todayISO, -3) &&
      plan.attendanceByMaLich.has(s.maLich) &&
      s.maNV === 'NV002',
  );
  if (approvedShift) {
    const ca = CA_BY_MA.get(approvedShift.maCa);
    boSung.push({
      MaCCBS: nextId('CCBS', 5),
      GioVaoThucTe: ca.gioBatDau,
      GioRaThucTe: ca.gioKetThuc,
      MaLich: approvedShift.maLich,
      MaNV: 'NV002',
      MaQL: MA_QL,
      NgayGui: localDate(dt.addDaysISO(approvedShift.ngayLam, 1), 9, 0),
      LyDo: 'Mất kết nối Wi-Fi khi tan ca',
      TrangThai: 'Đã duyệt',
    });
  }

  await insertRows(
    tx,
    'ChamCongBoSung',
    ['MaCCBS', 'GioVaoThucTe', 'GioRaThucTe', 'MaLich', 'MaNV', 'MaQL', 'NgayGui', 'LyDo', 'TrangThai'],
    boSung,
  );

  /* --- Đăng ký ca làm cho tuần tới ------------------------------------ */
  // Dữ liệu mẫu phải tôn trọng định biên BR-UC5-02 (ngày thường 1 nhân viên/ca,
  // cuối tuần và ngày lễ 2 nhân viên/ca), nếu không màn hình Đăng ký ca làm sẽ
  // báo "Đã có đủ số lượng nhân viên" ở mọi ô.
  const nextWeekStart = dt.addDaysISO(dt.startOfWeekISO(todayISO), 7);
  const nextWeekDays = dt.weekDaysISO(nextWeekStart);
  const dangKy = [];

  const allSlots = [];
  for (const day of nextWeekDays) {
    for (const ca of CA_LAM) allSlots.push({ day, ca });
  }

  const usedSlots = new Set();
  const demoEmpIndex = NHAN_VIEN.findIndex((emp) => emp.maNV === 'NV005');
  // Nhân viên demo (NV005) đăng ký ca chiều 4 ngày, giống ảnh đặc tả.
  const demoDays = [0, 1, 3, 4].map((i) => nextWeekDays[i]);
  const demoCa = CA_LAM[1];
  for (const day of demoDays) usedSlots.add(`${day}|${demoCa.maCa}`);

  NHAN_VIEN.forEach((emp, empIndex) => {
    const ngayGui = localDate(dt.addDaysISO(todayISO, -1), 20, empIndex);

    if (empIndex === demoEmpIndex) {
      dangKy.push({
        MaDK: nextId('DK', 4),
        LichRanh: demoDays.join(','), // C13: mỗi ngày lưu dạng ISO, phân tách bằng dấu phẩy
        NgayGui: ngayGui,
        MaNV: emp.maNV,
        MaCa: demoCa.maCa,
      });
      return;
    }

    // Mỗi nhân viên còn lại đăng ký một ca rảnh, chọn ô còn trống theo vòng xoay.
    let chosen = null;
    for (let k = 0; k < allSlots.length && !chosen; k += 1) {
      const slot = allSlots[(empIndex * 5 + k) % allSlots.length];
      const key = `${slot.day}|${slot.ca.maCa}`;
      if (!usedSlots.has(key)) chosen = { ...slot, key };
    }
    if (!chosen) return;

    usedSlots.add(chosen.key);
    dangKy.push({
      MaDK: nextId('DK', 4),
      LichRanh: chosen.day,
      NgayGui: ngayGui,
      MaNV: emp.maNV,
      MaCa: chosen.ca.maCa,
    });
  });

  await insertRows(
    tx,
    'DangKyCaLam',
    ['MaDK', 'LichRanh', 'NgayGui', 'MaNV', 'MaCa'],
    dangKy,
  );

  console.log(
    `[SEED] Đơn từ: nghỉ chờ duyệt ${pendingLeaves.length}, đổi ca ${doiCa.length}, ` +
      `làm thay ${lamThay.length}, chấm công bổ sung ${boSung.length}, đăng ký ca ${dangKy.length}.`,
  );
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 5 — Bảng lương (dùng chính src/utils/payroll.js)                      */
/* -------------------------------------------------------------------------- */

async function seedPayroll(tx, plan) {
  const bangLuongRows = [];
  const phieuLuongRows = [];
  const chiTietRows = [];
  const ungLuongApproved = [];

  for (const item of BANG_LUONG_PLAN) {
    const period = shiftMonth(plan.current, item.monthOffset);
    const range = dt.monthRangeISO(period.year, period.month);
    const maBL = `BL${period.year}${pad2(period.month)}`;

    const nextPeriod = shiftMonth(period, 1);
    const ngayChiTra = `${nextPeriod.year}-${pad2(nextPeriod.month)}-05`;

    bangLuongRows.push({
      MaBL: maBL,
      Thang: period.month,
      Nam: period.year,
      NgayBatDau: range.start,
      NgayKetThuc: range.end,
      NgayChiTra: ngayChiTra,
      TinhTrang: item.tinhTrang,
    });

    const monthShifts = plan.schedule
      .filter((s) => s.ngayLam >= range.start && s.ngayLam <= range.end)
      .sort((a, b) => a.ngayLam.localeCompare(b.ngayLam) || a.maCa.localeCompare(b.maCa));

    for (const emp of NHAN_VIEN) {
      const ownShifts = monthShifts.filter((s) => s.maNV === emp.maNV);
      if (!ownShifts.length) continue;

      // --- BƯỚC 1: từng ca → một dòng chi tiết lương
      const lines = ownShifts.map((shift) => {
        const ca = CA_BY_MA.get(shift.maCa);
        const cc = plan.attendanceByMaLich.get(shift.maLich);

        const line = payroll.computeShiftLine({
          ngayLam: shift.ngayLam,
          gioBatDauCa: ca.gioBatDau.slice(0, 5),
          gioVao: cc ? cc.GioVao.slice(0, 5) : null,
          gioRa: cc ? cc.GioRa.slice(0, 5) : null,
          mucLuong: emp.mucLuong,
          tinhTrang: emp.tinhTrang,
          ngayVaoLam: emp.ngayVaoLam,
          coDonNghiDaDuyet: plan.leaveSet.has(shift.maLich),
        });

        return { ...line, maLich: shift.maLich };
      });

      // --- Tiền ứng đã duyệt trong kỳ
      const advances = UNG_LUONG.filter(
        (u) => u.maNV === emp.maNV && u.monthOffset === item.monthOffset && u.trangThai === 'Đã duyệt',
      );
      const tienUngLuong = advances.reduce((sum, u) => sum + u.soTien, 0);

      // --- Chênh lệch kết chuyển
      const chenhLech = CHENH_LECH.filter(
        (c) => c.maNV === emp.maNV && c.monthOffset === item.monthOffset,
      ).reduce((sum, c) => sum + c.soTien, 0);

      // --- BƯỚC 2: tổng hợp phiếu lương
      const summary = payroll.computePayslip({
        lines,
        tienUngLuong,
        chenhLechKetChuyen: chenhLech,
      });

      const maPL = nextId('PL', 5);
      phieuLuongRows.push({
        MaPL: maPL,
        TongGioLam: summary.tongGioLam,
        LuongTheoGioLam: summary.luongTheoGioLam,
        TienPhat: summary.tienPhat,
        TienUngLuong: summary.tienUngLuong,
        ChenhLechKetChuyen: summary.chenhLechKetChuyen,
        MaBL: maBL,
        MaND: emp.maNV,
      });

      for (const line of lines) {
        chiTietRows.push({
          MaCTL: nextId('CTL', 5),
          SoGioLam: line.soGioLam,
          HeSoNgay: line.heSoNgay,
          MucLuong: line.mucLuong,
          PhatDiTre: line.phatDiTre,
          PhatBoCa: line.phatBoCa,
          MaLich: line.maLich,
          MaPL: maPL,
        });
      }

      for (const advance of advances) {
        ungLuongApproved.push({ ...advance, maPL, maBL });
      }
    }
  }

  await insertRows(
    tx,
    'BangLuong',
    ['MaBL', 'Thang', 'Nam', 'NgayBatDau', 'NgayKetThuc', 'NgayChiTra', 'TinhTrang'],
    bangLuongRows,
  );

  await insertRows(
    tx,
    'PhieuLuong',
    ['MaPL', 'TongGioLam', 'LuongTheoGioLam', 'TienPhat', 'TienUngLuong', 'ChenhLechKetChuyen', 'MaBL', 'MaND'],
    phieuLuongRows,
  );

  await insertRows(
    tx,
    'ChiTietLuong',
    ['MaCTL', 'SoGioLam', 'HeSoNgay', 'MucLuong', 'PhatDiTre', 'PhatBoCa', 'MaLich', 'MaPL'],
    chiTietRows,
  );

  console.log(
    `[SEED] BangLuong: ${bangLuongRows.length} kỳ · PhieuLuong: ${phieuLuongRows.length} · ` +
      `ChiTietLuong: ${chiTietRows.length} dòng.`,
  );

  return { ungLuongApproved, phieuLuongRows, bangLuongRows };
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 6 — Ứng lương và phản hồi lương                                       */
/* -------------------------------------------------------------------------- */

async function seedAdvances(tx, plan, payrollResult) {
  const rows = [];

  // Khoản ứng đã duyệt → gắn vào phiếu lương tương ứng
  for (const item of payrollResult.ungLuongApproved) {
    const period = shiftMonth(plan.current, item.monthOffset);
    rows.push({
      MaUL: nextId('UL', 4),
      NgayGui: localDate(
        `${period.year}-${pad2(period.month)}-${pad2(Math.min(10, dt.monthRangeISO(period.year, period.month).days))}`,
        10,
        30,
      ),
      LyDo: item.lyDo,
      TrangThai: item.trangThai,
      SoTien: item.soTien,
      MaPL: item.maPL,
      MaNV: item.maNV,
      MaQL: MA_QL,
    });
  }

  // Khoản ứng đang chờ duyệt → chưa gắn phiếu lương
  for (const item of UNG_LUONG.filter((u) => u.trangThai === 'Chờ duyệt')) {
    const period = shiftMonth(plan.current, item.monthOffset);
    rows.push({
      MaUL: nextId('UL', 4),
      NgayGui: localDate(`${period.year}-${pad2(period.month)}-08`, 15, 20),
      LyDo: item.lyDo,
      TrangThai: item.trangThai,
      SoTien: item.soTien,
      MaPL: null,
      MaNV: item.maNV,
      MaQL: null,
    });
  }

  await insertRows(
    tx,
    'UngLuong',
    ['MaUL', 'NgayGui', 'LyDo', 'TrangThai', 'SoTien', 'MaPL', 'MaNV', 'MaQL'],
    rows,
  );

  /* --- Phản hồi lương trên kỳ đã chi trả ------------------------------- */
  const paidBangLuong = payrollResult.bangLuongRows.find((b) => b.TinhTrang === 'Đã duyệt');
  const feedback = [];

  if (paidBangLuong) {
    const paidPayslips = payrollResult.phieuLuongRows.filter((p) => p.MaBL === paidBangLuong.MaBL);
    const samples = [
      { maNV: 'NV003', lyDo: 'Thiếu 1 ca ngày 12, nhờ quản lý kiểm tra lại', trangThai: 'Chờ xử lý' },
      { maNV: 'NV008', lyDo: 'Số giờ làm chưa khớp với bảng chấm công', trangThai: 'Đã xử lý' },
    ];

    for (const sample of samples) {
      const payslip = paidPayslips.find((p) => p.MaND === sample.maNV);
      if (!payslip) continue;
      feedback.push({
        MaPH: nextId('PH', 4),
        NgayGui: localDate(dt.addDaysISO(paidBangLuong.NgayChiTra, 2), 20, 45),
        LyDo: sample.lyDo,
        TrangThai: sample.trangThai,
        MaNV: sample.maNV,
        MaQL: sample.trangThai === 'Đã xử lý' ? MA_QL : null,
        MaPL: payslip.MaPL,
      });
    }
  }

  await insertRows(
    tx,
    'PhanHoiLuong',
    ['MaPH', 'NgayGui', 'LyDo', 'TrangThai', 'MaNV', 'MaQL', 'MaPL'],
    feedback,
  );

  console.log(`[SEED] UngLuong: ${rows.length} · PhanHoiLuong: ${feedback.length}.`);
}

/* -------------------------------------------------------------------------- */
/* Chạy                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('[SEED] Bắt đầu nạp dữ liệu mẫu…');

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const todayISO = dt.todayISO();

  const pool = await new sql.ConnectionPool(appConfig).connect();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    await clearAll(tx);
    await seedCaLam(tx);
    await seedAccounts(tx, passwordHash);

    const plan = buildPlan(todayISO);
    await seedSchedule(tx, plan);
    await seedLeaves(tx, plan);
    await seedAttendance(tx, plan);
    await seedOtherRequests(tx, plan);

    const payrollResult = await seedPayroll(tx, plan);
    await seedAdvances(tx, plan, payrollResult);

    await tx.commit();
    console.log('\n[SEED] ✔ Hoàn tất. Tài khoản demo (mật khẩu 123456):');
    console.log('        Nhân viên : 0914673802  (Nguyễn Việt Đạt — NV005)');
    console.log('        Quản lý   : 0901234567  (Nguyễn Minh Anh — QL001)');
    console.log('        Chủ quán  : 0909999999  (Trần Chủ Quán — QL002)\n');
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* bỏ qua */
    }
    throw err;
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('\n[SEED] Thất bại:', err.message);
  if (err.originalError) console.error(err.originalError.message);
  process.exit(1);
});
