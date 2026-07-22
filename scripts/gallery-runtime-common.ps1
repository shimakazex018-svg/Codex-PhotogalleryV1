$ErrorActionPreference = "Stop"

function Read-GalleryEnvironment {
  param([Parameter(Mandatory)][string]$EnvFile)

  $resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
  $allowedKeys = @(
    "PORT", "DATA_DIR", "PHOTOS_DIR", "THUMBNAIL_DIR", "POSTER_DIR",
    "HLS_DIR", "TRASH_DIR", "FFMPEG_PATH", "FFPROBE_PATH", "ALLOW_REMOTE_DELETE",
    "REMOTE_ADMIN_ENABLED", "REMOTE_ADMIN_CIDRS", "REMOTE_ADMIN_ORIGINS",
    "DAILY_INDEX_SCAN_ENABLED", "DAILY_INDEX_SCAN_HOUR", "DAILY_INDEX_SCAN_MINUTE",
    "ENABLE_IMAGE_THUMBNAIL_GENERATION", "ENABLE_IMAGE_PREVIEW_GENERATION",
    "IMAGE_PREVIEW_DIR", "IMAGE_PREVIEW_MAX_EDGE", "IMAGE_PREVIEW_QUALITY", "HLS_CACHE_EXPIRE_DAYS",
    "SEARCH_BACKEND_MODE"
  )
  $values = @{}

  foreach ($line in [System.IO.File]::ReadAllLines($resolvedEnv)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { throw "Invalid gallery.env line: $line" }
    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    if ($key -notin $allowedKeys) { throw "Unsupported gallery.env key: $key" }
    if ($values.ContainsKey($key)) { throw "Duplicate gallery.env key: $key" }
    if (-not $value) { throw "Empty gallery.env value: $key" }
    $values[$key] = $value
  }

  foreach ($key in $allowedKeys) {
    if (-not $values.ContainsKey($key)) { throw "Missing gallery.env key: $key" }
  }
  return $values
}

function Resolve-GalleryNode {
  param([string]$NodePath)

  if ($NodePath) {
    return (Resolve-Path -LiteralPath $NodePath).Path
  }
  if ($env:NODE_EXE) {
    return (Resolve-Path -LiteralPath $env:NODE_EXE).Path
  }
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $wingetRoot -PathType Container) {
    $candidate = Get-ChildItem -LiteralPath $wingetRoot -Directory -Filter "OpenJS.NodeJS.LTS_*" -ErrorAction SilentlyContinue |
      ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -File -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }
  throw "Node.js not found. Pass -NodePath or set NODE_EXE for the launcher process."
}

