# BƯỚC 0 — PHÂN TÍCH HỆ THỐNG
## Hệ thống quản lý chấm công và tính lương — NICK & THE JUICE COFFEE

> Tài liệu phân tích trước khi viết code. Mọi mục đánh dấu **[CẦN XÁC NHẬN]** là điểm mâu thuẫn giữa các nguồn, chưa được tự quyết.
> Thứ tự ưu tiên khi mâu thuẫn: **SRS > CSDL > Đặc tả màn hình > UI**.

---

## 1. Nguồn đã đọc

| Nguồn | Đường dẫn | Ghi chú |
|---|---|---|
| SRS + Đặc tả màn hình + Lược đồ CSDL | `doc/50K141.03.3007.txt` (7.852 dòng) | 16 use case, 17 bảng, đặc tả từng thành phần màn hình |
| Giao diện | `doc/UI/**` | 168 ảnh PNG, 21 nhóm màn hình |
| Hệ QTCSDL của file schema | — | **Microsoft SQL Server** (T-SQL: `NVARCHAR`, `CHAR`, `TINYINT`, `LEN()`, `LIKE '%[^0-9]%'`, `TIME`, `DATETIME`) |

Môi trường đã kiểm tra:

- SQL Server 2025 Developer Edition đang chạy (`MSSQLSERVER`, `localhost`, Windows Authentication).
- Database `CHAMCONGTINHLUONG` **đã tồn tại, đủ 17 bảng, đang rỗng** (0 bản ghi). Xem mục 9 — câu hỏi Q1.
- Node.js v26.13.0, npm 11.20.0. `sqlcmd` sẵn sàng.

---

## 2. Tóm tắt nghiệp vụ

Quán cà phê ~10 nhân viên. Thay thế Excel + xem camera bằng:

1. Chấm công online (ràng buộc Wi-Fi quán).
2. Quản lý lịch làm việc theo tuần, đăng ký ca, đổi ca, xin nghỉ, làm thay.
3. Chấm công bổ sung khi quên/sự cố, có duyệt.
4. Tự động tổng hợp giờ làm → tính lương theo giờ, hệ số ngày, phạt, ứng lương.
5. Duyệt bảng lương **2 bước**: Quản lý → Chủ quán.
6. Nhân viên xem phiếu lương, xác nhận hoặc báo lỗi.

**3 ca cố định** (BR-UC5-01): Ca sáng 06:00–12:00 (6h) · Ca chiều 12:00–18:00 (6h) · Ca tối 18:00–22:00 (4h).
**Định biên** (BR-UC5-02): ngày thường 1 NV/ca; cuối tuần & ngày lễ 2 NV/ca.

---

## 3. Vai trò & phân quyền

| Vai trò | Bảng xác thực | Quyền |
|---|---|---|
| **Nhân viên** | `NhanVien` | Trang chủ, chấm công/check-out, chấm công bổ sung, đăng ký ca, xin nghỉ/đổi ca/làm thay, xem lịch, phiếu lương, ứng lương, đổi mật khẩu |
| **Quản lý** | `QuanLy` | Trang chủ, duyệt 5 loại đơn, cập nhật ca làm, xem danh sách ca, xem dữ liệu chấm công, bảng lương (xem/duyệt bước 1/cập nhật), đổi mật khẩu |
| **Chủ quán** | `QuanLy` + `ChuQuan` | **Kế thừa toàn bộ Quản lý, trừ Đổi mật khẩu** + Quản lý thông tin nhân viên (thêm/sửa/xóa) + duyệt bảng lương bước cuối + duyệt đề xuất chỉnh sửa lương |

- Chủ quán là **subtype của Quản lý**: `ChuQuan.MaQL` vừa là PK vừa là FK → `QuanLy.MaQL`. Đăng nhập bằng bảng `QuanLy`, sau đó kiểm tra sự tồn tại trong `ChuQuan` để nâng quyền.
- Tên đăng nhập = **số điện thoại** (BR-UC1-02), dùng chung cho cả 3 vai trò.
- Chủ quán **không có** chức năng Đổi mật khẩu (đúng theo yêu cầu và đúng sidebar trong ảnh UI chủ quán).

---

## 4. Danh sách Use Case (16 UC, 8 UC con)

| ID | Tên | Actor | Bảng CSDL chính |
|---|---|---|---|
| UC01 | Đăng nhập | NV/QL/CQ | `NhanVien`, `QuanLy`, `ChuQuan` |
| UC02 | Chấm công (check-in) | NV | `LichLamViec`, `ChamCong`, `CaLam` |
| UC03 | Check out | NV | `ChamCong` |
| UC04 | Chấm công bổ sung | NV | `ChamCongBoSung`, `LichLamViec` |
| UC05 | Đăng ký ca làm | NV | `DangKyCaLam`, `CaLam`, `LichLamViec` |
| UC06 | Đăng ký xin nghỉ / đổi ca / làm thay | NV | `DonXinNghi`, `CT_XinNghi`, `DonDoiCa`, `DonLamThay` |
| UC07 | Xem lịch làm việc | NV | `LichLamViec`, `CaLam` |
| UC08 | Kiểm tra phiếu lương (+ báo lỗi) | NV | `PhieuLuong`, `BangLuong`, `PhanHoiLuong` |
| UC09 | Ứng lương | NV | `UngLuong` |
| UC10.1 | Cập nhật ca làm | QL/CQ | `LichLamViec`, `CaLam`, `NhanVien` |
| UC10.2 | Xem danh sách ca làm | QL/CQ | `LichLamViec`, `CaLam`, `NhanVien` |
| UC11.1 | Duyệt đơn xin nghỉ / đổi ca | QL/CQ | `DonXinNghi`, `CT_XinNghi`, `DonDoiCa`, `LichLamViec` |
| UC11.2 | Duyệt đơn làm thay | QL/CQ | `DonLamThay`, `LichLamViec` |
| UC12.1 | Duyệt chấm công bổ sung | QL/CQ | `ChamCongBoSung`, `ChamCong` |
| UC12.2 | Xem dữ liệu chấm công | QL/CQ | `ChamCong`, `LichLamViec`, `NhanVien`, `CaLam` |
| UC13.1 | Tổng hợp giờ làm & tính lương | QL/CQ | `ChamCong`, `ChiTietLuong`, `PhieuLuong`, `BangLuong` |
| UC13.2 | Duyệt bảng lương (2 bước) | QL/CQ | `BangLuong`, `PhieuLuong` |
| UC13.3 | Cập nhật bảng lương (đề xuất chỉnh sửa) | QL/CQ | `PhieuLuong`, `ChiTietLuong`, `PhanHoiLuong` |
| UC14.1 | Thêm nhân viên | CQ | `NhanVien` |
| UC14.2 | Sửa thông tin nhân viên | CQ | `NhanVien` |
| UC14.3 | Xóa nhân viên | CQ | `NhanVien` |
| UC15 | Đổi mật khẩu | NV/QL | `NhanVien` / `QuanLy` |
| UC16 | Đăng xuất | NV/QL/CQ | — (session) |

