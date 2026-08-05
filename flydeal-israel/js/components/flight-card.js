/*
 * flight-card.js — כרטיס טיסה + חלון פרטים מלא
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons, Svc = FD.FlightsService;

  // "לוגו" טקסטואלי מעוצב לחברת התעופה (במקום תמונות חיצוניות)
  function airlineLogo(airline) {
    var initials = airline.code;
    var logo = Utils.el("div", {
      class: "fd-airline-logo",
      style: "background:" + airline.color,
      "aria-hidden": "true"
    }, initials);
    return logo;
  }

  function badgeEl(b) {
    return Utils.el("span", { class: "fd-badge fd-badge--" + b.type }, b.text);
  }

  // מקטע מסלול: שעה-משך-שעה
  function routeSegment(seg, direction) {
    var stopsText = seg.stops.length === 0 ? "ישירה"
      : seg.stops.length + " עצירות";
    if (seg.stops.length === 1) stopsText = "עצירה אחת";
    var mid = Utils.el("div", { class: "fd-route-mid" }, [
      Utils.el("span", { class: "fd-route-dur" }, Utils.formatDuration(seg.durationMinutes)),
      Utils.el("div", { class: "fd-route-line", "aria-hidden": "true" }, Icons.node("plane", 16)),
      Utils.el("span", { class: "fd-route-stops" + (seg.stops.length ? " has-stop" : "") }, stopsText)
    ]);
    return Utils.el("div", { class: "fd-route" }, [
      Utils.el("div", { class: "fd-route-end" }, [
        Utils.el("span", { class: "fd-route-time" }, Utils.formatTime(seg.departTime)),
        Utils.el("span", { class: "fd-route-code" }, seg.from)
      ]),
      mid,
      Utils.el("div", { class: "fd-route-end" }, [
        Utils.el("span", { class: "fd-route-time" }, Utils.formatTime(seg.arriveTime)),
        Utils.el("span", { class: "fd-route-code" }, seg.to)
      ])
    ]);
  }

  function baggageInfo(f) {
    var parts = [];
    parts.push(Utils.el("span", { class: "fd-bag-item is-on" }, [Icons.node("check", 14), "תיק יד"]));
    parts.push(Utils.el("span", { class: "fd-bag-item " + (f.baggage.carryOn ? "is-on" : "is-off") },
      [Icons.node(f.baggage.carryOn ? "check" : "close", 14), "מזוודת קבינה"]));
    var checkedOn = f.baggage.checked && f.baggage.checked.included;
    parts.push(Utils.el("span", { class: "fd-bag-item " + (checkedOn ? "is-on" : "is-off") },
      [Icons.node(checkedOn ? "check" : "close", 14),
       checkedOn ? ("מזוודה " + f.baggage.checked.kg + " ק״ג") : "מזוודה"]));
    return Utils.el("div", { class: "fd-bag-row" }, parts);
  }

  function policyText(p) {
    return p === "free" ? "חינם" : p === "paid" ? "בתשלום" : "לא ניתן";
  }

  // פירוט מחיר
  function priceBreakdown(f, passengers) {
    var perPerson = Svc.Pricing.perPerson(f.pricing);
    var total = Svc.Pricing.total(perPerson, passengers);
    var cur = FD.Store.get().settings.currency;
    var fmt = function (ils) { return FD.CurrencyService.format(ils, cur); };

    var rows = [
      ["מחיר בסיס לאדם", fmt(f.pricing.base)],
      ["מיסים", fmt(f.pricing.taxes)],
      ["עמלות ודמי שירות (חובה)", fmt(f.pricing.fees)],
      ["מחיר סופי לאדם", fmt(perPerson), true]
    ];
    var list = Utils.el("div", { class: "fd-price-breakdown" });
    rows.forEach(function (r) {
      list.appendChild(Utils.el("div", { class: "fd-pb-row" + (r[2] ? " is-total" : "") }, [
        Utils.el("span", null, r[0]), Utils.el("span", null, r[1])
      ]));
    });
    if (passengers > 1) {
      list.appendChild(Utils.el("div", { class: "fd-pb-row is-grand" }, [
        Utils.el("span", null, "מחיר סופי לכל ההזמנה (" + passengers + " נוסעים)"),
        Utils.el("span", null, fmt(total))
      ]));
    }
    return list;
  }

  /* ---------- כרטיס ראשי ---------- */
  function build(f, passengers) {
    passengers = passengers || 1;
    var cur = FD.Store.get().settings.currency;
    var perPerson = Svc.Pricing.perPerson(f.pricing);
    var total = Svc.Pricing.total(perPerson, passengers);
    var mandatory = Svc.Pricing.mandatoryAddOns(f.pricing);

    var card = Utils.el("article", { class: "fd-card fd-flight-card", dataset: { id: f.id } });

    // כותרת: לוגו + חברה + תגיות
    var badges = Utils.el("div", { class: "fd-badges" }, (f.badges || []).map(badgeEl));
    var head = Utils.el("div", { class: "fd-card-head" }, [
      Utils.el("div", { class: "fd-airline" }, [
        airlineLogo(f.airline),
        Utils.el("div", { class: "fd-airline-meta" }, [
          Utils.el("span", { class: "fd-airline-name" }, f.airline.name),
          Utils.el("span", { class: "fd-flight-no" }, f.flightNumber),
          f.airline.isIsraeli ? Utils.el("span", { class: "fd-il-tag" }, "חברה ישראלית") : null
        ])
      ]),
      badges
    ]);

    // מסלולים (הלוך + חזור)
    var routes = Utils.el("div", { class: "fd-routes" }, [
      routeSegment({
        departTime: f.departTime, arriveTime: f.arriveTime, durationMinutes: f.durationMinutes,
        from: f.origin.code, to: f.destination.code, stops: f.stops
      }, "out")
    ]);
    if (f.returnFlight) {
      routes.appendChild(Utils.el("div", { class: "fd-route-divider" }, "חזרה"));
      routes.appendChild(routeSegment({
        departTime: f.returnFlight.departTime, arriveTime: f.returnFlight.arriveTime,
        durationMinutes: f.returnFlight.durationMinutes,
        from: f.destination.code, to: f.origin.code, stops: f.returnFlight.stops
      }, "in"));
    }

    // ציון תמורה
    var scoreEl = Utils.el("div", { class: "fd-score", title: "ציון תמורה מחושב" }, [
      Utils.el("span", { class: "fd-score-num" }, String(f.bestValueScore || 0)),
      Utils.el("span", { class: "fd-score-label" }, "ציון תמורה")
    ]);

    var midInfo = Utils.el("div", { class: "fd-card-mid" }, [routes, baggageInfo(f), scoreEl]);

    // אזור מחיר
    var priceMain = Utils.el("div", { class: "fd-price-main" }, [
      Utils.el("span", { class: "fd-price-caption" }, "המחיר הסופי לתשלום"),
      Utils.el("span", { class: "fd-price-value" }, FD.CurrencyService.format(passengers > 1 ? total : perPerson, cur)),
      Utils.el("span", { class: "fd-price-sub" }, passengers > 1 ? ("סה״כ ל-" + passengers + " נוסעים · כולל מיסים ועמלות") : "לאדם · כולל מיסים ועמלות")
    ]);

    if (f.belowAverage) {
      priceMain.appendChild(Utils.el("span", { class: "fd-price-hint" }, [Icons.node("trend", 14), "מתחת לממוצע התוצאות"]));
    }

    var actions = Utils.el("div", { class: "fd-card-actions" }, [
      Utils.el("button", { class: "fd-btn fd-btn--primary", on: { click: function () { onBook(f); } } }, "מעבר להזמנה"),
      Utils.el("button", { class: "fd-btn fd-btn--ghost", on: { click: function () { openDetails(f, passengers); } } }, "פרטים")
    ]);

    var favBtn = makeFavBtn(f);
    var cmpBtn = makeCompareBtn(f);

    var priceCol = Utils.el("div", { class: "fd-price-col" }, [
      Utils.el("div", { class: "fd-price-tools" }, [favBtn, cmpBtn]),
      priceMain, actions
    ]);

    // כותרת תחתונה: שקיפות
    var foot = Utils.el("div", { class: "fd-card-foot" }, [
      Utils.el("span", { class: "fd-foot-item" }, [Icons.node("clock", 13), Utils.timeAgoHe(f.priceUpdatedAt)]),
      Utils.el("span", { class: "fd-foot-item" }, "ספק: " + f.provider),
      f.verified ? Utils.el("span", { class: "fd-foot-item is-verified" }, [Icons.node("check", 13), "מחיר אומת"]) : null,
      (f.seatsLeft !== null && f.seatsLeft !== undefined) ? Utils.el("span", { class: "fd-foot-item is-warn" }, "נותרו " + f.seatsLeft + " מקומות") : null,
      Utils.el("span", { class: "fd-foot-item fd-demo-flag" }, f.source)
    ]);

    var body = Utils.el("div", { class: "fd-card-body" }, [
      Utils.el("div", { class: "fd-card-content" }, [head, midInfo, foot]),
      priceCol
    ]);

    card.appendChild(body);
    return card;
  }

  function makeFavBtn(item) {
    var isFav = FD.Store.isFavorite(item.id);
    var btn = Utils.el("button", {
      class: "fd-icon-btn fd-fav-btn" + (isFav ? " is-active" : ""),
      "aria-label": "שמירה למועדפים", "aria-pressed": isFav ? "true" : "false",
      html: Icons.svg(isFav ? "heart" : "heartOutline", 20)
    });
    btn.addEventListener("click", function () {
      var nowFav = FD.Store.toggleFavorite(item);
      btn.classList.toggle("is-active", nowFav);
      btn.setAttribute("aria-pressed", nowFav ? "true" : "false");
      btn.innerHTML = Icons.svg(nowFav ? "heart" : "heartOutline", 20);
      FD.Toast.show(nowFav ? "נוסף למועדפים" : "הוסר מהמועדפים", "success");
    });
    return btn;
  }

  function makeCompareBtn(item) {
    var inC = FD.Store.inCompare(item.id);
    var btn = Utils.el("button", {
      class: "fd-icon-btn fd-cmp-btn" + (inC ? " is-active" : ""),
      "aria-label": "הוספה להשוואה", "aria-pressed": inC ? "true" : "false", title: "השוואה",
      html: '<span class="fd-cmp-mark">⇄</span>'
    });
    btn.addEventListener("click", function () {
      var ok = FD.Store.toggleCompare("flight", item.id);
      if (ok === false && !FD.Store.inCompare(item.id)) {
        FD.Toast.show("ניתן להשוות עד 3 פריטים", "error");
        return;
      }
      var active = FD.Store.inCompare(item.id);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    return btn;
  }

  function onBook(f) {
    // מצב הדגמה: אין הזמנה אמיתית
    FD.Modal.open("מעבר להזמנה — " + f.airline.name, Utils.el("div", { class: "fd-book-demo" }, [
      Utils.el("p", { class: "fd-demo-note" }, "זהו מצב הדגמה. הקישור אינו מוביל להזמנה אמיתית."),
      Utils.el("p", null, "בגרסה מחוברת ל-API, כפתור זה יעביר אתכם לאתר ספק ההזמנה (" + f.provider + ") להשלמת התשלום, שם יוצג המחיר הסופי המחייב."),
      Utils.el("p", { class: "fd-book-price" }, "מחיר סופי לאדם: " + FD.CurrencyService.format(Svc.Pricing.perPerson(f.pricing), FD.Store.get().settings.currency))
    ]));
  }

  function openDetails(f, passengers) {
    var cur = FD.Store.get().settings.currency;
    var content = Utils.el("div", { class: "fd-details" }, [
      Utils.el("div", { class: "fd-details-head" }, [
        airlineLogo(f.airline),
        Utils.el("div", null, [
          Utils.el("h3", null, f.airline.name + " · " + f.origin.city + " → " + f.destination.city),
          Utils.el("p", { class: "fd-muted" }, "טיסה " + f.flightNumber + " · מחלקת " + cabinName(f.cabin))
        ])
      ]),
      Utils.el("h4", null, "מסלול הטיסה"),
      segmentDetail("הלוך", f.origin, f.destination, f),
      f.returnFlight ? segmentDetail("חזור", f.destination, f.origin, {
        departTime: f.returnFlight.departTime, arriveTime: f.returnFlight.arriveTime,
        durationMinutes: f.returnFlight.durationMinutes, stops: f.returnFlight.stops, flightNumber: f.returnFlight.flightNumber
      }) : null,
      Utils.el("h4", null, "כבודה"),
      baggageInfo(f),
      Utils.el("h4", null, "תנאי כרטיס"),
      Utils.el("ul", { class: "fd-terms" }, [
        Utils.el("li", null, "שינוי טיסה: " + policyText(f.changePolicy)),
        Utils.el("li", null, "ביטול: " + policyText(f.cancelPolicy))
      ]),
      f.bestValueReasons && f.bestValueReasons.length ? Utils.el("div", { class: "fd-why" }, [
        Utils.el("h4", null, "מדוע העסקה קיבלה ציון " + f.bestValueScore + "?"),
        Utils.el("ul", { class: "fd-why-list" }, f.bestValueReasons.map(function (r) {
          return Utils.el("li", null, [Icons.node("check", 14), r]);
        }))
      ]) : null,
      Utils.el("h4", null, "פירוט מחיר"),
      priceBreakdown(f, passengers),
      Utils.el("p", { class: "fd-details-note" }, "שירותים אופציונליים (בחירת מושב, מזוודה נוספת) יתומחרו בנפרד באתר ספק ההזמנה."),
      Utils.el("div", { class: "fd-details-transparency" }, [
        Utils.el("span", null, Utils.timeAgoHe(f.priceUpdatedAt) + " · מקור: " + f.provider),
        Utils.el("span", { class: "fd-demo-flag" }, f.source)
      ])
    ]);
    FD.Modal.open("פרטי טיסה", content);
  }

  function segmentDetail(label, from, to, seg) {
    var stopText = seg.stops && seg.stops.length ? seg.stops.map(function (s) {
      return "עצירה ב" + s.city + " (" + Utils.formatDuration(s.layoverMinutes) + " המתנה)";
    }).join(", ") : "טיסה ישירה";
    return Utils.el("div", { class: "fd-seg-detail" }, [
      Utils.el("div", { class: "fd-seg-label" }, label),
      Utils.el("div", { class: "fd-seg-row" }, [
        Utils.el("strong", null, Utils.formatTime(seg.departTime) + " " + (from.city || from)),
        Utils.el("span", { class: "fd-muted" }, " → "),
        Utils.el("strong", null, Utils.formatTime(seg.arriveTime) + " " + (to.city || to))
      ]),
      Utils.el("div", { class: "fd-muted" }, Utils.formatDateHe(seg.departTime) + " · " + Utils.formatDuration(seg.durationMinutes) + " · " + stopText)
    ]);
  }

  function cabinName(c) {
    return { economy: "תיירים", premium: "תיירים פלוס", business: "עסקים", first: "ראשונה" }[c] || c;
  }

  FD.FlightCard = { build: build, openDetails: openDetails };
})(window.FD = window.FD || {});
