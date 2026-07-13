param(
  [string]$EnvFile = "D:\GalleryRuntime\config\gallery.env",
  [string]$NodePath
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "gallery-runtime-common.ps1")

try {
  $config = Read-GalleryEnvironment -EnvFile $EnvFile
  $result = Test-GalleryEnvironment -Config $config -ProjectRoot $projectRoot -NodePath $NodePath
  Write-Host "[OK] Gallery runtime environment is ready." -ForegroundColor Green
  Write-Host "[OK] Port: 48102"
  Write-Host "[OK] Node: $($result.NodeVersion)"
  Write-Host "[OK] Database: present"
  Write-Host "[OK] Media directory: present"
  Write-Host "[OK] FFmpeg: present"
  Write-Host "[OK] FFprobe: present"
  Write-Host "[OK] Image thumbnail generation: disabled"
  Write-Host "[OK] Image previews: enabled, $($config.IMAGE_PREVIEW_MAX_EDGE)px WebP quality $($config.IMAGE_PREVIEW_QUALITY)"
  Write-Host "[OK] HLS expiry policy: $($config.HLS_CACHE_EXPIRE_DAYS) days (not automatically deleting)"
  $runtimeRoot = Split-Path -Parent $config.DATA_DIR
  $drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($runtimeRoot).TrimEnd(':\'))
  Write-Host ("[OK] Runtime disk free: {0:N2} GiB" -f ($drive.Free / 1GB))
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
