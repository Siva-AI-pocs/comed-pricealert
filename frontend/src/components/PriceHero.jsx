import { priceTier, tierMeta } from "../theme/tiers.js";
import { deltaPct } from "../format.js";
import "./PriceHero.css";

export default function PriceHero({ stats }) {
  if (!stats || stats.current_price === null || stats.current_price === undefined) {
    return (
      <div className="price-hero" data-testid="price-hero" data-tier="">
        <div className="ph-price">—</div>
        <p className="ph-sub">Waiting for price data…</p>
      </div>
    );
  }

  const price = Number(stats.current_price);
  const tier = priceTier(price);
  const { token, label } = tierMeta(tier);
  const delta = deltaPct(price, stats.week_avg);

  return (
    <div className="price-hero" data-testid="price-hero" data-tier={tier}>
      <span
        className="ph-pill"
        style={{
          color: `var(--${token})`,
          borderColor: `var(--${token})`,
          background: `color-mix(in srgb, var(--${token}) 14%, transparent)`,
        }}
      >
        ● {label}
      </span>
      <div className="ph-price" style={{ color: `var(--${token})` }}>
        {price.toFixed(1)}
        <span className="ph-cent">¢</span>
      </div>
      <p className="ph-sub">
        per kWh
        {delta !== null && (
          <>
            {" · "}
            <span style={{ fontWeight: 700 }}>
              {delta <= 0 ? "↓" : "↑"}
              {Math.abs(delta)}%
            </span>{" "}
            vs 7-day avg
          </>
        )}
      </p>
    </div>
  );
}
