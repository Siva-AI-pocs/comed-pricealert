"""
Integration tests for subscription API endpoints:
  POST   /api/subscribe
  DELETE /api/subscribe/{id}
  GET    /api/subscriptions
  POST   /api/subscriptions/{id}/alert
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text

from app.models import Subscription, AlertLog


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _insert_price(db, price_cents: float):
    ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    db.execute(
        text(
            "INSERT INTO price_5min (millis_utc, price_cents, recorded_at) "
            "VALUES (:m, :p, :n) ON CONFLICT (millis_utc) DO NOTHING"
        ),
        {"m": ms, "p": price_cents, "n": datetime.now(timezone.utc)},
    )
    db.commit()


# ---------------------------------------------------------------------------
# POST /api/subscribe
# ---------------------------------------------------------------------------


class TestSubscribe:
    def test_subscribe_with_email(self, client):
        with patch("app.services.notifier._send_email", return_value=(True, "")):
            r = client.post(
                "/api/subscribe",
                json={"email": "user@test.com", "threshold_cents": 0.0},
            )
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "user@test.com"
        assert data["active"] is True

    def test_subscribe_with_telegram(self, client):
        with patch("app.api.subscriptions.send_confirmation", new_callable=AsyncMock):
            r = client.post(
                "/api/subscribe",
                json={"telegram_chat_id": "123456", "threshold_cents": 1.0},
            )
        assert r.status_code == 200
        assert r.json()["telegram_chat_id"] == "123456"

    def test_subscribe_with_whatsapp(self, client):
        with patch("app.api.subscriptions.send_confirmation", new_callable=AsyncMock):
            r = client.post("/api/subscribe", json={"whatsapp_number": "+13125550000"})
        assert r.status_code == 200
        assert r.json()["whatsapp_number"] == "+13125550000"

    def test_subscribe_no_channel_returns_422(self, client):
        r = client.post("/api/subscribe", json={"threshold_cents": 0.0})
        assert r.status_code == 422

    def test_subscribe_invalid_whatsapp_returns_422(self, client):
        r = client.post(
            "/api/subscribe", json={"whatsapp_number": "13125550000"}
        )  # missing +
        assert r.status_code == 422

    def test_subscribe_sets_high_threshold(self, client):
        with patch("app.services.notifier._send_email", return_value=(True, "")):
            r = client.post(
                "/api/subscribe",
                json={
                    "email": "hi@test.com",
                    "threshold_cents": 0.0,
                    "high_threshold_cents": 10.0,
                },
            )
        assert r.status_code == 200
        assert r.json()["high_threshold_cents"] == pytest.approx(10.0)

    def test_subscribe_upserts_existing_email(self, client):
        payload = {"email": "upsert@test.com", "threshold_cents": 0.0}
        with patch("app.services.notifier._send_email", return_value=(True, "")):
            r1 = client.post("/api/subscribe", json=payload)
        id1 = r1.json()["id"]

        # Update threshold — should reuse same record
        payload["threshold_cents"] = 3.0
        with patch("app.services.notifier._send_email", return_value=(True, "")):
            r2 = client.post("/api/subscribe", json=payload)
        assert r2.json()["id"] == id1
        assert r2.json()["threshold_cents"] == pytest.approx(3.0)

    def test_subscribe_reactivates_inactive_subscription(self, client, db):
        sub = Subscription(
            email="reactivate@test.com", threshold_cents=0.0, active=False
        )
        db.add(sub)
        db.commit()

        with patch("app.services.notifier._send_email", return_value=(True, "")):
            r = client.post(
                "/api/subscribe",
                json={"email": "reactivate@test.com", "threshold_cents": 1.0},
            )
        assert r.json()["active"] is True


# ---------------------------------------------------------------------------
# DELETE /api/subscribe/{id}
# ---------------------------------------------------------------------------


def _login(client, email="owner@test.com", password="ownerpass1") -> int:
    """Register a user (sets the auth cookie on the client) and return its id.
    /api/subscriptions and DELETE /api/subscribe require auth + ownership."""
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestUnsubscribe:
    def _create_sub(self, db, user_id) -> int:
        sub = Subscription(
            user_id=user_id, email="del@test.com", threshold_cents=0.0, active=True
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return sub.id

    def test_unsubscribe_success(self, client, db):
        uid = _login(client)
        sub_id = self._create_sub(db, uid)
        r = client.delete(f"/api/subscribe/{sub_id}")
        assert r.status_code == 200
        assert "Unsubscribed" in r.json()["message"]

    def test_unsubscribe_sets_active_false(self, client, db):
        uid = _login(client)
        sub_id = self._create_sub(db, uid)
        client.delete(f"/api/subscribe/{sub_id}")
        sub = db.query(Subscription).filter_by(id=sub_id).first()
        assert sub.active is False

    def test_unsubscribe_not_found_returns_404(self, client):
        _login(client)
        r = client.delete("/api/subscribe/99999")
        assert r.status_code == 404

    def test_unsubscribe_requires_auth(self, client, db):
        # No login → 401 (endpoint is auth-gated).
        sub = Subscription(email="x@test.com", threshold_cents=0.0, active=True)
        db.add(sub)
        db.commit()
        db.refresh(sub)
        assert client.delete(f"/api/subscribe/{sub.id}").status_code == 401


# ---------------------------------------------------------------------------
# GET /api/subscriptions (auth-scoped to the current user's ACTIVE subs)
# ---------------------------------------------------------------------------


class TestListSubscriptions:
    def test_empty_list_when_no_subs(self, client):
        _login(client)
        r = client.get("/api/subscriptions")
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_users_subscriptions(self, client, db):
        uid = _login(client)
        for i in range(3):
            db.add(
                Subscription(
                    user_id=uid, email=f"user{i}@test.com", threshold_cents=float(i)
                )
            )
        db.commit()
        data = client.get("/api/subscriptions").json()
        assert len(data) == 3

    def test_excludes_inactive_subscriptions(self, client, db):
        uid = _login(client)
        db.add(
            Subscription(
                user_id=uid, email="active@test.com", threshold_cents=0.0, active=True
            )
        )
        db.add(
            Subscription(
                user_id=uid,
                email="inactive@test.com",
                threshold_cents=0.0,
                active=False,
            )
        )
        db.commit()
        data = client.get("/api/subscriptions").json()
        assert len(data) == 1  # only the active subscription is returned

    def test_excludes_other_users_subscriptions(self, client, db):
        uid = _login(client)
        db.add(
            Subscription(
                user_id=uid, email="mine@test.com", threshold_cents=0.0, active=True
            )
        )
        db.add(
            Subscription(
                user_id=uid + 999,
                email="theirs@test.com",
                threshold_cents=0.0,
                active=True,
            )
        )
        db.commit()
        data = client.get("/api/subscriptions").json()
        assert len(data) == 1

    def test_response_fields(self, client, db):
        uid = _login(client)
        db.add(Subscription(user_id=uid, email="fields@test.com", threshold_cents=1.5))
        db.commit()
        row = client.get("/api/subscriptions").json()[0]
        for field in (
            "id",
            "email",
            "telegram_chat_id",
            "whatsapp_number",
            "threshold_cents",
            "high_threshold_cents",
            "active",
            "created_at",
            "last_alerted_at",
        ):
            assert field in row, f"Missing field: {field}"

    def test_requires_auth(self, client):
        assert client.get("/api/subscriptions").status_code == 401


# ---------------------------------------------------------------------------
# POST /api/subscriptions/{id}/alert  (manual Send Now)
# ---------------------------------------------------------------------------


class TestManualAlert:
    def _create_active_sub(self, db) -> int:
        sub = Subscription(
            telegram_chat_id="manual111", threshold_cents=0.0, active=True
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return sub.id

    def test_returns_404_for_unknown_sub(self, client):
        r = client.post("/api/subscriptions/99999/alert")
        assert r.status_code == 404

    def test_returns_503_when_no_price_data(self, client, db):
        sub_id = self._create_active_sub(db)
        r = client.post(f"/api/subscriptions/{sub_id}/alert")
        assert r.status_code == 503

    def test_sends_alert_and_returns_result(self, client, db):
        sub_id = self._create_active_sub(db)
        _insert_price(db, 3.0)

        # patch at the module that imported the function
        with patch(
            "app.api.subscriptions._send_telegram",
            new_callable=AsyncMock,
            return_value=(True, ""),
        ):
            r = client.post(f"/api/subscriptions/{sub_id}/alert")

        assert r.status_code == 200
        data = r.json()
        assert "price_cents" in data
        assert "channels" in data
        assert data["channels"]["telegram"] == "ok"

    def test_manual_alert_logs_to_db(self, client, db):
        sub_id = self._create_active_sub(db)
        _insert_price(db, 3.0)

        with patch(
            "app.api.subscriptions._send_telegram",
            new_callable=AsyncMock,
            return_value=(True, ""),
        ):
            client.post(f"/api/subscriptions/{sub_id}/alert")

        logs = db.query(AlertLog).all()
        assert len(logs) == 1
        assert logs[0].channel == "telegram"

    def test_manual_alert_updates_last_alerted_at(self, client, db):
        sub_id = self._create_active_sub(db)
        _insert_price(db, 3.0)

        with patch(
            "app.api.subscriptions._send_telegram",
            new_callable=AsyncMock,
            return_value=(True, ""),
        ):
            client.post(f"/api/subscriptions/{sub_id}/alert")

        sub = db.query(Subscription).filter_by(id=sub_id).first()
        assert sub.last_alerted_at is not None

    def test_inactive_sub_returns_404(self, client, db):
        sub = Subscription(
            telegram_chat_id="inactive222", threshold_cents=0.0, active=False
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        _insert_price(db, 3.0)
        r = client.post(f"/api/subscriptions/{sub.id}/alert")
        assert r.status_code == 404
