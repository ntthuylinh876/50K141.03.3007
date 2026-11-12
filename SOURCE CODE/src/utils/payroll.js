'use strict';

/**
 * ============================================================================
 *  CÔNG THỨC TÍNH LƯƠNG — hàm thuần, không truy vấn CSDL, dễ kiểm thử
 * ============================================================================
 *
 *  Căn cứ: SRS mục 3.13.1, các business rule BR-UC13.1-01 … BR-UC13.1-09.
 *
 *  Quy trình 2 bước:
 *    BƯỚC 1 — Mỗi ca làm việc (LichLamViec) trong kỳ sinh ra đúng một dòng
 *             ChiTietLuong: số giờ làm, hệ số ngày, đơn giá giờ, phạt đi trễ,
 *             phạt bỏ ca.
 *    BƯỚC 2 — Tổng hợp các dòng đó thành PhieuLuong của nhân viên:
 *             Thực nhận = Lương giờ làm + Chênh lệch kết chuyển − Phạt − Ứng.
 *
 *  Các quyết định đã chốt:
 *    C6  — MucLuong trong CSDL là ĐƠN GIÁ GIỜ (đồng/giờ), không phải lương tháng.
 *    C9  — Ngày lễ lấy từ config/holidays.json, dùng chung cho cả hệ số lương
 *          và quy tắc định biên 2 nhân viên/ca.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const dt = require('./datetime');

/* -------------------------------------------------------------------------- */
/* Tham số nghiệp vụ (BR-UC13.1-04, -06, -07)                                 */
/* -------------------------------------------------------------------------- */

/** Phạt mỗi lần đi trễ từ 10 phút trở lên (BR-UC13.1-06). */
const PHAT_DI_TRE = 50000;

/** Phạt mỗi ca bỏ không xin phép (BR-UC13.1-07). */
const PHAT_BO_CA = 100000;

/** Đơn giá giờ của nhân viên thử việc trong tuần đầu tiên (BR-UC13.1-04). */
const LUONG_THU_VIEC = 21000;

/** Số ngày đầu tiên áp dụng đơn giá thử việc. */
const SO_NGAY_THU_VIEC = 7;

/** Ngưỡng phút bị tính là đi trễ. */
const NGUONG_DI_TRE_PHUT = 10;

/* -------------------------------------------------------------------------- */
/* Ngày lễ — nguồn duy nhất: config/holidays.json                              */
/* -------------------------------------------------------------------------- */

let holidayCache = null;

