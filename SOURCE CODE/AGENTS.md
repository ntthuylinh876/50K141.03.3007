## Responsive (desktop + điện thoại)
- Mọi màn hình phải dùng được trên desktop (>= 1024px) và điện thoại (>= 360px).
- Thiết kế mobile-first, một file CSS dùng chung (media query theo breakpoint 640px và 1024px).
- Thêm `<meta name="viewport" content="width=device-width, initial-scale=1">` ở layout chung.
- Dùng flex/grid và đơn vị tương đối (rem, %, minmax); không đặt width cố định bằng px cho khối chính.
- Desktop: giữ đúng bố cục theo ảnh UI. Mobile: xếp cột dọc, sidebar thu thành menu (hamburger),
  bảng rộng cuộn ngang trong khung riêng (overflow-x: auto), không để cả trang cuộn ngang.
- Nút và ô nhập đủ lớn để chạm (cao tối thiểu 44px), chữ tối thiểu 16px ở ô nhập.
- Màn hình chấm công, đăng ký ca, xem lịch, xem lương (nhân viên dùng điện thoại nhiều) ưu tiên mobile.
- Giữ nguyên màu sắc, nhãn chữ, thứ tự trường theo đặc tả màn hình; chỉ thay đổi cách sắp xếp theo kích thước.