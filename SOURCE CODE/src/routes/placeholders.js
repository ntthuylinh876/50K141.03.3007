'use strict';

/**
 * Đăng ký route tạm cho các màn hình chưa hoàn thiện.
 *
 * Mục đích: ở Giai đoạn 1, thanh điều hướng đã hiển thị đúng toàn bộ chức năng
 * theo đặc tả, nên các liên kết phải dẫn tới một trang thông báo thay vì lỗi 404.
 * Khi hoàn thiện từng giai đoạn, route thật được đăng ký TRƯỚC nên sẽ ưu tiên
 * được dùng (Express chọn handler đầu tiên khớp).
 */

/** Làm phẳng cây menu thành danh sách { key, label, href }. */
function flattenMenu(menu) {
  const out = [];
  for (const item of menu) {
    if (item.children) {
      for (const child of item.children) {
        out.push({ key: child.key, label: child.label, href: child.href });
      }
    } else if (item.href) {
      out.push({ key: item.key, label: item.label, href: item.href });
    }
  }
  return out;
}

/**
 * @param {import('express').Router} router
 * @param {Array} menu      Menu của vai trò (EMPLOYEE_MENU / MANAGER_MENU / OWNER_MENU)
 * @param {Object} options
 * @param {string} options.phase   Giai đoạn sẽ hoàn thiện màn hình
 * @param {Function} [options.guard] Middleware bảo vệ (ví dụ requireLogin)
 * @param {Array<{href: string, label: string}>} [options.extra]
 *        Màn hình chỉ xuất hiện dưới dạng lối tắt (không có trong menu).
 */
function registerPlaceholders(router, menu, options) {
  const guard = options.guard || ((req, res, next) => next());

  const screens = flattenMenu(menu).map((item) => ({
    href: item.href,
    label: item.label,
    activeMenu: item.key,
  }));

  for (const extra of options.extra || []) {
    screens.push({ href: extra.href, label: extra.label, activeMenu: null });
  }

  for (const screen of screens) {
    if (screen.href === '/doi-mat-khau') continue; // đã có route thật

    router.get(screen.href, guard, (req, res) => {
      res.render('pages/shared/coming-soon', {
        pageTitle: screen.label,
        activeMenu: screen.activeMenu,
        screenTitle: screen.label,
        phase: options.phase,
      });
    });
  }
}

module.exports = { flattenMenu, registerPlaceholders };
