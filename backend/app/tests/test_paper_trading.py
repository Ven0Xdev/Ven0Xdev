"""Paper Trading engine + API — the platform's only trading execution mode.

Deterministic fixture symbols from the mock provider's own OTC universe
(never random per-run): BLKM naturally clears the default risk gate
(confidence >= 65%, reward:risk >= 2.0x) and AXNT naturally fails it on
reward:risk alone — found by iterating the mock provider's fixed universe
once, not chosen arbitrarily (see the failure message asserted below).
"""
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.paper_trading import engine
from app.services.paper_trading.engine import PaperTradingError

PASSES_RISK_GATE = "BLKM"
FAILS_RISK_GATE = "AXNT"  # reward:risk ~0.74x, below the 2.0x minimum


def test_account_is_created_once_and_reused(db_session):
    a1 = engine.get_or_create_account(user_id=1, db=db_session)
    a2 = engine.get_or_create_account(user_id=1, db=db_session)
    assert a1.id == a2.id
    assert a1.cash_balance == a1.starting_balance


def test_open_position_succeeds_for_a_setup_that_clears_the_risk_gate(db_session):
    provider = MockOTCProvider()
    account = engine.get_or_create_account(user_id=2, db=db_session)
    starting_cash = account.cash_balance

    position = engine.open_position(user_id=2, symbol=PASSES_RISK_GATE, quantity=10, db=db_session, provider=provider)

    assert position.status == "open"
    assert position.ticker_symbol == PASSES_RISK_GATE
    assert position.quantity == 10
    assert position.avg_entry_price > 0
    assert position.risk_policy_version == "risk-policy-v1"
    assert position.entry_data_mode == "synthetic"  # mock provider — never presented as live

    account = engine.get_or_create_account(user_id=2, db=db_session)
    expected_cost = position.avg_entry_price * 10
    assert account.cash_balance == starting_cash - expected_cost


def test_open_position_refused_when_risk_gate_fails(db_session):
    provider = MockOTCProvider()
    account = engine.get_or_create_account(user_id=3, db=db_session)
    starting_cash = account.cash_balance

    try:
        engine.open_position(user_id=3, symbol=FAILS_RISK_GATE, quantity=10, db=db_session, provider=provider)
        assert False, "expected PaperTradingError"
    except PaperTradingError as exc:
        assert "risk gate" in str(exc).lower()

    account = engine.get_or_create_account(user_id=3, db=db_session)
    assert account.cash_balance == starting_cash  # nothing debited on a refused trade
    assert engine.list_open_positions(user_id=3, db=db_session) == []


def test_open_position_refused_when_insufficient_cash(db_session, monkeypatch):
    # Isolates the affordability check from the position-sizing risk check:
    # with the default 1% max-position-risk policy, any cash balance low
    # enough to make a normal fill unaffordable *also* blows the
    # position-sizing percentage past 1% (both scale with quantity/price
    # the same way) — so this raises the risk ceiling far out of the way
    # first, to prove insufficient-cash is caught as its own, distinct
    # refusal reason, not just a side effect of the risk-sizing gate.
    from app.core.config import get_settings

    permissive = get_settings().model_copy(update={"risk_max_portfolio_risk_per_trade_pct": 1_000_000.0})
    monkeypatch.setattr("app.services.risk.engine.get_settings", lambda: permissive)

    provider = MockOTCProvider()
    account = engine.get_or_create_account(user_id=4, db=db_session)
    account.cash_balance = 1.0  # far less than any real fill cost
    db_session.add(account)
    db_session.commit()

    try:
        engine.open_position(user_id=4, symbol=PASSES_RISK_GATE, quantity=10, db=db_session, provider=provider)
        assert False, "expected PaperTradingError"
    except PaperTradingError as exc:
        assert "insufficient" in str(exc).lower()


def test_open_position_rejects_non_positive_quantity(db_session):
    provider = MockOTCProvider()
    for bad_qty in (0, -5):
        try:
            engine.open_position(user_id=5, symbol=PASSES_RISK_GATE, quantity=bad_qty, db=db_session, provider=provider)
            assert False, "expected PaperTradingError"
        except PaperTradingError:
            pass


