# Versioned APK releases + download-link version display

**Date:** 2026-06-07
**Status:** Approved (design)

## Problem

The Android app is a thin Capacitor wrapper: `frontend/capacitor.config.json`
sets `server.url` to the live site, so the installed APK loads the hosted
website inside a native shell. Web features/bugfixes reach users without an APK
rebuild. The owner nonetheless wants, on every release: a freshly built APK, a
bumped version number, and the download link to display that version and flag it
as "new" to returning visitors.

Two hard constraints shape the design:

1. **The APK can only be built on a machine with the Android SDK + JDK + Gradle**
   (`scripts/build-android.ps1`). It cannot be built in CI or in an agent
   environment. The actual build is always a command the owner runs.
2. The displayed version must stay honest to the **committed APK**, which is built
   on a different pipeline from the deployed website bundle (Docker build at
   deploy time). So the version the UI shows cannot be baked into the web bundle.

## Goal

- One command cuts a release: bump version → build a version-stamped APK → write
  a manifest the UI reads.
- The download link shows `v<version> · <date>` and a **"New"** badge when the
  released version is newer than the one this visitor last saw.

## Decisions (locked)

- **Rebuild + bump on every release** (not only on native-shell changes).
- **One release command** orchestrates bump + build + manifest.
- **Version display:** version + date label **and** a "New" badge tracked per
  browser via `localStorage`.
- **Bump scheme:** patch by default, `-Bump minor|major` override. Semver in
  `frontend/package.json` is the single source of truth.
- **UI learns the version via a committed manifest JSON** (Approach A), not
  build-time injection — so the shown version matches the committed APK
  regardless of when the website was last built.

## Single source of truth

`frontend/package.json` `version` (semver). Currently `0.1.0`.

## Components

### 1. `scripts/release-app.ps1` (new)

The one release command.

- Param: `-Bump patch|minor|major` (default `patch`).
- Flow:
  1. Read current version from `frontend/package.json`.
  2. Compute `$next` per `-Bump`.
  3. Compute `$versionCode = major*10000 + minor*100 + patch`.
  4. **Build first:** call `scripts/build-android.ps1 -VersionName $next -VersionCode $versionCode`.
  5. **Only on build success**, persist the release:
     - Write `$next` back to `frontend/package.json` (`version` field).
     - Write `app/static/downloads/app-version.json`
       (`version`, `released` = `Get-Date -Format yyyy-MM-dd`, `file`).
  6. Print a summary and the exact `git add` / `git commit` for
     `frontend/package.json`, `app/static/downloads/app-version.json`, and
     `app/static/downloads/voltmint.apk`.
- **Rationale for build-first:** a failed Gradle build leaves the repo unchanged
  (no version drift, no orphaned manifest pointing at an un-rebuilt APK).

### 2. `scripts/build-android.ps1` (modify — version-aware)

- Accept optional `-VersionName` and `-VersionCode`. When omitted, read
  `versionName` from `frontend/package.json` and derive `versionCode` the same
  way as the release script (so a direct build is still version-stamped).
- After `cap sync` and the existing `variables.gradle` patch, patch
  `android/app/build.gradle`:
  - `versionName "<VersionName>"`
  - `versionCode <VersionCode>`
- `android/` is generated and gitignored, so the patch runs every build after
  `cap add/sync` regenerates the project. Use regex replacement on the existing
  `versionName`/`versionCode` lines the Capacitor template emits.
- Everything else (prereq checks, web build, `assembleDebug`, copy to
  `app/static/downloads/voltmint.apk`) is unchanged.

### 3. `app/static/downloads/app-version.json` (new, committed)

```json
{
  "version": "0.1.0",
  "released": "2026-06-07",
  "file": "/static/downloads/voltmint.apk"
}
```

- Initialized to the **current** shipped version (`0.1.0`) so the UI works
  immediately against the already-committed `voltmint.apk`.
- Served by the existing `/static` `StaticFiles` mount — **no `app/main.py`
  change**. The APK is already git-tracked and not gitignored, so manifest + APK
  commit together.

### 4. `frontend/src/config/appLinks.js` (modify)

