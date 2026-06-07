/**
 * Where the mobile apps live. Android is a side-loadable APK served from the
 * backend's /static mount (committed to app/static/downloads/). iOS cannot be
 * side-loaded, so it links to the App Store / TestFlight — fill APP_STORE_URL
 * once the iOS build is published. Empty string → the footer shows a
 * "coming soon" state instead of a dead link.
 */
export const ANDROID_APK_URL = "/static/downloads/voltmint.apk";
export const APP_STORE_URL = "";
