'use strict';

/**
 * Kiểm tra khói (smoke test) cho Giai đoạn 1.
 * Chạy khi máy chủ đã bật:  node scripts/smoke-test.js [baseUrl]
 */

const BASE = process.argv[2] || 'http://localhost:3000';

/** Tách cookie phiên từ header Set-Cookie. */
function readCookie(res, jar) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractCsrf(html) {
  const m = /name="_csrf"\s+value="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

async function request(jar, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (jar.size) headers.cookie = cookieHeader(jar);
  if (options.body) headers['content-type'] = 'application/x-www-form-urlencoded';

  const res = await fetch(BASE + path, { ...options, headers, redirect: 'manual' });
  readCookie(res, jar);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}

async function login(phone, password) {
  const jar = new Map();
  const page = await request(jar, '/dang-nhap');
  if (page.status !== 200) throw new Error(`GET /dang-nhap -> ${page.status}`);
  const csrf = extractCsrf(page.text);
  if (!csrf) throw new Error('Không tìm thấy _csrf trên trang đăng nhập');

  const body = new URLSearchParams({ _csrf: csrf, phone, password }).toString();
  const res = await request(jar, '/dang-nhap', { method: 'POST', body });

  return { jar, status: res.status, location: res.location, text: res.text };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\nKiểm tra khói tại ${BASE}\n`);

  /* --- 1. Trang đăng nhập --- */
  {
    const jar = new Map();
    const res = await request(jar, '/dang-nhap');
    check('GET /dang-nhap trả 200', res.status === 200, `status=${res.status}`);
    check('Trang đăng nhập có tiêu đề thương hiệu', res.text.includes('NICK'));
  }

  /* --- 2. Sai mật khẩu --- */
  {
    const res = await login('0914673802', 'sai-mat-khau');
    check(
      'Đăng nhập sai bị từ chối với thông báo đúng đặc tả',
      res.status === 401 && res.text.includes('Đăng nhập không thành công'),
      `status=${res.status}`,
    );
  }

  /* --- 3. Bỏ trống --- */
  {
    const jar = new Map();
    const page = await request(jar, '/dang-nhap');
    const csrf = extractCsrf(page.text);
    const body = new URLSearchParams({ _csrf: csrf, phone: '', password: '' }).toString();
    const res = await request(jar, '/dang-nhap', { method: 'POST', body });
    check(
      'Bỏ trống đăng nhập hiện đúng thông báo',
      res.text.includes('Không được để trống Tên đăng nhập và mật khẩu !'),
      `status=${res.status}`,
    );
  }

  /* --- 4. Ba vai trò --- */
  const roles = [
    { phone: '0914673802', label: 'Nhân viên', home: '/nhan-vien/trang-chu', expect: 'Chấm công' },
    { phone: '0901234567', label: 'Quản lý', home: '/quan-ly/trang-chu', expect: 'Chào mừng' },
    { phone: '0909999999', label: 'Chủ quán', home: '/chu-quan/trang-chu', expect: 'Chào mừng' },
  ];

  const jars = {};

  for (const role of roles) {
    const res = await login(role.phone, '123456');
    jars[role.label] = res.jar;
    check(
      `${role.label}: đăng nhập đúng chuyển về ${role.home}`,
      res.status === 302 && res.location === role.home,
      `status=${res.status} location=${res.location}`,
    );

    const home = await request(res.jar, role.home);
    check(
      `${role.label}: trang chủ hiển thị đúng`,
      home.status === 200 && home.text.includes(role.expect),
      `status=${home.status}`,
    );
  }

  /* --- 5. Phân quyền --- */
  {
    const res = await request(jars['Nhân viên'], '/quan-ly/trang-chu');
    check('Nhân viên bị chặn khỏi khu vực quản lý', res.status === 403, `status=${res.status}`);
  }
  {
    const res = await request(jars['Quản lý'], '/chu-quan/nhan-vien/them');
    check('Quản lý bị chặn khỏi chức năng của chủ quán', res.status === 403, `status=${res.status}`);
  }
  {
    const res = await request(jars['Chủ quán'], '/doi-mat-khau');
    check(
      'Chủ quán KHÔNG có chức năng đổi mật khẩu (403)',
      res.status === 403,
      `status=${res.status}`,
    );
  }
  {
    const res = await request(jars['Chủ quán'], '/quan-ly/trang-chu');
    check('Chủ quán kế thừa được quyền của quản lý', res.status === 200, `status=${res.status}`);
  }
  {
    const res = await request(jars['Quản lý'], '/doi-mat-khau');
    check('Quản lý mở được trang đổi mật khẩu', res.status === 200, `status=${res.status}`);
  }

  /* --- 6. Chấm công: Wi-Fi --- */
  {
    const jar = jars['Nhân viên'];
    const home = await request(jar, '/nhan-vien/trang-chu');
    const csrf = extractCsrf(home.text);

    // Tắt công tắc "Wi-Fi quán" (chỉ có tác dụng khi DEMO_MODE=true)
    const off = await request(jar, '/demo/wifi', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf }).toString(),
      headers: { referer: BASE + '/nhan-vien/trang-chu' },
    });

    const denied = await request(jar, '/nhan-vien/cham-cong/vao', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf }).toString(),
    });
    // Sai Wi-Fi: chuyển về trang chủ rồi hiện hộp thoại "Kết nối sai Wifi"
    // (đúng ảnh doc/UI/Chấm công/Chấm công 3.png).
    const deniedPage = await request(jar, '/nhan-vien/trang-chu');
    check(
      'Chấm công khi sai Wi-Fi bị chặn với thông báo "Kết nối sai Wifi"',
      off.status === 302 &&
        denied.status === 302 &&
        denied.location === '/nhan-vien/trang-chu' &&
        deniedPage.text.includes('Kết nối sai Wifi'),
      `status=${denied.status} location=${denied.location}`,
    );

    // Bật lại Wi-Fi
    await request(jar, '/demo/wifi', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf, enabled: '1' }).toString(),
      headers: { referer: BASE + '/nhan-vien/trang-chu' },
    });

    const ok = await request(jar, '/nhan-vien/cham-cong/vao', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf }).toString(),
    });
    const after = await request(jar, '/nhan-vien/trang-chu');
    check(
      'Chấm công khi đúng Wi-Fi thành công',
      ok.status === 302 && after.text.includes('Chấm công thành công!'),
      `status=${ok.status}`,
    );

    const out = await request(jar, '/nhan-vien/cham-cong/ra', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf }).toString(),
    });
    const afterOut = await request(jar, '/nhan-vien/trang-chu');
    check(
      'Check out thành công',
      out.status === 302 && afterOut.text.includes('Check out thành công!'),
      `status=${out.status}`,
    );
  }

  /* --- 7. CSRF --- */
  {
    const res = await request(jars['Quản lý'], '/dang-xuat', { method: 'POST', body: '' });
    check('POST thiếu CSRF bị chặn', res.status === 403, `status=${res.status}`);
  }

  /* --- 8. Đăng xuất --- */
  {
    const jar = jars['Quản lý'];
    const home = await request(jar, '/quan-ly/trang-chu');
    const csrf = extractCsrf(home.text);
    const res = await request(jar, '/dang-xuat', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: csrf }).toString(),
    });
    check('Đăng xuất chuyển về trang đăng nhập', res.status === 302 && res.location === '/dang-nhap');

    const after = await request(jar, '/quan-ly/trang-chu');
    check('Sau đăng xuất không còn truy cập được', after.status === 302, `status=${after.status}`);
  }

  /* --- 9. 404 --- */
  {
    const res = await request(new Map(), '/khong-ton-tai');
    check('Trang không tồn tại trả 404', res.status === 404, `status=${res.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nKết quả: ${results.length - failed.length}/${results.length} đạt.\n`);
  if (failed.length) {
    console.error('Các mục thất bại:', failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nLỗi khi chạy kiểm tra:', err.message);
  process.exit(1);
});
