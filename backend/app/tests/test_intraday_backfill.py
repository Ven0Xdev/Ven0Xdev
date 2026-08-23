"""_intraday_bars_with_backfill (signals/engine.py): merges the streaming
service's live-accumulated bars with a provider's real REST intraday
history — REST wins on any timestamp overlap (an official closed bar beats
one this process may have only partially observed after subscribing
mid-minute), stream bars fill in anything newer than the backfill's last
timestamp. Never fabricated: with neither source available, the same
empty frame as before is returned.
"""
import datetime as dt

import pandas as pd
import pytest

from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.signals.engine import _intraday_bars_with_backfill, bars_for_timeframe, candle_provenance
from app.services.streaming import service as streaming_service
from app.services.streaming.core import CandleAggregator, TradeEvent


@pytest.fixture(autouse=True)
def _reset_stream_service():
    streaming_service._service = None
    yield
    streaming_service._service = None


class _NoBackfillProvider(MarketDataProvider):
    """Every real adapter besides Alpaca — inherits base.py's honest
    get_intraday_bars() default, which raises ProviderDataUnavailable."""

    name = "mock"
    data_mode = "synthetic"

    def get_universe(self, limit=None): return []
    def get_ticker_meta(self, symbol): raise NotImplementedError
    def get_ohlcv(self, symbol, timeframe="1d", lookback_days=250): raise NotImplementedError
    def get_quote(self, symbol): raise NotImplementedError
    def get_fundamentals(self, symbol): raise NotImplementedError
    def get_news(self, symbol, limit=20): return []
    def get_corporate_actions(self, symbol): return []


class _BackfillProvider(_NoBackfillProvider):
    name = "alpaca"
    data_mode = "live"

    def __init__(self, df: pd.DataFrame):
        self._df = df

    def get_intraday_bars(self, symbol, lookback_minutes=390):
        if self._df.empty:
            raise ProviderDataUnavailable("no intraday bars")
        return self._df


def _bar_df(rows) -> pd.DataFrame:
    idx = pd.to_datetime([r[0] for r in rows], utc=True)
    return pd.DataFrame(
        {
            "open": [r[1] for r in rows], "high": [r[2] for r in rows],
            "low": [r[3] for r in rows], "close": [r[4] for r in rows],
            "volume": [r[5] for r in rows],
        },
        index=pd.DatetimeIndex(idx, name="ts"),
    )


def _seed_stream_bar(symbol: str, ts: dt.datetime, price: float, provider="alpaca-ws", data_mode="live"):
    service = streaming_service.get_stream_service()
    if symbol not in service._aggs:
        service._aggs[symbol] = CandleAggregator(symbol)
    service._aggs[symbol].add_trade(TradeEvent(
        symbol=symbol, price=price, volume=10.0, source_ts=ts.timestamp(),
        received_ts=ts.timestamp(), provider=provider, data_mode=data_mode, seq=int(ts.timestamp()),
    ))


def test_no_backfill_no_stream_returns_empty():
    df = _intraday_bars_with_backfill("AAPL", _NoBackfillProvider())
    assert df.empty


def test_backfill_only_returns_backfill_bars():
    backfill = _bar_df([("2024-01-01T09:30:00Z", 1, 2, 0.5, 1.5, 100)])
    df = _intraday_bars_with_backfill("AAPL", _BackfillProvider(backfill))
    assert len(df) == 1
    assert df["close"].iloc[0] == 1.5


def test_stream_only_when_provider_has_no_backfill():
    ts = dt.datetime(2024, 1, 1, 9, 31, tzinfo=dt.timezone.utc)
    _seed_stream_bar("AAPL", ts, 2.0)
    df = _intraday_bars_with_backfill("AAPL", _NoBackfillProvider())
    assert len(df) == 1
    assert df["close"].iloc[0] == 2.0


def test_merge_dedupes_overlap_rest_wins():
    overlap_ts = dt.datetime(2024, 1, 1, 9, 30, tzinfo=dt.timezone.utc)
    backfill = _bar_df([("2024-01-01T09:30:00Z", 1, 1.2, 0.9, 1.1, 500)])  # official REST bar
    _seed_stream_bar("AAPL", overlap_ts, 999.0)  # partial stream observation for the SAME minute
    df = _intraday_bars_with_backfill("AAPL", _BackfillProvider(backfill))
    assert len(df) == 1  # deduped, not two rows for the same minute
    assert df["close"].iloc[0] == 1.1  # REST wins the overlap, not the partial stream value


def test_merge_keeps_stream_bars_newer_than_backfill():
    newer_ts = dt.datetime(2024, 1, 1, 9, 35, tzinfo=dt.timezone.utc)
    backfill = _bar_df([("2024-01-01T09:30:00Z", 1, 1, 1, 1, 100)])
    _seed_stream_bar("AAPL", newer_ts, 5.0)
    df = _intraday_bars_with_backfill("AAPL", _BackfillProvider(backfill))
    assert len(df) == 2
    assert df.index[-1] == pd.Timestamp(newer_ts)
    assert df["close"].iloc[-1] == 5.0


def test_merged_bars_are_sorted_chronologically():
    backfill = _bar_df([
        ("2024-01-01T09:32:00Z", 1, 1, 1, 1, 100),
        ("2024-01-01T09:30:00Z", 1, 1, 1, 1, 100),
    ])
    df = _intraday_bars_with_backfill("AAPL", _BackfillProvider(backfill))
    assert list(df.index) == sorted(df.index)


def test_candle_provenance_prefers_stream_when_available():
    ts = dt.datetime(2024, 1, 1, 9, 30, tzinfo=dt.timezone.utc)
    _seed_stream_bar("AAPL", ts, 1.0, provider="alpaca-ws", data_mode="live")
    source, mode = candle_provenance("AAPL", _NoBackfillProvider(), "1m")
    assert source == "alpaca-ws" and mode == "live"


def test_candle_provenance_falls_back_to_backfill_provider_identity():
    backfill = _bar_df([("2024-01-01T09:30:00Z", 1, 1, 1, 1, 100)])
    source, mode = candle_provenance("AAPL", _BackfillProvider(backfill), "1m")
    assert source == "alpaca" and mode == "live"


def test_candle_provenance_honest_unknown_when_nothing_available():
    source, mode = candle_provenance("AAPL", _NoBackfillProvider(), "1m")
    assert source == "stream" and mode == "unspecified"


def test_bars_for_timeframe_1m_never_resamples_backfilled_bars():
    backfill = _bar_df([
        ("2024-01-01T09:30:00Z", 1, 1, 1, 1, 100),
        ("2024-01-01T09:31:00Z", 1, 1, 1, 2, 100),
    ])
    df = bars_for_timeframe("AAPL", _BackfillProvider(backfill), "1m")
    assert len(df) == 2  # untouched — one row per real minute bar, no resample
