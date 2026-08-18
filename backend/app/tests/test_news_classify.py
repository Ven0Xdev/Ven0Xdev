"""News classification — deterministic, keyword-lexicon-based (never a
fabricated/hardcoded 0.0, never claimed to be ML-derived)."""
from app.services.news.classify import (
    classify,
    classify_category,
    classify_sentiment,
    compute_impact,
    compute_novelty,
    compute_relevance,
    source_reliability,
)


def test_positive_headline_scores_positive():
    score, label = classify_sentiment("Company beats earnings estimates, raises guidance")
    assert score > 0
    assert label == "positive"


def test_negative_headline_scores_negative():
    score, label = classify_sentiment("Company misses estimates amid lawsuit and downgrade")
    assert score < 0
    assert label == "negative"


def test_headline_with_no_lexicon_hits_is_neutral_not_fabricated():
    score, label = classify_sentiment("Company announces annual shareholder meeting date")
    assert score == 0.0
    assert label == "neutral"


def test_mixed_signals_with_uncertainty_words_is_uncertain_not_neutral():
    score, label = classify_sentiment("Results could be mixed as outlook remains uncertain despite a gain and a loss")
    assert label == "uncertain"


def test_classify_category_detects_earnings():
    assert classify_category("Company reports Q2 earnings, beats revenue estimates") == "earnings"


def test_classify_category_detects_merger():
    assert classify_category("Company to acquire rival in $2B merger deal") == "merger"


def test_classify_category_detects_regulatory():
    assert classify_category("FDA opens investigation into company's manufacturing practices") == "regulatory"


def test_classify_category_returns_none_when_nothing_matches():
    assert classify_category("Company opens new office in Austin") is None


def test_source_reliability_known_source():
    assert source_reliability("Reuters") == 0.9
    assert source_reliability("reuters") == 0.9  # case-insensitive


def test_source_reliability_unknown_source_defaults_to_middling_not_zero_or_one():
    r = source_reliability("Some Random Blog")
    assert 0.0 < r < 1.0


def test_novelty_is_1_with_no_recent_history():
    assert compute_novelty("Company beats earnings", []) == 1.0


def test_novelty_drops_for_a_near_duplicate_headline():
    novelty = compute_novelty(
        "Company beats earnings estimates for Q2",
        ["Company beats earnings estimates for Q2 2026"],
    )
    assert novelty < 0.6


def test_novelty_stays_high_for_an_unrelated_headline():
    novelty = compute_novelty(
        "Company beats earnings estimates for Q2",
        ["Regulator opens probe into unrelated industry practices"],
    )
    assert novelty > 0.7


def test_relevance_is_high_when_symbol_named_in_headline():
    assert compute_relevance("AAPL", "AAPL beats earnings estimates", ["AAPL"]) == 1.0


def test_relevance_lower_for_many_co_tagged_symbols_not_named():
    relevance = compute_relevance("AAPL", "Tech stocks rally broadly", ["AAPL", "MSFT", "GOOGL", "AMZN", "META"])
    assert relevance < 0.9


def test_impact_scales_with_magnitude_reliability_relevance_and_category():
    high = compute_impact(sentiment_score=0.9, reliability=0.9, relevance=1.0, category="earnings")
    low = compute_impact(sentiment_score=0.1, reliability=0.5, relevance=0.3, category="macro")
    assert high > low
    assert 0.0 <= high <= 1.0
    assert 0.0 <= low <= 1.0


def test_classify_end_to_end_returns_a_complete_classification():
    result = classify(
        headline="AAPL beats earnings estimates, raises full-year guidance",
        summary="Apple reported strong quarterly results driven by services growth.",
        source="Reuters",
        symbol="AAPL",
        symbols=["AAPL"],
        recent_headlines=[],
    )
    assert result.sentiment_label == "positive"
    assert result.category == "earnings"
    assert result.reliability == 0.9
    assert result.novelty == 1.0
    assert result.relevance == 1.0
    assert result.impact > 0
