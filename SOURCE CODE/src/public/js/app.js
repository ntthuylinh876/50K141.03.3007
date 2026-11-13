'use strict';

/**
 * Hành vi phía máy khách: menu, hiện/ẩn mật khẩu, đồng hồ, kiểm tra biểu mẫu.
 * Toàn bộ nằm trong file tĩnh để tuân thủ CSP (không dùng script nội tuyến).
 */

(function () {
  /* ------------------------------------------------------------------ */
  /* Menu trên điện thoại: mở/đóng ngăn kéo bằng nút hamburger          */
  /* ------------------------------------------------------------------ */
  var sidebar = document.getElementById('sidebar');
  var scrim = document.querySelector('.nav-scrim');
  var openBtn = document.querySelector('[data-nav-open]');

  function setNav(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', open);
    if (scrim) scrim.classList.toggle('is-visible', open);
    if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('nav-open', open);
  }

  if (openBtn) {
    openBtn.addEventListener('click', function () {
      setNav(!sidebar.classList.contains('is-open'));
    });
  }

  document.querySelectorAll('[data-nav-close]').forEach(function (el) {
    el.addEventListener('click', function () {
      setNav(false);
    });
  });

  // Chọn một mục menu thì đóng ngăn kéo để thấy nội dung mới.
  if (sidebar) {
    sidebar.querySelectorAll('a.nav-item').forEach(function (link) {
      link.addEventListener('click', function () {
        setNav(false);
      });
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setNav(false);
  });

  /* ------------------------------------------------------------------ */
  /* Menu con: mở/thu gọn                                               */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-nav-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      var sub = btn.nextElementSibling;
      if (sub && sub.classList.contains('nav-sub')) {
        sub.classList.toggle('is-open', !expanded);
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Hiện / ẩn mật khẩu                                                 */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var field = btn.closest('.password-field');
      var input = field && field.querySelector('input');
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      var use = btn.querySelector('use');
      if (use) use.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Công tắc demo tự gửi biểu mẫu                                      */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-auto-submit]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.form) input.form.submit();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Đồng hồ thời gian thực                                             */
  /* ------------------------------------------------------------------ */
  var clocks = document.querySelectorAll('[data-clock]');
  if (clocks.length) {
    var render = function () {
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      var text = hh + ':' + mm;
      clocks.forEach(function (el) {
        el.textContent = text;
      });
    };
    render();
    setInterval(render, 15000);
  }

  /* ------------------------------------------------------------------ */
  /* Hộp thoại thông báo: nhấn để đóng, Esc để đóng                     */
  /* ------------------------------------------------------------------ */
  function bindModal(overlay) {
    var card = overlay.querySelector('.modal-card') || overlay.querySelector('.modal');
    // Hộp thoại ẩn sẵn (mở bằng [data-open-modal]) chỉ cần ẩn lại, không xoá khỏi DOM.
    var startsHidden = overlay.hasAttribute('hidden');
    var close = function () {
      if (startsHidden) {
        overlay.setAttribute('hidden', '');
      } else {
        overlay.remove();
      }
    };

    // Chỉ đóng khi bấm ra vùng nền, không đóng khi bấm vào nội dung hộp thoại.
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    // Nút [data-modal-close] (ví dụ "Hủy" trong hộp thoại xác nhận xóa).
    overlay.querySelectorAll('[data-modal-close]').forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        close();
      });
    });

    if (card) {
      var firstField = card.querySelector('input:not([type="hidden"]), textarea, select');
      (firstField || card).focus();
    }
  }

  document.querySelectorAll('[data-modal]').forEach(bindModal);

  /* ------------------------------------------------------------------ */
  /* Thông báo dạng hộp thoại (dùng cho ô ca đã đủ nhân viên)            */
  /* ------------------------------------------------------------------ */
  function openModal(message) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('data-modal', '');
    overlay.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-live="assertive" tabindex="-1">' +
      '<div class="modal-card__icon"><svg aria-hidden="true"><use href="#i-alert"></use></svg></div>' +
      '<p class="modal-card__message"></p>' +
      '</div>';
    overlay.querySelector('.modal-card__message').textContent = message;
    document.body.appendChild(overlay);
    bindModal(overlay);
  }

  /* Ô ca đã đủ nhân viên: bấm vào hiện "Đã có đủ số lượng nhân viên cho ca này!" */
  document.querySelectorAll('[data-full-cell]').forEach(function (cell) {
    cell.addEventListener('click', function () {
      openModal(cell.getAttribute('data-full-message') || 'Đã có đủ số lượng nhân viên cho ca này!');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Kiểm tra dữ liệu phía máy khách (song song với kiểm tra phía server) */
  /* ------------------------------------------------------------------ */
  function showFieldError(input, message) {
    var host = input.closest('.password-field') || input;
    var next = host.nextElementSibling;
    if (next && next.classList.contains('form-error')) return;
    var p = document.createElement('p');
    p.className = 'form-error';
    p.textContent = message;
    host.insertAdjacentElement('afterend', p);
  }

  function clearFieldError(input) {
    var host = input.closest('.password-field') || input;
    var next = host.nextElementSibling;
    if (next && next.classList.contains('form-error')) next.remove();
    input.classList.remove('is-invalid');
  }

  function validateForm(form) {
    var ok = true;

    form.querySelectorAll('[data-required]').forEach(function (input) {
      clearFieldError(input);
      if (!String(input.value || '').trim()) {
        input.classList.add('is-invalid');
        showFieldError(input, input.getAttribute('data-required'));
        ok = false;
      }
    });

    form.querySelectorAll('[data-match]').forEach(function (input) {
      var other = document.querySelector(input.getAttribute('data-match'));
      if (!other) return;
      clearFieldError(input);
      if (String(input.value || '') !== String(other.value || '')) {
        input.classList.add('is-invalid');
        showFieldError(input, input.getAttribute('data-match-message') || 'Giá trị không khớp.');
        ok = false;
      }
    });

    return ok;
  }

  document.querySelectorAll('[data-validate-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!validateForm(form)) {
        event.preventDefault();
        var firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.focus();
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Chấm công bổ sung: điền "Giờ vào" theo ca làm đã chọn              */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-fill-start]').forEach(function (select) {
    var target = document.querySelector(select.getAttribute('data-fill-start'));
    if (!target) return;

    var sync = function () {
      var option = select.options[select.selectedIndex];
      target.value = (option && option.getAttribute('data-start')) || '';
    };

    select.addEventListener('change', sync);
    sync();
  });

  /* ------------------------------------------------------------------ */
  /* Ứng lương: hiển thị số tiền của mức ứng đang chọn                  */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('[data-advance-form]').forEach(function (form) {
    var output = form.querySelector('[data-advance-total]') || document.querySelector('[data-advance-total]');
    if (!output) return;

    var syncTotal = function () {
      var picked = form.querySelector('input[name="soTien"]:checked');
      if (!picked) {
        output.textContent = 'Chưa chọn';
        return;
      }
      var amount = Number(picked.value);
      output.textContent = Number.isFinite(amount)
        ? amount.toLocaleString('vi-VN') + ' VND'
        : picked.value;
    };

    form.querySelectorAll('input[name="soTien"]').forEach(function (input) {
      input.addEventListener('change', syncTotal);
    });
    syncTotal();
  });
})();
