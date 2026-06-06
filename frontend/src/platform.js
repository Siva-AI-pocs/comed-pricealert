/**
 * Best-effort mobile-OS detection from the user agent.
 * Returns "android" | "ios" | "other". Used to tailor the footer's app option.
 * Note: modern iPadOS reports a desktop (Mac) UA, so those iPads fall into
 * "other" and simply see both download options — acceptable.
 */
export function detectPlatform(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
) {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

/**
 * True when running inside the Capacitor native app (vs. a mobile/desktop
 * browser). Capacitor injects `window.Capacitor` with isNativePlatform() into
 * the webview — even when loading a remote server.url. Used to hide the
 * "get the app" footer when the user is already in the app.
 */
export function isNativeApp() {
  return !!(
    typeof window !== "undefined" &&
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}
