"use client";

import { useEffect, useState } from "react";
import { applyTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  // The blocking init script (see lib/theme.ts) already set data-theme on
  // <html> before this ever mounts — SSR has no theme signal at all, so
  // "light" here is only ever the pre-hydration placeholder for a client
  // component's server pass, corrected in the effect below immediately
  // after mount (a real DOM read, not state React needs to reconcile).
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    // Deferred to a microtask so this reads as "sync from an external
    // system in a callback", not a synchronous effect-body setState.
    Promise.resolve().then(() => {
      const current = document.documentElement.getAttribute("data-theme");
      setThemeState(current === "dark" ? "dark" : "light");
    });
    // Only enable the CSS transition on theme changes after the very first
    // paint, so navigating to the app never shows a color sweep — only
    // deliberate toggles do.
    const id = requestAnimationFrame(() => document.documentElement.classList.add("theme-ready"));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm"
      style={{ width: 32, height: 32, padding: 0 }}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20.5 14.2a8.5 8.5 0 1 1-10.7-10.7 7 7 0 0 0 10.7 10.7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
