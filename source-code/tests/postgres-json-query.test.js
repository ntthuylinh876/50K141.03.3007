'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { translateSql } = require('../src/config/db');

test('payroll proposal JSON lookup uses PostgreSQL jsonb and positional parameters', () => {
  const result = translateSql(
    "SELECT MaPH FROM PhanHoiLuong WHERE (\"NoiDungDeXuat\"::jsonb ->> 'maCTL') = @maCTL",
    { maCTL: 'CTL001' },
  );

  assert.match(result.text, /\("NoiDungDeXuat"::jsonb ->> 'maCTL'\) = \$1/);
  assert.deepEqual(result.values, ['CTL001']);
});
