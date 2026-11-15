'use strict';

/**
 * Xác thực & phân quyền.
 *
 * Ba vai trò: Nhân viên (employee), Quản lý (manager), Chủ quán (owner).
 * Chủ quán KẾ THỪA toàn bộ quyền của Quản lý, trừ Đổi mật khẩu.
 */

const { unauthorized, forbidden } = require('../utils/http-error');

const ROLES = Object.freeze({
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  OWNER: 'owner',
});

const ROLE_LABEL = Object.freeze({
  employee: 'Nhân viên',
  manager: 'Quản lý',
  owner: 'Chủ quán',
});

/** Tiền tố trang chủ theo vai trò. */
const HOME_PATH = Object.freeze({
  employee: '/nhan-vien/trang-chu',
  manager: '/quan-ly/trang-chu',
  owner: '/chu-quan/trang-chu',
});

/** Request này có mong đợi JSON (gọi API) hay HTML (điều hướng trang)? */
function wantsJson(req) {
  if (req.path.startsWith('/api/')) return true;
  const accept = req.get('accept') || '';
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  return req.xhr === true;
}

/**
 * Vai trò `user` có thỏa mãn vai trò `required` không?
 * Quản lý bao gồm Chủ quán (kế thừa).
 */
function hasRole(user, required) {
  if (!user) return false;
  if (required === ROLES.MANAGER) {
    return user.role === ROLES.MANAGER || user.role === ROLES.OWNER;
  }
  return user.role === required;
}

/**
 * Đưa thông tin người dùng hiện tại vào `res.locals` để view dùng chung.
 * Phải chạy trước mọi route render giao diện.
 */
function loadCurrentUser(req, res, next) {
  const user = req.session?.user || null;
  // Tên ngắn để chào trên thanh trên cùng (ví dụ "Nguyễn Việt Đạt" → "Việt Đạt"),
  // đúng như ảnh thiết kế "Xin chào, Việt Đạt".
  if (user) {
    const parts = String(user.name || '').trim().split(/\s+/);
    user.shortName = parts.slice(-2).join(' ') || user.name;
  }
  res.locals.currentUser = user;
  res.locals.roleLabel = user ? ROLE_LABEL[user.role] : null;
  res.locals.homePath = user ? HOME_PATH[user.role] : '/dang-nhap';
  next();
}

/** Bắt buộc đã đăng nhập. */
function requireLogin(req, res, next) {
  if (req.session?.user) return next();

  if (wantsJson(req)) {
    return next(unauthorized());
  }
  // Lưu lại đích đến để quay về sau khi đăng nhập
  if (req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/dang-nhap');
}

/**
 * Bắt buộc có một trong các vai trò cho trước.
 * Truyền ROLES.MANAGER nghĩa là Quản lý HOẶC Chủ quán.
 */
function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    const user = req.session?.user;
    if (!user) {
      return wantsJson(req) ? next(unauthorized()) : res.redirect('/dang-nhap');
    }
    const ok = roles.some((r) => hasRole(user, r));
    if (ok) return next();

    if (wantsJson(req)) return next(forbidden());
    return res.status(403).render('pages/errors/error', {
      title: 'Không có quyền truy cập',
      statusCode: 403,
      message: 'Bạn không có quyền truy cập chức năng này.',
      icon: 'lock',
      stack: null,
    });
  };
}

/** Chỉ Chủ quán. */
const requireOwner = requireRole(ROLES.OWNER);

/** Quản lý hoặc Chủ quán. */
const requireManager = requireRole(ROLES.MANAGER);

/** Chỉ Nhân viên (không bao gồm quản lý/chủ quán). */
const requireEmployee = requireRole(ROLES.EMPLOYEE);

module.exports = {
  ROLES,
  ROLE_LABEL,
  HOME_PATH,
  hasRole,
  wantsJson,
  loadCurrentUser,
  requireLogin,
  requireRole,
  requireOwner,
  requireManager,
  requireEmployee,
};
