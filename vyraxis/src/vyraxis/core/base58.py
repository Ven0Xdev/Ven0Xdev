"""Base58 (Bitcoin alphabet) codec.

Implemented locally rather than pulled from a dependency so that address
handling has no native-extension footprint and is covered by our own known-
answer tests (see tests/unit/test_base58.py).
"""

from __future__ import annotations

from typing import Final

_ALPHABET: Final[str] = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_INDEX: Final[dict[str, int]] = {char: i for i, char in enumerate(_ALPHABET)}
_BASE: Final[int] = 58


def b58encode(data: bytes) -> str:
    """Encode bytes as base58. Leading zero bytes map to leading '1' characters."""
    if not isinstance(data, bytes | bytearray):
        raise TypeError(f"b58encode expects bytes, got {type(data).__name__}")
    leading_zeros = 0
    for byte in data:
        if byte != 0:
            break
        leading_zeros += 1

    number = int.from_bytes(data, "big")
    digits: list[str] = []
    while number > 0:
        number, remainder = divmod(number, _BASE)
        digits.append(_ALPHABET[remainder])
    digits.append(_ALPHABET[0] * leading_zeros)
    return "".join(reversed(digits))


def b58decode(text: str) -> bytes:
    """Decode base58 text to bytes.

    Raises ``ValueError`` on any character outside the alphabet; there is no
    lenient mode, because a silently mangled address is a fund-loss bug.
    """
    if not isinstance(text, str):
        raise TypeError(f"b58decode expects str, got {type(text).__name__}")
    if text == "":
        return b""

    number = 0
    for char in text:
        try:
            number = number * _BASE + _INDEX[char]
        except KeyError:
            raise ValueError(f"invalid base58 character {char!r} in {text!r}") from None

    leading_ones = 0
    for char in text:
        if char != _ALPHABET[0]:
            break
        leading_ones += 1

    body = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    return b"\x00" * leading_ones + body
