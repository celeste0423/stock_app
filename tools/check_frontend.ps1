param(
  [string]$ProjectRoot = "D:\Study\stock app",
  [string[]]$Files = @()
)

$ErrorActionPreference = "Stop"

$node = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  throw "Node runtime not found: $node"
}

$defaultTargets = @(
  "frontend/static/app.shared.js",
  "frontend/static/app.api.js",
  "frontend/static/app.js",
  "frontend/index.html",
  "backend/app.py",
  "WORKFLOW.md"
)

if ($Files -and $Files.Count -gt 0) {
  $targets = @($Files | Where-Object { $_ -and $_.Trim() })
} else {
  $targets = $defaultTargets
}

function Assert-Utf8NoBom([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "BOM detected: $Path"
  }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  if ($text.Contains([string][char]0xFFFD)) {
    throw "Replacement character detected: $Path"
  }
}

foreach ($target in $targets) {
  $fullPath = Join-Path $ProjectRoot $target
  if (-not (Test-Path $fullPath)) {
    throw "Missing file: $fullPath"
  }
  Assert-Utf8NoBom $fullPath
  if ($fullPath -like "*.js") {
    & $node --check $fullPath
    if ($LASTEXITCODE -ne 0) {
      throw "Syntax check failed: $fullPath"
    }
  }
}

Write-Host "Frontend integrity check passed."
