'use strict';

/**
 * Kiểm thử công thức tính lương — chạy:  npm test
 *
 * Bao phủ toàn bộ business rule BR-UC13.1-01 … BR-UC13.1-09.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const payroll = require('../src/utils/payroll');

/* -------------------------------------------------------------------------- */
/* Hằng số nghiệp vụ                                                          */
/* -------------------------------------------------------------------------- */

test('Hằng số nghiệp vụ khớp SRS', () => {
  assert.equal(payroll.PHAT_DI_TRE, 50000, 'Phạt đi trễ 50.000đ/lần (BR-UC13.1-06)');
  assert.equal(payroll.PHAT_BO_CA, 100000, 'Phạt bỏ ca 100.000đ/ca (BR-UC13.1-07)');
  assert.equal(payroll.LUONG_THU_VIEC, 21000, 'Thử việc 21.000đ/giờ (BR-UC13.1-04)');
  assert.equal(payroll.NGUONG_DI_TRE_PHUT, 10, 'Ngưỡng đi trễ 10 phút');
});

/* -------------------------------------------------------------------------- */
/* BR-UC13.1-05 — Hệ số ngày                                                  */
/* -------------------------------------------------------------------------- */

test('getHeSoNgay: ngày thường = 1', () => {
  assert.equal(payroll.getHeSoNgay('2026-11-10'), 1);
  assert.equal(payroll.getHeSoNgay('2026-11-07'), 1, 'Thứ Bảy vẫn là hệ số 1');
  assert.equal(payroll.getHeSoNgay('2026-11-08'), 1, 'Chủ Nhật vẫn là hệ số 1');
});

test('getHeSoNgay: Quốc khánh 02/09 = 2', () => {
  assert.equal(payroll.getHeSoNgay('2026-09-02'), 2);
  assert.equal(payroll.getHeSoNgay('2025-09-02'), 2);
});

test('getHeSoNgay: mùng 1, 2, 3 Tết = 3', () => {
  assert.equal(payroll.getHeSoNgay('2026-02-17'), 3, 'Mùng 1 Tết Bính Ngọ');
  assert.equal(payroll.getHeSoNgay('2026-02-18'), 3, 'Mùng 2');
  assert.equal(payroll.getHeSoNgay('2026-02-19'), 3, 'Mùng 3');
  assert.equal(payroll.getHeSoNgay('2026-02-16'), 1, '30 Tết hệ số 1');
});

test('isHoliday / getHoliday: nhận diện ngày lễ', () => {
  assert.equal(payroll.isHoliday('2026-09-02'), true);
  assert.equal(payroll.isHoliday('2026-11-10'), false);
  assert.equal(payroll.getHoliday('2026-01-01').name, 'Tết Dương lịch');
  assert.equal(payroll.getHoliday('2026-11-10'), null);
});

/* -------------------------------------------------------------------------- */
/* BR-UC13.1-04 — Đơn giá giờ                                                 */
/* -------------------------------------------------------------------------- */

test('resolveHourlyRate: thử việc tuần đầu = 21.000đ/giờ', () => {
  const base = { mucLuong: 23000, tinhTrang: 'Thử việc', ngayVaoLam: '2026-01-01' };
  assert.equal(payroll.resolveHourlyRate({ ...base, ngayLam: '2026-01-01' }), 21000);
  assert.equal(payroll.resolveHourlyRate({ ...base, ngayLam: '2026-01-07' }), 21000);
  assert.equal(
    payroll.resolveHourlyRate({ ...base, ngayLam: '2026-01-08' }),
    23000,
    'Ngày thứ 8 trở đi dùng đơn giá chính thức',
  );
});

test('resolveHourlyRate: nhân viên chính thức dùng MucLuong', () => {
  assert.equal(
    payroll.resolveHourlyRate({
      mucLuong: 25000,
      tinhTrang: 'Chính thức',
      ngayVaoLam: '2026-01-01',
      ngayLam: '2026-01-02',
    }),
    25000,
  );
});

