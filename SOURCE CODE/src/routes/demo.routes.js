'use strict';

/**
 * Route phục vụ chế độ demo (chỉ hoạt động khi DEMO_MODE=true).
 * Công tắc "Wi-Fi quán" cho phép thử cả hai nhánh của UC02/UC03.
 */

const express = require('express');
const config = require('../config/env');
const { requireLogin } = require('../middleware/auth');
const { setDemoWifi } = require('../middleware/wifi');

const router = express.Router();

router.post('/wifi', requireLogin, (req, res) => {
  if (!config.wifi.demoMode) {
    return res.status(404).render('pages/errors/error', {
      title: 'Không tìm thấy trang',
      statusCode: 404,
      message: 'Chức năng demo đang tắt.',
      icon: 'search',
      stack: null,
    });
  }

  const enabled = req.body?.enabled === '1';
  setDemoWifi(req, enabled);

  // Quay lại đúng trang vừa thao tác (chỉ chấp nhận đường dẫn nội bộ)
  let back = '/';
  const referer = req.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      back = url.pathname + url.search;
    } catch {
      back = '/';
    }
  }
  if (!back.startsWith('/')) back = '/';

  return res.redirect(back);
});

module.exports = router;
