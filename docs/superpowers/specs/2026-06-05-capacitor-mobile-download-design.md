# Capacitor Mobile Package + Footer Download — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan
**Topic:** A local script that produces an installable Android app package via Capacitor, plus a device-aware "Get the app" option in the footer.

## Context

ComEd Price Pulse is a React SPA (served by FastAPI at `/app`) with live pricing,
forecasts, and alerts. The PRD's mobile strategy is **PWA now → Capacitor wrapper for
iOS/Android** ("minimal rework; do NOT rewrite in React Native"). A PWA manifest already
exists (`frontend/src/pwa/manifest.js`); there is **no Capacitor setup yet**.

The owner wants:
1. A **script to generate the mobile app package** (Android, and scaffold Apple).
2. A **footer option to download/install the app based on the device** (Android vs Apple).

### Hard platform constraints (drove the design)
- **iOS cannot be side-loaded.** Apple only allows installs via the App Store, TestFlight,
  or paid ($99/yr) ad-hoc provisioning tied to device UDIDs. Building an `.ipa` also
  **requires a Mac**; the owner is on **Windows**. So a "download & install" link is
  impossible for iPhone. → iOS footer entry is an **App Store/TestFlight link** to a
  configurable placeholder URL the owner fills in later.
- **Render's filesystem is ephemeral** and there is no object storage. → The APK is
  **committed into `app/static/downloads/`** (owner's choice) and served by the existing
  `/static` mount; no backend change needed.
- The owner is on **Windows** → the build script is **PowerShell** (`.ps1`).

## Approach: thin Capacitor "wrapper" (not bundled assets)

`capacitor.config.json` sets `server.url = https://pricealert.s2rdlabs.com/app`, so the APK
is a native shell that loads the **hosted** site, rather than bundling the web build inside
the APK. Rationale:
- The app is network-dependent (live prices/auth) — offline bundling adds no value.
- Avoids two real breakages of a bundled build: (1) Vite `base` is `/app/`, so bundled
  assets would 404 at the webview's root origin; (2) `api/client.js` uses **same-origin
  relative URLs** (`/auth/me`), which inside `capacitor://localhost` would hit the app, not
  the backend. The wrapper sidesteps both.
- It is the minimal-rework path; the APK is a native wrapper around the existing PWA.

**Trade-off (accepted):** the wrapper needs connectivity (so does the app) and would fail
Play Store "minimum functionality" review — irrelevant for side-loaded distribution.

## Components

### 1. Capacitor scaffold (`frontend/`)
- Add dev deps: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`.
- `frontend/capacitor.config.json`:
  - `appId: "com.s2rdlabs.pricepulse"`
  - `appName: "ComEd Price Pulse"`
  - `webDir: "../app/static_spa"` (the existing web build; used as the `cap sync` source/fallback)
  - `server: { url: "https://pricealert.s2rdlabs.com/app", cleartext: false }`
- `frontend/android/` and `frontend/ios/` are **git-ignored** (add to `frontend/.gitignore`)
  and **generated on demand** by the script (`npx cap add …`). Keeps the repo free of large
  generated native projects; the script regenerates if missing.

### 2. Build script — `scripts/build-android.ps1`
Header documents prerequisites and the iOS-needs-a-Mac caveat. Steps:
1. **Prereq check:** verify `java`/JDK 17+ and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) are
   present. If missing, print exactly what to install (Android Studio + SDK, JDK 17) and
   exit non-zero **before** doing any work.
2. `npm --prefix frontend run build` — ensure `app/static_spa` exists for `webDir`.
3. If `frontend/android` missing → `npx --prefix frontend cap add android`; then
   `npx --prefix frontend cap sync android`.
4. `./gradlew assembleDebug` (debug-signed APK → **installable via side-load with no
   keystore setup**). Release signing is a documented future step, not in scope.
5. Copy the built `app-debug.apk` to `app/static/downloads/pricepulse.apk`.
- Convenience alias: `"build:android"` script in `frontend/package.json` that invokes the
  PowerShell script (or documents the direct `pwsh scripts/build-android.ps1` call).
- **iOS:** the script does **not** build iOS on Windows. A short note (and optional
  `npx cap add ios` scaffold) is documented; producing the `.ipa` requires a Mac + Xcode.

### 3. Footer "Get the app" — device-aware
- `frontend/src/platform.js` — `detectPlatform()` returns `"android" | "ios" | "other"`
  from `navigator.userAgent` (iPadOS-on-desktop-UA is acceptable to treat as `other`/iOS;
  keep it simple: `/android/i` → android; `/iphone|ipad|ipod/i` → ios; else other).
- `frontend/src/config/appLinks.js` — exported constants:
  - `ANDROID_APK_URL = "/static/downloads/pricepulse.apk"`
  - `APP_STORE_URL = ""` (placeholder — owner fills with the App Store/TestFlight URL).
- `frontend/src/components/GetTheApp.jsx` — rendered inside `.pp-footer` (`AppShell.jsx`):
  - **android** → one button: "🤖 Download Android app" → `ANDROID_APK_URL` (`download` attr).
  - **ios** → one link: "🍎 Get it on the App Store" → `APP_STORE_URL` (if empty, render a
    disabled/"coming soon" state so there's never a dead link).
  - **other** (desktop) → show **both** options.
- `frontend/src/components/GetTheApp.css` — small pill buttons using existing tokens
  (`var(--card)`, `var(--line)`, `var(--accent)`, `var(--txt)`), consistent with the footer.

### 4. Serving & hosting
- `app/static/downloads/` holds the committed APK; add a `.gitkeep` so the directory exists
  before the first build. FastAPI already mounts `app/static` at `/static`
  (`app/main.py`), so `/static/downloads/pricepulse.apk` is reachable with **no backend
  change**. (Browsers download `.apk` regardless of MIME; no special handling required.)

## Error handling
- Build script: prerequisite failures exit non-zero with actionable messages; never produce
  a partial/half-synced state silently. Re-runnable (idempotent `cap add`/`sync`).
- Footer: `APP_STORE_URL === ""` renders a disabled "iOS — coming soon" affordance rather
  than a broken link. A missing APK file simply 404s on click (acceptable until the owner
  commits one); the button is always shown so the path is testable.

## Testing
- `frontend/src/platform.test.js` — `detectPlatform()` for representative Android, iPhone,
  iPad, and desktop UA strings (stub `navigator.userAgent`).
- `frontend/src/components/GetTheApp.test.jsx` — renders the Android button (correct href +
  `download`) on an Android UA; the App Store link on an iOS UA; both on desktop; and the
  disabled "coming soon" state when `APP_STORE_URL` is empty.
- Run frontend tests with the **local** binary: `./node_modules/.bin/vitest run` (NOT
  `npx vitest`, which fetches a broken vitest 4.x).
- The PowerShell build script is not unit-tested (it shells out to Gradle); its
  prerequisite-check branch is verifiable by running it on a machine without the Android SDK.

## Out of scope (YAGNI / follow-ups)
- iOS `.ipa` build (needs a Mac), App Store/TestFlight publishing, Play Store submission.
- Release (production) APK signing with a keystore.
- CI-built artifacts / GitHub Releases hosting (owner chose local-script + committed APK).
- Service worker / full offline PWA (separate Phase-1 Task 6 work).

## Files touched
- `frontend/package.json` — add `@capacitor/*` dev deps + `build:android` script.
- `frontend/capacitor.config.json` — new.
- `frontend/.gitignore` — ignore `android/`, `ios/`.
- `scripts/build-android.ps1` — new.
- `frontend/src/platform.js` + `platform.test.js` — new.
- `frontend/src/config/appLinks.js` — new.
- `frontend/src/components/GetTheApp.jsx` + `.css` + `.test.jsx` — new.
- `frontend/src/components/AppShell.jsx` — render `<GetTheApp />` in `.pp-footer`.
- `app/static/downloads/.gitkeep` — new (dir placeholder; APK committed post-build).
