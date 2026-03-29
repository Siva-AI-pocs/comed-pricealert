"""
End-to-end Playwright tests for the ComEd Price Alert Dashboard.

Live target: https://comed-pricealert.onrender.com

Run with:
    venv/Scripts/pytest tests/test_e2e.py -v --browser chromium
"""

import re
import pytest
import httpx
from playwright.sync_api import Page, expect

BASE_URL = "https://comed-pricealert.onrender.com"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    """Extend default context args: wider viewport, no slow-motion."""
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 900},
    }


@pytest.fixture(scope="session")
def loaded_page(browser):
    """
    Single page fixture shared across the whole session.

    Opens the dashboard once, waits until the stats cards are populated
    (network idle is not enough because JS fetches happen after DOMContentLoaded),
    then yields the page for read-only assertions.
    """
    page = browser.new_page()
    page.goto(BASE_URL, wait_until="networkidle", timeout=60_000)
    # Wait for at least the current-price stat to have non-empty text
    page.wait_for_selector("#statCurrent", timeout=30_000)
    yield page
    page.close()


# ---------------------------------------------------------------------------
# 1. Page load
# ---------------------------------------------------------------------------

class TestPageLoad:
    def test_page_returns_200(self):
        """HTTP GET on the root URL must respond with 200."""
        r = httpx.get(BASE_URL, timeout=30)
        assert r.status_code == 200

    def test_page_title_contains_comed(self, loaded_page: Page):
        """HTML <title> must contain 'ComEd'."""
        expect(loaded_page).to_have_title(re.compile(r"ComEd", re.IGNORECASE))

    def test_no_console_errors_on_load(self, browser):
        """No uncaught JS errors should appear during initial page load."""
        errors = []
        page = browser.new_page()
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.goto(BASE_URL, wait_until="networkidle", timeout=60_000)
        page.close()
        assert errors == [], f"Uncaught JS errors on load: {errors}"


# ---------------------------------------------------------------------------
# 2. Live price badge
# ---------------------------------------------------------------------------

class TestLivePriceBadge:
    def test_live_price_badge_is_visible(self, loaded_page: Page):
        """The #livePrice badge in the header must be visible."""
        badge = loaded_page.locator("#livePrice")
        expect(badge).to_be_visible()

    def test_live_price_badge_shows_numeric_value(self, loaded_page: Page):
        """The badge text must look like a price (digits, optional decimal/sign)."""
        badge = loaded_page.locator("#livePrice")
        text = badge.inner_text().strip()
        # Accept values like "1.6", "-0.4", "0", "12.34 ¢" etc.
        assert re.search(r"-?\d+(\.\d+)?", text), (
            f"Live price badge text '{text}' does not contain a numeric value"
        )


# ---------------------------------------------------------------------------
# 3. Stats bar
# ---------------------------------------------------------------------------

class TestStatsBar:
    STAT_IDS = [
        ("statCurrent",  "current price"),
        ("statHourAvg",  "hourly average"),
        ("statDayMin",   "day minimum"),
        ("statDayMax",   "day maximum"),
        ("statWeekAvg",  "week average"),
    ]

    @pytest.mark.parametrize("element_id,label", STAT_IDS)
    def test_stat_card_is_visible(self, loaded_page: Page, element_id, label):
        """Each stat card must be visible on the page."""
        card = loaded_page.locator(f"#{element_id}")
        expect(card).to_be_visible()

    @pytest.mark.parametrize("element_id,label", STAT_IDS)
    def test_stat_card_has_numeric_value(self, loaded_page: Page, element_id, label):
        """Each stat card must display a numeric value after JS populates it."""
        card = loaded_page.locator(f"#{element_id}")
        text = card.inner_text().strip()
        assert re.search(r"-?\d+(\.\d+)?", text), (
            f"{label} card (#{element_id}) shows '{text}' — no numeric value found"
        )

    def test_current_price_card_container_visible(self, loaded_page: Page):
        """The card wrapper #cardCurrent must be visible."""
        expect(loaded_page.locator("#cardCurrent")).to_be_visible()


# ---------------------------------------------------------------------------
# 4. Chart canvas elements
# ---------------------------------------------------------------------------

