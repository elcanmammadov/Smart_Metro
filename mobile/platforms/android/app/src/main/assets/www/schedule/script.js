(function () {
  "use strict";

  /* ══════════════════════════════════════
     Element refs
  ══════════════════════════════════════ */
  var htmlEl     = document.documentElement;
  var themeBtn   = document.getElementById("themeBtn");
  var themeIcon  = document.getElementById("themeIcon");
  var backBtn    = document.getElementById("backBtn");
  var toastEl    = document.getElementById("toast");
  var scrollArea = document.getElementById("scrollArea");
  var topbar     = document.getElementById("topbar");
  var navItems   = document.querySelectorAll(".nav-item");
  var stepItems  = document.querySelectorAll(".step-item");

  /* ══════════════════════════════════════
     localStorage helpers
  ══════════════════════════════════════ */
  function lsGet(k) { try { return localStorage.getItem(k); } catch(e) { return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e) {} }

  var GUIDANCE_SELECTION_KEY = "metro_guidance_selection";
  var GUIDANCE_LOGS_KEY      = "metro_guidance_logs";
  var DEFAULT_STATION_ID     = 3;
  var DEFAULT_WAGON_NUMBER   = 2;
  var guidanceSteps          = [];

  function addGuidanceLog(success, message, stationId, wagonNumber) {
    try {
      var logs = JSON.parse(lsGet(GUIDANCE_LOGS_KEY) || "[]");
      logs.unshift({
        time         : new Date().toISOString(),
        success      : success,
        message      : message,
        station_id   : Number(stationId),
        wagon_number : Number(wagonNumber),
        page         : "schedule"
      });
      if (logs.length > 30) logs.length = 30;
      lsSet(GUIDANCE_LOGS_KEY, JSON.stringify(logs));
    } catch(e) {}
  }

  function readGuidanceSelection() {
    try {
      var saved = JSON.parse(lsGet(GUIDANCE_SELECTION_KEY) || "null");
      if (saved && saved.station_id && saved.wagon_number) {
        return {
          station_id   : Number(saved.station_id),
          wagon_number : Number(saved.wagon_number)
        };
      }
    } catch(e) {}

    return {
      station_id   : Number(lsGet("metro_selected_station_id") || lsGet("metro_last_from") || DEFAULT_STATION_ID),
      wagon_number : Number(lsGet("metro_selected_wagon_id") || DEFAULT_WAGON_NUMBER)
    };
  }

  function getGuidanceCacheKey(stationId, wagonNumber) {
    return "metro_guidance_" + stationId + "_" + wagonNumber;
  }

  function setGuidanceCache(stationId, wagonNumber, data, ttlMinutes) {
    try {
      lsSet(getGuidanceCacheKey(stationId, wagonNumber), JSON.stringify({
        ts          : Date.now(),
        ttl_minutes : Number(ttlMinutes) || 60,
        data        : data
      }));
    } catch(e) {}
  }

  function getGuidanceCached(stationId, wagonNumber, allowExpired) {
    try {
      var entry = JSON.parse(lsGet(getGuidanceCacheKey(stationId, wagonNumber)) || "null");
      if (!entry || !entry.data) return null;
      var ttl = (Number(entry.ttl_minutes) || 60) * 60 * 1000;
      if (!allowExpired && Date.now() - entry.ts > ttl) return null;
      return entry.data;
    } catch(e) {
      return null;
    }
  }

  /* ══════════════════════════════════════
     Topbar shadow on scroll
  ══════════════════════════════════════ */
  if (scrollArea) {
    scrollArea.addEventListener("scroll", function () {
      topbar.classList.toggle("scrolled", scrollArea.scrollTop > 4);
    }, { passive: true });
  }

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

  var saved  = lsGet("metro-dir-theme");
  var isDark = (saved === "dark")  ? true
             : (saved === "light") ? false
             : (function(){
                 try { return window.matchMedia("(prefers-color-scheme:dark)").matches; }
                 catch(e) { return false; }
               })();

  function applyTheme() {
    if (isDark) {
      htmlEl.setAttribute("data-dark", "");
    } else {
      htmlEl.removeAttribute("data-dark");
    }
    if (themeIcon) themeIcon.innerHTML = isDark ? SUN : MOON;
    if (themeBtn)  themeBtn.setAttribute("aria-label", isDark ? "İşıqlı moda keç" : "Qaranlıq moda keç");
  }
  applyTheme();

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      isDark = !isDark;
      applyTheme();
      lsSet("metro-dir-theme", isDark ? "dark" : "light");
    });
  }

  /* ══════════════════════════════════════
     Back button
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
     Toast
  ══════════════════════════════════════ */
  var toastTimer = null;
  function showToast(msg, ms) {
    if (!toastEl) return;
    ms = ms || 2600;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, ms);
  }

  function ordinal(n) {
    return Number(n) + "-ci";
  }

  function plainStationName(name) {
    return (name || "").replace(" stansiyası", "");
  }

  function renderTrain(wagonNumber) {
    var trainWrap = document.getElementById("trainWrap");
    if (!trainWrap) return;

    var active = Math.max(1, Math.min(5, Number(wagonNumber) || DEFAULT_WAGON_NUMBER));
    var parts = [
      '<svg class="train-svg" viewBox="0 0 340 90" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
      '<rect x="8" y="78" width="324" height="6" rx="3" fill="var(--surface-3)"/>',
      '<rect x="8" y="79" width="324" height="4" rx="2" fill="var(--surface-2)"/>'
    ];

    for (var i = 1; i <= 5; i++) {
      var x = 10 + ((i - 1) * 64);
      var isActive = i === active;
      var body = isActive ? "#0ea860" : "var(--surface-2)";
      var stripe = isActive ? "#0a8049" : "var(--surface-3)";
      var win = isActive ? "rgba(255,255,255,0.85)" : "var(--surface)";
      var door = isActive ? "rgba(255,255,255,0.3)" : "var(--border-md)";

      parts.push(
        '<g class="wagon-g' + (isActive ? ' wagon-active' : '') + '">',
        '<rect x="' + x + '" y="' + (isActive ? 14 : 18) + '" width="' + (isActive ? 62 : 60) + '" height="' + (isActive ? 56 : 52) + '" rx="7" fill="' + body + '" opacity="' + (isActive ? '.15' : '1') + '"/>',
        '<rect x="' + x + '" y="18" width="' + (isActive ? 62 : 60) + '" height="52" rx="6" fill="' + body + '"/>',
        '<rect x="' + x + '" y="18" width="' + (isActive ? 62 : 60) + '" height="10" rx="6" fill="' + stripe + '"/>',
        '<rect x="' + x + '" y="24" width="' + (isActive ? 62 : 60) + '" height="4" fill="' + stripe + '"/>',
        '<rect x="' + (x + 6) + '" y="25" width="16" height="12" rx="4" fill="' + win + '" opacity=".9"/>',
        '<rect x="' + (x + 27) + '" y="25" width="16" height="12" rx="4" fill="' + win + '" opacity=".9"/>',
        '<rect x="' + (x + 26) + '" y="38" width="9" height="22" rx="2" fill="' + door + '"/>',
        '<circle cx="' + (x + 14) + '" cy="72" r="5.5" fill="' + stripe + '"/>',
        '<circle cx="' + (x + 44) + '" cy="72" r="5.5" fill="' + stripe + '"/>'
      );

      if (isActive) {
        parts.push(
          '<rect x="' + (x + 22) + '" y="10" width="18" height="18" rx="9" fill="#0ea860"/>',
          '<text x="' + (x + 31) + '" y="23" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="10" font-weight="800" fill="white">' + active + '</text>'
        );
      }

      parts.push('</g>');
    }

    parts.push('</svg>');
    parts.push(
      '<div class="person-pin" id="personPin" style="left:' + (((active - 0.5) / 5) * 100) + '%">',
      '<svg width="24" height="32" viewBox="0 0 24 32" fill="none">',
      '<circle cx="12" cy="6" r="5" fill="#0ea860"/>',
      '<path d="M4 28 Q4 18 12 18 Q20 18 20 28" fill="#0ea860"/>',
      '<circle cx="12" cy="6" r="3.5" fill="rgba(255,255,255,0.3)"/>',
      '</svg>',
      '</div>'
    );

    trainWrap.innerHTML = parts.join("");
  }

  function setStepState(activeIndex) {
    currentStep = Math.max(0, Math.min(stepItems.length - 1, activeIndex));
    stepItems.forEach(function (item, i) {
      var wrap = item.querySelector(".step-icon-wrap");
      var lbl  = item.querySelector(".step-lbl");
      var svg  = item.querySelector(".step-icon-wrap svg");
      if (wrap) wrap.classList.remove("active", "done");
      if (lbl)  lbl.classList.remove("active", "done");

      if (i < currentStep) {
        if (wrap) wrap.classList.add("done");
        if (lbl)  lbl.classList.add("done");
        if (svg)  svg.setAttribute("stroke", "#0ea860");
      } else if (i === currentStep) {
        if (wrap) wrap.classList.add("active");
        if (lbl)  lbl.classList.add("active");
        if (svg)  svg.setAttribute("stroke", "var(--blue)");
      } else if (svg) {
        svg.setAttribute("stroke", "var(--txt3)");
      }
    });
  }

  function parseStepMetadata(step) {
    if (!step || !step.metadata) return {};
    if (typeof step.metadata === "object") return step.metadata;
    try {
      return JSON.parse(step.metadata);
    } catch(e) {
      return {};
    }
  }

  function setARDirection(step) {
    if (!mapCard || !step) return;
    var meta = parseStepMetadata(step);
    var text = ((meta.direction || "") + " " + (step.title || "")).toLowerCase();
    var dir = "straight";

    if (text.indexOf("left") !== -1 || text.indexOf("sol") !== -1) {
      dir = "left";
    } else if (text.indexOf("right") !== -1 || text.indexOf("sağ") !== -1) {
      dir = "right";
    }

    mapCard.classList.remove("ar-left", "ar-right", "ar-straight");
    mapCard.classList.add("ar-" + dir);
  }

  function renderGuidance(data) {
    if (!data) return;
    var station = data.station || {};
    var guidance = data.guidance || {};
    var steps = Array.isArray(data.steps) ? data.steps.slice() : [];
    steps.sort(function (a, b) { return Number(a.order) - Number(b.order); });
    guidanceSteps = steps;

    var wagonNumber = guidance.wagon_number || readGuidanceSelection().wagon_number;
    var title = guidance.title || (ordinal(wagonNumber) + " vaqonun qarşısında dayan");

    var stepTitle = document.querySelector(".step-title");
    if (stepTitle) stepTitle.innerHTML = title.replace(" qarşısında ", "<br />qarşısında ");

    renderTrain(wagonNumber);

    stepItems.forEach(function (item, i) {
      var step = steps[i];
      if (!step) return;
      var lbl = item.querySelector(".step-lbl");
      var sub = item.querySelector(".step-sub");
      if (lbl) {
        var first = step.title || "";
        var second = step.subtitle || "";
        if (step.type === "destination" && station.name) first = plainStationName(station.name);
        lbl.innerHTML = first + (second ? "<br />" + second : "");
      }
      if (sub) sub.textContent = step.duration_min ? step.duration_min + " dəq" : "";
    });

    var activeIndex = 0;
    steps.forEach(function (step, i) {
      if (step.type === "wagon") activeIndex = i;
    });
    setStepState(activeIndex);

    var tipText = document.querySelector(".tip-text");
    if (tipText && data.tip) {
      tipText.innerHTML = "<strong>" + (data.tip.title || "İpucu") + ":</strong> " + (data.tip.description || "");
    }

    var visual = data.visuals && data.visuals[0];
    var dirText = document.querySelector(".dir-text");
    if (dirText) {
      dirText.textContent = (visual && visual.title) || (steps[0] && steps[0].title) || title;
    }

    var walkStep = null;
    steps.forEach(function (step) {
      if (!walkStep && step.type === "walk") walkStep = step;
    });
    setARDirection(walkStep || steps[0]);

    directions = [];
    if (data.visuals) {
      data.visuals.forEach(function (item) {
        if (item && item.title) directions.push(item.title);
      });
    }
    steps.forEach(function (step) {
      if (step.title) directions.push(step.title + (step.subtitle ? " " + step.subtitle : ""));
    });
    if (!directions.length) directions = [title];

    stepMessages = steps.map(function (step) {
      return step.title + (step.subtitle ? " - " + step.subtitle : "");
    });

    if (station.name) {
      addGuidanceLog(true, "Yönləndirmə göstərildi: " + station.name, station.id, wagonNumber);
    }
  }

  function setGuidanceLoading() {
    var stepTitle = document.querySelector(".step-title");
    if (stepTitle) stepTitle.innerHTML = "Yönləndirmə<br />yüklənir…";
  }

  function guidanceErrorMessage(err) {
    if (err && err.code === "ECONNABORTED") return "Şəbəkə vaxtı bitdi. Yönləndirmə yüklənmədi.";
    if (!navigator.onLine) return "İnternet bağlantısı yoxdur. Son saxlanılan yönləndirmə göstərilə bilər.";
    if (err && err.response && err.response.data && err.response.data.message) return err.response.data.message;
    return "Yönləndirmə məlumatları yüklənərkən xəta baş verdi.";
  }

  function loadGuidance() {
    var selection = readGuidanceSelection();
    var stationId = selection.station_id || DEFAULT_STATION_ID;
    var wagonNumber = selection.wagon_number || DEFAULT_WAGON_NUMBER;
    var cached = getGuidanceCached(stationId, wagonNumber, false);

    if (cached) {
      renderGuidance(cached);
      addGuidanceLog(true, "Cache-dən yükləndi", stationId, wagonNumber);
    } else {
      setGuidanceLoading();
    }

    if (!window.SmartMetroAPI || !window.SmartMetroAPI.getGuidance) {
      showToast("API kitabxanası yüklənmədi.");
      addGuidanceLog(false, "API kitabxanası yüklənmədi", stationId, wagonNumber);
      return;
    }

    window.SmartMetroAPI.getGuidance(stationId, wagonNumber)
      .then(function (res) {
        var body = res.data;
        if (body && body.success && body.data) {
          var ttl = body.data.cache && body.data.cache.ttl_minutes;
          setGuidanceCache(stationId, wagonNumber, body.data, ttl);
          renderGuidance(body.data);
          showToast(body.message || "Yönləndirmə hazırdır.");
        } else {
          var msg = (body && body.message) || "Yönləndirmə tapılmadı.";
          addGuidanceLog(false, msg, stationId, wagonNumber);
          var offline = getGuidanceCached(stationId, wagonNumber, true);
          if (offline) renderGuidance(offline);
          showToast(msg, 3600);
        }
      })
      .catch(function (err) {
        var msg = guidanceErrorMessage(err);
        addGuidanceLog(false, msg, stationId, wagonNumber);
        var offline = getGuidanceCached(stationId, wagonNumber, true);
        if (offline) {
          renderGuidance(offline);
          showToast(msg + " Son məlumat göstərilir.", 4200);
        } else {
          showToast(msg, 4200);
        }
      });
  }

  /* ══════════════════════════════════════
     Bottom nav active state
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
     Route step tapping — progress forward
  ══════════════════════════════════════ */
  var currentStep = 1; // 0-indexed; step 1 is active on load

  var stepMessages = [
    "Sağa döndünüz!",
    "4-cü vaqon qarşısında dayandınız",
    "Qapıdan çıxırsınız…",
    "28 May stansiyasına çatdınız! 2 dəq qaldı.",
  ];

  stepItems.forEach(function (item, i) {
    item.style.cursor = "pointer";
    item.addEventListener("click", function () {
      if (i > currentStep) {
        showToast("Əvvəlcə " + (currentStep + 1) + "-ci addımı tamamlayın.");
        return;
      }
      showToast(stepMessages[i] || "Addım " + (i + 1));

      // Advance to next step if clicking current active
      if (i === currentStep && currentStep < stepItems.length - 1) {
        // Mark current as done
        var curWrap = stepItems[currentStep].querySelector(".step-icon-wrap");
        var curLbl  = stepItems[currentStep].querySelector(".step-lbl");
        if (curWrap) { curWrap.classList.remove("active"); curWrap.classList.add("done"); }
        if (curLbl)  { curLbl.classList.remove("active");  curLbl.classList.add("done"); }

        currentStep++;

        // Mark next as active
        var nextWrap = stepItems[currentStep].querySelector(".step-icon-wrap");
        var nextLbl  = stepItems[currentStep].querySelector(".step-lbl");
        if (nextWrap) nextWrap.classList.add("active");
        if (nextLbl)  nextLbl.classList.add("active");

        // Update SVG stroke color for next step icon
        var nextSvg = stepItems[currentStep].querySelector(".step-icon-wrap svg");
        if (nextSvg) nextSvg.setAttribute("stroke", "var(--blue)");
      }
    });
  });

  /* ══════════════════════════════════════
     Tip row tap
  ══════════════════════════════════════ */
  var tipRow = document.querySelector(".tip-row");
  if (tipRow) {
    tipRow.style.cursor = "pointer";
    tipRow.addEventListener("click", function () {
      var tip = document.querySelector(".tip-text");
      showToast(tip ? tip.textContent.replace(/\s+/g, " ").trim() : "İpucu göstərilir.");
    });
  }

  /* ══════════════════════════════════════
     Map card tap — simulate direction update
  ══════════════════════════════════════ */
  var mapCard = document.querySelector(".map-card");
  var dirText = document.querySelector(".dir-text");
  var directions = [
    "Sağa 20 metr get",
    "Düz 10 metr get",
    "Pilləkənə çat",
    "28 May çıxışı",
  ];
  var dirIdx = 0;
  var cameraStream = null;
  var nativeCameraActive = false;
  var cameraStartInProgress = false;
  var arMotionStarted = false;
  var arMotionPermissionAsked = false;
  var arMotion = { x: 0, y: 0, tilt: 0, roll: 0, stretch: 1 };

  if (mapCard) {
    mapCard.classList.add("ar-right");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function updateARMotionVars(next) {
    if (!mapCard) return;
    arMotion.x += (next.x - arMotion.x) * 0.16;
    arMotion.y += (next.y - arMotion.y) * 0.16;
    arMotion.tilt += (next.tilt - arMotion.tilt) * 0.16;
    arMotion.roll += (next.roll - arMotion.roll) * 0.16;
    arMotion.stretch += (next.stretch - arMotion.stretch) * 0.14;

    mapCard.style.setProperty("--ar-shift-x", arMotion.x.toFixed(2) + "px");
    mapCard.style.setProperty("--ar-shift-y", arMotion.y.toFixed(2) + "px");
    mapCard.style.setProperty("--ar-tilt", arMotion.tilt.toFixed(2) + "deg");
    mapCard.style.setProperty("--ar-roll", arMotion.roll.toFixed(2) + "deg");
    mapCard.style.setProperty("--ar-stretch", arMotion.stretch.toFixed(3));
  }

  function handleAROrientation(e) {
    var gamma = typeof e.gamma === "number" ? e.gamma : 0;
    var beta = typeof e.beta === "number" ? e.beta : 0;

    updateARMotionVars({
      x: clamp(gamma * 0.95, -24, 24),
      y: clamp((beta - 45) * 0.22, -16, 16),
      tilt: clamp((beta - 45) * 0.1, -7, 7),
      roll: clamp(gamma * 0.15, -8, 8),
      stretch: clamp(1 + ((beta - 45) * 0.006) + (Math.abs(gamma) * 0.004), 0.86, 1.24)
    });
  }

  function enableARMotion() {
    if (arMotionStarted || !window.DeviceOrientationEvent) return;
    window.addEventListener("deviceorientation", handleAROrientation, true);
    arMotionStarted = true;
  }

  function requestARMotionPermission() {
    if (arMotionStarted || arMotionPermissionAsked) {
      enableARMotion();
      return;
    }

    arMotionPermissionAsked = true;
    if (window.DeviceOrientationEvent &&
        typeof window.DeviceOrientationEvent.requestPermission === "function") {
      window.DeviceOrientationEvent.requestPermission()
        .then(function (state) {
          if (state === "granted") enableARMotion();
        })
        .catch(function () {});
      return;
    }

    enableARMotion();
  }

  function getCameraPreviewRect() {
    var rect = mapCard.getBoundingClientRect();
    return {
      x      : Math.max(0, Math.round(rect.left)),
      y      : Math.max(0, Math.round(rect.top)),
      width  : Math.max(1, Math.round(rect.width)),
      height : Math.max(1, Math.round(rect.height))
    };
  }

  function getCameraPreviewPlugin() {
    return window.CameraPreview || (window.cordova && window.cordova.plugins && window.cordova.plugins.CameraPreview);
  }

  function markCameraActive() {
    cameraStartInProgress = false;
    if (mapCard) mapCard.classList.add("camera-active");
    document.documentElement.classList.add("camera-preview-active");
  }

  function markCameraInactive() {
    cameraStartInProgress = false;
    if (mapCard) mapCard.classList.remove("camera-active");
    document.documentElement.classList.remove("camera-preview-active");
  }

  function isScheduleCameraActive() {
    return nativeCameraActive || !!cameraStream;
  }

  function startNativeCameraPreview() {
    var preview = getCameraPreviewPlugin();
    if (!preview || !mapCard) return false;

    var rect = getCameraPreviewRect();
    var backCamera = preview.CAMERA_DIRECTION
      ? preview.CAMERA_DIRECTION.BACK
      : "back";

    preview.startCamera({
      x           : rect.x,
      y           : rect.y,
      width       : rect.width,
      height      : rect.height,
      camera      : backCamera,
      toBack      : true,
      tapPhoto    : false,
      tapFocus    : true,
      previewDrag : false,
      alpha       : 1
    }, function () {
      nativeCameraActive = true;
      markCameraActive();
      showToast("Kamera görüntüsü aktivdir.");
    }, function (err) {
      nativeCameraActive = false;
      cameraStartInProgress = false;
      markCameraInactive();
      showToast((err && String(err)) || "Kamera açılmadı. Statik yönləndirmə göstərilir.", 3600);
      startBrowserCameraFallback();
    });

    return true;
  }

  function startBrowserCameraFallback() {
    if (!mapCard) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraStartInProgress = false;
      showToast("Kamera bu cihazda dəstəklənmir.");
      return;
    }

    var video = document.createElement("video");
    video.className = "camera-video";
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    }).then(function (stream) {
      cameraStream = stream;
      video.srcObject = stream;
      mapCard.insertBefore(video, mapCard.firstChild);
      markCameraActive();
      return video.play();
    }).then(function () {
      showToast("Kamera görüntüsü aktivdir.");
    }).catch(function (err) {
      var msg = err && err.name === "NotAllowedError"
        ? "Kamera icazəsi verilmədi."
        : "Kamera açılmadı. Statik yönləndirmə göstərilir.";
      cameraStartInProgress = false;
      markCameraInactive();
      showToast(msg, 3600);
    });
  }

  function startScheduleCamera() {
    if (!mapCard) return;
    if (isScheduleCameraActive() || cameraStartInProgress) return;
    cameraStartInProgress = true;
    setTimeout(function () {
      if (!isScheduleCameraActive()) cameraStartInProgress = false;
    }, 5000);
    if (startNativeCameraPreview()) return;
    startBrowserCameraFallback();
  }

  function stopScheduleCamera() {
    if (nativeCameraActive && getCameraPreviewPlugin()) {
      getCameraPreviewPlugin().stopCamera(function () {}, function () {});
      nativeCameraActive = false;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (track) {
        track.stop();
      });
      cameraStream = null;
    }
    markCameraInactive();
  }

  window.addEventListener("pagehide", stopScheduleCamera);
  document.addEventListener("pause", stopScheduleCamera, false);

  if (window.cordova) {
    document.addEventListener("deviceready", function () {
      startScheduleCamera();
      requestARMotionPermission();
    }, false);
  } else {
    startScheduleCamera();
    requestARMotionPermission();
  }

  if (mapCard) {
    mapCard.style.cursor = "pointer";
    mapCard.addEventListener("click", function () {
      requestARMotionPermission();

      if (!isScheduleCameraActive()) {
        showToast("Kamera açılır…");
        startScheduleCamera();
        return;
      }

      dirIdx = (dirIdx + 1) % directions.length;
      if (dirText) dirText.textContent = directions[dirIdx];
      showToast(directions[dirIdx]);
    });
  }

  /* ══════════════════════════════════════
     Train wagon click
  ══════════════════════════════════════ */
  var stepCard = document.querySelector(".step-card");
  if (stepCard) {
    stepCard.addEventListener("click", function (e) {
      if (!e.target.closest(".step-header")) {
        var wagonStep = guidanceSteps.filter(function (step) { return step.type === "wagon"; })[0];
        showToast(wagonStep ? wagonStep.title + " - " + (wagonStep.subtitle || "") : "Vaqon yönləndirməsi hazırdır.");
      }
    });
  }

  /* ══════════════════════════════════════
     Initial welcome toast
  ══════════════════════════════════════ */
  loadGuidance();

  setTimeout(function () {
    var selection = readGuidanceSelection();
    showToast("Seçilmiş vaqon: " + selection.wagon_number + "-ci vaqon", 3200);
  }, 700);

})();
