# Data Provider Comparison — Multi-Asset Coverage

**Rule (from the spec):** Do not fabricate coverage. Document exactly which provider supplies each field. If a provider does not supply a field, the platform shows **unavailable** — never an approximation.

> ⚠️ **Verification status:** The coverage below reflects each vendor's published API as of the knowledge cutoff (Jan 2026) and this repo's existing adapters. **Every "✅" must be re-confirmed against the live API on the plan you actually buy** before it's trusted — free tiers routinely gate endpoints. The `scripts/finnhub_diag.py` pattern (probe + record HTTP status per endpoint) is the confirmation tool; extend it per provider.

---

## 1. Asset-class coverage (which vendor can even see the asset)

| Asset class | Finnhub | Twelve Data | Alpha Vantage | Polygon | SEC EDGAR |
|---|---|---|---|---|---|
| US large-cap stocks (AAPL, NVDA) | ✅ | ✅ | ✅ | ✅ | ✅ (filings) |
| ETFs (SPY, QQQ, GLD) | ✅ | ✅ | ✅ | ✅ | ✅ (filings) |
| Indices (^GSPC, ^VIX) | ✅ | ✅ | partial | ✅ | ❌ |
| Precious metals spot (XAU/XAG) | partial | ✅ | ✅ (FX/metals) | partial | ❌ |
| Commodities (oil, natgas) | partial | ✅ | partial | ✅ | ❌ |
| OTC micro-caps | ✅ (tier MICs) | partial | partial | ✅ (OTC add-on) | ✅ |

## 2. Field-level coverage (large-cap equities/ETFs)

| Field | Finnhub | Twelve Data | Alpha Vantage | Notes |
|---|---|---|---|---|
| Real-time quote | ✅ (plan-gated) | ✅ | delayed | free tiers often delayed |
| Historical daily bars | ✅* | ✅ | ✅ | *`/stock/candle` may be paid — see §4 |
| Intraday bars (1m/5m) | ✅ (plan) | ✅ | ✅ | |
| WebSocket streaming | ✅ (`wss://ws.finnhub.io`) | ✅ | ❌ | our `FinnhubTradeSource` already targets this |
| Company profile | ✅ | ✅ | ✅ | |
| Fundamentals (revenue, margins) | ✅ (`/stock/metric`) | ✅ | ✅ (OVERVIEW) | |
| EPS / EPS growth | ✅ | ✅ | ✅ | |
| P/E, Forward P/E, PEG, P/S, P/B | ✅ (metric) | ✅ | ✅ | |
| Dividend yield | ✅ | ✅ | ✅ | |
| Earnings date / calendar | ✅ (`/calendar/earnings`) | ✅ | ✅ (EARNINGS) | |
| Earnings surprise history | ✅ | partial | ✅ | |
| Analyst consensus / price targets | ✅ (`/stock/price-target`, plan) | partial | ❌ | often premium |
| Institutional ownership | ✅ (`/stock/ownership`, plan) | ❌ | ❌ | premium; else EDGAR 13F |
| Insider transactions | ✅ (`/stock/insider-transactions`) | ❌ | ❌ | else EDGAR Form 4 |
| News + sentiment | ✅ (`/company-news`) | partial | ✅ (NEWS_SENTIMENT) | our adapter leaves sentiment neutral until a real classifier |
| Absolute debt/cash (balance sheet) | ratios only | ✅ | ✅ | Finnhub exposes ratios; absolutes need EDGAR/TwelveData |
| Dilution / going-concern / reverse-split (OTC) | ❌ | ❌ | ❌ | **SEC EDGAR only** — already integrated |

`✅* / partial / ❌` = supported / plan-or-partial / not available → shown as **unavailable**.

## 3. Macro / market-intelligence coverage (spec §NEW MARKET INTELLIGENCE)

| Signal | Best source |
|---|---|
| S&P 500 / Nasdaq trend | quote+bars on SPY/QQQ or ^GSPC/^IXIC (any of Finnhub/TwelveData) |
| VIX | index quote (^VIX) — Finnhub/TwelveData |
| Interest rates / Treasury yields | Alpha Vantage `TREASURY_YIELD`, `FEDERAL_FUNDS_RATE`; FRED (free) |
| US Dollar Index (DXY) | TwelveData; Finnhub (^DXY, plan) |
| Gold / oil trend | TwelveData metals/commodities; GLD/USO as proxies |
| Market breadth | computed internally from index constituents |
| Relative strength vs SPY / sector ETF | **computed internally** from our own bars — no vendor needed |
| Correlation with indices | **computed internally** |

Several "intelligence" signals are **derived in our deterministic layer** from bars we already fetch — no new vendor, and provenance stays clean.

## 4. Finnhub 401 — root-cause note (carryover from the provider-integration thread)

The live diagnostic (`scripts/finnhub_diag.py`) returned **HTTP 401 on `/stock/symbol`, `/quote`, `/stock/profile2`** with **both** the `X-Finnhub-Token` header and the `?token=` query param. Interpretation:

- **Not** a redirect/network problem (the earlier 302 is gone → nothing is intercepting on the user's network).
- **401 on `/quote` with a syntactically valid key ⇒ the key itself is rejected.** Most likely: the key was revoked (it was pasted in chat and flagged compromised), mistyped, or has stray whitespace. The masked `key[:4]…key[-4:] (len N)` line in the diagnostic confirms whether a ~40-char key actually loaded.
- **Action:** issue a fresh key at finnhub.io, put it in `backend/.env`, re-run the diagnostic. If `/quote` then returns 200 but `/stock/candle` returns **403**, historical candles require a **paid Finnhub plan** — the platform will show that field as unavailable rather than fabricate bars.

## 5. Recommended provider strategy

- **Primary (equities/ETFs/quotes/bars/WS/news/fundamentals/earnings):** Finnhub — already integrated, WS streaming already wired, broad field coverage. Confirm plan gates.
- **Metals/commodities/indices/FX + macro:** Twelve Data — strongest multi-asset coverage in one API; add adapter.
- **Macro rates/yields:** Alpha Vantage or FRED (free) — add lightweight adapter.
- **Filings / dilution / insider (OTC + 13F/Form 4):** SEC EDGAR — already integrated, free.
- **Optional deep US equities/OTC:** Polygon — existing stub; paid.

No single free tier covers everything; the provider **registry** (already built) lets each asset class resolve to its best adapter, and the honesty contract renders any gap as **unavailable**.
