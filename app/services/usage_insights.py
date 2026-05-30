"""Usage-vs-price insights: align uploaded hourly usage with ComEd hourly price,
compute cost, a flat-rate bill comparison, and an auto "smart-shift" savings estimate.

Aggregation is done in Python (not SQL) so it runs identically on the SQLite test DB
and Postgres in production — the existing usage SQL uses Postgres-only constructs
(date_trunc / AT TIME ZONE / ::float) that don't run on SQLite.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.api.decision import _classify
from app.config import settings
from app.models import HourlyAverage, UsageInterval, UsageMeter

COMED_TZ = ZoneInfo("America/Chicago")


def _hour_key(dt: datetime) -> datetime:
    """Canonical naive-UTC hour key for joining usage and price.

    Both columns are stored naive-UTC in production, but normalize defensively:
    convert any tz-aware value to UTC and drop tzinfo before flooring, so usage
    and price keys can never mismatch on aware-vs-naive (which would silently
    drop the join and hide the whole section).
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(minute=0, second=0, microsecond=0)


def compute_insights(
    db: Session,
    user_id: int,
    days: int = 7,
    start: int | None = None,
    end: int | None = None,
    shiftable_pct: float | None = None,
) -> dict:
    """Return aligned hourly (usage, price, cost) plus a savings/cost summary.

    Window is [start, end] epoch-ms when given (presets / custom range), else the
    trailing `days`. The aligned series only includes hours present in BOTH the
    user's usage and the retained hourly price history, so partial overlap degrades
    gracefully.
    """
    if shiftable_pct is None:
        shiftable_pct = settings.default_shiftable_pct
    shiftable_pct = max(0.0, min(1.0, float(shiftable_pct)))

    if start is not None:
        window_start = datetime.fromtimestamp(start / 1000, tz=timezone.utc).replace(
            tzinfo=None
        )
    else:
        window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            days=days
        )
    window_end = (
        datetime.fromtimestamp(end / 1000, tz=timezone.utc).replace(tzinfo=None)
        if end is not None
        else None
    )

    # Hourly usage (kWh) for this user, bucketed in Python.
    usage_by_hour: dict[datetime, float] = defaultdict(float)
    usage_q = (
        db.query(UsageInterval.start_utc, UsageInterval.wh)
        .join(UsageMeter, UsageMeter.id == UsageInterval.meter_id)
        .filter(UsageMeter.user_id == user_id, UsageInterval.start_utc >= window_start)
    )
    price_q = db.query(HourlyAverage.hour_utc, HourlyAverage.avg_price_cents).filter(
        HourlyAverage.hour_utc >= window_start
    )
    if window_end is not None:
        usage_q = usage_q.filter(UsageInterval.start_utc <= window_end)
        price_q = price_q.filter(HourlyAverage.hour_utc <= window_end)

    for start_utc, wh in usage_q.all():
        usage_by_hour[_hour_key(start_utc)] += (wh or 0) / 1000.0

    # Hourly price (cents/kWh) over the same window.
    price_by_hour = {_hour_key(h): p for h, p in price_q.all()}

    # Aligned series — hours present in both usage and price.
    hourly: list[dict] = []
    for hour in sorted(usage_by_hour):
        if hour not in price_by_hour:
            continue
        kwh = usage_by_hour[hour]
        price = price_by_hour[hour]
        hourly.append(
            {
                "hour_utc": hour,
                "kwh": round(kwh, 4),
                "price_cents": round(price, 4),
                "cost_cents": round(kwh * price, 4),
                "level": _classify(price)["level"],
            }
        )

    total_kwh = sum(h["kwh"] for h in hourly)
    actual_cost = sum(h["cost_cents"] for h in hourly)

    # Flat-rate bill comparison.
    flat_cost = total_kwh * settings.flat_rate_cents
    hourly_vs_flat = flat_cost - actual_cost

    # Smart-shift savings, grouped by Central-Time day (matches how ComEd bills).
    by_day: dict[object, list[tuple[float, float]]] = defaultdict(list)
    for h in hourly:
        ct_date = h["hour_utc"].replace(tzinfo=timezone.utc).astimezone(COMED_TZ).date()
        by_day[ct_date].append((h["kwh"], h["price_cents"]))

    shiftable_kwh_total = 0.0
    shift_savings = 0.0
    for entries in by_day.values():
        prices = [p for _, p in entries]
        if not prices:
            continue
        cheapest = min(prices)
        median = sorted(prices)[len(prices) // 2]
        # Energy consumed in above-median (expensive) hours is the shiftable pool.
        expensive = [(kwh, p) for kwh, p in entries if p > median]
        exp_kwh = sum(kwh for kwh, _ in expensive)
        if exp_kwh <= 0:
            continue
        day_shift_kwh = shiftable_pct * exp_kwh
        avg_exp_price = sum(kwh * p for kwh, p in expensive) / exp_kwh
        shiftable_kwh_total += day_shift_kwh
        # Repricing that energy at the day's cheapest hour.
        shift_savings += day_shift_kwh * (avg_exp_price - cheapest)

    optimized_cost = actual_cost - shift_savings

    return {
        "hourly": hourly,
        "summary": {
            "days": days,
            "total_kwh": round(total_kwh, 3),
            "actual_cost_cents": round(actual_cost, 2),
            "flat_cost_cents": round(flat_cost, 2),
            "flat_rate_cents": settings.flat_rate_cents,
            "hourly_vs_flat_cents": round(hourly_vs_flat, 2),
            "shiftable_pct": round(shiftable_pct, 2),
            "shiftable_kwh": round(shiftable_kwh_total, 3),
            "optimized_cost_cents": round(optimized_cost, 2),
            "shift_savings_cents": round(shift_savings, 2),
        },
    }
