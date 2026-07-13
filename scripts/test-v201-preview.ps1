param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$FfmpegPath,
  [int]$Port = 49201
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http
$projectRoot = Split-Path $PSScriptRoot -Parent
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $tempBase ("codex-gallery-v201-" + [guid]::NewGuid().ToString("N"))
$photos = Join-Path $testRoot "photos"
$data = Join-Path $testRoot "data"
$previews = Join-Path $testRoot "image-previews"
$process = $null

try {
  New-Item -ItemType Directory -Force -Path $photos, $data, $previews | Out-Null
  & $FfmpegPath -loglevel error -f lavfi -i "color=c=blue:s=1600x1200" -frames:v 1 (Join-Path $photos "sample.jpg")
  if ($LASTEXITCODE -ne 0) { throw "Failed to generate isolated sample image" }
  Set-Content -LiteralPath (Join-Path $photos "broken.jpg") -Value "not an image" -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $photos "note.txt") -Value "not an image" -Encoding ASCII

  Push-Location $projectRoot
  $seed = "const db=require('./gallery-db');const f=process.argv[1];db.indexGallery(f,{collections:Array.from({length:60},(_,i)=>({id:'root-'+i,title:'Root '+i,folder:'root-'+i,children:[],images:[],videos:[]}))});"
  & $NodePath -e $seed (Join-Path $data "gallery.db")
  if ($LASTEXITCODE -ne 0) { throw "Failed to seed isolated SQLite" }

  $env:PORT = [string]$Port
  $env:HOST = "127.0.0.1"
  $env:PHOTOS_DIR = $photos
  $env:DATA_DIR = $data
  $env:IMAGE_PREVIEW_DIR = $previews
  $env:ENABLE_IMAGE_PREVIEW_GENERATION = "1"
  $env:IMAGE_PREVIEW_MAX_EDGE = "768"
  $env:IMAGE_PREVIEW_QUALITY = "78"
  $env:FFMPEG_PATH = $FfmpegPath
  $env:ALLOW_REMOTE_DELETE = "0"
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $NodePath
  $startInfo.Arguments = "server.js"
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Failed to start isolated server" }

  $baseUrl = "http://127.0.0.1:$Port"
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try { Invoke-WebRequest "$baseUrl/api/config" -UseBasicParsing | Out-Null; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw "Isolated server did not become ready" }

  $client = [System.Net.Http.HttpClient]::new()
  $validUrl = "$baseUrl/api/image-preview?url=%2Fphotos%2Fsample.jpg&size=768"
  $tasks = 1..8 | ForEach-Object { $client.GetAsync($validUrl) }
  [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]$tasks)
  if (@($tasks | Where-Object { -not $_.Result.IsSuccessStatusCode }).Count) { throw "Concurrent preview request failed" }
  $firstCount = @(Get-ChildItem -LiteralPath $previews -File -Filter "*.webp").Count
  if ($firstCount -ne 1) { throw "Concurrent preview generation was not deduplicated: $firstCount files" }

  $client.GetAsync($validUrl).GetAwaiter().GetResult().EnsureSuccessStatusCode() | Out-Null
  if (@(Get-ChildItem -LiteralPath $previews -File -Filter "*.webp").Count -ne 1) { throw "Cache hit generated another file" }

  (Get-Item -LiteralPath (Join-Path $photos "sample.jpg")).LastWriteTime = (Get-Date).AddSeconds(2)
  $client.GetAsync($validUrl).GetAwaiter().GetResult().EnsureSuccessStatusCode() | Out-Null
  if (@(Get-ChildItem -LiteralPath $previews -File -Filter "*.webp").Count -ne 2) { throw "mtime change did not create a new cache key" }

  $badPath = $client.GetAsync("$baseUrl/api/image-preview?url=%2Fphotos%2F..%2Foutside.jpg").GetAwaiter().GetResult()
  $notImage = $client.GetAsync("$baseUrl/api/image-preview?url=%2Fphotos%2Fnote.txt").GetAwaiter().GetResult()
  $missing = $client.GetAsync("$baseUrl/api/image-preview?url=%2Fphotos%2Fmissing.jpg").GetAwaiter().GetResult()
  $broken = $client.GetAsync("$baseUrl/api/image-preview?url=%2Fphotos%2Fbroken.jpg").GetAwaiter().GetResult()
  if ([int]$badPath.StatusCode -ne 400 -or [int]$notImage.StatusCode -ne 400 -or [int]$missing.StatusCode -ne 400 -or [int]$broken.StatusCode -ne 503) { throw "Preview error status validation failed" }
  if ($process.HasExited) { throw "Server exited after preview failure" }

  $root = Invoke-RestMethod "$baseUrl/api/collections/root?limit=40"
  if (@($root.items).Count -ne 40) { throw "Root collection limit failed" }
  $cache = & (Join-Path $PSScriptRoot "check-image-preview-cache.ps1") -PreviewDir $previews
  [pscustomobject]@{ Result = "pass"; PreviewFiles = $cache.Files; PreviewBytes = $cache.Bytes; RootItems = @($root.items).Count }
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; $process.WaitForExit(5000) | Out-Null }
  $resolved = [System.IO.Path]::GetFullPath($testRoot)
  if ($resolved.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
