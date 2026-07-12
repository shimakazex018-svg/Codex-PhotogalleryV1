param(
  [string]$BaseUrl = "http://127.0.0.1:48102",
  [string]$RuntimeRoot = "D:\GalleryRuntime",
  [ValidateRange(0, 500)][int]$ImageLimit = 20,
  [ValidateRange(0, 50)][int]$VideoPosterLimit = 3,
  [switch]$Resume
)

$ErrorActionPreference = "Stop"
$logDir = Join-Path $RuntimeRoot "logs"
$stateFile = Join-Path $logDir "cache-rebuild-state.json"
$stopFile = Join-Path $logDir "cache-rebuild.stop"
$logFile = Join-Path $logDir "cache-rebuild.log"

function Write-RebuildLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding utf8
  Write-Host $line
}

function Save-RebuildState {
  param($State)
  $tempFile = "$stateFile.tmp"
  $State.updatedAt = Get-Date -Format o
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $tempFile -Encoding utf8
  Move-Item -LiteralPath $tempFile -Destination $stateFile -Force
}

function Test-PauseRequested {
  return Test-Path -LiteralPath $stopFile -PathType Leaf
}

if (-not (Test-Path -LiteralPath $logDir -PathType Container)) {
  throw "Runtime log directory does not exist: $logDir"
}
if ($Resume -and (Test-Path -LiteralPath $stopFile)) {
  Remove-Item -LiteralPath $stopFile -Force
}
if (Test-PauseRequested) {
  throw "Cache rebuild is paused. Re-run with -Resume to continue."
}

if (Test-Path -LiteralPath $stateFile) {
  $state = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
  $state = [pscustomobject]@{
    version = 1
    updatedAt = Get-Date -Format o
    completedImages = @()
    completedPosters = @()
    failed = @()
  }
}

$completedImages = @{}
foreach ($url in @($state.completedImages)) { $completedImages[[string]$url] = $true }
$completedPosters = @{}
foreach ($url in @($state.completedPosters)) { $completedPosters[[string]$url] = $true }

$root = Invoke-RestMethod -Uri "$BaseUrl/api/collections/root" -TimeoutSec 30
$queue = [Collections.Generic.Queue[object]]::new()
foreach ($item in @($root.items)) { $queue.Enqueue($item) }
$imageUrls = [Collections.Generic.List[string]]::new()
$posterUrls = [Collections.Generic.List[string]]::new()
$visited = 0

while ($queue.Count -gt 0 -and ($imageUrls.Count -lt $ImageLimit -or $posterUrls.Count -lt $VideoPosterLimit)) {
  if (Test-PauseRequested) { Write-RebuildLog "PAUSED during discovery"; Save-RebuildState $state; exit 2 }
  $summary = $queue.Dequeue()
  $collectionId = [Uri]::EscapeDataString([string]$summary.id)
  $collection = Invoke-RestMethod -Uri "$BaseUrl/api/collections/$collectionId" -TimeoutSec 30
  $visited++
  foreach ($child in @($collection.children)) { $queue.Enqueue($child) }

  if ($imageUrls.Count -lt $ImageLimit -and [int]$collection.imageCount -gt 0) {
    $remaining = $ImageLimit - $imageUrls.Count
    $result = Invoke-RestMethod -Uri "$BaseUrl/api/media?collectionId=$collectionId&type=image&limit=$remaining&offset=0" -TimeoutSec 30
    foreach ($media in @($result.items)) {
      if ($media.thumb -and -not $completedImages.ContainsKey([string]$media.thumb)) { $imageUrls.Add([string]$media.thumb) }
      if ($imageUrls.Count -ge $ImageLimit) { break }
    }
  }

  if ($posterUrls.Count -lt $VideoPosterLimit -and [int]$collection.videoCount -gt 0) {
    $remaining = $VideoPosterLimit - $posterUrls.Count
    $result = Invoke-RestMethod -Uri "$BaseUrl/api/media?collectionId=$collectionId&type=video&limit=$remaining&offset=0" -TimeoutSec 30
    foreach ($media in @($result.items)) {
      if ($media.poster -and -not $completedPosters.ContainsKey([string]$media.poster)) { $posterUrls.Add([string]$media.poster) }
      if ($posterUrls.Count -ge $VideoPosterLimit) { break }
    }
  }
}

Write-RebuildLog "START images=$($imageUrls.Count) posters=$($posterUrls.Count) visitedCollections=$visited"
foreach ($url in $imageUrls) {
  if (Test-PauseRequested) { Write-RebuildLog "PAUSED before image=$url"; Save-RebuildState $state; exit 2 }
  try {
    $response = Invoke-WebRequest -Uri ($BaseUrl + $url) -UseBasicParsing -TimeoutSec 120
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
    $state.completedImages = @($state.completedImages) + $url
    Write-RebuildLog "IMAGE_OK url=$url bytes=$($response.RawContentLength)"
  } catch {
    $state.failed = @($state.failed) + "image|$url|$($_.Exception.Message)"
    Write-RebuildLog "IMAGE_FAILED url=$url error=$($_.Exception.Message)"
  }
  Save-RebuildState $state
}

foreach ($url in $posterUrls) {
  if (Test-PauseRequested) { Write-RebuildLog "PAUSED before poster=$url"; Save-RebuildState $state; exit 2 }
  try {
    $response = Invoke-WebRequest -Uri ($BaseUrl + $url) -UseBasicParsing -TimeoutSec 180
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
    $state.completedPosters = @($state.completedPosters) + $url
    Write-RebuildLog "POSTER_OK url=$url bytes=$($response.RawContentLength)"
  } catch {
    $state.failed = @($state.failed) + "poster|$url|$($_.Exception.Message)"
    Write-RebuildLog "POSTER_FAILED url=$url error=$($_.Exception.Message)"
  }
  Save-RebuildState $state
}

Write-RebuildLog "COMPLETE images=$($imageUrls.Count) posters=$($posterUrls.Count)"
