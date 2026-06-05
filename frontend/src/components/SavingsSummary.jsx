import { dollars } from "../format.js";
import "./StatsBar.css";

export default function SavingsSummary({ summary }) {
  if (!summary) return null;
  const cards = [
    {
      label: "Hourly vs flat savings",
      value: dollars(summary.hourly_vs_flat_cents),
      hint: `vs ${summary.flat_rate_cents}¢ flat rate`,
    },
    {
      label: "Shift-to-cheap savings",
      value: dollars(summary.shift_savings_cents),
      hint: `if ${Math.round((summary.shiftable_pct || 0) * 100)}% shifted`,
    },
    {
      label: `Total usage (${summary.days}d)`,
      value: `${summary.total_kwh.toFixed(1)} kWh`,
      hint: "",
    },
  ];
  return (
    <div className="stats-bar" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
      {cards.map((c) => (
        <div className="stat-card" key={c.label}>
          <div className="stat-label">{c.label}</div>
          <div className="stat-value">{c.value}</div>
          {c.hint && (
            <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 2 }}>
              {c.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
