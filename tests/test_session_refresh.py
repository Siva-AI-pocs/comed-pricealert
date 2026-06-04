"""
Tests for sliding-session refresh: an authenticated request made with a token
that is past half its lifetime gets a freshly-issued cookie, so active users
stay logged in. Fresh tokens are left alone; expired tokens are rejected and
not refreshed.
"""

from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import settings


def _make_token(sub: str, *, age_minutes: float, lifetime_minutes: float) -> str:
    """Forge a token issued `age_minutes` ago with `lifetime_minutes` total life."""
    now = datetime.now(timezone.utc)
    iat = now - timedelta(minutes=age_minutes)
    exp = iat + timedelta(minutes=lifetime_minutes)
    return jwt.encode(
        {"sub": sub, "iat": int(iat.timestamp()), "exp": int(exp.timestamp())},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def _register_user(client, email="slide@test.com"):
    r = client.post("/auth/register", json={"email": email, "password": "origpass1"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _set_cookie(value: str) -> dict:
    return {"Cookie": f"access_token={value}"}


class TestSlidingRefresh:
    def test_old_token_is_refreshed(self, client):
        uid = _register_user(client)
        # 5 days old out of a 7-day life → well past half-life.
        old = _make_token(str(uid), age_minutes=5 * 24 * 60, lifetime_minutes=7 * 24 * 60)
        r = client.get("/auth/me", headers=_set_cookie(old))
        assert r.status_code == 200
        set_cookie = r.headers.get("set-cookie") or ""
        assert "access_token=" in set_cookie
        # The reissued token must carry a later expiry than the old one.
        new_token = set_cookie.split("access_token=")[1].split(";")[0]
        new_exp = jwt.decode(
            new_token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )["exp"]
        old_exp = jwt.decode(
            old, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )["exp"]
        assert new_exp > old_exp

    def test_fresh_token_not_refreshed(self, client):
        uid = _register_user(client)
        fresh = _make_token(str(uid), age_minutes=1, lifetime_minutes=7 * 24 * 60)
        r = client.get("/auth/me", headers=_set_cookie(fresh))
        assert r.status_code == 200
        assert "access_token=" not in (r.headers.get("set-cookie") or "")

    def test_expired_token_rejected_and_not_refreshed(self, client):
        uid = _register_user(client)
        expired = _make_token(str(uid), age_minutes=100, lifetime_minutes=60)
        r = client.get("/auth/me", headers=_set_cookie(expired))
        assert r.status_code == 401
        assert "access_token=" not in (r.headers.get("set-cookie") or "")

    def test_logout_is_not_undone_by_refresh(self, client):
        uid = _register_user(client)
        old = _make_token(str(uid), age_minutes=5 * 24 * 60, lifetime_minutes=7 * 24 * 60)
        r = client.post("/auth/logout", headers=_set_cookie(old))
        assert r.status_code == 200
        # Logout must clear the cookie; refresh must not re-set a live token.
        set_cookie = r.headers.get("set-cookie") or ""
        assert 'access_token=""' in set_cookie or "access_token=;" in set_cookie
