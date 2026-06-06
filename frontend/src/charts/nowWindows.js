/**
 * Pure helper for the Now tab's "when to use power today" card.
 * Given today's hourly rows ({ hour_utc, avg_price_cents }, ascending), find the
 * cheapest and most-expensive contiguous `len`-hour windows. Returns indices +
 * boundary timestamps so the component can format local-time labels; null when
 * there isn't enough data for a window.
 */
function extremeWindow(rows, len, pick) {
  let best = null;
  for (let i = 0; i + len <= rows.length; i++) {
    const slice = rows.slice(i, i + len);
    const avg = slice.reduce((a, r) => a + r.avg_price_cents, 0) / len;
    if (best === null || pick(avg, best.avg)) {
      best = {
        start: i,
        end: i + len - 1,
        avg,
        startTs: rows[i].hour_utc,
        endTs: rows[i + len - 1].hour_utc,
      };
    }
  }
  return best;
}

export function usageWindows(rows, len = 3) {
  if (!rows || rows.length < len) return null;
  return {
    cheapest: extremeWindow(rows, len, (a, b) => a < b),
    peak: extremeWindow(rows, len, (a, b) => a > b),
  };
}
