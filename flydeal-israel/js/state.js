/*
 * state.js — ניהול מצב פשוט (Store עם pub/sub) + התמדה ב-LocalStorage
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils;
  var KEYS = {
    favorites: "fd_favorites",
    history: "fd_search_history",
    theme: "fd_theme",
    settings: "fd_settings"
  };

  var listeners = [];

  var state = {
    // מצב נתונים כללי
    dataMode: "mock",

    // טאב פעיל: flights | hotels | packages
    activeTab: "flights",

    // הגדרות (נשמרות)
    settings: Utils.storageGet(KEYS.settings, {
      currency: "ILS",
      airlinePolicy: "priority",   // all | israeli | priority
      theme: "light"
    }),

    // תוצאות + מצב תצוגה
    flights: { raw: [], filtered: [], status: "idle", params: null }, // idle|loading|done|error|empty
    hotels: { raw: [], filtered: [], status: "idle", params: null },
    packages: { raw: [], filtered: [], status: "idle", params: null },

    // סינון ומיון (לכל טאב)
    flightFilters: {},
    flightSort: "best",
    hotelFilters: {},
    hotelSort: "best",

    view: (FD_CONFIGSafe().ui && FD_CONFIGSafe().ui.defaultView) || "grid",  // grid | list
    page: { flights: 1, hotels: 1 },

    // השוואה (עד 3)
    compare: { type: null, ids: [] },

    // מועדפים והיסטוריה (נשמרים)
    favorites: Utils.storageGet(KEYS.favorites, []),          // [{id, type, snapshot}]
    history: Utils.storageGet(KEYS.history, [])               // [{type, params, at}]
  };

  function FD_CONFIGSafe() { return window.FD_CONFIG || {}; }

  function emit(action) {
    listeners.forEach(function (fn) {
      try { fn(state, action); } catch (e) { /* לא לשבור מאזינים אחרים */ }
    });
  }

  var Store = {
    get: function () { return state; },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    },

    set: function (patch, action) {
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      emit(action || "set");
    },

    /* ---------- הגדרות ---------- */
    updateSettings: function (patch) {
      state.settings = Object.assign({}, state.settings, patch);
      Utils.storageSet(KEYS.settings, state.settings);
      emit("settings");
    },

    /* ---------- ערכת נושא ---------- */
    setTheme: function (theme) {
      state.settings.theme = theme;
      Utils.storageSet(KEYS.settings, state.settings);
      emit("theme");
    },
    initialTheme: function () {
      if (state.settings && state.settings.theme) return state.settings.theme;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
      return "light";
    },

    /* ---------- מועדפים ---------- */
    isFavorite: function (id) {
      return state.favorites.some(function (f) { return f.id === id; });
    },
    toggleFavorite: function (item) {
      if (Store.isFavorite(item.id)) {
        state.favorites = state.favorites.filter(function (f) { return f.id !== item.id; });
      } else {
        state.favorites = state.favorites.concat([{
          id: item.id, type: item.type, snapshot: item, savedAt: new Date().toISOString()
        }]);
      }
      Utils.storageSet(KEYS.favorites, state.favorites);
      emit("favorites");
      return Store.isFavorite(item.id);
    },
    clearFavorites: function () {
      state.favorites = [];
      Utils.storageSet(KEYS.favorites, state.favorites);
      emit("favorites");
    },

    /* ---------- היסטוריית חיפוש ---------- */
    addHistory: function (type, params) {
      var entry = { type: type, params: params, at: new Date().toISOString() };
      // מניעת כפילות רצופה
      state.history = [entry].concat(state.history).slice(0, 8);
      Utils.storageSet(KEYS.history, state.history);
      emit("history");
    },
    clearHistory: function () {
      state.history = [];
      Utils.storageSet(KEYS.history, state.history);
      emit("history");
    },

    /* ---------- השוואה ---------- */
    toggleCompare: function (type, id) {
      if (state.compare.type && state.compare.type !== type) {
        // מעבר סוג משווה — איפוס
        state.compare = { type: type, ids: [] };
      }
      state.compare.type = type;
      var idx = state.compare.ids.indexOf(id);
      if (idx > -1) {
        state.compare.ids.splice(idx, 1);
      } else {
        if (state.compare.ids.length >= 3) { emit("compare-full"); return false; }
        state.compare.ids.push(id);
      }
      if (state.compare.ids.length === 0) state.compare.type = null;
      emit("compare");
      return true;
    },
    inCompare: function (id) { return state.compare.ids.indexOf(id) > -1; },
    clearCompare: function () { state.compare = { type: null, ids: [] }; emit("compare"); }
  };

  FD.Store = Store;
  FD.STORAGE_KEYS = KEYS;
})(window.FD = window.FD || {});