def test_close_position_realizes_pnl_and_credits_cash(db_session):
    provider = MockOTCProvider()
    account = engine.get_or_create_account(user_id=6, db=db_session)
    position = engine.open_position(user_id=6, symbol=PASSES_RISK_GATE, quantity=5, db=db_session, provider=provider)
    cash_after_open = engine.get_or_create_account(user_id=6, db=db_session).cash_balance

    closed = engine.close_position(user_id=6, position_id=position.id, db=db_session, provider=provider)

    assert closed.status == "closed"
    assert closed.closed_at is not None
    assert closed.exit_price is not None
    assert closed.realized_pnl_dollars == (closed.exit_price - position.avg_entry_price) * position.quantity

    account = engine.get_or_create_account(user_id=6, db=db_session)
    expected_proceeds = closed.exit_price * position.quantity
    assert account.cash_balance == cash_after_open + expected_proceeds
    assert engine.list_open_positions(user_id=6, db=db_session) == []
    assert [p.id for p in engine.list_closed_positions(user_id=6, db=db_session)] == [position.id]


def test_close_position_fails_for_unknown_position(db_session):
    provider = MockOTCProvider()
    engine.get_or_create_account(user_id=7, db=db_session)
    try:
        engine.close_position(user_id=7, position_id=999_999, db=db_session, provider=provider)
        assert False, "expected PaperTradingError"
    except PaperTradingError as exc:
        assert "no open paper position" in str(exc).lower()


def test_close_position_cannot_close_someone_elses_position(db_session):
    provider = MockOTCProvider()
    position = engine.open_position(user_id=8, symbol=PASSES_RISK_GATE, quantity=1, db=db_session, provider=provider)
    engine.get_or_create_account(user_id=9, db=db_session)
    try:
        engine.close_position(user_id=9, position_id=position.id, db=db_session, provider=provider)
        assert False, "expected PaperTradingError"
    except PaperTradingError:
        pass


def test_open_position_carries_entry_provenance_for_a_future_outcome_evaluation_job(db_session):
    provider = MockOTCProvider()
    position = engine.open_position(user_id=10, symbol=PASSES_RISK_GATE, quantity=1, db=db_session, provider=provider)
    assert position.planned_stop_loss is not None
    assert position.planned_take_profit is not None
    assert position.entry_confidence_pct is not None
    assert position.entry_risk_reward is not None


def test_paper_trading_full_lifecycle_via_api(client):
    open_res = client.post("/api/v1/paper-trading/positions", json={"ticker_symbol": PASSES_RISK_GATE, "quantity": 2})
    assert open_res.status_code == 200, open_res.text
    position = open_res.json()
    assert position["status"] == "open"
    assert position["ticker_symbol"] == PASSES_RISK_GATE

    listed = client.get("/api/v1/paper-trading/positions?status=open").json()
    assert any(p["id"] == position["id"] for p in listed)
    opened = next(p for p in listed if p["id"] == position["id"])
    assert opened["current_price"] is not None  # mark-to-market populated

    account = client.get("/api/v1/paper-trading/account").json()
    assert account["cash_balance"] < account["starting_balance"]

    close_res = client.post(f"/api/v1/paper-trading/positions/{position['id']}/close")
    assert close_res.status_code == 200, close_res.text
    assert close_res.json()["status"] == "closed"

    closed_list = client.get("/api/v1/paper-trading/positions?status=closed").json()
    assert any(p["id"] == position["id"] for p in closed_list)


def test_paper_trading_api_refuses_a_setup_that_fails_the_risk_gate(client):
    res = client.post("/api/v1/paper-trading/positions", json={"ticker_symbol": FAILS_RISK_GATE, "quantity": 1})
    assert res.status_code == 400
    assert "risk gate" in res.json()["detail"].lower()


def test_paper_trading_api_rejects_invalid_status_filter(client):
    res = client.get("/api/v1/paper-trading/positions?status=bogus")
    assert res.status_code == 400
