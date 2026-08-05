"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearTokens, isLoggedIn } from "@/lib/auth";

/** Only renders once a real session exists — in local dev (AUTH_REQUIRED=
 * false) no tokens are ever issued, so this stays invisible there and only
 * appears on a deployment where the user actually signed in. */
export function LogoutButton() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const sync = () => setVisible(isLoggedIn());
    sync();
    window.addEventListener("nexora:auth-change", sync);
    return () => window.removeEventListener("nexora:auth-change", sync);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        clearTokens();
        router.push("/login");
      }}
      className="btn btn-ghost btn-sm"
      style={{ width: 32, height: 32, padding: 0 }}
      aria-label="Sign out"
      title="Sign out"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 17v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1M9 12h12m0 0-3.5-3.5M21 12l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
