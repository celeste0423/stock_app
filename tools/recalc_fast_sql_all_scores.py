from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import hashlib
import time
from pathlib import Path
from typing import Any
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

try:
    from pykrx import stock as pykrx_stock
except Exception:
    pykrx_stock = None


BASE_DIR = Path(__file__).resolve().parents[1]


def _resolve_existing_path(env_name: str, candidates: list[Path | None]) -> Path:
    env_value = str(os.getenv(env_name, "") or "").strip()
    if env_value:
        return Path(env_value)
    filtered = [Path(candidate) for candidate in candidates if candidate]
    for candidate in filtered:
        if candidate.exists():
            return candidate
    if not filtered:
        raise RuntimeError(f"{env_name} path candidates are missing.")
    return filtered[0]


DB_PATH = _resolve_existing_path(
    "STOCK_DASHBOARD_SCREENING_FAST_DB_PATH",
    [
        BASE_DIR / "backend" / "stock_daily_fast.sqlite",
        BASE_DIR / "backend" / "stock_daily_fast.sqlite",
    ],
)
CONFIG_PATH = _resolve_existing_path(
    "STOCK_DASHBOARD_SCORE_FORMULA_CONFIG_PATH",
    [
        BASE_DIR / "config" / "screening" / "score_formula_config.json",
    ],
)
SETTINGS_PATH = _resolve_existing_path(
    "STOCK_DASHBOARD_LOCAL_SETTINGS_PATH",
    [
        BASE_DIR / "backend" / "local_settings.json",
        BASE_DIR / "backend" / "local_settings.json",
    ],
)


def _build_progress_payload(
    *,
    progress_market: str,
    progress_scope: str,
    progress_job_id: str,
    progress_started_at: str,
    progress_started_ts: float,
    status: str,
    percent: float,
    message: str,
    result: dict[str, Any] | None = None,
    error: str = "",
) -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    return {
        "job_id": str(progress_job_id or "").strip(),
        "market": str(progress_market or "kr").strip().lower(),
        "scope": str(progress_scope or "full").strip().lower(),
        "status": str(status or "running").strip().lower(),
        "percent": max(0.0, min(float(percent or 0.0), 100.0)),
        "message": str(message or "").strip(),
        "error": str(error or "").strip(),
        "result": result if isinstance(result, dict) else None,
        "started_at": str(progress_started_at or now),
        "started_ts": float(progress_started_ts or 0.0),
        "updated_at": now,
        "updated_ts": time.time(),
        "running": str(status or "").strip().lower() in {"queued", "running"},
    }


def _emit_progress(
    progress_file: Path | None,
    *,
    progress_market: str,
    progress_scope: str,
    progress_job_id: str,
    progress_started_at: str,
    progress_started_ts: float,
    status: str,
    percent: float,
    message: str,
    result: dict[str, Any] | None = None,
    error: str = "",
) -> None:
    if progress_file is None:
        return
    try:
        payload = _build_progress_payload(
            progress_market=progress_market,
            progress_scope=progress_scope,
            progress_job_id=progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status=status,
            percent=percent,
            message=message,
            result=result,
            error=error,
        )
        progress_file.parent.mkdir(parents=True, exist_ok=True)
        progress_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _load_settings() -> dict[str, Any]:
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8-sig"))
        except Exception:
            return {}
    return {}


def _save_settings(settings: dict[str, Any]) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")


def _krx_signature(user_id: str, password: str) -> str:
    return hashlib.sha1(f"{str(user_id).strip()}::{str(password).strip()}".encode("utf-8")).hexdigest()


def _should_attempt_krx_login(user_id: str, password: str) -> bool:
    if not user_id or not password:
        return False
    settings = _load_settings()
    state = settings.get("krx_login_state", {}) if isinstance(settings.get("krx_login_state"), dict) else {}
    return str(state.get("failed_signature") or "").strip() != _krx_signature(user_id, password)


def _record_krx_login_result(user_id: str, password: str, success: bool, error: str = "") -> None:
    settings = _load_settings()
    if success:
        if "krx_login_state" in settings:
            settings.pop("krx_login_state", None)
            _save_settings(settings)
        return
    if not user_id or not password:
        return
    settings["krx_login_state"] = {
        "failed_signature": _krx_signature(user_id, password),
        "failed_at": datetime.now().isoformat(timespec="seconds"),
        "last_error": str(error or "").strip()[:500],
    }
    _save_settings(settings)


