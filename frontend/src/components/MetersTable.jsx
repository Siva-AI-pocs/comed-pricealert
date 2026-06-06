import "./MetersTable.css";

export default function MetersTable({ meters, onDelete }) {
  if (!meters || meters.length === 0) {
    return <p style={{ color: "var(--dim)" }}>No meters uploaded yet.</p>;
  }
  return (
    <div className="meters-table">
      <table>
        <thead>
          <tr>
            <th>Usage point</th>
            <th>Type</th>
            <th>Intervals</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {meters.map((m) => (
            <tr key={m.id}>
              <td>{m.label || m.espi_usage_point_id}</td>
              <td>{m.service_kind}</td>
              <td>{m.interval_count}</td>
              <td>{new Date(m.created_at).toLocaleDateString()}</td>
              <td>
                <button
                  type="button"
                  className="meter-remove"
                  onClick={() => onDelete(m.id)}
                  aria-label={`Remove meter ${m.espi_usage_point_id}`}
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
