# Tiến độ dự án — Hệ thống chấm công và tính lương

Cập nhật: 11/11/2026 · Giai đoạn 2 · Hạng mục: **6 màn hình Nhân viên** (mục 9)

---

## 1. VIỆC 1 — Popup "Chấm công thành công!"

Ảnh tham chiếu: `doc/UI/Chấm công/Chấm công 2.png`

| Yêu cầu | Kết quả | Kiểm chứng |
| --- | --- | --- |
| Dấu tick xanh phía TRÊN dòng chữ | Có, icon SVG nội tuyến `#i-check` | Ảnh `tmp/popup-375-final.png` |
| Vòng tròn ~48px | 48 × 48 px | Đo trong trang: `w:48, h:48` |
| Nền xanh lá rất nhạt ~#E8F8F0 | `#e8f8f0` | `rgb(232, 248, 240)` |
| Dấu tick xanh lá ~#14A352, nét bo tròn | `var(--green)` = `#14A352`, `stroke-linecap/linejoin: round` | `rgb(20, 163, 82)` |
| Căn giữa, cách chữ 12–16px | Căn giữa, cách 14px | `gap: 14` (đo khoảng cách icon → chữ) |
| Giữ nguyên nền trắng, bo góc, chữ, màu chữ, lớp phủ, hành vi ẩn/hiện | Không đổi | So sánh `tmp/popup-1280.png` với ảnh gốc |

Popup **lỗi** vẫn giữ nguyên kiểu cũ (ô vuông đỏ, icon cảnh báo / Wi-Fi), chỉ popup
**thành công** mới có vòng tròn tick xanh.

---

## 2. VIỆC 2 (ĐỢT 1) — Lớp responsive dùng chung

Chỉ làm phần **dùng chung**, chưa sửa bố cục riêng của từng màn hình.

### 2.1. Breakpoint

Toàn bộ media query cũ (1280 / 1000 / 900 / 620px) đã được gộp lại còn **đúng 2 mốc**
theo `AGENTS.md`:

- `@media (max-width: 1024px)` — máy tính bảng / điện thoại: sidebar thu thành ngăn kéo,
  header co gọn, lưới 2 cột → 1 cột, bảng rộng cuộn ngang, trang đăng nhập 1 cột.
- `@media (max-width: 640px)` — điện thoại: thu nhỏ khoảng đệm, chữ, nút; ô nhập cao ≥ 48px;
  nút hành động giãn hết bề ngang; ẩn chữ "Wi-Fi quán" (giữ công tắc).

Trên 1024px giữ nguyên bố cục desktop theo ảnh `doc/UI`.

### 2.2. Những gì đã có

| Hạng mục | Chi tiết |
| --- | --- |
| Thẻ viewport | Đã có sẵn trong `partials/head.ejs` và `pages/auth/login.ejs` |
| Khung trang | `.main` / `.content` bỏ lề trái khi ≤1024px, đệm ngang 20px (640px: 14px) |
| Sidebar → hamburger | Nút `.topbar__menu` (44×44) hiện khi ≤1024px; sidebar thành ngăn kéo trượt từ trái (`min(84vw, 320px)`), có nút đóng, lớp phủ `.nav-scrim`, khoá cuộn trang, đóng khi chọn mục menu / nhấn Esc / nhấn lớp phủ |
| Header co gọn | Ẩn "Xin chào, …" và dấu phân cách, thu nhỏ avatar, giữ ngày + công tắc Wi-Fi + avatar |
| Lưới tự xuống cột | `.att-grid`, `.att-shortcuts`, `.form-row`, `.u-grid-2`, `.u-grid-auto` |
| Form / ô nhập | `.form-row` 1 cột ≤1024px; ô nhập cao 48px, chữ 16px ở ≤640px |
| Nút | `.u-actions` xếp dọc, nút rộng 100% ở ≤640px; `.pw-actions .btn` giãn hết ngang |
| Bảng | `.table-wrap` + `.u-scroll-x` cuộn ngang trong khung riêng; `.table` có `min-width` để không bóp cột |
| Popup | `.modal-card { width: min(90vw, 500px) }`; ≤640px giảm đệm, vòng tròn tick giữ 48px |
| Thông báo | Dùng lại `.flash` / `.flash-stack` sẵn có (đã cuộn theo bề ngang) |
| Lịch làm việc | `.week-grid` chuyển sang dải cuộn ngang ≤1024px, mỗi ngày 112px (640px: 96px) |

### 2.3. Màn hình làm mẫu

- **Chấm công** (`/nhan-vien/trang-chu`) — màn hình mẫu cho ĐỢT 1.
- **Đổi mật khẩu** (`/doi-mat-khau`) — kiểm tra lớp form dùng chung.
- **Đăng nhập** (`/dang-nhap`) — 2 cột → 1 cột.
- **Trang chủ quản lý** (`/quan-ly/trang-chu`) — kiểm tra khung + sidebar ở vai trò khác.

---

## 3. File đã sửa

| File | Nội dung |
| --- | --- |
| `src/views/partials/head.ejs` | Popup: luôn render `.modal-card__icon`, thêm biến thể `--success` |
| `src/views/partials/icons.ejs` | Thêm 2 symbol: `i-check` (dấu tick nét bo tròn), `i-menu` (hamburger) |
| `src/views/partials/topbar.ejs` | Thêm nút hamburger `[data-nav-open]` (aria-controls/aria-expanded), bọc cụm trái `.topbar__left` |
| `src/views/partials/sidebar.ejs` | `id="sidebar"`, cụm đầu `.sidebar__top`, nút đóng `.sidebar__close`, lớp phủ `.nav-scrim` |
| `src/public/css/layout.css` | Kiểu vòng tròn tick thành công; `.topbar__menu`, `.sidebar__close`, `.nav-scrim`; lề phải 32px cho desktop; thay toàn bộ khối responsive bằng 2 mốc 1024px / 640px |
| `src/public/css/base.css` | Thêm tiện ích `.u-grid-2`, `.u-grid-auto`, `.u-scroll-x`, `.u-actions` + luật 640px |
| `src/public/js/app.js` | **Hành vi giao diện**: mở/đóng ngăn kéo menu (thêm/xoá `is-open`, `is-visible`, `nav-open`, đồng bộ `aria-expanded`). Không đụng logic nghiệp vụ, route hay CSDL |
| `scripts/screenshot.js` | **Công cụ kiểm tra (chỉ dùng khi phát triển)**: chụp ảnh giao diện ở kích thước khung nhìn bất kỳ bằng Chrome/Edge headless + DevTools Protocol |
| `docs/PROGRESS.md` | Tài liệu này |

