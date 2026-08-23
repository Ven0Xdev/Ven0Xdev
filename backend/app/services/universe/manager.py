"""Asset Universe Manager — the single source of truth for which symbols
the platform tracks, replacing the three previously-scattered ticker lists
(`mock_provider.py`'s OTC universe stays as its own isolated legacy module,
per the multi-asset spec — this manager governs the new multi-asset surface:
`market_overview.py` and, going forward, the multi-asset scanner).

Backed by the `assets` table (`db/models/asset.py`), added in migration
`cf153aaf7ad5` but previously unused by any code path. Activate/deactivate/
add/remove happens here — through data, never by editing source code.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.asset import Asset
from app.services.data_providers.base import AssetType

# The MVP seed universe (spec §2). GLD/IAU/SLV are typed ETF, not
# PRECIOUS_METAL — they trade and settle exactly like any other ETF share;
# PRECIOUS_METAL is reserved for true spot/commodity instruments (see
# test_asset_model.py::test_gold_spot_and_gld_are_distinct_asset_types,
# an already-established and tested convention this reuses rather than
# reinvents).
SEED_UNIVERSE: list[dict] = [
    *[
        {"symbol": s, "asset_type": AssetType.STOCK, "exchange": "NASDAQ"}
        for s in ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "NFLX", "AVGO"]
    ],
    *[
        {"symbol": s, "asset_type": AssetType.ETF, "exchange": "ARCA"}
        for s in ["SPY", "VOO", "QQQ", "DIA", "IWM", "GLD", "IAU", "SLV", "XLK", "XLE"]
    ],
]

# Display names are metadata, not tradable facts — used only for UI/demo
# fallback labeling, never for pricing or analysis. Kept here (next to the
# seed list) rather than invented per-provider. Public: also reused by
# MockOTCProvider to keep its synthetic multi-asset metadata in sync with
# this canonical universe (see mock_provider.py's _MULTI_ASSET_PROFILES).
SEED_NAMES = {
    "AAPL": "Apple Inc.", "MSFT": "Microsoft Corporation", "NVDA": "NVIDIA Corporation",
    "AMZN": "Amazon.com, Inc.", "META": "Meta Platforms, Inc.", "GOOGL": "Alphabet Inc.",
    "TSLA": "Tesla, Inc.", "AMD": "Advanced Micro Devices, Inc.", "NFLX": "Netflix, Inc.",
    "AVGO": "Broadcom Inc.",
    "SPY": "SPDR S&P 500 ETF Trust", "VOO": "Vanguard S&P 500 ETF", "QQQ": "Invesco QQQ Trust",
    "DIA": "SPDR Dow Jones Industrial Average ETF", "IWM": "iShares Russell 2000 ETF",
    "GLD": "SPDR Gold Shares", "IAU": "iShares Gold Trust", "SLV": "iShares Silver Trust",
    "XLK": "Technology Select Sector SPDR Fund", "XLE": "Energy Select Sector SPDR Fund",
}


def seed_default_universe(db: Session) -> int:
    """Idempotent: inserts any seed symbol missing from `assets`, touches
    nothing that already exists (an operator may have since deactivated or
    edited a row — seeding must never silently revert that). Returns the
    count of rows actually inserted."""
    existing = {row.symbol for row in db.query(Asset.symbol).all()}
    inserted = 0
    for entry in SEED_UNIVERSE:
        symbol = entry["symbol"]
        if symbol in existing:
            continue
        db.add(
            Asset(
                symbol=symbol,
                asset_type=entry["asset_type"].value,
                name=SEED_NAMES[symbol],
                exchange=entry["exchange"],
                currency="USD",
                provider="unassigned",
                is_active=True,
                tradable=True,
                supported_timeframes=["1d"],
            )
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def get_active_universe(db: Session, asset_type: str | None = None) -> list[Asset]:
    query = db.query(Asset).filter(Asset.is_active.is_(True))
    if asset_type is not None:
        query = query.filter(Asset.asset_type == asset_type)
    return query.order_by(Asset.symbol).all()
