$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot "frontend"
$nodeDir = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$pnpm = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
    throw "Node runtime not found: $nodeDir"
}
if (-not (Test-Path $pnpm)) {
    throw "pnpm runtime not found: $pnpm"
}

$originalPath = $env:PATH
try {
    $env:PATH = "$nodeDir;$originalPath"
    Push-Location $frontendRoot
    & $pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend dependency installation failed."
    }
    & $pnpm build
    if ($LASTEXITCODE -ne 0) {
        throw "Vite production build failed."
    }
} finally {
    Pop-Location
    $env:PATH = $originalPath
}
