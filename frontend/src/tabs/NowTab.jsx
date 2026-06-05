import { useEffect, useState } from "react";
import { pricesApi } from "../api/prices.js";
import { decisionApi } from "../api/decision.js";
import PriceHero from "../components/PriceHero.jsx";
import DecisionBanner from "../components/DecisionBanner.jsx";
import StatsBar from "../components/StatsBar.jsx";
import PriceChart5min from "../components/PriceChart5min.jsx";
import PriceChartHourly from "../components/PriceChartHourly.jsx";
import DailySummaryTable from "../components/DailySummaryTable.jsx";
import "./NowTab.css";

const RANGES = [
  { key: "today", label: "Today", params: { today: true } },
  { key: "24h", label: "24 hours", params: { days: 1 } },
  { key: "7d", label: "7 days", params: { days: 7 } },
];

export default function NowTab() {
  const [stats, setStats] = useState(null);
  const [decision, setDecision] = useState(null);
  const [daily, setDaily] = useState([]);
  const [fiveMin, setFiveMin] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [range, setRange] = useState("7d");
  const [historyError, setHistoryError] = useState("");

  // One-shot: hero/stats/decision/daily summary.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await pricesApi.stats();
        if (alive) setStats(s);
      } catch {
        /* stats endpoint returns nulls, not errors, in practice */
      }
      try {
        const d = await decisionApi.get();
        if (alive) setDecision(d);
      } catch {
        // 503 when no price data yet — leave the banner hidden
      }
      try {
        const ds = await pricesApi.dailySummary();
        if (alive) setDaily(ds);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Charts refetch when the range preset changes.
  useEffect(() => {
    let alive = true;
    const params = RANGES.find((r) => r.key === range).params;
    (async () => {
      try {
        const [fm, hr] = await Promise.all([
          pricesApi.fiveMin(params),
          pricesApi.hourly(params),
        ]);
        if (alive) {
          setFiveMin(fm);
          setHourly(hr);
          setHistoryError("");
        }
      } catch {
        if (alive) setHistoryError("Couldn't load price history.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [range]);

  return (
    <section data-testid="tab-now" className="now-tab">
      <PriceHero stats={stats} />
      <DecisionBanner decision={decision} />
      <StatsBar stats={stats} />

      <div className="range-tabs" role="group" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`range-btn${range === r.key ? " on" : ""}`}
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {historyError && (
        <p className="now-error" role="alert">
          {historyError}
        </p>
      )}

      <h3 className="now-h3">5-minute prices</h3>
      <PriceChart5min rows={fiveMin} />

      <h3 className="now-h3">Hourly averages</h3>
      <PriceChartHourly rows={hourly} />

      <h3 className="now-h3">Last 7 days</h3>
      <DailySummaryTable rows={daily} />
    </section>
  );
}
