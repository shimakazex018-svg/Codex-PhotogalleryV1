@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "FIREWALL_SCRIPT=%PROJECT_ROOT%scripts\configure-firewall-48102-zerotier.ps1"

net session >nul 2>&1
if "%ERRORLEVEL%"=="0" goto :elevated

echo Requesting administrator permission for the ZeroTier-only TCP 48102 firewall rule...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%FIREWALL_SCRIPT%""'; exit $p.ExitCode"
set "RESULT=%ERRORLEVEL%"
goto :done

:elevated
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FIREWALL_SCRIPT%"
set "RESULT=%ERRORLEVEL%"

:done
if not "%RESULT%"=="0" echo ZeroTier firewall configuration failed. Exit code: %RESULT%
if /I "%~1"=="--no-pause" exit /b %RESULT%
pause
exit /b %RESULT%
