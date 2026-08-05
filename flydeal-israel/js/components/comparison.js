/*
 * comparison.js — סרגל השוואה + טבלת השוואה (עד 3 טיסות/מלונות)
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons, FS = FD.FlightsService, HS = FD.HotelsService;

  function getItems() {
    var cmp = FD.Store.get().compare;
    if (!cmp.type || !cmp.ids.length) return { type: null, items: [] };
    var source = cmp.type === "flight"
      ? FD.Store.get().flights.raw
      : FD.Store.get().hotels.raw;
    var items = cmp.ids.map(function (id) {
      return source.filter(function (x) { return x.id === id; })[0];
    }).filter(Boolean);
    return { type: cmp.type, items: items };
  }

  // סרגל צף בתחתית המסך
  function renderBar() {
    var existing = Utils.qs("#fd-compare-bar");
    var data = getItems();
    if (!data.items.length) { if (existing) existing.remove(); return; }

    var bar = existing || Utils.el("div", { class: "fd-compare-bar", id: "fd-compare-bar", role: "region", "aria-label": "פריטים להשוואה" });
    Utils.clear(bar);

    var chips = Utils.el("div", { class: "fd-compare-chips" }, data.items.map(function (it) {
      var name = data.type === "flight" ? it.airline.name + " · " + it.destination.city : it.name;
      return Utils.el("span", { class: "fd-compare-chip" }, [
        Utils.el("span", null, name),
        Utils.el("button", {
          class: "fd-chip-x", "aria-label": "הסרה מהשוואה",
          on: { click: function () { FD.Store.toggleCompare(data.type, it.id); FD.App && FD.App.rerenderResults && FD.App.rerenderResults(); } }
        }, "×")
      ]);
    }));

    var actions = Utils.el("div", { class: "fd-compare-actions" }, [
      Utils.el("button", {
        class: "fd-btn fd-btn--primary fd-btn--sm", disabled: data.items.length < 2,
        on: { click: openTable }
      }, "השוואה (" + data.items.length + ")"),
      Utils.el("button", {
        class: "fd-btn fd-btn--ghost fd-btn--sm",
        on: { click: function () { FD.Store.clearCompare(); FD.App && FD.App.rerenderResults && FD.App.rerenderResults(); } }
      }, "ניקוי")
    ]);

    bar.appendChild(Utils.el("div", { class: "fd-compare-inner" }, [
      Utils.el("span", { class: "fd-compare-title" }, "השוואה:"), chips, actions
    ]));

    if (!existing) document.body.appendChild(bar);
  }

  function openTable() {
    var data = getItems();
    if (data.items.length < 2) return;
    var content = data.type === "flight" ? flightTable(data.items) : hotelTable(data.items);
    FD.Modal.open("השוואת " + (data.type === "flight" ? "טיסות" : "מלונות"), content);
  }

  function tableShell(headers) {
    var table = Utils.el("table", { class: "fd-compare-table" });
    var thead = Utils.el("thead");
    var tr = Utils.el("tr");
    headers.forEach(function (h) { tr.appendChild(Utils.el("th", { scope: "col" }, h)); });
    thead.appendChild(tr);
    table.appendChild(thead);
    table.appendChild(Utils.el("tbody"));
    return table;
  }

  function addRow(table, label, values, highlightBestIdx) {
    var tbody = table.querySelector("tbody");
    var tr = Utils.el("tr");
    tr.appendChild(Utils.el("th", { scope: "row" }, label));
    values.forEach(function (v, i) {
      tr.appendChild(Utils.el("td", { class: i === highlightBestIdx ? "is-best" : "" }, v));
    });
    tbody.appendChild(tr);
  }

  function flightTable(items) {
    var passengers = (FD.Store.get().flights.params && FD.Store.get().flights.params.passengers) || 1;
    var cur = FD.Store.get().settings.currency;
    var headers = [""].concat(items.map(function (f) { return f.airline.name; }));
    var table = tableShell(headers);
    var prices = items.map(function (f) { return FS.Pricing.total(FS.Pricing.perPerson(f.pricing), passengers); });
    var bestPriceIdx = prices.indexOf(Math.min.apply(null, prices));
    var durations = items.map(function (f) { return f.durationMinutes; });
    var bestDurIdx = durations.indexOf(Math.min.apply(null, durations));
    var scores = items.map(function (f) { return f.bestValueScore; });
    var bestScoreIdx = scores.indexOf(Math.max.apply(null, scores));

    addRow(table, "מחיר סופי", prices.map(function (p) { return FD.CurrencyService.format(p, cur); }), bestPriceIdx);
    addRow(table, "יציאה", items.map(function (f) { return Utils.formatTime(f.departTime); }));
    addRow(table, "נחיתה", items.map(function (f) { return Utils.formatTime(f.arriveTime); }));
    addRow(table, "משך", items.map(function (f) { return Utils.formatDuration(f.durationMinutes); }), bestDurIdx);
    addRow(table, "עצירות", items.map(function (f) { return f.direct ? "ישירה" : f.stopsCount + " עצירות"; }));
    addRow(table, "כבודה", items.map(function (f) { return (f.baggage.checked && f.baggage.checked.included) ? "מזוודה כלולה" : "תיק יד בלבד"; }));
    addRow(table, "שינוי", items.map(function (f) { return f.changePolicy === "free" ? "חינם" : f.changePolicy === "paid" ? "בתשלום" : "לא ניתן"; }));
    addRow(table, "ביטול", items.map(function (f) { return f.cancelPolicy === "free" ? "חינם" : f.cancelPolicy === "paid" ? "בתשלום" : "לא ניתן"; }));
    addRow(table, "ספק", items.map(function (f) { return f.provider; }));
    addRow(table, "ציון תמורה", items.map(function (f) { return String(f.bestValueScore); }), bestScoreIdx);
    return wrapTable(table);
  }

  function hotelTable(items) {
    var nights = (FD.Store.get().hotels.params && FD.Store.get().hotels.params.nights) || 1;
    var cur = FD.Store.get().settings.currency;
    var headers = [""].concat(items.map(function (h) { return h.name; }));
    var table = tableShell(headers);
    var prices = items.map(function (h) { return HS.Pricing.totalStay(h.pricing, nights); });
    var bestPriceIdx = prices.indexOf(Math.min.apply(null, prices));
    var ratings = items.map(function (h) { return h.rating.score; });
    var bestRatingIdx = ratings.indexOf(Math.max.apply(null, ratings));

    addRow(table, "מחיר סופי", prices.map(function (p) { return FD.CurrencyService.format(p, cur); }), bestPriceIdx);
    addRow(table, "מחיר ללילה", items.map(function (h) { return FD.CurrencyService.format(HS.Pricing.avgPerNight(h.pricing, nights), cur); }));
    addRow(table, "דירוג", items.map(function (h) { return h.rating.score.toFixed(1) + " " + h.rating.label; }), bestRatingIdx);
    addRow(table, "חוות דעת", items.map(function (h) { return Utils.formatNumber(h.rating.count); }));
    addRow(table, "כוכבים", items.map(function (h) { return h.stars + " ★"; }));
    addRow(table, "מיקום", items.map(function (h) { return h.location.distanceCenterKm + " ק״מ ממרכז"; }));
    addRow(table, "ארוחת בוקר", items.map(function (h) { return h.breakfast ? "כלולה" : "לא כלולה"; }));
    addRow(table, "ביטול", items.map(function (h) { return h.freeCancellation ? "חינם" : "בתשלום"; }));
    addRow(table, "תשלום", items.map(function (h) { return h.payAtProperty ? "במקום" : "מראש"; }));
    return wrapTable(table);
  }

  function wrapTable(table) {
    return Utils.el("div", { class: "fd-table-scroll" }, [
      table,
      Utils.el("p", { class: "fd-demo-flag fd-compare-note" }, "נתוני הדגמה · הערך המודגש הוא הטוב ביותר בכל שורה")
    ]);
  }

  FD.Comparison = { renderBar: renderBar, openTable: openTable };
})(window.FD = window.FD || {});
