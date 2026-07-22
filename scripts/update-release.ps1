<#
.SYNOPSIS
  Rebuilds the app and refreshes the release/ folder (portable + win-unpacked).
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $ProjectRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}

Set-Location $ProjectRoot
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

Write-Host "Updating release/ in $ProjectRoot" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

npx electron-builder --win
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "release/ updated:" -ForegroundColor Green
Get-ChildItem -Path (Join-Path $ProjectRoot 'release') -File |
  Select-Object Name, Length, LastWriteTime |
  Format-Table -AutoSize
$exe = Join-Path $ProjectRoot 'release\win-unpacked\All Book Reader.exe'
if (Test-Path $exe) {
  Write-Host "OK: $exe" -ForegroundColor Green
}
