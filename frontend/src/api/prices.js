import { api } from "./client.js";

function qs(params = {}) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== false,
  );
  if (!entries.length) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

export const pricesApi = {
  stats: () => api.get("/api/prices/stats"),
  current: () => api.get("/api/prices/current"),
  fiveMin: (params) => api.get(`/api/prices/5min${qs(params)}`),
  hourly: (params) => api.get(`/api/prices/hourly${qs(params)}`),
  dailySummary: () => api.get("/api/prices/daily-summary"),
};
