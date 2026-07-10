"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PortfolioPosition } from "@/lib/types";

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [form, setForm] = useState({ ticker: "", quantity: "", price: "" });

  const load = () => api.portfolio().then(setPositions);

  useEffect(() => {
    load();
  }, []);

  const openPosition = async () => {
    if (!form.ticker || !form.quantity || !form.price) return;
    await api.openPosition(form.ticker.toUpperCase(), Number(form.quantity), Number(form.price));
    setForm({ ticker: "", quantity: "", price: "" });
    load();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Manually logged positions, marked to the live AI-analyzed price.
        </p>
      </div>

      <div className="card flex flex-wrap gap-2 p-4">
        <input
          value={form.ticker}
          onChange={(e) => setForm({ ...form, ticker: e.target.value })}
          placeholder="Ticker"
          className="w-28 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <input
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          placeholder="Quantity"
          type="number"
          className="w-32 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <input
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          placeholder="Avg entry price"
          type="number"
          step="0.0001"
          className="w-40 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <button onClick={openPosition} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--series-blue)", color: "#fff" }}>
          Open position
        </button>
      </div>

      <div className="card overflow-x-auto">
        {!positions ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : positions.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No open positions.</p>
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Ticker</th>
                <th className="px-4 py-2 font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Avg entry</th>
                <th className="px-4 py-2 font-medium">Current</th>
                <th className="px-4 py-2 font-medium">Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker_symbol} className="border-t tabular" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/stock/${p.ticker_symbol}`} className="font-medium hover:underline">
                      {p.ticker_symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.quantity}</td>
                  <td className="px-4 py-3">${p.avg_entry_price.toFixed(4)}</td>
                  <td className="px-4 py-3">{p.current_price ? `$${p.current_price.toFixed(4)}` : "—"}</td>
                  <td
                    className="px-4 py-3 font-semibold"
                    style={{ color: (p.unrealized_pnl_pct ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                  >
                    {p.unrealized_pnl_pct != null ? `${p.unrealized_pnl_pct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
