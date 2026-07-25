#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/stock-app}"

if command -v apt >/dev/null 2>&1; then
  sudo apt update
  sudo apt install -y python3 python3-venv python3-pip curl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y python3 python3-pip curl
else
  echo "No supported package manager found."
  exit 1
fi

cd "$APP_DIR"

python3 -m venv .venv
. .venv/bin/activate
REQ_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
REQ_STAMP=".venv/.requirements.sha256"
if [[ ! -f "$REQ_STAMP" ]] || [[ "$(cat "$REQ_STAMP" 2>/dev/null || true)" != "$REQ_HASH" ]]; then
  pip install --no-cache-dir --upgrade pip
  pip install --no-cache-dir -r requirements.txt
  printf "%s" "$REQ_HASH" > "$REQ_STAMP"
else
  echo "requirements unchanged - skipping pip install"
fi

sudo cp deploy/oracle/stock-app.service /etc/systemd/system/stock-app.service
sudo cp deploy/oracle/stock-leader-bot.service /etc/systemd/system/stock-leader-bot.service
sudo cp deploy/oracle/stock-refresh-kr.service /etc/systemd/system/stock-refresh-kr.service
sudo cp deploy/oracle/stock-refresh-kr.timer /etc/systemd/system/stock-refresh-kr.timer
sudo cp deploy/oracle/stock-refresh-us.service /etc/systemd/system/stock-refresh-us.service
sudo cp deploy/oracle/stock-refresh-us.timer /etc/systemd/system/stock-refresh-us.timer

sudo systemctl daemon-reload

if [[ -f "$APP_DIR/.env" ]]; then
  sudo systemctl enable stock-app.service
  sudo systemctl restart stock-app.service
  sudo systemctl enable stock-leader-bot.service
  sudo systemctl restart stock-leader-bot.service
  sudo systemctl enable stock-refresh-kr.timer
  sudo systemctl restart stock-refresh-kr.timer
  sudo systemctl enable stock-refresh-us.timer
  sudo systemctl restart stock-refresh-us.timer
else
  echo ".env not found at $APP_DIR/.env"
  echo "Create it first, then run:"
  echo "  sudo systemctl restart stock-app.service stock-leader-bot.service"
fi
