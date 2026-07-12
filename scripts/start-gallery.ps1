param(
  [string]$EnvFile = "D:\GalleryRuntime\config\gallery.env",
  [int]$TimeoutSeconds = 15
)

$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-Autostart"
$RuntimeRoot = Split-Path -Parent (Split-Path -Parent $EnvFile)
$statusScript = Join-Path $PSScriptRoot "status-gallery.ps1"

$status = & $statusScript -RuntimeRoot $RuntimeRoot -Port 48102
if ($status.Status -eq "running") {
  Write-Host "Gallery is already running." -ForegroundColor Yellow
  Write-Host "PID: $($status.PID)"
  Write-Host "URL: http://127.0.0.1:48102/"
  exit 0
}
if ($status.NodeRunning) {
  throw "Gallery PID exists but health checks are degraded. Refusing to start a second process."
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  throw "Autostart task is not installed. Run Install Autostart.cmd first."
}
if ($task.State -ne "Running") {
  Start-ScheduledTask -TaskName $TaskName
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Milliseconds 500
  $status = & $statusScript -RuntimeRoot $RuntimeRoot -Port 48102
  if ($status.Status -eq "running") {
    Write-Host "Gallery started successfully." -ForegroundColor Green
    Write-Host "PID: $($status.PID)"
    Write-Host "Port: 48102"
    Write-Host "URL: http://127.0.0.1:48102/"
    exit 0
  }
} while ((Get-Date) -lt $deadline)

$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
throw "Gallery did not become healthy within $TimeoutSeconds seconds. Task result: $($taskInfo.LastTaskResult). Logs: D:\GalleryRuntime\logs\gallery.stdout.log and gallery.stderr.log"
