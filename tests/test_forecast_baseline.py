"""Tests for the baseline 48h forecast writer."""

from datetime import datetime, timedelta

from app.models import HourlyAverage, PriceForecast
from app.services import forecast_baseline

NOW = datetime(2026, 6, 4, 12, 0, 0)  # naive UTC


def _seed_history(db, days=7):
    """Seed hourly averages: cheap overnight, pricey late-afternoon."""
    for d in range(days):
        for hour in range(24):
            ts = (NOW - timedelta(days=d + 1)).replace(hour=hour, minute=0, second=0)
            price = 9.0 if 16 <= hour <= 19 else 2.0
            db.add(
                HourlyAverage(
                    hour_utc=ts, avg_price_cents=price, sample_count=12
                )
            )
    db.commit()


class TestComputeForecast:
    def test_returns_empty_without_history(self, db):
        assert forecast_baseline.compute_forecast(db, now=NOW) == []

    def test_produces_48_hourly_rows(self, db):
        _seed_history(db)
        rows = forecast_baseline.compute_forecast(db, now=NOW)
        assert len(rows) == 48
        # hour-aligned, starting next hour, strictly increasing
        targets = [r["target_ts"] for r in rows]
        assert targets[0] == NOW.replace(minute=0, second=0) + timedelta(hours=1)
        assert all(b - a == timedelta(hours=1) for a, b in zip(targets, targets[1:]))

    def test_bands_are_ordered(self, db):
        _seed_history(db)
        for r in forecast_baseline.compute_forecast(db, now=NOW):
            assert r["p10"] <= r["p50"] <= r["p90"]

    def test_learns_hour_of_day_shape(self, db):
        _seed_history(db)
        rows = forecast_baseline.compute_forecast(db, now=NOW)
        peak = [r["p50"] for r in rows if 16 <= r["target_ts"].hour <= 19]
        night = [r["p50"] for r in rows if r["target_ts"].hour in (1, 2, 3)]
        assert min(peak) > max(night)  # afternoon predicted pricier than overnight


class TestStoreForecast:
    def test_run_writes_rows(self, db):
        _seed_history(db)
        n = forecast_baseline.run(db, now=NOW)
        assert n == 48
        assert db.query(PriceForecast).count() == 48

    def test_rerun_same_instant_is_idempotent(self, db):
        _seed_history(db)
        forecast_baseline.run(db, now=NOW)
        forecast_baseline.run(db, now=NOW)
        # same generated_at batch replaced, not duplicated
        assert db.query(PriceForecast).count() == 48