Không sửa: route, service, middleware, CSDL, seed, `.env`.

> **Lưu ý về `app.js`:** quy tắc chung là chỉ sửa EJS + CSS, nhưng nút hamburger cần một
> ít JavaScript phía trình duyệt để mở/đóng ngăn kéo. Phần thêm vào chỉ là hành vi giao diện
> (bật/tắt class + ARIA), không chứa logic tính toán hay truy vấn nào.

---

## 4. Cách kiểm tra

### 4.1. Kiểm tra nhanh bằng công cụ có sẵn

Máy chủ phải đang chạy (`npm start`), sau đó:

```powershell
# Desktop 1280px
node scripts/screenshot.js --width=1280 --height=900 --page=/nhan-vien/trang-chu --out=tmp/home-1280.png

# Điện thoại 375px
node scripts/screenshot.js --width=375 --height=812 --page=/nhan-vien/trang-chu --out=tmp/home-375.png

# Mở ngăn kéo menu ở 375px
node scripts/screenshot.js --width=375 --height=812 --page=/nhan-vien/trang-chu --out=tmp/drawer-375.png --eval="document.querySelector('[data-nav-open]').click()"

# Popup thành công (bấm nút Chấm công đầu tiên)
node scripts/screenshot.js --width=375 --height=812 --page=/nhan-vien/trang-chu --out=tmp/popup-375.png --click=".att-card__btn"
```

Script tự đăng nhập bằng tài khoản demo (`0914673802` / `123456`); đổi vai trò bằng
`--login=0901234567` (quản lý) hoặc `--login=0909999999` (chủ quán).
Ảnh mẫu đã chụp sẵn nằm trong `tmp/`.

### 4.2. Kiểm tra thủ công trên trình duyệt

**Ở 1280px (desktop):**

1. Mở `http://localhost:3000`, đăng nhập `0914673802` / `123456`.
2. Bề ngang ≥ 1025px: sidebar nằm bên trái (nền nâu, bo góc, lơ lửng cách mép 32px),
   header có "Xin chào, Việt Đạt", hai thẻ Chấm công / Check out nằm cạnh nhau,
   lịch làm việc 7 cột. **Không có** nút hamburger.
3. So với `doc/UI/Chấm công/Chấm công 1.png`.
4. Bấm "Chấm công" → popup trắng, phía trên dòng chữ "Chấm công thành công!" là vòng tròn
   xanh nhạt 48px chứa dấu tick xanh. So với `doc/UI/Chấm công/Chấm công 2.png`.
5. Trang không có thanh cuộn ngang.

**Ở 375px (điện thoại — DevTools → Toggle device toolbar → 375 × 812):**

1. Header gọn: nút hamburger bên trái, ngày, công tắc Wi-Fi (ẩn chữ), avatar.
2. Bấm hamburger → ngăn kéo nâu trượt ra từ trái (rộng ~84vw), nền tối phía sau,
   nút ✕ để đóng; nhấn Esc hoặc nền tối cũng đóng; trang không cuộn được khi menu mở.
3. Hai thẻ Chấm công / Check out xếp dọc, nút cao 52px; hai lối tắt xếp dọc.
4. Lịch làm việc là dải cuộn ngang **trong khung thẻ** (không làm cả trang cuộn ngang).
5. Bấm "Chấm công" → popup rộng `min(90vw, 500px)` = 338px ở 375px, tick xanh vẫn 48px.
6. Kiểm tra `document.documentElement.scrollWidth === window.innerWidth` (không tràn ngang).

### 4.3. Kết quả đo được

| Màn hình | Bề ngang | `scrollWidth` | Ghi chú |
| --- | --- | --- | --- |
| Chấm công | 1280 | 1280 | Không tràn ngang, bố cục desktop đúng ảnh UI |
| Chấm công | 900 | 900 | Header gọn, không cắt avatar |
| Chấm công | 375 | 375 | 1 cột, hamburger, lịch cuộn ngang trong khung |
| Đổi mật khẩu | 375 | 375 | Ô nhập 48px, nút "Lưu" rộng 100% |
| Đăng nhập | 375 | 375 | 1 cột, ẩn panel thương hiệu |
| Popup thành công | 375 | — | Card 338px, icon 48×48, nền `#E8F8F0`, tick `#14A352`, cách chữ 14px |

### 4.4. Kiểm thử tự động

```powershell
npm test                    # 21/21 bài kiểm thử công thức lương
npm run db:seed             # nạp lại dữ liệu demo trước khi chạy smoke test
node scripts/smoke-test.js  # 22/22 kiểm tra đầu-cuối
npm run db:seed             # nạp lại lần cuối để trả về trạng thái demo sạch
```

Kết quả lần chạy gần nhất: **21/21** và **22/22** đạt.

---

## 5. Còn lại của VIỆC 2

- **ĐỢT 1 (xong):** lớp dùng chung — xem mục 1–4.
- **ĐỢT 2 (xong):** nhóm màn hình Nhân viên — xem mục 7.
- **ĐỢT 3 (xong):** nhóm màn hình Quản lý / Chủ quán + sửa 6 liên kết 404 — xem mục 8.
- Khi các màn hình thật được xây dựng, dùng lại `.u-scroll-x`, `.u-grid-2`, `.u-grid-auto`,
  `.u-actions`, `.form-row`, `.empty-state`, `.home-card` đã có.

