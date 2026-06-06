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
