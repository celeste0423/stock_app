from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "backend" / "vendor"
USE_BACKEND_VENDOR = os.getenv("STOCK_APP_USE_BACKEND_VENDOR", "1").strip().lower() not in {"0", "false", "no", "off"}

sys.path.insert(0, str(ROOT))
if USE_BACKEND_VENDOR and VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

os.environ["STOCK_DASHBOARD_HOST"] = "127.0.0.1"
os.environ["STOCK_DASHBOARD_PORT"] = os.environ.get("STOCK_DASHBOARD_DESKTOP_PORT", "8124")
os.environ.pop("STOCK_DASHBOARD_PUBLIC_WEB", None)


def preload_krx_credentials() -> None:
    if str(os.getenv("KRX_ID", "")).strip() and str(os.getenv("KRX_PW", "")).strip():
        return
    state_dir = Path(os.getenv("STOCK_DASHBOARD_STATE_DIR", str(ROOT / "backend")))
    settings_path = state_dir / "local_settings.json"
    if not settings_path.exists():
        return
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8-sig"))
    except Exception:
        return
    krx = settings.get("krx", {}) if isinstance(settings, dict) and isinstance(settings.get("krx"), dict) else {}
    user_id = str(krx.get("id", "")).strip()
    password = str(krx.get("password", "")).strip()
    if user_id and not str(os.getenv("KRX_ID", "")).strip():
        os.environ["KRX_ID"] = user_id
    if password and not str(os.getenv("KRX_PW", "")).strip():
        os.environ["KRX_PW"] = password


preload_krx_credentials()

import uvicorn
from backend.app import app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.getenv("STOCK_DASHBOARD_HOST", "127.0.0.1"),
        port=int(os.getenv("STOCK_DASHBOARD_PORT", "8124")),
        reload=False,
        access_log=False,
        log_level="warning",
    )