---

## 6. Ghi chú

- **Chưa commit được:** máy này không cài `git` (lệnh `git` không tồn tại) và thư mục dự án
  chưa được khởi tạo kho (`không có .git`). Toàn bộ thay đổi đang nằm trực tiếp trên đĩa.
  Nếu cần, có thể cài Git rồi `git init` + commit theo danh sách file ở mục 3.
- Ảnh kiểm chứng trong `tmp/` chỉ là tệp tạm, có thể xoá bất cứ lúc nào.
- `scripts/screenshot.js` là công cụ phát triển, không được nạp vào ứng dụng và không ảnh
  hưởng đến lúc chạy thật.

---

## 7. ĐỢT 2 — Nhóm màn hình Nhân viên (11/11/2026)

Phạm vi theo yêu cầu: Đăng nhập, Chấm công, Check out, Đăng ký ca làm, Chấm công bổ sung,
Lịch làm việc, Đơn yêu cầu, Ứng lương, Phiếu lương, Đổi mật khẩu.

Chỉ sửa **EJS + CSS** của nhóm này và **dùng lại** lớp dùng chung của ĐỢT 1 —
không thêm class trùng lặp, không đổi logic / route / CSDL.

### 7.1. Hiện trạng từng màn hình

| # | Màn hình | Đường dẫn | Trạng thái | Việc đã làm ở ĐỢT 2 |
| --- | --- | --- | --- | --- |
| 1 | Đăng nhập | `/dang-nhap` | Đã xây dựng | Kiểm tra 375/1280; 1 cột ở ≤1024px, ẩn panel thương hiệu; ô nhập 54px, chữ 16px |
| 2 | Chấm công | `/nhan-vien/trang-chu` (thẻ 1) | Đã xây dựng | Thẻ xếp dọc ≤1024px, nút cao 52px ≤640px, chữ giờ co theo bề ngang |
| 3 | Check out | `/nhan-vien/trang-chu` (thẻ 2) | Đã xây dựng | Như trên |
| 4 | Lịch làm việc | khối tuần trên `/nhan-vien/trang-chu` | Đã xây dựng | ≤1024px thành dải cuộn ngang **trong khung thẻ** + bắt điểm dừng (`scroll-snap`), `tabindex`/`role`/`aria-label` để cuộn bằng bàn phím |
| 5 | Đổi mật khẩu | `/doi-mat-khau` | Đã xây dựng | Ô nhập 48px/chữ 16px, nút "Lưu" rộng 100% ≤640px |
| 6 | Đăng ký ca làm | `/nhan-vien/dang-ky-ca-lam` | **Chưa xây dựng — đang trả 404** (xem 7.4) | Chưa có gì để làm responsive |
| 7 | Chấm công bổ sung | `/nhan-vien/cham-cong-bo-sung` | **Chưa xây dựng — đang trả 404** (xem 7.4) | Chưa có gì để làm responsive |
| 8 | Đơn yêu cầu › Xin nghỉ/đổi ca | `/nhan-vien/don-yeu-cau/xin-nghi-doi-ca` | **Chưa xây dựng — trang thông báo** | Như trên + menu con trong ngăn kéo |
| 9 | Đơn yêu cầu › Ứng lương | `/nhan-vien/don-yeu-cau/ung-luong` | **Chưa xây dựng — trang thông báo** | Như trên |
| 10 | Phiếu lương | `/nhan-vien/phieu-luong` | **Chưa xây dựng — trang thông báo** | Như trên |

> **Cần bạn quyết định:** các màn hình số 6–10 **chưa được xây dựng ở Giai đoạn 1**.
> Ba màn hình 8–10 (Đơn yêu cầu, Ứng lương, Phiếu lương) đang là trang thông báo
> "Màn hình đang được hoàn thiện" nên ĐỢT 2 chỉ làm responsive cho **khung chung** của chúng.
> Hai màn hình 6–7 (Đăng ký ca làm, Chấm công bổ sung) còn **chưa có route** — xem 7.4.

### 7.2. File đã sửa ở ĐỢT 2

| File | Nội dung |
| --- | --- |
| `src/views/pages/shared/coming-soon.ejs` | Bỏ 2 `style` nội tuyến, dùng class dùng chung `.empty-state__text`, `.empty-state__action` (áp dụng cho cả 5 màn hình 6–10) |
| `src/views/pages/employee/home.ejs` | Thêm `tabindex="0"`, `role="group"`, `aria-label` cho `.week-grid` (cuộn ngang bằng bàn phím) |
| `src/public/css/components.css` | Thêm `.empty-state__text`, `.empty-state__action`; `.breadcrumb` cho phép xuống dòng (`flex-wrap`) |
| `src/public/css/layout.css` | ≤1024px: `.week-grid` bắt điểm dừng + `overscroll-behavior-x: contain`, mục menu con cao 44px; ≤640px: `.empty-state` gọn hơn (đệm, icon, chữ), nút hành động rộng 100%, nút chuẩn chạm ≥44px (`.btn` 46px, `.btn--sm` 44px, `.btn--icon` 44×44) |

Không sửa: route, service, middleware, CSDL, seed, `.env`.

### 7.3. Kiểm tra

| Màn hình | 1280px | 375px |
| --- | --- | --- |
| Đăng nhập | Không tràn ngang, 2 cột đúng ảnh UI | 1 cột, ẩn panel thương hiệu, ô nhập 54px |
| Chấm công / Check out | 2 thẻ cạnh nhau, lịch 7 cột | 2 thẻ xếp dọc, nút 52px, không tràn ngang |
| Lịch làm việc | 7 cột trong thẻ | Dải cuộn ngang trong thẻ (3 ngày hiển thị), `overflowX = 0` ở cấp trang |
| Đổi mật khẩu | Panel rộng, nút "Lưu" phải | Ô nhập 48px, nút rộng 100% |
| 5 trang thông báo | Bố cục không đổi | Nút "Về trang chủ" rộng 100%, chữ không bị bóp |

