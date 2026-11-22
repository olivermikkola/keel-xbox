<#
.SYNOPSIS
  Build Keel Console UWP (Release|x64) with ONNX Runtime GenAI DirectML,
  optionally run Windows App Certification Kit (WACK), and sideload onto
  an Xbox Series S|X in Developer Mode.

.EXAMPLE
  .\build-and-sideload.ps1 -RunWack -XboxIp 192.168.1.50 -DevPortalUser dev -DevPortalPass secret
#>
param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release",
  [bool]$EnableOrtGenAI = $false,
  [switch]$RunWack,
  [string]$XboxIp = "",
  [int]$XboxPortalPort = 11443,
  [string]$DevPortalUser = "",
  [string]$DevPortalPass = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$slnPath = Join-Path $repoRoot "native\xbox\KeelConsole.Xbox.sln"
$outDir = Join-Path $repoRoot "native\xbox\AppPackages"

Write-Host "==> Restoring & building $slnPath ($Configuration|x64, KeelEnableOrtGenAI=$EnableOrtGenAI)"
& msbuild $slnPath `
  /t:Restore,Build `
  /p:Configuration=$Configuration `
  /p:Platform=x64 `
  /p:KeelEnableOrtGenAI=$($EnableOrtGenAI.ToString().ToLowerInvariant()) `
  /p:AppxBundle=Always `
  /p:AppxBundlePlatforms="x64" `
  /p:AppxPackageDir="$outDir\"

$pkg = Get-ChildItem -Path $outDir -Recurse -Include *.msixbundle,*.msix,*.appxbundle |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $pkg) {
  throw "Build succeeded, but no .msix / .msixbundle artifact was found under $outDir."
}
Write-Host "==> Built package: $($pkg.FullName)"

if ($RunWack) {
  $wackExe = "${env:ProgramFiles(x86)}\Windows Kits\10\App Certification Kit\appcert.exe"
  if (-not (Test-Path $wackExe)) {
    throw "Windows App Certification Kit not found at $wackExe. Install the Windows 10/11 SDK."
  }
  $wackReport = Join-Path $outDir "wack-report.xml"
  Write-Host "==> Running WACK validation -> $wackReport"
  & $wackExe reset
  & $wackExe test -appxpackagepath $pkg.FullName -reportoutputpath $wackReport
  if ($LASTEXITCODE -ne 0) {
    throw "WACK reported failures (exit $LASTEXITCODE). Inspect $wackReport."
  }
  Write-Host "==> WACK validation passed."
}

if ($XboxIp) {
  $portalBase = "https://${XboxIp}:${XboxPortalPort}"
  Write-Host "==> Sideloading $($pkg.Name) to Xbox Dev Mode portal at $portalBase"
  $form = @{
    file = Get-Item $pkg.FullName
  }
  $headers = @{}
  if ($DevPortalUser) {
    $pair = "${DevPortalUser}:${DevPortalPass}"
    $token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    $headers["Authorization"] = "Basic $token"
  }
  # Xbox Device Portal uses a self-signed cert on the local LAN.
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    Invoke-RestMethod `
      -Uri "$portalBase/api/app/packagemanager/package?package=$($pkg.Name)" `
      -Method Post `
      -Form $form `
      -Headers $headers `
      -SkipCertificateCheck
  } else {
    Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) { return true; }
}
"@
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    Invoke-RestMethod `
      -Uri "$portalBase/api/app/packagemanager/package?package=$($pkg.Name)" `
      -Method Post `
      -InFile $pkg.FullName `
      -ContentType "application/octet-stream" `
      -Headers $headers
  }
  Write-Host "==> Sideload request accepted by Xbox Device Portal."
}
