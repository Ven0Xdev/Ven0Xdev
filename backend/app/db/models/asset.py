"""Unified multi-asset symbol registry (additive — does not replace or
modify `Ticker`, which remains the OTC-specific table). See
/OTC_TO_MULTI_ASSET_MIGRATION.md §1 for the model this mirrors
(services.data_providers.base.AssetMeta / OTCProfile).
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    asset_type: Mapped[str] = mapped_column(String(16), index=True)  # AssetType value
    name: Mapped[str] = mapped_column(String(255))
    exchange: Mapped[str] = mapped_column(String(32))
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    provider: Mapped[str] = mapped_column(String(32), default="unknown")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    tradable: Mapped[bool] = mapped_column(Boolean, default=True)
    trading_hours: Mapped[str] = mapped_column(String(64), default="09:30-16:00 ET")
    data_delay: Mapped[str] = mapped_column(String(32), default="unspecified")
    supported_timeframes: Mapped[list] = mapped_column(JSON, default=list)

    # OTCProfile fields — nullable, populated ONLY for asset_type == OTC_STOCK.
    # No non-OTC row may have these set (enforced in code by AssetMeta, see
    # __post_init__ in services/data_providers/base.py).
    otc_tier: Mapped[str | None] = mapped_column(String(32), nullable=True)
    otc_caveat_emptor: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    otc_shell_risk: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    otc_disclosure_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    otc_reverse_split_count_3y: Mapped[int | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Asset {self.symbol} ({self.asset_type})>"
