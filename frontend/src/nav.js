/**
 * Primary navigation tabs. Desktop shows all five as top tabs; the mobile
 * bottom bar shows only the four `mobile` tabs (Usage & Savings folds under
 * More on phones), per design mockups 01 (desktop) and 03 (mobile).
 */
export const TABS = [
  { key: "now", to: "/", label: "Now", icon: "⚡", end: true, mobile: true },
  { key: "forecast", to: "/forecast", label: "Forecast", icon: "📈", mobile: true },
  { key: "usage", to: "/usage", label: "Usage & Savings", icon: "📊", mobile: false },
  { key: "alerts", to: "/alerts", label: "Alerts", icon: "🔔", mobile: true },
  { key: "more", to: "/more", label: "More", icon: "☰", mobile: true },
];

export const MOBILE_TABS = TABS.filter((t) => t.mobile);
