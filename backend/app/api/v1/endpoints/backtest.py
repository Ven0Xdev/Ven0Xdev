from fastapi import APIRouter, Depends

from app.api.deps import data_provider
from app.schemas.backtest import BacktestRequest, BacktestResponse, TradeOut
from app.services.backtest.engine import BacktestConfig, BacktestEngine
from app.services.data_providers.base import MarketDataProvider

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("/walk-forward")
def walk_forward_validation(
    universe_limit: int = 6,
    n_folds: int = 3,
    lookback_days: int = 300,
    provider: MarketDataProvider = Depends(data_provider),
):
    """Walk-forward validation of the probability model itself: train on the
    past, test on the future, report out-of-sample AUC and calibration."""
    from app.services.backtest.walkforward import run_walk_forward_validation

    symbols = [t.symbol for t in provider.get_universe(limit=universe_limit)]
    return run_walk_forward_validation(provider, symbols, n_folds=n_folds, lookback_days=lookback_days)


@router.post("/run", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest, provider: MarketDataProvider = Depends(data_provider)):
    symbols = request.symbols or [t.symbol for t in provider.get_universe(limit=request.universe_limit)]

    config = BacktestConfig(
        max_hold_days=request.max_hold_days,
        position_size_dollars=request.position_size_dollars,
        commission_bps=request.commission_bps,
        slippage_bps=request.slippage_bps,
    )
    engine = BacktestEngine(config=config)
    report = engine.run(provider, symbols, lookback_days=request.lookback_days)

    return BacktestResponse(
        sharpe_ratio=report.sharpe_ratio,
        sortino_ratio=report.sortino_ratio,
        max_drawdown_pct=report.max_drawdown_pct,
        profit_factor=report.profit_factor,
        expectancy_pct=report.expectancy_pct,
        win_rate_pct=report.win_rate_pct,
        avg_hold_time_days=report.avg_hold_time_days,
        total_return_pct=report.total_return_pct,
        num_trades=report.num_trades,
        equity_curve=report.equity_curve,
        trades=[
            TradeOut(
                symbol=t.symbol,
                entry_ts=t.entry_ts.to_pydatetime(),
                exit_ts=t.exit_ts.to_pydatetime() if t.exit_ts is not None else None,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                quantity=t.quantity,
                pnl_pct=t.pnl_pct,
                exit_reason=t.exit_reason,
                hold_days=t.hold_days,
                was_partial_entry=t.was_partial_entry,
                was_halted_entry=t.was_halted_entry,
            )
            for t in report.trades
        ],
    )
