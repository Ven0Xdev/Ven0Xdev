/*
 * app.js — בקר ראשי של FlyDeal Israel
 * מרכז את הטאבים, החיפוש, הרינדור, מצבי הטעינה/שגיאה, המועדפים, ההיסטוריה ומצב כהה.
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons, Store = FD.Store;
  var cfg = window.FD_CONFIG || {};

  var refs = {}; // הפניות לאלמנטים

  /* ================= אתחול ================= */
  function init() {
    // מצב נתונים
    Store.get().dataMode = (cfg.DATA_MODE) || "mock";
    FD.FlightsService.useProvider(Store.get().dataMode, { baseUrl: cfg.apiBaseUrl });
    FD.HotelsService.useProvider(Store.get().dataMode, { baseUrl: cfg.apiBaseUrl });

    applyTheme(Store.initialTheme());

    cacheRefs();
    bindHeader();
    bindTabs();
    renderSearchArea();
    renderHistory();
    bindGlobalUI();
    updateFavCount();

    // הודעת מצב הדגמה
    if (Store.get().dataMode === "mock") {
      var banner = Utils.qs("#fd-demo-banner");
      if (banner) banner.hidden = false;
    }
  }

  function cacheRefs() {
    refs.searchMount = Utils.qs("#fd-search-mount");
    refs.results = Utils.qs("#fd-results");
    refs.tabs = Utils.qsa(".fd-tab");
    refs.favCount = Utils.qs("#fd-fav-count");
    refs.historyMount = Utils.qs("#fd-history");
  }

  /* ================= Header ================= */
  function bindHeader() {
    var themeBtn = Utils.qs("#fd-theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", function () {
      var next = Store.get().settings.theme === "dark" ? "light" : "dark";
      Store.setTheme(next);
      applyTheme(next);
    });

    var favBtn = Utils.qs("#fd-fav-btn");
    if (favBtn) favBtn.addEventListener("click", openFavorites);

    var loginBtn = Utils.qs("#fd-login-btn");
    if (loginBtn) loginBtn.addEventListener("click", function () {
      FD.Modal.open("התחברות", Utils.el("div", { class: "fd-login-demo" }, [
        Utils.el("p", { class: "fd-demo-note" }, "מסך התחברות לדוגמה (מצב הדגמה)."),
        Utils.el("p", null, "בגרסה מלאה כאן תופיע התחברות מאובטחת המנוהלת בצד השרת.")
      ]));
    });

    var settingsBtn = Utils.qs("#fd-settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    Store.get().settings.theme = theme;
    var btn = Utils.qs("#fd-theme-toggle");
    if (btn) {
      btn.innerHTML = Icons.svg(theme === "dark" ? "sun" : "moon", 20);
      btn.setAttribute("aria-label", theme === "dark" ? "מעבר למצב בהיר" : "מעבר למצב כהה");
    }
  }

  /* ================= טאבים ================= */
  function bindTabs() {
    refs.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () { switchTab(tab.dataset.tab); });
      tab.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab(tab.dataset.tab); }
      });
    });
  }

  function switchTab(name) {
    Store.get().activeTab = name;
    refs.tabs.forEach(function (t) {
      var active = t.dataset.tab === name;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderSearchArea();
    // איפוס אזור תוצאות בעת מעבר טאב
    Utils.clear(refs.results);
  }

  /* ================= אזור חיפוש ================= */
  function renderSearchArea() {
    var tab = Store.get().activeTab;
    Utils.clear(refs.searchMount);
    var form = FD.SearchForm.build(tab, runSearch);
    refs.searchMount.appendChild(form);
  }

  /* ================= הרצת חיפוש ================= */
  function runSearch(params) {
    var tab = Store.get().activeTab;
    Store.addHistory(tab, params);
    renderHistory();

    if (tab === "packages") return runPackageSearch(params);

    var type = tab === "hotels" ? "hotels" : "flights";
    Store.get()[type].params = params;
    Store.get()[type].status = "loading";
    Store.get()[type].raw = [];
    // איפוס פילטרים/עמוד
    if (type === "flights") { Store.get().flightFilters = {}; Store.get().page.flights = 1; }
    else { Store.get().hotelFilters = {}; Store.get().page.hotels = 1; }

    renderSkeletons(type);
    scrollToResults();

    var svc = type === "hotels" ? FD.HotelsService : FD.FlightsService;
    svc.search(params).then(function (results) {
      if (!results.length) {
        Store.get()[type].status = "empty";
        renderEmpty(type, params);
        return;
      }
      var unit = type === "hotels" ? params.nights : params.passengers;
      svc.computeBestValue(results, unit);
      svc.assignBadges(results, unit);
      Store.get()[type].raw = results;
      Store.get()[type].status = "done";
      rerenderResults();
    }).catch(function (err) {
      Store.get()[type].status = "error";
      renderError(type, params, err);
    });
  }

  /* ================= רינדור תוצאות ================= */
  function rerenderResults() {
    var tab = Store.get().activeTab;
    if (tab === "packages") { renderPackages(Store.get().packages.raw); FD.Comparison.renderBar(); return; }
    var type = tab === "hotels" ? "hotels" : "flights";
    var st = Store.get()[type];
    if (st.status === "loading") { renderSkeletons(type); return; }
    if (st.status === "empty") { renderEmpty(type, st.params); return; }
    if (st.status === "error") { renderError(type, st.params); return; }
    if (st.status !== "done") return;
    renderList(type);
    FD.Comparison.renderBar();
  }

  function renderList(type) {
    var st = Store.get()[type];
    var isHotel = type === "hotels";
    var unit = isHotel ? st.params.nights : st.params.passengers;
    var filters = isHotel ? Store.get().hotelFilters : Store.get().flightFilters;
    var sort = isHotel ? Store.get().hotelSort : Store.get().flightSort;
    var filtered = FD.Filters.apply(isHotel ? "hotel" : "flight", st.raw, filters, sort, unit);
    st.filtered = filtered;

    Utils.clear(refs.results);

    // כותרת + בקרות
    var count = filtered.length;
    var routeLabel = isHotel
      ? (FD.MockData.AIRPORTS[st.params.destination] ? FD.MockData.AIRPORTS[st.params.destination].city : "")
      : "תל אביב → " + (FD.MockData.AIRPORTS[st.params.destination] ? FD.MockData.AIRPORTS[st.params.destination].city : "");

    var header = Utils.el("div", { class: "fd-results-head" }, [
      Utils.el("div", { class: "fd-results-title" }, [
        Utils.el("h2", null, count + " תוצאות"),
        Utils.el("p", { class: "fd-muted" }, routeLabel + " · " + (isHotel ? (st.params.nights + " לילות") : (st.params.oneway ? "כיוון אחד" : "הלוך ושוב")))
      ]),
      Utils.el("div", { class: "fd-results-controls" }, [
        FD.Filters.buildSort(isHotel ? "hotel" : "flight", sort, function (val) {
          if (isHotel) Store.get().hotelSort = val; else Store.get().flightSort = val;
          renderList(type);
        }),
        viewToggle(type),
        Utils.el("button", {
          class: "fd-btn fd-btn--ghost fd-btn--sm fd-mobile-filter-btn",
          on: { click: function () { toggleMobileFilters(); } }
        }, [Icons.node("filter", 16), "סינון"])
      ])
    ]);

    // שקיפות
    var transparency = Utils.el("div", { class: "fd-transparency", role: "note" }, [
      Icons.node("info", 16),
      Utils.el("span", null, "המחירים עשויים להשתנות בהתאם לזמינות. המחיר הקובע הוא המחיר הסופי שיוצג באתר ספק ההזמנה.")
    ]);

    // פריסה: פאנל סינון + רשת
    var layout = Utils.el("div", { class: "fd-results-layout" });
    var aside = Utils.el("aside", { class: "fd-filters-aside", id: "fd-filters-aside", "aria-label": "סינון תוצאות" });
    var panel = FD.Filters.buildPanel(isHotel ? "hotel" : "flight", st.raw, filters, sort, unit, function () {
      if (isHotel ? Store.get().page.hotels : Store.get().page.flights) { /* reset page */ }
      Store.get().page[type] = 1;
      renderList(type);
    });
    aside.appendChild(Utils.el("div", { class: "fd-filters-aside-head" }, [
      Utils.el("h3", null, "סינון"),
      Utils.el("button", { class: "fd-icon-btn fd-close-filters", "aria-label": "סגירת סינון", html: Icons.svg("close", 20), on: { click: toggleMobileFilters } })
    ]));
    aside.appendChild(panel);

    var main = Utils.el("div", { class: "fd-results-main" });

    // לוח מחירים גמיש (גרף)
    if (!isHotel) main.appendChild(priceGraph(st.raw, st.params.passengers));

    if (!count) {
      main.appendChild(noMatch(type));
    } else {
      var perPage = (cfg.ui && cfg.ui.resultsPerPage) || 8;
      var page = Store.get().page[type];
      var shown = filtered.slice(0, perPage * page);
      var grid = Utils.el("div", { class: "fd-grid fd-grid--" + Store.get().view });
      shown.forEach(function (item) {
        var card = isHotel ? FD.HotelCard.build(item, unit) : FD.FlightCard.build(item, unit);
        grid.appendChild(card);
      });
      main.appendChild(grid);

      // Load more
      if (shown.length < filtered.length) {
        main.appendChild(Utils.el("button", {
          class: "fd-btn fd-btn--ghost fd-load-more",
          on: { click: function () { Store.get().page[type]++; renderList(type); } }
        }, "טעינת תוצאות נוספות (" + (filtered.length - shown.length) + ")"));
      }
    }

    layout.appendChild(aside);
    layout.appendChild(main);

    refs.results.appendChild(header);
    refs.results.appendChild(transparency);
    refs.results.appendChild(layout);
    FD.Comparison.renderBar();
  }

  function viewToggle(type) {
    var wrap = Utils.el("div", { class: "fd-view-toggle", role: "group", "aria-label": "תצוגה" });
    [["grid", "grid", "תצוגת רשת"], ["list", "list", "תצוגת רשימה"]].forEach(function (v) {
      var btn = Utils.el("button", {
        class: "fd-view-btn" + (Store.get().view === v[0] ? " is-active" : ""),
        "aria-label": v[2], "aria-pressed": Store.get().view === v[0] ? "true" : "false",
        html: Icons.svg(v[1], 18)
      });
      btn.addEventListener("click", function () { Store.get().view = v[0]; renderList(type); });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function toggleMobileFilters() {
    var aside = Utils.qs("#fd-filters-aside");
    if (aside) aside.classList.toggle("is-open");
  }

  /* ---------- גרף מחירים לפי יום/חברה ---------- */
  function priceGraph(flights, passengers) {
    var cur = Store.get().settings.currency;
    var data = flights.map(function (f) {
      return { label: f.airline.code, price: FD.FlightsService.Pricing.total(FD.FlightsService.Pricing.perPerson(f.pricing), passengers), il: f.airline.isIsraeli };
    }).sort(function (a, b) { return a.price - b.price; }).slice(0, 8);
    var max = Math.max.apply(null, data.map(function (d) { return d.price; }));
    var min = Math.min.apply(null, data.map(function (d) { return d.price; }));

    var bars = Utils.el("div", { class: "fd-graph-bars" }, data.map(function (d) {
      var h = 30 + ((d.price - min) / (max - min || 1)) * 70;
      var isMin = d.price === min;
      return Utils.el("div", { class: "fd-graph-col" }, [
        Utils.el("span", { class: "fd-graph-price" }, FD.CurrencyService.format(d.price, cur)),
        Utils.el("div", { class: "fd-graph-bar" + (isMin ? " is-min" : ""), style: "height:" + h + "%", title: d.label + " · " + FD.CurrencyService.format(d.price, cur) }),
        Utils.el("span", { class: "fd-graph-label" }, d.label)
      ]);
    }));

    return Utils.el("div", { class: "fd-price-graph" }, [
      Utils.el("div", { class: "fd-graph-head" }, [
        Icons.node("trend", 16),
        Utils.el("span", null, "השוואת מחיר סופי לפי חברה (נמוך → גבוה)"),
        Utils.el("span", { class: "fd-demo-flag" }, "נתוני הדגמה")
      ]),
      bars
    ]);
  }

  /* ================= חבילות ================= */
  function runPackageSearch(params) {
    Store.get().packages.params = params;
    Store.get().packages.status = "loading";
    renderSkeletons("packages");
    scrollToResults();

    setTimeout(function () {
      var packages = FD.MockData.PACKAGES.map(function (p) {
        var flightRaw = FD.MockData.FLIGHTS.filter(function (f) { return f.id === p.flightId; })[0];
        var hotelRaw = FD.MockData.HOTELS.filter(function (h) { return h.id === p.hotelId; })[0];
        var flight = FD.FlightsService.provider.normalizeFlight(flightRaw);
        var hotel = FD.HotelsService.provider.normalizeHotel(hotelRaw);
        return { def: p, flight: flight, hotel: hotel };
      });
      // סינון לפי יעד/רמה
      if (params.destination) packages = packages.filter(function (pk) { return pk.flight.destination.code === params.destination; });
      if (params.level) packages = packages.filter(function (pk) { return pk.hotel.stars >= params.level; });

      Store.get().packages.raw = packages;
      Store.get().packages.status = packages.length ? "done" : "empty";
      if (!packages.length) renderEmpty("packages", params);
      else renderPackages(packages);
    }, 650);
  }

  function renderPackages(packages) {
    var params = Store.get().packages.params || { travelers: 2, nights: 4 };
    var travelers = params.travelers || 2;
    var cur = Store.get().settings.currency;
    Utils.clear(refs.results);

    refs.results.appendChild(Utils.el("div", { class: "fd-results-head" }, [
      Utils.el("div", { class: "fd-results-title" }, [
        Utils.el("h2", null, packages.length + " חבילות"),
        Utils.el("p", { class: "fd-muted" }, "טיסה + מלון · " + travelers + " נוסעים")
      ])
    ]));
    refs.results.appendChild(Utils.el("div", { class: "fd-transparency", role: "note" }, [
      Icons.node("info", 16),
      Utils.el("span", null, "החיסכון מחושב מהפרש בין מחיר נפרד למחיר חבילה — מנתוני הדגמה בלבד.")
    ]));

    var grid = Utils.el("div", { class: "fd-grid fd-grid--grid fd-packages" });
    packages.forEach(function (pk) {
      var nights = params.nights || pk.def.nights;
      var flightPrice = FD.FlightsService.Pricing.total(FD.FlightsService.Pricing.perPerson(pk.flight.pricing), travelers);
      var hotelTotal = FD.HotelsService.Pricing.totalStay(pk.hotel.pricing, nights);
      var separate = flightPrice + hotelTotal;
      var pkgPrice = Utils.roundPrice(separate * (1 - pk.def.packageDiscountPct / 100));
      var savings = separate - pkgPrice;
      var fmt = function (v) { return FD.CurrencyService.format(v, cur); };

      var card = Utils.el("article", { class: "fd-card fd-package-card" }, [
        Utils.el("div", { class: "fd-pkg-media", style: "background:" + FD.HotelCard.gradientStyle(pk.hotel.gradient) }, [
          Utils.el("span", { class: "fd-badge fd-badge--value" }, "חיסכון " + pk.def.packageDiscountPct + "%"),
          Utils.el("div", { class: "fd-pkg-dest" }, [Icons.node("location", 16), pk.flight.destination.city])
        ]),
        Utils.el("div", { class: "fd-pkg-body" }, [
          Utils.el("h3", null, pk.flight.destination.city + " · " + nights + " לילות"),
          Utils.el("div", { class: "fd-pkg-line" }, [Icons.node("plane", 15), pk.flight.airline.name + " · " + (pk.flight.direct ? "ישירה" : "עם עצירה") + " · " + fmt(flightPrice)]),
          Utils.el("div", { class: "fd-pkg-line" }, [Icons.node("hotel", 15), pk.hotel.name + " · " + pk.hotel.stars + "★ · " + fmt(hotelTotal)]),
          Utils.el("div", { class: "fd-pkg-price" }, [
            Utils.el("div", { class: "fd-pkg-separate" }, [
              Utils.el("span", { class: "fd-muted" }, "מחיר נפרד: "),
              Utils.el("s", null, fmt(separate))
            ]),
            Utils.el("div", { class: "fd-pkg-final" }, [
              Utils.el("span", { class: "fd-price-caption" }, "מחיר החבילה"),
              Utils.el("span", { class: "fd-price-value" }, fmt(pkgPrice)),
              Utils.el("span", { class: "fd-pkg-savings" }, "חיסכון של " + fmt(savings))
            ])
          ]),
          Utils.el("div", { class: "fd-card-actions" }, [
            Utils.el("button", { class: "fd-btn fd-btn--primary", on: { click: function () {
              FD.Modal.open("חבילה — " + pk.flight.destination.city, Utils.el("div", { class: "fd-book-demo" }, [
                Utils.el("p", { class: "fd-demo-note" }, "מצב הדגמה — אין הזמנה אמיתית."),
                Utils.el("p", null, "החבילה כוללת: " + pk.flight.airline.name + " (טיסה) + " + pk.hotel.name + " (" + nights + " לילות).")
              ]));
            } } }, "פרטי החבילה")
          ]),
          Utils.el("div", { class: "fd-card-foot" }, [Utils.el("span", { class: "fd-demo-flag" }, "נתוני הדגמה")])
        ])
      ]);
      grid.appendChild(card);
    });
    refs.results.appendChild(grid);
  }

  /* ================= מצבי טעינה/שגיאה ================= */
  function renderSkeletons(type) {
    Utils.clear(refs.results);
    var count = 4;
    var wrap = Utils.el("div", { class: "fd-skeletons", "aria-busy": "true", "aria-label": "טוען תוצאות" });
    wrap.appendChild(Utils.el("div", { class: "fd-search-anim" }, [
      Utils.el("span", { class: "fd-search-anim-dot" }), Utils.el("span", { class: "fd-search-anim-dot" }), Utils.el("span", { class: "fd-search-anim-dot" }),
      Utils.el("span", null, "מחפשים עבורכם את העסקאות הטובות ביותר…")
    ]));
    for (var i = 0; i < count; i++) {
      wrap.appendChild(Utils.el("div", { class: "fd-skeleton-card" + (type === "hotels" ? " is-hotel" : "") }, [
        Utils.el("div", { class: "fd-sk-line fd-sk-lg" }),
        Utils.el("div", { class: "fd-sk-line fd-sk-md" }),
        Utils.el("div", { class: "fd-sk-line fd-sk-sm" }),
        Utils.el("div", { class: "fd-sk-price" })
      ]));
    }
    refs.results.appendChild(wrap);
  }

  function renderEmpty(type, params) {
    Utils.clear(refs.results);
    refs.results.appendChild(Utils.el("div", { class: "fd-state fd-state--empty" }, [
      Utils.el("div", { class: "fd-state-icon", html: Icons.svg("search", 48) }),
      Utils.el("h3", null, "לא נמצאו תוצאות"),
      Utils.el("p", null, "לא נמצאו " + (type === "hotels" ? "מלונות" : type === "packages" ? "חבילות" : "טיסות") + " התואמים לחיפוש. נסו לשנות תאריכים, יעד או להסיר מסננים."),
      Utils.el("button", { class: "fd-btn fd-btn--primary", on: { click: function () { scrollToTop(); } } }, "חיפוש חדש")
    ]));
  }

  function renderError(type, params, err) {
    Utils.clear(refs.results);
    refs.results.appendChild(Utils.el("div", { class: "fd-state fd-state--error" }, [
      Utils.el("div", { class: "fd-state-icon", html: Icons.svg("info", 48) }),
      Utils.el("h3", null, "אירעה שגיאה"),
      Utils.el("p", null, (err && err.message) ? err.message : "לא הצלחנו להשלים את החיפוש. נסו שוב."),
      Utils.el("button", {
        class: "fd-btn fd-btn--primary",
        on: { click: function () { runSearch(params); } }
      }, "ניסיון חוזר")
    ]));
  }

  function noMatch(type) {
    return Utils.el("div", { class: "fd-state fd-state--empty" }, [
      Utils.el("div", { class: "fd-state-icon", html: Icons.svg("filter", 40) }),
      Utils.el("h3", null, "אין תוצאות למסננים שנבחרו"),
      Utils.el("p", null, "נסו להרחיב את טווח המחיר או להסיר חלק מהמסננים."),
      Utils.el("button", { class: "fd-btn fd-btn--ghost", on: { click: function () {
        FD.Filters.reset(type === "hotels" ? "hotel" : "flight");
        renderList(type);
      } } }, "ניקוי מסננים")
    ]);
  }

  /* ================= מועדפים ================= */
  function updateFavCount() {
    if (refs.favCount) {
      var n = Store.get().favorites.length;
      refs.favCount.textContent = n;
      refs.favCount.hidden = n === 0;
    }
  }

  function openFavorites() {
    var favs = Store.get().favorites;
    var content = Utils.el("div", { class: "fd-favorites" });
    if (!favs.length) {
      content.appendChild(Utils.el("p", { class: "fd-muted fd-fav-empty" }, "עדיין לא שמרתם מועדפים. לחצו על ♡ בכרטיס כדי לשמור."));
    } else {
      content.appendChild(Utils.el("div", { class: "fd-fav-head" }, [
        Utils.el("span", null, favs.length + " פריטים שמורים"),
        Utils.el("button", { class: "fd-btn fd-btn--ghost fd-btn--sm", on: { click: function () {
          Store.clearFavorites(); updateFavCount(); FD.Modal.close();
        } } }, "ניקוי הכול")
      ]));
      favs.forEach(function (f) {
        var item = f.snapshot;
        var isFlight = f.type === "flight";
        var title = isFlight ? (item.airline.name + " · " + item.origin.city + " → " + item.destination.city) : item.name;
        var priceIls = isFlight
          ? FD.FlightsService.Pricing.perPerson(item.pricing)
          : FD.HotelsService.Pricing.totalStay(item.pricing, 1);
        content.appendChild(Utils.el("div", { class: "fd-fav-item" }, [
          Utils.el("span", { class: "fd-fav-icon", html: Icons.svg(isFlight ? "plane" : "hotel", 18) }),
          Utils.el("div", { class: "fd-fav-body" }, [
            Utils.el("strong", null, title),
            Utils.el("span", { class: "fd-muted" }, (isFlight ? "מחיר לאדם: " : "מחיר ללילה: ") + FD.CurrencyService.format(priceIls, Store.get().settings.currency))
          ]),
          Utils.el("button", { class: "fd-icon-btn", "aria-label": "הסרה", html: Icons.svg("close", 18), on: { click: function () {
            Store.toggleFavorite(item); updateFavCount(); openFavorites();
          } } })
        ]));
      });
    }
    FD.Modal.open("המועדפים שלי", content);
  }

  /* ================= היסטוריית חיפוש ================= */
  function renderHistory() {
    if (!refs.historyMount) return;
    var hist = Store.get().history;
    Utils.clear(refs.historyMount);
    if (!hist.length) { refs.historyMount.hidden = true; return; }
    refs.historyMount.hidden = false;

    refs.historyMount.appendChild(Utils.el("span", { class: "fd-history-label" }, [Icons.node("clock", 14), "חיפושים אחרונים:"]));
    hist.slice(0, 5).forEach(function (h) {
      var label = historyLabel(h);
      refs.historyMount.appendChild(Utils.el("button", {
        class: "fd-history-chip",
        on: { click: function () { replayHistory(h); } }
      }, label));
    });
    refs.historyMount.appendChild(Utils.el("button", {
      class: "fd-history-clear", "aria-label": "ניקוי היסטוריה",
      on: { click: function () { Store.clearHistory(); renderHistory(); } }
    }, "נקה"));
  }

  function historyLabel(h) {
    var p = h.params;
    if (h.type === "hotels") return "🏨 " + (destName(p.destination) || "מלונות") + " · " + (p.nights || "") + " ל׳";
    if (h.type === "packages") return "🎁 חבילה " + (destName(p.destination) || "");
    return "✈️ " + (destName(p.destination) || "טיסה") + " · " + Utils.formatDateHe(p.depart);
  }
  function destName(code) { return FD.MockData.AIRPORTS[code] ? FD.MockData.AIRPORTS[code].city : ""; }

  function replayHistory(h) {
    switchTab(h.type === "packages" ? "packages" : h.type === "hotels" ? "hotels" : "flights");
    // מילוי מחדש בסיסי + הרצה
    runSearch(h.params);
  }

  /* ================= UI גלובלי ================= */
  function bindGlobalUI() {
    Store.subscribe(function (state, action) {
      if (action === "favorites") updateFavCount();
      if (action === "compare" || action === "compare-full") FD.Comparison.renderBar();
      if (action === "settings" || action === "theme") { /* מחירים יתעדכנו ברינדור הבא */ }
    });

    // חזרה לראש
    var toTop = Utils.qs("#fd-to-top");
    if (toTop) {
      toTop.addEventListener("click", scrollToTop);
      window.addEventListener("scroll", Utils.debounce(function () {
        toTop.classList.toggle("is-visible", window.scrollY > 500);
      }, 100));
    }

    // כפתור חיפוש דביק במובייל
    var stickyBtn = Utils.qs("#fd-mobile-search");
    if (stickyBtn) stickyBtn.addEventListener("click", function () {
      var form = refs.searchMount.querySelector(".fd-search-submit");
      scrollToTop();
      if (form) setTimeout(function () { form.focus(); }, 300);
    });

    // ניווט עוגן חלק
    Utils.qsa('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (id.length > 1) {
          var target = Utils.qs(id);
          if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }
        }
      });
    });
  }

  function openSettings() {
    var s = Store.get().settings;
    var currencySel = Utils.el("select", { class: "fd-input", id: "set-currency" });
    FD.CurrencyService.list().forEach(function (c) {
      var o = Utils.el("option", { value: c.code }, c.label); if (c.code === s.currency) o.selected = true; currencySel.appendChild(o);
    });
    var policySel = Utils.el("select", { class: "fd-input", id: "set-policy" });
    [["all", "כל הטיסות היוצאות מישראל"], ["israeli", "חברות ישראליות בלבד"], ["priority", "כל הטיסות, עדיפות לישראליות"]].forEach(function (p) {
      var o = Utils.el("option", { value: p[0] }, p[1]); if (p[0] === s.airlinePolicy) o.selected = true; policySel.appendChild(o);
    });

    var content = Utils.el("div", { class: "fd-settings" }, [
      Utils.el("div", { class: "fd-field" }, [Utils.el("label", { class: "fd-label", "for": "set-currency" }, "מטבע תצוגה"), currencySel]),
      Utils.el("div", { class: "fd-field" }, [Utils.el("label", { class: "fd-label", "for": "set-policy" }, "מדיניות חברות תעופה"), policySel]),
      Utils.el("p", { class: "fd-muted" }, "המרות המטבע במצב הדגמה מבוססות על שערים לדוגמה. בגרסה אמיתית יש למשוך שערים ממקור רשמי."),
      Utils.el("button", { class: "fd-btn fd-btn--primary", on: { click: function () {
        Store.updateSettings({ currency: currencySel.value, airlinePolicy: policySel.value });
        FD.CurrencyService.base = currencySel.value === "ILS" ? "ILS" : FD.CurrencyService.base;
        FD.Modal.close();
        FD.Toast.show("ההגדרות נשמרו", "success");
        rerenderResults();
      } } }, "שמירה")
    ]);
    FD.Modal.open("הגדרות", content);
  }

  /* ================= עזרי גלילה ================= */
  function scrollToResults() {
    setTimeout(function () {
      if (refs.results) refs.results.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }
  function scrollToTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  // API ציבורי מצומצם
  FD.App = { init: init, rerenderResults: rerenderResults, runSearch: runSearch };

  document.addEventListener("DOMContentLoaded", init);
})(window.FD = window.FD || {});
