from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from typing import Any

from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ThemeRebuildDateRequest(BaseModel):
    file_date: str
    min_score: float = 0.0
    recent_limit: int = 20


def install_theme_rebuild_date(legacy: Any) -> None:
    def rebuild(request: ThemeRebuildDateRequest) -> dict[str, Any]:
        digits = re.sub(r"\D", "", request.file_date or "")
        if len(digits) != 8:
            raise ValueError("날짜를 YYYY-MM-DD 형식으로 선택해 주세요.")
        target = datetime.strptime(digits, "%Y%m%d").date()
        if target > datetime.now().date() or target.weekday() >= 5:
            raise ValueError("미래 날짜 또는 주말 데이터는 재계산할 수 없습니다.")
        script = legacy.BASE_DIR / "tools" / "build_stock_daily_single.py"
        if not script.exists():
            raise FileNotFoundError(f"데이터 생성 스크립트를 찾지 못했습니다: {script}")
        notes: dict[str, str] = {}
        if legacy.SCREENING_FAST_DB_PATH.exists():
            with sqlite3.connect(str(legacy.SCREENING_FAST_DB_PATH)) as connection:
                rows = connection.execute("SELECT stock_code, note FROM screening_rows WHERE file_date_key = ? AND TRIM(COALESCE(note, '')) <> ''", (digits,)).fetchall()
                notes = {str(code or "").strip(): str(note or "") for code, note in rows}
        legacy.write_build_progress("kr", status="running", percent=10, message=f"선택 날짜 재계산 중 ({digits})", date_key=digits)
        built = legacy._run_daily_builder(script, [digits], timeout=1200, extra_args=["--sql-only"])
        with sqlite3.connect(str(legacy.SCREENING_FAST_DB_PATH)) as connection:
            if notes:
                connection.executemany("UPDATE screening_rows SET note = ? WHERE file_date_key = ? AND stock_code = ?", [(note, digits, code) for code, note in notes.items()])
            row = connection.execute("SELECT COUNT(*) FROM screening_rows WHERE file_date_key = ?", (digits,)).fetchone()
            count = int(row[0] or 0) if row else 0
            connection.commit()
        if count <= 0:
            raise RuntimeError(f"{digits} 재생성 결과가 비어 있습니다.")
        target_iso = f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"
        legacy.invalidate_screening_runtime_caches()
        cache = legacy.load_screening_cache()
        for key in ("summaries", "recent_leaders", "calendar", "calendar_index_score"):
            cache[key] = {}
        legacy.save_screening_cache(cache)
        legacy.clear_screening_payload_file_cache([target_iso])
        warmed = legacy.warm_kr_screening_request_caches(target_iso, recent_limit=request.recent_limit, force_reload=True, universes=("stock", "etf"))
        payload = ((warmed.get("stock") or {}).get("full")) or legacy.load_screening_summary(min_score=request.min_score, recent_limit=request.recent_limit, file_date=target_iso, force_reload=False)
        payload["selected_date_rebuild"] = {"ok": True, "date": target_iso, "rows": count, "preserved_note_count": len(notes), "built_dates": built}
        legacy.write_build_progress("kr", status="completed", percent=100, message=f"{target_iso} 재계산 완료", date_key=digits)
        return payload

    def endpoint(request: ThemeRebuildDateRequest) -> JSONResponse:
        try:
            return JSONResponse(rebuild(request))
        except Exception as exc:
            return JSONResponse({"error": str(exc)}, status_code=500)

    endpoint.__name__ = "themes_rebuild_date"
    legacy.ThemeRebuildDateRequest = ThemeRebuildDateRequest
    legacy.rebuild_theme_selected_date = rebuild
    legacy.app.post("/api/themes/rebuild-date")(endpoint)
    route = legacy.app.routes.pop()
    catchall = next((index for index, item in enumerate(legacy.app.routes) if getattr(item, "path", None) == "/{full_path:path}"), len(legacy.app.routes))
    legacy.app.routes.insert(catchall, route)
