param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $PlaywrightArgs
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ViteStdout = Join-Path ([System.IO.Path]::GetTempPath()) "saferoute-vite-$PID.stdout.log"
$ViteStderr = Join-Path ([System.IO.Path]::GetTempPath()) "saferoute-vite-$PID.stderr.log"
$Server = $null
$ExitCode = 1

try {
  $Server = Start-Process `
    -FilePath "node" `
    -ArgumentList @("./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ViteStdout `
    -RedirectStandardError $ViteStderr `
    -PassThru

  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 120; $Attempt += 1) {
    if ($Server.HasExited) {
      break
    }
    try {
      $Response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4173" -TimeoutSec 1
      if ($Response.StatusCode -eq 200) {
        $Ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $Ready) {
    $ErrorText = if (Test-Path -LiteralPath $ViteStderr) {
      Get-Content -Raw -LiteralPath $ViteStderr
    } else {
      "No Vite error log"
    }
    throw "Vite did not become ready. $ErrorText"
  }

  Push-Location $Root
  try {
    & node "node_modules/@playwright/test/cli.js" test @PlaywrightArgs
    $ExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if ($null -ne $Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force
    $Server.WaitForExit()
  }
  Remove-Item -LiteralPath $ViteStdout, $ViteStderr -Force -ErrorAction SilentlyContinue
}

exit $ExitCode
