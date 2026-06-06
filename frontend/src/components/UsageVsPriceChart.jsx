import { useEffect, useRef } from "react";
import { Chart } from "../charts/chartSetup.js";
import { usageVsPriceData } from "../charts/chartData.js";

const readVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name);

const hourLabel = (iso) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: true,
  });

export default function UsageVsPriceChart({ hourly = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { labels, usage, price, priceColors } = usageVsPriceData(hourly, readVar);
    const faint = readVar("--faint").trim();
    const line = readVar("--line").trim();
    const accent = readVar("--accent").trim();

    const chart = new Chart(ctx, {
      data: {
        labels: labels.map(hourLabel),
        datasets: [
          {
            type: "bar",
            label: "Usage (kWh)",
            data: usage,
            backgroundColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
            yAxisID: "y",
            borderRadius: 3,
            maxBarThickness: 16,
          },
          {
            type: "line",
            label: "Price (¢)",
            data: price,
            borderColor: priceColors,
            segment: { borderColor: (c) => priceColors[c.p1DataIndex] || faint },
            yAxisID: "y1",
            pointRadius: 0,
            tension: 0.3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: faint, boxWidth: 10 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: faint, maxTicksLimit: 10 } },
          y: {
            position: "left",
            grid: { color: line },
            ticks: { color: faint, callback: (v) => `${v} kWh` },
          },
          y1: {
            position: "right",
            grid: { display: false },
            ticks: { color: faint, callback: (v) => `${v}¢` },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [hourly]);

  return (
    <div className="chart-box" style={{ position: "relative", height: 260 }}>
      <canvas ref={ref} />
    </div>
  );
}
