"""
Integration tests for POST /internal/poll and POST /internal/notify.
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text

VALID_TOKEN = "test-secret-token"


@pytest.fixture(autouse=True)
def set_internal_secret(monkeypatch):
    """Inject a known secret into settings for every test in this module."""
    from app.config import settings
    monkeypatch.setattr(settings, "internal_secret", VALID_TOKEN)


def _insert_price(db, price_cents: float):
    ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    db.execute(
        text("INSERT INTO price_5min (millis_utc, price_cents, recorded_at) "
             "VALUES (:m, :p, :n) ON CONFLICT (millis_utc) DO NOTHING"),
        {"m": ms, "p": price_cents, "n": datetime.now(timezone.utc)},
    )
    db.commit()


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestAuthGuard:
    def test_poll_no_token_returns_401(self, client):
        r = client.post("/internal/poll")
        assert r.status_code == 401

    def test_poll_wrong_token_returns_401(self, client):
        r = client.post("/internal/poll", headers={"X-Internal-Token": "wrong"})
        assert r.status_code == 401

    def test_notify_no_token_returns_401(self, client):
        r = client.post("/internal/notify")
        assert r.status_code == 401

    def test_notify_wrong_token_returns_401(self, client):
        r = client.post("/internal/notify", headers={"X-Internal-Token": "bad"})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /internal/poll
# ---------------------------------------------------------------------------

class TestInternalPoll:
    HEADERS = {"X-Internal-Token": VALID_TOKEN}

    def test_poll_returns_ok(self, client):
        with patch("app.api.internal.poll_and_store", new_callable=AsyncMock):
            r = client.post("/internal/poll", headers=self.HEADERS)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_poll_calls_poll_and_store(self, client):
        with patch("app.api.internal.poll_and_store", new_callable=AsyncMock) as mock_poll:
            client.post("/internal/poll", headers=self.HEADERS)
        mock_poll.assert_called_once()

    def test_poll_returns_500_on_error(self, client):
        with patch("app.api.internal.poll_and_store", new_callable=AsyncMock,
                   side_effect=RuntimeError("ComEd API down")):
            r = client.post("/internal/poll", headers=self.HEADERS)
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# POST /internal/notify
# ---------------------------------------------------------------------------

class TestInternalNotify:
    HEADERS = {"X-Internal-Token": VALID_TOKEN}

    def test_notify_skipped_when_no_price_data(self, client):
        r = client.post("/internal/notify", headers=self.HEADERS)
        assert r.status_code == 200
        assert r.json()["status"] == "skipped"

    def test_notify_returns_ok_with_price(self, client, db):
        _insert_price(db, 3.5)
        with patch("app.api.internal.check_and_notify", new_callable=AsyncMock):
            r = client.post("/internal/notify", headers=self.HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["price_cents"] == pytest.approx(3.5)

    def test_notify_calls_check_and_notify(self, client, db):
        _insert_price(db, 2.0)
        with patch("app.api.internal.check_and_notify", new_callable=AsyncMock) as mock_notify:
            client.post("/internal/notify", headers=self.HEADERS)
        mock_notify.assert_called_once()

    def test_notify_returns_500_on_error(self, client, db):
        _insert_price(db, 2.0)
        with patch("app.api.internal.check_and_notify", new_callable=AsyncMock,
                   side_effect=RuntimeError("DB error")):
            r = client.post("/internal/notify", headers=self.HEADERS)
        assert r.status_code == 500
