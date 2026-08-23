# Updated Product Roadmap — Multi-Asset AI Research Platform

**From:** OTC micro-cap manipulation-detection tool
**To:** AI-powered financial research assistant across US large-caps, ETFs, indices, metals, and commodities — with OTC preserved as an optional module.

**Guardrail (unchanged, non-negotiable):** The system never guarantees profit. Every number carries provenance (source, mode, timestamp). Missing vendor data is shown as *unavailable*, never fabricated. The LLM never invents prices, probabilities, or levels.

---

## Phase 0 — Audit ✅ (this delivery)
- MARKET_EXPANSION_AUDIT.md · OTC_TO_MULTI_ASSET_MIGRATION.md · DATA_PROVIDER_COMPARISON.md · this roadmap.
- Outcome: OTC assumption localized to ~6 areas; 85% of the codebase confirmed reusable.

## Phase 1 — Unified asset foundation
- `AssetType` enum + `AssetMeta` + optional `OTCProfile`.
- DB migration: additive `asset_type`, `currency`, `tradable`, `trading_hours`, `data_delay`; OTC columns → nullable.
- Multi-asset `validate_symbol()` with curated registries (S&P 500, Nasdaq-100, ETF list, metals/indices map) that distinguishes **index vs tradable ETF** and **gold spot vs GLD**.
- **Exit criteria:** AAPL, SPY, ^GSPC, GLD, XAU each validate to the correct asset type with no OTC fields on non-OTC assets.

## Phase 2 — Provider integration (real data)
- Remove Finnhub `_OTC_MICS` universe filter; asset-type-aware universe.
- Resolve Finnhub 401 (fresh key/plan); map real fundamentals + earnings.
- Add Twelve Data adapter (metals/commodities/indices/macro); Alpha Vantage/FRED for rates.
- Extend the diagnostic-probe pattern per provider; every field's source documented.
- **Exit criteria:** provider health green; every displayed field traces to a named provider or an internal calculation; gaps render *unavailable*.

## Phase 3 — Three vertical slices (proof end-to-end)
- **AAPL** (STOCK): validate→bars→live chart→indicators→fundamentals/earnings→AI analysis→assistant answers "Is Apple expensive?".
- **SPY** (ETF): same, plus "tracks S&P 500" metadata; assistant answers "QQQ or SPY?".
- **GLD / gold** (ETF + PRECIOUS_METAL): assistant answers "Is gold stronger than stocks?"; gold-spot vs GLD kept distinct.
- **Exit criteria:** all three render a full page with real (or clearly-labeled synthetic) data, zero OTC warnings.

## Phase 4 — Analysis & intelligence upgrade
- Add scores: earnings, sector, macro, risk; add `bull_case`/`bear_case`, `HOLD/REDUCE/EXIT` statuses.
- Market intelligence: SPY/Nasdaq trend, VIX, DXY, yields, gold/oil trend, breadth, relative strength vs SPY & sector ETF (computed internally), correlations.
- Reweight scoring per asset type; manipulation demoted to an OTC-only input.
- New fundamentals: revenue/EPS growth, FCF, margins, P/E, fwd P/E, PEG, P/S, P/B, dividend yield, institutional/insider, analyst consensus & targets, earnings date & surprise history.

## Phase 5 — Scanners & chart markers
- Scanners: S&P 500, Nasdaq-100, large-cap momentum, quality growth, value, earnings, technical breakouts, oversold, high RVOL, ETF, gold/commodity, risk-off, dividend.
- Chart markers: earnings, dividend, split (on top of existing entry/stop/TP/exit/news).

## Phase 6 — AI assistant expansion
- Tools: get_fundamentals, get_earnings, get_macro_context, compare_assets, get_relative_strength, get_analyst_view.
- Answers the full spec question set (buy NVDA? AAPL vs MSFT? SPY uptrend? gold vs stocks? next earnings? overvalued? invest vs trade? allocation?).
- Epistemic labeling preserved: verified fact / calculation / model prediction / assumption / unavailable.

## Phase 7 — Cleanup, tests, docs, OTC module
- Remove OTC warnings from standard assets (gate on asset_type).
- Asset-type test matrix; OTC tests preserved and moved under the OTC module.
- Update PRD/ARCHITECTURE/README; keep OTC fully functional but optional.

---

## Supported assets at completion
STOCK · ETF · INDEX · COMMODITY · PRECIOUS_METAL · FOREX · CRYPTO(future) · OTC_STOCK(optional module)
Examples wired: AAPL NVDA MSFT AMZN META GOOGL TSLA · SPY VOO QQQ DIA GLD IAU SLV · ^GSPC ^IXIC ^NDX ^DJI ^VIX · XAU XAG oil natgas.

## What stays real vs. synthetic vs. delayed
- **Real-time:** Finnhub WS trades (on plan) → live chart current bar.
- **Delayed/EOD:** historical daily bars, fundamentals, earnings (vendor-dependent, labeled).
- **Computed:** indicators, relative strength, correlations, scores, probabilities (deterministic layer, labeled as calculations).
- **Synthetic:** mock provider only, every value badged SYNTHETIC — never silently substituted for real data.

## Next 3 priorities (immediately after this audit)
1. **Phase 1 asset model + validation** (unblocks everything; can proceed on the mock large-cap slice with zero API keys).
2. **Phase 2 Finnhub 401 fix + de-OTC universe** (turns on real AAPL/SPY data).
3. **Phase 3 AAPL vertical slice** (first real proof the pivot works end-to-end).