Đo tự động trên cả 7 đường dẫn ở 1280px và 375px: `scrollWidth − innerWidth = 0`
(không có cuộn ngang ở cấp trang). Phần tử duy nhất vượt bề ngang là các ô ngày trong
`.week-grid` — đúng thiết kế, chúng cuộn bên trong khung thẻ.

Ảnh kiểm chứng: `tmp/home-1280.png`, `tmp/home-375.png`, `tmp/drawer-submenu-375.png`,
`tmp/cs-1280.png`, `tmp/cs-375.png`, `tmp/cs-leave-375.png`, `tmp/pw-1280.png`,
`tmp/pw-375.png`, `tmp/login-1280.png`, `tmp/login-375.png`.

Lệnh chụp lại:

```powershell
node scripts/screenshot.js --width=1280 --height=900 --page=/nhan-vien/trang-chu --out=tmp/home-1280.png
node scripts/screenshot.js --width=375  --height=812 --page=/nhan-vien/trang-chu --out=tmp/home-375.png --full
node scripts/screenshot.js --width=375  --height=812 --page=/nhan-vien/phieu-luong --out=tmp/cs-375.png
node scripts/screenshot.js --width=375  --height=812 --page=/nhan-vien/trang-chu --out=tmp/drawer-submenu-375.png --eval="(() => { document.querySelector('[data-nav-open]').click(); const t = document.querySelector('[data-nav-toggle]'); if (t.getAttribute('aria-expanded') !== 'true') t.click(); return 'ok'; })()"
```

### 7.4. Lỗi phát hiện khi kiểm tra (cần bạn quyết định)

Hai lối tắt trên màn hình Chấm công trỏ tới địa chỉ **chưa được đăng ký route**, nên bấm vào
sẽ ra trang **404 "Không tìm thấy trang"**:

| Liên kết trên màn hình Chấm công | Địa chỉ | Kết quả |
| --- | --- | --- |
| Chấm công bổ sung | `/nhan-vien/cham-cong-bo-sung` | 404 |
| Đăng ký ca làm | `/nhan-vien/dang-ky-ca-lam` | 404 |

Nguyên nhân: `src/routes/placeholders.js` chỉ đăng ký route tạm cho các mục **có trong menu**;
hai chức năng này chỉ tồn tại dưới dạng lối tắt trên trang chủ nên chưa được đăng ký.

Cách sửa đề xuất (**không đụng logic/CSDL**, chỉ thêm route tạm giống các mục khác):

```js
// trong src/routes/placeholders.js — đăng ký thêm 2 lối tắt không nằm trong menu
[
  ['/nhan-vien/cham-cong-bo-sung', 'Chấm công bổ sung'],
  ['/nhan-vien/dang-ky-ca-lam', 'Đăng ký ca làm'],
].forEach(function (pair) {
  router.get(pair[0], guard, function (req, res) {
    res.render('pages/shared/coming-soon', {
      pageTitle: pair[1],
      activeMenu: null,
      screenTitle: pair[1],
      phase: options.phase,
    });
  });
});
```

Tôi **chưa sửa** vì ĐỢT 2 được giao là không đổi route. Nếu bạn đồng ý, tôi sẽ thêm 2 route tạm
để hai lối tắt hiển thị trang "đang hoàn thiện" như các mục khác (khi đó chúng cũng được hưởng
phần responsive của mẫu `coming-soon`).

> **Đã xử lý ở ĐỢT 3 — xem mục 8.5.** Hai lối tắt này (và 4 thẻ lối tắt của Quản lý / Chủ quán)
> đã được đăng ký route tạm, không còn 404.

---

## 8. ĐỢT 3 — Nhóm màn hình Quản lý / Chủ quán (11/11/2026)

Phạm vi: toàn bộ màn hình của vai trò **Quản lý** và **Chủ quán** theo menu 7.2.2.1 / 7.2.3.2,
cộng với việc sửa 6 liên kết đang trả 404 (mục 8.5).

Chỉ sửa **EJS + CSS**, dùng lại lớp dùng chung của ĐỢT 1 / ĐỢT 2 — không tạo CSS trùng lặp.
Riêng mục 8.5 có thêm route tạm (không đổi logic nghiệp vụ, không đổi CSDL).

### 8.1. Hiện trạng từng màn hình

| # | Màn hình | Đường dẫn (Quản lý / Chủ quán) | Trạng thái | Việc đã làm ở ĐỢT 3 |
| --- | --- | --- | --- | --- |
| 1 | Trang chủ | `/quan-ly/trang-chu`, `/chu-quan/trang-chu` | Đã xây dựng | Bỏ toàn bộ `style` nội tuyến, thay bằng `.home-welcome`, `.home-card`, `.home-note` + `.u-grid-auto`; ≤640px: tiêu đề 24px, thẻ đệm gọn, lưới tự xuống 1 cột |
| 2 | Duyệt đơn › Đơn xin nghỉ/đổi ca | `.../duyet-don/xin-nghi-doi-ca` | Trang thông báo | Responsive qua mẫu `coming-soon` (ĐỢT 2) |
| 3 | Duyệt đơn › Đơn xin làm thay | `.../duyet-don/lam-thay` | Trang thông báo | Như trên |
| 4 | Chấm công › Duyệt chấm công bổ sung | `.../cham-cong/duyet-bo-sung` | Trang thông báo | Như trên |
| 5 | Chấm công › Dữ liệu chấm công | `.../cham-cong/du-lieu` | Trang thông báo | Như trên |
| 6 | Lương › Bảng lương | `.../luong/bang-luong` | Trang thông báo | Như trên |
| 7 | Lương › Duyệt bảng lương | `.../luong/duyet` | Trang thông báo | Như trên |
| 8 | Lương › Cập nhật bảng lương | `.../luong/cap-nhat` | Trang thông báo | Như trên |
| 9 | Cập nhật ca làm (thẻ lối tắt) | `.../ca-lam/cap-nhat` | **Trước đây 404** → trang thông báo | Đăng ký route tạm (mục 8.5) |
| 10 | Xem danh sách ca làm (thẻ lối tắt) | `.../ca-lam/danh-sach` | **Trước đây 404** → trang thông báo | Đăng ký route tạm (mục 8.5) |
| 11 | Nhân viên › Thêm nhân viên | `/chu-quan/nhan-vien/them` | Trang thông báo | Responsive qua mẫu `coming-soon` |
| 12 | Nhân viên › Sửa thông tin | `/chu-quan/nhan-vien/sua` | Trang thông báo | Như trên |
| 13 | Nhân viên › Xóa nhân viên | `/chu-quan/nhan-vien/xoa` | Trang thông báo | Như trên |
| 14 | Đổi mật khẩu | `/doi-mat-khau` | Đã xây dựng | Dùng chung màn hình đã làm ở ĐỢT 2 (Chủ quán không có mục này — trả 403 đúng thiết kế) |

