"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [newTicker, setNewTicker] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => api.watchlist().then(setItems);

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!newTicker.trim() || adding) return;
    setAdding(true);
    try {
      await api.addToWatchlist(newTicker.trim().toUpperCase());
      setNewTicker("");
      await load();
    } finally {
      setAdding(false);
    }
  };

  const remove = async (symbol: string) => {
    await api.removeFromWatchlist(symbol);
    load();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Watchlist" description="Tickers you're tracking. Click through for the full AI analysis and chat." />

      <form
        className="card animate-in flex gap-2.5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value)}
          placeholder="Add ticker, e.g. AXNT"
          className="input flex-1"
        />
        <button type="submit" disabled={adding} className="btn btn-primary">
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {!items ? (
        <CardSkeleton lines={3} />
      ) : items.length === 0 ? (
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-muted)" }}>
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Your watchlist is empty.</p>
        </div>
      ) : (
        <div className="card animate-in overflow-hidden">
          <ul>
            {items.map((item, i) => (
              <li
                key={item.ticker_symbol}
                className="group flex items-center justify-between px-4 py-3.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--gridline)" }}
              >
                <Link href={`/stock/${item.ticker_symbol}`} className="font-semibold hover:underline">
                  {item.ticker_symbol}
                </Link>
                <button
                  onClick={() => remove(item.ticker_symbol)}
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--status-critical)" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
