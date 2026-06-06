/**
 * Pure forecast-insight helpers (ported from the handoff ForecastTab logic):
 * derive the cheapest window, a 6-hour EV-charging block, and the peak spike
 * risk from a list of forecast points. UI labels are built in the component;
 * these return indices/values so they're deterministic and testable.
 */

const hod = (ts) => new Date(ts).getHours();

/** Lowest-average contiguous window of `len` hours. */
export function bestWindow(rows, len) {
  let best = { start: 0, len, avg: Infinity };
  for (let i = 0; i + len <= rows.length; i++) {
    const slice = rows.slice(i, i + len);
    const avg = slice.reduce((a, r) => a + r.p50, 0) / len;
    if (avg < best.avg) best = { start: i, len, avg };
  }
  return best;
}

function avgSpread(rows, start, len) {
  const s = rows.slice(start, start + len);
  if (!s.length) return 0;
  return s.reduce((a, r) => a + (r.p90 - r.p10), 0) / s.length;
}

// Confidence shrinks as the band widens.
const conf = (rows, w) =>
  Math.max(55, Math.min(95, Math.round(100 - avgSpread(rows, w.start, w.len) * 12)));

const riskOf = (r) => r.spike_prob ?? (r.p50 > 10 ? 0.5 : 0);

export function deriveInsights(rows) {
  if (!rows || rows.length === 0) return null;

  const cheapest = bestWindow(rows, 3);
  const ev = bestWindow(rows, 6);

  let si = 0;
  rows.forEach((r, i) => {
    if (riskOf(r) > riskOf(rows[si])) si = i;
  });
  const spikePct = Math.round(riskOf(rows[si]) * 100) || (rows[si].p50 > 10 ? 45 : 5);

  return {
    cheapest: {
      startIndex: cheapest.start,
      startTs: rows[cheapest.start].target_ts,
      avg: cheapest.avg,
      conf: conf(rows, cheapest),
    },
    ev: {
      startIndex: ev.start,
      startTs: rows[ev.start].target_ts,
      avg: ev.avg,
      lengthHours: 6,
      conf: conf(rows, ev),
    },
    spike: {
      index: si,
      ts: rows[si].target_ts,
      hour: hod(rows[si].target_ts),
      pct: spikePct,
    },
  };
}
