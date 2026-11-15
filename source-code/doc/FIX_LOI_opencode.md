# DANH SÁCH SỬA LỖI (đối chiếu `doc/UI` + `doc/50K141.03.3007.txt`)

## Cách dùng (để tiết kiệm token)
- **Ưu tiên ảnh UI.** Cột "Ảnh UI" ghi đúng tên ảnh trong `doc/UI`: tên = tên thư mục + số, vd `Duyệt bảng lương 2` là file `Duyệt bảng lương 2.png` trong thư mục `Duyệt bảng lương`. Chỉ mở đúng ảnh được ghi, không duyệt cả folder.
- Riêng `Đăng ký xin nghỉ/đổi ca N` là file `đổi ca N.png` nằm trong thư mục `Đăng ký xin nghỉ` (lồng trong `Đăng ký xin nghỉđổi ca`).
- Số trong tên ảnh là số dùng trong danh sách lỗi. **Số trong txt có chỗ đánh khác** (vd txt "Cập nhật bảng lương 8" = ảnh `Cập nhật bảng lương 14`), nên nếu mâu thuẫn thì **theo ảnh**.
- Cột "Mô tả chữ" (trong `doc/50K141.03.3007.txt`) chỉ để đọc đặc tả chi tiết khi cần: `sed -n 'A,Bp' doc/50K141.03.3007.txt`. **KHÔNG đọc cả file txt (7851 dòng).** Tìm lại theo mã mục: `grep -n "7.2.2.41." doc/50K141.03.3007.txt` (mã `7.2.R.n`: R=1 nhân viên, 2 quản lý, 3 chủ quán).
- Thư mục ảnh gộp nhiều vai trò: thường nửa đầu là quản lý, nửa sau là chủ quán (vd `Dữ liệu chấm công` 1–8 quản lý, 9–16 chủ quán; `Duyệt bảng lương` 1–6 quản lý, 7–11 chủ quán). Mỗi mục dưới đây đã ghi đúng ảnh của vai trò cần sửa.

