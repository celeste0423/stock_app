$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptDir

if (Test-Path (Join-Path $scriptDir "desktop_app.py")) {
    $projectRoot = $scriptDir
} elseif (Test-Path (Join-Path $parentDir "desktop_app.py")) {
    $projectRoot = $parentDir
} else {
    throw "desktop_app.py was not found."
}

$pythonExe = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$launcherLog = Join-Path $projectRoot "launcher.log"
$stdoutLog = Join-Path $projectRoot "desktop_stdout.log"
$stderrLog = Join-Path $projectRoot "desktop_stderr.log"

function Write-LauncherLog($message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $launcherLog -Value "[$stamp] $message" -Encoding UTF8
}

Write-LauncherLog "Restart requested"

$escapedRoot = [Regex]::Escape($projectRoot)
$pythonProcesses = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -match '^pythonw?(\.exe)?$' -and
        $_.CommandLine -match $escapedRoot -and
        $_.CommandLine -match 'desktop_app\.py'
    }

foreach ($process in $pythonProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    Write-LauncherLog "Stopped process $($process.ProcessId)"
}

Start-Sleep -Seconds 1

$vendorPath = Join-Path $projectRoot "backend\vendor"
$appScript = Join-Path $projectRoot "desktop_app.py"

& $pythonExe -c "import webview" *> $null
if ($LASTEXITCODE -ne 0) {
    Write-LauncherLog "pywebview missing; installing"
    & $pythonExe -m pip install pywebview
    if ($LASTEXITCODE -ne 0) {
        Write-LauncherLog "pywebview install failed"
        throw "pywebview install failed."
    }
}

$env:PYTHONPATH = "$projectRoot;$vendorPath"
Set-Location $projectRoot
Write-LauncherLog "Launching desktop app with hidden PowerShell host"
& $pythonExe $appScript 1>> $stdoutLog 2>> $stderrLog
