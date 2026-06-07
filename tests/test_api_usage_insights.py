"""
Tests for GET /api/usage/insights (usage-vs-price + savings) and the price-history
retention change in purge_old_data().
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import HourlyAverage, Price5Min, User, UsageInterval, UsageMeter
from app.services.usage_insights import _hour_key


def test_hour_key_normalizes_aware_and_naive():
    # aggregator.py writes tz-aware hour_utc; usage start_utc is naive. The join
    # key must collapse both to the same naive-UTC hour or the join silently empties.
    aware = datetime(2026, 5, 30, 18, 30, tzinfo=timezone.utc)
    naive = datetime(2026, 5, 30, 18, 0)
    assert _hour_key(aware) == _hour_key(naive)
    assert _hour_key(aware).tzinfo is None


def _register(client, email="u@test.com", password="origpass1"):
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


def _seed_usage_and_price(db, email="u@test.com", with_price=True):
    """Three consecutive hours on one Central-Time day, 2 days ago.

    Usage/price: (2 kWh @ 12¢), (1 kWh @ 6¢), (1 kWh @ 2¢).
      total_kwh = 4, actual_cost = 24+6+2 = 32¢
    """
    user = db.query(User).filter(User.email == email).first()
    meter = UsageMeter(
        user_id=user.id, espi_usage_point_id="UP1", service_kind="electricity"
    )
    db.add(meter)
    db.flush()

    base = (
        datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    ).replace(minute=0, second=0, microsecond=0, hour=18)
    rows = [
        (base, 2.0, 12.0),
        (base + timedelta(hours=1), 1.0, 6.0),
        (base + timedelta(hours=2), 1.0, 2.0),
    ]
    for hour, kwh, price in rows:
        db.add(
            UsageInterval(
                meter_id=meter.id,
                start_utc=hour,
                duration_seconds=3600,
                wh=int(kwh * 1000),
                source="upload",
            )
        )
        if with_price:
            db.add(HourlyAverage(hour_utc=hour, avg_price_cents=price, sample_count=12))
    db.commit()


class TestUsageInsights:
    def test_window_start_end_filters(self, client, db):
        # Seeded hours: base, base+1h, base+2h (2 days ago, 18:00 UTC) with prices 12/6/2.
        _register(client)
        _seed_usage_and_price(db)
        base = (
            datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
        ).replace(minute=0, second=0, microsecond=0, hour=18)
        mid = (base + timedelta(hours=1)).replace(tzinfo=timezone.utc)
        start = int(mid.timestamp() * 1000)
        end = int((mid + timedelta(minutes=30)).timestamp() * 1000)
        r = client.get(f"/api/usage/insights?start={start}&end={end}")
        assert r.status_code == 200
        body = r.json()
        assert len(body["hourly"]) == 1  # only the middle hour is in-window
        assert body["hourly"][0]["price_cents"] == pytest.approx(6.0)

    def test_cost_flat_and_shift_savings(self, client, db):
        _register(client)
        _seed_usage_and_price(db)
        r = client.get("/api/usage/insights?days=7&shiftable_pct=0.5")
        assert r.status_code == 200
        body = r.json()
        assert len(body["hourly"]) == 3
        s = body["summary"]
        assert s["total_kwh"] == pytest.approx(4.0)
        assert s["actual_cost_cents"] == pytest.approx(32.0)
        # flat: 4 kWh * 8.5¢
        assert s["flat_cost_cents"] == pytest.approx(34.0)
        assert s["hourly_vs_flat_cents"] == pytest.approx(2.0)
        # shiftable = 50% of 2 kWh in the above-median (12¢) hour = 1 kWh,
        # repriced from 12¢ to the day's cheapest 2¢ → savings = 1 * 10 = 10¢
        assert s["shiftable_kwh"] == pytest.approx(1.0)
        assert s["shift_savings_cents"] == pytest.approx(10.0)
        assert s["optimized_cost_cents"] == pytest.approx(22.0)

    def test_savings_increases_with_shiftable_pct(self, client, db):
        _register(client)
        _seed_usage_and_price(db)
        low = client.get("/api/usage/insights?shiftable_pct=0.2").json()["summary"][
            "shift_savings_cents"
        ]
        high = client.get("/api/usage/insights?shiftable_pct=0.8").json()["summary"][
            "shift_savings_cents"
        ]
        assert high > low > 0

    def test_empty_overlap_returns_zeroed(self, client, db):
        # Usage present but no matching price → graceful zeros, not an error.
        _register(client)
        _seed_usage_and_price(db, with_price=False)
        r = client.get("/api/usage/insights")
        assert r.status_code == 200
        body = r.json()
        assert body["hourly"] == []
        assert body["summary"]["total_kwh"] == pytest.approx(0.0)
        assert body["summary"]["actual_cost_cents"] == pytest.approx(0.0)

    def test_requires_auth(self, client):
        assert client.get("/api/usage/insights").status_code == 401


class TestPriceRetention:
    def test_purge_retains_hourly_averages(self, client, db, monkeypatch):
        import app.services.poller as poller
        from sqlalchemy.orm import sessionmaker

        # Point purge at the in-memory test engine.
        monkeypatch.setattr(poller, "SessionLocal", sessionmaker(bind=db.get_bind()))

        old_ms = int(
            (datetime.now(timezone.utc) - timedelta(days=30)).timestamp() * 1000
        )
        old_dt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
        db.add(Price5Min(millis_utc=old_ms, price_cents=5.0))
        db.add(HourlyAverage(hour_utc=old_dt, avg_price_cents=5.0, sample_count=12))
        db.commit()

        poller.purge_old_data()
        db.expire_all()

        # Old 5-min price is trimmed; the hourly average is retained for history.
        assert db.query(Price5Min).filter(Price5Min.millis_utc == old_ms).count() == 0
        assert (
            db.query(HourlyAverage).filter(HourlyAverage.hour_utc == old_dt).count()
            == 1
        )


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

    def test_flat_rate_out_of_range_rejected(self, client, db):
        _register(client)
        _seed_usage_and_price(db)
        assert client.get("/api/usage/insights?flat_rate_cents=0").status_code == 422
        assert client.get("/api/usage/insights?flat_rate_cents=500").status_code == 422
