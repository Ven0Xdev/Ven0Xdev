"""Technical indicator computation, implemented directly on pandas/numpy so
the platform has no dependency on TA-Lib's C extension (hard to install in
constrained/serverless environments).

All functions accept a DataFrame with columns: open, high, low, close, volume
(bid/ask optional) indexed by timestamp ascending, and return either a Series
aligned to that index or a scalar "latest value".
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window, min_periods=max(2, window // 2)).mean()


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=max(2, span // 2)).mean()


def rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    avg_loss = loss.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + rs))
    return result.fillna(50.0)


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    fast_ema = ema(series, fast)
    slow_ema = ema(series, slow)
    macd_line = fast_ema - slow_ema
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "histogram": histogram})


def bollinger_bands(series: pd.Series, window: int = 20, num_std: float = 2.0) -> pd.DataFrame:
    mid = sma(series, window)
    std = series.rolling(window, min_periods=max(2, window // 2)).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    width_pct = ((upper - lower) / mid.replace(0, np.nan)) * 100
    return pd.DataFrame({"mid": mid, "upper": upper, "lower": lower, "width_pct": width_pct})


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    ranges = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    )
    return ranges.max(axis=1)


def atr(df: pd.DataFrame, window: int = 14) -> pd.Series:
    tr = true_range(df)
    return tr.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()


def adx(df: pd.DataFrame, window: int = 14) -> pd.Series:
    up_move = df["high"].diff()
    down_move = -df["low"].diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = true_range(df)
    atr_smooth = tr.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()

    plus_di = 100 * pd.Series(plus_dm, index=df.index).ewm(alpha=1 / window, adjust=False).mean() / atr_smooth.replace(0, np.nan)
    minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(alpha=1 / window, adjust=False).mean() / atr_smooth.replace(0, np.nan)

    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)).fillna(0)
    return dx.ewm(alpha=1 / window, adjust=False, min_periods=window).mean().fillna(0)


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff().fillna(0))
    return (direction * df["volume"]).cumsum()


def vwap(df: pd.DataFrame, window: int | None = None) -> pd.Series:
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    tp_vol = typical_price * df["volume"]
    if window:
        return tp_vol.rolling(window, min_periods=1).sum() / df["volume"].rolling(window, min_periods=1).sum().replace(0, np.nan)
    return tp_vol.cumsum() / df["volume"].cumsum().replace(0, np.nan)


def relative_volume(df: pd.DataFrame, window: int = 20) -> pd.Series:
    avg_vol = df["volume"].rolling(window, min_periods=max(2, window // 2)).mean()
    return (df["volume"] / avg_vol.replace(0, np.nan)).fillna(1.0)


def dollar_volume(df: pd.DataFrame) -> pd.Series:
    return df["close"] * df["volume"]


def gap_pct(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    return ((df["open"] - prev_close) / prev_close.replace(0, np.nan) * 100).fillna(0)


def week52_high_low(df: pd.DataFrame, periods: int = 252) -> pd.DataFrame:
    window = df["close"].tail(periods)
    high = window.max()
    low = window.min()
    last = df["close"].iloc[-1]
    pct_from_high = (last - high) / high * 100 if high else 0.0
    pct_from_low = (last - low) / low * 100 if low else 0.0
    return pd.DataFrame(
        {"high_52w": [high], "low_52w": [low], "pct_from_high": [pct_from_high], "pct_from_low": [pct_from_low]}
    )


def historical_volatility(df: pd.DataFrame, window: int = 20, annualize: bool = True) -> pd.Series:
    log_ret = np.log(df["close"] / df["close"].shift(1))
    vol = log_ret.rolling(window, min_periods=max(2, window // 2)).std()
    if annualize:
        vol = vol * np.sqrt(252)
    return (vol * 100).fillna(0)


def compute_technical_score(tech: dict) -> tuple[float, dict]:
    """0-100 composite technical score from the latest indicator snapshot."""
    rsi_component = 100 - abs(tech["rsi_14"] - 60) * 1.5  # sweet spot: healthy momentum, not blown-off-top
    rsi_component = float(np.clip(rsi_component, 0, 100))

    macd_component = float(np.clip(50 + np.sign(tech["macd_histogram"]) * min(abs(tech["macd_histogram"]) * 40, 50), 0, 100))

    trend_component = float(np.clip(tech["adx"] * 2.2, 0, 100))

    price_vs_sma20 = (tech["price"] / tech["sma_20"] - 1) * 100 if tech["sma_20"] else 0
    ma_component = float(np.clip(50 + price_vs_sma20 * 3, 0, 100))

    position_component = float(np.clip(100 + tech["pct_from_52w_high"] * 0.8, 0, 100))

    volume_component = float(np.clip(tech["relative_volume"] * 40, 0, 100))

    weights = {
        "rsi": 0.2,
        "macd": 0.2,
        "trend": 0.2,
        "moving_avg": 0.2,
        "position": 0.1,
        "volume": 0.1,
    }
    components = {
        "rsi": rsi_component,
        "macd": macd_component,
        "trend": trend_component,
        "moving_avg": ma_component,
        "position": position_component,
        "volume": volume_component,
    }
    total = sum(components[k] * w for k, w in weights.items())
    return float(np.clip(total, 0, 100)), components


def compute_technical_series(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorized, causal indicator series for every row of df in one pass.

    Every indicator here (rolling/ewm-based) only looks backward from each
    row, so this is safe to compute once for a whole symbol's history and
    then index by position — unlike calling `compute_all_technical_features`
    on a growing `df.iloc[:i+1]` slice at every bar (which is O(n^2) and is
    what the backtest engine used to do). Used as the fast path for
    bar-by-bar strategy signals in `services/backtest`.
    """
    close = df["close"]
    macd_df = macd(close)
    bb = bollinger_bands(close)
    rvol = relative_volume(df)
    atr_series = atr(df)

    rolling_high_252 = close.rolling(252, min_periods=1).max()
    rolling_low_252 = close.rolling(252, min_periods=1).min()

    if "bid" in df and "ask" in df:
        spread_pct = (df["ask"] - df["bid"]) / ((df["ask"] + df["bid"]) / 2).replace(0, np.nan) * 100
    else:
        spread_pct = pd.Series(2.0, index=df.index)

    return pd.DataFrame(
        {
            "price": close,
            "rsi_14": rsi(close, 14),
            "macd_histogram": macd_df["histogram"],
            "bb_width_pct": bb["width_pct"].fillna(0.0),
            "atr": atr_series,
            "atr_pct": (atr_series / close.replace(0, np.nan) * 100).fillna(0.0),
            "adx": adx(df),
            "relative_volume": rvol,
            "gap_pct": gap_pct(df),
            "pct_from_52w_high": ((close - rolling_high_252) / rolling_high_252.replace(0, np.nan) * 100).fillna(0.0),
            "spread_pct": spread_pct.fillna(2.0),
        },
        index=df.index,
    )


