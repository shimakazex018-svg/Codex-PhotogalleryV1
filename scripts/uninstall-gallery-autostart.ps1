$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-Autostart"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Autostart task is not installed."
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  throw "Autostart task still exists after uninstall."
}
Write-Host "Autostart task was removed. The running website was not stopped." -ForegroundColor Green
