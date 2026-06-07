# Versioned APK Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Android releases with one command (bump version → version-stamped APK build → manifest) and show the version + a per-browser "New" badge on the download link.

**Architecture:** `frontend/package.json` `version` is the single source of truth. `scripts/release-app.ps1` bumps it, builds a version-stamped APK via `scripts/build-android.ps1`, and writes a committed `app/static/downloads/app-version.json` manifest. `GetTheApp` fetches that manifest at runtime to render `v<version> · <date>` and a "New" badge (compared against `localStorage`). The manifest is served by the existing `/static` mount — no backend change.

**Tech Stack:** React (Vite) + vitest/testing-library frontend; PowerShell 5.1 build scripts; Capacitor/Gradle Android build; FastAPI `StaticFiles` (unchanged).

---

## File Structure

- **Create** `app/static/downloads/app-version.json` — committed manifest the UI reads. Owns: current released version + date + APK path.
- **Modify** `frontend/src/config/appLinks.js` — add `APP_VERSION_URL`. Owns: where the mobile artifacts live.
- **Modify** `frontend/src/components/GetTheApp.jsx` — fetch manifest, render version/date + "New" badge, clear badge on download. Owns: the download UI.
- **Modify** `frontend/src/components/GetTheApp.test.jsx` — cover version display, badge, download-clears-badge, graceful fallback; keep existing tests green.
- **Modify** `frontend/src/components/GetTheApp.css` — `.get-app-meta`, `.get-app-badge`.
- **Modify** `scripts/build-android.ps1` — accept `-VersionName`/`-VersionCode`, stamp them into `android/app/build.gradle`.
- **Create** `scripts/release-app.ps1` — the one release command (bump → build → manifest).
- **Modify** `CLAUDE.md` — "Releasing the mobile app" note.

---

## Task 1: Version manifest + appLinks constant

**Files:**
- Create: `app/static/downloads/app-version.json`
- Modify: `frontend/src/config/appLinks.js`

- [ ] **Step 1: Create the initial manifest**

Create `app/static/downloads/app-version.json` (matches the currently shipped `frontend/package.json` version `0.1.0` and the already-committed APK):

```json
{
  "version": "0.1.0",
  "released": "2026-06-07",
  "file": "/static/downloads/voltmint.apk"
}
```

- [ ] **Step 2: Add the manifest URL constant**

In `frontend/src/config/appLinks.js`, add after the `ANDROID_APK_URL` line:

```js
// Release manifest (written by scripts/release-app.ps1) — the download UI reads
// it to show the current APK version/date and a "New" badge.
export const APP_VERSION_URL = "/static/downloads/app-version.json";
```

- [ ] **Step 3: Verify the manifest is valid JSON**

Run: `node -e "console.log(require('./app/static/downloads/app-version.json').version)"`
Expected: prints `0.1.0`

- [ ] **Step 4: Commit**

```bash
git add app/static/downloads/app-version.json frontend/src/config/appLinks.js
git commit -m "feat(app-version): add release manifest + APP_VERSION_URL"
```

---

## Task 2: Download link shows version + "New" badge

**Files:**
- Modify: `frontend/src/components/GetTheApp.jsx`
- Test: `frontend/src/components/GetTheApp.test.jsx`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `frontend/src/components/GetTheApp.test.jsx` with:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const SEEN_KEY = "voltmint-apk-seen-version";

