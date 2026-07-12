# Ven0X — 50 Features to Beat TradingView, StockTitan, Finviz, Seeking Alpha & Koyfin

Version 1.0 · 2026-07-12 · Product-strategy document (no code in this change)

## 0. The strategic thesis (read this before the list)

**We do not beat TradingView at charting, Finviz at screening breadth, or Seeking Alpha at editorial.** Those are decade-old moats. We win where all five are structurally blind:

1. **OTC is nobody's first-class citizen.** TV/Finviz/Koyfin treat OTC as an afterthought (missing data, no tier awareness, no dilution/promo context). StockTitan does OTC news speed but zero analytics. An OTC-native intelligence layer has no incumbent.
2. **None of them grade themselves.** No competitor shows "here's what we predicted, here's what happened, here's our calibration." A public, verifiable track record is a trust moat that grows daily and cannot be copied retroactively — a copycat starts at zero history.
3. **None of them do manipulation forensics.** The #1 pain of OTC traders is being the exit liquidity of a promotion. Naming the pattern, with evidence, before the dump is the killer feature.
4. **Reasoning as product.** Competitors output numbers; we output *arguments* (evidence → contrarian attack → risk → verdict). Auditable AI reasoning is defensible because it requires the whole engine, not a UI clone.

**Moat hierarchy used in scoring:** proprietary accumulated data (prediction/outcome corpus, manipulation-event corpus, promo-fingerprint graph) > engine complexity > integrations > UI. UI features are 90-day copyable; data flywheels are not.

**Scoring:** V = user value (1–10), C = technical complexity (1–10, lower is cheaper), M = moat/hard-to-copy (1–10). Tier = weighted judgment, not a formula worship. ROI states the mechanism (retention / conversion / trust / revenue / data-flywheel) and build size (S/M/L).

---

## Tier S — Unfair advantages (build these first; they compound)

| # | Feature | Why it wins | Data required | V/C/M | ROI |
|---|---|---|---|---|---|
| 1 | **Public calibration track record** — per-model reliability curves, every prediction + outcome browsable, "we were wrong here" included | The only trust proof in a market full of pumpers; zero competitors have it; impossible to retro-copy (history accrues) | Already own: predictions/outcomes store (live) | 9/3/10 | Trust→conversion; the marketing asset. Build S (API exists, needs UI) |
| 2 | **Manipulation Forensics dossier** — named pattern + severity + itemized evidence per ticker (engine live) | Directly prevents the OTC trader's worst loss; StockTitan/Finviz have nothing | OHLCV, float, news, EDGAR (have) | 10/6/9 | Retention + word-of-mouth ("it flagged X before the dump"). Build M (surface + tune) |
| 3 | **Promo-campaign fingerprint graph** — cluster newsletters/sites/accounts by co-promotion patterns; "this ticker is being pushed by the network that ran [prior dump]" | Cross-ticker memory no one else builds; every detected campaign enriches the graph → data flywheel | News/PR feeds, promo-classifier labels, historical campaign outcomes (own corpus over time) | 9/8/10 | Massive differentiation; moat grows monthly. Build L |
| 4 | **Dilution early-warning** — EDGAR share-count deltas + S-1/S-3/424B/convertible-note filing monitors with plain-English "toxicity" read | Dilution is THE silent OTC killer; we already compute real dilution — competitors show none | EDGAR (free, integrated); filings full-text (free) | 9/6/8 | Retention driver for holders; alerts = daily-active habit. Build M |
| 5 | **Graded similar-setups retrieval** — "12 similar setups historically: 4 hit +10%, 6 stopped, median −3%" (feature-space kNN over own outcome corpus) | Converts our outcome store into experiential memory; copycats have no corpus | Own predictions/outcomes + feature snapshots (live) | 9/6/9 | Core "aha" in every analysis; deepens with data. Build M |
| 6 | **Deliberation transcripts** — the multi-agent argument (for/against/contrarian/invalidation) as a first-class doc, linkable & exportable | Explainable AI as product; SA gives one author's opinion, we give a structured argument with sources | Engine live | 8/3/8 | Differentiation + shareable artifacts (organic acquisition). Build S |
| 7 | **Toxic-financing detector** — parse convertible-note terms (discount-to-market conversion, floorless) from filings; flag death-spiral paper | The single most predictive OTC red flag; requires filings NLP nobody bothered to build for OTC | EDGAR full-text 8-K/10-Q exhibits | 9/8/9 | "Saved my account" stories; premium-tier anchor. Build L |
| 8 | **Halt/suspension risk score** — P(SEC trading suspension / T12 halt) from pattern features + our manipulation score | Halts vaporize positions; no product estimates this | Historical SEC suspension list (free) + own features | 8/7/9 | Unique probability nobody sells. Build M-L |
| 9 | **OTC insider-flow radar** — Forms 3/4/5 clusters on micro-caps with context (buying into dilution? selling into promo?) | Insider data exists everywhere for NYSE; contextualized OTC insider flow exists nowhere | EDGAR Forms 3/4/5 (free) | 8/5/7 | Screener hook + alert habit. Build M |
| 10 | **Scores-as-API (data product)** — sell our manipulation/AI scores + calibration to quants, fintechs, even competitors | Turns the engine into B2B revenue; each customer strengthens the moat narrative | Own scores (live) + auth/rate-limit (live) | 7/4/8 | Direct revenue; enterprise anchor. Build S-M |

