# Hệ thống chấm công và tính lương — NICK & THE JUICE COFFEE

Ứng dụng web nội bộ cho quán cà phê ~10 nhân viên: chấm công bằng Wi-Fi quán, xếp ca,
duyệt đơn từ, tổng hợp giờ làm và tính lương theo giờ.

- **Nguồn sự thật:** `doc/50K141.03.3007.txt` (SRS + 17 bảng CSDL + đặc tả màn hình)
  và `doc/UI/**` (168 ảnh giao diện). Thứ tự ưu tiên khi mâu thuẫn:
  **SRS > CSDL > đặc tả màn hình > UI**.
- **Hệ quản trị CSDL:** Microsoft SQL Server.
- **Công nghệ:** Node.js + Express 5 + EJS (render phía máy chủ, không cần bước build).

> **Trạng thái: đã xong Giai đoạn 1–4, đang rà soát Giai đoạn 5.** Xem mục [Phạm vi đã hoàn thành](#phạm-vi-đã-hoàn-thành-giai-đoạn-1) và `docs/PROGRESS.md`.

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản đã kiểm thử | Ghi chú |
|---|---|---|
| Node.js | 26.13.0 | tối thiểu 20 |
| npm | 11.20.0 | |
| Microsoft SQL Server | 2025 Developer | instance `localhost`, cổng `1433`, bật **Mixed Mode Authentication** |

## 2. Cài đặt và chạy (một lệnh sau khi cấu hình)

```powershell
# 1) Cài thư viện
npm install

# 2) Tạo file cấu hình từ mẫu, sửa thông tin đăng nhập SQL Server
Copy-Item .env.example .env

# 3) Tạo CSDL trắng (nếu chưa có) + chạy migration + nạp dữ liệu mẫu
npm run db:setup

# 4) Chạy ứng dụng
npm start          # http://localhost:3000
```

`npm run dev` chạy chế độ tự khởi động lại khi sửa mã nguồn.

### Các lệnh có sẵn

| Lệnh | Chức năng |
|---|---|
| `npm start` | Chạy ứng dụng |
| `npm run dev` | Chạy kèm `--watch` |
| `npm run db:migrate` | Áp dụng thay đổi CSDL đã được duyệt (idempotent) |
| `npm run db:seed` | Xóa và nạp lại toàn bộ dữ liệu mẫu |
| `npm run db:setup` | `db:migrate` + `db:seed` |
| `npm test` | Kiểm thử tự động (66 test) |
| `node scripts/smoke-test.js` | Kiểm tra khói 22 mục khi máy chủ đang chạy |

### Chuẩn bị CSDL lần đầu

Ứng dụng dùng **hai tài khoản SQL Server** tách quyền:

| Tài khoản | Quyền | Dùng cho |
|---|---|---|
| `chamcong_app` | `db_datareader`, `db_datawriter` | chạy ứng dụng (`DB_USER`) |
| `chamcong_migrator` | `db_owner` | chỉ chạy migration (`DB_ADMIN_USER`) |

Nếu CSDL `CHAMCONGTINHLUONG` chưa tồn tại, tạo bằng `sqlcmd` (hoặc SSMS) rồi chạy 2 script tạo login:

```sql
CREATE DATABASE CHAMCONGTINHLUONG;
GO
CREATE LOGIN chamcong_app      WITH PASSWORD = 'ChamCong@2026!App';
CREATE LOGIN chamcong_migrator WITH PASSWORD = 'ChamCong@2026!Migrate';
GO
USE CHAMCONGTINHLUONG;
CREATE USER chamcong_app      FOR LOGIN chamcong_app;
CREATE USER chamcong_migrator FOR LOGIN chamcong_migrator;
ALTER ROLE db_datareader ADD MEMBER chamcong_app;
ALTER ROLE db_datawriter ADD MEMBER chamcong_app;
ALTER ROLE db_owner      ADD MEMBER chamcong_migrator;
```

> Trên máy phát triển này CSDL đã tồn tại sẵn nên chỉ cần `npm run db:setup`.
> Đổi mật khẩu trong `.env` cho khớp nếu bạn dùng mật khẩu khác.

## 3. Tài khoản demo

Mật khẩu chung: **`123456`** (băm bằng bcrypt, không lưu mật khẩu thô).

| Vai trò | Số điện thoại | Họ tên | Trang chủ sau đăng nhập |
|---|---|---|---|
| Nhân viên | `0914673802` | Nguyễn Việt Đạt (NV005) | `/nhan-vien/trang-chu` |
| Quản lý | `0901234567` | Nguyễn Minh Anh (QL001) | `/quan-ly/trang-chu` |
| Chủ quán | `0909999999` | Trần Chủ Quán (QL002) | `/chu-quan/trang-chu` |

Đăng nhập bằng **số điện thoại**, không phải mã nhân viên (theo đặc tả màn hình Đăng nhập).

### Công tắc "Wi-Fi quán" (chỉ khi `DEMO_MODE=true`)

Chấm công chỉ thành công khi IP của máy khách thuộc `ALLOWED_IP_RANGES`. Để thử cả hai
nhánh mà không phải đổi mạng, bật `DEMO_MODE=true` trong `.env`; khi đó góc phải thanh
trên có công tắc mô phỏng vào/ra Wi-Fi quán. Mặc định `DEMO_MODE=false` — luôn kiểm tra
IP thật.

## 4. Phạm vi đã hoàn thành (Giai đoạn 1)

Giai đoạn 1 là **nền tảng**: CSDL, xác thực, phân quyền, khung giao diện, công thức lương.

- **CSDL:** 17 bảng gốc của SRS + 1 migration đã được duyệt (C1/C2/C3).
- **Đăng nhập / Đăng xuất** (UC01): số điện thoại + mật khẩu, băm bcrypt, session lưu
  phía máy chủ, CSRF cho mọi POST, dùng chung một thông báo lỗi để không dò được tài khoản,
  thông báo đúng đặc tả.
- **Đổi mật khẩu** (dùng chung cho Nhân viên và Quản lý): kiểm tra mật khẩu hiện tại,
  xác nhận khớp, không trùng mật khẩu cũ. **Chủ quán không có chức năng này.**
- **Phân quyền 3 vai trò** ở cả UI (menu) và API (middleware trả 403), chống truy cập chéo.
- **Trang chủ Nhân viên:** thẻ Chấm công / Check out với kiểm tra Wi-Fi, lịch làm việc tuần,
  ca hôm nay. Thông báo: `Chấm công thành công!`, `Check out thành công!`, `Kết nối sai Wifi`.
- **Trang chủ Quản lý / Chủ quán:** khung chào mừng + 2 thẻ điều hướng (đúng UI).
- **Công thức tính lương** trong `src/utils/payroll.js` — hàm độc lập, có chú thích,
  kiểm chứng bằng 66 unit test (`npm test` hoặc `node --test tests/`).
- **Dữ liệu mẫu:** 10 nhân viên theo ảnh `Sửa thông tin nhân viên 1.png`, 3 ca làm,
  504 ca trong 4 tháng, 367 bản ghi chấm công, 5 đơn nghỉ đã duyệt, các đơn chờ duyệt
  cho quản lý, 3 kỳ bảng lương (30 phiếu lương, 360 dòng chi tiết), 5 khoản ứng lương.
- **Bảo mật:** câu lệnh SQL tham số hóa 100%, escape HTML khi render, helmet + CSP,
  session cookie `httpOnly`/`sameSite=lax`, `trust proxy` đặt theo số lớp proxy thật.
- **Giao diện bám ảnh thiết kế** `doc/UI`: trang đăng nhập 2 cột (khối thương hiệu nâu +
  minh hoạ tách cà phê), khung ứng dụng với sidebar nâu nổi bo tròn, thanh trên cùng hiển thị
  ngày và "Xin chào, …", thẻ Chấm công / Check out, lịch làm việc 7 ngày, và thông báo dạng
  hộp thoại giữa màn hình (`Chấm công thành công!`, `Kết nối sai Wifi`).

Các mục menu chưa thuộc Giai đoạn 1 hiển thị trang "đang phát triển" kèm giai đoạn tương ứng
(Giai đoạn 2: nghiệp vụ nhân viên; 3: quản lý; 4: chủ quán; 5: hoàn thiện).

### Giai đoạn 2–4 đã hoàn thành

| Vai trò | Nhóm chức năng |
|---|---|
| Nhân viên | Chấm công bổ sung, đăng ký ca, đơn xin nghỉ/đổi ca/làm thay, ứng lương, xem lịch, kiểm tra phiếu lương + gửi phản hồi |
| Quản lý | Duyệt đơn nghỉ/đổi ca, duyệt làm thay, duyệt chấm công bổ sung, **duyệt ứng lương**, dữ liệu chấm công, bảng lương, duyệt bảng lương 2 bước, cập nhật bảng lương (gửi đề xuất), **xử lý phản hồi phiếu lương**, cập nhật/xem ca làm (có **áp dụng đăng ký ca**) |
| Chủ quán | Kế thừa toàn bộ màn hình Quản lý (trừ Đổi mật khẩu) + **thêm/sửa/xóa nhân viên** (tự sinh tài khoản, xóa mềm) + duyệt bước 2 bảng lương + xét đề xuất chỉnh sửa lương |

## 5. Công thức tính lương (BR-UC13.1-01 … -09)

Cài đặt tại `src/utils/payroll.js`, tách thành các hàm thuần để kiểm thử độc lập:

```
Lương giờ của một ca = Số giờ làm × Đơn giá giờ × Hệ số ngày
Thực nhận             = Lương theo giờ + Chênh lệch kết chuyển − Tiền phạt − Tiền ứng
```

| Quy tắc | Nội dung | Hằng số |
|---|---|---|
| BR-UC13.1-03 | Số giờ làm = giờ ra − giờ vào của bản ghi chấm công hợp lệ | — |
| BR-UC13.1-04 | Thử việc tuần đầu 21.000đ/giờ; sau đó 23.000đ hoặc 25.000đ theo `NhanVien.MucLuong` | `LUONG_THU_VIEC` |
| BR-UC13.1-05 | Hệ số ngày: Quốc khánh 02/09 = 2; mùng 1–3 Tết = 3; còn lại = 1 | `config/holidays.json` |
| BR-UC13.1-06 | Vào ca trễ ≥ 10 phút: −50.000đ/lần | `PHAT_DI_TRE`, `NGUONG_DI_TRE_PHUT` |
| BR-UC13.1-07 | Bỏ ca không có đơn được duyệt: −100.000đ/ca | `PHAT_BO_CA` |
| BR-UC13.1-08 | Chênh lệch kết chuyển kỳ trước cộng/trừ vào kỳ này | — |
| BR-UC13.1-09 | Thực nhận = Lương giờ + Kết chuyển − Phạt − Ứng | — |

`config/holidays.json` là **nguồn duy nhất** cho cả hệ số lương và quy tắc xếp 2 nhân viên/ca
vào ngày lễ (quyết định C9).

## 6. Cấu trúc thư mục

```
doc/                      tài liệu gốc (SRS + ảnh UI)
docs/PHAN_TICH_BUOC0.md   phân tích Bước 0 + 20 mâu thuẫn + quyết định đã chốt
config/holidays.json      nguồn ngày lễ duy nhất
db/migrations/*.sql       thay đổi CSDL đã được duyệt
db/seed.js                sinh dữ liệu mẫu
scripts/migrate.js        chạy migration (tài khoản db_owner)
scripts/smoke-test.js     kiểm tra khói 22 mục
tests/*.test.js           66 unit test (lương, sinh bảng lương, duyệt, đề xuất, nhân viên, ứng lương, phản hồi)
src/config/               env, kết nối CSDL, cấu hình menu theo vai trò
src/middleware/           auth (RBAC), csrf, wifi, flash, locals, error
src/services/             nghiệp vụ (auth, attendance)
src/routes/               định tuyến theo vai trò
src/views/                EJS (partials + pages)
src/public/               CSS, JS, ảnh
```

## 7. Những điểm lệch so với tài liệu gốc (đã được duyệt)

Toàn bộ chi tiết ở `docs/PHAN_TICH_BUOC0.md`, mục 13. Tóm tắt các thay đổi CSDL:

| Mã | Thay đổi | Lý do |
|---|---|---|
| C1 | `NhanVien.MatKhau`, `QuanLy.MatKhau` → `VARCHAR(100)` | chứa hash bcrypt (60 ký tự) |
| C2 | `BangLuong.TinhTrang` thêm `N'Chờ chủ quán duyệt'`, `N'Từ chối'` | luồng duyệt 2 bước BR-UC13.2-01 |
| C3 | `ChamCongBoSung` thêm `NgayGui`, `LyDo`, `TrangThai` (+ CHECK) | UC04 cần lưu lý do và trạng thái duyệt |
| P1 | `PhanHoiLuong` thêm `NoiDungDeXuat NVARCHAR(MAX)` | lưu đề xuất chỉnh sửa lương dạng JSON (UC13.3) |
| P2 | `PhanHoiLuong.LyDo` → `NVARCHAR(255)` | lý do chỉnh sửa dài hơn 50 ký tự |
| P3 | `BangLuong.TinhTrang`: bỏ `N'Đã chi trả'`, dữ liệu cũ đổi sang `N'Đã duyệt'` | trạng thái cuối của luồng duyệt 2 bước |

## 8. Giả định đã chốt với người dùng

1. **`MucLuong` là đơn giá giờ** (đồng/giờ), không phải lương tháng — theo BR-UC13.1-04.
2. **Xóa nhân viên là xóa mềm:** `TinhTrang = N'Đã nghỉ'`, chặn đăng nhập, giữ lịch sử lương.
3. **`PhanHoiLuong` dùng cho hai việc:** phản hồi sai sót của nhân viên (`NoiDungDeXuat IS NULL`) và đề xuất chỉnh sửa lương của quản lý (JSON trong `NoiDungDeXuat`). Hai màn hình xử lý tách biệt.
4. **"Phương thức nghỉ"** suy ra từ khoảng ngày, không lưu thành cột.
5. **Cột "Ứng" theo từng ca** hiển thị 0; tổng ứng nằm ở dòng tổng cuối bảng.
6. **Điện thoại là duy nhất toàn hệ thống** (kiểm tra chéo cả `NhanVien` và `QuanLy`).
   *Ngoại lệ có chủ đích:* `NV001 Nguyễn Minh Anh` tồn tại ở cả hai bảng (đúng như ảnh UI);
   khi đăng nhập hệ thống ưu tiên vai trò Quản lý.
7. **`DangKyCaLam.LichRanh`** lưu danh sách ngày ISO cách nhau dấu phẩy.
8. **Bảng lương mẫu:** 3 kỳ gần nhất (`Đã duyệt`, `Chờ chủ quán duyệt`, `Chưa duyệt`);
   tháng hiện tại chưa có bảng lương — đúng BR-UC13.1-01 (chỉ tổng hợp sau khi kết ca
   ngày cuối tháng).
9. **NV004 `Phạm Đình Huy`** giữ `TinhTrang = N'Thử việc'` đúng dữ liệu ảnh UI, nên chỉ
   tuần đầu tiên kể từ `NgayVaoLam` hưởng 21.000đ/giờ, các ca sau đó dùng `MucLuong`.
10. **Ca hôm nay của nhân viên demo luôn để trống** trong dữ liệu mẫu để có sẵn một ca mở
    cho việc thử Chấm công / Check out ở bất kỳ thời điểm nào.

## 9. Kiểm thử

```powershell
npm test                        # 66 unit test (lương, sinh bảng lương, duyệt, đề xuất, nhân viên, ứng lương, phản hồi)
node --test tests/              # cùng bộ test, dùng khi npm bị chặn bởi ExecutionPolicy
node scripts/smoke-test.js      # 22 kiểm tra đầu-cuối (cần máy chủ đang chạy)
```

`smoke-test.js` bao phủ: trang đăng nhập, sai mật khẩu, bỏ trống, đăng nhập 3 vai trò,
chặn truy cập chéo (403), chủ quán không có đổi mật khẩu, chấm công sai/đúng Wi-Fi,
check out, CSRF, đăng xuất, 404.

> Smoke test có ghi dữ liệu (một lượt chấm công vào/ra của nhân viên demo), nên hãy chạy
> `npm run db:seed` **trước** mỗi lần chạy smoke test và trước khi demo.

## 10. Lộ trình 6 giai đoạn

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0 | Phân tích, kiến trúc, chốt mâu thuẫn | ✅ xong |
| 1 | Khởi tạo dự án, CSDL, dữ liệu mẫu, xác thực, khung UI | ✅ xong |
| 2 | Nghiệp vụ nhân viên (UC02–UC09) | ✅ xong |
| 3 | Nghiệp vụ quản lý (UC10–UC12) | ✅ xong |
| 4 | Nghiệp vụ chủ quán (UC13–UC16) | ✅ xong — UC13.1/13.2/13.3 + UC14.1–14.3 |
| 5 | Rà soát cuối, hoàn thiện tài liệu | ⏳ đang rà soát |
