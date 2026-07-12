param(
  [string]$EnvFile = "D:\GalleryRuntime\config\gallery.env",
  [string]$NodePath
)

$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-Autostart"
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "gallery-runtime-common.ps1")

$config = Read-GalleryEnvironment -EnvFile $EnvFile
$runtimeRoot = Split-Path -Parent $config.DATA_DIR
$logDir = Join-Path $runtimeRoot "logs"
$pidFile = Join-Path $logDir "gallery.pid"
$stdoutLog = Join-Path $logDir "gallery.stdout.log"
$stderrLog = Join-Path $logDir "gallery.stderr.log"
$hostLog = Join-Path $logDir "gallery.host.log"
$exitRecord = Join-Path $logDir "gallery.last-exit.json"

function Write-HostLog {
  param([string]$Message)
  Add-Content -LiteralPath $hostLog -Value "$(Get-Date -Format o) hostPid=$PID $Message" -Encoding UTF8
}

$currentStatus = & (Join-Path $PSScriptRoot "status-gallery.ps1") -RuntimeRoot $runtimeRoot -Port ([int]$config.PORT)
if ($currentStatus.NodeRunning -or $currentStatus.Listening) {
  Write-HostLog "refused duplicate start status=$($currentStatus.Status) nodePid=$($currentStatus.PID)"
  throw "Gallery is already running or port 48102 is occupied."
}
if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force
}

$result = Test-GalleryEnvironment -Config $config -ProjectRoot $projectRoot -NodePath $NodePath
Set-GalleryProcessEnvironment -Config $config
$serverPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "server.js"))
$quotedServerPath = '"' + $serverPath.Replace('"', '\"') + '"'

Write-HostLog "starting node=$($result.NodePath) server=$serverPath"
$process = Start-Process -FilePath $result.NodePath -ArgumentList $quotedServerPath `
  -WorkingDirectory $projectRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
$metadata = [ordered]@{
  ProcessId = $process.Id
  ParentProcessId = $PID
  NodePath = [System.IO.Path]::GetFullPath($result.NodePath)
  ServerPath = $serverPath
  StartTimeUtc = $process.StartTime.ToUniversalTime().ToString("o")
  HostProcessId = $PID
  HostStartTimeUtc = (Get-Process -Id $PID).StartTime.ToUniversalTime().ToString("o")
  TaskName = $TaskName
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
Write-HostLog "node started nodePid=$($process.Id)"

$exitCode = $null
try {
  $process.WaitForExit()
  $exitCode = $process.ExitCode
} finally {
  $exitData = [ordered]@{
    ProcessId = $process.Id
    HostProcessId = $PID
    ExitedAt = Get-Date -Format o
    ExitCode = $exitCode
  }
  $exitData | ConvertTo-Json | Set-Content -LiteralPath $exitRecord -Encoding UTF8
  Write-HostLog "node exited nodePid=$($process.Id) exitCode=$exitCode"
  if (Test-Path -LiteralPath $pidFile) {
    try {
      $stored = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ([int]$stored.ProcessId -eq $process.Id) {
        Remove-Item -LiteralPath $pidFile -Force
      }
    } catch {
      Write-HostLog "pid cleanup failed error=$($_.Exception.Message)"
    }
  }
}

if ($null -eq $exitCode) { exit 1 }
exit $exitCode
