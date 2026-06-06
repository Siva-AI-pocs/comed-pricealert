// Single source of truth for the PWA web app manifest.
// vite.config.js feeds this object to vite-plugin-pwa; manifest.test.js locks
// the install-critical fields. Colors track the default Voltaic (light) theme
// from theme/themes.js so the install splash matches the app's first paint.
export const PWA_MANIFEST = {
  name: "ComEd Price Pulse",
  short_name: "Price Pulse",
  description: "Real-time ComEd electricity prices, forecasts, and price alerts.",
  display: "standalone",
  // Served by FastAPI under /app/ during staging; scope keeps the SW + nav
  // contained to the SPA. At cutover (VITE_BASE=/) regenerate with base "/".
  start_url: "/app/",
  scope: "/app/",
  theme_color: "#1f5fff", // Voltaic light --accent
  background_color: "#f1f5fc", // Voltaic light --bg
  icons: [
    { src: "/app/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/app/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/app/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
