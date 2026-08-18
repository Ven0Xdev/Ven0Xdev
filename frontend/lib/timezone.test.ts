import { describe, expect, it } from "vitest";
import {
  EXCHANGE_TIME_ZONE,
  formatInTimeZone,
  formatInTimeZoneWithAbbr,
  getTimeZoneAbbreviation,
  isPresetTimezone,
  isValidIanaTimeZone,
  resolveEffectiveTimeZone,
} from "./timezone";

// A fixed UTC instant used across every zone test — 2026-06-15T14:30:00Z —
// so each assertion is checking the same real moment, just converted
// differently, never a different moment that happens to look similar.
const FIXED_UTC = "2026-06-15T14:30:00.000Z";

describe("resolveEffectiveTimeZone", () => {
  it("resolves the exchange preset to America/New_York regardless of anything else", () => {
    expect(resolveEffectiveTimeZone("exchange")).toBe(EXCHANGE_TIME_ZONE);
  });

  it("resolves the utc preset to UTC", () => {
    expect(resolveEffectiveTimeZone("utc")).toBe("UTC");
  });

  it("passes a valid IANA zone straight through", () => {
    expect(resolveEffectiveTimeZone("Asia/Jerusalem")).toBe("Asia/Jerusalem");
  });

  it("falls back to the device zone for garbage input rather than mis-localizing silently", () => {
    // In this Node test environment the device zone is whatever TZ the
    // runner has; the important guarantee is just that it never echoes
    // the invalid string back as if it were a real zone.
    expect(resolveEffectiveTimeZone("Not/A_Real_Zone")).not.toBe("Not/A_Real_Zone");
  });
});

describe("isValidIanaTimeZone / isPresetTimezone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidIanaTimeZone("Asia/Jerusalem")).toBe(true);
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
  });

  it("rejects unknown zone names", () => {
    expect(isValidIanaTimeZone("Mars/Olympus_Mons")).toBe(false);
  });

  it("only recognizes the three synthetic presets, not IANA names, as presets", () => {
    expect(isPresetTimezone("device")).toBe(true);
    expect(isPresetTimezone("exchange")).toBe(true);
    expect(isPresetTimezone("utc")).toBe(true);
    expect(isPresetTimezone("Asia/Jerusalem")).toBe(false);
  });
});

describe("formatInTimeZone — same instant, different zones", () => {
  it("renders the fixed instant correctly in Asia/Jerusalem (UTC+3 in June)", () => {
    const out = formatInTimeZone(FIXED_UTC, "Asia/Jerusalem", { style: "time" });
    expect(out).toBe("17:30"); // 14:30 UTC + 3h
  });

  it("renders the fixed instant correctly in America/New_York (UTC-4 in June, EDT)", () => {
    const out = formatInTimeZone(FIXED_UTC, "America/New_York", { style: "time" });
    expect(out).toBe("10:30"); // 14:30 UTC - 4h
  });

  it("renders the fixed instant correctly in UTC", () => {
    const out = formatInTimeZone(FIXED_UTC, "UTC", { style: "time" });
    expect(out).toBe("14:30");
  });

  it("a single instant converted to Jerusalem, New York, and UTC never silently agrees across all three (proves real conversion, not a passthrough)", () => {
    const jerusalem = formatInTimeZone(FIXED_UTC, "Asia/Jerusalem", { style: "time" });
    const newYork = formatInTimeZone(FIXED_UTC, "America/New_York", { style: "time" });
    const utc = formatInTimeZone(FIXED_UTC, "UTC", { style: "time" });
    expect(new Set([jerusalem, newYork, utc]).size).toBe(3);
  });
});

describe("getTimeZoneAbbreviation", () => {
  it("returns EDT for America/New_York in June (DST in effect)", () => {
    expect(getTimeZoneAbbreviation("America/New_York", new Date(FIXED_UTC))).toBe("EDT");
  });

  it("returns EST for America/New_York in January (DST not in effect)", () => {
    expect(getTimeZoneAbbreviation("America/New_York", new Date("2026-01-15T14:30:00Z"))).toBe("EST");
  });

  it("returns UTC for the UTC zone", () => {
    expect(getTimeZoneAbbreviation("UTC", new Date(FIXED_UTC))).toBe("UTC");
  });
});

describe("DST transition — America/New_York (2026-03-08, spring forward at 2am local)", () => {
  const beforeUtc = "2026-03-08T06:00:00.000Z"; // 01:00 EST (UTC-5)
  const afterUtc = "2026-03-08T08:00:00.000Z"; // 04:00 EDT (UTC-4) — the same wall-clock gap, but the zone jumped an hour

  it("uses EST just before the transition", () => {
    expect(getTimeZoneAbbreviation("America/New_York", new Date(beforeUtc))).toBe("EST");
    expect(formatInTimeZone(beforeUtc, "America/New_York", { style: "time" })).toBe("01:00");
  });

  it("uses EDT just after the transition, without any manually-added fixed offset", () => {
    expect(getTimeZoneAbbreviation("America/New_York", new Date(afterUtc))).toBe("EDT");
    expect(formatInTimeZone(afterUtc, "America/New_York", { style: "time" })).toBe("04:00");
  });
});

describe("DST transition — Asia/Jerusalem (2026-03-27, spring forward)", () => {
  const beforeUtc = "2026-03-26T12:00:00.000Z"; // UTC+2 (IST, standard time)
  const afterUtc = "2026-03-27T12:00:00.000Z"; // UTC+3 (IDT, daylight time)

  it("is UTC+2 the day before the transition", () => {
    expect(formatInTimeZone(beforeUtc, "Asia/Jerusalem", { style: "time" })).toBe("14:00");
  });

  it("is UTC+3 the day after the transition — IANA rule handled the shift, not a hardcoded offset", () => {
    expect(formatInTimeZone(afterUtc, "Asia/Jerusalem", { style: "time" })).toBe("15:00");
  });
});

describe("formatInTimeZoneWithAbbr", () => {
  it("appends the zone abbreviation after the formatted time", () => {
    const out = formatInTimeZoneWithAbbr(FIXED_UTC, "America/New_York", { style: "time" });
    expect(out).toBe("10:30 EDT");
  });
});

describe("formatInTimeZone — malformed input", () => {
  it("falls back to the raw string for an unparseable timestamp rather than throwing", () => {
    expect(formatInTimeZone("not-a-date", "UTC")).toBe("not-a-date");
  });
});
