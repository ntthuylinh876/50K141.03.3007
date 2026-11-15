'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { types } = require('pg');
const { translateSql } = require('../src/config/db');

test('dịch tên bảng/cột có phân biệt hoa thường và tham số named thành positional bind', () => {
  const result = translateSql(
    'SELECT TOP 1 MaNV, HoTen FROM NhanVien WHERE MaNV = @maNV AND TinhTrang = @status',
    { maNV: 'NV001', status: 'Đang làm' },
  );
  assert.match(result.text, /SELECT "MaNV", "HoTen" FROM "NhanVien"/);
  assert.match(result.text, /WHERE "MaNV" = \$1 AND "TinhTrang" = \$2 LIMIT 1/);
  assert.deepEqual(result.values, ['NV001', 'Đang làm']);
});

test('dịch TOP parameter, thời gian hiện tại và kiểu chuyển đổi SQL Server', () => {
  const result = translateSql(
    "SELECT TOP (@limit) CONVERT(char(10), NgayLam, 23) AS NgayISO, GETDATE() AS NgayGui FROM LichLamViec WHERE MaNV = @id",
    { limit: 5, id: 'NV001' },
  );
  assert.match(result.text, /LIMIT \$2/);
  assert.match(result.text, /TO_CHAR\("NgayLam", 'YYYY-MM-DD'\) AS "NgayISO"/);
  assert.match(result.text, /NOW\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh'/);
  assert.deepEqual(result.values, ['NV001', 5]);

  const idResult = translateSql(
    'SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(MaBL, 3, 10) AS INT)), 0) AS maxSo FROM BangLuong',
  );
  assert.ok(idResult.text.includes(`CASE WHEN SUBSTRING("MaBL", 3, 10) ~ '^[0-9]+$' THEN CAST(SUBSTRING("MaBL", 3, 10) AS INTEGER) ELSE NULL END`));
});

test('câu truy vấn khóa lịch và kỳ lương dùng cú pháp khóa PostgreSQL', () => {
  const advisoryLock = translateSql(
    'SELECT pg_advisory_xact_lock(hashtextextended(@lockKey, 0))',
    { lockKey: 'schedule:2026-11-15:CA01' },
  );
  assert.equal(advisoryLock.text, 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))');
  assert.deepEqual(advisoryLock.values, ['schedule:2026-11-15:CA01']);

  const rowLock = translateSql(
    'SELECT MaLich, MaNV FROM LichLamViec WHERE NgayLam = @ngay AND MaCa = @maCa FOR UPDATE',
    { ngay: '2026-11-15', maCa: 'CA01' },
  );
  assert.match(rowLock.text, /FROM "LichLamViec" WHERE "NgayLam" = \$1 AND "MaCa" = \$2 FOR UPDATE$/);
});

test('PostgreSQL date/time parsers giữ chuỗi, numeric chuyển thành number', () => {
  assert.equal(types.getTypeParser(1082, 'text')('2026-11-15'), '2026-11-15');
  assert.equal(types.getTypeParser(1083, 'text')('09:30:00'), '09:30:00');
  assert.equal(types.getTypeParser(1114, 'text')('2026-11-15 09:30:00'), '2026-11-15 09:30:00');
  assert.equal(types.getTypeParser(1184, 'text')('2026-11-15 09:30:00+07'), '2026-11-15 09:30:00+07');
  assert.equal(types.getTypeParser(1700, 'text')('23000.50'), 23000.5);
});

test('xóa nhân viên đổi lỗi PostgreSQL 23503 thành thông báo nghiệp vụ', () => {
  const { mapEmployeeDeleteError } = require('../src/services/employee-admin.service');
  const error = mapEmployeeDeleteError({ code: '23503' });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EMPLOYEE_HAS_RELATED_DATA');
  assert.match(error.message, /dữ liệu đã phát sinh lịch làm hoặc phiếu lương/);
  const unrelated = new Error('other database error');
  assert.equal(mapEmployeeDeleteError(unrelated), unrelated);
});

test('session store is PostgreSQL-backed and does not try to create its table', async () => {
  const session = require('express-session');
  const { createSessionStore } = require('../src/config/session-store');
  const sessions = new Map();
  const statements = [];
  const fakePool = {
    async query(statement, values) {
      statements.push(statement);
      if (statement.startsWith('INSERT INTO')) {
        sessions.set(values[2], { sess: values[0], expire: Number(values[1]) });
        return { rows: [{ sid: values[2] }] };
      }
      if (statement.startsWith('SELECT sess')) {
        const row = sessions.get(values[0]);
        return { rows: row && row.expire >= Number(values[1]) ? [{ sess: row.sess }] : [] };
      }
      if (statement.startsWith('DELETE FROM')) {
        sessions.delete(values[0]);
        return { rows: [] };
      }
      throw new Error('Unexpected session-store SQL');
    },
  };
  const store = createSessionStore(session, fakePool);
  assert.ok(store instanceof session.Store);
  assert.notEqual(store.constructor.name, 'MemoryStore');
  const sessionValue = { cookie: { expires: new Date(Date.now() + 60_000) }, user: { id: 'NV001', role: 'employee' } };
  await new Promise((resolve, reject) => store.set('sid-test', sessionValue, (err) => err ? reject(err) : resolve()));
  const loaded = await new Promise((resolve, reject) => store.get('sid-test', (err, value) => err ? reject(err) : resolve(value)));
  assert.deepEqual(loaded.user, sessionValue.user);
  assert.ok(statements.every((statement) => !/^CREATE\s+TABLE/i.test(statement)));
  await new Promise((resolve, reject) => store.destroy('sid-test', (err) => err ? reject(err) : resolve()));
  assert.equal(sessions.has('sid-test'), false);
  await store.close();
});
