-- =====================================================================
-- Schema PostgreSQL (Supabase) chuyển từ SQL Server: CHAMCONGTINHLUONG
-- Chạy toàn bộ file này trong Supabase > SQL Editor.
-- Giữ nguyên tên bảng/cột (có chữ hoa) => trong câu SQL phải đặt trong
-- dấu nháy kép, ví dụ: SELECT "MaNV" FROM "NhanVien";
-- =====================================================================

-- ---------- Bảng gốc (không phụ thuộc bảng khác) ----------

CREATE TABLE "BangLuong" (
  "MaBL"        char(10)    NOT NULL PRIMARY KEY,
  "Thang"       smallint    NOT NULL CHECK ("Thang" >= 1 AND "Thang" <= 12),
  "Nam"         smallint    NOT NULL CHECK ("Nam" > 0),
  "NgayBatDau"  date        NOT NULL,
  "NgayKetThuc" date        NOT NULL,
  "NgayChiTra"  date        NOT NULL,
  "TinhTrang"   varchar(20) NOT NULL,
  CONSTRAINT "CHK_BangLuong_Ngay" CHECK ("NgayKetThuc" >= "NgayBatDau"),
  CONSTRAINT "CK_BangLuong_TinhTrang" CHECK
    ("TinhTrang" IN ('Từ chối', 'Đã duyệt', 'Chờ chủ quán duyệt', 'Chưa duyệt'))
);

CREATE TABLE "CaLam" (
  "MaCa"           char(10)    NOT NULL PRIMARY KEY,
  "TenCa"          varchar(50) NOT NULL,
  "GioBatDau"      time        NOT NULL,
  "GioKetThuc"     time        NOT NULL,
  "SoNVNgayThuong" integer     NOT NULL CHECK ("SoNVNgayThuong" >= 0),
  "SoNVCuoiTuan"   integer     NOT NULL CHECK ("SoNVCuoiTuan" >= 0)
);

CREATE TABLE "QuanLy" (
  "MaQL"        char(10)     NOT NULL PRIMARY KEY,
  "HoTen"       varchar(50)  NOT NULL,
  "SoDienThoai" char(10)     NOT NULL CHECK ("SoDienThoai" ~ '^[0-9]{10}$'),
  "MatKhau"     varchar(100) NOT NULL
);

CREATE TABLE "NhanVien" (
  "MaNV"        char(10)      NOT NULL PRIMARY KEY,
  "HoTen"       varchar(50)   NOT NULL,
  "SoDienThoai" char(10)      NOT NULL CHECK ("SoDienThoai" ~ '^[0-9]{10}$'),
  "MatKhau"     varchar(100)  NOT NULL,
  "ViTri"       varchar(30)   NOT NULL,
  "NgayVaoLam"  date          NOT NULL,
  "TinhTrang"   varchar(20)   NOT NULL,
  "MucLuong"    numeric(12,2) NOT NULL CHECK ("MucLuong" > 0),
  "TenNganHang" varchar(50)   NULL,
  "SoTaiKhoan"  varchar(20)   NULL
);

-- ---------- Bảng cấp 2 ----------

CREATE TABLE "ChuQuan" (
  "MaQL" char(10) NOT NULL PRIMARY KEY REFERENCES "QuanLy" ("MaQL")
);

CREATE TABLE "LichLamViec" (
  "MaLich"  char(10) NOT NULL PRIMARY KEY,
  "NgayLam" date     NOT NULL,
  "MaCa"    char(10) NOT NULL REFERENCES "CaLam" ("MaCa"),
  "MaNV"    char(10) NOT NULL REFERENCES "NhanVien" ("MaNV")
);

CREATE TABLE "DangKyCaLam" (
  "MaDK"    char(10)     NOT NULL PRIMARY KEY,
  "LichRanh" varchar(100) NOT NULL,
  "NgayGui" timestamp    NOT NULL,
  "MaNV"    char(10)     NOT NULL REFERENCES "NhanVien" ("MaNV"),
  "MaCa"    char(10)     NOT NULL REFERENCES "CaLam" ("MaCa")
);

