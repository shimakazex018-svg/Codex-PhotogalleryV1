param([string]$RuntimeRoot = "D:\GalleryRuntime")

$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-Autostart"
$pidFile = Join-Path $RuntimeRoot "logs\gallery.pid"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$metadata = $null

if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
  $metadata = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
}

if (-not $metadata -or -not $metadata.ProcessId) {
  if ($task -and $task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $TaskName
  }
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
  Write-Host "Gallery is not running."
  exit 0
}

if (-not $metadata.NodePath -or -not $metadata.ServerPath -or -not $metadata.StartTimeUtc) {
  throw "Invalid PID metadata; refusing to stop any process."
}
$galleryPid = [int]$metadata.ProcessId
$process = Get-Process -Id $galleryPid -ErrorAction SilentlyContinue
if ($process) {
  $expectedServer = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) "server.js"))
  $expectedNode = [System.IO.Path]::GetFullPath($metadata.NodePath)
  $actualNode = [System.IO.Path]::GetFullPath($process.Path)
  $actualStart = $process.StartTime.ToUniversalTime()
  $recordedStart = [DateTimeOffset]::Parse($metadata.StartTimeUtc).UtcDateTime
  if ($metadata.ServerPath -ne $expectedServer -or $actualNode -ne $expectedNode -or [Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -gt 2) {
    throw "PID metadata does not match this project's recorded process; refusing to stop it."
  }
  Stop-Process -Id $galleryPid
  Wait-Process -Id $galleryPid -Timeout 10 -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddSeconds(5)
do {
  Start-Sleep -Milliseconds 250
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} while ($task -and $task.State -eq "Running" -and (Get-Date) -lt $deadline)
if ($task -and $task.State -eq "Running") {
  Stop-ScheduledTask -TaskName $TaskName
}
if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
Write-Host "Gallery stopped. PID: $galleryPid" -ForegroundColor Green
