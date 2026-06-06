import { useEffect, useState } from "react";
import { pricesApi } from "../api/prices.js";
import { decisionApi } from "../api/decision.js";
import PriceHero from "../components/PriceHero.jsx";
import WhenToUsePower from "../components/WhenToUsePower.jsx";
import PriceChart5min from "../components/PriceChart5min.jsx";
import PriceChartHourly from "../components/PriceChartHourly.jsx";
import DailySummaryTable from "../components/DailySummaryTable.jsx";

const RANGES = [
  { key: "today", label: "Today", params: { today: true } },
  { key: "24h", label: "24h", params: { days: 1 } },
  { key: "7d", label: "7d", params: { days: 7 } },
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
        // 503 when no price data yet — leave the badge on the tier label
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
    <section data-testid="tab-now">
      <div className="hero">
        <PriceHero stats={stats} decision={decision} />
        <WhenToUsePower hourly={hourly} />
      </div>

      <div className="card">
        <div className="card-h">
          <h3>
            Price by hour{" "}
            <span className="faint" style={{ fontWeight: 500 }}>
              (¢/kWh)
            </span>
          </h3>
          <div className="seg" role="group" aria-label="Chart range">
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
        {historyError && (
          <p role="alert" style={{ color: "var(--spike)", fontSize: 14 }}>
            {historyError}
          </p>
        )}
        <PriceChartHourly rows={hourly} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <h3>Live 5-minute price</h3>
          <span className="faint" style={{ fontWeight: 600 }}>
            drag to zoom
          </span>
        </div>
        <PriceChart5min rows={fiveMin} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <h3>7-day daily summary</h3>
        </div>
        <DailySummaryTable rows={daily} />
      </div>
    </section>
  );
}