CREATE TABLE "DonXinNghi" (
  "MaXN"        char(10)     NOT NULL PRIMARY KEY,
  "NgayGui"     timestamp    NOT NULL,
  "LyDo"        varchar(255) NOT NULL,
  "TrangThai"   varchar(20)  NOT NULL CHECK ("TrangThai" IN ('Từ chối', 'Đã duyệt', 'Chờ duyệt')),
  "NgayBatDau"  date         NOT NULL,
  "NgayKetThuc" date         NOT NULL,
  "MaNV"        char(10)     NOT NULL REFERENCES "NhanVien" ("MaNV"),
  "MaQL"        char(10)     NULL REFERENCES "QuanLy" ("MaQL"),
  CONSTRAINT "CHK_DonXinNghi_Ngay" CHECK ("NgayKetThuc" >= "NgayBatDau")
);

CREATE TABLE "PhieuLuong" (
  "MaPL"               char(10)      NOT NULL PRIMARY KEY,
  "TongGioLam"         numeric(5,2)  NOT NULL CHECK ("TongGioLam" >= 0),
  "LuongTheoGioLam"    numeric(12,2) NOT NULL CHECK ("LuongTheoGioLam" >= 0),
  "TienPhat"           numeric(12,2) NOT NULL CHECK ("TienPhat" >= 0),
  "TienUngLuong"       numeric(12,2) NOT NULL CHECK ("TienUngLuong" >= 0),
  "ChenhLechKetChuyen" numeric(12,2) NOT NULL,
  "MaBL"               char(10)      NOT NULL REFERENCES "BangLuong" ("MaBL"),
  "MaND"               char(10)      NOT NULL REFERENCES "NhanVien" ("MaNV")
);

-- ---------- Bảng cấp 3 ----------

CREATE TABLE "ChamCong" (
  "MaCC"   char(10) NOT NULL PRIMARY KEY,
  "MaLich" char(10) NOT NULL REFERENCES "LichLamViec" ("MaLich"),
  "GioVao" time     NULL,
  "GioRa"  time     NULL
);

CREATE TABLE "ChamCongBoSung" (
  "MaCCBS"       char(10)     NOT NULL PRIMARY KEY,
  "GioVaoThucTe" time         NOT NULL,
  "GioRaThucTe"  time         NOT NULL,
  "MaLich"       char(10)     NULL REFERENCES "LichLamViec" ("MaLich"),
  "MaNV"         char(10)     NULL REFERENCES "NhanVien" ("MaNV"),
  "MaQL"         char(10)     NULL REFERENCES "QuanLy" ("MaQL"),
  -- giờ Việt Nam (tương đương GETDATE() của SQL Server chạy ở máy bạn)
  "NgayGui"      timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
  "LyDo"         varchar(255) NOT NULL DEFAULT '',
  "TrangThai"    varchar(20)  NOT NULL DEFAULT 'Chờ duyệt',
  CONSTRAINT "CHK_ChamCongBoSung_Gio" CHECK ("GioVaoThucTe" < "GioRaThucTe"),
  CONSTRAINT "CK_CCBS_TrangThai" CHECK ("TrangThai" IN ('Từ chối', 'Đã duyệt', 'Chờ duyệt'))
);

CREATE TABLE "CT_XinNghi" (
  "MaXN"   char(10) NOT NULL REFERENCES "DonXinNghi" ("MaXN"),
  "MaLich" char(10) NOT NULL REFERENCES "LichLamViec" ("MaLich"),
  PRIMARY KEY ("MaXN", "MaLich")
);

CREATE TABLE "DonDoiCa" (
  "MaDC"           char(10)     NOT NULL PRIMARY KEY,
  "NgayGui"        timestamp    NOT NULL,
  "LyDo"           varchar(255) NOT NULL,
  "TrangThai"      varchar(20)  NOT NULL CHECK ("TrangThai" IN ('Từ chối', 'Đã duyệt', 'Chờ duyệt')),
  "MaLichGoc"      char(10)     NOT NULL REFERENCES "LichLamViec" ("MaLich"),
  "MaLichMuonDoi"  char(10)     NOT NULL REFERENCES "LichLamViec" ("MaLich"),
  "MaNV"           char(10)     NOT NULL REFERENCES "NhanVien" ("MaNV"),
  "MaQL"           char(10)     NULL REFERENCES "QuanLy" ("MaQL")
);

