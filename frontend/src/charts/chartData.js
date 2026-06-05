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

/** Hourly bar series: labels (ISO hour), data (¢), per-bar tier colors. */
export function hourlyChartData(rows, readVar) {
  return {
    labels: rows.map((r) => r.hour_utc),
    data: rows.map((r) => r.avg_price_cents),
    colors: rows.map((r) => tierColor(r.avg_price_cents, readVar)),
  };
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
