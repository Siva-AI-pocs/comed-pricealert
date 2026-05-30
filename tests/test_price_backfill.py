"""Tests for the on-upload ComEd price backfill (poller.backfill_hourly_prices)."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import app.services.poller as poller
from app.models import HourlyAverage


def _rows_for_hour(hour_utc_naive):
    """Two 5-min ComEd rows in one hour: prices 1.0 and 3.0 → hourly avg 2.0."""
    base = hour_utc_naive.replace(tzinfo=timezone.utc)
    return [
        {"millisUTC": str(int(base.timestamp() * 1000)), "price": "1.0"},
        {
            "millisUTC": str(int((base + timedelta(minutes=5)).timestamp() * 1000)),
            "price": "3.0",
        },
    ]


class TestBackfillHourlyPrices:
    async def test_inserts_hourly_average_from_5min(self, db, monkeypatch):
        hour = datetime(2026, 5, 15, 0, 0)
        monkeypatch.setattr(
            poller, "_fetch_with_retry", AsyncMock(return_value=_rows_for_hour(hour))
        )

        n = await poller.backfill_hourly_prices(
            db, datetime(2026, 5, 15, 0, 0), datetime(2026, 5, 15, 12, 0)
        )
        assert n >= 1
        ha = db.query(HourlyAverage).filter(HourlyAverage.hour_utc == hour).first()
        assert ha is not None
        assert ha.avg_price_cents == 2.0
        assert ha.sample_count == 2

    async def test_idempotent_skips_covered_day(self, db, monkeypatch):
        hour = datetime(2026, 5, 15, 0, 0)
        fetch = AsyncMock(return_value=_rows_for_hour(hour))
        monkeypatch.setattr(poller, "_fetch_with_retry", fetch)

        await poller.backfill_hourly_prices(
            db, datetime(2026, 5, 15, 0, 0), datetime(2026, 5, 15, 12, 0)
        )
        calls_after_first = fetch.call_count
        # Second run over the same day must not re-fetch and must insert nothing.
        n2 = await poller.backfill_hourly_prices(
            db, datetime(2026, 5, 15, 0, 0), datetime(2026, 5, 15, 12, 0)
        )
        assert n2 == 0
        assert fetch.call_count == calls_after_first  # day already covered → no fetch

    async def test_caps_to_max_days(self, db, monkeypatch):
        fetch = AsyncMock(return_value=[])  # empty → just count day fetches
        monkeypatch.setattr(poller, "_fetch_with_retry", fetch)

        end = datetime(2026, 5, 15, 0, 0)
        start = end - timedelta(days=10)
        await poller.backfill_hourly_prices(db, start, end, max_days=2)
        # Capped window = end-2d .. end inclusive → 2026-05-13, 14, 15 = 3 day-fetches.
        assert fetch.call_count == 3

    async def test_none_range_is_noop(self, db, monkeypatch):
        fetch = AsyncMock(return_value=[])
        monkeypatch.setattr(poller, "_fetch_with_retry", fetch)
        assert await poller.backfill_hourly_prices(db, None, None) == 0
        assert fetch.call_count == 0
