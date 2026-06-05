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
    """Classify a price (cents/kWh) on the 5-tier SEMANTIC scale.

    Shared with the UI (DESIGN_SYSTEM.md). Each tier owns its lower bound:
    Negative <0 | Cheap 0–3 | Moderate 3–8 | High 8–15 | Spike 15+.
    ``color_class`` is the CSS token suffix, used as ``var(--<color_class>)``.
    """
    if price < 0:
        return {
            "level": "negative",
            "emoji": "⚡",
            "label": "Negative",
            "recommendation": "The grid is paying you — run everything now.",
            "color_class": "neg",
        }
    elif price < 3:
        return {
            "level": "cheap",
            "emoji": "🟢",
            "label": "Cheap",
            "recommendation": "Cheap — good time to run appliances.",
            "color_class": "cheap",
        }
    elif price < 8:
        return {
            "level": "moderate",
            "emoji": "🟡",
            "label": "Moderate",
            "recommendation": "Moderate — use power as needed.",
            "color_class": "moderate",
        }
    elif price < 15:
        return {
            "level": "high",
            "emoji": "🟠",
            "label": "High",
            "recommendation": "High — reduce non-essential usage.",
            "color_class": "high",
        }
    else:
        return {
            "level": "spike",
            "emoji": "🔴",
            "label": "Spike",
            "recommendation": "Spike — avoid running large appliances.",
            "color_class": "spike",
        }


@router.get("", response_model=DecisionResponse)
def get_decision(db: Session = Depends(get_db)):
    row = db.query(Price5Min).order_by(Price5Min.millis_utc.desc()).first()
    if row is None:
        raise HTTPException(status_code=503, detail="No price data available")
    classification = _classify(row.price_cents)
    return DecisionResponse(current_price=row.price_cents, **classification)
