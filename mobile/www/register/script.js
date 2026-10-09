(function () {
  'use strict';

  // ── DOM refs ───────────────────────────────────────────────
  var nameInput  = document.getElementById('fullname');
  var phoneInput = document.getElementById('phone');
  var passInput  = document.getElementById('password');
  var termsCheck = document.getElementById('terms');
  var submitBtn  = document.getElementById('submit-btn');
  var togglePass = document.getElementById('toggle-pass');
  var phoneClear = document.getElementById('phone-clear');
  var eyeIcon    = document.getElementById('eye-icon');
  var toast      = document.getElementById('toast');

  var wrapName   = document.getElementById('wrap-name');
  var wrapPhone  = document.getElementById('wrap-phone');
  var wrapPass   = document.getElementById('wrap-pass');

  // ── SVG paths for eye icon ─────────────────────────────────
  var EYE_OPEN   = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>';
  var EYE_CLOSED = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="m2.45 2.45 19.1 19.1" stroke-linecap="round"/>';

  var pwVisible = false;

  // ── Yüklənirsə artıq daxil olub? ──────────────────────────
  if (SmartMetroAuth.isLoggedIn()) {
    window.location.href = '../home/index.html';
    return;
  }

  // ── Şifrə göstər/gizlə ────────────────────────────────────
  togglePass.addEventListener('click', function () {
    pwVisible = !pwVisible;
    passInput.type = pwVisible ? 'text' : 'password';
    eyeIcon.innerHTML = pwVisible ? EYE_CLOSED : EYE_OPEN;
    togglePass.setAttribute('aria-label', pwVisible ? 'Şifrəni gizlə' : 'Şifrəni göstər');
  });

  // ── Telefon sahəsi ─────────────────────────────────────────
  phoneInput.addEventListener('input', function () {
    phoneClear.style.display = phoneInput.value.length > 0 ? 'flex' : 'none';
    clearError(wrapPhone);
  });

  phoneClear.addEventListener('click', function () {
    phoneInput.value = '';
    phoneClear.style.display = 'none';
    phoneInput.focus();
    clearError(wrapPhone);
  });

  nameInput.addEventListener('input', function () { clearError(wrapName); });
  passInput.addEventListener('input', function () { clearError(wrapPass); });

  // ── Köməkçilər ────────────────────────────────────────────
  function setError(wrap) { wrap.classList.add('has-error'); }
  function clearError(wrap) { wrap.classList.remove('has-error'); }

  function showToast(msg, duration) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, duration || 3000);
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle('loading', on);
  }

  function isValidPhone(val) {
    return val.replace(/\D/g, '').length >= 7;
  }

  // ── Qeydiyyat ──────────────────────────────────────────────
  submitBtn.addEventListener('click', function () {
    var name     = nameInput.value.trim();
    var phone    = phoneInput.value.trim();
    var password = passInput.value;
    var terms    = termsCheck.checked;
    var valid    = true;

    clearError(wrapName);
    clearError(wrapPhone);
    clearError(wrapPass);

    if (!name) { setError(wrapName); valid = false; }
    if (!phone || !isValidPhone(phone)) { setError(wrapPhone); valid = false; }
    if (!password || password.length < 6) { setError(wrapPass); valid = false; }

    if (!valid) {
      showToast('Zəhmət olmasa bütün xanaları düzgün doldurun.');
      return;
    }

    if (!terms) {
      showToast('Zəhmət olmasa istifadə şərtlərini qəbul edin.');
      return;
    }

    setLoading(true);

    SmartMetroAPI.register(name, phone, password, terms)
      .then(function (res) {
        var body = res.data;

        if (body.success) {
          // Sessiyanı localStorage-a yaz
          SmartMetroAuth.setSession(body.data);

          showToast(body.message || 'Qeydiyyat uğurla tamamlandı!', 2000);

          setTimeout(function () {
            window.location.href = '../home/index.html';
          }, 1800);
        } else {
          setLoading(false);
          showToast(body.message || 'Xəta baş verdi. Yenidən cəhd edin.');
        }
      })
      .catch(function (err) {
        setLoading(false);

        if (err.response && err.response.data && err.response.data.message) {
          showToast(err.response.data.message);
        } else if (err.code === 'ECONNABORTED' || err.message === 'Network Error') {
          showToast('İnternet bağlantısını yoxlayın.');
        } else {
          showToast('Server ilə əlaqə qurulamadı. Yenidən cəhd edin.');
        }
      });
  });

  // ── Sosial düymələr ────────────────────────────────────────
  var googleBtn = document.getElementById('google-btn');
  var appleBtn  = document.getElementById('apple-btn');

  if (googleBtn) {
    googleBtn.addEventListener('click', function () {
      showToast('Google ilə giriş tezliklə əlavə ediləcək.');
    });
  }

  if (appleBtn) {
    appleBtn.addEventListener('click', function () {
      showToast('Apple ilə giriş tezliklə əlavə ediləcək.');
    });
  }

})();
