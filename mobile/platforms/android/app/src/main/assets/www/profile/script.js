(function () {
  "use strict";

  /* ══════════════════════════════════════
     Refs
  ══════════════════════════════════════ */
  var htmlEl        = document.documentElement;
  var themeBtn      = document.getElementById("themeBtn");
  var themeIcon     = document.getElementById("themeIcon");
  var themeSubLabel = document.getElementById("themeSubLabel");
  var backBtn       = document.getElementById("backBtn");
  var toastEl       = document.getElementById("toast");
  var scrollArea    = document.getElementById("scrollArea");
  var topbar        = document.getElementById("topbar");
  var navItems      = document.querySelectorAll(".nav-item");
  var menuItems     = document.querySelectorAll(".menu-item");
  var quickCards    = document.querySelectorAll(".quick-card");
  var logoutBtn     = document.getElementById("logoutBtn");
  var logoutOverlay = document.getElementById("logoutOverlay");
  var confirmLogout = document.getElementById("confirmLogout");
  var logoutCancel  = document.getElementById("logoutCancel");
  var deleteBtn     = document.getElementById("deleteBtn");
  var confirmOverlay= document.getElementById("confirmOverlay");
  var confirmDel    = document.getElementById("confirmDel");
  var confirmCancel = document.getElementById("confirmCancel");
  var avatarEl             = document.getElementById("avatarEl");
  var avatarEdit           = document.getElementById("avatarEdit");
  var avatarInitials       = document.getElementById("avatarInitials");
  var userNameEl           = document.getElementById("userName");
  var userPhoneEl          = document.getElementById("userPhone");
  var favoriteStationValue = document.getElementById("favoriteStationValue");
  var stationPickerOverlay = document.getElementById("stationPickerOverlay");
  var pickerClose          = document.getElementById("pickerClose");
  var stationSearch        = document.getElementById("stationSearch");
  var stationList          = document.getElementById("stationList");
  var pickerStatus         = document.getElementById("pickerStatus");

  /* ══════════════════════════════════════
     localStorage helpers
  ══════════════════════════════════════ */
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  var FAV_KEY      = "metro_fav_station";
  var STA_CACHE    = "metro_stations_cache";
  var STA_TTL      = 10 * 60 * 1000;
  var LAST_FROM    = "metro_last_from";

  var LINE_COLORS = {
    "Qırmızı xətt"   : "#e52222",
    "Yaşıl xətt"     : "#16a34a",
    "Bənövşəyi xətt" : "#7c3aed"
  };

  /* ══════════════════════════════════════
     USER DATA — localStorage-dan doldur
  ══════════════════════════════════════ */
  function getInitials(fullName) {
    if (!fullName) return "?";
    var parts = fullName.trim().split(/\s+/);
    return parts.map(function (p) { return p[0].toUpperCase(); }).slice(0, 2).join("");
  }

  function formatPhone(phone) {
    if (!phone) return "";
    var digits = phone.replace(/\D/g, "");
    /* +994 XX XXX XX XX */
    var m = digits.match(/^994(\d{2})(\d{3})(\d{2})(\d{2})$/);
    if (m) return "+994 " + m[1] + " " + m[2] + " " + m[3] + " " + m[4];
    return phone;
  }

  function loadUserData() {
    var raw = lsGet("metro_user");
    if (!raw) return;
    var user;
    try { user = JSON.parse(raw); } catch (e) { return; }

    var initials = getInitials(user.full_name);

    if (avatarInitials) avatarInitials.textContent = initials;
    if (avatarEl)       avatarEl.setAttribute("aria-label", (user.full_name || "Profil") + " profil şəkli");
    if (userNameEl)     userNameEl.textContent = user.full_name  || "–";
    if (userPhoneEl)    userPhoneEl.textContent = formatPhone(user.phone) || "–";
  }

  loadUserData();

  /* ══════════════════════════════════════
     Topbar scroll shadow
  ══════════════════════════════════════ */
  if (scrollArea) {
    scrollArea.addEventListener("scroll", function(){
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

  var saved  = lsGet("metro-profile-theme");
  var isDark = (saved === "dark")  ? true
             : (saved === "light") ? false
             : (function(){
                 try{ return window.matchMedia("(prefers-color-scheme:dark)").matches; }
                 catch(e){ return false; }
               })();

  function applyTheme() {
    if (isDark){ htmlEl.setAttribute("data-dark",""); }
    else       { htmlEl.removeAttribute("data-dark"); }
    if (themeIcon)     themeIcon.innerHTML = isDark ? SUN : MOON;
    if (themeBtn)      themeBtn.setAttribute("aria-label", isDark ? "İşıqlı moda keç" : "Qaranlıq moda keç");
    if (themeSubLabel) themeSubLabel.textContent = isDark ? "Qaranlıq" : "İşıqlı";
  }
  applyTheme();

  if (themeBtn) {
    themeBtn.addEventListener("click", function(){
      isDark = !isDark;
      applyTheme();
      lsSet("metro-profile-theme", isDark ? "dark" : "light");
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
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, ms);
  }

  /* ══════════════════════════════════════
     MENU ITEM ACTIONS
  ══════════════════════════════════════ */
  var MENU_MSGS = {
    "personal":       "Şəxsi məlumatlar açılır…",
    "payment":        "Ödəniş metodları açılır…",
    "history":        "Səfər tarixçəsi açılır…",
    "routes":         "Seçilmiş marşrutlar açılır…",
    "language":       "Dil seçimi açılır…",
    "security":       "Təhlükəsizlik parametrləri…",
    "accessibility":  "Ölçatanlıq parametrləri…",
    "appearance":     null,   /* handled separately */
    "notif-settings": "Bildiriş tənzimləmələri…",
    "support":        "Dəstək xidməti ilə əlaqə…",
  };

  menuItems.forEach(function(item){
    item.addEventListener("click", function(){
      var action = item.getAttribute("data-action");

      /* Görünüş → toggle dark mode */
      if (action === "appearance") {
        isDark = !isDark;
        applyTheme();
        lsSet("metro-profile-theme", isDark ? "dark" : "light");
        return;
      }

      var msg = MENU_MSGS[action];
      if (msg) showToast(msg);
    });

    /* Ripple press */
    item.addEventListener("pointerdown", function(){
      item.style.background = "var(--surface-2)";
    });
    item.addEventListener("pointerup", function(){
      setTimeout(function(){ item.style.background = ""; }, 200);
    });
    item.addEventListener("pointerleave", function(){
      item.style.background = "";
    });
  });

  /* ══════════════════════════════════════
     FAVORİT STANSİYA — quick card
  ══════════════════════════════════════ */
  function loadFavStation() {
    var raw = lsGet(FAV_KEY);
    if (!raw) return;
    try {
      var st = JSON.parse(raw);
      if (favoriteStationValue) favoriteStationValue.textContent = st.name || "Seçilməyib";
    } catch (e) {}
  }
  loadFavStation();

  /* ══════════════════════════════════════
     STATION PICKER
  ══════════════════════════════════════ */
  var allStations   = [];
  var selectedStaId = null;

  function openPicker() {
    if (!stationPickerOverlay) return;
    stationPickerOverlay.classList.add("show");
    document.body.style.overflow = "hidden";
    if (stationSearch) { stationSearch.value = ""; }
    fetchStations();
  }

  function closePicker() {
    if (!stationPickerOverlay) return;
    stationPickerOverlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  function fetchStations() {
    /* Cache yoxla */
    try {
      var entry = JSON.parse(lsGet(STA_CACHE) || "null");
      if (entry && Date.now() - entry.ts < STA_TTL && entry.data.length) {
        allStations = entry.data;
        renderStationList(allStations);
        return;
      }
    } catch (e) {}

    setPickerStatus("Yüklənir…");

    window.SmartMetroAPI.getStations()
      .then(function(res) {
        var body = res.data;
        if (body && body.success && body.data && body.data.stations) {
          allStations = body.data.stations.filter(function(s){ return s.is_active; });
          try { lsSet(STA_CACHE, JSON.stringify({ ts: Date.now(), data: allStations })); } catch(e){}
          renderStationList(allStations);
        } else {
          setPickerStatus((body && body.message) || "Stansiyalar yüklənmədi.");
        }
      })
      .catch(function(err) {
        var msg = (!navigator.onLine)
          ? "İnternet bağlantısı yoxdur."
          : (err.code === "ECONNABORTED" ? "Şəbəkə vaxtı bitdi." : "Xəta baş verdi.");
        setPickerStatus(msg);
      });
  }

  function setPickerStatus(msg) {
    if (!stationList) return;
    stationList.innerHTML = '<p class="picker-status">' + msg + '</p>';
  }

  function renderStationList(stations) {
    if (!stationList) return;

    /* Mövcud seçilmiş stansiya */
    var fav = null;
    try { fav = JSON.parse(lsGet(FAV_KEY) || "null"); } catch(e){}
    selectedStaId = fav ? String(fav.id) : null;

    /* Xəttlərə görə qruplaşdır */
    var groups = {};
    var order  = [];
    stations.forEach(function(st) {
      var line = st.line_name;
      if (!groups[line]) { groups[line] = []; order.push(line); }
      groups[line].push(st);
    });

    var html = "";
    order.forEach(function(line) {
      var color = LINE_COLORS[line] || "#999";
      html += '<div class="picker-group-label">' +
        '<span class="picker-line-dot" style="background:' + color + '"></span>' +
        line + '</div>';
      groups[line].forEach(function(st) {
        var isSel = String(st.id) === selectedStaId;
        html += '<button type="button" class="picker-item' + (isSel ? ' selected' : '') + '" data-id="' + st.id + '" data-name="' + st.name + '" data-line="' + st.line_name + '">' +
          '<span class="picker-line-dot" style="background:' + color + '"></span>' +
          '<span class="picker-item-name">' + st.name + '</span>' +
          '<svg class="picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</button>';
      });
    });

    stationList.innerHTML = html;

    stationList.querySelectorAll(".picker-item").forEach(function(btn) {
      btn.addEventListener("click", function() {
        selectStation({
          id        : parseInt(btn.getAttribute("data-id"), 10),
          name      : btn.getAttribute("data-name"),
          line_name : btn.getAttribute("data-line")
        });
      });
    });
  }

  function selectStation(st) {
    lsSet(FAV_KEY, JSON.stringify(st));
    lsSet(LAST_FROM, String(st.id));

    if (favoriteStationValue) favoriteStationValue.textContent = st.name;

    /* Vizual yenilə */
    stationList.querySelectorAll(".picker-item").forEach(function(btn) {
      var isSel = btn.getAttribute("data-id") === String(st.id);
      btn.classList.toggle("selected", isSel);
    });

    closePicker();
    showToast(st.name + " seçildi.");
  }

  /* Axtarış filteri */
  if (stationSearch) {
    stationSearch.addEventListener("input", function() {
      var q = stationSearch.value.trim().toLowerCase();
      var filtered = q
        ? allStations.filter(function(s){ return s.name.toLowerCase().indexOf(q) !== -1; })
        : allStations;
      renderStationList(filtered);
    });
  }

  /* Picker açma/bağlama */
  if (pickerClose) pickerClose.addEventListener("click", closePicker);
  if (stationPickerOverlay) {
    stationPickerOverlay.addEventListener("click", function(e) {
      if (e.target === stationPickerOverlay) closePicker();
    });
  }

  /* ══════════════════════════════════════
     QUICK CARDS
  ══════════════════════════════════════ */
  quickCards.forEach(function(card){
    card.addEventListener("click", function(){
      var action = card.getAttribute("data-action");
      if (action === "station") { openPicker(); return; }
      if (action === "notifications") { showToast("Bildirişlər aktivdir"); return; }
    });
    card.addEventListener("keydown", function(e){
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); card.click(); }
    });
  });

  /* ══════════════════════════════════════
     AVATAR EDIT
  ══════════════════════════════════════ */
  if (avatarEdit) {
    avatarEdit.addEventListener("click", function(){
      showToast("Profil şəkli dəyişdirilir…");
    });
    avatarEdit.addEventListener("keydown", function(e){
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); avatarEdit.click(); }
    });
  }

  /* ══════════════════════════════════════
     LOGOUT — bottom sheet
  ══════════════════════════════════════ */
  function openLogout() {
    if (!logoutOverlay) return;
    logoutOverlay.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeLogout() {
    if (!logoutOverlay) return;
    logoutOverlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  function doLogout() {
    closeLogout();
    try { localStorage.clear(); } catch (e) {}
    showToast("Çıxış edildi. Yönləndirilir…");
    setTimeout(function () {
      window.location.replace("../login/index.html");
    }, 1100);
  }

  if (logoutBtn)     logoutBtn.addEventListener("click", openLogout);
  if (logoutCancel)  logoutCancel.addEventListener("click", closeLogout);
  if (confirmLogout) confirmLogout.addEventListener("click", doLogout);

  if (logoutOverlay) {
    logoutOverlay.addEventListener("click", function (e) {
      if (e.target === logoutOverlay) closeLogout();
    });
  }

  /* ══════════════════════════════════════
     DELETE ACCOUNT — bottom sheet
  ══════════════════════════════════════ */
  function openConfirm() {
    if (!confirmOverlay) return;
    confirmOverlay.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeConfirm() {
    if (!confirmOverlay) return;
    confirmOverlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  if (deleteBtn)     deleteBtn.addEventListener("click", openConfirm);
  if (confirmCancel) confirmCancel.addEventListener("click", closeConfirm);

  if (confirmOverlay) {
    confirmOverlay.addEventListener("click", function(e){
      if (e.target === confirmOverlay) closeConfirm();
    });
  }

  if (confirmDel) {
    confirmDel.addEventListener("click", function(){
      closeConfirm();
      showToast("Hesab silindi. Yönləndirilir…", 3000);
      try { localStorage.clear(); } catch (e) {}
      setTimeout(function () {
        window.location.replace("../login/index.html");
      }, 1500);
    });
  }

  /* Escape key */
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") { closeConfirm(); closeLogout(); }
  });

  /* ══════════════════════════════════════
     BACK BUTTON
  ══════════════════════════════════════ */
  if (backBtn) {
    backBtn.addEventListener("click", function(){
      if (logoutOverlay && logoutOverlay.classList.contains("show")) {
        closeLogout();
      } else if (confirmOverlay && confirmOverlay.classList.contains("show")) {
        closeConfirm();
      } else if (window.history.length > 1) {
        window.history.back();
      } else {
        showToast("Ana səhifəyə qayıdılır…");
      }
    });
  }

  /* ══════════════════════════════════════
     BOTTOM NAV
  ══════════════════════════════════════ */
  navItems.forEach(function(item){
    item.addEventListener("click", function(){
      var href = item.getAttribute("data-href");
      if (href) { window.location.href = href; return; }
      navItems.forEach(function(n){
        n.classList.remove("active");
        n.removeAttribute("aria-current");
      });
      item.classList.add("active");
      item.setAttribute("aria-current","page");
    });
  });

})();