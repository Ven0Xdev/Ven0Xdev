"""Structured logging.

Every log line is a structured event with a stable name, emitted as JSON in
non-interactive environments. Two properties matter more than formatting:

1. **Nothing sensitive is ever emitted.** A redaction processor scrubs keys
   whose names suggest secrets and rewrites credential-bearing DSNs/URLs,
   regardless of which call site produced them.
2. **Failures are visible.** There is no logger configuration in VYRAXIS that
   discards warnings or errors, and ingestion never swallows an exception
   without emitting an event.
"""

from __future__ import annotations

import logging
import re
import sys
from typing import Any, Final

import structlog
from structlog.types import EventDict, Processor

#: Substrings that mark a key as secret-bearing. Matching is case-insensitive
#: and substring-based so that ``db_password`` and ``RPC_API_KEY`` both match.
SENSITIVE_KEY_PARTS: Final[tuple[str, ...]] = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "auth_header",
    "private_key",
    "privatekey",
    "seed_phrase",
    "seedphrase",
    "mnemonic",
    "keypair",
    "signing_key",
    "credential",
)

REDACTED: Final[str] = "***REDACTED***"

_CREDENTIALS_IN_URL = re.compile(r"(?P<scheme>[a-zA-Z][a-zA-Z0-9+.\-]*://)[^:/@\s]+(:[^@\s]*)?@")
_QUERY_SECRET = re.compile(
    r"(?i)\b(api[-_]?key|access[-_]?token|auth|token|secret)=([^&\s\"']+)",
)


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in SENSITIVE_KEY_PARTS)


def scrub_text(value: str) -> str:
    """Remove credentials embedded in URLs and query strings."""
    scrubbed = _CREDENTIALS_IN_URL.sub(r"\g<scheme>***:***@", value)
    return _QUERY_SECRET.sub(r"\1=" + REDACTED, scrubbed)


def _scrub_value(key: str, value: Any, depth: int = 0) -> Any:
    if _is_sensitive_key(key):
        return REDACTED
    if depth > 6:
        return value
    if isinstance(value, str):
        return scrub_text(value)
    if isinstance(value, dict):
        return {k: _scrub_value(str(k), v, depth + 1) for k, v in value.items()}
    if isinstance(value, list | tuple):
        rendered = [_scrub_value(key, item, depth + 1) for item in value]
        return type(value)(rendered) if isinstance(value, tuple) else rendered
    return value


def redaction_processor(_logger: Any, _method: str, event_dict: EventDict) -> EventDict:
    """structlog processor that redacts secrets from every emitted event."""
    return {key: _scrub_value(str(key), value) for key, value in event_dict.items()}


class _StderrProxy:
    """Writes to whatever ``sys.stderr`` is at call time.

    Binding the stream object at configuration time keeps a handle that can be
    closed or replaced later - by a CLI test runner, by log rotation, or by a
    process that re-opens its streams - after which every log call raises
    "I/O operation on closed file". Resolving lazily makes logging survive
    stream replacement.
    """

    __slots__ = ()

    def write(self, message: str) -> int:
        return sys.stderr.write(message)

    def flush(self) -> None:
        stream = sys.stderr
        if not getattr(stream, "closed", False):
            stream.flush()

    def isatty(self) -> bool:
        return bool(getattr(sys.stderr, "isatty", lambda: False)())


_STDERR: Final[_StderrProxy] = _StderrProxy()


def configure_logging(
    *,
    level: str = "INFO",
    fmt: str = "json",
    service_name: str = "vyraxis",
    instance_id: str = "local-1",
) -> None:
    """Configure structlog and the stdlib root logger.

    Safe to call more than once; the last call wins. Third-party libraries that
    log via the stdlib are routed through the same processors so their output
    is redacted and structured too.
    """
    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True, key="ts")

    shared: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        _add_service_context(service_name, instance_id),
        redaction_processor,
    ]

    renderer: Processor
    if fmt == "console":
        renderer = structlog.dev.ConsoleRenderer(colors=_STDERR.isatty())
        shared.append(structlog.processors.format_exc_info)
    else:
        shared.append(structlog.processors.dict_tracebacks)
        renderer = structlog.processors.JSONRenderer(sort_keys=True)

    structlog.configure(
        processors=[*shared, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level) if isinstance(level, str) else level
        ),
        logger_factory=structlog.PrintLoggerFactory(file=_STDERR),  # type: ignore[arg-type]
        # Loggers are not cached: configure_logging may be called again (tests,
        # a CLI callback) and a cached bound logger would keep the old
        # processor chain, including an old level filter.
        cache_logger_on_first_use=False,
    )

    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(_STDERR)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )
    root.addHandler(handler)
    root.setLevel(level)


def _add_service_context(service_name: str, instance_id: str) -> Processor:
    def processor(_logger: Any, _method: str, event_dict: EventDict) -> EventDict:
        event_dict.setdefault("service", service_name)
        event_dict.setdefault("instance", instance_id)
        return event_dict

    return processor


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a bound logger for ``name`` (usually ``__name__``)."""
    return structlog.get_logger(name)  # type: ignore[no-any-return]
