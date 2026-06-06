import { cents } from "../format.js";
import { tierVar } from "../theme/tiers.js";

const c = (v) => (v === null || v === undefined ? undefined : { color: tierVar(v) });

export default function DailySummaryTable({ rows }) {
  return (
    <div className="daily-summary">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th className="r">Low</th>
            <th className="r">High</th>
            <th className="r">Avg</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.date}>
              <td>{r.date}</td>
              <td className="r tag" style={c(r.min_price)}>
                {cents(r.min_price)}
              </td>
              <td className="r tag" style={c(r.max_price)}>
                {cents(r.max_price)}
              </td>
              <td className="r tag" style={c(r.avg_price)}>
                {cents(r.avg_price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
