import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubscribeForm from "./SubscribeForm.jsx";

function mkRes(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("SubscribeForm", () => {
  it("requires at least one channel before submitting", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<SubscribeForm onSubscribed={() => {}} />);
    await user.click(screen.getByRole("button", { name: /subscribe/i }));
    expect(screen.getByText(/at least one channel/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits the entered channel + thresholds", async () => {
    let body;
    global.fetch = vi.fn((url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve(mkRes({ id: 1, email: "a@b.com" }));
    });
    const onSubscribed = vi.fn();
    const user = userEvent.setup();
    render(<SubscribeForm onSubscribed={onSubscribed} />);
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.clear(screen.getByLabelText(/low.*threshold/i));
    await user.type(screen.getByLabelText(/low.*threshold/i), "3");
    await user.click(screen.getByRole("button", { name: /subscribe/i }));
    await vi.waitFor(() => expect(onSubscribed).toHaveBeenCalled());
    expect(body.email).toBe("a@b.com");
    expect(body.threshold_cents).toBe(3);
    expect(body.notify_negative).toBe(true); // on by default
  });

  it("can opt out of the negative-price alert", async () => {
    let body;
    global.fetch = vi.fn((url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve(mkRes({ id: 1, email: "a@b.com" }));
    });
    const user = userEvent.setup();
    render(<SubscribeForm onSubscribed={() => {}} />);
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.click(screen.getByRole("checkbox", { name: /negative-price/i }));
    await user.click(screen.getByRole("button", { name: /subscribe/i }));
    await vi.waitFor(() => expect(body).toBeTruthy());
    expect(body.notify_negative).toBe(false);
  });

  it("surfaces a backend validation error", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        mkRes({ detail: "WhatsApp number must be in E.164 format" }, { ok: false, status: 422 }),
      ),
    );
    const user = userEvent.setup();
    render(<SubscribeForm onSubscribed={() => {}} />);
    await user.type(screen.getByLabelText(/whatsapp/i), "3125551234");
    await user.click(screen.getByRole("button", { name: /subscribe/i }));
    expect(await screen.findByText(/e\.164 format/i)).toBeInTheDocument();
  });
});
