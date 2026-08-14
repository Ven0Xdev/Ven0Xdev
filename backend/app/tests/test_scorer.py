from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.scorer import analyze_ticker


def test_analyze_ticker_returns_full_contract():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    analysis = analyze_ticker(symbol, provider=provider)

    assert analysis.ticker == symbol
    assert analysis.current_price > 0
    for score in [
        analysis.liquidity_score,
        analysis.manipulation_risk,
        analysis.fundamental_score,
        analysis.technical_score,
        analysis.sentiment_score,
        analysis.catalyst_score,
        analysis.overall_ai_score,
        analysis.confidence_score,
    ]:
        assert 0 <= score <= 100

    assert len(analysis.probability_matrix) == 3
    for row in analysis.probability_matrix:
        assert 0 <= row.prob_up_5 <= 1
        assert 0 <= row.prob_up_10 <= 1
        assert 0 <= row.prob_up_20 <= 1

    assert 0 <= analysis.probability_downside_before_upside <= 1
    assert analysis.stop_loss < analysis.ideal_entry_price < analysis.take_profit_1 < analysis.take_profit_2 < analysis.take_profit_3
    assert 0 < analysis.max_allocation_pct <= 5.0
    assert analysis.estimated_holding_period_days in (5, 10, 20)
    assert isinstance(analysis.explanation, str) and len(analysis.explanation) > 0


def test_analysis_never_claims_certainty():
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    analysis = analyze_ticker(symbol, provider=provider)

    for row in analysis.probability_matrix:
        assert row.prob_up_5 < 1.0
        assert row.prob_up_10 < 1.0
        assert row.prob_up_20 < 1.0
    assert analysis.confidence_score < 100


def test_high_manipulation_reduces_allocation():
    """A stock the manipulation model flags heavily should never be sized
    at the platform's maximum allocation ceiling.
    """
    provider = MockOTCProvider()
    flagged = None
    for meta in provider.get_universe():
        analysis = analyze_ticker(meta.symbol, provider=provider)
        if analysis.manipulation_risk > 60:
            flagged = analysis
            break
    if flagged is not None:
        assert flagged.max_allocation_pct < 5.0


def test_analyze_all_universe_symbols_succeed():
    provider = MockOTCProvider()
    for meta in provider.get_universe():
        analysis = analyze_ticker(meta.symbol, provider=provider)
        assert analysis.ticker == meta.symbol


def test_engine_mode_is_honestly_heuristic_with_no_trained_artifact():
    """No trained model artifact exists in this repo/test run (nothing ever
    calls training_pipeline.save_model() here), so every analysis must be
    labeled HEURISTIC, with no fabricated model_version — never TRAINED_ML."""
    provider = MockOTCProvider()
    symbol = provider.get_universe(limit=1)[0].symbol
    analysis = analyze_ticker(symbol, provider=provider)

    assert analysis.engine_mode == "HEURISTIC"
    assert analysis.model_version is None
