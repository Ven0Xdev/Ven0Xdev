/*
 * config.example.js — קובץ תצורה לדוגמה
 *
 * העתיקו קובץ זה ל-config.js והתאימו את הערכים.
 * ⚠️ אזהרת אבטחה: אין להטמיע מפתחות API אמיתיים בקבצי Frontend!
 *    מפתחות API חייבים להישמר בצד השרת (Backend / Serverless Function) בלבד.
 *    קובץ ה-Frontend צריך לפנות לנקודת קצה (endpoint) פנימית שלכם, שהיא זו
 *    שמחזיקה את המפתחות ומדברת מול הספקים.
 *
 * הקובץ מכיל שמות משתנים לדוגמה בלבד — ללא ערכים אמיתיים.
 */
window.FD_CONFIG = {
  // מצב נתונים: "mock" (הדגמה) | "api" (רק API אמיתי) | "hybrid" (API עם נפילה למוק)
  DATA_MODE: "mock",

  // הגדרות אזוריות (ברירת מחדל: ישראל)
  locale: {
    language: "he",
    direction: "rtl",
    currency: "ILS",
    defaultOrigin: "TLV",
    timezone: "Asia/Jerusalem"
  },

  // כתובת ה-Backend שלכם (proxy) — לא כתובת הספק הישיר!
  // ה-Backend הוא שמחזיק את מפתחות ה-API ופונה לספקים.
  apiBaseUrl: "https://your-backend.example.com/api",

  // הגדרות ספקים — כאן מציינים אילו ספקים פעילים.
  // המפתחות עצמם (apiKey/secret) נשמרים בצד השרת ואינם מופיעים כאן.
  providers: {
    flights: {
      // "amadeus" | "duffel" | "travelpayouts" | "custom"
      active: "duffel",
      amadeus: { enabled: false, envKeyName: "AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET" },
      duffel: { enabled: true, envKeyName: "DUFFEL_ACCESS_TOKEN" },
      travelpayouts: { enabled: false, envKeyName: "TRAVELPAYOUTS_TOKEN / TRAVELPAYOUTS_MARKER" }
    },
    hotels: {
      // "booking" | "expedia" | "hotelbeds" | "custom"
      active: "hotelbeds",
      booking: { enabled: false, envKeyName: "BOOKING_AFFILIATE_ID / BOOKING_API_KEY" },
      expedia: { enabled: false, envKeyName: "EXPEDIA_RAPID_API_KEY / EXPEDIA_RAPID_SECRET" },
      hotelbeds: { enabled: true, envKeyName: "HOTELBEDS_API_KEY / HOTELBEDS_SECRET" }
    }
  },

  // הגדרות תצוגה
  ui: {
    defaultView: "grid",          // "grid" | "list"
    resultsPerPage: 8,
    enableDarkMode: true
  },

  // המרות מטבע — במצב אמיתי יש למשוך שערים מ-API רשמי (למשל בנק ישראל / ספק שערים).
  currency: {
    base: "ILS",
    ratesEndpoint: "/rates"       // נקודת קצה ב-Backend שלכם שמחזירה שערים מעודכנים
  }
};
