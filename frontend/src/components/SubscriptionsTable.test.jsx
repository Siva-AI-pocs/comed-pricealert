import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubscriptionsTable from "./SubscriptionsTable.jsx";

const subs = [
  {
    id: 1,
    email: "a@b.com",
    telegram_chat_id: null,
    whatsapp_number: null,
    threshold_cents: 3,
    high_threshold_cents: 12,
    active: true,
    created_at: "2026-06-01T00:00:00",
    last_alerted_at: null,
  },
];

describe("SubscriptionsTable", () => {
  it("lists subscriptions with their channel and thresholds", () => {
    render(<SubscriptionsTable subs={subs} onRemove={() => {}} onSendNow={() => {}} />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("fires onSendNow and onRemove with the subscription id", async () => {
    const onRemove = vi.fn();
    const onSendNow = vi.fn();
    const user = userEvent.setup();
    render(
      <SubscriptionsTable subs={subs} onRemove={onRemove} onSendNow={onSendNow} />,
    );
    const row = screen.getByRole("row", { name: /a@b\.com/i });
    await user.click(within(row).getByRole("button", { name: /send now/i }));
    expect(onSendNow).toHaveBeenCalledWith(1);
    await user.click(within(row).getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("shows an empty state when there are no subscriptions", () => {
    render(<SubscriptionsTable subs={[]} onRemove={() => {}} onSendNow={() => {}} />);
    expect(screen.getByText(/no alerts/i)).toBeInTheDocument();
  });
});
