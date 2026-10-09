(function () {
  "use strict";

  /* ══════════════════════════════════════
     Refs
  ══════════════════════════════════════ */
  var htmlEl = document.documentElement;
  var themeBtn = document.getElementById("themeBtn");
  var themeIcon = document.getElementById("themeIcon");
  var backBtn = document.getElementById("backBtn");
  var passInput = document.getElementById("passInput");
  var confirmInput = document.getElementById("confirmInput");
  var eyeBtn1 = document.getElementById("eyeBtn1");
  var eyeBtn2 = document.getElementById("eyeBtn2");
  var eyeIcon1 = document.getElementById("eyeIcon1");
  var eyeIcon2 = document.getElementById("eyeIcon2");
  var submitBtn = document.getElementById("submitBtn");
  var passHint = document.getElementById("passHint");
  var confirmHint = document.getElementById("confirmHint");
  var strengthWrap = document.getElementById("strengthWrap");
  var strengthFill = document.getElementById("strengthFill");
  var strengthLbl = document.getElementById("strengthLabel");
  var reqLen = document.getElementById("req-len");
  var reqLetter = document.getElementById("req-letter");
  var reqNum = document.getElementById("req-num");
  var formView = document.getElementById("formView");
  var successView = document.getElementById("successView");
  var loginBtn = document.getElementById("loginBtn");

  /* ══════════════════════════════════════
     localStorage helpers
  ══════════════════════════════════════ */
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }
  function lsRemove(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  }
  function saveResetNote(status, message, data) {
    var note = {
      status: status,
      message: message || "",
      phone: lsGet("metro_reset_phone") || "",
      user: data && data.user ? data.user : null,
      at: new Date().toISOString()
    };
    lsSet("metro_reset_last_note", JSON.stringify(note));
    appendResetLog(note);
  }

  function appendResetLog(note) {
    var logs = [];
    try {
      logs = JSON.parse(lsGet("metro_reset_logs") || "[]");
      if (!Array.isArray(logs)) logs = [];
    } catch (e) {
      logs = [];
    }
    logs.unshift(note);
    lsSet("metro_reset_logs", JSON.stringify(logs.slice(0, 10)));
  }

  function getQueryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  /* ══════════════════════════════════════
     DARK / LIGHT MODE
  ══════════════════════════════════════ */
  var MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  var SUN = [
    '<circle cx="12" cy="12" r="5"/>',
    '<line x1="12" y1="1"    x2="12" y2="3"/>',
    '<line x1="12" y1="21"   x2="12" y2="23"/>',
    '<line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>',
    '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>',
    '<line x1="1"  y1="12" x2="3"  y2="12"/>',
    '<line x1="21" y1="12" x2="23" y2="12"/>',
    '<line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>',
    '<line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>',
  ].join("");

  var saved = lsGet("metro-newpass-theme");
  var isDark =
    saved === "dark"
      ? true
      : saved === "light"
        ? false
        : (function () {
            try {
              return window.matchMedia("(prefers-color-scheme:dark)").matches;
            } catch (e) {
              return false;
            }
          })();

  function applyTheme() {
    if (isDark) {
      htmlEl.setAttribute("data-dark", "");
    } else {
      htmlEl.removeAttribute("data-dark");
    }
    if (themeIcon) themeIcon.innerHTML = isDark ? SUN : MOON;
    if (themeBtn)
      themeBtn.setAttribute(
        "aria-label",
        isDark ? "İşıqlı moda keç" : "Qaranlıq moda keç",
      );
  }
  applyTheme();

  themeBtn.addEventListener("click", function () {
    isDark = !isDark;
    applyTheme();
    lsSet("metro-newpass-theme", isDark ? "dark" : "light");
  });

  /* ══════════════════════════════════════
     EYE TOGGLE — show / hide password
  ══════════════════════════════════════ */
  var EYE_OPEN = [
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>',
    '<circle cx="12" cy="12" r="3"/>',
  ].join("");

  var EYE_OFF = [
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>',
    '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>',
    '<line x1="1" y1="1" x2="23" y2="23"/>',
  ].join("");

  function toggleEye(input, icon, btn) {
    var isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.innerHTML = isHidden ? EYE_OFF : EYE_OPEN;
    btn.setAttribute("aria-pressed", isHidden ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      isHidden ? "Şifrəni gizlət" : "Şifrəni göstər",
    );
  }

  eyeBtn1.addEventListener("click", function () {
    toggleEye(passInput, eyeIcon1, eyeBtn1);
  });
  eyeBtn2.addEventListener("click", function () {
    toggleEye(confirmInput, eyeIcon2, eyeBtn2);
  });

  /* ══════════════════════════════════════
     PASSWORD STRENGTH
  ══════════════════════════════════════ */
  var STRENGTHS = [
    { label: "Çox zəif", color: "#e52222", pct: "20%" },
    { label: "Zəif", color: "#f97316", pct: "40%" },
    { label: "Orta", color: "#f59e0b", pct: "60%" },
    { label: "Güclü", color: "#22c55e", pct: "80%" },
    { label: "Çox güclü", color: "#16a34a", pct: "100%" },
  ];

  function scorePassword(p) {
    var s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^a-zA-Z0-9]/.test(p)) s++;
    return Math.min(s, 4);
  }

  function updateStrength(val) {
    if (!val) {
      strengthWrap.classList.remove("show");
      return;
    }
    strengthWrap.classList.add("show");
    var score = scorePassword(val);
    var st = STRENGTHS[score];
    strengthFill.style.width = st.pct;
    strengthFill.style.background = st.color;
    strengthLbl.textContent = st.label;
    strengthLbl.style.color = st.color;
  }

  /* ══════════════════════════════════════
     REQUIREMENTS
  ══════════════════════════════════════ */
  function updateReqs(val) {
    reqLen.classList.toggle("met", val.length >= 8);
    reqLetter.classList.toggle("met", /[a-zA-Z]/.test(val));
    reqNum.classList.toggle("met", /\d/.test(val));
  }

  /* ══════════════════════════════════════
     VALIDATION
  ══════════════════════════════════════ */
  function isPassValid(p) {
    return p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p);
  }

  function updateState() {
    var p = passInput.value;
    var c = confirmInput.value;
    var ok = isPassValid(p) && p === c && c.length > 0;
    submitBtn.disabled = !ok;
  }

  /* ── Password input events ── */
  passInput.addEventListener("input", function () {
    var val = passInput.value;
    updateStrength(val);
    updateReqs(val);

    /* Clear error while typing */
    passHint.className = "field-hint";
    passInput.classList.remove("is-valid", "is-invalid");
    updateState();
  });

  passInput.addEventListener("blur", function () {
    var val = passInput.value;
    if (!val) return;
    if (!isPassValid(val)) {
      passHint.textContent = "Şifrə tələblərə uyğun deyil.";
      passHint.className = "field-hint show-error";
      passInput.classList.add("is-invalid");
      passInput.classList.remove("is-valid");
    } else {
      passHint.textContent = "Şifrə güclüdür ✓";
      passHint.className = "field-hint show-ok";
      passInput.classList.add("is-valid");
      passInput.classList.remove("is-invalid");
    }
    updateState();
  });

  /* ── Confirm input events ── */
  confirmInput.addEventListener("input", function () {
    confirmHint.className = "field-hint";
    confirmInput.classList.remove("is-valid", "is-invalid");
    updateState();
  });

  confirmInput.addEventListener("blur", function () {
    var p = passInput.value;
    var c = confirmInput.value;
    if (!c) return;
    if (p !== c) {
      confirmHint.textContent = "Şifrələr uyğun gəlmir.";
      confirmHint.className = "field-hint show-error";
      confirmInput.classList.add("is-invalid");
      confirmInput.classList.remove("is-valid");
    } else {
      confirmHint.textContent = "Şifrələr uyğundur ✓";
      confirmHint.className = "field-hint show-ok";
      confirmInput.classList.add("is-valid");
      confirmInput.classList.remove("is-invalid");
    }
    updateState();
  });

  /* Enter submits */
  [passInput, confirmInput].forEach(function (inp) {
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !submitBtn.disabled) submitBtn.click();
    });
  });

  /* ══════════════════════════════════════
     SUBMIT
  ══════════════════════════════════════ */
  submitBtn.addEventListener("click", function () {
    if (submitBtn.disabled) return;

    /* Final guard */
    var p = passInput.value;
    var c = confirmInput.value;
    var token = lsGet("metro_reset_token") || getQueryParam("token");

    if (!token) {
      showPasswordError("Reset token tapılmadı. Zəhmət olmasa prosesi yenidən başladın.");
      saveResetNote("error", "Reset token tapılmadı", null);
      return;
    }

    if (isResetTokenExpired()) {
      showPasswordError("Reset tokenin vaxtı bitib. Zəhmət olmasa yeni kod alın.");
      saveResetNote("error", "Reset tokenin vaxtı bitib", null);
      return;
    }

    if (!isPassValid(p) || p !== c) {
      updateState();
      return;
    }

    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    SmartMetroAPI.resetPassword(token, p, c)
      .then(function (res) {
        submitBtn.classList.remove("loading");
        var body = res.data || {};

        if (body.success) {
          saveResetNote("success", body.message, body.data);
          clearResetFlow();
          if (window.SmartMetroAuth) window.SmartMetroAuth.clear();
          showSuccess(body.message);
        } else {
          submitBtn.disabled = false;
          var msg = body.message || "Şifrə yenilənmədi. Yenidən cəhd edin.";
          showPasswordError(msg);
          saveResetNote("error", msg, body.data);
        }
      })
      .catch(function (err) {
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;

        var msg = "Server ilə əlaqə qurulamadı. Yenidən cəhd edin.";
        if (err.response && err.response.data && err.response.data.message) {
          msg = err.response.data.message;
        } else if (err.code === "ECONNABORTED" || err.message === "Network Error") {
          msg = "İnternet bağlantısını yoxlayın.";
        }

        showPasswordError(msg);
        saveResetNote("error", msg, null);
      });
  });

  function showPasswordError(msg) {
    passHint.textContent = msg;
    passHint.className = "field-hint show-error";
    passInput.classList.add("is-invalid");
    submitBtn.disabled = false;
  }

  function isResetTokenExpired() {
    var raw = lsGet("metro_reset_token_expires");
    if (!raw) return false;
    return new Date(raw) <= new Date();
  }

  function clearResetFlow() {
    [
      "metro_reset_token",
      "metro_reset_token_type",
      "metro_reset_token_expires",
      "metro_reset_expires",
      "metro_reset_phone"
    ].forEach(lsRemove);
  }

  /* ══════════════════════════════════════
     SUCCESS
  ══════════════════════════════════════ */
  function showSuccess(serverMsg) {
    formView.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    formView.style.opacity = "0";
    formView.style.transform = "translateY(-12px)";
    setTimeout(function () {
      formView.style.display = "none";
      var subEl = successView.querySelector(".success-sub");
      if (subEl && serverMsg) subEl.textContent = serverMsg;
      successView.classList.add("show");
    }, 260);
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", function () {
      loginBtn.textContent = "Yüklənir…";
      loginBtn.disabled = true;
      setTimeout(function () {
        window.location.href = "../login/index.html";
      }, 1500);
    });
  }

  /* ══════════════════════════════════════
     BACK BUTTON
  ══════════════════════════════════════ */
  backBtn.addEventListener("click", function () {
    if (successView && successView.classList.contains("show")) {
      successView.classList.remove("show");
      formView.style.cssText = "";
      passInput.value = "";
      confirmInput.value = "";
      updateStrength("");
      updateReqs("");
      [passHint, confirmHint].forEach(function (h) {
        h.className = "field-hint";
      });
      [passInput, confirmInput].forEach(function (i) {
        i.classList.remove("is-valid", "is-invalid");
      });
      updateState();
    } else if (window.history.length > 1) {
      window.history.back();
    }
  });
})();
