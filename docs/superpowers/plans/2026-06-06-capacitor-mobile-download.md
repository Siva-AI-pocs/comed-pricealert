# Capacitor Mobile Package + Footer Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local PowerShell script that builds a side-loadable Android APK (a thin Capacitor wrapper around the hosted site), and a device-aware "Get the app" option in the footer (Android → APK download, iOS → App Store link, desktop → both).

**Architecture:** Capacitor `server.url` points at `https://pricealert.s2rdlabs.com/app`, so the APK is a native shell loading the hosted PWA (no bundled-asset base-path / same-origin-API issues). The APK is committed to `app/static/downloads/` and served by the existing FastAPI `/static` mount — no backend change. The footer renders a small `GetTheApp` component driven by a `detectPlatform()` util.

**Tech Stack:** Capacitor 6 (CLI + Android/iOS) · React · Vite · Vitest/Testing Library · PowerShell · FastAPI StaticFiles.

**Spec:** `docs/superpowers/specs/2026-06-05-capacitor-mobile-download-design.md`

**Frontend test command (IMPORTANT):** from `frontend/`, use the LOCAL binary `./node_modules/.bin/vitest run <path>` — NOT `npx vitest` (npx fetches a broken vitest 4.x that disables jsdom; local pinned 2.1.9 is correct).

---

## File Structure

- `frontend/src/platform.js` (+ `platform.test.js`) — `detectPlatform()` UA → `"android"|"ios"|"other"`. One responsibility: OS detection.
- `frontend/src/config/appLinks.js` — exported URL constants (APK path + App Store placeholder).
- `frontend/src/components/GetTheApp.jsx` (+ `.css`, `.test.jsx`) — device-aware footer download UI.
- `frontend/src/components/AppShell.jsx` — render `<GetTheApp />` in `.pp-footer`.
- `frontend/capacitor.config.json` — Capacitor wrapper config.
- `frontend/.gitignore` — ignore generated `android/`, `ios/`.
- `frontend/package.json` — `@capacitor/*` deps + `build:android` alias.
- `scripts/build-android.ps1` — prereq-checked Gradle build → `app/static/downloads/pricepulse.apk`.
- `app/static/downloads/.gitkeep` — ensures the served directory exists.

---

## Task 1: Platform detection util

**Files:**
- Create: `frontend/src/platform.js`
- Test: `frontend/src/platform.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/platform.test.js`:

```js
import { describe, it, expect } from "vitest";
import { detectPlatform } from "./platform.js";

describe("detectPlatform", () => {
  it("detects Android", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"),
    ).toBe("android");
  });
  it("detects iPhone", () => {
    expect(
      detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("ios");
  });
  it("detects iPad (legacy UA)", () => {
    expect(
      detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("ios");
  });
  it("treats desktop as other", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    ).toBe("other");
  });
  it("defaults to other for an empty UA", () => {
    expect(detectPlatform("")).toBe("other");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && ./node_modules/.bin/vitest run src/platform.test.js`
Expected: FAIL — cannot resolve `./platform.js`.

- [ ] **Step 3: Implement the util**

Create `frontend/src/platform.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && ./node_modules/.bin/vitest run src/platform.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/platform.js frontend/src/platform.test.js
git commit -m "feat(mobile): add detectPlatform() util"
```

---

## Task 2: Footer "Get the app" component