## Tier A — High value, clear differentiation

| # | Feature | Why | Data | V/C/M | ROI |
|---|---|---|---|---|---|
| 11 | **Risk-transition alerts** — "manipulation flag activated on your watchlist ticker" push/email | Turns analysis into a daily habit; alert quality (our flags) is the differentiator, not the pipe | Own flags + scheduler (mostly live) | 9/4/6 | Retention engine #1. Build M |
| 12 | **Uplisting-candidate scanner** — distance from NASDAQ/NYSE listing requirements per ticker | Uplisting is the OTC bull's #1 catalyst; requirements are public but nobody computes distance | Financials (EDGAR), price/float (have) | 8/5/7 | Positive-catalyst counterweight to our risk tools; premium screener. Build M |
| 13 | **Social-promo velocity monitor** — mention acceleration on X/Telegram/Reddit with promo-classifier | StockTitan does speed of PR; nobody does *promotion detection* on socials | Social APIs/scrapes + FinBERT-class classifier (P2-1) | 8/8/7 | Feeds #3's flywheel; strong alerts. Build L |
| 14 | **Delinquency countdown** — days until filing deadline; auto-badge late filers | Simple, unique, EDGAR-derived; precedes Expert-Market demotions (price cliffs) | EDGAR submissions (integrated) | 7/3/6 | Cheap distinctive badge everywhere. Build S |
| 15 | **Reverse-split lifecycle stats** — behavior before/after RS across our corpus; per-ticker RS history timeline | We already count RS; showing the *statistics* of what follows is new to market | EDGAR + own OHLCV history | 7/4/7 | Educates + retains; unique content. Build S-M |
| 16 | **OTC-native screener** — Finviz-class UI but with our exclusive columns: dilution%, promo-ratio, manipulation risk, tier, calibration-backed P(+10%) | Parity mechanics, exclusive fields — the fields are the moat | All live | 8/5/5 | Conversion from Finviz refugees. Build M |
| 17 | **Realistic paper-trading** — simulated fills with our spread/slippage/halt engine | Competitors' paper trading fills at mid — teaches lies in OTC; ours teaches reality | Engine live (backtest sim) + quotes | 7/5/7 | Onboarding + education funnel. Build M |
| 18 | **Trade journal with outcome auto-grading** — user logs thesis; platform grades result vs plan (like we grade ourselves) | Extends our honesty loop to the user's own trades; sticky personal data | Own engine + user entries | 8/4/7 | Retention (personal history lock-in) + feeds anonymized flywheel. Build M |
| 19 | **Shell-company classifier** — operating company vs shell score (revenue, filings language, officers overlap) | OTC-specific; officer-overlap graph across shells is a mini-moat | EDGAR financials + officers | 7/6/7 | Risk-tool depth; B2B compliance interest. Build M-L |
| 20 | **Float-rotation anomaly** — days where volume > float ("the float traded 3x today") with historical outcome stats | Classic pump tell; trivial for us, absent elsewhere (float data quality is the barrier we've solved via EDGAR) | Float (EDGAR) + volume (have) | 7/3/6 | Cheap, viral-worthy signal. Build S |
| 21 | **Broker-aware cost modeling** — per-broker OTC fee/spread profiles in backtests & plans | "Your broker makes this setup unprofitable" — nobody says it | Public fee schedules + our sim | 6/4/6 | Trust + practical love. Build S-M |
| 22 | **Model-drift transparency page** — live PSI, calibration alerts public | Radical honesty as brand; monitoring already computes it | Live | 6/2/7 | Trust compounding; zero marginal cost. Build S |
| 23 | **DTC-chill / transfer-agent flags** | Chilled stocks trap sellers; list is obtainable, unglamorous, valuable | DTC notices (scrape) | 7/5/6 | Risk completeness. Build M |
| 24 | **Compliance/B2B risk feed** — manipulation flags + dilution alerts packaged for broker compliance teams | Brokers MUST monitor OTC (FINRA); we already compute what they buy expensively | Own engine | 6/5/9 | Revenue line with enterprise stickiness. Build M |
| 25 | **Portfolio manipulation X-ray** (built) — weight-blended promo/dilution exposure with per-position attribution | Koyfin shows beta exposure; we show *fraud exposure* | Live | 7/2/7 | Differentiated portfolio view; upsell hook. Build S (UI only) |

## Tier B — Necessary competitiveness (parity features, low moat — sequence after A)

| # | Feature | Why | Data | V/C/M | ROI |
|---|---|---|---|---|---|
| 26 | Full interactive charting (candles, drawing, indicators overlay) | Table stakes vs TV; users won't switch without "good enough" charts | Have OHLCV | 8/6/2 | Removes #1 switching objection. Build L |
| 27 | Multi-timeframe technical view (1m–1M) | Expected by traders | Intraday data (needs paid vendor) | 7/5/2 | Parity. Build M + data cost |
| 28 | Email/push/Telegram alert channels | Alert content is ours; pipes are commodity | — | 8/4/2 | Activates #11. Build M |
| 29 | Mobile PWA | Retail lives on phones | — | 8/5/2 | Reach. Build M |
| 30 | Saved screens & shareable screener links | Finviz habit parity + organic acquisition | — | 6/3/3 | Acquisition loops. Build S |
| 31 | Ticker comparison (side-by-side scores) | Cheap for us, expected | Live | 6/2/4 | Engagement. Build S |
| 32 | News aggregation with dedup + promo labeling | StockTitan parity + our labels on top | News feeds | 7/5/4 | Daily habit. Build M |
| 33 | CSV/Excel export everywhere | Analyst expectation | — | 5/2/1 | Friction removal. Build S |
| 34 | Multi-portfolio support | Basic account depth | Live schema extension | 5/3/2 | Retention. Build S |
| 35 | Broker CSV import for portfolio | Reduces onboarding friction | Broker formats | 6/4/2 | Activation. Build M |
| 36 | Keyboard-first power UX + command palette | Koyfin-style pro feel | — | 5/4/3 | Pro retention. Build M |
| 37 | Watchlist folders + notes | Organization basics | Live | 5/2/2 | Retention. Build S |
| 38 | Public ticker pages (SEO) with limited free analysis | Finviz's growth engine applied to OTC long-tail keywords nobody targets | Live | 7/4/5 | Organic acquisition at near-zero CAC. Build M |
| 39 | Saved/exportable analysis snapshots (PDF dossier) | Share = acquisition; audit = trust | Live (dossier) | 6/3/4 | Viral artifacts. Build S-M |
| 40 | Hebrew + Spanish localization | Underserved retail communities with heavy OTC activity; incumbents are EN-only | — | 6/3/4 | Niche-market capture. Build M |

## Tier C — Later bets (real value, wrong sequence today)

| # | Feature | Why later | V/C/M |
|---|---|---|---|
| 41 | Warrants/units tracker for OTC | Data messy; audience narrower | 5/7/6 |
| 42 | Expert-Market segregated intelligence | Small audience, high moat — after core | 5/5/7 |
| 43 | Going-concern text-mining timeline per ticker | Needs full-text NLP (with #7) | 6/6/6 |
| 44 | LLM long-form research reports (auto Seeking-Alpha-style, grounded in our tools) | Quality bar high; hallucination risk must be engineered | 6/7/5 |
| 45 | Webhooks/Zapier | Power-user integration | 4/3/3 |
| 46 | Options data on uplisted graduates ("post-OTC" tracking) | Fun narrative, non-core | 4/6/4 |
| 47 | Whale-ownership change tracker (13D/G on micro-caps) | Sparse for OTC; niche | 5/5/5 |
| 48 | Community *badges without chat* (anti-pump by design: verified track-record sharing only) | Social carefully — chat rooms would recreate the disease we detect | 5/6/6 |
| 49 | Backtest strategy marketplace (share configs, results verified by our engine) | After persisted backtests mature | 5/6/6 |
| 50 | White-label risk widgets for fintech/media embeds | Distribution after brand exists | 5/5/7 |

---

## Sequencing recommendation (CTO)

**Phase next (90 days):** #1, #6, #22, #25 (trust surfaces — mostly UI on live APIs) → #11+#28 (alert habit) → #4, #14, #9 (EDGAR exploitation: dilution/delinquency/insiders) → #16 (screener with exclusive columns) → #5 (similar setups).

**The flywheel to protect at all costs:** every prediction graded (#1) → every campaign fingerprinted (#3) → every user journal graded (#18) → data no competitor can buy. Features 26–40 keep users from leaving; features 1–10 are why they come.

**What we deliberately refuse:** chat rooms/community feeds (#48 note) — the pump vector itself; anonymous "signals"; anything that pays us for order flow. The brand *is* the honesty.
