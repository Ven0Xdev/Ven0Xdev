from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from app.services.data_providers.base import Fundamentals, TickerMeta
from app.services.features.manipulation import assess_manipulation_risk


def _clean_df(n=60, seed=3):
    rng = np.random.default_rng(seed)
    prices = 2.0 * np.exp(np.cumsum(rng.normal(0.001, 0.01, n)))
    dates = pd.bdate_range(end=pd.Timestamp.utcnow().normalize(), periods=n)
    return pd.DataFrame(
        {
            "open": prices,
            "high": prices * 1.01,
            "low": prices * 0.99,
            "close": prices,
            "volume": np.full(n, 500_000.0),
            "bid": prices * 0.995,
            "ask": prices * 1.005,
        },
        index=dates,
    )


def _pump_dump_df(n=60, seed=5):
    df = _clean_df(n=n, seed=seed)
    close = df["close"].to_numpy(copy=True)
    peak = n - 8
    for i in range(peak - 6, peak):
        close[i] = close[i - 1] * 1.25
    for i in range(peak, min(peak + 8, n)):
        close[i] = close[i - 1] * 0.85
    df["close"] = close
    df["high"] = df["close"] * 1.02
    df["low"] = df["close"] * 0.98
    df["open"] = df["close"].shift(1).fillna(df["close"].iloc[0])
    volume = df["volume"].to_numpy(copy=True)
    volume[peak - 6 : peak + 8] *= 8
    df["volume"] = volume
    return df


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


def test_clean_stock_has_low_manipulation_risk():
    df = _clean_df()
    assessment = assess_manipulation_risk(df, _meta(), _fundamentals(), news=[], spread_pct=1.0, avg_dollar_volume=1_000_000)
    assert assessment.score < 30


def test_pump_and_dump_pattern_detected():
    df = _pump_dump_df()
    assessment = assess_manipulation_risk(df, _meta(), _fundamentals(), news=[], spread_pct=1.0, avg_dollar_volume=1_000_000)
    codes = {f.code for f in assessment.flags}
    assert "pump_and_dump_pattern" in codes or "volume_spike_no_catalyst" in codes
    assert assessment.score > 30


def test_heavy_dilution_flag():
    df = _clean_df()
    assessment = assess_manipulation_risk(
        df, _meta(), _fundamentals(dilution=80.0), news=[], spread_pct=1.0, avg_dollar_volume=1_000_000
    )
    codes = {f.code for f in assessment.flags}
    assert "toxic_dilution" in codes


def test_repeated_reverse_splits_flag():
    df = _clean_df()
    assessment = assess_manipulation_risk(
        df, _meta(reverse_splits=3), _fundamentals(), news=[], spread_pct=1.0, avg_dollar_volume=1_000_000
    )
    codes = {f.code for f in assessment.flags}
    assert "repeated_reverse_splits" in codes


def test_wide_spread_flag():
    df = _clean_df()
    assessment = assess_manipulation_risk(df, _meta(), _fundamentals(), news=[], spread_pct=25.0, avg_dollar_volume=1_000_000)
    codes = {f.code for f in assessment.flags}
    assert "abnormal_spread" in codes


def test_score_bounded_0_100():
    df = _pump_dump_df()
    assessment = assess_manipulation_risk(
        df,
        _meta(reverse_splits=3),
        _fundamentals(dilution=90, delinquent=True, going_concern=True),
        news=[],
        spread_pct=30.0,
        avg_dollar_volume=1000,
    )
    assert 0 <= assessment.score <= 100
