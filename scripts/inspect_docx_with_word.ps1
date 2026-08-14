param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath
)

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
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
    [pscustomobject]@{
        Path = $resolvedInput
        Pages = $document.ComputeStatistics(2)
        Words = $document.ComputeStatistics(0)
        Characters = $document.ComputeStatistics(3)
        Tables = $document.Tables.Count
        InlineShapes = $document.InlineShapes.Count
        Sections = $document.Sections.Count
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
