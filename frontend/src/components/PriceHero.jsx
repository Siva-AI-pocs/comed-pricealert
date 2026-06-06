import { priceTier, tierMeta } from "../theme/tiers.js";
import { cents, deltaPct } from "../format.js";

function Mini({ k, v }) {
  const tok = v !== null && v !== undefined ? tierMeta(priceTier(Number(v))).token : null;
  return (
    <div className="mini">
      <div className="k">{k}</div>
      <div className="v" style={tok ? { color: `var(--${tok})` } : undefined}>
        {v !== null && v !== undefined ? cents(v) : "—"}
      </div>
    </div>
  );
}

export default function PriceHero({ stats, decision }) {
  const has =
    stats && stats.current_price !== null && stats.current_price !== undefined;
  const price = has ? Number(stats.current_price) : null;
  const tier = has ? priceTier(price) : "cheap";
  const { token, label } = tierMeta(tier);
  const delta = has ? deltaPct(price, stats.week_avg) : null;
  const badge = decision?.recommendation || `${label} — current price`;

  return (
    <div
      className="card hero-now"
      data-testid="price-hero"
      data-tier={has ? tier : ""}
      style={{ "--tier": `var(--${token})` }}
    >
      <span className="tier-badge" style={{ "--tier": `var(--${token})` }}>
        {decision?.emoji ? `${decision.emoji} ` : "● "}
        {badge}
      </span>

      <div className="price-big" style={{ color: `var(--${token})` }}>
        {has ? price.toFixed(1) : "—"}
        <span className="c">¢</span>
      </div>

      <div className="price-sub">
        per kWh
        {has && stats.week_avg !== null && stats.week_avg !== undefined && delta !== null && (
          <>
            {" · vs 7-day avg of "}
            {cents(stats.week_avg)}{" "}
            <span style={{ color: `var(--${token})`, fontWeight: 700 }}>
              {`${delta <= 0 ? "↓" : "↑"}${Math.abs(delta)}%`}
            </span>
          </>
        )}
      </div>

      <div className="hero-stats">
        <Mini k="Today's Low" v={stats?.day_min} />
        <Mini k="Today's High" v={stats?.day_max} />
        <Mini k="Hour Avg" v={stats?.hourly_avg} />
        <Mini k="7-Day Avg" v={stats?.week_avg} />
      </div>
    </div>
  );
}
