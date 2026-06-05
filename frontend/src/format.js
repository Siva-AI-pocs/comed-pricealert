/** Format a cents/kWh value as "1.7¢", or an em dash for missing values. */
export function cents(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(digits)}¢`;
}

/** Signed percentage of `value` relative to `baseline`, or null if not computable. */
export function deltaPct(value, baseline) {
  if (value === null || value === undefined) return null;
  if (!baseline) return null; // null/undefined/0
  return Math.round(((value - baseline) / baseline) * 100);
}
