"""
Render Cron Job: check price thresholds and send alerts.
Schedule: top of every hour  (0 * * * *)
"""
import asyncio
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


async def main() -> None:
    from sqlalchemy import text
    from app.database import init_db, SessionLocal
    from app.services.notifier import check_and_notify

    init_db()
    db = SessionLocal()
    try:
        latest = db.execute(
            text("SELECT price_cents FROM price_5min ORDER BY millis_utc DESC LIMIT 1")
        ).scalar()
        if latest is None:
            logging.warning("No price data in DB — skipping alert check")
            return
        await check_and_notify(db, float(latest))
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
