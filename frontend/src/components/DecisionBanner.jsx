import "./DecisionBanner.css";

/**
 * Plain-language "should I use power now?" banner, driven by GET /api/decision.
 * Tier color comes from the semantic token (var(--<color_class>)); the emoji +
 * text ensure the meaning is never conveyed by color alone (accessibility).
 */
export default function DecisionBanner({ decision }) {
  if (!decision) return null;
  const token = decision.color_class || "moderate";
  return (
    <div
      className="decision-banner"
      data-testid="decision-banner"
      data-tier={decision.level}
      style={{
        borderColor: `var(--${token})`,
        color: `var(--${token})`,
        background: `color-mix(in srgb, var(--${token}) 12%, transparent)`,
      }}
      role="status"
    >
      <span className="db-emoji" aria-hidden="true">
        {decision.emoji}
      </span>
      <span className="db-text">{decision.recommendation}</span>
    </div>
  );
}
