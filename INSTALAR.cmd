@echo off
setlocal
title Instalar FluentCoach
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\windows\FluentCoach.ps1" -Action Install
if errorlevel 1 pause
