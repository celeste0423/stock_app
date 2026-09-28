#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

APP_DIR="${STOCK_LEADER_APP_DIR:-/opt/stock-leader/app}"
REF="${STOCK_LEADER_GIT_REF:-main}"

cd "${APP_DIR}"
sudo -u stockleader git fetch --prune origin
sudo -u stockleader git checkout "${REF}"
sudo -u stockleader git pull --ff-only origin "${REF}"
sudo -u stockleader git sparse-checkout reapply

REQ_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
REQ_STAMP="/opt/stock-leader/venv/.requirements.sha256"
if [[ ! -f "${REQ_STAMP}" ]] || [[ "$(cat "${REQ_STAMP}" 2>/dev/null || true)" != "${REQ_HASH}" ]]; then
  /opt/stock-leader/venv/bin/python -m pip install --no-cache-dir -r requirements.txt
  printf '%s' "${REQ_HASH}" > "${REQ_STAMP}"
fi

systemctl restart stock-muse-app.service stock-muse-bot.service
STOCK_APP_PORT="$(sed -n 's/^STOCK_APP_PORT=//p' /etc/stock-leader.env | tail -n 1)"
STOCK_APP_PORT="${STOCK_APP_PORT:-8124}"
curl -fsS --retry 20 --retry-delay 2 "http://127.0.0.1:${STOCK_APP_PORT}/api/health" >/dev/null
echo "Updated ${APP_DIR} to $(git rev-parse --short HEAD)"
