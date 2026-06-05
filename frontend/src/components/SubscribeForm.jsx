import { useState } from "react";
import { subscriptionsApi } from "../api/subscriptions.js";
import "./AuthForm.css";

export default function SubscribeForm({ onSubscribed }) {
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [low, setLow] = useState("3");
  const [high, setHigh] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    const channels = [email.trim(), telegram.trim(), whatsapp.trim()].filter(Boolean);
    if (channels.length === 0) {
      setError("At least one channel is required (email, Telegram, or WhatsApp).");
      return;
    }

    const body = {
      email: email.trim() || null,
      telegram_chat_id: telegram.trim() || null,
      whatsapp_number: whatsapp.trim() || null,
      threshold_cents: low === "" ? 0 : Number(low),
      high_threshold_cents: high === "" ? null : Number(high),
    };

    setBusy(true);
    try {
      await subscriptionsApi.subscribe(body);
      setNotice("Subscribed! You'll get alerts on your chosen channels.");
      onSubscribed?.();
    } catch (err) {
      setError(err.detail || err.message || "Could not subscribe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <label htmlFor="sub-email">Email</label>
      <input
        id="sub-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label htmlFor="sub-telegram">Telegram chat ID</label>
      <input
        id="sub-telegram"
        value={telegram}
        onChange={(e) => setTelegram(e.target.value)}
      />

      <label htmlFor="sub-whatsapp">WhatsApp number (E.164, e.g. +13125551234)</label>
      <input
        id="sub-whatsapp"
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
      />

      <label htmlFor="sub-low">Low-price threshold (¢/kWh)</label>
      <input
        id="sub-low"
        type="number"
        step="0.1"
        value={low}
        onChange={(e) => setLow(e.target.value)}
      />

      <label htmlFor="sub-high">High-price threshold (¢/kWh, optional)</label>
      <input
        id="sub-high"
        type="number"
        step="0.1"
        value={high}
        onChange={(e) => setHigh(e.target.value)}
      />

      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? "Subscribing…" : "Subscribe"}
      </button>
    </form>
  );
}
