"""services/paper_trading/orders.py + app/workers/order_scheduler.py — the
Chart Order Ticket's backend. NEXORA INTERNAL PAPER only. Reuses the same
deterministic fixture symbols as test_paper_trading.py.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.db.models.paper_order import PaperOrder
from app.db.models.trade import Trade
from app.services.data_providers.base import Quote
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.paper_trading import engine
from app.services.paper_trading.orders import OrderError, cancel_order, list_orders, submit_order
from app.workers.order_scheduler import run_order_sweep

PASSES_RISK_GATE = "BLKM"


class _QuoteOverrideProvider(MockOTCProvider):
    """Real mock OHLCV/analysis (so the risk gate, stop-loss, etc. all
    behave exactly like the deterministic fixture symbols already used
    elsewhere), with a precisely controllable top-of-book quote — the
    only way to deterministically test "did this limit/stop order trigger
    at exactly this price," which the seeded-random mock quote can't do."""

    def __init__(self, bid: float, ask: float, stale_seconds: float = 0.0):
        super().__init__()
        self.bid = bid
        self.ask = ask
        self.stale_seconds = stale_seconds

    def get_quote(self, symbol: str) -> Quote:
        return Quote(
            symbol=symbol.upper(), last=(self.bid + self.ask) / 2, bid=self.bid, ask=self.ask,
            timestamp=datetime.now(timezone.utc) - timedelta(seconds=self.stale_seconds),
        )


def _account(db, user_id=301, cash=100_000.0):
    return engine.start_new_simulation(user_id, cash, db)


def _key() -> str:
    import uuid

    return str(uuid.uuid4())


# ---------- market orders --------------------------------------------------


def test_market_buy_fills_immediately_and_creates_a_real_position_and_trade(db_session):
    _account(db_session, user_id=301)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)

    order = submit_order(
        301, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=_key(),
    )

    assert order.status == "filled"
    assert order.filled_price == 10.0  # market buy fills at the ask
    assert order.position_id is not None
    trades = db_session.query(Trade).filter_by(account_id=order.account_id).all()
    assert len(trades) == 1
    assert trades[0].side == "buy"


def test_market_sell_with_no_open_position_is_refused_never_opens_a_short(db_session):
    _account(db_session, user_id=302)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)

    with pytest.raises(OrderError, match="long-only"):
        submit_order(
            302, db_session, provider, symbol=PASSES_RISK_GATE, side="sell", order_type="market",
            quantity=10, idempotency_key=_key(),
        )
    assert engine.list_open_positions(302, db_session) == []


def test_market_sell_closes_the_exact_named_position(db_session):
    _account(db_session, user_id=303)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)
    buy = submit_order(
        303, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=_key(),
    )

    sell = submit_order(
        303, db_session, provider, symbol=PASSES_RISK_GATE, side="sell", order_type="market",
        quantity=10, idempotency_key=_key(), position_id=buy.position_id,
    )

    assert sell.status == "filled"
    assert sell.filled_price == 9.9  # market sell fills at the bid
    assert engine.list_open_positions(303, db_session) == []


def test_insufficient_cash_produces_a_rejected_order_not_an_exception(db_session, monkeypatch):
    # Same isolation trick test_paper_trading.py's own insufficient-cash
    # test uses: lift the risk-per-trade ceiling so only the cash check
    # can bind, not the risk gate (a small account "at risk" a large
    # fraction of itself would otherwise fail on that gate first).
    from app.core.config import get_settings

    permissive = get_settings().model_copy(update={"risk_max_portfolio_risk_per_trade_pct": 1_000_000.0})
    monkeypatch.setattr("app.services.risk.engine.get_settings", lambda: permissive)

    _account(db_session, user_id=304, cash=100.0)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)

    order = submit_order(
        304, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=1000, idempotency_key=_key(),  # costs $10,000 — far more than the $100 account
    )

    assert order.status == "rejected"
    assert "insufficient" in order.rejected_reason.lower()


def test_safe_mode_rejects_a_market_buy_order(db_session):
    from app.services.platform_settings import set_safe_mode_override

    class _FakeOperator:
        id = 998

    set_safe_mode_override(db_session, True, _FakeOperator())
    _account(db_session, user_id=305)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)

    order = submit_order(
        305, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=_key(),
    )

    assert order.status == "rejected"
    assert "safe mode" in order.rejected_reason.lower()
    set_safe_mode_override(db_session, None, _FakeOperator())


# ---------- idempotency -----------------------------------------------------


