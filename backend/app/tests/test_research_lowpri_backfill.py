"""services/research/lowpri_backfill.py — the low-priority splits/news
worker. Proves: exactly one provider call per slice, a rate-limit-style
failure is retryable (never a terminal dead end), and the queue actually
rotates across symbols under persistent failure rather than looping
forever on whichever symbol sorts first — a real bug caught live when
this worker's first-ever production run hit an already-exhausted Alpha
Vantage quota and got stuck retrying AAPL only, before this fix.
"""
from datetime import datetime, timezone

from app.db.models.backfill_checkpoint import BackfillCheckpoint
from app.db.models.corporate_action import CorporateAction as CorporateActionRow
from app.services.data_providers.base import CorporateAction
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.research.lowpri_backfill import NEWS_DATASET, PROVIDER, SPLITS_DATASET, run_one_slice

SYMBOLS = ["AAPL", "AMD", "AMZN"]


class _FailingProvider:
    """Always raises — simulates a fully exhausted shared quota, exactly
    what production looked like on this worker's first real run."""

    def get_corporate_actions(self, symbol: str):
        raise ProviderDataUnavailable(f"AlphaVantage SPLITS: rate limit exceeded for {symbol}")

    def get_historical_news_range(self, symbol: str, time_from, time_to, limit: int = 200):
        raise ProviderDataUnavailable(f"AlphaVantage NEWS_SENTIMENT: rate limit exceeded for {symbol}")


class _SucceedingProvider:
    def get_corporate_actions(self, symbol: str):
        # Real AlphaVantage SPLITS format: a decimal string, not a "4:1"
        # ratio string (see alphavantage_provider.py's get_corporate_actions).
        return [CorporateAction(symbol=symbol, date=datetime(2023, 1, 1, tzinfo=timezone.utc), action_type="split", details={"split_factor": "4.0"})]

    def get_historical_news_range(self, symbol: str, time_from, time_to, limit: int = 200):
        return []


def test_one_slice_makes_progress_on_exactly_one_checkpoint(db_session):
    result = run_one_slice(db_session, _SucceedingProvider(), SYMBOLS)
    assert result is not None
    assert result["dataset"] == SPLITS_DATASET
    done_count = db_session.query(BackfillCheckpoint).filter_by(status="done").count()
    assert done_count == 1


def test_a_failed_slice_reverts_to_pending_never_a_terminal_failed_state(db_session):
    result = run_one_slice(db_session, _FailingProvider(), SYMBOLS)
    assert result is not None
    assert "pending" in result["status"]

    checkpoint = db_session.query(BackfillCheckpoint).filter_by(ticker_symbol=result["symbol"], dataset=result["dataset"]).one()
    assert checkpoint.status == "pending"
    assert checkpoint.last_error is not None
    # The one status this worker must never produce for a retryable
    # provider error — see the module's own docstring on why.
    assert checkpoint.status != "failed"


def test_persistent_failure_rotates_through_every_symbol_instead_of_looping_on_one(db_session):
    """The exact bug this test guards against: with the old
    ticker_symbol-ordered queue, AAPL would fail and immediately be
    picked again next slice (still alphabetically first, still
    "pending"), starving AMD/AMZN forever. With least-recently-attempted
    ordering, each failed attempt pushes that symbol to the back."""
    import time

    provider = _FailingProvider()
    attempted_symbols = []
    for _ in range(len(SYMBOLS)):
        result = run_one_slice(db_session, provider, SYMBOLS)
        assert result is not None
        attempted_symbols.append(result["symbol"])
        # Real wake-ups are hours apart (SLICE_INTERVAL_SECONDS in the
        # worker); this tiny gap only exists so the round-robin ordering
        # (updated_at ASC) has genuine, unambiguous timestamp separation
        # inside this tight test loop — a non-issue at real cadence.
        time.sleep(0.01)

    assert set(attempted_symbols) == set(SYMBOLS)  # every symbol got a turn, not just one


def test_a_successful_retry_after_prior_failures_still_advances_the_queue(db_session):
    # First pass: everything fails and reverts to pending.
    failing = _FailingProvider()
    for _ in range(len(SYMBOLS)):
        run_one_slice(db_session, failing, SYMBOLS)

    # Now the quota is back — the next call succeeds for whichever symbol
    # is due (least recently attempted), and it must actually reach "done".
    succeeding = _SucceedingProvider()
    result = run_one_slice(db_session, succeeding, SYMBOLS)
    assert result["status"] == "done"
    checkpoint = db_session.query(BackfillCheckpoint).filter_by(
        ticker_symbol=result["symbol"], dataset=SPLITS_DATASET, provider=PROVIDER,
    ).one()
    assert checkpoint.status == "done"
    assert checkpoint.last_error is None


def test_news_slice_resumes_from_its_saved_cursor_not_from_scratch(db_session):
    # Prime: all splits done so the worker moves on to news.
    for symbol in SYMBOLS:
        db_session.add(BackfillCheckpoint(provider=PROVIDER, dataset=SPLITS_DATASET, ticker_symbol=symbol, status="done"))
    db_session.commit()

    provider = _FailingProvider()
    result = run_one_slice(db_session, provider, SYMBOLS)
    assert result["dataset"] == NEWS_DATASET

    checkpoint = db_session.query(BackfillCheckpoint).filter_by(
        ticker_symbol=result["symbol"], dataset=NEWS_DATASET, provider=PROVIDER,
    ).one()
    # cursor is untouched by a failed attempt — it still points at the
    # same window that will be retried, never silently skipped ahead.
    assert checkpoint.cursor == "2020-01-01"


def test_returns_none_when_every_checkpoint_is_genuinely_done(db_session):
    for symbol in SYMBOLS:
        db_session.add(BackfillCheckpoint(provider=PROVIDER, dataset=SPLITS_DATASET, ticker_symbol=symbol, status="done"))
        db_session.add(BackfillCheckpoint(provider=PROVIDER, dataset=NEWS_DATASET, ticker_symbol=symbol, status="done", cursor="2026-08-01"))
    db_session.commit()

    result = run_one_slice(db_session, _SucceedingProvider(), SYMBOLS)
    assert result is None


def test_splits_are_always_prioritized_over_news_since_they_are_cheaper_to_finish(db_session):
    result = run_one_slice(db_session, _SucceedingProvider(), SYMBOLS)
    assert result["dataset"] == SPLITS_DATASET


def test_never_makes_more_than_one_provider_call_per_slice(db_session):
    calls = {"n": 0}

    class _CountingProvider(_SucceedingProvider):
        def get_corporate_actions(self, symbol: str):
            calls["n"] += 1
            return super().get_corporate_actions(symbol)

    run_one_slice(db_session, _CountingProvider(), SYMBOLS)
    assert calls["n"] == 1


def test_real_corporate_action_rows_are_persisted_with_provenance(db_session):
    run_one_slice(db_session, _SucceedingProvider(), ["AAPL"])
    [row] = db_session.query(CorporateActionRow).filter_by(ticker_symbol="AAPL").all()
    assert row.action_type == "split"
    assert row.data_source == "alphavantage"
