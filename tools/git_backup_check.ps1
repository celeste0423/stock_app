$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Branch =="
git branch --show-current

Write-Host ""
Write-Host "== Remote =="
git remote -v

Write-Host ""
Write-Host "== Status =="
git status --short

Write-Host ""
Write-Host "== Last Commit =="
git log -1 --oneline