---

## 5. Danh sách màn hình (theo UI)

### 5.1. Nhân viên (9 màn hình + biến thể)

| # | Màn hình | Ảnh UI | Thành phần chính |
|---|---|---|---|
| E1 | Đăng nhập | `Đăng nhập/1..6` | Split-screen: panel nâu + logo + minh hoạ tách; form phải; lỗi "Không được để trống Tên đăng nhập và mật khẩu !", "Đăng nhập không thành công" |
| E2 | Trang chủ / Chấm công | `Chấm công/1..3` | 2 card "Chấm công hôm nay" / "Check out" + giờ lớn; 2 nút phụ; bảng lịch tuần T2→CN; toast thành công / "Kết nối sai Wifi" |
| E3 | Chấm công bổ sung | `Chấm công bổ sung/1..6` | Form: Ca làm (dropdown) → Giờ vào (auto) → Giờ ra (time) → Lý do; lỗi "Vui lòng nhập giờ ra.", "Vui lòng bổ sung lý do." |
| E4 | Đăng ký ca làm | `Đăng kí ca làm/1..4` | "Tuần đăng ký"; lưới 7 ngày × 3 ca; ô chọn = nền nâu chữ trắng; lỗi "Vui lòng chọn ít nhất một ca làm!"; "Đã có đủ số lượng nhân viên cho ca này!" |
| E5 | Đăng ký xin nghỉ | `Đăng ký xin nghỉđổi ca/.../đổi ca 1..4` | 3 tab `[Xin nghỉ] [Đổi ca] [Làm thay]`; Phương thức nghỉ (*), Thời gian nghỉ (*), Lý do nghỉ (*) |
| E6 | Đổi ca | `.../đổi ca 5..9` | Lịch tuần của tôi → chọn ca → tìm đồng nghiệp → lịch đồng nghiệp → chọn ca → Lý do đổi ca |
| E7 | Làm thay | `.../đổi ca 10..11` | Bảng ca trống: Ngày · Ca làm · Thời gian · Trạng thái · Hành động (`Đăng ký nhận ca`) |
| E8 | Xem lịch làm việc | `Xem lịch làm việc/1..3` | Lưới 7 ngày, thẻ ca nâu / thẻ "Nghỉ"; empty "Bạn chưa có ca làm việc nào trong tuần này" |
| E9 | Kiểm tra phiếu lương | `Kiểm tra phiếu lương/1..6` | Kỳ lương (dropdown), trạng thái, 7 dòng: Mức lương · Tổng số giờ làm · Tổng lương · Hệ số lương · Phạt · Ứng lương · THỰC NHẬN; nút `Báo lỗi`, `Xác nhận` |
| E10 | Ứng lương | `Ứng lương/1..2` | 3 thẻ mức ứng 500.000 / 1.000.000 / 2.000.000 (radio), "Số tiền ứng đã chọn", `Gửi yêu cầu` |
| E11 | Đổi mật khẩu | `Đổi mật khẩu/1..7` | 3 ô password có icon mắt; 4 thông báo lỗi + thành công |

### 5.2. Quản lý (11 màn hình + biến thể)

