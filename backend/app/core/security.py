"""Password hashing and JWT minting/verification.

Choices (ADR-001):
- The `bcrypt` library directly (NOT passlib: unmaintained since 2020 and
  broken against bcrypt>=4). Work factor 12 ≈ 250ms/hash — a deliberate
  brute-force cost. bcrypt ignores bytes past 72; we reject longer
  passwords at the API schema instead of truncating silently.
- PyJWT over python-jose: smaller, maintained, no crypto surface we don't
  use. HS256 with the app secret; token carries sub (user id), role, type
  (access|refresh), ver (token_version for global revocation), exp.
- Access tokens are short-lived; refresh tokens longer-lived and only
  accepted by the refresh endpoint (type-checked), never by resources.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
BCRYPT_MAX_PASSWORD_BYTES = 72
_BCRYPT_ROUNDS = 12


class TokenError(Exception):
    """Invalid, expired, revoked, or wrong-type token."""


class PasswordTooLong(ValueError):
    """bcrypt ignores bytes past 72 — reject instead of truncating silently."""


def hash_password(plain: str) -> str:
    raw = plain.encode("utf-8")
    if len(raw) > BCRYPT_MAX_PASSWORD_BYTES:
        raise PasswordTooLong(f"Password exceeds {BCRYPT_MAX_PASSWORD_BYTES} bytes")
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    raw = plain.encode("utf-8")
    if len(raw) > BCRYPT_MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(raw, hashed.encode("ascii"))
    except ValueError:
        return False


def create_token(user_id: int, role: str, token_version: int, token_type: str, expires_minutes: int) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": token_type,
        "ver": token_version,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: int, role: str, token_version: int) -> str:
    return create_token(user_id, role, token_version, ACCESS_TOKEN_TYPE, get_settings().access_token_expire_minutes)


def create_refresh_token(user_id: int, role: str, token_version: int) -> str:
    return create_token(user_id, role, token_version, REFRESH_TOKEN_TYPE, get_settings().refresh_token_expire_days * 24 * 60)


def decode_token(token: str, expected_type: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Invalid token") from exc
    if payload.get("type") != expected_type:
        raise TokenError(f"Wrong token type: expected {expected_type}")
    return payload
