param(
  [string]$LanAddress = "192.168.31.153",
  [string]$LanSubnet = "192.168.31.0/24"
)

$ErrorActionPreference = "Stop"
$RuleName = "Codex-PhotogalleryV1-48102-LAN"
$LegacyRuleName = "Codex Photogallery V1 TCP 48102"
$Port = 48102

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Administrator privileges are required. Use Configure LAN Access.cmd to request UAC only for this firewall change."
}

$ip = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ip) { throw "LAN address is not active on this server: $LanAddress" }
$profile = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex -ErrorAction Stop | Select-Object -First 1
if (-not $profile) { throw "No Windows network profile was found for interface $($ip.InterfaceAlias)." }

if ($profile.NetworkCategory -eq "Private") {
  $ruleProfile = "Private"
  $remoteAddress = "LocalSubnet"
} elseif ($profile.NetworkCategory -eq "Public") {
  $ruleProfile = "Public"
  $remoteAddress = $LanSubnet
} else {
  throw "Unsupported LAN network category: $($profile.NetworkCategory). Refusing to create a broad rule."
}

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
$isCorrect = $false
if ($existing) {
  $portFilter = $existing | Get-NetFirewallPortFilter
  $addressFilter = $existing | Get-NetFirewallAddressFilter
  $isCorrect =
    $existing.Enabled -eq "True" -and
    $existing.Direction -eq "Inbound" -and
    $existing.Action -eq "Allow" -and
    ([string]$existing.Profile).Contains($ruleProfile) -and
    $portFilter.Protocol -eq "TCP" -and
    [string]$portFilter.LocalPort -eq [string]$Port -and
    $addressFilter.LocalAddress -contains $LanAddress -and
    $addressFilter.RemoteAddress -contains $remoteAddress
}

if (-not $isCorrect) {
  if ($existing) { Remove-NetFirewallRule -DisplayName $RuleName }
  New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $Port -LocalAddress $LanAddress -RemoteAddress $remoteAddress `
    -Profile $ruleProfile -Enabled True | Out-Null
  Write-Host $(if ($existing) { "LAN firewall rule was safely updated." } else { "LAN firewall rule was created." }) -ForegroundColor Green
} else {
  Write-Host "LAN firewall rule is already correct." -ForegroundColor Yellow
}

$legacy = Get-NetFirewallRule -DisplayName $LegacyRuleName -ErrorAction SilentlyContinue
if ($legacy) {
  Remove-NetFirewallRule -DisplayName $LegacyRuleName
  Write-Host "Removed superseded legacy 48102 rule." -ForegroundColor Yellow
}

$final = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction Stop
$finalPort = $final | Get-NetFirewallPortFilter
$finalAddress = $final | Get-NetFirewallAddressFilter
[pscustomobject]@{
  RuleName = $final.DisplayName
  Enabled = $final.Enabled
  Direction = $final.Direction
  Action = $final.Action
  Profile = $final.Profile
  Protocol = $finalPort.Protocol
  LocalPort = $finalPort.LocalPort
  LocalAddress = $finalAddress.LocalAddress
  RemoteAddress = $finalAddress.RemoteAddress
  Interface = $ip.InterfaceAlias
  NetworkCategory = $profile.NetworkCategory
}