| # | Màn hình | Ảnh UI | Thành phần chính |
|---|---|---|---|
| M1 | Đăng nhập | dùng chung E1 | |
| M2 | Trang chủ QL | `Cập nhật ca làm/1-1` | "Chào mừng bạn đã quay trở lại!" + 2 card `Cập nhật ca làm`, `Xem danh sách ca làm` |
| M3 | Cập nhật ca làm | `Cập nhật ca làm/2..6` | Bộ chọn tuần; bảng Ngày làm · Ca · Khung giờ · Nhân viên; màn chi tiết: "Nhân viên trong ca" (`− Gỡ`) / "Nhân viên không thuộc ca" (`+ Thêm`) + `Lưu`; lỗi "Không thể cập nhật ca đã diễn ra" |
| M4 | Xem danh sách ca làm | `Xem danh sách ca làm/1..4` | Bộ lọc Thời gian + Ca làm (Tất cả/Ca sáng/Ca chiều/Ca tối) + `Xem`; bảng Ngày · Ca làm · Giờ · Nhân viên được xếp; empty "Chưa có lịch làm việc cho thời gian này!" |
| M5 | Duyệt đơn xin nghỉ/đổi ca | `Duyệt đơn xin nghỉ đổi ca/.../1..5` | Danh sách đơn chờ (avatar, tên, "Chờ duyệt", thời gian gửi) → Chi tiết: Ca xin nghỉ *, Lý do * → `Không Duyệt` / `Duyệt`; empty "Không có đơn chờ duyệt!" |
| M6 | Duyệt đơn làm thay | `Duyệt đơn xin làm thay/1..10` | Tương tự M5, nhãn "Ca làm thay", "Lý do" |
| M7 | Duyệt chấm công bổ sung | `Duyệt chấm công bổ sung/1..10` | Danh sách yêu cầu → Chi tiết: Nhân viên · Ngày · Ca làm · Lý do * |
| M8 | Dữ liệu chấm công | `Dữ liệu chấm công/1..16` | Bộ lọc Thời gian (Ngày/Tuần) · Nhân viên · Ca làm + `Xem`; 3 KPI: Tổng số giờ làm, Tổng số ca đi trễ, Tổng số ca bỏ; bảng Ngày · Giờ vào · Giờ ra; giờ trễ/mất màu đỏ; empty "Không có dữ liệu chấm công!" |
| M9 | Bảng lương (tổng hợp) | `Tổng hợp giờ làm và tính lương/1..6` | Danh sách kỳ lương: Kỳ lương · Ngày bắt đầu–kết thúc · Chi trả → "Tổng hợp lương nhân viên" (Nhân viên · Tổng giờ làm · Lương giờ làm · Phạt · Ứng lương · Thực nhận) → Chi tiết theo ca (Ngày · Ca làm · Số giờ làm · Hệ số lương · Đơn giá/giờ · Phạt · Ứng lương · Thực nhận) + phân trang |
| M10 | Duyệt bảng lương (bước 1) | `Duyệt bảng lương/1..11` | Như M9 + icon bút sửa (mở "Lý do chỉnh sửa" + `Lưu`), `Không duyệt` / `Duyệt` → "Chờ chủ quán duyệt" |
| M11 | Cập nhật bảng lương | `Cập nhật bảng lương/1..15` | "Danh sách phiếu lương" (Nhân viên · Thực nhận tháng) → "Chi tiết phiếu lương" (9 cột) → `Đối chiếu dữ liệu` (3 thẻ: Phiếu lương hiện tại / Dữ liệu chấm công / Lịch làm) → `Không có sai sót` hoặc `Chỉnh sửa` (Giờ vào, Phạt, Giờ ra, Ứng lương, Lý do) → `Gửi đề xuất` |
| M12 | Đổi mật khẩu | `Đổi mật khẩu/8..14` | Như E11 |

### 5.3. Chủ quán (kế thừa M1–M12, thêm 4 màn hình)

| # | Màn hình | Ảnh UI | Ghi chú |
|---|---|---|---|
| O1 | Trang chủ CQ | `Thêm nhân viên/1` (sidebar) | Sidebar có thêm "Quản lý thông tin nhân viên" |
| O2 | Duyệt bảng lương (bước cuối) | `Duyệt bảng lương/…` + 7.2.3.39–43 | Nhận "Bảng lương cần duyệt!" → duyệt/không duyệt kèm lý do → "Đã duyệt" |
| O3 | Xét đề xuất chỉnh sửa lương | `Cập nhật bảng lương/…` + 7.2.3.44–47 | Bảng so sánh "Khoản điều chỉnh · Phiếu hiện tại · Đề xuất" (Giờ vào-giờ ra, Số giờ làm, Phạt, Ứng, Thực nhận ca, Thực nhận tháng) |
| O4 | Thêm nhân viên | `Thêm nhân viên/1..4` | 8 trường bắt buộc; lỗi "Vui lòng điền đầy đủ thông tin!", "Đã có nhân viên trùng mã!", "Đã có nhân viên trùng số điện thoại!"; thành công hiện **tên đăng nhập + mật khẩu tự sinh** |
| O5 | Sửa thông tin nhân viên | `Sửa thông tin nhân viên/1..4` | Bảng 8 cột → form sửa; lỗi "Số điện thoại đã tồn tại trong hệ thống" |
| O6 | Xóa nhân viên | `Xóa nhân viên/1..3` | Modal "Xóa nhân viên này?" → `Hủy` / `Xóa nhân viên` → "Xóa nhân viên thành công !" |

**Tổng: 19 màn hình nghiệp vụ** (chưa tính biến thể lỗi/thành công).

---

## 6. Quan hệ khóa ngoại (17 bảng)

```
NhanVien (MaNV)
 ├─ LichLamViec.MaNV
 ├─ DangKyCaLam.MaNV
 ├─ DonXinNghi.MaNV
 ├─ DonDoiCa.MaNV
 ├─ DonLamThay.MaNV
 ├─ ChamCongBoSung.MaNV
 ├─ UngLuong.MaNV
 ├─ PhanHoiLuong.MaNV
 └─ PhieuLuong.MaND            ← tên cột lệch: xem mâu thuẫn C7

QuanLy (MaQL)
 ├─ ChuQuan.MaQL                 (1–1, subtype Chủ quán)
 ├─ DonXinNghi.MaQL             (NULL khi chờ duyệt)
 ├─ DonDoiCa.MaQL
 ├─ DonLamThay.MaQL
 ├─ ChamCongBoSung.MaQL
 ├─ UngLuong.MaQL
 └─ PhanHoiLuong.MaQL

CaLam (MaCa)
 ├─ DangKyCaLam.MaCa
 └─ LichLamViec.MaCa

LichLamViec (MaLich)
 ├─ ChamCong.MaLich             (1–1 theo ca)
 ├─ CT_XinNghi.MaLich           (PK kép với MaXN)
 ├─ DonDoiCa.MaLichGoc
 ├─ DonDoiCa.MaLichMuonDoi
 ├─ DonLamThay.MaLich
 ├─ ChamCongBoSung.MaLich
 └─ ChiTietLuong.MaLich

DonXinNghi (MaXN) ── CT_XinNghi.MaXN
BangLuong (MaBL)  ── PhieuLuong.MaBL
PhieuLuong (MaPL) ── ChiTietLuong.MaPL
                  ── UngLuong.MaPL
                  ── PhanHoiLuong.MaPL
```

