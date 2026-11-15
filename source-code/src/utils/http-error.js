'use strict';

/**
 * Lỗi nghiệp vụ có mã HTTP đi kèm.
 * Dùng để ném lỗi từ tầng service và để middleware trả về đúng thông báo tiếng Việt.
 */
class AppError extends Error {
  /**
   * @param {number} status  Mã HTTP
   * @param {string} message Thông báo hiển thị cho người dùng (tiếng Việt)
   * @param {Object} [options]
   * @param {string} [options.code]      Mã lỗi nội bộ
   * @param {Object} [options.details]   Chi tiết bổ sung (ví dụ lỗi từng trường)
   */
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = options.code || null;
    this.details = options.details || null;
    this.expose = status < 500;
    Error.captureStackTrace?.(this, AppError);
  }
}

const badRequest = (message, details) => new AppError(400, message, { code: 'BAD_REQUEST', details });
const unauthorized = (message = 'Bạn cần đăng nhập để tiếp tục.') =>
  new AppError(401, message, { code: 'UNAUTHORIZED' });
const forbidden = (message = 'Bạn không có quyền thực hiện chức năng này.') =>
  new AppError(403, message, { code: 'FORBIDDEN' });
const notFound = (message = 'Không tìm thấy dữ liệu.') =>
  new AppError(404, message, { code: 'NOT_FOUND' });
const conflict = (message) => new AppError(409, message, { code: 'CONFLICT' });

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
