import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError, setUnauthorizedHandler } from "./client.js";

function mockResponse({ ok = true, status = 200, json, text, contentType = "application/json" }) {
  return {
    ok,
    status,
    headers: { get: () => contentType },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(text),
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
  setUnauthorizedHandler(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("sends cookies (credentials: include) on GET", async () => {
    global.fetch.mockResolvedValue(mockResponse({ json: { ok: 1 } }));
    await api.get("/auth/me");
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.credentials).toBe("include");
    expect(opts.method).toBe("GET");
  });

  it("POSTs JSON with the right content-type and serialized body", async () => {
    global.fetch.mockResolvedValue(mockResponse({ json: { id: 1 } }));
    await api.post("/auth/login", { email: "a@b.com", password: "secret12" });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/auth/login");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ email: "a@b.com", password: "secret12" });
    expect(opts.credentials).toBe("include");
  });

  it("does NOT set a JSON content-type for FormData bodies", async () => {
    global.fetch.mockResolvedValue(mockResponse({ json: {} }));
    const fd = new FormData();
    fd.append("file", "x");
    await api.post("/api/usage/upload", fd);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers["Content-Type"]).toBeUndefined();
    expect(opts.body).toBe(fd);
  });

  it("throws ApiError with status + detail on a non-OK response", async () => {
    global.fetch.mockResolvedValue(
      mockResponse({ ok: false, status: 409, json: { detail: "Email already registered" } }),
    );
    await expect(api.post("/auth/register", {})).rejects.toMatchObject({
      status: 409,
      detail: "Email already registered",
    });
    await expect(api.post("/auth/register", {})).rejects.toBeInstanceOf(ApiError);
  });

  it("invokes the unauthorized handler on 401", async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    global.fetch.mockResolvedValue(mockResponse({ ok: false, status: 401, json: {} }));
    await expect(api.get("/api/usage/meters")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it("returns null for 204 No Content", async () => {
    global.fetch.mockResolvedValue(mockResponse({ status: 204, contentType: "" }));
    expect(await api.del("/api/subscribe/1")).toBeNull();
  });
});
