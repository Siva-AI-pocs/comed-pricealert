# Usage & Savings Redesign + Monthly Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Usage & Savings tab so a user uploads their ComEd usage and sees, in the current card UI, their usage vs hourly price and a Flat → Hourly → Hourly+Alerts savings ladder for the uploaded month — with editable flat rate, a price fallback for months we lack prices for, a low-price-alerts CTA, and dedup (latest-wins) on re-upload.

**Architecture:** Reuse the existing `compute_insights()` engine (it already returns the full ladder) with small additive backend changes (price fallback, editable flat rate, meter date range, dedup helper). Rebuild `UsageSavingsTab` to the `.card`/`.card-h` design used by NowTab; turn `SavingsSummary` into the savings ladder. No new tables or endpoints.

**Tech Stack:** FastAPI · SQLAlchemy · Pydantic v2 · pytest/TestClient (in-memory SQLite) · React · Chart.js (behind `charts/chartSetup.js`) · Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-06-usage-savings-redesign-design.md`

**Test commands:**
- Backend: from repo root `env -u PYTHONHOME -u PYTHONPATH ./venv/Scripts/python.exe -m pytest <path> -v`
- Frontend: from `frontend/` `./node_modules/.bin/vitest run <path>` (NOT `npx`).

**Key facts:**
- Config defaults: `flat_rate_cents = 8.5`, `default_shiftable_pct = 0.30` (`app/config.py`).
- Usage tests seed via **direct ORM** inserts of `UsageMeter`/`UsageInterval`/`HourlyAverage` (they avoid the Postgres-only `pg_insert` in `usage_ingest`). `_hour_key` (in `usage_insights.py`) floors to the naive-UTC hour. `COMED_TZ = America/Chicago`.

---

## File Structure
- `app/services/usage_insights.py` — `compute_insights`: add recent-price fallback + `flat_rate_cents` arg + per-hour `price_estimated`.
- `app/schemas.py` — `UsageInsightHour` (+`price_estimated`), `UsageMeterOut` (+`interval_start_utc`/`interval_end_utc`).
- `app/api/usage.py` — `/insights` `flat_rate_cents` query param; `list_meters` MIN/MAX range.
- `app/services/usage_ingest.py` — `_clear_meter_range` helper + call it before the upsert (dedup).
- `frontend/src/components/SavingsSummary.jsx` (+ new `SavingsSummary.css`) — savings ladder + headline + alerts CTA.
- `frontend/src/tabs/UsageSavingsTab.jsx` (+ `UsageSavingsTab.css`) — rebuilt to cards; plan toggle, editable flat rate, slider, period header, empty state.
- Tests: `tests/test_api_usage_insights.py` (extend), `tests/test_usage_ingest.py` (new), `tests/test_api_usage_meters.py` (new); `frontend/src/components/SavingsSummary.test.jsx` (new), `frontend/src/tabs/UsageSavingsTab.test.jsx` (rewrite).

---

## Task 1: Backend — recent-price fallback + `price_estimated`

**Files:** Modify `app/schemas.py`, `app/services/usage_insights.py`; Test `tests/test_api_usage_insights.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_api_usage_insights.py`:

```python
def _seed_old_usage_no_exact_price(db, email="u@test.com"):
    """Usage 60 days ago (no HourlyAverage at those timestamps) + a recent price
    profile covering the same hour-of-day buckets, so the fallback can price it."""
    user = db.query(User).filter(User.email == email).first()
    meter = UsageMeter(user_id=user.id, espi_usage_point_id="UPOLD", service_kind="electricity")
    db.add(meter)
    db.flush()
    old = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=60)).replace(
        minute=0, second=0, microsecond=0, hour=18
    )
    recent = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=3)).replace(
        minute=0, second=0, microsecond=0
    )
    # Old usage: 3 hours.
    for h in range(3):
        db.add(UsageInterval(meter_id=meter.id, start_utc=old + timedelta(hours=h),
                             duration_seconds=3600, wh=1000, source="upload"))
    # Recent profile: a full recent day of prices so every hour-of-day bucket exists.
    for h in range(24):
        db.add(HourlyAverage(hour_utc=recent + timedelta(hours=h), avg_price_cents=7.0, sample_count=12))
    db.commit()
    return old


class TestPriceFallback:
    def test_old_usage_priced_from_recent_profile(self, client, db):
        _register(client)
        old = _seed_old_usage_no_exact_price(db)
        start = int((old.replace(tzinfo=timezone.utc) - timedelta(hours=1)).timestamp() * 1000)
        r = client.get(f"/api/usage/insights?start={start}")
        assert r.status_code == 200
        body = r.json()
        assert len(body["hourly"]) == 3
        assert all(h["price_estimated"] is True for h in body["hourly"])
        assert all(h["price_cents"] == pytest.approx(7.0) for h in body["hourly"])
        assert body["summary"]["actual_cost_cents"] == pytest.approx(21.0)  # 3 kWh * 7¢
