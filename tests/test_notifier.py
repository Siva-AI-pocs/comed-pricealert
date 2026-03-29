"""
Unit tests for app/services/notifier.py.

External sends (Telegram, WhatsApp, Email) are mocked so no network calls
or credentials are needed.
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.notifier import _build_message, check_and_notify
from app.models import Subscription, AlertLog


# ---------------------------------------------------------------------------
# _build_message
# ---------------------------------------------------------------------------

class TestBuildMessage:
    def test_low_alert_headline(self):
        msg = _build_message(price=-1.0, threshold=0.0, dashboard_url="https://example.com", direction="low")
        assert "Low Price Alert" in msg

    def test_high_alert_headline(self):
        msg = _build_message(price=12.0, threshold=10.0, dashboard_url="https://example.com", direction="high")
        assert "High Price Alert" in msg

    def test_price_displayed(self):
        msg = _build_message(price=3.25, threshold=5.0, dashboard_url="https://example.com", direction="low")
        assert "3.25" in msg

    def test_threshold_in_label(self):
        msg = _build_message(price=-1.0, threshold=0.0, dashboard_url="https://example.com", direction="low")
        assert "0.00" in msg

    def test_dashboard_url_included(self):
        msg = _build_message(price=1.0, threshold=5.0, dashboard_url="https://test.example.com", direction="low")
        assert "https://test.example.com" in msg

    def test_low_trigger_indicator_on_price(self):
        """Price below threshold → indicator appears on 5-Min Price line."""
        msg = _build_message(price=-2.0, threshold=0.0, dashboard_url="https://x.com", direction="low")
        lines = msg.splitlines()
        price_line = next(l for l in lines if "5-Min Price" in l)
        assert "←" in price_line

    def test_low_trigger_indicator_not_on_price_when_above(self):
        """Price above threshold → no indicator on 5-Min Price line."""
        msg = _build_message(price=5.0, threshold=0.0, dashboard_url="https://x.com", direction="low",
                             hourly_avg=-1.0)
        lines = msg.splitlines()
        price_line = next(l for l in lines if "5-Min Price" in l)
        assert "←" not in price_line

    def test_low_trigger_indicator_on_hourly_avg(self):
        """Hourly avg below threshold → indicator appears on Hour Avg line."""
        msg = _build_message(price=5.0, threshold=0.0, dashboard_url="https://x.com",
                             direction="low", hourly_avg=-0.5)
        lines = msg.splitlines()
        avg_line = next(l for l in lines if "Hour Avg" in l)
        assert "←" in avg_line

    def test_high_trigger_indicator_on_price(self):
        """Price above high threshold → indicator on price line."""
        msg = _build_message(price=15.0, threshold=10.0, dashboard_url="https://x.com", direction="high")
        lines = msg.splitlines()
        price_line = next(l for l in lines if "5-Min Price" in l)
        assert "←" in price_line

    def test_high_trigger_indicator_on_hourly_avg(self):
        msg = _build_message(price=5.0, threshold=10.0, dashboard_url="https://x.com",
                             direction="high", hourly_avg=12.0)
        lines = msg.splitlines()
        avg_line = next(l for l in lines if "Hour Avg" in l)
        assert "←" in avg_line

    def test_no_hourly_avg_shows_dash(self):
        msg = _build_message(price=1.0, threshold=5.0, dashboard_url="https://x.com",
                             direction="low", hourly_avg=None)
        assert "Hour Avg:      —" in msg

    def test_hourly_avg_shown_when_provided(self):
        msg = _build_message(price=1.0, threshold=5.0, dashboard_url="https://x.com",
                             direction="low", hourly_avg=2.75)
        assert "2.75" in msg


# ---------------------------------------------------------------------------
# check_and_notify — threshold and cooldown logic
# ---------------------------------------------------------------------------

def _make_sub(db, **kwargs) -> Subscription:
    defaults = dict(
        email="test@example.com",
        telegram_chat_id=None,
        whatsapp_number=None,
        threshold_cents=0.0,
        high_threshold_cents=None,
        active=True,
        last_alerted_at=None,
    )
    defaults.update(kwargs)
    sub = Subscription(**defaults)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _seed_price(db, price: float, hours_ago: float = 0.0):
    """Insert a single price_5min row."""
    from sqlalchemy import text
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    offset_ms = int(hours_ago * 3600 * 1000)
    db.execute(
        text("""
            INSERT INTO price_5min (millis_utc, price_cents, recorded_at)
            VALUES (:millis, :price, :now)
            ON CONFLICT (millis_utc) DO NOTHING
        """),
        {"millis": now_ms - offset_ms, "price": price,
         "now": datetime.now(timezone.utc)},
    )
    db.commit()


class TestCheckAndNotify:
    @pytest.mark.asyncio
    async def test_sends_telegram_when_low_threshold_met(self, db):
        """Alert fires for Telegram when 5-min price is at or below threshold."""
        _make_sub(db, telegram_chat_id="111", threshold_cents=5.0)
        _seed_price(db, price=3.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=3.0)

        mock_tg.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_alert_when_price_above_low_threshold(self, db):
        _make_sub(db, telegram_chat_id="222", threshold_cents=0.0)
        _seed_price(db, price=5.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=5.0)

        mock_tg.assert_not_called()

    @pytest.mark.asyncio
    async def test_sends_when_price_equals_threshold(self, db):
        _make_sub(db, telegram_chat_id="333", threshold_cents=3.0)
        _seed_price(db, price=3.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=3.0)

        mock_tg.assert_called_once()

    @pytest.mark.asyncio
    async def test_sends_high_alert(self, db):
        _make_sub(db, telegram_chat_id="444", threshold_cents=0.0, high_threshold_cents=10.0)
        _seed_price(db, price=12.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=12.0)

        mock_tg.assert_called_once()
        # Message should say "High Price Alert"
        call_args = mock_tg.call_args
        assert "High Price Alert" in call_args[0][1]

    @pytest.mark.asyncio
    async def test_calendar_hour_cooldown_prevents_second_alert(self, db):
        """If already alerted this calendar hour, no second alert fires."""
        now = datetime.now(timezone.utc)
        # last_alerted_at = 30 minutes ago, still within the same hour
        last_alert = now.replace(minute=0, second=0, microsecond=0)  # top of this hour
        _make_sub(db, telegram_chat_id="555", threshold_cents=5.0,
                  last_alerted_at=last_alert)
        _seed_price(db, price=1.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=1.0)

        mock_tg.assert_not_called()

    @pytest.mark.asyncio
    async def test_alert_fires_in_new_calendar_hour(self, db):
        """If last alert was in the PREVIOUS hour, alert fires again."""
        now = datetime.now(timezone.utc)
        previous_hour = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
        _make_sub(db, telegram_chat_id="666", threshold_cents=5.0,
                  last_alerted_at=previous_hour)
        _seed_price(db, price=1.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=1.0)

        mock_tg.assert_called_once()

    @pytest.mark.asyncio
    async def test_inactive_subscription_skipped(self, db):
        _make_sub(db, telegram_chat_id="777", threshold_cents=5.0, active=False)
        _seed_price(db, price=1.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            await check_and_notify(db, current_price=1.0)

        mock_tg.assert_not_called()

    @pytest.mark.asyncio
    async def test_updates_last_alerted_at_on_success(self, db):
        sub = _make_sub(db, telegram_chat_id="888", threshold_cents=5.0)
        _seed_price(db, price=1.0)
        assert sub.last_alerted_at is None

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")):
            await check_and_notify(db, current_price=1.0)

        db.refresh(sub)
        assert sub.last_alerted_at is not None

    @pytest.mark.asyncio
    async def test_does_not_update_last_alerted_at_on_failure(self, db):
        sub = _make_sub(db, telegram_chat_id="999", threshold_cents=5.0)
        _seed_price(db, price=1.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(False, "network error")):
            await check_and_notify(db, current_price=1.0)

        db.refresh(sub)
        assert sub.last_alerted_at is None

    @pytest.mark.asyncio
    async def test_logs_alert_to_db(self, db):
        # telegram-only sub so exactly one log entry is created
        _make_sub(db, telegram_chat_id="101010", threshold_cents=5.0, email=None)
        _seed_price(db, price=1.0)

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")):
            await check_and_notify(db, current_price=1.0)

        logs = db.query(AlertLog).all()
        assert len(logs) == 1
        assert logs[0].channel == "telegram"
        assert logs[0].success is True

    @pytest.mark.asyncio
    async def test_alerts_triggered_by_hourly_avg(self, db):
        """Alert fires when hourly avg is below threshold even if 5-min price is above."""
        _make_sub(db, telegram_chat_id="2020", threshold_cents=2.0)
        # 5-min price above threshold, but insert hourly avg rows below threshold
        # by inserting several price rows for the current hour
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        from sqlalchemy import text
        for i in range(3):
            db.execute(
                text("INSERT INTO price_5min (millis_utc, price_cents, recorded_at) "
                     "VALUES (:m, :p, :n) ON CONFLICT (millis_utc) DO NOTHING"),
                {"m": now_ms - i * 60000, "p": 1.0,
                 "n": datetime.now(timezone.utc)},
            )
        db.commit()

        with patch("app.services.notifier._send_telegram", new_callable=AsyncMock,
                   return_value=(True, "")) as mock_tg:
            # 5-min price is 5.0 (above threshold 2.0), but hourly avg ~1.0 (below)
            await check_and_notify(db, current_price=5.0)

        mock_tg.assert_called_once()

    @pytest.mark.asyncio
    async def test_multiple_channels_all_called(self, db):
        _make_sub(db, email="a@b.com", telegram_chat_id="3030",
                  whatsapp_number="+13125550000", threshold_cents=5.0)
        _seed_price(db, price=1.0)

        with (
            patch("app.services.notifier._send_telegram", new_callable=AsyncMock, return_value=(True, "")) as mock_tg,
            patch("app.services.notifier._send_whatsapp", new_callable=AsyncMock, return_value=(True, "")) as mock_wa,
            patch("app.services.notifier._send_email", return_value=(True, "")) as mock_em,
        ):
            await check_and_notify(db, current_price=1.0)

        mock_tg.assert_called_once()
        mock_wa.assert_called_once()
        mock_em.assert_called_once()
