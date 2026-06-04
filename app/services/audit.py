"""Authentication-event audit trail.

Records every auth event (login success/failure, logout, register, password
reset, password change) to the ``login_audit`` table, capturing the client IP
and user-agent for security monitoring.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import LoginAudit

# Event-type constants (stored as plain strings in login_audit.event_type).
LOGIN_SUCCESS = "login_success"
LOGIN_FAILURE = "login_failure"
LOGOUT = "logout"
REGISTER = "register"
PASSWORD_RESET = "password_reset"
PASSWORD_CHANGE = "password_change"


def client_ip(request: Request) -> str | None:
    """Best-effort real client IP.

    The app runs behind Cloudflare/Render, so the socket peer is a proxy.
    Trust the first hop of ``X-Forwarded-For`` and fall back to the socket.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else None


def record_auth_event(
    db: Session,
    request: Request,
    event_type: str,
    *,
    user_id: int | None = None,
    email: str | None = None,
    success: bool = True,
) -> LoginAudit:
    """Persist a single auth event and return the row."""
    audit = LoginAudit(
        user_id=user_id,
        email=email,
        event_type=event_type,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        success=success,
    )
    db.add(audit)
    db.commit()
    return audit