> **Lưu ý:** giống ĐỢT 2, các màn hình 2–8 và 11–13 **chưa được xây dựng ở Giai đoạn 1**, hiện là
> trang "Màn hình đang được hoàn thiện". ĐỢT 3 làm responsive cho khung chung của chúng; khi các
> màn hình thật được xây dựng, phần responsive sẽ áp dụng lại đúng các lớp đã có
> (`.u-scroll-x` cho bảng, `.form-row` cho biểu mẫu, `.u-actions` cho nhóm nút).

### 8.2. File đã sửa ở ĐỢT 3

| File | Nội dung |
| --- | --- |
| `src/views/pages/manager/home.ejs` | Bỏ 12 `style` nội tuyến; dùng `.home-welcome`, `.home-welcome__title`, `.home-welcome__subtitle`, `.home-card`, `.home-card__icon`, `.home-card__text`, `.home-note`, `.u-grid-auto`. Đổi câu ghi chú "ở thanh điều hướng bên trái" → "trong menu điều hướng" (đúng cả khi menu thu thành nút hamburger trên điện thoại) |
| `src/views/pages/owner/home.ejs` | Như trên (bản của Chủ quán) |
| `src/public/css/layout.css` | Thêm khối `.home-*` (dùng chung cho 2 vai trò) trước phần Responsive; ≤640px thêm override cho `.home-welcome`, `.home-card`, `.home-note` |
| `src/routes/placeholders.js` | Thêm tuỳ chọn `options.extra` để đăng ký route tạm cho màn hình **không nằm trong menu** |
| `src/routes/index.js` | Truyền `extra` cho 3 vai trò (6 lối tắt — mục 8.5) |

Không sửa: service, middleware, CSDL, seed, `.env`, menu, phân quyền.

### 8.3. Kiểm tra

Đo tự động bằng `scripts/screenshot.js` + đoạn JS đo tràn ngang
(`document.documentElement.scrollWidth − window.innerWidth`, đồng thời liệt kê phần tử vượt khung):

| Nhóm | Số đường dẫn | 1280px | 375px |
| --- | --- | --- | --- |
| Quản lý (11 đường dẫn, gồm Trang chủ + 8 màn hình menu + 2 lối tắt ca làm) | 11 | `overflowX = 0` | `overflowX = 0` |
| Chủ quán (13 đường dẫn, gồm Trang chủ + 8 màn hình menu + 3 màn hình nhân viên + 2 lối tắt ca làm) | 13 | `overflowX = 0` | `overflowX = 0` |

Không có phần tử nào vượt bề ngang ở cả hai kích thước.

Kiểm tra bằng mắt:

| Màn hình | 1280px | 375px |
| --- | --- | --- |
| Trang chủ Quản lý / Chủ quán | 2 thẻ cạnh nhau, tiêu đề 34px, ghi chú cuối trang — **giữ nguyên như trước** | 2 thẻ xếp dọc, tiêu đề 24px, đệm thẻ gọn, không tràn ngang |
| Ngăn kéo menu Quản lý | — | Mở bằng nút hamburger, các mục con (Bảng lương / Duyệt bảng lương / Cập nhật bảng lương) mở ra, mỗi dòng cao ≥44px |
| Trang thông báo (Quản lý) | Breadcrumb 1 dòng, nút "Về trang chủ" nằm giữa | Breadcrumb xuống dòng, nút rộng 100% |

Ảnh kiểm chứng: `tmp/mgr-home-1280.png`, `tmp/mgr-home-375.png`, `tmp/owner-home-1280.png`,
`tmp/owner-home-375.png`, `tmp/mgr-drawer-375.png`, `tmp/mgr-cs-1280.png`, `tmp/mgr-cs-375.png`.

Lệnh chụp lại:

```powershell
node scripts/screenshot.js --width=1280 --height=900 --page=/quan-ly/trang-chu --login=0901234567 --password=123456 --out=tmp/mgr-home-1280.png
node scripts/screenshot.js --width=375  --height=812 --page=/quan-ly/trang-chu --login=0901234567 --password=123456 --out=tmp/mgr-home-375.png --full
node scripts/screenshot.js --width=1280 --height=900 --page=/chu-quan/trang-chu --login=0909999999 --password=123456 --out=tmp/owner-home-1280.png
node scripts/screenshot.js --width=375  --height=812 --page=/chu-quan/trang-chu --login=0909999999 --password=123456 --out=tmp/owner-home-375.png --full
node scripts/screenshot.js --width=375  --height=812 --page=/quan-ly/trang-chu --login=0901234567 --password=123456 --out=tmp/mgr-drawer-375.png --eval="(() => { document.querySelector('[data-nav-open]').click(); const b = document.querySelectorAll('.sidebar [data-nav-toggle]')[2]; if (b) b.click(); return 'ok'; })()"
```

### 8.4. Kiểm thử tự động

```powershell
npm test                    # 21/21
npm run db:seed
node scripts/smoke-test.js  # 22/22
npm run db:seed             # trả về trạng thái demo sạch
```

