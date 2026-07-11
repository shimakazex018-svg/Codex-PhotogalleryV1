# Run explicitly from an elevated PowerShell session. The gallery launcher never invokes this script.
$ErrorActionPreference = "Stop"
$ruleName = "Codex Photogallery V1 TCP 48102"
$port = 48102

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Administrator privileges are required to configure Windows Firewall."
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule already exists: $ruleName" -ForegroundColor Yellow
  exit 0
}
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $port -Profile Private | Out-Null
Write-Host "Firewall rule created for private networks: $ruleName" -ForegroundColor Green
