import { api } from "./client.js";

// Thin wrappers over the auth endpoints (behaviour covered by AuthContext tests).
export const authApi = {
  me: () => api.get("/auth/me", { skipAuthHandler: true }),
  login: (email, password) => api.post("/auth/login", { email, password }),
  register: (email, password) => api.post("/auth/register", { email, password }),
  logout: () => api.post("/auth/logout"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (email, code, new_password) =>
    api.post("/auth/reset-password", { email, code, new_password }),
  changePassword: (old_password, new_password) =>
    api.post("/auth/change-password", { old_password, new_password }, { skipAuthHandler: true }),
  updateProfile: (fields) => api.patch("/auth/me", fields),
  changeEmail: (new_email, password) =>
    api.post("/auth/change-email", { new_email, password }, { skipAuthHandler: true }),
};
