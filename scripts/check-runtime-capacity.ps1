param([string]$RuntimeRoot = "D:\GalleryRuntime")

$ErrorActionPreference = "Stop"
$runtime = (Resolve-Path -LiteralPath $RuntimeRoot).Path

function Measure-PathUsage {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{ Path = $Path; Files = 0; Bytes = 0 }
  }
  $item = Get-Item -LiteralPath $Path
  if (-not $item.PSIsContainer) {
    return [pscustomobject]@{ Path = $Path; Files = 1; Bytes = [int64]$item.Length }
  }
  $measure = Get-ChildItem -LiteralPath $Path -File -Recurse -ErrorAction Stop | Measure-Object Length -Sum
  return [pscustomobject]@{ Path = $Path; Files = [int64]$measure.Count; Bytes = [int64]($measure.Sum) }
}

$items = @(
  Measure-PathUsage (Join-Path $runtime "data\gallery.db")
  Measure-PathUsage (Join-Path $runtime "thumbnails")
  Measure-PathUsage (Join-Path $runtime "video-posters")
  Measure-PathUsage (Join-Path $runtime "hls")
  Measure-PathUsage (Join-Path $runtime "logs")
)

$driveName = [System.IO.Path]::GetPathRoot($runtime).TrimEnd(':\')
$drive = Get-PSDrive -Name $driveName
foreach ($item in $items) {
  [pscustomobject]@{
    Name = if ($item.Path.EndsWith("gallery.db")) { "gallery.db" } else { Split-Path -Leaf $item.Path }
    Files = $item.Files
    Bytes = $item.Bytes
    MiB = [Math]::Round($item.Bytes / 1MB, 2)
  }
}
[pscustomobject]@{
  Name = "runtime-disk-free"
  Files = $null
  Bytes = [int64]$drive.Free
  MiB = [Math]::Round($drive.Free / 1MB, 2)
}
