from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "backend" / "vendor"

sys.path.insert(0, str(ROOT))
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

os.environ["STOCK_DASHBOARD_HOST"] = "127.0.0.1"
os.environ["STOCK_DASHBOARD_PORT"] = os.environ.get("STOCK_DASHBOARD_DESKTOP_PORT", "8124")
os.environ.pop("STOCK_DASHBOARD_PUBLIC_WEB", None)

from backend.app import main


if __name__ == "__main__":
    main()
