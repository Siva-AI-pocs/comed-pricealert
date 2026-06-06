/**
 * Primary navigation menu. Desktop renders these as top tabs (like the mockup);
 * mobile renders them inside the hamburger side drawer. Privacy/Terms live in
 * the page footer, not here. History (daily summary + trend) lives inside Now;
 * My Data (Green Button upload + meters) lives inside Usage & Savings.
 */
export const MENU = [
  { key: "now", to: "/", label: "Now", icon: "⚡", end: true },
  { key: "forecast", to: "/forecast", label: "Forecast", icon: "📈" },
  { key: "usage", to: "/usage", label: "Usage & Savings", icon: "📊" },
  { key: "alerts", to: "/alerts", label: "Alerts", icon: "🔔" },
];
