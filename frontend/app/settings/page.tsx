"use client";

import { useMemo, useState } from "react";
import { useTimezone } from "@/components/providers/TimezoneProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalTime } from "@/components/ui/LocalTime";
import {
  EXCHANGE_TIME_ZONE,
  getDeviceTimeZone,
  isPresetTimezone,
  isValidIanaTimeZone,
  type TimezonePreference,
} from "@/lib/timezone";

const PRESET_OPTIONS: { value: TimezonePreference; label: string; describe: () => string }[] = [
  { value: "device", label: "Automatic (device)", describe: () => `Follows this browser's timezone — currently ${safeDeviceTimeZone()}.` },
  { value: "exchange", label: "Exchange time (New York)", describe: () => `Always ${EXCHANGE_TIME_ZONE}, matching the market session — regardless of where you are.` },
  { value: "utc", label: "UTC", describe: () => "Coordinated Universal Time, no offset." },
];

function safeDeviceTimeZone(): string {
  if (typeof window === "undefined") return "…";
  return getDeviceTimeZone();
}

/** A representative, not exhaustive, set of IANA zones covering every
 * populated UTC offset and DST rule — the manual picker's own text
 * input accepts any valid IANA name beyond this list (validated live via
 * `isValidIanaTimeZone`), so this is a convenience shortlist, not a limit. */
const COMMON_ZONES = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver",
  "America/Chicago", "America/New_York", "America/Sao_Paulo", "Atlantic/Reykjavik",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Athens", "Europe/Moscow",
  "Asia/Jerusalem", "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

function allIanaZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      /* fall through to the shortlist */
    }
  }
  return COMMON_ZONES;
}

export default function SettingsPage() {
  const { preference, effectiveTimeZone, abbreviation, ready, setPreference } = useTimezone();
  const [manualDraft, setManualDraft] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const isManual = ready && !isPresetTimezone(preference);
  const zoneOptions = useMemo(() => allIanaZones(), []);

  const applyManualZone = (tz: string) => {
    if (!tz) return;
    if (!isValidIanaTimeZone(tz)) {
      setManualError(`"${tz}" is not a recognized IANA timezone.`);
      return;
    }
    setManualError(null);
    setPreference(tz);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Display preferences for this account." />

      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Timezone
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Controls how chart timestamps, quotes, alerts, trades, and backtest results are displayed. Stored
            internally as UTC and converted for display — exchange session status always stays in{" "}
            {EXCHANGE_TIME_ZONE}, regardless of this setting.
          </p>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Timezone display mode">
          {PRESET_OPTIONS.map((opt) => {
            const active = ready && preference === opt.value;
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-[10px] border p-3"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="timezone-mode"
                  className="mt-0.5"
                  checked={active}
                  onChange={() => setPreference(opt.value)}
                />
                <span>
                  <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {opt.label}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                    {opt.describe()}
                  </span>
                </span>
              </label>
            );
          })}

          <label
            className="flex cursor-pointer items-start gap-3 rounded-[10px] border p-3"
            style={{
              borderColor: isManual ? "var(--accent)" : "var(--border)",
              background: isManual ? "var(--accent-soft)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="timezone-mode"
              className="mt-0.5"
              checked={isManual}
              onChange={() => applyManualZone(manualDraft || COMMON_ZONES[0])}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Manual timezone
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <select
                  className="input"
                  style={{ maxWidth: 260 }}
                  value={isManual ? preference : ""}
                  onChange={(e) => {
                    setManualDraft(e.target.value);
                    applyManualZone(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choose a timezone…
                  </option>
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </span>
              {manualError && (
                <span className="mt-1 block text-xs" style={{ color: "var(--status-critical)" }}>
                  {manualError}
                </span>
              )}
            </span>
          </label>
        </div>

        <div className="rounded-[10px] p-3 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
          Right now:{" "}
          {ready ? (
            <>
              <LocalTime iso={new Date().toISOString()} options={{ style: "datetime", seconds: true }} /> in{" "}
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {effectiveTimeZone}
              </span>{" "}
              ({abbreviation})
            </>
          ) : (
            "resolving…"
          )}
        </div>
      </section>
    </div>
  );
}
