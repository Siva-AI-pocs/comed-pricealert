"""
Internal trigger endpoints called by cron-job.org on a schedule.

POST /internal/poll    — fetch latest ComEd prices, save to DB (every 5 min)
POST /internal/notify  — check thresholds, send alerts (every hour at :00)

Protected by X-Internal-Token header matched against INTERNAL_SECRET env var.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.notifier import check_and_notify
from app.services.poller import poll_and_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])


def _verify_token(x_internal_token: str = Header(default="")):
    if not settings.internal_secret:
        raise HTTPException(status_code=503, detail="INTERNAL_SECRET not configured")
    if x_internal_token != settings.internal_secret:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/poll", dependencies=[Depends(_verify_token)])
async def trigger_poll():
    """Fetch latest ComEd prices and save to DB. Called every 5 minutes."""
    try:
        await poll_and_store()
        return {"status": "ok"}
    except Exception as exc:
        logger.exception("Error in /internal/poll")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/notify", dependencies=[Depends(_verify_token)])
async def trigger_notify(db: Session = Depends(get_db)):
    """Check price thresholds and send alerts. Called every hour at :00."""
    latest = db.execute(
        text("SELECT price_cents FROM price_5min ORDER BY millis_utc DESC LIMIT 1")
    ).scalar()
    if latest is None:
        return {"status": "skipped", "reason": "no price data yet"}
    try:
        await check_and_notify(db, float(latest))
        return {"status": "ok", "price_cents": latest}
    except Exception as exc:
        logger.exception("Error in /internal/notify")
        raise HTTPException(status_code=500, detail=str(exc))
