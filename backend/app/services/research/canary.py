"""Phase 6 — Research Canary: a tightly limited INTERNAL paper-only track
for a HISTORICALLY_QUALIFIED research model. Every rule below is
non-negotiable per this session's own spec — this module is the single
place all of them are enforced together, at decision time, on the
backend (never only a disabled frontend button).

Two independent gates must BOTH be true before anything can open:
1. `CanaryAccount.enabled` — the operator's manual opt-in (Phase 6:
   "may operate only when the operator manually opts in").
2. The platform-wide Emergency Stop
   (`PlatformSetting.autonomous_trading_paused`) must be resumed.

Neither gate implies the other. An operator can enable Canary while
Emergency Stop stays engaged (nothing fires, by design) — this module
never touches or infers a change to Emergency Stop itself.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models.canary import CanaryAccount, CanaryPosition
from app.db.models.platform_setting import PlatformSetting
from app.db.models.research_model import CanaryDecision, ResearchModel
from app.services.monitoring.drift import drift_status_label
from app.services.platform_settings import is_safe_mode_active

MAX_RISK_PCT_PER_TRADE = 0.25
MAX_NEW_POSITIONS_PER_DAY = 1
MAX_CONCURRENT_POSITIONS = 2
MAX_DAILY_LOSS_PCT = 0.5
AUTO_PAUSE_DRAWDOWN_PCT = 2.0
CONFIDENCE_FLOOR = 0.55  # calibrated P(BUY) required — matches training.py's own DECISION_THRESHOLD
MAX_QUOTE_STALENESS_SECONDS = 300  # duplicated from autonomous.py's own constant — see that module's precedent


@dataclass
class CanaryGateResult:
    permitted: bool
    reasons: list[str]
    decision: CanaryDecision | None = None


def _today_key(now: datetime) -> str:
    return now.date().isoformat()


def get_or_create_account(db: Session) -> CanaryAccount:
    account = db.query(CanaryAccount).filter_by(id=1).one_or_none()
    if account is None:
        account = CanaryAccount(id=1)
        db.add(account)
        db.commit()
        db.refresh(account)
    return account


def _emergency_stop_engaged(db: Session) -> bool:
    setting = db.query(PlatformSetting).filter_by(id=1).one_or_none()
    return setting is None or setting.autonomous_trading_paused  # fail closed: no row = paused


def evaluate_canary_entry(
    db: Session,
    research_model: ResearchModel,
    ticker_symbol: str,
    horizon: str,
    probability: float,
    quote_timestamp: datetime,
    now: datetime | None = None,
) -> CanaryGateResult:
    """The complete, backend-enforced gate chain. Every check runs and is
    recorded (Phase 4/Red-Team's own "record every check, not just the
    first failure" discipline) — `reasons` lists every gate this
    decision failed, not only the first. A CanaryDecision row is always
    persisted, fired or not, for the audit trail (Phase 4's Decision
    Audit equivalent for Canary)."""
    now = now or datetime.now(timezone.utc)
    reasons: list[str] = []

    account = get_or_create_account(db)
    if not account.enabled:
        reasons.append("Research Canary is not enabled — requires an explicit operator opt-in.")
    if _emergency_stop_engaged(db):
        reasons.append("Autonomous Trading Emergency Stop is engaged — Canary never trades while it is.")
    if account.auto_paused:
        reasons.append(f"Canary is auto-paused: {account.auto_pause_reason}")
    if is_safe_mode_active(db):
        reasons.append("Safe Mode is active platform-wide.")

    drift_status = drift_status_label(db)
    if drift_status == "significant":
        reasons.append(f"Drift status is '{drift_status}' — Red-Team-equivalent drift check blocks new Canary entries.")

    if research_model.state not in ("HISTORICALLY_QUALIFIED", "LIVE_SHADOW"):
        reasons.append(f"Research model state is '{research_model.state}', not HISTORICALLY_QUALIFIED/LIVE_SHADOW.")

    staleness = (now - quote_timestamp).total_seconds() if quote_timestamp.tzinfo else float("inf")
    data_stale = staleness > MAX_QUOTE_STALENESS_SECONDS
    if data_stale:
        reasons.append(f"Quote is {staleness:.0f}s stale (max {MAX_QUOTE_STALENESS_SECONDS}s) — stale data means NO_TRADE.")

    if probability < CONFIDENCE_FLOOR:
        reasons.append(f"Calibrated P(BUY) {probability:.3f} below the {CONFIDENCE_FLOOR} confidence floor.")

    existing = db.query(CanaryPosition).filter_by(ticker_symbol=ticker_symbol, status="open").one_or_none()
    if existing is not None:
        reasons.append(f"An open Canary position already exists in {ticker_symbol} — no averaging down/up.")

    open_count = db.query(CanaryPosition).filter_by(status="open").count()
    if open_count >= MAX_CONCURRENT_POSITIONS:
        reasons.append(f"{open_count} Canary position(s) already open, at the {MAX_CONCURRENT_POSITIONS}-position limit.")

    today = _today_key(now)
    if account.positions_opened_today_date == today and account.positions_opened_today >= MAX_NEW_POSITIONS_PER_DAY:
        reasons.append(f"Already opened {account.positions_opened_today} Canary position(s) today (limit {MAX_NEW_POSITIONS_PER_DAY}/day).")

    if account.realized_pnl_today_date == today:
        daily_loss_pct = -account.realized_pnl_today_dollars / account.starting_balance * 100
        if daily_loss_pct >= MAX_DAILY_LOSS_PCT:
            reasons.append(f"Today's realized loss {daily_loss_pct:.2f}% already at/beyond the {MAX_DAILY_LOSS_PCT}% daily cap.")

    verdict = "BUY" if probability >= CONFIDENCE_FLOOR else "NO_TRADE"
    permitted = not reasons
    decision = CanaryDecision(
        research_model_id=research_model.id, ticker_symbol=ticker_symbol, horizon=horizon, evaluated_at=now,
        verdict=verdict if permitted else "NO_TRADE", probability=probability, fired=permitted,
        no_trade_reason="; ".join(reasons) if reasons else None,
        red_team_passed=(drift_status != "significant" and not is_safe_mode_active(db)),
        red_team_veto_reason="; ".join(r for r in reasons if "drift" in r.lower() or "safe mode" in r.lower()) or None,
        drift_status=drift_status, data_stale=data_stale,
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return CanaryGateResult(permitted=permitted, reasons=reasons, decision=decision)


def open_canary_position(
    db: Session,
    account: CanaryAccount,
    decision: CanaryDecision,
    entry_price: float,
    stop_loss: float,
    max_holding_days: int,
    take_profit: float | None,
    data_source: str,
    data_mode: str,
    now: datetime | None = None,
) -> CanaryPosition:
    """Called only after `evaluate_canary_entry` returns `permitted=True`
    — this function itself re-derives position sizing but trusts the
    gate chain already ran; it does not re-check Emergency Stop/Safe
    Mode/drift (callers must always go through evaluate_canary_entry
    first). Mandatory stop-loss: `stop_loss` is a required, non-optional
    argument — there is no code path that can open a Canary position
    without one.

    Idempotent on `decision`: a CanaryDecision can back at most one
    CanaryPosition ever (its `canary_position_id` is set the instant one
    opens) — calling this twice for the same decision (a scheduler retry,
    a duplicate request) returns the ORIGINAL position rather than
    opening a second one, the same duplicate-prevention discipline
    PaperOrder's idempotency_key gives manual/autonomous paper trading.
    """
    if decision.canary_position_id is not None:
        existing = db.query(CanaryPosition).filter_by(id=decision.canary_position_id).one()
        return existing

    now = now or datetime.now(timezone.utc)
    if stop_loss >= entry_price:
        raise ValueError("Canary is long-only: stop_loss must be below entry_price.")

    risk_per_share = entry_price - stop_loss
    max_risk_dollars = account.cash_balance * (MAX_RISK_PCT_PER_TRADE / 100)
    quantity = max_risk_dollars / risk_per_share if risk_per_share > 0 else 0.0
    # Never risk more than available cash can actually buy.
    quantity = min(quantity, account.cash_balance / entry_price)

    position = CanaryPosition(
        research_model_id=decision.research_model_id, canary_decision_id=decision.id,
        ticker_symbol=decision.ticker_symbol, horizon=decision.horizon,
        quantity=quantity, avg_entry_price=entry_price, opened_at=now,
        stop_loss=stop_loss, take_profit=take_profit,
        max_holding_until=now + timedelta(days=max_holding_days),
        risk_dollars_at_entry=quantity * risk_per_share,
        status="open", data_source=data_source, data_mode=data_mode,
    )
    db.add(position)

    account.cash_balance -= quantity * entry_price
    today = _today_key(now)
    if account.positions_opened_today_date != today:
        account.positions_opened_today = 0
        account.positions_opened_today_date = today
    account.positions_opened_today += 1

    db.commit()
    db.refresh(position)

    decision.canary_position_id = position.id
    db.commit()
    return position


def close_canary_position(db: Session, account: CanaryAccount, position: CanaryPosition, exit_price: float, exit_reason: str, now: datetime | None = None) -> CanaryPosition:
    now = now or datetime.now(timezone.utc)
    position.status = "closed"
    position.exit_price = exit_price
    position.exit_at = now
    position.exit_reason = exit_reason
    position.realized_pnl_dollars = (exit_price - position.avg_entry_price) * position.quantity

    account.cash_balance += position.quantity * exit_price
    equity = account.cash_balance  # no other open-position marking here — caller's snapshot is authoritative
    account.peak_equity = max(account.peak_equity, equity)

    today = _today_key(now)
    if account.realized_pnl_today_date != today:
        account.realized_pnl_today_dollars = 0.0
        account.realized_pnl_today_date = today
    account.realized_pnl_today_dollars += position.realized_pnl_dollars

    drawdown_pct = (account.peak_equity - equity) / account.peak_equity * 100 if account.peak_equity > 0 else 0.0
    if drawdown_pct >= AUTO_PAUSE_DRAWDOWN_PCT and not account.auto_paused:
        account.auto_paused = True
        account.auto_pause_reason = f"Peak-to-trough drawdown {drawdown_pct:.2f}% reached the {AUTO_PAUSE_DRAWDOWN_PCT}% auto-pause threshold."

    db.commit()
    db.refresh(position)
    return position
