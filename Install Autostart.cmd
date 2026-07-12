@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "INSTALL_SCRIPT=%PROJECT_ROOT%scripts\install-gallery-autostart.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Installation failed. If Windows reported permission denied, run this file as administrator.
if /I "%~1"=="--no-pause" exit /b %RESULT%
pause
exit /b %RESULT%
