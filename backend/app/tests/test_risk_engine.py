"""Deterministic Risk Engine: confidence + reward:risk are unconditional
gates; position-sizing is checked only when a size is actually provided.
Thresholds come from Settings, not hardcoded, so they can be overridden."""
from app.core.config import Settings
from app.services.risk.engine import evaluate_risk


def _settings(**overrides) -> Settings:
    base = dict(risk_min_confidence_pct=65.0, risk_min_reward_risk_ratio=2.0, risk_max_portfolio_risk_per_trade_pct=1.0)
    base.update(overrides)
    return Settings(**base)


def test_passes_when_all_thresholds_are_cleared():
    verdict = evaluate_risk(70.0, 2.5, position_risk_pct=0.5, settings=_settings())
    assert verdict.passed
    assert verdict.reasons == []


def test_rejects_low_confidence_with_named_reason():
    verdict = evaluate_risk(50.0, 3.0, settings=_settings())
    assert not verdict.passed
    assert any("confidence" in r.lower() for r in verdict.reasons)


def test_rejects_weak_reward_risk_with_named_reason():
    verdict = evaluate_risk(80.0, 1.2, settings=_settings())
    assert not verdict.passed
    assert any("reward:risk" in r.lower() for r in verdict.reasons)


def test_rejects_oversized_position_only_when_size_is_given():
    # No position size supplied (e.g. pre-scan stage, before sizing exists) -> skipped.
    assert evaluate_risk(80.0, 3.0, position_risk_pct=None, settings=_settings()).passed

    verdict = evaluate_risk(80.0, 3.0, position_risk_pct=2.5, settings=_settings())
    assert not verdict.passed
    assert any("position risk" in r.lower() for r in verdict.reasons)


def test_exactly_at_threshold_passes_not_rejects():
    verdict = evaluate_risk(65.0, 2.0, position_risk_pct=1.0, settings=_settings())
    assert verdict.passed


def test_uses_default_settings_when_none_provided():
    # Default risk_min_confidence_pct is 65.0 (get_settings()), so 40% must fail.
    verdict = evaluate_risk(40.0, 5.0)
    assert not verdict.passed
