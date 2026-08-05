/*
 * mock-data.js — נתוני הדגמה (DEMO DATA)
 *
 * חשוב: כל הנתונים כאן הם נתוני הדגמה בלבד ואינם מחירים אמיתיים.
 * הם משמשים להצגת ממשק המשתמש במצב DATA_MODE = "mock".
 * בעת חיבור API אמיתי, השתמשו בשכבת ה-Services והציגו אך ורק נתונים מהספק.
 */
(function (FD) {
  "use strict";

  /* ---------- חברות תעופה ---------- */
  // isIsraeli מסמן חברות תעופה ישראליות. color משמש ליצירת "לוגו" טקסטואלי מעוצב.
  var AIRLINES = {
    LY: { code: "LY", name: "אל על", nameEn: "EL AL", isIsraeli: true, color: "#0a4bab" },
    IZ: { code: "IZ", name: "ארקיע", nameEn: "Arkia", isIsraeli: true, color: "#e11d48" },
    "6H": { code: "6H", name: "ישראייר", nameEn: "Israir", isIsraeli: true, color: "#0891b2" },
    IQ: { code: "IQ", name: "Air Haifa", nameEn: "Air Haifa", isIsraeli: true, color: "#0f766e" },
    A3: { code: "A3", name: "אג׳יאן", nameEn: "Aegean", isIsraeli: false, color: "#123a8b" },
    W6: { code: "W6", name: "ויז אייר", nameEn: "Wizz Air", isIsraeli: false, color: "#c2178f" },
    FR: { code: "FR", name: "ראיינאייר", nameEn: "Ryanair", isIsraeli: false, color: "#12539b" },
    FZ: { code: "FZ", name: "פליי דובאי", nameEn: "flydubai", isIsraeli: false, color: "#c69a3a" },
    TK: { code: "TK", name: "טורקיש", nameEn: "Turkish", isIsraeli: false, color: "#b7132a" }
  };

  /* ---------- שדות תעופה / יעדים ---------- */
  var AIRPORTS = {
    TLV: { code: "TLV", city: "תל אביב", airport: "נתב״ג", country: "ישראל" },
    ATH: { code: "ATH", city: "אתונה", airport: "אלפתריוס וניזלוס", country: "יוון" },
    FCO: { code: "FCO", city: "רומא", airport: "פיומיצ׳ינו", country: "איטליה" },
    BUD: { code: "BUD", city: "בודפשט", airport: "פרנץ ליסט", country: "הונגריה" },
    PRG: { code: "PRG", city: "פראג", airport: "ואצלב האוול", country: "צ׳כיה" },
    LCA: { code: "LCA", city: "לרנקה", airport: "לרנקה", country: "קפריסין" },
    PFO: { code: "PFO", city: "פאפוס", airport: "פאפוס", country: "קפריסין" },
    BUS: { code: "BUS", city: "בטומי", airport: "בטומי", country: "גאורגיה" },
    TBS: { code: "TBS", city: "טביליסי", airport: "טביליסי", country: "גאורגיה" },
    DXB: { code: "DXB", city: "דובאי", airport: "דובאי הבינלאומי", country: "איחוד האמירויות" },
    BCN: { code: "BCN", city: "ברצלונה", airport: "אל פראט", country: "ספרד" }
  };

  var PROVIDERS = ["FlyDeal Direct", "SkyBooking", "TravelHub", "GoFly", "HotelsPro"];

  // עוזר ליצירת ISO מתאריך + שעה
  function iso(dateStr, h, m) {
    var d = FD.Utils.parseDate(dateStr);
    d.setHours(h, m || 0, 0, 0);
    return d.toISOString();
  }

  function minutesAgo(min) {
    return new Date(Date.now() - min * 60000).toISOString();
  }

  // תאריך ברירת מחדל להדגמה — 21 יום קדימה, וחזרה 7 ימים אחרי
  var baseDepart = FD.Utils.toInputDate(FD.Utils.addDays(new Date(), 21));
  var baseReturn = FD.Utils.toInputDate(FD.Utils.addDays(new Date(), 28));

  /* ---------- טיסות הדגמה ---------- */
  // מחירים לאדם: base + taxes + fees. finalPrice מחושב בשכבת השירות.
  var FLIGHTS = [
    {
      id: "FL-001", airlineCode: "LY", flightNumber: "LY332",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 6, departM: 20, durationMinutes: 130, stopsList: [],
      returnFlight: { flightNumber: "LY333", date: baseReturn, departH: 12, departM: 0, durationMinutes: 145, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "paid", cancelPolicy: "paid",
      pricing: { base: 620, taxes: 190, fees: 40 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: null, updatedAt: minutesAgo(8)
    },
    {
      id: "FL-002", airlineCode: "A3", flightNumber: "A3921",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 9, departM: 55, durationMinutes: 140, stopsList: [],
      returnFlight: { flightNumber: "A3920", date: baseReturn, departH: 5, departM: 10, durationMinutes: 150, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: false,
      checked: { included: false, count: 0, kg: 0 },
      changePolicy: "paid", cancelPolicy: "none",
      pricing: { base: 340, taxes: 150, fees: 25 },
      provider: "SkyBooking", verified: true, seatsLeft: null, updatedAt: minutesAgo(22)
    },
    {
      id: "FL-013", airlineCode: "IZ", flightNumber: "IZ151",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 14, departM: 25, durationMinutes: 135, stopsList: [],
      returnFlight: { flightNumber: "IZ152", date: baseReturn, departH: 18, departM: 40, durationMinutes: 140, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 20 },
      changePolicy: "paid", cancelPolicy: "paid",
      pricing: { base: 410, taxes: 165, fees: 30 },
      provider: "TravelHub", verified: true, seatsLeft: null, updatedAt: minutesAgo(15)
    },
    {
      id: "FL-014", airlineCode: "6H", flightNumber: "6H501",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 20, departM: 10, durationMinutes: 130, stopsList: [],
      returnFlight: { flightNumber: "6H502", date: baseReturn, departH: 23, departM: 15, durationMinutes: 135, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: false, count: 0, kg: 0 },
      changePolicy: "free", cancelPolicy: "paid",
      pricing: { base: 295, taxes: 145, fees: 25 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: 5, updatedAt: minutesAgo(6)
    },
    {
      id: "FL-015", airlineCode: "W6", flightNumber: "W64301",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 5, departM: 5, durationMinutes: 140, stopsList: [],
      returnFlight: { flightNumber: "W64302", date: baseReturn, departH: 9, departM: 20, durationMinutes: 145, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: false,
      checked: { included: false, count: 0, kg: 0 },
      changePolicy: "paid", cancelPolicy: "none",
      pricing: { base: 175, taxes: 110, fees: 30 },
      provider: "GoFly", verified: false, seatsLeft: null, updatedAt: minutesAgo(37)
    },
    {
      id: "FL-016", airlineCode: "FR", flightNumber: "FR8842",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 22, departM: 45, durationMinutes: 145, stopsList: [],
      returnFlight: { flightNumber: "FR8843", date: baseReturn, departH: 6, departM: 15, durationMinutes: 150, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: false,
      checked: { included: false, count: 0, kg: 0 },
      changePolicy: "paid", cancelPolicy: "none",
      pricing: { base: 155, taxes: 105, fees: 35 },
      provider: "SkyBooking", verified: true, seatsLeft: null, updatedAt: minutesAgo(44)
    },
    {
      id: "FL-017", airlineCode: "TK", flightNumber: "TK789",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 7, departM: 40, durationMinutes: 340,
      stopsList: [{ airport: "IST", city: "איסטנבול", layoverMinutes: 85 }],
      returnFlight: { flightNumber: "TK790", date: baseReturn, departH: 11, departM: 5, durationMinutes: 355, stopsList: [{ airport: "IST", city: "איסטנבול", layoverMinutes: 100 }] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "free", cancelPolicy: "free",
      pricing: { base: 480, taxes: 195, fees: 35 },
      provider: "TravelHub", verified: true, seatsLeft: null, updatedAt: minutesAgo(21)
    },
    {
      id: "FL-018", airlineCode: "LY", flightNumber: "LY338",
      origin: "TLV", destination: "ATH", date: baseDepart,
      departH: 17, departM: 50, durationMinutes: 125, stopsList: [],
      returnFlight: { flightNumber: "LY339", date: baseReturn, departH: 21, departM: 30, durationMinutes: 130, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "free", cancelPolicy: "paid",
      pricing: { base: 705, taxes: 200, fees: 40 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: null, updatedAt: minutesAgo(10)
    },
    {
      id: "FL-003", airlineCode: "6H", flightNumber: "6H621",
      origin: "TLV", destination: "FCO", date: baseDepart,
      departH: 7, departM: 30, durationMinutes: 200, stopsList: [],
      returnFlight: { flightNumber: "6H622", date: baseReturn, departH: 14, departM: 0, durationMinutes: 210, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 20 },
      changePolicy: "free", cancelPolicy: "paid",
      pricing: { base: 540, taxes: 210, fees: 30 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: 4, updatedAt: minutesAgo(5)
    },
    {
      id: "FL-004", airlineCode: "W6", flightNumber: "W64412",
      origin: "TLV", destination: "BUD", date: baseDepart,
      departH: 16, departM: 40, durationMinutes: 215, stopsList: [],
      returnFlight: { flightNumber: "W64413", date: baseReturn, departH: 20, departM: 30, durationMinutes: 220, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: false,
      checked: { included: false, count: 0, kg: 0 },
      changePolicy: "paid", cancelPolicy: "none",
      pricing: { base: 210, taxes: 120, fees: 35 },
      provider: "GoFly", verified: false, seatsLeft: null, updatedAt: minutesAgo(41)
    },
    {
      id: "FL-005", airlineCode: "LY", flightNumber: "LY5102",
      origin: "TLV", destination: "PRG", date: baseDepart,
      departH: 8, departM: 15, durationMinutes: 235, stopsList: [],
      returnFlight: { flightNumber: "LY5103", date: baseReturn, departH: 12, departM: 45, durationMinutes: 240, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "free", cancelPolicy: "free",
      pricing: { base: 690, taxes: 200, fees: 40 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: null, updatedAt: minutesAgo(12)
    },
    {
      id: "FL-006", airlineCode: "IZ", flightNumber: "IZ161",
      origin: "TLV", destination: "LCA", date: baseDepart,
      departH: 11, departM: 0, durationMinutes: 55, stopsList: [],
      returnFlight: { flightNumber: "IZ162", date: baseReturn, departH: 18, departM: 0, durationMinutes: 55, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: false, count: 0, kg: 0 },
      changePolicy: "paid", cancelPolicy: "paid",
      pricing: { base: 180, taxes: 90, fees: 20 },
      provider: "TravelHub", verified: true, seatsLeft: null, updatedAt: minutesAgo(17)
    },
    {
      id: "FL-007", airlineCode: "IQ", flightNumber: "IQ204",
      origin: "TLV", destination: "PFO", date: baseDepart,
      departH: 13, departM: 20, durationMinutes: 60, stopsList: [],
      returnFlight: { flightNumber: "IQ205", date: baseReturn, departH: 16, departM: 30, durationMinutes: 60, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 20 },
      changePolicy: "free", cancelPolicy: "paid",
      pricing: { base: 240, taxes: 95, fees: 20 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: 6, updatedAt: minutesAgo(3)
    },
    {
      id: "FL-008", airlineCode: "6H", flightNumber: "6H781",
      origin: "TLV", destination: "BUS", date: baseDepart,
      departH: 3, departM: 45, durationMinutes: 175, stopsList: [],
      returnFlight: { flightNumber: "6H782", date: baseReturn, departH: 8, departM: 0, durationMinutes: 180, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 20 },
      changePolicy: "paid", cancelPolicy: "paid",
      pricing: { base: 430, taxes: 140, fees: 30 },
      provider: "SkyBooking", verified: true, seatsLeft: null, updatedAt: minutesAgo(28)
    },
    {
      id: "FL-009", airlineCode: "IZ", flightNumber: "IZ411",
      origin: "TLV", destination: "TBS", date: baseDepart,
      departH: 4, departM: 10, durationMinutes: 185, stopsList: [],
      returnFlight: { flightNumber: "IZ412", date: baseReturn, departH: 9, departM: 30, durationMinutes: 190, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "paid", cancelPolicy: "paid",
      pricing: { base: 470, taxes: 150, fees: 30 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: null, updatedAt: minutesAgo(19)
    },
    {
      id: "FL-010", airlineCode: "FZ", flightNumber: "FZ1804",
      origin: "TLV", destination: "DXB", date: baseDepart,
      departH: 10, departM: 30, durationMinutes: 195, stopsList: [],
      returnFlight: { flightNumber: "FZ1805", date: baseReturn, departH: 15, departM: 0, durationMinutes: 210, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 30 },
      changePolicy: "free", cancelPolicy: "paid",
      pricing: { base: 560, taxes: 180, fees: 35 },
      provider: "TravelHub", verified: true, seatsLeft: null, updatedAt: minutesAgo(9)
    },
    {
      id: "FL-011", airlineCode: "TK", flightNumber: "TK787",
      origin: "TLV", destination: "BCN", date: baseDepart,
      departH: 5, departM: 30, durationMinutes: 420,
      stopsList: [{ airport: "IST", city: "איסטנבול", layoverMinutes: 95 }],
      returnFlight: { flightNumber: "TK788", date: baseReturn, departH: 13, departM: 0, durationMinutes: 445, stopsList: [{ airport: "IST", city: "איסטנבול", layoverMinutes: 110 }] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "paid", cancelPolicy: "paid",
      pricing: { base: 640, taxes: 220, fees: 40 },
      provider: "GoFly", verified: true, seatsLeft: null, updatedAt: minutesAgo(33)
    },
    {
      id: "FL-012", airlineCode: "LY", flightNumber: "LY394",
      origin: "TLV", destination: "BCN", date: baseDepart,
      departH: 9, departM: 10, durationMinutes: 310, stopsList: [],
      returnFlight: { flightNumber: "LY395", date: baseReturn, departH: 14, departM: 20, durationMinutes: 320, stopsList: [] },
      cabin: "economy", handbag: true, carryOn: true,
      checked: { included: true, count: 1, kg: 23 },
      changePolicy: "free", cancelPolicy: "paid",
      pricing: { base: 890, taxes: 240, fees: 45 },
      provider: "FlyDeal Direct", verified: true, seatsLeft: 3, updatedAt: minutesAgo(6)
    }
  ];

  /* ---------- מלונות הדגמה ---------- */
  // gradient — אינדקס לצבע רקע גלריה (במקום תמונות חיצוניות שעלולות להישבר).
  var HOTELS = [
    {
      id: "HT-001", name: "Athens Central Boutique", city: "ATH", brand: "Independent",
      gradient: 0, gallery: [0, 3, 5], stars: 4,
      rating: { score: 9.1, count: 2438, source: "אורחי האתר", label: "מצוין" },
      area: "פלקה", distanceCenterKm: 0.4,
      attractions: [{ name: "אקרופוליס", distanceKm: 0.9 }, { name: "כיכר סינטגמה", distanceKm: 0.6 }],
      room: { type: "חדר דלוקס זוגי", sizeM2: 26, bedType: "מיטה זוגית" },
      breakfast: true, freeCancellation: true, payAtProperty: true,
      amenities: ["wifi", "gym", "spa", "accessible"],
      pricing: { perNight: 420, taxes: 60, fees: 25 },
      provider: "HotelsPro", verified: true, roomsLeft: null, updatedAt: minutesAgo(11)
    },
    {
      id: "HT-010", name: "Acropolis View Luxury", city: "ATH", brand: "GrandLine",
      gradient: 3, gallery: [3, 0, 4], stars: 5,
      rating: { score: 9.5, count: 1874, source: "אורחי האתר", label: "יוצא מן הכלל" },
      area: "מקריגיאני", distanceCenterKm: 1.1,
      attractions: [{ name: "אקרופוליס", distanceKm: 0.3 }, { name: "מוזיאון האקרופוליס", distanceKm: 0.4 }],
      room: { type: "סוויטה עם מרפסת נוף", sizeM2: 42, bedType: "מיטה זוגית קינג" },
      breakfast: true, freeCancellation: true, payAtProperty: false,
      amenities: ["wifi", "pool", "gym", "spa", "accessible"],
      pricing: { perNight: 780, taxes: 120, fees: 45 },
      provider: "TravelHub", verified: true, roomsLeft: null, updatedAt: minutesAgo(9)
    },
    {
      id: "HT-011", name: "Athens Budget Rooms", city: "ATH", brand: "Independent",
      gradient: 6, gallery: [6, 2], stars: 3,
      rating: { score: 7.9, count: 642, source: "אורחי האתר", label: "טוב" },
      area: "אומוניה", distanceCenterKm: 1.6,
      attractions: [{ name: "כיכר אומוניה", distanceKm: 0.2 }, { name: "שוק ורוואקיו", distanceKm: 0.9 }],
      room: { type: "חדר זוגי סטנדרט", sizeM2: 18, bedType: "מיטה זוגית" },
      breakfast: false, freeCancellation: true, payAtProperty: true,
      amenities: ["wifi", "accessible"],
      pricing: { perNight: 195, taxes: 30, fees: 15 },
      provider: "GoFly", verified: true, roomsLeft: null, updatedAt: minutesAgo(34)
    },
    {
      id: "HT-012", name: "Syntagma Design Hotel", city: "ATH", brand: "CityStay",
      gradient: 5, gallery: [5, 1, 3], stars: 4,
      rating: { score: 8.8, count: 2103, source: "אורחי האתר", label: "מצוין" },
      area: "סינטגמה", distanceCenterKm: 0.2,
      attractions: [{ name: "כיכר סינטגמה", distanceKm: 0.1 }, { name: "הגנים הלאומיים", distanceKm: 0.5 }],
      room: { type: "חדר עיצובי זוגי", sizeM2: 27, bedType: "מיטה זוגית" },
      breakfast: true, freeCancellation: false, payAtProperty: false,
      amenities: ["wifi", "gym", "parking"],
      pricing: { perNight: 455, taxes: 65, fees: 25 },
      provider: "HotelsPro", verified: true, roomsLeft: 2, updatedAt: minutesAgo(13)
    },
    {
      id: "HT-002", name: "Roma Trastevere Suites", city: "FCO", brand: "Independent",
      gradient: 1, gallery: [1, 4, 2], stars: 4,
      rating: { score: 8.7, count: 1902, source: "אורחי האתר", label: "מצוין" },
      area: "טרסטוורה", distanceCenterKm: 1.2,
      attractions: [{ name: "קולוסאום", distanceKm: 2.3 }, { name: "מזרקת טרווי", distanceKm: 1.8 }],
      room: { type: "סוויטה משפחתית", sizeM2: 34, bedType: "מיטה זוגית + ספה" },
      breakfast: true, freeCancellation: true, payAtProperty: false,
      amenities: ["wifi", "parking", "accessible"],
      pricing: { perNight: 520, taxes: 80, fees: 30 },
      provider: "TravelHub", verified: true, roomsLeft: 2, updatedAt: minutesAgo(4)
    },
    {
      id: "HT-003", name: "Budapest Danube View", city: "BUD", brand: "CityStay",
      gradient: 2, gallery: [2, 0, 6], stars: 4,
      rating: { score: 9.3, count: 3105, source: "אורחי האתר", label: "יוצא מן הכלל" },
      area: "מרכז פשט", distanceCenterKm: 0.3,
      attractions: [{ name: "הפרלמנט", distanceKm: 0.7 }, { name: "גשר השרשראות", distanceKm: 0.5 }],
      room: { type: "חדר פרימיום נהר", sizeM2: 28, bedType: "מיטה זוגית" },
      breakfast: true, freeCancellation: true, payAtProperty: true,
      amenities: ["wifi", "pool", "gym", "spa"],
      pricing: { perNight: 360, taxes: 55, fees: 20 },
      provider: "HotelsPro", verified: true, roomsLeft: null, updatedAt: minutesAgo(14)
    },
    {
      id: "HT-004", name: "Prague Old Town Residence", city: "PRG", brand: "Independent",
      gradient: 3, gallery: [3, 1, 5], stars: 5,
      rating: { score: 9.0, count: 1560, source: "אורחי האתר", label: "מצוין" },
      area: "העיר העתיקה", distanceCenterKm: 0.2,
      attractions: [{ name: "שעון האסטרונומי", distanceKm: 0.3 }, { name: "גשר קארל", distanceKm: 0.6 }],
      room: { type: "חדר קלאסי יוקרתי", sizeM2: 30, bedType: "מיטה זוגית" },
      breakfast: false, freeCancellation: true, payAtProperty: false,
      amenities: ["wifi", "gym", "spa", "accessible"],
      pricing: { perNight: 610, taxes: 90, fees: 35 },
      provider: "TravelHub", verified: true, roomsLeft: null, updatedAt: minutesAgo(26)
    },
    {
      id: "HT-005", name: "Larnaca Beach Resort", city: "LCA", brand: "SunResorts",
      gradient: 4, gallery: [4, 6, 0], stars: 4,
      rating: { score: 8.4, count: 987, source: "אורחי האתר", label: "טוב מאוד" },
      area: "טיילת פיניקודס", distanceCenterKm: 0.8,
      attractions: [{ name: "חוף פיניקודס", distanceKm: 0.2 }, { name: "מצודת לרנקה", distanceKm: 1.1 }],
      room: { type: "חדר נוף לים", sizeM2: 24, bedType: "שתי מיטות נפרדות" },
      breakfast: true, freeCancellation: false, payAtProperty: true,
      amenities: ["wifi", "pool", "parking"],
      pricing: { perNight: 300, taxes: 45, fees: 20 },
      provider: "GoFly", verified: true, roomsLeft: null, updatedAt: minutesAgo(31)
    },
    {
      id: "HT-006", name: "Paphos Coral Bay Hotel", city: "PFO", brand: "SunResorts",
      gradient: 5, gallery: [5, 2, 4], stars: 4,
      rating: { score: 8.9, count: 1421, source: "אורחי האתר", label: "מצוין" },
      area: "קורל ביי", distanceCenterKm: 3.5,
      attractions: [{ name: "חוף קורל ביי", distanceKm: 0.4 }, { name: "פארק ארכיאולוגי", distanceKm: 4.2 }],
      room: { type: "סוויטת גן", sizeM2: 32, bedType: "מיטה זוגית" },
      breakfast: true, freeCancellation: true, payAtProperty: true,
      amenities: ["wifi", "pool", "gym", "spa", "parking"],
      pricing: { perNight: 340, taxes: 50, fees: 20 },
      provider: "HotelsPro", verified: true, roomsLeft: 3, updatedAt: minutesAgo(7)
    },
    {
      id: "HT-007", name: "Batumi Seaside Tower", city: "BUS", brand: "CityStay",
      gradient: 6, gallery: [6, 3, 1], stars: 4,
      rating: { score: 8.2, count: 764, source: "אורחי האתר", label: "טוב מאוד" },
      area: "שדרת הים", distanceCenterKm: 1.0,
      attractions: [{ name: "טיילת בטומי", distanceKm: 0.3 }, { name: "כיכר פיאצה", distanceKm: 1.4 }],
      room: { type: "חדר סטנדרט נוף עיר", sizeM2: 22, bedType: "מיטה זוגית" },
      breakfast: false, freeCancellation: true, payAtProperty: true,
      amenities: ["wifi", "pool", "parking"],
      pricing: { perNight: 210, taxes: 30, fees: 15 },
      provider: "TravelHub", verified: true, roomsLeft: null, updatedAt: minutesAgo(38)
    },
    {
      id: "HT-008", name: "Dubai Marina Grand", city: "DXB", brand: "GrandLine",
      gradient: 0, gallery: [0, 4, 6], stars: 5,
      rating: { score: 9.4, count: 5210, source: "אורחי האתר", label: "יוצא מן הכלל" },
      area: "דובאי מרינה", distanceCenterKm: 2.0,
      attractions: [{ name: "מרינה ווק", distanceKm: 0.3 }, { name: "חוף JBR", distanceKm: 1.0 }],
      room: { type: "חדר דלוקס נוף מרינה", sizeM2: 40, bedType: "מיטה זוגית קינג" },
      breakfast: true, freeCancellation: true, payAtProperty: false,
      amenities: ["wifi", "pool", "gym", "spa", "parking", "accessible"],
      pricing: { perNight: 720, taxes: 110, fees: 45 },
      provider: "HotelsPro", verified: true, roomsLeft: null, updatedAt: minutesAgo(2)
    },
    {
      id: "HT-009", name: "Barcelona Eixample Design", city: "BCN", brand: "Independent",
      gradient: 1, gallery: [1, 5, 3], stars: 4,
      rating: { score: 8.8, count: 2790, source: "אורחי האתר", label: "מצוין" },
      area: "אישמפלה", distanceCenterKm: 0.9,
      attractions: [{ name: "קאסה בטליו", distanceKm: 0.5 }, { name: "סגרדה פמיליה", distanceKm: 1.3 }],
      room: { type: "חדר עיצוב זוגי", sizeM2: 25, bedType: "מיטה זוגית" },
      breakfast: true, freeCancellation: true, payAtProperty: true,
      amenities: ["wifi", "gym", "accessible"],
      pricing: { perNight: 480, taxes: 70, fees: 30 },
      provider: "GoFly", verified: true, roomsLeft: null, updatedAt: minutesAgo(16)
    }
  ];

  /* ---------- חבילות הדגמה ---------- */
  // כל חבילה מקשרת בין טיסה למלון. החיסכון מחושב בשירות מתוך מחירים מאותו חיפוש.
  var PACKAGES = [
    { id: "PK-001", flightId: "FL-001", hotelId: "HT-001", nights: 4, packageDiscountPct: 12 },
    { id: "PK-002", flightId: "FL-003", hotelId: "HT-002", nights: 5, packageDiscountPct: 10 },
    { id: "PK-003", flightId: "FL-004", hotelId: "HT-003", nights: 3, packageDiscountPct: 14 },
    { id: "PK-004", flightId: "FL-006", hotelId: "HT-005", nights: 5, packageDiscountPct: 9 },
    { id: "PK-005", flightId: "FL-010", hotelId: "HT-008", nights: 4, packageDiscountPct: 11 }
  ];

  FD.MockData = {
    AIRLINES: AIRLINES,
    AIRPORTS: AIRPORTS,
    PROVIDERS: PROVIDERS,
    FLIGHTS: FLIGHTS,
    HOTELS: HOTELS,
    PACKAGES: PACKAGES,
    defaults: { depart: baseDepart, ret: baseReturn },
    iso: iso
  };
})(window.FD = window.FD || {});
