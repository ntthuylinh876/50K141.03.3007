'use strict';

/**
 * Kiểm thử phần thuần của UC14 — Quản lý thông tin nhân viên.
 *
 * Chỉ kiểm tra biểu mẫu và cách tách tài khoản ngân hàng (không truy vấn CSDL).
 * Luồng thêm/sửa/xóa được kiểm tra bằng script tích hợp trên CSDL thật.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/employee-admin.service');

const VALID_BODY = {
  maNV: 'nv011',
  hoTen: 'Nguyễn Văn Mới',
  soDienThoai: '0901234567',
  viTri: 'Pha chế',
  ngayVaoLam: '2026-11-13',
  tinhTrang: 'Chính thức',
  mucLuong: '25.000',
  taiKhoanNganHang: 'VCB-1028882991',
};

test('biểu mẫu hợp lệ được chuẩn hóa đúng kiểu dữ liệu', () => {
  const data = service.parseEmployeeForm(VALID_BODY);
  assert.equal(data.maNV, 'NV011');
  assert.equal(data.mucLuong, 25000);
  assert.equal(data.tenNganHang, 'VCB');
  assert.equal(data.soTaiKhoan, '1028882991');
  assert.equal(data.ngayVaoLam, '2026-11-13');
});

test('mức lương chấp nhận dấu chấm và khoảng trắng', () => {
  assert.equal(service.parseEmployeeForm({ ...VALID_BODY, mucLuong: ' 23.000 ' }).mucLuong, 23000);
});

test('tách tài khoản ngân hàng theo gạch ngang hoặc khoảng trắng', () => {
  assert.deepEqual(service.parseBankAccount('VCB-1028882991'), {
    tenNganHang: 'VCB',
    soTaiKhoan: '1028882991',
  });
  assert.deepEqual(service.parseBankAccount('MB 1180352644'), {
    tenNganHang: 'MB',
    soTaiKhoan: '1180352644',
  });
  assert.equal(service.parseBankAccount('VCB'), null);
});

test('ghép nhãn ngân hàng để hiển thị một dòng', () => {
  assert.equal(service.bankLabel('VCB', '1028882991'), 'VCB-1028882991');
  assert.equal(service.bankLabel('', ''), '');
});

test('số điện thoại sai định dạng bị chặn kèm lỗi từng trường', () => {
  assert.throws(
    () => service.parseEmployeeForm({ ...VALID_BODY, soDienThoai: '12345' }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.details.soDienThoai);
      return true;
    },
  );
});

test('mã nhân viên sai dạng bị chặn', () => {
  assert.throws(
    () => service.parseEmployeeForm({ ...VALID_BODY, maNV: 'X01' }),
    (err) => err.status === 400 && Boolean(err.details.maNV),
  );
});

test('mức lương phải lớn hơn 0', () => {
  assert.throws(
    () => service.parseEmployeeForm({ ...VALID_BODY, mucLuong: '0' }),
    (err) => err.status === 400 && Boolean(err.details.mucLuong),
  );
});

test('ngày vào làm không tồn tại bị chặn (31/02)', () => {
  assert.throws(
    () => service.parseEmployeeForm({ ...VALID_BODY, ngayVaoLam: '2026-02-31' }),
    (err) => err.status === 400 && Boolean(err.details.ngayVaoLam),
  );
});

test('tình trạng chỉ nhận Thử việc hoặc Chính thức', () => {
  assert.throws(
    () => service.parseEmployeeForm({ ...VALID_BODY, tinhTrang: 'Đã nghỉ' }),
    (err) => err.status === 400 && Boolean(err.details.tinhTrang),
  );
});

test('thiếu trường bắt buộc trả về lỗi từng trường', () => {
  assert.throws(
    () => service.parseEmployeeForm({ ...VALID_BODY, hoTen: '   ' }),
    (err) => err.status === 400 && err.details.hoTen === service.MSG_REQUIRED,
  );
});

test('danh sách vị trí khớp ảnh UI', () => {
  assert.deepEqual(service.POSITIONS, ['Quản lý', 'Thu ngân', 'Pha chế', 'Phục vụ']);
});

test('thông báo trùng mã / trùng số điện thoại đúng đặc tả', () => {
  assert.equal(service.MSG_DUP_CODE, 'Đã có nhân viên trùng mã!');
  assert.equal(service.MSG_DUP_PHONE, 'Đã có nhân viên trùng số điện thoại!');
  assert.equal(service.MSG_EDIT_PHONE, 'Số điện thoại đã tồn tại');
});
