"""Forecast read API. Serves the most recent forecast batch from the
``price_forecast`` table (no model on the request path) plus a rolling
accuracy summary scored against settled real-time prices."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PriceActual, PriceForecast
from app.schemas import ForecastAccuracy, ForecastAccuracyDay, ForecastPoint

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("", response_model=list[ForecastPoint])
def get_forecast(
    hours: int = Query(default=48, ge=1, le=168),
    db: Session = Depends(get_db),
):
    latest = db.query(func.max(PriceForecast.generated_at)).scalar()
    if latest is None:
        return []
    return (
        db.query(PriceForecast)
        .filter(PriceForecast.generated_at == latest)
        .order_by(PriceForecast.target_ts.asc())
        .limit(hours)
        .all()
    )


@router.get("/accuracy", response_model=ForecastAccuracy)
def get_accuracy(db: Session = Depends(get_db)):
    """MAE of the model (and day-ahead) vs settled real-time price, last 7 days.

    Uses the first forecast generated for each target hour (closest to a true
    forward prediction) joined to the settled actual.
    """
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)

    # Earliest forecast per target_ts (the genuine ahead-of-time prediction).
    earliest = (
        db.query(
            PriceForecast.target_ts.label("target_ts"),
            func.min(PriceForecast.generated_at).label("gen"),
        )
        .filter(PriceForecast.target_ts >= cutoff)
        .group_by(PriceForecast.target_ts)
        .subquery()
    )
    rows = (
        db.query(PriceForecast, PriceActual.rt_price)
        .join(
            earliest,
            (PriceForecast.target_ts == earliest.c.target_ts)
            & (PriceForecast.generated_at == earliest.c.gen),
        )
        .join(PriceActual, PriceActual.target_ts == PriceForecast.target_ts)
        .order_by(PriceForecast.target_ts.asc())
        .all()
    )

    if not rows:
        return ForecastAccuracy(mae=None, vs_day_ahead_pct=None, daily=[])

    model_errs: list[float] = []
    da_errs: list[float] = []
    by_day: dict[str, dict[str, list[float]]] = {}
    for fc, rt in rows:
        me = abs(fc.p50 - rt)
        model_errs.append(me)
        day = fc.target_ts.strftime("%Y-%m-%d")
        slot = by_day.setdefault(day, {"model": [], "da": []})
        slot["model"].append(me)
        if fc.da_lmp is not None:
            de = abs(fc.da_lmp - rt)
            da_errs.append(de)
            slot["da"].append(de)

    mae = round(sum(model_errs) / len(model_errs), 2)
    vs_da = None
    if da_errs:
        da_mae = sum(da_errs) / len(da_errs)
        if da_mae > 0:
            vs_da = round((da_mae - mae) / da_mae * 100)

    daily = [
        ForecastAccuracyDay(
            day=day,
            model=round(sum(v["model"]) / len(v["model"]), 2) if v["model"] else None,
            da=round(sum(v["da"]) / len(v["da"]), 2) if v["da"] else None,
        )
        for day, v in sorted(by_day.items())
    ]
    return ForecastAccuracy(mae=mae, vs_day_ahead_pct=vs_da, daily=daily)
