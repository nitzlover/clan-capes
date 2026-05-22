# Build Clan Capes mod + Paper plugin (Windows)
# Requires: JDK 21 for Paper Gradle, JDK 25 for Fabric compile (see .tools/ or install Temurin)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

$Jdk21 = Join-Path $Root ".tools\jdk-21.0.11+10"
$Jdk25 = Join-Path $Root ".tools\jdk-25.0.3+9"

if (-not (Test-Path $Jdk21)) {
    Write-Host "JDK 21 not found at $Jdk21 — install Temurin 21 or run API download once."
    exit 1
}
if (-not (Test-Path $Jdk25)) {
    Write-Host "JDK 25 not found at $Jdk25 — Fabric mod requires Java 25."
    exit 1
}

Write-Host "=== Paper plugin (JDK 21) ==="
$env:JAVA_HOME = $Jdk21
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Push-Location (Join-Path $Root "paper-plugin")
if (-not (Test-Path ".\gradlew.bat")) { & "C:\gradle-9.5.1\bin\gradle.bat" wrapper --gradle-version=8.12 }
.\gradlew.bat shadowJar --no-daemon
Pop-Location

Write-Host "=== Fabric mod (JDK 25) ==="
$env:JAVA_HOME = $Jdk25
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Push-Location (Join-Path $Root "fabric-mod")
if (-not (Test-Path ".\gradlew.bat")) { & "C:\gradle-9.5.1\bin\gradle.bat" wrapper --gradle-version=9.4 }
.\gradlew.bat build --no-daemon
Pop-Location

Write-Host ""
Write-Host "Done:"
Get-ChildItem (Join-Path $Root "paper-plugin\build\libs\*.jar")
Get-ChildItem (Join-Path $Root "fabric-mod\build\libs\*.jar")
