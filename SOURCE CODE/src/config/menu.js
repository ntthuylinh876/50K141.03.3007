'use strict';

/**
 * Cấu hình thanh điều hướng theo từng vai trò.
 * Thứ tự và nhãn bám đúng đặc tả màn hình (mục 7.2.1.4, 7.2.2.1, 7.2.3.2).
 */

const { ROLES } = require('../middleware/auth');

/** Menu của Nhân viên — 7.2.1.4. */
const EMPLOYEE_MENU = [
  { key: 'home', label: 'Trang chủ', href: '/nhan-vien/trang-chu', icon: 'home' },
  {
    key: 'requests',
    label: 'Đơn yêu cầu',
    icon: 'file',
    children: [
      { key: 'leave', label: 'Xin nghỉ/đổi ca', href: '/nhan-vien/don-yeu-cau/xin-nghi-doi-ca' },
      { key: 'advance', label: 'Ứng lương', href: '/nhan-vien/don-yeu-cau/ung-luong' },
    ],
  },
  { key: 'payslip', label: 'Phiếu lương', href: '/nhan-vien/phieu-luong', icon: 'wallet' },
  { key: 'change-password', label: 'Đổi mật khẩu', href: '/doi-mat-khau', icon: 'lock' },
];

/** Menu của Quản lý — 7.2.2.1. */
const MANAGER_MENU = [
  { key: 'home', label: 'Trang chủ', href: '/quan-ly/trang-chu', icon: 'home' },
  {
    key: 'approvals',
    label: 'Duyệt đơn đăng ký',
    icon: 'clipboard-check',
    children: [
      { key: 'approve-leave', label: 'Đơn xin nghỉ/đổi ca', href: '/quan-ly/duyet-don/xin-nghi-doi-ca' },
      { key: 'approve-cover', label: 'Đơn xin làm thay', href: '/quan-ly/duyet-don/lam-thay' },
    ],
  },
  {
    key: 'attendance',
    label: 'Quản lý chấm công',
    icon: 'clock',
    children: [
      { key: 'approve-supplement', label: 'Duyệt chấm công bổ sung', href: '/quan-ly/cham-cong/duyet-bo-sung' },
      { key: 'attendance-data', label: 'Dữ liệu chấm công', href: '/quan-ly/cham-cong/du-lieu' },
    ],
  },
  {
    key: 'payroll',
    label: 'Quản lý lương',
    icon: 'wallet',
    children: [
      { key: 'payroll-list', label: 'Bảng lương', href: '/quan-ly/luong/bang-luong' },
      { key: 'payroll-approve', label: 'Duyệt bảng lương', href: '/quan-ly/luong/duyet' },
      { key: 'payroll-update', label: 'Cập nhật bảng lương', href: '/quan-ly/luong/cap-nhat' },
    ],
  },
  { key: 'change-password', label: 'Đổi mật khẩu', href: '/doi-mat-khau', icon: 'lock' },
];

/**
 * Menu của Chủ quán: kế thừa Quản lý (đổi tiền tố /quan-ly → /chu-quan),
 * BỎ "Đổi mật khẩu", THÊM "Quản lý thông tin nhân viên" (7.2.3.2).
 */
function buildOwnerMenu() {
  const inherited = MANAGER_MENU.filter((item) => item.key !== 'change-password').map((item) => {
    const clone = { ...item };
    if (clone.href) clone.href = clone.href.replace('/quan-ly', '/chu-quan');
    if (clone.children) {
      clone.children = clone.children.map((child) => ({
        ...child,
        href: child.href.replace('/quan-ly', '/chu-quan'),
      }));
    }
    return clone;
  });

  const employeeManagement = {
    key: 'employees',
    label: 'Quản lý thông tin nhân viên',
    icon: 'users',
    children: [
      { key: 'employee-add', label: 'Thêm nhân viên', href: '/chu-quan/nhan-vien/them' },
      { key: 'employee-edit', label: 'Sửa thông tin nhân viên', href: '/chu-quan/nhan-vien/sua' },
      { key: 'employee-delete', label: 'Xóa nhân viên', href: '/chu-quan/nhan-vien/xoa' },
    ],
  };

  // Chèn "Quản lý thông tin nhân viên" ngay trước mục cuối (Đăng xuất nằm ngoài menu)
  return [...inherited, employeeManagement];
}

const OWNER_MENU = buildOwnerMenu();

const MENUS = Object.freeze({
  [ROLES.EMPLOYEE]: EMPLOYEE_MENU,
  [ROLES.MANAGER]: MANAGER_MENU,
  [ROLES.OWNER]: OWNER_MENU,
});

/**
 * Gắn trạng thái đang chọn / đang mở cho từng mục menu.
 * @param {string} role
 * @param {string} currentPath
 */
function buildMenu(role, currentPath) {
  const menu = MENUS[role];
  if (!menu) return [];

  return menu.map((item) => {
    if (!item.children) {
      const isActive = currentPath === item.href || currentPath.startsWith(item.href + '/');
      return { ...item, isActive, isOpen: false };
    }

    const children = item.children.map((child) => ({
      ...child,
      isActive: currentPath === child.href || currentPath.startsWith(child.href + '/'),
    }));
    const isOpen = children.some((c) => c.isActive);
    return { ...item, children, isActive: isOpen, isOpen };
  });
}

module.exports = { EMPLOYEE_MENU, MANAGER_MENU, OWNER_MENU, buildMenu };
