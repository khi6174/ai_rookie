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
$resolvedOutputDirectory = (Resolve-Path -LiteralPath $outputDirectory).Path
$resolvedOutput = Join-Path $resolvedOutputDirectory (Split-Path -Leaf $OutputPdf)

$word = $null
$document = $null
$previousPrinter = $null
try {
    Write-Output "WORD_CREATE_START"
    $word = New-Object -ComObject Word.Application
    Write-Output "WORD_CREATE_DONE"
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $previousPrinter = $word.ActivePrinter
    $word.ActivePrinter = "Microsoft Print to PDF"
    Write-Output "WORD_PRINTER=$($word.ActivePrinter)"
    Write-Output "DOC_OPEN_START"
    $document = $word.Documents.Open($resolvedInput, $false, $true)
    Write-Output "DOC_OPEN_DONE"
    Write-Output "PDF_EXPORT_START"
    $document.ExportAsFixedFormat($resolvedOutput, 17)
    Write-Output "PDF_EXPORT_DONE"
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
