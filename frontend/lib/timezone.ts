/** User-local timezone support (device-detected, exchange, UTC, or a manual
 * IANA zone). Backend keeps every timestamp as timezone-aware UTC ISO-8601
 * (see backend/app/db/types.py's UTCDateTime) — this module is purely a
 * client-side *display* layer over that, via `Intl`, which resolves IANA
 * zone rules (including DST transitions) itself. Never hand-roll a fixed
 * UTC offset here — that's exactly what breaks across a DST boundary.
 */

export const TIMEZONE_STORAGE_KEY = "nexora-timezone";

/** Nexora always evaluates market-session state (open/closed/pre/post) in
 * the exchange's own timezone, independent of the viewer's location or
 * display preference — mirrors backend/app/services/market_overview.py's
 * `market_status()`, which is fixed to ZoneInfo("America/New_York"). The
 * frontend must never reimplement that calculation in a different zone. */
export const EXCHANGE_TIME_ZONE = "America/New_York";

/** The three non-IANA preset values. Anything else stored is assumed to be
 * a literal IANA zone name (e.g. "Asia/Jerusalem") — kept in sync with the
 * backend's `_TIMEZONE_PRESETS` in app/api/v1/endpoints/auth.py. */
export type TimezonePreset = "device" | "exchange" | "utc";
export type TimezonePreference = TimezonePreset | (string & {});

const PRESETS: ReadonlySet<string> = new Set<TimezonePreset>(["device", "exchange", "utc"]);

export function isPresetTimezone(pref: string): pref is TimezonePreset {
  return PRESETS.has(pref);
}

/** Validates a string is a real IANA zone Intl actually recognizes —
 * throws on anything else (unknown names, offsets like "+03:00", etc). */
export function isValidIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The browser's own IANA zone, per the requirement: `Intl.DateTimeFormat()
 * .resolvedOptions().timeZone`. Only ever called client-side — callers must
 * guard for `typeof window === "undefined"` themselves (this module has no
 * SSR fallback opinion; see components/providers/TimezoneProvider.tsx). */
export function getDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidIanaTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

/** Preference -> the actual IANA zone to format in. A stored value that
 * turns out to be neither a known preset nor a real IANA zone (e.g. it was
 * set by an older client version, or corrupted) falls back to the device
 * zone rather than silently mis-localizing every timestamp. */
export function resolveEffectiveTimeZone(pref: TimezonePreference): string {
  if (pref === "device") return getDeviceTimeZone();
  if (pref === "exchange") return EXCHANGE_TIME_ZONE;
  if (pref === "utc") return "UTC";
  return isValidIanaTimeZone(pref) ? pref : getDeviceTimeZone();
}

export function getStoredTimezonePreference(): TimezonePreference | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
}

export function setStoredTimezonePreference(pref: TimezonePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TIMEZONE_STORAGE_KEY, pref);
}

/** Short zone abbreviation for the *specific instant* given (e.g. "EDT" in
 * summer vs. "EST" in winter for America/New_York) — computed via
 * `Intl.DateTimeFormat`'s `timeZoneName: "short"` part, which re-derives the
 * correct abbreviation from the IANA zone's own DST rules for that date
 * rather than a fixed label, so a DST transition changes it automatically. */
export function getTimeZoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value;
    return tzName ?? timeZone;
  } catch {
    return timeZone;
  }
}

export interface FormatTimestampOptions {
  /** "short" = "Aug 18, 14:03"; "date" = "Aug 18, 2026"; "time" = "14:03:00". */
  style?: "short" | "date" | "time" | "datetime";
  seconds?: boolean;
}

/** Formats a UTC ISO-8601 timestamp (as the backend always sends — see
 * module docstring) in the given IANA zone. This is the one place chart
 * timestamps, historical bars, and live streamed bars should all route
 * through, so a historical REST bar and a streamed tick for the same
 * instant always render identically after conversion. */
export function formatInTimeZone(iso: string, timeZone: string, opts: FormatTimestampOptions = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const { style = "short", seconds = false } = opts;

  const timeParts: Intl.DateTimeFormatOptions =
    style === "date" ? {} : { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false };
  const dateParts: Intl.DateTimeFormatOptions =
    style === "time" ? {} : { month: "short", day: "numeric", ...(style === "datetime" || style === "date" ? { year: "numeric" } : {}) };

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...dateParts, ...timeParts }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** `formatInTimeZone` plus the zone abbreviation appended — the
 * "abbreviation beside chart timestamps" requirement. */
export function formatInTimeZoneWithAbbr(iso: string, timeZone: string, opts?: FormatTimestampOptions): string {
  return `${formatInTimeZone(iso, timeZone, opts)} ${getTimeZoneAbbreviation(timeZone, new Date(iso))}`;
}
