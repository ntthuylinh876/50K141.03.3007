'use strict';

/**
 * Nghiệp vụ xác thực: đăng nhập, đổi mật khẩu.
 *
 * Thông báo lỗi lấy nguyên văn từ đặc tả màn hình (7.2.1.2, 7.2.1.3, 7.2.1.40)
 * và luồng ngoại lệ của UC01 / UC15 trong SRS.
 */

const { query, sql } = require('../config/db');
const { verifyPassword, hashPassword } = require('../utils/password');
const { AppError, badRequest, unauthorized, forbidden, notFound } = require('../utils/http-error');
const { ROLES } = require('../middleware/auth');

const MSG_LOGIN_EMPTY = 'Không được để trống Tên đăng nhập và mật khẩu !';
const MSG_LOGIN_FAILED = 'Đăng nhập không thành công';
const MSG_ACCOUNT_DISABLED = 'Tài khoản đã ngừng hoạt động. Vui lòng liên hệ chủ quán.';
const MSG_CHANGE_EMPTY = 'Vui lòng nhập đầy đủ thông tin!';
const MSG_OLD_PASSWORD_WRONG = 'Mật khẩu hiện tại không đúng!';
const MSG_CONFIRM_MISMATCH = 'Mật khẩu xác nhận không khớp!';
const MSG_SAME_AS_OLD = 'Mật khẩu mới trùng mật khẩu cũ!';
const MSG_CHANGE_SUCCESS = 'Đổi mật khẩu thành công!';
const MSG_OWNER_NO_CHANGE = 'Chủ quán không có chức năng đổi mật khẩu.';

/** Trạng thái nhân viên đã nghỉ việc (xóa mềm — quyết định C5). */
const STATUS_RESIGNED = 'Đã nghỉ';

/** Tìm tài khoản quản lý/chủ quán theo số điện thoại. */
async function findManagerByPhone(phone) {
  const result = await query(
    `SELECT q.MaQL,
            q.HoTen,
            RTRIM(q.SoDienThoai) AS SoDienThoai,
            q.MatKhau,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM ChuQuan c WHERE c.MaQL = q.MaQL)
                      THEN 1 ELSE 0 END AS BIT) AS LaChuQuan
       FROM QuanLy q
      WHERE RTRIM(q.SoDienThoai) = @phone`,
    { phone: { type: sql.VarChar(10), value: phone } },
  );
  return result.recordset[0] || null;
}

/** Tìm tài khoản nhân viên theo số điện thoại. */
async function findEmployeeByPhone(phone) {
  const result = await query(
    `SELECT MaNV,
            HoTen,
            RTRIM(SoDienThoai) AS SoDienThoai,
            MatKhau,
            TinhTrang
       FROM NhanVien
      WHERE RTRIM(SoDienThoai) = @phone`,
    { phone: { type: sql.VarChar(10), value: phone } },
  );
  return result.recordset[0] || null;
}

/**
 * Xác thực đăng nhập.
 * Tên đăng nhập là số điện thoại (BR-UC1-02), tra lần lượt QuanLy rồi NhanVien.
 *
 * @param {string} phone
 * @param {string} password
 * @returns {Promise<{id:string, role:string, name:string, phone:string}>}
 */
async function login(phone, password) {
  const cleanPhone = String(phone ?? '').trim();
  const cleanPassword = String(password ?? '');

  if (!cleanPhone || !cleanPassword) {
    throw badRequest(MSG_LOGIN_EMPTY, {
      phone: !cleanPhone ? MSG_LOGIN_EMPTY : undefined,
      password: !cleanPassword ? MSG_LOGIN_EMPTY : undefined,
    });
  }

  // 1. Quản lý / Chủ quán
  const manager = await findManagerByPhone(cleanPhone);
  if (manager) {
    const ok = await verifyPassword(cleanPassword, manager.MatKhau);
    if (!ok) throw unauthorized(MSG_LOGIN_FAILED);
    return {
      id: String(manager.MaQL).trim(),
      role: manager.LaChuQuan ? ROLES.OWNER : ROLES.MANAGER,
      name: manager.HoTen,
      phone: manager.SoDienThoai,
    };
  }

  // 2. Nhân viên
  const employee = await findEmployeeByPhone(cleanPhone);
  if (employee) {
    if (employee.TinhTrang === STATUS_RESIGNED) {
      throw forbidden(MSG_ACCOUNT_DISABLED);
    }
    const ok = await verifyPassword(cleanPassword, employee.MatKhau);
    if (!ok) throw unauthorized(MSG_LOGIN_FAILED);
    return {
      id: String(employee.MaNV).trim(),
      role: ROLES.EMPLOYEE,
      name: employee.HoTen,
      phone: employee.SoDienThoai,
    };
  }

  // Không tìm thấy ở cả hai bảng → cùng một thông báo để tránh dò tài khoản
  throw unauthorized(MSG_LOGIN_FAILED);
}

