@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "STATUS_SCRIPT=%PROJECT_ROOT%scripts\status-gallery.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%STATUS_SCRIPT%" -RuntimeRoot "D:\GalleryRuntime" -Port 48102
set "RESULT=%ERRORLEVEL%"
echo.
echo Local URL: http://127.0.0.1:48102/
if /I "%~1"=="--no-pause" exit /b %RESULT%
pause
exit /b %RESULT%