**Files:**
- Create: `frontend/src/config/appLinks.js`
- Create: `frontend/src/components/GetTheApp.jsx`
- Create: `frontend/src/components/GetTheApp.css`
- Create: `frontend/src/components/GetTheApp.test.jsx`
- Modify: `frontend/src/components/AppShell.jsx` (render in `.pp-footer`)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/GetTheApp.test.jsx`. It mocks both dependency modules per-test (via `vi.resetModules` + `vi.doMock` + dynamic import) so platform and the App Store URL can be varied:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

async function renderWith(platform, appStoreUrl = "") {
  vi.resetModules();
  vi.doMock("../platform.js", () => ({ detectPlatform: () => platform }));
  vi.doMock("../config/appLinks.js", () => ({
    ANDROID_APK_URL: "/static/downloads/pricepulse.apk",
    APP_STORE_URL: appStoreUrl,
  }));
  const { default: GetTheApp } = await import("./GetTheApp.jsx");
  return render(<GetTheApp />);
}

beforeEach(() => vi.resetModules());

describe("GetTheApp", () => {
  it("shows the Android download on Android", async () => {
    await renderWith("android");
    const link = screen.getByRole("link", { name: /download android app/i });
    expect(link).toHaveAttribute("href", "/static/downloads/pricepulse.apk");
    expect(link).toHaveAttribute("download");
  });

  it("shows a 'coming soon' state on iOS when no App Store URL is set", async () => {
    await renderWith("ios", "");
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the App Store on iOS when a URL is configured", async () => {
    await renderWith("ios", "https://apps.apple.com/app/id000");
    const link = screen.getByRole("link", { name: /app store/i });
    expect(link).toHaveAttribute("href", "https://apps.apple.com/app/id000");
  });

  it("shows both options on desktop", async () => {
    await renderWith("other", "");
    expect(screen.getByRole("link", { name: /download android app/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && ./node_modules/.bin/vitest run src/components/GetTheApp.test.jsx`
Expected: FAIL — cannot resolve `./GetTheApp.jsx`.

- [ ] **Step 3: Create the config constants**

Create `frontend/src/config/appLinks.js`:

```js
/**
 * Where the mobile apps live. Android is a side-loadable APK served from the
 * backend's /static mount (committed to app/static/downloads/). iOS cannot be
 * side-loaded, so it links to the App Store / TestFlight — fill APP_STORE_URL
 * once the iOS build is published. Empty string → the footer shows a
 * "coming soon" state instead of a dead link.
 */
export const ANDROID_APK_URL = "/static/downloads/pricepulse.apk";
export const APP_STORE_URL = "";
```

- [ ] **Step 4: Create the component**

Create `frontend/src/components/GetTheApp.jsx`:

```jsx
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
      <span className="get-app-btn disabled" aria-disabled="true">
        <span aria-hidden="true">🍎</span> iOS — coming soon
      </span>
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
```

- [ ] **Step 5: Create the stylesheet**

Create `frontend/src/components/GetTheApp.css`:

```css
.get-app {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  margin-top: 8px;
}
.get-app-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--txt);
  font-weight: 600;
  font-size: 12.5px;
  padding: 7px 12px;
  border-radius: 999px;
  transition: border-color 0.15s, color 0.15s;
}
.get-app-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.get-app-btn.disabled {
  opacity: 0.55;
  cursor: default;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && ./node_modules/.bin/vitest run src/components/GetTheApp.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Render it in the footer**

In `frontend/src/components/AppShell.jsx`, add the import near the other component imports (e.g. after the `ThemePicker`/`AccountMenu` imports):

```jsx
import GetTheApp from "./GetTheApp.jsx";
```

Then add `<GetTheApp />` as the last child of the existing `.pp-footer`, so the footer reads:

```jsx
        <footer className="pp-footer">
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">Terms</Link>
          <span className="pp-footer-copy">ComEd Price Pulse</span>
          <GetTheApp />
        </footer>
```

(`.get-app` is `width: 100%`, so it wraps onto its own row beneath the links.)

- [ ] **Step 8: Run the footer + shell tests**

Run: `cd frontend && ./node_modules/.bin/vitest run src/components/GetTheApp.test.jsx src/components/AppShell.test.jsx`
Expected: all pass. (AppShell tests query Privacy/Terms by name and the nav by role; the added download link doesn't collide. In jsdom the UA matches neither android nor iphone/ipad/ipod, so `detectPlatform()` returns `"other"` and the footer shows both options.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/config/appLinks.js frontend/src/components/GetTheApp.jsx frontend/src/components/GetTheApp.css frontend/src/components/GetTheApp.test.jsx frontend/src/components/AppShell.jsx
git commit -m "feat(mobile): device-aware Get-the-app footer (Android APK / iOS App Store)"
```

