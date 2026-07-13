import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session, get_current_user
from app.db.models.signal import Signal, SignalEvent
from app.services.data_providers.base import MarketDataProvider
from app.services.streaming.service import get_stream_service

router = APIRouter(prefix="/stream", tags=["stream"])


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
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            service.bus.unsubscribe(symbol, queue)

    return StreamingResponse(event_source(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{symbol}/evaluate-signal")
def evaluate_signal_now(
    symbol: str,
    db: Session = Depends(db_session),
    provider: MarketDataProvider = Depends(data_provider),
    _user=Depends(get_current_user),
):
    from app.services.signals.engine import evaluate_signal

    service = get_stream_service()
    health = service.health(symbol)
    signal = evaluate_signal(
        symbol, provider, db,
        indicators_warm=True,  # REST path uses full-history indicators (always warm ≥60 bars)
        provider_healthy=not health.get("stale", False),
    )
    service.bus.publish(symbol.upper(), "signal.updated", _signal_payload(signal))
    return _signal_payload(signal)


@router.get("/{symbol}/signal")
def current_signal(symbol: str, db: Session = Depends(db_session), _user=Depends(get_current_user)):
    signal = (
        db.query(Signal).filter_by(ticker_symbol=symbol.upper())
        .order_by(Signal.created_at.desc(), Signal.id.desc()).first()
    )
    return _signal_payload(signal) if signal else {"status": "NO_SIGNAL_YET", "ticker": symbol.upper()}


@router.get("/{symbol}/signal-history")
def signal_history(symbol: str, limit: int = 20, db: Session = Depends(db_session), _user=Depends(get_current_user)):
    signals = (
        db.query(Signal).filter_by(ticker_symbol=symbol.upper())
        .order_by(Signal.created_at.desc(), Signal.id.desc()).limit(limit).all()
    )
    events = (
        db.query(SignalEvent).join(Signal, Signal.id == SignalEvent.signal_id)
        .filter(Signal.ticker_symbol == symbol.upper())
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


def _signal_payload(s: Signal) -> dict:
    return {
        "signal_id": s.id, "ticker": s.ticker_symbol, "created_at": s.created_at.isoformat(),
        "status": s.status, "ideal_entry": s.ideal_entry,
        "entry_zone": [s.entry_zone_low, s.entry_zone_high],
        "stop_loss": s.stop_loss, "targets": s.targets,
        "holding_period_days": s.holding_period_days, "risk_reward": s.risk_reward,
        "calibrated_probability": s.calibrated_probability, "confidence": s.confidence,
        "technical_score": s.technical_score, "liquidity_score": s.liquidity_score,
        "manipulation_risk": s.manipulation_risk, "data_quality_score": s.data_quality_score,
        "bullish_reasons": s.bullish_reasons, "bearish_reasons": s.bearish_reasons,
        "invalidation_conditions": s.invalidation_conditions,
        "rejection_reasons": s.rejection_reasons,
        "data_source": s.data_source, "data_mode": s.data_mode,
        "model_version": s.model_version, "feature_version": s.feature_version,
    }
