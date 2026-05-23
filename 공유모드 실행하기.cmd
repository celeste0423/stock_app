@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0share_cloudflare_tunnel.ps1"
if errorlevel 1 (
  echo.
  echo 공유모드 실행 중 오류가 발생했습니다. 내용을 확인한 뒤 아무 키나 누르면 창이 닫힙니다.
  pause >nul
)
