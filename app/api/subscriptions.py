import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_optional_user
from app.database import get_db
from app.models import Subscription, User
from app.schemas import SubscribeRequest, SubscriptionOut
from app.services.notifier import _build_message, _log_alert, _send_email, _send_telegram, _send_whatsapp, send_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["subscriptions"])


@router.post("/subscribe", response_model=SubscriptionOut)
async def subscribe(req: SubscribeRequest, db: Session = Depends(get_db), current_user: User | None = Depends(get_optional_user)):
    if not req.has_channel():
        raise HTTPException(
            status_code=422,
            detail="At least one notification channel is required: email, telegram_chat_id, or whatsapp_number",
        )

    # Upsert by email if provided, else by telegram_chat_id, else by whatsapp_number
    existing = None
    if req.email:
        existing = db.query(Subscription).filter(Subscription.email == req.email).first()
    elif req.telegram_chat_id:
        existing = db.query(Subscription).filter(
            Subscription.telegram_chat_id == req.telegram_chat_id
        ).first()
    elif req.whatsapp_number:
        existing = db.query(Subscription).filter(
            Subscription.whatsapp_number == req.whatsapp_number
        ).first()

    if existing:
        existing.email = req.email or existing.email
        existing.telegram_chat_id = req.telegram_chat_id or existing.telegram_chat_id
        existing.whatsapp_number = req.whatsapp_number or existing.whatsapp_number
        existing.threshold_cents = req.threshold_cents
        existing.high_threshold_cents = req.high_threshold_cents
        existing.active = True
        if current_user and existing.user_id is None:
            existing.user_id = current_user.id
        db.commit()
        db.refresh(existing)
        return existing

    sub = Subscription(
        user_id=current_user.id if current_user else None,
        email=req.email,
        telegram_chat_id=req.telegram_chat_id,
        whatsapp_number=req.whatsapp_number,
        threshold_cents=req.threshold_cents,
        high_threshold_cents=req.high_threshold_cents,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    await send_confirmation(sub)
    return sub


@router.delete("/subscribe/{sub_id}")
def unsubscribe(sub_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    sub.active = False
    db.commit()
    return {"message": "Unsubscribed successfully"}


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == current_user.id, Subscription.active == True)  # noqa: E712
        .order_by(Subscription.created_at.desc())
        .all()
    )


@router.post("/subscriptions/{sub_id}/alert")
async def send_manual_alert(sub_id: int, db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.active == True).first()  # noqa: E712
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    # Fetch current price
    current_price = db.execute(
        text("SELECT price_cents FROM price_5min ORDER BY millis_utc DESC LIMIT 1")
    ).scalar()
    if current_price is None:
        raise HTTPException(status_code=503, detail="No price data available yet")

    # Fetch current hour avg
    now = datetime.now(timezone.utc)
    current_hour_start = now.replace(minute=0, second=0, microsecond=0)
    hourly_avg = db.execute(
        text("SELECT AVG(price_cents) FROM price_5min WHERE millis_utc >= :start"),
        {"start": int(current_hour_start.timestamp() * 1000)},
    ).scalar()
    hourly_avg = round(hourly_avg, 2) if hourly_avg is not None else None

    dashboard_url = "https://comed-pricealert.onrender.com"
    message = _build_message(current_price, sub.threshold_cents, dashboard_url, "low", hourly_avg)

    results = {}
    any_sent = False

    if sub.telegram_chat_id:
        ok, err = await _send_telegram(sub.telegram_chat_id, message)
        _log_alert(db, sub.id, current_price, "telegram", ok, err)
        results["telegram"] = "ok" if ok else err
        if ok:
            any_sent = True
            logger.info("Manual Telegram alert sent: sub_id=%d", sub.id)
        else:
            logger.warning("Manual Telegram alert failed: sub_id=%d err=%s", sub.id, err)

    if sub.whatsapp_number:
        ok, err = await _send_whatsapp(sub.whatsapp_number, message)
        _log_alert(db, sub.id, current_price, "whatsapp", ok, err)
        results["whatsapp"] = "ok" if ok else err
        if ok:
            any_sent = True
            logger.info("Manual WhatsApp alert sent: sub_id=%d", sub.id)
        else:
            logger.warning("Manual WhatsApp alert failed: sub_id=%d err=%s", sub.id, err)

    if sub.email:
        ok, err = _send_email(sub.email, current_price, sub.threshold_cents, dashboard_url)
        _log_alert(db, sub.id, current_price, "email", ok, err)
        results["email"] = "ok" if ok else err
        if ok:
            any_sent = True
            logger.info("Manual email alert sent: sub_id=%d", sub.id)
        else:
            logger.warning("Manual email alert failed: sub_id=%d err=%s", sub.id, err)

    if any_sent:
        sub.last_alerted_at = now
        db.commit()

    return {"price_cents": current_price, "hourly_avg": hourly_avg, "channels": results}
