/* ============================================================================
   002_payroll_proposal.sql
   ----------------------------------------------------------------------------
   Thay đổi CSDL cho nhóm nghiệp vụ Chủ quán (UC13.2 bước 2, UC13.3).
   IDEMPOTENT: chạy lại nhiều lần không gây lỗi và không xóa dữ liệu.

     P1 — PhanHoiLuong: thêm NoiDungDeXuat NVARCHAR(MAX) NULL để lưu đề xuất
          chỉnh sửa lương dưới dạng JSON (trường sửa, giá trị cũ, giá trị mới).
     P2 — PhanHoiLuong.LyDo: NVARCHAR(50) -> NVARCHAR(255) cho lý do chỉnh sửa.
     P3 — BangLuong.TinhTrang: chuyển 'Đã chi trả' -> 'Đã duyệt' và bỏ giá trị
          'Đã chi trả' khỏi CHECK (trạng thái cuối của luồng duyệt 2 bước).

   Chạy bằng:  npm run db:migrate
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   P1 — PhanHoiLuong.NoiDungDeXuat
   --------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.PhanHoiLuong', N'NoiDungDeXuat') IS NULL
BEGIN
    ALTER TABLE dbo.PhanHoiLuong ADD NoiDungDeXuat NVARCHAR(MAX) NULL;
    PRINT N'[P1] Đã thêm cột PhanHoiLuong.NoiDungDeXuat.';
END
ELSE
    PRINT N'[P1] Cột PhanHoiLuong.NoiDungDeXuat đã tồn tại, bỏ qua.';
GO

/* ---------------------------------------------------------------------------
   P2 — PhanHoiLuong.LyDo: NVARCHAR(50) -> NVARCHAR(255)
   Với NVARCHAR, max_length tính bằng byte nên 255 ký tự = 510 byte.
   --------------------------------------------------------------------------- */
IF EXISTS (
    SELECT 1
      FROM sys.columns
     WHERE object_id = OBJECT_ID(N'dbo.PhanHoiLuong')
       AND name = N'LyDo'
       AND max_length < 510
)
BEGIN
    ALTER TABLE dbo.PhanHoiLuong ALTER COLUMN LyDo NVARCHAR(255) NOT NULL;
    PRINT N'[P2] PhanHoiLuong.LyDo -> NVARCHAR(255)';
END
ELSE
    PRINT N'[P2] PhanHoiLuong.LyDo đã đủ độ dài, bỏ qua.';
GO

/* ---------------------------------------------------------------------------
   P3 — BangLuong.TinhTrang: 'Đã chi trả' -> 'Đã duyệt'
   --------------------------------------------------------------------------- */
DECLARE @soKyDoi INT;

UPDATE dbo.BangLuong
   SET TinhTrang = N'Đã duyệt'
 WHERE TinhTrang = N'Đã chi trả';

SET @soKyDoi = @@ROWCOUNT;

IF @soKyDoi > 0
    PRINT N'[P3] Đã đổi ' + CAST(@soKyDoi AS NVARCHAR(10)) + N' kỳ sang ''Đã duyệt''.';
ELSE
    PRINT N'[P3] Không còn kỳ nào ở trạng thái ''Đã chi trả''.';
GO

/* Bỏ mọi CHECK trên TinhTrang còn chứa 'Đã chi trả' (gồm CK do migration 001 tạo).
   Trường hợp không đọc được definition (thiếu VIEW DEFINITION) thì bỏ luôn
   CK_BangLuong_TinhTrang để tạo lại bên dưới. */
DECLARE @ckName sysname;
DECLARE @dropSql NVARCHAR(MAX);

WHILE 1 = 1
BEGIN
    SET @ckName = NULL;

    SELECT TOP (1) @ckName = cc.name
      FROM sys.check_constraints cc
     WHERE cc.parent_object_id = OBJECT_ID(N'dbo.BangLuong')
       AND cc.parent_column_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.BangLuong'), N'TinhTrang', 'ColumnId')
       AND (
             cc.definition LIKE N'%Đã chi trả%'
             OR (cc.name = N'CK_BangLuong_TinhTrang'
                 AND (cc.definition IS NULL OR cc.definition NOT LIKE N'%Từ chối%'))
           );

    IF @ckName IS NULL BREAK;

    SET @dropSql = N'ALTER TABLE dbo.BangLuong DROP CONSTRAINT ' + QUOTENAME(@ckName);
    EXEC sp_executesql @dropSql;
    PRINT N'[P3] Đã bỏ CHECK cũ: ' + @ckName;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BangLuong_TinhTrang')
BEGIN
    ALTER TABLE dbo.BangLuong WITH CHECK
      ADD CONSTRAINT CK_BangLuong_TinhTrang
      CHECK (TinhTrang IN (
            N'Chưa duyệt',
            N'Chờ chủ quán duyệt',
            N'Đã duyệt',
            N'Từ chối'));
    PRINT N'[P3] Đã thêm CK_BangLuong_TinhTrang (4 giá trị).';
END
ELSE
    PRINT N'[P3] CK_BangLuong_TinhTrang đã tồn tại, bỏ qua.';
GO

PRINT N'=== Migration 002 hoàn tất ===';
GO
