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
$listenerPid = $null
$listenerQueryFailed = $false
try {
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  if ($listeners.Count -gt 0) {
    $listening = $true
    $listenerPids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listenerPids.Count -eq 1) { $listenerPid = [int]$listenerPids[0] }
  }
} catch {
  $listenerQueryFailed = $true
}

$client = [System.Net.Sockets.TcpClient]::new()
try {
  $connection = $client.ConnectAsync("127.0.0.1", $Port)
  $tcpReachable = $connection.Wait(2000) -and $client.Connected
  if ($listenerQueryFailed) { $listening = $tcpReachable }
} catch {
  if ($listenerQueryFailed) { $listening = $false }
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

$hostProcess = $null
if ($metadata -and $metadata.HostProcessId) {
  $hostProcess = Get-Process -Id ([int]$metadata.HostProcessId) -ErrorAction SilentlyContinue
}
$nodeParentMatchesHost = $process -and $hostProcess -and $nodeParentPid -eq $hostProcess.Id
$listenerMatchesNode = $process -and $listenerPid -and $listenerPid -eq $process.Id

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

$healthy = $process -and $hostProcess -and $listening -and $nodeMatchesMetadata -and `
  $nodeParentMatchesHost -and $listenerMatchesNode -and $httpStatus -eq 200 -and $taskState -eq "Running"
[pscustomobject]@{
  Status = if ($healthy) { "running" } elseif ($process -or $listening -or $taskState -eq "Running") { "degraded" } else { "stopped" }
  ScheduledTask = $taskState
  ScheduledTaskState = $taskState
  PID = if ($process) { $process.Id } else { $null }
  NodePID = if ($process) { $process.Id } else { $null }
  ParentPID = $nodeParentPid
  NodeParentPID = $nodeParentPid
  HostPID = if ($hostProcess) { $hostProcess.Id } else { $null }
  Port = $Port
  Listening = $listening
  ListenerPID = $listenerPid
  ListenerMatchesNode = [bool]$listenerMatchesNode
  NodeParentMatchesHost = [bool]$nodeParentMatchesHost
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
