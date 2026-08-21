"""services/research/features.py — the point-in-time correctness the
whole research pipeline depends on. Proves a fact/article dated after
`as_of` is never visible to a feature computed AT `as_of`, and that
missing fundamentals/news are reported as genuinely unavailable, never
silently imputed as neutral."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from app.db.models.historical_news import HistoricalNewsArticle
from app.db.models.point_in_time_fundamental import PointInTimeFundamental
from app.services.research.features import RESEARCH_FEATURE_NAMES, build_feature_snapshot

SYMBOL = "PITTEST"


def _bars(n: int = 60, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq="D", tz="UTC")
    closes = 100 + np.cumsum(rng.normal(0, 1, n))
    closes = np.clip(closes, 10, None)
    return pd.DataFrame(
        {"open": closes, "high": closes * 1.01, "low": closes * 0.99, "close": closes, "volume": rng.uniform(1e5, 1e6, n)},
        index=idx,
    )


def _fact(ticker: str, concept: str, period_end: datetime, filed_date: datetime, value: float) -> PointInTimeFundamental:
    return PointInTimeFundamental(
        ticker_symbol=ticker, taxonomy="us-gaap", concept=concept, unit="USD",
        period_end=period_end, filed_date=filed_date, form="10-Q", value=value,
    )


class TestFundamentalsPointInTime:
    def test_a_fact_filed_after_as_of_is_invisible(self, db_session):
        as_of = datetime(2024, 6, 1, tzinfo=timezone.utc)
        db_session.add(_fact(SYMBOL, "Revenues", datetime(2024, 5, 31, tzinfo=timezone.utc), datetime(2024, 6, 15, tzinfo=timezone.utc), 1_000_000))
        db_session.commit()

        snap = build_feature_snapshot(db_session, _bars(), SYMBOL, as_of)
        assert snap is not None
        assert snap.values["fundamental_data_available"] == 0.0

    def test_a_fact_filed_before_as_of_is_visible_and_yoy_computed_correctly(self, db_session):
        as_of = datetime(2024, 6, 1, tzinfo=timezone.utc)
        db_session.add(_fact(SYMBOL, "Revenues", datetime(2023, 3, 31, tzinfo=timezone.utc), datetime(2023, 4, 15, tzinfo=timezone.utc), 1_000_000))
        db_session.add(_fact(SYMBOL, "Revenues", datetime(2024, 3, 31, tzinfo=timezone.utc), datetime(2024, 4, 15, tzinfo=timezone.utc), 1_100_000))
        db_session.commit()

        snap = build_feature_snapshot(db_session, _bars(), SYMBOL, as_of)
        assert snap is not None
        assert snap.values["fundamental_data_available"] == 1.0
        assert snap.values["fundamental_revenue_yoy_pct"] == pytest.approx(10.0, abs=0.01)

    def test_a_fact_filed_exactly_after_as_of_by_one_day_does_not_leak_in(self, db_session):
        as_of = datetime(2024, 4, 14, tzinfo=timezone.utc)
        db_session.add(_fact(SYMBOL, "Revenues", datetime(2024, 3, 31, tzinfo=timezone.utc), datetime(2024, 4, 15, tzinfo=timezone.utc), 999.0))
        db_session.commit()

        snap = build_feature_snapshot(db_session, _bars(), SYMBOL, as_of)
        assert snap is not None
        assert snap.values["fundamental_data_available"] == 0.0


class TestNewsPointInTime:
    def test_no_news_ever_backfilled_is_reported_unavailable_not_neutral(self, db_session):
        snap = build_feature_snapshot(db_session, _bars(), SYMBOL, datetime(2024, 6, 1, tzinfo=timezone.utc))
        assert snap is not None
        assert snap.values["news_data_available"] == 0.0
        assert snap.values["news_count_7d"] == 0.0

    def test_an_article_published_after_as_of_is_invisible(self, db_session):
        as_of = datetime(2024, 6, 1, tzinfo=timezone.utc)
        # One article safely in the past so news_data_available flips to 1...
        db_session.add(HistoricalNewsArticle(
            ticker_symbol=SYMBOL, headline="old news", url="https://example.com/old",
            published_at=as_of - timedelta(days=60), sentiment_score=0.5, source="test", data_source="alphavantage",
        ))
        # ...and one published AFTER as_of, which must never count toward the 7d window.
        db_session.add(HistoricalNewsArticle(
            ticker_symbol=SYMBOL, headline="future news", url="https://example.com/future",
            published_at=as_of + timedelta(days=1), sentiment_score=-0.9, source="test", data_source="alphavantage",
        ))
        db_session.commit()

        snap = build_feature_snapshot(db_session, _bars(), SYMBOL, as_of)
        assert snap is not None
        assert snap.values["news_data_available"] == 1.0
        assert snap.values["news_count_7d"] == 0.0  # the only real article is 60 days outside the 7d window

    def test_articles_inside_the_lookback_window_are_averaged_honestly(self, db_session):
        as_of = datetime(2024, 6, 10, tzinfo=timezone.utc)
        for i, score in enumerate([0.5, -0.5]):
            db_session.add(HistoricalNewsArticle(
                ticker_symbol=SYMBOL, headline=f"n{i}", url=f"https://example.com/{i}",
                published_at=as_of - timedelta(days=2), sentiment_score=score, source="test", data_source="alphavantage",
            ))
        db_session.commit()

        snap = build_feature_snapshot(db_session, _bars(), SYMBOL, as_of)
        assert snap is not None
        assert snap.values["news_count_7d"] == 2.0
        assert snap.values["news_sentiment_avg_7d"] == pytest.approx(0.0, abs=1e-9)


def test_returns_none_rather_than_a_fabricated_row_when_the_window_is_too_short():
    tiny = _bars(n=5)
    snap = build_feature_snapshot(None, tiny, SYMBOL, datetime(2024, 1, 5, tzinfo=timezone.utc))  # type: ignore[arg-type]
    assert snap is None


def test_every_declared_feature_name_is_always_populated(db_session):
    snap = build_feature_snapshot(db_session, _bars(), SYMBOL, datetime(2024, 6, 1, tzinfo=timezone.utc))
    assert snap is not None
    assert set(snap.values.keys()) == set(RESEARCH_FEATURE_NAMES)
    assert all(isinstance(v, float) for v in snap.values.values())
    assert snap.as_vector() == [snap.values[name] for name in RESEARCH_FEATURE_NAMES]
