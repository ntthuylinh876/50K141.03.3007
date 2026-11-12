'use strict';

/**
 * Route của Chủ quán.
 * Chủ quán kế thừa Quản lý (trừ Đổi mật khẩu) và thêm Quản lý thông tin nhân viên.
 * Giai đoạn 1: chỉ Trang chủ. Các màn hình còn lại sẽ bổ sung ở Giai đoạn 4.
 */

const express = require('express');
const { requireLogin, requireOwner } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin, requireOwner);

router.get('/trang-chu', (req, res) => {
  res.render('pages/owner/home', {
    pageTitle: 'Trang chủ',
    activeMenu: 'home',
  });
});

// Chủ quán kế thừa toàn bộ màn hình quản lý (ca làm, duyệt đơn, chấm công, lương).
router.use('/', require('./manager.routes'));

module.exports = router;
