import { useEffect, useRef } from "react";
import { Chart } from "../charts/chartSetup.js";
import { usageVsPriceSeries } from "../charts/chartData.js";

const readVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name);

export default function UsageVsPriceChart({ hourly = [], granularity = "day" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { labels, usage, price } = usageVsPriceSeries(hourly, granularity, readVar);
    const faint = readVar("--faint").trim();
    const line = readVar("--line").trim();
    const accent = readVar("--accent").trim();
    const spike = readVar("--spike").trim();

    const chart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Usage (kWh)",
            data: usage,
            backgroundColor: `color-mix(in srgb, ${accent} 80%, transparent)`,
            yAxisID: "y",
            borderRadius: 3,
            maxBarThickness: granularity === "hour" ? 14 : 22,
          },
          {
            type: "line",
            label: "Price (¢/kWh)",
            data: price,
            borderColor: spike,
            backgroundColor: "transparent",
            yAxisID: "y1",
            pointRadius: 0,
            tension: 0.35,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: faint, usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: faint, maxTicksLimit: 8 } },
          y: {
            position: "left",
            grid: { color: line },
            border: { display: false },
            ticks: { color: faint, callback: (v) => `${v} kWh` },
          },
          y1: {
            position: "right",
            grid: { display: false },
            border: { display: false },
            ticks: { color: faint, callback: (v) => `${v}¢` },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [hourly, granularity]);

  return (
    <div className="chart-box chart-tall" style={{ position: "relative", height: 300 }}>
      <canvas ref={ref} />
    </div>
  );
}
