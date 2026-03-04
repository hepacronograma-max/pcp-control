' Cria atalho do PCP Control na Área de Trabalho
' O atalho aponta para o IP desta máquina na rede local

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Obtém o IP local (primeira interface que não seja loopback)
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colItems = objWMIService.ExecQuery("SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = True")

ipAddr = ""
For Each objItem in colItems
    If Not IsNull(objItem.IPAddress) Then
        For Each strAddress in objItem.IPAddress
            If Left(strAddress, 3) <> "127" Then
                ipAddr = strAddress
                Exit For
            End If
        Next
        If ipAddr <> "" Then Exit For
    End If
Next

If ipAddr = "" Then
    ipAddr = "localhost"
    MsgBox "Não foi possível detectar o IP. O atalho usará localhost." & vbCrLf & vbCrLf & "Para acesso na rede, verifique o IP manualmente (ipconfig) e edite o atalho.", 48, "PCP Control"
End If

url = "http://" & ipAddr & ":3100/dashboard"
desktopPath = WshShell.SpecialFolders("Desktop")
shortcutPath = desktopPath & "\PCP Control.url"

' Cria arquivo .url (atalho de internet)
Set file = FSO.CreateTextFile(shortcutPath, True)
file.WriteLine "[InternetShortcut]"
file.WriteLine "URL=" & url
file.WriteLine "IconIndex=0"
file.Close

MsgBox "Atalho criado na Área de Trabalho!" & vbCrLf & vbCrLf & "URL: " & url & vbCrLf & vbCrLf & "Outras pessoas na mesma rede podem acessar usando este endereço.", 64, "PCP Control"
