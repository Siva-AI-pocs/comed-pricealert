import { priceTier, tierMeta } from "../theme/tiers.js";

/**
 * Resolve the rendered tier color for a price. `readVar(name)` returns the
 * value of a CSS custom property (e.g. getComputedStyle(...).getPropertyValue).
 * Charts need concrete colors, so the active theme's tokens are resolved here.
 */
export function tierColor(price, readVar) {
  return readVar(`--${tierMeta(priceTier(price)).token}`).trim();
}

/** 5-min line series: {x: epoch-ms, y: ¢} points + per-point tier colors. */
export function fiveMinChartData(rows, readVar) {
  return {
    points: rows.map((r) => ({ x: r.millis_utc, y: r.price_cents })),
    colors: rows.map((r) => tierColor(r.price_cents, readVar)),
  };
}

/**
 * Hourly bar series: labels (epoch-ms), data (¢ or null), per-bar tier colors.
 *
 * The API only returns hours that have an average, so any hour without data is
 * simply absent — which on a category axis makes consecutive bars look like a
 * continuous run and "hides" the missing hours. We fill the gaps so every hour
 * between the first and last sample gets a slot: missing hours render as a null
 * (no bar) rather than collapsing the axis.
 */
export function hourlyChartData(rows, readVar) {
  if (!rows.length) return { labels: [], data: [], colors: [] };
  const HOUR = 3600 * 1000;
  const byHour = new Map();
  for (const r of rows) {
    const t = Math.floor(new Date(r.hour_utc).getTime() / HOUR) * HOUR;
    byHour.set(t, r.avg_price_cents);
  }
  const times = [...byHour.keys()].sort((a, b) => a - b);
  const start = times[0];
  const end = times[times.length - 1];
  const labels = [];
  const data = [];
  const colors = [];
  for (let t = start; t <= end; t += HOUR) {
    const avg = byHour.has(t) ? byHour.get(t) : null;
    labels.push(t);
    data.push(avg);
    colors.push(avg == null ? "transparent" : tierColor(avg, readVar));
  }
  return { labels, data, colors };
}

/** Usage-vs-price dual-axis series from insights.hourly rows. */
export function usageVsPriceData(hourly, readVar) {
  return {
    labels: hourly.map((h) => h.hour_utc),
    usage: hourly.map((h) => h.kwh),
    price: hourly.map((h) => h.price_cents),
    priceColors: hourly.map((h) => tierColor(h.price_cents, readVar)),
  };
}