## A. NHÂN VIÊN
| # | Cần sửa | Ảnh UI (tên trong doc/UI) | Mô tả chữ (trong doc/50K141.03.3007.txt) |
|---|---|---|---|
| N1 | Icon ở ô "Tên đăng nhập" bị lệch khi hiện lỗi "Không được để trống Tên đăng nhập và mật khẩu !" | Đăng nhập 2 | `7.2.1.2` (dòng 2852–2862) |
| N2 | Logo + chữ "Nick & the juice" phải **căn giữa** | Đăng nhập 1 | `7.2.1.1` (dòng 2816–2851) |
| N3 | **Icon hạt cà phê** phải giống UI **ở mọi màn hình có sidebar của cả 3 vai trò** (nhân viên, quản lý, chủ quán), kể cả màn đăng nhập: dùng đúng 1 icon như ở cuối sidebar UI = **cặp 2 hạt cà phê nâu đậm nằm giữa hai đường kẻ ngang, ngay dưới nút Đăng xuất**. Tạo 1 component/asset dùng chung rồi thay hết các chỗ đang dùng icon khác | Mẫu chuẩn: `Đăng nhập 4` (nhân viên), `Đăng nhập 5` (quản lý), `Đăng nhập 6` (chủ quán); màn đăng nhập: `Đăng nhập 1` | Mô tả "hạt cà phê trang trí cuối thanh sidebar" nằm trong mục sidebar của mỗi màn hình, vd `7.2.1.4` (dòng 2873–2947); tìm nhanh: `grep -n "hạt cà phê" doc/50K141.03.3007.txt` |
| N4 | SĐT chủ quán lấy **10 số** như nhân viên/quản lý (tên đăng nhập = SĐT). Không có UI, chỉ sửa dữ liệu/validation | — | — |
| N5 | **Bỏ nút wifi quán** trên UI, **giữ nguyên** logic kiểm tra wifi khi chấm công | Chấm công 1; Check out 1 | `7.2.1.5` (dòng 2948–3045); `7.2.1.8` (dòng 3071–3162) |
| N6 | Giờ ra (mọi chỗ hiển thị/nhập giờ) đổi sang **24h** | Check out 1; Chấm công bổ sung 1–5 | `7.2.1.8–7.2.1.14` (dòng 3071–3355) |
| N7 | Thiếu màn **Xem lịch làm việc**, làm theo UI | Xem lịch làm việc 1–3 | `7.2.1.31–7.2.1.33` (dòng 3704–3812) |
| N8 | Phương thức nghỉ chỉ gồm **nghỉ ngày** hoặc **nghỉ tuần** | Đăng ký xin nghỉ/đổi ca 1, 2 | `7.2.1.20–7.2.1.21` (dòng 3481–3571) |
| N9 | Thông báo "Vui lòng điền đầy đủ thông tin" thiếu icon | Đăng ký xin nghỉ/đổi ca 4 | `7.2.1.23` (dòng 3582–3591) |
| N10 | **Xóa** phần "lịch sử đơn đã gửi / đơn đã gửi" ở Xin nghỉ/đổi ca (UC và UI không có) | Đăng ký xin nghỉ/đổi ca 1 (không có phần này) | `7.2.1.20` (dòng 3481–3563) |
| N11 | **Đổi ca tách thành 3 màn riêng** theo UI: ① chọn ca của mình muốn đổi ② chọn người muốn đổi ③ xem lịch tuần của người đó, chọn ca của họ, **ô "Lý do đổi ca" và nút Gửi yêu cầu nằm cùng màn ③** (ảnh 7 = chưa nhập lý do, ảnh 8 = đã nhập lý do). Không có màn lý do riêng | Đăng ký xin nghỉ/đổi ca 5 ① / 6 ② / 7–8 ③ | `7.2.1.24` (dòng 3592–3611) ①; `7.2.1.25` (dòng 3612–3627) ②; `7.2.1.26–7.2.1.27` (dòng 3628–3663) ③ |
| N12 | Màu nút **Xin nghỉ, Đổi ca, Làm thay, Đăng ký nhận ca** → `#4C2D19` | Đăng ký xin nghỉ/đổi ca 1, 5, 10 (thanh 3 nút + nút "Đăng ký nhận ca") | `7.2.1.20` (dòng 3481–3563); `7.2.1.29` (dòng 3674–3695) |
| N13 | **Bỏ lịch sử ứng lương** (UI chỉ có màn ứng lương). ⚠ Txt không có mô tả chữ cho UI Ứng lương, chỉ có bảng ánh xạ UC↔màn hình | Ứng lương 1, 2 | `dòng 6968–7441` (chỉ ánh xạ) |
| N14 | Sidebar: đổi icon Trang chủ, Đơn yêu cầu, Phiếu lương, Đổi mật khẩu giống UI; **bỏ dấu chấm** trước các mục con của Đơn yêu cầu | Đăng nhập 4; Đăng ký xin nghỉ/đổi ca 1 (menu con) | `7.2.1.4` (dòng 2873–2947) |
| N15 | Menu cha (Đơn yêu cầu, Ứng lương): mở menu con thì **mũi tên quay xuống**; mục con đang chọn (vd Xin nghỉ/đổi ca) có **nền trắng nằm ngay trên chữ mục con** | Đăng ký xin nghỉ/đổi ca 1; Ứng lương 1 | `7.2.1.20` (dòng 3481–3563) |
| N16 | Phiếu lương **chưa được duyệt** → hiện thông báo theo UI | Kiểm tra phiếu lương 3 | `7.2.1.36` (dòng 3911–3930) |

