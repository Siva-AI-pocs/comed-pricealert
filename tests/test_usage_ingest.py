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
