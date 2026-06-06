import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forecastApi } from "./forecast.js";

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

describe("forecastApi", () => {
  it("requests the forecast with an hours param", async () => {
    await forecastApi.get(48);
    expect(global.fetch.mock.calls[0][0]).toBe("/api/forecast?hours=48");
  });
  it("requests accuracy", async () => {
    await forecastApi.accuracy();
    expect(global.fetch.mock.calls[0][0]).toBe("/api/forecast/accuracy");
  });
});
