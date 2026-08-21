"""Phase 2+3 glue — joins labeling.py's forward-return labels with
features.py's point-in-time feature snapshots into one dataset per
horizon, ready for services/research/training.py's walk-forward harness.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models.historical_bar import HistoricalBar
from app.services.research.features import FeatureSnapshot, build_feature_snapshot
from app.services.research.labeling import INTRADAY_HORIZONS, SWING_HORIZONS, label_horizon

FEATURE_WINDOW_BARS = 260  # ~52 weeks of daily bars; also a sane recent-history cap for 30m/60m series

# Every bar is used as a potential entry for daily/swing horizons (dense,
# non-subsampled — the more rigorous choice for genuine walk-forward
# evidence). Intraday horizons subsample by `step` purely for runtime
# (30m bars run ~13x/session x ~1,650 sessions x 20 symbols) — a
# performance choice, never a correctness one: every kept row is still
# computed with the exact same no-lookahead window as every skipped one.
_STEP = {"30m": 3, "60m": 2, "eod": 2, "1d": 1, "5d": 1, "10d": 1, "20d": 1}


@dataclass
class ResearchSample:
    ticker_symbol: str
    horizon: str
    entry_ts: datetime
    exit_ts: datetime
    label: str  # BUY | SELL | NO_TRADE
    is_buy: int
    is_sell: int
    forward_return_pct: float
    exit_price: float
    features: FeatureSnapshot


def _bars_to_df(rows: list[HistoricalBar]) -> pd.DataFrame:
    idx = pd.DatetimeIndex([r.ts for r in rows], tz="UTC", name="ts")
    return pd.DataFrame(
        {"open": [r.open for r in rows], "high": [r.high for r in rows], "low": [r.low for r in rows],
         "close": [r.close for r in rows], "volume": [r.volume for r in rows]},
        index=idx,
    )


def _load_bars(db: Session, symbol: str, timeframe: str, regular_session_only: bool) -> pd.DataFrame:
    query = db.query(HistoricalBar).filter_by(ticker_symbol=symbol, timeframe=timeframe)
    if regular_session_only:
        query = query.filter(HistoricalBar.session == "regular")
    rows = query.order_by(HistoricalBar.ts).all()
    return _bars_to_df(rows) if rows else pd.DataFrame(columns=["open", "high", "low", "close", "volume"])


def build_horizon_dataset(
    db: Session, symbols: list[str], horizon: str, benchmark_symbols: tuple[str, ...] = ("SPY", "QQQ"),
) -> list[ResearchSample]:
    """One entry per (symbol, real historical bar) that survived
    labeling.py's session/holding-period rules, each with a real
    point-in-time feature snapshot. Symbols with zero HistoricalBar rows
    at the horizon's required resolution (not yet backfilled, or an
    instrument type — e.g. an ETF — with no fundamentals but real price
    history) are silently skipped for THIS horizon only, never padded
    with a fabricated row.
    """
    timeframe = "1d" if horizon in SWING_HORIZONS else ("30m" if horizon == "eod" else horizon)
    is_intraday = horizon in INTRADAY_HORIZONS
    step = _STEP[horizon]

    benchmark_bars: dict[str, pd.DataFrame] = {}
    for bsym in benchmark_symbols:
        df = _load_bars(db, bsym, "1d", regular_session_only=False)
        if not df.empty:
            benchmark_bars[bsym] = df

    samples: list[ResearchSample] = []
    for symbol in symbols:
        df = _load_bars(db, symbol, timeframe, regular_session_only=is_intraday)
        if df.empty or len(df) < 30:
            continue
        labeled = label_horizon(df, symbol, horizon)[::step]
        for lbl in labeled:
            window = df.loc[:lbl.entry_ts].tail(FEATURE_WINDOW_BARS)
            spy_window = benchmark_bars.get("SPY")
            if spy_window is not None:
                spy_window = spy_window.loc[:lbl.entry_ts].tail(FEATURE_WINDOW_BARS)
            qqq_window = benchmark_bars.get("QQQ")
            if qqq_window is not None:
                qqq_window = qqq_window.loc[:lbl.entry_ts].tail(FEATURE_WINDOW_BARS)

            snap = build_feature_snapshot(db, window, symbol, lbl.entry_ts, spy_window, qqq_window)
            if snap is None:
                continue
            samples.append(ResearchSample(
                ticker_symbol=symbol, horizon=horizon, entry_ts=lbl.entry_ts, exit_ts=lbl.exit_ts, label=lbl.label,
                is_buy=lbl.is_buy, is_sell=lbl.is_sell, forward_return_pct=lbl.forward_return_pct,
                exit_price=lbl.exit_price, features=snap,
            ))
    return samples
