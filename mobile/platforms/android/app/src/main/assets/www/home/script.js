/* ============================================================
   home.js  —  Smart Metro Ana Səhifə
   ============================================================ */

(function () {
  "use strict";

  /* ── DOM referansları ──────────────────────────────────────── */
  var app           = document.getElementById("app");
  var themeBtn      = document.getElementById("themeBtn");
  var themeIcon     = document.getElementById("themeIcon");
  var menuBtn       = document.getElementById("menuBtn");
  var fromStation   = document.getElementById("fromStation");
  var toStation     = document.getElementById("toStation");
  var swapBtn       = document.getElementById("swapBtn");
  var greetingName  = document.getElementById("greetingName");
  var crowdSlider   = document.getElementById("crowdSlider");
  var crowdDots     = document.getElementById("crowdDots");
  var routeRows     = document.getElementById("routeRows");
  var routeMsg      = document.getElementById("routeMsg");
  var routeTime     = document.getElementById("routeTime");
  var routeCrowd    = document.getElementById("routeCrowd");
  var routeSub      = document.getElementById("routeSub");
  var routeTransfer = document.getElementById("routeTransfer");
  var liveBtn       = document.getElementById("liveBtn");
  var liveBtnText   = liveBtn ? liveBtn.childNodes[0] : null;
  var toast         = document.getElementById("toast");
  var navItems      = document.querySelectorAll(".nav-item");

  /* ── localStorage helpers ──────────────────────────────────── */
  function lsGet(k) { try { return localStorage.getItem(k);    } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v);     } catch (e) {} }

  /* ── Cache açarları və TTL ─────────────────────────────────── */
  var CACHE_KEY     = "metro_home_cache";
  var LOGS_KEY      = "metro_home_logs";
  var STA_CACHE     = "metro_stations_cache";
  var STA_LOGS      = "metro_stations_logs";
  var ROUTE_LOGS    = "metro_route_logs";
  var LAST_FROM_KEY = "metro_last_from";
  var LAST_TO_KEY   = "metro_last_to";
  var CACHE_TTL     = 2  * 60 * 1000;
  var STA_CACHE_TTL = 10 * 60 * 1000;
  var ROUTE_TTL     = 2  * 60 * 1000;
  var routeRequestSeq = 0;
  var hasRouteOnScreen = false;
  var lastCrowdInput = null;

  function getCached() {
    try {
      var entry = JSON.parse(lsGet(CACHE_KEY) || "null");
      if (!entry || Date.now() - entry.ts > CACHE_TTL) return null;
      return entry.data;
    } catch (e) { return null; }
  }

  function setCache(data) {
    try { lsSet(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); }
    catch (e) {}
  }

  function addLog(success, message) {
    try {
      var logs = JSON.parse(lsGet(LOGS_KEY) || "[]");
      logs.unshift({ time: new Date().toISOString(), success: success, message: message });
      if (logs.length > 20) logs.length = 20;
      lsSet(LOGS_KEY, JSON.stringify(logs));
    } catch (e) {}
  }

  function addStaLog(success, message) {
    try {
      var logs = JSON.parse(lsGet(STA_LOGS) || "[]");
      logs.unshift({ time: new Date().toISOString(), success: success, message: message });
      if (logs.length > 20) logs.length = 20;
      lsSet(STA_LOGS, JSON.stringify(logs));
    } catch (e) {}
  }

  function getStaCached() {
    try {
      var entry = JSON.parse(lsGet(STA_CACHE) || "null");
      if (!entry || Date.now() - entry.ts > STA_CACHE_TTL) return null;
      return entry.data;
    } catch (e) { return null; }
  }

  function setStaCache(data) {
    try { lsSet(STA_CACHE, JSON.stringify({ ts: Date.now(), data: data })); }
    catch (e) {}
  }

  function addRouteLog(success, fromId, toId, message) {
    try {
      var logs = JSON.parse(lsGet(ROUTE_LOGS) || "[]");
      logs.unshift({
        time    : new Date().toISOString(),
        success : success,
        from_id : fromId,
        to_id   : toId,
        message : message
      });
      if (logs.length > 30) logs.length = 30;
      lsSet(ROUTE_LOGS, JSON.stringify(logs));
    } catch (e) {}
  }

  function getRouteCacheKey(fromId, toId) {
    return "metro_route_" + fromId + "_" + toId;
  }

  function getRouteCached(fromId, toId) {
    try {
      var entry = JSON.parse(lsGet(getRouteCacheKey(fromId, toId)) || "null");
      if (!entry || Date.now() - entry.ts > ROUTE_TTL) return null;
      return entry.data;
    } catch (e) { return null; }
  }

  function setRouteCache(fromId, toId, data) {
    try {
      lsSet(getRouteCacheKey(fromId, toId), JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  /* ── Toast ─────────────────────────────────────────────────── */
  var toastTimer = null;
  function showToast(msg, ms) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, ms || 2700);
  }

  /* ── SVG tema ikonları ─────────────────────────────────────── */
  var MOON_SVG =
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  var SUN_SVG =
    '<circle cx="12" cy="12" r="5"/>' +
    '<line x1="12" y1="1"  x2="12" y2="3"/>' +
    '<line x1="12" y1="21" x2="12" y2="23"/>' +
    '<line x1="4.22" y1="4.22"   x2="5.64"  y2="5.64"/>' +
    '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
    '<line x1="1"  y1="12" x2="3"  y2="12"/>' +
    '<line x1="21" y1="12" x2="23" y2="12"/>' +
    '<line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>' +
    '<line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>';

  /* ── Tema ──────────────────────────────────────────────────── */
  var isDark = lsGet("metro-theme") === "dark";

  function applyTheme() {
    if (isDark) { app.setAttribute("data-dark", ""); }
    else        { app.removeAttribute("data-dark"); }
    if (themeIcon) themeIcon.innerHTML = isDark ? SUN_SVG : MOON_SVG;
  }
  applyTheme();

  themeBtn.addEventListener("click", function () {
    isDark = !isDark;
    applyTheme();
    lsSet("metro-theme", isDark ? "dark" : "light");
  });

  /* ── Menyu ─────────────────────────────────────────────────── */
  menuBtn.addEventListener("click", function () {
    showToast("Menyu tezliklə əlavə olunacaq!");
  });

  /* ── Stansiya seçimi ───────────────────────────────────────── */
  function markSelected(sel) {
    if (sel.value) sel.classList.add("selected");
    else sel.classList.remove("selected");
  }

  /* Bir dropdownda seçilən stansiya digərində deaktiv olsun */
  function syncDisabled() {
    var fv = fromStation.value;
    var tv = toStation.value;
    var i;
    for (i = 0; i < toStation.options.length; i++) {
      toStation.options[i].disabled = (fv && toStation.options[i].value === fv);
    }
    for (i = 0; i < fromStation.options.length; i++) {
      fromStation.options[i].disabled = (tv && fromStation.options[i].value === tv);
    }
  }

  fromStation.addEventListener("change", function () {
    markSelected(fromStation);
    lsSet(LAST_FROM_KEY, fromStation.value);
    syncDisabled();
    tryLoadRoute();
  });
  toStation.addEventListener("change", function () {
    markSelected(toStation);
    lsSet(LAST_TO_KEY, toStation.value);
    syncDisabled();
    tryLoadRoute();
  });

  /* ── Stansiyaları dəyiş ────────────────────────────────────── */
  swapBtn.addEventListener("click", function () {
    var fromVal = fromStation.value;
    var toVal   = toStation.value;
    fromStation.value = toVal;
    toStation.value   = fromVal;
    if (toVal)   lsSet(LAST_FROM_KEY, toVal);
    if (fromVal) lsSet(LAST_TO_KEY, fromVal);
    markSelected(fromStation);
    markSelected(toStation);
    syncDisabled();
    tryLoadRoute();
  });

  function tryLoadRoute() {
    var fv = fromStation.value;
    var tv = toStation.value;
    if (!fv || !tv) return;
    loadRoute(parseInt(fv, 10), parseInt(tv, 10));
  }

  function hasSelectedRoute() {
    return !!(fromStation.value && toStation.value);
  }

  /* ── Dropdown-ları stansiya siyahısı ilə doldur ────────────── */
  function populateSelects(stations) {
    [fromStation, toStation].forEach(function (sel) {
      while (sel.options.length > 1) sel.remove(1);
      stations.forEach(function (st) {
        var opt = document.createElement("option");
        opt.value       = String(st.id);
        opt.textContent = st.name;
        opt.setAttribute("data-line", st.line_name);
        sel.appendChild(opt);
      });
      sel.disabled = false;
    });

    /* Son seçimləri bərpa et */
    var lastFrom = lsGet(LAST_FROM_KEY);
    var lastTo   = lsGet(LAST_TO_KEY);
    if (lastFrom && fromStation.querySelector('option[value="' + lastFrom + '"]')) {
      fromStation.value = lastFrom;
    }
    if (lastTo && toStation.querySelector('option[value="' + lastTo + '"]')) {
      toStation.value = lastTo;
    }

    markSelected(fromStation);
    markSelected(toStation);
    syncDisabled();
    tryLoadRoute();
  }

  function setSelectsLoading(loading) {
    var placeholder = loading ? "Yüklənir…" : "Hardan";
    fromStation.options[0].textContent = placeholder;
    toStation.options[0].textContent   = loading ? "Yüklənir…" : "Haraya";
    fromStation.disabled = loading;
    toStation.disabled   = loading;
  }

  /* ── Stansiyaları API-dan yüklə ────────────────────────────── */
  function loadStations() {
    /* Cache yoxla */
    var cached = getStaCached();
    if (cached) {
      populateSelects(cached);
      addStaLog(true, "Cache-dən yükləndi (" + cached.length + " stansiya)");
    } else {
      setSelectsLoading(true);
    }

    window.SmartMetroAPI.getStations()
      .then(function (res) {
        var body = res.data;
        if (body && body.success && body.data && body.data.stations) {
          var stations = body.data.stations.filter(function (s) { return s.is_active; });
          setStaCache(stations);
          addStaLog(true, body.message || (stations.length + " stansiya yükləndi"));
          populateSelects(stations);
          if (lastCrowdInput) renderCrowd(lastCrowdInput);
        } else {
          var msg = (body && body.message) || "Stansiyalar yüklənmədi.";
          addStaLog(false, msg);
          if (!cached) setSelectsLoading(false);
          showToast(msg);
        }
      })
      .catch(function (err) {
        var msg;
        if (err.code === "ECONNABORTED") {
          msg = "Şəbəkə vaxtı bitdi — stansiyalar yüklənmədi.";
        } else if (!navigator.onLine) {
          msg = "İnternet bağlantısı yoxdur.";
        } else if (err.response && err.response.data && err.response.data.message) {
          msg = err.response.data.message;
        } else {
          msg = "Stansiyalar yüklənərkən xəta baş verdi.";
        }
        addStaLog(false, msg);
        if (!cached) {
          setSelectsLoading(false);
          showToast(msg);
        }
      });
  }

  /* ── Canlı izləmə düyməsi ──────────────────────────────────── */
  liveBtn.addEventListener("click", function () {
    var fromId = Number(fromStation && fromStation.value);
    if (fromId > 0) {
      lsSet("metro_selected_station_id", String(fromId));
      lsSet("metro_last_from", String(fromId));
    }
    window.location.href = "../trip-planner/index.html";
  });

  /* ── Bottom nav ────────────────────────────────────────────── */
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
      addRipple(item);
    });
  });

  function addRipple(el) {
    var r = document.createElement("span");
    r.style.cssText = [
      "position:absolute", "width:44px", "height:44px",
      "border-radius:50%", "background:rgba(25,71,200,.13)",
      "transform:scale(0)", "animation:_rpl .45s ease-out forwards",
      "pointer-events:none", "top:50%", "left:50%",
      "margin-top:-22px", "margin-left:-22px"
    ].join(";");
    if (!document.getElementById("_rplStyle")) {
      var s = document.createElement("style");
      s.id = "_rplStyle";
      s.textContent = "@keyframes _rpl{to{transform:scale(2.6);opacity:0}}";
      document.head.appendChild(s);
    }
    el.style.position = "relative";
    el.style.overflow = "hidden";
    el.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 500);
  }

  /* ══════════════════════════════════════════════════════════════
     API DATA RENDERING
  ══════════════════════════════════════════════════════════════ */

  /* crowd_level → CSS class + Azərbaycan mətni */
  var CROWD_MAP = {
    low      : { cls: "low",      text: "Aşağı"  },
    moderate : { cls: "moderate", text: "Orta"   },
    high     : { cls: "",         text: "Yüksək" }
  };

  /* Ad helper: "Aliyev Avaz" → "Avaz" (sonda olan söz = ad) */
  function firstName(fullName) {
    if (!fullName) return "";
    var parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1];
  }

  var PEOPLE_SVG =
    '<svg viewBox="0 0 88 66" fill="none">' +
    '<circle cx="14" cy="19" r="8"  fill="rgba(255,255,255,.22)"/>' +
    '<path d="M2 44c0-6.627 5.373-12 12-12s12 5.373 12 12" fill="rgba(255,255,255,.22)"/>' +
    '<circle cx="74" cy="19" r="8"  fill="rgba(255,255,255,.22)"/>' +
    '<path d="M62 44c0-6.627 5.373-12 12-12s12 5.373 12 12" fill="rgba(255,255,255,.22)"/>' +
    '<circle cx="44" cy="14" r="11" fill="rgba(255,255,255,.52)"/>' +
    '<path d="M26 50c0-9.941 8.059-18 18-18s18 8.059 18 18" fill="rgba(255,255,255,.52)"/>' +
    '</svg>';

  var PIN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/>' +
    '<circle cx="12" cy="10" r="3"/></svg>';

  /* Tək bir slayd kartı yarat */
  function createCrowdCard(item) {
    item = item || {};
    var map  = CROWD_MAP[item.crowd_level] || CROWD_MAP.high;
    var card = document.createElement("div");
    card.className = "crowd-card" + (map.cls ? " " + map.cls : "");
    card.innerHTML =
      '<div class="crowd-info">' +
        '<p class="crowd-label">Hazırda sıxlıq:</p>' +
        '<h2 class="crowd-level">' + (item.crowd_text || map.text) + '</h2>' +
        '<div class="crowd-station">' + PIN_SVG +
          '<span>' + (item.station_name || "") + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="crowd-visual" aria-hidden="true">' + PEOPLE_SVG + '</div>';
    return card;
  }

  /* Slider-i doldur və dot naviqasiyanı qur */
  function initCrowdSlider(items) {
    if (!crowdSlider || !crowdDots) return;
    items = items && items.length ? items : [{
      station_name : "Bakı Metro",
      crowd_level  : "moderate",
      crowd_text   : "Yüklənir"
    }];

    crowdSlider.innerHTML = "";
    crowdDots.innerHTML   = "";
    crowdSlider.scrollLeft = 0;

    items.forEach(function (item) {
      crowdSlider.appendChild(createCrowdCard(item));
    });

    if (items.length < 2) return;

    /* Kart genişliyini hesabla (gap daxil) */
    function cardStep() {
      var c = crowdSlider.querySelector(".crowd-card");
      return c ? c.offsetWidth + 12 : crowdSlider.offsetWidth;
    }

    /* Dot-ları yarat */
    items.forEach(function (_, i) {
      var btn = document.createElement("button");
      btn.type      = "button";
      btn.className = "crowd-dot" + (i === 0 ? " active" : "");
      btn.setAttribute("aria-label", (i + 1) + "-ci stansiya");
      btn.addEventListener("click", function () {
        crowdSlider.scrollTo({ left: i * cardStep(), behavior: "smooth" });
      });
      crowdDots.appendChild(btn);
    });

    /* Scroll zamanı aktiv dot-u yenilə */
    var scrollTimer;
    crowdSlider.onscroll = function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var step = cardStep();
        if (!step) return;
        var idx  = Math.round(crowdSlider.scrollLeft / step);
        var dots = crowdDots.querySelectorAll(".crowd-dot");
        dots.forEach(function (d, i) { d.classList.toggle("active", i === idx); });
      }, 50);
    };
  }

  /* Stansiya cache-dən əlavə crowd kartları yarat */
  var CROWD_ROTATE = ["high", "moderate", "low", "moderate", "high"];
  var CROWD_ROTATE_TEXT = { high: "Yüksək", moderate: "Orta", low: "Aşağı" };

  function buildCrowdItems(primary) {
    var items = Array.isArray(primary) ? primary.slice() : [primary];
    items = items.filter(function (item) {
      return item && typeof item === "object";
    });

    /* Stansiyalar cache varsa əlavə kartlar yarat */
    var stations = getStaCached();
    if (stations && stations.length > 1) {
      var used = {};
      items.forEach(function (it) { if (it.station_id) used[it.station_id] = true; });

      stations.forEach(function (st, idx) {
        if (used[st.id]) return;
        if (items.length >= 6) return;
        var lvl = CROWD_ROTATE[idx % CROWD_ROTATE.length];
        items.push({
          station_id   : st.id,
          station_name : st.name,
          crowd_level  : lvl,
          crowd_text   : CROWD_ROTATE_TEXT[lvl]
        });
      });
    }
    if (!items.length) {
      items.push({
        station_name : "Bakı Metro",
        crowd_level  : "moderate",
        crowd_text   : "Orta"
      });
    }

    return items;
  }

  /* Sıxlıq bölməsini yenilə — array və ya tək obyekt qəbul edir */
  function renderCrowd(crowd) {
    lastCrowdInput = crowd || lastCrowdInput;
    if (!lastCrowdInput) {
      initCrowdSlider(null);
      return;
    }
    var items = buildCrowdItems(lastCrowdInput);
    initCrowdSlider(items);
  }

  /* home.php-dən gələn sadə marşrutu göstər */
  function renderRoute(optimalRoute, routeConfig) {
    if (hasSelectedRoute() && hasRouteOnScreen) return;

    var sectionTitle = document.getElementById("sectionTitle");
    if (sectionTitle) sectionTitle.textContent = "Ən optimal marşrut";

    if (optimalRoute) {
      hasRouteOnScreen = true;
      routeMsg.textContent = "";
      routeRows.classList.remove("hidden");

      routeTime.textContent     = optimalRoute.duration   || "–";
      setCrowdValue(routeCrowd, null, optimalRoute.crowd_text || "–");
      routeSub.textContent      = optimalRoute.transfer_info || "";
      routeTransfer.textContent = optimalRoute.transfer_count != null
        ? optimalRoute.transfer_count + " dəfə"
        : "–";
    } else {
      hasRouteOnScreen = false;
      routeRows.classList.add("hidden");
      routeMsg.textContent = (routeConfig && routeConfig.message)
        ? routeConfig.message
        : "Stansiyaları seçin.";
    }
  }

  /* Sıxlıq dəyərini rəng ilə göstər */
  var CROWD_VALUE_MAP = {
    low      : "value-green",
    moderate : "value-amber",
    high     : "value-red"
  };

  function setCrowdValue(el, level, text) {
    el.className = "route-value " + (CROWD_VALUE_MAP[level] || "value-red");
    el.textContent = text || "–";
  }

  /* route.php-dən gələn detallı marşrutu göstər */
  function renderDetailedRoute(route) {
    hasRouteOnScreen = true;

    var sectionTitle = document.getElementById("sectionTitle");
    if (sectionTitle && route.from_station && route.to_station) {
      var fromName = route.from_station.name.replace(" stansiyası", "");
      var toName   = route.to_station.name.replace(" stansiyası", "");
      sectionTitle.textContent = fromName + " → " + toName;
    }

    routeMsg.textContent = "";
    routeRows.classList.remove("hidden");

    routeTime.textContent = route.duration_min != null
      ? route.duration_min + " dəq"
      : "–";

    setCrowdValue(routeCrowd, route.crowd_level, route.crowd_text);

    routeTransfer.textContent = route.transfer_count != null
      ? route.transfer_count + " dəfə"
      : "–";

    /* Transfer mətn: ilk transferi göstər, ya da stansiya sayını */
    if (route.transfers && route.transfers.length > 0) {
      routeSub.textContent = route.transfers[0].transfer_text || "";
    } else {
      routeSub.textContent = route.station_count
        ? route.station_count + " stansiya"
        : "";
    }

    /* Alternativ tapılmadıqda məlumat ver */
    if (route.alternative && route.alternative.requested && !route.alternative.found) {
      showToast(route.alternative.message || "Alternativ marşrut tapılmadı.", 3500);
    }
  }

  /* Route card yükləmə vəziyyəti */
  function setRouteLoading(loading) {
    if (loading) {
      if (!hasRouteOnScreen) routeRows.classList.add("hidden");
      routeMsg.textContent = "Marşrut hesablanır…";
    } else {
      routeMsg.textContent = "";
    }
  }

  /* Canlı izləmə düyməsini yenilə */
  function renderLiveBtn(liveTracking) {
    if (!liveTracking) return;
    if (liveBtnText) {
      liveBtnText.textContent = liveTracking.button_text
        ? liveTracking.button_text + " "
        : "Canlı izləməyə bax ";
    }
    liveBtn.disabled = liveTracking.enabled === false;
    liveBtn.style.opacity = liveTracking.enabled === false ? "0.5" : "";
  }

  /* Bütün UI-ı data ilə doldur */
  function renderHome(data) {
    if (data.user) {
      greetingName.textContent = firstName(data.user.full_name);
    }
    renderCrowd(data.current_crowd);
    renderRoute(data.optimal_route, data.route_config);
    renderLiveBtn(data.live_tracking);
  }

  /* ══════════════════════════════════════════════════════════════
     ROUTE API CALL
  ══════════════════════════════════════════════════════════════ */
  function loadRoute(fromId, toId, attempt) {
    attempt = attempt || 1;
    var requestId = ++routeRequestSeq;

    if (!window.SmartMetroAuth || !window.SmartMetroAuth.isLoggedIn()) {
      showToast("Sessiya başa çatıb, yenidən daxil olun.");
      setTimeout(function () { window.location.href = "../login/index.html"; }, 1500);
      return;
    }

    /* Cache yoxla */
    var cached = getRouteCached(fromId, toId);
    if (cached) {
      renderDetailedRoute(cached);
      addRouteLog(true, fromId, toId, "Cache-dən yükləndi");
    }

    if (!cached) setRouteLoading(true);

    window.SmartMetroAPI.getRoute(fromId, toId)
      .then(function (res) {
        if (requestId !== routeRequestSeq) return;
        var body = res.data;
        if (body && body.success && body.data && body.data.route) {
          var route = body.data.route;
          setRouteCache(fromId, toId, route);
          addRouteLog(true, fromId, toId, body.message || "Marşrut hesablandı");
          renderDetailedRoute(route);
        } else {
          var msg = (body && body.message) || "Marşrut hesablanmadı.";
          if (cached) {
            addRouteLog(false, fromId, toId, msg + " (cache saxlanıldı)");
            return;
          }
          if (attempt < 2) {
            setTimeout(function () { loadRoute(fromId, toId, attempt + 1); }, 450);
            return;
          }
          addRouteLog(false, fromId, toId, msg);
          setRouteLoading(false);
          routeMsg.textContent = msg;
          if (!hasRouteOnScreen) routeRows.classList.add("hidden");
          showToast(msg);

          if (/token|deaktiv/i.test(msg)) {
            if (window.SmartMetroAuth) window.SmartMetroAuth.clear();
            setTimeout(function () { window.location.href = "../login/index.html"; }, 1500);
          }
        }
      })
      .catch(function (err) {
        if (requestId !== routeRequestSeq) return;
        var msg;
        if (err.code === "ECONNABORTED") {
          msg = "Şəbəkə vaxtı bitdi — marşrut hesablanmadı.";
        } else if (!navigator.onLine) {
          msg = "İnternet bağlantısı yoxdur.";
        } else if (err.response && err.response.data && err.response.data.message) {
          msg = err.response.data.message;
        } else {
          msg = "Marşrut hesablanarkən xəta baş verdi.";
        }
        if (cached) {
          addRouteLog(false, fromId, toId, msg + " (cache saxlanıldı)");
          return;
        }
        if (attempt < 2 && navigator.onLine) {
          setTimeout(function () { loadRoute(fromId, toId, attempt + 1); }, 450);
          return;
        }
        addRouteLog(false, fromId, toId, msg);
        setRouteLoading(false);
        routeMsg.textContent = msg;
        if (!hasRouteOnScreen) routeRows.classList.add("hidden");
        showToast(msg);
      });
  }

  /* ══════════════════════════════════════════════════════════════
     HOME API CALL
  ══════════════════════════════════════════════════════════════ */
  function loadHome(force) {
    if (!window.SmartMetroAuth || !window.SmartMetroAuth.isLoggedIn()) {
      showToast("Sessiya başa çatıb, yenidən daxil olun.");
      setTimeout(function () { window.location.href = "../login/index.html"; }, 1500);
      return;
    }

    /* Cache-dən tez göstər, amma arxa planda təzə data yenilə */
    var cached = null;
    if (!force) {
      cached = getCached();
      if (cached) renderHome(cached);
    }

    window.SmartMetroAPI.getHome()
      .then(function (res) {
        var body = res.data;
        if (body && body.success) {
          setCache(body.data);
          addLog(true, body.message || "OK");
          renderHome(body.data);
        } else {
          var msg = (body && body.message) || "Məlumatlar yüklənmədi.";
          addLog(false, msg);
          if (!cached) showToast(msg);

          /* Token xətası → login */
          if (/token|deaktiv|yanlış/i.test(msg)) {
            if (window.SmartMetroAuth) window.SmartMetroAuth.clear();
            setTimeout(function () { window.location.href = "../login/index.html"; }, 1500);
          }
        }
      })
      .catch(function (err) {
        var msg;
        if (err.code === "ECONNABORTED") {
          msg = "Şəbəkə vaxtı bitdi. Yenidən cəhd edin.";
        } else if (!navigator.onLine) {
          msg = "İnternet bağlantısı yoxdur.";
        } else if (err.response && err.response.data && err.response.data.message) {
          msg = err.response.data.message;
        } else {
          msg = "Məlumatlar yüklənərkən xəta baş verdi.";
        }
        addLog(false, msg);
        if (!cached) showToast(msg);
      });
  }

  /* ── İlk yüklənmə ──────────────────────────────────────────── */
  loadHome();
  loadStations();

})();
