@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Update-Game.ps1" %*
set "updateResult=%errorlevel%"
if "%~1"=="" pause
exit /b %updateResult%
