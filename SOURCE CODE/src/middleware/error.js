'use strict';

/**
 * Xử lý lỗi tập trung: trả JSON cho API, render trang lỗi cho giao diện.
 */

const config = require('../config/env');
const { wantsJson } = require('./auth');

/** Không khớp route nào. */
function notFoundHandler(req, res, next) {
  if (wantsJson(req)) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy tài nguyên.' });
  }
  return res.status(404).render('pages/errors/error', {
    title: 'Không tìm thấy trang',
    statusCode: 404,
    message: 'Trang bạn tìm không tồn tại hoặc đã bị di chuyển.',
    icon: 'search',
  });
}

/** Xử lý lỗi chung. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = Number(err.status) || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error(`[LỖI ${status}] ${req.method} ${req.originalUrl}`);
    console.error(err);
  }

  if (wantsJson(req)) {
    return res.status(status).json({
      ok: false,
      message: isServerError ? 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.' : err.message,
      code: err.code || undefined,
      details: err.details || undefined,
    });
  }

  if (status === 403 && err.code === 'WIFI_DENIED') {
    return res.status(403).render('pages/errors/wifi', {
      title: 'Kết nối sai Wifi',
      message: err.message,
    });
  }

  if (status === 401) {
    return res.redirect('/dang-nhap');
  }

  return res.status(status).render('pages/errors/error', {
    title: isServerError ? 'Lỗi hệ thống' : 'Không thể thực hiện',
    statusCode: status,
    message: isServerError
      ? 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau hoặc liên hệ quản lý.'
      : err.message,
    icon: status === 403 ? 'lock' : 'alert',
    stack: !config.isProduction && isServerError ? err.stack : null,
  });
}

module.exports = { notFoundHandler, errorHandler };
