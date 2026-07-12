param([string]$RuntimeRoot = "D:\GalleryRuntime")

$ErrorActionPreference = "Stop"
$stopFile = Join-Path $RuntimeRoot "logs\cache-rebuild.stop"
Set-Content -LiteralPath $stopFile -Value (Get-Date -Format o) -Encoding ascii
Write-Host "Cache rebuild pause requested: $stopFile" -ForegroundColor Yellow
