param(
    [string[]]$BackupPaths = @(),
    [switch]$SkipDiffStat
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Section "Git Status"
git status --short

if (-not $SkipDiffStat) {
    Write-Section "Git Diff Stat"
    git diff --stat
}

if (-not $BackupPaths -or $BackupPaths.Count -eq 0) {
    Write-Section "Backup"
    Write-Host "No backup paths requested."
    exit 0
}

$NormalizedBackupPaths = @()
foreach ($Entry in $BackupPaths) {
    if ([string]::IsNullOrWhiteSpace($Entry)) {
        continue
    }
    foreach ($Piece in ($Entry -split ",")) {
        $Trimmed = $Piece.Trim()
        if (-not [string]::IsNullOrWhiteSpace($Trimmed)) {
            $NormalizedBackupPaths += $Trimmed
        }
    }
}

if (-not $NormalizedBackupPaths -or $NormalizedBackupPaths.Count -eq 0) {
    Write-Section "Backup"
    Write-Host "No valid backup paths after normalization."
    exit 0
}

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupRoot = Join-Path $RepoRoot ".codex_backups"
$TargetRoot = Join-Path $BackupRoot $Stamp
New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

Write-Section "Backup"

foreach ($RelativePath in $NormalizedBackupPaths) {
    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        continue
    }

    $SourcePath = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $SourcePath)) {
        Write-Warning "Skip missing path: $RelativePath"
        continue
    }

    $DestinationPath = Join-Path $TargetRoot $RelativePath
    $DestinationDir = Split-Path -Parent $DestinationPath
    if ($DestinationDir) {
        New-Item -ItemType Directory -Force -Path $DestinationDir | Out-Null
    }

    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    Write-Host "Backed up: $RelativePath"
}

Write-Host ""
Write-Host "Backup folder: $TargetRoot" -ForegroundColor Green
