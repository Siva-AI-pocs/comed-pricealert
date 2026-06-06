import { useEffect, useState, useCallback } from "react";
import { subscriptionsApi } from "../api/subscriptions.js";
import SubscriptionsTable from "../components/SubscriptionsTable.jsx";
import SubscribeForm from "../components/SubscribeForm.jsx";

export default function AlertsTab() {
  const [subs, setSubs] = useState([]);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    try {
      setSubs(await subscriptionsApi.list());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(id) {
    try {
      await subscriptionsApi.remove(id);
    } catch {
      /* ignore */
    }
    load();
  }

  async function handleSendNow(id) {
    setFeedback("");
    try {
      const r = await subscriptionsApi.sendNow(id);
      setFeedback(`Test alert sent — current price ${r.price_cents}¢.`);
      load();
    } catch {
      setFeedback("Couldn't send the alert right now.");
    }
  }

  return (
    <section data-testid="tab-alerts">
      <h2>Alerts</h2>

      <SubscriptionsTable
        subs={subs}
        onRemove={handleRemove}
        onSendNow={handleSendNow}
      />
      {feedback && (
        <p role="status" style={{ color: "var(--dim)", fontSize: 13 }}>
          {feedback}
        </p>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "22px 0 8px" }}>
        Add an alert
      </h3>
      <SubscribeForm onSubscribed={load} />
    </section>
  );
}
