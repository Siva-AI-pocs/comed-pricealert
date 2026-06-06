import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscriptionsApi } from "./subscriptions.js";

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({}),
    }),
  );
});
afterEach(() => vi.restoreAllMocks());

const call = () => global.fetch.mock.calls[0];

describe("subscriptionsApi", () => {
  it("lists subscriptions", async () => {
    await subscriptionsApi.list();
    expect(call()[0]).toBe("/api/subscriptions");
  });

  it("subscribes with a JSON body", async () => {
    await subscriptionsApi.subscribe({ email: "a@b.com", threshold_cents: 3 });
    const [url, opts] = call();
    expect(url).toBe("/api/subscribe");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ email: "a@b.com", threshold_cents: 3 });
  });

  it("removes a subscription by id", async () => {
    await subscriptionsApi.remove(5);
    const [url, opts] = call();
    expect(url).toBe("/api/subscribe/5");
    expect(opts.method).toBe("DELETE");
  });

  it("triggers a send-now alert", async () => {
    await subscriptionsApi.sendNow(5);
    const [url, opts] = call();
    expect(url).toBe("/api/subscriptions/5/alert");
    expect(opts.method).toBe("POST");
  });
});
