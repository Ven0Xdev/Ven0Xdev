"""Classification of log notifications into normalized events."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from fixtures import samples
from vyraxis.core.enums import DecodeStatus, EventKind, TradeDirection
from vyraxis.scanner.events import payload_dedup_key, signature_dedup_key
from vyraxis.scanner.normalizer import LogNotificationNormalizer, classify_logs
from vyraxis.solana import programs
from vyraxis.solana.provider import RawEvent

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def raw_event(payload: dict, *, stream: str, slot: int | None = 100) -> RawEvent:
    return RawEvent(
        stream=stream,
        provider="fixture",
        received_at=T0,
        slot=slot,
        payload=payload,
        subscription_id=1,
    )


def test_pumpfun_create_is_a_token_creation() -> None:
    sig = samples.signature(1)
    event = LogNotificationNormalizer().normalize(
        raw_event(
            samples.logs_notification(sig=sig, slot=500, logs=samples.PUMPFUN_CREATE_LOGS),
            stream=f"logs:{programs.PUMP_FUN}",
        )
    )
    assert event is not None
    assert event.kind is EventKind.TOKEN_CREATED
    assert "PUMPFUN_CREATE" in event.reason_codes
    assert event.signature == sig
    assert event.slot == 500
    assert event.program_id == programs.PUMP_FUN


def test_pumpfun_buy_carries_direction() -> None:
    event = LogNotificationNormalizer().normalize(
        raw_event(
            samples.logs_notification(
                sig=samples.signature(2), slot=501, logs=samples.PUMPFUN_BUY_LOGS
            ),
            stream=f"logs:{programs.PUMP_FUN}",
        )
    )
    assert event is not None
    assert event.kind is EventKind.SWAP
    assert event.direction is TradeDirection.BUY


def test_raydium_initialize_is_a_pool_creation() -> None:
    event = LogNotificationNormalizer().normalize(
        raw_event(
            samples.logs_notification(
                sig=samples.signature(3), slot=502, logs=samples.RAYDIUM_POOL_LOGS
            ),
            stream=f"logs:{programs.RAYDIUM_AMM_V4}",
        )
    )
    assert event is not None
    assert event.kind is EventKind.POOL_CREATED


def test_log_only_events_are_marked_partial_not_decoded() -> None:
    """Logs carry no mint or amount, and the event must say so."""
    event = LogNotificationNormalizer().normalize(
        raw_event(
            samples.logs_notification(
                sig=samples.signature(4), slot=503, logs=samples.PUMPFUN_BUY_LOGS
            ),
            stream=f"logs:{programs.PUMP_FUN}",
        )
    )
    assert event is not None
    assert event.decode_status is DecodeStatus.PARTIAL
    assert event.token_mint is None
    assert event.base_amount_raw is None


def test_program_scoped_markers_do_not_fire_for_other_programs() -> None:
    # "Instruction: Buy" means a pump.fun trade only in pump.fun's own logs.
    result = classify_logs(["Program log: Instruction: Buy"], program_id=programs.TOKEN_PROGRAM)
    assert result.kind is EventKind.UNCLASSIFIED


def test_higher_priority_marker_wins_but_all_are_recorded() -> None:
    result = classify_logs(
        ["Program log: Instruction: InitializeMint2", "Program log: Instruction: MintTo"]
    )
    assert result.kind is EventKind.TOKEN_CREATED
    assert "SPL_MINT_TO" in result.reason_codes


def test_failed_transactions_are_kept_and_flagged() -> None:
    """A burst of failed swaps is a signal; discarding it would hide it."""
    event = LogNotificationNormalizer().normalize(
        raw_event(
            samples.logs_notification(
                sig=samples.signature(5),
                slot=504,
                logs=samples.PUMPFUN_BUY_LOGS,
                err={"InstructionError": [0, "Custom"]},
            ),
            stream=f"logs:{programs.PUMP_FUN}",
        )
    )
    assert event is not None
    assert "TX_FAILED" in event.reason_codes


def test_failed_transactions_can_be_dropped_when_configured() -> None:
    event = LogNotificationNormalizer(keep_failed_transactions=False).normalize(
        raw_event(
            samples.logs_notification(
                sig=samples.signature(6), slot=505, logs=samples.PUMPFUN_BUY_LOGS, err="err"
            ),
            stream=f"logs:{programs.PUMP_FUN}",
        )
    )
    assert event is None


def test_unknown_notification_is_recorded_not_discarded() -> None:
    event = LogNotificationNormalizer().normalize(
        raw_event({"method": "accountNotification", "params": {}}, stream="account:x")
    )
    assert event is not None
    assert event.kind is EventKind.UNCLASSIFIED
    assert event.reason_codes == ("UNSUPPORTED_NOTIFICATION",)


def test_notification_without_signature_is_unclassified() -> None:
    payload = samples.logs_notification(sig="", slot=1, logs=["x"])
    event = LogNotificationNormalizer().normalize(
        raw_event(payload, stream=f"logs:{programs.PUMP_FUN}")
    )
    assert event is not None
    assert event.reason_codes == ("NO_SIGNATURE_IN_NOTIFICATION",)


def test_notification_without_slot_is_unclassified_not_given_a_fake_slot() -> None:
    payload = {
        "jsonrpc": "2.0",
        "method": "logsNotification",
        "params": {
            "result": {"value": {"signature": samples.signature(7), "err": None, "logs": []}},
            "subscription": 1,
        },
    }
    event = LogNotificationNormalizer().normalize(
        raw_event(payload, stream=f"logs:{programs.PUMP_FUN}", slot=None)
    )
    assert event is not None
    assert event.reason_codes == ("NO_SLOT_IN_NOTIFICATION",)


def test_dedup_key_is_stable_for_the_same_fact() -> None:
    sig = samples.signature(8)
    assert signature_dedup_key(sig, EventKind.SWAP) == signature_dedup_key(sig, EventKind.SWAP)
    # Distinct facts about one transaction stay distinct.
    assert signature_dedup_key(sig, EventKind.SWAP) != signature_dedup_key(
        sig, EventKind.POOL_CREATED
    )


def test_payload_dedup_key_is_deterministic_regardless_of_key_order() -> None:
    a = payload_dedup_key("s", 1, {"x": 1, "y": {"a": 2, "b": 3}})
    b = payload_dedup_key("s", 1, {"y": {"b": 3, "a": 2}, "x": 1})
    assert a == b


@pytest.mark.parametrize("stream", ["logs:not-a-program", "weird", ""])
def test_unknown_stream_yields_no_program_id(stream: str) -> None:
    event = LogNotificationNormalizer().normalize(
        raw_event(
            samples.logs_notification(
                sig=samples.signature(9), slot=1, logs=samples.SPL_TRANSFER_LOGS
            ),
            stream=stream,
        )
    )
    assert event is not None
    assert event.program_id is None
