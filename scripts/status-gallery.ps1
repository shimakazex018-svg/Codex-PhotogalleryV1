param(
  [string]$RuntimeRoot = "D:\GalleryRuntime",
  [int]$Port = 48102
)

$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-Autostart"
$pidFile = Join-Path $RuntimeRoot "logs\gallery.pid"
$stdoutLog = Join-Path $RuntimeRoot "logs\gallery.stdout.log"
$stderrLog = Join-Path $RuntimeRoot "logs\gallery.stderr.log"
$hostLog = Join-Path $RuntimeRoot "logs\gallery.host.log"
$envFile = Join-Path $RuntimeRoot "config\gallery.env"

$metadata = $null
$process = $null
if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
  try {
    $metadata = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($metadata.ProcessId) { $process = Get-Process -Id ([int]$metadata.ProcessId) -ErrorAction SilentlyContinue }
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

$httpStatus = $null
if ($listening) {
  try {
    $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/")
    $request.Timeout = 3000
    $response = $request.GetResponse()
    $httpStatus = [int]$response.StatusCode
    $response.Dispose()
  } catch {
    $httpStatus = $null
  }
}

$nodeMatchesMetadata = $false
$nodeParentPid = $null
if ($process -and $metadata.NodePath) {
  $nodeMatchesMetadata = [System.IO.Path]::GetFullPath($process.Path) -eq [System.IO.Path]::GetFullPath($metadata.NodePath)
  try {
    $nodeParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction Stop).ParentProcessId
  } catch {
    $nodeParentPid = $metadata.ParentProcessId
  }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$taskState = if ($task) { [string]$task.State } else { "Missing" }
$accessUrls = [Collections.Generic.List[string]]::new()
$accessUrls.Add("http://127.0.0.1:$Port/")
try {
  [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not [System.Net.IPAddress]::IsLoopback($_) } |
    ForEach-Object { $accessUrls.Add("http://$($_.IPAddressToString):$Port/") }
} catch {
  # Local access remains available even when LAN discovery fails.
}

$healthy = $process -and $listening -and $nodeMatchesMetadata -and $httpStatus -eq 200 -and $taskState -eq "Running"
[pscustomobject]@{
  Status = if ($healthy) { "running" } elseif ($process -or $listening -or $taskState -eq "Running") { "degraded" } else { "stopped" }
  ScheduledTask = $taskState
  PID = if ($process) { $process.Id } else { $null }
  ParentPID = $nodeParentPid
  HostPID = if ($metadata) { $metadata.HostProcessId } else { $null }
  Port = $Port
  Listening = $listening
  HttpStatus = $httpStatus
  NodeRunning = [bool]$process
  NodePath = if ($metadata) { $metadata.NodePath } else { $null }
  RuntimeRoot = $RuntimeRoot
  EnvFile = $envFile
  StdoutLog = $stdoutLog
  StderrLog = $stderrLog
  HostLog = $hostLog
  AccessUrls = @($accessUrls | Select-Object -Unique)
}
