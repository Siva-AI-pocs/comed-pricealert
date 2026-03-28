from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class Price5MinOut(BaseModel):
    millis_utc: int
    price_cents: float
    recorded_at: datetime

    model_config = {"from_attributes": True}


class HourlyAverageOut(BaseModel):
    hour_utc: datetime
    avg_price_cents: float
    sample_count: int

    model_config = {"from_attributes": True}


class PriceStats(BaseModel):
    current_price: float | None
    hourly_avg: float | None
    day_min: float | None
    day_max: float | None
    week_avg: float | None
    last_updated_utc: str | None = None
    data_age_seconds: int | None = None


class DailySummary(BaseModel):
    date: str
    min_price: float | None
    max_price: float | None
    avg_price: float | None


class SubscribeRequest(BaseModel):
    email: str | None = None
    telegram_chat_id: str | None = None
    whatsapp_number: str | None = None
    threshold_cents: float = 0.0
    high_threshold_cents: float | None = None

    @field_validator("whatsapp_number")
    @classmethod
    def validate_whatsapp(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v.startswith("+"):
                raise ValueError("WhatsApp number must be in E.164 format, e.g. +13125551234")
        return v or None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        return v.strip() if v else None

    @field_validator("telegram_chat_id")
    @classmethod
    def validate_telegram(cls, v: str | None) -> str | None:
        return v.strip() if v else None

    def has_channel(self) -> bool:
        return bool(self.email or self.telegram_chat_id or self.whatsapp_number)


class SubscriptionOut(BaseModel):
    id: int
    email: str | None
    telegram_chat_id: str | None
    whatsapp_number: str | None
    threshold_cents: float
    high_threshold_cents: float | None
    active: bool
    created_at: datetime
    last_alerted_at: datetime | None

    model_config = {"from_attributes": True}
