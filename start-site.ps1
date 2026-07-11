Set-Location $PSScriptRoot
if (-not $env:ALLOW_REMOTE_DELETE) {
  $env:ALLOW_REMOTE_DELETE = "0"
}
& node ".\server.js"
