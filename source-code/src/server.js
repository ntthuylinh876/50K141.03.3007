'use strict';

/**
 * Điểm khởi động ứng dụng.
 *
 * Chạy:  npm start
 * Cổng mặc định: 3000 (đổi bằng biến PORT trong .env)
 */

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const { createSessionStore } = require('./config/session-store');
const { getPool, closePool } = require('./config/db');
const { loadCurrentUser } = require('./middleware/auth');
const { flashMiddleware } = require('./middleware/flash');
const { attachCsrfToken, verifyCsrfToken } = require('./middleware/csrf');
const { viewLocals } = require('./middleware/locals');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const { startPayrollJob, stopPayrollJob } = require('./jobs/payroll.job');
const routes = require('./routes');

const app = express();

/* ------------------------------------------------------------------ */
/* Cấu hình chung                                                      */
/* ------------------------------------------------------------------ */

// Số lớp reverse proxy thật đứng trước ứng dụng (0 = không có).
// Đặt đúng số lớp để Express lấy IP từ X-Forwarded-For một cách an toàn.
const isVercel = Boolean(process.env.VERCEL);
app.set('trust proxy', config.isProduction || isVercel ? 1 : config.wifi.trustProxy);
app.set('view engine', 'ejs');
app.set('views', config.paths.views);
app.set('x-powered-by', false);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

if (!config.isProduction) {
  app.use(morgan('dev'));
}

app.use(
  express.static(config.paths.public, {
    maxAge: config.isProduction ? '7d' : 0,
    etag: true,
  }),
);

app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));

app.use(session({
  name: 'nj.sid',
  secret: config.session.secret,
  store: createSessionStore(session),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction || isVercel,
    maxAge: config.session.maxAgeMs,
  },
}));

app.use(flashMiddleware);
app.use(attachCsrfToken);
app.use(verifyCsrfToken);
app.use(loadCurrentUser);
app.use(viewLocals);

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

app.get('/suc-khoe', async (req, res, next) => {
  try {
    await getPool().then((pool) => pool.query('SELECT 1'));
    return res.json({ ok: true, env: config.env, time: new Date().toISOString(), database: 'connected' });
  } catch (err) {
    return next(err);
  }
});

// Vercel invokes this route on a schedule; local deployments keep the existing
// in-process payroll timer below. Never run the job from an unauthenticated URL.
app.get('/api/cron/payroll', async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
    return res.sendStatus(secret ? 401 : 503);
  }
  try {
    const result = await require('./services/payroll.service').runMonthlyPayrollCheck();
    return res.json({ ok: true, created: Boolean(result.created), reason: result.reason || null });
  } catch (err) {
    return next(err);
  }
});

app.get('/', (req, res) => {
  if (!req.session?.user) return res.redirect('/dang-nhap');
  const { HOME_PATH } = require('./middleware/auth');
  return res.redirect(HOME_PATH[req.session.user.role] || '/dang-nhap');
});

app.use('/', routes);

/* ------------------------------------------------------------------ */
/* Lỗi                                                                 */
/* ------------------------------------------------------------------ */

app.use(notFoundHandler);
app.use(errorHandler);

/* ------------------------------------------------------------------ */
/* Khởi động                                                           */
/* ------------------------------------------------------------------ */

async function start() {
  try {
    const pool = await getPool();
    await pool.query('SELECT 1');
    console.log('[DB] Đã kết nối PostgreSQL.');
  } catch (err) {
    console.error('[DB] Không kết nối được PostgreSQL:', err.message);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log('');
    console.log('  ☕  NICK & THE JUICE COFFEE — Hệ thống chấm công và tính lương');
    console.log(`  ➜  http://localhost:${config.port}`);
    console.log(`  ➜  Môi trường: ${config.env}${config.wifi.demoMode ? ' (DEMO_MODE đang bật)' : ''}`);
    console.log('');
  });

  // UC13.1: sinh bảng lương cho tháng đã kết thúc (BR-UC13.1-01).
  if (!isVercel) startPayrollJob();

  const shutdown = async (signal) => {
    console.log(`\n[APP] Nhận ${signal}, đang đóng kết nối...`);
    stopPayrollJob();
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start();
}

module.exports = app;
