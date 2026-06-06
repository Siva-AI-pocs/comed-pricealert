import { api } from "./client.js";
import { qs } from "./qs.js";

export const usageApi = {
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/api/usage/upload", fd);
  },
  meters: () => api.get("/api/usage/meters"),
  deleteMeter: (id) => api.del(`/api/usage/meter/${id}`),
  hourly: (params) => api.get(`/api/usage/hourly${qs(params)}`),
  // shiftable_pct is a FRACTION (0..1), not a percent.
  insights: (params) => api.get(`/api/usage/insights${qs(params)}`),
};
