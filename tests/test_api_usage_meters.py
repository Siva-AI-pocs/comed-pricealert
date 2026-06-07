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
