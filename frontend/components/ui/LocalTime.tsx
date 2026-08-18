"use client";

import { useTimezone } from "@/components/providers/TimezoneProvider";
import { formatInTimeZone, type FormatTimestampOptions } from "@/lib/timezone";

/** Renders a UTC ISO-8601 timestamp in the user's active timezone
 * preference, with the zone abbreviation beside it by default. Renders
 * nothing until `ready` (see TimezoneProvider) — the server has no
 * timezone signal at all, so the only hydration-safe first client render
 * is the same empty state the server produced, with the real localized
 * text arriving a tick later via the provider's own effect (not a second
 * effect in this component, so no extra flash-of-placeholder here beyond
 * whatever the page's `fallback` renders). */
export function LocalTime({
  iso,
  options,
  showAbbreviation = true,
  fallback = null,
  className,
}: {
  iso: string | null | undefined;
  options?: FormatTimestampOptions;
  showAbbreviation?: boolean;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const { effectiveTimeZone, abbreviation, ready } = useTimezone();

  if (!iso) return <>{fallback}</>;
  if (!ready) return <span className={className}>{fallback}</span>;

  const formatted = formatInTimeZone(iso, effectiveTimeZone, options);
  return (
    <span className={className} title={iso}>
      {formatted}
      {showAbbreviation ? ` ${abbreviation}` : ""}
    </span>
  );
}

/** Plain-string version for call sites that build a larger sentence/title
 * around the timestamp (e.g. a `title=` tooltip) rather than rendering
 * `<LocalTime>` directly. Same readiness contract: returns `fallback`
 * until the client zone is known. */
export function useLocalTimeString(
  iso: string | null | undefined,
  options?: FormatTimestampOptions,
  showAbbreviation = true,
  fallback = ""
): string {
  const { effectiveTimeZone, abbreviation, ready } = useTimezone();
  if (!iso || !ready) return fallback;
  const formatted = formatInTimeZone(iso, effectiveTimeZone, options);
  return showAbbreviation ? `${formatted} ${abbreviation}` : formatted;
}
