"""Baseline 48h price forecast.

A deliberately simple, Render-cheap forecaster so the Forecast tab is *live*
(not preview) before the offline LightGBM model lands. It predicts each future
hour's price from the recent average for that hour-of-day, with a fixed band.

The "train offline, serve light" model from the spec replaces ``compute_forecast``
later; the table contract and API stay the same.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean

from sqlalchemy.orm import Session

from app.models import HourlyAverage, PriceForecast

MODEL_VERSION = "baseline-v1"
LOOKBACK_DAYS = 14


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def compute_forecast(
    db: Session,
    now: datetime | None = None,
    hours: int = 48,
    model_version: str = MODEL_VERSION,
) -> list[dict]:
    """Build forecast rows for the next `hours` hours. Returns [] with no history."""
    now = _naive_utc(now or datetime.now(timezone.utc))
    history = (
        db.query(HourlyAverage)
        .filter(HourlyAverage.hour_utc >= now - timedelta(days=LOOKBACK_DAYS))
        .all()
    )
    if not history:
        return []

    by_hour_of_day: dict[int, list[float]] = defaultdict(list)
    for row in history:
        by_hour_of_day[row.hour_utc.hour].append(row.avg_price_cents)
    overall = mean(h.avg_price_cents for h in history)

    generated_at = now
    start = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

    rows: list[dict] = []
    for h in range(hours):
        target = start + timedelta(hours=h)
        samples = by_hour_of_day.get(target.hour)
        p50 = round(mean(samples) if samples else overall, 2)
        spread = 0.25 if p50 < 8 else 0.4
        p10 = round(max(-1.0, p50 * (1 - spread)), 2)
        p90 = round(p50 * (1 + spread), 2)
        spike_prob = round(min(0.9, max(0.02, (p50 - 8) / 20)) if p50 > 8 else 0.02, 3)
        rows.append(
            {
                "target_ts": target,
                "p10": p10,
                "p50": p50,
                "p90": p90,
                "spike_prob": spike_prob,
                "da_lmp": None,
                "model_version": model_version,
                "generated_at": generated_at,
            }
        )
    return rows


def store_forecast(db: Session, rows: list[dict]) -> int:
    """Persist forecast rows; idempotent for a given generated_at batch."""
    if not rows:
        return 0
    generated_at = rows[0]["generated_at"]
    db.query(PriceForecast).filter(
        PriceForecast.generated_at == generated_at
    ).delete()
    db.add_all(PriceForecast(**r) for r in rows)
    db.commit()
    return len(rows)


def run(db: Session, now: datetime | None = None) -> int:
    """Compute and store the latest forecast; returns the number of rows written."""
    return store_forecast(db, compute_forecast(db, now=now))
