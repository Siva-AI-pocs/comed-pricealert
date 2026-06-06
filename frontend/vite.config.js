import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA is served same-origin by FastAPI so the HTTP-only auth cookie works.
// In dev, proxy the API/auth paths to the running uvicorn backend.
// In prod, build hashed assets into app/static_spa/ (served at /static_spa/).
export default defineConfig({
  plugins: [react()],
  // Served by FastAPI under /app during staging. At cutover, rebuild with
  // VITE_BASE=/ to serve at the site root. react-router basename derives from
  // this via import.meta.env.BASE_URL, so no code change is needed at cutover.
  base: process.env.VITE_BASE || "/app/",
  build: {
    outDir: "../app/static_spa",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/auth": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.js"],
    css: false,
  },
});
