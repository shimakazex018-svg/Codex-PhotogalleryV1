param([string]$PreviewDir = "D:\GalleryRuntime\image-previews")

$ErrorActionPreference = "Stop"
$files = if (Test-Path -LiteralPath $PreviewDir) {
  @(Get-ChildItem -LiteralPath $PreviewDir -File -Filter "*.webp" -ErrorAction Stop)
} else {
  @()
}
$bytes = [int64]0
foreach ($file in $files) {
  $bytes += [int64]$file.Length
}

[pscustomobject]@{
  Path = $PreviewDir
  Files = $files.Count
  Bytes = $bytes
  MiB = [Math]::Round($bytes / 1MB, 2)
}
