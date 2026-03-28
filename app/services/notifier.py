import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AlertLog, Subscription

logger = logging.getLogger(__name__)


def _build_message(
    price: float,
    threshold: float,
    dashboard_url: str,
    direction: str = "low",
    hourly_avg: float | None = None,
) -> str:
    from zoneinfo import ZoneInfo
    COMED_TZ = ZoneInfo("America/Chicago")
    now_ct = datetime.now(COMED_TZ)
    ts = now_ct.strftime("%Y-%m-%d %I:%M %p CT")

    if direction == "high":
        headline = "⬆️ ComEd High Price Alert"
        price_line = f"5-Min Price:   {price:.2f}¢/kWh  ← above your {threshold:.2f}¢ high alert"
    else:
        headline = "⬇️ ComEd Low Price Alert"
        price_line = f"5-Min Price:   {price:.2f}¢/kWh  ← below your {threshold:.2f}¢ low alert"

    avg_line = f"Hour Avg:      {hourly_avg:.2f}¢/kWh" if hourly_avg is not None else "Hour Avg:      —"

    return (
        f"{headline}\n"
        f"{'─' * 30}\n"
        f"🕐 Time:        {ts}\n"
        f"⚡ {price_line}\n"
        f"📊 {avg_line}\n"
        f"{'─' * 30}\n"
        f"🔗 {dashboard_url}\n"
    )


async def _send_telegram(chat_id: str, message: str) -> tuple[bool, str]:
    if not settings.telegram_bot_token:
        return False, "TELEGRAM_BOT_TOKEN not configured"
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json={"chat_id": chat_id, "text": message})
            resp.raise_for_status()
            return True, ""
    except Exception as exc:
        return False, str(exc)


async def _send_whatsapp(to_number: str, message: str) -> tuple[bool, str]:
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        return False, "Twilio credentials not configured"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                data={
                    "From": settings.twilio_whatsapp_from,
                    "To": f"whatsapp:{to_number}",
                    "Body": message,
                },
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            )
            resp.raise_for_status()
            return True, ""
    except Exception as exc:
        return False, str(exc)


def _send_email(to_address: str, price: float, threshold: float, dashboard_url: str, direction: str = "low") -> tuple[bool, str]:
    if not settings.smtp_user or not settings.smtp_password:
        return False, "SMTP credentials not configured"
    subject = f"ComEd Price Alert: {price:.2f}¢/kWh"
    plain = _build_message(price, threshold, dashboard_url, direction)
    threshold_label = f"≥{threshold:.2f}¢/kWh" if direction == "high" else f"≤{threshold:.2f}¢/kWh"
    html = f"""
    <html><body>
    <h2 style="color:{'green' if price <= 0 else 'orange'}">ComEd Price Alert!</h2>
    <table style="font-size:16px;border-collapse:collapse">
      <tr><td style="padding:6px 12px"><b>Current price</b></td><td style="padding:6px 12px;color:{'green' if price <= 0 else 'red'}">{price:.2f}¢/kWh</td></tr>
      <tr><td style="padding:6px 12px"><b>Your threshold</b></td><td style="padding:6px 12px">{threshold_label}</td></tr>
      <tr><td style="padding:6px 12px"><b>Time</b></td><td style="padding:6px 12px">{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</td></tr>
    </table>
    <p><a href="{dashboard_url}">View Dashboard</a></p>
    </body></html>
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.alert_from_address or settings.smtp_user
        msg["To"] = to_address
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], to_address, msg.as_string())
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _log_alert(db: Session, sub_id: int, price: float, channel: str, success: bool, error: str) -> None:
    db.add(AlertLog(
        subscription_id=sub_id,
        price_cents=price,
        channel=channel,
        sent_at=datetime.now(timezone.utc),
        success=success,
        error_msg=error or None,
    ))
    db.commit()


async def check_and_notify(db: Session, current_price: float) -> None:
    from sqlalchemy import text as sa_text
    now = datetime.now(timezone.utc)
    cooldown = timedelta(minutes=settings.alert_cooldown_minutes)

    subs = db.query(Subscription).filter(Subscription.active == True).all()  # noqa: E712

    dashboard_url = "https://your-app.onrender.com"  # overridden at deploy time via env

    # Fetch current hour average once for all alerts
    current_hour_start = now.replace(minute=0, second=0, microsecond=0)
    hourly_avg = db.execute(
        sa_text("SELECT AVG(price_cents) FROM price_5min WHERE millis_utc >= :start"),
        {"start": int(current_hour_start.timestamp() * 1000)},
    ).scalar()
    hourly_avg = round(hourly_avg, 2) if hourly_avg is not None else None

    for sub in subs:
        should_alert_low = current_price <= sub.threshold_cents
        should_alert_high = sub.high_threshold_cents is not None and current_price >= sub.high_threshold_cents
        if not (should_alert_low or should_alert_high):
            continue

        if sub.last_alerted_at and (now - sub.last_alerted_at.replace(tzinfo=timezone.utc)) < cooldown:
            continue

        if should_alert_high:
            direction = "high"
            threshold_for_msg = sub.high_threshold_cents
        else:
            direction = "low"
            threshold_for_msg = sub.threshold_cents

        message = _build_message(current_price, threshold_for_msg, dashboard_url, direction, hourly_avg)
        any_sent = False

        if sub.telegram_chat_id:
            ok, err = await _send_telegram(sub.telegram_chat_id, message)
            _log_alert(db, sub.id, current_price, "telegram", ok, err)
            if ok:
                any_sent = True
                logger.info("Telegram alert sent to chat_id=%s (price=%.2f, direction=%s)", sub.telegram_chat_id, current_price, direction)
            else:
                logger.warning("Telegram alert failed for chat_id=%s: %s", sub.telegram_chat_id, err)

        if sub.whatsapp_number:
            ok, err = await _send_whatsapp(sub.whatsapp_number, message)
            _log_alert(db, sub.id, current_price, "whatsapp", ok, err)
            if ok:
                any_sent = True
                logger.info("WhatsApp alert sent to %s (price=%.2f, direction=%s)", sub.whatsapp_number, current_price, direction)
            else:
                logger.warning("WhatsApp alert failed for %s: %s", sub.whatsapp_number, err)

        if sub.email:
            ok, err = _send_email(sub.email, current_price, threshold_for_msg, dashboard_url, direction)
            _log_alert(db, sub.id, current_price, "email", ok, err)
            if ok:
                any_sent = True
                logger.info("Email alert sent to %s (price=%.2f, direction=%s)", sub.email, current_price, direction)
            else:
                logger.warning("Email alert failed for %s: %s", sub.email, err)

        if any_sent:
            sub.last_alerted_at = now
            db.commit()


async def send_confirmation(sub: Subscription) -> None:
    message = (
        f"You are now subscribed to ComEd Price Alerts!\n\n"
        f"You will be notified when the price drops to {sub.threshold_cents:.2f}¢/kWh or below.\n"
        f"To unsubscribe, visit the dashboard and click Unsubscribe."
    )
    if sub.telegram_chat_id:
        ok, err = await _send_telegram(sub.telegram_chat_id, message)
        if not ok:
            logger.warning("Confirmation Telegram failed: %s", err)
    if sub.whatsapp_number:
        ok, err = await _send_whatsapp(sub.whatsapp_number, message)
        if not ok:
            logger.warning("Confirmation WhatsApp failed: %s", err)
    if sub.email:
        ok, err = _send_email(sub.email, sub.threshold_cents, sub.threshold_cents, "https://your-app.onrender.com")
        if not ok:
            logger.warning("Confirmation email failed: %s", err)