def compute_all_technical_features(df: pd.DataFrame) -> dict:
    """Compute the latest value of every technical indicator for scoring."""
    if len(df) < 5:
        raise ValueError("Need at least 5 bars to compute technical features")

    close = df["close"]
    macd_df = macd(close)
    bb = bollinger_bands(close)
    week52 = week52_high_low(df)
    rvol = relative_volume(df)
    dvol = dollar_volume(df)

    latest_bid = float(df["bid"].iloc[-1]) if "bid" in df else float(close.iloc[-1]) * 0.99
    latest_ask = float(df["ask"].iloc[-1]) if "ask" in df else float(close.iloc[-1]) * 1.01
    spread_pct = (latest_ask - latest_bid) / ((latest_ask + latest_bid) / 2) * 100 if (latest_ask + latest_bid) else 0.0

    return {
        "price": float(close.iloc[-1]),
        "sma_20": float(sma(close, 20).iloc[-1]),
        "sma_50": float(sma(close, 50).iloc[-1]) if len(df) >= 50 else float(sma(close, len(df)).iloc[-1]),
        "ema_9": float(ema(close, 9).iloc[-1]),
        "ema_21": float(ema(close, 21).iloc[-1]),
        "rsi_14": float(rsi(close, 14).iloc[-1]),
        "macd": float(macd_df["macd"].iloc[-1]),
        "macd_signal": float(macd_df["signal"].iloc[-1]),
        "macd_histogram": float(macd_df["histogram"].iloc[-1]),
        "bb_upper": float(bb["upper"].iloc[-1]),
        "bb_lower": float(bb["lower"].iloc[-1]),
        "bb_width_pct": float(bb["width_pct"].iloc[-1]) if not np.isnan(bb["width_pct"].iloc[-1]) else 0.0,
        "atr": float(atr(df).iloc[-1]),
        "atr_pct": float(atr(df).iloc[-1] / close.iloc[-1] * 100) if close.iloc[-1] else 0.0,
        "adx": float(adx(df).iloc[-1]),
        "obv": float(obv(df).iloc[-1]),
        "vwap": float(vwap(df).iloc[-1]),
        "relative_volume": float(rvol.iloc[-1]),
        "dollar_volume": float(dvol.iloc[-1]),
        "avg_dollar_volume_20d": float(dvol.rolling(20, min_periods=1).mean().iloc[-1]),
        "gap_pct": float(gap_pct(df).iloc[-1]),
        "week52_high": float(week52["high_52w"].iloc[0]),
        "week52_low": float(week52["low_52w"].iloc[0]),
        "pct_from_52w_high": float(week52["pct_from_high"].iloc[0]),
        "pct_from_52w_low": float(week52["pct_from_low"].iloc[0]),
        "historical_volatility_pct": float(historical_volatility(df).iloc[-1]),
        "spread_pct": float(spread_pct),
        "bid": latest_bid,
        "ask": latest_ask,
    }
