# Tiến độ sửa lỗi giao diện

Cập nhật: 15/11/2026

---

## Font toàn hệ thống

| Hạng mục | Chi tiết |
| --- | --- |
| Font mặc định | **Afacad** (Google Fonts, variable weight 400–700), dùng cho **cả 3 vai trò**: nhân viên, quản lý, chủ quán |
| Font dự phòng | `'Segoe UI', system-ui, -apple-system, sans-serif` (giữ chữ tiếng Việt đọc được nếu Google Fonts không tải được) |
| Khai báo token | `src/public/css/tokens.css` — `--font-body: 'Afacad', ...`; `--font-display: var(--font-body)` (tiêu đề toàn hệ thống cũng là Afacad) |
| Nạp font | Link Google Fonts `family=Afacad:wght@400..700` trong `src/views/partials/head.ejs`, `src/views/pages/errors/error.ejs`, `src/views/pages/errors/wifi.ejs`; riêng `src/views/pages/auth/login.ejs` nạp thêm `family=Playfair+Display:wght@400;500;600;700;800` |
| Phạm vi áp dụng | `body`, toàn bộ `h1–h5`, tiêu đề card/modal, số tiền; `button, input, select, textarea` kế thừa qua `font: inherit` trong `src/public/css/base.css`; bảng và popup kế thừa từ `body` |
| **Ngoại lệ màn đăng nhập** | Dùng **Playfair Display** (có subset tiếng Việt) cho đúng **3 tiêu đề**: dòng logo chữ "NICK & THE JUICE" (`.auth-brand`), dòng "Chào mừng đến với" (`.auth-heading__hello`) và dòng "Nick & Juice Coffee" (`.auth-heading__brand`). Khai báo token `--font-serif: 'Playfair Display', 'Times New Roman', serif` và gán trong `src/public/css/layout.css`. Các phần còn lại của màn đăng nhập (phụ đề, ô nhập, nút Đăng nhập, địa chỉ) vẫn dùng Afacad |
| Đã bỏ | `Be Vietnam Pro` (font nội dung cũ) — không còn trong `src`. `Playfair Display` chỉ còn đúng ở 3 tiêu đề màn đăng nhập |
| Ghi chú | Mã tài khoản trong popup "Thêm nhân viên thành công" (`layout.css`) chuyển từ monospace sang `--font-body` để đồng nhất toàn hệ thống |

### Kiểm chứng

- `document.fonts.check('16px Afacad')` và `document.fonts.check('16px "Playfair Display"')` → `true`.
- `getComputedStyle`: `body`, phụ đề, ô nhập, nút Đăng nhập, địa chỉ → `Afacad, "Segoe UI", system-ui, ...`; logo, "Chào mừng đến với", "Nick & Juice Coffee" → `"Playfair Display", "Times New Roman", serif`.
- Ảnh kiểm tra: đăng nhập 1420px, trang chủ nhân viên, bảng Dữ liệu chấm công (quản lý), form Thêm nhân viên (chủ quán) — tiếng Việt có dấu hiển thị đúng.
- `node --test tests/` → **66/66 pass**.

### Ghi nhận từ ảnh UI (chưa đổi)

Ngoài màn đăng nhập, một số ảnh UI còn dùng tiêu đề có chân (serif) nhưng **chưa đổi** vì ngoài phạm vi yêu cầu:

- `doc/UI/Kiểm tra phiếu lương/Kiểm tra phiếu lương 1.png` — tiêu đề "Kiểm tra phiếu lương" (các ảnh 2–6 cùng màn lại dùng sans).
- `doc/UI/Sửa thông tin nhân viên/Sửa thông tin nhân viên 1.png` — tiêu đề "Quản lý nhân viên".
- `doc/UI/Xóa nhân viên/Xóa nhân viên 1.png` — tiêu đề "Quản lý nhân viên".

---

## Pha 1 — Kế thừa lỗi đã sửa ở Quản lý sang Chủ quán

Chủ quán dùng chung toàn bộ route/view của quản lý qua `src/routes/owner.routes.js`
(`router.use('/', require('./manager.routes'))`); chỉ `pages/owner/home.ejs` và 3 màn
nhân viên (`employee-add`, `employee-edit`, `employee-list`) là bản riêng.
Menu chủ quán = menu quản lý (đổi tiền tố `/quan-ly` → `/chu-quan`, bỏ "Đổi mật khẩu",
thêm nhóm "Quản lý thông tin nhân viên").

