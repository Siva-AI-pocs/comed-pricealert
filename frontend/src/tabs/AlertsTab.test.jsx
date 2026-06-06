import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlertsTab from "./AlertsTab.jsx";

function mkRes(json) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

const SUBS = [
  {
    id: 1,
    email: "a@b.com",
    telegram_chat_id: null,
    whatsapp_number: null,
    threshold_cents: 3,
    high_threshold_cents: null,
    active: true,
    created_at: "2026-06-01T00:00:00",
    last_alerted_at: null,
  },
];

function route() {
  global.fetch = vi.fn((url) => {
    const path = url.split("?")[0];
    if (path === "/api/subscriptions") return Promise.resolve(mkRes(SUBS));
    if (path === "/api/subscriptions/1/alert")
      return Promise.resolve(mkRes({ price_cents: 2.1, channels: { email: "ok" } }));
    return Promise.resolve(mkRes({}));
  });
}

afterEach(() => vi.restoreAllMocks());

describe("AlertsTab", () => {
  it("lists the user's subscriptions", async () => {
    route();
    render(<AlertsTab />);
    expect(await screen.findByText("a@b.com")).toBeInTheDocument();
  });

  it("send-now calls the alert endpoint and shows feedback", async () => {
    route();
    const user = userEvent.setup();
    render(<AlertsTab />);
    await screen.findByText("a@b.com"); // wait for the list to load
    const row = screen.getByRole("row", { name: /a@b\.com/i });
    await user.click(within(row).getByRole("button", { name: /send now/i }));
    expect(await screen.findByText(/current price 2.1¢/i)).toBeInTheDocument();
    expect(
      global.fetch.mock.calls.some(([u]) => u === "/api/subscriptions/1/alert"),
    ).toBe(true);
    // let the post-send list reload settle (avoids act warnings)
    await waitFor(() =>
      expect(
        global.fetch.mock.calls.filter(([u]) => u === "/api/subscriptions").length,
      ).toBeGreaterThanOrEqual(2),
    );
  });
});
