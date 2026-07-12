@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "UNINSTALL_SCRIPT=%PROJECT_ROOT%scripts\uninstall-gallery-autostart.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALL_SCRIPT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Uninstall failed. No project or Runtime files were removed.
if /I "%~1"=="--no-pause" exit /b %RESULT%
pause
exit /b %RESULT%
