@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Enable-Local-Isolation.ps1"
if errorlevel 1 pause
