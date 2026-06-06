/**
 * Brand themes for ComEd Price Pulse (DESIGN_SYSTEM.md / theme-picker mockup).
 *
 * Three distinctive, non-purple brand directions — Voltaic (electric blue,
 * default), Grid (control-room teal), Volt (neon lime) — each with a light
 * (default) and dark variant. Themes swap purely via CSS custom properties on
 * the document root. The 5 price-tier tokens (--neg/--cheap/--moderate/--high/
 * --spike) are SEMANTIC and stay consistent across brands; only the brand
 * accent and surfaces change.
 */

export const BRANDS = ["voltaic", "grid", "volt"];
export const MODES = ["light", "dark"];
export const DEFAULT_BRAND = "voltaic";
export const DEFAULT_MODE = "light";

// localStorage key for the persisted { brand, mode } preference.
export const STORAGE_KEY = "pp-theme";

export const TOKEN_KEYS = [
  "--bg",
  "--card",
  "--line",
  "--txt",
  "--dim",
  "--faint",
  "--accent",
  "--accent2",
  "--on-accent",
  "--neg",
  "--cheap",
  "--moderate",
  "--high",
  "--spike",
];

export const THEMES = {
  voltaic: {
    name: "Voltaic — electric blue",
    desc: "Clean, trustworthy, high-voltage. An electric royal-blue accent on deep slate-navy.",
    dark: {
      "--bg": "#0a0f1c",
      "--card": "#121a2e",
      "--card-2": "#18223b",
      "--line": "#20294150",
      "--line-soft": "#1b244033",
      "--txt": "#eaf0ff",
      "--dim": "#93a4c7",
      "--faint": "#5a6b91",
      "--accent": "#2f72ff",
      "--accent2": "#38bdf8",
      "--on-accent": "#ffffff",
      "--neg": "#06b6d4",
      "--cheap": "#10b981",
      "--moderate": "#f5b301",
      "--high": "#fb7a3c",
      "--spike": "#ef4444",
    },
    light: {
      "--bg": "#f1f5fc",
      "--card": "#ffffff",
      "--card-2": "#f5f8fd",
      "--line": "#e4e9f5",
      "--line-soft": "#eef2fa",
      "--txt": "#0c1426",
      "--dim": "#51607e",
      "--faint": "#95a1bd",
      "--accent": "#1f5fff",
      "--accent2": "#2f8bff",
      "--on-accent": "#ffffff",
      "--neg": "#0891b2",
      "--cheap": "#059669",
      "--moderate": "#d97706",
      "--high": "#ea580c",
      "--spike": "#dc2626",
    },
  },
  grid: {
    name: "Grid — control-room teal",
    desc: "Techy, calm, infrastructure. A deep jade-teal accent on near-black ink.",
    dark: {
      "--bg": "#08110f",
      "--card": "#0f1c1a",
      "--card-2": "#142623",
      "--line": "#1c2e2b60",
      "--line-soft": "#16302c33",
      "--txt": "#e9f5f1",
      "--dim": "#8fb0a8",
      "--faint": "#54716b",
      "--accent": "#14b8a6",
      "--accent2": "#2dd4bf",
      "--on-accent": "#04201c",
      "--neg": "#0891b2",
      "--cheap": "#22c55e",
      "--moderate": "#eab308",
      "--high": "#f97316",
      "--spike": "#f43f5e",
    },
    light: {
      "--bg": "#eef5f3",
      "--card": "#ffffff",
      "--card-2": "#f3faf8",
      "--line": "#dfeae7",
      "--line-soft": "#e8f1ee",
      "--txt": "#07140f",
      "--dim": "#4a655d",
      "--faint": "#8aa39b",
      "--accent": "#0d9488",
      "--accent2": "#14b8a6",
      "--on-accent": "#ffffff",
      "--neg": "#0891b2",
      "--cheap": "#16a34a",
      "--moderate": "#ca8a04",
      "--high": "#ea580c",
      "--spike": "#e11d48",
    },
  },
  volt: {
    name: "Volt — neon lime",
    desc: "Bold, energetic, unmistakable. A volt lime-chartreuse accent on warm near-black; lime is brand-only, never on price data.",
    dark: {
      "--bg": "#0c0d08",
      "--card": "#15170f",
      "--card-2": "#1d2014",
      "--line": "#262a1a70",
      "--line-soft": "#23261633",
      "--txt": "#f3f6e9",
      "--dim": "#aeb59a",
      "--faint": "#6b7258",
      "--accent": "#c4f132",
      "--accent2": "#9ade00",
      "--on-accent": "#10130a",
      "--neg": "#06b6d4",
      "--cheap": "#16a34a",
      "--moderate": "#f59e0b",
      "--high": "#f97316",
      "--spike": "#dc2626",
    },
    light: {
      "--bg": "#f6f7ee",
      "--card": "#ffffff",
      "--card-2": "#f8f9ef",
      "--line": "#e9ebda",
      "--line-soft": "#eef0df",
      "--txt": "#14150c",
      "--dim": "#5f6347",
      "--faint": "#9aa07f",
      "--accent": "#5f8c00",
      "--accent2": "#7cb900",
      "--on-accent": "#ffffff",
      "--neg": "#0891b2",
      "--cheap": "#16a34a",
      "--moderate": "#d97706",
      "--high": "#ea580c",
      "--spike": "#dc2626",
    },
  },
};
