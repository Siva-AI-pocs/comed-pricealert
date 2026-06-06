import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  THEMES,
  BRANDS,
  MODES,
  DEFAULT_BRAND,
  DEFAULT_MODE,
  STORAGE_KEY,
} from "./themes";

const ThemeContext = createContext(null);

function loadPreference() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const brand = BRANDS.includes(saved.brand) ? saved.brand : DEFAULT_BRAND;
      const mode = MODES.includes(saved.mode) ? saved.mode : DEFAULT_MODE;
      return { brand, mode };
    }
  } catch {
    // Corrupt/unavailable storage — fall back to defaults.
  }
  return { brand: DEFAULT_BRAND, mode: DEFAULT_MODE };
}

/** Apply a brand+mode's CSS custom properties to the document root. */
function applyTheme(brand, mode) {
  const variant = THEMES[brand][mode];
  const root = document.documentElement;
  for (const [token, value] of Object.entries(variant)) {
    root.style.setProperty(token, value);
  }
  root.setAttribute("data-theme", mode);
  root.setAttribute("data-brand", brand);
}

export function ThemeProvider({ children }) {
  const [{ brand, mode }, setPref] = useState(loadPreference);

  useEffect(() => {
    applyTheme(brand, mode);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ brand, mode }));
    } catch {
      // Ignore storage write failures (private mode, quota, etc.).
    }
  }, [brand, mode]);

  const setBrand = useCallback(
    (next) => setPref((p) => (BRANDS.includes(next) ? { ...p, brand: next } : p)),
    [],
  );
  const setMode = useCallback(
    (next) => setPref((p) => (MODES.includes(next) ? { ...p, mode: next } : p)),
    [],
  );
  const toggleMode = useCallback(
    () => setPref((p) => ({ ...p, mode: p.mode === "dark" ? "light" : "dark" })),
    [],
  );

  return (
    <ThemeContext.Provider value={{ brand, mode, setBrand, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
