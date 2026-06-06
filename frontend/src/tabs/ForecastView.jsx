import { useEffect, useState } from "react";
import { forecastApi } from "../api/forecast.js";
import { deriveInsights } from "../charts/forecastData.js";
import ForecastChart from "../components/ForecastChart.jsx";
import ForecastPlanCards from "../components/ForecastPlanCards.jsx";
import AccuracyBadge from "../components/AccuracyBadge.jsx";

export default function ForecastView() {
  const [rows, setRows] = useState(null); // null = loading
  const [accuracy, setAccuracy] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await forecastApi.get(48);
        if (alive) setRows(Array.isArray(r) ? r : []);
      } catch {
        if (alive) setRows([]);
      }
      try {
        const a = await forecastApi.accuracy();
        if (alive) setAccuracy(a);
      } catch {
        /* accuracy is optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const insights = rows && rows.length ? deriveInsights(rows) : null;

  return (
    <section data-testid="tab-forecast">
      <h2>48-hour price forecast</h2>
      <p style={{ color: "var(--dim)", marginTop: 0 }}>
        Probabilistic forecast of ComEd real-time price · updated hourly
      </p>

      {rows === null ? (
        <p style={{ color: "var(--dim)" }}>Loading forecast…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--dim)" }}>
          Forecast will appear here once enough price history is collected.
        </p>
      ) : (
        <>
          <AccuracyBadge accuracy={accuracy} />
          <ForecastPlanCards insights={insights} />
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "18px 0 6px" }}>
            Predicted price by hour <span style={{ color: "var(--faint)" }}>(¢/kWh)</span>
          </h3>
          <ForecastChart rows={rows} />
        </>
      )}
    </section>
  );
}
