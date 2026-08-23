"use client";

import { classifyApiError } from "@/lib/api";

/** Shared error card: classifies whatever the API layer threw (backend
 * unreachable, timeout, provider unavailable, unauthorized, rate limited,
 * backend error) into a title/hint via classifyApiError, so every page
 * shows the SAME specific message for the SAME failure — never a generic
 * "something went wrong" that hides whether it's the network, the backend,
 * or a market-data vendor that's actually down. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, hint } = classifyApiError(error);
  return (
    <div className="card animate-in p-5 text-sm" style={{ borderColor: "var(--status-critical-soft)" }}>
      <p className="font-semibold" style={{ color: "var(--status-critical)" }}>
        {title}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        {hint}
      </p>
      <pre className="mt-2 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
        {String(error)}
      </pre>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary btn-sm mt-3">
          Retry
        </button>
      )}
    </div>
  );
}
