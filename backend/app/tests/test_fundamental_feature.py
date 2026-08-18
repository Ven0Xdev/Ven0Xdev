"""compute_fundamental_score's data_available=False branch — the honest
degraded state used when no provider can supply fundamentals for a symbol
(e.g. an ETF on a free-tier plan neither Twelve Data nor Alpha Vantage
cover). Computing the normal formula over placeholder zeros would score
every such symbol as if it had zero cash/zero revenue — fabricated-looking,
not honestly "unknown".
"""
from datetime import datetime, timezone

from app.services.data_providers.base import Fundamentals, TickerMeta
from app.services.features.fundamental import compute_fundamental_score

_META = TickerMeta(
    symbol="XLK",
    company_name="Technology Select Sector SPDR Fund",
    tier="NMS",
    sector="Technology Sector ETF",
    industry="Technology Sector ETF",
    float_shares=590_000_000,
    shares_outstanding=590_000_000,
    market_cap=100_000_000_000,
    reverse_split_count_3y=0,
    institutional_ownership_pct=70.0,
    insider_ownership_pct=1.0,
    short_interest_pct=1.0,
)


def _healthy_fundamentals(**overrides) -> Fundamentals:
    base = dict(
        symbol="XLK",
        market_cap=100_000_000_000,
        float_shares=590_000_000,
        shares_outstanding=590_000_000,
        cash=10_000_000_000,
        total_debt=1_000_000_000,
        revenue_ttm=50_000_000_000,
        net_income_ttm=10_000_000_000,
        dilution_12m_pct=0.5,
        going_concern_flag=False,
        last_filing_date=datetime.now(timezone.utc),
        filing_delinquent=False,
    )
    base.update(overrides)
    return Fundamentals(**base)


def test_data_available_defaults_to_true():
    fund = _healthy_fundamentals()
    assert fund.data_available is True


def test_normal_fundamentals_score_in_bounds_and_marks_available():
    score, components = compute_fundamental_score(_META, _healthy_fundamentals())
    assert 0 <= score <= 100
    assert components["data_available"] is True


def test_unavailable_fundamentals_score_neutral_not_zero():
    # Zeros run through the normal formula would score this as a company
    # with zero cash and zero revenue (near-0) — the honest "we don't know"
    # answer is a neutral midpoint, not a fabricated bad score.
    unavailable = _healthy_fundamentals(
        cash=0.0, total_debt=0.0, revenue_ttm=0.0, net_income_ttm=0.0,
        dilution_12m_pct=0.0, data_available=False,
    )
    score, components = compute_fundamental_score(_META, unavailable)
    assert score == 50.0
    assert components["data_available"] is False
    assert "note" in components


def test_unavailable_and_zeroed_but_available_produce_different_scores():
    # Confirms data_available is actually load-bearing, not a no-op flag:
    # the same zeroed-out numeric fields score very differently depending
    # on whether they're "real bad fundamentals" vs "we don't know".
    zeroed_but_available = _healthy_fundamentals(
        cash=0.0, total_debt=0.0, revenue_ttm=0.0, net_income_ttm=0.0, dilution_12m_pct=0.0,
    )
    unavailable = _healthy_fundamentals(
        cash=0.0, total_debt=0.0, revenue_ttm=0.0, net_income_ttm=0.0,
        dilution_12m_pct=0.0, data_available=False,
    )
    zeroed_score, _ = compute_fundamental_score(_META, zeroed_but_available)
    unavailable_score, _ = compute_fundamental_score(_META, unavailable)
    assert unavailable_score == 50.0
    assert zeroed_score != unavailable_score
