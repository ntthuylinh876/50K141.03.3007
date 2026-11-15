'use strict';

/**
 * UC14 — Chủ quán quản lý thông tin nhân viên:
 *  - O4 (7.2.3.48–51): Thêm nhân viên + tự sinh tài khoản đăng nhập
 *  - O5 (7.2.3.52–54): Sửa thông tin nhân viên
 *  - O6: Xóa nhân viên (xóa mềm — quyết định C5)
 *
 * Không đổi CSDL: mọi trường đều dùng cột có sẵn trong bảng NhanVien.
 * Số điện thoại là duy nhất trên toàn hệ thống (C12) nên phải kiểm tra chéo
 * cả NhanVien và QuanLy.
 */

const { query, sql } = require('../config/db');
const { hashPassword, generateTempPassword } = require('../utils/password');
const { badRequest, notFound } = require('../utils/http-error');
const { nextMaNV } = require('../utils/id');
const dt = require('../utils/datetime');
const fmt = require('../utils/format');

const MSG_REQUIRED = 'Vui lòng điền đầy đủ thông tin!';
const MSG_DUP_CODE = 'Đã có nhân viên trùng mã!';
const MSG_DUP_PHONE = 'Đã có nhân viên trùng số điện thoại!';
const MSG_EDIT_PHONE = 'Số điện thoại đã tồn tại';
const MSG_ADDED = 'Thêm nhân viên thành công';
const MSG_UPDATED = 'Đã cập nhật thông tin thành công!';
const MSG_DELETED = 'Xóa nhân viên thành công!';
const MSG_NO_EMPLOYEE = 'Không tìm thấy nhân viên.';
const MSG_ALREADY_RESIGNED = 'Nhân viên này đã ở trạng thái nghỉ việc.';

/** Vị trí làm việc theo ảnh UI (Thêm nhân viên 2 chọn "Phục vụ"). */
const POSITIONS = ['Quản lý', 'Thu ngân', 'Pha chế', 'Phục vụ'];

/** Tình trạng hợp lệ khi thêm/sửa (C8). "Đã nghỉ" chỉ do xóa mềm đặt. */
const STATUSES = ['Thử việc', 'Chính thức'];

const STATUS_RESIGNED = 'Đã nghỉ';

const PHONE_RE = /^0\d{9}$/;
const CODE_RE = /^NV\d{3,7}$/;

/** Chuỗi đã trim, chuyển undefined/null thành ''. */
function text(value) {
  return String(value ?? '').trim();
}

/**
 * Tách "VCB-1028882991" thành ngân hàng + số tài khoản.
 * Chấp nhận dấu gạch ngang hoặc khoảng trắng làm dấu phân cách.
 */
function parseBankAccount(value) {
  const raw = text(value);
  const match = raw.match(/^(.{1,50}?)(?:\s*[-–]\s*|\s+)([A-Za-z0-9]{4,20})$/);
  if (!match) return null;
  return { tenNganHang: match[1].trim(), soTaiKhoan: match[2] };
}

/** Ghép ngân hàng + số tài khoản để hiển thị trên một dòng. */
function bankLabel(tenNganHang, soTaiKhoan) {
  const bank = text(tenNganHang);
  const account = text(soTaiKhoan);
  if (!bank && !account) return '';
  return `${bank}-${account}`;
}

/**
 * Kiểm tra và chuẩn hóa dữ liệu biểu mẫu (dùng chung cho thêm và sửa).
 * Ném AppError(400) với lỗi từng trường để view hiển thị lại đúng ô.
 *
 * @param {Object} body
 * @param {{ requireCode?: boolean }} [options]
 * @returns {{ maNV: string, hoTen: string, soDienThoai: string, viTri: string,
 *   ngayVaoLam: string, tinhTrang: string, mucLuong: number,
 *   tenNganHang: string, soTaiKhoan: string }}
 */
