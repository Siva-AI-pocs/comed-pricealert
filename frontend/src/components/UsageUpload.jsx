import { useState } from "react";
import { usageApi } from "../api/usage.js";
import "./UsageUpload.css";

export default function UsageUpload({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const r = await usageApi.upload(file);
      setMsg(`Imported ${r.intervals_inserted} intervals.`);
      onUploaded?.(r);
    } catch (err) {
      setError(err.detail || err.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="usage-upload" onSubmit={handleSubmit}>
      <label htmlFor="gb-file" className="uu-label">
        Green Button file
      </label>
      <div className="uu-row">
        <input
          id="gb-file"
          type="file"
          accept=".xml,.zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button type="submit" disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {msg && (
        <p className="uu-ok" role="status">
          {msg}
        </p>
      )}
      {error && (
        <p className="uu-err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
