"""Shadow observation — passive, hypothetical tracking of what NCS's own
fired signals *would* have returned, using real closed-bar prices only.

This is NOT the paper trading engine and is never labeled "NEXORA
INTERNAL PAPER" — that label is reserved for the platform's one real
execution simulator (services/paper_trading/engine.py). Shadow positions
never place, open, or touch any account/balance/position a user actually
owns; they exist purely to build an honest, auditable track record of
"if you had followed this signal, here's what actually happened" before
any autonomous execution is ever allowed to act on NCS at all.

Two ways a shadow position gets marked forward:
1. Opportunistically, one bar at a time, from evaluate_ncs() itself right
   after it persists a new NCS row for (ticker, timeframe) — the natural,
   incremental path, correct as long as NCS keeps getting evaluated on
   consecutive closed bars for that symbol (see on_ncs_evaluated below).
2. sweep_open_positions() — an operator-triggered catch-up sweep across
   every OPEN position, which walks every closed bar since it was last
   marked (not just the latest), so a position that went unobserved for a
   while (nobody viewed that chart / NCS wasn't evaluated) still gets an
   honest, complete MFE/MAE history instead of a false one-bar jump.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models.ncs_signal import NcsSignal
from app.db.models.shadow_position import ShadowPosition
from app.db.types import utcnow
from app.services.data_providers.base import MarketDataProvider

SHADOW_VERSION = "shadow-v1"

# Bar COUNT, not wall-clock time — deliberately the same number for every
# timeframe, so "20 bars" scales naturally with whatever timeframe the
# originating NCS signal was computed on (20 closed 1H bars is a very
# different wall-clock window than 20 closed 1D bars, and that's the
# honest, correct behavior here — this is "how the signal's own horizon
# played out," not a fixed calendar duration).
MAX_HOLDING_BARS = 20

_BUY_FAMILY = {"STRONG_BUY", "BUY"}
_SELL_FAMILY = {"STRONG_SELL", "SELL"}


def _as_utc_datetime(ts) -> datetime:
    dt = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _pnl_pct(direction: str, entry_price: float, price: float) -> float:
    raw = (price - entry_price) / entry_price
    return raw if direction == "LONG" else -raw


def on_ncs_fired(db: Session, ncs_row: NcsSignal, entry_price: float) -> ShadowPosition | None:
    """Opens exactly one shadow position for a newly-fired NCS row —
    called once, right after that row is persisted (see
    services/signals/ncs.py's evaluate_ncs). No-op for a NEUTRAL bucket
    (nothing directional to shadow); the unique index on ncs_signal_id
    backstops against ever opening a second position for the same row.
    """
    if ncs_row.confirmed_verdict in _BUY_FAMILY:
        direction = "LONG"
    elif ncs_row.confirmed_verdict in _SELL_FAMILY:
        direction = "SHORT"
    else:
        return None

    existing = db.query(ShadowPosition).filter_by(ncs_signal_id=ncs_row.id).one_or_none()
    if existing is not None:
        return existing

    position = ShadowPosition(
        ncs_signal_id=ncs_row.id,
        ticker_symbol=ncs_row.ticker_symbol,
        timeframe=ncs_row.timeframe,
        direction=direction,
        entry_bar_ts=ncs_row.bar_ts,
        entry_price=entry_price,
        status="OPEN",
        version=SHADOW_VERSION,
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


def mark_and_maybe_close(
    db: Session, position: ShadowPosition, bar_ts: datetime, price: float, latest_ncs: NcsSignal | None,
) -> None:
    """Marks one real closed bar against an OPEN shadow position, updating
    MFE/MAE and holding_bars_elapsed, and closes it if an exit condition
    is met on this bar: max holding period reached, or a new fired NCS
    row for the same (ticker, timeframe) confirms the opposite direction
    (the signal itself reversed). Never fabricates a price — `price` must
    be a real closed-bar close, same discipline as entry_price.
    """
    if position.status != "OPEN" or bar_ts <= position.entry_bar_ts:
        return

    pnl = _pnl_pct(position.direction, position.entry_price, price)
    position.mfe_pct = max(position.mfe_pct, pnl)
    position.mae_pct = min(position.mae_pct, pnl)
    position.holding_bars_elapsed += 1

    exit_reason = None
    if latest_ncs is not None and latest_ncs.fired and latest_ncs.bar_ts == bar_ts:
        opposite = _SELL_FAMILY if position.direction == "LONG" else _BUY_FAMILY
        if latest_ncs.confirmed_verdict in opposite:
            exit_reason = "ncs_reversal"
    if exit_reason is None and position.holding_bars_elapsed >= MAX_HOLDING_BARS:
        exit_reason = "max_holding_period"

    if exit_reason:
        position.status = "CLOSED"
        position.exit_bar_ts = bar_ts
        position.exit_price = price
        position.exit_at = utcnow()
        position.exit_reason = exit_reason
        position.pnl_pct = pnl

    db.commit()


def on_ncs_evaluated(db: Session, ncs_row: NcsSignal, close_price: float) -> None:
    """Opportunistic single-bar mark: whenever NCS is evaluated for
    (ticker, timeframe) and produces a row for a new closed bar, mark
    every other still-OPEN shadow position on that same (ticker,
    timeframe) against this bar too — not just the position (if any)
    this exact row just opened. `close_price` comes from the same
    NcsComputation the caller already has in scope (NcsSignal itself has
    no close_price column — this module is the only consumer, so it's
    passed through rather than persisting a column nothing else needs).
    Cheap (no extra provider fetch) and keeps positions current without
    needing a background scheduler for the common case of a symbol
    actually being viewed/evaluated.
    """
    open_positions = (
        db.query(ShadowPosition)
        .filter_by(ticker_symbol=ncs_row.ticker_symbol, timeframe=ncs_row.timeframe, status="OPEN")
        .all()
    )
    for position in open_positions:
        mark_and_maybe_close(db, position, ncs_row.bar_ts, close_price, ncs_row)


def sweep_position(db: Session, position: ShadowPosition, provider: MarketDataProvider) -> None:
    """Catch-up sweep for one OPEN position: walks every real closed bar
    since entry (not just the latest), marking each in order — so a
    position nobody has viewed in a while still gets an honest, complete
    MFE/MAE history and a fair chance to detect an intervening NCS
    reversal, rather than a single false jump straight to the latest bar.
    """
    if position.status != "OPEN":
        return
    from app.services.signals.engine import bars_for_timeframe

    df = bars_for_timeframe(position.ticker_symbol, provider, position.timeframe, closed_only=True)
    if df.empty:
        return

    for ts, row in df.iterrows():
        if position.status != "OPEN":
            break
        bar_ts = _as_utc_datetime(ts)
        if bar_ts <= position.entry_bar_ts:
            continue
        latest_ncs = (
            db.query(NcsSignal)
            .filter_by(ticker_symbol=position.ticker_symbol, timeframe=position.timeframe, bar_ts=bar_ts)
            .one_or_none()
        )
        mark_and_maybe_close(db, position, bar_ts, float(row["close"]), latest_ncs)


def sweep_open_positions(db: Session, provider: MarketDataProvider) -> int:
    """Operator-triggered full sweep across every OPEN shadow position.
    Returns the count of positions swept (open or newly closed by this
    call) — provider errors for one ticker never abort the rest."""
    from app.services.data_providers.http_base import ProviderDataUnavailable

    positions = db.query(ShadowPosition).filter_by(status="OPEN").all()
    swept = 0
    for position in positions:
        try:
            sweep_position(db, position, provider)
            swept += 1
        except ProviderDataUnavailable:
            continue
    return swept


@dataclass
class ShadowStats:
    count_closed: int
    win_rate_pct: float | None
    avg_pnl_pct: float | None
    avg_mfe_pct: float | None
    avg_mae_pct: float | None
    count_open: int


def shadow_stats(db: Session, ticker: str | None = None, timeframe: str | None = None) -> ShadowStats:
    """Aggregate track record — the honest signal-quality readout this
    whole module exists to build. `None` stats (not 0) when there isn't
    a closed sample yet, never a fabricated zero that looks like a real
    100%-loss track record."""
    query = db.query(ShadowPosition)
    if ticker:
        query = query.filter_by(ticker_symbol=ticker.upper())
    if timeframe:
        query = query.filter_by(timeframe=timeframe)

    closed = query.filter_by(status="CLOSED").all()
    count_open = query.filter_by(status="OPEN").count()

    if not closed:
        return ShadowStats(0, None, None, None, None, count_open)

    wins = sum(1 for p in closed if (p.pnl_pct or 0) > 0)
    return ShadowStats(
        count_closed=len(closed),
        win_rate_pct=100.0 * wins / len(closed),
        avg_pnl_pct=sum(p.pnl_pct or 0 for p in closed) / len(closed),
        avg_mfe_pct=sum(p.mfe_pct for p in closed) / len(closed),
        avg_mae_pct=sum(p.mae_pct for p in closed) / len(closed),
        count_open=count_open,
    )
