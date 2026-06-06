from datetime import datetime
from zoneinfo import available_timezones

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
    notify_negative: bool = True

    @field_validator("whatsapp_number")
    @classmethod
    def validate_whatsapp(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v.startswith("+"):
                raise ValueError(
                    "WhatsApp number must be in E.164 format, e.g. +13125551234"
                )
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
    notify_negative: bool = True
    active: bool
    created_at: datetime
    last_alerted_at: datetime | None

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    timezone: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Name must be at most 100 characters")
        return v or None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if v not in available_timezones():
            raise ValueError("Unknown timezone")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UsageUploadResult(BaseModel):
    meter_ids: list[int]
    intervals_inserted: int
    range_start_utc: datetime | None
    range_end_utc: datetime | None
    prices_backfilled: int = 0


class UsageHourlyOut(BaseModel):
    hour_utc: datetime
    kwh: float
    sample_count: int


class UsageDailyOut(BaseModel):
    date: str
    kwh: float
    sample_count: int


class UsageMeterOut(BaseModel):
    id: int
    espi_usage_point_id: str
    service_kind: str
    label: str | None
    created_at: datetime
    interval_count: int

    model_config = {"from_attributes": True}


class UsageInsightHour(BaseModel):
    hour_utc: datetime
    kwh: float
    price_cents: float
    cost_cents: float
    level: str


class UsageInsightsSummary(BaseModel):
    days: int
    total_kwh: float
    actual_cost_cents: float
    flat_cost_cents: float
    flat_rate_cents: float
    hourly_vs_flat_cents: float
    shiftable_pct: float
    shiftable_kwh: float
    optimized_cost_cents: float
    shift_savings_cents: float


class UsageInsightsOut(BaseModel):
    hourly: list[UsageInsightHour]
    summary: UsageInsightsSummary


class ForecastPoint(BaseModel):
    target_ts: datetime
    p10: float
    p50: float
    p90: float
    spike_prob: float | None = None
    da_lmp: float | None = None
    model_version: str

    model_config = {"from_attributes": True}


class ForecastAccuracyDay(BaseModel):
    day: str
    model: float | None
    da: float | None


class ForecastAccuracy(BaseModel):
    mae: float | None
    vs_day_ahead_pct: float | None
    daily: list[ForecastAccuracyDay]


class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime
    comed_connected: bool = False
    name: str | None = None
    timezone: str | None = None

    model_config = {"from_attributes": True}
