"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col gap-1 border-r p-4 sm:flex"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="h-7 w-7 rounded-md" style={{ background: "var(--series-blue)" }} />
        <span className="text-base font-semibold">Ven0X OTC</span>
      </div>
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
