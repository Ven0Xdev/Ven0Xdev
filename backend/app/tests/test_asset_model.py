"""Unified multi-asset model: AssetType/AssetMeta/OTCProfile invariants and
the additive `assets` table. Nothing here touches the existing OTC
TickerMeta/Ticker path — this is purely the new multi-asset layer."""
import pytest

from app.db.models.asset import Asset
from app.services.data_providers.base import AssetMeta, AssetType, OTCProfile


def test_asset_type_has_all_spec_members():
    expected = {"STOCK", "ETF", "INDEX", "COMMODITY", "PRECIOUS_METAL", "FOREX", "CRYPTO", "OTC_STOCK"}
    assert {t.value for t in AssetType} == expected


def test_standard_stock_has_no_otc_profile():
    aapl = AssetMeta(symbol="AAPL", asset_type=AssetType.STOCK, name="Apple Inc.", exchange="NASDAQ")
    assert aapl.otc is None


def test_otc_profile_cannot_attach_to_a_non_otc_asset():
    with pytest.raises(ValueError, match="OTC fields must never attach"):
        AssetMeta(
            symbol="AAPL", asset_type=AssetType.STOCK, name="Apple Inc.", exchange="NASDAQ",
            otc=OTCProfile(tier="Pink"),
        )


def test_otc_stock_can_carry_an_otc_profile():
    otc = AssetMeta(
        symbol="AXNT", asset_type=AssetType.OTC_STOCK, name="Axnt Holdings", exchange="OTC",
        otc=OTCProfile(tier="Pink", caveat_emptor=True),
    )
    assert otc.otc.tier == "Pink"
    assert otc.otc.caveat_emptor is True


def test_index_is_never_tradable():
    with pytest.raises(ValueError, match="INDEX assets are never tradable"):
        AssetMeta(symbol="^GSPC", asset_type=AssetType.INDEX, name="S&P 500", exchange="INDEX", tradable=True)

    spx = AssetMeta(symbol="^GSPC", asset_type=AssetType.INDEX, name="S&P 500", exchange="INDEX", tradable=False)
    assert spx.tradable is False


def test_etf_tracking_an_index_is_tradable_and_distinct():
    spy = AssetMeta(symbol="SPY", asset_type=AssetType.ETF, name="SPDR S&P 500 ETF", exchange="ARCA")
    spx = AssetMeta(symbol="^GSPC", asset_type=AssetType.INDEX, name="S&P 500", exchange="INDEX", tradable=False)
    assert spy.tradable is True and spx.tradable is False
    assert spy.asset_type != spx.asset_type


def test_gold_spot_and_gld_are_distinct_asset_types():
    gold_spot = AssetMeta(symbol="XAU", asset_type=AssetType.PRECIOUS_METAL, name="Gold Spot", exchange="SPOT")
    gld = AssetMeta(symbol="GLD", asset_type=AssetType.ETF, name="SPDR Gold Shares", exchange="ARCA")
    assert gold_spot.asset_type == AssetType.PRECIOUS_METAL
    assert gld.asset_type == AssetType.ETF


def test_default_metadata_matches_spec_required_fields():
    m = AssetMeta(symbol="NVDA", asset_type=AssetType.STOCK, name="NVIDIA Corp", exchange="NASDAQ")
    assert m.currency == "USD"
    assert m.is_active is True
    assert m.supported_timeframes == ["1d"]
    assert m.data_delay == "unspecified"


def test_asset_table_roundtrip(db_session):
    row = Asset(
        symbol="MSFT", asset_type="STOCK", name="Microsoft Corp", exchange="NASDAQ",
        currency="USD", provider="finnhub", supported_timeframes=["1m", "1d"],
    )
    db_session.add(row)
    db_session.commit()

    fetched = db_session.query(Asset).filter_by(symbol="MSFT").one()
    assert fetched.asset_type == "STOCK"
    assert fetched.otc_tier is None  # never populated for a standard stock
    assert fetched.supported_timeframes == ["1m", "1d"]