def _sortino_norm_window(values: np.ndarray) -> float:
    if values.size == 0:
        return 0.25
    clean = np.asarray(values, dtype=float)
    mean_return = float(np.mean(clean))
    downside_returns = np.minimum(clean, 0.0)
    downside_dev = float(np.sqrt(np.mean(np.square(downside_returns))))
    if downside_dev <= 1e-8:
        raw_sortino = 6.0 if mean_return > 0 else -6.0 if mean_return < 0 else 0.0
    else:
        raw_sortino = float(mean_return / downside_dev)
    raw_sortino = max(min(raw_sortino, 6.0), -6.0)
    return raw_sortino


def _sortino_norm_window_with_min_obs(
    values: np.ndarray,
    min_obs: int = 10,
    insufficient_value: float = 0.25,
    tanh_scale: float = 1.0,
) -> float:
    clean = np.asarray(values, dtype=float)
    clean = clean[np.isfinite(clean)]
    if clean.size < int(min_obs):
        return float(insufficient_value)
    raw_sortino = _sortino_norm_window(clean)
    scale = max(float(tanh_scale), 1e-6)
    return float(0.5 + (0.5 * np.tanh(float(raw_sortino) / scale)))


def _load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    if not isinstance(payload, dict):
        raise RuntimeError("invalid score_formula_config.json")
    return payload


def _build_trend_adjustment(frame: pd.DataFrame, trend_cfg: dict[str, Any]) -> tuple[pd.Series, pd.Series]:
    enabled = bool(trend_cfg.get("enabled", True))
    if not enabled:
        zeros = pd.Series(np.zeros(len(frame), dtype=float), index=frame.index)
        return zeros, zeros

    today_blend_weight = float(trend_cfg.get("today_blend_weight", 0.7))
    trend_floor = float(trend_cfg.get("trend_floor", 20.0))
    acceleration_alignment_bonus = float(trend_cfg.get("acceleration_alignment_bonus", 4.0))
    acceleration_max_bonus = float(trend_cfg.get("acceleration_max_bonus", 8.0))
    acceleration_cap_ratio = max(float(trend_cfg.get("acceleration_cap_ratio", 0.25)), 1e-6)
    break_penalty_today_below_1w = float(trend_cfg.get("break_base_penalty_today_below_1w", 4.0))
    break_penalty_1w_below_1m = float(trend_cfg.get("break_base_penalty_1w_below_1m", 4.0))
    break_penalty_1m_below_3m = float(trend_cfg.get("break_base_penalty_1m_below_3m", 2.0))
    break_max_penalty = float(trend_cfg.get("break_max_penalty", 12.0))
    break_cap_ratio = max(float(trend_cfg.get("break_cap_ratio", 0.2)), 1e-6)

    score_o = pd.to_numeric(frame["score_o_new"], errors="coerce").fillna(0.0)
    avg_1w = pd.to_numeric(frame["avg_1w_new"], errors="coerce").fillna(0.0)
    avg_1m = pd.to_numeric(frame["avg_1m_new"], errors="coerce").fillna(0.0)
    avg_3m = pd.to_numeric(frame["avg_3m_new"], errors="coerce").fillna(0.0)

    short_signal = (score_o * today_blend_weight) + (avg_1w * (1.0 - today_blend_weight))
    denom_1w = np.maximum(np.abs(avg_1w), trend_floor)
    denom_1m = np.maximum(np.abs(avg_1m), trend_floor)
    denom_3m = np.maximum(np.abs(avg_3m), trend_floor)

    accel_stage_1 = np.clip((avg_1w - avg_1m) / denom_1m, 0.0, acceleration_cap_ratio)
    accel_stage_2 = np.clip((short_signal - avg_1w) / denom_1w, 0.0, acceleration_cap_ratio)
    acceleration_magnitude = (0.4 * accel_stage_1) + (0.6 * accel_stage_2)
    acceleration_extra_cap = max(acceleration_max_bonus - acceleration_alignment_bonus, 0.0)
    acceleration_bonus = (acceleration_magnitude / acceleration_cap_ratio) * acceleration_extra_cap
    alignment_mask = (avg_3m < avg_1m) & (avg_1m < avg_1w) & (avg_1w < short_signal)
    acceleration_bonus = np.where(alignment_mask, acceleration_bonus + acceleration_alignment_bonus, acceleration_bonus)
    acceleration_bonus = np.clip(acceleration_bonus, 0.0, acceleration_max_bonus)

    break_stage_1 = np.clip((avg_1w - short_signal) / denom_1w, 0.0, break_cap_ratio)
    break_stage_2 = np.clip((avg_1m - avg_1w) / denom_1m, 0.0, break_cap_ratio)
    break_stage_3 = np.clip((avg_3m - avg_1m) / denom_3m, 0.0, break_cap_ratio)
    break_base = (
        np.where(short_signal < avg_1w, break_penalty_today_below_1w, 0.0)
        + np.where(avg_1w < avg_1m, break_penalty_1w_below_1m, 0.0)
        + np.where(avg_1m < avg_3m, break_penalty_1m_below_3m, 0.0)
    )
    break_extra_cap = max(
        break_max_penalty - (break_penalty_today_below_1w + break_penalty_1w_below_1m + break_penalty_1m_below_3m),
        0.0,
    )
    break_magnitude = (0.5 * break_stage_1) + (0.35 * break_stage_2) + (0.15 * break_stage_3)
    break_penalty = break_base + ((break_magnitude / break_cap_ratio) * break_extra_cap)
    break_penalty = np.clip(break_penalty, 0.0, break_max_penalty)
    return pd.Series(acceleration_bonus, index=frame.index), pd.Series(break_penalty, index=frame.index)


