'use strict';

/**
 * Route của Quản lý (và Chủ quán — kế thừa toàn bộ màn hình quản lý).
 *
 * Router này được gắn ở hai tiền tố khác nhau:
 *   /quan-ly  (vai trò Quản lý)
 *   /chu-quan (vai trò Chủ quán)
 * Mọi liên kết trong view dùng `basePath` để tự đổi tiền tố theo vai trò.
 */

const express = require('express');
const { requireLogin, requireManager } = require('../middleware/auth');
const scheduleService = require('../services/admin-schedule.service');
const approvalService = require('../services/approval.service');
const attendanceService = require('../services/attendance-admin.service');
const payrollService = require('../services/payroll-admin.service');

const router = express.Router();

router.use(requireLogin, requireManager);

/** Tiền tố hiện tại (/quan-ly hoặc /chu-quan) cho view dựng liên kết. */
router.use((req, res, next) => {
  res.locals.basePath = req.baseUrl || '';
  next();
});

/** Chuyển hướng về một đường dẫn trong tiền tố hiện tại. */
function redirectTo(req, res, path) {
  return res.redirect(`${req.baseUrl}${path}`);
}

router.get('/trang-chu', (req, res) => {
  res.render('pages/manager/home', {
    pageTitle: 'Trang chủ',
    activeMenu: 'home',
  });
});

/* ========================================================================== */
/* M3/M4 — Ca làm                                                              */
/* ========================================================================== */

