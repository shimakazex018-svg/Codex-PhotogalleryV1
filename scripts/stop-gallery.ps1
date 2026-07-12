param([string]$RuntimeRoot = "D:\GalleryRuntime")

$ErrorActionPreference = "Stop"
$pidFile = Join-Path $RuntimeRoot "logs\gallery.pid"
if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
  Write-Host "Gallery is not running."
  exit 0
}

$metadata = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
if (-not $metadata.ProcessId -or -not $metadata.NodePath -or -not $metadata.ServerPath -or -not $metadata.StartTimeUtc) {
  throw "Invalid PID metadata; refusing to stop any process."
}
$galleryPid = [int]$metadata.ProcessId
$process = Get-Process -Id $galleryPid -ErrorAction SilentlyContinue
if (-not $process) {
  Remove-Item -LiteralPath $pidFile -Force
  Write-Host "Gallery is not running. Stale PID metadata was removed."
  exit 0
}

$expectedServer = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) "server.js"))
$expectedNode = [System.IO.Path]::GetFullPath($metadata.NodePath)
$actualNode = [System.IO.Path]::GetFullPath($process.Path)
$actualStart = $process.StartTime.ToUniversalTime()
$recordedStart = [DateTimeOffset]::Parse($metadata.StartTimeUtc).UtcDateTime
if ($metadata.ServerPath -ne $expectedServer -or $actualNode -ne $expectedNode -or [Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -gt 2) {
  throw "PID metadata does not match this project's recorded process; refusing to stop it."
}
Stop-Process -Id $galleryPid
Remove-Item -LiteralPath $pidFile -Force
Write-Host "Gallery stopped. PID: $galleryPid" -ForegroundColor Green
