import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import HourlyAverage, Price5Min
from app.services.aggregator import recompute_hourly_averages

# Cap a single on-upload backfill so one upload can't trigger hundreds of fetches.
MAX_BACKFILL_DAYS = 92

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
            wait = 2**attempt
            logger.warning(
                "ComEd API attempt %d failed (%s), retrying in %ds",
                attempt + 1,
                exc,
                wait,
            )
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
        data = await _fetch_with_retry(
            COMED_BASE,
            {
                "type": "5minutefeed",
                "datestart": date_start,
                "dateend": date_end,
            },
        )
        inserted = _upsert_rows(db, data)
        logger.info("Backfill %s: %d rows inserted", day_start.date(), inserted)
        await asyncio.sleep(1)


async def backfill_hourly_prices(
    db: Session,
    start_utc: datetime | None,
    end_utc: datetime | None,
    max_days: int = MAX_BACKFILL_DAYS,
) -> int:
    """Fetch ComEd hourly prices covering [start_utc, end_utc] into hourly_averages.

    Called after a usage upload so the usage-vs-price comparison works for data of
    any age. Only hourly_averages is populated (that's what the insights join needs,
    and the table we retain long-term). Idempotent: a day already covered is skipped
    without a fetch, and existing hours are never overwritten. Returns rows inserted.
    """
    if start_utc is None or end_utc is None:
        return 0
    start_utc = start_utc.replace(tzinfo=None)
    end_utc = end_utc.replace(tzinfo=None)
    floor = end_utc - timedelta(days=max_days)
    if start_utc < floor:
        logger.info(
            "Price backfill capped to last %d days (ending %s)",
            max_days,
            end_utc.date(),
        )
        start_utc = floor

    day = start_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    last = end_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    inserted = 0
    while day <= last:
        nxt = day + timedelta(days=1)
        covered = (
            db.query(HourlyAverage)
            .filter(HourlyAverage.hour_utc >= day, HourlyAverage.hour_utc < nxt)
            .first()
        )
        if covered is None:
            rows = await _fetch_with_retry(
                COMED_BASE,
                {
                    "type": "5minutefeed",
                    "datestart": day.strftime("%Y%m%d0000"),
                    "dateend": nxt.strftime("%Y%m%d0000"),
                },
            )
            buckets: dict[datetime, list[float]] = defaultdict(list)
            for r in rows:
                try:
                    ts = datetime.fromtimestamp(
                        int(r["millisUTC"]) / 1000, tz=timezone.utc
                    ).replace(tzinfo=None)
                except (KeyError, ValueError, TypeError):
                    continue
                try:
                    price = float(r["price"])
                except (KeyError, ValueError, TypeError):
                    continue
                buckets[ts.replace(minute=0, second=0, microsecond=0)].append(price)
            for hour, prices in buckets.items():
                if (
                    db.query(HourlyAverage)
                    .filter(HourlyAverage.hour_utc == hour)
                    .first()
                    is None
                ):
                    db.add(
                        HourlyAverage(
                            hour_utc=hour,
                            avg_price_cents=sum(prices) / len(prices),
                            sample_count=len(prices),
                        )
                    )
                    inserted += 1
            db.commit()
        day = nxt
    if inserted:
        logger.info(
            "Usage-upload price backfill: %d new hourly rows (%s..%s)",
            inserted,
            start_utc.date(),
            end_utc.date(),
        )
    return inserted


async def poll_and_store() -> None:
    db: Session = SessionLocal()
    try:
        await _backfill_history(db)

        data = await _fetch_with_retry(COMED_BASE, {"type": "5minutefeed"})
        inserted = _upsert_rows(db, data)
        logger.info("Poll complete: %d new rows", inserted)

        # Recompute the full window the ComEd 5-min feed can return (~24h), not
        # just the last 2h. On startup or after downtime the feed backfills many
        # hours at once; a 2h window would leave all but the last two of those
        # hours without an hourly average (gaps in the "price by hour" chart).
        # Cheap and idempotent, so running it every poll keeps the table healed.
        recompute_hourly_averages(db, since_hours_ago=26)
    finally:
        db.close()


def purge_old_data() -> None:
    db: Session = SessionLocal()
    try:
        cutoff_ms = int(
            (
                datetime.now(timezone.utc) - timedelta(days=settings.history_days)
            ).timestamp()
            * 1000
        )
        cutoff_log = datetime.now(timezone.utc) - timedelta(
            days=settings.history_days * 2
        )

        # NOTE: hourly_averages is intentionally NOT purged. It is tiny (~24 rows/day)
        # and is the historic price record we join uploaded usage against for the
        # usage-vs-price and savings insights — retaining it lets that comparison
        # window grow over time. Only the high-volume price_5min feed is trimmed.
        r1 = db.execute(
            text("DELETE FROM price_5min WHERE millis_utc < :cutoff"),
            {"cutoff": cutoff_ms},
        )
        r3 = db.execute(
            text("DELETE FROM alert_log WHERE sent_at < :cutoff"),
            {"cutoff": cutoff_log},
        )
        db.commit()
        logger.info(
            "Purge: %d price_5min rows, %d alert log rows deleted (hourly_averages retained)",
            r1.rowcount,
            r3.rowcount,
        )
    finally:
        db.close()
