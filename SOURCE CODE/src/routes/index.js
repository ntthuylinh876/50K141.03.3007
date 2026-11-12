'use strict';

/**
 * Gắn toàn bộ route vào một router gốc.
 */

const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { EMPLOYEE_MENU, MANAGER_MENU, OWNER_MENU } = require('../config/menu');
const { registerPlaceholders } = require('./placeholders');

const router = express.Router();

/* --- Route thật --- */
router.use('/', require('./auth.routes'));
router.use('/nhan-vien', require('./employee.routes'));
router.use('/quan-ly', require('./manager.routes'));
router.use('/chu-quan', require('./owner.routes'));
router.use('/demo', require('./demo.routes'));

/* --- Route tạm cho các màn hình chưa xây dựng --- */
registerPlaceholders(router, EMPLOYEE_MENU, {
  phase: 'Giai đoạn 2',
  guard: requireLogin,
  // Hai lối tắt trên màn hình Chấm công, không nằm trong menu nên phải khai báo riêng.
  extra: [
    { href: '/nhan-vien/cham-cong-bo-sung', label: 'Chấm công bổ sung' },
    { href: '/nhan-vien/dang-ky-ca-lam', label: 'Đăng ký ca làm' },
  ],
});
registerPlaceholders(router, MANAGER_MENU, {
  phase: 'Giai đoạn 3',
  guard: requireLogin,
  // Hai thẻ lối tắt trên Trang chủ Quản lý, không nằm trong menu.
  extra: [
    { href: '/quan-ly/ca-lam/cap-nhat', label: 'Cập nhật ca làm' },
    { href: '/quan-ly/ca-lam/danh-sach', label: 'Xem danh sách ca làm' },
  ],
});
registerPlaceholders(router, OWNER_MENU, {
  phase: 'Giai đoạn 4',
  guard: requireLogin,
  // Hai thẻ lối tắt trên Trang chủ Chủ quán, không nằm trong menu.
  extra: [
    { href: '/chu-quan/ca-lam/cap-nhat', label: 'Cập nhật ca làm' },
    { href: '/chu-quan/ca-lam/danh-sach', label: 'Xem danh sách ca làm' },
  ],
});

module.exports = router;
