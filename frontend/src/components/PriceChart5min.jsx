import { useEffect, useRef } from "react";
import { Chart } from "../charts/chartSetup.js";
import { fiveMinChartData } from "../charts/chartData.js";

const readVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name);

export default function PriceChart5min({ rows = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / no-canvas environments

    const { points, colors } = fiveMinChartData(rows, readVar);
    const accent = readVar("--accent").trim();
    const faint = readVar("--faint").trim();
    const line = readVar("--line").trim();

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "5-min price",
            data: points,
            borderColor: accent,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            segment: { borderColor: (c) => colors[c.p1DataIndex] || accent },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (i) => `${i.parsed.y.toFixed(1)}¢` },
          },
          zoom: {
            zoom: { drag: { enabled: true }, mode: "x" },
          },
          annotation: {
            annotations: {
              zero: {
                type: "line",
                yMin: 0,
                yMax: 0,
                borderColor: faint,
                borderWidth: 1,
                borderDash: [4, 4],
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            grid: { display: false },
            ticks: {
              color: faint,
              maxTicksLimit: 8,
              callback: (v) =>
                new Date(v).toLocaleTimeString([], {
                  hour: "numeric",
                  hour12: true,
                }),
            },
          },
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
    <div className="chart-box" style={{ position: "relative", height: 280 }}>
      <canvas ref={ref} />
    </div>
  );
}
