/*
 * hotel-card.js — כרטיס מלון + חלון פרטים וגלריה
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons, Svc = FD.HotelsService;

  var AMENITY_LABELS = {
    wifi: "Wi-Fi", pool: "בריכה", gym: "חדר כושר", spa: "ספא",
    parking: "חניה", accessible: "נגישות", breakfast: "ארוחת בוקר"
  };

  // "תמונה" — רקע גרדיאנט מעוצב (במקום תמונות חיצוניות שעלולות להישבר)
  function gradientStyle(index) {
    var gradients = [
      "linear-gradient(135deg,#1e3a8a,#0ea5e9)",
      "linear-gradient(135deg,#7c2d12,#f59e0b)",
      "linear-gradient(135deg,#134e4a,#10b981)",
      "linear-gradient(135deg,#4c1d95,#a855f7)",
      "linear-gradient(135deg,#0c4a6e,#38bdf8)",
      "linear-gradient(135deg,#831843,#ec4899)",
      "linear-gradient(135deg,#064e3b,#34d399)"
    ];
    return gradients[index % gradients.length];
  }

  function stars(n) {
    var wrap = Utils.el("span", { class: "fd-stars", "aria-label": n + " כוכבים" });
    for (var i = 0; i < n; i++) wrap.appendChild(Icons.node("star", 14));
    return wrap;
  }

  function ratingBox(rating) {
    return Utils.el("div", { class: "fd-rating" }, [
      Utils.el("div", { class: "fd-rating-score", "aria-hidden": "true" }, rating.score.toFixed(1)),
      Utils.el("div", { class: "fd-rating-meta" }, [
        Utils.el("span", { class: "fd-rating-label" }, rating.label),
        Utils.el("span", { class: "fd-rating-count" }, Utils.formatNumber(rating.count) + " חוות דעת"),
        Utils.el("span", { class: "fd-rating-src" }, "מקור: " + rating.source)
      ])
    ]);
  }

  function amenityChips(list) {
    return Utils.el("div", { class: "fd-amenities" }, list.slice(0, 5).map(function (a) {
      var iconName = Icons.amenity[a] || "check";
      return Utils.el("span", { class: "fd-amenity" }, [Icons.node(iconName, 15), AMENITY_LABELS[a] || a]);
    }));
  }

  function badgeEl(b) { return Utils.el("span", { class: "fd-badge fd-badge--" + b.type }, b.text); }

  function build(h, nights) {
    nights = nights || 1;
    var cur = FD.Store.get().settings.currency;
    var total = Svc.Pricing.totalStay(h.pricing, nights);
    var avg = Svc.Pricing.avgPerNight(h.pricing, nights);
    var fmt = function (ils) { return FD.CurrencyService.format(ils, cur); };

    var card = Utils.el("article", { class: "fd-card fd-hotel-card", dataset: { id: h.id } });

    // תמונה עם lazy overlay
    var media = Utils.el("div", { class: "fd-hotel-media", style: "background:" + gradientStyle(h.gradient) }, [
      Utils.el("div", { class: "fd-media-badges" }, (h.badges || []).slice(0, 2).map(badgeEl)),
      Utils.el("div", { class: "fd-media-icon", "aria-hidden": "true", html: Icons.svg("hotel", 40) }),
      Utils.el("span", { class: "fd-media-count" }, (h.gallery ? h.gallery.length : 1) + " תמונות")
    ]);

    var favBtn = makeFavBtn(h);
    var cmpBtn = makeCompareBtn(h);
    media.appendChild(Utils.el("div", { class: "fd-media-tools" }, [favBtn, cmpBtn]));

    var titleRow = Utils.el("div", { class: "fd-hotel-title" }, [
      Utils.el("h3", { class: "fd-hotel-name" }, h.name),
      stars(h.stars)
    ]);

    var locRow = Utils.el("div", { class: "fd-hotel-loc" }, [
      Icons.node("location", 15),
      Utils.el("span", null, h.location.area + " · " + h.location.distanceCenterKm + " ק״מ ממרכז " + h.cityName)
    ]);

    var roomRow = Utils.el("div", { class: "fd-hotel-room" }, [
      Utils.el("span", null, h.room.type + (h.room.sizeM2 ? " · " + h.room.sizeM2 + " מ״ר" : "") + " · " + h.room.bedType)
    ]);

    var perks = Utils.el("div", { class: "fd-hotel-perks" }, [
      h.breakfast ? Utils.el("span", { class: "fd-perk is-on" }, [Icons.node("check", 13), "ארוחת בוקר"]) : null,
      h.freeCancellation ? Utils.el("span", { class: "fd-perk is-on" }, [Icons.node("check", 13), "ביטול חינם"]) : null,
      Utils.el("span", { class: "fd-perk" }, h.payAtProperty ? "תשלום במקום אפשרי" : "תשלום מראש")
    ]);

    var scoreEl = Utils.el("div", { class: "fd-score fd-score--sm", title: "ציון תמורה" }, [
      Utils.el("span", { class: "fd-score-num" }, String(h.bestValueScore || 0)),
      Utils.el("span", { class: "fd-score-label" }, "תמורה")
    ]);

    var info = Utils.el("div", { class: "fd-hotel-info" }, [
      titleRow, ratingBox(h.rating), locRow, roomRow, amenityChips(h.amenities), perks
    ]);

    var priceMain = Utils.el("div", { class: "fd-price-main" }, [
      Utils.el("span", { class: "fd-price-caption" }, "המחיר הסופי לכל השהייה"),
      Utils.el("span", { class: "fd-price-value" }, fmt(total)),
      Utils.el("span", { class: "fd-price-sub" }, nights + " לילות · ממוצע " + fmt(avg) + " ללילה · כולל מיסים ועמלות")
    ]);

    var actions = Utils.el("div", { class: "fd-card-actions" }, [
      Utils.el("button", { class: "fd-btn fd-btn--primary", on: { click: function () { onBook(h); } } }, "מעבר להזמנה"),
      Utils.el("button", { class: "fd-btn fd-btn--ghost", on: { click: function () { openDetails(h, nights); } } }, "פרטים")
    ]);

    var foot = Utils.el("div", { class: "fd-card-foot" }, [
      Utils.el("span", { class: "fd-foot-item" }, [Icons.node("clock", 13), Utils.timeAgoHe(h.priceUpdatedAt)]),
      Utils.el("span", { class: "fd-foot-item" }, "ספק: " + h.provider),
      h.verified ? Utils.el("span", { class: "fd-foot-item is-verified" }, [Icons.node("check", 13), "מחיר אומת"]) : null,
      (h.roomsLeft !== null && h.roomsLeft !== undefined) ? Utils.el("span", { class: "fd-foot-item is-warn" }, "נותרו " + h.roomsLeft + " חדרים") : null,
      Utils.el("span", { class: "fd-foot-item fd-demo-flag" }, h.source)
    ]);

    var priceCol = Utils.el("div", { class: "fd-price-col" }, [scoreEl, priceMain, actions]);

    var body = Utils.el("div", { class: "fd-hotel-body" }, [info, priceCol]);

    card.appendChild(media);
    card.appendChild(body);
    card.appendChild(foot);
    return card;
  }

  function makeFavBtn(item) {
    var isFav = FD.Store.isFavorite(item.id);
    var btn = Utils.el("button", {
      class: "fd-icon-btn fd-fav-btn fd-fav-btn--onmedia" + (isFav ? " is-active" : ""),
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
      class: "fd-icon-btn fd-cmp-btn fd-cmp-btn--onmedia" + (inC ? " is-active" : ""),
      "aria-label": "הוספה להשוואה", "aria-pressed": inC ? "true" : "false", title: "השוואה",
      html: '<span class="fd-cmp-mark">⇄</span>'
    });
    btn.addEventListener("click", function () {
      var ok = FD.Store.toggleCompare("hotel", item.id);
      if (ok === false && !FD.Store.inCompare(item.id)) { FD.Toast.show("ניתן להשוות עד 3 פריטים", "error"); return; }
      var active = FD.Store.inCompare(item.id);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    return btn;
  }

  function onBook(h) {
    FD.Modal.open("מעבר להזמנה — " + h.name, Utils.el("div", { class: "fd-book-demo" }, [
      Utils.el("p", { class: "fd-demo-note" }, "זהו מצב הדגמה. הקישור אינו מוביל להזמנה אמיתית."),
      Utils.el("p", null, "בגרסה מחוברת ל-API, כפתור זה יעביר אתכם לאתר ספק ההזמנה (" + h.provider + ") להשלמת ההזמנה.")
    ]));
  }

  function openDetails(h, nights) {
    var cur = FD.Store.get().settings.currency;
    var fmt = function (ils) { return FD.CurrencyService.format(ils, cur); };
    var total = Svc.Pricing.totalStay(h.pricing, nights);

    // גלריה מגרדיאנטים
    var gallery = Utils.el("div", { class: "fd-gallery" }, (h.gallery || [h.gradient]).map(function (g, i) {
      return Utils.el("div", { class: "fd-gallery-img" + (i === 0 ? " is-main" : ""), style: "background:" + gradientStyle(g), "aria-hidden": "true", html: Icons.svg("hotel", 28) });
    }));

    var breakdown = Utils.el("div", { class: "fd-price-breakdown" }, [
      pbRow("מחיר ללילה", fmt(h.pricing.perNight)),
      pbRow("מספר לילות", String(nights)),
      pbRow("מיסים", fmt(h.pricing.taxes)),
      pbRow("עמלות (חובה)", fmt(h.pricing.fees)),
      pbRow("מחיר סופי לכל השהייה", fmt(total), "is-total"),
      pbRow("מחיר ממוצע ללילה", fmt(Svc.Pricing.avgPerNight(h.pricing, nights)))
    ]);

    var content = Utils.el("div", { class: "fd-details" }, [
      gallery,
      Utils.el("div", { class: "fd-details-head" }, [
        Utils.el("div", null, [
          Utils.el("h3", null, h.name),
          Utils.el("p", { class: "fd-muted" }, [stars(h.stars), " · " + h.location.area + " · " + h.cityName])
        ]),
        ratingBox(h.rating)
      ]),
      Utils.el("h4", null, "מיקום ואטרקציות"),
      Utils.el("ul", { class: "fd-terms" }, [
        Utils.el("li", null, h.location.distanceCenterKm + " ק״מ ממרכז העיר")
      ].concat(h.location.attractions.map(function (a) {
        return Utils.el("li", null, a.name + " — " + a.distanceKm + " ק״מ");
      }))),
      Utils.el("h4", null, "החדר"),
      Utils.el("p", null, h.room.type + (h.room.sizeM2 ? " · " + h.room.sizeM2 + " מ״ר" : "") + " · " + h.room.bedType),
      Utils.el("h4", null, "מתקנים"),
      amenityChips(h.amenities),
      Utils.el("h4", null, "תנאים"),
      Utils.el("ul", { class: "fd-terms" }, [
        Utils.el("li", null, "ארוחת בוקר: " + (h.breakfast ? "כלולה" : "לא כלולה")),
        Utils.el("li", null, "ביטול: " + (h.freeCancellation ? "חינם" : "בתשלום")),
        Utils.el("li", null, "תשלום: " + (h.payAtProperty ? "אפשרי במקום" : "מראש"))
      ]),
      h.bestValueReasons && h.bestValueReasons.length ? Utils.el("div", { class: "fd-why" }, [
        Utils.el("h4", null, "מדוע העסקה קיבלה ציון " + h.bestValueScore + "?"),
        Utils.el("ul", { class: "fd-why-list" }, h.bestValueReasons.map(function (r) {
          return Utils.el("li", null, [Icons.node("check", 14), r]);
        }))
      ]) : null,
      Utils.el("h4", null, "פירוט מחיר"),
      breakdown,
      Utils.el("div", { class: "fd-details-transparency" }, [
        Utils.el("span", null, Utils.timeAgoHe(h.priceUpdatedAt) + " · מקור: " + h.provider),
        Utils.el("span", { class: "fd-demo-flag" }, h.source)
      ])
    ]);
    FD.Modal.open("פרטי מלון", content);
  }

  function pbRow(label, val, cls) {
    return Utils.el("div", { class: "fd-pb-row " + (cls || "") }, [
      Utils.el("span", null, label), Utils.el("span", null, val)
    ]);
  }

  FD.HotelCard = { build: build, openDetails: openDetails, gradientStyle: gradientStyle };
})(window.FD = window.FD || {});
