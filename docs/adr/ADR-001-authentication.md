# ADR-001 — Authentication & Authorization

Status: Accepted · Date: 2026-07-12 · Closes audit items S1–S4, G10 (P1-1)

## Context

The platform had zero authentication. Dangerous specifically: `POST /models/{id}/promote` (the champion/challenger human gate authenticated nobody), on-demand scans/backtests (CPU + vendor-quota DoS), and chat-session hijack by key guessing. Constraint from the audit: localhost development must stay friction-free.

## Options considered

**A. Single operator API key.** One shared bearer token guarding mutating/expensive endpoints. + Trivial to ship. − No user identity → no per-user data, thrown away the day a second user exists; contradicts the product's multi-user goal (PRD FR-1100).

**B. Full JWT user system with an enforcement toggle.** Users table, register/login/refresh, roles, per-user ownership — with `AUTH_REQUIRED=false` for local development injecting a stable `dev@local` operator principal. + Is the FR-1100 foundation; identical code paths in dev and prod (the toggle changes *enforcement*, never shape); per-user data lands now. − More surface than A.

**C. Outsourced IdP (Auth0/Cognito).** Deferred: vendor cost + data locality; swappable later behind the same dependency.

## Decision: B

Comparable cost to A once ownership columns are counted, and A is guaranteed rework. Details:

- **Tokens:** PyJWT, HS256. Access 30 min; refresh 14 days, type-claim enforced (an access token can never refresh, a refresh token can never access). `ver` claim = `users.token_version` → bumping the column revokes every outstanding token (cheap global revocation without a token blacklist store).
- **Passwords:** `bcrypt` library directly at work factor 12 (~250ms/hash). **Not passlib** — unmaintained since 2020, broken against bcrypt≥4 (verified in this repo's tests). 72-byte bcrypt limit is rejected at the API schema, never silently truncated.
- **Roles:** `user` / `operator`. Operator-only: model train/promote, on-demand scan cycles, outcome evaluation. First registered account bootstraps as operator; `ALLOW_REGISTRATION=false` closes the door after onboarding.
- **Ownership:** `user_id` on watchlist/portfolio/chat-sessions (per-user watchlist uniqueness). The dev principal also sees pre-tenancy NULL rows; real accounts are strictly scoped. Chat sessions: foreign key + 403 on cross-account access (closes the hijack); NULL legacy sessions are claimed on first touch.
- **Rate limiting:** in-process token bucket (`core/ratelimit.py`) on expensive endpoints, keyed by user (or IP for the dev principal); `RATE_LIMIT_ENABLED` off locally. Redis storage swap at scale-out per NFR-S3.
- **Production guards:** boot refuses `production` with the default SECRET_KEY or with `AUTH_REQUIRED=false`.
- **Account enumeration:** login returns one identical error for unknown-email and wrong-password.

## Consequences

- Localhost workflow unchanged (verified: full suite passes with auth off; dedicated tests flip enforcement on).
- Frontend login UI is intentionally a follow-up (P1-3 batch) — the API is complete and tested first.
- Known deferral: refresh tokens are stateless (revocation via token_version, not per-token JTI tracking); acceptable at this scale, revisit with Redis.
