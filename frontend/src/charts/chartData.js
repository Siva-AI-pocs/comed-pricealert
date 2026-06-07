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

// The API serializes naive-UTC timestamps with no "Z", which `new Date()` would
// (wrongly) read as local time. Treat a bare timestamp as UTC so Central-Time
// day bucketing is correct regardless of the viewer's machine timezone.
function asUtcDate(iso) {
  const utc = /(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`;
  return new Date(utc);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Central-Time "YYYY-MM-DD" key for grouping hourly rows into calendar days
// (matches how ComEd bills and how the rest of the app buckets days).
function centralDayKey(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asUtcDate(iso));
}

// Display labels: "Jun 1" for a day key, "Jun 1, 3 PM" (Central) for an hour.
const dayLabel = (key) => {
  const [, m, d] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
};
const hourLabel = (iso) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: true,
  }).format(asUtcDate(iso));

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Dual-axis usage-vs-price series from insights.hourly rows, bucketed to the
 * requested granularity ("hour" or "day"). The mockup's chart shows ~30 daily
 * bars for the 30d range; plotting ~720 raw hourly bars instead renders as a
 * near-empty smear, so 7d/30d aggregate to daily and only 24h stays hourly.
 * Per-day price is the simple mean of that day's hourly prices.
 */
export function usageVsPriceSeries(hourly, granularity, readVar) {
  if (!hourly || !hourly.length) {
    return { labels: [], usage: [], price: [], priceColors: [] };
  }

  if (granularity === "hour") {
    const usage = hourly.map((h) => h.kwh);
    const price = hourly.map((h) => h.price_cents);
    return {
      labels: hourly.map((h) => hourLabel(h.hour_utc)),
      usage,
      price,
      priceColors: price.map((p) => tierColor(p, readVar)),
    };
  }

  const buckets = new Map();
  for (const h of hourly) {
    const key = centralDayKey(h.hour_utc);
    const b = buckets.get(key) || { kwh: 0, priceSum: 0, n: 0 };
    b.kwh += h.kwh;
    b.priceSum += h.price_cents;
    b.n += 1;
    buckets.set(key, b);
  }
  const keys = [...buckets.keys()].sort(); // YYYY-MM-DD sorts chronologically
  const price = keys.map((k) => round3(buckets.get(k).priceSum / buckets.get(k).n));
  return {
    labels: keys.map(dayLabel),
    usage: keys.map((k) => round3(buckets.get(k).kwh)),
    price,
    priceColors: price.map((p) => tierColor(p, readVar)),
  };
}