```

- [ ] **Step 2: Run — verify it fails**

Run: `env -u PYTHONHOME -u PYTHONPATH ./venv/Scripts/python.exe -m pytest tests/test_api_usage_insights.py::TestPriceFallback -v`
Expected: FAIL — `price_estimated` KeyError / hourly empty (no exact price → currently skipped).

- [ ] **Step 3: Add `price_estimated` to the schema**

In `app/schemas.py`, update `UsageInsightHour`:

```python
class UsageInsightHour(BaseModel):
    hour_utc: datetime
    kwh: float
    price_cents: float
    cost_cents: float
    level: str
    price_estimated: bool = False
```

- [ ] **Step 4: Add the fallback to `compute_insights`**

In `app/services/usage_insights.py`, after the line that builds `price_by_hour` (the
`price_by_hour = {_hour_key(h): p for h, p in price_q.all()}` line), insert a recent-price
profile, then rewrite the aligned-series loop to use exact-or-fallback pricing:

```python
    # Recent-price profile, for usage hours we have no exact price for (e.g. an
    # older uploaded month). Bucket the last 35 days of hourly prices by
    # (is_weekend, hour-of-day) in Central Time and average.
    profile_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=35)
    profile_sum: dict[tuple[bool, int], float] = defaultdict(float)
    profile_cnt: dict[tuple[bool, int], int] = defaultdict(int)
    for h, p in (
        db.query(HourlyAverage.hour_utc, HourlyAverage.avg_price_cents)
        .filter(HourlyAverage.hour_utc >= profile_start)
        .all()
    ):
        ct = _hour_key(h).replace(tzinfo=timezone.utc).astimezone(COMED_TZ)
        profile_sum[(ct.weekday() >= 5, ct.hour)] += p
        profile_cnt[(ct.weekday() >= 5, ct.hour)] += 1

    def _profile_price(hour: datetime) -> float | None:
        ct = hour.replace(tzinfo=timezone.utc).astimezone(COMED_TZ)
        key = (ct.weekday() >= 5, ct.hour)
        n = profile_cnt.get(key, 0)
        return profile_sum[key] / n if n else None
```

Then replace the existing aligned-series loop (the `for hour in sorted(usage_by_hour): if hour not in price_by_hour: continue ...` block) with:

```python
    hourly: list[dict] = []
    for hour in sorted(usage_by_hour):
        estimated = False
        price = price_by_hour.get(hour)
        if price is None:
            price = _profile_price(hour)
            estimated = True
            if price is None:
                continue  # no exact and no recent profile → can't price this hour
        kwh = usage_by_hour[hour]
        hourly.append(
            {
                "hour_utc": hour,
                "kwh": round(kwh, 4),
                "price_cents": round(price, 4),
                "cost_cents": round(kwh * price, 4),
                "level": _classify(price)["level"],
                "price_estimated": estimated,
            }
        )
```

(The savings math below is unchanged — it runs over `hourly` as before.)

- [ ] **Step 5: Run — verify pass + no regressions**

Run: `env -u PYTHONHOME -u PYTHONPATH ./venv/Scripts/python.exe -m pytest tests/test_api_usage_insights.py -v`
Expected: PASS — new `TestPriceFallback` passes; existing tests still pass (`test_empty_overlap_returns_zeroed`: no prices anywhere → profile empty → still empty; `test_cost_flat_and_shift_savings`: exact prices used → numbers unchanged).

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py app/services/usage_insights.py tests/test_api_usage_insights.py
git commit -m "feat(usage): price uploaded hours from a recent hour-of-day profile when exact prices are missing"
```

---

## Task 2: Backend — editable flat rate

**Files:** Modify `app/services/usage_insights.py`, `app/api/usage.py`; Test `tests/test_api_usage_insights.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_api_usage_insights.py` (inside `TestUsageInsights` or as a new class):

```python
class TestCustomFlatRate:
    def test_flat_rate_param_changes_flat_cost(self, client, db):
        _register(client)
        _seed_usage_and_price(db)  # total_kwh = 4, actual = 32¢
        r = client.get("/api/usage/insights?days=7&flat_rate_cents=10")
        assert r.status_code == 200
        s = r.json()["summary"]
        assert s["flat_rate_cents"] == pytest.approx(10.0)
        assert s["flat_cost_cents"] == pytest.approx(40.0)        # 4 kWh * 10¢
        assert s["hourly_vs_flat_cents"] == pytest.approx(8.0)     # 40 - 32
```

- [ ] **Step 2: Run — verify it fails**

Run: `...pytest tests/test_api_usage_insights.py::TestCustomFlatRate -v`
Expected: FAIL — flat_rate stays 8.5 (param ignored).

- [ ] **Step 3: Add `flat_rate_cents` to `compute_insights`**

In `app/services/usage_insights.py`, add the param to the signature:

