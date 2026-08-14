param(
  [Parameter(Mandatory = $true)][string]$Ffmpeg,
  [Parameter(Mandatory = $true)][string]$InputVideo,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string[]]$Times
)

$resolvedFfmpeg = (Resolve-Path -LiteralPath $Ffmpeg).Path
$resolvedInput = (Resolve-Path -LiteralPath $InputVideo).Path
if (-not (Test-Path -LiteralPath $OutputDirectory)) { New-Item -ItemType Directory -Path $OutputDirectory | Out-Null }
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path
$expandedTimes = @($Times | ForEach-Object { $_ -split ',' } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

for ($index = 0; $index -lt $expandedTimes.Count; $index += 1) {
  $time = $expandedTimes[$index].Trim()
  $fileName = "frame-{0:D2}.png" -f ($index + 1)
  $outputPath = Join-Path $resolvedOutput $fileName
  & $resolvedFfmpeg -hide_banner -loglevel error -ss $time -i $resolvedInput -frames:v 1 -update 1 -y $outputPath
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed at $time" }
  Write-Output $outputPath
}
