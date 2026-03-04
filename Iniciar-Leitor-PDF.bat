@echo off
REM Inicia o servidor local de leitura de PDFs (TOTVS) em segundo plano

cd /d "%~dp0"

start "Leitor PDF PCP" /min cmd /k "cd /d \"%~dp0\" & node local-pdf-server.js"

exit /b 0

