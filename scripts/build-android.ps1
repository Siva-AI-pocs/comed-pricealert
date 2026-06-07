#requires -Version 5.1
<#
.SYNOPSIS
  Build a side-loadable Android APK for VoltMint via Capacitor.

.DESCRIPTION
  Produces a debug-signed APK (installable by side-load, no keystore needed)
  that wraps the hosted site (capacitor.config.json server.url). Copies it to
  app/static/downloads/voltmint.apk — FastAPI serves it at
  /static/downloads/voltmint.apk and the footer links to it. Commit that APK
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
$apkOut = Join-Path $downloads "voltmint.apk"

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing '$cmd'. $hint"
  }
}

Write-Host "==> Checking prerequisites..."
Need "node" "Install Node.js (https://nodejs.org)."
Need "npm"  "Install Node.js (npm ships with it)."

# Use Android Studio's bundled JDK (JBR) for the build — the system 'java' may
# be too new for Gradle (e.g. JDK 25). Fall back to whatever JAVA_HOME/PATH has.
$jbr = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path (Join-Path $jbr "bin\java.exe")) {
  $env:JAVA_HOME = $jbr
}
elseif (-not $env:JAVA_HOME) {
  Need "java" "Install JDK 17 or 21 (or Android Studio) and set JAVA_HOME."
}

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path $sdk)) {
  throw "Android SDK not found at $sdk. Install Android Studio, then set ANDROID_HOME (or ANDROID_SDK_ROOT) to the SDK path."
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Host "    JAVA_HOME    = $env:JAVA_HOME"
Write-Host "    ANDROID_HOME = $sdk"

Write-Host "==> Building the web app (Capacitor webDir source)..."
npm --prefix $frontend run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

# The Capacitor CLI must run from the frontend dir (where package.json +
# capacitor.config.json live); `npm --prefix ... exec` does NOT change cwd.
Push-Location $frontend
try {
  Write-Host "==> Ensuring the Android platform exists..."
  if (-not (Test-Path (Join-Path $frontend "android"))) {
    npx --no-install cap add android
    if ($LASTEXITCODE -ne 0) { throw "cap add android failed." }
  }

  Write-Host "==> Syncing Capacitor..."
  npx --no-install cap sync android
  if ($LASTEXITCODE -ne 0) { throw "cap sync android failed." }

  # Modern AGP (8.9+) requires compileSdk 35; the Capacitor template ships 34,
  # which fails at config time ("provider has no value"). Bump it.
  $vars = Join-Path $frontend "android\variables.gradle"
  if (Test-Path $vars) {
    $v = (Get-Content $vars -Raw) `
      -replace 'compileSdkVersion = 34', 'compileSdkVersion = 35' `
      -replace 'targetSdkVersion = 34', 'targetSdkVersion = 35'
    Set-Content -Path $vars -Value $v -Encoding ascii
  }
}
finally {
  Pop-Location
}

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
Write-Host "    Served at /static/downloads/voltmint.apk. Commit it to publish."
