'use strict';

/**
 * Kiểm thử phần dựng dữ liệu của UC13.1 (sinh bảng lương).
 *
 * Chỉ kiểm tra hàm thuần: mốc kỳ lương, gom ca theo nhân viên, áp công thức
 * trong src/utils/payroll.js và gắn khoản ứng. Phần truy vấn/ghi CSDL được
 * kiểm tra thủ công bằng scripts/payroll.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/payroll.service');

/** Bộ sinh mã tuần tự để kết quả kiểm thử ổn định. */
function makeSequence(prefix, digits) {
  let next = 0;
  return () => `${prefix}${String((next += 1)).padStart(digits, '0')}`;
}

/** Một ca làm việc đã đọc từ CSDL. */
function makeShift(overrides = {}) {
  return {
    maLich: 'LLV0001',
    maNV: 'NV001',
    hoTen: 'Nguyễn Việt Đạt',
    mucLuong: 23000,
    tinhTrang: 'Chính thức',
    ngayVaoLam: '2024-01-01',
    ngayISO: '2026-10-01',
    gioBatDau: '06:00',
    gioVao: '06:00',
    gioRa: '12:00',
    coDonNghi: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Mốc kỳ lương (BR-UC13.1-01)                                                */
/* -------------------------------------------------------------------------- */

test('periodMeta: mã kỳ, khoảng ngày và ngày chi trả 05 tháng sau', () => {
  const meta = service.periodMeta(2026, 10);
  assert.equal(meta.maBL, 'BL202610');
  assert.equal(meta.startISO, '2026-10-01');
  assert.equal(meta.endISO, '2026-10-31');
  assert.equal(meta.payISO, '2026-11-05');
  assert.equal(meta.nextStartISO, '2026-11-01');
});

test('periodMeta: tháng 12 chi trả sang năm sau', () => {
  const meta = service.periodMeta(2026, 12);
  assert.equal(meta.maBL, 'BL202612');
  assert.equal(meta.payISO, '2027-01-05');
  assert.equal(meta.nextStartISO, '2027-01-01');
});

test('periodMeta: tháng không hợp lệ bị từ chối', () => {
  assert.throws(() => service.periodMeta(2026, 0), /Kỳ lương không hợp lệ/);
  assert.throws(() => service.periodMeta(2026, 13), /Kỳ lương không hợp lệ/);
});

test('previousMonth: tháng 1 lùi về tháng 12 năm trước', () => {
  assert.deepEqual(service.previousMonth('2026-01-15'), { year: 2025, month: 12 });
  assert.deepEqual(service.previousMonth('2026-11-12'), { year: 2026, month: 10 });
});

/* -------------------------------------------------------------------------- */
/* Chỉ sinh cho tháng đã kết thúc                                             */
/* -------------------------------------------------------------------------- */

test('generateMonthlyPayroll: tháng đang diễn ra bị bỏ qua', async () => {
  const result = await service.generateMonthlyPayroll({
    year: 2026,
    month: 11,
    today: '2026-11-12',
  });
  assert.equal(result.created, false);
  assert.equal(result.reason, service.RESULT.NOT_ENDED);
});

test('generateMonthlyPayroll: tháng không hợp lệ ném lỗi', async () => {
  await assert.rejects(
    () => service.generateMonthlyPayroll({ year: 2026, month: 13, today: '2026-11-12' }),
    /Kỳ lương không hợp lệ/,
  );
});

/* -------------------------------------------------------------------------- */
/* Bước 1 + 2 — dựng dòng chi tiết và phiếu lương                             */
/* -------------------------------------------------------------------------- */

test('buildPeriodPayroll: đủ giờ, đi trễ, bỏ ca, nghỉ có phép và khoản ứng', () => {
  const shifts = [
    makeShift({ maLich: 'LLV0001', ngayISO: '2026-10-01', gioVao: '06:00', gioRa: '12:00' }),
    makeShift({ maLich: 'LLV0002', ngayISO: '2026-10-02', gioVao: '06:15', gioRa: '12:00' }),
    makeShift({ maLich: 'LLV0003', ngayISO: '2026-10-03', gioVao: null, gioRa: null }),
    makeShift({
      maLich: 'LLV0004',
      ngayISO: '2026-10-04',
      gioVao: null,
      gioRa: null,
      coDonNghi: true,
    }),
  ];

  const built = service.buildPeriodPayroll({
    maBL: 'BL202610',
    shifts,
    advances: [{ maUL: 'UL0001', maNV: 'NV001', soTien: 100000 }],
    nextMaPL: makeSequence('PL', 5),
    nextMaCTL: makeSequence('CTL', 5),
  });

  assert.equal(built.payslips.length, 1, 'mỗi nhân viên một phiếu');
  assert.equal(built.details.length, 4, 'mỗi ca một dòng chi tiết');

  const slip = built.payslips[0];
  assert.equal(slip.MaPL, 'PL00001');
  assert.equal(slip.MaND, 'NV001');
  assert.equal(slip.MaBL, 'BL202610');
  assert.equal(slip.TongGioLam, 11.75, '6h + 5,75h');
  assert.equal(slip.LuongTheoGioLam, 270250, '138.000 + 132.250');
  assert.equal(slip.TienPhat, 150000, '50.000 đi trễ + 100.000 bỏ ca');
  assert.equal(slip.TienUngLuong, 100000);
  assert.equal(slip.ChenhLechKetChuyen, 0, 'kết chuyển xử lý ở UC13.3');

  assert.deepEqual(
    built.details.map((line) => [line.SoGioLam, line.PhatDiTre, line.PhatBoCa]),
    [
      [6, 0, 0],
      [5.75, 50000, 0],
      [0, 0, 100000],
      [0, 0, 0], // nghỉ có đơn đã duyệt: không phạt
    ],
  );

  assert.deepEqual(built.advanceLinks, [{ maUL: 'UL0001', maPL: 'PL00001' }]);
});

test('buildPeriodPayroll: thử việc dùng 21.000đ/giờ trong 7 ngày đầu', () => {
  const built = service.buildPeriodPayroll({
    maBL: 'BL202610',
    shifts: [
      makeShift({
        maNV: 'NV004',
        ngayVaoLam: '2026-10-01',
        tinhTrang: 'Thử việc',
        maLich: 'LLV0010',
        ngayISO: '2026-10-02',
      }),
      makeShift({
        maNV: 'NV004',
        ngayVaoLam: '2026-10-01',
        tinhTrang: 'Thử việc',
        maLich: 'LLV0011',
        ngayISO: '2026-10-10',
      }),
    ],
    nextMaPL: makeSequence('PL', 5),
    nextMaCTL: makeSequence('CTL', 5),
  });

  assert.deepEqual(
    built.details.map((line) => line.MucLuong),
    [21000, 23000],
    'ngày thứ 9 trở đi dùng MucLuong',
  );
  assert.equal(built.payslips[0].LuongTheoGioLam, 264000);
});

test('buildPeriodPayroll: khoản ứng chỉ gắn đúng nhân viên', () => {
  const built = service.buildPeriodPayroll({
    maBL: 'BL202610',
    shifts: [
      makeShift({ maNV: 'NV001', maLich: 'LLV0001' }),
      makeShift({ maNV: 'NV002', maLich: 'LLV0002', ngayISO: '2026-10-02' }),
    ],
    advances: [{ maUL: 'UL0002', maNV: 'NV002', soTien: 500000 }],
    nextMaPL: makeSequence('PL', 5),
    nextMaCTL: makeSequence('CTL', 5),
  });

  const byEmployee = new Map(built.payslips.map((slip) => [slip.MaND, slip]));
  assert.equal(byEmployee.get('NV001').TienUngLuong, 0);
  assert.equal(byEmployee.get('NV002').TienUngLuong, 500000);
  assert.deepEqual(built.advanceLinks, [{ maUL: 'UL0002', maPL: 'PL00002' }]);
});

test('buildPeriodPayroll: kỳ không có ca nào trả về rỗng', () => {
  const built = service.buildPeriodPayroll({
    maBL: 'BL202610',
    shifts: [],
    nextMaPL: makeSequence('PL', 5),
    nextMaCTL: makeSequence('CTL', 5),
  });

  assert.deepEqual(built, { payslips: [], details: [], advanceLinks: [] });
});