/** Nạp (và ghi nhớ) danh sách ngày lễ. */
function loadHolidays() {
  if (holidayCache) return holidayCache;

  const filePath = path.join(__dirname, '..', '..', 'config', 'holidays.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);

  const map = new Map();
  for (const list of Object.values(data.years || {})) {
    for (const item of list) {
      map.set(item.date, item);
    }
  }

  holidayCache = map;
  return map;
}

/** Xóa bộ nhớ đệm ngày lễ (dùng trong kiểm thử). */
function clearHolidayCache() {
  holidayCache = null;
}

/**
 * Thông tin ngày lễ của một ngày, hoặc null nếu là ngày thường.
 * @param {string} dateISO
 * @returns {{date:string, name:string, heSoLuong:number}|null}
 */
function getHoliday(dateISO) {
  const iso = dt.toISODate(dateISO);
  if (!iso) return null;
  return loadHolidays().get(iso) || null;
}

/** Ngày này có phải ngày lễ không (dùng cho quy tắc định biên BR-UC5-02). */
function isHoliday(dateISO) {
  return getHoliday(dateISO) !== null;
}

/**
 * Hệ số lương của ngày (BR-UC13.1-05):
 *   2 — Quốc khánh 02/09
 *   3 — mùng 1, 2, 3 Tết Âm lịch
 *   1 — các ngày còn lại (kể cả Thứ Bảy, Chủ Nhật)
 *
 * @param {string} dateISO
 * @returns {number}
 */
function getHeSoNgay(dateISO) {
  const holiday = getHoliday(dateISO);
  if (!holiday) return 1;
  const heSo = Number(holiday.heSoLuong);
  return Number.isFinite(heSo) && heSo > 0 ? heSo : 1;
}

/* -------------------------------------------------------------------------- */
/* Đơn giá giờ                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Đơn giá giờ áp dụng cho một ca (BR-UC13.1-04).
 *
 *  - Nhân viên đang "Thử việc" và ca nằm trong 7 ngày đầu kể từ NgayVaoLam
 *    → 21.000 đ/giờ.
 *  - Các trường hợp còn lại → NhanVien.MucLuong (đơn giá giờ chủ quán thiết lập).
 *
 * @param {Object} params
 * @param {number} params.mucLuong     Đơn giá giờ trong hồ sơ nhân viên
 * @param {string} params.tinhTrang    'Chính thức' | 'Thử việc' | 'Đã nghỉ'
 * @param {string} params.ngayVaoLam   'YYYY-MM-DD'
 * @param {string} params.ngayLam      'YYYY-MM-DD'
 * @returns {number}
 */
function resolveHourlyRate({ mucLuong, tinhTrang, ngayVaoLam, ngayLam }) {
  const base = Number(mucLuong) || 0;
  if (String(tinhTrang || '').trim() !== 'Thử việc') return base;

  const start = dt.toISODate(ngayVaoLam);
  const work = dt.toISODate(ngayLam);
  if (!start || !work) return base;

  const days = daysBetween(start, work);
  if (days >= 0 && days < SO_NGAY_THU_VIEC) return LUONG_THU_VIEC;

  return base;
}

/** Số ngày giữa hai mốc ISO (b - a). */
function daysBetween(aISO, bISO) {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 1 — Tính một dòng chi tiết lương cho một ca                            */
/* -------------------------------------------------------------------------- */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round0 = (n) => Math.round(Number(n) + Number.EPSILON);

/**
 * Tính chi tiết lương của MỘT ca làm việc.
 *
 * @param {Object} input
 * @param {string}  input.ngayLam        Ngày làm 'YYYY-MM-DD'
 * @param {string}  input.gioBatDauCa    Giờ bắt đầu ca 'HH:mm' (CaLam.GioBatDau)
 * @param {string}  input.gioKetThucCa   Giờ kết thúc ca 'HH:mm'
 * @param {string|null} input.gioVao     Giờ vào thực tế (ChamCong.GioVao)
 * @param {string|null} input.gioRa      Giờ ra thực tế (ChamCong.GioRa)
 * @param {number}  input.mucLuong       Đơn giá giờ trong hồ sơ
 * @param {string}  input.tinhTrang      Tình trạng nhân viên
 * @param {string}  input.ngayVaoLam     Ngày vào làm
 * @param {boolean} [input.coDonNghiDaDuyet] Có đơn nghỉ/đổi ca đã duyệt cho ca này
 * @returns {{
 *   ngayLam: string, soGioLam: number, heSoNgay: number, mucLuong: number,
 *   phatDiTre: number, phatBoCa: number, phutDiTre: number,
 *   thanhTien: number, laNgayLe: boolean, ghiChu: string
 * }}
 */
function computeShiftLine(input) {
  const {
    ngayLam,
    gioBatDauCa,
    gioVao,
    gioRa,
    mucLuong,
    tinhTrang,
    ngayVaoLam,
    coDonNghiDaDuyet = false,
  } = input;

  const heSoNgay = getHeSoNgay(ngayLam);
  const donGia = resolveHourlyRate({ mucLuong, tinhTrang, ngayVaoLam, ngayLam });
  const laNgayLe = isHoliday(ngayLam);

  // --- Trường hợp không có giờ vào: bỏ ca hoặc nghỉ có phép ---
  if (!gioVao) {
    if (coDonNghiDaDuyet) {
      // BR-UC13.1-07: ca nghỉ có đơn được duyệt thì không bị phạt
      return {
        ngayLam,
        soGioLam: 0,
        heSoNgay,
        mucLuong: donGia,
        phatDiTre: 0,
        phatBoCa: 0,
        phutDiTre: 0,
        thanhTien: 0,
        laNgayLe,
        ghiChu: 'Nghỉ có phép',
      };
    }
    return {
      ngayLam,
      soGioLam: 0,
      heSoNgay,
      mucLuong: donGia,
      phatDiTre: 0,
      phatBoCa: PHAT_BO_CA,
      phutDiTre: 0,
      thanhTien: 0,
      laNgayLe,
      ghiChu: 'Bỏ ca không xin phép',
    };
  }

  // --- Trường hợp có giờ vào ---
  // BR-UC13.1-03: số giờ làm = giờ ra − giờ vào của bản ghi chấm công hợp lệ
  const soGioLam = round2(dt.hoursBetween(gioVao, gioRa));

  // BR-UC13.1-06: đi trễ từ 10 phút trở lên so với giờ bắt đầu ca
  const vaoPhut = dt.hmToMinutes(gioVao);
  const caPhut = dt.hmToMinutes(gioBatDauCa);
  const phutDiTre = vaoPhut != null && caPhut != null ? Math.max(0, vaoPhut - caPhut) : 0;
  const phatDiTre = phutDiTre >= NGUONG_DI_TRE_PHUT ? PHAT_DI_TRE : 0;

  // BR-UC13.1-02: lương giờ làm = số giờ × đơn giá giờ × hệ số ngày
  const thanhTien = round0(soGioLam * donGia * heSoNgay);

  return {
    ngayLam,
    soGioLam,
    heSoNgay,
    mucLuong: donGia,
    phatDiTre,
    phatBoCa: 0,
    phutDiTre,
    thanhTien,
    laNgayLe,
    ghiChu: phatDiTre ? `Đi trễ ${phutDiTre} phút` : '',
  };
}

/* -------------------------------------------------------------------------- */
/* BƯỚC 2 — Tổng hợp thành phiếu lương                                        */
/* -------------------------------------------------------------------------- */

/**
 * Tổng hợp phiếu lương từ danh sách dòng chi tiết.
 *
 * @param {Object} input
 * @param {Array}  input.lines                 Các dòng từ computeShiftLine()
 * @param {number} [input.tienUngLuong]        Tổng tiền ứng đã duyệt trong kỳ
 * @param {number} [input.chenhLechKetChuyen]  Chênh lệch kết chuyển từ kỳ trước
 * @returns {{
 *   tongGioLam: number, luongTheoGioLam: number, tienPhat: number,
 *   tienUngLuong: number, chenhLechKetChuyen: number, thucNhan: number,
 *   tongGioThuong: number, tongGioLe: number, tongGioCuoiTuan: number
 * }}
 */
function computePayslip(input) {
  const lines = input.lines || [];
  const tienUngLuong = Number(input.tienUngLuong) || 0;
  const chenhLechKetChuyen = Number(input.chenhLechKetChuyen) || 0;

  let tongGioLam = 0;
  let luongTheoGioLam = 0;
  let tienPhat = 0;

  // Tách giờ theo loại ngày để hiển thị/đối chiếu
  let tongGioThuong = 0;
  let tongGioLe = 0;
  let tongGioCuoiTuan = 0;

  for (const line of lines) {
    const gio = Number(line.soGioLam) || 0;
    tongGioLam += gio;
    luongTheoGioLam += Number(line.thanhTien) || gio * line.mucLuong * line.heSoNgay;
    tienPhat += (Number(line.phatDiTre) || 0) + (Number(line.phatBoCa) || 0);

    if (line.heSoNgay > 1) {
      tongGioLe += gio;
    } else if (dt.isWeekend(line.ngayLam)) {
      tongGioCuoiTuan += gio;
    } else {
      tongGioThuong += gio;
    }
  }

  // BR-UC13.1-09: Thực nhận = Lương giờ làm + Chênh lệch kết chuyển − Phạt − Ứng
  const thucNhan = round0(luongTheoGioLam + chenhLechKetChuyen - tienPhat - tienUngLuong);

  return {
    tongGioLam: round2(tongGioLam),
    luongTheoGioLam: round0(luongTheoGioLam),
    tienPhat: round0(tienPhat),
    tienUngLuong: round0(tienUngLuong),
    chenhLechKetChuyen: round0(chenhLechKetChuyen),
    thucNhan,
    tongGioThuong: round2(tongGioThuong),
    tongGioLe: round2(tongGioLe),
    tongGioCuoiTuan: round2(tongGioCuoiTuan),
  };
}

module.exports = {
  PHAT_DI_TRE,
  PHAT_BO_CA,
  LUONG_THU_VIEC,
  SO_NGAY_THU_VIEC,
  NGUONG_DI_TRE_PHUT,
  loadHolidays,
  clearHolidayCache,
  getHoliday,
  isHoliday,
  getHeSoNgay,
  resolveHourlyRate,
  daysBetween,
  computeShiftLine,
  computePayslip,
};
