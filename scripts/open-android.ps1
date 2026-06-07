#requires -Version 5.1
<#
.SYNOPSIS
  Generate/sync the Capacitor Android project and open it in Android Studio,
  where you build & run the APK on a connected device or emulator.

.DESCRIPTION
  Convenience wrapper so you don't fight JDK/SDK env vars on the command line:
  it points JAVA_HOME at Android Studio's bundled JDK (JBR 21 - not your system
  JDK 25, which Gradle can't run on) and ANDROID_HOME at the local SDK, builds
  the web app, ensures the native android/ project exists, syncs it, then opens
  it in Android Studio.

  -Server local  (default): the app loads http://localhost:8000/app so you can
     test your LOCAL backend/code on a USB-connected phone. Requires the phone
     connected with USB debugging; the script runs `adb reverse tcp:8000` so the
     phone's localhost reaches this PC. The committed capacitor.config.json is
     NOT changed permanently - the local URL is baked only into the (git-ignored)
     android/ project for this session, then the source config is restored.
  -Server prod : use the committed config (wraps https://pricealert.s2rdlabs.com/app).

  In Android Studio: wait for the Gradle sync, pick your device in the toolbar,
  and click Run (>) to build + install + launch; or
  Build > Build Bundle(s)/APK(s) > Build APK(s) to produce an APK file.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/open-android.ps1
  powershell -ExecutionPolicy Bypass -File scripts/open-android.ps1 -Server prod
#>
param(
  [ValidateSet("local", "prod")]
  [string]$Server = "local",
  [int]$Port = 8000
)
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path $repo "frontend"
$config = Join-Path $frontend "capacitor.config.json"

# --- Locate Android Studio, its bundled JDK (JBR), and the SDK ---
$studioDir = "C:\Program Files\Android\Android Studio"
$jbr = Join-Path $studioDir "jbr"
$studioExe = @(
  (Join-Path $studioDir "bin\studio64.exe"),
  (Join-Path $studioDir "bin\studio.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }

Write-Host "==> Checking prerequisites..."
if (-not (Test-Path $jbr)) {
  throw "Android Studio JDK (JBR) not found at $jbr. Is Android Studio installed at $studioDir?"
}
if (-not $studioExe) {
  throw "Android Studio executable not found under $studioDir\bin."
}
if (-not (Test-Path $sdk)) {
  throw "Android SDK not found at $sdk. Open Android Studio > More Actions > SDK Manager to install it, or set ANDROID_HOME."
}

$env:JAVA_HOME = $jbr
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:CAPACITOR_ANDROID_STUDIO_PATH = $studioExe
$adb = Join-Path $sdk "platform-tools\adb.exe"

Write-Host "    JAVA_HOME      = $jbr"
Write-Host "    ANDROID_HOME   = $sdk"
Write-Host "    Android Studio = $studioExe"

Write-Host "==> Building the web app (Capacitor webDir source)..."
npm --prefix $frontend run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

# --- Optionally point the wrapper at the local backend, without dirtying the committed config ---
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$origConfig = $null
if ($Server -eq "local") {
  $localUrl = "http://localhost:$Port/app"
  Write-Host "==> Local mode: the app will load $localUrl (via the USB adb reverse tunnel)."
  if (Test-Path $adb) {
    & $adb reverse "tcp:$Port" "tcp:$Port" | Out-Null
    Write-Host "    adb reverse tcp:$Port set (phone localhost -> this PC)."
  }
  else {
    Write-Warning "adb not found at $adb. Run 'adb reverse tcp:$Port tcp:$Port' yourself so the phone can reach this PC's localhost."
  }
  $origConfig = [System.IO.File]::ReadAllText($config)
  $localConfig = @"
{
  "appId": "com.s2rdlabs.voltmint",
  "appName": "VoltMint",
  "webDir": "../app/static_spa",
  "server": {
    "url": "$localUrl",
    "cleartext": true
  }
}
"@
  [System.IO.File]::WriteAllText($config, $localConfig, $utf8NoBom)
}

# The Capacitor CLI must run from the frontend dir (where package.json +
# capacitor.config.json live); `npm --prefix ... exec` does NOT change cwd.
Push-Location $frontend
try {
  Write-Host "==> Ensuring the Android platform exists..."
  if (-not (Test-Path (Join-Path $frontend "android"))) {
    npx --no-install cap add android
    if ($LASTEXITCODE -ne 0) { throw "cap add android failed." }
  }
  Write-Host "==> Syncing Capacitor (bakes the chosen server URL into android/)..."
  npx --no-install cap sync android
  if ($LASTEXITCODE -ne 0) { throw "cap sync android failed." }

  # Android Studio auto-upgrades the Android Gradle Plugin to 8.9+, which
  # requires compileSdk 35; the Capacitor template ships 34, which then fails
  # at config time ("provider has no value"). Bump it so builds succeed.
  $vars = Join-Path $frontend "android\variables.gradle"
  if (Test-Path $vars) {
    $v = (Get-Content $vars -Raw) `
      -replace 'compileSdkVersion = 34', 'compileSdkVersion = 35' `
      -replace 'targetSdkVersion = 34', 'targetSdkVersion = 35'
    [System.IO.File]::WriteAllText($vars, $v, $utf8NoBom)
    Write-Host "    Set compileSdk/targetSdk = 35 (AGP 8.9+ requirement)."
  }
}
finally {
  Pop-Location
  if ($null -ne $origConfig) {
    [System.IO.File]::WriteAllText($config, $origConfig, $utf8NoBom)
    Write-Host "==> Restored committed capacitor.config.json (production URL)."
  }
}

Write-Host "==> Opening the project in Android Studio..."
Push-Location $frontend
try {
  npx --no-install cap open android
  if ($LASTEXITCODE -ne 0) { throw "cap open android failed." }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Android Studio is launching. When the Gradle sync finishes:"
Write-Host "  - Pick your device (Note 10) in the toolbar and click Run (>)"
Write-Host "    to build + install + launch on the phone, OR"
Write-Host "  - Build > Build Bundle(s)/APK(s) > Build APK(s) to produce an APK file."
if ($Server -eq "local") {
  Write-Host "  Keep the backend running (uvicorn :$Port) and the phone on USB -"
  Write-Host "  the app loads http://localhost:$Port/app through the adb reverse tunnel."
}
