"""Phase 7 API — the Historical Research dashboard's backend. Read-only
views (coverage, model registry, Canary status) are available to any
authenticated user, same as the platform's other research/monitoring
surfaces (NCS, Shadow). Mutating actions — training a new candidate,
enabling/disabling Research Canary — mirror Admin's own
require_operator-gated pattern (Safe Mode, Autonomous Trading): a
historical-research training run is CPU-heavy and a Canary opt-in is a
genuine safety-relevant action, neither of which a plain user should
trigger.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import db_session, expensive_rate_limit, get_current_user, require_operator
from app.db.models.backfill_checkpoint import BackfillCheckpoint
from app.db.models.canary import CanaryPosition
from app.db.models.corporate_action import CorporateAction
from app.db.models.historical_bar import HistoricalBar
from app.db.models.historical_news import HistoricalNewsArticle
from app.db.models.point_in_time_fundamental import PointInTimeFundamental
from app.db.models.research_model import CanaryDecision, ResearchModel
from app.db.models.user import User
from app.services.research.canary import get_or_create_account
from app.services.research.labeling import HORIZONS

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/coverage")
def data_coverage(db: Session = Depends(db_session), _user: User = Depends(get_current_user)):
    """Real coverage per (symbol, timeframe) — min/max timestamp and row
    count straight from HistoricalBar, never an assumed/claimed range.
    Feed is reported per row's own provenance (Alpaca daily/intraday is
    IEX-only — partial market coverage, never presented as full SIP)."""
    bar_rows = (
        db.query(
            HistoricalBar.ticker_symbol, HistoricalBar.timeframe, HistoricalBar.data_source, HistoricalBar.feed,
            func.min(HistoricalBar.ts), func.max(HistoricalBar.ts), func.count(HistoricalBar.id),
        )
        .group_by(HistoricalBar.ticker_symbol, HistoricalBar.timeframe, HistoricalBar.data_source, HistoricalBar.feed)
        .all()
    )
    bars = [
        {
            "ticker_symbol": r[0], "timeframe": r[1], "data_source": r[2], "feed": r[3],
            "coverage_start": r[4].isoformat() if r[4] else None, "coverage_end": r[5].isoformat() if r[5] else None,
            "row_count": r[6],
        }
        for r in bar_rows
    ]

    fundamentals_count: dict[str, int] = {
        symbol: count for symbol, count in
        db.query(PointInTimeFundamental.ticker_symbol, func.count(PointInTimeFundamental.id))
        .group_by(PointInTimeFundamental.ticker_symbol).all()
    }
    news_count: dict[str, int] = {
        symbol: count for symbol, count in
        db.query(HistoricalNewsArticle.ticker_symbol, func.count(HistoricalNewsArticle.id))
        .group_by(HistoricalNewsArticle.ticker_symbol).all()
    }
    actions_count: dict[str, int] = {
        symbol: count for symbol, count in
        db.query(CorporateAction.ticker_symbol, func.count(CorporateAction.id))
        .group_by(CorporateAction.ticker_symbol).all()
    }

    checkpoints = [
        {
            "provider": c.provider, "dataset": c.dataset, "ticker_symbol": c.ticker_symbol,
            "status": c.status, "rows_ingested": c.rows_ingested, "last_error": c.last_error,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in db.query(BackfillCheckpoint).all()
    ]

    return {
        "bars": bars,
        "fundamentals_rows_by_symbol": fundamentals_count,
        "news_rows_by_symbol": news_count,
        "corporate_actions_rows_by_symbol": actions_count,
        "news_honestly_unavailable": sum(news_count.values()) == 0,
        "backfill_checkpoints": checkpoints,
        "horizons": list(HORIZONS),
    }


@router.get("/models")
def list_research_models(
    horizon: str | None = None, state: str | None = None,
    db: Session = Depends(db_session), _user: User = Depends(get_current_user),
):
    query = db.query(ResearchModel)
    if horizon:
        query = query.filter(ResearchModel.horizon == horizon)
    if state:
        query = query.filter(ResearchModel.state == state)
    rows = query.order_by(ResearchModel.trained_at.desc()).all()
    return [
        {
            "id": r.id, "family": r.family, "horizon": r.horizon, "version": r.version, "state": r.state,
            "rejection_reason": r.rejection_reason, "trained_at": r.trained_at.isoformat(),
            "qualified_at": r.qualified_at.isoformat() if r.qualified_at else None,
            "retired_at": r.retired_at.isoformat() if r.retired_at else None,
            "dataset_summary": r.dataset_summary,
        }
        for r in rows
    ]


@router.get("/models/{model_id}")
def get_research_model(model_id: int, db: Session = Depends(db_session), _user: User = Depends(get_current_user)):
    model = db.query(ResearchModel).filter_by(id=model_id).one_or_none()
    if model is None:
        raise HTTPException(status_code=404, detail="Research model not found")
    return {
        "id": model.id, "family": model.family, "horizon": model.horizon, "version": model.version,
        "state": model.state, "rejection_reason": model.rejection_reason,
        "trained_at": model.trained_at.isoformat(),
        "qualified_at": model.qualified_at.isoformat() if model.qualified_at else None,
        "retired_at": model.retired_at.isoformat() if model.retired_at else None,
        "walk_forward_report": model.walk_forward_report,
        "holdout_report": model.holdout_report,
        "stress_test_report": model.stress_test_report,
        "leakage_checks": model.leakage_checks,
        "dataset_summary": model.dataset_summary,
    }


@router.post("/train/{horizon}")
def train_research_model(
    horizon: str,
    db: Session = Depends(db_session),
    operator: User = Depends(require_operator),
    _rate: User = Depends(expensive_rate_limit),
):
    """Runs the full Phase 4 walk-forward pipeline for one horizon and
    applies the Phase 5 qualification gate — CPU-heavy (trains 5 model
    families x up to 5 folds), hence operator-gated + rate-limited like
    every other expensive endpoint on this platform."""
    if horizon not in HORIZONS:
        raise HTTPException(status_code=400, detail=f"horizon must be one of {HORIZONS}")

    from app.services.research.registry import qualify_candidate
    from app.services.research.training import run_calendar_walk_forward
    from app.services.universe.manager import get_active_universe

    symbols = [a.symbol for a in get_active_universe(db)]
    report = run_calendar_walk_forward(db, horizon, symbols)
    model = qualify_candidate(db, horizon, report)
    return {
        "id": model.id, "family": model.family, "horizon": model.horizon, "state": model.state,
        "rejection_reason": model.rejection_reason,
    }


@router.post("/train-strategy/{horizon}")
def train_strategy_models(
    horizon: str,
    db: Session = Depends(db_session),
    operator: User = Depends(require_operator),
    _rate: User = Depends(expensive_rate_limit),
):
    """Same walk-forward + Phase 5 gate as /train/{horizon}, but for the
    five transparent rule-based strategy families (strategies.py)
    instead of a fitted ML model — reuses registry.qualify_candidate()
    unchanged, so a strategy is held to the identical bar as an ML
    candidate, never a looser one."""
    if horizon not in HORIZONS:
        raise HTTPException(status_code=400, detail=f"horizon must be one of {HORIZONS}")

    from app.services.research.registry import qualify_candidate
    from app.services.research.strategy_evaluation import run_strategy_walk_forward
    from app.services.universe.manager import get_active_universe

    symbols = [a.symbol for a in get_active_universe(db)]
    report = run_strategy_walk_forward(db, horizon, symbols)
    model = qualify_candidate(db, horizon, report)
    return {
        "id": model.id, "family": model.family, "horizon": model.horizon, "state": model.state,
        "rejection_reason": model.rejection_reason,
    }


@router.get("/canary/status")
def canary_status(db: Session = Depends(db_session), _user: User = Depends(get_current_user)):
    account = get_or_create_account(db)
    open_positions = db.query(CanaryPosition).filter_by(status="open").all()
    recent_decisions = db.query(CanaryDecision).order_by(CanaryDecision.evaluated_at.desc()).limit(50).all()
    return {
        "enabled": account.enabled,
        "auto_paused": account.auto_paused,
        "auto_pause_reason": account.auto_pause_reason,
        "cash_balance": account.cash_balance,
        "starting_balance": account.starting_balance,
        "peak_equity": account.peak_equity,
        "positions_opened_today": account.positions_opened_today,
        "realized_pnl_today_dollars": account.realized_pnl_today_dollars,
        "open_positions": [
            {
                "id": p.id, "ticker_symbol": p.ticker_symbol, "horizon": p.horizon, "quantity": p.quantity,
                "avg_entry_price": p.avg_entry_price, "opened_at": p.opened_at.isoformat(),
                "stop_loss": p.stop_loss, "take_profit": p.take_profit,
                "max_holding_until": p.max_holding_until.isoformat(),
            }
            for p in open_positions
        ],
        "recent_decisions": [
            {
                "id": d.id, "ticker_symbol": d.ticker_symbol, "horizon": d.horizon,
                "evaluated_at": d.evaluated_at.isoformat(), "verdict": d.verdict, "probability": d.probability,
                "fired": d.fired, "no_trade_reason": d.no_trade_reason, "drift_status": d.drift_status,
                "data_stale": d.data_stale,
            }
            for d in recent_decisions
        ],
    }


@router.post("/canary/enable")
def enable_canary(db: Session = Depends(db_session), operator: User = Depends(require_operator)):
    """The operator's manual Canary opt-in (Phase 6). Does NOT touch
    Emergency Stop — both gates are independent; enabling this while
    Emergency Stop stays engaged permits nothing to fire."""
    account = get_or_create_account(db)
    account.enabled = True
    account.updated_by_user_id = operator.id
    db.commit()
    return {"enabled": account.enabled}


@router.post("/canary/disable")
def disable_canary(db: Session = Depends(db_session), operator: User = Depends(require_operator)):
    account = get_or_create_account(db)
    account.enabled = False
    account.updated_by_user_id = operator.id
    db.commit()
    return {"enabled": account.enabled}


@router.post("/canary/clear-auto-pause")
def clear_canary_auto_pause(db: Session = Depends(db_session), operator: User = Depends(require_operator)):
    """Manually clears an auto-pause (Phase 6's 2% drawdown trip) — an
    operator decision, never automatic."""
    account = get_or_create_account(db)
    account.auto_paused = False
    account.auto_pause_reason = None
    account.updated_by_user_id = operator.id
    db.commit()
    return {"auto_paused": account.auto_paused}
