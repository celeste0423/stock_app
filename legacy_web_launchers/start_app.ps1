$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$serverUrl = "http://127.0.0.1:8123"
$healthUrl = "$serverUrl/api/health"
$serverScript = Join-Path $projectRoot "backend\app.py"
$vendorPath = Join-Path $projectRoot "backend\vendor"
$pidFile = Join-Path $projectRoot "backend\.dashboard_server.pid"

function Test-DashboardHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-DashboardServer {
    $existingPid = $null
    if (Test-Path $pidFile) {
        $existingPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    }

    if ($existingPid) {
        try {
            $process = Get-Process -Id ([int]$existingPid) -ErrorAction Stop
            if ($process.Path -eq $pythonExe) {
                return
            }
        } catch {
        }
    }

    $command = @"
$env:PYTHONPATH = '$vendorPath'
Set-Location '$projectRoot'
& '$pythonExe' '$serverScript'
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $process = Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", $encoded `
        -WorkingDirectory $projectRoot `
        -PassThru

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        $pythonProcess = Get-Process python -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1
        if ($pythonProcess -and (Test-DashboardHealth)) {
            Set-Content -Path $pidFile -Value $pythonProcess.Id -Encoding ascii
            return
        }
    }
}

if (-not (Test-DashboardHealth)) {
    Start-DashboardServer
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-DashboardHealth) {
            break
        }
    }
}

Start-Process $serverUrl
