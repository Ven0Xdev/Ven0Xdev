"""VYRAXIS error taxonomy.

Errors are classified so that callers can make a *policy* decision (retry,
back off, fail closed) without string-matching messages. Every error carries a
stable ``code`` suitable for logging, metrics and reason-code aggregation.
"""

from __future__ import annotations

from typing import Any


class VyraxisError(Exception):
    """Base class for every error raised by VYRAXIS."""

    code: str = "VYRAXIS_ERROR"

    def __init__(self, message: str, /, **context: Any) -> None:
        super().__init__(message)
        self.message = message
        self.context: dict[str, Any] = context

    def __str__(self) -> str:  # pragma: no cover - trivial
        if not self.context:
            return self.message
        rendered = " ".join(f"{k}={v!r}" for k, v in sorted(self.context.items()))
        return f"{self.message} ({rendered})"


class ConfigurationError(VyraxisError):
    """Configuration is missing, malformed, or forbidden by policy."""

    code = "CONFIGURATION_ERROR"


class ProviderError(VyraxisError):
    """A data provider (RPC/WebSocket/HTTP API) failed."""

    code = "PROVIDER_ERROR"


class TransientProviderError(ProviderError):
    """Provider failure that is expected to succeed on retry."""

    code = "PROVIDER_TRANSIENT"


class PermanentProviderError(ProviderError):
    """Provider failure that will not be fixed by retrying the same request."""

    code = "PROVIDER_PERMANENT"


class RateLimitError(TransientProviderError):
    """Provider signalled rate limiting. Carries an optional retry hint."""

    code = "PROVIDER_RATE_LIMITED"

    def __init__(self, message: str, /, retry_after_seconds: float | None = None, **ctx: Any):
        super().__init__(message, retry_after_seconds=retry_after_seconds, **ctx)
        self.retry_after_seconds = retry_after_seconds


class StaleDataError(VyraxisError):
    """Data is too old to be trusted for a decision. Fail closed, never guess."""

    code = "STALE_DATA"


class DecodeError(VyraxisError):
    """A raw on-chain payload could not be decoded into a normalized event."""

    code = "DECODE_ERROR"


class StorageError(VyraxisError):
    """Persistence layer failure."""

    code = "STORAGE_ERROR"


class IntegrityError(VyraxisError):
    """A data-integrity invariant was violated (e.g. future data in a feature)."""

    code = "INTEGRITY_VIOLATION"


class NotImplementedYetError(VyraxisError):
    """A documented capability that is deliberately not implemented yet.

    Raised instead of returning fabricated values. VYRAXIS never substitutes
    mock functionality for production functionality at runtime.
    """

    code = "NOT_IMPLEMENTED_YET"
