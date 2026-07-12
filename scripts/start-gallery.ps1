param(
  [string]$EnvFile = "D:\GalleryRuntime\config\gallery.env",
  [string]$NodePath
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "gallery-runtime-common.ps1")

$config = Read-GalleryEnvironment -EnvFile $EnvFile
$result = Test-GalleryEnvironment -Config $config -ProjectRoot $projectRoot -NodePath $NodePath
Set-GalleryProcessEnvironment -Config $config

$logDir = Join-Path (Split-Path -Parent $config.DATA_DIR) "logs"
$pidFile = Join-Path $logDir "gallery.pid"
$stdoutLog = Join-Path $logDir "gallery.stdout.log"
$stderrLog = Join-Path $logDir "gallery.stderr.log"
if (Test-Path -LiteralPath $pidFile) {
  $existing = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  if ($existing.ProcessId -and (Get-Process -Id $existing.ProcessId -ErrorAction SilentlyContinue)) {
    throw "Gallery process $($existing.ProcessId) is already running."
  }
  Remove-Item -LiteralPath $pidFile -Force
}

$serverPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "server.js"))
$quotedServerPath = '"' + $serverPath.Replace('"', '\"') + '"'
$process = Start-Process -FilePath $result.NodePath -ArgumentList $quotedServerPath `
  -WorkingDirectory $projectRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
$processMetadata = [ordered]@{
  ProcessId = $process.Id
  NodePath = [System.IO.Path]::GetFullPath($result.NodePath)
  ServerPath = $serverPath
  StartTimeUtc = $process.StartTime.ToUniversalTime().ToString("o")
}
$processMetadata | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8
Write-Host "Gallery started on port 48102. PID: $($process.Id)" -ForegroundColor Green
Write-Host "Logs: $logDir"
