import { useEffect, useRef, useState } from "react";
import "./Select.css";

/**
 * Accessible custom dropdown matching the app's popover look (theme picker /
 * account menu). Drop-in replacement for a native <select> with a small,
 * curated option list. `options` is an array of [value, label] pairs.
 */
export default function Select({ value, onChange, options, id, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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

  const current = options.find(([v]) => v === value);
  const label = current ? current[1] : value;

  return (
    <div className="pp-select" ref={ref}>
      <button
        type="button"
        id={id}
        className="pp-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pp-select-value">{label}</span>
        <span className="pp-select-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="pp-select-pop" role="listbox" aria-label={ariaLabel}>
          {options.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={v === value}
              className={`pp-select-option${v === value ? " on" : ""}`}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
