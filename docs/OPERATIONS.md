# Operations — Portfolio Intelligence & Platform Monitoring

| Field | Value |
|---|---|
| Version | 1.0 |
| Status | Implemented (`services/portfolio_intel/`, `services/monitoring/`) |
| Companion docs | `SYSTEM-ARCHITECTURE.md` §11 (observability design) · `AI-ARCHITECTURE.md` |

---

## 1. Portfolio Intelligence (`GET /api/v1/portfolio/health`)

Operates on recorded open positions marked against the live provider.
Positions the provider cannot price are **excluded from weights and
flagged** — never carried at a stale or invented mark (P2).

**Exposure & concentration**

- Per-position weight, unrealized P/L, sector attribution
- **Herfindahl index** — effective diversification (1/HHI ≈ "how many
  positions do you *really* have"); alert above 0.30
- Largest-position limit 25%, sector limit 40% — each breach is a named,
  value-citing alert

**Risk profile** — weight-blended manipulation risk, liquidity score, and
downside-before-upside probability across the book; weighted manipulation
exposure >50/100 is a critical alert.

**Sizing discipline** — every position gets a verdict against *its own*
risk-derived ceiling (`max_allocation_pct` from the scorer):
`trim` (over ceiling), `hold` (within), `room_to_add` (under half —
explicitly labeled *capacity, not a buy instruction*). Risk optimization
here is deliberately **subtractive**: the engine recommends reducing
oversized exposure; it never recommends leveraging up to "use" spare risk
budget.

**Health grade** — A–D from diversification (50%), inverse manipulation
exposure (30%), liquidity (20%), minus alert penalties.

## 2. Recommendation dossier (`GET /api/v1/portfolio/recommendation/{symbol}`)

A projection of the staged multi-agent deliberation into the nine mandatory
sections — the dossier cannot disagree with the deliberation because it *is*
the deliberation, reshaped:

| Section | Source |
|---|---|
| why_buy / why_not_buy | Judge's strongest evidence, both sides, verbatim |
| biggest_risks | Risk Manager stage evidence |
| confidence_calculation | The actual formula with its live components: \|net evidence\| × agreement × model confidence × calibration damping, cap 0.97 — every factor can only reduce conviction |
| manipulation_risk | Detective findings |
| liquidity_analysis | Liquidity/illiquidity evidence + composite risk |
| historical_similarities | Memory Agent (graded outcomes for this ticker; honest empty state) |
| missing_information | Harvested gaps: no graded history, insufficient calibration sample, missing quote depth, unpriceable quote — never padded |
| invalidation_conditions | Risk Manager's explicit list incl. the concrete stop |

`full_deliberation` is attached for complete auditability.

## 3. Platform monitoring (`GET /api/v1/monitoring/health`)

One report, eight subsystems, rule-evaluated alerts with named thresholds:

| Subsystem | Method | Alert threshold |
|---|---|---|
| **Model drift** | PSI of prediction outputs (prob_up_10, scores), recent vs. reference window of the predictions table | PSI > 0.25 → critical |
| **Feature drift** | PSI per input feature from frozen feature_snapshots; top-10 reported | PSI > 0.25 → warning |
| **Prediction accuracy** | Calibration report + graded-outcome counts | \|gap\| > 0.15 in a bucket with ≥20 outcomes → **critical** (product-integrity incident, arch D10) |
| **Evaluation backlog** | Predictions >30 days old with no outcome | >200 → warning |
| **Provider failures** | In-process counters incremented inside the shared HTTP base, per vendor | failure rate >20% over ≥20 calls → critical |
| **Scanner health** | Age of the latest scan_cycles row | >45 min → critical (continuous scanning stopped) |
| **API latency** | Middleware ring-buffer per route: p50/p95/max | p95 >5s over ≥20 samples → warning |
| **Database health** | SELECT 1 ping timing | failure → critical |

Design notes:

- **Drift is computed over what the model actually saw and said** (the
  predictions table), never re-derived market data.
- **Honest empty states everywhere**: fewer than 60 predictions → drift
  reports `insufficient_history`; drift is never inferred from thin data.
- Counters are the L0 in-process layer; the Prometheus exporter (Phase 5,
  SYSTEM-ARCHITECTURE §11) will scrape these same registries — the
  counter names are the future metric names.

## 4. Alert severity contract

- `critical` — page-worthy: product integrity (calibration), pipeline
  stopped (scanner, database), vendor outage, dangerous concentration.
- `warning` — investigate this week: drift building, backlog growing,
  latency degrading, sector clustering.

Every alert message includes the observed value AND the threshold — an
alert that can't be verified from its own text is a defect.
