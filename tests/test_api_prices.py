"""
Integration tests for GET /api/prices/* endpoints.
Uses FastAPI TestClient + in-memory SQLite — no network required.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _insert_price(db, millis_utc: int, price_cents: float):
    db.execute(
        text("""
            INSERT INTO price_5min (millis_utc, price_cents, recorded_at)
            VALUES (:m, :p, :n) ON CONFLICT (millis_utc) DO NOTHING
        """),
        {"m": millis_utc, "p": price_cents, "n": datetime.now(timezone.utc)},
    )
    db.commit()


def _insert_hourly(db, hour_utc: datetime, avg: float, count: int = 12):
    db.execute(
        text("""
            INSERT INTO hourly_averages (hour_utc, avg_price_cents, sample_count, computed_at)
            VALUES (:h, :a, :c, :n)
            ON CONFLICT (hour_utc) DO NOTHING
        """),
        {"h": hour_utc, "a": avg, "c": count, "n": datetime.now(timezone.utc)},
    )
    db.commit()


NOW_MS = int(datetime.now(timezone.utc).timestamp() * 1000)


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# GET /api/prices/current
# ---------------------------------------------------------------------------

class TestCurrentPrice:
    def test_503_when_no_data(self, client):
        r = client.get("/api/prices/current")
        assert r.status_code == 503

    def test_returns_latest_row(self, client, db):
        _insert_price(db, NOW_MS - 600_000, 2.0)
        _insert_price(db, NOW_MS, 5.5)
        r = client.get("/api/prices/current")
        assert r.status_code == 200
        data = r.json()
        assert data["price_cents"] == pytest.approx(5.5)
        assert data["millis_utc"] == NOW_MS

    def test_response_has_required_fields(self, client, db):
        _insert_price(db, NOW_MS, 3.0)
        data = client.get("/api/prices/current").json()
        assert "millis_utc" in data
        assert "price_cents" in data
        assert "recorded_at" in data


# ---------------------------------------------------------------------------
# GET /api/prices/5min
# ---------------------------------------------------------------------------

class TestPrices5Min:
    def test_empty_db_returns_empty_list(self, client):
        r = client.get("/api/prices/5min")
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_rows_within_days_window(self, client, db):
        recent_ms = int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp() * 1000)
        old_ms = int((datetime.now(timezone.utc) - timedelta(days=8)).timestamp() * 1000)
        _insert_price(db, recent_ms, 3.0)
        _insert_price(db, old_ms, 1.0)
        data = client.get("/api/prices/5min?days=7").json()
        millis_values = [r["millis_utc"] for r in data]
        assert recent_ms in millis_values
        assert old_ms not in millis_values

    def test_ascending_order(self, client, db):
        for i in range(5, 0, -1):
            _insert_price(db, NOW_MS - i * 300_000, float(i))
        data = client.get("/api/prices/5min").json()
        millis = [r["millis_utc"] for r in data]
        assert millis == sorted(millis)

    def test_invalid_days_param(self, client):
        r = client.get("/api/prices/5min?days=10")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/prices/hourly
# ---------------------------------------------------------------------------

class TestPricesHourly:
    def test_empty_db_returns_empty_list(self, client):
        r = client.get("/api/prices/hourly")
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_hourly_rows(self, client, db):
        hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        _insert_hourly(db, hour, avg=4.5)
        data = client.get("/api/prices/hourly").json()
        assert len(data) == 1
        assert data[0]["avg_price_cents"] == pytest.approx(4.5)

    def test_response_fields(self, client, db):
        hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        _insert_hourly(db, hour, avg=2.0)
        row = client.get("/api/prices/hourly").json()[0]
        assert "hour_utc" in row
        assert "avg_price_cents" in row
        assert "sample_count" in row


# ---------------------------------------------------------------------------
# GET /api/prices/stats
# ---------------------------------------------------------------------------

class TestPricesStats:
    def test_nulls_when_no_data(self, client):
        data = client.get("/api/prices/stats").json()
        assert data["current_price"] is None
        assert data["week_avg"] is None

    def test_current_price_populated(self, client, db):
        _insert_price(db, NOW_MS, 7.0)
        data = client.get("/api/prices/stats").json()
        assert data["current_price"] == pytest.approx(7.0)

    def test_week_avg_computed(self, client, db):
        for i in range(4):
            _insert_price(db, NOW_MS - i * 3_600_000, 4.0)
        data = client.get("/api/prices/stats").json()
        assert data["week_avg"] == pytest.approx(4.0)

    def test_day_min_lte_day_max(self, client, db):
        now = datetime.now(timezone.utc)
        for h in range(3):
            hour = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=h)
            _insert_hourly(db, hour, avg=float(h + 1))
        data = client.get("/api/prices/stats").json()
        if data["day_min"] is not None and data["day_max"] is not None:
            assert data["day_min"] <= data["day_max"]

    def test_hourly_avg_in_stats(self, client, db):
        # Insert a few rows within the current hour
        base_ms = int(datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0).timestamp() * 1000)
        for i in range(3):
            _insert_price(db, base_ms + i * 60_000, 6.0)
        data = client.get("/api/prices/stats").json()
        assert data["hourly_avg"] == pytest.approx(6.0)


# ---------------------------------------------------------------------------
# GET /api/prices/daily-summary
# ---------------------------------------------------------------------------

class TestDailySummary:
    def test_returns_list(self, client):
        r = client.get("/api/prices/daily-summary")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_returns_7_entries(self, client):
        data = client.get("/api/prices/daily-summary").json()
        assert len(data) == 7

    def test_entry_has_required_fields(self, client):
        entry = client.get("/api/prices/daily-summary").json()[0]
        assert "date" in entry
        assert "min_price" in entry
        assert "max_price" in entry
        assert "avg_price" in entry

    def test_nulls_when_no_data(self, client):
        data = client.get("/api/prices/daily-summary").json()
        # With empty DB all price fields should be None
        for entry in data:
            assert entry["min_price"] is None
            assert entry["max_price"] is None
