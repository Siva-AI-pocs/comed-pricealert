import React, { useEffect, useRef, useState, useMemo } from "react";
import * as ChartNS from "chart.js";

// Robust across chart.js build shapes (namespace / default / auto-registered)
const Chart = ChartNS.Chart || ChartNS.default || ChartNS;
const registerables = ChartNS.registerables;
try { if (registerables && Chart?.register) Chart.register(...registerables); } catch (_) {}

/**
 * ForecastTab — drop into the ComEd Price Pulse dashboard as a new tab.
 *
 *   <ForecastTab apiUrl="/api/forecast" theme="light" />
 *
 * Expects GET {apiUrl}?hours=48 -> [{ target_ts, p10, p50, p90, spike_prob, da_lmp, model_version }]
 * Optional GET {apiUrl}/accuracy -> { mae, vs_day_ahead_pct, daily:[{day, model, da}] }
 * If the endpoint isn't live yet, it renders preview data so you can style it now.
 */
class FcBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err)
      return (
        <pre style={{ color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 10, padding: 16, whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "monospace" }}>
          Forecast failed to render:{"\n"}{String(this.state.err?.message || this.state.err)}
        </pre>
      );
    return this.props.children;
  }
}

export default function ForecastTab(props) {
  return (
    <FcBoundary>
      <ForecastTabInner {...props} />
    </FcBoundary>
  );
}

