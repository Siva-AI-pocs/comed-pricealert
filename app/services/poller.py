import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import Price5Min
from app.services.aggregator import recompute_hourly_averages

logger = logging.getLogger(__name__)

COMED_BASE = "https://hourlypricing.comed.com/api"


async def _fetch_with_retry(url: str, params: dict | None = None) -> list[dict]:
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            if attempt == 2:
                logger.error("ComEd API fetch failed after 3 attempts: %s", exc)
                return []
            wait = 2 ** attempt
            logger.warning("ComEd API attempt %d failed (%s), retrying in %ds", attempt + 1, exc, wait)
            await asyncio.sleep(wait)
    return []


def _upsert_rows(db: Session, data: list[dict]) -> int:
    if not data:
        return 0
    inserted = 0
    for item in data:
        try:
            millis = int(item["millisUTC"])
            price = float(item["price"])
        except (KeyError, ValueError):
            continue
        result = db.execute(
            text("""
                INSERT INTO price_5min (millis_utc, price_cents, recorded_at)
                VALUES (:millis, :price, :now) ON CONFLICT (millis_utc) DO NOTHING
            """),
            {"millis": millis, "price": price, "now": datetime.now(timezone.utc)},
        )
        inserted += result.rowcount
    db.commit()
    return inserted


async def _backfill_history(db: Session) -> None:
    oldest = db.execute(text("SELECT MIN(millis_utc) FROM price_5min")).scalar()
    if oldest is not None:
        oldest_dt = datetime.fromtimestamp(oldest / 1000, tz=timezone.utc)
        if oldest_dt < datetime.now(timezone.utc) - timedelta(hours=48):
            return  # already have enough history

    logger.info("Starting historical backfill for %d days...", settings.history_days)
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for days_back in range(settings.history_days, 0, -1):
        day_start = now - timedelta(days=days_back)
        day_end = day_start + timedelta(days=1)
        date_start = day_start.strftime("%Y%m%d%H%M")
        date_end = day_end.strftime("%Y%m%d%H%M")
        data = await _fetch_with_retry(COMED_BASE, {
            "type": "5minutefeed",
            "datestart": date_start,
            "dateend": date_end,
        })
        inserted = _upsert_rows(db, data)
        logger.info("Backfill %s: %d rows inserted", day_start.date(), inserted)
        await asyncio.sleep(1)


async def poll_and_store() -> None:
    db: Session = SessionLocal()
    try:
        await _backfill_history(db)

        data = await _fetch_with_retry(COMED_BASE, {"type": "5minutefeed"})
        inserted = _upsert_rows(db, data)
        logger.info("Poll complete: %d new rows", inserted)

        recompute_hourly_averages(db, since_hours_ago=2)

        # Get latest price for alert check
        latest = db.execute(
            text("SELECT price_cents FROM price_5min ORDER BY millis_utc DESC LIMIT 1")
        ).scalar()
        if latest is not None:
            from app.services.notifier import check_and_notify
            await check_and_notify(db, float(latest))
    finally:
        db.close()


def purge_old_data() -> None:
    db: Session = SessionLocal()
    try:
        cutoff_ms = int(
            (datetime.now(timezone.utc) - timedelta(days=settings.history_days)).timestamp() * 1000
        )
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=settings.history_days)
        cutoff_log = datetime.now(timezone.utc) - timedelta(days=settings.history_days * 2)

        r1 = db.execute(text("DELETE FROM price_5min WHERE millis_utc < :cutoff"), {"cutoff": cutoff_ms})
        r2 = db.execute(text("DELETE FROM hourly_averages WHERE hour_utc < :cutoff"), {"cutoff": cutoff_dt})
        r3 = db.execute(text("DELETE FROM alert_log WHERE sent_at < :cutoff"), {"cutoff": cutoff_log})
        db.commit()
        logger.info("Purge: %d price rows, %d hourly rows, %d alert log rows deleted",
                    r1.rowcount, r2.rowcount, r3.rowcount)
    finally:
        db.close()
