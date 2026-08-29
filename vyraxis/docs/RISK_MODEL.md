# VYRAXIS — Risk Model

> **Implementation status: NOT IMPLEMENTED.** This is the specification the
> Phase 6 risk engine will be built and tested against. No sizing, stop or
> exposure logic exists in the codebase today. It is written now so the rules
> are fixed *before* there are backtest results tempting anyone to loosen them.

---

## The separation that makes this work

Two engines, two questions, no shared state:

> **Signal engine:** "Is this opportunity attractive?"
> **Risk engine:** "Even if it is attractive, are we allowed to trade it, and how much?"

The risk engine can veto. The signal engine cannot override a veto. A high
opportunity score is an input to sizing, never a licence to exceed a limit.

The same asymmetry applies one level up:

```
RugGuard  →  Opportunity  →  Risk  →  Execution
   │
   └─ CRITICAL finding ⇒ HARD_REJECT. No score, at any magnitude, overrides it.
```

## Capital preservation comes first

The research benchmark is $50 → $500. That is a 10× target, and the honest thing
to say about it is that a strategy capable of it is necessarily capable of
losing the $50. The risk model exists to ensure losses are *survivable and
bounded*, not to make the target more reachable.

**VYRAXIS never manipulates the strategy, dataset, or assumptions to reach the
benchmark. If the strategy loses money, VYRAXIS reports that it lost money.**

## Prohibited, permanently

These are not configuration options. They are absent from the design:

1. **Martingale, or any loss-responsive size increase.** Risk per trade never
   rises because previous trades lost. A losing streak means *smaller* size or
   no size, never larger.
2. **Averaging down into a losing position.**
3. **Moving or widening a stop after entry, other than in the profitable
   direction** (break-even, trailing).
4. **Re-entering a token that triggered a critical RugGuard finding**, whatever
   its subsequent price action.
5. **Disabling the daily loss limit or drawdown kill switch at runtime.**

## Position sizing

Risk-based, not capital-based. The unit of sizing is *the amount lost if the
stop is hit*, which is the only figure that stays meaningful when liquidity
varies by three orders of magnitude across candidates.

```
risk_amount   = equity × risk_per_trade_pct
stop_distance = entry_price − stop_price          (as a fraction of entry)
size_by_risk  = risk_amount / stop_distance

size = min(
    size_by_risk,
    max_position_pct × equity,          # concentration cap
    liquidity_cap(pool_liquidity),      # see below
    remaining_token_exposure,
    remaining_portfolio_exposure,
)
```

If `size` falls below the minimum viable trade after fees, **the trade is
skipped**. A position too small to overcome its own costs is a guaranteed loss
with extra steps.

### Liquidity cap

The binding constraint for memecoins. A position that cannot be exited without
moving the price is not a position, it is a trap.

```
liquidity_cap = pool_liquidity_usd × max_pool_participation_pct
```

Sized so that the *exit*, under adverse conditions, stays within the tolerated
price impact — not the entry. Entry liquidity is generous; exit liquidity during
a collapse is not.

## Parameters (all configurable, all with conservative defaults)

| Parameter | Default | Rationale |
|---|---|---|
| `risk_per_trade_pct` | 2% | 20+ consecutive losses to halve equity |
| `max_position_pct` | 10% | no single token dominates the book |
| `max_portfolio_exposure_pct` | 50% | half the book stays in cash |
| `max_token_exposure_pct` | 10% | includes any correlated positions |
| `max_pool_participation_pct` | 1% | exit must not be the market |
| `max_slippage_pct` | 3% | above this the fill is refused |
| `stop_loss_pct` | 15% | |
| `take_profit_levels` | 50% @ +50%, 25% @ +100%, trail rest | de-risk early, let a runner run |
| `break_even_trigger_pct` | +30% | stop to entry, trade becomes free |
| `trailing_stop_pct` | 20% from peak | activates after break-even |
| `max_daily_loss_pct` | 6% | stop trading for the day |
| `max_consecutive_losses` | 5 | cooldown, then reduced size |
| `max_drawdown_pct` | 20% | **kill switch** — halt, require manual restart |
| `cooldown_after_loss_seconds` | 300 | prevents tilt-loops |
| `max_concurrent_positions` | 5 | attention and exit liquidity are both finite |

## Exits

Ordered by precedence. The first that fires wins.

1. **`EMERGENCY_EXIT`** — liquidity collapse, authority change, RugGuard
   escalation to critical. Exit at whatever price is available; a bad fill beats
   a zero.
2. **`EXIT`** — stop-loss hit.
3. **`REDUCE`** — take-profit level reached; partial exit.
4. **`EXIT`** — trailing stop hit after break-even.
5. **`EXIT`** — time stop: thesis has not played out within the holding window.

A stop is a *decision*, not a resting order. It is evaluated against observed
state and executed as a market exit, because a resting order on a thin memecoin
pool is an invitation to be hunted.

## Circuit breakers

| Trigger | Action | Reset |
|---|---|---|
| Daily loss limit | no new entries; manage open positions | next UTC day |
| Consecutive losses | cooldown, then half size until a win | after a winning trade |
| Max drawdown | **kill switch**: no new entries, flatten | **manual only** |
| Stale data | no new entries; fail closed | when data is fresh |
| Provider unhealthy | no new entries | when health recovers |
| Execution failure rate high | pause entries | after cooldown |

**Stale data means no trading.** A decision made on data of unknown age is a
guess. `StaleDataError` exists for exactly this, and the correct response is to
stop, not to proceed with the last known value.

## Execution realism

The displayed price is never the executable price. Every simulated fill must
account for liquidity, spread, slippage, price impact, network fee, priority
fee, latency between signal and execution, failed transactions, and stale
quotes. Assumptions are configurable and are **stored with every simulated
trade**, so a backtest run remains interpretable after the defaults change.

See `BACKTEST_INTEGRITY.md`.

## Testing requirements (Phase 6)

The risk engine ships only when these pass:

- position sizing is exact under known inputs, including the liquidity cap
- stop, take-profit, break-even and trailing logic trigger at the right prices
- partial exits leave the correct residual position and cost basis
- the daily loss limit blocks new entries and permits management of open ones
- the drawdown kill switch halts trading and **cannot be cleared automatically**
- a critical RugGuard finding blocks entry regardless of opportunity score
- stale data blocks entry
- **no code path increases risk after a loss** — asserted directly
- P&L, fees and slippage arithmetic is exact in `Decimal`, never `float`
