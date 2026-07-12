@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "START_SCRIPT=%PROJECT_ROOT%scripts\start-gallery.ps1"
set "STATUS_SCRIPT=%PROJECT_ROOT%scripts\status-gallery.ps1"
set "URL=http://127.0.0.1:48102/"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%START_SCRIPT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" goto :failed

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%STATUS_SCRIPT%"
if /I "%~1"=="--no-browser" goto :success
start "" "%URL%"

:success
echo.
echo Gallery URL: %URL%
if /I "%~1"=="--no-pause" exit /b 0
timeout /t 2 /nobreak >nul
exit /b 0

:failed
echo.
echo Gallery failed to start. Exit code: %RESULT%
echo stdout: D:\GalleryRuntime\logs\gallery.stdout.log
echo stderr: D:\GalleryRuntime\logs\gallery.stderr.log
pause
exit /b %RESULT%
