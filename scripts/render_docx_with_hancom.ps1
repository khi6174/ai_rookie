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

$hwp = $null
try {
    Write-Output "HANCOM_CREATE_START"
    $hwp = New-Object -ComObject HWPFrame.HwpObject
    Write-Output "HANCOM_CREATE_DONE"
    try { [void]$hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample") } catch { }
    try { [void]$hwp.SetMessageBoxMode(0x00214411) } catch { }
    try { $hwp.XHwpWindows.Item(0).Visible = $false } catch { }
    Write-Output "DOC_OPEN_START"
    $opened = $hwp.Open($resolvedInput, "OOXML", "lock:false;forceopen:true;versionwarning:false;")
    if (-not $opened) { throw "Hancom could not open the DOCX." }
    Write-Output "DOC_OPEN_DONE"
    Write-Output "PDF_SAVE_START"
    $saved = $hwp.SaveAs($resolvedOutput, "PDF", "")
    if (-not $saved) { throw "Hancom could not save the PDF." }
    Write-Output "PDF_SAVE_DONE"
}
finally {
    if ($null -ne $hwp) {
        try { $hwp.Quit() } catch { }
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Get-Item -LiteralPath $resolvedOutput | Select-Object FullName, Length, LastWriteTime