| # | Kết quả | Chi tiết |
| --- | --- | --- |
| Q1 | **Đã sửa thêm ở `src/views/pages/owner/home.ejs`** | Bản riêng của chủ quán: bỏ breadcrumb, phụ đề, ghi chú cuối trang; 2 thẻ `home-cards` + icon hạt cà phê `#i-cup`, nhãn 2 dòng, link theo `basePath` (khớp `Đăng nhập 6`) |
| Q2 | Dùng chung, đã ổn | `schedule-update.ejs` + `src/public/js/manager.js` (chọn tuần) |
| Q3 | Dùng chung, đã ổn | Popup "Không thể cập nhật ca đã diễn ra" (đã đối chiếu `Cập nhật ca làm 7–8` của chủ quán) |
| Q4 | Dùng chung, đã ổn | Nền thanh ca `#f3ede5` |
| Q5 | Dùng chung, đã ổn | Không còn nút "Quay lại" ở màn sửa ca |
| Q6 | Dùng chung, đã ổn | Icon popup thông báo |
| Q7 | Dùng chung, đã ổn | `schedule-list.ejs`: chỉ "Thời gian" + "Ca làm" + nút Xem (đối chiếu `Xem danh sách ca làm 5–6`) |
| Q8 | Dùng chung, đã ổn | Popup "Chưa có lịch làm việc cho thời gian này!" |
| Q9 | Không áp dụng | Chủ quán thừa hưởng menu quản lý đã bỏ "Duyệt ứng lương"; không có màn riêng của chủ quán |
| Q10 | Dùng chung, đã ổn | `attendance-data.ejs`: dropdown Ngày/Tuần + lịch tháng (đối chiếu `Dữ liệu chấm công 9–11`) |
| Q11 | Dùng chung, đã ổn | Bấm xem được chi tiết bảng lương (đối chiếu `Bảng lương 4–6 - Chủ quán`) |
| Q12 | Dùng chung, đã ổn | `payroll-approve-detail.ejs`: bỏ "lý do chỉnh sửa" ở màn chi tiết, icon chỉnh sửa theo UI |
| Q13 | Dùng chung, đã ổn | Nút Không duyệt/Duyệt chỉ ở màn danh sách; màn chi tiết chỉ có Chỉnh sửa |
| Q14 | Dùng chung, đã ổn | Nhập tiền phạt số bất kỳ không báo lỗi |
| Q15 | **Đã sửa thêm ở `src/views/pages/manager/payroll-approve.ejs`** | Nhãn "Chờ chủ quán duyệt" trước đây chỉ hiện khi **không** duyệt được, nên chủ quán (đang là người duyệt) không thấy; ảnh `Duyệt bảng lương 8–9` của chủ quán có nhãn này → hiện cả khi chủ quán duyệt được (nhãn "Đã duyệt" vẫn giữ kiểu xanh) |
| Q16 | Không áp dụng | Màn chỉnh sửa phiếu lương chỉ dành cho quản lý; chủ quán bị chặn ở route (`Chủ quán xét đề xuất, không chỉnh sửa phiếu lương`) |
| Q17 | Dùng chung, đã ổn | Giờ vào/ra 24h (view dùng chung `payslip-compare`/`payslip-edit`/`payslip-detail`) |
| Q18 | Dùng chung, đã ổn | Popup "Chỉnh sửa phiếu lương cần duyệt!" hiện ở trang chủ chủ quán (`owner/home.ejs` + `GET /chu-quan/trang-chu`), không hiện ở quản lý sau khi gửi đề xuất |
| Q19 | Dùng chung, đã ổn | Danh sách phiếu lương của chủ quán không có thanh trạng thái |
| Q20 | Không áp dụng | Chủ quán không có mục "Phản hồi phiếu lương" (menu kế thừa từ quản lý đã bỏ) |

### Kiểm chứng pha 1

- Ảnh hiện trạng chủ quán: trang chủ (có/không popup), Cập nhật ca làm, Xem danh sách ca làm,
  Dữ liệu chấm công (+ mở lịch), Bảng lương (danh sách/tổng hợp/chi tiết), Duyệt bảng lương
  (trạng thái "Chờ chủ quán duyệt" và chi tiết), Cập nhật bảng lương.
- `BL202610` được tạm đổi sang "Chờ chủ quán duyệt" để chụp màn duyệt rồi **khôi phục "Đã duyệt"**.