## B. QUẢN LÝ
| # | Cần sửa | Ảnh UI (tên trong doc/UI) | Mô tả chữ (trong doc/50K141.03.3007.txt) |
|---|---|---|---|
| Q1 | Trang chủ quản lý làm lại giống UI + sửa **icon sidebar** theo UI (mô tả chữ nằm dưới mục 7.2.2.5) | Đăng nhập 5 | `7.2.2.4–7.2.2.5` (dòng 4164–4219) |
| Q2 | Mục **chọn tuần** làm lại giống UI | Cập nhật ca làm 2 | `7.2.2.6` (dòng 4220–4268) |
| Q3 | "Không thể cập nhật ca đã diễn ra" → dạng **popup** theo UI | Cập nhật ca làm 5 (popup mẫu: Cập nhật ca làm 8, Untitled) | `7.2.2.9` (dòng 4323–4333) |
| Q4 | Nền mục ca làm (thanh "Ca sáng - Thứ Bảy…") → `#F3EDE5` | Cập nhật ca làm 3 | `7.2.2.7` (dòng 4269–4309) |
| Q5 | **Bỏ nút Quay lại** ở Cập nhật ca làm | Cập nhật ca làm 3 (UI không có nút này) | `7.2.2.5–7.2.2.10` (dòng 4169–4346) |
| Q6 | Icon ở popup thông báo sai → theo UI | Cập nhật ca làm 4 | `7.2.2.8` (dòng 4310–4322) |
| Q7 | **Bỏ mục "Xem theo"**, làm đúng UI (chỉ "Thời gian" + "Ca làm" + nút Xem) | Xem danh sách ca làm 2, 3 | `7.2.2.12–7.2.2.13` (dòng 4360–4427) |
| Q8 | "Chưa có lịch làm việc cho thời gian này!" → dạng **popup** | Xem danh sách ca làm 4 | `7.2.2.14` (dòng 4428–4438) |
| Q9 | **Bỏ chức năng "Duyệt ứng lương" của quản lý** (SRS và UI quản lý không có): xóa mục menu, màn hình, route và xử lý phía quản lý. Chỉ bỏ phần duyệt của quản lý, **giữ nguyên** màn Ứng lương của nhân viên. Nếu bỏ làm ảnh hưởng luồng ứng lương của nhân viên (vd trạng thái chờ duyệt) thì báo lại, đừng tự đổi luồng | Sidebar quản lý chuẩn: `Đăng nhập 5`; menu "Duyệt đơn đăng ký" chỉ có xin nghỉ/đổi ca, làm thay, chấm công bổ sung (xem `Duyệt đơn xin nghỉ đổi ca 1`, `Duyệt đơn xin làm thay 1`, `Duyệt chấm công bổ sung 1`) | `7.2.2.15` (dòng 4439–4503, mô tả sidebar/menu "Duyệt đơn đăng ký"). Tìm trong code: `grep -ri "duyệt ứng lương\|duyet-ung-luong\|advance.*approv"` |
| Q10 | Mục **thời gian** ở Dữ liệu chấm công làm giống UI (dropdown Ngày/Tuần + lịch) | Dữ liệu chấm công 1–8 (9–16 là của chủ quán) | `7.2.2.30–7.2.2.36` (dòng 4847–5100) |
| Q11 | **Không bấm xem được chi tiết** bảng lương nhân viên (Bảng lương 1 → 2 → 3) | Bảng lương 1, 2, 3 - Quản lý | `7.2.2.37–7.2.2.39` (dòng 5101–5221) |
| Q12 | Màn chi tiết NV: **bỏ "lý do chỉnh sửa"** (lý do chỉ ở bước sau khi bấm Chỉnh sửa); sửa **icon chỉnh sửa** theo UI | Duyệt bảng lương 2 (icon chỉnh sửa, không có lý do); Duyệt bảng lương 3 (có lý do) | `7.2.2.41` (dòng 5320–5358); `7.2.2.42` (dòng 5359–5380) |
| Q13 | Sau bấm Chỉnh sửa: cho sửa **Phạt** và **Ứng lương**, **ẩn nút Chỉnh sửa**. Nút **Không duyệt / Duyệt chỉ có ở Duyệt bảng lương 1**, màn 2 và 3 không có | Duyệt bảng lương 1 (có 2 nút); 2, 3 (không có) | `7.2.2.40` (dòng 5222–5319); `7.2.2.41–7.2.2.42` (dòng 5320–5380) |
| Q14 | Sửa tiền phạt bị báo "tiền phạt không hợp lệ" → **cho nhập số bất kỳ** | Duyệt bảng lương 3, 4 | `7.2.2.42–7.2.2.43` (dòng 5359–5396) |
| Q15 | Sau khi quản lý duyệt: hiện nhãn **"Chờ chủ quán duyệt"** dưới tiêu đề "Tổng hợp lương nhân viên", đúng vị trí + màu thanh trạng thái | Duyệt bảng lương 6 | `7.2.2.45` (dòng 5417–5426) |
| Q16 | Màn chỉnh sửa sau đối chiếu: **xóa** ngày/tháng/năm cạnh tên NV; **xóa** dòng "Đề xuất chỉnh sửa được gửi tới chủ quán duyệt trước khi áp dụng vào phiếu lương"; **xóa** chữ hướng dẫn trong ô "Lý do chỉnh sửa" | Cập nhật bảng lương 7 (8 là bản đã nhập) | `7.2.2.52` (dòng 5662–5679) |
| Q17 | Giờ vào/giờ ra đổi sang **24h** | Cập nhật bảng lương 3, 7, 8 | `7.2.2.48–7.2.2.52` (dòng 5528–5679) |
| Q18 | Thông báo "Chỉnh sửa phiếu lương cần duyệt!" hiện ở **tài khoản chủ quán** (trang chủ chủ quán), không hiện ngay ở quản lý sau khi gửi đề xuất | Cập nhật bảng lương 9 | `7.2.3.44` (dòng 6058–6067) |
| Q19 | Cập nhật bảng lương của quản lý: **xóa thanh trạng thái** "Chờ chủ quán duyệt" (UI không có) | Cập nhật bảng lương 1–8 (không có thanh này) | `7.2.2.46–7.2.2.52` (dòng 5427–5679) |
| Q20 | **Bỏ chức năng "phản hồi phiếu lương"** khỏi luồng này (sẽ lưu ở nơi khác sau). Không có trong UI quản lý | — | — |

