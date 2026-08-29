# VYRAXIS — Backtest Integrity

> **Implementation status: the backtester is NOT IMPLEMENTED (Phase 5).** The
> guarantees below are already partly enforced by the Phase 1 data model, and
> those are marked ✅. The rest is the contract Phase 5 will be built and tested
> against.
>
> These rules are written before there are any results, deliberately. Rules
> written afterwards get bent to fit the number someone wants.

---

## Purpose

**The backtester's job is not to make VYRAXIS look profitable. It is to destroy
weak strategies before real money does.**

A backtest that flatters a strategy is worse than no backtest: it converts
ignorance into false confidence and then into a funded position.

## The seven ways a backtest lies

### 1. Look-ahead bias

Using information that did not exist at decision time.

- **Defence (✅ Phase 1):** every event carries `observed_at`, the instant
  VYRAXIS received it. Replay is ordered by `observed_at`, never by `block_time`
  or `slot`. `block_time` is nullable precisely so nobody is tempted to rely on
  it for sequencing.
- **Defence (✅ Phase 1):** horizon observations are created empty with a future
  `due_at`. `capture_due` raises `IntegrityError` if asked to fill one early.
- **Phase 5:** the simulation clock is explicit; feature computation is given a
  cutoff and cannot query beyond it. A test constructs data whose future values
  would change a decision and asserts the decision does not change.

### 2. Data leakage

Future information reaching a past feature vector indirectly — a rolling
statistic computed over the whole series, a normalisation fitted on all data, a
label derived from a value the feature also sees.

- **Defence (✅ Phase 1):** labels are computed from horizon observations that
  are themselves captured only after their due instant.
- **Phase 5:** feature computation takes `as_of` and filters
  `observed_at <= as_of`. Scalers and encoders fit on training data only.

### 3. Survivorship bias

Backtesting only the tokens that still exist. For memecoins this is the single
most distorting error available: most tokens die, and excluding them makes any
strategy look brilliant.

- **Defence (✅ Phase 1):** every discovered token is persisted at first
  sighting, before its outcome is known. Rugged and dead tokens stay in the
  dataset.
- **Phase 5:** the candidate universe is built from `tokens.first_seen_at <=
  cutoff` — the set as it was, not the set that survived. A test asserts dead
  tokens appear in the replay universe.

### 4. Impossible fills

Assuming a trade executed where no counterparty existed.

- **Phase 5:** every fill is checked against pool liquidity at that instant.
  Size beyond the participation cap is partially filled or rejected. Fills at
  the observed price with zero impact are forbidden by construction.

### 5. Zero-cost assumptions

- **Phase 5:** every simulated trade carries network fee, priority fee,
  slippage, price impact and DEX fee. Execution assumptions are **stored with
  the run**, so results remain interpretable after defaults change.

### 6. Unrealistic liquidity

Assuming a memecoin pool absorbs any size.

- **Phase 5:** price impact is modelled from actual pool depth. Exit sizing uses
  *adverse* liquidity, not entry-time liquidity — the moment you want out is the
  moment everyone else does.

### 7. Selection on outcomes

Choosing which tokens to include based on how they turned out.

- **Phase 5:** candidate selection uses only data with `observed_at <= decision
  time`. Filtering the universe by any post-decision field is a test failure,
  not a judgement call.

## Required metrics

A run reports all of these or it is incomplete:

| | |
|---|---|
| starting equity | ending equity |
| net return | number of trades |
| win rate | average win / average loss |
| profit factor | expectancy per trade |
| maximum drawdown | average holding period |
| total fees paid | estimated slippage paid |
| failed execution count | longest losing streak |

Net return alone is not a result. A 300% return with a 90% drawdown is not a
strategy, it is a coin flip that landed well.

## Robustness sweeps

Every candidate strategy is re-run under degraded conditions. A strategy that
only works under favourable assumptions has not been validated:

- slippage ×2, ×3
- latency +500ms, +2s
- fees ×2
- 5% / 10% of transactions fail
- entries filled 1% / 2% worse
- exits filled 1% / 2% worse

## The jackpot test

Performance is recomputed after removing the **top 1%, 5% and 10%** most
profitable trades.

This answers the question that matters most: **is this a repeatable edge, or a
handful of lottery tickets?**

If profitability disappears when the top 1% of trades is removed, the strategy
has no edge — it has variance. It must not proceed to paper trading, regardless
of how good the headline number looks.

## Walk-forward and out-of-sample discipline

```
├─── TRAINING ───┼── VALIDATION ──┼── OUT-OF-SAMPLE ──┤
                                   ↑
                        touched exactly once
```

- Splits are **chronological**. Random splits on time-series data leak the
  future into the past and are prohibited.
- Optimisation uses training and validation only.
- The out-of-sample period is evaluated **once**. Re-tuning after seeing
  out-of-sample results converts it into training data and destroys its value.
- Walk-forward: roll the windows forward, re-fit on each, evaluate on the
  next unseen window.

## Reporting rules

1. Losing results are reported as losing. No parameter is adjusted afterwards to
   improve the headline.
2. Every result names its data window, execution assumptions and strategy
   version.
3. Results with too few trades to be meaningful are labelled as such rather than
   quoted as a rate. A 100% win rate over 3 trades is not a win rate.
4. A backtest is evidence about the past under stated assumptions. It is not a
   prediction, and it is never described as one.
