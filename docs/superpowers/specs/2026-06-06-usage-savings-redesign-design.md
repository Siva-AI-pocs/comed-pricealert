# Usage & Savings — Redesign + Monthly Comparison Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Topic:** Rework the Usage & Savings tab so a user uploads their ComEd usage and sees, in the current UI, how their usage lines up with hourly prices and how much they'd save on ComEd Hourly Pricing + Price Pulse low-price alerts.

## Context

The Usage & Savings feature ("Task D") already exists: Green Button (ESPI XML) upload →
`usage_meters`/`usage_intervals`; a `/api/usage/insights` endpoint whose
`usage_insights.compute_insights()` aligns hourly usage (kWh) with hourly average prices
(`hourly_averages`) and computes a savings summary (`flat_cost`, `actual_cost` = hourly,
`optimized_cost`, `hourly_vs_flat_cents`, `shift_savings_cents`). But:

- `UsageSavingsTab.jsx` still uses **pre-redesign styling** (no `.card`/`.card-h`), unlike
  the redesigned NowTab.
- The analysis window is **hardcoded to 7 days** instead of the uploaded month.
- The flat-rate comparison uses a **fixed** `settings.flat_rate_cents`, not the user's bill.
- There's **no flat-vs-hourly framing** and **no low-price-alert call to action**.
- Re-uploading the same month isn't explicitly handled ("latest wins").
- Hours with **no matching price** are dropped, so an older uploaded month may show little.

### Goal
A user uploads last month's ComEd usage and sees: (1) their usage vs hourly price for that
month, and (2) a savings ladder — what they'd pay on a **flat rate**, on **ComEd Hourly
Pricing**, and on **hourly + Price Pulse alerts** (shifting flexible usage to cheap hours) —
framed for their current plan, with a CTA to set up alerts.

## Requirements (from the owner)

1. Upload ComEd usage (a month). Analyze the **uploaded month**, not a fixed window.
2. Show **usage vs hourly price** for that period (dual-axis chart).
3. Savings comparison framed by the user's current plan (**flat** or **hourly**), showing
   what they could save by switching to hourly and/or using our low-price alerts.
4. **Editable flat rate** (prefilled with the app default ~12.5¢/kWh) for an accurate
   flat-vs-hourly number.
5. **Dedup on upload:** re-uploading the same month replaces the prior data — show the
   latest only, never double-count.
6. **Price fallback:** if we don't have hourly prices for the uploaded month, use the
   current/previous month's prices for the comparison (details below).
7. Match the **current UI/UX** (card system used by NowTab).

## Approach

Reuse the existing `compute_insights()` engine (it already returns the full ladder) with
small additive backend changes; rebuild the tab UI. No new tables. No new "comparison"
endpoint (YAGNI — `/insights` already returns the numbers).

## Backend

### 1. Editable flat rate — `app/api/usage.py` + `usage_insights.py`
`GET /api/usage/insights` gains an optional `flat_rate_cents: float` query param
(`gt=0`, default `settings.flat_rate_cents`). `compute_insights()` accepts `flat_rate_cents`
and uses it for `flat_cost` and the reported `flat_rate_cents`.