### 8.5. Sửa 6 liên kết trả 404 (việc bạn đã đồng ý cho chạy tiếp)

`src/routes/placeholders.js` chỉ đăng ký route tạm cho các mục **có trong menu**, nên mọi lối tắt
nằm ngoài menu đều trả 404. ĐỢT 3 đã bổ sung cơ chế `options.extra` và đăng ký đủ 6 địa chỉ:

| Vai trò | Liên kết | Địa chỉ | Trước | Sau |
| --- | --- | --- | --- | --- |
| Nhân viên | Chấm công bổ sung | `/nhan-vien/cham-cong-bo-sung` | 404 | Trang thông báo (Giai đoạn 2) |
| Nhân viên | Đăng ký ca làm | `/nhan-vien/dang-ky-ca-lam` | 404 | Trang thông báo (Giai đoạn 2) |
| Quản lý | Cập nhật ca làm | `/quan-ly/ca-lam/cap-nhat` | 404 | Trang thông báo (Giai đoạn 3) |
| Quản lý | Xem danh sách ca làm | `/quan-ly/ca-lam/danh-sach` | 404 | Trang thông báo (Giai đoạn 3) |
| Chủ quán | Cập nhật ca làm | `/chu-quan/ca-lam/cap-nhat` | 404 | Trang thông báo (Giai đoạn 4) |
| Chủ quán | Xem danh sách ca làm | `/chu-quan/ca-lam/danh-sach` | 404 | Trang thông báo (Giai đoạn 4) |

Đây là thay đổi **route duy nhất** của ĐỢT 3: chỉ thêm route tạm hiển thị trang thông báo, không
đụng route thật, không đổi xử lý nghiệp vụ, không đổi CSDL. Khi các màn hình thật được xây dựng,
route thật đăng ký trước sẽ được ưu tiên (Express chọn handler đầu tiên khớp).

### 8.6. Còn lại

- ĐỢT 4 (nếu bạn muốn): rà lại toàn hệ thống sau khi có đủ màn hình thật — đặc biệt bảng dữ liệu
  chấm công, bảng lương, danh sách nhân viên (dùng `.u-scroll-x` để bảng rộng cuộn trong khung).
- 13 màn hình Quản lý / Chủ quán vẫn là trang thông báo; muốn có responsive cho form/bảng thật
  thì phải xây dựng các màn hình đó trước (thêm route + xử lý + truy vấn — ngoài phạm vi EJS/CSS).

---

## 9. GIAI ĐOẠN 2 — Sáu màn hình Nhân viên (11/11/2026)

Phạm vi: các màn hình còn lại của vai trò **Nhân viên** theo menu 7.2.1 (trừ Chấm công / Check out /
Đổi mật khẩu đã có từ Giai đoạn 1). Khác với ĐỢT 1–3 (chỉ sửa EJS/CSS), giai đoạn này **có thêm
service + route + truy vấn** vì các màn hình chưa từng tồn tại; **không đổi cấu trúc CSDL** (chỉ dùng
các cột đã thống nhất ở `docs/PHAN_TICH_BUOC0.md` §13).

### 9.1. Màn hình đã xây dựng

| # | Màn hình | Đường dẫn | Đặc tả | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Chấm công bổ sung | `GET/POST /nhan-vien/cham-cong-bo-sung` | 7.2.1.11–15 · UC04 | Hoạt động (ghi `ChamCongBoSung`) |
| 2 | Đăng ký ca làm | `GET/POST /nhan-vien/dang-ky-ca-lam` | 7.2.1.16–19 · UC05 | Hoạt động (ghi `DangKyCaLam`) |
| 3 | Đăng ký xin nghỉ / đổi ca / làm thay | `GET /nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=leave\|swap\|cover`<br>`POST .../xin-nghi`, `.../doi-ca`, `.../lam-thay` | 7.2.1.20–30 · UC06 | Hoạt động (ghi `DonXinNghi`, `DonDoiCa`, `DonLamThay`) |
| 4 | Ứng lương | `GET/POST /nhan-vien/don-yeu-cau/ung-luong` | UC09 | Hoạt động (ghi `UngLuong`) |
| 5 | Xem lịch làm việc | `GET /nhan-vien/lich-lam-viec` | 7.2.1.31–33 · UC07 | Hoạt động (đọc `LichLamViec`) |
| 6 | Kiểm tra phiếu lương | `GET /nhan-vien/phieu-luong?ky=<MaBL>`<br>`POST .../xac-nhan`, `.../bao-loi` | 7.2.1.34–39 · UC08 | Hoạt động (đọc `PhieuLuong`/`ChiTietLuong`, ghi `PhanHoiLuong`) |

### 9.2. File đã thêm / sửa

| File | Nội dung |
| --- | --- |
| `src/utils/id.js` | Thêm 7 hàm sinh mã kế tiếp: `nextMaCCBS`, `nextMaDK`, `nextMaXN`, `nextMaDC`, `nextMaLT`, `nextMaUL`, `nextMaPH` |
| `src/services/schedule.service.js` | `getRegisterContext`, `saveRegistration`, `getWeekSchedule`, `getUpcomingShifts`, `capacityOf`, các hằng `MSG_*` |
| `src/services/request.service.js` | UC04 / UC06 / UC08 / UC09; dùng `txRequest(tx)` cho transaction; `createPayslipFeedback` cắt lý do còn 100 ký tự (đúng `PhanHoiLuong.LyDo nvarchar(100)`) |
| `src/routes/employee.routes.js` | 11 route mới (bảng 9.1), đặt **trước** route tạm của `placeholders.js` |
| `src/views/pages/employee/supplement.ejs`<br>`register-shift.ejs`<br>`requests.ejs`<br>`schedule.ejs`<br>`payslip.ejs`<br>`advance.ejs` | 6 màn hình mới |
| `src/public/css/components.css` | Thêm `.btn--warn` (nút "Báo lỗi" màu cam) và `.tabs--equal` (3 thẻ chọn loại đơn dạng khối chữ nhật) |
| `src/public/css/layout.css` | Khối CSS Giai đoạn 2 (`.reg-*`, `.shift-cell*`, `.swap-grid`/`.swap-card`, `.swap-panel`, `.pick-*`, `.cover-table`, `.people-*`, `.sched-*`, `.pay-*`, `.advance-*`, `.modal-card--form`) + override trong **đúng 2** media query 1024px / 640px ở cuối file |
| `src/public/js/app.js` | `[data-fill-start]` (điền "Giờ vào" theo ca), `[data-advance-form]` / `[data-advance-total]`, hộp thoại dùng chung `bindModal`/`openModal`, `[data-full-cell]` hiện thông báo "Đã có đủ số lượng nhân viên cho ca này!" |
| `src/views/partials/icons.ejs` | Thêm `#i-send`, `#i-arrow-right` |
| `db/seed.js` | Sinh lại `DangKyCaLam` theo định biên (xem 9.3) |
| `tmp/flow.js` | Script kiểm thử tay 8 luồng ghi dữ liệu (không thuộc bộ test tự động) |

