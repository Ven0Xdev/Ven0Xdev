from pydantic import BaseModel, field_validator

from app.services.data_providers.base import AssetType

# The Asset Universe Manager's mainstream surface only accepts these asset
# types today. FOREX, CRYPTO, and OTC_STOCK remain valid AssetType enum
# members (used elsewhere — e.g. the OTC module's own Ticker table) but are
# reserved for future expansion here; creating a universe entry with one of
# them is rejected rather than silently accepted.
_ENABLED_ASSET_TYPES = {
    AssetType.STOCK.value,
    AssetType.ETF.value,
    AssetType.INDEX.value,
    AssetType.COMMODITY.value,
    AssetType.PRECIOUS_METAL.value,
}
_RESERVED_ASSET_TYPES = {t.value for t in AssetType} - _ENABLED_ASSET_TYPES


class UniverseAssetOut(BaseModel):
    symbol: str
    asset_type: str
    name: str
    exchange: str
    currency: str
    provider: str
    is_active: bool
    tradable: bool
    trading_hours: str
    data_delay: str
    supported_timeframes: list[str]

    class Config:
        from_attributes = True


class UniverseAssetCreate(BaseModel):
    symbol: str
    asset_type: str
    name: str
    exchange: str
    currency: str = "USD"
    provider: str = "unassigned"
    tradable: bool = True

    @field_validator("asset_type")
    @classmethod
    def _known_asset_type(cls, v: str) -> str:
        if v in _RESERVED_ASSET_TYPES:
            raise ValueError(f"asset_type {v!r} is reserved for future expansion and not yet enabled.")
        if v not in _ENABLED_ASSET_TYPES:
            raise ValueError(f"Unknown asset_type {v!r}. Valid: {sorted(_ENABLED_ASSET_TYPES)}")
        return v


class UniverseAssetUpdate(BaseModel):
    """All fields optional — PATCH semantics, only supplied fields change."""

    is_active: bool | None = None
    tradable: bool | None = None
    name: str | None = None
    exchange: str | None = None
    provider: str | None = None
    data_delay: str | None = None
