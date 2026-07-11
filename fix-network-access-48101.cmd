@echo off
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0fix-network-access-48101.ps1""'"