async function renderWith(
  platform,
  { appStoreUrl = "", nativeApp = false, manifest = null, seen = null } = {},
) {
  vi.resetModules();
  localStorage.clear();
  if (seen != null) localStorage.setItem(SEEN_KEY, seen);
  global.fetch = manifest
    ? vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(manifest) })
    : vi.fn().mockRejectedValue(new Error("no network"));
  vi.doMock("../platform.js", () => ({
    detectPlatform: () => platform,
    isNativeApp: () => nativeApp,
  }));
  vi.doMock("../config/appLinks.js", () => ({
    ANDROID_APK_URL: "/static/downloads/voltmint.apk",
    APP_STORE_URL: appStoreUrl,
    APP_VERSION_URL: "/static/downloads/app-version.json",
  }));
  const { default: GetTheApp } = await import("./GetTheApp.jsx");
  return render(<GetTheApp />);
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("GetTheApp", () => {
  it("shows the Android download on Android", async () => {
    await renderWith("android");
    const link = screen.getByRole("link", { name: /download android app/i });
    expect(link).toHaveAttribute("href", "/static/downloads/voltmint.apk");
    expect(link).toHaveAttribute("download");
  });

  it("shows a 'coming soon' state on iOS when no App Store URL is set", async () => {
    await renderWith("ios", { appStoreUrl: "" });
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the App Store on iOS when a URL is configured", async () => {
    await renderWith("ios", { appStoreUrl: "https://apps.apple.com/app/id000" });
    const link = screen.getByRole("link", { name: /app store/i });
    expect(link).toHaveAttribute("href", "https://apps.apple.com/app/id000");
  });

  it("shows both options on desktop", async () => {
    await renderWith("other", { appStoreUrl: "" });
    expect(screen.getByRole("link", { name: /download android app/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("renders nothing inside the native app", async () => {
    const { container } = await renderWith("android", { nativeApp: true });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/download android app/i)).not.toBeInTheDocument();
  });

  it("shows the version and release date when the manifest loads", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
    });
    expect(await screen.findByText(/v0\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 7/)).toBeInTheDocument();
  });

  it("shows a 'New' badge when the released version differs from the last seen", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: "0.1.0",
    });
    expect(await screen.findByText("New")).toBeInTheDocument();
  });

  it("hides the 'New' badge when the last seen version equals the release", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: "0.2.0",
    });
    expect(await screen.findByText(/v0\.2\.0/)).toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("marks the version as seen in localStorage when the download is clicked", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: "0.1.0",
    });
    const link = await screen.findByRole("link", { name: /download android app/i });
    fireEvent.click(link);
    expect(localStorage.getItem(SEEN_KEY)).toBe("0.2.0");
  });

  it("renders the plain button (no version, no badge) when the manifest fetch fails", async () => {
    await renderWith("android", { manifest: null });
    const link = screen.getByRole("link", { name: /download android app/i });
    expect(link).toHaveAttribute("href", "/static/downloads/voltmint.apk");
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd frontend && ./node_modules/.bin/vitest run src/components/GetTheApp.test.jsx`
Expected: the version/badge/download tests FAIL (no version meta rendered; `APP_VERSION_URL`/fetch not used yet).

- [ ] **Step 3: Implement the component**

Replace the entire contents of `frontend/src/components/GetTheApp.jsx` with:

```jsx
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
    if (isNativeApp()) return;
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && ./node_modules/.bin/vitest run src/components/GetTheApp.test.jsx`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GetTheApp.jsx frontend/src/components/GetTheApp.test.jsx
git commit -m "feat(get-app): show APK version/date + New badge from manifest"
```

---

## Task 3: Style the version meta + "New" badge

**Files:**
- Modify: `frontend/src/components/GetTheApp.css`

- [ ] **Step 1: Append the styles**

Add to the end of `frontend/src/components/GetTheApp.css`:

```css
.get-app-meta {
  color: var(--faint);
  font-weight: 500;
  font-size: 11.5px;
}
.get-app-badge {
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `cd frontend && npm run build`
Expected: `built in …` with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GetTheApp.css
git commit -m "style(get-app): version meta + New badge"
```

---

## Task 4: Make the Android build version-aware

**Files:**
- Modify: `scripts/build-android.ps1`

- [ ] **Step 1: Add version parameters**

At the very top of `scripts/build-android.ps1`, BEFORE the `#requires` line is not allowed, so insert the `param(...)` block immediately AFTER the closing `#>` of the comment-based help and BEFORE `$ErrorActionPreference = "Stop"`:

```powershell
param(
  [string]$VersionName,
  [int]$VersionCode
)
```

- [ ] **Step 2: Derive version defaults from package.json**

Immediately after the `$apkOut = Join-Path $downloads "voltmint.apk"` line, add:

```powershell
# Version stamp for the APK. Defaults to frontend/package.json when not passed
# (release-app.ps1 passes explicit values). versionCode is a monotonic integer
# derived from semver: major*10000 + minor*100 + patch.
$pkgPath = Join-Path $frontend "package.json"
if (-not $VersionName) {
  $VersionName = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version
}
if (-not $VersionCode) {
  $p = $VersionName.Split(".")
  $VersionCode = ([int]$p[0]) * 10000 + ([int]$p[1]) * 100 + ([int]$p[2])
}
Write-Host "    VersionName  = $VersionName (code $VersionCode)"
```

- [ ] **Step 3: Stamp the version into build.gradle after cap sync**

In the `Push-Location $frontend` / `try` block, AFTER the `variables.gradle` patch (after its closing `}` and before `finally`), add:

```powershell
  # Stamp the app version into the generated Android project (android/ is
  # gitignored and regenerated by cap add/sync, so patch it every build).
  $appGradle = Join-Path $frontend "android\app\build.gradle"
  if (Test-Path $appGradle) {
    $g = (Get-Content $appGradle -Raw) `
      -replace 'versionCode\s+\d+', "versionCode $VersionCode" `
      -replace 'versionName\s+"[^"]*"', "versionName ""$VersionName"""
    Set-Content -Path $appGradle -Value $g -Encoding ascii
  }
```

- [ ] **Step 4: Update the synopsis line**

In the comment-based help `.DESCRIPTION`, change the first sentence to note the version stamp. Replace:

```
  Produces a debug-signed APK (installable by side-load, no keystore needed)
```
with:
```
  Produces a debug-signed APK (installable by side-load, no keystore needed),
  stamped with -VersionName/-VersionCode (default: frontend/package.json),
```

- [ ] **Step 5: Manual verification note (no automated test)**

PowerShell scripts are not unit-tested in this repo. Verification happens in Task 5 by running `release-app.ps1` on a machine with the Android SDK and confirming the APK reports the new version (Settings → Apps → VoltMint, or `aapt dump badging`).

- [ ] **Step 6: Commit**

```bash
git add scripts/build-android.ps1
git commit -m "feat(build-android): stamp versionName/versionCode into the APK"
```

---

## Task 5: One release command

**Files:**
- Create: `scripts/release-app.ps1`

- [ ] **Step 1: Write the release script**

Create `scripts/release-app.ps1`:

```powershell
#requires -Version 5.1
<#
.SYNOPSIS
  Cut a VoltMint mobile release: bump version, build a version-stamped APK, and
  write the download manifest the web UI reads.

.DESCRIPTION
  frontend/package.json `version` is the single source of truth. This script:
    1. Reads the current version and computes the next per -Bump.
    2. Builds the APK first (scripts/build-android.ps1 -VersionName ...).
    3. ONLY on a successful build, writes the bumped version back to
       package.json and writes app/static/downloads/app-version.json.
  Build-first means a failed Gradle build leaves the repo unchanged.

  Prerequisites: same as build-android.ps1 (Node, JDK, Android SDK).

.PARAMETER Bump
  patch (default), minor, or major.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/release-app.ps1
  powershell -ExecutionPolicy Bypass -File scripts/release-app.ps1 -Bump minor
#>
param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch"
)
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$pkgPath = Join-Path $repo "frontend/package.json"
$manifestPath = Join-Path $repo "app/static/downloads/app-version.json"
$buildScript = Join-Path $PSScriptRoot "build-android.ps1"

# --- compute next version -------------------------------------------------
$pkgRaw = Get-Content $pkgPath -Raw
$cur = ($pkgRaw | ConvertFrom-Json).version
$parts = $cur.Split(".")
$maj = [int]$parts[0]; $min = [int]$parts[1]; $pat = [int]$parts[2]
switch ($Bump) {
  "major" { $maj++; $min = 0; $pat = 0 }
  "minor" { $min++; $pat = 0 }
  "patch" { $pat++ }
}
$next = "$maj.$min.$pat"
$code = $maj * 10000 + $min * 100 + $pat
Write-Host "==> Releasing $cur -> $next (code $code)"

# --- build first (nothing persisted if this throws) -----------------------
& $buildScript -VersionName $next -VersionCode $code
if ($LASTEXITCODE -ne 0) { throw "APK build failed; release aborted (no files changed)." }

# --- persist the release --------------------------------------------------
# Use WriteAllText (UTF-8, NO BOM) — PS 5.1's `Set-Content -Encoding utf8`
# emits a BOM, which strict JSON parsers reject in package.json.
$pkgNew = $pkgRaw -replace '("version"\s*:\s*")[^"]+(")', "`${1}$next`${2}"
[System.IO.File]::WriteAllText($pkgPath, $pkgNew)

$released = Get-Date -Format "yyyy-MM-dd"
$manifest = @"
{
  "version": "$next",
  "released": "$released",
  "file": "/static/downloads/voltmint.apk"
}
"@
[System.IO.File]::WriteAllText($manifestPath, $manifest + "`n")

Write-Host ""
Write-Host "==> Released v$next ($released). Commit to publish:"
Write-Host "    git add frontend/package.json app/static/downloads/app-version.json app/static/downloads/voltmint.apk"
Write-Host "    git commit -m ""release(app): v$next"""
```

- [ ] **Step 2: Static check the script parses**

Run: `powershell -NoProfile -Command "[void][System.Management.Automation.Language.Parser]::ParseFile('scripts/release-app.ps1', [ref]$null, [ref]$null); 'parse ok'"`
Expected: prints `parse ok` (no parse errors).

- [ ] **Step 3: Owner runtime verification (requires Android SDK)**

On the Windows build machine, run:
`powershell -ExecutionPolicy Bypass -File scripts/release-app.ps1`
Expected: builds the APK, then `frontend/package.json` shows `0.1.1`, `app/static/downloads/app-version.json` shows `version 0.1.1` with today's date, and `voltmint.apk` is freshly rebuilt. (This step is performed by the owner; it cannot run in CI/agent environments.)

- [ ] **Step 4: Commit the script**

```bash
git add scripts/release-app.ps1
git commit -m "feat(release-app): one-command APK release (bump + build + manifest)"
```

---

## Task 6: Document the release workflow

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the release subsection**

In `CLAUDE.md`, in the `## Deployment` section, immediately AFTER the bullet that begins "- The prebuilt Android **APK** (`app/static/downloads/voltmint.apk`) ships in the image", add:

```markdown
- **Releasing the mobile app.** The APK is a Capacitor wrapper around the live
  site, so web changes reach users without a rebuild. To cut a versioned release
  (fresh APK + bumped version shown on the download link), run on a machine with
  the Android SDK: `powershell -ExecutionPolicy Bypass -File scripts/release-app.ps1`
  (add `-Bump minor`/`-Bump major` for bigger releases). It bumps
  `frontend/package.json`, builds a version-stamped APK, and writes
  `app/static/downloads/app-version.json` (the manifest `GetTheApp` reads). Commit
  the three changed files. This is a deliberate local step — the APK cannot be
  built in CI (no Android SDK), so there is no hook/Action for it.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the one-command mobile release workflow"
```

---

## Task 7: Full regression + push

- [ ] **Step 1: Run the full frontend suite**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: all test files pass (previous 156 + the 5 new GetTheApp tests).

- [ ] **Step 2: Run the affected backend tests in the venv**

Run: `venv/Scripts/python.exe -E -s -m pytest tests/test_apk_download.py tests/test_spa_serving.py -q`
Expected: PASS (manifest is served by the same static mount; nothing regressed).

- [ ] **Step 3: Push the branch**

```bash
git push origin feat/phase-1-redesign
```

---

## Notes for the implementer

- **Frontend tests:** always use `./node_modules/.bin/vitest` (local 2.1.9), never `npx vitest`.
- **Backend tests:** the shell's `PYTHONPATH`/`PYTHONHOME` point at Python 3.13; run pytest via `venv/Scripts/python.exe -E -s -m pytest` (Python 3.11) or they fail to import FastAPI.
- **You cannot build the APK here.** Tasks 4–5 are verified by parse-check + the owner's runtime run. The first real APK is produced when the owner runs `scripts/release-app.ps1`.
- The manifest committed in Task 1 (`0.1.0`) makes the UI work immediately against the existing committed APK; the owner's first release bumps it to `0.1.1`.
