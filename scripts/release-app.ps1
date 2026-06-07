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
# build-android.ps1 throws on any failed step ($ErrorActionPreference=Stop), so
# the catch is the real safety valve; the $LASTEXITCODE check also covers a
# hypothetical non-throwing non-zero exit. Either way nothing below this runs.
try {
  & $buildScript -VersionName $next -VersionCode $code
  if ($LASTEXITCODE -ne 0) { throw "non-zero exit ($LASTEXITCODE)" }
} catch {
  throw "APK build failed; release aborted (no files changed). $_"
}

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
