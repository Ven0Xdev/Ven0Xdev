"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  getDeviceTimeZone,
  getStoredTimezonePreference,
  getTimeZoneAbbreviation,
  resolveEffectiveTimeZone,
  setStoredTimezonePreference,
  type TimezonePreference,
} from "@/lib/timezone";

interface TimezoneContextValue {
  /** Raw preference: "device" | "exchange" | "utc" | an IANA zone name. */
  preference: TimezonePreference;
  /** The actual IANA zone to format in right now (device resolved to a
   * real zone, presets resolved to their fixed zone). */
  effectiveTimeZone: string;
  /** Short abbreviation for the current instant (e.g. "EDT"). */
  abbreviation: string;
  /** False until the client's own timezone has been resolved — every
   * consumer that renders a localized timestamp must wait for this to
   * avoid an SSR/hydration mismatch (the server has no timezone signal
   * at all). See components/ui/LocalTime.tsx. */
  ready: boolean;
  setPreference: (pref: TimezonePreference) => void;
}

// SSR-safe placeholder: UTC/"device"/not-ready. Identical on every server
// render and on the client's very first (pre-hydration-effect) render, so
// there is never a text mismatch — only what's shown *after* the effect
// below resolves the real value.
const TimezoneContext = createContext<TimezoneContextValue>({
  preference: "device",
  effectiveTimeZone: "UTC",
  abbreviation: "UTC",
  ready: false,
  setPreference: () => {},
});

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<TimezonePreference>("device");
  const [effectiveTimeZone, setEffectiveTimeZone] = useState("UTC");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Deferred to a microtask (matches components/ui/ThemeToggle.tsx's
    // convention) so this reads as "sync from an external system in a
    // callback" rather than a synchronous effect-body setState.
    Promise.resolve().then(async () => {
      let pref: TimezonePreference = getStoredTimezonePreference() ?? "device";

      // An authenticated user's server-stored preference (set on any
      // device) wins over whatever's in this browser's localStorage —
      // "Persist the preference locally and in the user profile when
      // authenticated" implies the profile is authoritative once present.
      if (getAccessToken()) {
        try {
          const me = await api.me();
          if (me.timezone) {
            pref = me.timezone;
            setStoredTimezonePreference(pref);
          }
        } catch {
          // Offline / token expired / logged out mid-flight — the locally
          // stored preference (or "device") is still a fine fallback.
        }
      }

      setPreferenceState(pref);
      setEffectiveTimeZone(resolveEffectiveTimeZone(pref));
      setReady(true);
    });
  }, []);

  const setPreference = useCallback((pref: TimezonePreference) => {
    const tz = resolveEffectiveTimeZone(pref);
    setPreferenceState(pref);
    setEffectiveTimeZone(tz);
    setStoredTimezonePreference(pref);
    if (getAccessToken()) {
      api.updateTimezone(pref).catch(() => {
        // Best-effort sync — the local preference is already applied and
        // persisted; a failed PATCH just means it won't follow the user to
        // another device until the next successful sync.
      });
    }
  }, []);

  const abbreviation = ready ? getTimeZoneAbbreviation(effectiveTimeZone) : "UTC";

  return (
    <TimezoneContext.Provider value={{ preference, effectiveTimeZone, abbreviation, ready, setPreference }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone(): TimezoneContextValue {
  return useContext(TimezoneContext);
}

/** For components that need the raw device zone regardless of the user's
 * chosen display preference (e.g. showing "your device is in X" in
 * Settings) — distinct from `useTimezone().effectiveTimeZone`, which
 * follows the active preference. */
export { getDeviceTimeZone };
