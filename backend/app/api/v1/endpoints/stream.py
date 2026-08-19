import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, get_current_user
from app.db.models.ncs_signal import NcsSignal
from app.db.models.signal import Signal, SignalEvent
from app.db.models.user import User
from app.services.data_providers.base import MarketDataProvider
from app.services.streaming.service import get_stream_service

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/dashboard")
async def stream_dashboard(_user=Depends(get_current_user)):
    """SSE stream of platform-wide dashboard events — new alerts firing,
    autonomous paper trades opening/closing, and Safe Mode / the
    autonomous-trading emergency stop being flipped. Registered before
    the `/{symbol}` routes below so `dashboard` is never matched as a
    ticker symbol. Reuses the same per-symbol EventBus with a reserved
    channel key (services/dashboard/events.py) rather than a second
    pub/sub mechanism — every event here is a "something changed, go
    re-fetch" nudge, not authoritative data itself.
    """
    from app.services.dashboard.events import DASHBOARD_CHANNEL

    service = get_stream_service()
    queue = service.bus.subscribe(DASHBOARD_CHANNEL)

    async def event_source():
        try:
            yield f"event: hello\ndata: {json.dumps({'type': 'hello', 'payload': {}})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            service.bus.unsubscribe(DASHBOARD_CHANNEL, queue)

    return StreamingResponse(event_source(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{symbol}/health")
async def stream_health(symbol: str, _user=Depends(get_current_user)):
    return get_stream_service().health(symbol)


@router.get("/{symbol}/bars")
async def stream_bars(symbol: str, limit: int = 500, _user=Depends(get_current_user)):
    """Intraday (1m) bars accumulated by the stream service, oldest→newest,
    including the in-progress bar. Seeds the live chart before SSE updates."""
    service = get_stream_service()
    await service.ensure_symbol(symbol)
    return {"symbol": symbol.upper(), "timeframe": "1m",
            "bars": [b.to_payload() for b in service.recent_bars(symbol, limit)]}


@router.get("/{symbol}")
async def stream_symbol(symbol: str, _user=Depends(get_current_user)):
    """SSE stream of normalized market events for one symbol. One backend
    provider connection per symbol regardless of subscriber count."""
    symbol = symbol.upper()
    service = get_stream_service()
    await service.ensure_symbol(symbol)
    queue = service.bus.subscribe(symbol)

    async def event_source():
        try:
            hello = {"type": "hello", "payload": service.health(symbol)}
            yield f"event: hello\ndata: {json.dumps(hello)}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            service.bus.unsubscribe(symbol, queue)

    return StreamingResponse(event_source(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{symbol}/evaluate-signal")
def evaluate_signal_now(
    symbol: str,
    timeframe: str = "1D",
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    _user=Depends(get_current_user),
):
    from app.services.signals.engine import evaluate_signal

    service = get_stream_service()
    health = service.health(symbol)
    signal = evaluate_signal(
        symbol, provider, db, timeframe=timeframe,
        indicators_warm=True,  # REST path uses full-history indicators (always warm ≥60 bars)
        provider_healthy=not health.get("stale", False),
    )
    service.bus.publish(symbol.upper(), "signal.updated", _signal_payload(signal))
    return _signal_payload(signal)


@router.get("/{symbol}/signal")
def current_signal(symbol: str, timeframe: str = "1D", db: Session = Depends(db_session), _user=Depends(get_current_user)):
    signal = (
        db.query(Signal).filter_by(ticker_symbol=symbol.upper(), timeframe=timeframe)
        .order_by(Signal.created_at.desc(), Signal.id.desc()).first()
    )
    return _signal_payload(signal) if signal else {"status": "NO_SIGNAL_YET", "ticker": symbol.upper()}


@router.get("/{symbol}/signal-history")
def signal_history(symbol: str, timeframe: str = "1D", limit: int = 20, db: Session = Depends(db_session), _user=Depends(get_current_user)):
    signals = (
        db.query(Signal).filter_by(ticker_symbol=symbol.upper(), timeframe=timeframe)
        .order_by(Signal.created_at.desc(), Signal.id.desc()).limit(limit).all()
    )
    events = (
        db.query(SignalEvent).join(Signal, Signal.id == SignalEvent.signal_id)
        .filter(Signal.ticker_symbol == symbol.upper(), Signal.timeframe == timeframe)
        .order_by(SignalEvent.created_at.desc()).limit(50).all()
    )
    return {
        "signals": [_signal_payload(s) for s in signals],
        "events": [
            {"signal_id": e.signal_id, "at": e.created_at.isoformat(), "type": e.event_type,
             "from": e.from_status, "to": e.to_status, "reason": e.reason}
            for e in events
        ],
    }


@router.post("/{symbol}/evaluate-ncs")
def evaluate_ncs_now(
    symbol: str,
    timeframe: str = "1D",
    cooldown_minutes: float = 60.0,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    user: User = Depends(get_current_user),
):
    """Computes (or returns the already-persisted row for) the latest
    closed bar's NCS on `timeframe`. This is a chart annotation, nothing
    more — nothing here places, opens, or even proposes a paper order;
    autonomous paper trading is a fully separate decision that must clear
    its own safety gates independently (see services/paper_trading/engine.py).

    Red-Team review runs on every evaluation (final veto authority, per
    the platform's safety-gate checklist) — a vetoed setup is still
    computed and shown (never hidden), just marked distinctly and unable
    to confirm/fire a marker (see services/signals/ncs.py).
    """
    from app.services.paper_trading.engine import list_open_positions
    from app.services.risk import red_team
    from app.services.scoring.scorer import analyze_ticker
    from app.services.signals.ncs import NcsInputs, NcsInsufficientData, evaluate_ncs

    portfolio_open_symbols = {p.ticker_symbol for p in list_open_positions(user.id, db)}
    health = get_stream_service().health(symbol)
    analysis = analyze_ticker(symbol, provider=provider)
    red_team_verdict = red_team.review(
        symbol, analysis, db,
        portfolio_open_symbols=portfolio_open_symbols,
        provider_healthy=not health.get("stale", False),
    )
    try:
        row = evaluate_ncs(
            symbol, provider, db, timeframe=timeframe,
            inputs=NcsInputs(portfolio_open_symbols=portfolio_open_symbols, red_team_veto=red_team_verdict),
            cooldown_minutes=cooldown_minutes,
        )
    except NcsInsufficientData as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if row.fired:
        get_stream_service().bus.publish(symbol.upper(), "ncs.updated", _ncs_payload(row))
    return _ncs_payload(row)


@router.get("/{symbol}/ncs")
def current_ncs(symbol: str, timeframe: str = "1D", db: Session = Depends(db_session), _user=Depends(get_current_user)):
    from app.services.signals.ncs import latest_ncs

    row = latest_ncs(db, symbol, timeframe)
    return _ncs_payload(row) if row else {"raw_verdict": "NO_SIGNAL_YET", "ticker": symbol.upper()}


@router.get("/{symbol}/ncs-history")
def ncs_history_endpoint(symbol: str, timeframe: str = "1D", limit: int = 100, db: Session = Depends(db_session), _user=Depends(get_current_user)):
    from app.services.signals.ncs import ncs_history

    return {"symbol": symbol.upper(), "timeframe": timeframe, "signals": [_ncs_payload(r) for r in ncs_history(db, symbol, timeframe, limit)]}


@router.get("/{symbol}/decision-audit")
def decision_audit_endpoint(
    symbol: str, timeframe: str = "1D", limit: int = 50, db: Session = Depends(db_session), _user=Depends(get_current_user),
):
    """Unified Decision Audit (item 4 of the professional-terminal build):
    every real persisted NCS evaluation for this ticker/timeframe, enriched
    with its Shadow observation, Red-Team verdict, and any paper order/
    position it actually produced. Never fabricates a row — a ticker with
    no evaluations yet returns an empty list, honestly."""
    from app.services.shadow.engine import shadow_learning_progress
    from app.services.signals.decision_audit import decision_audit

    rows = decision_audit(db, symbol, timeframe, limit)
    [progress] = shadow_learning_progress(db, [symbol], timeframe=timeframe)
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "eligibility_progress": {
            "candidate_signals": progress.candidate_signals, "open_observations": progress.open_observations,
            "closed_outcomes": progress.closed_outcomes, "progress_pct": progress.progress_pct,
            "win_rate_pct": progress.win_rate_pct, "eligible": progress.eligible, "blockers": progress.blockers,
        },
        "rows": [
            {
                "id": r.id, "ticker": r.ticker, "timeframe": r.timeframe,
                "bar_ts": r.bar_ts.isoformat(), "evaluated_at": r.evaluated_at.isoformat(),
                "raw_verdict": r.raw_verdict, "confirmed_verdict": r.confirmed_verdict, "state": r.state,
                "fired": r.fired, "confidence_pct": r.confidence_pct, "composite_score": r.composite_score,
                "risk_score": r.risk_score, "version": r.version, "data_source": r.data_source,
                "data_mode": r.data_mode, "components": r.components, "vetoed": r.vetoed, "veto_reason": r.veto_reason,
                "shadow_status": r.shadow_status,
                "shadow_maturity_bar_ts": r.shadow_maturity_bar_ts.isoformat() if r.shadow_maturity_bar_ts else None,
                "shadow_pnl_pct": r.shadow_pnl_pct, "shadow_exit_reason": r.shadow_exit_reason,
                "paper_position_id": r.paper_position_id, "paper_order_id": r.paper_order_id,
            }
            for r in rows
        ],
    }


def _ncs_payload(s: NcsSignal) -> dict:
    return {
        "id": s.id, "ticker": s.ticker_symbol, "timeframe": s.timeframe,
        "bar_ts": s.bar_ts.isoformat(), "computed_at": s.created_at.isoformat(),
        "raw_verdict": s.raw_verdict, "confirmed_verdict": s.confirmed_verdict, "fired": s.fired,
        "composite_score": s.composite_score, "confidence_pct": s.confidence_pct, "risk_score": s.risk_score,
        "explanation": s.explanation, "components": s.components,
        "vetoed": s.vetoed, "veto_reason": s.veto_reason,
        "version": s.version, "data_source": s.data_source, "data_mode": s.data_mode,
    }


def _signal_payload(s: Signal) -> dict:
    return {
        "signal_id": s.id, "ticker": s.ticker_symbol, "created_at": s.created_at.isoformat(),
        "timeframe": s.timeframe, "status": s.status, "signal_type": s.signal_type,
        "ideal_entry": s.ideal_entry,
        "entry_zone": [s.entry_zone_low, s.entry_zone_high],
        "stop_loss": s.stop_loss, "targets": s.targets,
        "holding_period_days": s.holding_period_days, "risk_reward": s.risk_reward,
        "calibrated_probability": s.calibrated_probability, "confidence": s.confidence,
        "technical_score": s.technical_score, "liquidity_score": s.liquidity_score,
        "manipulation_risk": s.manipulation_risk, "data_quality_score": s.data_quality_score,
        "bullish_reasons": s.bullish_reasons, "bearish_reasons": s.bearish_reasons,
        "invalidation_conditions": s.invalidation_conditions,
        "rejection_reasons": s.rejection_reasons,
        "explanation": s.explanation, "market_regime": s.market_regime,
        "multi_timeframe_agreement": s.multi_timeframe_agreement,
        "patterns_detected": s.patterns_detected,
        "data_source": s.data_source, "data_mode": s.data_mode,
        "model_version": s.model_version, "feature_version": s.feature_version,
        "risk_policy_version": s.risk_policy_version,
    }
