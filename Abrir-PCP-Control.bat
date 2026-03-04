@echo off
REM Atalho para abrir o PCP Control (sem janela CMD visível)
cd /d "%~dp0"
start "" wscript.exe "%~dp0Abrir-PCP-Control.vbs"
