import numpy as np
import pandas as pd

from app.services.features import technical


def _make_df(n=120, seed=1):
    rng = np.random.default_rng(seed)
    prices = 2.0 * np.exp(np.cumsum(rng.normal(0.001, 0.02, n)))
    dates = pd.bdate_range(end=pd.Timestamp.utcnow().normalize(), periods=n)
    df = pd.DataFrame(
        {
            "open": prices * (1 + rng.normal(0, 0.005, n)),
            "high": prices * (1 + np.abs(rng.normal(0.01, 0.005, n))),
            "low": prices * (1 - np.abs(rng.normal(0.01, 0.005, n))),
            "close": prices,
            "volume": np.abs(rng.normal(500_000, 100_000, n)),
            "bid": prices * 0.99,
            "ask": prices * 1.01,
        },
        index=dates,
    )
    return df


def test_rsi_bounds():
    df = _make_df()
    values = technical.rsi(df["close"])
    assert (values.dropna() >= 0).all()
    assert (values.dropna() <= 100).all()


def test_macd_shapes():
    df = _make_df()
    macd_df = technical.macd(df["close"])
    assert set(macd_df.columns) == {"macd", "signal", "histogram"}
    assert len(macd_df) == len(df)


def test_bollinger_bands_ordering():
    df = _make_df()
    bb = technical.bollinger_bands(df["close"])
    valid = bb.dropna()
    assert (valid["upper"] >= valid["mid"]).all()
    assert (valid["mid"] >= valid["lower"]).all()


def test_atr_positive():
    df = _make_df()
    values = technical.atr(df)
    assert (values.dropna() >= 0).all()


def test_compute_all_technical_features_keys():
    df = _make_df()
    feats = technical.compute_all_technical_features(df)
    expected_keys = {
        "price", "sma_20", "sma_50", "ema_9", "ema_21", "rsi_14", "macd", "macd_signal",
        "macd_histogram", "bb_upper", "bb_lower", "bb_width_pct", "atr", "atr_pct", "adx",
        "obv", "vwap", "relative_volume", "dollar_volume", "avg_dollar_volume_20d", "gap_pct",
        "week52_high", "week52_low", "pct_from_52w_high", "pct_from_52w_low",
        "historical_volatility_pct", "spread_pct", "bid", "ask",
    }
    assert expected_keys.issubset(feats.keys())
    assert feats["price"] > 0


def test_technical_score_in_bounds():
    df = _make_df()
    feats = technical.compute_all_technical_features(df)
    score, components = technical.compute_technical_score(feats)
    assert 0 <= score <= 100
    assert all(0 <= v <= 100 for v in components.values())


def test_relative_volume_defaults_to_one_when_flat():
    df = _make_df()
    df["volume"] = 1000.0
    rvol = technical.relative_volume(df)
    assert np.isclose(rvol.iloc[-1], 1.0, atol=0.01)
