import { detectPlatform } from "../platform.js";
import { ANDROID_APK_URL, APP_STORE_URL } from "../config/appLinks.js";
import "./GetTheApp.css";

function AndroidLink() {
  return (
    <a className="get-app-btn" href={ANDROID_APK_URL} download>
      <span aria-hidden="true">🤖</span> Download Android app
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
  const platform = detectPlatform();
  return (
    <div className="get-app" aria-label="Get the mobile app">
      {platform === "android" && <AndroidLink />}
      {platform === "ios" && <IosLink />}
      {platform === "other" && (
        <>
          <AndroidLink />
          <IosLink />
        </>
      )}
    </div>
  );
}
