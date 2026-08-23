# Market Expansion Audit — OTC-first → Multi-Asset

**Date:** 2026-08-05
**Scope:** Every component that assumes the tradable universe is OTC micro-caps.
**Method:** Static audit of 136 backend Python files + the Next.js frontend. Every finding below cites a real file/line.

---

## 1. Executive summary

The codebase is **more reusable than it looks.** The OTC assumption is concentrated in ~6 well-defined places (the asset model, one universe filter, the manipulation module, the mock provider, config strings, and frontend copy). The heavy machinery — provider abstraction, streaming, indicators, ML ensemble, calibration, backtest, signal engine, chat tool-calling, auth, provenance — is **asset-agnostic and should be preserved wholesale.**

The single most important functional bug for this pivot: **the Finnhub provider hard-filters its universe to OTC market-tier MICs**, so AAPL/NVDA/SPY literally cannot appear (`finnhub_provider.py:58,96`). That one filter — not a rewrite — is what currently makes the platform "OTC-only."

**Verdict:** Generalize, don't rewrite. Estimated ~15% of files change; ~85% are reused unchanged.

---

## 2. OTC-specific components (must change or gate behind an OTC module)

### 2.1 Asset / data model — `services/data_providers/base.py`
| Field | Line | Problem | Action |
|---|---|---|---|
| `TickerMeta.tier` (Pink/PinkLimited/Expert/QX/QB) | 22 | OTC tier system, required on every asset | Move to optional `OTCProfile`; add `asset_type`, `exchange`, `currency`, `trading_hours`, `data_delay`, `supported_timeframes` |
| `TickerMeta.reverse_split_count_3y` | 28 | OTC dilution signal, required | Optional / OTC module |
| `Fundamentals.dilution_12m_pct`, `going_concern_flag`, `filing_delinquent` | 74–77 | OTC red flags, required, no P/E, EPS, margins | Make optional; add the 24 large-cap fundamental fields (§NEW FUNDAMENTAL DATA) |
| `NewsArticle.is_promotional` | 89 | OTC pump detection | Keep (harmless), default False for large-caps |
| `CorporateAction.action_type` = reverse_split/dilution/offering/uplisting | 96 | OTC-centric vocabulary; no split/dividend/earnings | Extend enum: split, dividend, earnings |
| `get_universe()` docstring "tradable OTC universe" | 112 | Framing | Generalize |

### 2.2 DB model — `db/models/market.py`
- `Ticker.tier` default `"Pink"` (15), `Ticker.exchange` default `"OTC"` (16), `reverse_split_count_3y` (23). No `asset_type`, `currency`, `trading_hours`, `is_delayed`. **Action:** new columns + migration; OTC columns become nullable and move conceptually to an OTC profile.

### 2.3 API schema — `schemas/stock.py`
- `StockAnalysis.tier` required (32); `manipulation_risk` + `manipulation_flags` are first-class on every asset (42,65). No `asset_type`, no earnings/sector/macro scores, no fundamental ratios, no `HOLD/REDUCE/EXIT` status surface. **Action:** add `asset_type`, `earnings_score`, `sector_score`, `macro_score`, `risk_score`, `bull_case`, `bear_case`; make `tier`/`manipulation_*` optional.

### 2.4 Scorer — `services/scoring/scorer.py`
- `manipulation_risk` is a **fixed 15% penalty in the overall score for every asset** (`_overall_ai_score`, 204–221). Feature row hard-codes `dilution_12m_pct`, `reverse_split_count_3y`, insider/institutional ownership (193–196). `_trade_levels` uses 6-dp OTC sub-penny rounding (253–279). **Action:** reweight per asset type (large-caps: fundamentals/earnings/macro matter more, manipulation ≈ 0); keep sub-penny logic (harmless for large-caps, `round(x,6)` on `189.42` is `189.42`).

