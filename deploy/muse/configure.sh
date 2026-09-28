#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

ENV_FILE="/etc/stock-leader.env"
EXAMPLE_FILE="/opt/stock-leader/app/deploy/muse/.env.example"

if [[ ! -f "${EXAMPLE_FILE}" ]]; then
  echo "Missing ${EXAMPLE_FILE}. Run install.sh first." >&2
  exit 1
fi

read -r -s -p "Telegram bot token: " TELEGRAM_BOT_TOKEN
echo
read -r -p "Telegram allowed chat IDs (comma separated): " TELEGRAM_ALLOWED_CHAT_IDS
read -r -s -p "Formula sync token (blank = generate): " ORACLE_SCORE_SYNC_TOKEN
echo
if [[ -z "${ORACLE_SCORE_SYNC_TOKEN}" ]]; then
  ORACLE_SCORE_SYNC_TOKEN="$(openssl rand -hex 32)"
fi
read -r -p "API bind host [127.0.0.1]: " STOCK_APP_BIND_HOST
STOCK_APP_BIND_HOST="${STOCK_APP_BIND_HOST:-127.0.0.1}"

if [[ -z "${TELEGRAM_BOT_TOKEN}" || -z "${TELEGRAM_ALLOWED_CHAT_IDS}" ]]; then
  echo "Telegram bot token and chat IDs are required." >&2
  exit 1
fi

cp "${EXAMPLE_FILE}" "${ENV_FILE}"
sed -i \
  -e "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}|" \
  -e "s|^TELEGRAM_ALLOWED_CHAT_IDS=.*|TELEGRAM_ALLOWED_CHAT_IDS=${TELEGRAM_ALLOWED_CHAT_IDS}|" \
  -e "s|^ORACLE_SCORE_SYNC_TOKEN=.*|ORACLE_SCORE_SYNC_TOKEN=${ORACLE_SCORE_SYNC_TOKEN}|" \
  -e "s|^STOCK_APP_BIND_HOST=.*|STOCK_APP_BIND_HOST=${STOCK_APP_BIND_HOST}|" \
  "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

systemctl daemon-reload
systemctl enable --now stock-muse-app.service
systemctl enable --now stock-muse-bot.service
systemctl enable --now stock-muse-close-kr.timer
systemctl enable --now stock-muse-close-us.timer

echo
echo "Muse stock leader services are enabled."
echo "Formula sync token: ${ORACLE_SCORE_SYNC_TOKEN}"
echo "Keep this token private and configure the same value on the local stock app."
systemctl --no-pager --full status stock-muse-app.service || true
systemctl --no-pager list-timers 'stock-muse-close-*' || true
