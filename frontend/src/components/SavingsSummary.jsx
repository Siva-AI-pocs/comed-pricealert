import { dollars } from "../format.js";
import "./SavingsSummary.css";

// The handoff dashboard's three "save" cards: usage on hourly pricing, the same
// usage on a flat rate, and what hourly pricing saved.
export default function SavingsSummary({ summary }) {
  if (!summary) return null;
  return (
    <div className="save-grid">
      <div className="save">
        <div className="k">Your usage · hourly pricing</div>
        <div className="v">{dollars(summary.actual_cost_cents)}</div>
      </div>
      <div className="save">
        <div className="k">Same usage · flat {summary.flat_rate_cents}¢</div>
        <div className="v">{dollars(summary.flat_cost_cents)}</div>
      </div>
      <div className="save good">
        <div className="k">Hourly pricing saved you</div>
        <div className="v">{dollars(summary.hourly_vs_flat_cents)}</div>
      </div>
    </div>
  );
}