## C. CHỦ QUÁN
| # | Cần sửa | Ảnh UI (tên trong doc/UI) | Mô tả chữ (trong doc/50K141.03.3007.txt) |
|---|---|---|---|
| O1 | Cập nhật bảng lương: **có đề xuất chờ duyệt** → màn "Chủ quán xét đề xuất"; **không có** → danh sách phiếu lương như quản lý | Cập nhật bảng lương 10 (xét đề xuất; 12, 13 là popup lý do Không duyệt); Cập nhật bảng lương 1 (danh sách phiếu lương) | `7.2.3.45–7.2.3.47` (dòng 6068–6148); `7.2.2.46` (dòng 5427–5503) |
| O2 | Thêm nhân viên: **xóa hết** chữ hướng dẫn/gợi ý trong ô nhập (để trống); icon nút **Lưu** theo UI | Thêm nhân viên 1 | `7.2.3.48` (dòng 6149–6223) |
| O3 | Bấm Lưu → **chỉ hiện đúng 1 popup** như UI: icon **tick xanh**, "Thêm nhân viên thành công", **tên đăng nhập**, **mật khẩu tự sinh**; không popup nào khác, không thông tin khác (đã gộp 2 mục trùng) | Thêm nhân viên 4 | `7.2.3.51` (dòng 6285–6296) |
| O4 | Sửa thông tin NV: **màu các cột tiêu đề** không đồng nhất → theo UI | Sửa thông tin nhân viên 2 | `7.2.3.53` (dòng 6366–6403) |
| O5 | Xóa NV: popup xác nhận **bỏ thông tin nhân viên**, chỉ giữ icon thùng rác, "Xóa nhân viên này?", nút Hủy, nút Xóa nhân viên | Xóa nhân viên 2 | `7.2.3.57` (dòng 6486–6502) |
