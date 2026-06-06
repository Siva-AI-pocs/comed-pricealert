import { cents } from "../format.js";
import "./MetersTable.css";

function channelsLabel(s) {
  const parts = [];
  if (s.email) parts.push(s.email);
  if (s.telegram_chat_id) parts.push(`Telegram ${s.telegram_chat_id}`);
  if (s.whatsapp_number) parts.push(`WhatsApp ${s.whatsapp_number}`);
  return parts.join(" · ");
}

export default function SubscriptionsTable({ subs, onRemove, onSendNow }) {
  if (!subs || subs.length === 0) {
    return <p style={{ color: "var(--dim)" }}>No alerts yet. Subscribe below.</p>;
  }
  return (
    <div className="meters-table">
      <table>
        <thead>
          <tr>
            <th>Channels</th>
            <th>Low</th>
            <th>High</th>
            <th>Last alerted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td>{channelsLabel(s)}</td>
              <td>{cents(s.threshold_cents)}</td>
              <td>{s.high_threshold_cents != null ? cents(s.high_threshold_cents) : "—"}</td>
              <td>
                {s.last_alerted_at
                  ? new Date(s.last_alerted_at).toLocaleString()
                  : "Never"}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  className="meter-remove"
                  style={{ color: "var(--accent)", marginRight: 8 }}
                  onClick={() => onSendNow(s.id)}
                >
                  Send now
                </button>
                <button
                  type="button"
                  className="meter-remove"
                  onClick={() => onRemove(s.id)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