/** Đọc hash mật khẩu hiện tại của tài khoản đang đăng nhập. */
async function getStoredPassword(user) {
  if (user.role === ROLES.EMPLOYEE) {
    const rs = await query(
      'SELECT MatKhau FROM NhanVien WHERE MaNV = @id',
      { id: { type: sql.Char(10), value: user.id } },
    );
    if (!rs.recordset[0]) throw notFound('Không tìm thấy tài khoản nhân viên.');
    return rs.recordset[0].MatKhau;
  }

  const rs = await query(
    'SELECT MatKhau FROM QuanLy WHERE MaQL = @id',
    { id: { type: sql.Char(10), value: user.id } },
  );
  if (!rs.recordset[0]) throw notFound('Không tìm thấy tài khoản quản lý.');
  return rs.recordset[0].MatKhau;
}

/**
 * Đổi mật khẩu (UC15). Chủ quán KHÔNG có chức năng này.
 *
 * @param {{id:string, role:string}} user
 * @param {{currentPassword:string, newPassword:string, confirmPassword:string}} input
 * @returns {Promise<string>} thông báo thành công
 */
async function changePassword(user, input) {
  if (user.role === ROLES.OWNER) {
    throw forbidden(MSG_OWNER_NO_CHANGE);
  }

  const currentPassword = String(input.currentPassword ?? '');
  const newPassword = String(input.newPassword ?? '');
  const confirmPassword = String(input.confirmPassword ?? '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw badRequest(MSG_CHANGE_EMPTY);
  }
  if (newPassword !== confirmPassword) {
    throw badRequest(MSG_CONFIRM_MISMATCH, { confirmPassword: MSG_CONFIRM_MISMATCH });
  }
  if (newPassword.length < 6) {
    throw badRequest('Mật khẩu phải có ít nhất 6 ký tự.', {
      newPassword: 'Mật khẩu phải có ít nhất 6 ký tự.',
    });
  }
  if (newPassword.length > 72) {
    throw badRequest('Mật khẩu không được vượt quá 72 ký tự.', {
      newPassword: 'Mật khẩu không được vượt quá 72 ký tự.',
    });
  }

  const storedHash = await getStoredPassword(user);

  const currentOk = await verifyPassword(currentPassword, storedHash);
  if (!currentOk) {
    throw badRequest(MSG_OLD_PASSWORD_WRONG, { currentPassword: MSG_OLD_PASSWORD_WRONG });
  }

  const sameAsOld = await verifyPassword(newPassword, storedHash);
  if (sameAsOld) {
    throw badRequest(MSG_SAME_AS_OLD, { newPassword: MSG_SAME_AS_OLD });
  }

  const newHash = await hashPassword(newPassword);
  const table = user.role === ROLES.EMPLOYEE ? 'NhanVien' : 'QuanLy';
  const keyColumn = user.role === ROLES.EMPLOYEE ? 'MaNV' : 'MaQL';

  await query(
    `UPDATE ${table} SET MatKhau = @hash WHERE ${keyColumn} = @id`,
    {
      hash: { type: sql.VarChar(100), value: newHash },
      id: { type: sql.Char(10), value: user.id },
    },
  );

  return MSG_CHANGE_SUCCESS;
}

/** Lấy lại thông tin hiển thị của tài khoản (dùng khi cần làm mới session). */
async function getProfile(user) {
  if (user.role === ROLES.EMPLOYEE) {
    const rs = await query(
      `SELECT MaNV AS id, HoTen AS name, RTRIM(SoDienThoai) AS phone, ViTri, TinhTrang
         FROM NhanVien WHERE MaNV = @id`,
      { id: { type: sql.Char(10), value: user.id } },
    );
    const row = rs.recordset[0];
    if (!row) throw notFound('Không tìm thấy nhân viên.');
    return { ...user, ...row, id: String(row.id).trim() };
  }

  const rs = await query(
    `SELECT MaQL AS id, HoTen AS name, RTRIM(SoDienThoai) AS phone
       FROM QuanLy WHERE MaQL = @id`,
    { id: { type: sql.Char(10), value: user.id } },
  );
  const row = rs.recordset[0];
  if (!row) throw notFound('Không tìm thấy quản lý.');
  return { ...user, ...row, id: String(row.id).trim() };
}

module.exports = {
  MSG_LOGIN_EMPTY,
  MSG_LOGIN_FAILED,
  MSG_ACCOUNT_DISABLED,
  MSG_CHANGE_EMPTY,
  MSG_OLD_PASSWORD_WRONG,
  MSG_CONFIRM_MISMATCH,
  MSG_SAME_AS_OLD,
  MSG_CHANGE_SUCCESS,
  MSG_OWNER_NO_CHANGE,
  STATUS_RESIGNED,
  login,
  changePassword,
  getProfile,
};
