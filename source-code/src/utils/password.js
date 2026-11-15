'use strict';

/**
 * Băm và kiểm tra mật khẩu bằng bcrypt.
 * Mật khẩu KHÔNG BAO GIỜ được lưu dạng thô.
 */

const bcrypt = require('bcryptjs');

/** Số vòng băm. 10 là mức cân bằng tốt giữa an toàn và tốc độ cho ứng dụng nhỏ. */
const SALT_ROUNDS = 10;

/**
 * Băm mật khẩu thô.
 * @param {string} plainText
 * @returns {Promise<string>} chuỗi hash 60 ký tự (đã nới cột MatKhau lên VARCHAR(100) — quyết định C1)
 */
async function hashPassword(plainText) {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

/**
 * So khớp mật khẩu thô với hash đã lưu.
 * @param {string} plainText
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plainText, storedHash) {
  if (!plainText || !storedHash) return false;
  try {
    return await bcrypt.compare(plainText, storedHash);
  } catch {
    return false;
  }
}

/**
 * Sinh mật khẩu tạm dễ đọc cho nhân viên mới (dùng ở màn "Thêm nhân viên").
 * Bỏ các ký tự dễ nhầm lẫn như 0/O, 1/I/l.
 */
function generateTempPassword(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

module.exports = { hashPassword, verifyPassword, generateTempPassword, SALT_ROUNDS };
