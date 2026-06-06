"""Session cookie management and sliding-refresh middleware.

The app uses a stateless JWT in an HTTP-only cookie. To keep active users
logged in without a DB-backed session store, this middleware re-issues the
cookie once a token passes half its lifetime. Responses that already set or
clear the auth cookie (login / register / logout) are left untouched so a
logout is never silently undone.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, Request
from jose import JWTError
from starlette.responses import Response

from app.auth.security import create_access_token, decode_access_token
from app.config import settings

COOKIE_NAME = "access_token"
COOKIE_MAX_AGE = settings.jwt_expire_minutes * 60
# Only mark the cookie Secure when the app is served over https.
SECURE_COOKIE = settings.app_base_url.startswith("https")


def set_auth_cookie(response: Response, token: str) -> None:
    """Single source of truth for the auth cookie's attributes."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
        secure=SECURE_COOKIE,
        path="/",
    )


def _response_touches_auth_cookie(response: Response) -> bool:
    """True if the response already sets/clears the access_token cookie."""
    needle = (COOKIE_NAME + "=").encode()
    return any(
        key == b"set-cookie" and needle in value
        for key, value in response.raw_headers
    )


async def sliding_session_refresh(request: Request, call_next):
    response = await call_next(request)

    # Don't fight login/register/logout, which manage the cookie themselves.
    if _response_touches_auth_cookie(response):
        return response

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return response

    try:
        payload = decode_access_token(token)  # raises on expired/invalid
    except JWTError:
        return response

    iat = payload.get("iat")
    exp = payload.get("exp")
    sub = payload.get("sub")
    if not (iat and exp and sub):
        return response

    now = datetime.now(timezone.utc).timestamp()
    lifetime = exp - iat
    if lifetime > 0 and (now - iat) > lifetime / 2:
        set_auth_cookie(response, create_access_token({"sub": sub}))

    return response


def add_sliding_session_refresh(app: FastAPI) -> None:
    app.middleware("http")(sliding_session_refresh)
