from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Price5Min(Base):
    __tablename__ = "price_5min"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    millis_utc: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False, index=True)
    price_cents: Mapped[float] = mapped_column(Float, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class HourlyAverage(Base):
    __tablename__ = "hourly_averages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hour_utc: Mapped[datetime] = mapped_column(DateTime, unique=True, nullable=False, index=True)
    avg_price_cents: Mapped[float] = mapped_column(Float, nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    threshold_cents: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    high_threshold_cents: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    last_alerted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    alerts: Mapped[list["AlertLog"]] = relationship("AlertLog", back_populates="subscription")


class AlertLog(Base):
    __tablename__ = "alert_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subscription_id: Mapped[int] = mapped_column(Integer, ForeignKey("subscriptions.id"), nullable=False)
    price_cents: Mapped[float] = mapped_column(Float, nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False)  # "email", "telegram", "whatsapp"
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)

    subscription: Mapped["Subscription"] = relationship("Subscription", back_populates="alerts")
