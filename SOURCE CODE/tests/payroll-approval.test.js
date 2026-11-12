'use strict';

/**
 * Kiểm thử luật duyệt bảng lương 2 bước (UC13.2 / BR-UC13.2-01).
 *
 * Chỉ kiểm tra phần thuần (không truy vấn CSDL): bước duyệt theo vai trò và
 * nhãn trạng thái. Luồng ghi dữ liệu được kiểm tra bằng script tích hợp.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/payroll-admin.service');

test('trạng thái bảng lương còn đúng 4 giá trị sau khi bỏ "Đã chi trả"', () => {
  assert.deepEqual(Object.values(service.STATUS).sort(), [
    'Chờ chủ quán duyệt',
    'Chưa duyệt',
    'Từ chối',
    'Đã duyệt',
  ].sort());
});

test('quản lý duyệt bước 1: Chưa duyệt → Chờ chủ quán duyệt', () => {
  const step = service.approvalTransition('manager');
  assert.equal(step.from, 'Chưa duyệt');
  assert.equal(step.to, 'Chờ chủ quán duyệt');
  assert.equal(step.message, 'Bảng lương đã được gửi chủ quán duyệt!');
});

test('chủ quán duyệt bước 2: Chờ chủ quán duyệt → Đã duyệt', () => {
  const step = service.approvalTransition('owner');
  assert.equal(step.from, 'Chờ chủ quán duyệt');
  assert.equal(step.to, 'Đã duyệt');
  assert.equal(step.message, 'Bảng lương đã được duyệt!');
});

test('vai trò không xác định chỉ được duyệt bước 1 (không vượt cấp)', () => {
  const step = service.approvalTransition(undefined);
  assert.equal(step.from, 'Chưa duyệt');
  assert.equal(step.to, 'Chờ chủ quán duyệt');
});

test('nhãn trạng thái: Đã duyệt và Từ chối dùng màu tương ứng', () => {
  assert.deepEqual(service.statusMeta('Đã duyệt'), { label: 'Đã duyệt', tone: 'success' });
  assert.deepEqual(service.statusMeta('Từ chối'), { label: 'Từ chối', tone: 'danger' });
  assert.deepEqual(service.statusMeta('Chờ chủ quán duyệt'), {
    label: 'Chờ chủ quán duyệt',
    tone: 'info',
  });
  assert.deepEqual(service.statusMeta('Chưa duyệt'), { label: 'Chưa duyệt', tone: 'warning' });
});