Quan hệ nghiệp vụ suy ra (không phải FK):

- `PhieuLuong` 1–N `ChiTietLuong` (mỗi ca trong kỳ = 1 dòng chi tiết).
- `PhieuLuong.TienUngLuong` = tổng `UngLuong` đã duyệt trong kỳ.
- `PhieuLuong.TienPhat` = tổng `ChiTietLuong.PhatDiTre + PhatBoCa`.
- `PhieuLuong.ThucNhan` **không có cột** → tính tại runtime.

---

## 7. Bảng ánh xạ: UC / Màn hình → Bảng → API

Tiền tố `/api`. Tất cả API đều qua middleware `requireLogin` + `requireRole`.

### 7.1. Chung

| UC | Màn hình | Bảng | API |
|---|---|---|---|
| UC01 | E1/M1 | `NhanVien`, `QuanLy`, `ChuQuan` | `POST /auth/login` · `GET /auth/me` |
| UC16 | mọi trang | — | `POST /auth/logout` |
| UC15 | E11/M12 | `NhanVien`/`QuanLy` | `POST /auth/change-password` |

### 7.2. Nhân viên

| UC | Màn hình | Bảng | API |
|---|---|---|---|
| UC02 | E2 | `LichLamViec`, `CaLam`, `ChamCong` | `GET /me/shift-today` · `POST /attendance/check-in` |
| UC03 | E2 | `ChamCong` | `POST /attendance/check-out` |
| UC04 | E3 | `ChamCongBoSung`, `LichLamViec` | `GET /me/shifts-past` · `POST /supplements` |
| UC05 | E4 | `DangKyCaLam`, `CaLam`, `LichLamViec` | `GET /shifts?week` · `GET /registrations/capacity?week` · `POST /registrations` |
| UC06 | E5–E7 | `DonXinNghi`, `CT_XinNghi`, `DonDoiCa`, `DonLamThay` | `POST /requests/leave` · `POST /requests/swap` · `GET /shifts/open` · `POST /requests/cover` |
| UC07 | E8 | `LichLamViec`, `CaLam` | `GET /me/schedule?week` |
| UC08 | E9 | `BangLuong`, `PhieuLuong`, `ChiTietLuong` | `GET /me/payslip?period` · `POST /me/payslip/confirm` · `POST /me/payslip/feedback` |
| UC09 | E10 | `UngLuong` | `POST /advances` · `GET /me/advances` |

### 7.3. Quản lý / Chủ quán

| UC | Màn hình | Bảng | API |
|---|---|---|---|
| UC10.1 | M3 | `LichLamViec`, `CaLam`, `NhanVien` | `GET /schedule?week` · `GET /schedule/:maLich` · `POST /schedule/:maLich/members` · `DELETE /schedule/:maLich/members/:maNV` |
| UC10.2 | M4 | `LichLamViec`, `CaLam`, `NhanVien` | `GET /schedule/list?from&to&maCa` |
| UC11.1 | M5 | `DonXinNghi`, `CT_XinNghi`, `DonDoiCa` | `GET /approvals/leave-swap?status` · `GET /approvals/leave-swap/:id` · `POST /approvals/leave-swap/:id/approve` · `.../reject` |
| UC11.2 | M6 | `DonLamThay` | `GET /approvals/cover` · `POST /approvals/cover/:id/approve` · `.../reject` |
| UC12.1 | M7 | `ChamCongBoSung`, `ChamCong` | `GET /approvals/supplements` · `POST /approvals/supplements/:id/approve` · `.../reject` |
| UC12.2 | M8 | `ChamCong`, `LichLamViec`, `NhanVien` | `GET /attendance?mode=day|week&date&maNV&maCa` (+ KPI tổng giờ / trễ / bỏ) |
| UC13.1 | M9 | `BangLuong`, `PhieuLuong`, `ChiTietLuong` | `GET /payroll/periods` · `POST /payroll/periods/generate` · `GET /payroll/:maBL` · `GET /payroll/:maBL/employee/:maNV` |
| UC13.2 | M10 | `BangLuong`, `PhieuLuong` | `POST /payroll/:maBL/approve-manager` · `POST /payroll/:maBL/approve-owner` · `POST /payroll/:maBL/reject` |
| UC13.3 | M11 | `PhieuLuong`, `ChiTietLuong`, `PhanHoiLuong` | `GET /payroll/slips?period` · `GET /payroll/slips/:maPL` · `POST /payroll/slips/:maPL/proposal` · `POST /payroll/slips/:maPL/no-error` · `POST /payroll/proposals/:id/approve` · `.../reject` |

### 7.4. Chủ quán (riêng)

| UC | Màn hình | Bảng | API |
|---|---|---|---|
| UC14.1 | O4 | `NhanVien` | `GET /employees` · `POST /employees` |
| UC14.2 | O5 | `NhanVien` | `GET /employees/:maNV` · `PUT /employees/:maNV` |
| UC14.3 | O6 | `NhanVien` | `DELETE /employees/:maNV` |

---

## 8. Công thức tính lương (đề xuất — hàm riêng, có chú thích)

Theo BR-UC13.1-01…09. Toàn bộ nằm trong `src/utils/payroll.js`, thuần hàm, không truy vấn DB → dễ unit-test.

