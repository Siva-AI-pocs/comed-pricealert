"""
Tests for GET /api/decision — reconciled to the 5-tier SEMANTIC price scale
shared with the redesigned UI (DESIGN_SYSTEM.md):

    Negative  < 0     (token --neg)
    Cheap     0 – 3    (token --cheap)
    Moderate  3 – 8    (token --moderate)
    High      8 – 15   (token --high)
    Spike     15+      (token --spike)

Boundary rule: a tier owns its lower bound (0 -> cheap, 3 -> moderate, ...).
This locks the behaviour change away from the old 4-tier scheme.
"""

import itertools

import pytest

# Monotonically increasing millis so each seeded price becomes the latest row
# (seed_prices does ON CONFLICT DO NOTHING, so reusing a timestamp is a no-op).
_millis = itertools.count(1_700_000_000_000)


def _decide(client, seed_prices, price):
    # The endpoint returns the latest 5-min price; seed it as the newest row.
    seed_prices([(next(_millis), price)])
    r = client.get("/api/decision")
    assert r.status_code == 200, r.text
    return r.json()


class TestDecisionTiers:
    @pytest.mark.parametrize(
        "price,level",
        [
            (-1.0, "negative"),
            (-0.01, "negative"),
            (0.0, "cheap"),  # 0 is Cheap, not Negative (was <=0 before)
            (2.9, "cheap"),
            (3.0, "moderate"),
            (4.0, "moderate"),  # was "normal"/blue under the old 4-tier scheme
            (7.9, "moderate"),
            (8.0, "high"),
            (14.9, "high"),
            (15.0, "spike"),
            (25.0, "spike"),
        ],
    )
    def test_tier_boundaries(self, client, seed_prices, price, level):
        assert _decide(client, seed_prices, price)["level"] == level

    def test_color_class_matches_design_token(self, client, seed_prices):
        # color_class is the CSS token suffix (var(--<color_class>)).
        cases = {
            -1.0: "neg",
            1.0: "cheap",
            5.0: "moderate",
            10.0: "high",
            20.0: "spike",
        }
        for price, token in cases.items():
            assert _decide(client, seed_prices, price)["color_class"] == token

    def test_response_shape(self, client, seed_prices):
        body = _decide(client, seed_prices, 1.7)
        for key in (
            "current_price",
            "level",
            "emoji",
            "label",
            "recommendation",
            "color_class",
        ):
            assert key in body
        assert body["current_price"] == 1.7
        assert body["label"]  # non-empty plain-language label
        assert body["recommendation"]

    def test_503_when_no_price_data(self, client):
        assert client.get("/api/decision").status_code == 503
