# Adapted from SunFlowerBaby32/codesnap-fast (MIT). See THIRD_PARTY_NOTICES.md.
param(
    [Parameter(Mandatory=$true)][string]$ImagePath,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$clock = [Diagnostics.Stopwatch]::StartNew()
$imageBytes = [IO.File]::ReadAllBytes($ImagePath)
if ($imageBytes.Length -lt 33) { throw 'Invalid PNG data' }
if ([BitConverter]::ToString($imageBytes, 0, 8) -ne '89-50-4E-47-0D-0A-1A-0A') { throw 'Expected a PNG image' }
$width = [uint64]$imageBytes[16]*16777216 + [uint64]$imageBytes[17]*65536 + [uint64]$imageBytes[18]*256 + $imageBytes[19]
$height = [uint64]$imageBytes[20]*16777216 + [uint64]$imageBytes[21]*65536 + [uint64]$imageBytes[22]*256 + $imageBytes[23]
if (-not $width -or -not $height) { throw 'Invalid PNG dimensions' }
$decodeStream = [IO.MemoryStream]::new($imageBytes, $false)
$pngStream = [IO.MemoryStream]::new($imageBytes, $false)
$bitmap = $null
try {
    $bitmap = [Drawing.Image]::FromStream($decodeStream)
    $clipboardData = [Windows.Forms.DataObject]::new()
    $clipboardData.SetData([Windows.Forms.DataFormats]::Bitmap, $true, $bitmap)
    $clipboardData.SetData('PNG', $false, $pngStream)
    $pngRoundTrip = [IO.MemoryStream]$clipboardData.GetData('PNG', $false)
    if ($pngRoundTrip.Length -ne $imageBytes.Length) { throw 'PNG payload verification failed' }
    $pngHash = $null
    if ($CheckOnly) {
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $pngHash = [BitConverter]::ToString($hasher.ComputeHash($pngRoundTrip.ToArray())).Replace('-', '').ToLowerInvariant() }
        finally { $hasher.Dispose() }
    }
    $clipboardStarted = $clock.ElapsedMilliseconds
    if (-not $CheckOnly) {
        [Windows.Forms.Clipboard]::SetDataObject($clipboardData, $true, 10, 50)
    }
    [PSCustomObject]@{
        Copied=(-not [bool]$CheckOnly)
        Width=$bitmap.Width
        Height=$bitmap.Height
        PngBytes=$imageBytes.Length
        ClipboardMilliseconds=($clock.ElapsedMilliseconds - $clipboardStarted)
        HelperMilliseconds=$clock.ElapsedMilliseconds
        CheckOnly=[bool]$CheckOnly
        HasPng=$clipboardData.GetDataPresent('PNG', $false)
        HasBitmap=$clipboardData.GetDataPresent([Windows.Forms.DataFormats]::Bitmap)
        PngSha256=$pngHash
    } | ConvertTo-Json -Compress
} finally {
    if ($bitmap) { $bitmap.Dispose() }
    $pngStream.Dispose()
    $decodeStream.Dispose()
}