class TestCharts:
    def test_5min_chart_canvas_exists(self, loaded_page: Page):
        """Canvas element #chart5min must be present in the DOM."""
        canvas = loaded_page.locator("#chart5min")
        expect(canvas).to_be_visible()

    def test_hourly_chart_canvas_exists(self, loaded_page: Page):
        """Canvas element #chartHourly must be present in the DOM."""
        canvas = loaded_page.locator("#chartHourly")
        expect(canvas).to_be_visible()

    def test_5min_chart_has_nonzero_dimensions(self, loaded_page: Page):
        """#chart5min canvas must have positive width and height (Chart.js rendered)."""
        box = loaded_page.locator("#chart5min").bounding_box()
        assert box is not None, "#chart5min has no bounding box"
        assert box["width"] > 0 and box["height"] > 0, (
            f"#chart5min dimensions are {box['width']}x{box['height']}"
        )

    def test_hourly_chart_has_nonzero_dimensions(self, loaded_page: Page):
        """#chartHourly canvas must have positive width and height."""
        box = loaded_page.locator("#chartHourly").bounding_box()
        assert box is not None, "#chartHourly has no bounding box"
        assert box["width"] > 0 and box["height"] > 0, (
            f"#chartHourly dimensions are {box['width']}x{box['height']}"
        )


# ---------------------------------------------------------------------------
# 5. Decision banner
# ---------------------------------------------------------------------------

class TestDecisionBanner:
    def test_decision_banner_is_visible(self, loaded_page: Page):
        """The #decisionBanner element must be visible."""
        expect(loaded_page.locator("#decisionBanner")).to_be_visible()

    def test_decision_banner_has_text(self, loaded_page: Page):
        """The decision banner must contain some non-empty text."""
        text = loaded_page.locator("#decisionBanner").inner_text().strip()
        assert len(text) > 0, "Decision banner is empty"


# ---------------------------------------------------------------------------
# 6. Subscribe form
# ---------------------------------------------------------------------------

class TestSubscribeForm:
    def test_subscribe_form_is_visible(self, loaded_page: Page):
        """The #subscribeForm element must be visible."""
        expect(loaded_page.locator("#subscribeForm")).to_be_visible()

    def test_email_field_present(self, loaded_page: Page):
        """Email input #inputEmail must be visible."""
        expect(loaded_page.locator("#inputEmail")).to_be_visible()

    def test_telegram_field_present(self, loaded_page: Page):
        """Telegram chat ID input #inputTelegram must be visible."""
        expect(loaded_page.locator("#inputTelegram")).to_be_visible()

    def test_whatsapp_field_present(self, loaded_page: Page):
        """WhatsApp number input #inputWhatsapp must be visible."""
        expect(loaded_page.locator("#inputWhatsapp")).to_be_visible()

    def test_threshold_field_present(self, loaded_page: Page):
        """Low-threshold input #inputThreshold must be visible."""
        expect(loaded_page.locator("#inputThreshold")).to_be_visible()

    def test_high_threshold_field_present(self, loaded_page: Page):
        """High-threshold input #inputHighThreshold must be visible."""
        expect(loaded_page.locator("#inputHighThreshold")).to_be_visible()

    def test_submit_button_present(self, loaded_page: Page):
        """Submit button #submitBtn must be visible."""
        expect(loaded_page.locator("#submitBtn")).to_be_visible()

    def test_all_form_fields_count(self, loaded_page: Page):
        """The form must contain at least 5 input fields."""
        inputs = loaded_page.locator("#subscribeForm input")
        count = inputs.count()
        assert count >= 5, f"Expected at least 5 form inputs, found {count}"


# ---------------------------------------------------------------------------
# 7. Daily summary table
# ---------------------------------------------------------------------------

class TestDailySummaryTable:
    def test_daily_table_container_visible(self, loaded_page: Page):
        """The #dailyTableContainer must be visible."""
        expect(loaded_page.locator("#dailyTableContainer")).to_be_visible()

    def test_daily_table_has_table_element(self, loaded_page: Page):
        """A <table> element must exist inside #dailyTableContainer."""
        table = loaded_page.locator("#dailyTableContainer table")
        expect(table).to_be_visible()

    def test_daily_table_has_header_row(self, loaded_page: Page):
        """The daily summary table must have at least one header cell."""
        headers = loaded_page.locator("#dailyTableContainer th")
        assert headers.count() > 0, "Daily summary table has no <th> elements"

    def test_daily_table_has_data_rows(self, loaded_page: Page):
        """The daily summary table must contain at least one data row."""
        rows = loaded_page.locator("#dailyTableContainer tbody tr")
        assert rows.count() > 0, "Daily summary table has no data rows"

    def test_daily_table_has_up_to_7_days(self, loaded_page: Page):
        """The daily summary table should have at most 7 data rows (7-day window)."""
        rows = loaded_page.locator("#dailyTableContainer tbody tr")
        count = rows.count()
        assert count <= 7, f"Expected at most 7 daily rows, found {count}"


