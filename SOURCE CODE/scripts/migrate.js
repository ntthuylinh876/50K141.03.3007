'use strict';

/**
 * Chạy migration CSDL.
 *
 *   npm run db:migrate
 *
 * Khác với ứng dụng (dùng tài khoản chỉ có quyền đọc/ghi), script này kết nối
 * bằng DB_ADMIN_USER có quyền DDL. File .sql được đọc dưới dạng UTF-8 để giữ
 * nguyên tiếng Việt trong các giá trị N'...'.
 *
 * Quy ước: mỗi batch ngăn cách bằng dòng chỉ chứa `GO` — giống sqlcmd.
 */

const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const config = require('../src/config/env');
const { adminConfig } = require('../src/config/db');

const MIGRATION_DIR = path.join(__dirname, '..', 'db', 'migrations');

/**
 * Tách nội dung file .sql thành các batch theo dòng `GO`.
 * @param {string} content
 * @returns {string[]}
 */
function splitBatches(content) {
  const batches = [];
  let current = [];

  for (const line of content.split(/\r?\n/)) {
    if (/^\s*GO\s*;?\s*$/i.test(line)) {
      const batch = current.join('\n').trim();
      if (batch) batches.push(batch);
      current = [];
    } else {
      current.push(line);
    }
  }

  const tail = current.join('\n').trim();
  if (tail) batches.push(tail);
  return batches;
}

/** Danh sách file migration, sắp xếp theo tên. */
function listMigrations() {
  if (!fs.existsSync(MIGRATION_DIR)) return [];
  return fs
    .readdirSync(MIGRATION_DIR)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

async function main() {
  const files = listMigrations();
  if (files.length === 0) {
    console.log('[MIGRATE] Không có file migration nào trong db/migrations/.');
    return;
  }

  console.log(
    `[MIGRATE] Kết nối ${config.db.server}:${config.db.port}/${config.db.database} ` +
      `bằng tài khoản ${config.db.adminUser} …`,
  );

  const pool = await new sql.ConnectionPool(adminConfig).connect();

  try {
    for (const file of files) {
      const fullPath = path.join(MIGRATION_DIR, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const batches = splitBatches(content);

      console.log(`\n[MIGRATE] ▶ ${file} (${batches.length} batch)`);

      for (let i = 0; i < batches.length; i += 1) {
        try {
          const request = pool.request();
          // PRINT trong T-SQL được phát ra qua sự kiện 'info'
          request.on('info', (info) => {
            if (info && info.message) console.log(`          ${info.message.trim()}`);
          });
          await request.batch(batches[i]);
        } catch (err) {
          console.error(`[MIGRATE] ✖ Lỗi ở batch ${i + 1} của ${file}:`);
          console.error(`          ${err.message}`);
          throw err;
        }
      }

      console.log(`[MIGRATE] ✔ ${file} hoàn tất`);
    }
  } finally {
    await pool.close();
  }

  console.log('\n[MIGRATE] Tất cả migration đã chạy xong.');
}

main().catch((err) => {
  console.error('\n[MIGRATE] Thất bại:', err.message);
  process.exit(1);
});
