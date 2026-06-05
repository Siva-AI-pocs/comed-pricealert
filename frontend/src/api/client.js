/**
 * Tiny fetch wrapper for the same-origin FastAPI backend.
 *
 * Always sends the auth cookie (`credentials: "include"`), serializes JSON
 * bodies (but leaves FormData alone so the browser sets the multipart
 * boundary), and surfaces backend errors as ApiError(status, detail). A single
 * registered handler is invoked on any 401 so the app can drop to logged-out.
 */

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

let onUnauthorized = null;

/** Register a callback invoked whenever a request returns 401. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body, opts = {}) {
  const headers = {};
  let payload;
  if (body instanceof FormData) {
    payload = body; // let the browser set multipart/form-data; boundary=...
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(path, {
    method,
    headers,
    body: payload,
    credentials: "include",
  });

  if (res.status === 401 && onUnauthorized && !opts.skipAuthHandler) {
    onUnauthorized();
  }

  if (!res.ok) {
    let detail;
    try {
      const data = await res.json();
      detail = data?.detail;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json") ? res.json() : res.text();
}

export const api = {
  get: (path, opts) => request("GET", path, undefined, opts),
  post: (path, body, opts) => request("POST", path, body, opts),
  del: (path, opts) => request("DELETE", path, undefined, opts),
};
