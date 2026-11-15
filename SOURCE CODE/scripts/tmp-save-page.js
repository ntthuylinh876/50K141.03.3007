'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://localhost:3000';
const jar = new Map();
function absorb(res) {
  for (const raw of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const pair = raw.split(';')[0];
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
function cookie() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

(async () => {
  let res = await fetch(`${BASE}/dang-nhap`);
  absorb(res);
  let html = await res.text();
  let csrf = /name="_csrf" value="([^"]+)"/.exec(html)[1];
  res = await fetch(`${BASE}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie() },
    body: new URLSearchParams({ _csrf: csrf, phone: '0909999999', password: '123456' }),
  });
  absorb(res);

  const target = process.argv[2] || '/chu-quan/nhan-vien/sua';
  res = await fetch(BASE + target, { headers: { cookie: cookie() } });
  html = await res.text();

  const cssDir = path.join(__dirname, '..', 'src', 'public', 'css');
  const css = ['tokens.css', 'base.css', 'components.css', 'layout.css']
    .map((f) => `<style>\n${fs.readFileSync(path.join(cssDir, f), 'utf8')}\n</style>`)
    .join('\n');
  html = html
    .replace(/<link rel="stylesheet" href="\/css\/[^"]+">\s*/g, '')
    .replace('</head>', `${css}\n</head>`);

  const out = path.join(process.env.TEMP, 'emp-list.html');
  fs.writeFileSync(out, html, 'utf8');
  console.log('saved', out, res.status);
})();
