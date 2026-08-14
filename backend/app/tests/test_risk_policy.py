"""RiskPolicy (services/risk/policy.py) — the single, versioned bundle of
thresholds shared by the scanner (services/scanner/multi_asset.py, via
services/risk/engine.py's evaluate_risk) and the per-ticker Signal Engine
(services/signals/engine.py). Also covers Safe Mode, the platform-wide
kill switch enforced inside evaluate_risk() itself so both callers see it
identically.
"""
from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.risk.engine import evaluate_risk
from app.services.risk.policy import POLICY_VERSION, RiskPolicy
from app.services.scoring.scorer import analyze_ticker
from app.services.signals.engine import _status_for, apply_safety_rules


def _settings(**overrides) -> Settings:
    base = dict(
        risk_min_confidence_pct=65.0,
        risk_min_reward_risk_ratio=2.0,
        risk_max_portfolio_risk_per_trade_pct=1.0,
        risk_min_signal_confidence_pct=30.0,
        risk_max_spread_pct=12.0,
        risk_min_liquidity_score=25.0,
        risk_min_dollar_volume=10_000.0,
        risk_max_manipulation_risk=60.0,
        risk_min_bars_for_signal=20,
        safe_mode_enabled=False,
    )
    base.update(overrides)
    return Settings(**base)


def test_policy_bundles_every_threshold_from_settings():
    policy = RiskPolicy.from_settings(_settings())
    assert policy.version == POLICY_VERSION
    assert policy.min_confidence_pct == 65.0
    assert policy.min_reward_risk_ratio == 2.0
    assert policy.max_position_risk_pct == 1.0
    assert policy.min_signal_confidence_pct == 30.0
    assert policy.max_spread_pct == 12.0
    assert policy.min_liquidity_score == 25.0
    assert policy.min_dollar_volume == 10_000.0
    assert policy.max_manipulation_risk == 60.0
    assert policy.min_bars_for_signal == 20
    assert policy.safe_mode is False


def test_policy_uses_live_settings_when_none_provided():
    policy = RiskPolicy.from_settings()
    assert policy.version == POLICY_VERSION


# ---------- Safe Mode: an absolute, shared kill switch -----------------------

def test_safe_mode_rejects_even_an_otherwise_perfect_setup():
    verdict = evaluate_risk(99.0, 10.0, position_risk_pct=0.1, settings=_settings(safe_mode_enabled=True))
    assert not verdict.passed
    assert any("safe mode" in r.lower() for r in verdict.reasons)


def test_safe_mode_off_does_not_affect_a_passing_setup():
    verdict = evaluate_risk(70.0, 2.5, settings=_settings(safe_mode_enabled=False))
    assert verdict.passed


# ---------- the actual bug this phase fixes: scanner vs. per-ticker agreement ----

def _forced_analysis(base, **updates):
    return base.model_copy(update=updates)


def test_possible_entry_requires_the_same_risk_gate_the_scanner_enforces():
    """Before this phase, signals/engine.py's POSSIBLE_ENTRY tier checked
    its own separate, looser ad-hoc numbers (reward:risk >= 1.5, no
    confidence floor beyond the 30% "is there a signal at all" gate) —
    completely independent of the deterministic Risk Engine's stricter
    65%-confidence / 2.0-reward:risk floor that the scanner enforces. A
    ticker could show POSSIBLE_ENTRY on its own page while the scanner
    would reject the identical confidence/reward-risk numbers. This
    constructs exactly that "strong by score, weak by risk gate" case and
    confirms it can no longer reach POSSIBLE_ENTRY."""
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    a = analyze_ticker(symbol, provider=provider)
    policy = RiskPolicy.from_settings(_settings())

    forced_matrix = [p.model_copy(update={"prob_up_10": 0.9}) for p in a.probability_matrix]
    strong_by_score_weak_by_risk = _forced_analysis(
        a,
        overall_ai_score=90.0,
        probability_matrix=forced_matrix,
        confidence_score=40.0,   # clears the 30% signal floor, fails the 65% entry bar
        expected_risk_reward=5.0,  # would have cleared the OLD local 1.5 bar easily
        manipulation_risk=0.0,
    )

    from app.services.features import technical

    tech = technical.compute_all_technical_features(provider.get_ohlcv(symbol, lookback_days=120))
    safety = apply_safety_rules(strong_by_score_weak_by_risk, tech, indicators_warm=True, provider_healthy=True, policy=policy)

    status, reasons = _status_for(strong_by_score_weak_by_risk, safety, policy)

    assert status != "POSSIBLE_ENTRY"
    assert any("confidence" in r.lower() for r in reasons)


def test_possible_entry_reachable_when_both_score_and_risk_gate_pass():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    a = analyze_ticker(symbol, provider=provider)
    policy = RiskPolicy.from_settings(_settings())

    forced_matrix = [p.model_copy(update={"prob_up_10": 0.9}) for p in a.probability_matrix]
    strong_and_clears_risk_gate = _forced_analysis(
        a,
        overall_ai_score=90.0,
        probability_matrix=forced_matrix,
        confidence_score=70.0,
        expected_risk_reward=3.0,
        manipulation_risk=0.0,
    )

    from app.services.features import technical

    tech = technical.compute_all_technical_features(provider.get_ohlcv(symbol, lookback_days=120))
    safety = apply_safety_rules(strong_and_clears_risk_gate, tech, indicators_warm=True, provider_healthy=True, policy=policy)
    if not safety.passed:
        pytest.skip("this mock ticker fails an unrelated safety rule (spread/liquidity/volume) on this run")

    status, reasons = _status_for(strong_and_clears_risk_gate, safety, policy)

    assert status == "POSSIBLE_ENTRY"
    assert reasons == []


def test_scanner_and_signal_engine_call_the_identical_evaluate_risk_function():
    """Not a duplicate re-implementation on either side — both modules
    literally import the same function from services.risk.engine."""
    import app.services.scanner.multi_asset as scanner_module
    import app.services.signals.engine as signals_module

    assert scanner_module.evaluate_risk is signals_module.evaluate_risk
