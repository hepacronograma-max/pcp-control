@echo off
REM Fecha o PCP Control (para o servidor Next.js na porta 3100)
echo Encerrando PCP Control...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
for /f "tokens=4" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
echo Pronto. PCP Control encerrado.
pause
