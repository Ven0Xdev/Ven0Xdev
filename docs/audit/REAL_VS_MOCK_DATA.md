# Real vs. Mock Data — Exact Inventory

Audit date: 2026-07-12. Governing rule (P2 of the PRD): data a vendor does not supply is reported as missing/neutral — never approximated. This document says, per datum, exactly where it comes from in each provider mode.

## Provider modes

| Mode | Activation | What it is |
|---|---|---|
| `mock` (default) | `MARKET_DATA_PROVIDER=mock` | Deterministic **synthetic** generator, 5 regimes, seeded per symbol. Clearly synthetic by design; exists so the platform runs with zero keys. |
| `finnhub` | key set (user's key verified live 2026-07-11) | **Real market data**, free tier. Daily candles are end-of-day; quotes near-real-time. |
| `finnhub+edgar` | default when finnhub active | Finnhub + **real SEC EDGAR facts** overlaid (dilution, filing status). |
| polygon / otc_markets / alpaca | registered, unimplemented | Selecting them fails loudly with vendor+key+docs specifics. Never silently degrade. |

## Datum-by-datum

| Datum | mock mode | finnhub(+edgar) mode | Timestamped? |
|---|---|---|---|
| Universe list | generated (30 fixed symbols) | **real** (US directory filtered to OTC MICs) | no |
| Company name/tier/sector | generated | **real** (profile2) | no |
| OHLCV daily bars | generated | **real EOD** | bar ts ✅ |
| Live quote | generated from last bar | **real** (`/quote`) | ✅ epoch from vendor |
| Bid/ask depth | generated | **absent — reported as None, never approximated** | — |
| Float shares | generated | **not supplied** — outstanding used, documented | no |
| Shares outstanding | generated | **real** (profile2; EDGAR overrides when ingested) | EDGAR `fetched_at` ✅ |
| Dilution 12m | generated (regime-linked) | **real from EDGAR XBRL** when ingested; explicit neutral 0 + "partial data" note before ingestion | ✅ |
| Filing delinquency / going concern | generated | delinquency **real from EDGAR**; going-concern **not implemented** (needs full-text search) → always False, documented | ✅ / — |
| Reverse-split history | generated | **not available** → 0, documented (EDGAR phase 2) | — |
| News headlines | generated templates | **real** (company-news, 30d) | ✅ per article |
| News sentiment | generated | **neutral 0.0 placeholder — honest, no keyword guessing** (classifier = Phase 4) | — |
| Promotional-content flag | generated (regime-linked) | **always False — classifier not built**; the promo-campaign manipulation rule is effectively dormant on live data | — |
| Insider/institutional ownership | generated | not supplied → None-equivalent defaults | — |
| Short interest | generated | not supplied | — |
| Corporate actions | generated reverse splits | **empty list** (needs EDGAR phase 2 / paid vendor) | — |
| Predictions/outcomes/scan history | real platform records (of whatever provider fed them) | same | ✅ |
| Backtest fills/costs | **simulated by declared model** (spread/slippage/halt assumptions — parameters, not fabrications) | same | — |

## The two integrity holes this audit found (fixed in the P0 slice)

1. **API responses carry no `data_source` / `data_mode` / `as_of`** — a consumer cannot distinguish synthetic from real from delayed. The UI shows no label at all → *silent demo data* when running mock.
2. **Mock fabricates unknown tickers**: `get_ticker_meta("QQQQZZ")` invents "Qqqqzz Holdings Inc." — synthetic mode should still say "unknown symbol", not conjure companies.

## What is NEVER mocked

- SEC EDGAR facts (real or absent).
- Platform self-records: predictions, outcomes, calibration, scan decisions — always real records of what the system actually did.
- Failure states: missing vendor data raises typed `ProviderDataUnavailable`; nothing invents a fallback number.
