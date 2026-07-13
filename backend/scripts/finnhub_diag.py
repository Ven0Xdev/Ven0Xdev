"""Finnhub connectivity diagnostic — run this on the machine that sees the
HTTP 302 (this repo's cloud sandbox blocks finnhub.io at the network layer,
so the redirect can only be captured where the request actually leaves).

Usage:
    export FINNHUB_API_KEY=<your NEW key>      # never paste the key in chat
    python scripts/finnhub_diag.py

What it does, safely:
- sends the token as the `X-Finnhub-Token` header (never in a URL),
- does NOT auto-follow redirects, so it prints the raw status + Location,
- redacts the token from any output before printing.

Read the status line for each endpoint:
    200            -> works on your plan.
    302 + Location -> the redirect target is the diagnosis:
                        * same host (finnhub.io) -> harmless move; the app
                          follows it automatically now.
                        * different host          -> a proxy / captive portal
                          / corporate filter on YOUR network is intercepting
                          the request. Fix the network, not the code.
    401            -> the key is invalid/expired/revoked.
    403            -> the endpoint needs a paid Finnhub plan.
    429            -> rate limited; slow down.
"""
from __future__ import annotations

import os
import sys

import httpx

BASE = "https://finnhub.io/api/v1"
ENDPOINTS = [
    ("/stock/symbol", {"exchange": "US"}),
    ("/quote", {"symbol": "AAPL"}),
    ("/stock/profile2", {"symbol": "AAPL"}),
    ("/stock/candle", {"symbol": "AAPL", "resolution": "D", "from": 1700000000, "to": 1700600000}),
]


def redact(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret and text else (text or "(none)")


def main() -> int:
    key = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not key:
        print("Set FINNHUB_API_KEY in your environment first (do not paste it in chat).")
        return 2

    print(f"Probing {BASE} (token sent as header, not in URL)\n")
    with httpx.Client(timeout=15.0, follow_redirects=False,
                      headers={"X-Finnhub-Token": key}) as client:
        for path, params in ENDPOINTS:
            try:
                r = client.get(BASE + path, params=params)
            except httpx.HTTPError as exc:
                print(f"  {path:22} -> ERROR {type(exc).__name__}: {exc}")
                continue
            loc = redact(r.headers.get("location", ""), key)
            extra = f"  Location: {loc}" if r.is_redirect else ""
            print(f"  {path:22} -> HTTP {r.status_code}{extra}")
    print("\nInterpretation is in the module docstring at the top of this file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