function parseEmployeeForm(body, options = {}) {
  const requireCode = options.requireCode !== false;

  const raw = {
    maNV: text(body.maNV).toUpperCase(),
    hoTen: text(body.hoTen),
    soDienThoai: text(body.soDienThoai),
    viTri: text(body.viTri),
    ngayVaoLam: text(body.ngayVaoLam),
    tinhTrang: text(body.tinhTrang),
    mucLuong: text(body.mucLuong),
    taiKhoanNganHang: text(body.taiKhoanNganHang),
  };

  const requiredFields = [
    ['maNV', 'Mã nhân viên'],
    ['hoTen', 'Họ tên'],
    ['soDienThoai', 'Số điện thoại'],
    ['viTri', 'Vị trí'],
    ['ngayVaoLam', 'Ngày vào làm'],
    ['tinhTrang', 'Tình trạng'],
    ['mucLuong', 'Mức lương'],
    ['taiKhoanNganHang', 'Tài khoản ngân hàng nhận lương'],
  ];
  if (!requireCode) requiredFields.shift();

  const missing = {};
  for (const [key] of requiredFields) {
    if (!raw[key]) missing[key] = MSG_REQUIRED;
  }
  if (Object.keys(missing).length) {
    throw badRequest(MSG_REQUIRED, missing);
  }

  const fieldErrors = {};

  if (requireCode && !CODE_RE.test(raw.maNV)) {
    fieldErrors.maNV = 'Mã nhân viên có dạng NV001.';
  }
  if (raw.hoTen.length > 50) {
    fieldErrors.hoTen = 'Họ tên không được vượt quá 50 ký tự.';
  }
  if (!PHONE_RE.test(raw.soDienThoai)) {
    fieldErrors.soDienThoai = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.';
  }
  if (!POSITIONS.includes(raw.viTri)) {
    fieldErrors.viTri = 'Vui lòng chọn vị trí làm việc.';
  }
  {
    const [y, m, d] = raw.ngayVaoLam.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw.ngayVaoLam)
      && Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
      && parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
    if (!ok) fieldErrors.ngayVaoLam = 'Ngày vào làm không hợp lệ.';
  }
  if (!STATUSES.includes(raw.tinhTrang)) {
    fieldErrors.tinhTrang = 'Tình trạng chỉ nhận Thử việc hoặc Chính thức.';
  }

  // Mức lương là ĐƠN GIÁ GIỜ (quyết định C6). Cho phép nhập "25.000".
  const salaryDigits = raw.mucLuong.replace(/[.,\s]/g, '');
  const mucLuong = Number(salaryDigits);
  if (!Number.isInteger(mucLuong) || mucLuong <= 0) {
    fieldErrors.mucLuong = 'Mức lương phải là số nguyên lớn hơn 0.';
  }

  const bank = parseBankAccount(raw.taiKhoanNganHang);
  if (!bank) {
    fieldErrors.taiKhoanNganHang = 'Nhập theo dạng TENNGANHANG-SOTAIKHOAN, ví dụ VCB-1028882991.';
  }

  if (Object.keys(fieldErrors).length) {
    const first = Object.values(fieldErrors)[0];
    throw badRequest(first, fieldErrors);
  }

  return {
    maNV: raw.maNV,
    hoTen: raw.hoTen,
    soDienThoai: raw.soDienThoai,
    viTri: raw.viTri,
    ngayVaoLam: raw.ngayVaoLam,
    tinhTrang: raw.tinhTrang,
    mucLuong,
    tenNganHang: bank.tenNganHang,
    soTaiKhoan: bank.soTaiKhoan,
  };
}

/** Mã nhân viên đã tồn tại? */
async function codeExists(maNV) {
  const result = await query(
    'SELECT 1 AS found FROM NhanVien WHERE MaNV = @maNV',
    { maNV: { type: sql.Char(10), value: maNV } },
  );
  return result.recordset.length > 0;
}

/**
 * Số điện thoại đã dùng ở NhanVien hoặc QuanLy chưa (C12)?
 * @param {string} phone
 * @param {string} [exceptMaNV] bỏ qua chính nhân viên đang sửa
 */