```
BƯỚC 1 — Với mỗi LichLamViec trong kỳ [NgayBatDau, NgayKetThuc]:

  gioVao = ChamCong.GioVao  ??  ChamCongBoSung.GioVaoThucTe (đã duyệt)
  gioRa  = ChamCong.GioRa   ??  ChamCongBoSung.GioRaThucTe  (đã duyệt)

  Nếu (gioVao == null):
      nếu ca có đơn nghỉ/đổi ca ĐÃ DUYỆT  →  không phạt, SoGioLam = 0
      ngược lại (bỏ ca, ca đã qua)        →  PhatBoCa = 100.000, SoGioLam = 0
  Ngược lại:
      SoGioLam  = (gioRa − gioVao) tính bằng giờ, làm tròn 2 chữ số   // BR-UC13.1-03
      PhatDiTre = (gioVao − CaLam.GioBatDau ≥ 10 phút) ? 50.000 : 0   // BR-UC13.1-06
      HeSoNgay  = 2 nếu 02/09
                = 3 nếu mùng 1–3 Tết Âm lịch
                = 1 các ngày còn lại                                  // BR-UC13.1-05
      MucLuong  = 21.000 nếu thử việc và trong 7 ngày đầu
                = NhanVien.MucLuong (đơn giá giờ chính thức)          // BR-UC13.1-04

  → ghi 1 dòng ChiTietLuong(SoGioLam, HeSoNgay, MucLuong, PhatDiTre, PhatBoCa, MaLich, MaPL)

BƯỚC 2 — Tổng hợp PhieuLuong cho mỗi nhân viên:

  TongGioLam        = Σ SoGioLam
  LuongTheoGioLam    = Σ (SoGioLam × MucLuong × HeSoNgay)             // BR-UC13.1-02
  TienPhat          = Σ (PhatDiTre + PhatBoCa)
  TienUngLuong      = Σ UngLuong.SoTien (TrangThai = 'Đã duyệt', trong kỳ)
  ChenhLechKetChuyen= phần chênh lệch kết chuyển từ kỳ trước           // BR-UC13.1-08
  ThucNhan          = LuongTheoGioLam + ChenhLechKetChuyen
                      − TienPhat − TienUngLuong                        // BR-UC13.1-09
```

**Quy tắc phụ:**

- Kỳ lương = từ ngày 01 đến ngày cuối tháng; chi trả ngày 05 tháng sau (BR-UC13.1-01).
- Chỉ sinh bảng lương khi đã kết ca ngày cuối tháng (hoặc nút "Tính lương" cho demo).
- Sửa lương **quá hạn** (sau ngày 05) → phần chênh lệch ghi vào `PhieuLuong.ChenhLechKetChuyen` của kỳ kế tiếp (UC13.3 – 11a).
- Ngày lễ: không có bảng `NgayLe` → dùng file cấu hình `config/holidays.json` (dương lịch + Tết Âm lịch theo năm). **[CẦN XÁC NHẬN C9]**

---

## 9. Mâu thuẫn giữa các nguồn

> Mỗi mục ghi rõ nguồn nào nói gì, và đề xuất xử lý. **Chưa tự quyết.**

