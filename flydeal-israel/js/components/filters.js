/*
 * filters.js — פאנל סינון + מיון לטיסות ולמלונות (עם Debounce)
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons, FS = FD.FlightsService, HS = FD.HotelsService;

  /* ---------- אפשרויות מיון ---------- */
  var FLIGHT_SORTS = [
    { value: "best", label: "העסקה המומלצת" },
    { value: "price", label: "המחיר הסופי הנמוך ביותר" },
    { value: "duration", label: "הטיסה הקצרה ביותר" },
    { value: "depart", label: "שעת יציאה" },
    { value: "arrive", label: "שעת נחיתה" },
    { value: "stops", label: "מספר עצירות" },
    { value: "baggage", label: "כולל מזוודה תחילה" },
    { value: "israeli", label: "חברות ישראליות תחילה" }
  ];
  var HOTEL_SORTS = [
    { value: "best", label: "התמורה הטובה ביותר" },
    { value: "price", label: "המחיר הסופי הנמוך ביותר" },
    { value: "rating", label: "דירוג האורחים הגבוה ביותר" },
    { value: "distance", label: "הקרוב ביותר למרכז" },
    { value: "stars", label: "מספר הכוכבים" },
    { value: "popular", label: "הפופולריים ביותר" }
  ];

  /* ---------- החלת סינון + מיון ---------- */
  function applyFlights(raw, filters, sort, passengers) {
    var out = raw.filter(function (f) {
      var price = FS.Pricing.total(FS.Pricing.perPerson(f.pricing), passengers);
      if (filters.priceMax != null && price > filters.priceMax) return false;
      if (filters.airlines && filters.airlines.length && filters.airlines.indexOf(f.airline.code) === -1) return false;
      if (filters.directOnly && !f.direct) return false;
      if (filters.maxStops != null && f.stopsCount > filters.maxStops) return false;
      if (filters.baggage && !(f.baggage.checked && f.baggage.checked.included)) return false;
      if (filters.changeable && f.changePolicy === "none") return false;
      if (filters.cancelable && f.cancelPolicy === "none") return false;
      if (filters.israeliOnly && !f.airline.isIsraeli) return false;
      if (filters.departWindow && filters.departWindow !== "any") {
        var h = new Date(f.departTime).getHours();
        var win = filters.departWindow;
        if (win === "morning" && !(h >= 6 && h < 12)) return false;
        if (win === "afternoon" && !(h >= 12 && h < 18)) return false;
        if (win === "evening" && !(h >= 18 || h < 6)) return false;
      }
      if (filters.providers && filters.providers.length && filters.providers.indexOf(f.provider) === -1) return false;
      return true;
    });
    return sortFlights(out, sort, passengers);
  }

  function sortFlights(list, sort, passengers) {
    var arr = list.slice();
    var price = function (f) { return FS.Pricing.total(FS.Pricing.perPerson(f.pricing), passengers); };
    switch (sort) {
      case "price": arr.sort(function (a, b) { return price(a) - price(b); }); break;
      case "duration": arr.sort(function (a, b) { return a.durationMinutes - b.durationMinutes; }); break;
      case "depart": arr.sort(function (a, b) { return new Date(a.departTime) - new Date(b.departTime); }); break;
      case "arrive": arr.sort(function (a, b) { return new Date(a.arriveTime) - new Date(b.arriveTime); }); break;
      case "stops": arr.sort(function (a, b) { return a.stopsCount - b.stopsCount || price(a) - price(b); }); break;
      case "baggage": arr.sort(function (a, b) {
        var ba = (a.baggage.checked && a.baggage.checked.included) ? 0 : 1;
        var bb = (b.baggage.checked && b.baggage.checked.included) ? 0 : 1;
        return ba - bb || price(a) - price(b);
      }); break;
      case "israeli": arr.sort(function (a, b) {
        return (b.airline.isIsraeli ? 1 : 0) - (a.airline.isIsraeli ? 1 : 0) || b.bestValueScore - a.bestValueScore;
      }); break;
      default: arr.sort(function (a, b) { return b.bestValueScore - a.bestValueScore; });
    }
    return arr;
  }

  function applyHotels(raw, filters, sort, nights) {
    var out = raw.filter(function (h) {
      var price = HS.Pricing.totalStay(h.pricing, nights);
      if (filters.priceMax != null && price > filters.priceMax) return false;
      if (filters.stars && filters.stars.length && filters.stars.indexOf(h.stars) === -1) return false;
      if (filters.minRating != null && h.rating.score < filters.minRating) return false;
      if (filters.freeCancellation && !h.freeCancellation) return false;
      if (filters.breakfast && !h.breakfast) return false;
      if (filters.payAtProperty && !h.payAtProperty) return false;
      if (filters.amenities && filters.amenities.length) {
        for (var i = 0; i < filters.amenities.length; i++) {
          if (h.amenities.indexOf(filters.amenities[i]) === -1) return false;
        }
      }
      if (filters.providers && filters.providers.length && filters.providers.indexOf(h.provider) === -1) return false;
      return true;
    });
    return sortHotels(out, sort, nights);
  }

  function sortHotels(list, sort, nights) {
    var arr = list.slice();
    var price = function (h) { return HS.Pricing.totalStay(h.pricing, nights); };
    switch (sort) {
      case "price": arr.sort(function (a, b) { return price(a) - price(b); }); break;
      case "rating": arr.sort(function (a, b) { return b.rating.score - a.rating.score; }); break;
      case "distance": arr.sort(function (a, b) { return a.location.distanceCenterKm - b.location.distanceCenterKm; }); break;
      case "stars": arr.sort(function (a, b) { return b.stars - a.stars || b.rating.score - a.rating.score; }); break;
      case "popular": arr.sort(function (a, b) { return b.rating.count - a.rating.count; }); break;
      default: arr.sort(function (a, b) { return b.bestValueScore - a.bestValueScore; });
    }
    return arr;
  }

  /* ---------- רכיבי UI ---------- */
  function filterGroup(title, node) {
    return Utils.el("div", { class: "fd-filter-group" }, [
      Utils.el("h4", { class: "fd-filter-title" }, title), node
    ]);
  }

  function checkList(items, selected, onToggle) {
    var wrap = Utils.el("div", { class: "fd-check-list" });
    items.forEach(function (it) {
      var id = "flt-" + Utils.uid();
      var input = Utils.el("input", { type: "checkbox", id: id, class: "fd-check-input" });
      if (selected.indexOf(it.value) > -1) input.checked = true;
      input.addEventListener("change", function () { onToggle(it.value, input.checked); });
      wrap.appendChild(Utils.el("label", { class: "fd-check", "for": id }, [
        input, Utils.el("span", null, it.label), it.count != null ? Utils.el("span", { class: "fd-check-count" }, "(" + it.count + ")") : null
      ]));
    });
    return wrap;
  }

  function rangeField(labelText, min, max, value, onInput) {
    var out = Utils.el("output", { class: "fd-range-val" }, FD.CurrencyService.format(value, FD.Store.get().settings.currency));
    var input = Utils.el("input", { type: "range", class: "fd-range", min: String(min), max: String(max), value: String(value), step: "50", "aria-label": labelText });
    var deb = Utils.debounce(function (v) { onInput(v); }, 200);
    input.addEventListener("input", function () {
      out.textContent = "עד " + FD.CurrencyService.format(parseInt(input.value, 10), FD.Store.get().settings.currency);
      deb(parseInt(input.value, 10));
    });
    return Utils.el("div", { class: "fd-range-wrap" }, [input, out]);
  }

  /* ---------- בניית פאנל טיסות ---------- */
  function buildFlightPanel(raw, filters, sort, passengers, onChange) {
    var panel = Utils.el("div", { class: "fd-filter-panel" });
    var prices = raw.map(function (f) { return FS.Pricing.total(FS.Pricing.perPerson(f.pricing), passengers); });
    var maxPrice = prices.length ? Math.max.apply(null, prices) : 5000;
    if (filters.priceMax == null) filters.priceMax = maxPrice;

    // חברות
    var airlineCounts = {};
    raw.forEach(function (f) { airlineCounts[f.airline.code] = (airlineCounts[f.airline.code] || 0) + 1; });
    var airlineItems = Object.keys(airlineCounts).map(function (code) {
      var a = FD.MockData.AIRLINES[code];
      return { value: code, label: (a ? a.name : code) + (a && a.isIsraeli ? " 🇮🇱" : ""), count: airlineCounts[code] };
    });

    // ספקים
    var provCounts = {};
    raw.forEach(function (f) { provCounts[f.provider] = (provCounts[f.provider] || 0) + 1; });
    var provItems = Object.keys(provCounts).map(function (p) { return { value: p, label: p, count: provCounts[p] }; });

    filters.airlines = filters.airlines || [];
    filters.providers = filters.providers || [];

    function toggleArr(arrName, val, on) {
      var arr = filters[arrName];
      var i = arr.indexOf(val);
      if (on && i === -1) arr.push(val); else if (!on && i > -1) arr.splice(i, 1);
      onChange();
    }

    panel.appendChild(filterGroup("טווח מחיר (סופי)", rangeField("מחיר מקסימלי", 0, maxPrice, filters.priceMax, function (v) { filters.priceMax = v; onChange(); })));
    panel.appendChild(filterGroup("חברת תעופה", checkList(airlineItems, filters.airlines, function (v, on) { toggleArr("airlines", v, on); })));
    panel.appendChild(filterGroup("עצירות", checkList([
      { value: 0, label: "ישירה בלבד" }, { value: 1, label: "עד עצירה אחת" }
    ], [], function (v) {
      if (v === 0) { filters.directOnly = true; filters.maxStops = null; }
      else { filters.directOnly = false; filters.maxStops = 1; }
      onChange();
    })));
    panel.appendChild(filterGroup("שעת יציאה", (function () {
      var sel = Utils.el("select", { class: "fd-input" });
      [["any", "כל שעה"], ["morning", "בוקר"], ["afternoon", "צהריים"], ["evening", "ערב/לילה"]].forEach(function (o) {
        var op = Utils.el("option", { value: o[0] }, o[1]); if (filters.departWindow === o[0]) op.selected = true; sel.appendChild(op);
      });
      sel.addEventListener("change", function () { filters.departWindow = sel.value; onChange(); });
      return sel;
    })()));
    panel.appendChild(filterGroup("תנאים", (function () {
      var box = Utils.el("div", { class: "fd-check-list" });
      [["baggage", "מזוודה כלולה"], ["israeliOnly", "חברות ישראליות בלבד"], ["changeable", "שינוי אפשרי"], ["cancelable", "ביטול אפשרי"]].forEach(function (o) {
        var id = "flt-" + Utils.uid();
        var input = Utils.el("input", { type: "checkbox", id: id, class: "fd-check-input" });
        if (filters[o[0]]) input.checked = true;
        input.addEventListener("change", function () { filters[o[0]] = input.checked; onChange(); });
        box.appendChild(Utils.el("label", { class: "fd-check", "for": id }, [input, Utils.el("span", null, o[1])]));
      });
      return box;
    })()));
    panel.appendChild(filterGroup("ספק הזמנה", checkList(provItems, filters.providers, function (v, on) { toggleArr("providers", v, on); })));

    panel.appendChild(Utils.el("button", {
      class: "fd-btn fd-btn--ghost fd-btn--sm fd-clear-filters",
      on: { click: function () { FD.Filters.reset("flight"); onChange(true); } }
    }, "ניקוי כל הפילטרים"));

    return panel;
  }

  /* ---------- בניית פאנל מלונות ---------- */
  function buildHotelPanel(raw, filters, sort, nights, onChange) {
    var panel = Utils.el("div", { class: "fd-filter-panel" });
    var prices = raw.map(function (h) { return HS.Pricing.totalStay(h.pricing, nights); });
    var maxPrice = prices.length ? Math.max.apply(null, prices) : 8000;
    if (filters.priceMax == null) filters.priceMax = maxPrice;

    filters.stars = filters.stars || [];
    filters.amenities = filters.amenities || [];
    filters.providers = filters.providers || [];

    function toggleArr(arrName, val, on) {
      var arr = filters[arrName]; var i = arr.indexOf(val);
      if (on && i === -1) arr.push(val); else if (!on && i > -1) arr.splice(i, 1);
      onChange();
    }

    var starItems = [5, 4, 3].map(function (s) { return { value: s, label: s + " כוכבים" }; });
    var amenityItems = [
      { value: "pool", label: "בריכה" }, { value: "gym", label: "חדר כושר" },
      { value: "spa", label: "ספא" }, { value: "parking", label: "חניה" },
      { value: "accessible", label: "נגישות" }, { value: "wifi", label: "Wi-Fi" }
    ];
    var provCounts = {};
    raw.forEach(function (h) { provCounts[h.provider] = (provCounts[h.provider] || 0) + 1; });
    var provItems = Object.keys(provCounts).map(function (p) { return { value: p, label: p, count: provCounts[p] }; });

    panel.appendChild(filterGroup("טווח מחיר (כל השהייה)", rangeField("מחיר מקסימלי", 0, maxPrice, filters.priceMax, function (v) { filters.priceMax = v; onChange(); })));
    panel.appendChild(filterGroup("כוכבים", checkList(starItems, filters.stars, function (v, on) { toggleArr("stars", v, on); })));
    panel.appendChild(filterGroup("דירוג אורחים", (function () {
      var sel = Utils.el("select", { class: "fd-input" });
      [[0, "הכול"], [8, "8+ טוב מאוד"], [9, "9+ מצוין"]].forEach(function (o) {
        var op = Utils.el("option", { value: o[0] }, o[1]); if (filters.minRating === o[0]) op.selected = true; sel.appendChild(op);
      });
      sel.addEventListener("change", function () { filters.minRating = parseInt(sel.value, 10) || null; onChange(); });
      return sel;
    })()));
    panel.appendChild(filterGroup("מתקנים", checkList(amenityItems, filters.amenities, function (v, on) { toggleArr("amenities", v, on); })));
    panel.appendChild(filterGroup("תנאים", (function () {
      var box = Utils.el("div", { class: "fd-check-list" });
      [["freeCancellation", "ביטול חינם"], ["breakfast", "ארוחת בוקר"], ["payAtProperty", "תשלום במקום"]].forEach(function (o) {
        var id = "flt-" + Utils.uid();
        var input = Utils.el("input", { type: "checkbox", id: id, class: "fd-check-input" });
        if (filters[o[0]]) input.checked = true;
        input.addEventListener("change", function () { filters[o[0]] = input.checked; onChange(); });
        box.appendChild(Utils.el("label", { class: "fd-check", "for": id }, [input, Utils.el("span", null, o[1])]));
      });
      return box;
    })()));
    panel.appendChild(filterGroup("ספק הזמנה", checkList(provItems, filters.providers, function (v, on) { toggleArr("providers", v, on); })));

    panel.appendChild(Utils.el("button", {
      class: "fd-btn fd-btn--ghost fd-btn--sm fd-clear-filters",
      on: { click: function () { FD.Filters.reset("hotel"); onChange(true); } }
    }, "ניקוי כל הפילטרים"));

    return panel;
  }

  /* ---------- בקרת מיון ---------- */
  function buildSortControl(type, current, onChange) {
    var sorts = type === "hotel" ? HOTEL_SORTS : FLIGHT_SORTS;
    var sel = Utils.el("select", { class: "fd-input fd-sort-select", "aria-label": "מיון תוצאות" });
    sorts.forEach(function (s) {
      var o = Utils.el("option", { value: s.value }, s.label);
      if (s.value === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () { onChange(sel.value); });
    return Utils.el("div", { class: "fd-sort" }, [
      Icons.node("sort", 18), Utils.el("label", { class: "fd-sort-label" }, "מיון:"), sel
    ]);
  }

  FD.Filters = {
    apply: function (type, raw, filters, sort, unit) {
      return type === "hotel" ? applyHotels(raw, filters, sort, unit) : applyFlights(raw, filters, sort, unit);
    },
    buildPanel: function (type, raw, filters, sort, unit, onChange) {
      return type === "hotel" ? buildHotelPanel(raw, filters, sort, unit, onChange) : buildFlightPanel(raw, filters, sort, unit, onChange);
    },
    buildSort: buildSortControl,
    reset: function (type) {
      var s = FD.Store.get();
      if (type === "hotel") s.hotelFilters = {}; else s.flightFilters = {};
    }
  };
})(window.FD = window.FD || {});
