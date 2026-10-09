(function () {
  "use strict";

  /* ══════════════════════════════════════
     Refs
  ══════════════════════════════════════ */
  var htmlEl      = document.documentElement;
  var themeBtn    = document.getElementById("themeBtn");
  var themeIcon   = document.getElementById("themeIcon");
  var backBtn     = document.getElementById("backBtn");
  var otpRow      = document.getElementById("otpRow");
  var otpInput    = document.getElementById("otpInput");
  var submitBtn   = document.getElementById("submitBtn");
  var resendBtn   = document.getElementById("resendBtn");
  var timerVal    = document.getElementById("timerVal");
  var timerSuffix = document.getElementById("timerSuffix");
  var formView    = document.getElementById("formView");
  var successView = document.getElementById("successView");
  var continueBtn = document.getElementById("continueBtn");
  var otpError    = document.getElementById("otpError");
  var boxes       = document.querySelectorAll(".otp-box");

  /* ══════════════════════════════════════
     localStorage helpers
  ══════════════════════════════════════ */
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  /* ══════════════════════════════════════
     DARK / LIGHT MODE
  ══════════════════════════════════════ */
  var MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  var SUN  = [
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

  var saved  = lsGet("metro-otp-theme");
  var isDark = (saved === "dark")  ? true
             : (saved === "light") ? false
             : (function(){
                 try{ return window.matchMedia("(prefers-color-scheme:dark)").matches; }
                 catch(e){ return false; }
               })();

  function applyTheme() {
    if (isDark){ htmlEl.setAttribute("data-dark",""); }
    else       { htmlEl.removeAttribute("data-dark"); }
    if (themeIcon) themeIcon.innerHTML = isDark ? SUN : MOON;
    if (themeBtn)  themeBtn.setAttribute("aria-label", isDark ? "İşıqlı moda keç" : "Qaranlıq moda keç");
  }
  applyTheme();

  if (themeBtn) {
    themeBtn.addEventListener("click", function(){
      isDark = !isDark;
      applyTheme();
      lsSet("metro-otp-theme", isDark ? "dark" : "light");
    });
  }

  /* ══════════════════════════════════════
     OTP STATE
  ══════════════════════════════════════ */
  var digits    = ["", "", "", ""];
  var focusIdx  = 0;
  var DEMO_CODE = "1234"; // for demo validation

  function getCode() { return digits.join(""); }

  function renderBoxes() {
    boxes.forEach(function(box, i){
      var val = digits[i];
      box.textContent = val;
      box.classList.toggle("filled", val !== "");
      box.classList.toggle("empty",  val === "");
      box.classList.remove("focus","error");
    });
    if (focusIdx >= 0 && focusIdx < 4) {
      boxes[focusIdx].classList.add("focus");
    }
    submitBtn.disabled = (getCode().length < 4);
  }

  /* Focus management */
  function focusBox(idx) {
    idx = Math.max(0, Math.min(3, idx));
    focusIdx = idx;
    renderBoxes();
    /* Show hidden input above the focused box */
    if (otpInput) {
      otpInput.focus({ preventScroll: true });
    }
  }

  /* Click on a box */
  boxes.forEach(function(box){
    box.addEventListener("click", function(){
      var idx = parseInt(box.getAttribute("data-idx"), 10);
      /* Jump to first empty if clicking beyond filled */
      var firstEmpty = digits.indexOf("");
      focusBox(firstEmpty === -1 ? 3 : Math.min(idx, firstEmpty));
    });
    box.addEventListener("keydown", function(e){
      if (e.key === "Enter" && !submitBtn.disabled) { submitBtn.click(); return; }
      handleKey(e);
    });
  });

  /* Hidden input — captures all keyboard input on mobile + desktop */
  if (otpInput) {
    otpInput.addEventListener("input", function(){
      hideError();
      var raw = otpInput.value.replace(/\D/g,"").slice(0,4);
      otpInput.value = "";

      /* Fill from current focusIdx */
      for (var i = 0; i < raw.length; i++) {
        var dest = focusIdx + i;
        if (dest < 4) digits[dest] = raw[i];
      }
      /* Advance focus */
      focusIdx = Math.min(focusIdx + raw.length, 3);
      if (digits[focusIdx] !== "") {
        /* Find next empty */
        var ne = digits.indexOf("", focusIdx);
        if (ne !== -1) focusIdx = ne;
      }
      renderBoxes();
    });

    otpInput.addEventListener("keydown", handleKey);
  }

  function handleKey(e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      /* Remove current digit or go back */
      if (digits[focusIdx] !== "") {
        digits[focusIdx] = "";
      } else if (focusIdx > 0) {
        focusIdx--;
        digits[focusIdx] = "";
      }
      renderBoxes();
    } else if (e.key === "ArrowLeft" && focusIdx > 0) {
      e.preventDefault(); focusIdx--; renderBoxes();
    } else if (e.key === "ArrowRight" && focusIdx < 3) {
      e.preventDefault(); focusIdx++; renderBoxes();
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      digits[focusIdx] = e.key;
      if (focusIdx < 3) focusIdx++;
      renderBoxes();
    }
  }

  /* Tap outside but inside otpRow still focuses */
  otpRow.addEventListener("click", function(){
    if (otpInput) otpInput.focus({ preventScroll: true });
  });

  /* Initial render */
  renderBoxes();

  /* Auto-focus first box */
  setTimeout(function(){
    focusBox(0);
    if (otpInput) otpInput.focus({ preventScroll: true });
  }, 300);

  /* Paste support */
  document.addEventListener("paste", function(e){
    var pasted = (e.clipboardData || window.clipboardData)
                   .getData("text").replace(/\D/g,"").slice(0,4);
    if (!pasted) return;
    e.preventDefault();
    for (var i = 0; i < 4; i++) digits[i] = pasted[i] || "";
    focusIdx = Math.min(pasted.length, 3);
    renderBoxes();
  });

  /* ══════════════════════════════════════
     SHAKE + ERROR MESSAGE
  ══════════════════════════════════════ */
  function shakeBoxes() {
    boxes.forEach(function(box){
      box.classList.add("error");
      setTimeout(function(){ box.classList.remove("error"); }, 500);
    });
  }

  function showError(msg) {
    if (!otpError) return;
    otpError.textContent = msg;
    otpError.classList.add("show");
  }

  function hideError() {
    if (!otpError) return;
    otpError.classList.remove("show");
  }

  /* ══════════════════════════════════════
     SUBMIT
  ══════════════════════════════════════ */
  submitBtn.addEventListener("click", function(){
    if (submitBtn.disabled) return;
    var code  = getCode();
    var phone = lsGet("metro_reset_phone");

    if (!phone) {
      window.location.href = "../forgot-password/index.html";
      return;
    }

    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    SmartMetroAPI.verifyOtp(phone, code)
      .then(function(res){
        submitBtn.classList.remove("loading");
        var body = res.data;

        if (body.success) {
          hideError();
          /* Reset token-i növbəti səhifə üçün saxla */
          var exp = new Date();
          exp.setMinutes(exp.getMinutes() + (body.data.expires_in_minutes || 15));
          lsSet("metro_reset_token",         body.data.token);
          lsSet("metro_reset_token_type",    body.data.token_type);
          lsSet("metro_reset_token_expires", exp.toISOString());

          showSuccess();
        } else {
          submitBtn.disabled = false;
          shakeBoxes();
          showError(body.message || "OTP kodu yanlışdır.");
          digits   = ["","","",""];
          focusIdx = 0;
          renderBoxes();
          if (otpInput) otpInput.focus({ preventScroll: true });
        }
      })
      .catch(function(err){
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;
        shakeBoxes();
        var msg = (err.response && err.response.data && err.response.data.message)
          ? err.response.data.message
          : "Server ilə əlaqə qurulamadı.";
        showError(msg);
        digits   = ["","","",""];
        focusIdx = 0;
        renderBoxes();
        if (otpInput) otpInput.focus({ preventScroll: true });
      });
  });

  /* ══════════════════════════════════════
     SUCCESS
  ══════════════════════════════════════ */
  function showSuccess() {
    formView.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    formView.style.opacity    = "0";
    formView.style.transform  = "translateY(-12px)";
    setTimeout(function(){
      formView.style.display = "none";
      successView.classList.add("show");
    }, 260);
  }

  if (continueBtn) {
    continueBtn.addEventListener("click", function(){
      window.location.href = "../new-password/index.html";
    });
  }

  /* ══════════════════════════════════════
     COUNTDOWN TIMER — 30 seconds
  ══════════════════════════════════════ */
  var countdown     = 30;
  var countdownInt  = null;

  function startTimer(secs) {
    clearInterval(countdownInt);
    countdown = secs;
    updateTimer();
    resendBtn.classList.remove("active");

    countdownInt = setInterval(function(){
      countdown--;
      updateTimer();
      if (countdown <= 0) {
        clearInterval(countdownInt);
        /* Enable resend */
        if (timerVal)    timerVal.textContent  = "";
        if (timerSuffix) timerSuffix.textContent = "";
        resendBtn.classList.add("active");
      }
    }, 1000);
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function updateTimer() {
    var m = Math.floor(countdown / 60);
    var s = countdown % 60;
    if (timerVal)    timerVal.textContent  = pad(m) + ":" + pad(s);
    if (timerSuffix) timerSuffix.textContent = " sonra yenidən göndər";
  }

  startTimer(30);

  /* ══════════════════════════════════════
     RESEND
  ══════════════════════════════════════ */
  resendBtn.addEventListener("click", function(){
    if (!resendBtn.classList.contains("active")) return;
    var phone = lsGet("metro_reset_phone");
    if (!phone) { window.location.href = "../forgot-password/index.html"; return; }

    resendBtn.classList.remove("active");
    resendBtn.textContent = "Göndərilir…";

    SmartMetroAPI.forgotPassword(phone)
      .then(function(res){
        resendBtn.textContent = "kodu yenidən göndər";
        if (res.data && res.data.data && res.data.data.expires_in_minutes) {
          var exp = new Date();
          exp.setMinutes(exp.getMinutes() + res.data.data.expires_in_minutes);
          lsSet("metro_reset_expires", exp.toISOString());
        }
        startTimer(30);
        digits   = ["","","",""];
        focusIdx = 0;
        renderBoxes();
        if (otpInput) otpInput.focus({ preventScroll: true });
      })
      .catch(function(){
        resendBtn.textContent = "kodu yenidən göndər";
        resendBtn.classList.add("active");
      });
  });

  /* ══════════════════════════════════════
     BACK BUTTON
  ══════════════════════════════════════ */
  backBtn.addEventListener("click", function(){
    if (successView.classList.contains("show")) {
      successView.classList.remove("show");
      formView.style.display   = "";
      formView.style.opacity   = "";
      formView.style.transform = "";
      digits = ["","","",""];
      focusIdx = 0;
      renderBoxes();
      startTimer(30);
    } else if (window.history.length > 1) {
      window.history.back();
    }
  });

})();