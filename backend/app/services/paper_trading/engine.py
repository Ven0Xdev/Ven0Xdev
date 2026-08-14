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
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models.paper_trading import PaperPosition, PaperTradingAccount
from app.db.models.trade import Trade
from app.services.data_providers.base import MarketDataProvider, Quote
from app.services.risk.engine import evaluate_risk
from app.services.risk.policy import RiskPolicy
from app.services.scoring.scorer import analyze_ticker


class PaperTradingError(Exception):
    """Any refusal to execute — failed risk gate, insufficient funds, no
    such open position, invalid quantity. Always carries a plain-English
    reason; never silently swallowed."""


def get_or_create_account(user_id: int, db: Session) -> PaperTradingAccount:
    account = db.query(PaperTradingAccount).filter_by(user_id=user_id).one_or_none()
    if account is None:
        starting = get_settings().paper_trading_starting_balance
        account = PaperTradingAccount(user_id=user_id, cash_balance=starting, starting_balance=starting)
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
) -> PaperPosition:
    if quantity <= 0:
        raise PaperTradingError("Quantity must be positive.")
    symbol = symbol.upper()
    account = get_or_create_account(user_id, db)

    analysis = analyze_ticker(symbol, provider=provider)
    quote = provider.get_quote(symbol)
    fill_price = _fill_price(quote, "buy")
    cost = fill_price * quantity

    dollar_at_risk = quantity * abs(fill_price - analysis.stop_loss)
    position_risk_pct = (dollar_at_risk / account.cash_balance * 100) if account.cash_balance > 0 else 100.0

    verdict = evaluate_risk(analysis.confidence_score, analysis.expected_risk_reward, position_risk_pct)
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
    account = get_or_create_account(user_id, db)
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


def list_open_positions(user_id: int, db: Session) -> list[PaperPosition]:
    account = get_or_create_account(user_id, db)
    return (
        db.query(PaperPosition)
        .filter_by(account_id=account.id, status="open")
        .order_by(PaperPosition.opened_at.desc())
        .all()
    )


def list_closed_positions(user_id: int, db: Session, limit: int = 100) -> list[PaperPosition]:
    account = get_or_create_account(user_id, db)
    return (
        db.query(PaperPosition)
        .filter_by(account_id=account.id, status="closed")
        .order_by(PaperPosition.closed_at.desc())
        .limit(limit)
        .all()
    )