```python
def compute_insights(
    db: Session,
    user_id: int,
    days: int = 7,
    start: int | None = None,
    end: int | None = None,
    shiftable_pct: float | None = None,
    flat_rate_cents: float | None = None,
) -> dict:
```

Near the top of the body (after the `shiftable_pct` clamp), add:

```python
    if flat_rate_cents is None:
        flat_rate_cents = settings.flat_rate_cents
    flat_rate_cents = max(0.0, float(flat_rate_cents))
```

Replace the flat-cost line `flat_cost = total_kwh * settings.flat_rate_cents` with:

```python
    flat_cost = total_kwh * flat_rate_cents
```

And in the returned summary, change `"flat_rate_cents": settings.flat_rate_cents,` to:

```python
            "flat_rate_cents": round(flat_rate_cents, 4),
```

- [ ] **Step 4: Thread the param through the endpoint**

In `app/api/usage.py`, in `usage_insights(...)`, add the query param and pass it:

```python
    shiftable_pct: float | None = Query(default=None, ge=0.0, le=1.0),
    flat_rate_cents: float | None = Query(default=None, gt=0.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aligned hourly usage-vs-price plus flat-rate and smart-shift savings summary."""
    return compute_insights(
        db,
        current_user.id,
        days=days,
        start=start,
        end=end,
        shiftable_pct=shiftable_pct,
        flat_rate_cents=flat_rate_cents,
    )
```

- [ ] **Step 5: Run — verify pass**

Run: `...pytest tests/test_api_usage_insights.py -v`
Expected: PASS (new + existing; existing `flat_cost = 4 * 8.5 = 34` still holds when no param).

- [ ] **Step 6: Commit**

```bash
git add app/services/usage_insights.py app/api/usage.py tests/test_api_usage_insights.py
git commit -m "feat(usage): editable flat_rate_cents for the flat-vs-hourly comparison"
```

---

## Task 3: Backend — meter date range

**Files:** Modify `app/schemas.py`, `app/api/usage.py`; Test `tests/test_api_usage_meters.py` (new).

- [ ] **Step 1: Write the failing test** — create `tests/test_api_usage_meters.py`:

```python
from datetime import datetime, timedelta, timezone

from app.models import User, UsageInterval, UsageMeter


def _register(client, email="u@test.com", password="origpass1"):
    assert client.post("/auth/register", json={"email": email, "password": password}).status_code == 200


def test_meters_expose_interval_date_range(client, db):
    _register(client)
    user = db.query(User).filter(User.email == "u@test.com").first()
    meter = UsageMeter(user_id=user.id, espi_usage_point_id="UP1", service_kind="electricity")
    db.add(meter)
    db.flush()
    base = datetime(2026, 5, 1, 0, 0)
    for h in range(3):
        db.add(UsageInterval(meter_id=meter.id, start_utc=base + timedelta(hours=h),
                             duration_seconds=3600, wh=1000, source="upload"))
    db.commit()

    r = client.get("/api/usage/meters")
    assert r.status_code == 200
    m = r.json()[0]
    assert m["interval_count"] == 3
    assert m["interval_start_utc"].startswith("2026-05-01T00:00")
    assert m["interval_end_utc"].startswith("2026-05-01T02:00")
```

- [ ] **Step 2: Run — verify it fails**

Run: `...pytest tests/test_api_usage_meters.py -v`
Expected: FAIL — `interval_start_utc` not in response.

- [ ] **Step 3: Add range fields to `UsageMeterOut`**

In `app/schemas.py`, update `UsageMeterOut`:

```python
class UsageMeterOut(BaseModel):
    id: int
    espi_usage_point_id: str
    service_kind: str
    label: str | None
    created_at: datetime
    interval_count: int
    interval_start_utc: datetime | None = None
    interval_end_utc: datetime | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Populate them in `list_meters`**

In `app/api/usage.py` `list_meters`, add MIN/MAX to the query and the constructor:

```python
        db.query(
            UsageMeter.id,
            UsageMeter.espi_usage_point_id,
            UsageMeter.service_kind,
            UsageMeter.label,
            UsageMeter.created_at,
            func.count(UsageInterval.id).label("interval_count"),
            func.min(UsageInterval.start_utc).label("interval_start_utc"),
            func.max(UsageInterval.start_utc).label("interval_end_utc"),
        )
```

and:

```python
        UsageMeterOut(
            id=r.id,
            espi_usage_point_id=r.espi_usage_point_id,
            service_kind=r.service_kind,
            label=r.label,
            created_at=r.created_at,
            interval_count=r.interval_count,
            interval_start_utc=r.interval_start_utc,
            interval_end_utc=r.interval_end_utc,
        )