---

## Task 3: Capacitor scaffold (config + deps + gitignore)

**Files:**
- Create: `frontend/capacitor.config.json`
- Modify: `frontend/.gitignore`
- Modify: `frontend/package.json` (deps + `build:android` script)

- [ ] **Step 1: Install Capacitor dependencies**

Run (from repo root):

```bash
npm --prefix frontend install @capacitor/core@^6 @capacitor/android@^6 @capacitor/ios@^6
npm --prefix frontend install -D @capacitor/cli@^6
```

Expected: `frontend/package.json` gains `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` under `dependencies` and `@capacitor/cli` under `devDependencies`; `package-lock.json` updates. No build/runtime change to the web app (nothing imports these).

- [ ] **Step 2: Create the Capacitor config**

Create `frontend/capacitor.config.json`:

```json
{
  "appId": "com.s2rdlabs.pricepulse",
  "appName": "ComEd Price Pulse",
  "webDir": "../app/static_spa",
  "server": {
    "url": "https://pricealert.s2rdlabs.com/app",
    "cleartext": false
  }
}
```

- [ ] **Step 3: Ignore the generated native projects**

Append to `frontend/.gitignore`:

```
# Capacitor native projects — generated on demand by scripts/build-android.ps1
android/
ios/
```

- [ ] **Step 4: Add the build alias**

In `frontend/package.json`, add to the `"scripts"` block:

```json
    "build:android": "powershell -ExecutionPolicy Bypass -File ../scripts/build-android.ps1",
```

- [ ] **Step 5: Verify the web app still builds and tests pass**

Run: `cd frontend && npm run build`
Expected: build succeeds (Capacitor deps don't affect the web bundle).

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/capacitor.config.json frontend/.gitignore frontend/package.json frontend/package-lock.json
git commit -m "feat(mobile): add Capacitor wrapper config + deps"
```

> NOTE for the executor: `frontend/package.json` and `package-lock.json` may already contain unrelated uncommitted changes from in-progress branch work. Stage them as-is (they are part of this branch's evolving state); do not attempt to revert unrelated hunks.

---

## Task 4: Android build script

**Files:**
- Create: `scripts/build-android.ps1`
- Create: `app/static/downloads/.gitkeep`

- [ ] **Step 1: Create the served-downloads directory placeholder**

Create an empty file `app/static/downloads/.gitkeep` (so the directory exists and is served at `/static/downloads/` before the first APK is committed).

- [ ] **Step 2: Create the build script**

Create `scripts/build-android.ps1`:

```powershell
#requires -Version 5.1
<#
.SYNOPSIS
  Build a side-loadable Android APK for ComEd Price Pulse via Capacitor.

.DESCRIPTION
  Produces a debug-signed APK (installable by side-load, no keystore needed)
  that wraps the hosted site (capacitor.config.json server.url). Copies it to
  app/static/downloads/pricepulse.apk — FastAPI serves it at
  /static/downloads/pricepulse.apk and the footer links to it. Commit that APK
  to publish it.

  Prerequisites (install once):
    - Node.js + npm
    - JDK 17+ ('java' on PATH)
    - Android SDK; set ANDROID_HOME or ANDROID_SDK_ROOT (install via Android
      Studio and accept the SDK licenses).

  iOS NOTE: building an .ipa requires macOS + Xcode and cannot run on Windows.
  On a Mac, run `npm --prefix frontend exec -- cap add ios` to scaffold it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
#>
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path $repo "frontend"
$downloads = Join-Path $repo "app/static/downloads"
$apkOut = Join-Path $downloads "pricepulse.apk"

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing '$cmd'. $hint"
  }
}

Write-Host "==> Checking prerequisites..."
Need "node" "Install Node.js (https://nodejs.org)."
Need "npm"  "Install Node.js (npm ships with it)."
Need "java" "Install JDK 17+ and put 'java' on PATH."
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -or -not (Test-Path $sdk)) {
  throw "Android SDK not found. Install Android Studio, then set ANDROID_HOME (or ANDROID_SDK_ROOT) to the SDK path."
}

