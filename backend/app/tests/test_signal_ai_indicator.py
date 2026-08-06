"""AI Signals indicator additions to the Signal Engine: signal_type,
timeframe scoping, composed explanation, and the INSUFFICIENT_DATA path —
covers the "never fake a signal, say insufficient data instead" contract."""
import pytest

from app.db.models.signal import Signal
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.signals.engine import bars_for_timeframe, evaluate_signal


@pytest.fixture(scope="module")
def provider():
    return MockOTCProvider()


def test_signal_type_matches_status(db_session, provider):
    for meta in provider.get_universe(limit=8):
        s = evaluate_signal(meta.symbol, provider, db_session)
        if s.status in ("POSSIBLE_ENTRY", "SETUP_FORMING"):
            assert s.signal_type == "BUY"
        elif s.status == "AVOID":
            assert s.signal_type == "SELL"
        else:
            assert s.signal_type in ("HOLD", "INSUFFICIENT_DATA")


def test_explanation_is_never_empty(db_session, provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    s = evaluate_signal(symbol, provider, db_session)
    assert s.explanation and len(s.explanation) > 10


def test_daily_timeframe_has_enough_bars_and_never_insufficient(db_session, provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    s = evaluate_signal(symbol, provider, db_session, timeframe="1D")
    assert s.signal_type != "INSUFFICIENT_DATA"
    assert s.timeframe == "1D"


def test_intraday_timeframe_with_no_stream_history_is_insufficient_data(db_session, provider):
    # No stream was ever started for this symbol in this test process, so
    # the streaming service has zero accumulated bars for it — the engine
    # must say so honestly rather than substitute daily data or guess.
    symbol = provider.get_universe(limit=1)[0].symbol
    s = evaluate_signal(symbol, provider, db_session, timeframe="1H")
    assert s.signal_type == "INSUFFICIENT_DATA"
    assert s.ideal_entry is None
    assert s.targets == []
    assert "Insufficient" in s.explanation or "Not enough" in s.explanation
    assert any("bars available" in r for r in s.rejection_reasons)


def test_timeframes_keep_independent_signal_history(db_session, provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    daily = evaluate_signal(symbol, provider, db_session, timeframe="1D")
    hourly = evaluate_signal(symbol, provider, db_session, timeframe="1H")
    assert daily.id != hourly.id
    assert daily.timeframe == "1D"
    assert hourly.timeframe == "1H"

    daily_rows = db_session.query(Signal).filter_by(ticker_symbol=symbol, timeframe="1D").all()
    hourly_rows = db_session.query(Signal).filter_by(ticker_symbol=symbol, timeframe="1H").all()
    assert all(r.timeframe == "1D" for r in daily_rows)
    assert all(r.timeframe == "1H" for r in hourly_rows)


def test_bars_for_timeframe_daily_and_all_share_the_same_underlying_series(provider):
    # "1D" and "ALL" must be two views of ONE real fetched series, not two
    # independently regenerated ones — otherwise switching timeframe buttons
    # would show a completely different (still-synthetic-but-different)
    # price path instead of a consistent zoom on the same history.
    symbol = provider.get_universe(limit=1)[0].symbol
    daily = bars_for_timeframe(symbol, provider, "1D")
    everything = bars_for_timeframe(symbol, provider, "ALL")
    assert len(daily) > 0 and len(everything) >= len(daily)
    assert daily["close"].iloc[-1] == everything["close"].iloc[-1]
    assert list(daily.index) == list(everything.index[-len(daily):])


def test_bars_for_timeframe_weekly_resamples_without_fabricating(provider):
    symbol = provider.get_universe(limit=1)[0].symbol
    everything = bars_for_timeframe(symbol, provider, "ALL")
    weekly = bars_for_timeframe(symbol, provider, "1W")
    assert len(weekly) < len(everything)
    # The resampled close must be a real close price that actually occurred
    # in the same underlying series, never an invented value. Round both
    # sides consistently — comparing a raw float against a rounded set
    # would spuriously fail on trailing-digit noise past the 10th decimal.
    assert round(float(weekly["close"].iloc[-1]), 10) in set(everything["close"].round(10))


def test_bars_for_timeframe_intraday_with_no_stream_is_empty(provider):
    df = bars_for_timeframe("NEVERSTREAMED", provider, "5m")
    assert df.empty