```

- [ ] **Step 5: Run — verify pass**

Run: `...pytest tests/test_api_usage_meters.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py app/api/usage.py tests/test_api_usage_meters.py
git commit -m "feat(usage): expose each meter's interval date range"
```

---

## Task 4: Backend — dedup (latest-wins) on re-upload

**Files:** Modify `app/services/usage_ingest.py`; Test `tests/test_usage_ingest.py` (new).

- [ ] **Step 1: Write the failing test** — create `tests/test_usage_ingest.py`:

```python
from datetime import datetime, timedelta

from app.models import User, UsageInterval, UsageMeter
from app.services.usage_ingest import _clear_meter_range


def test_clear_meter_range_deletes_only_in_range(db):
    db.add(User(email="x@test.com", hashed_password="x"))
    db.flush()
    user = db.query(User).first()
    meter = UsageMeter(user_id=user.id, espi_usage_point_id="UP1", service_kind="electricity")
    db.add(meter)
    db.flush()
    base = datetime(2026, 5, 1, 0, 0)
    for h in range(5):  # hours 0..4
        db.add(UsageInterval(meter_id=meter.id, start_utc=base + timedelta(hours=h),
                             duration_seconds=3600, wh=1000, source="upload"))
    db.commit()

    # Clear hours 1..3 inclusive.
    deleted = _clear_meter_range(db, meter.id, base + timedelta(hours=1), base + timedelta(hours=3))
    db.commit()
    assert deleted == 3
    remaining = sorted(i.start_utc for i in db.query(UsageInterval).all())
    assert remaining == [base, base + timedelta(hours=4)]
```

- [ ] **Step 2: Run — verify it fails**

Run: `...pytest tests/test_usage_ingest.py -v`
Expected: FAIL — `_clear_meter_range` does not exist.

- [ ] **Step 3: Add the helper and call it before the upsert**

In `app/services/usage_ingest.py`, add the helper (after the imports / before `ingest_intervals`):

```python
def _clear_meter_range(
    db: Session, meter_id: int, start_utc: datetime, end_utc: datetime
) -> int:
    """Delete a meter's intervals within [start_utc, end_utc] so re-uploading the
    same period replaces it (latest-wins) instead of leaving stale rows that would
    double-count when interval boundaries differ between uploads."""
    return (
        db.query(UsageInterval)
        .filter(
            UsageInterval.meter_id == meter_id,
            UsageInterval.start_utc >= start_utc,
            UsageInterval.start_utc <= end_utc,
        )
        .delete(synchronize_session=False)
    )
```

Then in `ingest_intervals`, inside the per-meter loop, compute the meter's range and clear
it **before** the `pg_insert`. Replace the body of the `for usage_point_id, items in
by_point.items():` loop so the clear happens before building/executing `stmt`:

```python
    for usage_point_id, items in by_point.items():
        meter = _get_or_create_meter(db, user_id, usage_point_id)
        meter_ids.append(meter.id)

        starts = [t.start_utc for t in items]
        s_min, s_max = min(starts), max(starts)
        # Latest-wins: drop any existing intervals in this upload's range first.
        _clear_meter_range(db, meter.id, s_min, s_max)

        rows = [
            {
                "meter_id": meter.id,
                "start_utc": t.start_utc,
                "duration_seconds": t.duration_seconds,
                "wh": t.wh,
                "source": source,
            }
            for t in items
        ]
        if not rows:
            continue

        stmt = pg_insert(UsageInterval).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_usage_interval_meter_start",
            set_={
                "duration_seconds": stmt.excluded.duration_seconds,
                "wh": stmt.excluded.wh,
                "source": stmt.excluded.source,
            },
        )
        result = db.execute(stmt)
        total_inserted += result.rowcount or 0

        overall_start = s_min if overall_start is None or s_min < overall_start else overall_start
        overall_end = s_max if overall_end is None or s_max > overall_end else overall_end
```

(The `pg_insert` upsert path is Postgres-only and remains exercised by the live DB, matching the existing code; the SQLite-safe `_clear_meter_range` is unit-tested above.)

- [ ] **Step 4: Run — verify pass**

Run: `...pytest tests/test_usage_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/usage_ingest.py tests/test_usage_ingest.py
git commit -m "feat(usage): clear a meter's range before insert so re-uploads replace (latest-wins)"
```

---

## Task 5: Frontend — savings ladder (`SavingsSummary`)

**Files:** Rewrite `frontend/src/components/SavingsSummary.jsx`; Create `frontend/src/components/SavingsSummary.css`; Test `frontend/src/components/SavingsSummary.test.jsx` (new).

- [ ] **Step 1: Write the failing test** — create `frontend/src/components/SavingsSummary.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SavingsSummary from "./SavingsSummary.jsx";

const summary = {
  total_kwh: 384,
  actual_cost_cents: 4120,        // on hourly
  flat_cost_cents: 4810,          // flat
  flat_rate_cents: 8.5,
  hourly_vs_flat_cents: 690,      // switch delta
  optimized_cost_cents: 2530,     // hourly + alerts
  shift_savings_cents: 1590,      // shift delta
  shiftable_pct: 0.3,
};