Write-Host "==> Building the web app (Capacitor webDir source)..."
npm --prefix $frontend run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

Write-Host "==> Ensuring the Android platform exists..."
if (-not (Test-Path (Join-Path $frontend "android"))) {
  npm --prefix $frontend exec --yes -- cap add android
  if ($LASTEXITCODE -ne 0) { throw "cap add android failed." }
}

Write-Host "==> Syncing Capacitor..."
npm --prefix $frontend exec -- cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync android failed." }

Write-Host "==> Building the debug APK with Gradle..."
$android = Join-Path $frontend "android"
Push-Location $android
try {
  & (Join-Path $android "gradlew.bat") assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "Gradle assembleDebug failed." }
} finally {
  Pop-Location
}

$built = Join-Path $android "app/build/outputs/apk/debug/app-debug.apk"
if (-not (Test-Path $built)) { throw "Expected APK not found at $built" }

New-Item -ItemType Directory -Force -Path $downloads | Out-Null
Copy-Item $built $apkOut -Force
Write-Host "==> Done. APK -> $apkOut"
Write-Host "    Served at /static/downloads/pricepulse.apk. Commit it to publish."
```

- [ ] **Step 3: Verify the prerequisite-check path runs**

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1`
Expected: the script prints `==> Checking prerequisites...` and then EITHER proceeds to build (if JDK + Android SDK are installed) OR exits non-zero with a clear message like `Android SDK not found...` / `Missing 'java'...`. Both outcomes are acceptable — the script must fail loudly with guidance, never silently. (A full build also requires the SDK; producing the actual APK + committing it is the owner's step.)

- [ ] **Step 4: Commit**

```bash
git add scripts/build-android.ps1 app/static/downloads/.gitkeep
git commit -m "feat(mobile): Android APK build script (Capacitor + Gradle)"
```

---

## Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend suite (local binary)**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: all pass, including `platform.test.js` (5) and `GetTheApp.test.jsx` (4).

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npm run build`
Expected: build succeeds into `../app/static_spa/`.

- [ ] **Step 3: Manual footer check (desktop shows both options)**

With the backend running (`/static` serves `app/static`), open `http://localhost:8000/app`, scroll to the footer. On a desktop browser you should see BOTH "🤖 Download Android app" and "🍎 iOS — coming soon". Optionally screenshot via Playwright (viewport 1280×900) and confirm the two pill buttons render in the footer styled like the rest of the app.

- [ ] **Step 4: Verify the APK path is served (once an APK exists)**

After the owner runs `scripts/build-android.ps1` on a machine with the Android SDK and commits `app/static/downloads/pricepulse.apk`, `curl -I http://localhost:8000/static/downloads/pricepulse.apk` returns `200`. Until then the link 404s by design (the button is always shown so the path is testable).

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(mobile): verification fixups"
```

---

## Self-Review Notes (reconciled against the spec)

- **Spec coverage:** Capacitor scaffold + wrapper `server.url` (Task 3) · build script with prereq checks + debug APK → `app/static/downloads/pricepulse.apk` (Task 4) · `android/`/`ios/` git-ignored & generated by script (Task 3 gitignore + Task 4 `cap add`) · device-aware footer with Android/iOS/desktop branches + empty-URL "coming soon" (Task 2) · `detectPlatform` util (Task 1) · served via existing `/static` mount, `.gitkeep` (Task 4) · tests for platform + component (Tasks 1–2) · iOS-needs-a-Mac documented in the script header (Task 4). No backend code change — matches spec.
- **Type/name consistency:** `detectPlatform()` returns `"android"|"ios"|"other"` and is consumed identically in `GetTheApp`; `ANDROID_APK_URL`/`APP_STORE_URL` names match across `appLinks.js`, the component, and its test; the APK path string `"/static/downloads/pricepulse.apk"` is identical in `appLinks.js`, the build script's `$apkOut`, and the verification curl.
- **No placeholders:** every code/file/command step is complete. `APP_STORE_URL = ""` is an intentional, documented owner-filled constant, not a plan gap.
