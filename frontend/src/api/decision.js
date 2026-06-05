import { api } from "./client.js";

export const decisionApi = {
  get: () => api.get("/api/decision"),
};
