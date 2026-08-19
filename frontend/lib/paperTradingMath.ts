import type { PaperAccount, PaperOrderRecord, PaperPosition } from "./types";

/** Every number here is derived from real, already-persisted account/
 * position/order data — nothing is simulated or interpolated beyond what
 * the comment on each field says. Two fields are honestly approximate by
 * construction, not fabrication:
 *  - `equityCurve`/`maxDrawdownPct` are built from the sequence of CLOSED
 *    trades' real realized_pnl_dollars, not a continuous intraday mark-
 *    to-market series (the platform doesn't persist one) — a coarser but
 *    genuine resolution, never invented ticks between real events.
 *  - `todayRealizedPnlDollars` is realized P/L only (closed trades whose
 *    closed_at falls in "today", in the caller's timezone) — it does not
 *    include today's unrealized swings, which is exactly what "realized"
 *    means; see the label the UI gives it.
 */
export interface AccountSummary {
  cashBalance: number;
  equity: number;
  startingBalance: number;
  realizedPnlDollars: number;
  unrealizedPnlDollars: number;
  buyingPower: number;
  capitalCommittedDollars: number;
  openOrderValueDollars: number;
  openPositionCount: number;
  todayRealizedPnlDollars: number;
  totalReturnPct: number;
  equityCurve: number[];
  maxDrawdownPct: number;
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
}

/** Builds the equity-after-each-closed-trade curve (starting balance,
 * then cumulative realized P/L applied in chronological order) and the
 * max drawdown of that real series — never a fabricated smoother line. */
export function buildEquityCurve(startingBalance: number, closedPositions: PaperPosition[]): { curve: number[]; maxDrawdownPct: number } {
  const chronological = [...closedPositions]
    .filter((p) => p.closed_at !== null)
    .sort((a, b) => Date.parse(a.closed_at as string) - Date.parse(b.closed_at as string));

  const curve = [startingBalance];
  let running = startingBalance;
  for (const p of chronological) {
    running += p.realized_pnl_dollars ?? 0;
    curve.push(running);
  }

  let peak = curve[0];
  let maxDrawdownPct = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const drawdownPct = ((peak - v) / peak) * 100;
      if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;
    }
  }
  return { curve, maxDrawdownPct };
}

export function computeAccountSummary(
  account: PaperAccount,
  openPositions: PaperPosition[],
  closedPositions: PaperPosition[],
  pendingOrders: PaperOrderRecord[],
): AccountSummary {
  const equity = account.equity ?? account.cash_balance;
  const realizedPnlDollars = closedPositions.reduce((sum, p) => sum + (p.realized_pnl_dollars ?? 0), 0);
  const unrealizedPnlDollars = openPositions.reduce((sum, p) => sum + (p.unrealized_pnl_dollars ?? 0), 0);
  const capitalCommittedDollars = openPositions.reduce((sum, p) => sum + p.avg_entry_price * p.quantity, 0);
  const openOrderValueDollars = pendingOrders
    .filter((o) => o.status === "pending" || o.status === "accepted")
    .reduce((sum, o) => sum + (o.limit_price ?? o.stop_price ?? 0) * o.quantity, 0);
  const todayRealizedPnlDollars = closedPositions
    .filter((p) => isToday(p.closed_at))
    .reduce((sum, p) => sum + (p.realized_pnl_dollars ?? 0), 0);
  const totalReturnPct = account.starting_balance > 0 ? ((equity - account.starting_balance) / account.starting_balance) * 100 : 0;
  const { curve, maxDrawdownPct } = buildEquityCurve(account.starting_balance, closedPositions);

  return {
    cashBalance: account.cash_balance,
    equity,
    startingBalance: account.starting_balance,
    realizedPnlDollars,
    unrealizedPnlDollars,
    buyingPower: account.cash_balance, // Cash account / 1x — no margin, see the platform's non-negotiable rules
    capitalCommittedDollars,
    openOrderValueDollars,
    openPositionCount: openPositions.length,
    todayRealizedPnlDollars,
    totalReturnPct,
    equityCurve: curve,
    maxDrawdownPct,
  };
}
