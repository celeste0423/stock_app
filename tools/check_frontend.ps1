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
  "frontend/static/features/naver-blog/page.js",
  "frontend/static/features/building-management/page.js",
  "frontend/static/features/global-company/page.js",
  "frontend/static/features/portfolio/page.js",
  "frontend/static/features/stock-news/page.js",
  "frontend/static/features/global-indices/page.js",
  "frontend/static/features/pair-correlation/page.js",
  "frontend/static/features/etf-flow/page.js",
  "frontend/static/features/institutional-rebalance/page.js",
  "frontend/static/features/sector-entry/page.js",
  "frontend/static/features/trade-data/page.js",
  "frontend/static/features/economy-cycle/page.js",
  "frontend/static/features/market-calendar/page.js",
  "frontend/static/features/real-estate-prices/page.js",
  "frontend/static/features/subscription-list/page.js",
  "frontend/static/features/chart-game/page.js",
  "frontend/static/features/sector-watch/page.js",
  "frontend/static/features/themes/page.js",
  "frontend/static/features/sector-snapshot/page.js",
  "frontend/static/features/international-themes/page.js",
  "frontend/static/features/strategy-backtest/page.js",
  "frontend/static/features/disclosure/page.js",
  "frontend/static/features/telegram/page.js",
  "frontend/index.html",
  "backend/app.py",
  "WORKFLOW.md"
)

if ($Files -and $Files.Count -gt 0) {
  $targets = @($Files | Where-Object { $_ -and $_.Trim() })
} else {
  $targets = $defaultTargets
}

function Assert-Utf8Integrity([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $relativePath = [System.IO.Path]::GetRelativePath($ProjectRoot, $Path).Replace("/", "\")
  $expectsBom = $relativePath -in @(
    "frontend\static\app.shared.js",
    "frontend\static\app.api.js",
    "frontend\static\app.js",
    "frontend\static\styles.css",
    "frontend\index.html"
  )
  if ($expectsBom -and -not $hasBom) {
    throw "UTF-8 BOM missing: $Path"
  }
  if (-not $expectsBom -and $hasBom) {
    throw "Unexpected BOM detected: $Path"
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
  Assert-Utf8Integrity $fullPath
  if ($fullPath -like "*.js") {
    & $node --check $fullPath
    if ($LASTEXITCODE -ne 0) {
      throw "Syntax check failed: $fullPath"
    }
  }
}

Write-Host "Frontend integrity check passed."
