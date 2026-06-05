import { cents } from "../format.js";
import "./StatsBar.css";

export default function StatsBar({ stats }) {
  if (!stats) return null;
  const cards = [
    { label: "Current price", value: stats.current_price },
    { label: "This hour avg", value: stats.hourly_avg },
    { label: "Today low", value: stats.day_min },
    { label: "Today high", value: stats.day_max },
    { label: "7-day avg", value: stats.week_avg },
  ];
  return (
    <div className="stats-bar">
      {cards.map((c) => (
        <div className="stat-card" key={c.label}>
          <div className="stat-label">{c.label}</div>
          <div className="stat-value">{cents(c.value)}</div>
        </div>
      ))}
    </div>
  );
}
