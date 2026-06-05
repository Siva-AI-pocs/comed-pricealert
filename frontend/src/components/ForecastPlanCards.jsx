import { cents } from "../format.js";
import "./ForecastPlanCards.css";

const t = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "numeric", hour12: true });

export default function ForecastPlanCards({ insights }) {
  if (!insights) return null;
  const { cheapest, ev, spike } = insights;
  const cards = [
    {
      token: "cheap",
      icon: "🟢",
      kicker: "Cheapest window",
      when: t(cheapest.startTs),
      meta: `~${cents(cheapest.avg)} · run dishwasher, laundry, EV`,
      foot: `${cheapest.conf}% confidence`,
    },
    {
      token: "neg",
      icon: "🔋",
      kicker: "Best 6-hr EV charge",
      when: t(ev.startTs),
      meta: `avg ~${cents(ev.avg)} over ${ev.lengthHours} hours`,
      foot: `${ev.conf}% confidence`,
    },
    {
      token: "spike",
      icon: "⚠️",
      kicker: "Highest spike risk",
      when: t(spike.ts),
      meta: "could exceed 10¢ · pre-cool before peak",
      foot: `${spike.pct}% chance > 10¢`,
    },
  ];

  return (
    <div className="fc-plan">
      {cards.map((c) => (
        <div
          className="fc-pcard"
          key={c.kicker}
          style={{ borderTopColor: `var(--${c.token})` }}
        >
          <div className="fc-pic" aria-hidden="true">
            {c.icon}
          </div>
          <div className="fc-pk">{c.kicker}</div>
          <div className="fc-pwhen">{c.when}</div>
          <div className="fc-pmeta">{c.meta}</div>
          <span
            className="fc-pconf"
            style={{
              color: `var(--${c.token})`,
              background: `color-mix(in srgb, var(--${c.token}) 14%, transparent)`,
            }}
          >
            ● {c.foot}
          </span>
        </div>
      ))}
    </div>
  );
}
