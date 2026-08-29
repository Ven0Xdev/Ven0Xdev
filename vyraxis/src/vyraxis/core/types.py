"""Solana value types.

These wrap the raw string forms used on the wire so that an invalid address can
never travel deep into the system disguised as a valid one. Construction always
validates; there is no unchecked constructor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final

from vyraxis.core.base58 import b58decode, b58encode

PUBKEY_BYTES: Final[int] = 32
SIGNATURE_BYTES: Final[int] = 64


@dataclass(frozen=True, slots=True)
class Pubkey:
    """A 32-byte Solana public key (mint, program, wallet or pool address)."""

    raw: bytes

    def __post_init__(self) -> None:
        if not isinstance(self.raw, bytes) or len(self.raw) != PUBKEY_BYTES:
            raise ValueError(f"pubkey must be exactly {PUBKEY_BYTES} bytes, got {len(self.raw)!r}")

    @classmethod
    def from_string(cls, text: str) -> Pubkey:
        decoded = b58decode(text)
        if len(decoded) != PUBKEY_BYTES:
            raise ValueError(
                f"base58 string {text!r} decodes to {len(decoded)} bytes, expected {PUBKEY_BYTES}"
            )
        return cls(decoded)

    @classmethod
    def validate(cls, text: str) -> str:
        """Validate a base58 address and return it unchanged (canonical form)."""
        return str(cls.from_string(text))

    def __str__(self) -> str:
        return b58encode(self.raw)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"Pubkey({str(self)!r})"


@dataclass(frozen=True, slots=True)
class Signature:
    """A 64-byte Solana transaction signature."""

    raw: bytes

    def __post_init__(self) -> None:
        if not isinstance(self.raw, bytes) or len(self.raw) != SIGNATURE_BYTES:
            raise ValueError(
                f"signature must be exactly {SIGNATURE_BYTES} bytes, got {len(self.raw)!r}"
            )

    @classmethod
    def from_string(cls, text: str) -> Signature:
        decoded = b58decode(text)
        if len(decoded) != SIGNATURE_BYTES:
            raise ValueError(
                f"base58 string {text!r} decodes to {len(decoded)} bytes,"
                f" expected {SIGNATURE_BYTES}"
            )
        return cls(decoded)

    def __str__(self) -> str:
        return b58encode(self.raw)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"Signature({str(self)!r})"


def is_valid_pubkey(value: Any) -> bool:
    """Non-raising predicate used when filtering untrusted provider payloads."""
    if not isinstance(value, str):
        return False
    try:
        Pubkey.from_string(value)
    except ValueError:
        return False
    return True
