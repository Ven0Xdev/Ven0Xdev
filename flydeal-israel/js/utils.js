/*
 * utils.js — פונקציות עזר כלליות
 * FlyDeal Israel
 *
 * מבנה: כל מודול מצרף עצמו אל מרחב השמות הגלובלי window.FD
 * כדי שהפרויקט יעבוד בפתיחה ישירה של index.html (file://) ללא ES Modules.
 */
(function (FD) {
  "use strict";

  var Utils = {};

  /* ---------- בטיחות ומחרוזות ---------- */

  // ניקוי קלט משתמש בסיסי (הסרת תווים מסוכנים)
  Utils.sanitize = function (value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[<>]/g, "").trim();
  };

  // בריחת HTML למניעת XSS כאשר בכל זאת נדרש שילוב טקסט
  Utils.escapeHtml = function (value) {
    if (value === null || value === undefined) return "";
    var div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  };

  /* ---------- יצירת אלמנטים בטוחה (ללא innerHTML עם מידע לא מאומת) ---------- */

  // el('div', {class:'x', 'aria-label':'...'}, [children|string])
  Utils.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === null || val === undefined || val === false) return;
        if (key === "class") {
          node.className = val;
        } else if (key === "dataset") {
          Object.keys(val).forEach(function (dk) {
            node.dataset[dk] = val[dk];
          });
        } else if (key === "on" && typeof val === "object") {
          Object.keys(val).forEach(function (evt) {
            node.addEventListener(evt, val[evt]);
          });
        } else if (key === "html") {
          // שימוש מבוקר בלבד עם תוכן שאנחנו יוצרים (אייקונים SVG)
          node.innerHTML = val;
        } else if (key in node && key !== "list" && key !== "style") {
          try { node[key] = val; } catch (e) { node.setAttribute(key, val); }
        } else {
          node.setAttribute(key, val);
        }
      });
    }
    Utils.append(node, children);
    return node;
  };

  Utils.append = function (node, children) {
    if (children === null || children === undefined) return node;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (typeof child === "string" || typeof child === "number") {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    });
    return node;
  };

  Utils.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  Utils.qs = function (sel, root) { return (root || document).querySelector(sel); };
  Utils.qsa = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------- תאריכים (פורמט ישראלי) ---------- */

  Utils.pad = function (n) { return n < 10 ? "0" + n : "" + n; };

  // YYYY-MM-DD -> Date (מקומי)
  Utils.parseDate = function (str) {
    if (!str) return null;
    if (str instanceof Date) return str;
    var parts = String(str).split("T")[0].split("-");
    if (parts.length !== 3) return new Date(str);
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  };

  Utils.toInputDate = function (date) {
    return date.getFullYear() + "-" + Utils.pad(date.getMonth() + 1) + "-" + Utils.pad(date.getDate());
  };

  Utils.addDays = function (date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  };

  // פורמט תאריך ישראלי: יום קצר + DD/MM
  Utils.formatDateHe = function (dateInput) {
    var d = dateInput instanceof Date ? dateInput : Utils.parseDate(dateInput);
    if (!d || isNaN(d)) return "";
    try {
      return new Intl.DateTimeFormat("he-IL", {
        weekday: "short", day: "2-digit", month: "2-digit", year: "numeric"
      }).format(d);
    } catch (e) {
      return Utils.pad(d.getDate()) + "/" + Utils.pad(d.getMonth() + 1) + "/" + d.getFullYear();
    }
  };

  // פורמט תאריך + שעה מלא (לעדכון מחיר)
  Utils.formatDateTimeHe = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    try {
      return new Intl.DateTimeFormat("he-IL", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      }).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  };

  // שעה מתוך ISO
  Utils.formatTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return Utils.pad(d.getHours()) + ":" + Utils.pad(d.getMinutes());
  };

  // "לפני X דקות/שעות" — זמן עדכון מחיר
  Utils.timeAgoHe = function (iso) {
    var diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return "";
    var min = Math.round(diff / 60000);
    if (min < 1) return "עודכן הרגע";
    if (min < 60) return "עודכן לפני " + min + " דק׳";
    var hours = Math.round(min / 60);
    if (hours < 24) return "עודכן לפני " + hours + " שע׳";
    var days = Math.round(hours / 24);
    return "עודכן לפני " + days + " ימים";
  };

  // משך זמן בדקות -> "5ש 40ד"
  Utils.formatDuration = function (minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (h === 0) return m + "ד";
    if (m === 0) return h + "ש";
    return h + "ש " + m + "ד";
  };

  Utils.isSameOrAfter = function (a, b) {
    var da = Utils.parseDate(a), db = Utils.parseDate(b);
    return da.getTime() >= db.getTime();
  };

  /* ---------- מספרים ומטבע ---------- */

  Utils.roundPrice = function (value) { return Math.round(value); };

  // עיצוב מטבע באמצעות Intl.NumberFormat
  Utils.formatCurrency = function (amount, currency) {
    currency = currency || "ILS";
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency", currency: currency, maximumFractionDigits: 0
      }).format(Utils.roundPrice(amount));
    } catch (e) {
      return Utils.roundPrice(amount) + " " + currency;
    }
  };

  Utils.formatNumber = function (num) {
    try { return new Intl.NumberFormat("he-IL").format(num); }
    catch (e) { return "" + num; }
  };

  /* ---------- Debounce ---------- */

  Utils.debounce = function (fn, wait) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 250);
    };
  };

  /* ---------- אחסון מקומי בטוח ---------- */

  Utils.storageGet = function (key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };

  Utils.storageSet = function (key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  };

  Utils.uid = function () {
    return "id-" + Math.random().toString(36).slice(2, 9);
  };

  FD.Utils = Utils;
})(window.FD = window.FD || {});
