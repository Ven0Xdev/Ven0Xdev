"""Paper Trading engine + API — the platform's only trading execution mode.

Deterministic fixture symbols from the mock provider's own OTC universe
(never random per-run): BLKM naturally clears the default risk gate
(confidence >= 65%, reward:risk >= 2.0x) and AXNT naturally fails it on
reward:risk alone — found by iterating the mock provider's fixed universe
once, not chosen arbitrarily (see the failure message asserted below).
"""
import pytest

from app.core.config import get_settings
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.paper_trading import engine
from app.services.paper_trading.engine import (
    MAX_STARTING_CAPITAL,
    MIN_STARTING_CAPITAL,
    PaperTradingError,
)

PASSES_RISK_GATE = "BLKM"
FAILS_RISK_GATE = "AXNT"  # reward:risk ~0.74x, below the 2.0x minimum


@pytest.fixture
def auth_on():
    """Flip AUTH_REQUIRED so each API test below can register its own
    distinct user — required here specifically because the `client`
    fixture's dev-mode default (every request resolves to the same stable
    "dev@local" user, see api/deps.py's _get_or_create_dev_user) combined
    with `client` writes never being rolled back between tests (see
    conftest.py's `client` fixture docstring) would otherwise let one
    test's simulation history leak into the next test's assertions."""
    settings = get_settings()
    original = settings.auth_required
    settings.auth_required = True
    yield settings
    settings.auth_required = original


def _register(client, email):
    res = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert res.status_code == 201, res.text
    return res.json()["access_token"]


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- simulation lifecycle ---------------------------------------------

def test_no_active_simulation_until_one_is_explicitly_started(db_session):
    assert engine.get_active_account(user_id=1, db=db_session) is None
    assert engine.list_open_positions(user_id=1, db=db_session) == []
    assert engine.list_closed_positions(user_id=1, db=db_session) == []


def test_start_new_simulation_uses_the_exact_manually_entered_amount(db_session):
    account = engine.start_new_simulation(user_id=1, starting_capital=2_500.0, db=db_session)
    assert account.cash_balance == 2_500.0
    assert account.starting_balance == 2_500.0
    assert account.simulation_number == 1
    assert account.is_active is True
    assert account.archived_at is None
    assert engine.get_active_account(user_id=1, db=db_session).id == account.id


def test_start_new_simulation_rejects_out_of_bounds_amounts(db_session):
    for bad in (0.0, -100.0, MIN_STARTING_CAPITAL - 1, MAX_STARTING_CAPITAL + 1, float("nan"), float("inf")):
        try:
            engine.start_new_simulation(user_id=2, starting_capital=bad, db=db_session)
            pytest.fail(f"expected PaperTradingError for {bad}")
        except PaperTradingError:
            pass
    assert engine.get_active_account(user_id=2, db=db_session) is None


def test_start_new_simulation_archives_the_previous_one_and_increments_the_number(db_session):
    first = engine.start_new_simulation(user_id=3, starting_capital=1_000.0, db=db_session)
    second = engine.start_new_simulation(user_id=3, starting_capital=5_000.0, db=db_session)

    assert second.simulation_number == first.simulation_number + 1
    assert second.cash_balance == 5_000.0
    assert second.starting_balance == 5_000.0
    assert engine.get_active_account(user_id=3, db=db_session).id == second.id

    sims = engine.list_simulations(user_id=3, db=db_session)
    assert [s.id for s in sims] == [second.id, first.id]  # newest first
    archived_first = next(s for s in sims if s.id == first.id)
    assert archived_first.is_active is False
    assert archived_first.archived_at is not None


def test_start_new_simulation_refuses_while_positions_are_open(db_session):
    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=4, starting_capital=10_000.0, db=db_session)
    engine.open_position(user_id=4, symbol=PASSES_RISK_GATE, quantity=1, db=db_session, provider=provider)

    try:
        engine.start_new_simulation(user_id=4, starting_capital=2_000.0, db=db_session)
        pytest.fail("expected PaperTradingError")
    except PaperTradingError as exc:
        assert "open paper position" in str(exc).lower()

    # Still on the original (unarchived) simulation.
    assert engine.list_simulations(user_id=4, db=db_session)[0].starting_balance == 10_000.0


