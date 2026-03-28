# ComEd Price Alert

Monitor ComEd real-time electricity prices and get alerted (Email / Telegram / WhatsApp) when prices hit your threshold.

## Features
- Polls ComEd API every 5 minutes
- 7-day history with 5-minute and hourly trend charts
- Color-coded dashboard: green (≤0¢), blue (0–3¢), orange (3–8¢), red (>8¢)
- Email, Telegram, and WhatsApp notifications — users choose what they want
- Free hosting on Render.com

---

## Local Setup

```bash
python -m venv venv
source venv/Scripts/activate        # Windows bash
# or: .\venv\Scripts\activate       # Windows PowerShell

pip install -r requirements.txt
cp .env.example .env
# Edit .env and fill in your credentials
mkdir -p data
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000

---

## Notification Channel Setup

### Telegram (free)
1. Open Telegram, search for **@BotFather**
2. Send `/newbot`, follow prompts, copy the **token**
3. Set `TELEGRAM_BOT_TOKEN=<token>` in `.env`
4. Start a chat with your new bot
5. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your **chat_id**
6. Enter the chat_id in the dashboard subscribe form

### WhatsApp via Twilio (free sandbox / ~$0.005/msg production)
1. Sign up at [twilio.com](https://www.twilio.com) (free account)
2. Go to **Console → Messaging → WhatsApp Sandbox**
3. Send the join keyword from your WhatsApp to the sandbox number
4. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` in `.env`
5. Enter your WhatsApp number in E.164 format (e.g. `+13125551234`) in the subscribe form

### Email (free with Gmail)
1. Enable 2-Factor Authentication on your Gmail account
2. Go to **Google Account → Security → App Passwords**
3. Generate a 16-character app password
4. Set `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_FROM_ADDRESS` in `.env`

---

## Deploy to Render.com (free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. In the Render dashboard, set the secret environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`
   - `SMTP_USER` / `SMTP_PASSWORD` / `ALERT_FROM_ADDRESS`
5. Deploy!

### Keep-alive (prevent Render free tier sleep)
1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free)
2. Add a new **HTTP(s) monitor** pointing to `https://your-app.onrender.com/health`
3. Set interval to **5 minutes**

This keeps the service awake 24/7 so polling never stops.

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/prices/current` | Latest 5-min price |
| `GET /api/prices/5min?days=7` | 5-min price history |
| `GET /api/prices/hourly?days=7` | Hourly average history |
| `GET /api/prices/stats` | Dashboard summary stats |
| `POST /api/subscribe` | Subscribe for alerts |
| `DELETE /api/subscribe/{id}` | Unsubscribe |
| `GET /api/subscriptions` | List all subscriptions |
| `GET /health` | Health check (for UptimeRobot) |
