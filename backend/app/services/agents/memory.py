"""Memory and self-learning agents — the deliberation's link to history.

- MemoryAgent       "have we been here before?" — retrieves this ticker's
                    logged predictions and their graded outcomes. Honest
                    empty state: no history is reported as no history,
                    never simulated.
- SelfLearningAgent "how honest have our probabilities been?" — reads the
                    calibration report and produces a conviction *damping
                    factor*: sparse or miscalibrated history shrinks
                    conviction toward the prior. This is the mechanism that
                    makes the platform literally learn from its own graded
                    past — conviction is earned, not asserted.
"""
from __future__ import annotations

from app.services.agents.context import DeliberationContext
from app.services.agents.evidence import BEARISH, BULLISH, NEUTRAL, Evidence
from app.services.evaluation.outcome_evaluator import build_calibration_report


class MemoryAgent:
    name = "memory_agent"

    def run(self, ctx: DeliberationContext) -> list[Evidence]:
        if ctx.db is None:
            return [Evidence(self.name, "No prediction store attached to this deliberation — running without experiential memory", NEUTRAL, 0.1, "memory.unavailable")]

        from app.db.models.prediction import Outcome, Prediction

        rows = (
            ctx.db.query(Prediction, Outcome)
            .join(Outcome, Outcome.prediction_id == Prediction.id)
            .filter(Prediction.ticker_symbol == ctx.symbol)
            .all()
        )
        total_logged = ctx.db.query(Prediction).filter_by(ticker_symbol=ctx.symbol).count()

        if not rows:
            return [
                Evidence(
                    self.name,
                    f"No graded history for {ctx.symbol} yet ({total_logged} predictions logged, none matured) — no experiential prior either way",
                    NEUTRAL,
                    0.2,
                    "memory.no_graded_history",
                    float(total_logged),
                )
            ]

        tp1_rate = sum(1 for _, o in rows if o.hit_take_profit_1) / len(rows)
        stop_rate = sum(1 for _, o in rows if o.hit_stop_loss) / len(rows)
        avg_return = sum(o.realized_return_pct for _, o in rows) / len(rows)

        direction = BULLISH if tp1_rate > 0.5 and avg_return > 0 else BEARISH if stop_rate > 0.5 else NEUTRAL
        strength = min(0.2 + len(rows) * 0.05, 0.6)  # more graded history = more weight, capped
        return [
            Evidence(
                self.name,
                f"Graded history for {ctx.symbol}: {len(rows)} matured predictions — TP1 hit {tp1_rate:.0%}, stopped {stop_rate:.0%}, avg realized {avg_return:+.1f}%",
                direction,
                strength,
                "memory.ticker_track_record",
                tp1_rate,
            )
        ]


class SelfLearningAgent:
    name = "self_learning_agent"

    MIN_SAMPLE = 30

    def run(self, ctx: DeliberationContext) -> tuple[list[Evidence], float]:
        """Returns (evidence, conviction damping factor in (0, 1])."""
        if ctx.db is None:
            return (
                [Evidence(self.name, "No outcome store attached — conviction shrunk toward prior as a precaution", NEUTRAL, 0.1, "learning.unavailable")],
                0.85,
            )

        report = build_calibration_report(ctx.db)
        total = report.get("total_scored", 0)

        if total < self.MIN_SAMPLE:
            return (
                [
                    Evidence(
                        self.name,
                        f"Only {total} graded outcomes platform-wide (need ≥{self.MIN_SAMPLE} for calibration) — conviction damped until the track record earns it",
                        NEUTRAL,
                        0.2,
                        "learning.insufficient_history",
                        float(total),
                    )
                ],
                0.85,
            )

        gaps = [
            abs(b["calibration_gap"]) * b["count"]
            for b in report["buckets"]
            if b.get("count", 0) > 0 and "calibration_gap" in b
        ]
        counted = sum(b["count"] for b in report["buckets"] if b.get("count", 0) > 0)
        avg_gap = (sum(gaps) / counted) if counted else 0.0
        damping = max(1.0 - min(avg_gap * 2, 0.5), 0.5)

        if avg_gap <= 0.05:
            claim = f"Model calibration is honest (avg gap {avg_gap:.0%} over {total} graded outcomes) — probabilities can be taken at face value"
            direction = NEUTRAL
        else:
            claim = f"Model shows a {avg_gap:.0%} average calibration gap over {total} outcomes — probabilities discounted accordingly"
            direction = BEARISH
        return (
            [Evidence(self.name, claim, direction, min(avg_gap * 3, 0.6), "learning.calibration_gap", avg_gap)],
            damping,
        )
