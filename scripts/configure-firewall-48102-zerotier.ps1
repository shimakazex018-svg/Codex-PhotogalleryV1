param(
  [string]$ZeroTierAddress = "192.168.192.1"
)

$ErrorActionPreference = "Stop"
$RuleName = "Codex-PhotogalleryV1-48102-ZeroTier"
$Port = 48102

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-IPv4Subnet {
  param(
    [Parameter(Mandatory = $true)][string]$Address,
    [Parameter(Mandatory = $true)][ValidateRange(1, 32)][int]$PrefixLength
  )

  $ip = [System.Net.IPAddress]::Parse($Address)
  if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw "Only IPv4 addresses are supported: $Address"
  }

  $bytes = $ip.GetAddressBytes()
  $remaining = $PrefixLength
  for ($index = 0; $index -lt $bytes.Length; $index++) {
    $bits = [Math]::Min([Math]::Max($remaining, 0), 8)
    $mask = if ($bits -eq 0) { 0 } else { (0xFF -shl (8 - $bits)) -band 0xFF }
    $bytes[$index] = $bytes[$index] -band $mask
    $remaining -= 8
  }

  return "$([System.Net.IPAddress]::new($bytes).ToString())/$PrefixLength"
}

if (-not (Test-Administrator)) {
  throw "Administrator privileges are required. Run 'Configure ZeroTier Access.cmd' and approve UAC for this firewall-only change."
}

$ip = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ZeroTierAddress -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $ip) {
  throw "The expected ZeroTier IPv4 address is not active on this server: $ZeroTierAddress"
}
if ($ip.AddressState -ne "Preferred") {
  throw "The ZeroTier IPv4 address is not Preferred: $($ip.AddressState)"
}

$adapter = Get-NetAdapter -InterfaceIndex $ip.InterfaceIndex -ErrorAction Stop
if ($adapter.Status -ne "Up") {
  throw "The ZeroTier adapter is not Up: $($adapter.Status)"
}
if ($adapter.InterfaceDescription -notmatch "ZeroTier" -and $adapter.Name -notmatch "ZeroTier") {
  throw "Address $ZeroTierAddress belongs to a non-ZeroTier adapter: $($adapter.Name)"
}

$connectionProfile = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex -ErrorAction Stop |
  Select-Object -First 1
if (-not $connectionProfile) {
  throw "No Windows network profile was found for ZeroTier interface $($ip.InterfaceAlias)."
}

switch ([string]$connectionProfile.NetworkCategory) {
  "Public" { $ruleProfile = "Public" }
  "Private" { $ruleProfile = "Private" }
  "DomainAuthenticated" { $ruleProfile = "Domain" }
  default { throw "Unsupported ZeroTier network category: $($connectionProfile.NetworkCategory)" }
}

$remoteSubnet = Get-IPv4Subnet -Address $ip.IPAddress -PrefixLength $ip.PrefixLength
$existing = @(Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)
$isCorrect = $false

if ($existing.Count -eq 1) {
  $portFilter = $existing[0] | Get-NetFirewallPortFilter
  $addressFilter = $existing[0] | Get-NetFirewallAddressFilter
  $isCorrect =
    $existing[0].Enabled -eq "True" -and
    $existing[0].Direction -eq "Inbound" -and
    $existing[0].Action -eq "Allow" -and
    ([string]$existing[0].Profile).Contains($ruleProfile) -and
    $portFilter.Protocol -eq "TCP" -and
    [string]$portFilter.LocalPort -eq [string]$Port -and
    @($addressFilter.LocalAddress).Count -eq 1 -and
    $addressFilter.LocalAddress -contains $ip.IPAddress -and
    @($addressFilter.RemoteAddress).Count -eq 1 -and
    $addressFilter.RemoteAddress -contains $remoteSubnet
}

if ($isCorrect) {
  Write-Host "ZeroTier firewall rule is already correct; no change was made." -ForegroundColor Yellow
} else {
  if ($existing.Count -gt 0) {
    $existing | Remove-NetFirewallRule
  }

  New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $Port -LocalAddress $ip.IPAddress -RemoteAddress $remoteSubnet `
    -Profile $ruleProfile -Enabled True | Out-Null

  Write-Host $(if ($existing.Count -gt 0) { "ZeroTier firewall rule was safely updated." } else { "ZeroTier firewall rule was created." }) -ForegroundColor Green
}

$final = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction Stop
$finalPort = $final | Get-NetFirewallPortFilter
$finalAddress = $final | Get-NetFirewallAddressFilter

[pscustomobject]@{
  DisplayName = $final.DisplayName
  Enabled = $final.Enabled
  Direction = $final.Direction
  Action = $final.Action
  Profile = $final.Profile
  Protocol = $finalPort.Protocol
  LocalPort = $finalPort.LocalPort
  LocalAddress = $finalAddress.LocalAddress
  RemoteAddress = $finalAddress.RemoteAddress
  InterfaceAlias = $ip.InterfaceAlias
  InterfaceDescription = $adapter.InterfaceDescription
  AdapterStatus = $adapter.Status
  AddressState = $ip.AddressState
  PrefixLength = $ip.PrefixLength
  NetworkCategory = $connectionProfile.NetworkCategory
}
