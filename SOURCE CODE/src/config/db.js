'use strict';

/**
 * Kết nối Microsoft SQL Server.
 *
 * Nguyên tắc:
 *  - Mọi truy vấn đều dùng tham số hóa (`request.input(...)`), không nối chuỗi SQL.
 *  - Ứng dụng chạy bằng tài khoản chỉ có quyền đọc/ghi dữ liệu (DB_USER).
 *  - Script migration dùng tài khoản riêng có quyền DDL (DB_ADMIN_USER).
 */

const sql = require('mssql');
const config = require('./env');

const baseOptions = {
  server: config.db.server,
  port: config.db.port,
  database: config.db.database,
  options: {
    encrypt: config.db.encrypt,
    trustServerCertificate: config.db.trustServerCertificate,
    enableArithAbort: true,
    useUTC: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: 30000,
  connectionTimeout: 15000,
};

function buildConfig({ user, password }) {
  return { ...baseOptions, user, password };
}

/** Cấu hình kết nối của ứng dụng (quyền đọc/ghi). */
const appConfig = buildConfig({ user: config.db.user, password: config.db.password });

/** Cấu hình kết nối dùng cho migration (quyền DDL). */
const adminConfig = buildConfig({
  user: config.db.adminUser,
  password: config.db.adminPassword,
});

let poolPromise = null;

/** Trả về pool dùng chung, khởi tạo một lần. */
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(appConfig)
      .connect()
      .then((pool) => {
        pool.on('error', (err) => {
          console.error('[SQL] Lỗi pool:', err.message);
        });
        return pool;
      })
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

/**
 * Chạy một truy vấn tham số hóa.
 * @param {string} text  Câu lệnh T-SQL có placeholder dạng @ten
 * @param {Object<string, {type: any, value: any}>|Object} params
 *        Dạng đầy đủ: { maNV: { type: sql.Char(10), value: 'NV001' } }
 *        Dạng rút gọn: { maNV: 'NV001' } — driver tự suy kiểu
 * @returns {Promise<{recordset: any[], recordsets: any[][], rowsAffected: number[]}>}
 */
async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();

  for (const [name, def] of Object.entries(params)) {
    if (def && typeof def === 'object' && 'type' in def && 'value' in def) {
      request.input(name, def.type, def.value);
    } else {
      request.input(name, def);
    }
  }

  return request.query(text);
}

/**
 * Chạy nhiều câu lệnh trong cùng một transaction.
 * @param {(tx: sql.Transaction) => Promise<any>} work
 */
async function withTransaction(work) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* transaction có thể đã bị huỷ */
    }
    throw err;
  }
}

/** Tạo request gắn với transaction đang mở. */
function txRequest(tx) {
  return new sql.Request(tx);
}

async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise.catch(() => null);
    if (pool) await pool.close();
    poolPromise = null;
  }
}

module.exports = {
  sql,
  appConfig,
  adminConfig,
  getPool,
  query,
  withTransaction,
  txRequest,
  closePool,
};
