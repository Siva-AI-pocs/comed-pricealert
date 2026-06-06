import { useEffect, useRef, useState } from "react";
import { useTheme } from "../theme/ThemeContext.jsx";
import { THEMES, BRANDS } from "../theme/themes.js";
import "./ThemePicker.css";

const shortLabel = (brand) => brand.charAt(0).toUpperCase() + brand.slice(1);

export default function ThemePicker() {
  const { brand, mode, setBrand, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close the popover on Escape or any click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={ref}>
      <button
        type="button"
        className="pp-iconbtn tp-trigger"
        aria-label="Choose theme"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        🎨
      </button>

      {open && (
        <div className="tp-pop" role="dialog" aria-label="Theme">
          <span className="tp-label">Theme</span>
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
          <span className="tp-divider" aria-hidden="true" />
          <button
            type="button"
            className="tp-mode"
            onClick={toggleMode}
            aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span aria-hidden="true">{mode === "dark" ? "☀️" : "🌙"}</span>
            {mode === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      )}
    </div>
  );
}
