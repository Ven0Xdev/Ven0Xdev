/*
 * search-form.js — טפסי חיפוש לטיסות, מלונות וחבילות + Validation מלא בעברית
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons, MD = FD.MockData;

  // רשימת יעדים לבחירה (ללא TLV כיעד)
  function destinationOptions() {
    return Object.keys(MD.AIRPORTS)
      .filter(function (c) { return c !== "TLV"; })
      .map(function (c) {
        var a = MD.AIRPORTS[c];
        return { value: c, label: a.city + " (" + c + ") · " + a.country };
      });
  }

  function selectField(id, labelText, options, value, extraAttrs) {
    var select = Utils.el("select", Object.assign({ id: id, class: "fd-input" }, extraAttrs || {}));
    options.forEach(function (opt) {
      var o = Utils.el("option", { value: opt.value }, opt.label);
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    });
    return Utils.el("div", { class: "fd-field" }, [
      Utils.el("label", { class: "fd-label", "for": id }, labelText),
      select
    ]);
  }

  function inputField(id, labelText, type, value, attrs) {
    var input = Utils.el("input", Object.assign({ id: id, class: "fd-input", type: type, value: value || "" }, attrs || {}));
    return Utils.el("div", { class: "fd-field" }, [
      Utils.el("label", { class: "fd-label", "for": id }, labelText),
      input
    ]);
  }

  // מונה נוסעים (stepper) נגיש
  function stepper(id, labelText, initial, min, max) {
    var valueSpan = Utils.el("span", { class: "fd-stepper-val", id: id + "-val", "aria-live": "polite" }, String(initial));
    var hidden = Utils.el("input", { type: "hidden", id: id, value: String(initial) });
    function setVal(v) {
      v = Math.max(min, Math.min(max, v));
      valueSpan.textContent = String(v);
      hidden.value = String(v);
    }
    var dec = Utils.el("button", {
      type: "button", class: "fd-stepper-btn", "aria-label": "הפחתת " + labelText,
      on: { click: function () { setVal(parseInt(hidden.value, 10) - 1); } }
    }, "−");
    var inc = Utils.el("button", {
      type: "button", class: "fd-stepper-btn", "aria-label": "הוספת " + labelText,
      on: { click: function () { setVal(parseInt(hidden.value, 10) + 1); } }
    }, "+");
    return Utils.el("div", { class: "fd-stepper" }, [
      Utils.el("span", { class: "fd-stepper-label" }, labelText),
      Utils.el("div", { class: "fd-stepper-ctrl" }, [dec, valueSpan, inc, hidden])
    ]);
  }

  function checkbox(id, labelText) {
    var input = Utils.el("input", { type: "checkbox", id: id, class: "fd-check-input" });
    return Utils.el("label", { class: "fd-check", "for": id }, [
      input, Utils.el("span", null, labelText)
    ]);
  }

  function errorBox() {
    return Utils.el("div", { class: "fd-form-errors", role: "alert", "aria-live": "assertive", hidden: true });
  }

  function showErrors(box, messages) {
    Utils.clear(box);
    if (!messages.length) { box.hidden = true; return; }
    box.hidden = false;
    var ul = Utils.el("ul", { class: "fd-error-list" });
    messages.forEach(function (m) { ul.appendChild(Utils.el("li", null, m)); });
    box.appendChild(ul);
  }

  /* ================= טופס טיסות ================= */
  function buildFlightForm(onSubmit) {
    var settings = FD.Store.get().settings;
    var wrap = Utils.el("form", { class: "fd-search-form", novalidate: "novalidate", "aria-label": "חיפוש טיסות" });
    var errors = errorBox();

    var tripType = Utils.el("div", { class: "fd-trip-type", role: "radiogroup", "aria-label": "סוג טיסה" });
    [["round", "הלוך ושוב"], ["oneway", "כיוון אחד"], ["multi", "Multi City"]].forEach(function (t, i) {
      var input = Utils.el("input", { type: "radio", name: "tripType", id: "trip-" + t[0], value: t[0], class: "fd-trip-input" });
      if (i === 0) input.checked = true;
      if (t[0] === "multi") input.disabled = true; // הכנה עתידית
      var label = Utils.el("label", { class: "fd-trip-label", "for": "trip-" + t[0] }, [
        t[1], t[0] === "multi" ? Utils.el("span", { class: "fd-soon" }, "בקרוב") : null
      ]);
      tripType.appendChild(input); tripType.appendChild(label);
    });

    var origin = selectField("fl-origin", "מוצא", [{ value: "TLV", label: "תל אביב (TLV) · ישראל" }], "TLV", { disabled: true });
    // יעד ברירת מחדל — כדי שלחיצה על "חיפוש" תניב תוצאות מיד ולא הודעת שגיאה.
    // ה-Validation על יעד ריק נשאר פעיל (המשתמש יכול לבחור "בחרו יעד…").
    var dest = selectField("fl-dest", "יעד", [{ value: "", label: "בחרו יעד…" }].concat(destinationOptions()), FD.DEFAULT_DEST);

    var swapBtn = Utils.el("button", { type: "button", class: "fd-swap-btn", "aria-label": "החלפת מוצא ויעד", html: Icons.svg("swap", 18) });

    var departDate = inputField("fl-depart", "תאריך יציאה", "date", MD.defaults.depart, { min: Utils.toInputDate(new Date()) });
    var returnDate = inputField("fl-return", "תאריך חזרה", "date", MD.defaults.ret, { min: Utils.toInputDate(new Date()) });

    var adults = stepper("fl-adults", "מבוגרים", 1, 1, 9);
    var children = stepper("fl-children", "ילדים", 0, 0, 8);
    var infants = stepper("fl-infants", "תינוקות", 0, 0, 4);

    var cabin = selectField("fl-cabin", "מחלקה", [
      { value: "economy", label: "תיירים" }, { value: "premium", label: "תיירים פלוס" },
      { value: "business", label: "עסקים" }, { value: "first", label: "ראשונה" }
    ], "economy");

    var flexibility = selectField("fl-flex", "גמישות תאריכים", [
      { value: "0", label: "תאריך מדויק" }, { value: "1", label: "± יום" },
      { value: "3", label: "± 3 ימים" }, { value: "7", label: "± שבוע" }
    ], "0");

    var departWindow = selectField("fl-window", "שעת יציאה מועדפת", [
      { value: "any", label: "כל שעה" }, { value: "morning", label: "בוקר (06-12)" },
      { value: "afternoon", label: "צהריים (12-18)" }, { value: "evening", label: "ערב/לילה (18-06)" }
    ], "any");

    var currency = selectField("fl-currency", "מטבע", FD.CurrencyService.list().map(function (c) {
      return { value: c.code, label: c.label };
    }), settings.currency);

    var toggles = Utils.el("div", { class: "fd-toggle-row" }, [
      checkbox("fl-direct", "טיסה ישירה בלבד"),
      checkbox("fl-baggage", "מזוודה כלולה"),
      checkbox("fl-israeli", "חברות ישראליות בלבד")
    ]);

    var submit = Utils.el("button", { type: "submit", class: "fd-btn fd-btn--primary fd-btn--lg fd-search-submit" }, [
      Icons.node("search", 20), Utils.el("span", null, "חיפוש טיסות")
    ]);

    var grid = Utils.el("div", { class: "fd-form-grid" }, [
      Utils.el("div", { class: "fd-od-row" }, [origin, swapBtn, dest]),
      departDate, returnDate,
      Utils.el("div", { class: "fd-pax-row" }, [adults, children, infants]),
      cabin, flexibility, departWindow, currency
    ]);

    wrap.appendChild(tripType);
    wrap.appendChild(grid);
    wrap.appendChild(toggles);
    wrap.appendChild(errors);
    wrap.appendChild(submit);

    // החלפת חזור לפי סוג טיסה
    tripType.addEventListener("change", function (e) {
      var isOneway = Utils.qs("#trip-oneway").checked;
      returnDate.style.display = isOneway ? "none" : "";
    });

    // swap מושבת בפועל (מוצא קבוע TLV) — מציג טוסט הסבר
    swapBtn.addEventListener("click", function () {
      FD.Toast.show("במצב הדגמה המוצא קבוע לנתב״ג (TLV)", "info");
    });

    wrap.addEventListener("submit", function (e) {
      e.preventDefault();
      var msgs = [];
      var destVal = Utils.qs("#fl-dest").value;
      var departVal = Utils.qs("#fl-depart").value;
      var returnVal = Utils.qs("#fl-return").value;
      var isOneway = Utils.qs("#trip-oneway").checked;
      var a = parseInt(Utils.qs("#fl-adults").value, 10);
      var c = parseInt(Utils.qs("#fl-children").value, 10);
      var inf = parseInt(Utils.qs("#fl-infants").value, 10);
      var today = Utils.parseDate(Utils.toInputDate(new Date()));

      if (!destVal) msgs.push("יש לבחור יעד.");
      if (!departVal) msgs.push("יש לבחור תאריך יציאה.");
      else if (Utils.parseDate(departVal).getTime() < today.getTime()) msgs.push("תאריך היציאה אינו יכול להיות בעבר.");
      if (!isOneway) {
        if (!returnVal) msgs.push("יש לבחור תאריך חזרה או לבחור טיסה בכיוון אחד.");
        else if (departVal && Utils.parseDate(returnVal).getTime() < Utils.parseDate(departVal).getTime())
          msgs.push("תאריך החזרה אינו יכול להיות לפני תאריך היציאה.");
      }
      if (a + c < 1) msgs.push("יש לבחור לפחות נוסע אחד (מבוגר או ילד).");
      if (inf > a) msgs.push("מספר התינוקות אינו יכול לעלות על מספר המבוגרים.");

      showErrors(errors, msgs);
      if (msgs.length) { errors.scrollIntoView({ behavior: "smooth", block: "center" }); return; }

      var params = {
        type: "flight",
        origin: "TLV",
        destination: destVal,
        depart: departVal,
        ret: isOneway ? null : returnVal,
        oneway: isOneway,
        adults: a, children: c, infants: inf,
        passengers: a + c, // תינוקות לרוב על הברכיים
        cabin: Utils.qs("#fl-cabin").value,
        flexibility: parseInt(Utils.qs("#fl-flex").value, 10),
        departWindow: Utils.qs("#fl-window").value,
        currency: Utils.qs("#fl-currency").value,
        directOnly: Utils.qs("#fl-direct").checked,
        baggageIncluded: Utils.qs("#fl-baggage").checked,
        airlinePolicy: Utils.qs("#fl-israeli").checked ? "israeli" : FD.Store.get().settings.airlinePolicy
      };
      onSubmit(params);
    });

    return wrap;
  }

  /* ================= טופס מלונות ================= */
  function buildHotelForm(onSubmit) {
    var wrap = Utils.el("form", { class: "fd-search-form", novalidate: "novalidate", "aria-label": "חיפוש מלונות" });
    var errors = errorBox();

    var dest = selectField("ht-dest", "יעד", [{ value: "", label: "בחרו יעד…" }].concat(destinationOptions()), FD.DEFAULT_DEST);
    var checkIn = inputField("ht-checkin", "תאריך כניסה", "date", MD.defaults.depart, { min: Utils.toInputDate(new Date()) });
    var checkOut = inputField("ht-checkout", "תאריך יציאה", "date", MD.defaults.ret, { min: Utils.toInputDate(new Date()) });

    var rooms = stepper("ht-rooms", "חדרים", 1, 1, 6);
    var adults = stepper("ht-adults", "מבוגרים", 2, 1, 12);
    var children = stepper("ht-children", "ילדים", 0, 0, 8);

    var stars = selectField("ht-stars", "דירוג כוכבים (מינימום)", [
      { value: "0", label: "הכול" }, { value: "3", label: "3+ כוכבים" },
      { value: "4", label: "4+ כוכבים" }, { value: "5", label: "5 כוכבים" }
    ], "0");

    var priceMax = inputField("ht-price", "מחיר מקסימלי ללילה (₪)", "number", "", { min: "0", step: "50", placeholder: "ללא הגבלה" });
    var area = inputField("ht-area", "אזור בעיר (אופציונלי)", "text", "", { placeholder: "לדוגמה: מרכז העיר" });

    var toggles = Utils.el("div", { class: "fd-toggle-row" }, [
      checkbox("ht-breakfast", "ארוחת בוקר כלולה"),
      checkbox("ht-freecancel", "ביטול חינם"),
      checkbox("ht-payat", "תשלום במקום")
    ]);

    var submit = Utils.el("button", { type: "submit", class: "fd-btn fd-btn--primary fd-btn--lg fd-search-submit" }, [
      Icons.node("search", 20), Utils.el("span", null, "חיפוש מלונות")
    ]);

    var grid = Utils.el("div", { class: "fd-form-grid" }, [
      dest, checkIn, checkOut,
      Utils.el("div", { class: "fd-pax-row" }, [rooms, adults, children]),
      stars, priceMax, area
    ]);

    wrap.appendChild(grid);
    wrap.appendChild(toggles);
    wrap.appendChild(errors);
    wrap.appendChild(submit);

    wrap.addEventListener("submit", function (e) {
      e.preventDefault();
      var msgs = [];
      var destVal = Utils.qs("#ht-dest").value;
      var inVal = Utils.qs("#ht-checkin").value;
      var outVal = Utils.qs("#ht-checkout").value;
      var today = Utils.parseDate(Utils.toInputDate(new Date()));

      if (!destVal) msgs.push("יש לבחור יעד.");
      if (!inVal) msgs.push("יש לבחור תאריך כניסה.");
      else if (Utils.parseDate(inVal).getTime() < today.getTime()) msgs.push("תאריך הכניסה אינו יכול להיות בעבר.");
      if (!outVal) msgs.push("יש לבחור תאריך יציאה.");
      else if (inVal && Utils.parseDate(outVal).getTime() <= Utils.parseDate(inVal).getTime())
        msgs.push("תאריך היציאה חייב להיות אחרי תאריך הכניסה.");

      showErrors(errors, msgs);
      if (msgs.length) { errors.scrollIntoView({ behavior: "smooth", block: "center" }); return; }

      var nights = Math.round((Utils.parseDate(outVal) - Utils.parseDate(inVal)) / 86400000);
      var params = {
        type: "hotel",
        destination: destVal,
        checkIn: inVal, checkOut: outVal, nights: nights,
        rooms: parseInt(Utils.qs("#ht-rooms").value, 10),
        adults: parseInt(Utils.qs("#ht-adults").value, 10),
        children: parseInt(Utils.qs("#ht-children").value, 10),
        stars: parseInt(Utils.qs("#ht-stars").value, 10),
        priceMax: Utils.qs("#ht-price").value ? parseInt(Utils.qs("#ht-price").value, 10) : null,
        area: Utils.sanitize(Utils.qs("#ht-area").value),
        breakfast: Utils.qs("#ht-breakfast").checked,
        freeCancellation: Utils.qs("#ht-freecancel").checked,
        payAtProperty: Utils.qs("#ht-payat").checked,
        currency: FD.Store.get().settings.currency
      };
      onSubmit(params);
    });

    return wrap;
  }

  /* ================= טופס חבילות ================= */
  function buildPackageForm(onSubmit) {
    var wrap = Utils.el("form", { class: "fd-search-form", novalidate: "novalidate", "aria-label": "חיפוש חבילות" });
    var errors = errorBox();

    var dest = selectField("pk-dest", "יעד", [{ value: "", label: "כל היעדים" }].concat(destinationOptions()), "");
    var checkIn = inputField("pk-checkin", "תאריך יציאה", "date", MD.defaults.depart, { min: Utils.toInputDate(new Date()) });
    var nights = stepper("pk-nights", "לילות", 4, 1, 21);
    var travelers = stepper("pk-travelers", "נוסעים", 2, 1, 9);
    var level = selectField("pk-level", "רמת מלון", [
      { value: "0", label: "הכול" }, { value: "4", label: "4+ כוכבים" }, { value: "5", label: "5 כוכבים" }
    ], "0");

    var toggles = Utils.el("div", { class: "fd-toggle-row" }, [
      checkbox("pk-baggage", "מזוודה כלולה"),
      checkbox("pk-breakfast", "ארוחת בוקר כלולה")
    ]);

    var submit = Utils.el("button", { type: "submit", class: "fd-btn fd-btn--primary fd-btn--lg fd-search-submit" }, [
      Icons.node("search", 20), Utils.el("span", null, "חיפוש חבילות")
    ]);

    var grid = Utils.el("div", { class: "fd-form-grid" }, [
      dest, checkIn,
      Utils.el("div", { class: "fd-pax-row" }, [nights, travelers]),
      level
    ]);

    wrap.appendChild(grid);
    wrap.appendChild(toggles);
    wrap.appendChild(errors);
    wrap.appendChild(submit);

    wrap.addEventListener("submit", function (e) {
      e.preventDefault();
      var msgs = [];
      var inVal = Utils.qs("#pk-checkin").value;
      var today = Utils.parseDate(Utils.toInputDate(new Date()));
      if (!inVal) msgs.push("יש לבחור תאריך יציאה.");
      else if (Utils.parseDate(inVal).getTime() < today.getTime()) msgs.push("תאריך היציאה אינו יכול להיות בעבר.");
      showErrors(errors, msgs);
      if (msgs.length) return;

      onSubmit({
        type: "package",
        destination: Utils.qs("#pk-dest").value || null,
        checkIn: inVal,
        nights: parseInt(Utils.qs("#pk-nights").value, 10),
        travelers: parseInt(Utils.qs("#pk-travelers").value, 10),
        level: parseInt(Utils.qs("#pk-level").value, 10),
        baggage: Utils.qs("#pk-baggage").checked,
        breakfast: Utils.qs("#pk-breakfast").checked,
        currency: FD.Store.get().settings.currency
      });
    });

    return wrap;
  }

  FD.SearchForm = {
    build: function (tab, onSubmit) {
      if (tab === "hotels") return buildHotelForm(onSubmit);
      if (tab === "packages") return buildPackageForm(onSubmit);
      return buildFlightForm(onSubmit);
    }
  };
})(window.FD = window.FD || {});
