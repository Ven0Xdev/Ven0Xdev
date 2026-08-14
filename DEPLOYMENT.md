# Deploying Nexora to a permanent public URL

This deploys the frontend to **Vercel** (built for Next.js, zero-config, free tier) and the
backend + database to **Railway** (Docker-native, supports the long-running SSE stream and the
background scan worker, managed Postgres in the same place). Both have free tiers that cover this
comfortably. You'll need a GitHub account (you already have one — this repo) and a free account on
each of vercel.com and railway.app.

Your choices from setup: **login required** (`AUTH_REQUIRED=true`) and **synthetic demo data**
(`MARKET_DATA_PROVIDER=mock`, the default — no API key needed). Steps below reflect that.

---

## 1. Backend + database on Railway

1. **New Project → Deploy from GitHub repo** → select `Ven0Xdev/Ven0Xdev`.
2. Railway will ask which directory to build. Add a service, set its **Root Directory** to
   `backend`. It auto-detects `backend/Dockerfile` and builds from it — no extra config needed.
3. **Add a database**: in the same project, "+ New" → "Database" → "PostgreSQL". Railway
   provisions it and exposes a `DATABASE_URL`-shaped connection automatically — copy the
   `postgresql://` value it shows you (you'll adapt it below; SQLAlchemy needs the `+psycopg`
   driver marker that Railway's raw value won't include).
4. On the **backend service**, open its Variables tab and set:

   ```
   ENVIRONMENT=production
   DEBUG=false
   SECRET_KEY=<paste output of: python3 -c "import secrets; print(secrets.token_urlsafe(48))">
   DATABASE_URL=postgresql+psycopg://<user>:<password>@<host>:<port>/<database>
   USE_SQLITE_FALLBACK=false
   AUTH_REQUIRED=true
   ALLOW_REGISTRATION=true
   RATE_LIMIT_ENABLED=true
   MARKET_DATA_PROVIDER=mock
   ALLOW_SYNTHETIC_DATA=true
   CHAT_BACKEND=template
   CORS_ORIGINS=["http://localhost:3000"]
   ```

   `ALLOW_SYNTHETIC_DATA=true` is required here because `MARKET_DATA_PROVIDER=mock`
   is a synthetic demo data source — the backend refuses to boot in
   `ENVIRONMENT=production` with a synthetic provider unless this is set, so a real
   deployment can never silently end up serving fabricated prices without the
   operator explicitly acknowledging it. Omit both `MARKET_DATA_PROVIDER=mock` and
   `ALLOW_SYNTHETIC_DATA=true` (and set `TWELVE_DATA_API_KEY`/`ALPHA_VANTAGE_API_KEY`
   instead, with `MARKET_DATA_PROVIDER=twelvedata`) for a deployment backed by real
   market data.

   (Leave `CORS_ORIGINS` as-is for now — you'll update it to your real Vercel URL in step 3, since
   you don't have that URL yet.) Take `DATABASE_URL`'s pieces from the Postgres service Railway
   just created (click it → "Connect" tab shows each part).

5. Deploy. Railway builds the Docker image and starts the container; watch the deploy logs for
   `Uvicorn running on http://0.0.0.0:$PORT` and `Application startup complete`. The app creates
   its own database tables on first boot — no manual migration step needed for a fresh database.
6. Under **Settings → Networking**, click **Generate Domain** to get a public HTTPS URL, e.g.
   `https://nexora-backend-production.up.railway.app`. Copy it.
7. Verify: `curl https://<your-railway-domain>/health` should return
   `{"status":"ok","environment":"production","data_provider":"mock"}`.

### Optional: the background scan worker

The repo's `docker-compose.yml` also runs a `scanner` service (continuous universe scanning). On
Railway, add a second service from the same repo/root directory (`backend`), but override its
**Start Command** to `python -m app.workers.scan_scheduler` instead of the Dockerfile's default,
and give it the same environment variables as the API service. This is optional — the API works
fully without it; opportunities are just scored on demand instead of on a schedule.

---

## 2. Frontend on Vercel

1. **Add New Project** → import `Ven0Xdev/Ven0Xdev` from GitHub.
2. Set **Root Directory** to `frontend`. Vercel auto-detects Next.js — no other build config needed.
3. Under **Environment Variables**, add:

   ```
   NEXT_PUBLIC_API_URL=https://<your-railway-domain>/api/v1
   ```

   (the backend URL from step 1.6, with `/api/v1` appended — that's the prefix every API route
   in this app is mounted under).
4. Deploy. Vercel gives you a permanent URL immediately, e.g. `https://nexora.vercel.app` — that's
   the link you open in your browser and share. It also gets HTTPS automatically.

---

## 3. Connect the two: update CORS

Go back to the **Railway backend service** → Variables → update:

```
CORS_ORIGINS=["https://nexora.vercel.app"]
```

Use your *exact* Vercel URL (no trailing slash), as a JSON array — that exact syntax matters, it's
parsed as JSON. Redeploy the backend service for the change to take effect.

---

## 4. First login — you become the admin

1. Open your Vercel URL. You'll land on `/login` (nothing works until you sign in — that's
   `AUTH_REQUIRED=true` doing its job).
2. Click **Create one** → register with your email and a password (10+ characters). **The first
   account ever registered on a fresh database automatically becomes the operator/admin account** —
   this is deliberate, so there's no separate bootstrap step.
3. You're now signed in and looking at the real dashboard.
4. **Immediately after this**, go back to Railway → backend service → Variables and set:

   ```
   ALLOW_REGISTRATION=false
   ```

   Redeploy. This closes the public sign-up form so strangers can't create their own accounts on
   your site — without this, "login required" doesn't actually protect anything, since anyone
   could just register themselves an account.

---

## 5. Verification checklist

- [ ] `https://<railway-domain>/health` → 200, `"data_provider":"mock"`
- [ ] Vercel URL loads → redirects to `/login` when logged out
- [ ] Register → lands on dashboard, sidebar shows your session
- [ ] A stock page's live chart shows a connection badge (LIVE/SYNTHETIC FEED) — confirms the
      real-time SSE stream is reaching the browser through the deployed backend
- [ ] Log out (sidebar icon) → back to `/login`, protected pages redirect again
- [ ] `ALLOW_REGISTRATION=false` set after you've created your account

## What's real vs. synthetic on this deployment

Per your setup choice, `MARKET_DATA_PROVIDER=mock` — **every price, chart, and analysis number is
clearly labeled "SYNTHETIC DATA"** throughout the UI. Nothing is silently faked. To connect real
market data later, set `MARKET_DATA_PROVIDER=finnhub` and `FINNHUB_API_KEY=<a key you generate
yourself at finnhub.io>` on the Railway backend service — never reuse a key that's ever been pasted
in a chat or committed anywhere, treat any exposed key as compromised.

## Cost note

Both Vercel and Railway have free tiers; Railway's free tier is usage-capped (a monthly credit,
not unlimited) and the Postgres database counts against it. `CHAT_BACKEND=template` (the default)
makes zero external API calls, so there's no Anthropic billing exposure regardless of traffic.
