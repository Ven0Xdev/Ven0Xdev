"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { UniverseAsset } from "@/lib/types";

/** Searchable ticker selector, restricted to the canonical asset universe
 * (active stocks/ETFs/indices/commodities — GET /universe, the same
 * source of truth the Asset Universe Manager and the chat assistant's own
 * ticker-detection use), so a user can never "select" a symbol the
 * assistant would then reject as unsupported.
 */
export function TickerPicker({
  onSelect,
  placeholder = "Search a ticker — e.g. AAPL, Apple…",
}: {
  onSelect: (symbol: string) => void;
  placeholder?: string;
}) {
  const [assets, setAssets] = useState<UniverseAsset[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .assetUniverse(false)
      .then(setAssets)
      .catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const matches = useMemo(() => {
    const active = (assets ?? []).filter((a) => a.is_active);
    const q = query.trim().toLowerCase();
    if (!q) return active.slice(0, 8);
    return active.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [assets, query]);

  const select = (symbol: string) => {
    onSelect(symbol);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            select(matches[0].symbol);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="input w-full text-sm"
        aria-label="Search canonical ticker"
        aria-expanded={open}
        role="combobox"
        aria-controls="ticker-picker-list"
      />
      {open && assets && (
        <ul
          id="ticker-picker-list"
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] border py-1 text-sm shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {query.trim() ? `No canonical ticker matches "${query.trim()}".` : "No active tickers available."}
            </li>
          ) : (
            matches.map((a) => (
              <li key={a.symbol}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
                  onClick={() => select(a.symbol)}
                  style={{ color: "var(--text-primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="font-semibold">{a.symbol}</span>
                  <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {a.name}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
