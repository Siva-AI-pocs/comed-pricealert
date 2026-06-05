import { useEffect, useRef } from "react";
import { Chart } from "../charts/chartSetup.js";
import { hourlyChartData } from "../charts/chartData.js";

const readVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name);

const hourLabel = (iso) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: true,
  });

export default function PriceChartHourly({ rows = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { labels, data, colors } = hourlyChartData(rows, readVar);
    const faint = readVar("--faint").trim();
    const line = readVar("--line").trim();

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels.map(hourLabel),
        datasets: [
          {
            label: "Hourly avg",
            data,
            backgroundColor: colors,
            borderRadius: 4,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (i) => `${i.parsed.y.toFixed(1)}¢` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: faint, maxTicksLimit: 10 } },
          y: {
            grid: { color: line },
            ticks: { color: faint, callback: (v) => `${v}¢` },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [rows]);

  return (
    <div className="chart-box" style={{ position: "relative", height: 240 }}>
      <canvas ref={ref} />
    </div>
  );
}
