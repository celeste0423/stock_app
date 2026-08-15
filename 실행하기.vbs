Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcherPath = scriptDir & "\launchers_internal\start_desktop_app.ps1"
pwshPath = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"

If Not fso.FileExists(launcherPath) Then
    MsgBox "Launcher script was not found: " & launcherPath, vbCritical, "Stock Dashboard"
    WScript.Quit 1
End If

If Not fso.FileExists(pwshPath) Then
    MsgBox "PowerShell runtime was not found: " & pwshPath, vbCritical, "Stock Dashboard"
    WScript.Quit 1
End If

command = """" & pwshPath & """ -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & launcherPath & """"
shell.Run command, 0, False
