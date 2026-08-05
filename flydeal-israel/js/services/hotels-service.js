/*
 * hotels-service.js — שכבת שירות למלונות + Adapter אחיד לספקים
 *
 * Hotel Provider Interface:
 *   searchHotels(params)   -> Promise<Hotel[]>
 *   getHotelDetails(id)    -> Promise<Hotel|null>
 *   normalizeHotel(raw)    -> Hotel
 *   getBookingUrl(id)      -> string
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils;

  /* ================= חישובי מחיר מלון ================= */
  var Pricing = {
    // מחיר סופי לכל השהייה = (מחיר ללילה * לילות) + מיסים + עמלות חובה
    totalStay: function (pricing, nights) {
      var n = Math.max(1, nights || 1);
      return Utils.roundPrice(
        (pricing.perNight || 0) * n +
        (pricing.taxes || 0) +
        (pricing.fees || 0)
      );
    },
    avgPerNight: function (pricing, nights) {
      var n = Math.max(1, nights || 1);
      return Utils.roundPrice(this.totalStay(pricing, nights) / n);
    }
  };

  /* ================= ספק Mock ================= */
  var MockHotelProvider = {
    name: "mock",

    normalizeHotel: function (raw) {
      var city = FD.MockData.AIRPORTS[raw.city] || { code: raw.city, city: raw.city };
      return {
        id: raw.id,
        type: "hotel",
        name: raw.name,
        cityCode: raw.city,
        cityName: city.city,
        brand: raw.brand,
        gradient: raw.gradient,
        gallery: raw.gallery,
        stars: raw.stars,
        rating: raw.rating,   // {score, count, source, label}
        location: {
          area: raw.area,
          distanceCenterKm: raw.distanceCenterKm,
          attractions: raw.attractions || []
        },
        room: raw.room,
        breakfast: raw.breakfast,
        freeCancellation: raw.freeCancellation,
        payAtProperty: raw.payAtProperty,
        amenities: raw.amenities || [],
        pricing: {
          perNight: raw.pricing.perNight,
          taxes: raw.pricing.taxes,
          fees: raw.pricing.fees,
          currency: "ILS"
        },
        provider: raw.provider,
        priceUpdatedAt: raw.updatedAt,
        verified: raw.verified,
        roomsLeft: raw.roomsLeft,   // null אם לא הגיע מהספק
        bookingUrl: this.getBookingUrl(raw.id),
        source: "נתוני הדגמה"
      };
    },

    searchHotels: function (params) {
      var self = this;
      return new Promise(function (resolve) {
        setTimeout(function () {
          var results = FD.MockData.HOTELS.map(function (raw) { return self.normalizeHotel(raw); });
          results = HotelsService.applySearchParams(results, params);
          resolve(results);
        }, 650);
      });
    },

    getHotelDetails: function (id) {
      var self = this;
      return new Promise(function (resolve) {
        var raw = FD.MockData.HOTELS.filter(function (h) { return h.id === id; })[0];
        resolve(raw ? self.normalizeHotel(raw) : null);
      });
    },

    getBookingUrl: function (id) {
      return "#demo-booking/hotel/" + encodeURIComponent(id);
    }
  };

  /* ================= שלד ספק אמיתי (Booking/Expedia/Hotelbeds) ================= */
  function RealHotelProvider(config) {
    this.name = config && config.name ? config.name : "api";
    this.baseUrl = config && config.baseUrl ? config.baseUrl : "";
  }
  RealHotelProvider.prototype.searchHotels = function () {
    return Promise.reject(new Error("ספק API אמיתי אינו מוגדר במצב הדגמה. ראו README לחיבור חוקי."));
  };
  RealHotelProvider.prototype.getHotelDetails = function () { return Promise.reject(new Error("לא מוגדר")); };
  RealHotelProvider.prototype.normalizeHotel = function (raw) { return raw; };
  RealHotelProvider.prototype.getBookingUrl = function () { return "#"; };

  /* ================= שירות ראשי ================= */
  var HotelsService = {
    Pricing: Pricing,
    provider: MockHotelProvider,

    useProvider: function (mode, config) {
      if (mode === "api") this.provider = new RealHotelProvider(config);
      else this.provider = MockHotelProvider;
      return this.provider;
    },

    search: function (params) { return this.provider.searchHotels(params); },
    details: function (id) { return this.provider.getHotelDetails(id); },

    applySearchParams: function (hotels, params) {
      if (!params) return hotels;
      return hotels.filter(function (h) {
        if (params.destination && h.cityCode !== params.destination) return false;
        if (params.stars && h.stars < params.stars) return false;
        if (params.breakfast && !h.breakfast) return false;
        if (params.freeCancellation && !h.freeCancellation) return false;
        return true;
      });
    },

    /* ---------- Best Value Score למלונות ----------
     * 45% מחיר סופי, 25% דירוג אורחים, 15% קרבה למרכז, 15% הטבות (בוקר/ביטול חינם)
     */
    computeBestValue: function (hotels, nights) {
      if (!hotels.length) return hotels;
      var prices = hotels.map(function (h) { return Pricing.totalStay(h.pricing, nights); });
      var minP = Math.min.apply(null, prices), maxP = Math.max.apply(null, prices);
      var dists = hotels.map(function (h) { return h.location.distanceCenterKm; });
      var minD = Math.min.apply(null, dists), maxD = Math.max.apply(null, dists);

      function norm(v, min, max, invert) {
        if (max === min) return 1;
        var r = (v - min) / (max - min);
        return invert ? 1 - r : r;
      }

      hotels.forEach(function (h, i) {
        var priceScore = norm(prices[i], minP, maxP, true);
        var ratingScore = h.rating.score / 10;
        var distScore = norm(h.location.distanceCenterKm, minD, maxD, true);
        var perksScore = ((h.breakfast ? 0.5 : 0) + (h.freeCancellation ? 0.5 : 0));

        var score = priceScore * 0.45 + ratingScore * 0.25 + distScore * 0.15 + perksScore * 0.15;
        h.bestValueScore = Math.round(score * 100);

        var reasons = [];
        if (priceScore > 0.8) reasons.push("מחיר סופי נמוך");
        if (ratingScore > 0.88) reasons.push("דירוג אורחים גבוה");
        if (distScore > 0.8) reasons.push("קרוב למרכז");
        if (h.breakfast) reasons.push("כולל ארוחת בוקר");
        if (h.freeCancellation) reasons.push("ביטול חינם");
        h.bestValueReasons = reasons.slice(0, 3);
      });
      return hotels;
    },

    assignBadges: function (hotels, nights) {
      if (!hotels.length) return hotels;
      var withPrice = hotels.map(function (h) { return { h: h, price: Pricing.totalStay(h.pricing, nights) }; });
      var avgPrice = withPrice.reduce(function (s, x) { return s + x.price; }, 0) / withPrice.length;
      var cheapest = withPrice.slice().sort(function (a, b) { return a.price - b.price; })[0];
      var topRated = hotels.slice().sort(function (a, b) { return b.rating.score - a.rating.score; })[0];
      var bestValue = hotels.slice().sort(function (a, b) { return b.bestValueScore - a.bestValueScore; })[0];
      var closest = hotels.slice().sort(function (a, b) { return a.location.distanceCenterKm - b.location.distanceCenterKm; })[0];

      hotels.forEach(function (h) {
        var badges = [];
        if (cheapest && h.id === cheapest.h.id) badges.push({ text: "הכי זול", type: "cheap" });
        if (bestValue && h.id === bestValue.id) badges.push({ text: "התמורה הטובה ביותר", type: "value" });
        if (topRated && h.id === topRated.id) badges.push({ text: "דירוג מוביל", type: "rated" });
        if (closest && h.id === closest.id) badges.push({ text: "הקרוב למרכז", type: "near" });
        if (h.freeCancellation) badges.push({ text: "ביטול חינם", type: "flex" });
        if (h.breakfast) badges.push({ text: "כולל ארוחת בוקר", type: "bag" });
        h.badges = badges;
      });
      return hotels;
    }
  };

  FD.HotelsService = HotelsService;
})(window.FD = window.FD || {});
