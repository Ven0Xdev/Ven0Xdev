from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class PaperTradingAccount(Base):
    """One virtual cash "simulation" per row — a user may have many over
    time (see services/paper_trading/engine.py's start_new_simulation),
    but at most one `is_active` at once. The platform's only trading
    execution mode (no real-money broker integration exists or is
    planned). Cash-only, no margin: every open position debits this
    balance by its fill cost, every close credits it back.

    Starting a new simulation never deletes the old one — it's archived
    (`is_active=False`, `archived_at` set) with all its positions/trades
    intact, so simulation history is always inspectable and comparable.
    The one-active-per-user invariant is enforced below by a partial
    unique index (ux_paper_trading_accounts_one_active_per_user), not
    just in application code.
    """

    __tablename__ = "paper_trading_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # Sequential per-user counter (1, 2, 3, ...) — the "Simulation ID" shown
    # in the UI's history list; independent of the DB primary key so it
    # reads as "simulation #3" rather than an opaque row id.
    simulation_number: Mapped[int] = mapped_column(Integer, default=1)
    label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cash_balance: Mapped[float] = mapped_column(Float)
    starting_balance: Mapped[float] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Explicit per-simulation opt-in — never on by default, never carried
    # over to a new simulation automatically (start_new_simulation always
    # creates a fresh row, which defaults this to False again). See
    # services/paper_trading/autonomous.py for the full gate this alone
    # does not bypass (Red-Team, shadow track record, position limits,
    # the platform-wide emergency stop).
    autonomous_trading_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


# Partial unique index — only rows where is_active is true participate, so
# archived rows never collide with each other or with the current active
# one. Declared at module level (not inside __table_args__) because it
# needs the already-built column object for the where-clause, which
# doesn't exist yet during the class body's own evaluation.
Index(
    "ux_paper_trading_accounts_one_active_per_user",
    PaperTradingAccount.user_id,
    unique=True,
    sqlite_where=PaperTradingAccount.is_active.is_(True),
    postgresql_where=PaperTradingAccount.is_active.is_(True),
)


class PaperPosition(Base):
    """A simulated long position, opened only when the setup clears the
    same deterministic risk gate (services/risk/engine.py's evaluate_risk)
    the scanner and Signal Engine already enforce. `planned_stop_loss`/
    `planned_take_profit` and the entry-time confidence/reward:risk are
    captured for provenance and for a future automatic outcome-evaluation
    job (Phase 7) — this version only closes on an explicit user action.
    """

    __tablename__ = "paper_positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("paper_trading_accounts.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    quantity: Mapped[float] = mapped_column(Float)
    avg_entry_price: Mapped[float] = mapped_column(Float)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open, closed
    realized_pnl_dollars: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_confidence_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_risk_reward: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_policy_version: Mapped[str] = mapped_column(String(48), default="unversioned")
    entry_data_source: Mapped[str] = mapped_column(String(32), default="unknown")
    entry_data_mode: Mapped[str] = mapped_column(String(16), default="unspecified")
    # "manual" (a user clicked Buy) | "autonomous" (services/paper_trading/
    # autonomous.py opened it on the account owner's behalf, per their own
    # opt-in). Always explicit — a position must never be ambiguous about
    # who/what opened it. ncs_signal_id is set only for autonomous opens,
    # the provenance link back to the exact fired signal that triggered it.
    opened_by: Mapped[str] = mapped_column(String(16), default="manual")
    ncs_signal_id: Mapped[int | None] = mapped_column(ForeignKey("ncs_signals.id"), nullable=True)


# Partial unique index — closes a real TOCTOU race an independent review
# found in services/paper_trading/autonomous.py: two near-concurrent
# autonomous evaluations for the same account/ticker (e.g. NCS firing on
# two timeframes for the same symbol almost simultaneously) could each
# read "no open position yet" before either had committed, and both open
# one. Scoped to opened_by='autonomous' only — manual trading's existing
# behavior (a user may already hold more than one open position on the
# same ticker) is deliberately unchanged. This is the authoritative
# backstop; autonomous.py's own pre-check plus an account-row lock
# (see _evaluate_entry_for_account) make hitting this constraint rare in
# practice rather than the primary defense.
Index(
    "ux_paper_positions_one_open_autonomous_per_account_ticker",
    PaperPosition.account_id,
    PaperPosition.ticker_symbol,
    unique=True,
    sqlite_where=(PaperPosition.status == "open") & (PaperPosition.opened_by == "autonomous"),
    postgresql_where=(PaperPosition.status == "open") & (PaperPosition.opened_by == "autonomous"),
)
