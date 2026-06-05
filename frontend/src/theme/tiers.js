/**
 * The 5-tier SEMANTIC price scale — shared with the backend (/api/decision)
 * and DESIGN_SYSTEM.md. These colors are meaning, not decoration: keep them
 * consistent everywhere and always pair with text/icon (never color alone).
 *
 * Each tier owns its lower bound:
 *   Negative  < 0      (token --neg)
 *   Cheap     0 – 3    (token --cheap)
 *   Moderate  3 – 8    (token --moderate)
 *   High      8 – 15   (token --high)
 *   Spike     15+      (token --spike)
 */
export const PRICE_TIERS = [
  { key: "negative", token: "neg", label: "Negative", max: 0 },
  { key: "cheap", token: "cheap", label: "Cheap", max: 3 },
  { key: "moderate", token: "moderate", label: "Moderate", max: 8 },
  { key: "high", token: "high", label: "High", max: 15 },
  { key: "spike", token: "spike", label: "Spike", max: Infinity },
];

const _byKey = Object.fromEntries(PRICE_TIERS.map((t) => [t.key, t]));

/** Tier key ("negative" | "cheap" | "moderate" | "high" | "spike") for a price (¢/kWh). */
export function priceTier(price) {
  const p = Number(price);
  for (const tier of PRICE_TIERS) {
    if (p < tier.max) return tier.key;
  }
  return "spike";
}

/** Metadata ({ key, token, label, max }) for a tier key. */
export function tierMeta(key) {
  return _byKey[key];
}

/** CSS custom-property reference for a price, e.g. `var(--neg)`. */
export function tierVar(price) {
  return `var(--${_byKey[priceTier(price)].token})`;
}
