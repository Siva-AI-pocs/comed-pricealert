# IMPLEMENTATION_PLAN.md — Phase 1

Ordered, concrete tasks for Claude Code. Each is independently shippable. Check items off here and in `PRD.md` as they land. Read the referenced doc before starting each task.

## Conventions
- Branch per task; small reviewable PRs.
- Add/extend tests; don't mark done until tested.
- Apply `DESIGN_SYSTEM.md` tokens for any UI.

---

### Task 1 — Apply the new theme (UI foundation)
- Add the **Voltaic** token block from `DESIGN_SYSTEM.md` to global CSS (or Tailwind config); wire a `data-theme` light/dark switch with persisted preference (React state/context — **no localStorage in artifacts**, but fine in the real app).
- Replace existing purple/indigo accent usages with `var(--accent)`.
- *Done when:* dashboard renders in Voltaic light + dark; tier colors unchanged.

### Task 2 — Day-ahead price ingest + display
- Backend: fetch PJM day-ahead hourly LMP (ComEd zone) via `gridstatus`; store it; expose in the price endpoint.
- Frontend: show day-ahead alongside real-time in the Now view (see mockup 01/03).
- *Done when:* current + day-ahead both visible; refreshes hourly.

### Task 3 — Negative-price alert
- Add a negative-price trigger (5-min price ≤ 0) to the alert engine across Email/Telegram/WhatsApp.
- Frontend: add the toggle in Alerts (mockup 03).
- *Done when:* a simulated ≤0 price fires on all enabled channels.

### Task 4 — Forecast wiring (surface v1)
- Implement `price_forecast` + `price_actual` tables (Alembic) per `forecast-integration-spec.md`.
- Add `GET /api/forecast?hours=48` (reads table) and `GET /api/forecast/accuracy`.
- Add the **Forecast** tab using `/components/ForecastTab.jsx` (`<ForecastTab apiUrl="/api/forecast" />`); set `theme` to match.
- v1 model can be the LEAR/baseline from the spec; the component already degrades to preview data until rows exist.
- *Done when:* tab renders live forecast from the API; preview banner gone.

### Task 5 — Automation: outbound webhook + IFTTT
- Backend: webhook config per user; POST a JSON event on threshold/forecast triggers.
- Publish events compatible with **IFTTT Webhooks**.
- Frontend: Automation section in Alerts (mockup 03).
- *Done when:* a price event delivers to a test webhook + an IFTTT applet.

### Task 6 — PWA + push
- Add manifest + service worker; make installable; wire web push into the alert engine as a channel.
- Mobile layout: bottom tab nav (Now / Forecast / Alerts / More).
- *Done when:* installable on phone; push alert received; mobile nav works.

---

## Phase 2 (next, summarized — see PRD)
Forecast v2 (LightGBM quantile + spike prob + accuracy badge) · coincident-peak day predictor + alert · home-screen widget · Capacitor iOS/Android builds.

## Phase 3
Whole-home load-shift recommendations · HomeKit / Apple Watch · savings history · multi-utility (Ameren).

## Suggested first prompt to Claude Code
> "Read CLAUDE.md and docs/. Start with IMPLEMENTATION_PLAN.md Task 1 (apply Voltaic theme tokens + light/dark). Show me the diff before applying. Then we'll proceed task by task."
