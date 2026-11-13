'use strict';

/**
 * Kiểm thử luật duyệt ứng lương (UC09 → UC13.1).
 * Chỉ kiểm tra phần thuần: trạng thái và định dạng thời gian gửi.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/advance.service');

test('trạng thái ứng lương gồm đúng 3 giá trị', () => {
  assert.deepEqual(Object.values(service.STATUS).sort(), [
    'Chờ duyệt',
    'Đã duyệt',
    'Từ chối',
  ].sort());
});

test('nhãn + màu trạng thái ứng lương', () => {
  assert.deepEqual(service.statusMeta('Đã duyệt'), { label: 'Đã duyệt', tone: 'success' });
  assert.deepEqual(service.statusMeta('Từ chối'), { label: 'Từ chối', tone: 'danger' });
  assert.deepEqual(service.statusMeta('Chờ duyệt'), { label: 'Chờ duyệt', tone: 'warning' });
});

test('trạng thái lạ được coi là chờ duyệt', () => {
  assert.equal(service.statusMeta('Khác').tone, 'warning');
});

test('thời gian gửi hiển thị giờ:phút + ngày/tháng/năm', () => {
  const value = new Date(2026, 9, 28, 10, 26, 0);
  assert.equal(service.formatSentAt(value), '10:26 28/10/2026');
});

test('thời gian gửi rỗng khi không có giá trị', () => {
  assert.equal(service.formatSentAt(null), '');
});
