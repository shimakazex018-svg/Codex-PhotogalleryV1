@echo off
cd /d "%~dp0"

set "PORT=48101"
set "HOST=0.0.0.0"

rem Set PHOTOS_DIR before running this script when media is stored elsewhere.
if not defined PHOTOS_DIR set "PHOTOS_DIR=%~dp0photos"
set "DATA_DIR=%~dp0data"
if not defined FFMPEG_PATH set "FFMPEG_PATH=ffmpeg"
if not defined ALLOW_REMOTE_DELETE set "ALLOW_REMOTE_DELETE=0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js on the server first.
  pause
  exit /b 1
)

echo Photo gallery site is starting...
echo URL: http://localhost:%PORT%
echo LAN/ZeroTier URL: http://SERVER-IP:%PORT%
echo PORT: %PORT%
echo HOST: %HOST%
echo PHOTOS_DIR: %PHOTOS_DIR%
echo FFMPEG_PATH: %FFMPEG_PATH%
echo ALLOW_REMOTE_DELETE: %ALLOW_REMOTE_DELETE%
echo.
netsh advfirewall firewall show rule name="Photo Gallery Site TCP 48101" >nul 2>nul
if errorlevel 1 (
  echo [WARN] Firewall rule for TCP %PORT% was not found.
  echo [WARN] If other devices cannot open the website, run fix-network-access-48101.cmd as administrator.
  echo.
)
echo Keep this window open. Closing it stops the website.
node server.js
pause
