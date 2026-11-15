'use strict';
const svc = require('../src/services/schedule.service');
const { query, closePool } = require('../src/config/db');

(async () => {
  const found = await query("SELECT MaNV, HoTen, SoDienThoai FROM NhanVien WHERE SoDienThoai = '0914673802'");
  console.log('user', found.recordset);

  const maNV = String(found.recordset[0].MaNV).trim();
  const ctx = await svc.getRegisterContext(maNV);
  console.log('week', ctx.weekLabel, 'shifts', ctx.shifts.map((s) => s.maCa).join(','));
  for (const day of ctx.board) {
    console.log(
      day.iso,
      day.isWeekend ? 'weekend' : 'weekday',
      day.cells.map((c) => `${c.maCa}:${c.used}/${c.capacity}${c.selected ? '*' : ''}${c.full ? ' FULL' : ''}`).join(' | '),
    );
  }

  const free = [];
  for (const day of ctx.board) {
    for (const c of day.cells) if (!c.full && !c.selected) free.push(c.key);
  }
  console.log('free slots count', free.length, free.slice(0, 8));

  await closePool();
})().catch(async (e) => {
  console.error(e);
  try { await closePool(); } catch {}
  process.exit(1);
});
