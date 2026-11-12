'use strict';

/**
 * Route của Nhân viên.
 *
 * Giai đoạn 1: Trang chủ + Chấm công + Check out.
 * Giai đoạn 2: Chấm công bổ sung, Đăng ký ca làm, Đơn yêu cầu (nghỉ / đổi ca /
 *              làm thay), Xem lịch làm việc, Phiếu lương, Ứng lương.
 */

const express = require('express');
const attendanceService = require('../services/attendance.service');
const scheduleService = require('../services/schedule.service');
const requestService = require('../services/request.service');
const { requireLogin, requireEmployee } = require('../middleware/auth');
const dt = require('../utils/datetime');

const router = express.Router();

router.use(requireLogin, requireEmployee);

/** Render trang chủ nhân viên, có thể kèm trạng thái lỗi Wi-Fi. */
async function renderHome(req, res, extra = {}) {
  const ctx = await attendanceService.getTodayContext(req.session.user.id);
  return res.render('pages/employee/home', {
    pageTitle: 'Trang chủ',
    activeMenu: 'home',
    ...ctx,
    ...extra,
  });
}

/** Xử lý lỗi chung cho hai thao tác chấm công. */
function handleAttendanceError(err, req, res, next) {
  // Sai Wi-Fi: quay lại trang chủ kèm hộp thoại "Kết nối sai Wifi"
  // (đúng ảnh doc/UI/Chấm công/Chấm công 3.png), không rời khỏi màn hình.
  if (err.code === 'WIFI_DENIED') {
    req.flash('error', err.message);
    return res.redirect('/nhan-vien/trang-chu');
  }
  if (err.status === 400 || err.status === 409) {
    req.flash('error', err.message);
    return res.redirect('/nhan-vien/trang-chu');
  }
  return next(err);
}

/**
 * Hiển thị lại biểu mẫu kèm lỗi từng trường (không chuyển trang để giữ dữ liệu).
 * @param {import('express').Response} res
 * @param {string} view
 * @param {Object} data
 * @param {Error} err
 */
function renderFormError(res, view, data, err) {
  return res.status(err.status || 400).render(view, {
    ...data,
    error: err.message,
    fieldErrors: err.details || {},
  });
}

router.get('/trang-chu', async (req, res, next) => {
  try {
    return await renderHome(req, res);
  } catch (err) {
    return next(err);
  }
});

/** Chấm công (UC02). */
router.post('/cham-cong/vao', async (req, res, next) => {
  try {
    const message = await attendanceService.checkIn(req.session.user.id, req);
    req.flash('success', message);
    return res.redirect('/nhan-vien/trang-chu');
  } catch (err) {
    return handleAttendanceError(err, req, res, next);
  }
});

/** Check out (UC03). */
router.post('/cham-cong/ra', async (req, res, next) => {
  try {
    const message = await attendanceService.checkOut(req.session.user.id, req);
    req.flash('success', message);
    return res.redirect('/nhan-vien/trang-chu');
  } catch (err) {
    return handleAttendanceError(err, req, res, next);
  }
});

/* ========================================================================== */
/* UC04 — Chấm công bổ sung                                                    */
/* ========================================================================== */

/** Dữ liệu chung của màn hình Chấm công bổ sung. */
async function supplementData(req) {
  const maNV = req.session.user.id;
  const ctx = await requestService.getSupplementaryContext(maNV);
  return {
    pageTitle: 'Chấm công bổ sung',
    activeMenu: null,
    ...ctx,
  };
}

