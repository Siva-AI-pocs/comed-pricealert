import { useTheme } from "../theme/ThemeContext.jsx";
import { THEMES, BRANDS } from "../theme/themes.js";
import "./ThemePicker.css";

const shortLabel = (brand) => brand.charAt(0).toUpperCase() + brand.slice(1);

export default function ThemePicker() {
  const { brand, mode, setBrand, toggleMode } = useTheme();

  return (
    <div className="theme-picker" role="group" aria-label="Theme">
      {BRANDS.map((b) => (
        <button
          key={b}
          type="button"
          className={`tp-brand${brand === b ? " on" : ""}`}
          aria-pressed={brand === b}
          onClick={() => setBrand(b)}
          title={THEMES[b].name}
        >
          <span className="tp-sw" aria-hidden="true">
            <i style={{ background: THEMES[b].light["--accent"] }} />
            <i style={{ background: THEMES[b].light["--accent2"] }} />
          </span>
          {shortLabel(b)}
        </button>
      ))}
      <button
        type="button"
        className="tp-mode"
        onClick={toggleMode}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {mode === "dark" ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
