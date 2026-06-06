# ComEd Price Pulse — Claude Code Handoff Package

Everything Claude Code needs to update the existing app with the new features. Drop these into your repo, then point Claude Code at them.

## What's inside
```
CLAUDE.md                         → repo ROOT (Claude Code reads this automatically)
docs/
  PRD.md                          → all requirements, priorities, roadmap, TODO
  DESIGN_SYSTEM.md                → color themes/tokens, typography, components  ← your "design" doc
  forecast-integration-spec.md    → forecast architecture, DB, model, API
  IMPLEMENTATION_PLAN.md          → ordered Phase-1 tasks (start here for build work)
components/
  ForecastTab.jsx                 → ready-to-wire forecast component
design-mockups/
  01-dashboard-redesign.html      → 5-tab dashboard (no-scroll)
  02-forecast-view.html           → probabilistic forecast view
  03-mobile-app.html              → mobile app + widget/lockscreen/watch
  04-theme-picker.html            → 3 themes, live compare
```

## How to use it
1. Copy `CLAUDE.md` to your repo root. Put `docs/`, `components/`, and `design-mockups/` in the repo (e.g. under `/docs` and `/src/components`). Adjust the paths noted in `CLAUDE.md` to match reality.
2. Open the mockups in a browser to see the target UI.
3. Start Claude Code in the repo and use the first prompt below.

## First prompt to Claude Code
> Read CLAUDE.md and the files in docs/. Confirm you understand the stack and design rules. Then start IMPLEMENTATION_PLAN.md **Task 1** (apply the Voltaic theme tokens + light/dark switch). Show me the diff before applying, then we'll go task by task.

## Decisions still open (confirm before/early in build)
- **Theme:** default is Voltaic; Grid and Volt tokens are included — confirm your pick.
- **Historical prices:** do you already store real-time + day-ahead history? Gates forecast training (else `gridstatus` backfill is first).
- **Mobile:** iOS-first or Android-first for the store app (Capacitor builds both).
- **Capacity charge:** do you have the user's PLC, or estimate coincident-peak exposure from Green Button + PJM peaks?

## Notes
- Forecast trains offline (home lab), serves light on Render — see CLAUDE.md.
- Never use MAPE for price error (negative prices) — MAE/RMSE/sMAPE/pinball.
- Keep the price-tier color scale; only the brand accent changes.
