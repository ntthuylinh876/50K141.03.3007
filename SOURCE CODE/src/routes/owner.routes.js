'use strict';

/**
 * Route của Chủ quán.
 * Chủ quán kế thừa Quản lý (trừ Đổi mật khẩu) và thêm Quản lý thông tin nhân viên.
 */

const express = require('express');
const { requireLogin, requireOwner } = require('../middleware/auth');
const employeeService = require('../services/employee-admin.service');

const router = express.Router();

router.use(requireLogin, requireOwner);

/** Tiền tố hiện tại (/chu-quan) cho view dựng liên kết. */
router.use((req, res, next) => {
  res.locals.basePath = req.baseUrl || '';
  next();
});

router.get('/trang-chu', (req, res) => {
  res.render('pages/owner/home', {
    pageTitle: 'Trang chủ',
    activeMenu: 'home',
  });
});

/* ========================================================================== */
/* UC14.1 — Thêm nhân viên (O4)                                                */
/* ========================================================================== */

/** Dữ liệu mặc định cho biểu mẫu thêm. */
async function addFormData(overrides = {}) {
  return {
    pageTitle: 'Thêm nhân viên',
    activeMenu: 'employee-add',
    positions: employeeService.POSITIONS,
    statuses: employeeService.STATUSES,
    form: {
      maNV: await employeeService.suggestNextCode(),
      hoTen: '',
      soDienThoai: '',
      viTri: '',
      ngayVaoLam: '',
      tinhTrang: 'Chính thức',
      mucLuong: '',
      taiKhoanNganHang: '',
      ...overrides,
    },
    fieldErrors: {},
    error: null,
  };
}

router.get('/nhan-vien/them', async (req, res, next) => {
  try {
    return res.render('pages/owner/employee-add', await addFormData());
  } catch (err) {
    return next(err);
  }
});

router.post('/nhan-vien/them', async (req, res, next) => {
  try {
    const result = await employeeService.addEmployee(req.body);
    req.session.createdAccount = result.account;
    req.session.createdEmployee = result.employee;
    req.flash('success', employeeService.MSG_ADDED);
    return res.redirect('/chu-quan/nhan-vien/them/thanh-cong');
  } catch (err) {
    if (err.status === 400) {
      const data = await addFormData(req.body).catch(() => null);
      if (!data) return next(err);
      return res.status(err.status).render('pages/owner/employee-add', {
        ...data,
        error: err.message,
        fieldErrors: err.details || {},
      });
    }
    return next(err);
  }
});

router.get('/nhan-vien/them/thanh-cong', (req, res) => {
  const account = req.session.createdAccount;
  const employee = req.session.createdEmployee;
  if (!account) return res.redirect('/chu-quan/nhan-vien/them');

  delete req.session.createdAccount;
  delete req.session.createdEmployee;

  return res.render('pages/owner/employee-created', {
    pageTitle: 'Thêm nhân viên thành công',
    activeMenu: 'employee-add',
    account,
    employee,
  });
});

/* ========================================================================== */
/* UC14.2 — Sửa thông tin nhân viên (O5)                                       */
/* ========================================================================== */

router.get('/nhan-vien/sua', async (req, res, next) => {
  try {
    const employees = await employeeService.listEmployees();
    return res.render('pages/owner/employee-list', {
      pageTitle: 'Sửa thông tin nhân viên',
      activeMenu: 'employee-edit',
      mode: 'edit',
      employees,
      isEmpty: employees.length === 0,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/nhan-vien/sua/:maNV', async (req, res, next) => {
  try {
    const employee = await employeeService.getEmployee(req.params.maNV);
    return res.render('pages/owner/employee-edit', {
      pageTitle: 'Sửa thông tin nhân viên',
      activeMenu: 'employee-edit',
      positions: employeeService.POSITIONS,
      statuses: employeeService.STATUSES,
      employee,
      form: {
        maNV: employee.maNV,
        hoTen: employee.hoTen,
        soDienThoai: employee.soDienThoai,
        viTri: employee.viTri,
        ngayVaoLam: employee.ngayVaoLam,
        tinhTrang: employee.tinhTrang,
        mucLuong: employee.mucLuong,
        taiKhoanNganHang: employee.nganHangLabel,
      },
      fieldErrors: {},
      error: null,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/nhan-vien/sua/:maNV', async (req, res, next) => {
  try {
    await employeeService.updateEmployee(req.params.maNV, req.body);
    req.flash('success', employeeService.MSG_UPDATED);
    return res.redirect('/chu-quan/nhan-vien/sua');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      const employee = await employeeService.getEmployee(req.params.maNV).catch(() => null);
      if (!employee) return next(err);
      return res.status(err.status).render('pages/owner/employee-edit', {
        pageTitle: 'Sửa thông tin nhân viên',
        activeMenu: 'employee-edit',
        positions: employeeService.POSITIONS,
        statuses: employeeService.STATUSES,
        employee,
        form: {
          maNV: employee.maNV,
          hoTen: req.body.hoTen || '',
          soDienThoai: req.body.soDienThoai || '',
          viTri: req.body.viTri || '',
          ngayVaoLam: req.body.ngayVaoLam || '',
          tinhTrang: req.body.tinhTrang || '',
          mucLuong: req.body.mucLuong || '',
          taiKhoanNganHang: req.body.taiKhoanNganHang || '',
        },
        fieldErrors: err.details || {},
        error: err.message,
      });
    }
    return next(err);
  }
});

/* ========================================================================== */
/* UC14.3 — Xóa nhân viên (O6)                                                 */
/* ========================================================================== */

router.get('/nhan-vien/xoa', async (req, res, next) => {
  try {
    const employees = await employeeService.listEmployees();
    return res.render('pages/owner/employee-list', {
      pageTitle: 'Xóa nhân viên',
      activeMenu: 'employee-delete',
      mode: 'delete',
      employees,
      isEmpty: employees.length === 0,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/nhan-vien/xoa/:maNV', async (req, res, next) => {
  try {
    await employeeService.removeEmployee(req.params.maNV);
    req.flash('success', employeeService.MSG_DELETED);
    return res.redirect('/chu-quan/nhan-vien/xoa');
  } catch (err) {
    if (err.status === 400 || err.status === 404) {
      req.flash('error', err.message);
      return res.redirect('/chu-quan/nhan-vien/xoa');
    }
    return next(err);
  }
});

// Chủ quán kế thừa toàn bộ màn hình quản lý (ca làm, duyệt đơn, chấm công, lương).
router.use('/', require('./manager.routes'));

module.exports = router;
