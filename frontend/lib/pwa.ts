"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function subscribeToBrowserConnectivity(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function getBrowserOnlineSnapshot() {
  return navigator.onLine;
}
function getServerOnlineSnapshot() {
  // SSR has no network signal at all — assume online so the very first
  // hydration pass matches the server-rendered markup exactly; the real
  // value takes over on the client immediately after via the subscription.
  return true;
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // Called from a client component's effect, which only ever runs after
  // mount — that's already a safe time to register; no need to wait for
  // the window 'load' event (which may have already fired by then, in
  // which case a 'load' listener added here would never trigger).
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Offline support degrades gracefully — the app still works online.
  });
}

/**
 * `navigator.onLine` alone is unreliable (true when connected to a router
 * with no upstream internet). Every flip to "online" is verified with a
 * real network probe before it's trusted and before a resync is fired —
 * this is what makes 'nexora:resync' an honest signal, not a guess.
 */
export function useOnlineStatus(): boolean {
  // Hydration-safe raw browser signal — matches the server snapshot on the
  // first client render (see getServerOnlineSnapshot), so this can never
  // throw a hydration mismatch the way a plain useState(navigator.onLine)
  // initializer does.
  const browserOnline = useSyncExternalStore(
    subscribeToBrowserConnectivity,
    getBrowserOnlineSnapshot,
    getServerOnlineSnapshot
  );

  // navigator.onLine has false positives (e.g. connected to a router with
  // no upstream internet), so "online" is only trusted after a real ping
  // confirms it — this is also what triggers the resync event. Starts
  // `true` (a plain, non-browser-dependent initial value) so this state
  // never diverges from SSR either.
  const [verifiedOnline, setVerifiedOnline] = useState(true);

  useEffect(() => {
    // Nothing to verify while the browser itself reports offline — the
    // returned value below is already false via `browserOnline && ...`,
    // and there's no live network to ping anyway.
    if (!browserOnline) return;

    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(API_BASE.replace(/\/api\/v1$/, "") + "/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (cancelled) return;
        if (res.ok) {
          setVerifiedOnline(true);
          navigator.serviceWorker?.controller?.postMessage({ type: "REVALIDATE_API_CACHE" });
          window.dispatchEvent(new CustomEvent("nexora:resync"));
        } else {
          setVerifiedOnline(false);
        }
      } catch {
        if (!cancelled) setVerifiedOnline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [browserOnline]);

  return browserOnline && verifiedOnline;
}

/** Re-run a page's data fetches whenever a verified reconnect happens. */
export function useResyncListener(onResync: () => void) {
  useEffect(() => {
    window.addEventListener("nexora:resync", onResync);
    return () => window.removeEventListener("nexora:resync", onResync);
  }, [onResync]);
}
