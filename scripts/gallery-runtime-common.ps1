$ErrorActionPreference = "Stop"

function Read-GalleryEnvironment {
  param([Parameter(Mandatory)][string]$EnvFile)

  $resolvedEnv = (Resolve-Path -LiteralPath $EnvFile).Path
  $allowedKeys = @(
    "PORT", "DATA_DIR", "PHOTOS_DIR", "THUMBNAIL_DIR", "POSTER_DIR",
    "HLS_DIR", "TRASH_DIR", "FFMPEG_PATH", "FFPROBE_PATH", "ALLOW_REMOTE_DELETE",
    "ENABLE_IMAGE_THUMBNAIL_GENERATION", "HLS_CACHE_EXPIRE_DAYS"
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
  if ($Config.ENABLE_IMAGE_THUMBNAIL_GENERATION -notin @("0", "false")) {
    throw "V1.4.5 requires ENABLE_IMAGE_THUMBNAIL_GENERATION=0."
  }
  $hlsExpireDays = 0
  if (-not [int]::TryParse($Config.HLS_CACHE_EXPIRE_DAYS, [ref]$hlsExpireDays) -or $hlsExpireDays -lt 1) {
    throw "HLS_CACHE_EXPIRE_DAYS must be a positive integer."
  }

  $project = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
  $pathKeys = @("DATA_DIR", "PHOTOS_DIR", "THUMBNAIL_DIR", "POSTER_DIR", "HLS_DIR", "TRASH_DIR")
  foreach ($key in $pathKeys) {
    $resolved = (Resolve-Path -LiteralPath $Config[$key]).Path.TrimEnd('\')
    if ($key -eq "DATA_DIR" -and $resolved.StartsWith($project, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "DATA_DIR must be outside the Git project."
    }
  }

  foreach ($key in @("DATA_DIR", "PHOTOS_DIR", "THUMBNAIL_DIR", "POSTER_DIR", "HLS_DIR", "TRASH_DIR")) {
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
  $env:ENABLE_IMAGE_THUMBNAIL_GENERATION = $Config.ENABLE_IMAGE_THUMBNAIL_GENERATION
  $env:HLS_CACHE_EXPIRE_DAYS = $Config.HLS_CACHE_EXPIRE_DAYS
}
