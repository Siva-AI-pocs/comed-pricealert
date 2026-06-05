// Placeholder — the probabilistic 48h ForecastTab (handoff component, wired to
// /api/forecast via a theme-token wrapper) lands in the forecast task.
export default function ForecastView() {
  return (
    <section data-testid="tab-forecast">
      <h2>48-hour forecast</h2>
      <p style={{ color: "var(--dim)" }}>Forecast coming soon.</p>
    </section>
  );
}