async function phoneExists(phone, exceptMaNV = '') {
  const result = await query(
    `SELECT TOP 1 Nguon
       FROM (
         SELECT 'NV' AS Nguon FROM NhanVien
          WHERE RTRIM(SoDienThoai) = @phone AND MaNV <> @except
         UNION ALL
         SELECT 'QL' AS Nguon FROM QuanLy
          WHERE RTRIM(SoDienThoai) = @phone
       ) AS x`,
    {
      phone: { type: sql.VarChar(10), value: phone },
      except: { type: sql.Char(10), value: exceptMaNV },
    },
  );
  return result.recordset.length > 0;
}

/** Gợi ý mã nhân viên kế tiếp cho biểu mẫu Thêm. */
async function suggestNextCode() {
  return nextMaNV();
}

function mapEmployee(row) {
  const maNV = String(row.MaNV).trim();
  const ngayISO = dt.toISODate(row.NgayVaoLam);
  return {
    maNV,
    hoTen: row.HoTen,
    soDienThoai: String(row.SoDienThoai || '').trim(),
    viTri: row.ViTri,
    ngayVaoLam: ngayISO,
    ngayVaoLamLabel: dt.formatDateVN(ngayISO),
    tinhTrang: row.TinhTrang,
    isResigned: row.TinhTrang === STATUS_RESIGNED,
    mucLuong: Number(row.MucLuong),
    mucLuongLabel: fmt.formatHourlyRate(row.MucLuong),
    tenNganHang: text(row.TenNganHang),
    soTaiKhoan: text(row.SoTaiKhoan),
    nganHangLabel: bankLabel(row.TenNganHang, row.SoTaiKhoan),
  };
}

/**
 * Danh sách nhân viên đang làm việc (mặc định ẩn người đã nghỉ).
 * @param {{ includeResigned?: boolean }} [options]
 */
async function listEmployees(options = {}) {
  const includeResigned = options.includeResigned === true;
  const result = await query(
    `SELECT MaNV, HoTen, SoDienThoai, ViTri, NgayVaoLam, TinhTrang,
            MucLuong, TenNganHang, SoTaiKhoan
       FROM NhanVien
      ${includeResigned ? '' : "WHERE TinhTrang <> N'Đã nghỉ'"}
      ORDER BY MaNV`,
  );
  return result.recordset.map(mapEmployee);
}

/** Một nhân viên theo mã. */
async function getEmployee(maNV) {
  const result = await query(
    `SELECT MaNV, HoTen, SoDienThoai, ViTri, NgayVaoLam, TinhTrang,
            MucLuong, TenNganHang, SoTaiKhoan
       FROM NhanVien
      WHERE MaNV = @maNV`,
    { maNV: { type: sql.Char(10), value: text(maNV) } },
  );
  if (!result.recordset[0]) throw notFound(MSG_NO_EMPLOYEE);
  return mapEmployee(result.recordset[0]);
}

/**
 * Thêm nhân viên + tạo tài khoản (tên đăng nhập = SĐT, mật khẩu tự sinh).
 * @param {Object} body dữ liệu biểu mẫu
 * @returns {Promise<{ employee: Object, account: { phone: string, password: string } }>}
 */
async function addEmployee(body) {
  const data = parseEmployeeForm(body, { requireCode: true });

  if (await codeExists(data.maNV)) {
    throw badRequest(MSG_DUP_CODE, { maNV: MSG_DUP_CODE });
  }
  if (await phoneExists(data.soDienThoai)) {
    throw badRequest(MSG_DUP_PHONE, { soDienThoai: MSG_DUP_PHONE });
  }

  const plainPassword = generateTempPassword(8);
  const passwordHash = await hashPassword(plainPassword);

  await query(
    `INSERT INTO NhanVien
       (MaNV, HoTen, SoDienThoai, MatKhau, ViTri, NgayVaoLam,
        TinhTrang, MucLuong, TenNganHang, SoTaiKhoan)
     VALUES
       (@maNV, @hoTen, @soDienThoai, @matKhau, @viTri, @ngayVaoLam,
        @tinhTrang, @mucLuong, @tenNganHang, @soTaiKhoan)`,
    {
      maNV: { type: sql.Char(10), value: data.maNV },
      hoTen: { type: sql.NVarChar(50), value: data.hoTen },
      soDienThoai: { type: sql.Char(10), value: data.soDienThoai },
      matKhau: { type: sql.VarChar(100), value: passwordHash },
      viTri: { type: sql.NVarChar(30), value: data.viTri },
      ngayVaoLam: { type: sql.VarChar(10), value: data.ngayVaoLam },
      tinhTrang: { type: sql.NVarChar(20), value: data.tinhTrang },
      mucLuong: { type: sql.Decimal(18, 2), value: data.mucLuong },
      tenNganHang: { type: sql.NVarChar(50), value: data.tenNganHang },
      soTaiKhoan: { type: sql.VarChar(20), value: data.soTaiKhoan },
    },
  );

  return {
    employee: await getEmployee(data.maNV),
    account: { phone: data.soDienThoai, password: plainPassword },
  };
}

