Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""D:\Study\New Folder\start_app.ps1""", 0, False
Set shell = Nothing
