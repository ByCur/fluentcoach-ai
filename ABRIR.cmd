@echo off
setlocal
title Abrir FluentCoach
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\windows\FluentCoach.ps1" -Action Open
if errorlevel 1 pause
