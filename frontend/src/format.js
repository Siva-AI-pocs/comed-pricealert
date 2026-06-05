/** Format a cents/kWh value as "1.7¢", or an em dash for missing values. */
export function cents(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(digits)}¢`;
}

/** Format a cents amount as US dollars, e.g. 123 -> "$1.23"; em dash if missing. */
export function dollars(centsAmount) {
  if (centsAmount === null || centsAmount === undefined || Number.isNaN(Number(centsAmount)))
    return "—";
  const sign = centsAmount < 0 ? "-" : "";
  return `${sign}$${Math.abs(centsAmount / 100).toFixed(2)}`;
}

/** Signed percentage of `value` relative to `baseline`, or null if not computable. */
export function deltaPct(value, baseline) {
  if (value === null || value === undefined) return null;
  if (!baseline) return null; // null/undefined/0
  return Math.round(((value - baseline) / baseline) * 100);
}
