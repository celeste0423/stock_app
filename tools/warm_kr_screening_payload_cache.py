from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.app import RECENT_SCREENING_LOOKBACK, warm_kr_screening_lite_cache_dates


def main() -> int:
    parser = argparse.ArgumentParser(description="Prebuild Korean leader-table date caches.")
    parser.add_argument("--force", action="store_true", help="Rebuild caches that already exist.")
    args = parser.parse_args()
    started_at = time.time()

    def report(index_no: int, total: int, date_text: str, status: str) -> None:
        if index_no == 1 or index_no == total or index_no % 10 == 0 or status == "failed":
            print(f"[cache] {index_no}/{total} {date_text} {status}", flush=True)

    result = warm_kr_screening_lite_cache_dates(
        recent_limit=RECENT_SCREENING_LOOKBACK,
        force_reload=bool(args.force),
        universe="stock",
        progress_callback=report,
    )
    result["duration_sec"] = round(time.time() - started_at, 2)
    print(result, flush=True)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
