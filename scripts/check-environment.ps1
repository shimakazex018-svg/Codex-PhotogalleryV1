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
  Write-Host "[OK] V1.4.2 runtime environment is ready." -ForegroundColor Green
  Write-Host "[OK] Port: 48102"
  Write-Host "[OK] Node: $($result.NodeVersion)"
  Write-Host "[OK] Database: present"
  Write-Host "[OK] Media directory: present"
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
