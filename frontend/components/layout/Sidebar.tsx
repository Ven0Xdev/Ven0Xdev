"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/backtest", label: "Backtest" },
  { href: "/chat", label: "AI Assistant" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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
        router.push(`/stock/${result.matches[0].symbol}`);
      }
    } catch {
      setSearchError("Search failed — is the API running?");
    } finally {
      setSearching(false);
    }
  };

  return (
    <aside
      className="hidden w-56 shrink-0 flex-col gap-1 border-r p-4 sm:flex"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="mb-4 flex items-center gap-2 px-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold"
          style={{ background: "#0d0d0d" }}
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="16,18 32,18 32,82 16,82" fill="#ffffff" />
            <polygon points="68,18 84,18 84,82 68,82" fill="#ffffff" />
            <polygon points="16,18 32,18 84,82 68,82" fill="#0bb981" />
          </svg>
        </div>
        <span className="text-base font-semibold">Nexora</span>
      </div>

      <form
        className="mb-4 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchError(null);
          }}
          placeholder="Search ticker…"
          aria-label="Search ticker"
          className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--page-plane)", color: "var(--text-primary)" }}
        />
        {searchError && (
          <p className="mt-1 px-1 text-xs" style={{ color: "var(--status-critical)" }}>
            {searchError}
          </p>
        )}
      </form>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: active ? "var(--page-plane)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto rounded-lg px-3 py-3 text-xs" style={{ color: "var(--text-muted)", background: "var(--page-plane)" }}>
        Probabilistic research only — not financial advice. OTC micro-caps carry high manipulation and liquidity risk.
      </div>
    </aside>
  );
}
