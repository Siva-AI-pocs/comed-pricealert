import { cents } from "../format.js";
import "./DailySummaryTable.css";

export default function DailySummaryTable({ rows }) {
  return (
    <div className="daily-summary">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Low</th>
            <th>High</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.date}>
              <td>{r.date}</td>
              <td>{cents(r.min_price)}</td>
              <td>{cents(r.max_price)}</td>
              <td>{cents(r.avg_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
