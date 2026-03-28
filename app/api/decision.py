from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Price5Min

router = APIRouter(prefix="/api/decision", tags=["decision"])


class DecisionResponse(BaseModel):
    current_price: float
    level: str
    emoji: str
    label: str
    recommendation: str
    color_class: str


def _classify(price: float) -> dict:
    if price <= 0:
        return {
            "level": "negative",
            "emoji": "⚡",
            "label": "Free / Paid",
            "recommendation": "Electricity is free! Run everything now.",
            "color_class": "green",
        }
    elif price < 2:
        return {
            "level": "cheap",
            "emoji": "🟢",
            "label": "Cheap",
            "recommendation": "Great time to run appliances.",
            "color_class": "green",
        }
    elif price < 5:
        return {
            "level": "normal",
            "emoji": "🟡",
            "label": "Normal",
            "recommendation": "Use electricity as needed.",
            "color_class": "blue",
        }
    elif price < 10:
        return {
            "level": "expensive",
            "emoji": "🔴",
            "label": "Expensive",
            "recommendation": "Avoid non-essential usage.",
            "color_class": "orange",
        }
    else:
        return {
            "level": "spike",
            "emoji": "🚨",
            "label": "Price Spike",
            "recommendation": "Delay all non-critical usage.",
            "color_class": "red",
        }


@router.get("", response_model=DecisionResponse)
def get_decision(db: Session = Depends(get_db)):
    row = db.query(Price5Min).order_by(Price5Min.millis_utc.desc()).first()
    if row is None:
        raise HTTPException(status_code=503, detail="No price data available")
    classification = _classify(row.price_cents)
    return DecisionResponse(current_price=row.price_cents, **classification)
