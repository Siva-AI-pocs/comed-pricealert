from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Subscription
from app.schemas import SubscribeRequest, SubscriptionOut
from app.services.notifier import send_confirmation

router = APIRouter(prefix="/api", tags=["subscriptions"])


@router.post("/subscribe", response_model=SubscriptionOut)
async def subscribe(req: SubscribeRequest, db: Session = Depends(get_db)):
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
        db.commit()
        db.refresh(existing)
        return existing

    sub = Subscription(
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
def unsubscribe(sub_id: int, db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.active = False
    db.commit()
    return {"message": "Unsubscribed successfully"}


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(db: Session = Depends(get_db)):
    return db.query(Subscription).order_by(Subscription.created_at.desc()).all()