def _load_krx_credentials() -> tuple[str, str]:
    user_id = str(os.getenv("KRX_ID", "")).strip()
    password = str(os.getenv("KRX_PW", "")).strip()
    if user_id and password:
        if not _should_attempt_krx_login(user_id, password):
            return "", ""
        return user_id, password
    if SETTINGS_PATH.exists():
        try:
            payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8-sig"))
            krx = payload.get("krx", {}) if isinstance(payload, dict) else {}
            user_id = str(krx.get("id", "")).strip()
            password = str(krx.get("password", "")).strip()
            if not _should_attempt_krx_login(user_id, password):
                return "", ""
            return user_id, password
        except Exception:
            return "", ""
    return "", ""


def _ensure_columns(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("pragma table_info(screening_rows)").fetchall()}
    if "is_52w_high" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN is_52w_high INTEGER")
    if "is_60d_high" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN is_60d_high INTEGER")
    if "is_20d_high" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN is_20d_high INTEGER")
    if "avg_1m" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN avg_1m REAL")
    if "atr_20" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN atr_20 REAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_close_cache (
            file_date_key TEXT NOT NULL,
            stock_code TEXT NOT NULL,
            open_price REAL,
            high_price REAL,
            low_price REAL,
            close_price REAL,
            PRIMARY KEY (file_date_key, stock_code)
        )
    """
    )
    close_cols = {row[1] for row in conn.execute("pragma table_info(daily_close_cache)").fetchall()}
    if "open_price" not in close_cols:
        conn.execute("ALTER TABLE daily_close_cache ADD COLUMN open_price REAL")
    if "high_price" not in close_cols:
        conn.execute("ALTER TABLE daily_close_cache ADD COLUMN high_price REAL")
    if "low_price" not in close_cols:
        conn.execute("ALTER TABLE daily_close_cache ADD COLUMN low_price REAL")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_close_cache_date ON daily_close_cache(file_date_key)")
    conn.commit()


def _fetch_missing_daily_closes(
    conn: sqlite3.Connection,
    dates: list[str],
    *,
    progress_file: Path | None = None,
    progress_market: str = "kr",
    progress_scope: str = "full",
    progress_job_id: str = "",
    progress_started_at: str = "",
    progress_started_ts: float = 0.0,
) -> None:
    if pykrx_stock is None:
        raise RuntimeError("pykrx is not installed.")

    complete_dates: set[str] = set()
    if dates:
        placeholders = ",".join(["?"] * len(dates))
        complete_dates = {
            str(row[0])
            for row in conn.execute(
                f"""
                SELECT file_date_key
                FROM daily_close_cache
                WHERE file_date_key IN ({placeholders})
                GROUP BY file_date_key
                HAVING SUM(CASE WHEN high_price IS NULL OR low_price IS NULL THEN 1 ELSE 0 END) = 0
                """,
                dates,
            ).fetchall()
        }
    missing = [d for d in dates if d not in complete_dates]
    if not missing:
        return

    krx_id, krx_pw = _load_krx_credentials()
    if krx_id and krx_pw:
        try:
            os.environ["KRX_ID"] = krx_id
            os.environ["KRX_PW"] = krx_pw
            login_fn = getattr(pykrx_stock, "login", None)
            if callable(login_fn):
                login_fn()
            _record_krx_login_result(krx_id, krx_pw, success=True)
        except Exception as exc:
            _record_krx_login_result(krx_id, krx_pw, success=False, error=str(exc))

    total = len(missing)
    for idx, date_key in enumerate(missing, start=1):
        effective_date = date_key
        try:
            effective_date = pykrx_stock.get_nearest_business_day_in_a_week(date_key)
        except Exception:
            effective_date = date_key
        frame = pykrx_stock.get_market_ohlcv_by_ticker(effective_date, market="ALL")
        if frame is None or frame.empty:
            continue
        frame = frame.reset_index()
        if frame.shape[1] < 9:
            continue
        frame.columns = [
            "stock_code",
            "open_price",
            "high_price",
            "low_price",
            "close_price",
            "volume",
            "trading_value",
            "change_pct",
            "market_cap",
        ]
        frame["stock_code"] = frame["stock_code"].astype(str).str.zfill(6)
        frame["file_date_key"] = date_key
        payload = frame[["file_date_key", "stock_code", "open_price", "high_price", "low_price", "close_price"]].copy()
        payload["open_price"] = pd.to_numeric(payload["open_price"], errors="coerce")
        payload["high_price"] = pd.to_numeric(payload["high_price"], errors="coerce")
        payload["low_price"] = pd.to_numeric(payload["low_price"], errors="coerce")
        payload["close_price"] = pd.to_numeric(payload["close_price"], errors="coerce")
        payload = payload.dropna(subset=["close_price"])
        conn.execute("DELETE FROM daily_close_cache WHERE file_date_key = ?", (date_key,))
        payload.to_sql("daily_close_cache", conn, if_exists="append", index=False)
        conn.commit()
        if idx % 25 == 0 or idx == total:
            print(f"[CLOSE CACHE] {idx}/{total} dates last={date_key} effective={effective_date}")
            progress = 15.0 + (13.0 * (idx / max(total, 1)))
            date_suffix = f"{date_key}" if str(date_key) == str(effective_date) else f"{date_key} (거래일 {effective_date})"
            _emit_progress(
                progress_file,
                progress_market=progress_market,
                progress_scope=progress_scope,
                progress_job_id=progress_job_id,
                progress_started_at=progress_started_at,
                progress_started_ts=progress_started_ts,
                status="running",
                percent=progress,
                message=f"국내 일봉 캐시 보강 중 {idx}/{total} · 현재 {date_suffix}",
            )


def _build_high_flags(conn: sqlite3.Connection) -> pd.DataFrame:
    rows = pd.read_sql_query(
        """
        SELECT file_date_key, stock_code, close_price AS ref_price
        FROM daily_close_cache
        ORDER BY stock_code, file_date_key
        """,
        conn,
    )
    if rows.empty:
        return pd.DataFrame(columns=["file_date_key", "stock_code", "is_52w_high", "is_60d_high", "is_20d_high"])

    rows["ref_price"] = pd.to_numeric(rows["ref_price"], errors="coerce")
    rows = rows.dropna(subset=["ref_price"]).copy()

    rolling_52w_high = (
        rows.groupby("stock_code", sort=False)["ref_price"]
        .rolling(window=252, min_periods=1)
        .max()
        .reset_index(level=0, drop=True)
    )
    rolling_20d_high = (
        rows.groupby("stock_code", sort=False)["ref_price"]
        .rolling(window=20, min_periods=1)
        .max()
        .reset_index(level=0, drop=True)
    )
    rolling_60d_high = (
        rows.groupby("stock_code", sort=False)["ref_price"]
        .rolling(window=60, min_periods=1)
        .max()
        .reset_index(level=0, drop=True)
    )
    rows["rolling_52w_high"] = rolling_52w_high
    rows["rolling_60d_high"] = rolling_60d_high
    rows["rolling_20d_high"] = rolling_20d_high
    rows["is_52w_high"] = (rows["ref_price"] >= (rows["rolling_52w_high"] - 1e-9)).astype(int)
    rows["is_60d_high"] = (rows["ref_price"] >= (rows["rolling_60d_high"] - 1e-9)).astype(int)
    rows["is_20d_high"] = (rows["ref_price"] >= (rows["rolling_20d_high"] - 1e-9)).astype(int)
    return rows[["file_date_key", "stock_code", "is_52w_high", "is_60d_high", "is_20d_high"]].copy()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", default="", help="YYYYMMDD. If provided, recompute using full history but update rows from this date forward only.")
    parser.add_argument("--progress-file", default="", help="Optional JSON progress output path.")
    parser.add_argument("--progress-market", default="kr")
    parser.add_argument("--progress-scope", default="full")
    parser.add_argument("--progress-job-id", default="")
    parser.add_argument("--progress-started-at", default="")
    parser.add_argument("--progress-started-ts", default="")
    args = parser.parse_args()
    progress_file = Path(str(args.progress_file).strip()) if str(args.progress_file).strip() else None
    progress_started_ts = float(args.progress_started_ts or 0.0) if str(args.progress_started_ts or "").strip() else time.time()
    progress_started_at = str(args.progress_started_at or "").strip() or datetime.now().isoformat(timespec="seconds")

    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    cfg = _load_config()
    score_cfg = cfg.get("score_formula", {}) if isinstance(cfg.get("score_formula"), dict) else {}
    final_cfg = cfg.get("final_score_formula", {}) if isinstance(cfg.get("final_score_formula"), dict) else {}
    trend_cfg = cfg.get("trend_adjustment_formula", {}) if isinstance(cfg.get("trend_adjustment_formula"), dict) else {}

    amount_power = float(score_cfg.get("amount_power", 1.2))
    marcap_power = float(score_cfg.get("marcap_power", 0.8))
    return_base = float(score_cfg.get("return_base", 1.1))
    return_power = float(score_cfg.get("return_power", 4.0))
    log_base = float(score_cfg.get("log_base", 1.1))
    trading_value_surge_power = float(score_cfg.get("trading_value_surge_power", 0.35))
    trading_value_surge_cap = max(float(score_cfg.get("trading_value_surge_cap", 8.0)), 1.0)
    bonus_hi = float(score_cfg.get("bonus_if_52w_high", 5.0))
    bonus_mid = float(score_cfg.get("bonus_if_20d_high", 0.0))
    bonus_lo = float(score_cfg.get("bonus_if_not_52w_high", -4.0))
    offset = float(score_cfg.get("offset", -13.0))
    missing_daily_score = float(score_cfg.get("missing_daily_score", -80.0))
    invalid_score = float(score_cfg.get("invalid_fill", missing_daily_score))

    w_today = float(final_cfg.get("weight_today", 0.1))
    w_1w = float(final_cfg.get("weight_1w", 0.5))
    w_1m = float(final_cfg.get("weight_1m", 0.0))
    w_3m = float(final_cfg.get("weight_3m", 0.4))
    sortino_power = float(final_cfg.get("sortino_power", 2.0))
    sortino_floor = max(float(final_cfg.get("sortino_floor", 0.25)), 0.25)
    sortino_tanh_scale = max(float(final_cfg.get("sortino_tanh_scale", 1.0)), 1e-6)
    sortino_min_obs = max(int(final_cfg.get("sortino_min_obs", 10)), 1)
    sortino_insufficient_value = float(final_cfg.get("sortino_insufficient_value", 0.25))
    sortino_center = 0.6

    conn = sqlite3.connect(str(DB_PATH))
    try:
        _ensure_columns(conn)

        dates = [row[0] for row in conn.execute("SELECT DISTINCT file_date_key FROM screening_rows ORDER BY file_date_key").fetchall()]
        first_date = str(dates[0]) if dates else ""
        last_date = str(dates[-1]) if dates else ""
        print(f"[INFO] dates={len(dates)} range={first_date}~{last_date}")
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=18.0,
            message=f"국내 재계산 대상 {len(dates):,}일자 확인 ({first_date} ~ {last_date})",
        )
        _fetch_missing_daily_closes(
            conn,
            dates,
            progress_file=progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
        )

        flags = _build_high_flags(conn)
        print(f"[INFO] high flags rows={len(flags)}")
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=38.0,
            message=f"국내 신고가/20일 신고가 플래그 계산 완료 ({len(flags):,}행)",
        )

        conn.execute("BEGIN")
        conn.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS _flags (
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                is_52w_high INTEGER,
                is_60d_high INTEGER,
                is_20d_high INTEGER,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        conn.execute("DELETE FROM _flags")
        flags.to_sql("_flags", conn, if_exists="append", index=False)
        conn.execute(
            """
            UPDATE screening_rows
            SET
                is_52w_high = (
                    SELECT f.is_52w_high
                    FROM _flags f
                    WHERE f.file_date_key = screening_rows.file_date_key
                      AND f.stock_code = screening_rows.stock_code
                ),
                is_60d_high = (
                    SELECT f.is_60d_high
                    FROM _flags f
                    WHERE f.file_date_key = screening_rows.file_date_key
                      AND f.stock_code = screening_rows.stock_code
                ),
                is_20d_high = (
                    SELECT f.is_20d_high
                    FROM _flags f
                    WHERE f.file_date_key = screening_rows.file_date_key
                      AND f.stock_code = screening_rows.stock_code
                )
            WHERE EXISTS (
                SELECT 1
                FROM _flags f
                WHERE f.file_date_key = screening_rows.file_date_key
                  AND f.stock_code = screening_rows.stock_code
            )
            """
        )
        conn.commit()

        print("[PHASE] screening rows load")
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=46.0,
            message="국내 점수 원본 행 로드 중",
        )
        df = pd.read_sql_query(
            """
            SELECT
                file_date_key,
                stock_code,
                market_cap_100m,
                trading_value_100m,
                change_pct,
                avg_1w,
                avg_1m,
                sortino_norm,
                COALESCE(is_52w_high, 0) AS is_52w_high,
                COALESCE(is_60d_high, 0) AS is_60d_high,
                COALESCE(is_20d_high, 0) AS is_20d_high
            FROM screening_rows
            ORDER BY stock_code, file_date_key
            """,
            conn,
        )
        if df.empty:
            print("[DONE] no rows")
            return 0
        print(f"[PHASE] screening rows ready={len(df)}")
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=52.0,
            message=f"국내 점수 원본 행 로드 완료 ({len(df):,}행)",
        )

        for col in ("market_cap_100m", "trading_value_100m", "change_pct", "avg_1w", "avg_1m", "sortino_norm", "is_52w_high", "is_60d_high", "is_20d_high"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["is_52w_high"] = df["is_52w_high"].fillna(0).astype(int)
        df["is_60d_high"] = df["is_60d_high"].fillna(0).astype(int)
        df["is_20d_high"] = df["is_20d_high"].fillna(0).astype(int)

        marcap = df["market_cap_100m"].fillna(0.0)
        amount = df["trading_value_100m"].fillna(0.0)
        chg = df["change_pct"].fillna(0.0) / 100.0

        all_dates = sorted(df["file_date_key"].astype(str).unique().tolist())
        amount_matrix = (
            df.pivot(index="stock_code", columns="file_date_key", values="trading_value_100m")
            .reindex(columns=all_dates)
        )
        print("[PHASE] close cache load")
        close_df = pd.read_sql_query(
            """
            SELECT file_date_key, stock_code, close_price, high_price, low_price
            FROM daily_close_cache
            ORDER BY stock_code, file_date_key
            """,
            conn,
        )
        print(f"[PHASE] close cache ready={len(close_df)}")
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=60.0,
            message=f"국내 종가 캐시 로드 완료 ({len(close_df):,}행)",
        )
        close_df["close_price"] = pd.to_numeric(close_df["close_price"], errors="coerce")
        close_df["high_price"] = pd.to_numeric(close_df["high_price"], errors="coerce")
        close_df["low_price"] = pd.to_numeric(close_df["low_price"], errors="coerce")
        close_matrix = (
            close_df.pivot(index="stock_code", columns="file_date_key", values="close_price")
            .reindex(columns=all_dates)
        )
        high_matrix = (
            close_df.pivot(index="stock_code", columns="file_date_key", values="high_price")
            .reindex(columns=all_dates)
        )
        low_matrix = (
            close_df.pivot(index="stock_code", columns="file_date_key", values="low_price")
            .reindex(columns=all_dates)
        )
        return_matrix = close_matrix.pct_change(axis=1, fill_method=None)
        previous_close_matrix = close_matrix.ffill(axis=1).shift(axis=1)
        intraday_range_matrix = (high_matrix - low_matrix).clip(lower=0.0)
        gap_high_matrix = (high_matrix - previous_close_matrix).abs()
        gap_low_matrix = (low_matrix - previous_close_matrix).abs()
        true_range_matrix = intraday_range_matrix.combine(gap_high_matrix, np.fmax).combine(gap_low_matrix, np.fmax)
        avg_value_20d_matrix = amount_matrix.T.shift(1).rolling(window=20, min_periods=1).mean().T
        avg_value_20d_long = (
            avg_value_20d_matrix.stack()
            .rename("avg_value_20d")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        df = df.merge(avg_value_20d_long, on=["stock_code", "file_date_key"], how="left")
        avg_value_20d_series = pd.to_numeric(df["avg_value_20d"], errors="coerce")
        surge_ratio = np.where(
            np.isfinite(avg_value_20d_series) & (avg_value_20d_series > 0),
            amount / avg_value_20d_series,
            1.0,
        )
        surge_ratio = np.where(np.isfinite(surge_ratio), surge_ratio, 1.0)
        surge_ratio = np.clip(surge_ratio, 0.0, trading_value_surge_cap)
        surge_factor = np.power(surge_ratio, trading_value_surge_power)
        core = np.where(
            marcap > 0,
            (np.power(np.maximum(amount, 0.0), amount_power) / np.power(marcap, marcap_power))
            * np.power(return_base + chg, return_power)
            * surge_factor,
            np.nan,
        )
        core = np.where(core > 0, core, np.nan)
        log_term = np.log(core) / np.log(log_base)
        bonus = np.where(
            df["is_52w_high"] == 1,
            bonus_hi,
            np.where(df["is_20d_high"] == 1, bonus_mid, bonus_lo),
        )
        score_o_new = np.where(np.isfinite(log_term), log_term + bonus + offset, invalid_score)
        df["score_o_new"] = np.round(score_o_new, 2)
        score_matrix = (
            df.pivot(index="stock_code", columns="file_date_key", values="score_o_new")
            .reindex(columns=all_dates)
            .fillna(missing_daily_score)
        )
        avg_1w_matrix = score_matrix.T.rolling(window=7, min_periods=1).sum().div(7.0).T
        avg_1m_matrix = score_matrix.T.rolling(window=20, min_periods=1).sum().div(20.0).T
        avg_3m_matrix = score_matrix.T.rolling(window=60, min_periods=1).sum().div(60.0).T
        atr_price_20_matrix = true_range_matrix.T.rolling(window=20, min_periods=1).mean().T
        atr_20_matrix = (atr_price_20_matrix / close_matrix.replace(0.0, np.nan)) * 100.0
        print(f"[PHASE] matrix build stocks={len(return_matrix.index)} dates={len(return_matrix.columns)}")
        sortino_matrix = pd.DataFrame(index=return_matrix.index, columns=return_matrix.columns, dtype=float)
        total_stocks = len(return_matrix.index)
        for stock_index, (stock_code, row_values) in enumerate(return_matrix.iterrows(), start=1):
            values = row_values.to_numpy(dtype=float)
            out = np.zeros_like(values, dtype=float)
            for i in range(len(values)):
                start = max(0, i - 19)
                out[i] = _sortino_norm_window_with_min_obs(
                    values[start : i + 1],
                    min_obs=sortino_min_obs,
                    insufficient_value=sortino_insufficient_value,
                    tanh_scale=sortino_tanh_scale,
                )
            sortino_matrix.loc[stock_code] = out
            if stock_index % 100 == 0 or stock_index == total_stocks:
                print(f"[SORTINO] {stock_index}/{total_stocks} stock={stock_code}")
                phase_progress = stock_index / max(total_stocks, 1)
                _emit_progress(
                    progress_file,
                    progress_market=args.progress_market,
                    progress_scope=args.progress_scope,
                    progress_job_id=args.progress_job_id,
                    progress_started_at=progress_started_at,
                    progress_started_ts=progress_started_ts,
                    status="running",
                    percent=65.0 + (23.0 * phase_progress),
                    message=f"국내 Sortino 계산 중 {stock_index:,}/{total_stocks:,} ({stock_code})",
                )
        avg_1w_long = (
            avg_1w_matrix.stack()
            .rename("avg_1w_new")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        avg_1m_long = (
            avg_1m_matrix.stack()
            .rename("avg_1m_new")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        avg_3m_long = (
            avg_3m_matrix.stack()
            .rename("avg_3m_new")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        atr_20_long = (
            atr_20_matrix.stack()
            .rename("atr_20_new")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        sortino_long = (
            sortino_matrix.stack()
            .rename("sortino_norm_new")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        df = df.merge(avg_1w_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(avg_1m_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(avg_3m_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(atr_20_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(sortino_long, on=["stock_code", "file_date_key"], how="left")
        df["atr_20_new"] = pd.to_numeric(df["atr_20_new"], errors="coerce").fillna(0.0)
        df["sortino_norm_new"] = pd.to_numeric(df["sortino_norm_new"], errors="coerce").fillna(sortino_insufficient_value)

        df["acceleration_bonus_new"], df["trend_break_penalty_new"] = _build_trend_adjustment(df, trend_cfg)
        composite = (df["score_o_new"] * w_today) + (df["avg_1w_new"] * w_1w) + (df["avg_1m_new"] * w_1m) + (df["avg_3m_new"] * w_3m)
        adjusted_composite = composite + df["acceleration_bonus_new"] - df["trend_break_penalty_new"]
        sortino_multiplier = np.exp(sortino_power * (df["sortino_norm_new"] - sortino_center))
        score_s_new = np.where(
            adjusted_composite >= 0,
            adjusted_composite * sortino_multiplier,
            adjusted_composite / sortino_multiplier,
        )
        df["score_s_new"] = np.round(score_s_new, 2)

        print("[PHASE] final score build")
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=90.0,
            message="국내 최종 점수 조합 중",
        )
        update_start_key = ""
        if args.start_date:
            digits = "".join(ch for ch in str(args.start_date or "") if ch.isdigit())
            if not digits or len(digits) != 8:
                raise SystemExit("--start-date must be YYYYMMDD")
            update_start_key = digits
            df = df[df["file_date_key"].astype(str) >= update_start_key].copy()

        upd = df[
            ["file_date_key", "stock_code", "is_52w_high", "is_60d_high", "is_20d_high", "score_o_new", "atr_20_new", "avg_1w_new", "avg_1m_new", "avg_3m_new", "sortino_norm_new", "score_s_new"]
        ].copy()
        upd = upd.rename(
            columns={
                "score_o_new": "score_o",
                "atr_20_new": "atr_20",
                "avg_1w_new": "avg_1w",
                "avg_1m_new": "avg_1m",
                "avg_3m_new": "avg_3m",
                "sortino_norm_new": "sortino_norm",
                "score_s_new": "score_s",
            }
        )
        _emit_progress(
            progress_file,
            progress_market=args.progress_market,
            progress_scope=args.progress_scope,
            progress_job_id=args.progress_job_id,
            progress_started_at=progress_started_at,
            progress_started_ts=progress_started_ts,
            status="running",
            percent=95.0,
            message=f"국내 DB 반영 준비 ({len(upd):,}행)",
        )

        conn.execute("BEGIN")
        conn.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS _upd (
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                is_52w_high INTEGER,
                is_60d_high INTEGER,
                is_20d_high INTEGER,
                score_o REAL,
                atr_20 REAL,
                avg_1w REAL,
                avg_1m REAL,
                avg_3m REAL,
                sortino_norm REAL,
                score_s REAL,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        conn.execute("DELETE FROM _upd")
        upd.to_sql("_upd", conn, if_exists="append", index=False)
        conn.execute(
            """
            UPDATE screening_rows
            SET
                is_52w_high = (SELECT u.is_52w_high FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                is_60d_high = (SELECT u.is_60d_high FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                is_20d_high = (SELECT u.is_20d_high FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                score_o = (SELECT u.score_o FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                atr_20 = (SELECT u.atr_20 FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                avg_1w = (SELECT u.avg_1w FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                avg_1m = (SELECT u.avg_1m FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                avg_3m = (SELECT u.avg_3m FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                sortino_norm = (SELECT u.sortino_norm FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
                score_s = (SELECT u.score_s FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code)
            WHERE EXISTS (
                SELECT 1
                FROM _upd u
                WHERE u.file_date_key = screening_rows.file_date_key
                  AND u.stock_code = screening_rows.stock_code
            )
            """
        )
        conn.commit()

        print(
            "[DONE] recalculated rows={} direct_52w=true amount_power={} return_power={} weights=({}, {}, {}, {}) trend_adjustment={} start_date={}".format(
                len(upd), amount_power, return_power, w_today, w_1w, w_1m, w_3m, bool(trend_cfg.get('enabled', True)), update_start_key or "ALL"
            )
        )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
