# Tiến độ sửa lỗi giao diện

Cập nhật: 14/11/2026

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