### 2. Uploaded-month window — `UsageMeterOut` + `compute_insights()`
- Add `interval_start_utc: datetime | None` and `interval_end_utc: datetime | None`
  (MIN/MAX of the meter's `usage_intervals.start_utc`) to `UsageMeterOut`
  (`app/api/usage.py list_meters` already groups by meter — add the aggregates).
- The frontend derives the overall range across the user's meters and passes `start`/`end`
  (epoch ms) to `/insights`, so the analysis covers the uploaded month and works on revisit.

### 3. Dedup / latest-wins — `app/api/usage.py upload_usage` (+ `usage_ingest.py`)
On upload, for each affected meter, **delete existing `usage_intervals` within the uploaded
date range before inserting the new intervals** (in addition to the existing per-interval
upsert). Net effect: re-uploading a month cleanly replaces it; totals never double-count.
(Verify/lean on the `(meter_id, start_utc)` uniqueness during planning.)

### 4. Price fallback — `usage_insights.compute_insights()`
Today the series only includes hours present in **both** usage and `hourly_averages`. Change
to **price every usage hour**:
- **Exact:** use `hourly_averages` for that timestamp when present.
- **Fallback:** for usage hours with no exact price, use a **price profile** built from the
  most recent ~35 days of `hourly_averages` we *do* have (i.e., current/previous month),
  bucketed by `(is_weekend, hour_of_day)` → average price. A missing hour gets its bucket's
  average. (Hour-of-day is computed in `America/Chicago` to match ComEd's daily price shape.)
- Each hourly row gains `price_estimated: bool` (true when the fallback profile was used) so
  the UI can footnote estimated months.
- If there is **no** price data at all (exact or recent), insights returns empty → UI shows
  the empty state.

The savings math (flat vs hourly vs shift) is unchanged; it just runs over the fully-priced
series.

## Frontend — redesigned `UsageSavingsTab`

Rebuild with the current card system (`.card` / `.card-h` + design tokens), mirroring
NowTab. Sections (each a card):

1. **Upload** — Green Button upload (restyled `UsageUpload`).
2. **Your plan & rate** — a plan toggle **Flat / ComEd Hourly** and an editable
   **flat rate ¢/kWh** input prefilled with the default (~12.5).
3. **Savings (hero)** — tailored headline ("You could save ~$X/mo"):
   - **Flat** users → total potential (switch to hourly + shift).
   - **Hourly** users → shift-only savings (from our alerts).
   The **ladder**: `Flat rate` → `On hourly` (Δ switch) → `Hourly + alerts` (Δ shift), in
   dollars via `format.dollars()`. A **shiftable-% slider** ("How much of your usage is
   flexible?", default 30%). A **"Set up low-price alerts →"** button linking to `/alerts`.
   If any month is price-estimated, a small "*estimated using recent prices" footnote.
4. **Usage vs price** — dual-axis card: kWh bars + hourly-price line for the month
   (`UsageVsPriceChart`, continuous-hour axis like the NowTab hourly fix).
5. **Imported meters** — meters list + the period each covers + delete (`MetersTable`).
6. **Empty state** — when no usage is uploaded, a friendly prompt (not bare text).

### Data flow
On load: `GET /api/usage/meters` → derive `[start, end]` across meters →
`GET /api/usage/insights?start&end&shiftable_pct&flat_rate_cents`. The **plan toggle**
only re-frames the headline (no refetch). Changing the **flat rate** or **slider** refetches
insights (debounced ~400ms). Upload → dedup-replace → reload meters + insights.

## Error handling
Reuse `ApiError`. Inline errors for failed insights/upload; friendly empty state when no
meters; the price-estimated footnote when fallback prices were used.

## Testing

**Backend**
- `compute_insights` honors a custom `flat_rate_cents` (changes `flat_cost`/`hourly_vs_flat`).
- Price fallback: usage hours with no exact `hourly_averages` are priced from the recent
  `(is_weekend, hour_of_day)` profile; `price_estimated=true` for those rows; full month is
  covered.
- Dedup: uploading the same range twice yields the same totals (no doubling); changed values
  on re-upload are reflected (latest wins).
- `UsageMeterOut` exposes `interval_start_utc`/`interval_end_utc`.
- `/insights` passes `flat_rate_cents` through.

**Frontend**
- Tab renders the ladder from mocked `insights` (flat/hourly/optimized + deltas).
- Plan toggle changes the headline without refetching; flat-rate/slider change triggers a
  refetch.
- Empty state when no meters; price-estimated footnote when any row is estimated.
- `UsageVsPriceChart` builds a dual-axis config from `usageVsPriceData`.
- Run frontend tests with `./node_modules/.bin/vitest` (not `npx`).

## Out of scope (YAGNI)
- Bill-total → effective-rate derivation (chose editable rate instead).
- Seeding demo usage data.
- Multi-month history / trends; per-appliance disaggregation; automation.

## Files touched
- `app/schemas.py` — `UsageMeterOut` (+range), `UsageInsightHour` (+`price_estimated`).
- `app/api/usage.py` — `flat_rate_cents` param; meter range aggregates; dedup-replace on upload.
- `app/services/usage_insights.py` — `flat_rate_cents` arg; price-profile fallback; `price_estimated`.
- `frontend/src/api/usage.js` — pass `flat_rate_cents` (+ existing start/end).
- `frontend/src/tabs/UsageSavingsTab.jsx` (+ `.css`) — redesign; plan toggle; ladder; CTA; slider.
- `frontend/src/components/{UsageUpload,MetersTable,UsageVsPriceChart,SavingsSummary}.jsx` (+css) — restyle to cards; SavingsSummary becomes the ladder.
- Tests: `tests/test_usage_insights*.py` / `tests/test_api_usage*.py`; `UsageSavingsTab.test.jsx`, `UsageVsPriceChart` test.
