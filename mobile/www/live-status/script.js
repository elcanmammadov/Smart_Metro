(function () {
  "use strict";

  var htmlEl = document.documentElement;
  var themeBtn = document.getElementById("themeBtn");
  var themeIcon = document.getElementById("themeIcon");
  var backBtn = document.getElementById("backBtn");
  var toastEl = document.getElementById("toast");
  var overlay = document.getElementById("overlay");
  var alertCard = document.getElementById("alertCard");
  var altRouteBtn = document.getElementById("altRouteBtn");
  var closeBtn = document.getElementById("closeBtn");
  var navItems = document.querySelectorAll(".nav-item");
  var topbarTitle = document.querySelector(".topbar-title");
  var arrivalBar = document.querySelector(".arrival-bar-text");
  var alertHeading = document.getElementById("alertHeading");
  var alertBody = document.getElementById("alertBody");
  var alertSub = document.querySelector(".alert-sub");

  /* ── localStorage ── */
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

  var DEFAULT_STATION_ID = 3;
  var LIVE_CACHE_KEY = "metro_live_tracking";
  var liveData = null;

  function selectedStationId() {
    var selected = Number(lsGet("metro_selected_station_id"));
    if (selected > 0) return selected;
    var last = Number(lsGet("metro_last_from"));
    if (last > 0) return last;
    return DEFAULT_STATION_ID;
  }

  function cacheLive(data) {
    try {
      lsSet(LIVE_CACHE_KEY, JSON.stringify({
        ts   : Date.now(),
        data : data
      }));
    } catch (e) {}
  }

  function readCachedLive() {
    try {
      var entry = JSON.parse(lsGet(LIVE_CACHE_KEY) || "null");
      return entry && entry.data ? entry.data : null;
    } catch (e) {
      return null;
    }
  }

  /* ── Theme ── */
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

  var saved = lsGet("metro-alert-theme");
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
      lsSet("metro-alert-theme", isDark ? "dark" : "light");
    });
  }

  /* ── Toast ── */
  var toastTimer = null;
  function showToast(msg, ms) {
    if (!toastEl) return;
    ms = ms || 2800;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, ms);
  }

  /* ── Overlay dismiss ── */
  function dismissOverlay(cb) {
    if (!overlay) return;
    overlay.style.transition = "opacity 0.28s ease";
    overlay.style.opacity = "0";
    if (alertCard) {
      alertCard.style.transition =
        "transform 0.28s var(--ease), opacity 0.28s ease";
      alertCard.style.transform = "translateY(20px) scale(0.97)";
      alertCard.style.opacity = "0";
    }
    setTimeout(function () {
      overlay.style.display = "none";
      if (cb) cb();
    }, 300);
  }

  /* Overlay background tap */
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        dismissOverlay(function () {
          showToast("Modal bağlandı.");
        });
      }
    });
  }

  /* Close button */
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      dismissOverlay(function () {
        showToast("Əsas ekrana qayıdıldı.");
      });
    });
  }

  /* Alternativ marşrut */
  if (altRouteBtn) {
    altRouteBtn.addEventListener("click", function () {
      altRouteBtn.style.transform = "scale(0.97)";
      setTimeout(function () {
        altRouteBtn.style.transform = "";
      }, 140);
      dismissOverlay(function () {
        showToast("Alternativ marşrut axtarılır…", 3000);
      });
    });
  }

  /* Back button */
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      if (overlay && overlay.style.display !== "none") {
        dismissOverlay();
      } else if (window.history.length > 1) {
        window.history.back();
      } else {
        showToast("Ana səhifəyə qayıdılır…");
      }
    });
  }

  /* Escape key */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay && overlay.style.display !== "none") {
      dismissOverlay();
    }
  });

  /* Bottom nav */
  navItems.forEach(function (item) {
    item.addEventListener("click", function () {
      var href = item.getAttribute("data-href");
      if (href) { window.location.href = href; return; }
      navItems.forEach(function (n) {
        n.classList.remove("active");
        n.removeAttribute("aria-current");
      });
      item.classList.add("active");
      item.setAttribute("aria-current", "page");
    });
  });

  /* ── Arrival bar countdown ── */
  var arrivalSecs = 2 * 60;

  function fmtArrival(s) {
    if (s <= 0) return "Qatar indi gəlir!";
    if (s < 60) return "Qatar " + s + " saniyəyə gəlir";
    return "Qatar " + Math.floor(s / 60) + " dəqiqəyə gəlir";
  }

  function tickArrival() {
    arrivalSecs--;
    if (arrivalBar) arrivalBar.textContent = fmtArrival(arrivalSecs);
    if (arrivalSecs <= 0) {
      arrivalSecs = 4 * 60 + Math.floor(Math.random() * 60);
    }
  }
  setInterval(tickArrival, 1000);

  /* ── Crowd countdown ── */
  var crowdSecs = 5 * 60;
  function fmtCrowd(s) {
    if (s <= 0) return "Sıxlıq<br/>artdı!";
    if (s < 60) return s + " saniyəyə<br/>sıxlıq artacaq";
    return Math.floor(s / 60) + " dəqiqəyə<br/>sıxlıq artacaq";
  }

  function tickCrowd() {
    crowdSecs--;
    if (alertBody) alertBody.innerHTML = fmtCrowd(crowdSecs);
    if (crowdSecs <= 0) clearInterval(crowdInterval);
  }
  var crowdInterval = setInterval(tickCrowd, 1000);

  function setCrowdCountdown(minutes) {
    crowdSecs = Math.max(0, Number(minutes || 0) * 60);
    if (alertBody) alertBody.innerHTML = fmtCrowd(crowdSecs);
    clearInterval(crowdInterval);
    crowdInterval = setInterval(tickCrowd, 1000);
  }

  function renderLive(data) {
    if (!data) return;
    liveData = data;
    var station = data.station || {};
    var train = data.train || {};
    var alert = data.crowd_alert || {};

    if (topbarTitle && station.name) topbarTitle.textContent = station.name;
    if (station.id) lsSet("metro_selected_station_id", String(station.id));

    if (train.next_train_min != null) {
      arrivalSecs = Math.max(0, Number(train.next_train_min) * 60);
      if (arrivalBar) arrivalBar.textContent = fmtArrival(arrivalSecs);
    }

    if (alert.show) {
      if (alertHeading) alertHeading.textContent = alert.title || "Diqqət!";
      if (alertSub) alertSub.textContent = alert.description || alert.message || "";
      setCrowdCountdown(alert.expected_in_minutes || 5);
      if (altRouteBtn && alert.primary_action && alert.primary_action.text) {
        altRouteBtn.textContent = alert.primary_action.text;
      }
      if (closeBtn && alert.secondary_action && alert.secondary_action.text) {
        closeBtn.textContent = alert.secondary_action.text;
      }
    } else if (overlay) {
      dismissOverlay();
    }

    cacheLive(data);
  }

  function liveErrorMessage(err) {
    if (err && err.code === "ECONNABORTED") return "Şəbəkə vaxtı bitdi.";
    if (!navigator.onLine) return "İnternet bağlantısı yoxdur.";
    if (err && err.response && err.response.data && err.response.data.message) return err.response.data.message;
    return "Canlı məlumatlar yüklənmədi.";
  }

  function loadLiveStatus() {
    var cached = readCachedLive();
    if (cached) renderLive(cached);

    if (!window.SmartMetroAPI || !window.SmartMetroAPI.getLiveTracking) {
      showToast("API kitabxanası yüklənmədi.");
      return;
    }

    window.SmartMetroAPI.getLiveTracking(selectedStationId())
      .then(function (res) {
        var body = res.data;
        if (body && body.success && body.data) {
          renderLive(body.data);
        } else {
          showToast((body && body.message) || "Canlı məlumat tapılmadı.", 3600);
        }
      })
      .catch(function (err) {
        showToast(liveErrorMessage(err), 3600);
      });
  }

  loadLiveStatus();
})();
