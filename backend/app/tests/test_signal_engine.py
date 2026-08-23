"""Signal Engine: statuses, safety rules with explanations, immutability."""
import pytest

from app.db.models.signal import Signal, SignalEvent
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.scorer import analyze_ticker
from app.services.signals.engine import apply_safety_rules, evaluate_signal

VALID = {"NO_TRADE", "AVOID", "WATCH", "SETUP_FORMING", "POSSIBLE_ENTRY"}


@pytest.fixture(scope="module")
def provider():
    return MockOTCProvider()


def _tech(provider, symbol):
    from app.services.features import technical

    return technical.compute_all_technical_features(provider.get_ohlcv(symbol, lookback_days=120))


def test_every_universe_symbol_gets_a_valid_status(db_session, provider):
    for meta in provider.get_universe(limit=8):
        signal = evaluate_signal(meta.symbol, provider, db_session)
        assert signal.status in VALID
        assert signal.data_mode == "synthetic"      # provenance carried
        assert signal.model_version and signal.feature_version
        assert signal.risk_policy_version  # which shared RiskPolicy evaluated this signal


def test_no_trade_carries_rejection_reasons(db_session, provider):
    # Force failure: unhealthy provider must always produce explained rejection.
    symbol = provider.get_universe(limit=1)[0].symbol
    signal = evaluate_signal(symbol, provider, db_session, provider_healthy=False)
    assert signal.status in ("NO_TRADE", "AVOID")
    if signal.status == "NO_TRADE":
        assert any("stale" in r.lower() or "unhealthy" in r.lower() for r in signal.rejection_reasons)


def test_warmup_rule_blocks_entries(db_session, provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    signal = evaluate_signal(symbol, provider, db_session, indicators_warm=False)
    if signal.status == "NO_TRADE":
        assert any("warm" in r.lower() for r in signal.rejection_reasons)
    assert signal.status != "POSSIBLE_ENTRY"


def test_safety_rules_cite_threshold_and_value(provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    a = analyze_ticker(symbol, provider=provider)
    tech = _tech(provider, symbol)
    tech["spread_pct"] = 25.0  # force spread breach
    verdict = apply_safety_rules(a, tech, indicators_warm=True, provider_healthy=True)
    assert not verdict.passed
    assert any("25.0%" in r and "12%" in r for r in verdict.reasons)


def test_actionable_signals_have_levels_nontrade_do_not(db_session, provider):
    for meta in provider.get_universe(limit=10):
        s = evaluate_signal(meta.symbol, provider, db_session)
        if s.status in ("POSSIBLE_ENTRY", "SETUP_FORMING"):
            assert s.ideal_entry and s.stop_loss and len(s.targets) == 3
            assert s.stop_loss < s.ideal_entry
        else:
            assert s.ideal_entry is None and s.targets == []


def test_signal_history_is_immutable_event_log(db_session, provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    first = evaluate_signal(symbol, provider, db_session)
    again = evaluate_signal(symbol, provider, db_session)      # same status → reaffirm event
    assert again.id == first.id
    events = db_session.query(SignalEvent).filter_by(signal_id=first.id).all()
    types = {e.event_type for e in events}
    assert "created" in types and "reaffirmed" in types

    # Status change → NEW row + supersession event, original untouched.
    changed = evaluate_signal(symbol, provider, db_session, provider_healthy=False)
    if changed.id != first.id:
        assert db_session.query(Signal).filter_by(id=first.id).one().status == first.status
        superseded = [e for e in db_session.query(SignalEvent).filter_by(signal_id=first.id) if e.event_type == "superseded"]
        assert superseded and superseded[0].to_status == changed.status
