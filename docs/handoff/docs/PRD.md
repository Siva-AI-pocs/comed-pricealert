# ComEd Price Pulse — Product Requirements (v1.0)

**Vision:** The smartest way for ComEd Hourly Pricing customers to know *what power costs right now, what it will cost next*, and *exactly when to use it* — on web and mobile.

**Target user:** ComEd Hourly Pricing participants in Illinois (price-sensitive homeowners, EV owners, smart-home users) who want to shift usage to cheap hours and avoid spikes.

**Positioning vs competitors:** ComEd's own tool and the native "Hourly Prices" iOS app show prices and automate devices, but **none forecast better than raw day-ahead, none predict capacity-charge peak days, and none combine whole-home usage with price.** That trio is our edge.

---

## Platforms

| Platform | Approach | Why |
|---|---|---|
| Web (responsive) | existing React + FastAPI on Render | core, already live |
| **Installable PWA** | add manifest + service worker to current React app | push notifications + home-screen install at near-zero cost |
| **iOS + Android app** | **Capacitor** wrapper around the React app | App Store/Play presence, native push, path to widgets/HomeKit — minimal rework |
| Native widgets / Watch | Capacitor plugins (later phase) | match competitor's home-screen widget + Apple Watch complication |

---

## Feature requirements

Priority key: **P0** = ship first / close competitive gaps · **P1** = differentiators · **P2** = moat.

### 1. Live price & status
- **P0** Live 5-min price + current-hour average from ComEd API, refreshed ≤1 min.
- **P0** 7-tier color system (Negative → Cheap → Moderate → High → Spike) used everywhere.
- **P0** Status banner with plain-language guidance ("Cheap — good time to run appliances").
- **P0** Day-ahead price displayed alongside real-time (we don't show this today — ComEd does).
- *Acceptance:* one glance answers "should I use power now?"

### 2. Forecast (the key differentiator)
- **P1** 24–48h probabilistic forecast (P10/P50/P90) of ComEd real-time price.
- **P1** Forecast overlaid against PJM day-ahead so users see the model correcting it.
- **P1** Accuracy badge (MAE + % closer than day-ahead, rolling backtest).
- **P1** "Cheapest window tomorrow" + spike-risk timeline, derived from the forecast.
- *Acceptance:* forecast MAE beats the naive day-ahead baseline on a 30-day backtest; bands calibrated (~80% coverage).
- *Metrics:* MAE / RMSE / sMAPE / pinball loss — **never MAPE** (negative prices).

### 3. Usage & savings (our existing strength — keep)
- **P0** Green Button interval upload, charted against price (re-uploads de-duplicated).
- **P0** Hourly-vs-flat bill comparison + shift-to-cheap savings calculator.
- **P1** Whole-home **load-shift recommendations** ("run dryer 1–4 AM, save ~$X") from forecast + usage — *no competitor pairs these.*

### 4. Alerts
- **P0** Multi-channel: Email, Telegram, WhatsApp (existing) **+ push** (new, via PWA/app).
- **P0** Low-price alert (≤ threshold) and high-price alert (≥ threshold) — existing.
- **P0** **Negative-price alert** ("the grid pays you") — new; trivial + high delight.
- **P1** **Day-ahead / "plan tomorrow" alert** (cheapest hours tomorrow).
- **P1** **Coincident-peak day alert** — warn on likely PJM peak days to cut the capacity charge on future bills. *Almost nobody does this for consumers.*
- *Acceptance:* at least one channel required; per-channel thresholds; quiet hours.

### 5. Automation
- **P0** Outbound **webhook** on threshold/forecast events (universal primitive).
- **P0** **IFTTT** Webhooks integration (publish events → users wire their own applets).
- **P2** Home Assistant forecast endpoint (expose forecast, not just spot price).
- **P2** Native **HomeKit** rules via Capacitor plugin (match iOS competitor).

### 6. Mobile app
- **P0** PWA: installable, offline shell, push notifications.
- **P1** Capacitor iOS + Android builds in App Store / Play.
- **P1** Home-screen **widget** showing current price (color-coded).
- **P2** Apple Watch complication + lock-screen live price.
- *Acceptance:* phone layout uses bottom-tab nav; current price reachable in 0 taps (widget) or 1 tap (app open).

### 7. Account & data
- **P0** Subscription management (channels, thresholds, "send now", remove).
- **P0** Imported meters list (Green Button), delete.
- **P1** Accuracy/savings history ("you saved $X this month vs flat").

---

## Non-functional requirements
- **Cost:** model trains offline (home lab); Render only serves + reads a `price_forecast` table — no heavy compute on request path.
- **Performance:** dashboard interactive < 2s; forecast endpoint reads cached rows.
- **Accessibility:** color tiers paired with text/icons (not color alone); WCAG AA contrast.
- **Theming:** light (default) + dark mode.
- **Privacy:** Green Button data per-user, deletable; clear data-use copy.

---

## Phased roadmap

**Phase 1 — Close the gaps (parity + quick wins)**
Negative-price alert · day-ahead price display · PWA install + push · webhook → IFTTT · forecast v1 surfaced in UI.

**Phase 2 — Differentiate**
Forecast v2 (LightGBM quantile, bands + spike prob + accuracy badge) · coincident-peak day prediction + alert · home-screen widget · Capacitor builds to stores.

**Phase 3 — Moat**
Whole-home load-shift recommendations · Apple Watch / HomeKit · savings history · multi-utility groundwork (Ameren Power Smart Pricing).

---

## Consolidated TODO

- [x] Competitor analysis (US + EU)
- [x] 5/6-tab redesign + Forecast view design + `ForecastTab.jsx`
- [x] Forecast integration spec
- [ ] **P0** Negative-price alert (5-min ≤ 0 trigger) across all channels
- [ ] **P0** Day-ahead price ingest + display
- [ ] **P0** PWA: manifest + service worker + web push
- [ ] **P0** Outbound webhook + IFTTT Webhooks integration
- [ ] **P0** Surface forecast v1 in UI (wire `/api/forecast`)
- [ ] **P1** Forecast v2: gridstatus backfill → LightGBM quantile + spike + accuracy
- [ ] **P1** Coincident-peak day predictor + alert (capacity-charge savings)
- [ ] **P1** Whole-home load-shift recommendations
- [ ] **P1** Capacitor iOS/Android build + home-screen widget
- [ ] **P2** HomeKit rules · Apple Watch complication · Home Assistant endpoint
- [ ] **P2** Savings history · multi-utility (Ameren)

## Open questions
1. iOS-first or Android-first for the store app? (Competitor is iOS-only — iOS-first may be the contested ground.)
2. Do you store historical RT + day-ahead prices yet? (Gates forecast training — if not, gridstatus backfill is task one.)
3. Capacity charge: do we have access to a user's PLC / peak-load contribution, or do we estimate it from Green Button + PJM peak hours?
