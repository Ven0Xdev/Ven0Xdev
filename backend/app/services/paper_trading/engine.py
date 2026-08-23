"""Paper Trading execution engine — the platform's ONLY trading execution
mode. No real-money broker integration exists or is planned; this module
must never be wired to one.

Every open reuses the exact same deterministic risk gate
(services/risk/engine.py's evaluate_risk) the scanner and Signal Engine
already enforce for POSSIBLE_ENTRY — including the platform-wide Safe Mode
kill switch — so a paper trade can never be opened on a setup the
platform's own analysis would flag as NO_TRADE/AVOID. It is also the
first real caller of evaluate_risk()'s optional `position_risk_pct` check
(every other caller only has a candidate, not a sized order yet).

Fill pricing: a market buy fills at the current best ask, a market
sell/close fills at the current best bid — the real cost of crossing the
spread, not a "trades happen for free at the last traded price" fiction.
When the active provider doesn't supply bid/ask depth (Quote.bid/.ask are
None — some vendors' free tiers), the fill honestly uses `last` instead of
inventing a spread.

No shorting, no margin, no fees in this version — cash-only long
positions; a position can never cost more than the account's current cash
balance. Automatic stop-loss/take-profit-triggered closing is deferred to
Phase 7 (which builds the periodic outcome-evaluation job this would
otherwise duplicate) — this version closes only on an explicit user
action, honestly reflected in `planned_stop_loss`/`planned_take_profit`
being informational only, not enforced.

Simulations: a user's paper trading history is a sequence of
`PaperTradingAccount` rows ("simulations"), at most one `is_active` at a
time (see the model's partial unique index). There is no implicit
auto-created account with a hardcoded starting balance any more — a user
explicitly starts each simulation with a manually chosen amount via
`start_new_simulation`. `get_active_account` simply looks up whichever
simulation is currently active and returns `None` if the user has never
started one; every position-mutating call site below must handle that
`None` explicitly rather than silently materializing one.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.paper_trading import PaperPosition, PaperTradingAccount
from app.db.models.trade import Trade
from app.services.data_providers.base import MarketDataProvider, Quote
from app.services.risk.engine import evaluate_risk
from app.services.risk.policy import RiskPolicy
from app.services.scoring.scorer import analyze_ticker

# Server-side sanity bounds on a manually-entered starting capital — wide
# enough to never get in a real user's way, narrow enough to catch an
# obvious fat-fingered entry (e.g. a stray extra zero) before it silently
# distorts every risk-limit calculation derived from equity.
MIN_STARTING_CAPITAL = 100.0
MAX_STARTING_CAPITAL = 10_000_000.0


class PaperTradingError(Exception):
    """Any refusal to execute — failed risk gate, insufficient funds, no
    such open position, invalid quantity, no active simulation. Always
    carries a plain-English reason; never silently swallowed."""


def get_active_account(user_id: int, db: Session) -> PaperTradingAccount | None:
    """The user's current simulation, or None if they've never started
    one. Never auto-creates — starting a simulation is always an explicit
    action with a manually chosen amount (see `start_new_simulation`)."""
    return db.query(PaperTradingAccount).filter_by(user_id=user_id, is_active=True).one_or_none()


def list_simulations(user_id: int, db: Session) -> list[PaperTradingAccount]:
    """Every simulation (active and archived) for this user, newest first
    — the "Paper Simulations History" panel's data source. History is
    never deleted, only archived."""
    return (
        db.query(PaperTradingAccount)
        .filter_by(user_id=user_id)
        .order_by(PaperTradingAccount.simulation_number.desc())
        .all()
    )


def start_new_simulation(user_id: int, starting_capital: float, db: Session, label: str | None = None) -> PaperTradingAccount:
    """Archives the current active simulation (if any) and starts a new
    one with a manually chosen starting capital. Refuses if the current
    simulation has open positions — those must be closed first, so no
    simulation's outcome is ever left ambiguous mid-position. Cash and
    equity both start exactly at `starting_capital`; realized/unrealized
    P&L reset to zero simply because the new simulation's positions table
    starts empty. Every risk-limit/position-size calculation downstream
    already reads `account.cash_balance` live (see `open_position` below),
    so nothing separate needs to "recalculate" against the new equity —
    it's automatic the moment this new account becomes active.
    """
    if starting_capital != starting_capital or starting_capital in (float("inf"), float("-inf")):
        raise PaperTradingError("Starting capital must be a real, finite number.")
    if starting_capital < MIN_STARTING_CAPITAL or starting_capital > MAX_STARTING_CAPITAL:
        raise PaperTradingError(
            f"Starting capital must be between ${MIN_STARTING_CAPITAL:,.0f} and ${MAX_STARTING_CAPITAL:,.0f}."
        )

    current = get_active_account(user_id, db)
    next_number = 1
    if current is not None:
        open_count = db.query(PaperPosition).filter_by(account_id=current.id, status="open").count()
        if open_count > 0:
            raise PaperTradingError(
                f"You have {open_count} open paper position(s) in the current simulation — close them all "
                "before starting a new one."
            )
        next_number = current.simulation_number + 1
        current.is_active = False
        current.archived_at = datetime.now(timezone.utc)
        db.add(current)
        db.flush()  # release the partial-unique-index slot before inserting the new active row

    account = PaperTradingAccount(
        user_id=user_id,
        simulation_number=next_number,
        label=label,
        cash_balance=starting_capital,
        starting_balance=starting_capital,
        is_active=True,
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        # The partial unique index caught a race (e.g. a double-click
        # double-submit) — never silently create two active simulations.
        db.rollback()
        raise PaperTradingError("A new simulation could not be started — please retry.") from exc
    db.refresh(account)
    return account


def set_autonomous_trading_enabled(user_id: int, enabled: bool, db: Session) -> PaperTradingAccount:
    """Explicit per-simulation opt-in/out for autonomous trading (see
    services/paper_trading/autonomous.py) — never flips silently, never
    carries over to a future simulation (start_new_simulation always
    creates a fresh row defaulting this back to False)."""
    account = get_active_account(user_id, db)
    if account is None:
        raise PaperTradingError("No active paper simulation — start one from the Paper Trading page first.")
    account.autonomous_trading_enabled = enabled
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _fill_price(quote: Quote, side: str) -> float:
    if side == "buy":
        return quote.ask if quote.ask is not None else quote.last
    return quote.bid if quote.bid is not None else quote.last


def open_position(
    user_id: int,
    symbol: str,
    quantity: float,
    db: Session,
    provider: MarketDataProvider,
    opened_by: str = "manual",
    ncs_signal_id: int | None = None,
) -> PaperPosition:
    if quantity <= 0:
        raise PaperTradingError("Quantity must be positive.")
    symbol = symbol.upper()
    account = get_active_account(user_id, db)
    if account is None:
        raise PaperTradingError("No active paper simulation — start one from the Paper Trading page first.")

    analysis = analyze_ticker(symbol, provider=provider)
    quote = provider.get_quote(symbol)
    fill_price = _fill_price(quote, "buy")
    cost = fill_price * quantity

    dollar_at_risk = quantity * abs(fill_price - analysis.stop_loss)
    position_risk_pct = (dollar_at_risk / account.cash_balance * 100) if account.cash_balance > 0 else 100.0

    verdict = evaluate_risk(analysis.confidence_score, analysis.expected_risk_reward, position_risk_pct, db=db)
    if not verdict.passed:
        raise PaperTradingError(f"Paper trade refused by the risk gate: {'; '.join(verdict.reasons)}")

    if cost > account.cash_balance:
        raise PaperTradingError(
            f"Insufficient paper cash: order costs ${cost:,.2f}, account has ${account.cash_balance:,.2f} available."
        )

    policy = RiskPolicy.from_settings()
    now = datetime.now(timezone.utc)
    position = PaperPosition(
        account_id=account.id,
        ticker_symbol=symbol,
        quantity=quantity,
        avg_entry_price=fill_price,
        opened_at=now,
        status="open",
        entry_confidence_pct=analysis.confidence_score,
        entry_risk_reward=analysis.expected_risk_reward,
        planned_stop_loss=analysis.stop_loss,
        planned_take_profit=analysis.take_profit_1,
        risk_policy_version=policy.version,
        entry_data_source=provider.name,
        entry_data_mode=getattr(provider, "data_mode", "unspecified"),
        opened_by=opened_by,
        ncs_signal_id=ncs_signal_id,
    )
    account.cash_balance -= cost
    db.add(position)
    db.add(account)
    db.commit()
    db.refresh(position)

    db.add(
        Trade(
            ticker_symbol=symbol,
            side="buy",
            quantity=quantity,
            price=fill_price,
            executed_at=now,
            status="filled",
            account_id=account.id,
            position_id=position.id,
            data_source=provider.name,
            data_mode=getattr(provider, "data_mode", "unspecified"),
        )
    )
    db.commit()
    return position


def close_position(
    user_id: int,
    position_id: int,
    db: Session,
    provider: MarketDataProvider,
) -> PaperPosition:
    account = get_active_account(user_id, db)
    if account is None:
        raise PaperTradingError("No active paper simulation — start one from the Paper Trading page first.")
    position = (
        db.query(PaperPosition).filter_by(id=position_id, account_id=account.id, status="open").one_or_none()
    )
    if position is None:
        raise PaperTradingError("No open paper position found with that id for this account.")

    quote = provider.get_quote(position.ticker_symbol)
    fill_price = _fill_price(quote, "sell")
    proceeds = fill_price * position.quantity
    realized = proceeds - (position.avg_entry_price * position.quantity)

    now = datetime.now(timezone.utc)
    position.status = "closed"
    position.closed_at = now
    position.exit_price = fill_price
    position.realized_pnl_dollars = realized
    account.cash_balance += proceeds
    db.add(position)
    db.add(account)
    db.commit()
    db.refresh(position)

    db.add(
        Trade(
            ticker_symbol=position.ticker_symbol,
            side="sell",
            quantity=position.quantity,
            price=fill_price,
            executed_at=now,
            status="filled",
            account_id=account.id,
            position_id=position.id,
            data_source=provider.name,
            data_mode=getattr(provider, "data_mode", "unspecified"),
        )
    )
    db.commit()
    return position


def list_open_positions_for_account(account: PaperTradingAccount, db: Session) -> list[PaperPosition]:
    """Same query as `list_open_positions`, but for a specific already-
    resolved account rather than looking one up by user_id — used by the
    account-summary endpoint, which already has the account row in hand
    and needs its open positions to mark-to-market equity."""
    return (
        db.query(PaperPosition)
        .filter_by(account_id=account.id, status="open")
        .order_by(PaperPosition.opened_at.desc())
        .all()
    )


def list_open_positions(user_id: int, db: Session) -> list[PaperPosition]:
    account = get_active_account(user_id, db)
    if account is None:
        return []
    return list_open_positions_for_account(account, db)


def list_closed_positions(user_id: int, db: Session, limit: int = 100) -> list[PaperPosition]:
    account = get_active_account(user_id, db)
    if account is None:
        return []
    return (
        db.query(PaperPosition)
        .filter_by(account_id=account.id, status="closed")
        .order_by(PaperPosition.closed_at.desc())
        .limit(limit)
        .all()
    )
