from datetime import datetime, timedelta, timezone

from app.services.data_providers.base import Fundamentals, NewsArticle, TickerMeta
from app.services.otc.manipulation import assess_otc_specific_risk


def _meta(reverse_splits=0):
    return TickerMeta(
        symbol="TEST",
        company_name="Test Co",
        tier="Pink",
        sector="Technology",
        industry="Diversified",
        float_shares=50_000_000,
        shares_outstanding=60_000_000,
        market_cap=20_000_000,
        reverse_split_count_3y=reverse_splits,
    )


def _fundamentals(dilution=5.0, delinquent=False, going_concern=False):
    return Fundamentals(
        symbol="TEST",
        market_cap=20_000_000,
        float_shares=50_000_000,
        shares_outstanding=60_000_000,
        cash=1_000_000,
        total_debt=500_000,
        revenue_ttm=2_000_000,
        net_income_ttm=100_000,
        dilution_12m_pct=dilution,
        going_concern_flag=going_concern,
        last_filing_date=datetime.now(timezone.utc) - timedelta(days=30),
        filing_delinquent=delinquent,
    )


def test_no_flags_for_clean_stock():
    assessment = assess_otc_specific_risk(_fundamentals(), _meta(), news=[])
    assert assessment.score == 0.0
    assert assessment.flags == []


def test_heavy_dilution_flag():
    assessment = assess_otc_specific_risk(_fundamentals(dilution=80.0), _meta(), news=[])
    codes = {f.code for f in assessment.flags}
    assert "toxic_dilution" in codes


def test_elevated_dilution_flag():
    assessment = assess_otc_specific_risk(_fundamentals(dilution=25.0), _meta(), news=[])
    codes = {f.code for f in assessment.flags}
    assert "elevated_dilution" in codes


def test_repeated_reverse_splits_flag():
    assessment = assess_otc_specific_risk(_fundamentals(), _meta(reverse_splits=3), news=[])
    codes = {f.code for f in assessment.flags}
    assert "repeated_reverse_splits" in codes


def test_no_reverse_split_flag_below_threshold():
    assessment = assess_otc_specific_risk(_fundamentals(), _meta(reverse_splits=1), news=[])
    codes = {f.code for f in assessment.flags}
    assert "repeated_reverse_splits" not in codes


def test_promotional_news_flag():
    news = [
        NewsArticle(
            symbol="TEST",
            published_at=datetime.now(timezone.utc),
            source="pennystockalerts.example",
            headline="TEST is about to explode!",
            url="https://example.com/1",
            sentiment=0.9,
            is_promotional=True,
        )
        for _ in range(3)
    ] + [
        NewsArticle(
            symbol="TEST",
            published_at=datetime.now(timezone.utc),
            source="wire.example",
            headline="TEST reports quarterly results",
            url="https://example.com/2",
            sentiment=0.0,
            is_promotional=False,
        )
    ]
    assessment = assess_otc_specific_risk(_fundamentals(), _meta(), news=news)
    codes = {f.code for f in assessment.flags}
    assert "promotional_campaign" in codes


def test_score_bounded_0_100():
    assessment = assess_otc_specific_risk(
        _fundamentals(dilution=90, delinquent=True, going_concern=True),
        _meta(reverse_splits=5),
        news=[],
    )
    assert 0 <= assessment.score <= 100