function ForecastTabInner({ apiUrl = "/api/forecast", theme = "light" }) {
  const [rows, setRows] = useState(null);
  const [acc, setAcc] = useState(null);
  const [preview, setPreview] = useState(false);

  const t = THEMES[theme] || THEMES.light;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${apiUrl}?hours=48`);
        if (!r.ok) throw new Error("no endpoint");
        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
        if (alive) { setRows(normalize(data)); setPreview(false); }
      } catch {
        if (alive) { setRows(MOCK_FORECAST()); setPreview(true); }
      }
      try {
        const r = await fetch(`${apiUrl}/accuracy`);
        if (!r.ok) throw new Error();
        const a = await r.json();
        if (alive) setAcc(a);
      } catch { if (alive) setAcc(MOCK_ACC); }
    })();
    return () => { alive = false; };
  }, [apiUrl]);

  if (!rows) return <div style={{ color: t.dim, padding: 24 }}>Loading forecast…</div>;
  return <View rows={rows} acc={acc} t={t} preview={preview} />;
}

/* ---------------- presentation ---------------- */
function View({ rows, acc, t, preview }) {
  const tier = (p) => (p < 0 ? t.neg : p < 3 ? t.cheap : p < 8 ? t.moderate : p < 15 ? t.high : t.spike);
  const insights = useMemo(() => deriveInsights(rows), [rows]);

  const rootVars = {
    "--accent": t.accent, "--card": t.card, "--bg2": t.bg2, "--line": t.line,
    "--txt": t.txt, "--dim": t.dim, "--faint": t.faint,
    "--cheap": t.cheap, "--neg": t.neg, "--moderate": t.moderate, "--high": t.high, "--spike": t.spike,
  };

  return (
    <div className="fc-root" style={rootVars}>
      <style>{CSS}</style>

      {/* header + accuracy */}
      <div className="fc-head">
        <div>
          <h2 className="fc-h1">48-Hour Price Forecast</h2>
          <p className="fc-sub">Probabilistic forecast of ComEd real-time price · updated hourly</p>
        </div>
        {acc && (
          <div className="fc-badge">
            <div><div className="fc-badge-big">{fmt(acc.mae)}¢</div><div className="fc-badge-lbl">Forecast MAE</div></div>
            <div className="fc-badge-div" />
            <div className="fc-badge-sub"><b style={{ color: t.cheap }}>{acc.vs_day_ahead_pct}% closer</b> to
              actual than PJM day-ahead <span style={{ color: t.faint }}>(30-day backtest)</span></div>
          </div>
        )}
      </div>

      {preview && (
        <div className="fc-note-banner">Showing preview data — connect <code>GET /api/forecast</code> to go live.</div>
      )}

      {/* forecast band chart */}
      <div className="fc-card">
        <div className="fc-card-h"><h3>Predicted price by hour <span style={{ color: t.faint, fontWeight: 500 }}>(¢/kWh)</span></h3></div>
        <div className="fc-legend">
          <span><i style={{ borderColor: t.accent }} />Forecast (median)</span>
          <span><span className="fc-band" style={{ background: t.accent + "33" }} />Likely range (P10–P90)</span>
          <span><i style={{ borderColor: t.faint, borderTopStyle: "dashed" }} />PJM day-ahead</span>
          <span><i style={{ borderColor: t.spike, borderTopStyle: "dotted" }} />Spike threshold</span>
        </div>
        <ForecastChart rows={rows} t={t} tier={tier} />
      </div>

      {/* insight cards */}
      <div className="fc-plan">
        <PlanCard t={t} c={t.cheap} icon="🟢" k="Cheapest window" when={insights.cheapest.label}
          meta={`predicted ~${fmt(insights.cheapest.avg)}¢ · run dishwasher, laundry, EV`} conf={`${insights.cheapest.conf}% confidence`} />
        <PlanCard t={t} c={t.neg} icon="🔋" k="Best 6-hr EV charge block" when={insights.ev.label}
          meta={`avg ~${fmt(insights.ev.avg)}¢ over 6 hours`} conf={`${insights.ev.conf}% confidence`} />
        <PlanCard t={t} c={t.spike} icon="⚠️" k="Highest spike risk" when={insights.spike.label}
          meta={`could exceed 10¢ · pre-cool before peak`} conf={`${insights.spike.pct}% chance > 10¢`} />
      </div>

      {/* spike risk strip */}
      <div className="fc-card">
        <div className="fc-card-h"><h3>Spike-risk timeline · next 48h</h3>
          <span style={{ color: t.faint, fontWeight: 600, fontSize: 12.5 }}>green = safe · red = avoid</span></div>
        <div className="fc-strip">
          {rows.map((r, i) => (
            <div key={i} className="fc-strip-seg" title={`${hourLabel(r.target_ts)} · ${fmt(r.p50)}¢`}
              style={{ background: tier(r.p50) }} />
          ))}
        </div>
        <div className="fc-strip-lbls"><span>Now</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div>
      </div>

      {/* accuracy + inputs */}
      <div className="fc-grid2">
        <div className="fc-card">
          <div className="fc-card-h"><h3>How accurate has it been?</h3>
            <span style={{ color: t.faint, fontWeight: 600, fontSize: 12.5 }}>MAE · last 7 days</span></div>
          {acc?.daily ? <AccuracyChart daily={acc.daily} t={t} /> : <div style={{ color: t.faint, padding: 20 }}>No accuracy data yet.</div>}
          <p className="fc-note">Lower is better. Scored against the settled real-time price, shown next to PJM day-ahead so you can judge the edge.</p>
        </div>
        <div className="fc-card">
          <div className="fc-card-h"><h3>What the forecast looks at</h3></div>
          <div className="fc-chips">
            {["📈 PJM day-ahead LMP", "⚡ 7-day load forecast", "🌡️ Chicago weather",
              "🕒 Recent 5-min prices", "☀️ Solar / wind forecast", "📅 Hour · day · holiday"]
              .map((c) => <span key={c} className="fc-chip">{c}</span>)}
          </div>
          <p className="fc-note" style={{ marginTop: 16 }}>The model learns the gap between day-ahead and what actually
            happens, then corrects for it — so a hot-afternoon spike that day-ahead underprices still shows up here.
            Bands widen when the grid is harder to predict.</p>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ t, c, icon, k, when, meta, conf }) {
  return (
    <div className="fc-pcard" style={{ borderTopColor: c }}>
      <div className="fc-pic">{icon}</div>
      <div className="fc-pk">{k}</div>
      <div className="fc-pwhen">{when}</div>
      <div className="fc-pmeta">{meta}</div>
      <span className="fc-pconf" style={{ color: c, background: c + "1a" }}>● {conf}</span>
    </div>
  );
}

/* ---------------- charts (Chart.js) ---------------- */
function ForecastChart({ rows, t, tier }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !Chart) return;
    const ctx = ref.current.getContext("2d");
    const labels = rows.map((r) => hourLabel(r.target_ts));
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, t.accent + "44"); grad.addColorStop(1, t.accent + "0f");
    let chart;
    try {
      chart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [
          { label: "P10", data: rows.map((r) => r.p10), borderColor: "transparent", pointRadius: 0 },
          { label: "P90", data: rows.map((r) => r.p90), borderColor: "transparent", backgroundColor: grad, pointRadius: 0, fill: "-1", tension: .35 },
          { label: "Forecast", data: rows.map((r) => r.p50), borderColor: t.accent, borderWidth: 3, pointRadius: 0, tension: .35,
            segment: { borderColor: (s) => tier(s?.p1?.parsed?.y ?? 0) } },
          { label: "Day-ahead", data: rows.map((r) => r.da_lmp), borderColor: t.faint, borderWidth: 2, borderDash: [6, 5], pointRadius: 0, tension: .3 },
          { label: "Spike threshold", data: rows.map(() => 10), borderColor: t.spike, borderWidth: 1.5, borderDash: [2, 4], pointRadius: 0 },
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: false }, tooltip: { filter: (i) => i.dataset.label !== "P10",
            callbacks: { label: (i) => `${i.dataset.label}: ${i.parsed.y.toFixed(1)}¢` } } },
          scales: { x: { grid: { display: false }, ticks: { color: t.faint, font: { size: 10 }, maxTicksLimit: 12 } },
            y: { grid: { color: t.line }, border: { display: false }, ticks: { color: t.faint, callback: (v) => v + "¢" } } } },
      });
    } catch (e) { console.error("ForecastChart:", e); }
    return () => { if (chart) chart.destroy(); };
  }, [rows, t, tier]);
  return <div className="fc-chartbox"><canvas ref={ref} /></div>;
}

function AccuracyChart({ daily, t }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !Chart) return;
    let chart;
    try {
      chart = new Chart(ref.current.getContext("2d"), {
        type: "bar",
        data: { labels: daily.map((d) => d.day), datasets: [
          { label: "Our forecast", data: daily.map((d) => d.model), backgroundColor: t.accent, borderRadius: 5, maxBarThickness: 16 },
          { label: "PJM day-ahead", data: daily.map((d) => d.da), backgroundColor: t.faint + "88", borderRadius: 5, maxBarThickness: 16 },
        ] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, font: { size: 11.5 }, color: t.dim } } },
          scales: { x: { grid: { display: false }, ticks: { color: t.faint } },
            y: { grid: { color: t.line }, border: { display: false }, ticks: { color: t.faint, callback: (v) => v + "¢" } } } },
      });
    } catch (e) { console.error("AccuracyChart:", e); }
    return () => { if (chart) chart.destroy(); };
  }, [daily, t]);
  return <div className="fc-maebox"><canvas ref={ref} /></div>;
}

/* ---------------- data helpers ---------------- */
function normalize(data) {
  return data.map((d) => ({
    target_ts: d.target_ts, p10: +d.p10, p50: +d.p50, p90: +d.p90,
    spike_prob: d.spike_prob != null ? +d.spike_prob : null,
    da_lmp: d.da_lmp != null ? +d.da_lmp : null,
  }));
}

function deriveInsights(rows) {
  const cheapest = bestWindow(rows, 3);
  const ev = bestWindow(rows, 6);
  let s = rows[0], si = 0;
  const risk = (r) => r.spike_prob ?? (r.p50 > 10 ? 0.5 : 0);
  rows.forEach((r, i) => { if (risk(r) > risk(s)) { s = r; si = i; } });
  const spikePct = Math.round(risk(s) * 100) || (s.p50 > 10 ? 45 : 5);
  const conf = (w) => Math.max(55, Math.min(95, Math.round(100 - avgSpread(rows, w.start, w.len) * 12)));
  return {
    cheapest: { label: windowLabel(rows, cheapest), avg: cheapest.avg, conf: conf(cheapest) },
    ev: { label: windowLabel(rows, ev), avg: ev.avg, conf: conf(ev) },
    spike: { label: windowLabel(rows, { start: Math.max(0, si - 1), len: 3 }), pct: spikePct },
  };
}
function bestWindow(rows, len) {
  let best = { start: 0, len, avg: Infinity };
  for (let i = 0; i + len <= rows.length; i++) {
    const slice = rows.slice(i, i + len);
    const avg = slice.reduce((a, r) => a + r.p50, 0) / len;
    if (avg < best.avg) best = { start: i, len, avg };
  }
  return best;
}
function avgSpread(rows, start, len) {
  const s = rows.slice(start, start + len);
  if (!s.length) return 0;
  return s.reduce((a, r) => a + (r.p90 - r.p10), 0) / s.length;
}
function windowLabel(rows, w) {
  const startRow = rows[w.start];
  const endIdx = Math.min(w.start + w.len, rows.length - 1);
  const a = new Date(startRow.target_ts);
  const today = new Date();
  const dayPrefix = a.getDate() === today.getDate() ? "" : "tomorrow ";
  return `${dayPrefix}${hourLabel(startRow.target_ts)} – ${hourLabel(rows[endIdx].target_ts)}`;
}
function hourLabel(ts) {
  const h = new Date(ts).getHours();
  return `${h % 12 || 12}${h < 12 ? "AM" : "PM"}`;
}
const fmt = (n) => (n == null || isNaN(n) ? "—" : (+n).toFixed(1));

/* ---------------- preview data (used only if endpoint absent) ---------------- */
function MOCK_FORECAST() {
  const now = new Date(); now.setMinutes(0, 0, 0);
  const out = [];
  for (let h = 0; h < 48; h++) {
    const ts = new Date(now.getTime() + h * 3600e3); const hod = ts.getHours();
    let base = hod >= 16 && hod <= 20 ? 8 + (hod === 17 ? 9 : hod === 18 ? 5 : 2)
      : hod >= 0 && hod <= 5 ? 1 + Math.random() * .6
        : hod >= 6 && hod <= 9 ? 3 + Math.random() * 2 : 1.8 + Math.random() * 1.6;
    const med = +base.toFixed(2); const sp = med > 7 ? med * .45 : med * .22;
    out.push({ target_ts: ts.toISOString(), p50: med, p10: +Math.max(-1, med - sp).toFixed(2),
      p90: +(med + sp).toFixed(2), spike_prob: med > 8 ? .41 : .03,
      da_lmp: +(med * (med > 7 ? .62 : 1.05) + (Math.random() - .5)).toFixed(2) });
  }
  return out;
}
const MOCK_ACC = { mae: 0.8, vs_day_ahead_pct: 31, daily: [
  { day: "Mon", model: 0.7, da: 1.3 }, { day: "Tue", model: 0.9, da: 1.8 }, { day: "Wed", model: 1.1, da: 2.4 },
  { day: "Thu", model: 0.6, da: 1.0 }, { day: "Fri", model: 0.8, da: 1.6 }, { day: "Sat", model: 0.5, da: 0.9 },
  { day: "Sun", model: 0.9, da: 1.4 }] };

/* ---------------- theme + css ---------------- */
const THEMES = {
  light: { accent: "#4f46e5", card: "#ffffff", bg2: "#f7f8fc", line: "#eaecf3", txt: "#161b27", dim: "#5a647a",
    faint: "#9aa3ba", cheap: "#16a34a", neg: "#0891b2", moderate: "#d97706", high: "#ea580c", spike: "#dc2626" },
  dark: { accent: "#7c5cff", card: "#161b27", bg2: "#1b2230", line: "#222a39", txt: "#eef2fb", dim: "#9aa6bf",
    faint: "#5f6b85", cheap: "#34d399", neg: "#22d3ee", moderate: "#fbbf24", high: "#fb923c", spike: "#f87171" },
};

const CSS = `
.fc-root{font-family:inherit;color:var(--txt)}
.fc-root h2,.fc-root h3{margin:0}
.fc-head{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.fc-h1{font-size:24px;font-weight:800;letter-spacing:-.02em}
.fc-sub{color:var(--dim);font-size:14px;margin:3px 0 0}
.fc-badge{margin-left:auto;display:flex;align-items:center;gap:13px;background:var(--card);
  border:1px solid var(--cheap);border-radius:14px;padding:11px 16px}
.fc-badge-big{font-weight:800;font-size:24px;color:var(--cheap);line-height:1}
.fc-badge-lbl{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:600}
.fc-badge-div{width:1px;height:32px;background:var(--line)}
.fc-badge-sub{font-size:12.5px;color:var(--dim);max-width:160px}
.fc-note-banner{background:var(--bg2);border:1px dashed var(--line);border-radius:10px;padding:9px 13px;
  font-size:12.5px;color:var(--dim);margin-bottom:14px}
.fc-note-banner code{font-size:11.5px}
.fc-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px}
.fc-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.fc-card-h h3{font-size:15px;font-weight:700}
.fc-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--dim);font-weight:600;margin:6px 0}
.fc-legend i{display:inline-block;width:20px;border-top:3px solid;vertical-align:middle;margin-right:6px;border-radius:2px}
.fc-band{display:inline-block;width:15px;height:11px;border-radius:3px;vertical-align:middle;margin-right:6px}
.fc-chartbox{position:relative;height:300px;margin-top:8px}
.fc-maebox{position:relative;height:165px;margin-top:6px}
.fc-plan{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px}
.fc-pcard{background:var(--card);border:1px solid var(--line);border-top:4px solid;border-radius:15px;padding:16px}
.fc-pic{font-size:21px}
.fc-pk{font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-top:8px}
.fc-pwhen{font-weight:800;font-size:20px;letter-spacing:-.01em;margin-top:3px}
.fc-pmeta{font-size:13px;color:var(--dim);margin-top:5px}
.fc-pconf{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 10px;margin-top:10px}
.fc-strip{display:flex;height:32px;border-radius:9px;overflow:hidden;margin-top:10px;border:1px solid var(--line)}
.fc-strip-seg{flex:1;opacity:.85}
.fc-strip-lbls{display:flex;justify-content:space-between;font-size:11px;color:var(--faint);margin-top:6px;font-weight:600}
.fc-grid2{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}
.fc-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.fc-chip{background:var(--bg2);border:1px solid var(--line);border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:600;color:var(--dim)}
.fc-note{font-size:12.5px;color:var(--faint);margin:12px 0 0;line-height:1.55}
@media(max-width:760px){.fc-plan,.fc-grid2{grid-template-columns:1fr}.fc-badge{margin-left:0}}
`;
