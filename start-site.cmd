@echo off
cd /d "%~dp0"
if not defined ALLOW_REMOTE_DELETE set "ALLOW_REMOTE_DELETE=0"
node server.js
pause
