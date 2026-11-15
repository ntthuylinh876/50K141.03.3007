'use strict';
const { query, closePool } = require('../src/config/db');

(async () => {
  const rows = await query(
    `SELECT llv.MaLich, llv.MaNV, nv.HoTen
       FROM LichLamViec llv JOIN NhanVien nv ON nv.MaNV = llv.MaNV
      WHERE llv.NgayLam = '2026-11-16' AND llv.MaCa = 'CA01'`,
  );
  console.log('schedule 16/11 CA01', rows.recordset);
  const refs = await query(
    `SELECT 'CC' AS Src, COUNT(*) AS N FROM ChamCong WHERE MaLich IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01')
     UNION ALL SELECT 'XN', COUNT(*) FROM CT_XinNghi WHERE MaLich IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01')
     UNION ALL SELECT 'DC', COUNT(*) FROM DonDoiCa WHERE MaLichGoc IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01') OR MaLichMuonDoi IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01')
     UNION ALL SELECT 'LT', COUNT(*) FROM DonLamThay WHERE MaLich IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01')
     UNION ALL SELECT 'BS', COUNT(*) FROM ChamCongBoSung WHERE MaLich IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01')
     UNION ALL SELECT 'TL', COUNT(*) FROM ChiTietLuong WHERE MaLich IN (SELECT MaLich FROM LichLamViec WHERE NgayLam='2026-11-16' AND MaCa='CA01')`,
  );
  console.log('refs', refs.recordset);
  const dk = await query("SELECT * FROM DangKyCaLam WHERE MaNV = 'NV005'");
  console.log('dk NV005', dk.recordset);
  await closePool();
})().catch(async (e) => { console.error(e); try { await closePool(); } catch {} process.exit(1); });