def test_resubmitting_the_same_idempotency_key_returns_the_original_order(db_session):
    _account(db_session, user_id=306)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)
    key = _key()

    first = submit_order(
        306, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=key,
    )
    second = submit_order(
        306, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=key,
    )

    assert first.id == second.id
    assert len(engine.list_open_positions(306, db_session)) == 1
    assert db_session.query(Trade).filter_by(account_id=first.account_id).count() == 1


# ---------- limit/stop orders: pending, fill only from a future quote ------


def test_a_limit_order_never_fills_at_submission_even_if_already_marketable(db_session):
    _account(db_session, user_id=307)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)

    order = submit_order(
        307, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="limit",
        quantity=10, idempotency_key=_key(), limit_price=50.0,  # already satisfied by ask=10.0
    )

    assert order.status == "pending"
    assert engine.list_open_positions(307, db_session) == []


def test_order_sweep_fills_a_pending_limit_buy_once_the_ask_reaches_it(db_session):
    _account(db_session, user_id=308)
    provider = _QuoteOverrideProvider(bid=14.9, ask=15.0)
    order = submit_order(
        308, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="limit",
        quantity=10, idempotency_key=_key(), limit_price=20.0,
    )
    assert order.status == "pending"

    filled = run_order_sweep(provider=provider, db=db_session)

    assert filled == 1
    db_session.refresh(order)
    assert order.status == "filled"
    assert order.filled_price == 15.0
    assert len(engine.list_open_positions(308, db_session)) == 1


def test_order_sweep_leaves_a_limit_order_pending_when_price_has_not_arrived(db_session):
    _account(db_session, user_id=309)
    provider = _QuoteOverrideProvider(bid=99.9, ask=100.0)
    order = submit_order(
        309, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="limit",
        quantity=10, idempotency_key=_key(), limit_price=20.0,  # ask (100) is nowhere near the limit
    )

    filled = run_order_sweep(provider=provider, db=db_session)

    assert filled == 0
    db_session.refresh(order)
    assert order.status == "pending"


def test_order_sweep_never_fills_from_a_stale_quote(db_session):
    _account(db_session, user_id=310)
    provider = _QuoteOverrideProvider(bid=14.9, ask=15.0, stale_seconds=600)  # older than MAX_QUOTE_STALENESS_SECONDS
    order = submit_order(
        310, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="limit",
        quantity=10, idempotency_key=_key(), limit_price=20.0,
    )

    filled = run_order_sweep(provider=provider, db=db_session)

    assert filled == 0
    db_session.refresh(order)
    assert order.status == "pending"


def test_a_stop_buy_order_triggers_when_the_ask_rises_to_it(db_session):
    _account(db_session, user_id=311)
    provider = _QuoteOverrideProvider(bid=19.9, ask=20.0)
    order = submit_order(
        311, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="stop",
        quantity=10, idempotency_key=_key(), stop_price=20.0,
    )

    filled = run_order_sweep(provider=provider, db=db_session)

    assert filled == 1
    db_session.refresh(order)
    assert order.status == "filled"


# ---------- OCO bracket ------------------------------------------------------


def test_take_profit_and_stop_loss_form_a_real_oco_pair(db_session):
    _account(db_session, user_id=312)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)

    entry = submit_order(
        312, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=_key(), take_profit=15.0, stop_loss=8.0,
    )
    assert entry.status == "filled"

    children = db_session.query(PaperOrder).filter_by(position_id=entry.position_id).all()
    tp = next(c for c in children if c.order_type == "take_profit")
    sl = next(c for c in children if c.order_type == "stop_loss")
    assert tp.status == "pending" and sl.status == "pending"
    assert tp.oco_group_id == sl.oco_group_id

    # Price rallies to the take-profit level — the sweep must fill TP and
    # cancel the still-pending SL as its OCO sibling, never leave both live.
    rally_provider = _QuoteOverrideProvider(bid=15.0, ask=15.1)
    filled = run_order_sweep(provider=rally_provider, db=db_session)

    assert filled == 1
    db_session.refresh(tp)
    db_session.refresh(sl)
    assert tp.status == "filled"
    assert sl.status == "cancelled"
    assert "oco" in sl.cancelled_reason.lower()
    assert engine.list_open_positions(312, db_session) == []


# ---------- cancellation -----------------------------------------------------


def test_cancelling_a_pending_order_stops_it_from_ever_filling(db_session):
    _account(db_session, user_id=313)
    provider = _QuoteOverrideProvider(bid=14.9, ask=15.0)
    order = submit_order(
        313, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="limit",
        quantity=10, idempotency_key=_key(), limit_price=20.0,
    )

    cancelled = cancel_order(313, db_session, order.id)
    assert cancelled.status == "cancelled"

    filled = run_order_sweep(provider=provider, db=db_session)
    assert filled == 0


