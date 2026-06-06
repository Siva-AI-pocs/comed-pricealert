import { api } from "./client.js";
import { qs } from "./qs.js";

export const pricesApi = {
  stats: () => api.get("/api/prices/stats"),
  current: () => api.get("/api/prices/current"),
  fiveMin: (params) => api.get(`/api/prices/5min${qs(params)}`),
  hourly: (params) => api.get(`/api/prices/hourly${qs(params)}`),
  dailySummary: () => api.get("/api/prices/daily-summary"),
};
