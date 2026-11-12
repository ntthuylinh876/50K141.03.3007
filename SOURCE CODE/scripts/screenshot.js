'use strict';

/**
 * Công cụ kiểm tra giao diện (chỉ dùng khi phát triển).
 *
 * Mở Chrome/Edge ở chế độ headless qua DevTools Protocol, đăng nhập bằng tài
 * khoản demo, đặt đúng kích thước khung nhìn (viewport) rồi chụp ảnh màn hình.
 * Nhờ vậy có thể kiểm tra giao diện ở 1280px và 375px một cách xác định,
 * không phụ thuộc kích thước cửa sổ trình duyệt đang mở.
 *
 * Cách dùng:
 *   node scripts/screenshot.js --width=1280 --height=900 \
 *        --page=/nhan-vien/trang-chu --out=tmp/home-1280.png
 *
 * Tham số:
 *   --width, --height   kích thước khung nhìn (mặc định 1280 x 900)
 *   --page              đường dẫn cần chụp (mặc định /nhan-vien/trang-chu)
 *   --out               tệp PNG kết quả (bắt buộc)
 *   --login             số điện thoại đăng nhập (mặc định 0914673802 - nhân viên)
 *   --password          mật khẩu (mặc định 123456)
 *   --eval              đoạn JavaScript chạy trong trang trước khi chụp
 *   --click             bấm vào phần tử khớp CSS selector rồi chờ trang tải lại
 *   --full              chụp toàn bộ trang thay vì chỉ khung nhìn
 *   --base              địa chỉ máy chủ (mặc định http://localhost:3000)
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Không tìm thấy Chrome hoặc Edge trên máy.');
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDevTools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch (_) {
      /* chưa sẵn sàng */
    }
    await sleep(150);
  }
  throw new Error('DevTools không phản hồi.');
}

/** Kết nối WebSocket tới DevTools và trả về hàm gửi lệnh CDP. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(new Error('WebSocket lỗi: ' + e.message)));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method).forEach((fn) => fn(msg.params));
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết thời gian chờ ' + method)), timeoutMs);
      const fn = (params) => {
        clearTimeout(timer);
        listeners.get(method).delete(fn);
        resolve(params);
      };
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(fn);
    });
  }

  return { ws, ready, send, once };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const width = Number(args.width || 1280);
  const height = Number(args.height || 900);
  const base = String(args.base || 'http://localhost:3000');
  const page = String(args.page || '/nhan-vien/trang-chu');
  const login = String(args.login || '0914673802');
  const password = String(args.password || '123456');
  const outFile = args.out ? path.resolve(String(args.out)) : null;
  if (!outFile) throw new Error('Thiếu tham số --out=<tệp.png>');

  const port = Number(args.port || 9333);
  const profile = path.join(
    require('node:os').tmpdir(),
    args.fresh ? 'chamcong-shot-' + Date.now() : 'chamcong-shot-profile'
  );
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  try {
    const version = await waitForDevTools(port);
    const targetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const target = await targetRes.json();
    cdp = connect(target.webSocketDebuggerUrl);
    await cdp.ready;

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 640,
    });

    async function goto(url) {
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url });
      await loaded;
      // Chờ font và hiệu ứng hoàn tất.
      await sleep(600);
    }

    async function evaluate(expression) {
      const res = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (res.exceptionDetails) {
        const det = res.exceptionDetails;
        const desc = det.exception && (det.exception.description || det.exception.value);
        throw new Error('Lỗi JavaScript trong trang: ' + (desc || det.text));
      }
      return res.result.value;
    }

    // Đăng nhập (bỏ qua nếu đã có phiên).
    await goto(base + '/nhan-vien/trang-chu');
    const current = await evaluate('location.pathname');
    if (!args.nologin && current.includes('dang-nhap')) {
      await evaluate(`(() => {
        document.querySelector('input[name="phone"]').value = ${JSON.stringify(login)};
        document.querySelector('input[name="password"]').value = ${JSON.stringify(password)};
        document.querySelector('form[action="/dang-nhap"]').submit();
        return true;
      })()`);
      await cdp.once('Page.loadEventFired').catch(() => {});
      await sleep(800);
    }

    await goto(base + page);

    if (args['eval-file']) {
      const value = await evaluate(fs.readFileSync(String(args['eval-file']), 'utf8'));
      if (value !== undefined) console.log('eval: ' + JSON.stringify(value));
      await sleep(500);
    } else if (args.eval) {
      const value = await evaluate(String(args.eval));
      if (value !== undefined) console.log('eval: ' + JSON.stringify(value));
      await sleep(500);
    }

    if (args.click) {
      // Bấm một phần tử có thể gây điều hướng trang: chờ sự kiện tải lại.
      const loaded = cdp.once('Page.loadEventFired', 15000).catch(() => {});
      await cdp
        .send('Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(String(args.click))}).click()`,
        })
        .catch(() => {});
      await loaded;
      await sleep(900);
    }

    if (args['after-file'] || args.after) {
      const src = args['after-file']
        ? fs.readFileSync(String(args['after-file']), 'utf8')
        : String(args.after);
      const value = await evaluate(src);
      if (value !== undefined) console.log('after: ' + JSON.stringify(value));
      await sleep(300);
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !!args.full,
    });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));

    const info = await evaluate(`JSON.stringify({
      url: location.href,
      innerWidth: innerWidth,
      innerHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight
    })`);
    console.log(info);
    console.log('Đã lưu: ' + outFile);
  } finally {
    if (cdp && cdp.ws) cdp.ws.close();
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
