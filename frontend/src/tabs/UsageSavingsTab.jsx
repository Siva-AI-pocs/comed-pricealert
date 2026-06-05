import { useEffect, useState, useCallback } from "react";
import { usageApi } from "../api/usage.js";
import UsageUpload from "../components/UsageUpload.jsx";
import MetersTable from "../components/MetersTable.jsx";
import UsageVsPriceChart from "../components/UsageVsPriceChart.jsx";
import SavingsSummary from "../components/SavingsSummary.jsx";
import "./UsageSavingsTab.css";

export default function UsageSavingsTab() {
  const [meters, setMeters] = useState([]);
  const [insights, setInsights] = useState(null);
  const [shiftPct, setShiftPct] = useState(30); // UI percent (0–100)
  const [error, setError] = useState("");

  const loadMeters = useCallback(async () => {
    try {
      setMeters(await usageApi.meters());
    } catch {
      /* ignore */
    }
  }, []);

  const loadInsights = useCallback(async (pct) => {
    try {
      setInsights(await usageApi.insights({ days: 7, shiftable_pct: pct / 100 }));
      setError("");
    } catch {
      setError("Couldn't load usage insights.");
    }
  }, []);

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  useEffect(() => {
    loadInsights(shiftPct);
  }, [shiftPct, loadInsights]);

  async function handleDelete(id) {
    try {
      await usageApi.deleteMeter(id);
    } catch {
      /* ignore */
    }
    loadMeters();
    loadInsights(shiftPct);
  }

  function handleUploaded() {
    loadMeters();
    loadInsights(shiftPct);
  }

  return (
    <section data-testid="tab-usage" className="usage-tab">
      <h2>Usage &amp; Savings</h2>

      <UsageUpload onUploaded={handleUploaded} />

      <h3 className="usage-h3">Imported meters</h3>
      <MetersTable meters={meters} onDelete={handleDelete} />

      <h3 className="usage-h3">Your usage vs price</h3>
      {insights && insights.hourly.length > 0 ? (
        <UsageVsPriceChart hourly={insights.hourly} />
      ) : (
        <p style={{ color: "var(--dim)" }}>
          Upload Green Button data to see your usage against price.
        </p>
      )}

      <h3 className="usage-h3">Savings</h3>
      <label className="shift-control">
        Shiftable usage: <strong>{shiftPct}%</strong>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={shiftPct}
          aria-label="Shiftable usage percent"
          onChange={(e) => setShiftPct(Number(e.target.value))}
        />
      </label>
      <SavingsSummary summary={insights?.summary} />

      {error && (
        <p role="alert" style={{ color: "var(--spike)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
