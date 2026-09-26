# Deploys a PREVIEW (never production), smoke-tests the API, and writes the URL to the top of PROGRESS.md.
# Usage (PowerShell, from the project root):  .\scripts\deploy-preview.ps1 [extra api paths to smoke-test...]
# Preview URLs are behind Vercel login; `vercel curl` bypasses that for the smoke test.

# 'Continue': Windows PowerShell treats any stderr output of a native tool as an error otherwise.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

$out = vercel deploy --target=preview --yes 2>&1 | Out-String
$url = ([regex]::Matches($out, 'https://crosswise-[a-z0-9-]+\.vercel\.app') | Select-Object -First 1).Value
if (-not $url) { Write-Output $out; throw 'Deploy failed: no preview URL found' }
Write-Output "Preview: $url"

$paths = @('/api/health') + $args
$failed = $false
foreach ($p in $paths) {
  $body = vercel curl $p --deployment $url 2>$null | Out-String
  if (-not $body.Trim()) { Start-Sleep -Seconds 3; $body = vercel curl $p --deployment $url 2>$null | Out-String } # network hiccup: retry once
  $short = $body.Trim()
  if ($short.Length -gt 300) { $short = $short.Substring(0, 300) + '...' }
  Write-Output "  $p -> $short"
  if ($p -eq '/api/health' -and $body -notmatch '"ok":true') { $failed = $true }
}

# Put the newest preview URL at the top of PROGRESS.md
$progress = Get-Content PROGRESS.md -Raw -Encoding utf8
$stamp = Get-Date -Format 'HH:mm'
$progress = $progress -replace '(?m)^\*\*Latest preview:\*\*.*$', "**Latest preview:** $url  (deployed $stamp; open while logged in to Vercel)"
[IO.File]::WriteAllText((Resolve-Path PROGRESS.md), $progress)

if ($failed) { throw 'Smoke test failed' }
