'use strict';
const svc = require('../src/services/schedule.service');
const admin = require('../src/services/admin-schedule.service');
const { query, sql, closePool } = require('../src/config/db');

const MA_NV = 'NV005';
const NGAY = '2026-11-16';
const CA = 'CA01';

async function rowsOf(ngay, ca) {
  const r = await query(
    `SELECT MaLich, MaNV FROM LichLamViec WHERE NgayLam = @ngay AND MaCa = @ca ORDER BY MaLich`,
    { ngay: { type: sql.VarChar(10), value: ngay }, ca: { type: sql.Char(10), value: ca } },
  );
  return r.recordset.map((x) => ({ maLich: String(x.MaLich).trim(), maNV: String(x.MaNV).trim() }));
}

(async () => {
  const original = await rowsOf(NGAY, CA);
  console.log('rows before', original);

  const dkBefore = (
    await query("SELECT * FROM DangKyCaLam WHERE MaNV = @nv AND MaCa = @ca", {
      nv: { type: sql.Char(10), value: MA_NV },
      ca: { type: sql.Char(10), value: CA },
    })
  ).recordset[0];
  console.log('DK before', dkBefore && dkBefore.MaDK, dkBefore && dkBefore.LichRanh);

  try {
    // Giải phóng toàn bộ chỗ của ca để test đăng ký thành công.
    await query(`DELETE FROM LichLamViec WHERE NgayLam = @ngay AND MaCa = @ca`, {
      ngay: { type: sql.VarChar(10), value: NGAY },
      ca: { type: sql.Char(10), value: CA },
    });

    console.log('save ->', await svc.saveRegistration(MA_NV, [`${NGAY}|${CA}`]));
    console.log('rows after', await rowsOf(NGAY, CA));

    const editor = await admin.getShiftEditor(CA, NGAY);
    console.log(
      'editor inShift',
      editor.inShift.map((x) => `${x.maNV}:${x.hoTen}`).join(', '),
      '| has registered key:',
      Object.prototype.hasOwnProperty.call(editor, 'registered'),
    );

    // Đăng ký trùng: không tạo thêm dòng.
    console.log('save again ->', await svc.saveRegistration(MA_NV, [`${NGAY}|${CA}`]));
    console.log('rows after duplicate', await rowsOf(NGAY, CA));

    // Ca cuối tuần đã đủ 2 người.
    try {
      await svc.saveRegistration(MA_NV, ['2026-11-21|CA01']);
      console.log('ERROR: expected full');
    } catch (e) {
      console.log('full ->', e.status, '|', e.message);
    }

    // Không chọn ca nào.
    try {
      await svc.saveRegistration(MA_NV, []);
      console.log('ERROR: expected empty');
    } catch (e) {
      console.log('empty ->', e.status, '|', e.message);
    }
  } finally {
    // ---- Dọn dẹp về trạng thái ban đầu ----
    await query(`DELETE FROM LichLamViec WHERE NgayLam = @ngay AND MaCa = @ca AND MaNV = @nv`, {
      ngay: { type: sql.VarChar(10), value: NGAY },
      ca: { type: sql.Char(10), value: CA },
      nv: { type: sql.Char(10), value: MA_NV },
    });
    for (const row of original) {
      await query(
        `INSERT INTO LichLamViec (MaLich, NgayLam, MaCa, MaNV) VALUES (@maLich, @ngay, @ca, @nv)`,
        {
          maLich: { type: sql.Char(10), value: row.maLich },
          ngay: { type: sql.VarChar(10), value: NGAY },
          ca: { type: sql.Char(10), value: CA },
          nv: { type: sql.Char(10), value: row.maNV },
        },
      );
    }
    await query("DELETE FROM DangKyCaLam WHERE MaNV = @nv AND MaCa = @ca", {
      nv: { type: sql.Char(10), value: MA_NV },
      ca: { type: sql.Char(10), value: CA },
    });
    if (dkBefore) {
      await query(
        `INSERT INTO DangKyCaLam (MaDK, LichRanh, NgayGui, MaNV, MaCa)
         VALUES (@maDK, @lichRanh, @ngayGui, @maNV, @maCa)`,
        {
          maDK: { type: sql.Char(10), value: String(dkBefore.MaDK).trim() },
          lichRanh: { type: sql.NVarChar(200), value: dkBefore.LichRanh },
          ngayGui: { type: sql.DateTime, value: dkBefore.NgayGui },
          maNV: { type: sql.Char(10), value: MA_NV },
          maCa: { type: sql.Char(10), value: CA },
        },
      );
    }

    console.log('rows restored', await rowsOf(NGAY, CA));
    console.log(
      'DK restored',
      (
        await query("SELECT MaDK, LichRanh FROM DangKyCaLam WHERE MaNV = @nv AND MaCa = @ca", {
          nv: { type: sql.Char(10), value: MA_NV },
          ca: { type: sql.Char(10), value: CA },
        })
      ).recordset,
    );
  }

  await closePool();
})().catch(async (e) => {
  console.error('FAIL', e);
  try { await closePool(); } catch {}
  process.exit(1);
});
