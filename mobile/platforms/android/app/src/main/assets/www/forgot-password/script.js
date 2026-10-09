(function () {
  "use strict";

  /* ══════════════════════════════════════
     Refs
  ══════════════════════════════════════ */
  var htmlEl = document.documentElement;
  var themeBtn = document.getElementById("themeBtn");
  var themeIcon = document.getElementById("themeIcon");
  var backBtn = document.getElementById("backBtn");
  var phoneInput = document.getElementById("phoneInput");
  var submitBtn = document.getElementById("submitBtn");
  var resendBtn = document.getElementById("resendBtn");
  var errorMsg = document.getElementById("errorMsg");
  var formView = document.getElementById("formView");
  var successView = document.getElementById("successView");

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

  var saved = lsGet("metro-forgot-theme");
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

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      isDark = !isDark;
      applyTheme();
      lsSet("metro-forgot-theme", isDark ? "dark" : "light");
    });
  }

  /* ══════════════════════════════════════
     PHONE INPUT — format & validate
  ══════════════════════════════════════ */
  var AZ_MOBILE = /^\+994\s?\(?\d{2}\)?\s?\d{3}\s?\d{2}\s?\d{2}$/;

  function cleanPhone(val) {
    /* Keep only digits and leading + */
    return val.replace(/[^\d+]/g, "");
  }

  function isValidPhone(val) {
    var clean = cleanPhone(val);
    /* Accept: +994XXXXXXXXX (12 total digits after +) or
       just 10 digits (local format) */
    return /^\+994\d{9}$/.test(clean) || /^\d{10}$/.test(clean);
  }

  function formatPhone(raw) {
    var digits = raw.replace(/\D/g, "");
    if (!digits) return "";

    /* Azerbaijan format: +994 XX XXX XX XX */
    if (digits.startsWith("994")) digits = digits.slice(3);
    if (digits.length === 0) return "+994";

    var p = "+994";
    if (digits.length > 0) p += " " + digits.slice(0, 2);
    if (digits.length > 2) p += " " + digits.slice(2, 5);
    if (digits.length > 5) p += " " + digits.slice(5, 7);
    if (digits.length > 7) p += " " + digits.slice(7, 9);
    return p;
  }

  function updateSubmitState() {
    var val = phoneInput.value.trim();
    var valid = isValidPhone(val);
    submitBtn.disabled = !valid;
    if (errorMsg.classList.contains("show") && valid) {
      errorMsg.classList.remove("show");
      phoneInput.style.borderColor = "";
    }
  }

  /* Auto-format on input */
  phoneInput.addEventListener("input", function () {
    var raw = phoneInput.value;
    var cursor = phoneInput.selectionStart;
    var beforeLen = raw.length;

    /* Only format when user types digits (not deleting) */
    if (raw && !raw.startsWith("+")) {
      var formatted = formatPhone(raw);
      phoneInput.value = formatted;
      /* Adjust cursor */
      var diff = formatted.length - beforeLen;
      phoneInput.setSelectionRange(cursor + diff, cursor + diff);
    }
    updateSubmitState();
  });

  /* Pre-fill +994 on focus if empty */
  phoneInput.addEventListener("focus", function () {
    if (!phoneInput.value) {
      phoneInput.value = "+994 ";
      phoneInput.setSelectionRange(
        phoneInput.value.length,
        phoneInput.value.length,
      );
    }
  });

  /* Validate on blur */
  phoneInput.addEventListener("blur", function () {
    var val = phoneInput.value.trim();
    if (val && val !== "+994" && val !== "+994 " && !isValidPhone(val)) {
      errorMsg.classList.add("show");
      phoneInput.style.borderColor = "#e52222";
    } else {
      errorMsg.classList.remove("show");
      phoneInput.style.borderColor = "";
    }
  });

  /* Enter key submits */
  phoneInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !submitBtn.disabled) submitBtn.click();
  });

  /* ══════════════════════════════════════
     SUBMIT — loading → API → success
  ══════════════════════════════════════ */
  function showFormError(msg) {
    errorMsg.textContent = msg || "Xəta baş verdi. Yenidən cəhd edin.";
    errorMsg.classList.add("show");
    phoneInput.style.borderColor = "#e52222";
  }

  function hideFormError() {
    errorMsg.classList.remove("show");
    phoneInput.style.borderColor = "";
  }

  function showSuccessView(serverMsg) {
    if (!formView || !successView) return;
    formView.style.opacity = "0";
    formView.style.transform = "translateY(-12px)";
    formView.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    setTimeout(function () {
      formView.style.display = "none";
      var subEl = successView.querySelector(".success-sub");
      if (subEl && serverMsg) subEl.textContent = serverMsg;
      successView.classList.add("show");
      startCooldown();
    }, 260);
  }

  function doSubmit(btn, phone) {
    btn.classList.add("loading");
    btn.disabled = true;
    hideFormError();

    SmartMetroAPI.forgotPassword(phone)
      .then(function (res) {
        btn.classList.remove("loading");
        var body = res.data;

        if (body.success) {
          /* Növbəti səhifə üçün localStorage-a yaz */
          lsSet("metro_reset_phone", phone);
          if (body.data && body.data.expires_in_minutes) {
            var exp = new Date();
            exp.setMinutes(exp.getMinutes() + body.data.expires_in_minutes);
            lsSet("metro_reset_expires", exp.toISOString());
          }

          window.location.href = '../verification-code/index.html';
        } else {
          btn.disabled = false;
          showFormError(body.message);
        }
      })
      .catch(function (err) {
        btn.classList.remove("loading");
        btn.disabled = false;

        if (err.response && err.response.data && err.response.data.message) {
          showFormError(err.response.data.message);
        } else if (err.code === "ECONNABORTED" || err.message === "Network Error") {
          showFormError("İnternet bağlantısını yoxlayın.");
        } else {
          showFormError("Server ilə əlaqə qurulamadı. Yenidən cəhd edin.");
        }
      });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", function () {
      if (submitBtn.disabled) return;

      var val = phoneInput.value.trim();
      if (!isValidPhone(val)) {
        showFormError("Düzgün telefon nömrəsi daxil edin.");
        phoneInput.focus();
        return;
      }
      doSubmit(submitBtn, cleanPhone(val));
    });
  }

  /* ══════════════════════════════════════
     RESEND — cooldown 60s
  ══════════════════════════════════════ */
  var cooldown = 0;
  var cooldownTimer = null;

  function startCooldown() {
    cooldown = 60;
    resendBtn.disabled = true;
    updateResendLabel();
    cooldownTimer = setInterval(function () {
      cooldown--;
      updateResendLabel();
      if (cooldown <= 0) {
        clearInterval(cooldownTimer);
        resendBtn.disabled = false;
        resendBtn.querySelector(".btn-text").textContent = "Yenidən göndər";
      }
    }, 1000);
  }

  function updateResendLabel() {
    var txt = resendBtn.querySelector(".btn-text");
    if (txt) txt.textContent = "Yenidən göndər (" + cooldown + "s)";
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", function () {
      if (resendBtn.disabled) return;
      var phone = lsGet("metro_reset_phone") || phoneInput.value.trim();
      if (!phone) return;
      doSubmit(resendBtn, phone);
    });
  }

  /* ══════════════════════════════════════
     BACK BUTTON
  ══════════════════════════════════════ */
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      /* If on success view, go back to form */
      if (successView && successView.classList.contains("show")) {
        successView.classList.remove("show");
        if (formView) {
          formView.style.display = "";
          formView.style.opacity = "";
          formView.style.transform = "";
          phoneInput.value = "";
          updateSubmitState();
        }
        clearInterval(cooldownTimer);
        return;
      }
      if (window.history.length > 1) {
        window.history.back();
      }
    });
  }
})();
