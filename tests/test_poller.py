"""
Unit tests for app/services/poller.py  (_upsert_rows helper).
No network calls; inserts directly into the in-memory SQLite DB.
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.services.poller import _upsert_rows
from app.models import Price5Min


class TestUpsertRows:
    def test_inserts_valid_rows(self, db):
        data = [
            {"millisUTC": "1700000000000", "price": "3.5"},
            {"millisUTC": "1700000300000", "price": "4.0"},
        ]
        inserted = _upsert_rows(db, data)
        assert inserted == 2
        assert db.query(Price5Min).count() == 2

    def test_skips_duplicate_millis_utc(self, db):
        data = [{"millisUTC": "1700001000000", "price": "2.0"}]
        _upsert_rows(db, data)
        # Same millisUTC again
        inserted = _upsert_rows(db, data)
        assert inserted == 0
        assert db.query(Price5Min).count() == 1

    def test_partial_duplicates(self, db):
        data = [
            {"millisUTC": "1700002000000", "price": "1.0"},
            {"millisUTC": "1700002300000", "price": "2.0"},
        ]
        _upsert_rows(db, data)
        # Add one new, one duplicate
        data2 = [
            {"millisUTC": "1700002000000", "price": "1.0"},  # duplicate
            {"millisUTC": "1700002600000", "price": "3.0"},  # new
        ]
        inserted = _upsert_rows(db, data2)
        assert inserted == 1
        assert db.query(Price5Min).count() == 3

    def test_skips_rows_with_missing_keys(self, db):
        data = [
            {"millisUTC": "1700003000000"},           # missing "price"
            {"price": "5.0"},                          # missing "millisUTC"
            {"millisUTC": "1700003300000", "price": "6.0"},  # valid
        ]
        inserted = _upsert_rows(db, data)
        assert inserted == 1

    def test_skips_rows_with_invalid_values(self, db):
        data = [
            {"millisUTC": "not-a-number", "price": "3.0"},
            {"millisUTC": "1700004000000", "price": "not-a-float"},
            {"millisUTC": "1700004300000", "price": "7.5"},  # valid
        ]
        inserted = _upsert_rows(db, data)
        assert inserted == 1

    def test_returns_zero_for_empty_list(self, db):
        assert _upsert_rows(db, []) == 0

    def test_stores_correct_price(self, db):
        data = [{"millisUTC": "1700005000000", "price": "9.99"}]
        _upsert_rows(db, data)
        row = db.query(Price5Min).first()
        assert abs(row.price_cents - 9.99) < 0.001

    def test_stores_negative_price(self, db):
        data = [{"millisUTC": "1700006000000", "price": "-2.5"}]
        _upsert_rows(db, data)
        row = db.query(Price5Min).first()
        assert row.price_cents < 0
