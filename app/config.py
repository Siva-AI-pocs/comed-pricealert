from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/comed.db"
    poll_interval_seconds: int = 300
    history_days: int = 7

    # Telegram
    telegram_bot_token: str = ""

    # WhatsApp via Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"

    # Email / SMTP
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_from_address: str = ""

    alert_cooldown_minutes: int = 60

    app_host: str = "0.0.0.0"
    app_port: int = 8000


settings = Settings()
