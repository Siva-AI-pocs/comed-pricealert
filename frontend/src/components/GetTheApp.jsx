import { useEffect, useState } from "react";
import { detectPlatform, isNativeApp } from "../platform.js";
import { ANDROID_APK_URL, APP_STORE_URL, APP_VERSION_URL } from "../config/appLinks.js";
import "./GetTheApp.css";

const SEEN_KEY = "voltmint-apk-seen-version";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-06-07" -> "Jun 7". Parsed by parts so the label never shifts timezone.
function formatReleased(released) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(released || "");
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "";
}

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function AndroidLink({ version, released, isNew, onDownload }) {
  const date = formatReleased(released);
  return (
    <a className="get-app-btn" href={ANDROID_APK_URL} download onClick={onDownload}>
      <span aria-hidden="true">🤖</span> Download Android app
      {isNew && <span className="get-app-badge">New</span>}
      {version && (
        <span className="get-app-meta">
          v{version}
          {date ? ` · ${date}` : ""}
        </span>
      )}
    </a>
  );
}

function IosLink() {
  if (!APP_STORE_URL) {
    return (
      <button type="button" className="get-app-btn disabled" disabled>
        <span aria-hidden="true">🍎</span> iOS — coming soon
      </button>
    );
  }
  return (
    <a
      className="get-app-btn"
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span aria-hidden="true">🍎</span> Get it on the App Store
    </a>
  );
}

export default function GetTheApp() {
  const [manifest, setManifest] = useState(null); // { version, released }
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    // iOS shows the App Store link only; the version/badge applies to the APK,
    // so there is nothing to fetch on iOS or inside the native app.
    if (isNativeApp() || detectPlatform() === "ios") return;
    let alive = true;
    // Promise.resolve wrapper turns a synchronous fetch failure (e.g. fetch
    // undefined in an odd environment) into a caught rejection.
    Promise.resolve()
      .then(() => fetch(APP_VERSION_URL))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data && data.version) {
          setManifest({ version: data.version, released: data.released });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Already in the native app — no point offering an app download.
  if (isNativeApp()) return null;

  const platform = detectPlatform();
  const version = manifest?.version || "";
  const isNew = Boolean(version) && version !== seen;

  function handleDownload() {
    if (!version) return;
    try {
      localStorage.setItem(SEEN_KEY, version);
    } catch {
      /* ignore (private mode) */
    }
    setSeen(version);
  }

  const androidProps = {
    version,
    released: manifest?.released,
    isNew,
    onDownload: handleDownload,
  };

  return (
    <div className="get-app" aria-label="Get the mobile app">
      {platform === "android" && <AndroidLink {...androidProps} />}
      {platform === "ios" && <IosLink />}
      {platform === "other" && (
        <>
          <AndroidLink {...androidProps} />
          <IosLink />
        </>
      )}
    </div>
  );
}
