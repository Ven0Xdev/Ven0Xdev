import logging
import re
import sys

# Matches a credential-bearing query param anywhere in a log message —
# case-insensitive, value up to the next &/whitespace/quote.
_SECRET_QUERY_PARAM_RE = re.compile(
    r"(?i)([?&](?:apikey|api_key|token|key))=[^&\s\"'>]+"
)


class _RedactSecretsFilter(logging.Filter):
    """Belt-and-suspenders redaction applied to *every* log record reaching
    this handler, not just this codebase's own log calls.

    services/data_providers/http_base.py's sanitize_url() only redacts URLs
    this codebase explicitly logs itself (e.g. a redirect warning) — it
    does nothing about httpx's own internal request logger (the "httpx"
    logger name), which logs each outbound request's full URL, including
    our TWELVE_DATA_API_KEY/ALPHA_VANTAGE_API_KEY query param, at INFO
    level by default. That is a real, observed leak path (confirmed live:
    the key appeared in `docker logs` in plaintext), not a hypothetical
    one — a vendor key must never reach a log line by any path, from any
    logger, so this rewrites the final formatted message itself rather
    than relying on every call site to remember to sanitize.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        redacted = _SECRET_QUERY_PARAM_RE.sub(r"\1=***", message)
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
