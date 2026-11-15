'use strict';

/**
 * Job sinh bảng lương cuối tháng (UC13.1 / BR-UC13.1-01).
 *
 * Chạy một lần khi máy chủ khởi động (bắt kịp nếu tháng trước chưa sinh) và
 * lặp lại mỗi 6 giờ. Chỉ sinh cho tháng đã kết thúc và chưa có bảng lương;
 * mọi trường hợp khác đều bỏ qua im lặng để không làm nhiễu log.
 */

const payrollService = require('../services/payroll.service');

/** Khoảng lặp: 6 giờ. */
const INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer = null;

/** Chạy một lượt kiểm tra; không ném lỗi ra ngoài để máy chủ tiếp tục chạy. */
async function runOnce(source = 'định kỳ') {
  try {
    const result = await payrollService.runMonthlyPayrollCheck();
    if (result.created) {
      console.log(
        `[LƯƠNG] Đã sinh bảng lương ${result.maBL} (${source}): ` +
          `${result.soPhieu} phiếu · ${result.soDong} dòng chi tiết · ${result.soUng} khoản ứng.`,
      );
    }
    return result;
  } catch (err) {
    console.error(`[LƯƠNG] Không sinh được bảng lương (${source}):`, err.message);
    return { created: false, reason: 'error', error: err };
  }
}

/** Bật job. Gọi sau khi đã kết nối CSDL. */
function startPayrollJob() {
  if (timer) return timer;

  timer = setInterval(() => {
    runOnce('định kỳ');
  }, INTERVAL_MS);
  timer.unref();

  setImmediate(() => {
    runOnce('khởi động');
  });

  return timer;
}

/** Tắt job khi máy chủ dừng. */
function stopPayrollJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startPayrollJob, stopPayrollJob, runOnce };
