/*
 * currency-service.js — שירות מטבע והמרה
 *
 * במצב mock מוצגים שערי הדגמה. במצב api יש למשוך שערים מנקודת קצה בצד השרת
 * (config.currency.ratesEndpoint) המבוססת על מקור רשמי (בנק ישראל / ספק שערים מורשה).
 */
(function (FD) {
  "use strict";

  // שערי הדגמה יחסית לשקל (ILS = 1). נתוני הדגמה בלבד.
  var DEMO_RATES = {
    ILS: 1,
    USD: 3.7,   // 1 USD = 3.7 ILS
    EUR: 4.0,
    GBP: 4.7
  };

  var CURRENCIES = [
    { code: "ILS", label: "₪ שקל" },
    { code: "USD", label: "$ דולר" },
    { code: "EUR", label: "€ אירו" },
    { code: "GBP", label: "£ ליש״ט" }
  ];

  var CurrencyService = {
    base: "ILS",
    rates: DEMO_RATES,
    isDemo: true,

    list: function () { return CURRENCIES.slice(); },

    // המרה מ-ILS למטבע יעד
    convert: function (amountIls, targetCurrency) {
      var rate = this.rates[targetCurrency] || 1;
      return amountIls / rate;
    },

    // עיצוב סכום שנשמר ב-ILS, מוצג במטבע הנבחר
    format: function (amountIls, targetCurrency) {
      targetCurrency = targetCurrency || this.base;
      var converted = this.convert(amountIls, targetCurrency);
      return FD.Utils.formatCurrency(converted, targetCurrency);
    },

    // חיבור עתידי ל-API אמיתי:
    // fetchRates() ימשוך שערים מ-config.currency.ratesEndpoint (Backend proxy)
    fetchRates: function () {
      return Promise.resolve(this.rates);
    }
  };

  FD.CurrencyService = CurrencyService;
})(window.FD = window.FD || {});
