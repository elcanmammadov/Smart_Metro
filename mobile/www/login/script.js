(function () {
  'use strict';

  var phoneInput = document.getElementById('phone');
  var passInput  = document.getElementById('password');
  var loginBtn   = document.getElementById('loginBtn');
  var togglePass = document.getElementById('togglePass');
  var toast      = document.getElementById('toast');

  var wrapPhone  = document.getElementById('wrap-phone');
  var wrapPass   = document.getElementById('wrap-pass');

  // Artıq daxil olubsa ana səhifəyə yönləndir
  if (SmartMetroAuth.isLoggedIn()) {
    window.location.href = '../home/index.html';
    return;
  }

  // ── Köməkçilər ────────────────────────────────────────────
  function setError(wrap) { wrap.classList.add('has-error'); }
  function clearError(wrap) { wrap.classList.remove('has-error'); }

  function showToast(msg, duration) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, duration || 3000);
  }

  function setLoading(on) {
    loginBtn.disabled = on;
    loginBtn.classList.toggle('loading', on);
  }

  // ── Input dəyişiklikdə xətanı sil ────────────────────────
  phoneInput.addEventListener('input', function () { clearError(wrapPhone); });
  passInput.addEventListener('input',  function () { clearError(wrapPass); });

  // ── Şifrə göstər/gizlə ────────────────────────────────────
  togglePass.addEventListener('click', function () {
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
  });

  // ── Giriş ─────────────────────────────────────────────────
  loginBtn.addEventListener('click', function () {
    var phone    = phoneInput.value.trim();
    var password = passInput.value;
    var valid    = true;

    clearError(wrapPhone);
    clearError(wrapPass);

    if (!phone) { setError(wrapPhone); valid = false; }
    if (!password) { setError(wrapPass); valid = false; }

    if (!valid) {
      showToast('Zəhmət olmasa bütün xanaları doldurun.');
      return;
    }

    setLoading(true);

    SmartMetroAPI.login(phone, password)
      .then(function (res) {
        var body = res.data;

        if (body.success) {
          // Sessiyanı localStorage-a yaz
          SmartMetroAuth.setSession(body.data);

          showToast(body.message || 'Giriş uğurla tamamlandı!', 1500);

          setTimeout(function () {
            window.location.href = '../home/index.html';
          }, 1200);
        } else {
          setLoading(false);
          showToast(body.message || 'Giriş məlumatları yanlışdır.');
          setError(wrapPhone);
          setError(wrapPass);
        }
      })
      .catch(function (err) {
        setLoading(false);

        if (err.response && err.response.data && err.response.data.message) {
          showToast(err.response.data.message);
          setError(wrapPhone);
          setError(wrapPass);
        } else if (err.code === 'ECONNABORTED' || err.message === 'Network Error') {
          showToast('İnternet bağlantısını yoxlayın.');
        } else {
          showToast('Server ilə əlaqə qurulamadı. Yenidən cəhd edin.');
        }
      });
  });

})();