/* -------------------------------------------------------------------------- */
/* BR-UC13.1-03, -06 — Số giờ làm và phạt đi trễ                              */
/* -------------------------------------------------------------------------- */

test('computeShiftLine: ca đúng giờ, không phạt', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-11-10',
    gioBatDauCa: '06:00',
    gioVao: '06:00',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
  });

  assert.equal(line.soGioLam, 6);
  assert.equal(line.heSoNgay, 1);
  assert.equal(line.mucLuong, 23000);
  assert.equal(line.phatDiTre, 0);
  assert.equal(line.phatBoCa, 0);
  assert.equal(line.thanhTien, 138000, '6 giờ × 23.000đ × hệ số 1');
});

test('computeShiftLine: đi trễ 9 phút chưa bị phạt', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-11-10',
    gioBatDauCa: '06:00',
    gioVao: '06:09',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
  });

  assert.equal(line.phutDiTre, 9);
  assert.equal(line.phatDiTre, 0);
});

test('computeShiftLine: đi trễ đúng 10 phút bị phạt 50.000đ', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-11-10',
    gioBatDauCa: '06:00',
    gioVao: '06:10',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
  });

  assert.equal(line.phutDiTre, 10);
  assert.equal(line.phatDiTre, 50000);
  assert.equal(line.soGioLam, 5.83, '350 phút = 5,83 giờ');
  assert.equal(line.thanhTien, 134090, '5,83 × 23.000');
});

test('computeShiftLine: bỏ ca không xin phép bị phạt 100.000đ', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-11-10',
    gioBatDauCa: '06:00',
    gioVao: null,
    gioRa: null,
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
    coDonNghiDaDuyet: false,
  });

  assert.equal(line.soGioLam, 0);
  assert.equal(line.phatBoCa, 100000);
  assert.equal(line.thanhTien, 0);
  assert.equal(line.ghiChu, 'Bỏ ca không xin phép');
});

test('computeShiftLine: nghỉ có đơn đã duyệt không bị phạt', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-11-10',
    gioBatDauCa: '06:00',
    gioVao: null,
    gioRa: null,
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
    coDonNghiDaDuyet: true,
  });

  assert.equal(line.phatBoCa, 0);
  assert.equal(line.phatDiTre, 0);
  assert.equal(line.soGioLam, 0);
  assert.equal(line.ghiChu, 'Nghỉ có phép');
});

test('computeShiftLine: ngày lễ nhân đôi lương giờ', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-09-02', // Quốc khánh, hệ số 2
    gioBatDauCa: '06:00',
    gioVao: '06:00',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
  });

  assert.equal(line.heSoNgay, 2);
  assert.equal(line.laNgayLe, true);
  assert.equal(line.thanhTien, 276000, '6 × 23.000 × 2');
});

test('computeShiftLine: mùng 1 Tết nhân ba lương giờ', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-02-17', // Mùng 1 Tết, hệ số 3
    gioBatDauCa: '06:00',
    gioVao: '06:00',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
  });

  assert.equal(line.heSoNgay, 3);
  assert.equal(line.thanhTien, 414000, '6 × 23.000 × 3');
});

test('computeShiftLine: ca thử việc áp dụng 21.000đ/giờ', () => {
  const line = payroll.computeShiftLine({
    ngayLam: '2026-01-03',
    gioBatDauCa: '06:00',
    gioVao: '06:00',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Thử việc',
    ngayVaoLam: '2026-01-01',
  });

  assert.equal(line.mucLuong, 21000);
  assert.equal(line.thanhTien, 126000, '6 × 21.000 × 1');
});

/* -------------------------------------------------------------------------- */
/* BR-UC13.1-09 — Tổng hợp phiếu lương                                        */
/* -------------------------------------------------------------------------- */

