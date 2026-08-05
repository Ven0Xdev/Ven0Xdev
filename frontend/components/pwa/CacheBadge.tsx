"use client";

/** Shown next to data that was served from the service worker's offline
 * cache (X-Nexora-Cache: offline-fallback) rather than a live network
 * response. Never render this alongside a "LIVE" claim for the same data. */
export function CacheBadge({ cachedAt }: { cachedAt: string | null }) {
  const label = cachedAt
    ? `OFFLINE — cached data from ${new Date(cachedAt).toLocaleString()}`
    : "OFFLINE — cached data";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide"
      style={{ color: "var(--status-warning)", background: "color-mix(in srgb, var(--status-warning) 14%, transparent)" }}
      title="This data could not be refreshed from the network and is being shown from the last successful fetch."
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-warning)" }} />
      {label}
    </span>
  );
}
