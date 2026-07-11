$ErrorActionPreference = "Stop"

$ruleName = "Photo Gallery Site TCP 48101"
$port = 48101

Write-Host "Checking Photo Gallery network access..." -ForegroundColor Cyan

$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule) {
  Remove-NetFirewallRule -DisplayName $ruleName
}
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any | Out-Null
Write-Host "Firewall rule ready: $ruleName" -ForegroundColor Green

$zeroTierProfiles = Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -like "ZeroTier One*" }
foreach ($profile in $zeroTierProfiles) {
  if ($profile.NetworkCategory -ne "Private") {
    Set-NetConnectionProfile -InterfaceIndex $profile.InterfaceIndex -NetworkCategory Private
    Write-Host "ZeroTier profile set to Private: $($profile.InterfaceAlias)" -ForegroundColor Green
  } else {
    Write-Host "ZeroTier profile already Private: $($profile.InterfaceAlias)" -ForegroundColor Green
  }
}

$addresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" }
Write-Host ""
Write-Host "Current server addresses:" -ForegroundColor Cyan
foreach ($address in $addresses) {
  Write-Host ("  http://{0}:{1}/  ({2})" -f $address.IPAddress, $port, $address.InterfaceAlias)
}

Write-Host ""
Write-Host "Done. Press any key to close."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
