from datetime import datetime

from sqlalchemy import JSON, Boolean, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class NcsSignal(Base):
    """One row per (ticker, timeframe, closed bar) — the Nexora Conviction
    Signal's own append-only history, distinct from the existing `Signal`
    table (services/signals/engine.py's POSSIBLE_ENTRY/WATCH/... ladder,
    which this does not replace or read from).

    Anti-repaint contract, enforced by services/signals/ncs.py, not by any
    constraint here: a row for a given (ticker_symbol, timeframe, bar_ts)
    is written exactly once and never updated afterward — bar_ts (the
    closed bar this computation is anchored to) is the non-repaint key,
    not created_at. "Confirmed" requires this row's raw_verdict to match
    the immediately preceding row's for the same (ticker, timeframe) —
    i.e. two consecutive closed bars agreeing, never a single bar. `fired`
    is set only when a *new* confirmed bucket transition clears the
    configured cooldown against the last fired row of the same bucket —
    that is the one field a chart/UI should key "new marker" off of, never
    every row (which would repeat markers on every unchanged re-evaluation).
    """

    __tablename__ = "ncs_signals"
    __table_args__ = (
        Index("ix_ncs_signals_ticker_tf_created", "ticker_symbol", "timeframe", "created_at"),
        Index("ux_ncs_signals_ticker_tf_bar", "ticker_symbol", "timeframe", "bar_ts", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))
    # The closed bar this computation is anchored to — the anti-repaint
    # key. Never the still-forming bar (services/signals/ncs.py only ever
    # fetches closed bars).
    bar_ts: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    raw_verdict: Mapped[str] = mapped_column(String(16))  # STRONG_BUY|BUY|NEUTRAL|SELL|STRONG_SELL
    # Null until two consecutive closed bars agree on the same bucket
    # (BUY-family / SELL-family / NEUTRAL) — see _confirm() in ncs.py.
    confirmed_verdict: Mapped[str | None] = mapped_column(String(16), nullable=True)
    fired: Mapped[bool] = mapped_column(Boolean, default=False)

    composite_score: Mapped[float] = mapped_column(Float)  # -1..+1, pre-verdict-bucketing
    confidence_pct: Mapped[float] = mapped_column(Float)
    risk_score: Mapped[float] = mapped_column(Float)  # 0-100, higher = riskier
    explanation: Mapped[str] = mapped_column(String)
    # list[{"name", "score", "weight", "detail"}] — every component's own
    # contribution, for the chart's "why did this fire" hover/tooltip.
    components: Mapped[list] = mapped_column(JSON, default=list)

    vetoed: Mapped[bool] = mapped_column(Boolean, default=False)
    veto_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    version: Mapped[str] = mapped_column(String(32))
    data_source: Mapped[str] = mapped_column(String(32), default="unknown")
    data_mode: Mapped[str] = mapped_column(String(16), default="unspecified")
