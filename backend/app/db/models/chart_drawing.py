from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class ChartDrawing(Base):
    """One persisted chart annotation (trendline, horizontal/vertical
    line, ray, rectangle, Fibonacci retracement, text, arrow, ...),
    scoped to exactly one (user, ticker, timeframe). Never a screen-pixel
    record — `data` always stores real `{time, price}` anchors (Unix
    seconds + price), so a drawing stays correctly positioned after a
    resize, zoom, pan, theme change, or new candles arriving; only the
    chart's own time/price-to-pixel conversion (unchanged by this table)
    turns them into screen coordinates at render time.

    Ownership is enforced at the API layer (app/api/v1/endpoints/
    chart_drawings.py) by filtering on the authenticated user's own id —
    never a client-supplied user_id, and never another user's row,
    regardless of what a request claims.
    """

    __tablename__ = "chart_drawings"
    __table_args__ = (
        Index("ix_chart_drawings_owner_scope", "user_id", "ticker_symbol", "timeframe"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))
    drawing_type: Mapped[str] = mapped_column(String(24))
    # Type-specific payload — anchors ({time, price} points, never pixels),
    # style (color/opacity/width/dash/fontSize), and any per-type extras
    # (Fibonacci level list, text content). One flexible JSON blob per
    # drawing rather than a wide, mostly-null column set, matching this
    # codebase's existing NcsSignal.components precedent.
    data: Mapped[dict] = mapped_column(JSON)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
