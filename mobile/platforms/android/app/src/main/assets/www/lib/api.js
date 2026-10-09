(function (win) {
  'use strict';

  var BASE_URL = 'https://smartmetro.hewart.az/api/';
  var GUIDANCE_FALLBACK_TOKEN = 'cbd0da1657bb97748db6aef993140b3c7b8b186165d052b1b42dc64c4471aa55';

  // ── LocalStorage açarları ──────────────────────────────────
  var KEYS = {
    token  : 'metro_token',
    type   : 'metro_token_type',
    expiry : 'metro_token_expiry',
    user   : 'metro_user'
  };

  // ── Auth köməkçiləri ───────────────────────────────────────
  var Auth = {
    setSession: function (data) {
      var exp = new Date();
      exp.setDate(exp.getDate() + (data.expires_in_days || 30));
      localStorage.setItem(KEYS.token,  data.token);
      localStorage.setItem(KEYS.type,   data.token_type || 'Bearer');
      localStorage.setItem(KEYS.expiry, exp.toISOString());
      localStorage.setItem(KEYS.user,   JSON.stringify(data.user));
    },

    getToken: function () {
      return localStorage.getItem(KEYS.token) || null;
    },

    getUser: function () {
      try {
        return JSON.parse(localStorage.getItem(KEYS.user));
      } catch (e) {
        return null;
      }
    },

    isLoggedIn: function () {
      var token  = this.getToken();
      var expiry = localStorage.getItem(KEYS.expiry);
      if (!token) return false;
      if (expiry && new Date(expiry) < new Date()) {
        this.clear();
        return false;
      }
      return true;
    },

    clear: function () {
      Object.keys(KEYS).forEach(function (k) {
        localStorage.removeItem(KEYS[k]);
      });
    }
  };

  // ── Axios instance ─────────────────────────────────────────
  var http = axios.create({
    baseURL : BASE_URL,
    timeout : 15000,
    headers : { 'Content-Type': 'application/json' }
  });

  // Token-i hər sorğuya əlavə et
  http.interceptors.request.use(function (cfg) {
    var t = Auth.getToken();
    if (t) cfg.headers['Authorization'] = 'Bearer ' + t;
    return cfg;
  });

  // 401 gələrsə sessiyanı təmizlə — auth endpoint-ləri istisna
  http.interceptors.response.use(
    function (res) { return res; },
    function (err) {
      if (err.response && err.response.status === 401) {
        var url = (err.config && err.config.url) || '';
        var isAuthEndpoint = /login\.php|register\.php|forgot_password\.php|OTP\.php|reset_password\.php/i.test(url);
        if (!isAuthEndpoint) {
          Auth.clear();
          win.location.href = '../login/index.html';
        }
      }
      return Promise.reject(err);
    }
  );

  // ── Cihaz adı ──────────────────────────────────────────────
  function getDeviceName() {
    var ua = navigator.userAgent;
    if (/iPhone/i.test(ua))  return 'iPhone';
    if (/iPad/i.test(ua))    return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    return 'Web Browser';
  }

  // ── API metodları ──────────────────────────────────────────
  var API = {
    register: function (fullName, phone, password, termsAccepted) {
      return http.post('/register.php', {
        full_name      : fullName,
        phone          : phone,
        password       : password,
        terms_accepted : termsAccepted,
        device_name    : getDeviceName()
      });
    },

    login: function (phone, password) {
      return http.post('/login.php', {
        phone       : phone,
        password    : password,
        device_name : getDeviceName()
      });
    },

    forgotPassword: function (phone) {
      return http.post('/forgot_password.php', {
        action : 'request_code',
        phone  : phone
      });
    },

    verifyOtp: function (phone, otp) {
      return http.post('/OTP.php', {
        phone       : phone,
        otp         : otp,
        device_name : getDeviceName()
      });
    },

    resetPassword: function (token, newPassword, confirmPassword) {
      return http.post('/reset_password.php', {
        token            : token,
        new_password     : newPassword,
        confirm_password : confirmPassword
      });
    },

    getNotifications: function (tab) {
      return http.post('/notifications.php', {
        action : 'list',
        token  : Auth.getToken(),
        tab    : tab || 'all'
      });
    },

    getHome: function () {
      return http.post('/home.php', {
        token : Auth.getToken()
      });
    },

    getStations: function () {
      return http.post('/stations.php', {
        action : 'list'
      });
    },

    getRoute: function (fromId, toId, routeType, avoidId) {
      var payload = {
        token           : Auth.getToken(),
        from_station_id : fromId,
        to_station_id   : toId,
        route_type      : routeType || 'optimal'
      };
      if (avoidId) payload.avoid_station_id = avoidId;
      return http.post('/route.php', payload);
    },

    getLiveTracking: function (stationId, trainNumber) {
      return http.post('/live_tracking.php', {
        token        : Auth.getToken(),
        station_id   : Number(stationId),
        train_number : trainNumber || 'T-001'
      });
    },

    getGuidance: function (stationId, wagonNumber) {
      return http.post('/guidance.php', {
        token        : Auth.getToken() || GUIDANCE_FALLBACK_TOKEN,
        station_id   : Number(stationId),
        wagon_number : Number(wagonNumber)
      });
    },

    startTrip: function (fromId, toId, routeSnapshot) {
      return http.post('/trip.php', {
        action          : 'start_trip',
        token           : Auth.getToken(),
        from_station_id : Number(fromId),
        to_station_id   : Number(toId),
        route_snapshot  : routeSnapshot || null
      });
    },

    updateTripStep: function (stepOrder, currentStationId) {
      return http.post('/trip.php', {
        action             : 'update_step',
        token              : Auth.getToken(),
        active_step_order  : Number(stepOrder),
        current_station_id : currentStationId ? Number(currentStationId) : null
      });
    },

    getActiveTrip: function () {
      return http.post('/trip.php', {
        action : 'get_active_trip',
        token  : Auth.getToken()
      });
    },

    completeTrip: function () {
      return http.post('/trip.php', {
        action : 'complete_trip',
        token  : Auth.getToken()
      });
    },

    cancelTrip: function () {
      return http.post('/trip.php', {
        action : 'cancel_trip',
        token  : Auth.getToken()
      });
    }
  };

  // ── Qlobal əlçatımlılıq ────────────────────────────────────
  win.SmartMetroAPI  = API;
  win.SmartMetroAuth = Auth;

})(window);
