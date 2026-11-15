'use strict';

/**
 * Nạp và kiểm tra toàn bộ biến môi trường tại một chỗ duy nhất.
 * Ứng dụng sẽ dừng ngay khi khởi động nếu cấu hình thiếu hoặc sai định dạng,
 * thay vì lỗi mơ hồ về sau.
 */

const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const boolish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no']))
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET phải dài ít nhất 16 ký tự'),
  SESSION_MAX_AGE_HOURS: z.coerce.number().positive().default(8),

  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: boolish.default('true'),
  DB_TRUST_SERVER_CERTIFICATE: boolish.default('true'),
  DB_ADMIN_USER: z.string().min(1),
  DB_ADMIN_PASSWORD: z.string().min(1),

  ALLOWED_IP_RANGES: z.string().default('127.0.0.1/32,::1/128'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DEMO_MODE: boolish.default('false'),

  APP_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error('\n[CẤU HÌNH] File .env chưa hợp lệ:\n' + issues + '\n');
  console.error('Xem mẫu tại .env.example rồi tạo lại file .env.\n');
  process.exit(1);
}

const raw = parsed.data;

/** Danh sách dải IP được phép chấm công, đã tách và chuẩn hóa. */
const allowedIpRanges = raw.ALLOWED_IP_RANGES.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const config = Object.freeze({
  env: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  port: raw.PORT,
  session: Object.freeze({
    secret: raw.SESSION_SECRET,
    maxAgeMs: raw.SESSION_MAX_AGE_HOURS * 60 * 60 * 1000,
  }),
  db: Object.freeze({
    server: raw.DB_SERVER,
    port: raw.DB_PORT,
    database: raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
    encrypt: raw.DB_ENCRYPT,
    trustServerCertificate: raw.DB_TRUST_SERVER_CERTIFICATE,
    adminUser: raw.DB_ADMIN_USER,
    adminPassword: raw.DB_ADMIN_PASSWORD,
  }),
  wifi: Object.freeze({
    allowedRanges: Object.freeze(allowedIpRanges),
    trustProxy: raw.TRUST_PROXY,
    demoMode: raw.DEMO_MODE,
  }),
  timezone: raw.APP_TIMEZONE,
  paths: Object.freeze({
    root: path.join(__dirname, '..', '..'),
    views: path.join(__dirname, '..', 'views'),
    public: path.join(__dirname, '..', 'public'),
    holidays: path.join(__dirname, '..', '..', 'config', 'holidays.json'),
  }),
});

module.exports = config;
