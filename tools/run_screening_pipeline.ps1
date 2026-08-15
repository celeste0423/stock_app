$ErrorActionPreference = "Continue"

$workdir = Split-Path -Parent $PSScriptRoot
$python = "C:\Users\jyeob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$logDir = Join-Path $workdir "outputs"
$logFile = Join-Path $logDir ("screening_pipeline_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Run-Step($label, $cmd) {
  "`n==== $label ====" | Tee-Object -FilePath $logFile -Append
  "CMD: $cmd" | Tee-Object -FilePath $logFile -Append
  try {
    Invoke-Expression $cmd 2>&1 | Tee-Object -FilePath $logFile -Append
  } catch {
    "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath $logFile -Append
  }
}

Set-Location $workdir

Run-Step "Compile scripts" "& `"$python`" -m py_compile tools\screening_avg_db_pipeline.py"
Run-Step "Compile legacy utility" "& `"$python`" -m py_compile tools\screening_excel_batch_edit.py"
Run-Step "Run DB pipeline full range" "& `"$python`" tools\screening_avg_db_pipeline.py --start-date 20260311 --end-date 20260528"

Run-Step "Verify samples" @"
& `"$python`" - <<'PY'
from pathlib import Path
from openpyxl import load_workbook
base = Path(r'$workdir/data/screening/legacy')
for name in [
    '20260311_데일리_기업스크리닝.xlsx',
    '20260415_데일리_기업스크리닝.xlsm',
    '20260528_데일리_기업스크리닝.xlsm',
]:
    path = base / name
    wb = load_workbook(path, read_only=True, data_only=True, keep_links=False)
    ws = wb['주도주 찾기']
    print(name, ws['Q1'].value, ws['R1'].value, ws['Q2'].value, ws['R2'].value, ws['Q3'].value, ws['R3'].value)
    wb.close()
PY
"@

"`nDONE. log=$logFile" | Tee-Object -FilePath $logFile -Append
