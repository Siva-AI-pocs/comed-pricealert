import { api } from "./client.js";

export const subscriptionsApi = {
  list: () => api.get("/api/subscriptions"),
  subscribe: (body) => api.post("/api/subscribe", body),
  remove: (id) => api.del(`/api/subscribe/${id}`),
  sendNow: (id) => api.post(`/api/subscriptions/${id}/alert`),
};
