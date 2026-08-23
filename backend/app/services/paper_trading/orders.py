"""Order-lifecycle layer on top of services/paper_trading/engine.py — the
Chart Order Ticket's backend. NEXORA INTERNAL PAPER only; never wired to a
real broker. This module never bypasses the engine's own risk gate/cash
check/Safe-Mode enforcement — every fill still goes through
engine.open_position()/close_position() exactly as a manual "Buy"/"Close"
click already did. What this module adds is the order *envelope* around
that: an honest lifecycle (pending/accepted/filled/rejected/cancelled/...),
resting limit/stop orders that only ever fill from a FUTURE eligible quote
(app/workers/order_scheduler.py), OCO take-profit/stop-loss brackets, and
idempotency.

Long-only: a "sell" order can only reduce or close an existing open
position — it is validated against a real position before anything is
created, and can never open a short.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models.paper_order import PaperOrder
from app.db.models.paper_trading import PaperPosition
from app.services.data_providers.base import MarketDataProvider
from app.services.paper_trading import engine
from app.services.paper_trading.engine import PaperTradingError

# A resting limit/stop order stops being eligible to fill once its
# reference quote is older than this — the same discipline
# autonomous.py's MAX_QUOTE_STALENESS_SECONDS applies to autonomous
# entries, duplicated here (not imported) so this module has no
# dependency on the autonomous-trading subsystem at all.
MAX_QUOTE_STALENESS_SECONDS = 300


class OrderError(Exception):
    """A submission/cancellation that could never succeed — bad input,
    ownership violation, no such order. Distinct from a "rejected" order
    (which IS created, just with status=rejected and a reason) — this is
    for requests that never produce a valid order record at all."""


def _new_order(
    account_id: int, symbol: str, side: str, order_type: str, quantity: float, idempotency_key: str, origin: str,
    *, limit_price: float | None = None, stop_price: float | None = None,
    bracket_take_profit: float | None = None, bracket_stop_loss: float | None = None,
    position_id: int | None = None, oco_group_id: str | None = None, ncs_signal_id: int | None = None,
    regular_hours_only: bool = False, provider: MarketDataProvider | None = None,
) -> PaperOrder:
    return PaperOrder(
        account_id=account_id, ticker_symbol=symbol.upper(), side=side, order_type=order_type, quantity=quantity,
        limit_price=limit_price, stop_price=stop_price,
        bracket_take_profit=bracket_take_profit, bracket_stop_loss=bracket_stop_loss,
        status="pending", regular_hours_only=regular_hours_only, idempotency_key=idempotency_key, origin=origin,
        position_id=position_id, oco_group_id=oco_group_id, ncs_signal_id=ncs_signal_id,
        data_source=getattr(provider, "name", "unknown"), data_mode=getattr(provider, "data_mode", "unspecified"),
    )


def _resolve_sell_position(db: Session, account_id: int, symbol: str, quantity: float, position_id: int | None) -> PaperPosition:
    """Long-only validation: a sell must name (or unambiguously imply) a
    real, currently-open position on this account with exactly this
    quantity — engine.close_position() only supports a full close, so a
    quantity mismatch is refused rather than silently adjusted."""
    if position_id is not None:
        position = (
            db.query(PaperPosition)
            .filter_by(id=position_id, account_id=account_id, status="open", ticker_symbol=symbol.upper())
            .one_or_none()
        )
        if position is None:
            raise OrderError("No open position with that id on this account for this ticker.")
    else:
        candidates = (
            db.query(PaperPosition).filter_by(account_id=account_id, status="open", ticker_symbol=symbol.upper()).all()
        )
        if not candidates:
            raise OrderError(
                f"No open position in {symbol.upper()} — NEXORA is long-only paper trading; "
                f"short selling is not available."
            )
        if len(candidates) > 1:
            raise OrderError(f"Multiple open positions in {symbol.upper()} — specify which one to close.")
        position = candidates[0]
    if abs(quantity - position.quantity) > 1e-9:
        raise OrderError(
            f"Partial closes are not supported — quantity must exactly match the open position's "
            f"{position.quantity:g} shares."
        )
    return position


def submit_order(
    user_id: int,
    db: Session,
    provider: MarketDataProvider,
    *,
    symbol: str,
    side: str,
    order_type: str,
    quantity: float,
    idempotency_key: str,
    limit_price: float | None = None,
    stop_price: float | None = None,
    take_profit: float | None = None,
    stop_loss: float | None = None,
    regular_hours_only: bool = False,
    position_id: int | None = None,
    origin: str = "manual",
    ncs_signal_id: int | None = None,
) -> PaperOrder:
    if side not in ("buy", "sell"):
        raise OrderError("side must be 'buy' or 'sell'.")
    if order_type not in ("market", "limit", "stop"):
        raise OrderError("order_type must be 'market', 'limit', or 'stop'.")
    if quantity <= 0:
        raise OrderError("Quantity must be positive.")
    if order_type == "limit" and limit_price is None:
        raise OrderError("A limit order requires limit_price.")
    if order_type == "stop" and stop_price is None:
        raise OrderError("A stop order requires stop_price.")
    if side == "sell" and (take_profit is not None or stop_loss is not None):
        raise OrderError("A bracket (take-profit/stop-loss) is only valid on a buy/entry order.")

    account = engine.get_active_account(user_id, db)
    if account is None:
        raise OrderError("No active paper simulation — start one from the Paper Trading page first.")

    existing = db.query(PaperOrder).filter_by(account_id=account.id, idempotency_key=idempotency_key).one_or_none()
    if existing is not None:
        return existing  # same submission retried — the original order, never a second one

    symbol = symbol.upper()
    sell_position: PaperPosition | None = None
    if side == "sell":
        sell_position = _resolve_sell_position(db, account.id, symbol, quantity, position_id)

    order = _new_order(
        account.id, symbol, side, order_type, quantity, idempotency_key, origin,
        limit_price=limit_price, stop_price=stop_price,
        bracket_take_profit=take_profit if side == "buy" else None,
        bracket_stop_loss=stop_loss if side == "buy" else None,
        position_id=sell_position.id if sell_position else None,
        ncs_signal_id=ncs_signal_id, regular_hours_only=regular_hours_only, provider=provider,
    )

    if order_type != "market":
        # Resting order — order_scheduler.py fills it from a future quote.
        db.add(order)
        db.commit()
        db.refresh(order)
        return order

    # Market order — resolves synchronously, right now, against the
    # engine's own current-quote fill logic (spread-aware, Safe-Mode-
    # gated for buys). The PaperOrder row is the audit record of what
    # happened, not a second decision-maker.
    order.status = "accepted"
    try:
        if side == "buy":
            position = engine.open_position(
                user_id, symbol, quantity, db, provider, opened_by=origin, ncs_signal_id=ncs_signal_id,
            )
            _fill(order, position, position.avg_entry_price)
            if take_profit is not None or stop_loss is not None:
                _spawn_bracket(db, account.id, position, take_profit, stop_loss, origin, provider)
        else:
            assert sell_position is not None
            position = engine.close_position(user_id, sell_position.id, db, provider)
            _fill(order, position, position.exit_price or position.avg_entry_price)
            _cancel_open_brackets_for_position(db, sell_position.id, "Position closed.")
    except PaperTradingError as exc:
        order.status = "rejected"
        order.rejected_reason = str(exc)

    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _fill(order: PaperOrder, position: PaperPosition, price: float) -> None:
    order.status = "filled"
    order.filled_at = datetime.now(timezone.utc)
    order.filled_price = price
    order.position_id = position.id


def _spawn_bracket(
    db: Session, account_id: int, position: PaperPosition, take_profit: float | None, stop_loss: float | None,
    origin: str, provider: MarketDataProvider,
) -> None:
    """Creates the take_profit/stop_loss child orders for a just-filled
    entry — a real OCO pair sharing oco_group_id. order_scheduler.py
    cancels the sibling the instant either one fills."""
    if take_profit is None and stop_loss is None:
        return
    group_id = str(uuid.uuid4())
    if take_profit is not None:
        db.add(_new_order(
            account_id, position.ticker_symbol, "sell", "take_profit", position.quantity,
            f"{group_id}:tp", origin, limit_price=take_profit, position_id=position.id,
            oco_group_id=group_id, provider=provider,
        ))
    if stop_loss is not None:
        db.add(_new_order(
            account_id, position.ticker_symbol, "sell", "stop_loss", position.quantity,
            f"{group_id}:sl", origin, stop_price=stop_loss, position_id=position.id,
            oco_group_id=group_id, provider=provider,
        ))
    db.commit()


def _cancel_open_brackets_for_position(db: Session, position_id: int, reason: str) -> None:
    pending = db.query(PaperOrder).filter_by(position_id=position_id, status="pending").all()
    for o in pending:
        o.status = "cancelled"
        o.cancelled_reason = reason
    if pending:
        db.commit()


def cancel_order(user_id: int, db: Session, order_id: int) -> PaperOrder:
    account = engine.get_active_account(user_id, db)
    if account is None:
        raise OrderError("No active paper simulation.")
    order = db.query(PaperOrder).filter_by(id=order_id, account_id=account.id).one_or_none()
    if order is None:
        raise OrderError("No such order on this account.")
    if order.status != "pending":
        raise OrderError(f"Only a pending order can be cancelled (this one is {order.status}).")
    order.status = "cancelled"
    order.cancelled_reason = "Cancelled by user."
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def list_orders(user_id: int, db: Session, status: str | None = None) -> list[PaperOrder]:
    account = engine.get_active_account(user_id, db)
    if account is None:
        return []
    query = db.query(PaperOrder).filter_by(account_id=account.id)
    if status:
        query = query.filter_by(status=status)
    return query.order_by(PaperOrder.created_at.desc()).all()
