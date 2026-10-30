@echo off
setlocal
title Cerrar FluentCoach
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\windows\FluentCoach.ps1" -Action Stop
if errorlevel 1 pause
