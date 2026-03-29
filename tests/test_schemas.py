"""
Unit tests for Pydantic request/response schemas.
No database or network access required.
"""
import pytest
from pydantic import ValidationError

from app.schemas import SubscribeRequest


class TestSubscribeRequest:
    def test_has_channel_email_only(self):
        req = SubscribeRequest(email="user@example.com")
        assert req.has_channel() is True

    def test_has_channel_telegram_only(self):
        req = SubscribeRequest(telegram_chat_id="123456789")
        assert req.has_channel() is True

    def test_has_channel_whatsapp_only(self):
        req = SubscribeRequest(whatsapp_number="+13125551234")
        assert req.has_channel() is True

    def test_has_channel_all_channels(self):
        req = SubscribeRequest(
            email="u@example.com",
            telegram_chat_id="111",
            whatsapp_number="+13125551234",
        )
        assert req.has_channel() is True

    def test_has_channel_none(self):
        req = SubscribeRequest()
        assert req.has_channel() is False

    def test_has_channel_empty_strings_falsy(self):
        # empty strings coerce to None via validators
        req = SubscribeRequest(email="", telegram_chat_id="", whatsapp_number=None)
        assert req.has_channel() is False

    def test_email_is_trimmed(self):
        req = SubscribeRequest(email="  user@example.com  ")
        assert req.email == "user@example.com"

    def test_telegram_is_trimmed(self):
        req = SubscribeRequest(telegram_chat_id="  987654321  ")
        assert req.telegram_chat_id == "987654321"

    def test_whatsapp_valid_e164(self):
        req = SubscribeRequest(whatsapp_number="+13125551234")
        assert req.whatsapp_number == "+13125551234"

    def test_whatsapp_invalid_no_plus_raises(self):
        with pytest.raises(ValidationError, match="E.164"):
            SubscribeRequest(whatsapp_number="13125551234")

    def test_whatsapp_none_is_accepted(self):
        req = SubscribeRequest(whatsapp_number=None)
        assert req.whatsapp_number is None

    def test_default_threshold_is_zero(self):
        req = SubscribeRequest(email="u@example.com")
        assert req.threshold_cents == 0.0

    def test_custom_threshold(self):
        req = SubscribeRequest(email="u@example.com", threshold_cents=2.5)
        assert req.threshold_cents == 2.5

    def test_high_threshold_defaults_none(self):
        req = SubscribeRequest(email="u@example.com")
        assert req.high_threshold_cents is None

    def test_high_threshold_set(self):
        req = SubscribeRequest(email="u@example.com", high_threshold_cents=10.0)
        assert req.high_threshold_cents == 10.0