| # | Mâu thuẫn | Chi tiết | Đề xuất |
|---|---|---|---|
| **C1** | `MatKhau` quá ngắn cho băm mật khẩu | CSDL: `MatKhau VARCHAR(30)`. Yêu cầu kỹ thuật: bcrypt (60 ký tự) / argon2 (~96). **Không thể lưu.** | Nới `MatKhau` lên `VARCHAR(100)` ở cả `NhanVien` và `QuanLy` (chỉ đổi độ dài, không đổi tên/kiểu logic) |
| **C2** | Trạng thái bảng lương thiếu giá trị | SRS UC13.2 bước 5 + UI 7.2.2.45: trạng thái **"Chờ chủ quán duyệt"**. CSDL `CHECK (TinhTrang IN ('Chưa duyệt','Đã duyệt','Đã chi trả'))` **không có** giá trị này; cũng không có trạng thái "Từ chối". | Bổ sung 2 giá trị vào CHECK: `'Chờ chủ quán duyệt'`, `'Từ chối'` |
| **C3** | `ChamCongBoSung` thiếu cột nghiệp vụ | SRS UC04 cần **Lý do** + **trạng thái chờ duyệt**; UC12.1 cần Duyệt/Không duyệt. Bảng chỉ có `GioVaoThucTe, GioRaThucTe, MaLich, MaNV, MaQL` — **không có** `NgayGui`, `LyDo`, `TrangThai`. | Thêm 3 cột `NgayGui DATETIME NOT NULL`, `LyDo NVARCHAR(255) NOT NULL`, `TrangThai NVARCHAR(20)` (CHECK như các bảng đơn khác) |
| **C4** | Không thể biểu diễn "ca trống" | SRS UC11.1: duyệt nghỉ → "ca xin nghỉ được chuyển thành ca trống". Nhưng `LichLamViec.MaNV NOT NULL` → không thể để trống. | **Không đổi CSDL**: ca trống = `LichLamViec` mà chủ ca có đơn nghỉ ĐÃ DUYỆT phủ ngày đó và chưa có `DonLamThay` được duyệt. Suy ra bằng truy vấn. |
| **C5** | Xóa nhân viên vs. lịch sử lương | SRS UC14.3 xóa cứng; NFR-03 "khóa/xóa ngay". Nhưng `PhieuLuong`, `LichLamViec`… tham chiếu `MaNV` → xóa cứng sẽ mất lịch sử lương hoặc vi phạm FK. | Xóa mềm: `TinhTrang = N'Đã nghỉ'` + chặn đăng nhập. Không thêm cột. (Nếu cần xóa cứng thật, phải xóa cascade nhiều bảng.) |
| **C6** | `MucLuong` là lương tháng hay đơn giá giờ? | SRS BR-UC13.1-04: "đơn giá giờ 21.000/23.000/25.000đ". UI "Quản lý nhân viên" hiển thị `3.000.000đ`, `4.400.000đ`. UI phiếu lương hiển thị `25,000 VNĐ/giờ`. | Theo SRS: `MucLuong` = **đơn giá giờ**; màn nhân viên hiển thị thêm "(≈ x đ/giờ)" hoặc quy đổi tham khảo |
| **C7** | Tên cột `PhieuLuong.MaND` vs `MaNV` | Mục 6.1.1 (logic) ghi `MaND`; mục 6.2.16 (vật lý) ghi `MaNV`; DB hiện có dùng `MaND`. | Giữ `MaND` (đúng DB đang tồn tại + đúng mục 6.1.1), coi `MaND` ≡ `MaNV` |
| **C8** | `NhanVien.TinhTrang` không có CHECK | CSDL: `NVARCHAR(20)` tự do. UI dùng "Chính thức"/"Thử việc". | Validate ở tầng API, chỉ nhận 2 giá trị trên (không đổi CSDL) |
| **C9** | Ngày lễ không có bảng | BR-UC13.1-05 cần hệ số 2 (02/09) và 3 (mùng 1–3 Tết). Không có bảng ngày lễ. | File cấu hình `config/holidays.json` + hàm `getHeSoNgay(date)` |
| **C10** | Wi-Fi không kiểm tra được từ web | BR-UC2-01/3-01 + NFR-02: chỉ chấm công khi kết nối Wi-Fi quán. Trình duyệt không đọc được SSID. | Mô phỏng: (a) so IP server với dải Wi-Fi quán trong `.env`; (b) chế độ demo có công tắc "Wi-Fi quán" để test cả 2 nhánh. Mặc định demo = bật. |
| **C11** | Trang chủ chủ quán | SRS NFR-02: màn chính chủ quán phải hiển thị **danh sách nhân viên đang làm ca trong ngày/tuần**. UI `Thêm nhân viên/1` chỉ có 2 card như quản lý. | Theo SRS: thêm khối "Nhân viên đang làm hôm nay" vào trang chủ chủ quán, giữ 2 card |
| **C12** | Số điện thoại duy nhất trên phạm vi nào? | BR-UC14.1-02: SĐT duy nhất trong `NhanVien`. Nhưng đăng nhập tra cả `NhanVien` và `QuanLy` → trùng SĐT giữa 2 bảng gây nhập nhằng. | Bắt buộc SĐT duy nhất **toàn hệ thống** (kiểm tra chéo 2 bảng ở tầng API) |
| **C13** | `DangKyCaLam` không lưu được ngày cụ thể | Bảng có `LichRanh NVARCHAR(100)` + `MaCa`; UI đăng ký là lưới **7 ngày × 3 ca**. Không có cột ngày. | Lưu ngày dạng chuỗi ISO trong `LichRanh` (vd `"2026-11-03"`), mỗi ô chọn = 1 bản ghi. Không đổi CSDL. |
| **C14** | "Phương thức nghỉ" không có cột | UI E5 có `Phương thức nghỉ (*)` (Nghỉ ngày / Nghỉ tuần). `DonXinNghi` chỉ có NgayBatDau/NgayKetThuc. | Suy ra từ khoảng ngày (1 ngày = nghỉ ngày; >1 ngày = nghỉ tuần), hoặc lưu vào `LyDo` dạng tiền tố. Đề xuất: suy ra, không lưu. |
| **C15** | "Ứng" theo từng ca | UI 7.2.2.47 hiển thị cột "Ứng" trên **từng dòng ca**, nhưng `ChiTietLuong` không có cột ứng; `UngLuong` gắn với `PhieuLuong`. | Hiển thị 0 ở các dòng ca, và tổng ứng ở dòng tổng; hoặc dồn vào ca đầu tiên. Đề xuất: 0 + tổng ở footer. |
| **C16** | Sửa lương làm thay đổi `ChiTietLuong` đã chốt | UC13.3 cho sửa Giờ vào/Giờ ra/Phạt/Ứng → phải tính lại `SoGioLam`. | Ghi đè `ChiTietLuong` tương ứng + tính lại `PhieuLuong`; lưu "lịch sử" bằng `PhanHoiLuong` (xem C17) |
| **C17** | "Lưu lịch sử chỉnh sửa" không có bảng | UC10.1 bước 7, UC13.3 bước 12 yêu cầu lưu lịch sử. Không có bảng audit. | Dùng `PhanHoiLuong` (LyDo + TrangThai) làm nhật ký cho lương; với ca làm thì bỏ qua (hoặc thêm bảng — cần xác nhận) |
| **C18** | Ảnh UI quản lý dùng nhầm tài khoản nhân viên | Nhiều ảnh luồng quản lý hiển thị "Xin chào, Viết Đạt" (NV005) thay vì "Quản lý". | Bỏ qua lỗi ảnh; render theo vai trò đăng nhập thật |
| **C19** | Màn đổi mật khẩu của chủ quán | UI `Đổi mật khẩu` chỉ có ảnh Nhân viên và Quản lý; sidebar chủ quán không có mục này. Yêu cầu của bạn: chủ quán **trừ** đổi mật khẩu. | Không xây Đổi mật khẩu cho chủ quán (đúng cả 3 nguồn) |
| **C20** | Số nhân viên trong ca cuối tuần | BR-UC5-02: 2 NV/ca cuối tuần & lễ. UI `Cập nhật ca làm 2` cho thấy Chủ nhật ca sáng có 2–3 người, ca chiều 2 người. | Giữ đúng BR: tối đa 2 (không chặn cứng khi quản lý sửa tay, chỉ cảnh báo) |

**Ngoài ra, các điểm CSDL còn thiếu ràng buộc (đề xuất xử lý ở tầng ứng dụng, không đổi CSDL):**

- Không có `UNIQUE(SoDienThoai)` trên `NhanVien`/`QuanLy` → kiểm tra ở API.
- Không có `UNIQUE(NgayLam, MaCa, MaNV)` trên `LichLamViec` → chống trùng ca ở API.
- Không có `UNIQUE(MaLich)` trên `ChamCong` → mỗi ca chỉ 1 bản ghi chấm công, chặn ở API.

---

## 10. Tech stack đề xuất

