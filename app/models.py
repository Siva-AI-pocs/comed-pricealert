from __future__ import annotations

from datetime import datetime
from typing import Optional

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


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    subscriptions: Mapped[list["Subscription"]] = relationship("Subscription", back_populates="user")
    comed_account: Mapped[Optional["ComedAccount"]] = relationship("ComedAccount", back_populates="user", uselist=False)


class ComedAccount(Base):
    __tablename__ = "comed_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    access_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    authorized_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    subscription_id_espi: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="comed_account")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    threshold_cents: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    high_threshold_cents: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    last_alerted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[Optional["User"]] = relationship("User", back_populates="subscriptions")
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
