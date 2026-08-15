$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

$pythonExe = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$serverScript = Join-Path $scriptDir "backend_desktop_server.py"
$edgeProfilePath = Join-Path $projectRoot "desktop_edge_profile"
$launcherLog = Join-Path $projectRoot "launcher.log"
$stdoutLog = Join-Path $projectRoot "desktop_stdout.log"
$stderrLog = Join-Path $projectRoot "desktop_stderr.log"
$desktopPort = 8124
$baseUrl = "http://127.0.0.1:$desktopPort"
$healthUrl = "$baseUrl/api/health"

function Write-LauncherLog($message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $launcherLog -Value "[$stamp] $message" -Encoding UTF8
}

function Test-AppHealth($url) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-AppHealth($url) {
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-AppHealth $url) {
            return
        }
        Start-Sleep -Milliseconds 400
    }
    throw "Stock Dashboard desktop server did not become healthy: $url"
}

function Find-Edge {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    throw "Microsoft Edge executable was not found."
}

function Stop-DesktopProcesses {
    $escapedRoot = [Regex]::Escape($projectRoot)
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -match '^pythonw?(\.exe)?$' -and
            $_.CommandLine -match $escapedRoot -and
            ($_.CommandLine -match 'desktop_app\.py' -or $_.CommandLine -match 'backend_desktop_server\.py')
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-LauncherLog "Stopped existing desktop server process $($_.ProcessId)"
        }

    $escapedEdgeProfile = [Regex]::Escape($edgeProfilePath)
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -match '^msedge(\.exe)?$' -and
            $_.CommandLine -match $escapedEdgeProfile
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-LauncherLog "Stopped stale Edge app process $($_.ProcessId)"
        }
}

function Test-EdgeAppAlive {
    $escapedEdgeProfile = [Regex]::Escape($edgeProfilePath)
    $processes = Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -match '^msedge(\.exe)?$' -and
            $_.CommandLine -match $escapedEdgeProfile -and
            $_.CommandLine -notmatch 'crashpad-handler'
        }
    return $null -ne $processes
}

function Wait-EdgeAppStarted {
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        if (Test-EdgeAppAlive) {
            return
        }
        Start-Sleep -Milliseconds 300
    }
    Write-LauncherLog "Edge app process was not detected after launch; server will remain available until next start"
}

function Wait-EdgeAppClosed {
    while (Test-EdgeAppAlive) {
        Start-Sleep -Seconds 2
    }
}

function Stop-DesktopServerProcess($process) {
    if ($null -eq $process) {
        return
    }
    try {
        $alive = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($alive) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-LauncherLog "Stopped desktop server process after app window closed: $($process.Id)"
        }
    } catch {
        Write-LauncherLog "Failed to stop desktop server process $($process.Id): $($_.Exception.Message)"
    }
}

Write-LauncherLog "Starting launcher"

if (-not (Test-Path $serverScript)) {
    throw "Desktop server script was not found: $serverScript"
}

Remove-Item -LiteralPath $stderrLog -ErrorAction SilentlyContinue
$env:PYTHONPATH = "$projectRoot;$(Join-Path $projectRoot 'backend\vendor')"
$env:STOCK_DASHBOARD_DESKTOP_PORT = "$desktopPort"
$env:STOCK_DASHBOARD_SCREENING_DIR = Join-Path $projectRoot "config\screening"
$env:STOCK_DASHBOARD_SCORE_FORMULA_CONFIG_PATH = Join-Path $projectRoot "config\screening\score_formula_config.json"
$env:STOCK_DASHBOARD_US_SCORE_FORMULA_CONFIG_PATH = Join-Path $projectRoot "config\screening\us_score_formula_config.json"
$env:STOCK_DASHBOARD_REAL_ESTATE_EXCEL_PATH = Join-Path $projectRoot "data\real-estate\안암해링턴 상가 관리.xlsx"
$env:STOCK_DASHBOARD_REAL_ESTATE_BANK_IMPORT_DIR = Join-Path $projectRoot "data\real-estate\계좌입출금내역"
$env:STOCK_DASHBOARD_REAL_ESTATE_BUILDING_EXPORT_DIR = Join-Path $projectRoot "data\real-estate\건물 정리"

if (Test-AppHealth $healthUrl) {
    $serverProcess = $null
    Write-LauncherLog "Reusing existing desktop server at $baseUrl"
} else {
    Write-LauncherLog "Starting independent desktop server on $baseUrl"
    $serverProcess = Start-Process `
        -FilePath $pythonExe `
        -ArgumentList @("`"$serverScript`"") `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    Write-LauncherLog "Desktop server process started: $($serverProcess.Id)"
}
Wait-AppHealth $healthUrl
Write-LauncherLog "Desktop server is healthy at $baseUrl"

$latestWrite = @(
    (Get-Item (Join-Path $projectRoot "frontend\index.html")).LastWriteTimeUtc,
    (Get-Item (Join-Path $projectRoot "frontend\static\core\app-shell.js")).LastWriteTimeUtc,
    (Get-Item (Join-Path $projectRoot "frontend\static\styles.css")).LastWriteTimeUtc
) | Sort-Object -Descending | Select-Object -First 1
$appVersion = ([DateTimeOffset]$latestWrite).ToUnixTimeSeconds()
$windowId = [Guid]::NewGuid().ToString("N")
$appUrl = "$baseUrl/?desktop_v=$appVersion&window_id=$windowId"
$edgeExe = Find-Edge
New-Item -ItemType Directory -Force -Path $edgeProfilePath | Out-Null

Write-LauncherLog "Opening Edge app window: $appUrl"
Start-Process `
    -FilePath $edgeExe `
    -ArgumentList @("--app=$appUrl", "--new-window", "--no-first-run", "--user-data-dir=`"$edgeProfilePath`"") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Normal

try {
    Wait-EdgeAppStarted
    Write-LauncherLog "Monitoring Edge app window for cleanup"
    Wait-EdgeAppClosed
    Write-LauncherLog "Edge app window closed"
} finally {
    Stop-DesktopServerProcess $serverProcess
}
