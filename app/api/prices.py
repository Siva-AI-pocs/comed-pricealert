from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import HourlyAverage, Price5Min
from app.schemas import DailySummary, HourlyAverageOut, Price5MinOut, PriceStats

router = APIRouter(prefix="/api/prices", tags=["prices"])

# ComEd operates in Central Time
COMED_TZ = ZoneInfo("America/Chicago")


def _today_midnight_ms() -> int:
    """Milliseconds UTC for midnight today in Central Time."""
    now_ct = datetime.now(COMED_TZ)
    midnight_ct = now_ct.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(midnight_ct.timestamp() * 1000)


def _today_midnight_dt() -> datetime:
    """datetime (UTC) for midnight today in Central Time."""
    now_ct = datetime.now(COMED_TZ)
    midnight_ct = now_ct.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_ct.astimezone(timezone.utc)


@router.get("/current", response_model=Price5MinOut)
def get_current_price(db: Session = Depends(get_db)):
    row = db.query(Price5Min).order_by(Price5Min.millis_utc.desc()).first()
    if row is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="No price data available yet")
    return row


@router.get("/5min", response_model=list[Price5MinOut])
def get_5min_prices(
    days: int = Query(default=7, ge=1, le=7),
    today: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    if today:
        cutoff_ms = _today_midnight_ms()
    else:
        cutoff_ms = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)

    rows = (
        db.query(Price5Min)
        .filter(Price5Min.millis_utc >= cutoff_ms)
        .order_by(Price5Min.millis_utc.asc())
        .all()
    )
    return rows


@router.get("/hourly", response_model=list[HourlyAverageOut])
def get_hourly_prices(
    days: int = Query(default=7, ge=1, le=7),
    today: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    if today:
        cutoff = _today_midnight_dt()
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(HourlyAverage)
        .filter(HourlyAverage.hour_utc >= cutoff)
        .order_by(HourlyAverage.hour_utc.asc())
        .all()
    )
    return rows


@router.get("/stats", response_model=PriceStats)
def get_stats(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    # Today = midnight Central Time (matches ComEd's definition of "today")
    today_cutoff_ms = _today_midnight_ms()
    week_cutoff_ms = int((now - timedelta(days=7)).timestamp() * 1000)

    latest = db.execute(
        text("SELECT price_cents FROM price_5min ORDER BY millis_utc DESC LIMIT 1")
    ).scalar()

    latest_ms = db.execute(
        text("SELECT MAX(millis_utc) FROM price_5min")
    ).scalar()

    if latest_ms:
        last_updated_utc = datetime.fromtimestamp(latest_ms / 1000, tz=timezone.utc)
        data_age_seconds = int((datetime.now(timezone.utc) - last_updated_utc).total_seconds())
        last_updated_str = last_updated_utc.strftime("%Y-%m-%dT%H:%M:%S")
    else:
        data_age_seconds = None
        last_updated_str = None

    current_hour_start = now.replace(minute=0, second=0, microsecond=0)
    hourly_avg = db.execute(
        text("SELECT AVG(price_cents) FROM price_5min WHERE millis_utc >= :start"),
        {"start": int(current_hour_start.timestamp() * 1000)},
    ).scalar()

    # Use hourly averages for today's low/high — matches ComEd's "Today's Prices" display
    # (5-min spikes get averaged out, just like on the official site)
    today_midnight_dt = _today_midnight_dt()
    day_stats = db.execute(
        text("""
            SELECT MIN(avg_price_cents), MAX(avg_price_cents) FROM hourly_averages
            WHERE hour_utc >= :cutoff
        """),
        {"cutoff": today_midnight_dt},
    ).fetchone()

    week_avg = db.execute(
        text("SELECT AVG(price_cents) FROM price_5min WHERE millis_utc >= :cutoff"),
        {"cutoff": week_cutoff_ms},
    ).scalar()

    return PriceStats(
        current_price=latest,
        hourly_avg=round(hourly_avg, 2) if hourly_avg is not None else None,
        day_min=day_stats[0] if day_stats else None,
        day_max=day_stats[1] if day_stats else None,
        week_avg=round(week_avg, 2) if week_avg is not None else None,
        last_updated_utc=last_updated_str,
        data_age_seconds=data_age_seconds,
    )


@router.get("/daily-summary", response_model=list[DailySummary])
def get_daily_summary(db: Session = Depends(get_db)):
    """Returns per-day min/max/avg for the last 7 days using hourly averages.
    Day boundaries are in Central Time (America/Chicago).
    """
    results = []
    today_ct = datetime.now(COMED_TZ).replace(hour=0, minute=0, second=0, microsecond=0)

    for offset in range(7):
        day_start_ct = today_ct - timedelta(days=offset)
        day_end_ct = day_start_ct + timedelta(days=1)
        day_start_utc = day_start_ct.astimezone(timezone.utc)
        day_end_utc = day_end_ct.astimezone(timezone.utc)

        row = db.execute(
            text("""
                SELECT MIN(avg_price_cents), MAX(avg_price_cents), AVG(avg_price_cents)
                FROM hourly_averages
                WHERE hour_utc >= :day_start AND hour_utc < :day_end
            """),
            {"day_start": day_start_utc, "day_end": day_end_utc},
        ).fetchone()

        results.append(DailySummary(
            date=day_start_ct.strftime("%Y-%m-%d"),
            min_price=row[0] if row else None,
            max_price=row[1] if row else None,
            avg_price=round(row[2], 2) if row and row[2] is not None else None,
        ))

    return results
