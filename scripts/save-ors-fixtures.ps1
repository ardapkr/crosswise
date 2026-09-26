# Saves real OpenRouteService responses (raw GeoJSON) from a deployed preview as test fixtures,
# so unit tests never need the network or an API key.
# Usage: .\scripts\save-ors-fixtures.ps1 https://crosswise-xxxx-trua.vercel.app

param([Parameter(Mandatory = $true)][string]$Url)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

$HOIV = '16.3954,48.1761'
$cases = @(
  @{ file = 'ors-hoiv-hbf-foot.json';        to = '16.3755,48.1850'; mode = 'blind' },       # Wien Hauptbahnhof
  @{ file = 'ors-hoiv-hbf-wheelchair.json';  to = '16.3755,48.1850'; mode = 'wheelchair' },
  @{ file = 'ors-hoiv-hbf-limited.json';     to = '16.3755,48.1850'; mode = 'limited' },
  @{ file = 'ors-hoiv-belvedere-foot.json';  to = '16.3809,48.1915'; mode = 'blind' }        # Oberes Belvedere
)
foreach ($c in $cases) {
  $path = "/api/route?from=$HOIV&to=$($c.to)&mode=$($c.mode)&raw=1"
  $body = vercel curl $path --deployment $Url 2>$null | Out-String
  if ($body -notmatch '"features"') { Write-Output "FAILED $($c.file): $($body.Substring(0, [Math]::Min(200, $body.Length)))"; continue }
  [IO.File]::WriteAllText((Join-Path (Get-Location) "test/fixtures/$($c.file)"), $body.Trim())
  Write-Output "saved test/fixtures/$($c.file) ($($body.Length) bytes)"
}
