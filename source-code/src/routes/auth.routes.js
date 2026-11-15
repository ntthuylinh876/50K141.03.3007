'use strict';

/**
 * Route xác thực: đăng nhập, đăng xuất, đổi mật khẩu (UC01, UC15, UC16).
 */

const express = require('express');
const config = require('../config/env');
const authService = require('../services/auth.service');
const { ROLES, HOME_PATH, requireLogin, wantsJson } = require('../middleware/auth');

const router = express.Router();

/** Tạo lại session ID sau khi đăng nhập để chống session fixation. */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

/** Lưu session trước khi chuyển trang để không mất dữ liệu. */
function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

/* ------------------------------------------------------------------ */
/* Đăng nhập                                                           */
/* ------------------------------------------------------------------ */

router.get('/dang-nhap', (req, res) => {
  if (req.session?.user) {
    return res.redirect(HOME_PATH[req.session.user.role] || '/');
  }
  return res.render('pages/auth/login', {
    title: 'Đăng nhập',
    layout: false,
    error: null,
    fieldErrors: {},
    form: { phone: '' },
    demoAccounts: config.wifi.demoMode ? DEMO_ACCOUNTS : [],
  });
});

router.post('/dang-nhap', async (req, res, next) => {
  const phone = String(req.body?.phone ?? '').trim();
  const password = String(req.body?.password ?? '');

  try {
    const user = await authService.login(phone, password);

    const returnTo = req.session?.returnTo;
    await regenerateSession(req);
    req.session.user = user;
    req.session.demoCafeWifi = true; // mặc định đang ở Wi-Fi quán khi vào demo
    await saveSession(req);

    if (wantsJson(req)) {
      return res.json({ ok: true, user, redirect: HOME_PATH[user.role] });
    }

    const target = returnTo && returnTo.startsWith('/') ? returnTo : HOME_PATH[user.role];
    return res.redirect(target);
  } catch (err) {
    if (wantsJson(req)) return next(err);

    return res.status(err.status || 500).render('pages/auth/login', {
      title: 'Đăng nhập',
      layout: false,
      error: err.message,
      fieldErrors: err.details || {},
      form: { phone },
      demoAccounts: config.wifi.demoMode ? DEMO_ACCOUNTS : [],
    });
  }
});

/* ------------------------------------------------------------------ */
/* Đăng xuất                                                           */
/* ------------------------------------------------------------------ */

router.post('/dang-xuat', (req, res) => {
  const done = () => {
    res.clearCookie('nj.sid');
    return res.redirect('/dang-nhap');
  };
  if (req.session) {
    return req.session.destroy(() => done());
  }
  return done();
});

router.get('/dang-xuat', (req, res) => {
  if (req.session) {
    return req.session.destroy(() => {
      res.clearCookie('nj.sid');
      res.redirect('/dang-nhap');
    });
  }
  return res.redirect('/dang-nhap');
});

/* ------------------------------------------------------------------ */
/* Đổi mật khẩu (UC15) — Chủ quán KHÔNG có chức năng này               */
/* ------------------------------------------------------------------ */

router.get('/doi-mat-khau', requireLogin, (req, res) => {
  if (req.session.user.role === ROLES.OWNER) {
    return res.status(403).render('pages/errors/error', {
      title: 'Không có quyền truy cập',
      statusCode: 403,
      message: 'Chủ quán không có chức năng đổi mật khẩu.',
      icon: 'lock',
    });
  }
  return res.render('pages/auth/change-password', {
    title: 'Đổi mật khẩu',
    fieldErrors: {},
    form: {},
  });
});

router.post('/doi-mat-khau', requireLogin, async (req, res, next) => {
  if (req.session.user.role === ROLES.OWNER) {
    return next(
      Object.assign(new Error('Chủ quán không có chức năng đổi mật khẩu.'), { status: 403 }),
    );
  }

  const form = {
    currentPassword: String(req.body?.currentPassword ?? ''),
    newPassword: String(req.body?.newPassword ?? ''),
    confirmPassword: String(req.body?.confirmPassword ?? ''),
  };

  try {
    const message = await authService.changePassword(req.session.user, form);
    req.flash('success', message);
    return res.redirect('/doi-mat-khau');
  } catch (err) {
    if (wantsJson(req)) return next(err);
    return res.status(err.status || 500).render('pages/auth/change-password', {
      title: 'Đổi mật khẩu',
      fieldErrors: err.details || {},
      form: {},
      error: err.details ? null : err.message,
    });
  }
});

/* ------------------------------------------------------------------ */

/** Tài khoản demo hiển thị trên màn đăng nhập khi bật DEMO_MODE. */
const DEMO_ACCOUNTS = [
  { role: 'Nhân viên', phone: '0914673802', name: 'Nguyễn Việt Đạt' },
  { role: 'Quản lý', phone: '0901234567', name: 'Nguyễn Minh Anh' },
  { role: 'Chủ quán', phone: '0909999999', name: 'Trần Chủ Quán' },
];

module.exports = router;
