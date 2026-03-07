Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Pasta do projeto
appDir = FSO.GetParentFolderName(WScript.ScriptFullName) & "\"

' Remove lock antigo
lockPath = appDir & ".next\dev\lock"
If FSO.FileExists(lockPath) Then FSO.DeleteFile lockPath, True

' Inicia o servidor Next em janela oculta (0 = oculto)
' -H 0.0.0.0 permite acesso de outras máquinas na rede
WshShell.Run "cmd /c cd /d """ & appDir & """ && npm run dev -- --turbopack -p 3100 -H 0.0.0.0", 0, False

' Aguarda o servidor subir (mais tempo após reiniciar o PC)
WScript.Sleep 12000

' Abre o navegador - login automático em localhost (define cookie e vai para o dashboard)
WshShell.Run "http://localhost:3100/entrar", 1
