# CLAUDE.md — ComEd Price Pulse

> Root context for Claude Code. Read this first on every task. Adapt paths to the actual repo layout.

## What this is
A web + mobile app for **ComEd Hourly Pricing** customers in Illinois. It shows the live real-time electricity price, forecasts where the price is going, and tells users exactly when to use power (and alerts/automates around it). Live at pricealert.s2rdlabs.com.

## Stack
- **Backend:** FastAPI + PostgreSQL, deployed on **Render**.
- **Frontend:** React (existing dashboard uses Chart.js).
- **Data:** ComEd public hourly-pricing API (5-min + hour-avg, no auth); Green Button ESPI XML ingestion; PJM Data Miner 2 (day-ahead LMP, load forecast) via `gridstatus`; Open-Meteo (Chicago weather).
- **Alerts:** Email, Telegram, WhatsApp (Twilio) — adding web push.
- **Mobile:** PWA now → **Capacitor** wrapper for iOS/Android (reuses the React code; do NOT rewrite in React Native).

## Where things live (fill in actual paths)
- API routes: `app/api/…`  · services: `app/services/…`  · models/migrations: `app/models`, Alembic
- React components: `src/components/…`  · charts use Chart.js
- ML (offline, runs on home lab, not Render): `ml/…`

## Key docs (in /docs)
- `PRD.md` — all requirements, priorities (P0/P1/P2), 3-phase roadmap, TODO.
- `DESIGN_SYSTEM.md` — color themes/tokens, typography, components. **Apply these tokens; do not invent colors.**
- `forecast-integration-spec.md` — forecast architecture, DB schema, model, API, training.
- `IMPLEMENTATION_PLAN.md` — ordered Phase-1 task list. Start here for build work.
- `/design-mockups/*.html` — visual reference for the target UI (open in a browser).
- `/components/ForecastTab.jsx` — ready-to-wire forecast component.

## Design rules (non-negotiable)
1. **Price-tier scale (Negative→Cheap→Moderate→High→Spike) is semantic** — keep those colors consistent everywhere; pair with text/icon, never color alone (accessibility).
2. **Brand accent ≠ any tier color.** Active theme is **Voltaic** (electric blue); tokens for all themes are in `DESIGN_SYSTEM.md`. No purple/indigo.
3. Support **light (default) + dark**. Typography: Bricolage Grotesque (display) + Hanken Grotesk (UI).
4. Mobile-first layouts use a **bottom tab nav**; desktop uses top tabs.

## Forecast rules
- Train **offline** (home lab); Render only **serves**. An hourly job writes the 48h forecast to a `price_forecast` table; the API reads the table (no model on the request path — keeps Render cheap).
- Forecast is **probabilistic** (P10/P50/P90 + spike probability), anchored on PJM day-ahead and corrected via the day-ahead→real-time spread.
- **Never use MAPE** (prices go negative). Use MAE / RMSE / sMAPE / pinball loss, always reported against the naive day-ahead baseline.

## Coding standards (owner preferences)
- Follow best design + coding standards; keep changes scoped and reviewable.
- **Always review the relevant doc before coding** so work doesn't drift from the requirement.
- **Document TODOs** for pending features and check items off in `PRD.md` / `IMPLEMENTATION_PLAN.md` as they ship.
- Test a feature before considering it done; review the code after it tests successfully.
- If anything is ambiguous, ask before building.

## Run / test (fill in)
- Backend: `uvicorn app.main:app --reload`  · Tests: `pytest`
- Frontend: `npm run dev`  · Build: `npm run build`
- Migrations: `alembic upgrade head`
