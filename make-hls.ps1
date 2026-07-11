param(
  [Parameter(Mandatory = $true)]
  [string]$VideoPath,

  [string]$OutputRoot = "$PSScriptRoot\data\hls",
  [string]$FfmpegPath = $env:FFMPEG_PATH
)

if (-not $FfmpegPath) {
  $FfmpegPath = "ffmpeg"
}

$resolvedVideo = Resolve-Path -LiteralPath $VideoPath -ErrorAction Stop
$source = $resolvedVideo.ProviderPath
$hashInput = "$source|$((Get-Item -LiteralPath $source).Length)|$((Get-Item -LiteralPath $source).LastWriteTimeUtc.Ticks)"
$sha1 = [System.Security.Cryptography.SHA1]::Create()
$hashBytes = $sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hashInput))
$id = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
$targetDir = Join-Path $OutputRoot $id

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$playlist = Join-Path $targetDir "index.m3u8"
$segmentPattern = Join-Path $targetDir "segment_%05d.ts"

& $FfmpegPath `
  -y `
  -i $source `
  -c copy `
  -start_number 0 `
  -hls_time 6 `
  -hls_playlist_type vod `
  -hls_segment_filename $segmentPattern `
  $playlist

if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg HLS generation failed with exit code $LASTEXITCODE"
}

Write-Host "HLS playlist:"
Write-Host "/hls/$id/index.m3u8"
