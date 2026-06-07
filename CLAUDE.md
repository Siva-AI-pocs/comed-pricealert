# VoltMint — agent guide

FastAPI app that polls ComEd real-time electricity prices, stores history, and
alerts users (Email / Telegram / WhatsApp) when prices cross their threshold.
Hosted free on Render.

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

# Run the background jobs manually (these run as Render cron jobs in prod)
python -m app.jobs.poll             # fetch ComEd prices → DB
python -m app.jobs.notify           # check thresholds → send alerts

# Tests (154 functions). E2E is excluded by default via pytest.ini.
pytest                              # unit + integration, no network, no DB needed
pytest tests/test_e2e.py --browser chromium   # live E2E against Render

# Lint / format
ruff format .                       # apply formatting
ruff check --fix .                  # lint + autofix
```

## Layout

- `app/main.py` — FastAPI app + router wiring; serves `app/static/` (dashboard, privacy, terms).
- `app/api/` — routers: `prices`, `subscriptions`, `auth`, `decision`, `usage`, `internal`
  (`internal` = secret-guarded trigger endpoints for cron-job.org).
- `app/jobs/` — `poll.py` and `notify.py`: standalone entrypoints run by Render cron.
- `app/services/` — business logic: `poller`, `notifier`, `aggregator`, `scheduler`,
  `espi_parser` / `usage_ingest` (ComEd Green Button usage data).
- `app/auth/` — `security.py` (passlib/bcrypt + JWT), `deps.py` (auth dependencies).
- `app/models.py` — SQLAlchemy ORM (`price_5min`, users, subscriptions, …).
- `app/config.py` — pydantic-settings; all values come from env / `.env`.
- `tests/conftest.py` — fixtures; forces in-memory SQLite before app import.

## Conventions & gotchas

- **Config**: every setting in `app/config.py` defaults to empty/sane, so the app and
  tests import with **no env vars**. Real secrets are injected as env vars on Render
  (see `render.yaml`, `sync: false` keys).
- **DB**: SQLite locally (`./data/comed.db`), Postgres on Render. Tests use in-memory
  SQLite with a `StaticPool` — `conftest.py` sets `DATABASE_URL` *before* importing any
  app module, so don't import app code above that line.
- **Dependency pins are load-bearing.** Two prod breakages came from deps:
  `bcrypt` is pinned to `4.0.1` (5.x breaks passlib 1.7.4), and `email-validator` is
  required by pydantic `EmailStr`. CI does a fresh `pip install` + import smoke + pytest
  specifically to catch this class before it reaches Render — keep that green.
- **Background work is cron, not in-process.** Polling (every 5 min) and notifications
  (top of each hour) run as separate Render cron services so they don't depend on the
  web dyno being awake. Free-tier crons can fail silently — missing alerts usually means
  a cron stopped, not an app bug.

## Automation in this repo

- `.claude/settings.json` — PostToolUse hook runs `ruff format` on `.py` files after edits
  (no-ops if ruff isn't installed; `pip install -r requirements-dev.txt` to activate).
- `.github/workflows/ci.yml` — `test` job (blocking) and `lint` job (advisory until the
  repo is fully ruff-formatted).
- `render.yaml` — web service + poller cron + notifier cron + Postgres.
