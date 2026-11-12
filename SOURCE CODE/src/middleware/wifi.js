'use strict';

/**
 * Kiểm tra "đang kết nối Wi-Fi của quán" (BR-UC2-01, BR-UC3-01, NFR-02).
 *
 * Trình duyệt không đọc được tên Wi-Fi (SSID), nên hệ thống mô phỏng bằng cách
 * đối chiếu địa chỉ IP của máy khách với danh sách dải IP nội bộ của quán
 * (biến môi trường ALLOWED_IP_RANGES, định dạng CIDR, hỗ trợ IPv4 và IPv6).
 *
 * Quyết định C10:
 *  - So khớp CIDR bằng thư viện ipaddr.js, KHÔNG dùng startsWith.
 *  - Chuẩn hóa IP trước khi so (bỏ tiền tố ::ffff:, bỏ zone id).
 *  - Check-in và Check-out dùng CHUNG hàm `assertCafeWifi`.
 *  - Công tắc "Wi-Fi quán" chỉ hiển thị khi DEMO_MODE=true.
 */

const ipaddr = require('ipaddr.js');
const config = require('../config/env');
const { AppError } = require('../utils/http-error');

/** Thông báo lỗi đúng nguyên văn đặc tả màn hình (UC02/UC03 — bước 3a). */
const WIFI_ERROR_MESSAGE = 'Kết nối sai Wifi';

/**
 * Chuẩn hóa một chuỗi IP về đối tượng ipaddr hợp lệ.
 * Trả về null nếu không phân tích được.
 */
function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();

  // Bỏ zone id của IPv6 liên kết cục bộ: fe80::1%eth0
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) ip = ip.slice(0, zoneIndex);

  // Bỏ tiền tố IPv4-mapped IPv6
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);

  if (!ipaddr.isValid(ip)) return null;

  const addr = ipaddr.process(ip);
  // ipaddr.process đã chuyển IPv4-mapped về IPv4; ép thêm một lần cho chắc
  return addr.kind() === 'ipv6' && addr.isIPv4MappedAddress() ? addr.toIPv4Address() : addr;
}

/**
 * IP có nằm trong danh sách dải cho phép không?
 * @param {string} rawIp
 * @param {readonly string[]} [ranges]
 * @returns {boolean}
 */
function isAllowedIp(rawIp, ranges = config.wifi.allowedRanges) {
  const addr = normalizeIp(rawIp);
  if (!addr) return false;

  for (const rawRange of ranges) {
    let parsed;
    try {
      parsed = ipaddr.parseCIDR(String(rawRange).trim());
    } catch {
      // Dải cấu hình sai định dạng → bỏ qua, không làm sập ứng dụng
      continue;
    }
    const [rangeAddr, prefixLength] = parsed;
    if (rangeAddr.kind() !== addr.kind()) continue;
    if (addr.match(rangeAddr, prefixLength)) return true;
  }
  return false;
}

/**
 * Máy khách hiện tại có đang ở Wi-Fi quán không?
 *
 * Ở chế độ demo, công tắc trên giao diện quyết định kết quả để có thể thử
 * cả hai nhánh (thành công và "Kết nối sai Wifi"). Mặc định là đang ở Wi-Fi quán.
 */
function isOnCafeWifi(req) {
  if (config.wifi.demoMode) {
    return req.session?.demoCafeWifi !== false;
  }
  return isAllowedIp(req.ip);
}

/**
 * Hàm kiểm tra dùng chung cho Check-in và Check-out.
 * Ném AppError(403) với thông báo "Kết nối sai Wifi" nếu không hợp lệ.
 */
function assertCafeWifi(req) {
  if (isOnCafeWifi(req)) return true;
  throw new AppError(403, WIFI_ERROR_MESSAGE, { code: 'WIFI_DENIED' });
}

/** Middleware dùng cho các trang cần chặn ngay từ đầu. */
function requireCafeWifi(req, res, next) {
  if (isOnCafeWifi(req)) {
    res.locals.onCafeWifi = true;
    return next();
  }
  res.locals.onCafeWifi = false;
  return next(new AppError(403, WIFI_ERROR_MESSAGE, { code: 'WIFI_DENIED' }));
}

/** Bật/tắt công tắc demo Wi-Fi (chỉ có tác dụng khi DEMO_MODE=true). */
function setDemoWifi(req, enabled) {
  if (!config.wifi.demoMode) return false;
  req.session.demoCafeWifi = Boolean(enabled);
  return true;
}

module.exports = {
  WIFI_ERROR_MESSAGE,
  normalizeIp,
  isAllowedIp,
  isOnCafeWifi,
  assertCafeWifi,
  requireCafeWifi,
  setDemoWifi,
};