def test_new_simulations_position_sizing_uses_the_new_equity_automatically(db_session, monkeypatch):
    # Same isolation trick as the insufficient-cash test below: raise the
    # risk-sizing ceiling out of the way so this only proves cash/equity
    # comes from whichever simulation is currently active.
    from app.core.config import get_settings

    permissive = get_settings().model_copy(update={"risk_max_portfolio_risk_per_trade_pct": 1_000_000.0})
    monkeypatch.setattr("app.services.risk.engine.get_settings", lambda: permissive)

    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=5, starting_capital=200.0, db=db_session)
    try:
        engine.open_position(user_id=5, symbol=PASSES_RISK_GATE, quantity=1000, db=db_session, provider=provider)
        pytest.fail("expected insufficient-cash refusal against the small new-simulation balance")
    except PaperTradingError as exc:
        assert "insufficient" in str(exc).lower()
        assert "$200.00" in str(exc)  # the new simulation's own cash, not any stale/hardcoded balance


# ---------- position open/close (now simulation-scoped) ----------------------

def test_open_position_succeeds_for_a_setup_that_clears_the_risk_gate(db_session):
    provider = MockOTCProvider()
    account = engine.start_new_simulation(user_id=20, starting_capital=50_000.0, db=db_session)
    starting_cash = account.cash_balance

    position = engine.open_position(user_id=20, symbol=PASSES_RISK_GATE, quantity=10, db=db_session, provider=provider)

    assert position.status == "open"
    assert position.ticker_symbol == PASSES_RISK_GATE
    assert position.quantity == 10
    assert position.avg_entry_price > 0
    assert position.risk_policy_version == "risk-policy-v1"
    assert position.entry_data_mode == "synthetic"  # mock provider — never presented as live

    account = engine.get_active_account(user_id=20, db=db_session)
    expected_cost = position.avg_entry_price * 10
    assert account.cash_balance == starting_cash - expected_cost


def test_open_position_refused_without_an_active_simulation(db_session):
    provider = MockOTCProvider()
    try:
        engine.open_position(user_id=21, symbol=PASSES_RISK_GATE, quantity=1, db=db_session, provider=provider)
        pytest.fail("expected PaperTradingError")
    except PaperTradingError as exc:
        assert "no active paper simulation" in str(exc).lower()


def test_open_position_refused_when_risk_gate_fails(db_session):
    provider = MockOTCProvider()
    account = engine.start_new_simulation(user_id=22, starting_capital=50_000.0, db=db_session)
    starting_cash = account.cash_balance

    try:
        engine.open_position(user_id=22, symbol=FAILS_RISK_GATE, quantity=10, db=db_session, provider=provider)
        pytest.fail("expected PaperTradingError")
    except PaperTradingError as exc:
        assert "risk gate" in str(exc).lower()

    account = engine.get_active_account(user_id=22, db=db_session)
    assert account.cash_balance == starting_cash  # nothing debited on a refused trade
    assert engine.list_open_positions(user_id=22, db=db_session) == []


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
    account = engine.start_new_simulation(user_id=23, starting_capital=50_000.0, db=db_session)
    account.cash_balance = 1.0  # far less than any real fill cost
    db_session.add(account)
    db_session.commit()

    try:
        engine.open_position(user_id=23, symbol=PASSES_RISK_GATE, quantity=10, db=db_session, provider=provider)
        pytest.fail("expected PaperTradingError")
    except PaperTradingError as exc:
        assert "insufficient" in str(exc).lower()


