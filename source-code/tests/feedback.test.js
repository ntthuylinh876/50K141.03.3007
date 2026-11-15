'use strict';

/**
 * Kiểm thử xử lý phản hồi phiếu lương (UC08 — luồng thay thế 4a).
 * Chỉ kiểm tra phần thuần: trạng thái và định dạng thời gian gửi.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/feedback.service');

test('trạng thái phản hồi gồm đúng 2 giá trị', () => {
  assert.deepEqual(Object.values(service.STATUS).sort(), ['Chờ xử lý', 'Đã xử lý'].sort());
});

test('nhãn + màu trạng thái phản hồi', () => {
  assert.deepEqual(service.statusMeta('Đã xử lý'), { label: 'Đã xử lý', tone: 'success' });
  assert.deepEqual(service.statusMeta('Chờ xử lý'), { label: 'Chờ xử lý', tone: 'warning' });
});

test('thời gian gửi phản hồi hiển thị đúng', () => {
  const value = new Date(2026, 10, 2, 8, 5, 0);
  assert.equal(service.formatSentAt(value), '08:05 02/11/2026');
});

test('thời gian gửi rỗng khi không có giá trị', () => {
  assert.equal(service.formatSentAt(undefined), '');
});
