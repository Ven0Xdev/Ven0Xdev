"""Shadow observation API — read-only track-record data plus an
operator-triggered catch-up sweep. See services/shadow/engine.py's module
docstring: this is never the paper trading engine and never labeled
"NEXORA INTERNAL PAPER" — passive signal-quality analytics only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, require_operator
from app.db.models.shadow_position import ShadowPosition
from app.db.models.user import User
from app.services.data_providers.base import MarketDataProvider
from app.services.shadow.engine import shadow_learning_progress, shadow_stats, sweep_open_positions

router = APIRouter(prefix="/shadow", tags=["shadow"])


def _payload(p: ShadowPosition) -> dict:
    return {
        "id": p.id, "ncs_signal_id": p.ncs_signal_id, "ticker_symbol": p.ticker_symbol,
        "timeframe": p.timeframe, "direction": p.direction,
        "entry_bar_ts": p.entry_bar_ts.isoformat(), "entry_price": p.entry_price,
        "status": p.status, "holding_bars_elapsed": p.holding_bars_elapsed,
        "mfe_pct": p.mfe_pct, "mae_pct": p.mae_pct,
        "exit_bar_ts": p.exit_bar_ts.isoformat() if p.exit_bar_ts else None,
        "exit_price": p.exit_price, "exit_reason": p.exit_reason, "pnl_pct": p.pnl_pct,
        "version": p.version,
    }


@router.get("/positions")
def list_shadow_positions(
    ticker: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: Session = Depends(db_session),
):
    query = db.query(ShadowPosition)
    if ticker:
        query = query.filter_by(ticker_symbol=ticker.upper())
    if status:
        query = query.filter_by(status=status.upper())
    rows = query.order_by(ShadowPosition.created_at.desc()).limit(limit).all()
    return {"count": len(rows), "positions": [_payload(p) for p in rows]}


@router.get("/stats")
def shadow_track_record(ticker: str | None = None, timeframe: str | None = None, db: Session = Depends(db_session)):
    s = shadow_stats(db, ticker=ticker, timeframe=timeframe)
    return {
        "count_closed": s.count_closed, "count_open": s.count_open,
        "win_rate_pct": s.win_rate_pct, "avg_pnl_pct": s.avg_pnl_pct,
        "avg_mfe_pct": s.avg_mfe_pct, "avg_mae_pct": s.avg_mae_pct,
    }


@router.get("/progress")
def shadow_progress(timeframe: str = "1D", db: Session = Depends(db_session)):
    """Read-only "Shadow Learning Progress" data for the whole active
    universe on `timeframe` — candidate signals, open/closed observations,
    progress toward autonomous-trading eligibility, win rate, last
    evaluation, NCS version, and the exact blocker for any ticker not yet
    eligible. Never opens or closes anything."""
    from app.services.universe.manager import get_active_universe

    tickers = [a.symbol for a in get_active_universe(db)]
    rows = shadow_learning_progress(db, tickers, timeframe=timeframe)
    return {
        "timeframe": timeframe,
        "tickers": [
            {
                "ticker": r.ticker, "timeframe": r.timeframe, "ncs_version": r.ncs_version,
                "candidate_signals": r.candidate_signals, "open_observations": r.open_observations,
                "closed_outcomes": r.closed_outcomes, "progress_pct": r.progress_pct,
                "win_rate_pct": r.win_rate_pct,
                "last_evaluation": r.last_evaluation.isoformat() if r.last_evaluation else None,
                "eligible": r.eligible, "blockers": r.blockers,
            }
            for r in rows
        ],
    }


@router.post("/sweep")
def trigger_sweep(
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    _operator: User = Depends(require_operator),
):
    """Operator-triggered catch-up sweep across every OPEN shadow
    position — see sweep_open_positions' docstring for why this exists
    alongside the automatic per-evaluation marking."""
    swept = sweep_open_positions(db, provider)
    return {"swept": swept}