def test_cannot_cancel_an_already_filled_order(db_session):
    _account(db_session, user_id=314)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)
    order = submit_order(
        314, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=_key(),
    )

    with pytest.raises(OrderError, match="pending"):
        cancel_order(314, db_session, order.id)


def test_list_orders_scopes_to_the_requesting_users_own_account(db_session):
    _account(db_session, user_id=315)
    _account(db_session, user_id=316)
    provider = _QuoteOverrideProvider(bid=9.9, ask=10.0)
    submit_order(
        315, db_session, provider, symbol=PASSES_RISK_GATE, side="buy", order_type="market",
        quantity=10, idempotency_key=_key(),
    )

    assert len(list_orders(315, db_session)) == 1
    assert len(list_orders(316, db_session)) == 0


# ---------- API layer ---------------------------------------------------


@pytest.fixture
def auth_on():
    """Same isolation trick test_paper_trading.py's own fixture of this
    name uses — flips AUTH_REQUIRED so each API test below registers its
    own distinct user rather than sharing the dev-mode default principal."""
    from app.core.config import get_settings

    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    yield settings
    settings.auth_required = original


def _register(client, email: str) -> str:
    res = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert res.status_code == 201, res.text
    return res.json()["access_token"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_order_ticket_api_full_flow(client, auth_on):
    token = _register(client, "order-ticket@example.com")
    headers = _auth_header(token)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 10_000}, headers=headers)

    submit_res = client.post(
        "/api/v1/paper-trading/orders",
        json={
            "ticker_symbol": PASSES_RISK_GATE, "side": "buy", "order_type": "market",
            "quantity": 2, "idempotency_key": "test-key-1",
        },
        headers=headers,
    )
    assert submit_res.status_code == 200, submit_res.text
    order = submit_res.json()
    assert order["status"] == "filled"
    assert order["origin"] == "manual"

    listed = client.get("/api/v1/paper-trading/orders", headers=headers).json()
    assert any(o["id"] == order["id"] for o in listed)

    trades = client.get("/api/v1/paper-trading/trades", headers=headers).json()
    assert any(t["side"] == "buy" for t in trades)


def test_order_ticket_api_rejects_a_sell_with_no_position(client, auth_on):
    token = _register(client, "order-ticket-sell@example.com")
    headers = _auth_header(token)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 10_000}, headers=headers)

    res = client.post(
        "/api/v1/paper-trading/orders",
        json={
            "ticker_symbol": PASSES_RISK_GATE, "side": "sell", "order_type": "market",
            "quantity": 1, "idempotency_key": "test-key-2",
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert "long-only" in res.json()["detail"].lower()


def test_order_ticket_api_cannot_see_or_cancel_another_users_order(client, auth_on):
    token_a = _register(client, "order-owner-a@example.com")
    token_b = _register(client, "order-owner-b@example.com")
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 10_000}, headers=_auth_header(token_a))
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 10_000}, headers=_auth_header(token_b))

    order = client.post(
        "/api/v1/paper-trading/orders",
        json={
            "ticker_symbol": PASSES_RISK_GATE, "side": "buy", "order_type": "limit",
            "quantity": 1, "limit_price": 0.01, "idempotency_key": "test-key-3",
        },
        headers=_auth_header(token_a),
    ).json()

    # user B never sees it in their own list...
    b_orders = client.get("/api/v1/paper-trading/orders", headers=_auth_header(token_b)).json()
    assert all(o["id"] != order["id"] for o in b_orders)
    # ...and cannot cancel it either.
    cancel_res = client.post(f"/api/v1/paper-trading/orders/{order['id']}/cancel", headers=_auth_header(token_b))
    assert cancel_res.status_code == 400


def test_order_ticket_quote_reports_genuine_bid_ask_spread_and_provenance(client, auth_on):
    """The chart Order Ticket's quote endpoint — bid/ask/spread must come
    straight from the provider (never fabricated), and provenance
    (data_source/data_mode) must be present so the ticket can honestly
    label live vs. delayed vs. synthetic."""
    token = _register(client, "order-ticket-quote@example.com")
    res = client.get(f"/api/v1/paper-trading/quote/{PASSES_RISK_GATE}", headers=_auth_header(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["symbol"] == PASSES_RISK_GATE
    assert body["bid"] is not None and body["ask"] is not None
    assert body["spread"] == pytest.approx(body["ask"] - body["bid"])
    assert body["data_source"]
    assert body["data_mode"]
