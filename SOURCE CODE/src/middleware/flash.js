'use strict';

/**
 * Thông báo dạng "flash": hiển thị một lần sau khi chuyển trang.
 * Dùng cho các thông báo thành công / lỗi bằng tiếng Việt theo đặc tả màn hình.
 */

function flashMiddleware(req, res, next) {
  /**
   * Đặt thông báo cho lần render kế tiếp.
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {string} message
   */
  req.flash = (type, message) => {
    if (!req.session) return;
    if (!req.session.flash) req.session.flash = [];
    req.session.flash.push({ type, message });
  };

  res.locals.flash = (req.session && req.session.flash) || [];
  if (req.session && req.session.flash) delete req.session.flash;

  next();
}

module.exports = { flashMiddleware };
