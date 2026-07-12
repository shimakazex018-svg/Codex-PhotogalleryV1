param(
  [string]$RuntimeRoot = "D:\GalleryRuntime",
  [int]$Port = 48102
)

$ErrorActionPreference = "Stop"
$pidFile = Join-Path $RuntimeRoot "logs\gallery.pid"
$stdoutLog = Join-Path $RuntimeRoot "logs\gallery.stdout.log"
$stderrLog = Join-Path $RuntimeRoot "logs\gallery.stderr.log"
$envFile = Join-Path $RuntimeRoot "config\gallery.env"

$metadata = $null
$process = $null
if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
  try {
    $metadata = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($metadata.ProcessId) {
      $process = Get-Process -Id ([int]$metadata.ProcessId) -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Warning "PID metadata is unreadable: $($_.Exception.Message)"
  }
}

$listening = $false
$client = [System.Net.Sockets.TcpClient]::new()
try {
  $connection = $client.ConnectAsync("127.0.0.1", $Port)
  $listening = $connection.Wait(2000) -and $client.Connected
} catch {
  $listening = $false
} finally {
  $client.Dispose()
}
$nodeMatchesMetadata = $false
if ($process -and $metadata.NodePath) {
  $nodeMatchesMetadata = [System.IO.Path]::GetFullPath($process.Path) -eq [System.IO.Path]::GetFullPath($metadata.NodePath)
}

[pscustomobject]@{
  Status = if ($process -and $listening -and $nodeMatchesMetadata) { "running" } elseif ($process) { "degraded" } else { "stopped" }
  PID = if ($process) { $process.Id } else { $null }
  Port = $Port
  Listening = $listening
  NodeRunning = [bool]$process
  NodePath = if ($metadata) { $metadata.NodePath } else { $null }
  RuntimeRoot = $RuntimeRoot
  EnvFile = $envFile
  StdoutLog = $stdoutLog
  StderrLog = $stderrLog
}
