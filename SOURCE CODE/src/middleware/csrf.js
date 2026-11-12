'use strict';

/**
 * Bảo vệ CSRF cho các form server-rendered.
 * Token lưu trong session, gửi kèm mỗi form qua hidden input `_csrf`.
 */

const crypto = require('node:crypto');
const { AppError } = require('../utils/http-error');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Tạo (nếu chưa có) và đưa token ra view. */
function attachCsrfToken(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

/** Kiểm tra token trên mọi request thay đổi dữ liệu. */
function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  const expected = req.session && req.session.csrfToken;

  if (!sent || !expected || !timingSafeEqualStr(sent, expected)) {
    return next(
      new AppError(403, 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang và thử lại.', {
        code: 'CSRF_INVALID',
      }),
    );
  }
  return next();
}

module.exports = { attachCsrfToken, verifyCsrfToken };
