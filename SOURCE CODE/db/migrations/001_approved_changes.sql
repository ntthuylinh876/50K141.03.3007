/* ============================================================================
   001_approved_changes.sql
   ----------------------------------------------------------------------------
   Các thay đổi CSDL đã được người dùng phê duyệt ở Bước 0 (xem
   docs/PHAN_TICH_BUOC0.md, mục 13). Script này IDEMPOTENT: chạy lại nhiều lần
   không gây lỗi và không làm mất dữ liệu.

     C1 — Nới MatKhau lên VARCHAR(100) để chứa hash bcrypt (60 ký tự).
     C2 — BangLuong.TinhTrang: thêm 'Chờ chủ quán duyệt' và 'Từ chối'
          (luồng duyệt 2 bước BR-UC13.2-01).
     C3 — ChamCongBoSung: thêm NgayGui, LyDo, TrangThai (UC04, UC12.1).

   Chạy bằng:  npm run db:migrate
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   C1 — MatKhau VARCHAR(30) -> VARCHAR(100)
   --------------------------------------------------------------------------- */
IF EXISTS (
    SELECT 1
      FROM sys.columns c
     WHERE c.object_id = OBJECT_ID(N'dbo.NhanVien')
       AND c.name = N'MatKhau'
       AND c.max_length < 100            -- VARCHAR: max_length = số byte = số ký tự
)
BEGIN
    ALTER TABLE dbo.NhanVien ALTER COLUMN MatKhau VARCHAR(100) NOT NULL;
    PRINT N'[C1] NhanVien.MatKhau -> VARCHAR(100)';
END
ELSE
    PRINT N'[C1] NhanVien.MatKhau đã đủ độ dài, bỏ qua.';
GO

IF EXISTS (
    SELECT 1
      FROM sys.columns c
     WHERE c.object_id = OBJECT_ID(N'dbo.QuanLy')
       AND c.name = N'MatKhau'
       AND c.max_length < 100
)
BEGIN
    ALTER TABLE dbo.QuanLy ALTER COLUMN MatKhau VARCHAR(100) NOT NULL;
    PRINT N'[C1] QuanLy.MatKhau -> VARCHAR(100)';
END
ELSE
    PRINT N'[C1] QuanLy.MatKhau đã đủ độ dài, bỏ qua.';
GO

/* ---------------------------------------------------------------------------
   C2 — BangLuong.TinhTrang: cho phép 5 giá trị
   --------------------------------------------------------------------------- */
DECLARE @ckName sysname;
DECLARE @ckDef  NVARCHAR(MAX);

SELECT TOP (1)
       @ckName = cc.name,
       @ckDef  = cc.definition
  FROM sys.check_constraints cc
 WHERE cc.parent_object_id = OBJECT_ID(N'dbo.BangLuong')
   AND cc.parent_column_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.BangLuong'), N'TinhTrang', 'ColumnId');

IF @ckName IS NOT NULL AND @ckDef NOT LIKE N'%Chờ chủ quán duyệt%'
BEGIN
    DECLARE @dropSql NVARCHAR(MAX) =
        N'ALTER TABLE dbo.BangLuong DROP CONSTRAINT ' + QUOTENAME(@ckName);
    EXEC sp_executesql @dropSql;
    PRINT N'[C2] Đã bỏ CHECK cũ: ' + @ckName;
    SET @ckName = NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BangLuong_TinhTrang')
BEGIN
    ALTER TABLE dbo.BangLuong WITH CHECK
      ADD CONSTRAINT CK_BangLuong_TinhTrang
      CHECK (TinhTrang IN (
            N'Chưa duyệt',
            N'Chờ chủ quán duyệt',
            N'Đã duyệt',
            N'Đã chi trả',
            N'Từ chối'));
    PRINT N'[C2] Đã thêm CK_BangLuong_TinhTrang (5 giá trị).';
END
ELSE
    PRINT N'[C2] CK_BangLuong_TinhTrang đã tồn tại, bỏ qua.';
GO

/* ---------------------------------------------------------------------------
   C3 — ChamCongBoSung: thêm 3 cột
   --------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.ChamCongBoSung', N'NgayGui') IS NULL
BEGIN
    ALTER TABLE dbo.ChamCongBoSung
      ADD NgayGui DATETIME NOT NULL
          CONSTRAINT DF_CCBS_NgayGui DEFAULT GETDATE();
    PRINT N'[C3] Đã thêm cột NgayGui.';
END
ELSE
    PRINT N'[C3] Cột NgayGui đã tồn tại, bỏ qua.';
GO

IF COL_LENGTH(N'dbo.ChamCongBoSung', N'LyDo') IS NULL
BEGIN
    ALTER TABLE dbo.ChamCongBoSung
      ADD LyDo NVARCHAR(255) NOT NULL
          CONSTRAINT DF_CCBS_LyDo DEFAULT N'';
    PRINT N'[C3] Đã thêm cột LyDo.';
END
ELSE
    PRINT N'[C3] Cột LyDo đã tồn tại, bỏ qua.';
GO

IF COL_LENGTH(N'dbo.ChamCongBoSung', N'TrangThai') IS NULL
BEGIN
    ALTER TABLE dbo.ChamCongBoSung
      ADD TrangThai NVARCHAR(20) NOT NULL
          CONSTRAINT DF_CCBS_TrangThai DEFAULT N'Chờ duyệt';
    PRINT N'[C3] Đã thêm cột TrangThai.';
END
ELSE
    PRINT N'[C3] Cột TrangThai đã tồn tại, bỏ qua.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CCBS_TrangThai')
BEGIN
    ALTER TABLE dbo.ChamCongBoSung WITH CHECK
      ADD CONSTRAINT CK_CCBS_TrangThai
      CHECK (TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Từ chối'));
    PRINT N'[C3] Đã thêm CK_CCBS_TrangThai.';
END
ELSE
    PRINT N'[C3] CK_CCBS_TrangThai đã tồn tại, bỏ qua.';
GO

PRINT N'=== Migration 001 hoàn tất ===';
GO
