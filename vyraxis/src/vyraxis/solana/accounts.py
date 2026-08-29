"""Decoding of raw Solana account data.

Only layouts we can decode deterministically are implemented. Where a layout is
not implemented, the decoder raises rather than returning plausible-looking
zeros: an invented ``decimals`` would corrupt every quantity derived from it.
"""

from __future__ import annotations

import base64
from datetime import datetime
from typing import Any, Final

from vyraxis.core.base58 import b58encode
from vyraxis.core.errors import DecodeError
from vyraxis.solana.provider import AccountInfo, MintState

#: SPL Token ``Mint`` layout, 82 bytes:
#:   0..4    COption tag for mint_authority (u32 LE, 0=None, 1=Some)
#:   4..36   mint_authority pubkey
#:   36..44  supply (u64 LE)
#:   44      decimals (u8)
#:   45      is_initialized (u8)
#:   46..50  COption tag for freeze_authority (u32 LE)
#:   50..82  freeze_authority pubkey
MINT_ACCOUNT_LEN: Final[int] = 82

_COPTION_NONE: Final[int] = 0
_COPTION_SOME: Final[int] = 1


def decode_mint_account(
    account: AccountInfo, *, read_at: datetime, mint: str | None = None
) -> MintState:
    """Decode an SPL ``Mint`` account.

    Token-2022 mints carry extensions after byte 82; the base layout is
    identical, so the leading 82 bytes are decoded and trailing extension data
    is ignored (extension parsing belongs to RugGuard in Phase 2).
    """
    data = account.data
    if len(data) < MINT_ACCOUNT_LEN:
        raise DecodeError(
            "account is too short to be an SPL mint",
            address=account.address,
            length=len(data),
            expected_at_least=MINT_ACCOUNT_LEN,
        )

    mint_authority = _decode_coption_pubkey(data, 0, account.address, "mint_authority")
    supply_raw = int.from_bytes(data[36:44], "little")
    decimals = data[44]
    is_initialized = data[45] == 1
    freeze_authority = _decode_coption_pubkey(data, 46, account.address, "freeze_authority")

    if decimals > 32:
        raise DecodeError(
            "implausible decimals decoded from mint account",
            address=account.address,
            decimals=decimals,
        )

    return MintState(
        mint=mint or account.address,
        decimals=decimals,
        supply_raw=supply_raw,
        mint_authority=mint_authority,
        freeze_authority=freeze_authority,
        is_initialized=is_initialized,
        owner_program=account.owner,
        read_at=read_at,
        slot=account.slot,
    )


def _decode_coption_pubkey(data: bytes, offset: int, address: str, field_name: str) -> str | None:
    tag = int.from_bytes(data[offset : offset + 4], "little")
    if tag == _COPTION_NONE:
        return None
    if tag != _COPTION_SOME:
        raise DecodeError(
            "invalid COption discriminant in mint account",
            address=address,
            field=field_name,
            tag=tag,
        )
    return b58encode(data[offset + 4 : offset + 36])


def decode_account_data(value: Any) -> bytes:
    """Decode the ``data`` field of an ``getAccountInfo`` response.

    Solana returns ``[payload, encoding]``. Only ``base64`` and ``base58`` are
    accepted; ``jsonParsed`` responses arrive as a dict and are rejected here so
    a caller cannot mistake a parsed object for raw bytes.
    """
    if value is None:
        return b""
    if isinstance(value, list | tuple):
        if len(value) != 2:
            raise DecodeError("unexpected account data envelope", envelope_length=len(value))
        payload, encoding = value
        if encoding == "base64":
            return base64.b64decode(payload)
        if encoding == "base58":
            from vyraxis.core.base58 import b58decode

            return b58decode(payload)
        raise DecodeError("unsupported account data encoding", encoding=str(encoding))
    if isinstance(value, str):
        return base64.b64decode(value)
    raise DecodeError("account data is not raw bytes", data_type=type(value).__name__)


def encode_mint_account(
    *,
    mint_authority: bytes | None,
    supply_raw: int,
    decimals: int,
    is_initialized: bool,
    freeze_authority: bytes | None,
) -> bytes:
    """Build an SPL mint account buffer.

    Lives beside the decoder so the round-trip is covered by the same tests. It
    is used by test fixtures only; nothing in the ingestion path calls it.
    """
    out = bytearray()
    out += _encode_coption(mint_authority)
    out += supply_raw.to_bytes(8, "little")
    out += bytes([decimals, 1 if is_initialized else 0])
    out += _encode_coption(freeze_authority)
    assert len(out) == MINT_ACCOUNT_LEN
    return bytes(out)


def _encode_coption(pubkey: bytes | None) -> bytes:
    if pubkey is None:
        return _COPTION_NONE.to_bytes(4, "little") + bytes(32)
    if len(pubkey) != 32:
        raise ValueError("pubkey must be 32 bytes")
    return _COPTION_SOME.to_bytes(4, "little") + pubkey
