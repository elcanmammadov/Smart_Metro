(function () {
  "use strict";

  /* ══════════════════════════════════════
     Refs
  ══════════════════════════════════════ */
  var htmlEl        = document.documentElement;
  var themeBtn      = document.getElementById("themeBtn");
  var themeIcon     = document.getElementById("themeIcon");
  var backBtn       = document.getElementById("backBtn");
  var toastEl       = document.getElementById("toast");
  var scrollArea    = document.getElementById("scrollArea");
  var topbar        = document.getElementById("topbar");
  var navItems      = document.querySelectorAll(".nav-item");
  var tabBtns       = document.querySelectorAll(".tab-btn");
  var emptyState    = document.getElementById("emptyState");
  var unreadDot     = document.getElementById("unreadDot");
  var notifSections = document.getElementById("notifSections");
  var notifLoading  = document.getElementById("notifLoading");
  var modalBackdrop  = document.getElementById("modalBackdrop");
  var notifModal     = document.getElementById("notifModal");
  var modalClose     = document.getElementById("modalClose");
  var modalIconWrap  = document.getElementById("modalIconWrap");
  var modalTitle     = document.getElementById("modalTitle");
  var modalBodyFull  = document.getElementById("modalBodyFull");
  var modalActionBtn = document.getElementById("modalActionBtn");

  /* ══════════════════════════════════════
     localStorage helpers
  ══════════════════════════════════════ */
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  /* ══════════════════════════════════════
     Cache  (5 dəq TTL)
  ══════════════════════════════════════ */
  var CACHE_KEY = "metro_notif_cache";
  var LOGS_KEY  = "metro_notif_logs";
  var CACHE_TTL = 5 * 60 * 1000;

  function getCached(tab) {
    try {
      var cache = JSON.parse(lsGet(CACHE_KEY) || "{}");
      var entry = cache[tab];
      if (!entry || Date.now() - entry.ts > CACHE_TTL) return null;
      return entry.data;
    } catch (e) { return null; }
  }

  function setCache(tab, data) {
    try {
      var cache = JSON.parse(lsGet(CACHE_KEY) || "{}");
      cache[tab] = { ts: Date.now(), data: data };
      lsSet(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  function addLog(tab, success, message) {
    try {
      var logs = JSON.parse(lsGet(LOGS_KEY) || "[]");
      logs.unshift({ time: new Date().toISOString(), tab: tab, success: success, message: message });
      if (logs.length > 20) logs.length = 20;
      lsSet(LOGS_KEY, JSON.stringify(logs));
    } catch (e) {}
  }

  /* ══════════════════════════════════════
     Topbar scroll shadow
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

  var saved  = lsGet("metro-notif-theme");
  var isDark = saved === "dark" ? true
    : saved === "light" ? false
    : (function () {
        try { return window.matchMedia("(prefers-color-scheme:dark)").matches; }
        catch (e) { return false; }
      })();

  function applyTheme() {
    if (isDark) { htmlEl.setAttribute("data-dark", ""); }
    else        { htmlEl.removeAttribute("data-dark"); }
    if (themeIcon) themeIcon.innerHTML = isDark ? SUN : MOON;
    if (themeBtn)  themeBtn.setAttribute("aria-label", isDark ? "İşıqlı moda keç" : "Qaranlıq moda keç");
  }
  applyTheme();

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      isDark = !isDark;
      applyTheme();
      lsSet("metro-notif-theme", isDark ? "dark" : "light");
    });
  }

  /* ══════════════════════════════════════
     Toast
  ══════════════════════════════════════ */
  var toastTimer = null;
  function showToast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, ms || 2600);
  }

  /* ══════════════════════════════════════
     API data → UI mapping
     icon_key  : train | bell | check | warning | megaphone | info
     color_key : green | blue | yellow | purple
     ui_type   : route_info | reminder | trip_completed | alert | campaign | system
  ══════════════════════════════════════ */
  var COLOR_VAR = {
    green  : "var(--green)",
    blue   : "var(--blue)",
    yellow : "var(--amber)",
    purple : "var(--purple)"
  };

  /* icon_key → SVG path (colour injected at runtime) */
  function iconSVG(iconKey, color) {
    var c = color || "var(--blue)";
    var paths = {
      train:
        '<rect x="3" y="4" width="18" height="13" rx="3"/>' +
        '<path d="M3 11h18"/><path d="M8 17v2M16 17v2"/>' +
        '<rect x="7" y="7" width="4" height="3" rx="1"/>' +
        '<rect x="13" y="7" width="4" height="3" rx="1"/>',
      bell:
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      check:
        '<polyline points="20 6 9 17 4 12"/>',
      warning: null,          /* special: fill-based, handled below */
      megaphone:
        '<path d="M3 11v2a1 1 0 0 0 1 1h2l3 4v-10l-3 3H4a1 1 0 0 0-1 1z"/>' +
        '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
        '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
      info:
        '<circle cx="12" cy="12" r="10"/>' +
        '<line x1="12" y1="8" x2="12" y2="12"/>' +
        '<line x1="12" y1="16" x2="12.01" y2="16"/>'
    };

    if (iconKey === "warning") {
      return (
        '<svg viewBox="0 0 24 24" fill="none">' +
          '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="' + c + '"/>' +
          '<line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
          '<line x1="12" y1="17" x2="12.01" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>'
      );
    }

    var inner = paths[iconKey] || paths.info;
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        inner +
      '</svg>'
    );
  }

  /* ui_type → card CSS class */
  var UI_CARD_CLASS = {
    route_info     : "type-route",
    reminder       : "type-bell",
    trip_completed : "type-ok",
    alert          : "type-warn",
    campaign       : "type-promo",
    system         : "type-info"
  };

  /* ui_type → icon container CSS class */
  var UI_ICON_CLASS = {
    route_info     : "icon-route",
    reminder       : "icon-bell",
    trip_completed : "icon-ok",
    alert          : "icon-warn",
    campaign       : "icon-promo",
    system         : "icon-info"
  };

  /* id → notif obyekti (modal üçün) */
  var notifStore = {};

  var DELETE_BG =
    '<div class="notif-delete-bg" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
    '<path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></div>';

  /* ══════════════════════════════════════
     HTML escape
  ══════════════════════════════════════ */
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ══════════════════════════════════════
     Build one notification card
     API fields used:
       id, title, description, type, ui_type,
       icon_key, color_key, is_unread, time_text
  ══════════════════════════════════════ */
  function buildCard(notif) {
    if (notif.id != null) notifStore[String(notif.id)] = notif;
    var uiType    = notif.ui_type   || "system";
    var iconKey   = notif.icon_key  || "info";
    var colorKey  = notif.color_key || "blue";
    var isUnread  = notif.is_unread === true;
    var typeVal   = notif.type      || "system";   /* for data-type filter */
    var color     = COLOR_VAR[colorKey] || "var(--blue)";
    var cardClass = UI_CARD_CLASS[uiType] || "type-info";
    var iconClass = UI_ICON_CLASS[uiType] || "icon-info";
    var title     = esc(notif.title       || "Bildiriş");
    var body      = esc(notif.description || "");
    var time      = esc(notif.time_text   || "");

    return (
      '<div class="notif-card-wrap">' +
        DELETE_BG +
        '<div class="notif-card ' + cardClass + (isUnread ? " unread" : "") + '"' +
          ' data-id="'    + esc(notif.id || "") + '"' +
          ' data-type="'  + esc(typeVal)        + '"' +
          ' data-unread="'+ (isUnread ? "true" : "false") + '"' +
          ' role="button" tabindex="0"' +
          ' aria-label="' + title + ' bildirişi">' +
          '<div class="notif-icon ' + iconClass + '">' +
            iconSVG(iconKey, color) +
          '</div>' +
          '<div class="notif-content">' +
            '<div class="notif-top">' +
              '<span class="notif-title">' + title + '</span>' +
              '<span class="notif-time">'  + time  + '</span>' +
            '</div>' +
            '<p class="notif-body">' + body + '</p>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ══════════════════════════════════════
     Unread dot
  ══════════════════════════════════════ */
  function updateUnreadDot(count) {
    if (!unreadDot) return;
    if (count !== undefined) {
      unreadDot.style.display = count > 0 ? "inline-block" : "none";
      return;
    }
    var n = notifSections
      ? notifSections.querySelectorAll('.notif-card[data-unread="true"]').length
      : 0;
    unreadDot.style.display = n > 0 ? "inline-block" : "none";
  }

  /* ══════════════════════════════════════
     Tab count badges
  ══════════════════════════════════════ */
  function syncTabCounts(tabs, unreadCount) {
    if (unreadCount !== undefined) updateUnreadDot(unreadCount);
    if (!tabs) return;

    tabBtns.forEach(function (btn) {
      var filter = btn.getAttribute("data-filter");
      var found  = null;
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].key === filter) { found = tabs[i]; break; }
      }
      if (!found) return;

      /* Update or create count badge (skip unread tab — it already has the dot) */
      if (filter === "unread") return;

      var badge = btn.querySelector(".tab-count");
      if (found.count > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "tab-count";
          btn.appendChild(badge);
        }
        badge.textContent = found.count;
      } else if (badge) {
        badge.remove();
      }
    });
  }

  /* ══════════════════════════════════════
     Filter
  ══════════════════════════════════════ */
  var activeFilter = "all";

  function applyFilter(filter) {
    activeFilter = filter;
    if (!notifSections) return;
    var visible = 0;

    notifSections.querySelectorAll(".notif-card").forEach(function (card) {
      var wrap   = card.closest(".notif-card-wrap");
      var type   = card.getAttribute("data-type") || "";
      var unread = card.getAttribute("data-unread") === "true";
      var show   = filter === "all"
        || (filter === "unread" && unread)
        || (filter === "system" && type === "system");

      if (wrap) wrap.style.display = show ? "" : "none";
      if (show) visible++;
    });

    notifSections.querySelectorAll(".notif-section").forEach(function (sec) {
      var any = false;
      sec.querySelectorAll(".notif-card-wrap").forEach(function (w) {
        if (w.style.display !== "none") any = true;
      });
      sec.style.display = any ? "" : "none";
    });

    if (emptyState) emptyState.classList.toggle("visible", visible === 0);
  }

  /* ══════════════════════════════════════
     MODAL
  ══════════════════════════════════════ */
  var ACTION_LABEL = {
    route_info     : "Alternativ marşruta bax",
    alert          : "Alternativ marşrut göstər",
    campaign       : "Kampaniyaya bax",
    reminder       : "",
    trip_completed : "",
    system         : ""
  };

  function openModal(notif) {
    var uiType   = notif.ui_type   || "system";
    var iconKey  = notif.icon_key  || "info";
    var colorKey = notif.color_key || "blue";
    var color    = COLOR_VAR[colorKey] || "var(--blue)";

    /* İkon */
    modalIconWrap.className = "modal-icon-large";
    modalIconWrap.innerHTML = iconSVG(iconKey, color);

    /* Başlıq və mətn */
    modalTitle.textContent    = notif.title       || "";
    modalBodyFull.textContent = notif.description || "";

    /* Ətraflı düymə */
    var actionLabel = notif.action_label || ACTION_LABEL[uiType] || "";
    if (modalActionBtn) {
      if (actionLabel) {
        modalActionBtn.textContent = actionLabel;
        modalActionBtn.removeAttribute("data-hidden");
        modalActionBtn.style.display = "";
      } else {
        modalActionBtn.textContent = "";
        modalActionBtn.setAttribute("data-hidden", "true");
        modalActionBtn.style.display = "none";
      }
    }

    /* Aç */
    modalBackdrop.classList.add("open");
    notifModal.classList.add("open");
    notifModal.focus();
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modalBackdrop.classList.remove("open");
    notifModal.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (modalClose)    modalClose.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && notifModal.classList.contains("open")) closeModal();
  });

  /* ══════════════════════════════════════
     Card events: click + keyboard + swipe
  ══════════════════════════════════════ */
  function bindCards(container) {
    var SWIPE = 80;

    container.querySelectorAll(".notif-card").forEach(function (card) {
      var wrap = card.closest(".notif-card-wrap");

      card.addEventListener("click", function () {
        var id    = String(card.getAttribute("data-id") || "");
        var notif = notifStore[id];

        /* Oxunmuş et */
        if (card.getAttribute("data-unread") === "true") {
          card.setAttribute("data-unread", "false");
          card.classList.remove("unread");
          if (notif) notif.is_unread = false;
          updateUnreadDot();
        }

        /* Modala aç */
        if (notif) {
          openModal(notif);
        } else {
          var titleEl = card.querySelector(".notif-title");
          showToast((titleEl ? titleEl.textContent : "Bildiriş") + " açıldı.");
        }
      });

      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
      });

      var pressTimer = null;
      card.addEventListener("pointerdown",  function () {
        pressTimer = setTimeout(function () {
          if (wrap) wrap.classList.add("swiping");
        }, 500);
      });
      card.addEventListener("pointerup",     function () { clearTimeout(pressTimer); });
      card.addEventListener("pointercancel", function () { clearTimeout(pressTimer); });

      if (!wrap) return;
      var startX = 0, curX = 0, dragging = false;

      card.addEventListener("touchstart", function (e) {
        startX = e.touches[0].clientX;
        curX   = startX;
        dragging = true;
      }, { passive: true });

      card.addEventListener("touchmove", function (e) {
        if (!dragging) return;
        curX = e.touches[0].clientX;
        var dx = startX - curX;
        if (dx > 10) {
          card.style.transform  = "translateX(-" + Math.min(dx, SWIPE + 20) + "px)";
          card.style.transition = "none";
          wrap.classList.toggle("swiping", dx > 40);
        }
      }, { passive: true });

      card.addEventListener("touchend", function () {
        dragging = false;
        var dx = startX - curX;
        card.style.transition = "";
        if (dx >= SWIPE) {
          card.style.transform = "translateX(-110%)";
          card.style.opacity   = "0";
          setTimeout(function () {
            wrap.style.maxHeight  = wrap.offsetHeight + "px";
            wrap.style.transition = "max-height .3s var(--ease),opacity .3s ease,margin .3s ease";
            requestAnimationFrame(function () {
              wrap.style.maxHeight    = "0";
              wrap.style.opacity      = "0";
              wrap.style.marginBottom = "0";
            });
            setTimeout(function () {
              wrap.remove();
              updateUnreadDot();
              applyFilter(activeFilter);
              showToast("Bildiriş silindi.");
            }, 320);
          }, 200);
        } else {
          card.style.transform = "";
          wrap.classList.remove("swiping");
        }
      });
    });
  }

  /* ══════════════════════════════════════
     Render notifications
     Prefers groups[] array; falls back to
     flat notifications[] array.
  ══════════════════════════════════════ */
  function render(data) {
    if (!notifSections) return;
    notifSections.innerHTML = "";
    notifStore = {};
    var hasContent = false;

    if (data.groups && data.groups.length > 0) {
      data.groups.forEach(function (group) {
        if (!group.notifications || !group.notifications.length) return;
        hasContent = true;
        var sec  = document.createElement("div");
        sec.className = "notif-section";
        sec.setAttribute("data-group", group.key || "");
        var html = '<p class="section-label">' + esc(group.title || group.label || "") + "</p>";
        group.notifications.forEach(function (n) { html += buildCard(n); });
        sec.innerHTML = html;
        notifSections.appendChild(sec);
        bindCards(sec);
      });
    } else if (data.notifications && data.notifications.length > 0) {
      hasContent = true;
      var sec  = document.createElement("div");
      sec.className = "notif-section";
      var html = "";
      data.notifications.forEach(function (n) { html += buildCard(n); });
      sec.innerHTML = html;
      notifSections.appendChild(sec);
      bindCards(sec);
    }

    if (emptyState) emptyState.classList.toggle("visible", !hasContent);
    updateUnreadDot();
    applyFilter(activeFilter);
  }

  /* ══════════════════════════════════════
     Loading skeleton
  ══════════════════════════════════════ */
  function setLoading(on) {
    if (notifLoading)  notifLoading.style.display  = on ? "block" : "none";
    if (notifSections) notifSections.style.display = on ? "none"  : "";
    if (on && emptyState) emptyState.classList.remove("visible");
  }

  /* ══════════════════════════════════════
     Fetch from API
  ══════════════════════════════════════ */
  function load(tab, force) {
    tab = tab || "all";

    if (!window.SmartMetroAuth || !window.SmartMetroAuth.isLoggedIn()) {
      showToast("Sessiya başa çatıb, yenidən daxil olun.");
      setTimeout(function () { window.location.href = "../login/index.html"; }, 1500);
      return;
    }

    if (!force) {
      var cached = getCached(tab);
      if (cached) {
        render(cached);
        syncTabCounts(cached.tabs, cached.unread_count);
        return;
      }
    }

    setLoading(true);

    window.SmartMetroAPI.getNotifications(tab)
      .then(function (res) {
        setLoading(false);
        var body = res.data;

        if (body && body.success) {
          setCache(tab, body.data);
          addLog(tab, true, body.message || "OK");
          render(body.data);
          syncTabCounts(body.data.tabs, body.data.unread_count);
        } else {
          var msg = (body && body.message) || "Bildirişlər yüklənmədi.";
          addLog(tab, false, msg);
          showToast(msg);
          if (/deaktiv|token/i.test(msg)) {
            if (window.SmartMetroAuth) window.SmartMetroAuth.clear();
            setTimeout(function () { window.location.href = "../login/index.html"; }, 1500);
          } else {
            render({ notifications: [], groups: [] });
          }
        }
      })
      .catch(function (err) {
        setLoading(false);
        var msg;
        if (err.code === "ECONNABORTED") {
          msg = "Şəbəkə vaxtı bitdi. Yenidən cəhd edin.";
        } else if (!navigator.onLine) {
          msg = "İnternet bağlantısı yoxdur.";
        } else if (err.response && err.response.data && err.response.data.message) {
          msg = err.response.data.message;
        } else {
          msg = "Bildirişlər yüklənərkən xəta baş verdi.";
        }
        addLog(tab, false, msg);
        showToast(msg);
        render({ notifications: [], groups: [] });
      });
  }

  /* ══════════════════════════════════════
     Tab buttons
  ══════════════════════════════════════ */
  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabBtns.forEach(function (b) {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      load(btn.getAttribute("data-filter"));
    });
  });

  /* ══════════════════════════════════════
     Back button
  ══════════════════════════════════════ */
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      if (window.history.length > 1) { window.history.back(); }
      else { window.location.href = "../home/index.html"; }
    });
  }

  /* ══════════════════════════════════════
     Bottom nav
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
     Init
  ══════════════════════════════════════ */
  load(activeFilter);

})();
