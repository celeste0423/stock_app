#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

REPO_URL="${STOCK_LEADER_REPO_URL:-https://github.com/celeste0423/stock_app.git}"
REF="${STOCK_LEADER_GIT_REF:-main}"
ROOT_DIR="${STOCK_LEADER_ROOT:-/opt/stock-leader}"
APP_DIR="${ROOT_DIR}/app"
VENV_DIR="${ROOT_DIR}/venv"
STATE_DIR="/var/lib/stock-leader"

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates build-essential openssl
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git curl ca-certificates gcc gcc-c++ make openssl
  else
    echo "Supported package manager not found (apt-get or dnf required)." >&2
    exit 1
  fi
}

install_packages

if ! id stockleader >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${STATE_DIR}" --shell /usr/sbin/nologin stockleader
fi
mkdir -p "${ROOT_DIR}" "${STATE_DIR}/state"
chown -R stockleader:stockleader "${ROOT_DIR}" "${STATE_DIR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo -u stockleader git clone --filter=blob:none --no-checkout "${REPO_URL}" "${APP_DIR}"
  sudo -u stockleader git -C "${APP_DIR}" sparse-checkout init --cone
  sudo -u stockleader git -C "${APP_DIR}" sparse-checkout set backend config deploy/muse frontend/static tools
  sudo -u stockleader git -C "${APP_DIR}" checkout "${REF}"
else
  sudo -u stockleader git -C "${APP_DIR}" fetch --prune origin
  sudo -u stockleader git -C "${APP_DIR}" checkout "${REF}"
  sudo -u stockleader git -C "${APP_DIR}" pull --ff-only origin "${REF}"
  sudo -u stockleader git -C "${APP_DIR}" sparse-checkout set backend config deploy/muse frontend/static tools
fi

create_uv_venv() {
  if ! command -v uv >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
  fi
  UV_PYTHON_INSTALL_DIR="${ROOT_DIR}/python" uv python install 3.12
  UV_PYTHON_INSTALL_DIR="${ROOT_DIR}/python" uv venv --python 3.12 "${VENV_DIR}"
}

if command -v python3.12 >/dev/null 2>&1; then
  if ! python3.12 -m venv "${VENV_DIR}"; then
    rm -rf "${VENV_DIR}"
    create_uv_venv
  fi
else
  create_uv_venv
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip
"${VENV_DIR}/bin/python" -m pip install --no-cache-dir -r "${APP_DIR}/requirements.txt"
sha256sum "${APP_DIR}/requirements.txt" | awk '{print $1}' > "${VENV_DIR}/.requirements.sha256"
chown -R stockleader:stockleader "${ROOT_DIR}" "${STATE_DIR}"

install -m 0644 "${APP_DIR}/deploy/muse/stock-muse-app.service" /etc/systemd/system/
install -m 0644 "${APP_DIR}/deploy/muse/stock-muse-bot.service" /etc/systemd/system/
install -m 0644 "${APP_DIR}/deploy/muse/stock-muse-close@.service" /etc/systemd/system/
install -m 0644 "${APP_DIR}/deploy/muse/stock-muse-close-kr.timer" /etc/systemd/system/
install -m 0644 "${APP_DIR}/deploy/muse/stock-muse-close-us.timer" /etc/systemd/system/
chmod +x "${APP_DIR}/deploy/muse/configure.sh" "${APP_DIR}/deploy/muse/update.sh"
systemctl daemon-reload

echo
echo "Code and services installed. Configure secrets with:"
echo "  sudo ${APP_DIR}/deploy/muse/configure.sh"
