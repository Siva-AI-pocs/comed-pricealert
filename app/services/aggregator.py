from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import HourlyAverage


def recompute_hourly_averages(db: Session, since_hours_ago: int = 2) -> None:
    cutoff_ms = int((datetime.now(timezone.utc) - timedelta(hours=since_hours_ago)).timestamp() * 1000)

    rows = db.execute(
        text("""
            SELECT
                date_trunc('hour', to_timestamp(millis_utc / 1000.0)) AS hour_utc,
                AVG(price_cents) AS avg_price,
                COUNT(*) AS sample_count
            FROM price_5min
            WHERE millis_utc >= :cutoff
            GROUP BY hour_utc
        """),
        {"cutoff": cutoff_ms},
    ).fetchall()

    for row in rows:
        hour_utc = row.hour_utc.replace(tzinfo=timezone.utc)
        existing = db.query(HourlyAverage).filter(HourlyAverage.hour_utc == hour_utc).first()
        if existing:
            existing.avg_price_cents = row.avg_price
            existing.sample_count = row.sample_count
            existing.computed_at = datetime.now(timezone.utc)
        else:
            db.add(HourlyAverage(
                hour_utc=hour_utc,
                avg_price_cents=row.avg_price,
                sample_count=row.sample_count,
                computed_at=datetime.now(timezone.utc),
            ))

    db.commit()
