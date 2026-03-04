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

' Aguarda o servidor subir
WScript.Sleep 8000

' Abre o navegador
WshShell.Run "http://localhost:3100/dashboard", 1