CREATE TABLE "DonLamThay" (
  "MaLT"      char(10)     NOT NULL PRIMARY KEY,
  "NgayGui"   timestamp    NOT NULL,
  "LyDo"      varchar(255) NOT NULL,
  "TrangThai" varchar(20)  NOT NULL CHECK ("TrangThai" IN ('Từ chối', 'Đã duyệt', 'Chờ duyệt')),
  "MaLich"    char(10)     NOT NULL REFERENCES "LichLamViec" ("MaLich"),
  "MaNV"      char(10)     NOT NULL REFERENCES "NhanVien" ("MaNV"),
  "MaQL"      char(10)     NULL REFERENCES "QuanLy" ("MaQL")
);

CREATE TABLE "ChiTietLuong" (
  "MaCTL"     char(10)      NOT NULL PRIMARY KEY,
  "SoGioLam"  numeric(4,2)  NOT NULL CHECK ("SoGioLam" >= 0),
  "HeSoNgay"  numeric(4,2)  NOT NULL CHECK ("HeSoNgay" > 0),
  "MucLuong"  numeric(12,2) NOT NULL CHECK ("MucLuong" >= 0),
  "PhatDiTre" numeric(12,2) NOT NULL CHECK ("PhatDiTre" >= 0),
  "PhatBoCa"  numeric(12,2) NOT NULL CHECK ("PhatBoCa" >= 0),
  "MaLich"    char(10)      NOT NULL REFERENCES "LichLamViec" ("MaLich"),
  "MaPL"      char(10)      NOT NULL REFERENCES "PhieuLuong" ("MaPL")
);

CREATE TABLE "PhanHoiLuong" (
  "MaPH"           char(10)     NOT NULL PRIMARY KEY,
  "NgayGui"        timestamp    NOT NULL,
  "LyDo"           varchar(255) NOT NULL,
  "TrangThai"      varchar(20)  NOT NULL,
  "MaNV"           char(10)     NULL REFERENCES "NhanVien" ("MaNV"),
  "MaQL"           char(10)     NULL REFERENCES "QuanLy" ("MaQL"),
  "MaPL"           char(10)     NULL REFERENCES "PhieuLuong" ("MaPL"),
  "NoiDungDeXuat"  text         NULL
);

CREATE TABLE "UngLuong" (
  "MaUL"      char(10)      NOT NULL PRIMARY KEY,
  "NgayGui"   timestamp     NOT NULL,
  "LyDo"      varchar(50)   NOT NULL,
  "TrangThai" varchar(20)   NOT NULL,
  "SoTien"    numeric(12,2) NOT NULL CHECK ("SoTien" > 0),
  "MaPL"      char(10)      NULL REFERENCES "PhieuLuong" ("MaPL"),
  "MaNV"      char(10)      NULL REFERENCES "NhanVien" ("MaNV"),
  "MaQL"      char(10)      NULL REFERENCES "QuanLy" ("MaQL")
);

-- ---------- Bảo mật: bật Row Level Security (chưa có policy) ----------
-- Khi chưa có policy: khóa công khai (anon) KHÔNG đọc/ghi được gì.
-- Kết nối bằng DATABASE_URL (vai trò postgres) vẫn hoạt động bình thường.
ALTER TABLE "BangLuong"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaLam"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuanLy"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NhanVien"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChuQuan"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LichLamViec"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DangKyCaLam"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DonXinNghi"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhieuLuong"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChamCong"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChamCongBoSung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CT_XinNghi"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DonDoiCa"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DonLamThay"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChiTietLuong"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhanHoiLuong"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UngLuong"       ENABLE ROW LEVEL SECURITY;
