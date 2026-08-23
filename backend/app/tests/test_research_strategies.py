"""services/research/strategies.py — five transparent, rule-based
strategy families. Proves each rule fires BUY/SELL/NO_TRADE exactly
where its own definition says it should, using synthetic feature dicts
(never real backtest data — that's what test_research_strategy_evaluation.py
covers) so each rule's logic is verified in isolation."""
from app.services.research.features import RESEARCH_FEATURE_NAMES
from app.services.research.strategies import (
    STRATEGIES,
    breakout,
    mean_reversion,
    multi_factor_confirmation,
    trend_momentum,
    volatility_regime,
)


def _base() -> dict:
    return dict.fromkeys(RESEARCH_FEATURE_NAMES, 0.0)


class TestTrendMomentum:
    def test_fires_buy_on_full_bullish_alignment(self):
        f = _base()
        f.update(price_vs_sma20_pct=2.0, price_vs_ema9_pct=1.0, macd_histogram=0.5, regime_slope_pct=1.0)
        assert trend_momentum(f) == "BUY"

    def test_fires_sell_on_full_bearish_alignment(self):
        f = _base()
        f.update(price_vs_sma20_pct=-2.0, price_vs_ema9_pct=-1.0, macd_histogram=-0.5, regime_slope_pct=-1.0)
        assert trend_momentum(f) == "SELL"

    def test_no_trade_on_mixed_signals(self):
        f = _base()
        f.update(price_vs_sma20_pct=2.0, price_vs_ema9_pct=-1.0, macd_histogram=0.5, regime_slope_pct=1.0)
        assert trend_momentum(f) == "NO_TRADE"


class TestBreakout:
    def test_fires_buy_near_52w_high_with_volume(self):
        f = _base()
        f.update(pct_from_52w_high=-1.0, pct_from_52w_low=20.0, relative_volume=2.0)
        assert breakout(f) == "BUY"

    def test_fires_sell_near_52w_low_with_volume(self):
        f = _base()
        # pct_from_52w_high must be unambiguously far from 0 here too —
        # _base()'s default of 0.0 means "at the 52w high", which would
        # incidentally also satisfy near_high and mask this case.
        f.update(pct_from_52w_high=-20.0, pct_from_52w_low=1.0, relative_volume=2.0)
        assert breakout(f) == "SELL"

    def test_no_trade_near_high_without_volume_confirmation(self):
        f = _base()
        f.update(pct_from_52w_high=-1.0, relative_volume=0.8)
        assert breakout(f) == "NO_TRADE"


class TestMeanReversion:
    def test_fires_buy_when_oversold_and_stretched_below_average(self):
        f = _base()
        f.update(rsi_14=20.0, price_vs_sma20_pct=-5.0)
        assert mean_reversion(f) == "BUY"

    def test_fires_sell_when_overbought_and_stretched_above_average(self):
        f = _base()
        f.update(rsi_14=80.0, price_vs_sma20_pct=5.0)
        assert mean_reversion(f) == "SELL"

    def test_low_rsi_alone_without_price_stretch_does_not_fire(self):
        f = _base()
        f.update(rsi_14=20.0, price_vs_sma20_pct=-1.0)
        assert mean_reversion(f) == "NO_TRADE"


class TestVolatilityRegime:
    def test_trending_regime_delegates_to_trend_momentum(self):
        f = _base()
        f.update(adx=30.0, price_vs_sma20_pct=2.0, price_vs_ema9_pct=1.0, macd_histogram=0.5, regime_slope_pct=1.0)
        assert volatility_regime(f) == "BUY"

    def test_ranging_regime_delegates_to_mean_reversion(self):
        f = _base()
        f.update(adx=10.0, rsi_14=20.0, price_vs_sma20_pct=-5.0)
        assert volatility_regime(f) == "BUY"

    def test_middling_adx_never_fires(self):
        f = _base()
        f.update(adx=22.5, rsi_14=20.0, price_vs_sma20_pct=-5.0, macd_histogram=0.5, regime_slope_pct=1.0, price_vs_ema9_pct=1.0)
        assert volatility_regime(f) == "NO_TRADE"


class TestMultiFactorConfirmation:
    def test_fires_buy_only_with_at_least_three_of_four_votes(self):
        f = _base()
        f.update(
            price_vs_sma20_pct=1.0, macd_histogram=0.5,
            pct_from_52w_high=-1.0, relative_volume=1.5,
            relative_strength_spy_10d_pct=1.0,
            rsi_14=50.0,
        )
        assert multi_factor_confirmation(f) == "BUY"

    def test_two_of_four_votes_is_not_enough(self):
        f = _base()
        f.update(
            price_vs_sma20_pct=1.0, macd_histogram=0.5,  # vote 1: yes
            pct_from_52w_high=-20.0, relative_volume=0.5,  # vote 2: no
            relative_strength_spy_10d_pct=1.0,  # vote 3: yes
            rsi_14=80.0,  # vote 4: no (rsi >= 70)
        )
        assert multi_factor_confirmation(f) == "NO_TRADE"


def test_every_registered_strategy_returns_a_valid_label_on_a_neutral_snapshot():
    f = _base()
    for name, fn in STRATEGIES.items():
        assert fn(f) in ("BUY", "SELL", "NO_TRADE"), name


def test_five_strategies_are_registered():
    assert len(STRATEGIES) == 5
    assert set(STRATEGIES) == {
        "trend_momentum", "breakout", "mean_reversion", "volatility_regime", "multi_factor_confirmation",
    }