function renderLadder(plan) {
  return render(
    <MemoryRouter><SavingsSummary summary={summary} plan={plan} /></MemoryRouter>,
  );
}

describe("SavingsSummary ladder", () => {
  it("shows all three costs and both deltas", () => {
    renderLadder("flat");
    expect(screen.getByText("$48.10")).toBeInTheDocument(); // flat
    expect(screen.getByText("$41.20")).toBeInTheDocument(); // hourly
    expect(screen.getByText("$25.30")).toBeInTheDocument(); // optimized
    expect(screen.getByText(/\$6\.90/)).toBeInTheDocument();
    expect(screen.getByText(/\$15\.90/)).toBeInTheDocument();
  });

  it("headline for a flat-rate user = flat - optimized (total potential)", () => {
    renderLadder("flat");
    // 4810 - 2530 = 2280 -> $22.80
    expect(screen.getByText("$22.80")).toBeInTheDocument();
  });

  it("headline for an hourly user = shift savings only", () => {
    renderLadder("hourly");
    expect(screen.getByText("$15.90")).toBeInTheDocument();
  });

  it("links to the alerts page", () => {
    renderLadder("flat");
    expect(screen.getByRole("link", { name: /low-price alerts/i })).toHaveAttribute("href", "/alerts");
  });

  it("renders nothing without a summary", () => {
    const { container } = render(<MemoryRouter><SavingsSummary summary={null} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run (from `frontend/`): `./node_modules/.bin/vitest run src/components/SavingsSummary.test.jsx`
Expected: FAIL — current `SavingsSummary` renders the old stat cards (no headline/ladder).

- [ ] **Step 3: Rewrite the component** — replace `frontend/src/components/SavingsSummary.jsx`:

```jsx
import { Link } from "react-router-dom";
import { dollars } from "../format.js";
import "./SavingsSummary.css";

/**
 * Savings ladder: Flat rate -> On hourly -> Hourly + alerts, with the switch and
 * shift deltas. The headline is tailored to the user's current `plan`: a flat-rate
 * user sees their total potential (flat -> optimized); an hourly user sees the
 * shift-only savings our low-price alerts unlock.
 */
export default function SavingsSummary({ summary, plan = "flat" }) {
  if (!summary) return null;
  const flat = summary.flat_cost_cents;
  const hourly = summary.actual_cost_cents;
  const optimized = summary.optimized_cost_cents;
  const switchDelta = summary.hourly_vs_flat_cents; // flat - hourly
  const shiftDelta = summary.shift_savings_cents; // hourly - optimized
  const headline = plan === "hourly" ? shiftDelta : flat - optimized;

  const rows = [
    { key: "flat", label: "Flat rate", value: flat, delta: 0, note: "" },
    { key: "hourly", label: "On ComEd hourly", value: hourly, delta: switchDelta, note: "switch" },
    { key: "opt", label: "Hourly + alerts", value: optimized, delta: shiftDelta, note: "shift" },
  ];

  return (
    <div className="savings">
      <div className="savings-headline">
        You could save <strong>{dollars(Math.max(0, headline))}</strong>
        <span className="savings-headline-sub">
          {plan === "hourly" ? " with our low-price alerts" : " on hourly pricing + alerts"}
        </span>
      </div>
      <div className="savings-ladder" role="table" aria-label="Savings comparison">
        {rows.map((r) => (
          <div className={`savings-row${r.key === "opt" ? " best" : ""}`} key={r.key} role="row">
            <span className="savings-row-label">{r.label}</span>
            <span className="savings-row-value">{dollars(r.value)}</span>
            <span className="savings-row-delta">
              {r.delta > 0 ? `↓ ${dollars(r.delta)} (${r.note})` : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="savings-note">
        Based on {Math.round(summary.total_kwh)} kWh,{" "}
        {Math.round((summary.shiftable_pct || 0) * 100)}% assumed shiftable.
      </p>
      <Link className="savings-cta" to="/alerts">
        Set up low-price alerts →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Create the stylesheet** — create `frontend/src/components/SavingsSummary.css`:

```css
.savings { display: flex; flex-direction: column; gap: 12px; }
.savings-headline { font-size: 16px; color: var(--dim); }
.savings-headline strong {
  font-family: "Bricolage Grotesque", sans-serif;
  font-size: 26px;
  color: var(--cheap);
  letter-spacing: -0.02em;
  margin: 0 4px;
}
.savings-headline-sub { color: var(--faint); font-size: 13px; }
.savings-ladder { display: flex; flex-direction: column; gap: 6px; }
.savings-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: baseline;
  gap: 12px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.savings-row.best { border-color: var(--accent); background: var(--accent-soft); }
.savings-row-label { color: var(--txt); font-weight: 600; }
.savings-row-value {
  font-family: "Bricolage Grotesque", sans-serif;
  font-weight: 800;
  font-size: 18px;
}
.savings-row-delta { color: var(--cheap); font-weight: 700; font-size: 13px; min-width: 96px; text-align: right; }
.savings-note { color: var(--faint); font-size: 12.5px; margin: 0; }
.savings-cta {
  align-self: flex-start;
  text-decoration: none;
  font-weight: 700;
  font-size: 14px;
  color: var(--on-accent);
  background: linear-gradient(145deg, var(--accent), var(--accent2));
  padding: 10px 16px;
  border-radius: 11px;
  box-shadow: 0 8px 18px -8px var(--accent);
}
```

- [ ] **Step 5: Run — verify pass**

Run: `./node_modules/.bin/vitest run src/components/SavingsSummary.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SavingsSummary.jsx frontend/src/components/SavingsSummary.css frontend/src/components/SavingsSummary.test.jsx
git commit -m "feat(usage): savings ladder (flat -> hourly -> alerts) with plan-aware headline + CTA"
```

---

## Task 6: Frontend — rebuild `UsageSavingsTab` (current card UI)

**Files:** Rewrite `frontend/src/tabs/UsageSavingsTab.jsx` + `frontend/src/tabs/UsageSavingsTab.css`; Rewrite test `frontend/src/tabs/UsageSavingsTab.test.jsx`.

- [ ] **Step 1: Write the failing test** — replace `frontend/src/tabs/UsageSavingsTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";

// Mock Chart.js (no canvas) and the usage API.
vi.mock("../charts/chartSetup.js", () => ({ Chart: vi.fn(() => ({ destroy: vi.fn() })) }));
vi.mock("../api/usage.js", () => ({
  usageApi: {
    meters: vi.fn(),
    insights: vi.fn(),
    deleteMeter: vi.fn().mockResolvedValue({}),
    upload: vi.fn(),
  },
}));
import { usageApi } from "../api/usage.js";
import UsageSavingsTab from "./UsageSavingsTab.jsx";

const SUMMARY = {
  total_kwh: 384, actual_cost_cents: 4120, flat_cost_cents: 4810, flat_rate_cents: 8.5,
  hourly_vs_flat_cents: 690, optimized_cost_cents: 2530, shift_savings_cents: 1590,
  shiftable_pct: 0.3, days: 30,
};
const HOURLY = [{ hour_utc: "2026-05-01T00:00:00", kwh: 1.2, price_cents: 6, cost_cents: 7.2, level: "cheap", price_estimated: false }];

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = () => ({});
});

describe("UsageSavingsTab", () => {
  it("shows the empty state when no meters are uploaded", async () => {
    usageApi.meters.mockResolvedValue([]);
    usageApi.insights.mockResolvedValue({ hourly: [], summary: { ...SUMMARY, total_kwh: 0 } });
    renderWithProviders(<UsageSavingsTab />, { authed: true });
    expect(await screen.findByText(/upload your comed usage/i)).toBeInTheDocument();
  });

  it("renders the savings ladder + chart after data loads", async () => {
    usageApi.meters.mockResolvedValue([
      { id: 1, espi_usage_point_id: "UP1", service_kind: "electricity", label: null,
        created_at: "2026-05-31T00:00:00", interval_count: 720,
        interval_start_utc: "2026-05-01T00:00:00", interval_end_utc: "2026-05-31T23:00:00" },
    ]);
    usageApi.insights.mockResolvedValue({ hourly: HOURLY, summary: SUMMARY });
    renderWithProviders(<UsageSavingsTab />, { authed: true });
    expect(await screen.findByText("$48.10")).toBeInTheDocument(); // flat row
    expect(screen.getByText("$25.30")).toBeInTheDocument();        // optimized row
    // insights was called with the meter's date range.
    await waitFor(() => expect(usageApi.insights).toHaveBeenCalled());
    const params = usageApi.insights.mock.calls.at(-1)[0];
    expect(params.start).toBeTypeOf("number");
    expect(params.end).toBeTypeOf("number");
  });

  it("switching the plan toggle re-frames the headline without refetching", async () => {
    const user = userEvent.setup();
    usageApi.meters.mockResolvedValue([
      { id: 1, espi_usage_point_id: "UP1", service_kind: "electricity", label: null,
        created_at: "2026-05-31T00:00:00", interval_count: 720,
        interval_start_utc: "2026-05-01T00:00:00", interval_end_utc: "2026-05-31T23:00:00" },
    ]);
    usageApi.insights.mockResolvedValue({ hourly: HOURLY, summary: SUMMARY });
    renderWithProviders(<UsageSavingsTab />, { authed: true });
    await screen.findByText("$48.10");
    const callsBefore = usageApi.insights.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /hourly/i }));
    expect(screen.getByText("$15.90")).toBeInTheDocument(); // hourly headline = shift savings
    expect(usageApi.insights.mock.calls.length).toBe(callsBefore); // no refetch
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `./node_modules/.bin/vitest run src/tabs/UsageSavingsTab.test.jsx`
Expected: FAIL — current tab has no plan toggle / empty-state copy / range-param wiring.

- [ ] **Step 3: Rebuild the tab** — replace `frontend/src/tabs/UsageSavingsTab.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usageApi } from "../api/usage.js";
import UsageUpload from "../components/UsageUpload.jsx";
import MetersTable from "../components/MetersTable.jsx";
import UsageVsPriceChart from "../components/UsageVsPriceChart.jsx";
import SavingsSummary from "../components/SavingsSummary.jsx";
import "./UsageSavingsTab.css";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

// Overall [start, end] epoch-ms across the user's meters (the uploaded period).
function meterRange(meters) {
  const starts = meters.map((m) => m.interval_start_utc).filter(Boolean).map((d) => new Date(d).getTime());
  const ends = meters.map((m) => m.interval_end_utc).filter(Boolean).map((d) => new Date(d).getTime());
  if (!starts.length || !ends.length) return null;
  return { start: Math.min(...starts), end: Math.max(...ends) };
}

export default function UsageSavingsTab() {
  const [meters, setMeters] = useState([]);
  const [insights, setInsights] = useState(null);
  const [plan, setPlan] = useState("flat"); // "flat" | "hourly"
  const [shiftPct, setShiftPct] = useState(30); // 0..100
  const [flatRate, setFlatRate] = useState(8.5); // ¢/kWh
  const [error, setError] = useState("");
  const debounce = useRef(null);

  const range = useMemo(() => meterRange(meters), [meters]);
  const hasUsage = meters.some((m) => (m.interval_count || 0) > 0);

  const loadMeters = useCallback(async () => {
    try {
      setMeters(await usageApi.meters());
    } catch {
      /* ignore */
    }
  }, []);

  const loadInsights = useCallback(
    async (r, pct, rate) => {
      try {
        const params = { shiftable_pct: pct / 100, flat_rate_cents: rate };
        if (r) {
          params.start = r.start;
          params.end = r.end;
        } else {
          params.days = 35;
        }
        const data = await usageApi.insights(params);
        setInsights(data);
        // First load: adopt the backend's flat-rate default into the input.
        if (data?.summary?.flat_rate_cents != null) {
          setFlatRate((cur) => (cur === 8.5 ? data.summary.flat_rate_cents : cur));
        }
        setError("");
      } catch {
        setError("Couldn't load usage insights.");
      }
    },
    [],
  );

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  // Refetch insights when the window, slider, or flat rate change (debounced).
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => loadInsights(range, shiftPct, flatRate), 350);
    return () => clearTimeout(debounce.current);
  }, [range, shiftPct, flatRate, loadInsights]);

  async function handleDelete(id) {
    try {
      await usageApi.deleteMeter(id);
    } catch {
      /* ignore */
    }
    loadMeters();
  }

  const period =
    range && hasUsage
      ? `${fmtDate(new Date(range.start).toISOString())} – ${fmtDate(new Date(range.end).toISOString())}`
      : "";

  return (
    <section data-testid="tab-usage" className="usage-tab">
      <h1 className="usage-h1">Usage &amp; Savings</h1>

      <div className="card">
        <div className="card-h">
          <h3>Upload your ComEd usage</h3>
        </div>
        <p className="usage-sub">
          Download a "Green Button" file from your ComEd account, then upload it here.
        </p>
        <UsageUpload onUploaded={loadMeters} />
      </div>

      {!hasUsage ? (
        <div className="card usage-empty">
          <p>Upload your ComEd usage to see how it lines up with hourly prices and how much you could save.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-h">
              <h3>Your savings {period && <span className="faint">· {period}</span>}</h3>
              <div className="seg" role="group" aria-label="Your current plan">
                <button type="button" className={plan === "flat" ? "on" : ""} aria-pressed={plan === "flat"} onClick={() => setPlan("flat")}>Flat</button>
                <button type="button" className={plan === "hourly" ? "on" : ""} aria-pressed={plan === "hourly"} onClick={() => setPlan("hourly")}>Hourly</button>
              </div>
            </div>

            <label className="usage-field">
              Your flat rate
              <span>
                <input type="number" min="1" max="40" step="0.1" value={flatRate}
                  aria-label="Flat rate in cents per kWh"
                  onChange={(e) => setFlatRate(Number(e.target.value) || 0)} /> ¢/kWh
              </span>
            </label>

            <SavingsSummary summary={insights?.summary} plan={plan} />

            <label className="usage-field shift">
              How much of your usage is flexible? <strong>{shiftPct}%</strong>
              <input type="range" min="0" max="100" step="5" value={shiftPct}
                aria-label="Shiftable usage percent"
                onChange={(e) => setShiftPct(Number(e.target.value))} />
            </label>

            {insights?.hourly?.some((h) => h.price_estimated) && (
              <p className="usage-note">* Some hours use recent prices (we don't have exact prices for that month).</p>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Your usage vs price</h3>
            </div>
            {insights?.hourly?.length ? (
              <UsageVsPriceChart hourly={insights.hourly} />
            ) : (
              <p className="faint">No overlapping usage and price data yet.</p>
            )}
          </div>
        </>
      )}

      <div className="card">
        <div className="card-h">
          <h3>Imported meters</h3>
        </div>
        <MetersTable meters={meters} onDelete={handleDelete} />
      </div>

      {error && <p role="alert" style={{ color: "var(--spike)" }}>{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Create the stylesheet** — create `frontend/src/tabs/UsageSavingsTab.css`:

```css
.usage-tab { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
.usage-h1 { font-family: "Bricolage Grotesque", sans-serif; font-size: 24px; letter-spacing: -0.02em; margin: 4px 0 0; }
.usage-sub { color: var(--dim); font-size: 13.5px; margin: 0 0 12px; }
.usage-empty p { color: var(--dim); margin: 0; }
.usage-field {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-size: 14px; font-weight: 600; color: var(--txt); margin: 12px 0;
}
.usage-field input[type="number"] {
  width: 78px; text-align: right; font: inherit; padding: 7px 9px;
  border: 1px solid var(--line); border-radius: 9px; background: var(--card-2); color: var(--txt);
}
.usage-field.shift { flex-direction: column; align-items: stretch; gap: 6px; }
.usage-field.shift input[type="range"] { width: 100%; accent-color: var(--accent); }
.usage-note { color: var(--faint); font-size: 12px; margin: 6px 0 0; }
```

- [ ] **Step 5: Run — verify pass**

Run: `./node_modules/.bin/vitest run src/tabs/UsageSavingsTab.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the related frontend suites (no regressions)**

Run: `./node_modules/.bin/vitest run src/tabs/UsageSavingsTab.test.jsx src/components/SavingsSummary.test.jsx src/components/AppShell.test.jsx`
Expected: all pass. (`UsageUpload`, `MetersTable`, `UsageVsPriceChart` are reused unchanged and render inside the new cards.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/tabs/UsageSavingsTab.jsx frontend/src/tabs/UsageSavingsTab.css frontend/src/tabs/UsageSavingsTab.test.jsx
git commit -m "feat(usage): rebuild Usage & Savings tab in the card UI (plan toggle, editable flat rate, ladder, period, empty state)"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite** — `env -u PYTHONHOME -u PYTHONPATH ./venv/Scripts/python.exe -m pytest -q` → all pass.
- [ ] **Step 2: Full frontend suite** — from `frontend/`: `./node_modules/.bin/vitest run` → all pass.
- [ ] **Step 3: Build** — from `frontend/`: `npm run build` → succeeds into `../app/static_spa/`.
- [ ] **Step 4: Manual smoke (optional, with backend running + a logged-in user that has uploaded usage).** Open `/usage` (or `/app` then Usage & Savings): upload a Green Button file → the period, savings ladder (Flat/Hourly/Hourly+alerts), plan toggle, editable flat rate, slider, usage-vs-price chart, and alerts CTA all render in cards. Re-upload the same month → totals don't double. Optionally screen-capture on the connected phone via `adb exec-out screencap`.
- [ ] **Step 5: Commit any fixups**

```bash
git add -A
git commit -m "test(usage): verification fixups"
```

---

## Self-Review Notes (reconciled against the spec)

- **Spec coverage:** upload-month window (Task 3 meter range + Task 6 passes start/end) · usage-vs-price chart in a card (Task 6) · plan toggle + ladder + tailored headline + alerts CTA (Tasks 5–6) · editable flat rate prefilled from backend default 8.5 (Tasks 2, 6) · dedup latest-wins (Task 4) · recent-price fallback + `price_estimated` footnote (Tasks 1, 6) · current card UI (Task 6) · tests for each. The flat rate is sent to the backend (single source of truth); plan toggle is pure client reframing (Task 6 test asserts no refetch).
- **Type/name consistency:** summary fields (`flat_cost_cents`, `actual_cost_cents`, `optimized_cost_cents`, `hourly_vs_flat_cents`, `shift_savings_cents`, `flat_rate_cents`, `shiftable_pct`, `total_kwh`) match across `compute_insights`, `SavingsSummary`, and the tab; `interval_start_utc`/`interval_end_utc` match across schema, `list_meters`, and `meterRange`; `price_estimated` matches across schema, `compute_insights`, and the tab footnote; `usageApi.insights(params)` already serializes arbitrary params via `qs`, so no `api/usage.js` change is needed.
- **No placeholders:** every step has complete code/commands. The Postgres-only `pg_insert` path is unchanged and not unit-tested on SQLite (matching existing); the SQLite-safe `_clear_meter_range` is unit-tested.
