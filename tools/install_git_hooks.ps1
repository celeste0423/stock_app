param(
  [string]$ProjectRoot = "D:\Study\stock app"
)

$ErrorActionPreference = "Stop"

Push-Location $ProjectRoot
try {
  git config core.hooksPath .githooks
  Write-Host "Configured git hooks path: .githooks"
} finally {
  Pop-Location
}