### 9.3. Quyết định nghiệp vụ đã áp dụng

1. **Định biên đăng ký ca** chỉ đếm `DangKyCaLam` của người khác, **không** đếm `LichLamViec`.
   Lý do: `LichLamViec` đã phủ 01/08/2026 → 07/12/2026 (27 ca/tuần) nên nếu đếm cả hai thì mọi ô
   đều "Đầy!" và nhân viên không thể đăng ký tuần nào.
2. **Dữ liệu mẫu `DangKyCaLam`** được sinh lại theo định biên: NV005 (tài khoản demo) đăng ký ca
   chiều 4 ngày (T2, T3, T5, T6 của tuần sau); 9 nhân viên còn lại mỗi người một ô khác nhau — nhờ đó
   màn hình có **cả ô trống và ô "Đầy!"** để đối chiếu ảnh 7.2.1.19.
3. **Ô ca "Đầy!"** là `<button type="button">` (không phải checkbox `disabled`) để bấm vào vẫn hiện
   hộp thoại "Đã có đủ số lượng nhân viên cho ca này!" đúng đặc tả; phía server vẫn chặn nếu có ai
   gửi thẳng khoá của ô đầy.
4. **Xem lịch làm việc**: bỏ nút "Tuần trước / Tuần sau" vì 7.2.1.32 chỉ có 6 thành phần (không có
   điều hướng tuần); điều hướng tuần chỉ giữ trong tab Đổi ca.
5. **Báo lỗi phiếu lương** là hộp thoại (`.modal-overlay` + `.modal-card--form`) đúng ảnh
   "Kiểm tra phiếu lương 4": nhãn "Lý do", ô nhập trống, nút "Gửi" canh phải.
6. **Bảng thông tin lương**: `.pay-row` là lưới 2 cột (nhãn | giá trị canh trái) theo ảnh
   "Kiểm tra phiếu lương 1"; riêng dòng **THỰC NHẬN** giữ nhãn trái / số tiền canh phải màu cam.
   ≤640px cả hai về 1 cột.
7. **Thẻ ca trong lịch**: cao 180px (desktop) / 140px (≤640px), giờ hiển thị trong ngoặc
   `(06:00 - 12:00)`.
8. **Phiếu lương** chỉ hiển thị khi `BangLuong.TinhTrang ∈ {'Đã duyệt','Đã chi trả'}`; ngược lại
   hiện cảnh báo "Phiếu lương kỳ này chưa được phê duyệt". Nút "Xác nhận" chỉ hiện thông báo thành
   công, **không lưu trạng thái** (CSDL không có cột).
9. **Đăng ký ca** ghi vào `DangKyCaLam` (1 dòng/ca, `LichRanh` = danh sách ngày ISO phân tách bằng
   dấu phẩy), không ghi thẳng `LichLamViec`.
10. **Ca trống** ở tab Làm thay = ca tương lai có đơn xin nghỉ `Chờ duyệt`/`Đã duyệt` và chưa có
    `DonLamThay` chờ/duyệt.
11. **Ba thẻ chọn loại đơn** ở đầu tab: `.tabs--equal` (3 thẻ bằng nhau, khối chữ nhật nền cát, canh
    trái, mỗi thẻ rộng tối đa 250px, thẻ đang chọn nền nâu sẫm), nhãn hiển thị **literal**
    `[ Xin nghỉ ]` / `[ Đổi ca ]` / `[ Làm thay ]` đúng ảnh 7.2.1.20. ≤640px chuyển thành 3 cột giãn
    đều và giảm còn `--text-sm` để nhãn không xuống dòng.
12. **Nhãn bắt buộc** của tab Xin nghỉ in đúng literal `(*):` trong `<span class="req">` (7.2.1.21),
    không dùng dấu `*` trần.
13. **Nút "Gửi yêu cầu"** nằm **ngoài** thẻ, canh phải (`.form-actions--end`); nút nối vào form bằng
    thuộc tính HTML5 `form="leaveForm"` / `form="swapForm"` — không cần bọc lại thẻ.
14. **Tab Đổi ca — lịch của tôi (7.2.1.24)**: `.swap-grid` / `.swap-day` / `.swap-card` cao 190px;
    thẻ có ca nền `--brown-400` với viên trắng `.swap-card__pill` chứa tên ca + `(giờ)`; thẻ "Nghỉ"
    nền `--sand-50` và **không** bấm được; thẻ đang chọn nền `--brown-700` + mũi tên `#i-arrow-right`
    xoay -45° ở góc dưới.
15. **Tab Đổi ca — chọn đồng nghiệp (7.2.1.25)**: ô tìm kiếm + danh sách nằm trong khung viền nâu
    `.swap-panel`; mỗi dòng `.people-item` là **một dòng đầy đủ** (nền `--sand-200`, avatar tròn
    trắng + họ tên), không chia nhiều cột và không hiện chức vụ.
