import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi } from "../api/usage.js";
import { dollars } from "../format.js";
import UsageUpload from "../components/UsageUpload.jsx";
import MetersTable from "../components/MetersTable.jsx";
import UsageVsPriceChart from "../components/UsageVsPriceChart.jsx";
import SavingsSummary from "../components/SavingsSummary.jsx";
import "./UsageSavingsTab.css";

const RANGES = [
  { key: "24h", label: "24h", days: 1 },
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
];

export default function UsageSavingsTab() {
  const [meters, setMeters] = useState([]);
  const [insights, setInsights] = useState(null);
  const [range, setRange] = useState("30d");
  const [shiftPct, setShiftPct] = useState(30); // 0..80
  const [flatRate, setFlatRate] = useState(8.5); // ¢/kWh
  const [error, setError] = useState("");
  const debounce = useRef(null);

  const hasUsage = meters.some((m) => (m.interval_count || 0) > 0);

  const loadMeters = useCallback(async () => {
    try {
      setMeters(await usageApi.meters());
    } catch {
      /* ignore */
    }
  }, []);

  const loadInsights = useCallback(async (days, pct, rate) => {
    try {
      setInsights(await usageApi.insights({ days, shiftable_pct: pct / 100, flat_rate_cents: rate }));
      setError("");
    } catch {
      setError("Couldn't load usage insights.");
    }
  }, []);

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  // Refetch insights when range / slider / flat rate change (debounced).
  useEffect(() => {
    const days = RANGES.find((r) => r.key === range).days;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => loadInsights(days, shiftPct, flatRate), 350);
    return () => clearTimeout(debounce.current);
  }, [range, shiftPct, flatRate, loadInsights]);

  async function handleDelete(id) {
    try {
      await usageApi.deleteMeter(id);
    } catch {
      /* ignore */
    }
    loadMeters();
  }

  const s = insights?.summary;
  const estimated = insights?.hourly?.some((h) => h.price_estimated);

  return (
    <section data-testid="tab-usage" className="usage-tab">
      <h1 className="usage-h1">Usage &amp; Savings</h1>

      <div className="card">
        <div className="card-h">
          <h3>Upload your ComEd usage</h3>
        </div>
        <p className="usage-sub">
          Download a "Green Button" file from your ComEd account, then upload it here.
        </p>
        <UsageUpload onUploaded={loadMeters} />
      </div>

      {!hasUsage ? (
        <div className="card usage-empty">
          <p>Upload your ComEd usage to see it charted against hourly prices and how much you could save.</p>
        </div>
      ) : (
        <>
          <SavingsSummary summary={s} />

          <div className="card">
            <div className="card-h">
              <h3>Your usage vs price</h3>
              <div className="seg" role="group" aria-label="Range">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={range === r.key ? "on" : ""}
                    aria-pressed={range === r.key}
                    onClick={() => setRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {insights?.hourly?.length ? (
              <UsageVsPriceChart
                hourly={insights.hourly}
                granularity={range === "24h" ? "hour" : "day"}
              />
            ) : (
              <p className="faint">No overlapping usage and price data for this range.</p>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Shift-to-cheap savings calculator</h3>
              {s && <span className="calc-headline">+{dollars(s.shift_savings_cents)}</span>}
            </div>
            {s && (
              <>
                <p className="calc-copy">
                  Shift <b>~{Math.round(s.shiftable_kwh)} kWh</b> from peak to the day's cheapest hours and your{" "}
                  {dollars(s.actual_cost_cents)} bill drops to{" "}
                  <b className="good">{dollars(s.optimized_cost_cents)}</b>.
                </p>
                <label className="f" htmlFor="us-shift">
                  Shiftable peak load · <span className="accent">{shiftPct}%</span>
                </label>
                <div className="slider-row">
                  <input
                    id="us-shift"
                    type="range"
                    min="0"
                    max="80"
                    step="5"
                    value={shiftPct}
                    aria-label="Shiftable peak load percent"
                    onChange={(e) => setShiftPct(Number(e.target.value))}
                  />
                </div>
                <label className="f" htmlFor="us-rate">
                  Your flat rate (¢/kWh)
                </label>
                <div className="slider-row">
                  <input
                    id="us-rate"
                    type="number"
                    className="rate-input"
                    min="1"
                    max="40"
                    step="0.1"
                    value={flatRate}
                    aria-label="Flat rate cents per kWh"
                    onChange={(e) => setFlatRate(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="callout">
                  On hourly pricing you paid <b>{dollars(s.actual_cost_cents)}</b>. At a flat {flatRate}¢/kWh you'd
                  pay <b>{dollars(s.flat_cost_cents)}</b> — hourly pricing already saved you{" "}
                  <b className="good">{dollars(s.hourly_vs_flat_cents)}</b> this period.
                </div>
                {estimated && (
                  <p className="usage-note">
                    * Some hours use recent prices (we don't have exact prices for that period).
                  </p>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Imported meters</h3>
            </div>
            <MetersTable meters={meters} onDelete={handleDelete} />
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--spike)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
