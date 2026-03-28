import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings

logger = logging.getLogger(__name__)


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")

    scheduler.add_job(
        _run_poll,
        trigger=IntervalTrigger(seconds=settings.poll_interval_seconds),
        id="comed_poller",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),  # run immediately on startup
    )

    scheduler.add_job(
        _run_purge,
        trigger=CronTrigger(hour=3, minute=0),
        id="data_purger",
        replace_existing=True,
    )

    return scheduler


async def _run_poll() -> None:
    from app.services.poller import poll_and_store
    try:
        await poll_and_store()
    except Exception:
        logger.exception("Unhandled error in poll_and_store")


def _run_purge() -> None:
    from app.services.poller import purge_old_data
    try:
        purge_old_data()
    except Exception:
        logger.exception("Unhandled error in purge_old_data")
