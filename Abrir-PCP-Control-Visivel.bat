@echo off
REM Abre o PCP Control com CMD visível - você vê o servidor e pode fechar com Ctrl+C
cd /d "%~dp0"
if exist ".next\dev\lock" del ".next\dev\lock"
echo Iniciando PCP Control na porta 3100...
echo Para fechar: pressione Ctrl+C nesta janela
echo.
npm run dev -- --turbopack -p 3100 -H 0.0.0.0
pause