function Test-GalleryEnvironment {
  param(
    [Parameter(Mandatory)][hashtable]$Config,
    [Parameter(Mandatory)][string]$ProjectRoot,
    [string]$NodePath
  )

  if ($Config.PORT -ne "48102") { throw "V1.4.2 requires PORT=48102." }
  if ($Config.ALLOW_REMOTE_DELETE -notin @("0", "false")) {
    throw "V1.4.2 requires ALLOW_REMOTE_DELETE=0."
  }
  if ($Config.REMOTE_ADMIN_ENABLED -notin @("1", "true")) { throw "v96 requires REMOTE_ADMIN_ENABLED=1." }
  if (-not $Config.REMOTE_ADMIN_CIDRS.Contains("lan:") -or -not $Config.REMOTE_ADMIN_CIDRS.Contains("zerotier:")) { throw "REMOTE_ADMIN_CIDRS must label LAN and ZeroTier CIDRs." }
  if ($Config.DAILY_INDEX_SCAN_ENABLED -notin @("1", "true") -or $Config.DAILY_INDEX_SCAN_HOUR -ne "4" -or $Config.DAILY_INDEX_SCAN_MINUTE -ne "0") { throw "v96 requires the daily index scan at 04:00." }
  if ($Config.ENABLE_IMAGE_THUMBNAIL_GENERATION -notin @("0", "false")) {
    throw "V1.4.5 requires ENABLE_IMAGE_THUMBNAIL_GENERATION=0."
  }
  if ($Config.ENABLE_IMAGE_PREVIEW_GENERATION -notin @("1", "true")) {
    throw "V2.0.1 requires ENABLE_IMAGE_PREVIEW_GENERATION=1."
  }
  if ($Config.SEARCH_BACKEND_MODE -notin @("auto", "fts5", "legacy-like")) {
    throw "SEARCH_BACKEND_MODE must be auto, fts5, or legacy-like."
  }
  $previewMaxEdge = 0
  $previewQuality = 0
  if (-not [int]::TryParse($Config.IMAGE_PREVIEW_MAX_EDGE, [ref]$previewMaxEdge) -or $previewMaxEdge -lt 320 -or $previewMaxEdge -gt 1600) {
    throw "IMAGE_PREVIEW_MAX_EDGE must be between 320 and 1600."
  }
  if (-not [int]::TryParse($Config.IMAGE_PREVIEW_QUALITY, [ref]$previewQuality) -or $previewQuality -lt 40 -or $previewQuality -gt 95) {
    throw "IMAGE_PREVIEW_QUALITY must be between 40 and 95."
  }
  $hlsExpireDays = 0
  if (-not [int]::TryParse($Config.HLS_CACHE_EXPIRE_DAYS, [ref]$hlsExpireDays) -or $hlsExpireDays -lt 1) {
    throw "HLS_CACHE_EXPIRE_DAYS must be a positive integer."
  }

  $project = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
  $pathKeys = @("DATA_DIR", "PHOTOS_DIR", "THUMBNAIL_DIR", "POSTER_DIR", "HLS_DIR", "TRASH_DIR", "IMAGE_PREVIEW_DIR")
  foreach ($key in $pathKeys) {
    $resolved = (Resolve-Path -LiteralPath $Config[$key]).Path.TrimEnd('\')
    if ($key -eq "DATA_DIR" -and $resolved.StartsWith($project, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "DATA_DIR must be outside the Git project."
    }
  }

  foreach ($key in @("DATA_DIR", "PHOTOS_DIR", "THUMBNAIL_DIR", "POSTER_DIR", "HLS_DIR", "TRASH_DIR", "IMAGE_PREVIEW_DIR")) {
    if (-not (Test-Path -LiteralPath $Config[$key] -PathType Container)) {
      throw "$key directory does not exist."
    }
  }
  foreach ($key in @("FFMPEG_PATH", "FFPROBE_PATH")) {
    if (-not (Test-Path -LiteralPath $Config[$key] -PathType Leaf)) {
      throw "$key executable does not exist."
    }
  }
  $database = Join-Path $Config.DATA_DIR "gallery.db"
  if (-not (Test-Path -LiteralPath $database -PathType Leaf)) {
    throw "Runtime database does not exist."
  }
  $portClient = [System.Net.Sockets.TcpClient]::new()
  try {
    $portConnection = $portClient.ConnectAsync("127.0.0.1", 48102)
    if ($portConnection.Wait(1000) -and $portClient.Connected) {
      throw "Port 48102 is already in use."
    }
  } finally {
    $portClient.Dispose()
  }

  $node = Resolve-GalleryNode -NodePath $NodePath
  $version = (& $node --version).Trim()
  & $node -e "require('node:sqlite')" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Configured Node.js does not provide node:sqlite." }

  return [pscustomobject]@{ NodePath = $node; NodeVersion = $version; Database = $database }
}

function Set-GalleryProcessEnvironment {
  param([Parameter(Mandatory)][hashtable]$Config)

  $env:PORT = $Config.PORT
  $env:DATA_DIR = $Config.DATA_DIR
  $env:PHOTOS_DIR = $Config.PHOTOS_DIR
  $env:THUMBNAILS_DIR = $Config.POSTER_DIR
  $env:HLS_DIR = $Config.HLS_DIR
  $env:TRASH_DIR = $Config.TRASH_DIR
  $env:FFMPEG_PATH = $Config.FFMPEG_PATH
  $env:FFPROBE_PATH = $Config.FFPROBE_PATH
  $env:ALLOW_REMOTE_DELETE = $Config.ALLOW_REMOTE_DELETE
  $env:REMOTE_ADMIN_ENABLED = $Config.REMOTE_ADMIN_ENABLED
  $env:REMOTE_ADMIN_CIDRS = $Config.REMOTE_ADMIN_CIDRS
  $env:REMOTE_ADMIN_ORIGINS = $Config.REMOTE_ADMIN_ORIGINS
  $env:DAILY_INDEX_SCAN_ENABLED = $Config.DAILY_INDEX_SCAN_ENABLED
  $env:DAILY_INDEX_SCAN_HOUR = $Config.DAILY_INDEX_SCAN_HOUR
  $env:DAILY_INDEX_SCAN_MINUTE = $Config.DAILY_INDEX_SCAN_MINUTE
  $env:ENABLE_IMAGE_THUMBNAIL_GENERATION = $Config.ENABLE_IMAGE_THUMBNAIL_GENERATION
  $env:ENABLE_IMAGE_PREVIEW_GENERATION = $Config.ENABLE_IMAGE_PREVIEW_GENERATION
  $env:IMAGE_PREVIEW_DIR = $Config.IMAGE_PREVIEW_DIR
  $env:IMAGE_PREVIEW_MAX_EDGE = $Config.IMAGE_PREVIEW_MAX_EDGE
  $env:IMAGE_PREVIEW_QUALITY = $Config.IMAGE_PREVIEW_QUALITY
  $env:HLS_CACHE_EXPIRE_DAYS = $Config.HLS_CACHE_EXPIRE_DAYS
  $env:SEARCH_BACKEND_MODE = $Config.SEARCH_BACKEND_MODE
}
