"""Source-agnostic upsert for interval usage data.

Every future source (Bayou, CMD OAuth, EAGLE-200, etc.) calls
`ingest_intervals(...)` with the same tuple shape — the parser/client
layer normalizes to it, and this module is the only place that touches
the usage tables.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import UsageInterval, UsageMeter
from app.services.espi_parser import IntervalTuple


@dataclass
class IngestResult:
    meter_ids: list[int]
    intervals_inserted: int
    range_start_utc: datetime | None
    range_end_utc: datetime | None


def _get_or_create_meter(db: Session, user_id: int, usage_point_id: str) -> UsageMeter:
    meter = (
        db.query(UsageMeter)
        .filter(UsageMeter.user_id == user_id, UsageMeter.espi_usage_point_id == usage_point_id)
        .first()
    )
    if meter:
        return meter
    meter = UsageMeter(user_id=user_id, espi_usage_point_id=usage_point_id)
    db.add(meter)
    db.flush()
    return meter


def ingest_intervals(db: Session, user_id: int, source: str, tuples: Iterable[IntervalTuple]) -> IngestResult:
    by_point: dict[str, list[IntervalTuple]] = {}
    for t in tuples:
        by_point.setdefault(t.usage_point_id, []).append(t)

    total_inserted = 0
    meter_ids: list[int] = []
    overall_start: datetime | None = None
    overall_end: datetime | None = None

    for usage_point_id, items in by_point.items():
        meter = _get_or_create_meter(db, user_id, usage_point_id)
        meter_ids.append(meter.id)

        rows = [
            {
                "meter_id": meter.id,
                "start_utc": t.start_utc,
                "duration_seconds": t.duration_seconds,
                "wh": t.wh,
                "source": source,
            }
            for t in items
        ]
        if not rows:
            continue

        stmt = pg_insert(UsageInterval).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_usage_interval_meter_start",
            set_={
                "duration_seconds": stmt.excluded.duration_seconds,
                "wh": stmt.excluded.wh,
                "source": stmt.excluded.source,
            },
        )
        result = db.execute(stmt)
        total_inserted += result.rowcount or 0

        starts = [t.start_utc for t in items]
        s_min, s_max = min(starts), max(starts)
        overall_start = s_min if overall_start is None or s_min < overall_start else overall_start
        overall_end = s_max if overall_end is None or s_max > overall_end else overall_end

    db.commit()
    return IngestResult(
        meter_ids=meter_ids,
        intervals_inserted=total_inserted,
        range_start_utc=overall_start,
        range_end_utc=overall_end,
    )
