"""Autonomous paper trading — decides WHEN to autonomously call the paper
trading engine's open_position()/close_position(); it never executes
anything itself and never adds a second execution path. See
services/paper_trading/engine.py's module docstring: that remains the
platform's ONLY trading execution simulator, real or paper.

Every autonomous entry must clear ALL of, in order:
1. The platform-wide emergency stop is not engaged
   (platform_settings.autonomous_trading_paused).
2. The account's active simulation has autonomous_trading_enabled=True —
   explicit per-simulation opt-in, never on by default and never carried
   over to a new simulation.
3. Red-Team review (services/risk/red_team.py) passes — the SAME final
   veto authority NCS markers themselves respect, run independently here
   rather than trusting the NcsSignal row's own `vetoed` field, since
   that field only reflects whatever red_team_veto (if any) the specific
   caller that triggered this evaluation happened to pass in.
4. The Shadow Track Record (services/shadow/engine.py) for this exact
   (ticker, timeframe) has a large enough closed sample and a good enough
   win rate — autonomous execution is earned by a signal's own honest,
   observed track record, never granted from day one.
5. No existing open position (manual OR autonomous) on this ticker in
   this account — autonomous trading never pyramids on top of a
   position, whether it or the user opened it.
6. Position-count and sizing limits (MAX_CONCURRENT_AUTONOMOUS_POSITIONS;
   sizing is risk-based, not a fixed notional fraction of cash — quantity
   is derived from the stop-loss distance so the *dollar risk* lands at
   AUTONOMOUS_RISK_BUDGET_FRACTION_OF_POLICY_MAX of RiskPolicy's own
   max_position_risk_pct ceiling, the same ceiling evaluate_risk() itself
   enforces on every call site, manual or autonomous).
7. The live quote isn't stale (MAX_QUOTE_STALENESS_SECONDS) — a human
   manually clicking "Buy" implicitly accepts whatever's on screen right
   now; an autonomous system has no such implicit human check and must
   refuse to fill against a quote that's no longer current.

The paper trading engine has no shorting (cash-only long positions — see
its own module docstring). A fired SELL/STRONG_SELL NCS row therefore
never opens a new position here; it only closes an existing
autonomously-opened LONG on the same ticker (a safe, honest "exit on
reversal") — it never touches a manually-opened position, which only the
user who opened it may close.

Every position this opens is tagged opened_by="autonomous" with the
triggering ncs_signal_id, so it can never be indistinguishable from one
the account owner placed themselves.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models.ncs_signal import NcsSignal
from app.db.models.paper_trading import PaperPosition, PaperTradingAccount
from app.services.data_providers.base import MarketDataProvider
from app.services.paper_trading import engine
from app.services.paper_trading.engine import PaperTradingError
from app.services.platform_settings import is_autonomous_trading_paused
from app.services.risk import red_team
from app.services.shadow.engine import shadow_stats

AUTONOMOUS_VERSION = "autonomous-v1"

_BUY_FAMILY = {"STRONG_BUY", "BUY"}
_SELL_FAMILY = {"STRONG_SELL", "SELL"}

# Autonomous execution is earned by a signal's own observed track record,
# not granted from day one — see services/shadow/engine.py, which exists
# specifically to build this evidence before Phase C is ever allowed to
# act on it.
MIN_SHADOW_CLOSED_SAMPLE = 20
MIN_SHADOW_WIN_RATE_PCT = 55.0

# Risk-based sizing, not a fixed notional fraction of cash: quantity is
# derived from the stop-loss distance so the *dollar risk* (not the
# position's face value) lands at this fraction of RiskPolicy's own
# max_position_risk_pct ceiling (services/risk/policy.py) — headroom below
# the hard ceiling the engine's own evaluate_risk() call will separately
# enforce, so a routine rounding/timing difference doesn't tip a
# by-design-compliant order into a rejection.
AUTONOMOUS_RISK_BUDGET_FRACTION_OF_POLICY_MAX = 0.8
MAX_CONCURRENT_AUTONOMOUS_POSITIONS = 3

# A human manually clicking "Buy" implicitly accepts whatever's on screen
# right now; an autonomous system has no such implicit check and must
# refuse a quote that's no longer current.
MAX_QUOTE_STALENESS_SECONDS = 300


@dataclass
class AutonomousDecision:
    account_id: int
    approved: bool
    reason: str
    position: PaperPosition | None = None


def _eligible_accounts(db: Session, ticker_symbol: str) -> list[PaperTradingAccount]:
    return (
        db.query(PaperTradingAccount)
        .filter_by(is_active=True, autonomous_trading_enabled=True)
        .all()
    )


def _has_any_open_position(db: Session, account_id: int, ticker_symbol: str) -> bool:
    return (
        db.query(PaperPosition)
        .filter_by(account_id=account_id, ticker_symbol=ticker_symbol, status="open")
        .count()
        > 0
    )


def _open_autonomous_position_count(db: Session, account_id: int) -> int:
    return (
        db.query(PaperPosition)
        .filter_by(account_id=account_id, status="open", opened_by="autonomous")
        .count()
    )


def _evaluate_entry_for_account(
    db: Session, account: PaperTradingAccount, ncs_row: NcsSignal, provider: MarketDataProvider,
) -> AutonomousDecision:
    if _has_any_open_position(db, account.id, ncs_row.ticker_symbol):
        return AutonomousDecision(account.id, False, "Account already has an open position on this ticker.")

    if _open_autonomous_position_count(db, account.id) >= MAX_CONCURRENT_AUTONOMOUS_POSITIONS:
        return AutonomousDecision(
            account.id, False, f"Account already has {MAX_CONCURRENT_AUTONOMOUS_POSITIONS} open autonomous positions.",
        )

    stats = shadow_stats(db, ticker=ncs_row.ticker_symbol, timeframe=ncs_row.timeframe)
    if stats.count_closed < MIN_SHADOW_CLOSED_SAMPLE:
        return AutonomousDecision(
            account.id, False,
            f"Shadow track record for {ncs_row.ticker_symbol}/{ncs_row.timeframe} has only "
            f"{stats.count_closed} closed signals (needs {MIN_SHADOW_CLOSED_SAMPLE}).",
        )
    if (stats.win_rate_pct or 0) < MIN_SHADOW_WIN_RATE_PCT:
        return AutonomousDecision(
            account.id, False,
            f"Shadow track record win rate {stats.win_rate_pct:.0f}% is below the "
            f"{MIN_SHADOW_WIN_RATE_PCT:.0f}% floor required for autonomous entry.",
        )

    from app.services.scoring.scorer import analyze_ticker
    from app.services.streaming.service import get_stream_service

    analysis = analyze_ticker(ncs_row.ticker_symbol, provider=provider)
    health = get_stream_service().health(ncs_row.ticker_symbol)
    portfolio_open_symbols = {
        p.ticker_symbol for p in engine.list_open_positions_for_account(account, db)
    }
    verdict = red_team.review(
        ncs_row.ticker_symbol, analysis, db,
        portfolio_open_symbols=portfolio_open_symbols,
        provider_healthy=not health.get("stale", False),
    )
    if verdict.vetoed:
        return AutonomousDecision(account.id, False, f"Red-Team veto: {verdict.reason}")

    try:
        quote = provider.get_quote(ncs_row.ticker_symbol)
    except Exception as exc:  # noqa: BLE001 — a quote failure must never crash the autonomous loop
        return AutonomousDecision(account.id, False, f"Quote unavailable: {exc}")

    quote_age = (datetime.now(timezone.utc) - quote.timestamp).total_seconds()
    if quote_age > MAX_QUOTE_STALENESS_SECONDS:
        return AutonomousDecision(
            account.id, False, f"Quote is {quote_age:.0f}s stale (max {MAX_QUOTE_STALENESS_SECONDS}s) — refusing to fill.",
        )

    reference_price = quote.ask if quote.ask is not None else quote.last
    if reference_price <= 0:
        return AutonomousDecision(account.id, False, "Quote has no usable positive price.")

    stop_distance = abs(reference_price - analysis.stop_loss)
    if stop_distance <= 0:
        return AutonomousDecision(account.id, False, "Stop-loss distance is zero or invalid — cannot size a risk-based position.")

    from app.services.risk.policy import RiskPolicy

    policy = RiskPolicy.from_settings()
    risk_budget = account.cash_balance * (
        policy.max_position_risk_pct / 100.0 * AUTONOMOUS_RISK_BUDGET_FRACTION_OF_POLICY_MAX
    )
    quantity = risk_budget / stop_distance
    # Sizing by risk, not notional value, can still exceed available cash
    # for a tight stop on an expensive symbol — cap by cash too, same
    # constraint open_position() itself enforces.
    max_affordable = account.cash_balance / reference_price
    quantity = min(quantity, max_affordable)
    if quantity <= 0:
        return AutonomousDecision(account.id, False, "Computed order quantity is zero or negative.")

    try:
        position = engine.open_position(
            account.user_id, ncs_row.ticker_symbol, quantity, db, provider,
            opened_by="autonomous", ncs_signal_id=ncs_row.id,
        )
    except PaperTradingError as exc:
        return AutonomousDecision(account.id, False, f"Engine refused the order: {exc}")

    from app.services.dashboard.events import publish_dashboard_event

    publish_dashboard_event("autonomous.position_opened", {
        "user_id": account.user_id, "ticker_symbol": position.ticker_symbol,
        "quantity": position.quantity, "entry_price": position.avg_entry_price,
    })
    return AutonomousDecision(account.id, True, "Opened.", position=position)


def _close_reversed_positions(
    db: Session, account: PaperTradingAccount, ncs_row: NcsSignal, provider: MarketDataProvider,
) -> AutonomousDecision | None:
    position = (
        db.query(PaperPosition)
        .filter_by(
            account_id=account.id, ticker_symbol=ncs_row.ticker_symbol, status="open", opened_by="autonomous",
        )
        .one_or_none()
    )
    if position is None:
        return None
    try:
        closed = engine.close_position(account.user_id, position.id, db, provider)
    except PaperTradingError as exc:
        return AutonomousDecision(account.id, False, f"Reversal close refused: {exc}")

    from app.services.dashboard.events import publish_dashboard_event

    publish_dashboard_event("autonomous.position_closed", {
        "user_id": account.user_id, "ticker_symbol": closed.ticker_symbol,
        "realized_pnl_dollars": closed.realized_pnl_dollars, "reason": "ncs_reversal",
    })
    return AutonomousDecision(account.id, True, "Closed on NCS reversal.", position=closed)


def on_ncs_fired_autonomous(db: Session, ncs_row: NcsSignal, provider: MarketDataProvider) -> list[AutonomousDecision]:
    """Called once per newly-fired NCS row (mirrors
    services/shadow/engine.py's on_ncs_fired hook) — evaluates every
    opted-in account independently. Never raises: a provider/account
    failure for one account is recorded as a declined AutonomousDecision
    and never blocks any other account or the caller (evaluate_ncs).
    """
    if is_autonomous_trading_paused(db):
        return []

    bucket_is_buy = ncs_row.confirmed_verdict in _BUY_FAMILY
    bucket_is_sell = ncs_row.confirmed_verdict in _SELL_FAMILY
    if not (bucket_is_buy or bucket_is_sell):
        return []

    decisions: list[AutonomousDecision] = []
    for account in _eligible_accounts(db, ncs_row.ticker_symbol):
        if bucket_is_sell:
            decision = _close_reversed_positions(db, account, ncs_row, provider)
            if decision is not None:
                decisions.append(decision)
            continue
        try:
            decisions.append(_evaluate_entry_for_account(db, account, ncs_row, provider))
        except Exception as exc:  # noqa: BLE001 — one account's failure never blocks another's or the caller's
            decisions.append(AutonomousDecision(account.id, False, f"Unexpected error: {exc}"))
    return decisions
