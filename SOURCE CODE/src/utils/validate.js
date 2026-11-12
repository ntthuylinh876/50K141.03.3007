'use strict';

/**
 * Kiểm tra dữ liệu đầu vào phía server bằng zod.
 * Mọi thông báo lỗi trả về đều bằng tiếng Việt, khớp với đặc tả màn hình.
 */

const { z } = require('zod');
const { badRequest } = require('./http-error');

/**
 * Chạy schema zod, ném AppError(400) kèm lỗi từng trường nếu không hợp lệ.
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} data
 * @returns {T}
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }

  const firstMessage = result.error.issues[0]?.message || 'Dữ liệu không hợp lệ.';
  throw badRequest(firstMessage, fieldErrors);
}

/** Số điện thoại Việt Nam: đúng 10 chữ số, bắt đầu bằng 0. */
const phoneSchema = z
  .string({ message: 'Vui lòng nhập số điện thoại.' })
  .trim()
  .regex(/^0\d{9}$/, 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');

/** Mật khẩu: tối thiểu 6 ký tự (khớp đặc tả màn hình Đổi mật khẩu). */
const passwordSchema = z
  .string({ message: 'Vui lòng nhập mật khẩu.' })
  .min(6, 'Mật khẩu phải có ít nhất 6 ký tự.')
  .max(72, 'Mật khẩu không được vượt quá 72 ký tự.');

/** Chuỗi bắt buộc, tự cắt khoảng trắng hai đầu. */
function requiredText(label, max = 255) {
  return z
    .string({ message: `Vui lòng nhập ${label}.` })
    .trim()
    .min(1, `Vui lòng nhập ${label}.`)
    .max(max, `${label} không được vượt quá ${max} ký tự.`);
}

/** Ngày dạng 'YYYY-MM-DD'. */
const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không đúng định dạng (YYYY-MM-DD).')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }, 'Ngày không hợp lệ.');

/** Giờ dạng 'HH:mm' hoặc 'HH:mm:ss'. */
const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Giờ không đúng định dạng (HH:mm).');

module.exports = {
  z,
  validate,
  phoneSchema,
  passwordSchema,
  requiredText,
  isoDateSchema,
  timeSchema,
};
