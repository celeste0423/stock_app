param(
    [int]$Port = 8123,
    [switch]$AllowTelegram,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsDir = Join-Path $Root "tools"
$Cloudflared = Join-Path $ToolsDir "cloudflared.exe"
$AppProcess = $null
$TunnelProcess = $null
$script:UserRequestedStop = $false

function Test-PortAvailable {
    param([int]$TargetPort)
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $TargetPort)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Find-FreePort {
    param([int]$StartPort)
    for ($candidate = $StartPort; $candidate -lt ($StartPort + 50); $candidate++) {
        if (Test-PortAvailable $candidate) {
            return $candidate
        }
    }
    throw "No free local port found near $StartPort."
}

function Stop-ExistingShareProcesses {
    $escapedRoot = [Regex]::Escape($Root)
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -eq "cloudflared.exe" -and
            $_.CommandLine -match [Regex]::Escape($Cloudflared)
        } |
        ForEach-Object {
            Write-Host "Stopping old Cloudflare Tunnel process $($_.ProcessId)..." -ForegroundColor DarkGray
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -match '^pythonw?\.exe$' -and
            (
                ($_.CommandLine -match $escapedRoot -and $_.CommandLine -match 'backend\.app') -or
                ($_.CommandLine -match '\s-m\s+backend\.app')
            )
        } |
        ForEach-Object {
            Write-Host "Stopping old share server process $($_.ProcessId)..." -ForegroundColor DarkGray
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    Start-Sleep -Milliseconds 700
}

function Test-AppHealth {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Test-DashboardRoute {
    param([string]$BaseUrl)
    try {
        $config = Invoke-RestMethod -Uri "$BaseUrl/api/app-config" -TimeoutSec 2
        return $null -ne $config.message
    } catch {
        return $false
    }
}

function Wait-AppHealth {
    param([string]$Url)
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-AppHealth $Url) {
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Stock Dashboard did not start in time: $Url"
}

function Wait-PublicTunnelReady {
    param([string]$BaseUrl)
    $healthUrl = $BaseUrl.TrimEnd("/") + "/api/health"
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 4
            if ($response.StatusCode -eq 200) {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

function Find-Python {
    $bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
    if (Test-Path $bundledPython) {
        return $bundledPython
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand -and $pythonCommand.Source) {
        return $pythonCommand.Source
    }

    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCommand -and $pyCommand.Source) {
        return $pyCommand.Source
    }

    throw "Python was not found. Run the normal local app once first, or install Python 3.11+."
}

function Read-TextIfExists {
    param([string]$Path)
    try {
        if (Test-Path $Path) {
            return Get-Content -Raw -LiteralPath $Path -ErrorAction SilentlyContinue
        }
    } catch {
        return ""
    }
    return ""
}

function Test-ShareStopKeyPressed {
    try {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            return $key.Key -eq [ConsoleKey]::Q -or $key.Key -eq [ConsoleKey]::Escape
        }
    } catch {
        return $false
    }
    return $false
}

try {
    New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

    if (-not (Test-Path $Cloudflared)) {
        Write-Host "Downloading cloudflared..." -ForegroundColor Cyan
        $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        Invoke-WebRequest -Uri $downloadUrl -OutFile $Cloudflared -UseBasicParsing
    }

    Stop-ExistingShareProcesses

    $HealthUrl = "http://127.0.0.1:$Port/api/health"
    $LocalUrl = "http://127.0.0.1:$Port"
    if (-not (Test-AppHealth $HealthUrl) -and -not (Test-PortAvailable $Port)) {
        $Port = Find-FreePort ($Port + 1)
        $HealthUrl = "http://127.0.0.1:$Port/api/health"
        $LocalUrl = "http://127.0.0.1:$Port"
    }
    if ((Test-AppHealth $HealthUrl) -and -not (Test-DashboardRoute $LocalUrl)) {
        Write-Warning "Port $Port is already used by a server that is not the Stock Dashboard server. Starting on another port."
        $Port = Find-FreePort ($Port + 1)
        $HealthUrl = "http://127.0.0.1:$Port/api/health"
        $LocalUrl = "http://127.0.0.1:$Port"
    }

    if (-not (Test-AppHealth $HealthUrl)) {
        $Python = Find-Python
        Write-Host "Starting Stock Dashboard local server on $LocalUrl" -ForegroundColor Cyan
        $env:STOCK_DASHBOARD_HOST = "127.0.0.1"
        $env:STOCK_DASHBOARD_PORT = "$Port"
        Remove-Item Env:\STOCK_DASHBOARD_PUBLIC_WEB -ErrorAction SilentlyContinue
        if ($AllowTelegram) {
            Write-Warning "Telegram is NOT locked. Only use this mode for private trusted access."
        } else {
            Write-Host "Sharing the same full dashboard UI as the local app." -ForegroundColor Cyan
        }
        $AppProcess = Start-Process -FilePath $Python -ArgumentList @("-m", "backend.app") -WorkingDirectory $Root -WindowStyle Hidden -PassThru
        Wait-AppHealth $HealthUrl
    } else {
        Write-Host "Using an already running Stock Dashboard server: $LocalUrl" -ForegroundColor Cyan
    }

    Write-Host ""
    Write-Host "Cloudflare Tunnel is starting." -ForegroundColor Green
    Write-Host "Do NOT share localhost or 127.0.0.1. Share only the https://*.trycloudflare.com URL." -ForegroundColor Yellow
    Write-Host "The public URL will be copied to your clipboard when it appears." -ForegroundColor Green
    Write-Host "Keep this window open while sharing." -ForegroundColor Yellow
    Write-Host "To stop sharing and close this CMD window, press Q. You can also press Esc or Ctrl+C." -ForegroundColor Yellow
    Write-Host ""

    $TunnelStdout = Join-Path $Root "cloudflared_stdout.log"
    $TunnelStderr = Join-Path $Root "cloudflared_stderr.log"
    Remove-Item -LiteralPath $TunnelStdout, $TunnelStderr -ErrorAction SilentlyContinue

    $TunnelProcess = Start-Process `
        -FilePath $Cloudflared `
        -ArgumentList @("tunnel", "--url", $LocalUrl) `
        -WorkingDirectory $Root `
        -RedirectStandardOutput $TunnelStdout `
        -RedirectStandardError $TunnelStderr `
        -WindowStyle Hidden `
        -PassThru

    $script:PublicUrl = $null
    $announced = $false
    $lastStatusAt = Get-Date
    while (-not $TunnelProcess.HasExited) {
        if (Test-ShareStopKeyPressed) {
            $script:UserRequestedStop = $true
            Write-Host ""
            Write-Host "Stop key pressed. Closing public share and cleaning up..." -ForegroundColor Yellow
            break
        }

        $combinedLog = (Read-TextIfExists $TunnelStdout) + "`n" + (Read-TextIfExists $TunnelStderr)
        if (-not $script:PublicUrl -and $combinedLog -match "https://[A-Za-z0-9-]+\.trycloudflare\.com") {
            $script:PublicUrl = $Matches[0]
            Write-Host ""
            $shareUrl = $script:PublicUrl.TrimEnd("/") + "/"
            Write-Host "PUBLIC SHARE URL: $shareUrl" -ForegroundColor Green
            try {
                Set-Clipboard -Value $shareUrl
                Write-Host "Copied public URL to clipboard." -ForegroundColor Green
            } catch {
                Write-Warning "Could not copy URL to clipboard. Please copy the PUBLIC SHARE URL manually."
            }
            Write-Host "Waiting for Cloudflare public URL to become reachable..." -ForegroundColor Cyan
            if (Wait-PublicTunnelReady $script:PublicUrl) {
                Write-Host "Public URL is ready." -ForegroundColor Green
            } else {
                Write-Warning "The public URL was created, but it did not respond yet. Wait 10-30 seconds and refresh."
            }
            if (-not $NoBrowser) {
                Start-Process $shareUrl
            }
            Write-Host ""
            Write-Host "Sharing is active. Press Q in this window to stop sharing and close CMD." -ForegroundColor Yellow
            $announced = $true
        }

        if (-not $announced -and ((Get-Date) - $lastStatusAt).TotalSeconds -ge 5) {
            Write-Host "Still waiting for Cloudflare public URL..." -ForegroundColor DarkGray
            $lastStatusAt = Get-Date
        }

        Start-Sleep -Milliseconds 250
    }

    if (-not $script:UserRequestedStop -and $TunnelProcess.HasExited -and $TunnelProcess.ExitCode -ne 0) {
        $tail = (Read-TextIfExists $TunnelStderr).Split("`n") | Select-Object -Last 12
        throw "cloudflared stopped unexpectedly. Last log lines:`n$($tail -join "`n")"
    }
} finally {
    if ($TunnelProcess -and -not $TunnelProcess.HasExited) {
        Write-Host "Stopping Cloudflare Tunnel..." -ForegroundColor Cyan
        Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($AppProcess -and -not $AppProcess.HasExited) {
        Write-Host "Stopping Stock Dashboard local server..." -ForegroundColor Cyan
        Stop-Process -Id $AppProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($script:UserRequestedStop) {
        Write-Host "Public sharing has been stopped. Closing window..." -ForegroundColor Green
        Start-Sleep -Seconds 1
    }
}
