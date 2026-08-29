"""Transaction enrichment arithmetic.

These assertions are about money moving. They must be exact, and they must
refuse to invent values that the node did not supply.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fixtures import samples
from vyraxis.core.enums import DecodeStatus, EventKind, TradeDirection
from vyraxis.scanner.enrichment import (
    choose_primary_mint,
    enrich_event,
    extract_transaction_facts,
)
from vyraxis.scanner.events import NormalizedEvent
from vyraxis.solana import programs

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def base_event(kind: EventKind = EventKind.SWAP, **kwargs: object) -> NormalizedEvent:
    defaults: dict = {
        "dedup_key": "sig:test:SWAP",
        "kind": kind,
        "decode_status": DecodeStatus.PARTIAL,
        "provider": "fixture",
        "stream": f"logs:{programs.PUMP_FUN}",
        "slot": 100,
        "observed_at": T0,
        "signature": samples.signature(1),
        "program_id": programs.PUMP_FUN,
    }
    defaults.update(kwargs)
    return NormalizedEvent(**defaults)  # type: ignore[arg-type]


def test_sol_delta_excludes_the_transaction_fee() -> None:
    """Including the fee would inflate every sell and shrink every buy."""
    tx = samples.buy_transaction(
        sig=samples.signature(1),
        slot=10,
        block_time=1_700_000_000,
        sol_spent_lamports=500_000_000,
        fee_lamports=5_000,
    )
    facts = extract_transaction_facts(tx)
    assert facts.sol_delta_lamports == -500_000_000
    assert facts.fee_lamports == 5_000


def test_fee_payer_is_the_first_signer() -> None:
    facts = extract_transaction_facts(
        samples.buy_transaction(sig=samples.signature(2), slot=1, block_time=1)
    )
    assert facts.fee_payer == samples.TRADER_WALLET


def test_token_deltas_are_integer_base_units() -> None:
    facts = extract_transaction_facts(
        samples.buy_transaction(
            sig=samples.signature(3), slot=1, block_time=1, token_amount_raw=1_234_567
        )
    )
    by_owner = {delta.owner: delta.delta_raw for delta in facts.deltas}
    assert by_owner[samples.TRADER_WALLET] == 1_234_567
    assert by_owner[samples.POOL_ADDRESS] == -1_234_567
    assert sum(by_owner.values()) == 0


def test_quote_mints_are_not_chosen_as_the_subject_token() -> None:
    tx = samples.buy_transaction(sig=samples.signature(4), slot=1, block_time=1)
    tx["meta"]["postTokenBalances"].append(
        {
            "accountIndex": 5,
            "mint": programs.WRAPPED_SOL_MINT,
            "owner": samples.TRADER_WALLET,
            "uiTokenAmount": {"amount": "999999999999", "decimals": 9},
        }
    )
    facts = extract_transaction_facts(tx)
    # wSOL moved far more than the memecoin, but it is the payment leg.
    assert choose_primary_mint(facts) == samples.MEMECOIN_MINT


def test_enrichment_upgrades_partial_to_decoded() -> None:
    facts = extract_transaction_facts(
        samples.buy_transaction(sig=samples.signature(5), slot=42, block_time=1_700_000_000)
    )
    enriched = enrich_event(base_event(), facts)
    assert enriched.decode_status is DecodeStatus.DECODED
    assert enriched.token_mint == samples.MEMECOIN_MINT
    assert enriched.actor_wallet == samples.TRADER_WALLET
    assert enriched.direction is TradeDirection.BUY
    assert enriched.base_amount_raw == 1_000_000_000
    assert enriched.quote_amount_raw == 500_000_000
    assert "ENRICHED" in enriched.reason_codes


def test_enrichment_never_overwrites_a_known_field() -> None:
    facts = extract_transaction_facts(
        samples.buy_transaction(sig=samples.signature(6), slot=1, block_time=1)
    )
    event = base_event(token_mint="AlreadyKnownMint", direction=TradeDirection.SELL)
    enriched = enrich_event(event, facts)
    assert enriched.token_mint == "AlreadyKnownMint"
    assert enriched.direction is TradeDirection.SELL


def test_missing_balances_leave_the_event_partial() -> None:
    """Absent data yields an honest PARTIAL, not a fabricated zero."""
    tx = samples.buy_transaction(sig=samples.signature(7), slot=1, block_time=1)
    del tx["meta"]["preTokenBalances"]
    del tx["meta"]["postTokenBalances"]
    facts = extract_transaction_facts(tx)
    assert "NO_TOKEN_BALANCES" in facts.reason_codes
    assert not facts.complete

    enriched = enrich_event(base_event(), facts)
    assert enriched.decode_status is DecodeStatus.PARTIAL
    assert enriched.token_mint is None
    assert enriched.base_amount_raw is None


def test_block_time_is_taken_from_the_chain_not_invented() -> None:
    facts = extract_transaction_facts(
        samples.buy_transaction(sig=samples.signature(8), slot=1, block_time=1_700_000_000)
    )
    assert facts.block_time == datetime(2023, 11, 14, 22, 13, 20, tzinfo=UTC)

    tx = samples.buy_transaction(sig=samples.signature(9), slot=1, block_time=1)
    tx["blockTime"] = None
    assert extract_transaction_facts(tx).block_time is None


def test_malformed_balance_entries_are_skipped_not_crashed() -> None:
    tx = samples.buy_transaction(sig=samples.signature(10), slot=1, block_time=1)
    tx["meta"]["postTokenBalances"].extend(
        [
            {"mint": "not-a-mint", "uiTokenAmount": {"amount": "5"}},
            {"mint": samples.MEMECOIN_MINT, "uiTokenAmount": {"amount": "not-a-number"}},
            "garbage",
        ]
    )
    facts = extract_transaction_facts(tx)
    assert choose_primary_mint(facts) == samples.MEMECOIN_MINT


def test_zero_deltas_are_not_recorded() -> None:
    tx = samples.buy_transaction(sig=samples.signature(11), slot=1, block_time=1)
    tx["meta"]["preTokenBalances"] = tx["meta"]["postTokenBalances"]
    facts = extract_transaction_facts(tx)
    assert facts.deltas == ()
    assert "NO_TOKEN_MOVEMENT" in facts.reason_codes
