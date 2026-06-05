import "./AccuracyBadge.css";

export default function AccuracyBadge({ accuracy }) {
  if (!accuracy || accuracy.mae == null) {
    return (
      <div className="acc-badge muted">
        Tracking accuracy — comes online once forecasts can be scored against
        settled prices.
      </div>
    );
  }
  return (
    <div className="acc-badge">
      <div>
        <div className="acc-big">{accuracy.mae}¢</div>
        <div className="acc-lbl">Forecast MAE</div>
      </div>
      <div className="acc-div" />
      <div className="acc-sub">
        {accuracy.vs_day_ahead_pct != null ? (
          <>
            <b>{accuracy.vs_day_ahead_pct}% closer</b> to actual than PJM
            day-ahead
          </>
        ) : (
          "scored against settled real-time price"
        )}
      </div>
    </div>
  );
}
