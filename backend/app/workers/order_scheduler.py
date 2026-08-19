"""Resting-order trigger sweep — the only code path that ever fills a
limit/stop/take_profit/stop_loss PaperOrder. Runs continuously so a
resting order can only ever fill from a FUTURE eligible quote, never at
submission time (see services/paper_trading/orders.py's module
docstring). NEXORA INTERNAL PAPER only.

Every fill re-runs through engine.open_position()/close_position() —
Safe Mode, the risk gate, and available cash are re-checked at trigger
time, not just at order submission, exactly matching what a market order
already gets. A resting order submitted while Safe Mode was off can still
be legitimately refused (order marked rejected) if Safe Mode is on by the
time its price is actually touched.

Run via: `python -m app.workers.order_scheduler`. Runs by default —
resting orders are core Paper Trading behavior, not an optional module.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import SessionLocal
from app.db.session import engine as db_engine

logger = logging.getLogger(__name__)

ORDER_SWEEP_INTERVAL_SECONDS = 15


def _triggered(order, quote) -> bool:
    from app.services.paper_trading.orders import MAX_QUOTE_STALENESS_SECONDS

    age = (datetime.now(timezone.utc) - quote.timestamp).total_seconds()
    if age > MAX_QUOTE_STALENESS_SECONDS:
        return False
    ask = quote.ask if quote.ask is not None else quote.last
    bid = quote.bid if quote.bid is not None else quote.last

    if order.order_type == "limit":
        return ask <= order.limit_price if order.side == "buy" else bid >= order.limit_price
    if order.order_type == "stop":
        return ask >= order.stop_price if order.side == "buy" else bid <= order.stop_price
    if order.order_type == "take_profit":
        return bid >= order.limit_price
    if order.order_type == "stop_loss":
        return bid <= order.stop_price
    return False


def run_order_sweep(provider=None, db=None) -> int:
    """One pass over every pending order platform-wide. Returns the
    number filled. Accepts an optional provider/db (mirroring every
    other worker in this codebase) so tests can inject a scripted
    provider and the test-isolated db_session fixture."""
    from app.db.models.paper_order import PaperOrder
    from app.db.models.paper_trading import PaperTradingAccount
    from app.services.data_providers.factory import get_data_provider
    from app.services.market_overview import market_status
    from app.services.paper_trading import engine as paper_engine
    from app.services.paper_trading.engine import PaperTradingError
    from app.services.paper_trading.orders import _cancel_open_brackets_for_position, _fill, _spawn_bracket

    provider = provider or get_data_provider()
    owns_session = db is None
    db = db or SessionLocal()
    filled = 0
    try:
        pending = db.query(PaperOrder).filter_by(status="pending").order_by(PaperOrder.created_at.asc()).all()
        for order in pending:
            if order.regular_hours_only and market_status() != "open":
                continue
            try:
                quote = provider.get_quote(order.ticker_symbol)
            except Exception:
                continue  # provider hiccup this cycle — stays pending, tried again next sweep
            if not _triggered(order, quote):
                continue

            account = db.query(PaperTradingAccount).filter_by(id=order.account_id).one_or_none()
            if account is None or not account.is_active:
                order.status = "cancelled"
                order.cancelled_reason = "Simulation is no longer active."
                db.commit()
                continue

            try:
                if order.side == "buy":
                    position = paper_engine.open_position(
                        account.user_id, order.ticker_symbol, order.quantity, db, provider,
                        opened_by=order.origin, ncs_signal_id=order.ncs_signal_id,
                    )
                    _fill(order, position, position.avg_entry_price)
                    if order.bracket_take_profit is not None or order.bracket_stop_loss is not None:
                        _spawn_bracket(
                            db, account.id, position, order.bracket_take_profit, order.bracket_stop_loss,
                            order.origin, provider,
                        )
                else:
                    position = paper_engine.close_position(account.user_id, order.position_id, db, provider)
                    _fill(order, position, position.exit_price or position.avg_entry_price)
                    if order.order_type in ("take_profit", "stop_loss") and order.oco_group_id:
                        _cancel_oco_sibling(db, order)
                    else:
                        _cancel_open_brackets_for_position(db, order.position_id, "Position closed.")
                filled += 1
            except PaperTradingError as exc:
                order.status = "rejected"
                order.rejected_reason = str(exc)
            db.add(order)
            db.commit()
    finally:
        if owns_session:
            db.close()
    return filled


def _cancel_oco_sibling(db, order) -> None:
    from app.db.models.paper_order import PaperOrder

    sibling = (
        db.query(PaperOrder)
        .filter(PaperOrder.oco_group_id == order.oco_group_id, PaperOrder.id != order.id, PaperOrder.status == "pending")
        .one_or_none()
    )
    if sibling is not None:
        sibling.status = "cancelled"
        sibling.cancelled_reason = f"OCO: sibling order {order.id} filled."
        db.add(sibling)


def main() -> None:
    configure_logging("INFO")
    settings = get_settings()

    if settings.sqlalchemy_url.startswith("sqlite"):
        Base.metadata.create_all(bind=db_engine)

    logger.info("Starting order scheduler, interval=%ss", ORDER_SWEEP_INTERVAL_SECONDS)
    while True:
        started = time.monotonic()
        try:
            filled = run_order_sweep()
            if filled:
                logger.info("Order sweep: %d order(s) filled/triggered", filled)
        except Exception:
            logger.exception("Order sweep failed")
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, ORDER_SWEEP_INTERVAL_SECONDS - elapsed))


if __name__ == "__main__":
    main()
