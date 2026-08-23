"""Unified Decision Audit — one row per persisted NcsSignal evaluation,
enriched with everything downstream that evaluation actually produced:
its Shadow observation (if it fired), the paper order/position it
triggered (if an account happened to act on it), and its Red-Team
verdict. Read-only, aggregates existing tables — this module computes
nothing new and never re-derives a signal.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models.ncs_signal import NcsSignal
from app.db.models.paper_order import PaperOrder
from app.db.models.paper_trading import PaperPosition
from app.db.models.shadow_position import ShadowPosition


@dataclass
class DecisionAuditRow:
    id: int
    ticker: str
    timeframe: str
    bar_ts: datetime
    evaluated_at: datetime
    raw_verdict: str
    confirmed_verdict: str | None
    # "fired" | "vetoed" | "awaiting_confirmation" | "no_trade" — the one
    # honest state a Buy/Sell chart marker may key off, per this
    # platform's non-repaint contract (see services/signals/ncs.py).
    state: str
    fired: bool
    confidence_pct: float
    composite_score: float
    risk_score: float
    version: str
    data_source: str
    data_mode: str
    components: list
    vetoed: bool
    veto_reason: str | None
    shadow_status: str | None  # OPEN | CLOSED | None (never opened)
    shadow_maturity_bar_ts: datetime | None  # entry + MAX_HOLDING_BARS-ish target, see engine's own docstring
    shadow_pnl_pct: float | None
    shadow_exit_reason: str | None
    paper_position_id: int | None
    paper_order_id: int | None


def _state(row: NcsSignal) -> str:
    if row.fired:
        return "fired"
    if row.vetoed:
        return "vetoed"
    if row.confirmed_verdict is None:
        return "awaiting_confirmation"
    return "no_trade"


def decision_audit(db: Session, ticker: str, timeframe: str = "1D", limit: int = 50) -> list[DecisionAuditRow]:
    rows = (
        db.query(NcsSignal)
        .filter_by(ticker_symbol=ticker.upper(), timeframe=timeframe)
        .order_by(NcsSignal.bar_ts.desc())
        .limit(limit)
        .all()
    )
    if not rows:
        return []
    ids = [r.id for r in rows]
    shadows = {
        s.ncs_signal_id: s
        for s in db.query(ShadowPosition).filter(ShadowPosition.ncs_signal_id.in_(ids)).all()
    }
    positions = {
        p.ncs_signal_id: p
        for p in db.query(PaperPosition).filter(PaperPosition.ncs_signal_id.in_(ids)).all()
    }
    orders = {
        o.ncs_signal_id: o
        for o in db.query(PaperOrder).filter(PaperOrder.ncs_signal_id.in_(ids)).all()
    }

    out = []
    for r in rows:
        shadow = shadows.get(r.id)
        position = positions.get(r.id)
        order = orders.get(r.id)
        out.append(DecisionAuditRow(
            id=r.id, ticker=r.ticker_symbol, timeframe=r.timeframe, bar_ts=r.bar_ts, evaluated_at=r.created_at,
            raw_verdict=r.raw_verdict, confirmed_verdict=r.confirmed_verdict, state=_state(r), fired=r.fired,
            confidence_pct=r.confidence_pct, composite_score=r.composite_score, risk_score=r.risk_score,
            version=r.version, data_source=r.data_source, data_mode=r.data_mode, components=r.components,
            vetoed=r.vetoed, veto_reason=r.veto_reason,
            shadow_status=shadow.status if shadow else None,
            shadow_maturity_bar_ts=shadow.exit_bar_ts if shadow and shadow.status == "CLOSED" else None,
            shadow_pnl_pct=shadow.pnl_pct if shadow else None,
            shadow_exit_reason=shadow.exit_reason if shadow else None,
            paper_position_id=position.id if position else None,
            paper_order_id=order.id if order else None,
        ))
    return out
