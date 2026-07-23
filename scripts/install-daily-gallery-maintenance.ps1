param([string]$EnvFile = "D:\GalleryRuntime\config\gallery.env")

$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-DailyMaintenance"
$projectRoot = Split-Path -Parent $PSScriptRoot
$powershellExe = Join-Path $PSHOME "powershell.exe"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$scriptPath = Join-Path $PSScriptRoot "run-daily-gallery-maintenance.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -EnvFile `"$EnvFile`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3:59:50am
$action = New-ScheduledTaskAction -Execute $powershellExe -Argument $arguments -WorkingDirectory $projectRoot
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::FromHours(2))
$definition = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings
Register-ScheduledTask -TaskName $TaskName -InputObject $definition -Force | Out-Null
$verified = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if ($verified.Settings.MultipleInstances -ne "IgnoreNew") { throw "Daily maintenance task verification failed." }
Write-Host "Daily 03:59:50 maintenance task installed: $TaskName" -ForegroundColor Green
