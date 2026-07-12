# Security Gaps

Audit date: 2026-07-12. Context matters: the platform currently targets **localhost, single user**. Items are graded for that reality AND for the moment it faces a network.

## S1 — No authentication or authorization (P1 gate for any deployment)

Every endpoint is open: state-mutating (watchlist, portfolio, predictions log, **model promotion**), expensive (scan cycle, backtest, walk-forward), and data-reading. On localhost this is acceptable; the moment the API binds to a public interface it is not. **`POST /models/{id}/promote` deserves special mention: the champion/challenger human-approval gate currently authenticates the human by nothing.** Design exists (JWT+refresh, RBAC, SYSTEM-ARCHITECTURE §6); implementation is the P1 blocker for deployment.

## S2 — No rate limiting (P1 for deployment)

`/backtest/run`, `/backtest/walk-forward`, `/scan/run-cycle` are CPU-heavy; unauthenticated + unlimited = trivial DoS. Also burns vendor API quota (finnhub 60/min) — an attacker can starve the scanner. Plan: per-IP/user token bucket in Redis (design done, §6).

## S3 — Chat session hijack by key guessing (P1, folded into auth)

`GET /chat/history/{session_key}` returns any session whose key you can guess; keys are client-generated (`localStorage`, `Math.random`). Single-user today; leaks conversations the day there are two users.

## S4 — API key & secret handling (OK with two cautions)

Good: secrets only via env; `.env` gitignored; `.env.example` has no real values; repo scanned — no keys committed. Cautions: (a) the user's Finnhub key was pasted in chat — **recommend rotation at finnhub.io before any public deployment**; (b) `SECRET_KEY` default is `CHANGE_ME_IN_PRODUCTION` — startup should refuse production mode with the default (P1, 5 lines).

## S5 — Input validation edges (P2)

Ticker path params flow into provider lookups unvalidated (length-capped by schema only in some paths). SQLAlchemy parameterization means no SQL injection; mock fabrication (fixed in slice) was the worst consequence. Add: symbol regex `^[A-Z0-9.\-]{1,10}$` at the API boundary (done for the new validate/search endpoints in the slice), request size limits at ingress (deployment phase).

## S6 — CORS / docs exposure (fine now, revisit at deploy)

CORS locked to `localhost:3000` (good). `/docs` (OpenAPI) open — fine for localhost, gate behind auth or disable in production config at deploy time (P1 checklist item).

## S7 — Dependency & image hygiene (P2)

No automated dependency audit (pip-audit / npm audit) or image scan in CI; blueprint schedules them Phase 5. One-line CI additions; do with the deployment push.

## S8 — Data poisoning surface (P2, by design partially open)

Predictions/outcomes accept whatever the provider serves; a compromised/degraded vendor could poison the calibration store. Mitigations already present: DB CHECK constraints bound values; drift monitoring detects distribution breaks; provider failures are typed. Additional (P3): per-provider data-sanity gates (price>0, monotonic timestamps — partially present in adapters).

## Explicitly NOT gaps

- SQL injection (ORM-parameterized throughout, no raw user SQL).
- Secrets in repo (verified absent).
- The synthetic provider (clearly documented; the gap was *labeling*, fixed in slice — see REAL_VS_MOCK_DATA).
