from datetime import datetime

from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class EdgarCompanyFacts(Base):
    """Locally ingested SEC EDGAR facts, one row per ticker.

    Per architecture decision D7, EDGAR is a *scheduled ingester*: filings
    are pulled on a cadence into this table (respecting SEC fair-use rate
    limits) and the fundamentals port reads locally. Nothing in the request
    path ever calls sec.gov.
    """

    __tablename__ = "edgar_company_facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    cik: Mapped[str] = mapped_column(String(10))

    shares_outstanding_latest: Mapped[float | None] = mapped_column(Float, nullable=True)
    shares_outstanding_year_ago: Mapped[float | None] = mapped_column(Float, nullable=True)
    dilution_12m_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    last_filing_date: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_periodic_form: Mapped[str | None] = mapped_column(String(16), nullable=True)  # 10-K / 10-Q / 20-F ...
    filing_delinquent: Mapped[bool | None] = mapped_column(nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
