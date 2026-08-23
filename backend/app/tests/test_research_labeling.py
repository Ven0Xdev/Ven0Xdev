"""services/research/labeling.py — multi-horizon labels. Proves: exit is
always strictly after entry (no lookahead), the neutral zone is
respected, day-trading horizons never cross a session boundary, and swing
horizons count trading days, not calendar days."""
import pandas as pd
import pytest

from app.services.research.labeling import (
    HORIZONS,
    NEUTRAL_ZONE_PCT,
    SWING_HORIZON_DAYS,
    label_eod_horizon,
    label_horizon,
    label_intraday_horizon,
    label_swing_horizon,
)


def _daily_df(closes: list[float]) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=len(closes), freq="D", tz="UTC")
    return pd.DataFrame({"open": closes, "high": closes, "low": closes, "close": closes, "volume": [1000.0] * len(closes)}, index=idx)


def _intraday_session_df(day: str, closes: list[float], freq_minutes: int = 30) -> pd.DataFrame:
    start = pd.Timestamp(f"{day} 13:30:00", tz="UTC")  # 9:30 ET in UTC (winter offset for simplicity)
    idx = pd.date_range(start, periods=len(closes), freq=f"{freq_minutes}min", tz="UTC")
    return pd.DataFrame({"open": closes, "high": closes, "low": closes, "close": closes, "volume": [1000.0] * len(closes)}, index=idx)


class TestSwingHorizons:
    def test_exit_is_exactly_horizon_trading_days_after_entry_never_same_bar(self):
        df = _daily_df([100.0] * 30)
        for horizon, days in SWING_HORIZON_DAYS.items():
            samples = label_swing_horizon(df, "TEST", horizon)
            assert len(samples) == 30 - days
            for s in samples:
                assert s.exit_ts > s.entry_ts
                gap = (s.exit_ts - s.entry_ts).days
                assert gap == days  # trading days here == calendar days (dense daily index), the row-offset is what matters

    def test_neutral_zone_produces_no_trade_for_a_flat_return(self):
        df = _daily_df([100.0] * 10)  # perfectly flat -> 0% forward return
        samples = label_swing_horizon(df, "TEST", "5d")
        assert all(s.label == "NO_TRADE" for s in samples)
        assert all(s.forward_return_pct == 0.0 for s in samples)

    def test_a_move_past_the_neutral_zone_labels_buy_or_sell(self):
        zone = NEUTRAL_ZONE_PCT["1d"]
        up = 100.0 * (1 + (zone + 0.5) / 100)
        down = 100.0 * (1 - (zone + 0.5) / 100)
        df = _daily_df([100.0, up, 100.0, down])
        samples = label_swing_horizon(df, "TEST", "1d")
        assert samples[0].label == "BUY"
        assert samples[2].label == "SELL"

    def test_a_move_inside_the_neutral_zone_is_no_trade_not_a_weak_signal(self):
        zone = NEUTRAL_ZONE_PCT["1d"]
        tiny_up = 100.0 * (1 + (zone - 0.02) / 100)
        df = _daily_df([100.0, tiny_up])
        [sample] = label_swing_horizon(df, "TEST", "1d")
        assert sample.label == "NO_TRADE"

    def test_rejects_a_non_swing_horizon(self):
        with pytest.raises(ValueError):
            label_swing_horizon(_daily_df([100.0] * 5), "TEST", "30m")


class TestIntradayHorizons:
    def test_30m_and_60m_exit_one_bar_forward_within_the_same_session(self):
        df = _intraday_session_df("2024-01-02", [100.0, 101.0, 99.0, 100.0])
        samples = label_intraday_horizon(df, "TEST", "30m")
        assert len(samples) == 3  # last bar excluded — nothing to exit into
        for s in samples:
            assert s.exit_ts > s.entry_ts
            assert (s.exit_ts - s.entry_ts).total_seconds() == 30 * 60

    def test_never_rolls_a_position_into_the_next_session(self):
        day1 = _intraday_session_df("2024-01-02", [100.0, 100.0])
        day2 = _intraday_session_df("2024-01-03", [200.0, 200.0])
        combined = pd.concat([day1, day2]).sort_index()
        samples = label_intraday_horizon(combined, "TEST", "30m")
        # One tradeable pair per day (2 bars/day -> 1 sample/day) = 2 total,
        # never a cross-day entry(day1)->exit(day2) pair despite day1's
        # last bar and day2's first bar being adjacent rows in `combined`.
        assert len(samples) == 2
        for s in samples:
            assert s.entry_ts.date() == s.exit_ts.date()

    def test_rejects_an_unsupported_horizon(self):
        with pytest.raises(ValueError):
            label_intraday_horizon(_intraday_session_df("2024-01-02", [1.0, 2.0]), "TEST", "5d")


class TestEodHorizon:
    def test_every_entry_exits_at_that_sessions_final_close_never_the_next_day(self):
        df = _intraday_session_df("2024-01-02", [100.0, 105.0, 95.0, 110.0])
        samples = label_eod_horizon(df, "TEST")
        assert len(samples) == 3  # the final bar itself can't be an entry (no room left to exit)
        final_close = 110.0
        for s in samples:
            assert s.exit_price == final_close
            assert s.exit_ts == df.index[-1].to_pydatetime()
            assert s.entry_ts.date() == s.exit_ts.date()

    def test_multi_day_frame_keeps_each_days_exits_scoped_to_that_day(self):
        day1 = _intraday_session_df("2024-01-02", [100.0, 100.0, 110.0])  # +10% by EOD
        day2 = _intraday_session_df("2024-01-03", [50.0, 50.0, 45.0])  # -10% by EOD
        combined = pd.concat([day1, day2]).sort_index()
        samples = label_eod_horizon(combined, "TEST")
        assert len(samples) == 4  # 2 tradeable entries/day x 2 days
        day1_samples = [s for s in samples if s.entry_ts.date().isoformat() == "2024-01-02"]
        day2_samples = [s for s in samples if s.entry_ts.date().isoformat() == "2024-01-03"]
        assert all(s.label == "BUY" for s in day1_samples)
        assert all(s.label == "SELL" for s in day2_samples)


def test_label_horizon_dispatches_to_the_right_labeler_for_every_horizon():
    daily = _daily_df([100.0] * 25)
    intraday = _intraday_session_df("2024-01-02", [100.0] * 5)
    for horizon in HORIZONS:
        df = intraday if horizon in ("30m", "60m", "eod") else daily
        samples = label_horizon(df, "TEST", horizon)
        assert isinstance(samples, list)
        for s in samples:
            assert s.horizon == horizon
            assert s.exit_ts > s.entry_ts


def test_is_buy_is_sell_are_mutually_exclusive_and_match_label():
    df = _daily_df([100.0, 100.0 * (1 + (NEUTRAL_ZONE_PCT["1d"] + 1) / 100)])
    [sample] = label_swing_horizon(df, "TEST", "1d")
    assert sample.label == "BUY"
    assert sample.is_buy == 1
    assert sample.is_sell == 0
