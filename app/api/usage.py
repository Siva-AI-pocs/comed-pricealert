"""Personal ComEd meter usage data: upload + read endpoints.

Phase 1 source is manual Green Button XML upload. The router is intentionally
source-agnostic — every path reads from `usage_intervals` regardless of how
the rows got there, so phase 2 (Bayou) and phase 3 (CMD OAuth) plug in by
calling `usage_ingest.ingest_intervals(...)` without touching this file.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.models import UsageInterval, UsageMeter, User
from app.schemas import (
    UsageDailyOut,
    UsageHourlyOut,
    UsageInsightsOut,
    UsageMeterOut,
    UsageUploadResult,
)
from app.services.espi_parser import parse_espi
from app.services.poller import backfill_hourly_prices
from app.services.usage_ingest import ingest_intervals
from app.services.usage_insights import compute_insights

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/usage", tags=["usage"])

COMED_TZ = ZoneInfo("America/Chicago")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB — Green Button exports are tiny


@router.post("/upload", response_model=UsageUploadResult)
async def upload_usage(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES} bytes"
        )

    try:
        tuples = list(parse_espi(payload))
    except Exception as exc:
        logger.exception("ESPI parse failed for user_id=%d", current_user.id)
        raise HTTPException(status_code=400, detail=f"Could not parse ESPI XML: {exc}")

    if not tuples:
        raise HTTPException(
            status_code=400, detail="No IntervalReading entries found in file"
        )

    result = ingest_intervals(db, current_user.id, source="upload", tuples=tuples)
    logger.info(
        "Usage upload user_id=%d meters=%s intervals=%d range=%s..%s",
        current_user.id,
        result.meter_ids,
        result.intervals_inserted,
        result.range_start_utc,
        result.range_end_utc,
    )

    # Backfill ComEd prices covering the uploaded range so the usage-vs-price
    # comparison works even for older data. Best-effort: never fail the upload.
    backfilled = 0
    try:
        backfilled = await backfill_hourly_prices(
            db, result.range_start_utc, result.range_end_utc
        )
    except Exception:
        logger.exception(
            "Price backfill after upload failed (non-fatal) for user_id=%d",
            current_user.id,
        )

    return UsageUploadResult(
        meter_ids=result.meter_ids,
        intervals_inserted=result.intervals_inserted,
        range_start_utc=result.range_start_utc,
        range_end_utc=result.range_end_utc,
        prices_backfilled=backfilled,
    )


@router.get("/meters", response_model=list[UsageMeterOut])
def list_meters(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = (
        db.query(
            UsageMeter.id,
            UsageMeter.espi_usage_point_id,
            UsageMeter.service_kind,
            UsageMeter.label,
            UsageMeter.created_at,
            func.count(UsageInterval.id).label("interval_count"),
        )
        .outerjoin(UsageInterval, UsageInterval.meter_id == UsageMeter.id)
        .filter(UsageMeter.user_id == current_user.id)
        .group_by(UsageMeter.id)
        .order_by(UsageMeter.id.asc())
        .all()
    )
    return [
        UsageMeterOut(
            id=r.id,
            espi_usage_point_id=r.espi_usage_point_id,
            service_kind=r.service_kind,
            label=r.label,
            created_at=r.created_at,
            interval_count=r.interval_count,
        )
        for r in rows
    ]


@router.delete("/meter/{meter_id}")
def delete_meter(
    meter_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meter = (
        db.query(UsageMeter)
        .filter(UsageMeter.id == meter_id, UsageMeter.user_id == current_user.id)
        .first()
    )
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
    db.delete(meter)
    db.commit()
    return {"message": "Meter and all intervals deleted"}


def _ms_to_naive_utc(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).replace(tzinfo=None)


@router.get("/hourly", response_model=list[UsageHourlyOut])
def hourly_usage(
    days: int = Query(default=7, ge=1, le=400),
    start: int | None = Query(default=None, description="Window start, epoch ms"),
    end: int | None = Query(default=None, description="Window end, epoch ms"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Explicit window (presets / custom range) takes precedence over `days`.
    start_dt = (
        _ms_to_naive_utc(start)
        if start is not None
        else (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days))
    )
    end_dt = _ms_to_naive_utc(end) if end is not None else None
    sql = """
            SELECT date_trunc('hour', start_utc) AS hour_utc,
                   SUM(wh)::float / 1000.0 AS kwh,
                   COUNT(*) AS sample_count
            FROM usage_intervals ui
            JOIN usage_meters m ON m.id = ui.meter_id
            WHERE m.user_id = :uid AND ui.start_utc >= :start
    """
    params = {"uid": current_user.id, "start": start_dt}
    if end_dt is not None:
        sql += " AND ui.start_utc <= :end"
        params["end"] = end_dt
    sql += " GROUP BY date_trunc('hour', start_utc) ORDER BY hour_utc ASC"
    rows = db.execute(text(sql), params).fetchall()
    return [
        UsageHourlyOut(hour_utc=r.hour_utc, kwh=r.kwh, sample_count=r.sample_count)
        for r in rows
    ]


@router.get("/daily", response_model=list[UsageDailyOut])
def daily_usage(
    days: int = Query(default=30, ge=1, le=400),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Bucket by America/Chicago calendar day so the day boundary matches the
    # user's lived experience and aligns with how ComEd bills.
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = db.execute(
        text("""
            SELECT to_char((ui.start_utc AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS day,
                   SUM(wh)::float / 1000.0 AS kwh,
                   COUNT(*) AS sample_count
            FROM usage_intervals ui
            JOIN usage_meters m ON m.id = ui.meter_id
            WHERE m.user_id = :uid AND ui.start_utc >= :cutoff
            GROUP BY day
            ORDER BY day ASC
        """),
        {"uid": current_user.id, "cutoff": cutoff},
    ).fetchall()
    return [
        UsageDailyOut(date=r.day, kwh=r.kwh, sample_count=r.sample_count) for r in rows
    ]


@router.get("/insights", response_model=UsageInsightsOut)
def usage_insights(
    days: int = Query(default=7, ge=1, le=400),
    start: int | None = Query(default=None, description="Window start, epoch ms"),
    end: int | None = Query(default=None, description="Window end, epoch ms"),
    shiftable_pct: float | None = Query(default=None, ge=0.0, le=1.0),
    flat_rate_cents: float | None = Query(default=None, gt=0.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aligned hourly usage-vs-price plus flat-rate and smart-shift savings summary."""
    return compute_insights(
        db,
        current_user.id,
        days=days,
        start=start,
        end=end,
        shiftable_pct=shiftable_pct,
        flat_rate_cents=flat_rate_cents,
    )