Add:
```js
export const APP_VERSION_URL = "/static/downloads/app-version.json";
```

### 5. `frontend/src/components/GetTheApp.jsx` (modify)

- On mount, `fetch(APP_VERSION_URL)`. Store `{ version, released }` or `null`.
- The Android button shows a meta line `v<version> · <Mon D>` when the manifest
  is loaded (date parsed from the `yyyy-MM-dd` string by parts to avoid
  timezone drift, formatted as e.g. `Jun 7`).
- **"New" badge:** shown when
  `manifest.version !== localStorage["voltmint-apk-seen-version"]`. The Android
  download link's `onClick` sets that localStorage key to the current version,
  clearing the badge. (Returning visitors see "New" once per release until they
  download; brand-new visitors see it once.)
- **Graceful fallback:** if the fetch fails or returns no usable version, render
  exactly the current plain button — no version line, no badge. Fully
  backward-compatible. `isNativeApp()` short-circuit is unchanged (no fetch when
  inside the native app).
- The iOS path is unchanged.

### 6. `frontend/src/components/GetTheApp.css` (modify)

- `.get-app-meta` — small, dim version/date line under the button label.
- `.get-app-badge` — "New" pill using `--accent` / `--on-accent` tokens.

### 7. `CLAUDE.md` (modify)

Add a short **"Releasing the mobile app"** subsection under Deployment:
- Run `powershell -ExecutionPolicy Bypass -File scripts/release-app.ps1`
  (optionally `-Bump minor`) after shipping features/fixes you want reflected in
  a new APK; commit the three changed files.
- Note that this is the convention because the APK build cannot run in CI (no
  Android SDK), so it is a deliberate local step, not a hook/Action.

## Data flow

```
release-app.ps1
  → build-android.ps1 (embeds versionName/Code in the APK)
  → write package.json version + app-version.json
  → git commit (package.json, app-version.json, voltmint.apk)
  → deploy (Docker)
browser loads site
  → GetTheApp fetches app-version.json
  → shows "v0.2.0 · Jun 7" + "New" badge (if version != localStorage)
  → user clicks Download → localStorage = version → badge clears
```

## Error handling

- **Build failure:** release script persists nothing (build-first). Repo unchanged.
- **Manifest fetch failure in UI:** plain download button; no crash.
- **`localStorage` unavailable** (private mode / SSR-less guard): treat as
  "no seen version" → badge may show; download click is best-effort wrapped so a
  throwing `setItem` never blocks navigation.
- **versionCode monotonicity:** semver-derived code increases for normal
  patch/minor/major bumps; documented assumption (no date-based override).

## Testing

Frontend (vitest, `GetTheApp.test.jsx`), mocking `fetch` and `localStorage`:

1. Renders `v<version>` + formatted date when the manifest resolves.
2. Shows the "New" badge when `localStorage` version differs from the manifest.
3. Hides the badge when `localStorage` equals the manifest version.
4. Clicking the Android download link writes the current version to
   `localStorage`.
5. Renders the plain button (no version, no badge) when the fetch rejects.
6. Existing tests (native-app short-circuit, iOS coming-soon, APK href) still pass.

PowerShell scripts are not unit-tested in this repo (consistent with existing
`build-android.ps1`); correctness is verified by running `release-app.ps1` and
confirming the bumped files + a version-stamped APK.

## Scope boundaries (YAGNI)

- No versioned APK filenames or kept-history of old APKs (single latest download).
- No in-app update prompt / auto-update.
- No backend route or DB changes.
- No CI/GitHub Action (cannot build the APK; would only bump, adding drift risk).
- No iOS changes (still App-Store-placeholder).

## What ships now vs. owner action

- **Implemented now:** all scripts, the initial manifest (`0.1.0`), `appLinks.js`,
  `GetTheApp.jsx` + CSS + tests, and the `CLAUDE.md` note.
- **Owner runs:** `scripts/release-app.ps1` (default → `0.1.1`) to cut the first
  real new APK, then commits the three changed files. Until then the UI shows
  `v0.1.0` against the current committed APK.