16. **Tab Đổi ca — lịch của đồng nghiệp (7.2.1.26)**: khung `.pick-panel` viền nhạt, tiêu đề
    "Lịch làm việc tuần này của <họ tên>" in đậm bên trong; 7 cột `.pick-card` cao 78px (trắng, có ca
    chọn được; "Nghỉ" nền xám nhạt, không bấm được); ca đang chọn viền nâu + nền `--sand-100`.
    "Lý do đổi ca" + textarea nằm dưới khung, trong cùng thẻ.
17. **Tab Làm thay (7.2.1.29)**: bảng `.cover-table` — header **không nền**, chỉ có đường kẻ dưới;
    mỗi dòng là một thẻ bo góc có viền, cột "Trạng thái" hiển thị chữ **"Trống"**, dòng đầu tiên
    được tô nền cam nhạt + viền cam; cột "Ngày" dạng "Thứ Năm, 12/11/2026".
18. **Ô ca đã đủ người** tô nền nâu nhạt `#b08063`, chữ trắng, nhãn "Đầy!" (bỏ gạch ngang cũ).

### 9.4. Kiểm tra

Tràn ngang — đo `document.documentElement.scrollWidth` so với `innerWidth` trên 9 đường dẫn ×
3 kích thước (1024 / 375 / 360px): **tất cả bằng nhau**, không có trang nào cuộn ngang.

| Nhóm kiểm tra | Kết quả |
| --- | --- |
| 8 luồng ghi dữ liệu (`node tmp/flow.js`) | 8/8 trả thông báo thành công; số dòng trong 7 bảng đều tăng đúng 1 |
| `npm test` | **21/21** |
| `node scripts/smoke-test.js` | **22/22** (chạy trên CSDL vừa seed lại) |

Đối chiếu bằng mắt ở 1280px với ảnh trong `doc/UI`:

| Màn hình | Ảnh tham chiếu | Kết quả |
| --- | --- | --- |
| Chấm công bổ sung | `Chấm công bổ sung 2.png` | Khớp bố cục 2 cột, nút "Gửi" canh phải |
| Đăng ký ca làm | `Đăng kí ca làm 1.png`, `... 4.png` | 7 cột ngày, ô đã chọn nền nâu sẫm, ô "Đầy!" nền nâu nhạt + hộp thoại khi bấm |
| Đăng ký xin nghỉ / đổi ca | `.../đổi ca 1, 4, 5, 6, 7, 8, 9, 10.png` | 3 thẻ tab chữ nhật bằng nhau, nhãn `(*):`, nút "Gửi yêu cầu" ngoài thẻ canh phải; tab Đổi ca: thẻ ngày 190px có viên trắng + mũi tên khi chọn, khung `.swap-panel` cho tìm kiếm, `.pick-panel` cho lịch đồng nghiệp; tab Làm thay: bảng header không nền, dòng bo góc, "Trống", dòng đầu tô cam |
| Xem lịch làm việc | `Xem lịch làm việc 2.png` | 7 cột, thẻ ca 180px, giờ trong ngoặc |
| Kiểm tra phiếu lương | `Kiểm tra phiếu lương 1.png`, `... 4.png` | Lưới nhãn/giá trị, dòng THỰC NHẬN flex 2 đầu + số tiền cam `#b8461c`, hộp thoại "Lý do" (ô trống) + nút "Gửi" canh phải |
| Ứng lương | `Ứng lương 1.png` | 3 thẻ mức ứng, nhãn "Đang chọn" khi chọn, tổng tiền cập nhật tức thì |

Ở 375px / 360px: sidebar thu thành nút hamburger, bảng đăng ký ca và lịch tuần cuộn ngang **trong
khung của chúng** (`.reg-board`, `.sched-grid`, `.swap-grid`, `.pick-grid`), bảng dữ liệu cuộn trong
`.table-wrap`, nút hành động giãn hết bề ngang, thẻ ca cao 140px, 3 thẻ tab giảm còn `--text-sm` để
không xuống dòng, ẩn biểu tượng trang trí tiêu đề mục.

Lệnh chụp lại:

```powershell
node scripts/screenshot.js --width=1280 --height=900 --page=/nhan-vien/dang-ky-ca-lam --out=tmp/shots/register-1280.png --full
node scripts/screenshot.js --width=375  --height=900 --page=/nhan-vien/dang-ky-ca-lam --out=tmp/shots/register-375.png --full
node scripts/screenshot.js --width=1280 --height=900 "--page=/nhan-vien/phieu-luong?ky=BL202608&bao-loi=1" --out=tmp/shots/payslip-report-1280.png --full
node scripts/screenshot.js --width=1280 --height=900 --page=/nhan-vien/dang-ky-ca-lam --out=tmp/shots/register-full-1280.png --click=".shift-cell--full"
node scripts/screenshot.js --width=1280 --height=900 "--page=/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=swap&ca=LLV0406&ban=NV001" --out=tmp/shots/req-swap-1280.png --full
node scripts/screenshot.js --width=1280 --height=900 "--page=/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=cover" --out=tmp/shots/req-cover-1280.png --full
node scripts/screenshot.js --width=375  --height=900 "--page=/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=leave" --out=tmp/shots/req-leave-375.png --full
```

### 9.5. Còn lại

- **Giai đoạn 3** — màn hình Quản lý (M3–M11): duyệt đơn xin nghỉ/đổi ca, duyệt đơn làm thay, duyệt
  chấm công bổ sung, dữ liệu chấm công, bảng lương, duyệt bảng lương, cập nhật bảng lương, cập nhật
  ca làm, xem danh sách ca làm.
- **Giai đoạn 4** — màn hình Chủ quán (O4–O6): thêm / sửa / xóa nhân viên.
- Máy không có `git` và không có thư mục `.git`: **toàn bộ thay đổi vẫn chỉ nằm trên đĩa**, chưa được
  commit ở đâu cả.