router.get('/cham-cong-bo-sung', async (req, res, next) => {
  try {
    const data = await supplementData(req);
    return res.render('pages/employee/supplement', {
      ...data,
      form: { maLich: req.query.ca || '', gioRa: '', lyDo: '' },
      fieldErrors: {},
      error: null,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/cham-cong-bo-sung', async (req, res, next) => {
  const data = await supplementData(req).catch(() => null);
  try {
    const message = await requestService.createSupplementary(req.session.user.id, req.body);
    req.flash('success', message);
    return res.redirect('/nhan-vien/cham-cong-bo-sung');
  } catch (err) {
    if (!data) return next(err);
    if (err.status === 400) {
      return renderFormError(res, 'pages/employee/supplement', data, err);
    }
    return next(err);
  }
});

/* ========================================================================== */
/* UC05 — Đăng ký ca làm                                                       */
/* ========================================================================== */

async function registerData(req) {
  const maNV = req.session.user.id;
  const ctx = await scheduleService.getRegisterContext(maNV);
  return {
    pageTitle: 'Đăng ký ca làm',
    activeMenu: null,
    ...ctx,
  };
}

router.get('/dang-ky-ca-lam', async (req, res, next) => {
  try {
    const data = await registerData(req);
    return res.render('pages/employee/register-shift', {
      ...data,
      error: null,
      selectedKeys: [],
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/dang-ky-ca-lam', async (req, res, next) => {
  const maNV = req.session.user.id;
  const raw = req.body.slots;
  const slots = Array.isArray(raw) ? raw : raw ? [raw] : [];

  try {
    const message = await scheduleService.saveRegistration(maNV, slots);
    req.flash('success', message);
    return res.redirect('/nhan-vien/dang-ky-ca-lam');
  } catch (err) {
    if (err.status === 400) {
      const data = await registerData(req).catch(() => null);
      if (!data) return next(err);
      return renderFormError(res, 'pages/employee/register-shift', {
        ...data,
        selectedKeys: slots,
      }, err);
    }
    return next(err);
  }
});

/* ========================================================================== */
/* UC06 — Đơn yêu cầu: xin nghỉ / đổi ca / làm thay                            */
/* ========================================================================== */

async function requestsData(req) {
  const maNV = req.session.user.id;
  const tab = ['leave', 'swap', 'cover'].includes(req.query.tab) ? req.query.tab : 'leave';
  const weekStart = req.query.tuan || dt.startOfWeekISO(dt.todayISO());

  const [upcoming, colleagues, emptyShifts, history, myWeek] = await Promise.all([
    scheduleService.getUpcomingShifts(maNV),
    requestService.getColleagues(maNV),
    requestService.getEmptyShifts(maNV),
    requestService.getMyRequests(maNV),
    scheduleService.getWeekSchedule(maNV, weekStart),
  ]);

  // Bước 2 của luồng đổi ca: chọn ca của mình → chọn đồng nghiệp → chọn ca của họ.
  const selectedShift = upcoming.find((s) => s.maLich === req.query.ca) || null;
  const keyword = String(req.query.tim || '').trim().toLowerCase();
  const filteredColleagues = keyword
    ? colleagues.filter((c) => c.hoTen.toLowerCase().includes(keyword))
    : colleagues;
  const selectedColleague = colleagues.find((c) => c.maNV === req.query.ban) || null;
  const colleagueWeek = selectedColleague
    ? await scheduleService.getWeekSchedule(selectedColleague.maNV, weekStart)
    : null;

  return {
    pageTitle: 'Đăng ký xin nghỉ/đổi ca',
    activeMenu: 'leave',
    tab,
    upcoming,
    colleagues: filteredColleagues,
    keyword: req.query.tim || '',
    emptyShifts,
    history,
    myWeek,
    weekStart,
    prevWeek: myWeek.prevWeek,
    nextWeek: myWeek.nextWeek,
    selectedShift,
    selectedColleague,
    colleagueWeek,
    form: { maLich: '', phuongThuc: 'ca', lyDo: '' },
    fieldErrors: {},
    error: null,
  };
}

router.get('/don-yeu-cau/xin-nghi-doi-ca', async (req, res, next) => {
  try {
    const data = await requestsData(req);
    return res.render('pages/employee/requests', data);
  } catch (err) {
    return next(err);
  }
});

router.post('/don-yeu-cau/xin-nghi', async (req, res, next) => {
  try {
    const message = await requestService.createLeave(req.session.user.id, req.body);
    req.flash('success', message);
    return res.redirect('/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=leave');
  } catch (err) {
    if (err.status === 400) {
      const data = await requestsData(req).catch(() => null);
      if (!data) return next(err);
      return renderFormError(res, 'pages/employee/requests', {
        ...data,
        tab: 'leave',
        form: {
          maLich: req.body.maLich || '',
          phuongThuc: req.body.phuongThuc || 'ca',
          lyDo: req.body.lyDo || '',
        },
      }, err);
    }
    return next(err);
  }
});

router.post('/don-yeu-cau/doi-ca', async (req, res, next) => {
  try {
    const message = await requestService.createSwap(req.session.user.id, req.body);
    req.flash('success', message);
    return res.redirect('/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=swap');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return res.redirect('/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=swap');
    }
    return next(err);
  }
});

router.post('/don-yeu-cau/lam-thay', async (req, res, next) => {
  try {
    const message = await requestService.createCover(req.session.user.id, req.body.maLich);
    req.flash('success', message);
    return res.redirect('/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=cover');
  } catch (err) {
    if (err.status === 400) {
      req.flash('error', err.message);
      return res.redirect('/nhan-vien/don-yeu-cau/xin-nghi-doi-ca?tab=cover');
    }
    return next(err);
  }
});

/* ========================================================================== */
/* UC07 — Xem lịch làm việc                                                    */
/* ========================================================================== */

router.get('/lich-lam-viec', async (req, res, next) => {
  try {
    const maNV = req.session.user.id;
    const week = req.query.tuan || dt.startOfWeekISO(dt.todayISO());
    const schedule = await scheduleService.getWeekSchedule(maNV, week);

    return res.render('pages/employee/schedule', {
      pageTitle: 'Xem lịch làm việc',
      activeMenu: null,
      ...schedule,
      emptyMessage: schedule.totalShifts === 0 ? scheduleService.MSG_NO_SHIFT_WEEK : null,
    });
  } catch (err) {
    return next(err);
  }
});

/* ========================================================================== */
/* UC09 — Ứng lương                                                            */
/* ========================================================================== */

router.get('/don-yeu-cau/ung-luong', async (req, res, next) => {
  try {
    const history = await requestService.getAdvanceHistory(req.session.user.id);
    return res.render('pages/employee/advance', {
      pageTitle: 'Ứng lương',
      activeMenu: 'advance',
      amounts: requestService.ADVANCE_AMOUNTS,
      history,
      selected: Number(req.query.muc) || 0,
      error: null,
      fieldErrors: {},
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/don-yeu-cau/ung-luong', async (req, res, next) => {
  try {
    const message = await requestService.createAdvance(req.session.user.id, req.body.soTien);
    req.flash('success', message);
    return res.redirect('/nhan-vien/don-yeu-cau/ung-luong');
  } catch (err) {
    if (err.status === 400) {
      const history = await requestService.getAdvanceHistory(req.session.user.id).catch(() => []);
      return renderFormError(res, 'pages/employee/advance', {
        pageTitle: 'Ứng lương',
        activeMenu: 'advance',
        amounts: requestService.ADVANCE_AMOUNTS,
        history,
        selected: Number(req.body.soTien) || 0,
      }, err);
    }
    return next(err);
  }
});

/* ========================================================================== */
/* UC08 — Kiểm tra phiếu lương                                                 */
/* ========================================================================== */

router.get('/phieu-luong', async (req, res, next) => {
  try {
    const ctx = await requestService.getPayslipContext(req.session.user.id, req.query.ky);
    return res.render('pages/employee/payslip', {
      pageTitle: 'Kiểm tra phiếu lương',
      activeMenu: 'payslip',
      ...ctx,
      showReport: req.query['bao-loi'] === '1',
      error: null,
      fieldErrors: {},
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/phieu-luong/xac-nhan', async (req, res, next) => {
  try {
    const message = await requestService.confirmPayslip(req.session.user.id, req.body.maBL);
    req.flash('success', message);
    return res.redirect(`/nhan-vien/phieu-luong?ky=${encodeURIComponent(req.body.maBL || '')}`);
  } catch (err) {
    if (err.status === 400) {
      req.flash('error', err.message);
      return res.redirect('/nhan-vien/phieu-luong');
    }
    return next(err);
  }
});

router.post('/phieu-luong/bao-loi', async (req, res, next) => {
  try {
    const message = await requestService.createPayslipFeedback(
      req.session.user.id,
      req.body.maBL,
      req.body.lyDo,
    );
    req.flash('success', message);
    return res.redirect(`/nhan-vien/phieu-luong?ky=${encodeURIComponent(req.body.maBL || '')}`);
  } catch (err) {
    if (err.status === 400) {
      const ctx = await requestService.getPayslipContext(req.session.user.id, req.body.maBL)
        .catch(() => null);
      if (!ctx) return next(err);
      return renderFormError(res, 'pages/employee/payslip', {
        pageTitle: 'Kiểm tra phiếu lương',
        activeMenu: 'payslip',
        ...ctx,
        showReport: true,
      }, err);
    }
    return next(err);
  }
});

module.exports = router;