def test_open_position_rejects_non_positive_quantity(db_session):
    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=24, starting_capital=50_000.0, db=db_session)
    for bad_qty in (0, -5):
        try:
            engine.open_position(user_id=24, symbol=PASSES_RISK_GATE, quantity=bad_qty, db=db_session, provider=provider)
            pytest.fail("expected PaperTradingError")
        except PaperTradingError:
            pass


def test_close_position_realizes_pnl_and_credits_cash(db_session):
    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=25, starting_capital=50_000.0, db=db_session)
    position = engine.open_position(user_id=25, symbol=PASSES_RISK_GATE, quantity=5, db=db_session, provider=provider)
    cash_after_open = engine.get_active_account(user_id=25, db=db_session).cash_balance

    closed = engine.close_position(user_id=25, position_id=position.id, db=db_session, provider=provider)

    assert closed.status == "closed"
    assert closed.closed_at is not None
    assert closed.exit_price is not None
    assert closed.realized_pnl_dollars == (closed.exit_price - position.avg_entry_price) * position.quantity

    account = engine.get_active_account(user_id=25, db=db_session)
    expected_proceeds = closed.exit_price * position.quantity
    assert account.cash_balance == cash_after_open + expected_proceeds
    assert engine.list_open_positions(user_id=25, db=db_session) == []
    assert [p.id for p in engine.list_closed_positions(user_id=25, db=db_session)] == [position.id]


def test_close_position_fails_for_unknown_position(db_session):
    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=26, starting_capital=50_000.0, db=db_session)
    try:
        engine.close_position(user_id=26, position_id=999_999, db=db_session, provider=provider)
        pytest.fail("expected PaperTradingError")
    except PaperTradingError as exc:
        assert "no open paper position" in str(exc).lower()


def test_close_position_cannot_close_someone_elses_position(db_session):
    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=27, starting_capital=50_000.0, db=db_session)
    position = engine.open_position(user_id=27, symbol=PASSES_RISK_GATE, quantity=1, db=db_session, provider=provider)
    engine.start_new_simulation(user_id=28, starting_capital=50_000.0, db=db_session)
    try:
        engine.close_position(user_id=28, position_id=position.id, db=db_session, provider=provider)
        pytest.fail("expected PaperTradingError")
    except PaperTradingError:
        pass


def test_open_position_carries_entry_provenance_for_a_future_outcome_evaluation_job(db_session):
    provider = MockOTCProvider()
    engine.start_new_simulation(user_id=29, starting_capital=50_000.0, db=db_session)
    position = engine.open_position(user_id=29, symbol=PASSES_RISK_GATE, quantity=1, db=db_session, provider=provider)
    assert position.planned_stop_loss is not None
    assert position.planned_take_profit is not None
    assert position.entry_confidence_pct is not None
    assert position.entry_risk_reward is not None


# ---------- API ---------------------------------------------------------------

def test_paper_trading_api_account_is_null_before_any_simulation(client):
    res = client.get("/api/v1/paper-trading/account")
    assert res.status_code == 200
    assert res.json() is None


def test_paper_trading_api_rejects_starting_capital_out_of_bounds(client, auth_on):
    token = _register(client, "sim-bounds@example.com")
    res = client.post(
        "/api/v1/paper-trading/simulations", json={"starting_capital": -50}, headers=_auth_header(token)
    )
    assert res.status_code in (400, 422)


