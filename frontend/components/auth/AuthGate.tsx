"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Status = "checking" | "ok" | "denied";

/** Guards every route except /login and /register (see AppShell). Calling
 * GET /auth/me is the single source of truth for "is this session valid" —
 * it succeeds unconditionally when the backend runs with AUTH_REQUIRED=false
 * (local dev), so this component is a transparent no-op there, and only
 * enforces anything once a deployment actually turns auth on.
 *
 * AuthGate is mounted once inside the persistent root layout, so this
 * effect runs on a real page load, not on every client-side navigation —
 * the "checking" spinner below is a one-time cost, not a per-page flash.
 * (It deliberately never reads localStorage during render to decide what
 * to show: the server can't know if a token exists, so branching on it in
 * the render body would diverge between SSR and the client's first paint
 * — exactly the hydration-mismatch bug this project has hit before.)
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      api
        .me()
        .then(() => !cancelled && setStatus("ok"))
        .catch(() => {
          if (cancelled) return;
          setStatus("denied");
          router.replace("/login");
        });
    };

    check();
    // Re-check on login/logout elsewhere (e.g. a logout in another tab).
    window.addEventListener("nexora:auth-change", check);
    return () => {
      cancelled = true;
      window.removeEventListener("nexora:auth-change", check);
    };
  }, [router]);

  if (status === "checking") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--gridline)", borderTopColor: "var(--accent)" }}
          aria-label="Checking your session"
        />
      </div>
    );
  }

  if (status === "denied") return null; // redirecting

  return <>{children}</>;
}
