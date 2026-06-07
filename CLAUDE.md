# VoltMint — agent guide

FastAPI app that polls ComEd real-time electricity prices, stores history, and
alerts users (Email / Telegram / WhatsApp) when prices cross their threshold.
A React (Vite) SPA in `frontend/` is the default UI, served by FastAPI at `/`.

**Deployment:** runs in a local Docker lab and is exposed to the internet via a
Cloudflare tunnel at https://pricealert.s2rdlabs.com/ — see [Deployment](#deployment).
`render.yaml` is retained as an alternative Render config but is **not** the live target.

## Commands

```bash
# Setup (Python 3.11 — see .python-version)
python -m venv venv
source venv/bin/activate            # Linux/macOS
# .\venv\Scripts\activate           # Windows PowerShell
pip install -r requirements.txt
pip install -r requirements-dev.txt # ruff (dev only) — needed for the format-on-edit hook

# Run the web app
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # http://localhost:8000

# Frontend SPA (Vite + React, Node 18). Dev server proxies /api,/auth,/health to uvicorn.
cd frontend && npm ci
npm run dev                         # http://localhost:5173 (talks to uvicorn on :8000)
VITE_BASE=/ npm run build           # build into app/static_spa/ (served at / by FastAPI)
npm test                            # vitest unit tests

# Run the background jobs manually (also run in-process by the web container's scheduler)
python -m app.jobs.poll             # fetch ComEd prices → DB
python -m app.jobs.notify           # check thresholds → send alerts

# Tests. E2E is excluded by default via pytest.ini.
pytest                              # backend unit + integration, no network, no DB needed
cd frontend && npm test             # frontend vitest suite
pytest tests/test_e2e.py --browser chromium   # live E2E against the deployed site

# Lint / format
ruff format .                       # apply formatting (Python)
ruff check --fix .                  # lint + autofix

# Deploy to the local lab (build SPA + image, recreate container)
docker compose up -d --build        # http://localhost:8005 → https://pricealert.s2rdlabs.com/
```

## Layout

- `app/main.py` — FastAPI app + router wiring. Serves the React SPA from `app/static_spa/`
  at `/` (with a root catch-all for client routes; `/app` 301-redirects to `/`), the static
  legal pages `/privacy` `/terms` from `app/static/`, and the Android APK under `/static/`.
- `frontend/` — Vite + React SPA (the default UI). Built output `app/static_spa/` is
  gitignored and produced at deploy time by the Docker frontend stage.
- `app/api/` — routers: `prices`, `subscriptions`, `auth`, `decision`, `usage`, `internal`
  (`internal` = secret-guarded trigger endpoints for cron-job.org).
- `app/jobs/` — `poll.py`, `notify.py`, `forecast.py`: standalone job entrypoints (run
  in-process by the scheduler in the lab; as Render cron services in `render.yaml`).
- `app/services/` — business logic: `poller`, `notifier`, `aggregator`, `scheduler`,
  `espi_parser` / `usage_ingest` (ComEd Green Button usage data).
- `app/auth/` — `security.py` (passlib/bcrypt + JWT), `deps.py` (auth dependencies).
- `app/models.py` — SQLAlchemy ORM (`price_5min`, users, subscriptions, …).
- `app/config.py` — pydantic-settings; all values come from env / `.env`.
- `tests/conftest.py` — fixtures; forces in-memory SQLite before app import.

## Conventions & gotchas

- **Config**: every setting in `app/config.py` defaults to empty/sane, so the app and
  tests import with **no env vars**. Real secrets come from `.env` (lab, via
  `docker-compose.yml`'s `env_file`) or from Render env vars (`render.yaml`, `sync: false`).
- **DB**: SQLite for local dev (`./data/comed.db`), Postgres in deployment (the lab's
  shared Postgres, or Render). Tests use in-memory
  SQLite with a `StaticPool` — `conftest.py` sets `DATABASE_URL` *before* importing any
  app module, so don't import app code above that line.
- **Dependency pins are load-bearing.** Two prod breakages came from deps:
  `bcrypt` is pinned to `4.0.1` (5.x breaks passlib 1.7.4), and `email-validator` is
  required by pydantic `EmailStr`. CI does a fresh `pip install` + import smoke + pytest
  specifically to catch this class before it reaches Render — keep that green.
- **Background work: in-process in the lab, cron on Render.** In the local Docker lab the
  single web container runs poll / notify / forecast / purge via the in-process APScheduler
  (`app/services/scheduler.py`, started from the FastAPI lifespan). On Render these are instead
  separate cron services (`render.yaml`). The `python -m app.jobs.*` entrypoints work either way.

## Deployment

The live deployment is a **local Docker lab**, fronted by a **Cloudflare tunnel** — not
Render. To ship: `git pull` then `docker compose up -d --build` in this directory.

- `Dockerfile` is **multi-stage**: a `node:18-slim` stage runs `VITE_BASE=/ npm run build`
  (Playwright browser download skipped) to produce `app/static_spa/`, then the `python:3.11-slim`
  stage `pip install`s requirements, `COPY app ./app`, and copies the built SPA in **after** that
  (so the gitignored, usually-absent host `app/static_spa/` can't clobber it).
- `docker-compose.yml` — container `comed-pricealert`, host port **8005 → 8000**, joined to the
  external network `sentinelone-portal_s1net`. The Cloudflare tunnel (`cloudflared`, on that same
  network) routes `pricealert.s2rdlabs.com` → the container. Postgres is also on that network;
  real secrets come from `.env` (not committed).
- `.dockerignore` keeps the build context lean (excludes `node_modules`, the host `static_spa`,
  `tests`, `docs`, etc.).
- The prebuilt Android **APK** (`app/static/downloads/voltmint.apk`) ships in the image via
  `COPY app ./app` and is served at `/static/downloads/voltmint.apk` (the SPA "Get the app" link).
- **Releasing the mobile app.** The APK is a Capacitor wrapper around the live
  site, so web changes reach users without a rebuild. To cut a versioned release
  (fresh APK + bumped version shown on the download link), run on a machine with
  the Android SDK: `powershell -ExecutionPolicy Bypass -File scripts/release-app.ps1`
  (add `-Bump minor`/`-Bump major` for bigger releases). It bumps
  `frontend/package.json`, builds a version-stamped APK, and writes
  `app/static/downloads/app-version.json` (the manifest `GetTheApp` reads). Commit
  the three changed files. This is a deliberate local step — the APK cannot be
  built in CI (no Android SDK), so there is no hook/Action for it.
- **Verify a deploy** at both `http://localhost:8005` and `https://pricealert.s2rdlabs.com/`:
  `/` (SPA shell), a client route like `/forecast` (SPA fallback), `/health`, `/api/forecast`,
  the APK, and `/privacy` (real static legal page — kept static for ComEd Green Button compliance).

## Automation in this repo

- `.claude/settings.json` — PostToolUse hook runs `ruff format` on `.py` files after edits
  (no-ops if ruff isn't installed; `pip install -r requirements-dev.txt` to activate).
- `.github/workflows/ci.yml` — `test` job (blocking) and `lint` job (advisory until the
  repo is fully ruff-formatted).
- `render.yaml` — alternative Render config (web + poller/forecast/notifier crons + Postgres);
  retained for reference, not the live deploy target (see [Deployment](#deployment)).
- `Dockerfile` / `docker-compose.yml` / `.dockerignore` — the live local-lab deploy.