| Lớp | Công nghệ | Lý do |
|---|---|---|
| Runtime | **Node.js 26 + Express 5** | Có sẵn, 1 lệnh chạy |
| CSDL | **SQL Server 2025** + driver `mssql` (tedious) | Đúng hệ QTCSDL của file schema, đã cài sẵn |
| View | **EJS** (server-rendered) + vanilla JS | Không cần build, chạy `npm start` là xong; dễ đối chiếu từng pixel với UI |
| Style | **CSS thuần + design token** (không Tailwind) | Bám sát bộ màu/font của ảnh thiết kế |
| Auth | `express-session` + `connect-mssql-vault`/memory store | Session server-side, phân quyền theo vai trò |
| Hash | **bcrypt** (`bcryptjs` để không cần biên dịch) | Theo yêu cầu |
| Validate | `zod` (server) + validate HTML5/JS (client) | Kiểm tra 2 phía |
| Khác | `dotenv`, `helmet`, `morgan`, `csurf`-thay-thế (same-site cookie) | Bảo mật cơ bản |

**Phương án thay thế** nếu bạn muốn: React (Vite) + Express API thuần. Khi đó cần 2 lệnh hoặc `concurrently`, và mất thêm thời gian dựng lại component.

### Design token lấy trực tiếp từ ảnh UI

```
--cream-bg:      #FFF8F0   /* nền trang */
--card-bg:       #FFFBF7   /* nền card */
--brown-500:     #A1745F   /* sidebar, ô ca đã chọn */
--brown-600:     #7A4528   /* nút phụ, ngày được chọn */
--brown-700:     #542B14   /* nút chính, tiêu đề */
--sand-100:      #F8DDBF   /* nút nhạt (Check Out) */
--sand-200:      #F0E1D3   /* header bảng */
--sand-300:      #D8B79D   /* dòng được chọn */
--gold:          #C89B6A   /* icon tách, viền */
--green:         #14A352   /* trạng thái thành công */
--red:           #C0392B   /* lỗi, giờ trễ */
```

Font (suy ra từ ảnh — không có file font gốc): tiêu đề **Playfair Display**, nội dung **Be Vietnam Pro**. Sẽ tải qua Google Fonts.

### Cấu trúc thư mục

```
.
├── .env / .env.example
├── package.json
├── README.md
├── docs/
│   └── PHAN_TICH_BUOC0.md
├── db/
│   ├── 01_schema.sql          # 17 bảng, đúng đặc tả (+ các điều chỉnh đã duyệt)
│   ├── 02_seed.sql            # 10 NV + ca + lịch + chấm công + bảng lương + phiếu lương
│   └── reset.js               # drop & recreate & seed
├── config/
│   └── holidays.json          # ngày lễ + Tết Âm lịch
├── src/
│   ├── server.js
│   ├── config/db.js
│   ├── middleware/auth.js     # requireLogin, requireRole, requireOwner
│   ├── utils/
│   │   ├── password.js        # bcrypt hash/verify
│   │   ├── validate.js        # zod schema
│   │   ├── format.js          # tiền VNĐ, ngày, giờ
│   │   ├── id.js              # sinh mã 10 ký tự
│   │   └── payroll.js         # ★ toàn bộ công thức tính lương
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── schedule.service.js
│   │   ├── request.service.js
│   │   ├── attendance.service.js
│   │   ├── payroll.service.js
│   │   └── employee.service.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── employee.routes.js  # vai trò Nhân viên
│   │   ├── manager.routes.js
│   │   ├── owner.routes.js
│   │   └── page.routes.js      # render EJS
│   ├── views/
│   │   ├── layout.ejs
│   │   ├── partials/ (sidebar, topbar, toast, modal)
│   │   └── pages/ (auth, employee, manager, owner)
│   └── public/
│       ├── css/ (tokens.css, app.css, components.css)
│       ├── js/  (app.js, toast.js, forms.js)
│       └── img/ (logo, coffee-bean, minh hoạ)
└── tests/
    └── payroll.test.js        # test công thức lương
```

---

## 11. Dữ liệu seed dự kiến

- **10 nhân viên** đúng theo ảnh `Sửa thông tin nhân viên/1`: NV001 Nguyễn Minh Anh … NV010 Huỳnh Thảo Uyên (SĐT, vị trí, ngày vào làm, tình trạng, mức lương, ngân hàng).
- **1 Quản lý** (QL001) + **1 Chủ quán** (QL001 hoặc QL002 trong `ChuQuan`).
- **3 Ca làm**: CA01 Ca sáng 06:00–12:00 (1/2), CA02 Ca chiều 12:00–18:00 (1/2), CA03 Ca tối 18:00–22:00 (1/2).
- **Lịch làm việc** 3 tuần (tuần trước, tuần hiện tại, tuần sau).
- **Chấm công** tuần trước + tuần hiện tại (có ca trễ, có ca bỏ, có ca đủ).
- **Đơn mẫu**: 2 xin nghỉ (1 chờ, 1 đã duyệt), 2 đổi ca, 2 làm thay, 2 chấm công bổ sung, 2 ứng lương — đủ để test mọi màn duyệt.
- **Bảng lương** tháng 09 và 10/2026: tháng 09 "Đã chi trả", tháng 10 "Đã duyệt" (để nhân viên xem phiếu lương), tháng 11 "Chưa duyệt" (để test duyệt 2 bước).

> Lưu ý: ngày hệ thống trong ảnh là 01/11/2026. Để demo giống ảnh, seed sẽ dùng mốc **tháng 10–11/2026**, và "hôm nay" lấy theo `new Date()` thật.

**Tài khoản demo** (mật khẩu chung `123456`):

