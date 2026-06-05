import { api } from "./client.js";
import { qs } from "./qs.js";

export const forecastApi = {
  get: (hours = 48) => api.get(`/api/forecast${qs({ hours })}`),
  accuracy: () => api.get("/api/forecast/accuracy"),
};
