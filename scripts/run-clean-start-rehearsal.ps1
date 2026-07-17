$ErrorActionPreference = "Stop"
$StartedAt = [System.Diagnostics.Stopwatch]::StartNew()
$CoreFlowPattern = "ETA"

for ($Run = 1; $Run -le 3; $Run += 1) {
  Write-Host "CLEAN_START_RUN=$Run/3"
  & (Join-Path $PSScriptRoot "run-playwright.ps1") --grep $CoreFlowPattern
  if ($LASTEXITCODE -ne 0) {
    throw "Clean start run $Run failed."
  }
}

$StartedAt.Stop()
if ($StartedAt.Elapsed.TotalSeconds -ge 180) {
  throw "Three clean starts exceeded 180 seconds: $([Math]::Round($StartedAt.Elapsed.TotalSeconds, 2)) seconds"
}

Write-Host "CLEAN_START_3X_PASS elapsedSeconds=$([Math]::Round($StartedAt.Elapsed.TotalSeconds, 2))"
