import logging
import re
import sys

# Matches a credential-bearing query param anywhere in a log message —
# case-insensitive, value up to the next &/whitespace/quote. Covers Twelve
# Data's/Alpha Vantage's ?apikey=... auth scheme.
_SECRET_QUERY_PARAM_RE = re.compile(
    r"(?i)([?&](?:apikey|api_key|token|key))=[^&\s\"'>]+"
)

# Matches a credential-bearing field in a JSON-shaped log message —
# e.g. {"action":"auth","key":"...","secret":"..."}. Covers Alpaca's
# WebSocket auth payload: confirmed live, the `websockets` library's own
# DEBUG-level frame logging printed this exact JSON body (including the
# real key/secret) to `docker logs`, a completely different shape than
# the query-param case above and not caught by it.
_SECRET_JSON_FIELD_RE = re.compile(
    r'(?i)("(?:apikey|api_key|token|key|secret)")\s*:\s*"[^"]*"'
)

# Belt-and-suspenders beyond both pattern-based regexes above: every real
# secret value handed to a provider adapter is registered here (see
# register_secret()) and redacted verbatim from any log line it appears
# in, regardless of what format/field-name wraps it — covers leak paths
# neither regex above anticipated.
_registered_secrets: list[str] = []


def register_secret(value: str | None) -> None:
    """Register a literal secret value (an API key/secret) for redaction
    from every log line, in whatever format it might appear in. Called by
    each provider adapter's __init__ (see alpaca_provider.py) right where
    the secret first enters the process — not from app startup, so it's
    never possible to construct a provider with a real secret that isn't
    also protected.
    """
    if value and len(value) >= 6 and value not in _registered_secrets:  # skip trivially short/empty values
        _registered_secrets.append(value)


class _RedactSecretsFilter(logging.Filter):
    """Belt-and-suspenders redaction applied to *every* log record reaching
    this handler, not just this codebase's own log calls.

    services/data_providers/http_base.py's sanitize_url() only redacts URLs
    this codebase explicitly logs itself (e.g. a redirect warning) — it
    does nothing about httpx's own internal request logger (the "httpx"
    logger name), which logs each outbound request's full URL, including
    our TWELVE_DATA_API_KEY/ALPHA_VANTAGE_API_KEY query param, at INFO
    level by default; nor the `websockets` library's own DEBUG frame
    logging, which prints the raw JSON body of Alpaca's WS auth message.
    Both are real, observed leak paths (confirmed live in `docker logs`),
    not hypothetical ones — a vendor key must never reach a log line by
    any path, from any logger, so this rewrites the final formatted
    message itself rather than relying on every call site (ours or a
    third-party library's) to remember to sanitize.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        redacted = _SECRET_QUERY_PARAM_RE.sub(r"\1=***", message)
        redacted = _SECRET_JSON_FIELD_RE.sub(r'\1: "***"', redacted)
        for secret in _registered_secrets:
            if secret in redacted:
                redacted = redacted.replace(secret, "***")
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
    )
    handler.addFilter(_RedactSecretsFilter())
    root.addHandler(handler)
    root.setLevel(level)