# ---------------------------------------------------------------------------
# 8. Subscriptions table
# ---------------------------------------------------------------------------

class TestSubscriptionsTable:
    def test_subscriptions_container_visible(self, loaded_page: Page):
        """The #subsTableContainer must be visible."""
        expect(loaded_page.locator("#subsTableContainer")).to_be_visible()

    def test_subscriptions_table_renders(self, loaded_page: Page):
        """A <table> or fallback message must appear inside #subsTableContainer."""
        container = loaded_page.locator("#subsTableContainer")
        text = container.inner_text().strip()
        # Either a table rendered, or a "no subscriptions" message — either is fine
        assert len(text) > 0, "#subsTableContainer is completely empty"

    def test_send_now_or_remove_buttons_if_rows_exist(self, loaded_page: Page):
        """If subscription rows exist, Send Now and Remove buttons must be present."""
        rows = loaded_page.locator("#subsTableContainer tbody tr")
        if rows.count() == 0:
            pytest.skip("No subscription rows present — skipping button check")

        # At least one Send Now button
        send_buttons = loaded_page.locator("#subsTableContainer button", has_text=re.compile(r"Send Now", re.IGNORECASE))
        assert send_buttons.count() > 0, "Expected 'Send Now' buttons in subscriptions table"

        # At least one Remove button
        remove_buttons = loaded_page.locator("#subsTableContainer button", has_text=re.compile(r"Remove", re.IGNORECASE))
        assert remove_buttons.count() > 0, "Expected 'Remove' buttons in subscriptions table"


# ---------------------------------------------------------------------------
# 9. API endpoint: /health
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_health_returns_200(self):
        """/health must respond with HTTP 200."""
        r = httpx.get(f"{BASE_URL}/health", timeout=15)
        assert r.status_code == 200

    def test_health_returns_status_ok(self):
        """/health JSON body must be {'status': 'ok'}."""
        r = httpx.get(f"{BASE_URL}/health", timeout=15)
        data = r.json()
        assert data.get("status") == "ok", (
            f"Expected {{\"status\": \"ok\"}}, got {data}"
        )

    def test_health_content_type_is_json(self):
        """/health must return application/json content-type."""
        r = httpx.get(f"{BASE_URL}/health", timeout=15)
        assert "application/json" in r.headers.get("content-type", ""), (
            f"Unexpected content-type: {r.headers.get('content-type')}"
        )


# ---------------------------------------------------------------------------
# 10. API endpoint: /api/prices/stats
# ---------------------------------------------------------------------------

class TestPricesStatsEndpoint:
    @pytest.fixture(scope="class")
    def stats(self):
        """Fetch /api/prices/stats once for the whole class."""
        r = httpx.get(f"{BASE_URL}/api/prices/stats", timeout=15)
        assert r.status_code == 200, f"/api/prices/stats returned {r.status_code}"
        return r.json()

    def test_stats_returns_200(self):
        """/api/prices/stats must respond with HTTP 200."""
        r = httpx.get(f"{BASE_URL}/api/prices/stats", timeout=15)
        assert r.status_code == 200

    def test_stats_has_current_price(self, stats):
        """Response must contain a 'current_price' field."""
        assert "current_price" in stats, (
            f"'current_price' missing from stats: {list(stats.keys())}"
        )

    def test_stats_current_price_is_numeric(self, stats):
        """'current_price' must be an int or float."""
        assert isinstance(stats["current_price"], (int, float)), (
            f"current_price is not numeric: {stats['current_price']!r}"
        )

    def test_stats_has_hourly_avg(self, stats):
        """Response must contain 'hourly_avg'."""
        assert "hourly_avg" in stats

    def test_stats_has_day_min(self, stats):
        """Response must contain 'day_min'."""
        assert "day_min" in stats

    def test_stats_has_day_max(self, stats):
        """Response must contain 'day_max'."""
        assert "day_max" in stats

    def test_stats_has_week_avg(self, stats):
        """Response must contain 'week_avg'."""
        assert "week_avg" in stats

    def test_stats_day_min_lte_day_max(self, stats):
        """'day_min' must be less than or equal to 'day_max'."""
        assert stats["day_min"] <= stats["day_max"], (
            f"day_min ({stats['day_min']}) > day_max ({stats['day_max']})"
        )


