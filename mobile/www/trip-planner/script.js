(function () {
  "use strict";

  /* ══════════════════════════════════════
     Element refs
  ══════════════════════════════════════ */
  var htmlEl      = document.documentElement;
  var themeBtn    = document.getElementById("themeBtn");
  var themeIcon   = document.getElementById("themeIcon");
  var backBtn     = document.getElementById("backBtn");
  var arrivalTime = document.getElementById("arrivalTime");
  var bestCard    = document.getElementById("bestCard");
  var toastEl     = document.getElementById("toast");
  var wagons      = document.querySelectorAll(".wagon");
  var wagonPeople = document.querySelectorAll(".wagon-people");
  var wagonEmpty  = document.querySelectorAll(".wagon-empty");
  var wagonPercent= document.querySelectorAll(".wagon-percent");
  var navItems    = document.querySelectorAll(".nav-item");
  var scrollArea  = document.getElementById("scrollArea");
  var topbar      = document.getElementById("topbar");
  var clockTime   = document.getElementById("clockTime");

  /* ══════════════════════════════════════
     localStorage helpers
  ══════════════════════════════════════ */
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  var GUIDANCE_SELECTION_KEY = "metro_guidance_selection";
  var GUIDANCE_LOGS_KEY      = "metro_guidance_logs";
  var DEFAULT_STATION_ID     = 3;
  var LIVE_CACHE_KEY         = "metro_live_tracking";
  var LIVE_REFRESH_MS        = 10 * 1000;
  var liveData               = null;
  var livePollTimer          = null;

  function addGuidanceLog(success, message, stationId, wagonNumber) {
    try {
      var logs = JSON.parse(lsGet(GUIDANCE_LOGS_KEY) || "[]");
      logs.unshift({
        time         : new Date().toISOString(),
        success      : success,
        message      : message,
        station_id   : Number(stationId),
        wagon_number : Number(wagonNumber),
        page         : "trip-planner"
      });
      if (logs.length > 30) logs.length = 30;
      lsSet(GUIDANCE_LOGS_KEY, JSON.stringify(logs));
    } catch (e) {}
  }

  function getSelectedStationId() {
    var selected = Number(lsGet("metro_selected_station_id"));
    if (selected > 0) return selected;
    var lastFrom = Number(lsGet("metro_last_from"));
    if (lastFrom > 0) return lastFrom;
    return DEFAULT_STATION_ID;
  }

  function getSelectedTrainNumber() {
    return lsGet("metro_train_number") || "T-001";
  }

  function getBestWagonNumber() {
    var recommended = document.getElementById("recWagon");
    if (recommended) {
      var idx = Number(recommended.getAttribute("data-index"));
      if (!isNaN(idx)) return idx + 1;
    }

    var bestName = bestCard ? bestCard.querySelector(".best-name") : null;
    var match = bestName && bestName.textContent.match(/\d+/);
    if (match) return Number(match[0]);

    return 1;
  }

  function saveGuidanceSelection(stationId, wagonNumber) {
    var selection = {
      station_id   : Number(stationId),
      wagon_number : Number(wagonNumber),
      selected_at  : new Date().toISOString(),
      source       : "trip-planner"
    };
    lsSet(GUIDANCE_SELECTION_KEY, JSON.stringify(selection));
    lsSet("metro_selected_wagon_id", String(wagonNumber));
    lsSet("metro_selected_station_id", String(stationId));
    addGuidanceLog(true, "Ən boş vaqon seçildi", stationId, wagonNumber);
  }

  function stationTitle(name) {
    return name || "28 May stansiyası";
  }

  function wagonClass(level) {
    if (level === "full") return "full";
    if (level === "empty") return "empty";
    return "moderate";
  }

  function statusText(level, fallback) {
    if (fallback) return fallback;
    if (level === "full") return "Dolu";
    if (level === "empty") return "Boş";
    return "Orta";
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

  function renderLiveTracking(data) {
    if (!data) return;
    liveData = data;

    var station = data.station || {};
    var train = data.train || {};
    var recommended = data.recommended_wagon || null;
    var topbarTitle = document.querySelector(".topbar-title");
    var arrivalSub = document.querySelector(".arrival-sub");
    var bestName = bestCard ? bestCard.querySelector(".best-name") : null;
    var bestTip = bestCard ? bestCard.querySelector(".best-tip") : null;

    if (topbarTitle) topbarTitle.textContent = stationTitle(station.name);
    if (arrivalTime && train.next_train_min != null) {
      secs = Math.max(0, Number(train.next_train_min) * 60);
      arrivalTime.textContent = fmt(secs);
    }
    if (arrivalSub && station.line_name) arrivalSub.textContent = station.line_name;

    var dataWagons = Array.isArray(data.wagons) ? data.wagons : [];
    var statsRows = Array.isArray(data.train_wagon_stats) ? data.train_wagon_stats : [];
    var statsByWagon = {};
    var recommendedNumber = recommended && recommended.wagon_number
      ? Number(recommended.wagon_number)
      : null;

    statsRows.forEach(function (item) {
      if (item && item.wagon_number) {
        statsByWagon[Number(item.wagon_number)] = item;
      }
    });

    wagons.forEach(function (w, i) {
      var row = dataWagons[i];
      if (!row) return;
      var level = row.occupancy_level || "medium";
      var wagonNumber = Number(row.wagon_number || (i + 1));
      var stats = statsByWagon[wagonNumber] || row.stats || {};
      var peopleCount = row.current_people_count != null
        ? row.current_people_count
        : stats.current_people_count;
      var percent = row.occupancy_percent != null
        ? row.occupancy_percent
        : stats.occupancy_percent;
      var availableSpace = row.available_space != null
        ? row.available_space
        : stats.available_space;
      var statEl = w.querySelector(".wagon-stat");

      w.className = "wagon " + wagonClass(level);
      w.setAttribute("data-status", wagonClass(level));
      w.setAttribute(
        "aria-label",
        wagonNumber + "-ci vaqon - " +
        statusText(level, row.occupancy_text) +
        (peopleCount != null ? ", " + peopleCount + " nəfər" : "") +
        (percent != null ? ", " + percent + " faiz doludur" : "") +
        (availableSpace != null ? ", " + availableSpace + " boş yer" : "")
      );

      if (!statEl) {
        statEl = document.createElement("span");
        statEl.className = "wagon-stat";
        w.appendChild(statEl);
      }

      var statText = (peopleCount != null || percent != null || availableSpace != null)
        ? (peopleCount != null ? peopleCount + ' nəfər' : '-- nəfər') + ' · ' +
          (availableSpace != null ? availableSpace + ' boş' : '-- boş') + ' · ' +
          (percent != null ? Math.round(Number(percent)) + '%' : '--%')
        : '-- nəfər · -- boş · --%';

      statEl.innerHTML = '<strong>' + statText + '</strong>';

      if (wagonPeople && wagonPeople[i]) wagonPeople[i].textContent = peopleCount != null ? peopleCount + ' nəfər' : '-- nəfər';
      if (wagonEmpty && wagonEmpty[i]) wagonEmpty[i].textContent = availableSpace != null ? availableSpace + ' boş' : '-- boş';
      if (wagonPercent && wagonPercent[i]) wagonPercent[i].textContent = percent != null ? Math.round(Number(percent)) + '%' : '--%';

      var wagonDataEl = document.querySelector('.wagon-data[data-index="' + i + '"]');
      if (wagonDataEl) {
        wagonDataEl.className = 'wagon-data ' + wagonClass(level);
      }

      if (recommendedNumber === wagonNumber) {
        w.id = "recWagon";
      } else if (w.id === "recWagon") {
        w.removeAttribute("id");
      }
    });

    if (bestName && recommendedNumber) bestName.textContent = recommendedNumber + "-ci vaqon";
    if (bestTip && recommended && recommended.description) bestTip.textContent = recommended.description;
    if (station.id) lsSet("metro_selected_station_id", String(station.id));

    cacheLive(data);
  }

  function liveErrorMessage(err) {
    if (err && err.code === "ECONNABORTED") return "Şəbəkə vaxtı bitdi. Canlı data yenilənmədi.";
    if (!navigator.onLine) return "İnternet bağlantısı yoxdur. Son saxlanılan data göstərilir.";
    if (err && err.response && err.response.data && err.response.data.message) return err.response.data.message;
    return "Canlı məlumatlar yüklənərkən xəta baş verdi.";
  }

  function loadLiveTracking() {
    var stationId = getSelectedStationId();
    var cached = readCachedLive();
    if (cached) renderLiveTracking(cached);

    if (!window.SmartMetroAPI || !window.SmartMetroAPI.getLiveTracking) {
      showToast("API kitabxanası yüklənmədi.");
      return;
    }

    window.SmartMetroAPI.getLiveTracking(stationId, getSelectedTrainNumber())
      .then(function (res) {
        var body = res.data;
        if (body && body.success && body.data) {
          renderLiveTracking(body.data);
        } else {
          showToast((body && body.message) || "Canlı məlumat tapılmadı.", 3600);
        }
      })
      .catch(function (err) {
        showToast(liveErrorMessage(err), 3800);
      });
  }

  function startLivePolling() {
    loadLiveTracking();
    clearInterval(livePollTimer);
    livePollTimer = setInterval(loadLiveTracking, LIVE_REFRESH_MS);
  }

  /* ══════════════════════════════════════
     CANLI SAAT — hər saniyə yenilənir
  ══════════════════════════════════════ */
  function updateClock() {
    var now = new Date();
    var h   = String(now.getHours()).padStart(2, "0");
    var m   = String(now.getMinutes()).padStart(2, "0");
    var s   = String(now.getSeconds()).padStart(2, "0");
    if (clockTime) clockTime.textContent = h + ":" + m + ":" + s;
  }
  updateClock();                        // dərhal göstər
  setInterval(updateClock, 1000);       // hər saniyə yenilə

  /* ══════════════════════════════════════
     Topbar kölgəsi — scroll-da
  ══════════════════════════════════════ */
  if (scrollArea) {
    scrollArea.addEventListener("scroll", function () {
      topbar.classList.toggle("scrolled", scrollArea.scrollTop > 4);
    }, { passive: true });
  }

  /* ══════════════════════════════════════
     DARK / LIGHT MOD
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

  // Saxlanılmış tema yoxla, yoxdursa sistem preferansına bax
  var saved  = lsGet("metro-theme");
  var isDark = (saved === "dark") ? true
             : (saved === "light") ? false
             : (function () {
                 try { return window.matchMedia("(prefers-color-scheme:dark)").matches; }
                 catch (e) { return false; }
               })();

  function applyTheme() {
    // data-dark atributunu <html>-ə əlavə et / sil
    if (isDark) {
      htmlEl.setAttribute("data-dark", "");
    } else {
      htmlEl.removeAttribute("data-dark");
    }
    // İkon dəyiş
    if (themeIcon) themeIcon.innerHTML = isDark ? SUN : MOON;
    // Aria etiketi
    if (themeBtn) {
      themeBtn.setAttribute("aria-label", isDark ? "İşıqlı moda keç" : "Qaranlıq moda keç");
    }
  }

  applyTheme(); // səhifə açılışında tətbiq et

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      isDark = !isDark;
      applyTheme();
      lsSet("metro-theme", isDark ? "dark" : "light");
    });
  }

  /* ══════════════════════════════════════
     Geri düyməsi
  ══════════════════════════════════════ */
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        showToast("Ana səhifəyə qayıdılır…");
      }
    });
  }

  /* ══════════════════════════════════════
     Toast bildirişi
  ══════════════════════════════════════ */
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

  /* ══════════════════════════════════════
     Qatar gəliş geri sayımı
  ══════════════════════════════════════ */
  var secs = 2 * 60;

  function fmt(s) {
    if (s <= 0) return "indi";
    if (s < 60)  return s + " san";
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function tickArrival() {
    secs--;
    if (secs < 0) {
      secs = 3 * 60 + Math.floor(Math.random() * 60);
      showToast("🚇 Qatar gəldi! Növbəti " + fmt(secs) + " gəlir.", 3800);
    }
    if (arrivalTime) {
      arrivalTime.style.opacity = "0";
      setTimeout(function () {
        arrivalTime.textContent = fmt(secs);
        arrivalTime.style.opacity = "1";
      }, 140);
    }
  }
  setInterval(tickArrival, 1000);

  /* ══════════════════════════════════════
     Vaqon tıklama
  ══════════════════════════════════════ */
  var STATUS = {
    full:     "Dolu – bu vaqona girməyi tövsiyə etmirik.",
    moderate: "Orta sıxlıq – yer var.",
    empty:    "Boş – rahatlıqla minə bilərsiniz! ✓",
  };

  wagons.forEach(function (w, i) {
    w.addEventListener("click", function () {
      var s = w.getAttribute("data-status");
      showToast((i + 1) + "-ci vaqon: " + (STATUS[s] || ""));
      w.style.transform = "scale(.94)";
      setTimeout(function () { w.style.transform = ""; }, 180);
    });
    w.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        w.click();
      }
    });
  });

  /* ══════════════════════════════════════
     Ən boş vaqon kartı
  ══════════════════════════════════════ */
  if (bestCard) {
    bestCard.addEventListener("click", function () {
      var stationId   = getSelectedStationId();
      var wagonNumber = getBestWagonNumber();
      saveGuidanceSelection(stationId, wagonNumber);
      if (liveData) cacheLive(liveData);
      showToast(wagonNumber + "-ci vaqon seçildi. Yönləndirmə açılır…");
      setTimeout(function () {
        window.location.href = "../schedule/index.html";
      }, 450);
    });
  }

  /* ══════════════════════════════════════
     Alt naviqasiya aktiv vəziyyəti
  ══════════════════════════════════════ */
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

  /* ══════════════════════════════════════
     Canlı vaqon simulyasiyası
  ══════════════════════════════════════ */
  var cycle = ["full", "moderate", "empty"];
  var DOTS  = {
    full:     '<div class="dot-person"></div><div class="dot-person dim"></div><div class="dot-person dimmer"></div>',
    moderate: '<div class="dot-person"></div><div class="dot-person dim"></div>',
    empty:    '<div class="dot-person"></div>',
  };
  var ARIA_LABEL = { full: "Dolu", moderate: "Orta", empty: "Boş" };

  function wagonTick() {
    if (liveData) return;
    var idx = Math.floor(Math.random() * wagons.length);
    var w   = wagons[idx];
    var cur = w.getAttribute("data-status");
    var ni  = (cycle.indexOf(cur) + 1) % cycle.length;
    var ns  = cycle[ni];
    w.setAttribute("data-status", ns);
    w.className = "wagon " + ns;
    w.setAttribute("aria-label", (idx + 1) + "-ci vaqon – " + ARIA_LABEL[ns]);
    var dotsEl = w.querySelector(".people-dots");
    if (dotsEl) dotsEl.innerHTML = DOTS[ns];
  }
  setInterval(wagonTick, 10000);

  startLivePolling();

})();
