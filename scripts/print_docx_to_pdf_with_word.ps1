param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPdf
)

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$outputDirectory = Split-Path -Parent $OutputPdf
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}
$resolvedOutput = Join-Path (Resolve-Path -LiteralPath $outputDirectory).Path (Split-Path -Leaf $OutputPdf)
$missing = [Type]::Missing
$word = $null
$document = $null
$previousPrinter = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $previousPrinter = $word.ActivePrinter
    $word.ActivePrinter = "Microsoft Print to PDF"
    $document = $word.Documents.Open($resolvedInput, $false, $true)
    $document.Repaginate()
    $document.PrintOut($false, $false, 0, $resolvedOutput, $missing, $missing, 0, 1, $missing, 0, $true, $true)
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $resolvedOutput)) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-Path -LiteralPath $resolvedOutput)) {
        throw "Microsoft Print to PDF did not create the output file."
    }
}
finally {
    if ($null -ne $document) {
        $document.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
    if ($null -ne $word) {
        if ($null -ne $previousPrinter) {
            try { $word.ActivePrinter = $previousPrinter } catch { }
        }
        $word.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Get-Item -LiteralPath $resolvedOutput | Select-Object FullName, Length, LastWriteTime
