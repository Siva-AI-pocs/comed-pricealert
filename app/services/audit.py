"""Authentication-event audit trail.

Records every auth event (login success/failure, logout, register, password
reset, password change) to the ``login_audit`` table, capturing the client IP
and user-agent for security monitoring.
"""

from __future__ import annotations

import logging

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import LoginAudit

logger = logging.getLogger(__name__)

# Event-type constants (stored as plain strings in login_audit.event_type).
LOGIN_SUCCESS = "login_success"
LOGIN_FAILURE = "login_failure"
LOGOUT = "logout"
REGISTER = "register"
PASSWORD_RESET = "password_reset"
PASSWORD_CHANGE = "password_change"


def client_ip(request: Request) -> str | None:
    """Best-effort client IP for the audit log.

    The app runs behind Cloudflare (custom domain) / Render. ``CF-Connecting-IP``
    is set by Cloudflare and is authoritative when present. Otherwise we fall
    back to the leftmost ``X-Forwarded-For`` hop (set by Render's proxy) and
    finally the socket peer.

    NOTE: when CF-Connecting-IP is absent the X-Forwarded-For value is
    client-supplied and therefore spoofable — this field is for monitoring,
    not an authoritative source for access-control decisions.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()
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
) -> LoginAudit | None:
    """Persist a single auth event (best-effort).

    Audit logging must never break the auth flow it observes, so any failure
    is swallowed (rolled back and logged) rather than propagated.
    """
    try:
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
    except Exception:
        logger.exception("Failed to record auth event %s", event_type)
        db.rollback()
        return None
