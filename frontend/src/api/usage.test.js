import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usageApi } from "./usage.js";

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

describe("usageApi", () => {
  it("uploads a file as multipart FormData (no JSON content-type)", async () => {
    const file = new File(["<xml/>"], "usage.xml", { type: "application/xml" });
    await usageApi.upload(file);
    const [url, opts] = call();
    expect(url).toBe("/api/usage/upload");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get("file")).toBe(file);
    expect(opts.headers["Content-Type"]).toBeUndefined();
  });

  it("deletes a meter by id", async () => {
    await usageApi.deleteMeter(7);
    const [url, opts] = call();
    expect(url).toBe("/api/usage/meter/7");
    expect(opts.method).toBe("DELETE");
  });

  it("requests insights with a shiftable fraction", async () => {
    await usageApi.insights({ days: 7, shiftable_pct: 0.3 });
    expect(call()[0]).toBe("/api/usage/insights?days=7&shiftable_pct=0.3");
  });
});
