'use strict';

/**
 * Kiểm thử luật đề xuất chỉnh sửa lương (UC13.3 — O3).
 *
 * Chỉ kiểm tra phần thuần (không truy vấn CSDL): trạng thái, cách tính lại
 * thực nhận, kỳ kế tiếp và chặn sai vai trò. Luồng ghi dữ liệu được kiểm tra
 * bằng script tích hợp trên CSDL thật.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/payroll-proposal.service');

test('trạng thái đề xuất gồm đúng 3 giá trị', () => {
  assert.deepEqual(Object.values(service.STATUS).sort(), [
    'Chờ chủ quán duyệt',
    'Đã duyệt',
    'Từ chối',
  ].sort());
});

test('chỉ bảng lương đã duyệt mới nhận đề xuất (UC13.3 pre-condition)', () => {
  assert.equal(service.PERIOD_APPROVED, 'Đã duyệt');
});

test('nhãn + màu trạng thái đề xuất', () => {
  assert.deepEqual(service.proposalStatusMeta('Chờ chủ quán duyệt'), {
    label: 'Chờ chủ quán duyệt',
    tone: 'warning',
  });
  assert.deepEqual(service.proposalStatusMeta('Đã duyệt'), {
    label: 'Đã duyệt',
    tone: 'success',
  });
  assert.deepEqual(service.proposalStatusMeta('Từ chối'), {
    label: 'Từ chối',
    tone: 'danger',
  });
});

test('định dạng số giờ ngắn: 4h và 3h50p', () => {
  assert.equal(service.formatHoursShort(4), '4h');
  assert.equal(service.formatHoursShort(3.8333), '3h50p');
  assert.equal(service.formatHoursShort(0), '0h');
});

test('kỳ kế tiếp: tháng 12 sang tháng 1 năm sau', () => {
  assert.deepEqual(service.nextPeriodOf(2026, 12), { year: 2027, month: 1 });
  assert.deepEqual(service.nextPeriodOf(2026, 8), { year: 2026, month: 9 });
});

test('tính lại thực nhận ca và tháng theo ví dụ 7.2.3.45', () => {
  // Phiếu hiện tại: vào 18:10, ra 22:00 = 3h50p (3,83 giờ), phạt 50.000.
  const line = {
    donGia: 23000,
    heSo: 1,
    hienTai: {
      gioVao: '18:10',
      gioRa: '22:00',
      soGio: 3.83,
      phat: 50000,
      ung: 0,
      thucNhanCa: 38167,
      thucNhanThang: 1050167,
    },
  };

  // Đề xuất: sửa giờ vào thành 18:00 và bỏ phạt.
  const deXuat = service.applyValues(line, {
    gioVao: '18:00',
    gioRa: '22:00',
    phat: 0,
    ung: 0,
  });

  assert.equal(deXuat.soGio, 4);
  assert.equal(deXuat.thucNhanCa, 92000);
  assert.equal(deXuat.thucNhanThang, 1104000);
  assert.equal(service.formatHoursShort(deXuat.soGio), '4h');
});

test('đề xuất giữ nguyên giờ nhưng đổi tiền ứng thì thực nhận tháng giảm', () => {
  const line = {
    donGia: 25000,
    heSo: 1,
    hienTai: {
      gioVao: '06:00',
      gioRa: '12:00',
      soGio: 6,
      phat: 0,
      ung: 0,
      thucNhanCa: 150000,
      thucNhanThang: 3000000,
    },
  };

  const deXuat = service.applyValues(line, {
    gioVao: '06:00',
    gioRa: '12:00',
    phat: 0,
    ung: 500000,
  });

  assert.equal(deXuat.thucNhanCa, 150000);
  assert.equal(deXuat.thucNhanThang, 2500000);
});

test('chủ quán không gửi đề xuất chỉnh sửa lương', async () => {
  await assert.rejects(
    service.createProposal('PL00001', 'CTL00001', {}, 'QL002', 'owner'),
    (err) => err.status === 400 && /Chủ quán/.test(err.message),
  );
});

test('chỉ chủ quán được duyệt / từ chối đề xuất', async () => {
  await assert.rejects(
    service.approveProposal('PH0001', { role: 'manager' }),
    (err) => err.status === 400 && /chủ quán/i.test(err.message),
  );
  await assert.rejects(
    service.rejectProposal('PH0001', 'Không hợp lệ', 'manager'),
    (err) => err.status === 400 && /chủ quán/i.test(err.message),
  );
});
