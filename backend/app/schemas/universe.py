from pydantic import BaseModel, field_validator

from app.services.data_providers.base import AssetType

_VALID_ASSET_TYPES = {t.value for t in AssetType}


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
        if v not in _VALID_ASSET_TYPES:
            raise ValueError(f"Unknown asset_type {v!r}. Valid: {sorted(_VALID_ASSET_TYPES)}")
        return v


class UniverseAssetUpdate(BaseModel):
    """All fields optional — PATCH semantics, only supplied fields change."""

    is_active: bool | None = None
    tradable: bool | None = None
    name: str | None = None
    exchange: str | None = None
    provider: str | None = None
    data_delay: str | None = None
