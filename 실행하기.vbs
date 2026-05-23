Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcherPath = scriptDir & "\launchers_internal\start_desktop_app.ps1"

If Not fso.FileExists(launcherPath) Then
    MsgBox "Launcher script was not found: " & launcherPath, vbCritical, "Stock Dashboard"
    WScript.Quit 1
End If

command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & launcherPath & """"
shell.Run command, 0, False
