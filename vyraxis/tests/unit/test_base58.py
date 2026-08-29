"""Known-answer tests for the base58 codec and Solana value types."""

from __future__ import annotations

import pytest

from vyraxis.core.base58 import b58decode, b58encode
from vyraxis.core.types import Pubkey, Signature, is_valid_pubkey

# Standard base58 (Bitcoin alphabet) vectors.
KNOWN_VECTORS = [
    (b"", ""),
    (b"\x00", "1"),
    (b"\x00\x00", "11"),
    (b"hello world", "StV1DL6CwTryKyV"),
    (b"\x00\x00hello world", "11StV1DL6CwTryKyV"),
    (b"\x61", "2g"),
    (b"\x62\x62\x62", "a3gV"),
    (b"\x63\x63\x63", "aPEr"),
]


@pytest.mark.parametrize(("raw", "encoded"), KNOWN_VECTORS)
def test_encode_known_vectors(raw: bytes, encoded: str) -> None:
    assert b58encode(raw) == encoded


@pytest.mark.parametrize(("raw", "encoded"), KNOWN_VECTORS)
def test_decode_known_vectors(raw: bytes, encoded: str) -> None:
    assert b58decode(encoded) == raw


@pytest.mark.parametrize("length", [1, 2, 31, 32, 33, 64, 100])
def test_round_trip(length: int) -> None:
    payload = bytes(range(256))[:length] or b"\x01"
    assert b58decode(b58encode(payload)) == payload


def test_leading_zero_bytes_are_preserved() -> None:
    payload = b"\x00\x00\x00\xff\xee"
    assert b58decode(b58encode(payload)) == payload


def test_invalid_character_is_rejected() -> None:
    # '0', 'O', 'I' and 'l' are excluded from the alphabet precisely because
    # they are confusable; accepting them would silently produce a wrong key.
    for char in "0OIl":
        with pytest.raises(ValueError, match="invalid base58 character"):
            b58decode(f"abc{char}def")


def test_system_program_is_thirty_two_zero_bytes() -> None:
    pubkey = Pubkey.from_string("11111111111111111111111111111111")
    assert pubkey.raw == b"\x00" * 32
    assert str(pubkey) == "11111111111111111111111111111111"


def test_token_program_round_trips() -> None:
    text = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    assert str(Pubkey.from_string(text)) == text


def test_pubkey_rejects_wrong_length() -> None:
    with pytest.raises(ValueError, match="decodes to"):
        Pubkey.from_string("abc")
    with pytest.raises(ValueError, match="32 bytes"):
        Pubkey(b"\x00" * 31)


def test_signature_requires_sixty_four_bytes() -> None:
    sig = Signature(bytes(range(64)))
    assert str(Signature.from_string(str(sig))) == str(sig)
    with pytest.raises(ValueError, match="64 bytes"):
        Signature(b"\x00" * 63)


def test_is_valid_pubkey_never_raises() -> None:
    assert is_valid_pubkey("11111111111111111111111111111111")
    assert not is_valid_pubkey("not-a-key")
    assert not is_valid_pubkey(None)
    assert not is_valid_pubkey(12345)
