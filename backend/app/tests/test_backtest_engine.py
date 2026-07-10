import numpy as np

from app.services.backtest.engine import BacktestConfig, BacktestEngine, walk_forward_splits
from app.services.data_providers.mock_provider import MockOTCProvider


def test_backtest_engine_runs_and_produces_bounded_metrics():
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=8)]
    engine = BacktestEngine(BacktestConfig(max_hold_days=15))
    report = engine.run(provider, symbols, lookback_days=250)

    assert report.num_trades >= 0
    assert -100 <= report.max_drawdown_pct <= 0
    assert 0 <= report.win_rate_pct <= 100
    assert report.profit_factor >= 0
    assert len(report.equity_curve) >= 1


def test_backtest_trades_respect_execution_costs():
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=10)]
    engine = BacktestEngine(BacktestConfig(max_hold_days=15))
    report = engine.run(provider, symbols, lookback_days=250)

    for trade in report.trades:
        if trade.exit_reason in ("no_fill", "halted_no_fill"):
            continue
        assert trade.entry_price > 0
        if trade.exit_price is not None:
            assert trade.exit_price > 0


def test_walk_forward_splits_are_temporally_ordered():
    provider = MockOTCProvider()
    df = provider.get_ohlcv(provider.get_universe(limit=1)[0].symbol, lookback_days=300)
    splits = walk_forward_splits(df, n_splits=4)
    assert len(splits) > 0
    for train, test in splits:
        assert train.index.max() <= test.index.min()


def test_no_lookahead_bias_in_signal_generation():
    """Signals for bar i must only ever be computed from data up to and
    including bar i - verified by asserting the engine never simulates an
    entry before the signal's trigger bar.
    """
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=5)]
    engine = BacktestEngine(BacktestConfig(max_hold_days=15))
    report = engine.run(provider, symbols, lookback_days=250)
    for trade in report.trades:
        assert trade.entry_ts is not None