router.get('/ca-lam/cap-nhat', async (req, res, next) => {
  try {
    const ctx = await scheduleService.getUpdateContext(req.query.tuan);
    return res.render('pages/manager/schedule-update', {
      pageTitle: 'Cập nhật ca làm',
      activeMenu: null,
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/ca-lam/cap-nhat/:maCa/:ngay', async (req, res, next) => {
  try {
    const ctx = await scheduleService.getShiftEditor(req.params.maCa, req.params.ngay);
    return res.render('pages/manager/schedule-edit', {
      pageTitle: 'Chỉnh sửa ca làm',
      activeMenu: null,
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/ca-lam/cap-nhat/:maCa/:ngay', async (req, res, next) => {
  const raw = req.body.maNV;
  const maNVs = Array.isArray(raw) ? raw : raw ? [raw] : [];

  try {
    const message = await scheduleService.saveShift(req.params.maCa, req.params.ngay, maNVs);
    req.flash('success', message);
    return redirectTo(req, res, '/ca-lam/cap-nhat');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/ca-lam/cap-nhat');
    }
    return next(err);
  }
});

router.get('/ca-lam/danh-sach', async (req, res, next) => {
  try {
    const ctx = await scheduleService.getListContext({
      mode: req.query.cheDo,
      date: req.query.ngay,
      weekStart: req.query.tuan,
      maCa: req.query.ca,
    });
    return res.render('pages/manager/schedule-list', {
      pageTitle: 'Xem danh sách ca làm',
      activeMenu: null,
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

/* ========================================================================== */
/* M5/M6/M7 — Duyệt đơn                                                        */
/* ========================================================================== */

/** Danh sách đơn xin nghỉ / đổi ca đang chờ duyệt. */
router.get('/duyet-don/xin-nghi-doi-ca', async (req, res, next) => {
  try {
    const rows = await approvalService.getPendingLeaveAndSwap();
    return res.render('pages/manager/approvals-leave', {
      pageTitle: 'Đơn xin nghỉ/ đổi ca',
      activeMenu: 'approve-leave',
      rows,
      isEmpty: rows.length === 0,
      emptyMessage: approvalService.MSG_NO_REQUESTS,
    });
  } catch (err) {
    return next(err);
  }
});

/** Chi tiết một đơn (xin nghỉ, đổi ca, làm thay, chấm công bổ sung). */
router.get('/duyet-don/xin-nghi-doi-ca/:id', async (req, res, next) => {
  try {
    const detail = await approvalService.getRequestDetail(req.params.id);
    return res.render('pages/manager/approval-detail', {
      pageTitle: 'Chi tiết đơn',
      activeMenu: detail.kind === 'cover' ? 'approve-cover' : 'approve-leave',
      detail,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/duyet-don/xin-nghi-doi-ca/:id/duyet', async (req, res, next) => {
  try {
    const id = String(req.params.id).trim();
    const isSwap = id.toUpperCase().startsWith('DC');
    const message = isSwap
      ? await approvalService.approveSwap(id, req.session.user.id)
      : await approvalService.approveLeave(id, req.session.user.id);
    req.flash('success', message);
    return redirectTo(req, res, '/duyet-don/xin-nghi-doi-ca');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/duyet-don/xin-nghi-doi-ca');
    }
    return next(err);
  }
});

router.post('/duyet-don/xin-nghi-doi-ca/:id/khong-duyet', async (req, res, next) => {
  try {
    const id = String(req.params.id).trim();
    const isSwap = id.toUpperCase().startsWith('DC');
    const message = isSwap
      ? await approvalService.rejectSwap(id, req.session.user.id)
      : await approvalService.rejectLeave(id, req.session.user.id);
    req.flash('error', message);
    return redirectTo(req, res, '/duyet-don/xin-nghi-doi-ca');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/duyet-don/xin-nghi-doi-ca');
    }
    return next(err);
  }
});

/** Danh sách đơn xin làm thay đang chờ duyệt. */
router.get('/duyet-don/lam-thay', async (req, res, next) => {
  try {
    const rows = await approvalService.getPendingCovers();
    return res.render('pages/manager/approvals-cover', {
      pageTitle: 'Đơn xin làm thay',
      activeMenu: 'approve-cover',
      rows,
      isEmpty: rows.length === 0,
      emptyMessage: approvalService.MSG_NO_REQUESTS,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/duyet-don/lam-thay/:id', async (req, res, next) => {
  try {
    const detail = await approvalService.getCoverDetail(String(req.params.id).trim());
    return res.render('pages/manager/approval-detail', {
      pageTitle: 'Chi tiết đơn xin làm thay',
      activeMenu: 'approve-cover',
      detail,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/duyet-don/lam-thay/:id/duyet', async (req, res, next) => {
  try {
    const message = await approvalService.approveCover(String(req.params.id).trim(), req.session.user.id);
    req.flash('success', message);
    return redirectTo(req, res, '/duyet-don/lam-thay');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/duyet-don/lam-thay');
    }
    return next(err);
  }
});

router.post('/duyet-don/lam-thay/:id/khong-duyet', async (req, res, next) => {
  try {
    const message = await approvalService.rejectCover(String(req.params.id).trim(), req.session.user.id);
    req.flash('error', message);
    return redirectTo(req, res, '/duyet-don/lam-thay');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/duyet-don/lam-thay');
    }
    return next(err);
  }
});

/** Danh sách yêu cầu chấm công bổ sung đang chờ duyệt. */
router.get('/cham-cong/duyet-bo-sung', async (req, res, next) => {
  try {
    const rows = await approvalService.getPendingSupplements();
    return res.render('pages/manager/approvals-supplement', {
      pageTitle: 'Duyệt chấm công bổ sung',
      activeMenu: 'approve-supplement',
      rows,
      isEmpty: rows.length === 0,
      emptyMessage: approvalService.MSG_NO_SUPPLEMENTS,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/cham-cong/duyet-bo-sung/:id', async (req, res, next) => {
  try {
    const detail = await approvalService.getSupplementDetail(String(req.params.id).trim());
    return res.render('pages/manager/approval-detail', {
      pageTitle: 'Chi tiết yêu cầu chấm công bổ sung',
      activeMenu: 'approve-supplement',
      detail,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/cham-cong/duyet-bo-sung/:id/duyet', async (req, res, next) => {
  try {
    const message = await approvalService.approveSupplement(
      String(req.params.id).trim(),
      req.session.user.id,
    );
    req.flash('success', message);
    return redirectTo(req, res, '/cham-cong/duyet-bo-sung');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/cham-cong/duyet-bo-sung');
    }
    return next(err);
  }
});

router.post('/cham-cong/duyet-bo-sung/:id/khong-duyet', async (req, res, next) => {
  try {
    const message = await approvalService.rejectSupplement(
      String(req.params.id).trim(),
      req.session.user.id,
    );
    req.flash('error', message);
    return redirectTo(req, res, '/cham-cong/duyet-bo-sung');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/cham-cong/duyet-bo-sung');
    }
    return next(err);
  }
});

/* ========================================================================== */
/* M8 — Dữ liệu chấm công                                                      */
/* ========================================================================== */

router.get('/cham-cong/du-lieu', async (req, res, next) => {
  try {
    const ctx = await attendanceService.getAttendanceData({
      mode: req.query.cheDo,
      date: req.query.ngay,
      weekStart: req.query.tuan,
      maNV: req.query.nhanVien,
      maCa: req.query.ca,
    });
    return res.render('pages/manager/attendance-data', {
      pageTitle: 'Dữ liệu chấm công',
      activeMenu: 'attendance-data',
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

/* ========================================================================== */
/* M9 — Bảng lương                                                             */
/* ========================================================================== */

router.get('/luong/bang-luong', async (req, res, next) => {
  try {
    const periods = await payrollService.getPeriods();
    return res.render('pages/manager/payroll-list', {
      pageTitle: 'Bảng lương',
      activeMenu: 'payroll-list',
      periods,
      isEmpty: periods.length === 0,
      emptyMessage: payrollService.MSG_NO_PERIOD,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/luong/bang-luong/:maBL', async (req, res, next) => {
  try {
    const ctx = await payrollService.getPayrollSummary(req.params.maBL);
    const periods = await payrollService.getPeriods();
    return res.render('pages/manager/payroll-detail', {
      pageTitle: 'Bảng lương',
      activeMenu: 'payroll-list',
      ...ctx,
      periods,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/luong/bang-luong/:maBL/:maNV', async (req, res, next) => {
  try {
    const ctx = await payrollService.getPayrollDetail(
      req.params.maBL,
      req.params.maNV,
      req.query.trang,
    );
    const periods = await payrollService.getPeriods();
    return res.render('pages/manager/payroll-detail', {
      pageTitle: 'Chi tiết bảng lương',
      activeMenu: 'payroll-list',
      ...ctx,
      periods,
    });
  } catch (err) {
    return next(err);
  }
});

/* ========================================================================== */
/* M10 — Duyệt bảng lương                                                      */
/* ========================================================================== */

router.get('/luong/duyet', async (req, res, next) => {
  try {
    const ctx = await payrollService.getApprovalPeriod();
    return res.render('pages/manager/payroll-approve', {
      pageTitle: 'Duyệt bảng lương',
      activeMenu: 'payroll-approve',
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/luong/duyet/:maBL/:maNV', async (req, res, next) => {
  try {
    const ctx = await payrollService.getApprovalDetail(
      req.params.maBL,
      req.params.maNV,
      req.query.trang,
    );
    return res.render('pages/manager/payroll-approve-detail', {
      pageTitle: 'Duyệt bảng lương',
      activeMenu: 'payroll-approve',
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/luong/duyet/:maBL/duyet', async (req, res, next) => {
  try {
    const message = await payrollService.approvePayroll(req.params.maBL);
    req.flash('success', message);
    return redirectTo(req, res, '/luong/duyet');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/luong/duyet');
    }
    return next(err);
  }
});

router.post('/luong/duyet/:maBL/khong-duyet', async (req, res, next) => {
  try {
    const message = await payrollService.rejectPayroll(req.params.maBL);
    req.flash('error', message);
    return redirectTo(req, res, '/luong/duyet');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return redirectTo(req, res, '/luong/duyet');
    }
    return next(err);
  }
});

/** Lưu tiền phạt của các dòng ca trong màn Duyệt bảng lương (một lần gửi). */
router.post('/luong/duyet/:maBL/:maNV', async (req, res, next) => {
  const backTo = `${req.baseUrl}/luong/duyet/${req.params.maBL}/${req.params.maNV}`;

  try {
    const message = await payrollService.updatePayrollLines(
      req.params.maBL,
      req.body.maPL,
      req.body,
    );
    req.flash('success', message);
    return res.redirect(backTo);
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return res.redirect(backTo);
    }
    return next(err);
  }
});

/* ========================================================================== */
/* M11 — Cập nhật bảng lương                                                   */
/* ========================================================================== */

router.get('/luong/cap-nhat', async (req, res, next) => {
  try {
    const ctx = await payrollService.getPayslipList(req.query.ky);
    return res.render('pages/manager/payslip-list', {
      pageTitle: 'Danh sách phiếu lương',
      activeMenu: 'payroll-update',
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/luong/cap-nhat/:maPL', async (req, res, next) => {
  try {
    const ctx = await payrollService.getPayslipDetail(req.params.maPL);
    return res.render('pages/manager/payslip-detail', {
      pageTitle: 'Chi tiết phiếu lương',
      activeMenu: 'payroll-update',
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/luong/cap-nhat/:maPL/doi-chieu/:maCTL', async (req, res, next) => {
  try {
    const ctx = await payrollService.getComparison(req.params.maPL, req.params.maCTL);
    return res.render('pages/manager/payslip-compare', {
      pageTitle: 'Đối chiếu chấm công và lịch làm',
      activeMenu: 'payroll-update',
      ...ctx,
    });
  } catch (err) {
    return next(err);
  }
});

/** "Không có sai sót": mở hộp thoại nhập lý do rồi gửi xác nhận. */
router.post('/luong/cap-nhat/:maPL/khong-co-sai-sot', async (req, res, next) => {
  try {
    const message = await payrollService.confirmNoError();
    req.flash('success', message);
    return res.redirect(`${req.baseUrl}/luong/cap-nhat/${req.params.maPL}`);
  } catch (err) {
    return next(err);
  }
});

router.get('/luong/cap-nhat/:maPL/chinh-sua/:maCTL', async (req, res, next) => {
  try {
    const ctx = await payrollService.getPayslipEditor(req.params.maPL, req.params.maCTL);
    return res.render('pages/manager/payslip-edit', {
      pageTitle: 'Chỉnh sửa phiếu lương',
      activeMenu: 'payroll-update',
      ...ctx,
      error: null,
      fieldErrors: {},
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/luong/cap-nhat/:maPL/chinh-sua/:maCTL', async (req, res, next) => {
  try {
    const message = await payrollService.savePayslipCorrection(
      req.params.maPL,
      req.params.maCTL,
      req.body,
    );
    req.flash('success', message);
    return res.redirect(`${req.baseUrl}/luong/cap-nhat/${req.params.maPL}`);
  } catch (err) {
    if (err.status === 400) {
      const ctx = await payrollService
        .getPayslipEditor(req.params.maPL, req.params.maCTL)
        .catch(() => null);
      if (!ctx) return next(err);
      return res.status(400).render('pages/manager/payslip-edit', {
        pageTitle: 'Chỉnh sửa phiếu lương',
        activeMenu: 'payroll-update',
        ...ctx,
        form: {
          gioVao: req.body.gioVao || '',
          gioRa: req.body.gioRa || '',
          phat: req.body.phat || '',
          ung: req.body.ung || '',
          lyDo: req.body.lyDo || '',
        },
        error: err.message,
        fieldErrors: err.details || {},
      });
    }
    return next(err);
  }
});

module.exports = router;
