param(
  [string]$EnvFile = "D:\GalleryRuntime\config\gallery.env",
  [int]$StopTimeoutSeconds = 30,
  [int]$StartTimeoutSeconds = 30,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gallery-runtime-common.ps1")

$config = Read-GalleryEnvironment -EnvFile $EnvFile
$runtimeRoot = Split-Path -Parent $config.DATA_DIR
$logDir = Join-Path $runtimeRoot "logs"
$lockFile = Join-Path $logDir "gallery-maintenance.lock"
$stateFile = Join-Path $runtimeRoot "maintenance-state.json"
$today = Get-Date -Format "yyyy-MM-dd"
$maintenanceLog = Join-Path $logDir "maintenance-$today.log"
$statusScript = Join-Path $PSScriptRoot "status-gallery.ps1"
$stopScript = Join-Path $PSScriptRoot "stop-gallery.ps1"
$startScript = Join-Path $PSScriptRoot "start-gallery.ps1"
$workerScript = Join-Path $PSScriptRoot "run-collection-recycle-maintenance.js"
$nodePath = if ($DryRun) { Resolve-GalleryNode } else { (Test-GalleryEnvironment -Config $config -ProjectRoot (Split-Path -Parent $PSScriptRoot)).NodePath }
$stopped = $false
$healthy = $false
$dryRunCompleted = $false

function Write-MaintenanceLog {
  param([string]$Type, [hashtable]$Details = @{})
  $entry = [ordered]@{ time = (Get-Date).ToUniversalTime().ToString("o"); type = $Type }
  foreach ($key in $Details.Keys) { $entry[$key] = $Details[$key] }
  ($entry | ConvertTo-Json -Compress -Depth 8) | Add-Content -LiteralPath $maintenanceLog -Encoding UTF8
}

function Get-GalleryStatus { & $statusScript -RuntimeRoot $runtimeRoot -Port ([int]$config.PORT) }

function Wait-ForStopped {
  $deadline = (Get-Date).AddSeconds($StopTimeoutSeconds)
  do {
    $status = Get-GalleryStatus
    if (-not $status.NodeRunning -and -not $status.Listening) { return $true }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  return $false
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
try {
  New-Item -ItemType File -Path $lockFile -ErrorAction Stop | Out-Null
} catch {
  Write-MaintenanceLog "maintenance_skipped_locked" @{ error = $_.Exception.Message }
  exit 0
}

try {
  if ($DryRun) {
    $status = Get-GalleryStatus
    $serverPath = Join-Path (Split-Path -Parent $PSScriptRoot) "server.js"
    Write-MaintenanceLog "maintenance_dry_run" @{ nodePid = $status.NodePID; listenerPid = $status.ListenerPID; serverPath = $serverPath; workingDirectory = (Split-Path -Parent $PSScriptRoot); healthUrl = "http://127.0.0.1:$($config.PORT)/"; startCommand = "$startScript -EnvFile $EnvFile" }
    & $nodePath $workerScript --db (Join-Path $config.DATA_DIR "gallery.db") --photos $config.PHOTOS_DIR --trash $config.TRASH_DIR --log $maintenanceLog --dry-run
    if ($LASTEXITCODE -ne 0) { throw "collection maintenance dry-run worker failed with exit code $LASTEXITCODE" }
    Write-MaintenanceLog "maintenance_dry_run_complete"
    $dryRunCompleted = $true
    return
  }
  @{ maintenance_mode = $true; startedAt = (Get-Date).ToUniversalTime().ToString("o"); phase = "stopping" } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
  Write-MaintenanceLog "maintenance_start"
  & $stopScript -RuntimeRoot $runtimeRoot
  if (-not (Wait-ForStopped)) {
    Write-MaintenanceLog "maintenance_stop_timeout" @{ timeoutSeconds = $StopTimeoutSeconds }
    throw "maintenance_stop_timeout"
  }
  $stopped = $true
  Write-MaintenanceLog "gallery_service_stopped"

  @{ maintenance_mode = $true; startedAt = (Get-Date).ToUniversalTime().ToString("o"); phase = "recycling" } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
  Write-MaintenanceLog "recycle_start"
  & $nodePath $workerScript --db (Join-Path $config.DATA_DIR "gallery.db") --photos $config.PHOTOS_DIR --trash $config.TRASH_DIR --log $maintenanceLog
  if ($LASTEXITCODE -ne 0) { throw "collection maintenance worker failed with exit code $LASTEXITCODE" }
  Write-MaintenanceLog "recycle_finished"
} catch {
  Write-MaintenanceLog "maintenance_failed" @{ error = $_.Exception.Message }
} finally {
  if ($stopped) {
    try {
      @{ maintenance_mode = $true; startedAt = (Get-Date).ToUniversalTime().ToString("o"); phase = "starting" } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
      & $startScript -EnvFile $EnvFile -TimeoutSeconds $StartTimeoutSeconds
      $healthy = (Get-GalleryStatus).Status -eq "running"
      if ($healthy) {
        Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        Write-MaintenanceLog "gallery_service_started"
        try {
          Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($config.PORT)/api/scan" -Headers @{ Origin = "http://127.0.0.1:$($config.PORT)" } -ContentType "application/json" -Body "{}" -TimeoutSec 20 | Out-Null
          Write-MaintenanceLog "index_scan_started"
        } catch {
          Write-MaintenanceLog "index_scan_start_failed" @{ error = $_.Exception.Message }
        }
      } else {
        Write-MaintenanceLog "gallery_service_start_failed"
      }
    } catch {
      Write-MaintenanceLog "gallery_service_start_failed" @{ error = $_.Exception.Message }
    }
  }
  Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

if ($dryRunCompleted) { exit 0 }
if (-not $healthy) { exit 1 }
