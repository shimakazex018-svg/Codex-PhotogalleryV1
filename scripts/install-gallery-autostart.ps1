param([string]$EnvFile = "D:\GalleryRuntime\config\gallery.env")

$ErrorActionPreference = "Stop"
$TaskName = "Codex-PhotogalleryV1-Autostart"
$projectRoot = Split-Path -Parent $PSScriptRoot
$hostScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "run-gallery-host.ps1"))
$powershellExe = Join-Path $PSHOME "powershell.exe"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$currentUserShort = ($currentUser -split '\\')[-1]
$acceptedUserIds = @($currentUser, $currentUserShort)
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$hostScript`" -EnvFile `"$EnvFile`""

if (-not (Test-Path -LiteralPath $hostScript -PathType Leaf)) { throw "Host script not found: $hostScript" }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw "Runtime env file not found: $EnvFile" }

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$trigger.Delay = "PT30S"
$action = New-ScheduledTaskAction -Execute $powershellExe -Argument $arguments -WorkingDirectory $projectRoot
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
$definition = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$isCorrect = $false
if ($existing) {
  $existingAction = @($existing.Actions)[0]
  $existingTrigger = @($existing.Triggers)[0]
  $isCorrect =
    $existingAction.Execute -eq $powershellExe -and
    $existingAction.Arguments -eq $arguments -and
    $existingAction.WorkingDirectory -eq $projectRoot -and
    $existingTrigger.Delay -eq "PT30S" -and
    $existingTrigger.UserId -in $acceptedUserIds -and
    $existing.Principal.UserId -in $acceptedUserIds -and
    $existing.Settings.MultipleInstances -eq "IgnoreNew" -and
    $existing.Settings.ExecutionTimeLimit -eq "PT0S"
}

if ($isCorrect) {
  Write-Host "Autostart task is already installed and correct." -ForegroundColor Yellow
} else {
  try {
    Register-ScheduledTask -TaskName $TaskName -InputObject $definition -Force | Out-Null
  } catch [System.UnauthorizedAccessException] {
    throw "Permission denied while creating the current-user task. Run Install Autostart.cmd as administrator only if Windows requires it."
  }
  Write-Host $(if ($existing) { "Autostart task was safely updated." } else { "Autostart task was installed." }) -ForegroundColor Green
}

$verified = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$verifiedAction = @($verified.Actions)[0]
$verifiedTrigger = @($verified.Triggers)[0]
if ($verifiedAction.Execute -ne $powershellExe -or
    $verifiedAction.Arguments -ne $arguments -or
    $verifiedAction.WorkingDirectory -ne $projectRoot -or
    $verifiedTrigger.Delay -ne "PT30S" -or
    $verifiedTrigger.UserId -notin $acceptedUserIds -or
    $verified.Principal.UserId -notin $acceptedUserIds -or
    $verified.Settings.ExecutionTimeLimit -ne "PT0S") {
  throw "Autostart task verification failed."
}

[pscustomobject]@{
  TaskName = $verified.TaskName
  State = $verified.State
  User = $verified.Principal.UserId
  Delay = $verifiedTrigger.Delay
  Execute = $verifiedAction.Execute
  Arguments = $verifiedAction.Arguments
  WorkingDirectory = $verifiedAction.WorkingDirectory
  MultipleInstances = $verified.Settings.MultipleInstances
  ExecutionTimeLimit = $verified.Settings.ExecutionTimeLimit
}
Write-Host "Uninstall with: Uninstall Autostart.cmd"
