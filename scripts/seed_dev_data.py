"""Seed a local/dev database with the data the app needs to be usable.

Idempotent — safe to re-run. Reads DATABASE_URL from .env (currently the local
Dockerized Postgres). Run from the repo root:

    .\\.venv\\Scripts\\python.exe -m scripts.seed_dev_data

Steps:
  1. init_db()                      — create tables + run idempotent migrations
  2. poll_and_store()              — backfill ~7 days of real ComEd 5-min prices
                                     + recompute hourly averages (live public API)
  3. forecast_baseline.run()       — write a 48h baseline forecast from that history
  4. ensure_demo_user()            — a demo login + one subscription for the
                                     auth-gated pages (skipped if it already exists)
"""

import asyncio
import logging

from sqlalchemy import func

from app.auth.security import get_password_hash
from app.config import settings
from app.database import SessionLocal, init_db
from app.models import HourlyAverage, Price5Min, PriceForecast, Subscription, User
from app.services import forecast_baseline
from app.services.aggregator import recompute_hourly_averages
from app.services.poller import poll_and_store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("seed")

# Use a syntactically valid public-TLD address: EmailStr (email-validator) rejects
# special-use domains like .local at the login endpoint.
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


def ensure_demo_user(db) -> User:
    user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if user is None:
        user = User(email=DEMO_EMAIL, hashed_password=get_password_hash(DEMO_PASSWORD))
        db.add(user)
        db.commit()
        db.refresh(user)
        log.info("Created demo user %s (password: %s)", DEMO_EMAIL, DEMO_PASSWORD)
    else:
        log.info("Demo user %s already exists", DEMO_EMAIL)

    has_sub = (
        db.query(Subscription).filter(Subscription.user_id == user.id).first()
        is not None
    )
    if not has_sub:
        db.add(
            Subscription(
                user_id=user.id,
                email=DEMO_EMAIL,
                threshold_cents=3.0,
                high_threshold_cents=10.0,
                notify_negative=True,
                active=True,
            )
        )
        db.commit()
        log.info("Created demo subscription (low 3c / high 10c, negative-alert on)")
    return user


def main() -> None:
    log.info("1/4 init_db (create tables + migrations)")
    init_db()

    log.info("2/4 poll_and_store (backfill ~7d of ComEd prices + hourly averages)")
    asyncio.run(poll_and_store())

    db = SessionLocal()
    try:
        # poll_and_store only recomputes the last 2h of hourly averages; widen it
        # to the full retained window so the Now-tab hourly chart is fully populated
        # from the price_5min history we just backfilled.
        log.info("3/5 recompute hourly averages over last %dd", settings.history_days)
        recompute_hourly_averages(db, since_hours_ago=settings.history_days * 24)

        log.info("4/5 forecast_baseline.run (48h baseline forecast)")
        forecast_baseline.run(db)

        log.info("5/5 ensure demo user + subscription")
        ensure_demo_user(db)

        prices = db.query(func.count(Price5Min.millis_utc)).scalar()
        hourly = db.query(func.count(HourlyAverage.hour_utc)).scalar()
        forecasts = db.query(func.count(PriceForecast.id)).scalar()
        users = db.query(func.count(User.id)).scalar()
        log.info(
            "DONE — price_5min=%s, hourly_averages=%s, price_forecast=%s, users=%s",
            prices,
            hourly,
            forecasts,
            users,
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
