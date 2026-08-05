/*
 * flights-service.js — שכבת שירות לטיסות + Adapter אחיד לספקים
 *
 * Flight Provider Interface:
 *   searchFlights(params)   -> Promise<Flight[]>  (טיסות מנורמלות)
 *   getFlightDetails(id)    -> Promise<Flight|null>
 *   normalizeFlight(raw)    -> Flight              (המרה לפורמט אחיד)
 *   getBookingUrl(id)       -> string
 *
 * המבנה מאפשר להחליף בקלות בין MockProvider לספק אמיתי (Duffel/Amadeus/…)
 * מבלי לשנות את שאר האפליקציה.
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils;

  /* ================= פונקציות חישוב מחיר (מרכזיות) ================= */
  // הפרדה מוחלטת בין עמלות חובה (Mandatory) לתוספות אופציונליות (Optional).
  var Pricing = {
    // מחיר סופי לאדם = בסיס + מיסים + עמלות חובה + תוספות שנבחרו
    perPerson: function (pricing, selectedExtras) {
      var extras = selectedExtras || 0;
      return Utils.roundPrice(
        (pricing.base || 0) +
        (pricing.taxes || 0) +   // mandatoryTaxes
        (pricing.fees || 0) +    // mandatoryFees
        extras                   // optionalExtras
      );
    },
    // סכום עמלות החובה בלבד (ללא בסיס)
    mandatoryAddOns: function (pricing) {
      return Utils.roundPrice((pricing.taxes || 0) + (pricing.fees || 0));
    },
    // מחיר לכל הנוסעים
    total: function (perPersonPrice, passengers) {
      return Utils.roundPrice(perPersonPrice * Math.max(1, passengers || 1));
    }
  };

  /* ================= ספק Mock ================= */
  var MockFlightProvider = {
    name: "mock",

    // המרת רשומת מוק גולמית לאובייקט טיסה מנורמל אחיד
    normalizeFlight: function (raw) {
      var airline = FD.MockData.AIRLINES[raw.airlineCode] || { code: raw.airlineCode, name: raw.airlineCode, isIsraeli: false, color: "#64748b" };
      var origin = FD.MockData.AIRPORTS[raw.origin];
      var destination = FD.MockData.AIRPORTS[raw.destination];
      var depart = FD.MockData.iso(raw.date, raw.departH, raw.departM);
      var arrive = new Date(new Date(depart).getTime() + raw.durationMinutes * 60000).toISOString();

      var ret = null;
      if (raw.returnFlight) {
        var rDepart = FD.MockData.iso(raw.returnFlight.date, raw.returnFlight.departH, raw.returnFlight.departM);
        var rArrive = new Date(new Date(rDepart).getTime() + raw.returnFlight.durationMinutes * 60000).toISOString();
        ret = {
          flightNumber: raw.returnFlight.flightNumber,
          departTime: rDepart, arriveTime: rArrive,
          durationMinutes: raw.returnFlight.durationMinutes,
          stops: raw.returnFlight.stopsList || []
        };
      }

      return {
        id: raw.id,
        type: "flight",
        airline: airline,
        flightNumber: raw.flightNumber,
        origin: origin, destination: destination,
        departTime: depart, arriveTime: arrive,
        durationMinutes: raw.durationMinutes,
        stops: raw.stopsList || [],
        direct: (raw.stopsList || []).length === 0,
        stopsCount: (raw.stopsList || []).length,
        cabin: raw.cabin,
        baggage: {
          handbag: raw.handbag, carryOn: raw.carryOn,
          checked: raw.checked
        },
        changePolicy: raw.changePolicy,   // "free" | "paid" | "none"
        cancelPolicy: raw.cancelPolicy,
        pricing: {
          base: raw.pricing.base,
          taxes: raw.pricing.taxes,
          fees: raw.pricing.fees,
          currency: "ILS"
        },
        returnFlight: ret,
        provider: raw.provider,
        priceUpdatedAt: raw.updatedAt,
        verified: raw.verified,
        seatsLeft: raw.seatsLeft,   // null אם המידע לא הגיע מהספק
        bookingUrl: this.getBookingUrl(raw.id),
        source: "נתוני הדגמה"
      };
    },

    searchFlights: function (params) {
      var self = this;
      return new Promise(function (resolve) {
        // דמיית זמן תגובת רשת
        setTimeout(function () {
          var results = FD.MockData.FLIGHTS.map(function (raw) {
            return self.normalizeFlight(raw);
          });
          results = FlightsService.applySearchParams(results, params);
          resolve(results);
        }, 650);
      });
    },

    getFlightDetails: function (id) {
      var self = this;
      return new Promise(function (resolve) {
        var raw = FD.MockData.FLIGHTS.filter(function (f) { return f.id === id; })[0];
        resolve(raw ? self.normalizeFlight(raw) : null);
      });
    },

    getBookingUrl: function (id) {
      // במצב הדגמה זהו קישור להמחשה בלבד (אינו מוביל להזמנה אמיתית).
      return "#demo-booking/flight/" + encodeURIComponent(id);
    }
  };

  /* ================= שלד ספק אמיתי (Duffel/Amadeus) — לא פעיל בהדגמה =================
   * דוגמה כיצד לחבר ספק אמיתי. כל הקריאות עוברות דרך ה-Backend שלכם (proxy),
   * שם נשמרים מפתחות ה-API. אין לפנות ישירות לספק מה-Frontend.
   */
  function RealFlightProvider(config) {
    this.name = config && config.name ? config.name : "api";
    this.baseUrl = config && config.baseUrl ? config.baseUrl : "";
  }
  RealFlightProvider.prototype.searchFlights = function (params) {
    // fetch(this.baseUrl + "/flights/search", { method:"POST", body: JSON.stringify(params) })
    //   .then(r => r.json()).then(list => list.map(this.normalizeFlight, this));
    return Promise.reject(new Error("ספק API אמיתי אינו מוגדר במצב הדגמה. ראו README לחיבור חוקי."));
  };
  RealFlightProvider.prototype.getFlightDetails = function (id) {
    return Promise.reject(new Error("לא מוגדר"));
  };
  RealFlightProvider.prototype.normalizeFlight = function (raw) {
    // כאן ממפים את שדות הספק לפורמט האחיד (ראו MockFlightProvider.normalizeFlight)
    return raw;
  };
  RealFlightProvider.prototype.getBookingUrl = function (id) { return "#"; };

  /* ================= שירות ראשי ================= */
  var FlightsService = {
    Pricing: Pricing,
    provider: MockFlightProvider,

    // בחירת ספק לפי מצב הנתונים
    useProvider: function (mode, config) {
      if (mode === "api") this.provider = new RealFlightProvider(config);
      else this.provider = MockFlightProvider; // mock / hybrid מתחילים במוק
      return this.provider;
    },

    search: function (params) { return this.provider.searchFlights(params); },
    details: function (id) { return this.provider.getFlightDetails(id); },

    // סינון ראשוני לפי פרמטרי חיפוש (יעד, ישירות, חברות ישראליות)
    applySearchParams: function (flights, params) {
      if (!params) return flights;
      return flights.filter(function (f) {
        if (params.destination && f.destination.code !== params.destination) return false;
        if (params.directOnly && !f.direct) return false;
        if (params.baggageIncluded && !(f.baggage.checked && f.baggage.checked.included)) return false;
        // מדיניות חברות: all | israeli | priority
        if (params.airlinePolicy === "israeli" && !f.airline.isIsraeli) return false;
        return true;
      });
    },

    /* ---------- Best Value Score ----------
     * 45% מחיר סופי, 20% משך טיסה, 15% מספר עצירות, 10% כבודה כלולה, 10% גמישות
     * הציון מנורמל 0..100 מול קבוצת התוצאות הנוכחית.
     */
    computeBestValue: function (flights, passengers) {
      if (!flights.length) return flights;
      var prices = flights.map(function (f) { return Pricing.total(Pricing.perPerson(f.pricing), passengers); });
      var durations = flights.map(function (f) { return f.durationMinutes + (f.returnFlight ? f.returnFlight.durationMinutes : 0); });
      var minP = Math.min.apply(null, prices), maxP = Math.max.apply(null, prices);
      var minD = Math.min.apply(null, durations), maxD = Math.max.apply(null, durations);

      function norm(val, min, max) { return max === min ? 1 : 1 - (val - min) / (max - min); }

      flights.forEach(function (f, i) {
        var priceScore = norm(prices[i], minP, maxP);                    // זול יותר = טוב יותר
        var durScore = norm(durations[i], minD, maxD);                   // קצר יותר = טוב יותר
        var stopScore = f.stopsCount === 0 ? 1 : f.stopsCount === 1 ? 0.6 : 0.3;
        var bagScore = (f.baggage.checked && f.baggage.checked.included) ? 1 : (f.baggage.carryOn ? 0.5 : 0.2);
        var flexScore = f.changePolicy === "free" ? 1 : f.changePolicy === "paid" ? 0.5 : 0.2;

        var score = priceScore * 0.45 + durScore * 0.20 + stopScore * 0.15 + bagScore * 0.10 + flexScore * 0.10;
        f.bestValueScore = Math.round(score * 100);

        // הסבר קצר לדירוג
        var reasons = [];
        if (priceScore > 0.8) reasons.push("מחיר סופי נמוך");
        if (stopScore === 1) reasons.push("טיסה ישירה");
        if (bagScore === 1) reasons.push("מזוודה כלולה");
        if (flexScore === 1) reasons.push("שינוי חינם");
        if (durScore > 0.8) reasons.push("משך טיסה קצר");
        f.bestValueReasons = reasons.slice(0, 3);
      });

      return flights;
    },

    /* ---------- תגיות ---------- */
    assignBadges: function (flights, passengers) {
      if (!flights.length) return flights;
      var withPrice = flights.map(function (f) {
        return { f: f, price: Pricing.total(Pricing.perPerson(f.pricing), passengers), dur: f.durationMinutes };
      });
      var avgPrice = withPrice.reduce(function (s, x) { return s + x.price; }, 0) / withPrice.length;
      var cheapest = withPrice.slice().sort(function (a, b) { return a.price - b.price; })[0];
      var fastest = withPrice.slice().sort(function (a, b) { return a.dur - b.dur; })[0];
      var bestValue = flights.slice().sort(function (a, b) { return b.bestValueScore - a.bestValueScore; })[0];

      flights.forEach(function (f) {
        var badges = [];
        var price = Pricing.total(Pricing.perPerson(f.pricing), passengers);
        if (cheapest && f.id === cheapest.f.id) badges.push({ text: "הכי זול", type: "cheap" });
        if (bestValue && f.id === bestValue.id) badges.push({ text: "המשתלם ביותר", type: "value" });
        if (fastest && f.id === fastest.f.id) badges.push({ text: "המהירה ביותר", type: "fast" });
        if (f.direct) badges.push({ text: "ישירה", type: "direct" });
        if (f.baggage.checked && f.baggage.checked.included) badges.push({ text: "כולל מזוודה", type: "bag" });
        if (f.changePolicy === "free") badges.push({ text: "שינוי חינם", type: "flex" });
        if (price < avgPrice * 0.85) badges.push({ text: "מחיר טוב ביחס לממוצע", type: "good-price" });
        f.badges = badges;
        f.belowAverage = price < avgPrice; // להתראת מחיר
      });
      return flights;
    }
  };

  FD.FlightsService = FlightsService;
})(window.FD = window.FD || {});
