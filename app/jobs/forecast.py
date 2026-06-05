"""Cron entrypoint: recompute and store the baseline 48h forecast.

Runs as a Render cron (see render.yaml) and, for local/dev, is also scheduled
by app/services/scheduler.py. Heavy model training stays offline; this only
writes rows the API reads.
"""

import logging

from app.database import SessionLocal
from app.services import forecast_baseline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    db = SessionLocal()
    try:
        n = forecast_baseline.run(db)
        logger.info("Forecast refresh wrote %d rows", n)
    finally:
        db.close()


if __name__ == "__main__":
    main()