### Ghi nhận từ ảnh chủ quán (chưa đổi — ngoài Q1–Q20)

- **Cột "Chỉnh sửa"** trong bảng "Duyệt bảng lương" của chủ quán (`Duyệt bảng lương 8–11`):
  hiện "+50000 tiền phạt" hoặc "-". Cần dữ liệu lịch sử chỉnh sửa theo dòng, hiện chưa có.
- **Popup "Bảng lương cần duyệt!"** ở trang chủ chủ quán (`Duyệt bảng lương 7`) — khác nội dung
  popup Q18 ("Chỉnh sửa phiếu lương cần duyệt!") và cần luồng thông báo riêng.
- Ảnh `Duyệt bảng lương 7` và `Cập nhật bảng lương 9` cho thấy trang chủ chủ quán có **3 thẻ**,
  còn ảnh chuẩn của Q1 (`Đăng nhập 6`) chỉ có **2 thẻ** → đang giữ 2 thẻ theo `Đăng nhập 6`.
- Breadcrumb trong ảnh chủ quán là **2 cấp** ("Quản lý lương > Duyệt lương"), hiện dùng 3 cấp
  ("Trang chủ › Quản lý lương › Duyệt lương") như toàn hệ thống.

---

## Pha 2 — Lỗi riêng của chủ quán (O1–O5)

| # | Trạng thái | File đã sửa | Mô tả |
| --- | --- | --- | --- |
| O1 | **Xong** | `src/routes/manager.routes.js`, `src/views/pages/manager/payroll-proposals.ejs`, `src/views/pages/manager/payslip-list.ejs` | `GET /luong/cap-nhat` của chủ quán: có đề xuất chờ duyệt → màn "Chủ quán xét đề xuất" (bỏ "Đơn vị: VNĐ" và dòng "Tháng… · Quản lý đề xuất", giữ nhãn quá hạn); không có đề xuất → danh sách phiếu lương; bỏ banner "Xét đề xuất" đã thành thừa; sau khi duyệt/không duyệt quay về `/luong/cap-nhat` |
| O2 | **Xong** | `src/views/pages/owner/employee-add.ejs`, `src/routes/owner.routes.js` | Xóa hết chữ gợi ý: bỏ phụ đề "Tài khoản đăng nhập được tạo tự động…", bỏ dòng "Gợi ý mã kế tiếp…", bỏ placeholder "25000"/"VCB-1028882991" và 2 dòng gợi ý đơn giá/định dạng, ô chọn Vị trí để trống, ô Mã nhân viên để trống (không điền sẵn mã kế tiếp); icon nút Lưu đổi sang dấu tích `#i-check` |
| O3 | **Xong** | `src/routes/owner.routes.js`, `src/views/pages/owner/employee-add.ejs`, `src/public/css/layout.css` (xóa `employee-created.ejs`) | Bấm Lưu chỉ hiện **một** popup trên nền màn Thêm nhân viên: icon tick xanh, "Thêm nhân viên thành công", tên đăng nhập + mật khẩu tự sinh; bỏ flash "Thêm nhân viên thành công" (popup thứ hai) và trang kết quả riêng |
| O4 | **Xong** | `src/views/pages/owner/employee-edit.ejs`, `src/public/css/layout.css` | Nhãn các cột tiêu đề đổi từ `--text-strong` (#3d2317) sang `--brown-700` (#542b14) đúng màu ảnh, đồng nhất với tiêu đề "Hồ sơ NV004" |
| O5 | **Xong** | `src/views/pages/owner/employee-list.ejs` | Popup xóa bỏ đoạn thông tin nhân viên, chỉ còn icon thùng rác, "Xóa nhân viên này?", nút Hủy và nút Xóa nhân viên |

### Kiểm chứng pha 2

- O1: chụp `/chu-quan/luong/cap-nhat` khi `PH0003` đang "Chờ chủ quán duyệt" → ra màn xét đề xuất;
  tạm ẩn đề xuất → ra danh sách phiếu lương; đã khôi phục trạng thái đề xuất.
- O2/O3: thêm thử một nhân viên qua giao diện → popup thành công đúng ảnh; đã xóa bản ghi thử.
- O4/O5: chụp màn sửa `NV004` (màu nhãn `rgb(84,43,20)`) và popup xóa.
- `node --check` các file route đã sửa + `node --test tests/` → **66/66 pass**.