| Vai trò | Tên đăng nhập | Ghi chú |
|---|---|---|
| Nhân viên | `0914673802` | Nguyễn Việt Đạt (NV005) |
| Nhân viên | `0914673803` | Nguyễn Thị Thùy Linh (NV006) |
| Quản lý | `0901234567` | Nguyễn Minh Anh (QL001) |
| Chủ quán | `0909999999` | Trần Chủ Quán (QL002 + ChuQuan) |

---

## 12. Kế hoạch 6 giai đoạn

| GĐ | Nội dung | Điều kiện dừng |
|---|---|---|
| **0** | Phân tích + kiến trúc (tài liệu này) | **Bạn xác nhận + trả lời các câu hỏi mâu thuẫn** |
| 1 | Khởi tạo dự án, schema, seed, đăng nhập/đăng xuất/đổi mật khẩu/phân quyền, layout + design token | Bạn đăng nhập được 3 vai trò, thấy sidebar đúng |
| 2 | Nhóm chức năng Nhân viên (E2–E11) | Bạn chấm công, đăng ký ca, gửi đơn, xem phiếu lương được |
| 3 | Nhóm chức năng Quản lý (M2–M12) | Bạn duyệt đơn, sửa ca, xem chấm công, duyệt lương bước 1 |
| 4 | Nhóm chức năng Chủ quán (O1–O6) | Bạn duyệt lương bước 2, xét đề xuất, CRUD nhân viên |
| 5 | Rà soát: đối chiếu từng màn hình với UI, từng UC với SRS, README, báo cáo | Nghiệm thu |

---

## 13. Quyết định đã được xác nhận (chốt ngày 10/11/2026)

| # | Nội dung | Quyết định |
|---|---|---|
| Q1 | Database | **Dùng lại** `CHAMCONGTINHLUONG` hiện có, chỉ seed dữ liệu |
| Q2 | Frontend | **Express + EJS**, server-rendered, không bước build |
| C1 | `MatKhau` | Nới lên **`VARCHAR(100)`** ở `NhanVien` và `QuanLy` |
| C2 | `BangLuong.TinhTrang` | Thêm **`N'Chờ chủ quán duyệt'`** và **`N'Từ chối'`** vào CHECK |
| C3 | `ChamCongBoSung` | Thêm 3 cột: `NgayGui DATETIME`, `LyDo NVARCHAR(255)`, `TrangThai NVARCHAR(20)` + CHECK |
| C6 | `MucLuong` | **Đơn giá giờ** theo SRS (21.000–25.000 đ/giờ) |
| C5 | Xóa nhân viên | **Xóa mềm**: `TinhTrang = N'Đã nghỉ'`, chặn đăng nhập, giữ lịch sử lương |
| C10 | Kiểm tra Wi-Fi | So **CIDR** bằng `ipaddr.js`, dải IP trong `.env` (`ALLOWED_IP_RANGES`), chuẩn hóa `::ffff:`, hỗ trợ IPv4+IPv6, `trust proxy` theo số lớp thật, công tắc demo chỉ hiện khi `DEMO_MODE=true`. Check-in và Check-out dùng **chung** middleware. Sai Wi-Fi → icon mất kết nối + "Kết nối sai Wifi" |
| C4 | Ca trống | Suy ra bằng truy vấn từ đơn nghỉ **đã duyệt** (không đổi CSDL) |
| C8 | `NhanVien.TinhTrang` | Validate ở API, chỉ nhận `Chính thức` / `Thử việc` (thêm `Đã nghỉ` cho xóa mềm) |
| C9 | Ngày lễ | Một nguồn duy nhất `config/holidays.json`, dùng **chung** cho `getHeSoNgay()` và quy tắc định biên 2 NV/ca ngày lễ |
| C12 | Số điện thoại | Duy nhất **toàn hệ thống** (kiểm tra chéo `NhanVien` + `QuanLy`) |
| C13 | `DangKyCaLam` | Lưu ngày ISO (`YYYY-MM-DD`) trong `LichRanh`, mỗi ô = 1 bản ghi |
| C14 | Phương thức nghỉ | Suy ra từ khoảng ngày, không lưu |
| C15 | Cột "Ứng" theo ca | Hiển thị 0 ở dòng ca, tổng ở footer |
| **C11** | Trang chủ chủ quán | **KHÔNG thêm** khối "NV đang làm hôm nay" — giữ đúng UI (2 card) |
| **C17** | Lịch sử chỉnh sửa | **KHÔNG** dùng `PhanHoiLuong` làm nhật ký, **không** lưu lịch sử chỉnh sửa |
| C7, C16, C18, C19, C20 | — | Giữ nguyên hướng đề xuất ở mục 9 |

### Các thay đổi CSDL sẽ áp dụng (đã được duyệt)

```sql
-- C1
ALTER TABLE NhanVien ALTER COLUMN MatKhau VARCHAR(100) NOT NULL;
ALTER TABLE QuanLy  ALTER COLUMN MatKhau VARCHAR(100) NOT NULL;

-- C2
ALTER TABLE BangLuong DROP CONSTRAINT CK__BangLuong__TinhT__123EB7A3;
ALTER TABLE BangLuong ADD CONSTRAINT CK_BangLuong_TinhTrang CHECK (TinhTrang IN (
  N'Chưa duyệt', N'Chờ chủ quán duyệt', N'Đã duyệt', N'Đã chi trả', N'Từ chối'));

-- C3
ALTER TABLE ChamCongBoSung ADD
  NgayGui   DATETIME      NOT NULL CONSTRAINT DF_CCBS_NgayGui DEFAULT GETDATE(),
  LyDo      NVARCHAR(255) NOT NULL CONSTRAINT DF_CCBS_LyDo DEFAULT N'',
  TrangThai NVARCHAR(20)  NOT NULL CONSTRAINT DF_CCBS_TrangThai DEFAULT N'Chờ duyệt';
ALTER TABLE ChamCongBoSung ADD CONSTRAINT CK_CCBS_TrangThai
  CHECK (TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Từ chối'));
```

---
