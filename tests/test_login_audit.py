"""
Tests for the login_audit trail: every auth event (login success/failure,
logout, register, password reset, password change) is recorded in the
login_audit table with email, IP address, user-agent and timestamp.
"""

from app.models import LoginAudit


def _register(client, email="audit@test.com", password="origpass1", **kw):
    return client.post(
        "/auth/register", json={"email": email, "password": password}, **kw
    )


def _audits(db, event_type=None):
    q = db.query(LoginAudit)
    if event_type is not None:
        q = q.filter(LoginAudit.event_type == event_type)
    return q.order_by(LoginAudit.id).all()


class TestAuthEventRecording:
    def test_register_records_event(self, client, db):
        _register(client, email="reg@test.com")
        rows = _audits(db, "register")
        assert len(rows) == 1
        assert rows[0].email == "reg@test.com"
        assert rows[0].user_id is not None
        assert rows[0].success is True

    def test_login_success_records_event(self, client, db):
        _register(client, email="ok@test.com", password="origpass1")
        client.post("/auth/login", json={"email": "ok@test.com", "password": "origpass1"})
        rows = _audits(db, "login_success")
        assert len(rows) == 1
        assert rows[0].email == "ok@test.com"
        assert rows[0].success is True

    def test_login_failure_records_event(self, client, db):
        _register(client, email="bad@test.com", password="origpass1")
        r = client.post(
            "/auth/login", json={"email": "bad@test.com", "password": "wrongpass"}
        )
        assert r.status_code == 401
        rows = _audits(db, "login_failure")
        assert len(rows) == 1
        assert rows[0].email == "bad@test.com"
        assert rows[0].success is False

    def test_login_failure_unknown_email_records_event(self, client, db):
        r = client.post(
            "/auth/login", json={"email": "ghost@test.com", "password": "whatever1"}
        )
        assert r.status_code == 401
        rows = _audits(db, "login_failure")
        assert len(rows) == 1
        assert rows[0].email == "ghost@test.com"
        assert rows[0].success is False

    def test_logout_records_event(self, client, db):
        _register(client, email="out@test.com")
        client.post("/auth/logout")
        rows = _audits(db, "logout")
        assert len(rows) == 1

    def test_change_password_records_event(self, client, db):
        _register(client, email="chg@test.com", password="origpass1")
        r = client.post(
            "/auth/change-password",
            json={"old_password": "origpass1", "new_password": "brandnew9"},
        )
        assert r.status_code == 200
        rows = _audits(db, "password_change")
        assert len(rows) == 1
        assert rows[0].success is True

    def test_reset_password_records_event(self, client, db):
        from unittest.mock import patch

        _register(client, email="rst@test.com", password="origpass1")
        with patch(
            "app.services.notifier.send_password_reset_email", return_value=(True, "")
        ) as mock_send:
            client.post("/auth/forgot-password", json={"email": "rst@test.com"})
        code = mock_send.call_args.args[1]
        r = client.post(
            "/auth/reset-password",
            json={"email": "rst@test.com", "code": code, "new_password": "freshpass9"},
        )
        assert r.status_code == 200
        rows = _audits(db, "password_reset")
        assert len(rows) == 1
        assert rows[0].success is True

    def test_audit_captures_ip_and_user_agent(self, client, db):
        _register(
            client,
            email="meta@test.com",
            headers={
                "User-Agent": "PulseTest/1.0",
                "X-Forwarded-For": "203.0.113.7, 70.0.0.1",
            },
        )
        rows = _audits(db, "register")
        assert len(rows) == 1
        # First hop of X-Forwarded-For is the real client IP.
        assert rows[0].ip_address == "203.0.113.7"
        assert rows[0].user_agent == "PulseTest/1.0"

    def test_audit_has_timestamp(self, client, db):
        _register(client, email="ts@test.com")
        rows = _audits(db, "register")
        assert rows[0].created_at is not None

    def test_audit_prefers_cf_connecting_ip(self, client, db):
        # Behind Cloudflare the leftmost X-Forwarded-For hop is attacker-
        # controlled; CF-Connecting-IP is the authoritative client IP.
        _register(
            client,
            email="cf@test.com",
            headers={
                "CF-Connecting-IP": "198.51.100.42",
                "X-Forwarded-For": "1.1.1.1, 70.0.0.1",
            },
        )
        rows = _audits(db, "register")
        assert rows[0].ip_address == "198.51.100.42"

    def test_audit_failure_does_not_break_request(self, client, db, monkeypatch):
        # A broken audit insert must never turn a successful auth call into a 500.
        def _boom(*a, **k):
            raise RuntimeError("audit table unavailable")

        monkeypatch.setattr("app.services.audit.LoginAudit", _boom)
        r = _register(client, email="resilient@test.com")
        assert r.status_code == 200, r.text
