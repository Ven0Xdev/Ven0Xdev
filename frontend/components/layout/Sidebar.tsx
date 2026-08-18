"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LogoutButton } from "@/components/auth/LogoutButton";

function Icon({ d, viewBox = "0 0 24 24" }: { d: string; viewBox?: string }) {
  return (
    <svg width="18" height="18" viewBox={viewBox} fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" },
  { href: "/opportunities", label: "Opportunities", icon: "M3 17l5-5 4 4 8-9M20 7v6h-6" },
  { href: "/watchlist", label: "Watchlist", icon: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" },
  { href: "/portfolio", label: "Portfolio", icon: "M3 7h18v13H3V7Zm5 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 12h18" },
  { href: "/paper-trading", label: "Paper Trading", icon: "M3 3v18h18 M7 15l4-5 3 3 5-7" },
  { href: "/backtest", label: "Backtest", icon: "M12 8v4l3 2 M21 12a9 9 0 1 1-3.5-7.14 M21 3v5h-5" },
  { href: "/performance", label: "Performance", icon: "M4 19V5 M4 19h16 M8 15l3-4 3 2 4-6" },
  { href: "/alerts", label: "Alerts", icon: "M12 3a5 5 0 0 0-5 5v3.5c0 .8-.3 1.6-.9 2.2L4.5 15.5h15L17.9 13.7c-.6-.6-.9-1.4-.9-2.2V8a5 5 0 0 0-5-5Z M9.5 18.5a2.5 2.5 0 0 0 5 0" },
  { href: "/chat", label: "AI Assistant", icon: "M12 3a8 8 0 0 0-6.93 12.02L4 21l6.1-1.05A8 8 0 1 0 12 3Z M8.5 12h.01 M12 12h.01 M15.5 12h.01" },
  { href: "/billing", label: "Plan & Usage", icon: "M3 7h18v3H3V7Zm0 5h18v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm3 4h4" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10a1.65 1.65 0 0 0 1-1.51V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10c.63.14 1.34.5 1.51 1H21a2 2 0 1 1 0 4h-.09c-.5 0-1.13.36-1.51 1Z" },
  {
    href: "/admin",
    label: "Admin",
    icon: "M12 2 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6L12 2Z M9.5 12l1.8 1.8L15 10",
    operatorOnly: true,
  },
];

/** Beta product indicator, next to the wordmark everywhere it appears —
 * this platform is in beta (paper-trading-only execution, no real broker
 * integration, Safe Mode as a standing kill switch) and should never read
 * as a finished, fully-live product. */
export function BetaBadge() {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      Beta
    </span>
  );
}

export function NexoraMark({ size = 8 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[9px]"
      style={{ background: "#0d0d0d", width: `${size * 4}px`, height: `${size * 4}px` }}
      aria-hidden="true"
    >
      <svg width={size * 2.1} height={size * 2.1} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="16,18 32,18 32,82 16,82" fill="#ffffff" />
        <polygon points="68,18 84,18 84,82 68,82" fill="#ffffff" />
        <polygon points="16,18 32,18 84,82 68,82" fill="#0bb981" />
      </svg>
    </div>
  );
}

/** Search + nav list — the part shared between the persistent desktop
 * sidebar and the mobile slide-in drawer (MobileNav). */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((u) => setIsOperator(u.role === "operator"))
      .catch(() => setIsOperator(false));
  }, []);

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.operatorOnly || isOperator);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await api.search(q);
      if (!result.valid_format) {
        setSearchError("Invalid symbol format");
      } else if (result.matches.length === 0) {
        setSearchError(`"${q.toUpperCase()}" not found (${result.source})`);
      } else {
        setQuery("");
        onNavigate?.();
        router.push(`/stock/${result.matches[0].symbol}`);
      }
    } catch {
      setSearchError("Search failed — is the API running?");
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <form
        className="mb-5 px-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
              <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchError(null);
            }}
            placeholder="Search ticker…"
            aria-label="Search ticker"
            className="input"
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>
        {searchError && (
          <p className="mt-1.5 px-1 text-xs" style={{ color: "var(--status-critical)" }}>
            {searchError}
          </p>
        )}
      </form>

      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="group relative flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-medium"
              style={{
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                transition: "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--surface-2)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                />
              )}
              <Icon d={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function SidebarFooter() {
  return (
    <div
      className="mt-auto rounded-[10px] px-3 py-3 text-xs leading-relaxed"
      style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}
    >
      Probabilistic research only — not financial advice. Markets carry manipulation and liquidity risk; size and manage accordingly.
    </div>
  );
}

/** Persistent left rail — desktop/tablet only (sm and up). Mobile gets
 * MobileNav's top bar + slide-in drawer instead. */
export function Sidebar() {
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col gap-1 border-r p-4 sm:flex"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="mb-5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <NexoraMark />
          <span className="text-[15px] font-semibold tracking-tight">Nexora</span>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-1">
          <LogoutButton />
          <ThemeToggle />
        </div>
      </div>
      <SidebarBody />
      <SidebarFooter />
    </aside>
  );
}
