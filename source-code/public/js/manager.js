'use strict';

/**
 * Tương tác cho các màn hình Quản lý / Chủ quán (Giai đoạn 3).
 *  - Dòng bảng bấm được            [data-row-href]
 *  - Ô chọn kỳ lương chuyển trang   [data-goto-select]
 *  - Mở hộp thoại nhập lý do       [data-open-modal]
 *  - Chuyển nhân viên vào/ra ca    [data-staff-toggle]
 *  - Bật chế độ sửa tiền phạt      [data-penalty-toggle]
 */
(function () {
  /* ------------------------------------------------------------------ */
  /* Dòng bảng bấm được                                                  */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-row-href]').forEach(function (row) {
    var href = row.getAttribute('data-row-href');
    if (!href) return;

    if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '0');

    var go = function () {
      window.location.href = href;
    };

    row.addEventListener('click', function (event) {
      if (event.target.closest('a, button, input, select, textarea, label')) return;
      go();
    });

    row.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== row) return;
      event.preventDefault();
      go();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Ô chọn chuyển trang                                                 */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-goto-select]').forEach(function (select) {
    select.addEventListener('change', function () {
      if (select.value) window.location.href = select.value;
    });
  });

  /* ------------------------------------------------------------------ */
  /* Mở hộp thoại nhập lý do                                             */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
    var open = function () {
      var selector = btn.getAttribute('data-open-modal');
      var overlay = selector ? document.querySelector(selector) : null;
      if (!overlay) return;

      overlay.removeAttribute('hidden');

      var card = overlay.querySelector('.modal-card');
      var field = card && card.querySelector('input:not([type="hidden"]), textarea, select');
      (field || card || overlay).focus();
    };

    btn.addEventListener('click', open);

    // Dòng bảng cũng có thể mở hộp thoại: hỗ trợ bàn phím như một nút.
    if (btn.tagName !== 'BUTTON' && btn.tagName !== 'A') {
      btn.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open();
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Chuyển nhân viên vào / ra khỏi ca                                   */
  /* ------------------------------------------------------------------ */
  var staffIn = document.querySelector('[data-staff-list="in"]');
  var staffOut = document.querySelector('[data-staff-list="out"]');

  function refreshStaffEmpty(list) {
    if (!list) return;
    var empty = list.querySelector('.staff-empty');
    if (!empty) return;
    var count = list.querySelectorAll('.staff-row').length;
    empty.hidden = count > 0;
  }

  document.querySelectorAll('[data-staff-toggle]').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      var row = checkbox.closest('.staff-row');
      if (!row) return;

      var target = checkbox.checked ? staffIn : staffOut;
      if (!target) return;

      var pill = row.querySelector('[data-staff-pill]');
      var label = row.querySelector('[data-staff-label]');
      var use = pill && pill.querySelector('use');

      if (label) label.textContent = checkbox.checked ? 'Gỡ' : 'Thêm';
      if (use) use.setAttribute('href', checkbox.checked ? '#i-minus' : '#i-plus');

      var empty = target.querySelector('.staff-empty');
      if (empty) target.insertBefore(row, empty);
      else target.appendChild(row);

      refreshStaffEmpty(staffIn);
      refreshStaffEmpty(staffOut);
    });
  });

  refreshStaffEmpty(staffIn);
  refreshStaffEmpty(staffOut);

  /* ------------------------------------------------------------------ */
  /* Bộ chọn thời gian: Ngày / Tuần + lịch (Dữ liệu chấm công)           */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-time-picker]').forEach(function (picker) {
    var toggle = picker.querySelector('[data-time-toggle]');
    var panel = picker.querySelector('[data-time-panel]');
    var label = picker.querySelector('[data-time-label]');
    var modeInput = picker.querySelector('[data-time-mode-input]');
    var dayInput = picker.querySelector('[data-time-day-input]');
    var weekInput = picker.querySelector('[data-time-week-input]');
    var form = picker.closest('form');
    if (!toggle || !panel || !form) return;

    var setOpen = function (open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    var currentMode = function () {
      return modeInput && modeInput.value === 'tuan' ? 'tuan' : 'ngay';
    };

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(panel.hidden);
    });

    document.addEventListener('click', function (event) {
      if (!picker.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });

    picker.querySelectorAll('[data-time-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-time-mode');
        if (modeInput) modeInput.value = mode;

        picker.querySelectorAll('[data-time-mode]').forEach(function (other) {
          other.classList.toggle('is-active', other === btn);
        });
        picker.querySelectorAll('[data-time-body]').forEach(function (body) {
          body.hidden = body.getAttribute('data-time-body') !== mode;
        });

        if (label) {
          label.textContent = picker.getAttribute(
            mode === 'tuan' ? 'data-label-week' : 'data-label-day',
          );
        }
      });
    });

    picker.querySelectorAll('[data-time-day]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (dayInput) dayInput.value = btn.getAttribute('data-time-day');
        if (modeInput) modeInput.value = 'ngay';
        form.submit();
      });
    });

    picker.querySelectorAll('[data-time-week]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (weekInput) weekInput.value = btn.getAttribute('data-time-week');
        if (modeInput) modeInput.value = 'tuan';
        form.submit();
      });
    });

    picker.querySelectorAll('[data-time-month]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var month = btn.getAttribute('data-time-month');
        if (dayInput) dayInput.value = month + '-01';
        if (weekInput) weekInput.value = '';
        if (modeInput) modeInput.value = currentMode();
        form.submit();
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Sửa tiền phạt ở màn Duyệt bảng lương                                */
  /* ------------------------------------------------------------------ */
  function parseMoney(value) {
    var cleaned = String(value == null ? '' : value).replace(/[.,\s]/g, '');
    return Math.round(Number(cleaned) || 0);
  }

  function formatMoney(value) {
    var n = Math.round(Number(value) || 0);
    return n.toLocaleString('vi-VN');
  }

  document.querySelectorAll('[data-penalty-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.data-card');
      var form = card && card.querySelector('[data-penalty-form]');
      if (!form) return;

      var editing = !form.classList.contains('is-editing');
      form.classList.toggle('is-editing', editing);
      btn.setAttribute('aria-pressed', editing ? 'true' : 'false');
      btn.hidden = editing;

      var bar = form.querySelector('[data-penalty-bar]');
      if (bar) bar.hidden = !editing;

      form.querySelectorAll('[data-penalty-input]').forEach(function (input) {
        if (editing) {
          input.dataset.original = input.value;
        } else if (input.dataset.original !== undefined) {
          input.value = input.dataset.original;
          recalcLine(input);
        }
      });

      if (editing) {
        var first = form.querySelector('[data-penalty-input]');
        if (first) first.focus();
      }
    });
  });

  function recalcLine(input) {
    var row = input.closest('tr');
    var cell = row && row.querySelector('[data-line-total]');
    if (!cell) return;

    var base = Number(cell.getAttribute('data-base')) || 0;
    var phat = parseMoney(input.value);
    cell.textContent = formatMoney(base - phat);
  }

  document.querySelectorAll('[data-penalty-input]').forEach(function (input) {
    input.addEventListener('input', function () {
      recalcLine(input);
    });
  });
})();
