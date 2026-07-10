"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [newTicker, setNewTicker] = useState("");

  const load = () => api.watchlist().then(setItems);

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!newTicker.trim()) return;
    await api.addToWatchlist(newTicker.trim().toUpperCase());
    setNewTicker("");
    load();
  };

  const remove = async (symbol: string) => {
    await api.removeFromWatchlist(symbol);
    load();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Watchlist</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Tickers you&apos;re tracking. Click through for the full AI analysis and chat.
        </p>
      </div>

      <div className="card flex gap-2 p-4">
        <input
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value)}
          placeholder="Add ticker, e.g. AXNT"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <button onClick={add} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--series-blue)", color: "#fff" }}>
          Add
        </button>
      </div>

      <div className="card">
        {!items ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Your watchlist is empty.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.ticker_symbol} className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "var(--gridline)" }}>
                <Link href={`/stock/${item.ticker_symbol}`} className="font-medium hover:underline">
                  {item.ticker_symbol}
                </Link>
                <button onClick={() => remove(item.ticker_symbol)} className="text-sm" style={{ color: "var(--status-critical)" }}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
