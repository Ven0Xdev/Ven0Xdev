"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { PaperAccount, PaperPosition, QuoteTicket } from "@/lib/types";

type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "stop";
type QtyMode = "shares" | "dollars";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Original Nexora collapsible Paper Order Ticket — NEXORA INTERNAL PAPER
 * only, can never place a real broker order (see services/paper_trading/
 * orders.py: every submission goes through the same simulator engine.py
 * already uses everywhere else, gated by the same Safe Mode / Emergency
 * Stop checks at execution time, not just a disabled button here). */
export function OrderTicket({
  symbol,
  companyName,
  account,
  openPositions,
  onOrderPlaced,
  onClose,
}: {
  symbol: string;
  companyName?: string;
  account: PaperAccount | null;
  openPositions: PaperPosition[];
  onOrderPlaced: () => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"order" | "dom">("order");
  const [collapsed, setCollapsed] = useState(false);

  const [quote, setQuote] = useState<QuoteTicket | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qtyMode, setQtyMode] = useState<QtyMode>("shares");
  const [qtyInput, setQtyInput] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [regularHoursOnly, setRegularHoursOnly] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOrderResult, setLastOrderResult] = useState<{ id: number; status: string; rejectedReason: string | null } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());

  // Reset the whole ticket (including a fresh idempotency key — a new
  // order intent, never a retry of the last one) whenever the symbol
  // changes, so switching tickers can't accidentally submit stale inputs.
  // Same render-body "adjusting state when a prop changes" pattern
  // TradingChart uses for its own per-symbol resets — not an effect, so
  // this never fires a discardable extra render.
  const [prevSymbol, setPrevSymbol] = useState(symbol);
  if (symbol !== prevSymbol) {
    setPrevSymbol(symbol);
    setSide("buy");
    setOrderType("market");
    setQtyInput("");
    setLimitPrice("");
    setStopPrice("");
    setTakeProfit("");
    setStopLoss("");
    setReviewing(false);
    setSubmitError(null);
    setLastOrderResult(null);
    setIdempotencyKey(newIdempotencyKey());
  }

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.paperTicketQuote(symbol).then((q) => !cancelled && (setQuote(q), setQuoteError(null))).catch((e) => !cancelled && setQuoteError(e));
    };
    load();
    // Matches the shared provider's own ~15s quote cache TTL (see
    // RateLimitedHttpClient in the Alpaca/TwelveData adapters) — polling
    // faster than that would only ever hit the same cached value sooner,
    // never a fresher one, while adding load for nothing.
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  const existingPosition = useMemo(
    () => openPositions.find((p) => p.ticker_symbol.toUpperCase() === symbol.toUpperCase()) ?? null,
    [openPositions, symbol],
  );

  const referencePrice =
    orderType === "limit" ? Number(limitPrice) || null
    : orderType === "stop" ? Number(stopPrice) || null
    : side === "buy" ? quote?.ask ?? quote?.last ?? null
    : quote?.bid ?? quote?.last ?? null;

  const quantity =
    qtyMode === "shares"
      ? Number(qtyInput) || 0
      : referencePrice && Number(qtyInput) ? Number(qtyInput) / referencePrice : 0;

  const estimatedOrderValue = referencePrice !== null ? quantity * referencePrice : null;
  const availableCash = account?.cash_balance ?? 0;
  const equity = account?.equity ?? account?.cash_balance ?? 0;

  const stopLossNum = Number(stopLoss) || null;
  const takeProfitNum = Number(takeProfit) || null;
  const estimatedMaxLossDollars =
    side === "buy" && stopLossNum !== null && referencePrice !== null && stopLossNum < referencePrice
      ? (referencePrice - stopLossNum) * quantity
      : null;
  const riskPctOfEquity = estimatedMaxLossDollars !== null && equity > 0 ? (estimatedMaxLossDollars / equity) * 100 : null;
  const estimatedSpread = quote?.spread ?? null;

  const validationErrors: string[] = [];
  if (quantity <= 0) validationErrors.push("Enter a positive quantity.");
  if (orderType === "limit" && !(Number(limitPrice) > 0)) validationErrors.push("Enter a limit price.");
  if (orderType === "stop" && !(Number(stopPrice) > 0)) validationErrors.push("Enter a stop price.");
  if (side === "sell") {
    if (!existingPosition) {
      validationErrors.push(`No open position in ${symbol} to sell — this account is long-only; Sell can only reduce or close an existing position.`);
    } else if (quantity !== existingPosition.quantity) {
      validationErrors.push(`This account closes a full position only — enter exactly ${existingPosition.quantity} shares to close.`);
    }
  }
  if (side === "buy" && orderType === "market" && estimatedOrderValue !== null && estimatedOrderValue > availableCash) {
    validationErrors.push(`Estimated order value ${formatUsd(estimatedOrderValue)} exceeds available cash ${formatUsd(availableCash)}.`);
  }
  if (takeProfitNum !== null && referencePrice !== null && side === "buy" && takeProfitNum <= referencePrice) {
    validationErrors.push("Take-profit must be above the reference price for a long position.");
  }
  if (stopLossNum !== null && referencePrice !== null && side === "buy" && stopLossNum >= referencePrice) {
    validationErrors.push("Stop-loss must be below the reference price for a long position.");
  }

  const canReview = validationErrors.length === 0 && !!account;

  const submit = async () => {
    if (!canReview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await api.submitPaperOrder({
        ticker_symbol: symbol,
        side,
        order_type: orderType,
        quantity,
        idempotency_key: idempotencyKey,
        limit_price: orderType === "limit" ? Number(limitPrice) : undefined,
        stop_price: orderType === "stop" ? Number(stopPrice) : undefined,
        take_profit: takeProfitNum ?? undefined,
        stop_loss: stopLossNum ?? undefined,
        regular_hours_only: regularHoursOnly,
        position_id: side === "sell" ? existingPosition?.id : undefined,
      });
      setLastOrderResult({ id: order.id, status: order.status, rejectedReason: order.rejected_reason });
      setReviewing(false);
      setQtyInput("");
      setTakeProfit("");
      setStopLoss("");
      setIdempotencyKey(newIdempotencyKey());
      onOrderPlaced();
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="rounded-md px-2 py-1 text-xs font-semibold"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        ◂ Order Ticket
      </button>
    );
  }

  return (
    <div className="card animate-in flex w-full max-w-sm flex-col gap-3 p-4 text-sm" aria-label="Paper order ticket">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {symbol} {companyName && <span className="font-normal" style={{ color: "var(--text-muted)" }}>{companyName}</span>}
          </p>
          <span
            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
            style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
          >
            PAPER TRADING — INTERNAL ONLY
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Minimize order ticket" className="text-xs" style={{ color: "var(--text-muted)" }}>
            −
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close order ticket" className="text-xs" style={{ color: "var(--text-muted)" }}>
              ✕
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {quote
          ? `${quote.data_source} · ${quote.data_mode} · quote as of ${new Date(quote.timestamp).toLocaleTimeString()}`
          : quoteError
            ? "Quote unavailable right now"
            : "Loading quote…"}
      </p>

      <div className="flex gap-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "order"} onClick={() => setTab("order")} className="rounded px-2 py-1 text-xs font-semibold"
          style={{ background: tab === "order" ? "var(--accent-soft)" : "transparent", color: tab === "order" ? "var(--accent)" : "var(--text-secondary)" }}>
          Order
        </button>
        <button type="button" role="tab" aria-selected={tab === "dom"} onClick={() => setTab("dom")} className="rounded px-2 py-1 text-xs font-semibold"
          style={{ background: tab === "dom" ? "var(--accent-soft)" : "transparent", color: tab === "dom" ? "var(--accent)" : "var(--text-secondary)" }}>
          DOM
        </button>
      </div>

      {tab === "dom" ? (
        <div className="rounded-md p-3 text-xs leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Market depth unavailable on the current data plan</p>
          <p className="mt-1">
            {quote?.data_source ?? "The configured provider"} supplies top-of-book bid/ask only, not genuine Level II order-book
            depth. Activating a real DOM here would require upgrading to a market-data entitlement that includes full depth-of-book
            quotes — this app will never synthesize an order book from candles or a single bid/ask.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p style={{ color: "var(--text-muted)" }}>Bid</p>
              <p className="tabular font-semibold">{quote?.bid != null ? `$${quote.bid.toFixed(2)}` : "—"}</p>
            </div>
            <div>
              <p style={{ color: "var(--text-muted)" }}>Ask</p>
              <p className="tabular font-semibold">{quote?.ask != null ? `$${quote.ask.toFixed(2)}` : "—"}</p>
            </div>
            <div>
              <p style={{ color: "var(--text-muted)" }}>Spread</p>
              <p className="tabular font-semibold">{estimatedSpread != null ? `$${estimatedSpread.toFixed(3)}` : "—"}</p>
            </div>
          </div>

          <div className="flex gap-1">
            {(["buy", "sell"] as Side[]).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)} className="flex-1 rounded-md py-1.5 text-xs font-bold uppercase"
                style={{
                  background: side === s ? (s === "buy" ? "var(--status-good-soft)" : "color-mix(in srgb, var(--status-critical) 15%, transparent)") : "var(--surface-2)",
                  color: side === s ? (s === "buy" ? "var(--status-good)" : "var(--status-critical)") : "var(--text-secondary)",
                }}>
                {s}
              </button>
            ))}
          </div>
          {side === "sell" && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Long-only: Sell reduces or closes an existing position only — this account never opens a short.
            </p>
          )}

          <div className="flex gap-1">
            {(["market", "limit", "stop"] as OrderType[]).map((t) => (
              <button key={t} type="button" onClick={() => setOrderType(t)} className="flex-1 rounded px-2 py-1 text-xs font-semibold capitalize"
                style={{ background: orderType === t ? "var(--accent-soft)" : "var(--surface-2)", color: orderType === t ? "var(--accent)" : "var(--text-secondary)" }}>
                {t}
              </button>
            ))}
          </div>

          {orderType === "limit" && (
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: "var(--text-muted)" }}>Limit price</span>
              <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} type="number" min="0" step="any" className="input" />
            </label>
          )}
          {orderType === "stop" && (
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: "var(--text-muted)" }}>Stop price</span>
              <input value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} type="number" min="0" step="any" className="input" />
            </label>
          )}

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span style={{ color: "var(--text-muted)" }}>{qtyMode === "shares" ? "Shares" : "Dollar amount"}</span>
              <input
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                type="number" min="0" step="any" className="input"
                aria-label={qtyMode === "shares" ? "Shares" : "Dollar amount"}
              />
            </label>
            <button type="button" onClick={() => setQtyMode((m) => (m === "shares" ? "dollars" : "shares"))} className="rounded px-2 py-1.5 text-xs font-semibold"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {qtyMode === "shares" ? "Shares" : "$"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <p style={{ color: "var(--text-muted)" }}>Est. quantity</p>
            <p className="text-right tabular">{quantity > 0 ? quantity.toFixed(4).replace(/\.?0+$/, "") : "—"}</p>
            <p style={{ color: "var(--text-muted)" }}>Est. order value</p>
            <p className="text-right tabular">{estimatedOrderValue != null ? formatUsd(estimatedOrderValue) : "—"}</p>
            <p style={{ color: "var(--text-muted)" }}>Available cash</p>
            <p className="text-right tabular">{formatUsd(availableCash)}</p>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span style={{ color: "var(--text-muted)" }}>Take-profit (optional)</span>
            <input value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} type="number" min="0" step="any" className="input" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span style={{ color: "var(--text-muted)" }}>Stop-loss (optional)</span>
            <input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} type="number" min="0" step="any" className="input" />
          </label>

          {(estimatedMaxLossDollars !== null || riskPctOfEquity !== null) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p style={{ color: "var(--text-muted)" }}>Est. max loss</p>
              <p className="text-right tabular" style={{ color: "var(--status-critical)" }}>
                {estimatedMaxLossDollars != null ? formatUsd(estimatedMaxLossDollars) : "—"}
              </p>
              <p style={{ color: "var(--text-muted)" }}>Risk % of equity</p>
              <p className="text-right tabular">{riskPctOfEquity != null ? `${riskPctOfEquity.toFixed(2)}%` : "—"}</p>
            </div>
          )}

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Market fills use the simulator&apos;s next valid quote — buy at ask, sell at bid (spread shown above). No fees are
            modeled in this simulation. Limit/stop orders remain pending until a future eligible quote triggers them.
          </p>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={regularHoursOnly} onChange={(e) => setRegularHoursOnly(e.target.checked)} />
            Regular hours only
          </label>

          {validationErrors.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--status-critical)" }}>
              {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {!reviewing ? (
            <button type="button" disabled={!canReview} onClick={() => setReviewing(true)} className="btn btn-secondary w-full">
              Review order
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-md p-3" style={{ background: "var(--surface-2)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                Confirm: {side.toUpperCase()} {quantity.toFixed(4).replace(/\.?0+$/, "")} {symbol} — {orderType}
                {orderType === "limit" && ` @ $${Number(limitPrice).toFixed(2)}`}
                {orderType === "stop" && ` @ $${Number(stopPrice).toFixed(2)}`}
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                This places a NEXORA INTERNAL PAPER order only. It can never reach a real broker.
              </p>
              {submitError && <p className="text-xs" style={{ color: "var(--status-critical)" }}>{submitError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setReviewing(false)} className="btn btn-ghost btn-sm flex-1">
                  Back
                </button>
                <button type="button" onClick={submit} disabled={submitting} className="btn btn-primary flex-[2]">
                  {submitting ? "Submitting…" : "Submit Paper Order"}
                </button>
              </div>
            </div>
          )}

          {lastOrderResult !== null && !reviewing && (
            <p
              className="text-xs"
              style={{ color: lastOrderResult.status === "rejected" ? "var(--status-critical)" : "var(--status-good)" }}
            >
              {lastOrderResult.status === "rejected"
                ? `Order #${lastOrderResult.id} rejected${lastOrderResult.rejectedReason ? `: ${lastOrderResult.rejectedReason}` : "."}`
                : lastOrderResult.status === "filled"
                  ? `Order #${lastOrderResult.id} filled.`
                  : `Order #${lastOrderResult.id} ${lastOrderResult.status.replace("_", " ")}.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
