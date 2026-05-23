$ErrorActionPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $projectRoot "backend\.dashboard_server.pid"

if (Test-Path $pidFile) {
    $pidValue = Get-Content $pidFile | Select-Object -First 1
    if ($pidValue) {
        Stop-Process -Id ([int]$pidValue) -Force
    }
    Remove-Item $pidFile -Force
}
