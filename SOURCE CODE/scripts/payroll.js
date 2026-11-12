'use strict';

/**
 * Sinh bảng lương thủ công (UC13.1) — dùng để kiểm tra hoặc bù kỳ bị lỡ.
 *
 *   node scripts/payroll.js                 # tháng liền trước
 *   node scripts/payroll.js --month=2026-10
 *   node scripts/payroll.js --year=2026 --month=10
 *
 * Không sinh cho tháng chưa kết thúc và không ghi đè kỳ đã có.
 */

const payrollService = require('../src/services/payroll.service');
const { closePool } = require('../src/config/db');
const dt = require('../src/utils/datetime');

/** Đọc tham số dạng --ten=gia-tri. */
function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function resolveTarget(args) {
  if (args.month && /^\d{4}-\d{2}$/.test(args.month)) {
    const [year, month] = args.month.split('-').map(Number);
    return { year, month };
  }
  if (args.year && args.month) {
    return { year: Number(args.year), month: Number(args.month) };
  }
  return payrollService.previousMonth(dt.todayISO());
}

const MESSAGES = {
  created: (result) =>
    `✔ Đã sinh bảng lương ${result.maBL}: ${result.soPhieu} phiếu · ` +
    `${result.soDong} dòng chi tiết · ${result.soUng} khoản ứng.`,
  exists: (result) => `• Kỳ ${result.maBL} đã có bảng lương — bỏ qua, không ghi đè.`,
  'not-ended': (result) => `• Tháng ${result.month}/${result.year} chưa kết thúc — bỏ qua.`,
  empty: (result) => `• Tháng ${result.month}/${result.year} không có ca làm việc nào — bỏ qua.`,
};

async function main() {
  const target = resolveTarget(parseArgs(process.argv.slice(2)));
  const result = await payrollService.generateMonthlyPayroll(target);
  const message = MESSAGES[result.reason];
  console.log(message ? message(result) : `• Không sinh bảng lương: ${result.reason}`);
}

main()
  .catch((err) => {
    console.error('✖ Không sinh được bảng lương:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
