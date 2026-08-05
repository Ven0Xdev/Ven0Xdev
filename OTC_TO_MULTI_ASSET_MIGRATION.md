# OTC → Multi-Asset Migration Plan

**Principle:** Generalize the seams, gate OTC behind a module, preserve everything reusable. No blind rewrites.

---

## 1. Unified asset model

New enum and value objects (`services/data_providers/base.py` + new `asset.py`):

```python
class AssetType(str, Enum):
    STOCK          = "STOCK"
    ETF            = "ETF"
    INDEX          = "INDEX"          # non-tradable (S&P 500, Nasdaq Composite, VIX)
    COMMODITY      = "COMMODITY"      # oil, natural gas (futures/spot)
    PRECIOUS_METAL = "PRECIOUS_METAL" # gold/silver spot (XAU, XAG)
    FOREX          = "FOREX"
    CRYPTO         = "CRYPTO"
    OTC_STOCK      = "OTC_STOCK"      # the old default, now one type among many
```

Every symbol carries (spec §SUPPORTED ASSET TYPES):

```python
@dataclass
class AssetMeta:
    symbol: str
    asset_type: AssetType
    name: str
    exchange: str            # NASDAQ, NYSE, ARCA, CBOE, OTC, INDEX, SPOT
    currency: str            # USD default
    provider: str            # which adapter is authoritative
    is_active: bool
    tradable: bool           # False for INDEX
    trading_hours: str       # "09:30-16:00 ET" | "24x5" | "index"
    data_delay: str          # "realtime" | "delayed_15m" | "eod" | "synthetic"
    supported_timeframes: list[str]  # ["1m","5m","15m","1h","1d","1w"]
    otc: "OTCProfile | None" = None  # ONLY populated for OTC_STOCK
```

OTC-only fields move here and are populated **only** for `OTC_STOCK`:

```python
@dataclass
class OTCProfile:
    tier: str                 # Pink, PinkLimited, Expert, QX, QB
    caveat_emptor: bool
    shell_risk: bool
    disclosure_status: str
    reverse_split_count_3y: int
```

**Result:** a NASDAQ stock never carries a tier, Caveat Emptor, shell risk, or disclosure status. Requesting `.otc` on AAPL returns `None`, and the scorer/UI skip OTC logic entirely.

---

## 2. Index vs tradable ETF (explicit, spec-required)

| Symbol | asset_type | tradable | Tracks | Notes |
|---|---|---|---|---|
| `^GSPC` / SPX | INDEX | ❌ | — | S&P 500 index level; no entry/stop/targets |
| `SPY`, `VOO`, `IVV` | ETF | ✅ | S&P 500 | tradable, full trade plan |
| `^IXIC` | INDEX | ❌ | — | Nasdaq Composite |
| `^NDX` | INDEX | ❌ | — | Nasdaq-100 |
| `QQQ` | ETF | ✅ | Nasdaq-100 | ≠ Nasdaq Composite |
| `^DJI` | INDEX | ❌ | — | Dow Jones |
| `DIA` | ETF | ✅ | Dow Jones | |
| `^VIX` | INDEX | ❌ | — | volatility, macro input only |
| `XAU` (gold spot) | PRECIOUS_METAL | ✅* | — | spot price ≠ GLD |
| `GLD`, `IAU` | ETF | ✅ | Gold | tradable proxies for gold |
| `SLV` | ETF | ✅ | Silver | |

For `tradable=False` (INDEX), the analysis returns trend/momentum/macro context and **omits** entry/stop/targets (they're meaningless — you can't buy an index). The AI answers "SPY vs the S&P 500" correctly because they're distinct records.

---

## 3. Scoring changes (per asset type)

`_overall_ai_score` becomes asset-type-weighted:

| Score component | OTC_STOCK | STOCK/ETF | INDEX/COMMODITY |
|---|---|---|---|
| technical | 0.28 | 0.25 | 0.45 |
| fundamental | 0.18 | 0.22 | 0.00 |
| earnings | — | 0.15 | 0.00 |
| sentiment/news | 0.12 | 0.10 | 0.10 |
| sector/macro | — | 0.15 | 0.35 |
| liquidity | 0.10 | 0.05 | 0.05 |
| **manipulation penalty** | **0.15** | **0.03** | **0.00** |

Manipulation stops being a headline number for large-caps; it survives as a small OTC-only risk input.

---

## 4. Migration steps (maps to the 15-step order)

1. **Audit** — this doc + MARKET_EXPANSION_AUDIT.md. ✅
2. **Asset model** — add `AssetType`, `AssetMeta`, `OTCProfile`; keep `TickerMeta` as a thin OTC-flavored subtype for back-compat; DB migration adds `asset_type`, `currency`, `tradable`, `trading_hours`, `data_delay`, nullable OTC columns.
3. **Validation** — `validate_symbol()` resolves asset type from curated registries (S&P 500, Nasdaq-100, ETF list, metals/indices map) before hitting a provider; distinguishes index vs ETF.
4. **Provider fix** — remove Finnhub `_OTC_MICS` filter; asset-type-aware universe; resolve 401; map real fundamentals/earnings; document coverage (DATA_PROVIDER_COMPARISON.md).
5. **AAPL slice** — validate→bars→chart→indicators→fundamentals→analysis→AI, end to end.
6. **SPY slice** — ETF path (tracks-index metadata, no OTC fields).
7. **GLD/gold slice** — PRECIOUS_METAL/ETF path; gold spot vs GLD distinction.
8. **Charts/indicators** — already asset-agnostic; add earnings/dividend/split markers.
9. **AI analysis** — add earnings/sector/macro scores, bull/bear case, `HOLD` status.
10. **Scanners** — new categories (S&P 500, Nasdaq-100, momentum, growth, value, earnings, breakouts, oversold, RVOL, ETF, commodity, risk-off, dividend).
11. **Chat tools** — add get_fundamentals, get_earnings, get_macro_context, compare_assets, get_relative_strength.
12. **Remove OTC warnings** from standard assets (gate on asset_type).
13. **Tests** — asset-type matrix; OTC tests preserved.
14. **Docs** — update PRD/ARCHITECTURE/README.
15. **OTC module** — the OTC provider, tier logic, and manipulation flags live behind `asset_type == OTC_STOCK`, fully optional.

---

## 5. Backward compatibility

- `MockOTCProvider` and its OTC universe stay (feeds the OTC module + manipulation tests).
- Existing signal/streaming/backtest APIs unchanged; they gain asset-type awareness, not new required params.
- DB migration is additive (new nullable columns) — no data loss, `tier`/OTC columns simply become optional.
- Nothing in the reusable-85% list is deleted.