### 2.5 Manipulation module — `services/features/manipulation.py` (55 refs)
- 11 flag codes, almost all OTC: `pump_and_dump_pattern`, `toxic_dilution`, `repeated_reverse_splits`, `delinquent_filer`, `going_concern`, `promotional_campaign`, `low_liquidity_trap` (57–170). **Action:** keep the module, but for non-OTC assets it should return ~0 risk and no flags (large-caps don't reverse-split or file late). Reframe as one **optional risk input**, not a headline score. This is the biggest "don't show OTC warnings on NASDAQ stocks" fix.

### 2.6 Mock provider — `services/data_providers/mock_provider.py` (29 refs)
- Class `MockOTCProvider`; fake OTC tickers `AXNT, BLKM, CRVX…` (34); regimes `pump_dump`, `choppy_illiquid` (160–170); OTC tiers (69); dilution/delinquency injection (197,210). **Action:** add a large-cap synthetic set (AAPL/NVDA/SPY/GLD-like) with realistic regimes (trending large-cap, range-bound ETF, commodity), asset types, and no OTC red flags. Keep the OTC set for the future OTC module + manipulation tests.

### 2.7 Finnhub provider — `services/data_providers/finnhub_provider.py` (16 refs) ⚠️ **critical**
- `_OTC_MICS = {OOTC, OTCM, OTCB, OTCQ, PSGM, PINX}` (58); `get_universe` keeps **only** rows whose `mic` is in that set (96). **Large-caps are filtered out by design.** `data_mode = "delayed"` hard-coded (65). Auth via `?token=` → moved to header in the last change; the live probe now returns **401 on both header and query** (see DATA_PROVIDER_COMPARISON.md §Finnhub 401). **Action:** replace the OTC filter with asset-type-aware universe building (curated S&P 500 / Nasdaq-100 / ETF lists), fix the 401 (likely key/plan), map real fundamentals.

### 2.8 Config — `core/config.py`
- `app_name = "Ven0X OTC Intelligence Platform"` (17); DSN db name `ven0x_otc` (38); `otc_markets_api_key` (57); `universe_max_tickers` (74). **Action:** rename app; add `twelve_data_api_key`, `alpha_vantage_api_key`; keep OTC key for the OTC module.

### 2.9 Real-provider stubs — `services/data_providers/real_providers.py` (14 refs)
- `PolygonOTCProvider`, `OTCMarketsProvider` are `_UnimplementedProvider` stubs (86–104). **Action:** rename Polygon stub to generic `PolygonProvider`; keep OTCMarkets under the OTC module.

### 2.10 Frontend copy & panels
- `layout.tsx:6` title "Ven0X — OTC AI Research Platform"; `Sidebar.tsx:53,97` "Ven0X OTC" + "OTC micro-caps carry high manipulation"; `page.tsx:35,116` "OTC universe"; `opportunities/page.tsx:35` "Full OTC universe"; `ManipulationPanel` shown on **every** stock (`stock/[ticker]/page.tsx:171`); `tier` badge always shown (73). **Action:** neutral multi-asset copy; render ManipulationPanel + tier **only** when `asset_type === OTC_STOCK`.

---

## 3. Reusable components — **preserve unchanged** (the 85%)

| Component | Files | Why it's asset-agnostic |
|---|---|---|
| Provider abstraction + registry | `data_providers/base.py`, `registry.py`, `factory.py` | Port/adapter; already the right seam for multi-asset |
| Rate-limited HTTP client (redirects, degraded mode, sanitized logs) | `http_base.py` | Just hardened; provider-neutral |
| Real-time streaming | `streaming/core.py`, `incremental.py`, `service.py` | Candle aggregation, dedupe, incremental EMA/RSI/VWAP — pure price/volume |
| Technical indicators | `features/technical.py` | RSI/MACD/ATR/Bollinger/VWAP work on any OHLCV |
| ML ensemble + calibration + forecasting | `services/ml/*` | Feature-vector in, probability out; retrain on any asset |
| Signal engine (status ladder, immutable history) | `signals/engine.py` | Statuses generalize; safety thresholds need per-asset tuning only |
| Backtest engine + broker sim | `services/backtest/*` | Spread/slippage/fills are universal |
| Chat tool-calling framework | `chat/tools.py`, `assistant.py` | Add tools; framework unchanged |
| Auth / rate limit / monitoring | `core/security.py`, `api/deps.py`, `monitoring/*` | Fully generic |
| Charts | `components/charts/LiveChart.tsx`, `PriceChart.tsx` | Lightweight-Charts on any bars |
| Provenance / honesty contract | `data_mode`/`data_source`/`as_of` everywhere | The platform's core strength — keep and extend |

---

## 4. Risk register for the migration

| Risk | Mitigation |
|---|---|
| Breaking the working OTC path | OTC kept as optional module + tests; nothing deleted |
| Manipulation flags leaking onto large-caps | Gate rendering + scoring on `asset_type`; large-cap synthetic + real data produce ~0 flags |
| Provider can't supply a promised field (e.g. analyst targets on free tier) | Honesty contract already returns `None`/"unavailable" — never fabricate |
| Index vs ETF confusion | Explicit `asset_type` INDEX vs ETF; indices are non-tradable, no entry/stop |
| Finnhub 401 blocks real validation | Resolve key/plan first (step 4); mock large-cap slice unblocks all other work in parallel |

---

## 5. Change-surface estimate

- **Change:** base.py, market.py, stock.py, scorer.py, finnhub_provider.py, mock_provider.py, config.py, real_providers.py, ~6 frontend files, manipulation gating, scanner categories, chat tools, tests. (~20–25 files)
- **Add:** asset model + OTC profile, asset-type registry, fundamentals/earnings/macro services, new scanners, provider adapters (Twelve Data / Alpha Vantage), docs. (~15–20 files)
- **Preserve untouched:** streaming, indicators, ML, backtest, calibration, auth, monitoring, charts. (~90 files)
