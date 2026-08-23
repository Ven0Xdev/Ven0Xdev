# AI Reliability & Hallucination-Risk Audit

Audit date: 2026-07-12. The platform's core promise is calibrated honesty; this document audits every place that promise could break.

## Hallucination-risk map, surface by surface

| Surface | Risk | Assessment |
|---|---|---|
| Template chat backend | **None** — deterministic string assembly from computed analysis; cannot state a number it didn't receive | ✅ safe; epistemic footer present (gap: lacked source+timestamp — fixed in slice) |
| LLM chat backend | Medium — mitigated structurally: receives NO pre-baked context, must tool-call for quantitative claims; system prompt mandates fact/prediction/assumption/missing separation | ⚠️ **implemented but never executed live** (no key). Must not be advertised until smoke-tested (see plan P1-4). Residual risk: model paraphrasing tool numbers incorrectly — mitigation: instruct verbatim citation; future: post-hoc number-check against tool payloads (P3) |
| Reasoning engine / agents | None in the LLM sense — all claims template-bound to computed values | ✅ every Evidence carries machine-locatable `source` |
| Explanations (SHAP narrative) | Low — fallback contribution proxy when SHAP unavailable could mis-rank factors | documented in code; SHAP installed in prod requirements ✅ |
| Mock provider | **Was a real integrity hole**: fabricated companies for unknown tickers | fixed in P0 slice (unknown symbol → error in every mode) |

## Probability reliability

| Concern | State |
|---|---|
| Calibration measured? | ✅ reliability report + walk-forward calibration buckets exist and are tested |
| Calibrated on real outcomes? | ⚠️ NOT YET — isotonic calibrators fit on training data; real-outcome recalibration requires graded history (mechanism built: champion/challenger + SelfLearningAgent damping while sparse) |
| Cold-start honesty | ✅ heuristic prior shrunk toward 0.5; conviction damped ×0.85 without history; confidence hard-capped 5–97 |
| Certainty leakage | ✅ tested invariants: probabilities <1.0, conviction ≤0.97, graded stances not buy/sell |
| Drift detection | ✅ PSI on outputs and features; calibration-gap alert at CRITICAL |

## Data-quality risks feeding the AI

1. **Finnhub sentiment/promo placeholders (biggest live-mode gap):** on real data, news sentiment is neutral-0 and `is_promotional` always False → the sentiment score is uninformative and the promo-campaign manipulation rule is dormant. The scores still *display* as if informed. Mitigation now: "reduced-information mode" documented; slice adds visible data-mode labeling. Real fix: FinBERT-class classifier (P2).
2. **EDGAR lag:** dilution/delinquency appear only after worker ingestion (24h TTL, 50/cycle). Before ingestion: neutral defaults with a "partial" note in code but **not in the API payload** — improved by slice provenance fields.
3. **Survivorship/universe bias:** finnhub universe = currently listed OTC symbols; delisted names absent → backtests on live data skew optimistic. Documented in engine docstring; real fix needs a historical universe source (P3).
4. **Mock-trained ensemble artifacts:** any model trained via `training_pipeline` on mock data must never serve live-data predictions. Currently no artifact provenance check — `ModelVersion.hyperparameters` records source only for challengers. **Recommendation (P1-5): stamp provider name into every artifact and refuse champion promotion across data sources.**

## Honesty invariants currently enforced by tests (the good news)

- No certainty: caps and bounds tested across scorer, judge, dossier.
- Same-bar ambiguity → graded against the platform (stop-first), tested.
- Idempotent, DB-unique outcome grading, tested.
- Evidence attribution: every claim carries agent + source, tested.
- Contrarian always files; strong consensus always faces opposition, tested.
- Missing vendor data → typed error or explicit None; grep-verified no silent defaults in adapters.

## Verdict

The deterministic core is reliably honest by construction and by test. The two real reliability exposures are (1) uninformed-but-normal-looking sentiment/promo scores in live mode, and (2) the untested live-LLM path. Both are contained by the P0/P1 plan; neither is hidden from users after the slice's provenance labels.
