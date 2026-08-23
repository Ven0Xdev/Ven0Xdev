"""build_prediction_row() — the single constructor for immutable Prediction
snapshots. Provenance fields (engine_mode/model_version/risk_policy_version)
are what let Phase 8's Champion/Challenger gate compare HEURISTIC vs.
TRAINED_ML historical performance; this covers they're actually stamped.
"""
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.risk.policy import RiskPolicy
from app.services.scoring.prediction_log import build_prediction_row
from app.services.scoring.scorer import analyze_ticker


def test_prediction_row_carries_engine_mode_and_risk_policy_provenance():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    analysis = analyze_ticker(symbol, provider=provider)

    row = build_prediction_row(analysis)

    # No trained ML artifact exists in this repo — every live analysis is
    # honestly HEURISTIC (see test_scorer.py's equivalent assertion on
    # StockAnalysis itself); the prediction row must say the same thing,
    # never silently drop or default this to something more impressive.
    assert row.engine_mode == analysis.engine_mode == "HEURISTIC"
    assert row.model_version == analysis.model_version is None
    assert row.risk_policy_version == RiskPolicy.from_settings().version


def test_prediction_row_reflects_a_trained_engine_mode_when_present():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    analysis = analyze_ticker(symbol, provider=provider)
    trained = analysis.model_copy(update={"engine_mode": "TRAINED_ML", "model_version": "v2026.08.01"})

    row = build_prediction_row(trained)

    assert row.engine_mode == "TRAINED_ML"
    assert row.model_version == "v2026.08.01"
