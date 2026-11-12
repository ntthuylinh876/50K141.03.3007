'use strict';

/**
 * Dữ liệu dùng chung cho mọi view: ngày hiện tại, hàm định dạng, trạng thái Wi-Fi.
 */

const config = require('../config/env');
const dt = require('../utils/datetime');
const fmt = require('../utils/format');
const { isOnCafeWifi } = require('./wifi');
const { buildMenu } = require('../config/menu');

const APP_NAME = 'NICK & THE JUICE';
const SHOP_ADDRESS = '311 Hồ Nghinh, Sơn Trà, Đà Nẵng';

function viewLocals(req, res, next) {
  const today = dt.todayISO();

  res.locals.appName = APP_NAME;
  res.locals.shopAddress = SHOP_ADDRESS;
  res.locals.today = today;
  res.locals.todayLong = dt.formatDateLongVN(today);
  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.demoMode = config.wifi.demoMode;
  res.locals.onCafeWifi = isOnCafeWifi(req);

  // Menu điều hướng theo vai trò
  const user = res.locals.currentUser;
  res.locals.menu = user ? buildMenu(user.role, req.path) : [];

  // Hàm định dạng dùng trong template
  res.locals.fmt = fmt;
  res.locals.dt = dt;

  // Mặc định để tránh lỗi "biến chưa định nghĩa" trong EJS
  res.locals.pageTitle = '';
  res.locals.pageSubtitle = '';
  res.locals.breadcrumb = [];
  res.locals.activeMenu = '';
  res.locals.bodyClass = '';
  res.locals.pageStyles = null;
  res.locals.pageScripts = [];
  res.locals.error = null;
  res.locals.fieldErrors = {};
  res.locals.form = {};
  res.locals.wifiDenied = false;

  next();
}

module.exports = { viewLocals, APP_NAME, SHOP_ADDRESS };
