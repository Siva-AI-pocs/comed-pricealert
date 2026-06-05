import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pricesApi } from "./prices.js";

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve([]),
    }),
  );
});
afterEach(() => vi.restoreAllMocks());

const calledUrl = () => global.fetch.mock.calls[0][0];

describe("pricesApi", () => {
  it("hits the stats endpoint", async () => {
    await pricesApi.stats();
    expect(calledUrl()).toBe("/api/prices/stats");
  });

  it("builds a query string for 5-min params", async () => {
    await pricesApi.fiveMin({ days: 1, today: true });
    expect(calledUrl()).toBe("/api/prices/5min?days=1&today=true");
  });

  it("omits empty/false params from the query", async () => {
    await pricesApi.hourly({ days: 7, today: false, start: undefined });
    expect(calledUrl()).toBe("/api/prices/hourly?days=7");
  });

  it("passes an explicit start/end window", async () => {
    await pricesApi.fiveMin({ start: 1000, end: 2000 });
    expect(calledUrl()).toBe("/api/prices/5min?start=1000&end=2000");
  });
});
