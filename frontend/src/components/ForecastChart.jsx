import { useEffect, useRef } from "react";
import { Chart } from "../charts/chartSetup.js";
import { tierColor } from "../charts/chartData.js";

const readVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name);

const hourLabel = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "numeric", hour12: true });

const SPIKE_THRESHOLD = 10;

export default function ForecastChart({ rows = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const accent = readVar("--accent").trim();
    const faint = readVar("--faint").trim();
    const line = readVar("--line").trim();
    const spike = readVar("--spike").trim();

    const labels = rows.map((r) => hourLabel(r.target_ts));
    const segColor = (c) => tierColor(rows[c.p1DataIndex]?.p50 ?? 0, readVar) || accent;

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "P10", data: rows.map((r) => r.p10), borderColor: "transparent", pointRadius: 0 },
          {
            label: "P90",
            data: rows.map((r) => r.p90),
            borderColor: "transparent",
            backgroundColor: `color-mix(in srgb, ${accent} 22%, transparent)`,
            pointRadius: 0,
            fill: "-1",
            tension: 0.35,
          },
          {
            label: "Forecast",
            data: rows.map((r) => r.p50),
            borderColor: accent,
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.35,
            segment: { borderColor: segColor },
          },
          {
            label: "Day-ahead",
            data: rows.map((r) => r.da_lmp),
            borderColor: faint,
            borderWidth: 2,
            borderDash: [6, 5],
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: "Spike threshold",
            data: rows.map(() => SPIKE_THRESHOLD),
            borderColor: spike,
            borderWidth: 1.5,
            borderDash: [2, 4],
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (i) => i.dataset.label !== "P10",
            callbacks: { label: (i) => `${i.dataset.label}: ${i.parsed.y?.toFixed(1)}¢` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: faint, maxTicksLimit: 12 } },
          y: { grid: { color: line }, ticks: { color: faint, callback: (v) => `${v}¢` } },
        },
      },
    });
    return () => chart.destroy();
  }, [rows]);

  return (
    <div className="chart-box" style={{ position: "relative", height: 300 }}>
      <canvas ref={ref} />
    </div>
  );
}
