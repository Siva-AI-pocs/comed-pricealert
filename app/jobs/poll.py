"""
Render Cron Job: poll ComEd API, store prices, recompute hourly averages.
Schedule: every 5 minutes  (*/5 * * * *)
"""
import asyncio
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


async def main() -> None:
    from app.database import init_db
    from app.services.poller import poll_and_store
    init_db()
    await poll_and_store()


if __name__ == "__main__":
    asyncio.run(main())
