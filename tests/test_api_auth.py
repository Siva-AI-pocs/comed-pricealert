"""
Integration tests for auth password management endpoints:
  POST /auth/change-password
  POST /auth/forgot-password
  POST /auth/reset-password
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _register(client, email="user@test.com", password="origpass1"):
    """Register a user; the client retains the auth cookie afterwards."""
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


def _request_reset_code(client, email="user@test.com"):
    """Trigger forgot-password and return the generated reset code."""
    with patch(
        "app.services.notifier.send_password_reset_email", return_value=(True, "")
    ) as mock_send:
        r = client.post("/auth/forgot-password", json={"email": email})
    assert r.status_code == 200, r.text
    mock_send.assert_called_once()
    return mock_send.call_args.args[1]  # send_password_reset_email(email, code)


# ---------------------------------------------------------------------------
# POST /auth/change-password
# ---------------------------------------------------------------------------


class TestChangePassword:
    def test_change_password_success(self, client):
        _register(client, password="origpass1")
        r = client.post(
            "/auth/change-password",
            json={"old_password": "origpass1", "new_password": "brandnew9"},
        )
        assert r.status_code == 200
        # Old password no longer works, new one does.
        assert (
            client.post(
                "/auth/login", json={"email": "user@test.com", "password": "origpass1"}
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/auth/login", json={"email": "user@test.com", "password": "brandnew9"}
            ).status_code
            == 200
        )

    def test_change_password_wrong_old(self, client):
        _register(client, password="origpass1")
        r = client.post(
            "/auth/change-password",
            json={"old_password": "wrongpass", "new_password": "brandnew9"},
        )
        assert r.status_code == 401

    def test_change_password_short_new_returns_422(self, client):
        _register(client, password="origpass1")
        r = client.post(
            "/auth/change-password",
            json={"old_password": "origpass1", "new_password": "short"},
        )
        assert r.status_code == 422

    def test_change_password_requires_auth(self, client):
        # Fresh client, no cookie.
        r = client.post(
            "/auth/change-password",
            json={"old_password": "x", "new_password": "brandnew9"},
        )
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/forgot-password
# ---------------------------------------------------------------------------


class TestForgotPassword:
    def test_forgot_known_email_sends_code(self, client, db):
        _register(client, email="known@test.com")
        with patch(
            "app.services.notifier.send_password_reset_email", return_value=(True, "")
        ) as mock_send:
            r = client.post("/auth/forgot-password", json={"email": "known@test.com"})
        assert r.status_code == 200
        mock_send.assert_called_once()
        user = db.query(User).filter(User.email == "known@test.com").first()
        assert user.reset_code_hash is not None
        assert user.reset_code_expires_at is not None

    def test_forgot_unknown_email_returns_404(self, client):
        r = client.post("/auth/forgot-password", json={"email": "nobody@test.com"})
        assert r.status_code == 404

    def test_forgot_send_failure_returns_502(self, client):
        _register(client, email="known@test.com")
        with patch(
            "app.services.notifier.send_password_reset_email",
            return_value=(False, "smtp down"),
        ):
            r = client.post("/auth/forgot-password", json={"email": "known@test.com"})
        assert r.status_code == 502


# ---------------------------------------------------------------------------
# POST /auth/reset-password
# ---------------------------------------------------------------------------


class TestResetPassword:
    def test_reset_with_valid_code(self, client, db):
        _register(client, email="r@test.com", password="origpass1")
        code = _request_reset_code(client, "r@test.com")
        r = client.post(
            "/auth/reset-password",
            json={"email": "r@test.com", "code": code, "new_password": "freshpass9"},
        )
        assert r.status_code == 200
        # Code is consumed and the new password works.
        user = db.query(User).filter(User.email == "r@test.com").first()
        assert user.reset_code_hash is None
        assert user.reset_code_expires_at is None
        assert (
            client.post(
                "/auth/login", json={"email": "r@test.com", "password": "freshpass9"}
            ).status_code
            == 200
        )

    def test_reset_wrong_code(self, client):
        _register(client, email="r@test.com")
        _request_reset_code(client, "r@test.com")
        r = client.post(
            "/auth/reset-password",
            json={
                "email": "r@test.com",
                "code": "000000",
                "new_password": "freshpass9",
            },
        )
        assert r.status_code == 400

    def test_reset_expired_code(self, client, db):
        _register(client, email="r@test.com")
        code = _request_reset_code(client, "r@test.com")
        # Force the code to be expired.
        user = db.query(User).filter(User.email == "r@test.com").first()
        user.reset_code_expires_at = datetime.now(timezone.utc).replace(
            tzinfo=None
        ) - timedelta(minutes=1)
        db.commit()
        r = client.post(
            "/auth/reset-password",
            json={"email": "r@test.com", "code": code, "new_password": "freshpass9"},
        )
        assert r.status_code == 400

    def test_reset_unknown_email(self, client):
        r = client.post(
            "/auth/reset-password",
            json={
                "email": "nobody@test.com",
                "code": "123456",
                "new_password": "freshpass9",
            },
        )
        assert r.status_code == 400

    def test_reset_short_password_returns_422(self, client):
        _register(client, email="r@test.com")
        code = _request_reset_code(client, "r@test.com")
        r = client.post(
            "/auth/reset-password",
            json={"email": "r@test.com", "code": code, "new_password": "short"},
        )
        assert r.status_code == 422
