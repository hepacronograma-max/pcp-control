@echo off
REM Fecha o PCP Control como Administrador (use se o Fechar normal não funcionar)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Solicitando permissao de administrador...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
cd /d "%~dp0"
echo Encerrando PCP Control (como Admin)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
for /f "tokens=4" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
echo Pronto.
pause
