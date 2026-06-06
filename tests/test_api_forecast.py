"""Tests for the forecast read API."""

from datetime import datetime, timedelta, timezone

from app.models import PriceActual, PriceForecast

GEN1 = datetime(2026, 6, 4, 0, 0, 0)
GEN2 = datetime(2026, 6, 4, 1, 0, 0)  # newer batch


def _add_forecast(db, gen, target, p50, da_lmp=None, model="baseline-v1"):
    db.add(
        PriceForecast(
            target_ts=target,
            p10=p50 - 1,
            p50=p50,
            p90=p50 + 1,
            spike_prob=0.05,
            da_lmp=da_lmp,
            model_version=model,
            generated_at=gen,
        )
    )


class TestGetForecast:
    def test_empty_when_no_rows(self, client):
        r = client.get("/api/forecast")
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_latest_batch_ordered(self, client, db):
        base = datetime(2026, 6, 5, 0, 0, 0)
        # old batch
        _add_forecast(db, GEN1, base + timedelta(hours=1), 5.0)
        # newest batch (should be the one served), out of order on insert
        _add_forecast(db, GEN2, base + timedelta(hours=2), 7.0)
        _add_forecast(db, GEN2, base + timedelta(hours=1), 6.0)
        db.commit()

        body = client.get("/api/forecast?hours=48").json()
        assert len(body) == 2  # only the newest generated_at batch
        assert [p["p50"] for p in body] == [6.0, 7.0]  # ascending target_ts
        assert all(p["model_version"] == "baseline-v1" for p in body)

    def test_hours_limit(self, client, db):
        base = datetime(2026, 6, 6, 0, 0, 0)
        for h in range(5):
            _add_forecast(db, GEN2, base + timedelta(hours=h), 3.0 + h)
        db.commit()
        assert len(client.get("/api/forecast?hours=3").json()) == 3


class TestAccuracy:
    def test_shape_when_empty(self, client):
        body = client.get("/api/forecast/accuracy").json()
        assert body == {"mae": None, "vs_day_ahead_pct": None, "daily": []}

    def test_computes_mae_against_actuals(self, client, db):
        # target within the last 7 days
        target = (
            datetime.now(timezone.utc)
            .replace(minute=0, second=0, microsecond=0)
            .replace(tzinfo=None)
        )
        _add_forecast(db, GEN1, target, p50=5.0, da_lmp=8.0)
        db.add(PriceActual(target_ts=target, rt_price=6.0))  # model off by 1, DA off by 2
        db.commit()
        body = client.get("/api/forecast/accuracy").json()
        assert body["mae"] == 1.0
        # day-ahead MAE 2.0 -> model is 50% closer
        assert body["vs_day_ahead_pct"] == 50
        assert len(body["daily"]) == 1
