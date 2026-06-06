import { priceTier, tierMeta } from "../theme/tiers.js";
import { usageWindows } from "../charts/nowWindows.js";

const fmtHour = (d) => {
  let h = d.getHours();
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h} ${ap}`;
};

// endTs is the START of the window's last hour bucket; the window runs through
// the end of that hour, so add one hour for the closing label.
const fmtRange = (startTs, endTs) => {
  const start = new Date(startTs);
  const end = new Date(new Date(endTs).getTime() + 60 * 60 * 1000);
  return `${fmtHour(start)} – ${fmtHour(end)}`;
};

function Win({ token, icon, when, lbl, avg }) {
  return (
    <div className="win" style={{ "--w": `var(--${token})` }}>
      <div className="ico" aria-hidden="true">
        {icon}
      </div>
      <div>
        <div className="when">{when}</div>
        <div className="lbl">{lbl}</div>
      </div>
      <div className="badge">~{avg.toFixed(1)}¢</div>
    </div>
  );
}

export default function WhenToUsePower({ hourly }) {
  // "Today's" windows: the most recent 24 hourly points.
  const rows = (hourly || []).slice(-24);
  const w = usageWindows(rows, 3);

  return (
    <div className="card">
      <div className="card-h">
        <h3>When to use power today</h3>
      </div>
      {w ? (
        <div className="windows">
          <Win
            token={tierMeta(priceTier(w.cheapest.avg)).token}
            icon="🟢"
            when={fmtRange(w.cheapest.startTs, w.cheapest.endTs)}
            lbl="Cheapest 3-hour window"
            avg={w.cheapest.avg}
          />
          <Win
            token={tierMeta(priceTier(w.peak.avg)).token}
            icon="🔴"
            when={fmtRange(w.peak.startTs, w.peak.endTs)}
            lbl="Priciest window · avoid if you can"
            avg={w.peak.avg}
          />
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          Not enough price data yet to suggest windows.
        </p>
      )}
    </div>
  );
}