test('computePayslip: Thực nhận = Lương giờ + Kết chuyển − Phạt − Ứng', () => {
  const lines = [
    payroll.computeShiftLine({
      ngayLam: '2026-11-09', // Thứ Hai
      gioBatDauCa: '06:00',
      gioVao: '06:00',
      gioRa: '12:00',
      mucLuong: 23000,
      tinhTrang: 'Chính thức',
      ngayVaoLam: '2024-01-01',
    }),
    payroll.computeShiftLine({
      ngayLam: '2026-09-02', // Quốc khánh, hệ số 2
      gioBatDauCa: '12:00',
      gioVao: '12:00',
      gioRa: '18:00',
      mucLuong: 23000,
      tinhTrang: 'Chính thức',
      ngayVaoLam: '2024-01-01',
    }),
  ];

  const result = payroll.computePayslip({
    lines,
    tienUngLuong: 500000,
    chenhLechKetChuyen: 50000,
  });

  // 138.000 (6h thường) + 276.000 (6h lễ ×2) = 414.000
  assert.equal(result.luongTheoGioLam, 414000);
  assert.equal(result.tongGioLam, 12);
  assert.equal(result.tienPhat, 0);
  assert.equal(result.tienUngLuong, 500000);
  assert.equal(result.chenhLechKetChuyen, 50000);
  assert.equal(result.thucNhan, 414000 + 50000 - 0 - 500000);
});

test('computePayslip: trừ cả phạt đi trễ và phạt bỏ ca', () => {
  const lines = [
    payroll.computeShiftLine({
      ngayLam: '2026-11-10',
      gioBatDauCa: '06:00',
      gioVao: '06:15',
      gioRa: '12:00',
      mucLuong: 23000,
      tinhTrang: 'Chính thức',
      ngayVaoLam: '2024-01-01',
    }),
    payroll.computeShiftLine({
      ngayLam: '2026-11-11',
      gioBatDauCa: '06:00',
      gioVao: null,
      gioRa: null,
      mucLuong: 23000,
      tinhTrang: 'Chính thức',
      ngayVaoLam: '2024-01-01',
      coDonNghiDaDuyet: false,
    }),
  ];

  const result = payroll.computePayslip({ lines });

  assert.equal(result.tienPhat, 150000, '50.000 đi trễ + 100.000 bỏ ca');
  assert.equal(result.thucNhan, result.luongTheoGioLam - 150000);
});

test('computePayslip: tách giờ thường / cuối tuần / ngày lễ', () => {
  const base = {
    gioBatDauCa: '06:00',
    gioVao: '06:00',
    gioRa: '12:00',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
  };

  const lines = [
    payroll.computeShiftLine({ ...base, ngayLam: '2026-11-10' }), // Thứ Ba
    payroll.computeShiftLine({ ...base, ngayLam: '2026-11-07' }), // Thứ Bảy
    payroll.computeShiftLine({ ...base, ngayLam: '2026-09-02' }), // Quốc khánh
  ];

  const result = payroll.computePayslip({ lines });

  assert.equal(result.tongGioThuong, 6);
  assert.equal(result.tongGioCuoiTuan, 6);
  assert.equal(result.tongGioLe, 6);
  assert.equal(result.tongGioLam, 18);
});

test('computePayslip: không có dòng nào vẫn trả về 0 an toàn', () => {
  const result = payroll.computePayslip({ lines: [] });
  assert.equal(result.tongGioLam, 0);
  assert.equal(result.luongTheoGioLam, 0);
  assert.equal(result.thucNhan, 0);
});

/* -------------------------------------------------------------------------- */
/* Tiện ích phụ trợ                                                           */
/* -------------------------------------------------------------------------- */

test('daysBetween: đếm đúng số ngày', () => {
  assert.equal(payroll.daysBetween('2026-01-01', '2026-01-01'), 0);
  assert.equal(payroll.daysBetween('2026-01-01', '2026-01-08'), 7);
  assert.equal(payroll.daysBetween('2026-02-28', '2026-03-01'), 1);
});

test('loadHolidays: nạp được cấu hình ngày lễ', () => {
  payroll.clearHolidayCache();
  const map = payroll.loadHolidays();
  assert.ok(map.size > 0, 'Phải có ít nhất một ngày lễ trong config/holidays.json');
  assert.ok(map.has('2026-09-02'));
});