/**
 * Sửa thông tin nhân viên (không đổi mã, không đổi mật khẩu).
 * @param {string} maNV
 * @param {Object} body
 */
async function updateEmployee(maNV, body) {
  const code = text(maNV).toUpperCase();
  const current = await getEmployee(code);
  const data = parseEmployeeForm({ ...body, maNV: code }, { requireCode: false });

  if (data.soDienThoai !== current.soDienThoai
      && await phoneExists(data.soDienThoai, code)) {
    throw badRequest(MSG_EDIT_PHONE, { soDienThoai: MSG_EDIT_PHONE });
  }

  await query(
    `UPDATE NhanVien
        SET HoTen = @hoTen,
            SoDienThoai = @soDienThoai,
            ViTri = @viTri,
            NgayVaoLam = @ngayVaoLam,
            TinhTrang = @tinhTrang,
            MucLuong = @mucLuong,
            TenNganHang = @tenNganHang,
            SoTaiKhoan = @soTaiKhoan
      WHERE MaNV = @maNV`,
    {
      maNV: { type: sql.Char(10), value: code },
      hoTen: { type: sql.NVarChar(50), value: data.hoTen },
      soDienThoai: { type: sql.Char(10), value: data.soDienThoai },
      viTri: { type: sql.NVarChar(30), value: data.viTri },
      ngayVaoLam: { type: sql.VarChar(10), value: data.ngayVaoLam },
      tinhTrang: { type: sql.NVarChar(20), value: data.tinhTrang },
      mucLuong: { type: sql.Decimal(18, 2), value: data.mucLuong },
      tenNganHang: { type: sql.NVarChar(50), value: data.tenNganHang },
      soTaiKhoan: { type: sql.VarChar(20), value: data.soTaiKhoan },
    },
  );

  return { message: MSG_UPDATED, employee: await getEmployee(code) };
}

/**
 * Xóa mềm: TinhTrang = 'Đã nghỉ', giữ toàn bộ lịch sử lương (C5).
 * @param {string} maNV
 */
async function removeEmployee(maNV) {
  const code = text(maNV).toUpperCase();
  const employee = await getEmployee(code);
  if (employee.isResigned) throw badRequest(MSG_ALREADY_RESIGNED);

  await query(
    `UPDATE NhanVien SET TinhTrang = @resigned WHERE MaNV = @maNV`,
    {
      resigned: { type: sql.NVarChar(20), value: STATUS_RESIGNED },
      maNV: { type: sql.Char(10), value: code },
    },
  );

  return { message: MSG_DELETED, employee: { ...employee, tinhTrang: STATUS_RESIGNED } };
}

module.exports = {
  POSITIONS,
  STATUSES,
  STATUS_RESIGNED,
  MSG_REQUIRED,
  MSG_DUP_CODE,
  MSG_DUP_PHONE,
  MSG_EDIT_PHONE,
  MSG_ADDED,
  MSG_UPDATED,
  MSG_DELETED,
  MSG_NO_EMPLOYEE,
  parseEmployeeForm,
  parseBankAccount,
  bankLabel,
  codeExists,
  phoneExists,
  suggestNextCode,
  listEmployees,
  getEmployee,
  addEmployee,
  updateEmployee,
  removeEmployee,
};