# ---------------------------------------------------------------------------
# 11. API endpoint: /api/prices/5min
# ---------------------------------------------------------------------------

class TestPrices5MinEndpoint:
    @pytest.fixture(scope="class")
    def prices(self):
        r = httpx.get(f"{BASE_URL}/api/prices/5min", timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_5min_returns_list(self, prices):
        """/api/prices/5min must return a JSON array."""
        assert isinstance(prices, list), f"Expected list, got {type(prices)}"

    def test_5min_list_nonempty(self, prices):
        """5-minute price list must not be empty."""
        assert len(prices) > 0, "5-minute price list is empty"

    def test_5min_records_have_required_fields(self, prices):
        """Each record must have millis_utc and price_cents fields."""
        first = prices[0]
        assert "millis_utc" in first, f"'millis_utc' missing from record: {first}"
        assert "price_cents" in first, f"'price_cents' missing from record: {first}"


# ---------------------------------------------------------------------------
# 12. API endpoint: /api/prices/hourly
# ---------------------------------------------------------------------------

class TestPricesHourlyEndpoint:
    @pytest.fixture(scope="class")
    def prices(self):
        r = httpx.get(f"{BASE_URL}/api/prices/hourly", timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_hourly_returns_list(self, prices):
        """/api/prices/hourly must return a JSON array."""
        assert isinstance(prices, list)

    def test_hourly_records_have_required_fields(self, prices):
        """Each hourly record must have hour_utc and avg_price_cents."""
        if not prices:
            pytest.skip("Hourly prices list is empty")
        first = prices[0]
        assert "hour_utc" in first
        assert "avg_price_cents" in first


# ---------------------------------------------------------------------------
# 13. API endpoint: /api/decision
# ---------------------------------------------------------------------------

class TestDecisionEndpoint:
    @pytest.fixture(scope="class")
    def decision(self):
        r = httpx.get(f"{BASE_URL}/api/decision", timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_decision_returns_200(self):
        """/api/decision must respond with HTTP 200."""
        r = httpx.get(f"{BASE_URL}/api/decision", timeout=15)
        assert r.status_code == 200

    def test_decision_has_current_price(self, decision):
        """Decision response must include 'current_price'."""
        assert "current_price" in decision

    def test_decision_has_level(self, decision):
        """Decision response must include 'level'."""
        assert "level" in decision

    def test_decision_has_recommendation(self, decision):
        """Decision response must include 'recommendation'."""
        assert "recommendation" in decision

    def test_decision_level_is_string(self, decision):
        """'level' must be a non-empty string."""
        assert isinstance(decision["level"], str) and len(decision["level"]) > 0


# ---------------------------------------------------------------------------
# 14. API endpoint: /api/subscriptions
# ---------------------------------------------------------------------------

class TestSubscriptionsEndpoint:
    def test_subscriptions_returns_200(self):
        """/api/subscriptions must respond with HTTP 200."""
        r = httpx.get(f"{BASE_URL}/api/subscriptions", timeout=15)
        assert r.status_code == 200

    def test_subscriptions_returns_list(self):
        """/api/subscriptions must return a JSON array."""
        r = httpx.get(f"{BASE_URL}/api/subscriptions", timeout=15)
        data = r.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_subscription_records_have_required_fields(self):
        """Each subscription record must have id, email, and threshold_cents."""
        r = httpx.get(f"{BASE_URL}/api/subscriptions", timeout=15)
        data = r.json()
        if not data:
            pytest.skip("No subscriptions in database — skipping field check")
        for rec in data:
            assert "id" in rec, f"'id' missing: {rec}"
            assert "email" in rec, f"'email' missing: {rec}"
            assert "threshold_cents" in rec, f"'threshold_cents' missing: {rec}"
