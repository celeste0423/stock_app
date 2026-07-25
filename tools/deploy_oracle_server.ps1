param(
  [Parameter(Mandatory = $true)]
  [string]$HostIp,

  [string]$User = "opc",
  [string]$KeyPath = "D:\Study\stock app\ssh-key-2026-07-17.key",
  [string]$RemoteDir = "/opt/stock-app"
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

$root = "D:\Study\stock app"
$archiveName = "stock-app-oracle-deploy.tar.gz"
$archivePath = Join-Path $env:TEMP $archiveName
$includeItems = @(
  "backend",
  "frontend",
  "tools",
  "deploy",
  "requirements.txt",
  "README.md",
  "README_DESKTOP_APP.md",
  "README_CLOUDFLARE_TUNNEL.md"
)
$excludeGlobs = @(
  ".git",
  ".venv",
  "venv",
  "outputs",
  "backend/runtime",
  "backend/.yahoo_cache",
  "backend/__pycache__",
  "backend/*.db",
  "backend/*.sqlite",
  "backend/*.sqlite3",
  "backend/*.parquet",
  "backend/*.pkl",
  "frontend/node_modules",
  "frontend/dist",
  "tools/__pycache__",
  "deploy/__pycache__",
  "*.tar.gz",
  "ssh-key-*.key",
  "ssh-key-*.pub"
)

Write-Host "Creating remote directory..."
ssh -i $KeyPath "$User@$HostIp" "mkdir -p $RemoteDir"

if (Test-Path $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

Write-Host "Building deploy archive..."
$tarArgs = @(
  "-czf",
  $archivePath,
  "-C",
  $root
)
foreach ($pattern in $excludeGlobs) {
  $tarArgs += "--exclude=$pattern"
}
$tarArgs += $includeItems

& tar @tarArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to build deploy archive"
}

Write-Host "Uploading deploy archive..."
scp -i $KeyPath $archivePath "${User}@${HostIp}:$RemoteDir/$archiveName"

Write-Host "Extracting archive on server..."
ssh -i $KeyPath "$User@$HostIp" "cd $RemoteDir && tar -xzf $archiveName && rm -f $archiveName"

Write-Host "Running remote bootstrap ..."
ssh -i $KeyPath "$User@$HostIp" "chmod +x $RemoteDir/deploy/oracle/bootstrap_remote.sh && bash $RemoteDir/deploy/oracle/bootstrap_remote.sh $RemoteDir"

if (Test-Path $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

Write-Host "Done. Update $RemoteDir/.env on the server if needed, then restart services."
