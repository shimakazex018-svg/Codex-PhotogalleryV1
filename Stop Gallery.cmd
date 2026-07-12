@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "STOP_SCRIPT=%PROJECT_ROOT%scripts\stop-gallery.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%STOP_SCRIPT%"
set "RESULT=%ERRORLEVEL%"
if "%RESULT%"=="0" goto :success

echo.
echo Gallery stop failed. Exit code: %RESULT%
pause
exit /b %RESULT%

:success
if /I "%~1"=="--no-pause" exit /b 0
timeout /t 2 /nobreak >nul
exit /b 0
