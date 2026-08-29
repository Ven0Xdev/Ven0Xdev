"""SPL mint account decoding."""

from __future__ import annotations

import base64
from datetime import UTC, datetime

import pytest

from vyraxis.core.errors import DecodeError
from vyraxis.core.types import Pubkey
from vyraxis.solana import programs
from vyraxis.solana.accounts import (
    MINT_ACCOUNT_LEN,
    decode_account_data,
    decode_mint_account,
    encode_mint_account,
)
from vyraxis.solana.provider import AccountInfo

T0 = datetime(2026, 1, 1, tzinfo=UTC)
AUTHORITY = Pubkey.from_string(programs.PUMP_FUN).raw


def account(data: bytes) -> AccountInfo:
    return AccountInfo(
        address=programs.WRAPPED_SOL_MINT,
        lamports=1_000_000,
        owner=programs.TOKEN_PROGRAM,
        executable=False,
        rent_epoch=0,
        data=data,
        slot=99,
    )


def test_mint_layout_is_82_bytes() -> None:
    data = encode_mint_account(
        mint_authority=AUTHORITY,
        supply_raw=1,
        decimals=6,
        is_initialized=True,
        freeze_authority=None,
    )
    assert len(data) == MINT_ACCOUNT_LEN


def test_round_trip_with_both_authorities_set() -> None:
    data = encode_mint_account(
        mint_authority=AUTHORITY,
        supply_raw=1_000_000_000_000_000,
        decimals=9,
        is_initialized=True,
        freeze_authority=AUTHORITY,
    )
    state = decode_mint_account(account(data), read_at=T0)
    assert state.decimals == 9
    assert state.supply_raw == 1_000_000_000_000_000
    assert state.mint_authority == programs.PUMP_FUN
    assert state.freeze_authority == programs.PUMP_FUN
    assert state.is_initialized is True


def test_revoked_authorities_decode_to_none() -> None:
    """None means 'revoked', a positive finding RugGuard will rely on."""
    data = encode_mint_account(
        mint_authority=None,
        supply_raw=0,
        decimals=0,
        is_initialized=True,
        freeze_authority=None,
    )
    state = decode_mint_account(account(data), read_at=T0)
    assert state.mint_authority is None
    assert state.freeze_authority is None


def test_u64_max_supply_survives_decoding() -> None:
    data = encode_mint_account(
        mint_authority=None,
        supply_raw=2**64 - 1,
        decimals=0,
        is_initialized=True,
        freeze_authority=None,
    )
    assert decode_mint_account(account(data), read_at=T0).supply_raw == 2**64 - 1


def test_token_2022_extension_bytes_are_ignored() -> None:
    base = encode_mint_account(
        mint_authority=None,
        supply_raw=5,
        decimals=6,
        is_initialized=True,
        freeze_authority=None,
    )
    state = decode_mint_account(account(base + b"\xab" * 64), read_at=T0)
    assert state.decimals == 6
    assert state.supply_raw == 5


def test_short_account_is_rejected_not_padded() -> None:
    with pytest.raises(DecodeError, match="too short"):
        decode_mint_account(account(b"\x00" * 40), read_at=T0)


def test_invalid_coption_tag_is_rejected() -> None:
    data = bytearray(
        encode_mint_account(
            mint_authority=None,
            supply_raw=1,
            decimals=1,
            is_initialized=True,
            freeze_authority=None,
        )
    )
    data[0:4] = (7).to_bytes(4, "little")
    with pytest.raises(DecodeError, match="invalid COption"):
        decode_mint_account(account(bytes(data)), read_at=T0)


def test_implausible_decimals_are_rejected() -> None:
    data = bytearray(
        encode_mint_account(
            mint_authority=None,
            supply_raw=1,
            decimals=6,
            is_initialized=True,
            freeze_authority=None,
        )
    )
    data[44] = 99
    with pytest.raises(DecodeError, match="implausible decimals"):
        decode_mint_account(account(bytes(data)), read_at=T0)


def test_account_data_envelope_decoding() -> None:
    payload = b"hello"
    assert decode_account_data([base64.b64encode(payload).decode(), "base64"]) == payload
    assert decode_account_data(None) == b""
    with pytest.raises(DecodeError, match="unsupported account data encoding"):
        decode_account_data(["x", "jsonParsed"])
    with pytest.raises(DecodeError, match="not raw bytes"):
        decode_account_data({"parsed": {}})