def test_paper_trading_full_lifecycle_via_api(client, auth_on):
    token = _register(client, "sim-lifecycle@example.com")
    headers = _auth_header(token)

    start_res = client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 7_500}, headers=headers)
    assert start_res.status_code == 200, start_res.text
    sim = start_res.json()
    assert sim["cash_balance"] == 7_500
    assert sim["starting_balance"] == 7_500
    assert sim["simulation_number"] == 1
    assert sim["is_active"] is True

    open_res = client.post(
        "/api/v1/paper-trading/positions", json={"ticker_symbol": PASSES_RISK_GATE, "quantity": 2}, headers=headers
    )
    assert open_res.status_code == 200, open_res.text
    position = open_res.json()
    assert position["status"] == "open"
    assert position["ticker_symbol"] == PASSES_RISK_GATE

    listed = client.get("/api/v1/paper-trading/positions?status=open", headers=headers).json()
    assert any(p["id"] == position["id"] for p in listed)
    opened = next(p for p in listed if p["id"] == position["id"])
    assert opened["current_price"] is not None  # mark-to-market populated

    account = client.get("/api/v1/paper-trading/account", headers=headers).json()
    assert account["cash_balance"] < account["starting_balance"]
    assert account["starting_balance"] == 7_500
    assert account["equity"] is not None  # cash + open positions' market value

    close_res = client.post(f"/api/v1/paper-trading/positions/{position['id']}/close", headers=headers)
    assert close_res.status_code == 200, close_res.text
    assert close_res.json()["status"] == "closed"

    closed_list = client.get("/api/v1/paper-trading/positions?status=closed", headers=headers).json()
    assert any(p["id"] == position["id"] for p in closed_list)


def test_paper_trading_api_blocks_new_simulation_with_open_positions(client, auth_on):
    token = _register(client, "sim-blocks@example.com")
    headers = _auth_header(token)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 5_000}, headers=headers)
    client.post(
        "/api/v1/paper-trading/positions", json={"ticker_symbol": PASSES_RISK_GATE, "quantity": 1}, headers=headers
    )

    blocked = client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 9_000}, headers=headers)
    assert blocked.status_code == 400
    assert "open paper position" in blocked.json()["detail"].lower()


def test_paper_trading_api_simulation_history_never_deletes_archived_runs(client, auth_on):
    token = _register(client, "sim-history@example.com")
    headers = _auth_header(token)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 1_000}, headers=headers)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 2_000}, headers=headers)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 3_000}, headers=headers)

    history = client.get("/api/v1/paper-trading/simulations", headers=headers).json()
    assert len(history) == 3
    assert [h["starting_balance"] for h in history] == [3_000, 2_000, 1_000]  # newest first
    assert history[0]["is_active"] is True
    assert history[1]["is_active"] is False and history[1]["archived_at"] is not None
    assert history[2]["is_active"] is False and history[2]["archived_at"] is not None


def test_paper_trading_api_refuses_a_setup_that_fails_the_risk_gate(client, auth_on):
    token = _register(client, "sim-riskgate@example.com")
    headers = _auth_header(token)
    client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 5_000}, headers=headers)
    res = client.post(
        "/api/v1/paper-trading/positions", json={"ticker_symbol": FAILS_RISK_GATE, "quantity": 1}, headers=headers
    )
    assert res.status_code == 400
    assert "risk gate" in res.json()["detail"].lower()


def test_paper_trading_api_rejects_invalid_status_filter(client):
    res = client.get("/api/v1/paper-trading/positions?status=bogus")
    assert res.status_code == 400


# ---------- autonomous trading opt-in -----------------------------------------


def test_autonomous_trading_is_off_by_default_and_can_be_toggled(client, auth_on):
    token = _register(client, "sim-autonomous@example.com")
    headers = _auth_header(token)
    started = client.post("/api/v1/paper-trading/simulations", json={"starting_capital": 5_000}, headers=headers)
    assert started.json()["autonomous_trading_enabled"] is False

    on = client.post("/api/v1/paper-trading/autonomous", json={"enabled": True}, headers=headers)
    assert on.status_code == 200
    assert on.json()["autonomous_trading_enabled"] is True

    off = client.post("/api/v1/paper-trading/autonomous", json={"enabled": False}, headers=headers)
    assert off.json()["autonomous_trading_enabled"] is False


def test_autonomous_trading_toggle_requires_an_active_simulation(client, auth_on):
    token = _register(client, "sim-autonomous-none@example.com")
    res = client.post("/api/v1/paper-trading/autonomous", json={"enabled": True}, headers=_auth_header(token))
    assert res.status_code == 400
