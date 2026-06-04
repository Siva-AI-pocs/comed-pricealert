from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_optional_user
from app.auth.security import (
    create_access_token,
    decode_access_token,
    encrypt_token,
    generate_numeric_code,
    get_password_hash,
    verify_password,
)
from app.auth.session import set_auth_cookie as _set_auth_cookie
from app.config import settings
from app.database import get_db
from app.models import ComedAccount, Subscription, User
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.services import audit, notifier

router = APIRouter(prefix="/auth", tags=["auth"])

# Precomputed hash used to equalize login timing for unknown emails, so a
# missing account can't be distinguished from a wrong password by response time.
_DUMMY_PASSWORD_HASH = get_password_hash("timing-equalizer-not-a-real-password")

COMED_AUTH_URL = (
    "https://secure.comed.com/MyAccount/MyBillUsage/pages/GBCThirdPartyReg.aspx"
)
COMED_TOKEN_URL = "https://secure.comed.com/sso/oauth2/access_token"
COMED_SCOPE = "FB=4_5_15;IntervalDuration=900;BlockDuration=monthly;HistoryLength=13"


def _claim_orphan_subscriptions(db: Session, user: User) -> None:
    """Assign any unowned subscriptions matching the user's email to this user."""
    if not user.email:
        return
    db.query(Subscription).filter(
        Subscription.email == user.email,
        Subscription.user_id.is_(None),
    ).update({"user_id": user.id})
    db.commit()


@router.post("/register", response_model=UserOut)
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _claim_orphan_subscriptions(db, user)
    audit.record_auth_event(
        db, request, audit.REGISTER, user_id=user.id, email=user.email
    )
    token = create_access_token({"sub": str(user.id)})
    out = UserOut(
        id=user.id, email=user.email, created_at=user.created_at, comed_connected=False
    )
    resp = JSONResponse(content=out.model_dump(mode="json"))
    _set_auth_cookie(resp, token)
    return resp


@router.post("/login", response_model=UserOut)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    # Always run a bcrypt verify (against a dummy hash when the user is unknown)
    # so login time doesn't reveal whether an email is registered.
    password_ok = verify_password(
        req.password, user.hashed_password if user else _DUMMY_PASSWORD_HASH
    )
    if not user or not password_ok:
        audit.record_auth_event(
            db,
            request,
            audit.LOGIN_FAILURE,
            user_id=user.id if user else None,
            email=req.email,
            success=False,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _claim_orphan_subscriptions(db, user)
    audit.record_auth_event(
        db, request, audit.LOGIN_SUCCESS, user_id=user.id, email=user.email
    )
    token = create_access_token({"sub": str(user.id)})
    comed_connected = (
        db.query(ComedAccount).filter(ComedAccount.user_id == user.id).first()
        is not None
    )
    out = UserOut(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        comed_connected=comed_connected,
    )
    resp = JSONResponse(content=out.model_dump(mode="json"))
    _set_auth_cookie(resp, token)
    return resp


@router.post("/logout")
def logout(
    request: Request,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    audit.record_auth_event(
        db,
        request,
        audit.LOGOUT,
        user_id=current_user.id if current_user else None,
        email=current_user.email if current_user else None,
    )
    resp = JSONResponse(content={"message": "Logged out"}, status_code=200)
    resp.delete_cookie(key="access_token", path="/")
    return resp


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.old_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    current_user.hashed_password = get_password_hash(req.new_password)
    db.add(current_user)
    db.commit()
    audit.record_auth_event(
        db,
        request,
        audit.PASSWORD_CHANGE,
        user_id=current_user.id,
        email=current_user.email,
    )
    # The session cookie is keyed on user id, so it stays valid — no re-login needed.
    return {"message": "Password changed"}


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found for that email")
    code = generate_numeric_code()
    user.reset_code_hash = get_password_hash(code)
    user.reset_code_expires_at = datetime.now(timezone.utc).replace(
        tzinfo=None
    ) + timedelta(minutes=settings.reset_code_expire_minutes)
    db.add(user)
    db.commit()
    ok, err = notifier.send_password_reset_email(user.email, code)
    if not ok:
        raise HTTPException(
            status_code=502, detail=f"Failed to send reset email: {err}"
        )
    return {"message": "Reset code sent — check your inbox."}


@router.post("/reset-password")
def reset_password(
    req: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == req.email).first()
    invalid = HTTPException(status_code=400, detail="Invalid or expired reset code")
    if not user or not user.reset_code_hash or not user.reset_code_expires_at:
        raise invalid
    if datetime.now(timezone.utc).replace(tzinfo=None) > user.reset_code_expires_at:
        raise invalid
    if not verify_password(req.code, user.reset_code_hash):
        raise invalid
    user.hashed_password = get_password_hash(req.new_password)
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    db.add(user)
    db.commit()
    audit.record_auth_event(
        db, request, audit.PASSWORD_RESET, user_id=user.id, email=user.email
    )
    return {"message": "Password reset — you can now log in."}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comed_connected = (
        db.query(ComedAccount).filter(ComedAccount.user_id == current_user.id).first()
        is not None
    )
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        created_at=current_user.created_at,
        comed_connected=comed_connected,
    )


@router.get("/comed/connect")
def comed_connect(current_user: User = Depends(get_current_user)):
    if not settings.comed_client_id:
        raise HTTPException(status_code=503, detail="ComEd OAuth not configured")
    # Short-lived state token (10 min) to bind callback to this user
    state = create_access_token({"sub": str(current_user.id)}, expires_minutes=10)
    params = urlencode(
        {
            "client_id": settings.comed_client_id,
            "redirect_uri": settings.comed_redirect_uri,
            "response_type": "code",
            "scope": COMED_SCOPE,
            "state": state,
        }
    )
    return RedirectResponse(url=f"{COMED_AUTH_URL}?{params}")


@router.get("/comed/callback")
async def comed_callback(code: str, state: str, db: Session = Depends(get_db)):
    # Validate state to get user_id
    try:
        payload = decode_access_token(state)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=400, detail="Invalid or expired state parameter"
        )

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            COMED_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.comed_redirect_uri,
                "client_id": settings.comed_client_id,
                "client_secret": settings.comed_client_secret,
            },
            headers={"Accept": "application/json"},
        )
        if not resp.is_success:
            raise HTTPException(
                status_code=502, detail=f"ComEd token exchange failed: {resp.text}"
            )
        token_data = resp.json()

    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")
    expires_in = token_data.get("expires_in")
    scope = token_data.get("scope", COMED_SCOPE)

    expires_at = None
    if expires_in:
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            seconds=int(expires_in)
        )

    # Upsert ComedAccount with encrypted tokens
    account = db.query(ComedAccount).filter(ComedAccount.user_id == user_id).first()
    if account:
        account.access_token_enc = encrypt_token(access_token)
        account.refresh_token_enc = encrypt_token(refresh_token)
        account.scope = scope
        account.authorized_at = datetime.now(timezone.utc).replace(tzinfo=None)
        account.expires_at = expires_at
    else:
        account = ComedAccount(
            user_id=user_id,
            access_token_enc=encrypt_token(access_token),
            refresh_token_enc=encrypt_token(refresh_token),
            scope=scope,
            expires_at=expires_at,
        )
        db.add(account)
    db.commit()

    return RedirectResponse(url="/?comed=connected")


@router.delete("/comed/disconnect")
def comed_disconnect(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    account = (
        db.query(ComedAccount).filter(ComedAccount.user_id == current_user.id).first()
    )
    if account:
        db.delete(account)
        db.commit()
    return {"message": "ComEd account disconnected"}
