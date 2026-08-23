from datetime import datetime

from sqlalchemy import JSON, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class ScanCycle(Base):
    """One completed pass of the continuous scanner over the universe.

    Scanner history is a first-class record: every cycle knows when it ran,
    against which provider, and how the universe split into accepted vs.
    rejected — so 'what did the scanner see last Tuesday?' is a query, not
    an archaeology project.
    """

    __tablename__ = "scan_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    provider_name: Mapped[str] = mapped_column(String(32))
    universe_size: Mapped[int] = mapped_column(Integer, default=0)
    accepted_count: Mapped[int] = mapped_column(Integer, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)

    decisions: Mapped[list["ScanDecision"]] = relationship(back_populates="cycle", cascade="all, delete-orphan")


class ScanDecision(Base):
    """Why each ticker was selected or rejected in a given cycle.

    `reasons` is a list of human-readable strings citing the exact values
    that drove the decision — the scanner never rejects silently.
    """

    __tablename__ = "scan_decisions"
    __table_args__ = (
        Index("ix_scan_decisions_cycle_decision", "cycle_id", "decision"),
        Index("ix_scan_decisions_ticker", "ticker_symbol"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("scan_cycles.id"))
    ticker_symbol: Mapped[str] = mapped_column(String(16))
    decision: Mapped[str] = mapped_column(String(16))  # accepted | rejected | failed
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)  # among accepted, 1 = best
    ai_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    manipulation_risk: Mapped[float | None] = mapped_column(Float, nullable=True)
    reasons: Mapped[list] = mapped_column(JSON, default=list)

    cycle: Mapped["ScanCycle"] = relationship(back_populates="decisions")
