"use client";

import { useOnlineStatus } from "@/lib/pwa";

/** Site-wide banner — the browser/network is unreachable. Distinct from the
 * per-widget "cached data" badge (CacheBadge), which fires even when the
 * browser thinks it's online but a specific request had to fall back to
 * the service worker's cache. */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide"
      style={{ background: "var(--status-warning)", color: "#1a1a1a" }}
      role="status"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1a1a1a" }} />
      OFFLINE — showing last cached data. Nothing on screen is live right now.
    </div>
  );
}
