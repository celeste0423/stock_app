from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import hashlib
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
VENDOR_DIR = ROOT_DIR / "backend" / "vendor"
if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

import numpy as np
import pandas as pd

try:
    from pykrx import stock as pykrx_stock
except Exception:
    pykrx_stock = None


LEGACY_OUTPUT_DIR = Path("D:/Study/Stock_Daily")
OUTPUT_DIR = Path(
    os.getenv(
        "STOCK_DAILY_OUTPUT_DIR",
        str(LEGACY_OUTPUT_DIR if LEGACY_OUTPUT_DIR.exists() else (ROOT_DIR / "outputs" / "stock_daily")),
    )
)
SECTOR_DB_PATH = Path(os.getenv("STOCK_DAILY_SECTOR_DB_PATH", str(ROOT_DIR / "backend" / "sector_database.json")))
FORMULA_CONFIG_PATH = OUTPUT_DIR / "score_formula_config.json"
FAST_DB_PATH = Path(os.getenv("STOCK_DAILY_FAST_DB_PATH", str(ROOT_DIR / "backend" / "stock_daily_fast.sqlite")))
FAST_PARQUET_PATH = Path(os.getenv("STOCK_DAILY_FAST_PARQUET_PATH", str(ROOT_DIR / "backend" / "stock_daily_fast.parquet")))
SETTINGS_PATH = ROOT_DIR / "backend" / "local_settings.json"

DEFAULT_FORMULA_CONFIG: dict[str, Any] = {
    "score_formula": {
        "amount_power": 1.2,
        "marcap_power": 0.8,
        "return_base": 1.1,
        "return_power": 4.0,
        "log_base": 1.1,
        "bonus_if_52w_high": 5.0,
        "bonus_if_not_52w_high": -4.0,
        "offset": -13.0,
        "invalid_fill": 0.0,
    },
    "final_score_formula": {
        "weight_today": 0.1,
        "weight_1w": 0.5,
        "weight_3m": 0.4,
        "sortino_power": 0.4,
        "sortino_floor": 1e-6,
    },
}


@dataclass
class BuildConfig:
    date_key: str
    min_marcap_100m: float = 2000.0
    max_workers: int = 16
    krx_id: str = ""
    krx_password: str = ""


def _normalize_code(code: Any) -> str:
    digits = re.sub(r"\D", "", str(code or ""))
    return digits.zfill(6) if digits else ""


def _extract_date_key_from_name(name: str) -> str:
    match = re.match(r"^(20\d{6})_", name)
    return match.group(1) if match else ""


def _load_formula_config() -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not FORMULA_CONFIG_PATH.exists():
        FORMULA_CONFIG_PATH.write_text(
            json.dumps(DEFAULT_FORMULA_CONFIG, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return json.loads(json.dumps(DEFAULT_FORMULA_CONFIG))
    try:
        raw = json.loads(FORMULA_CONFIG_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("invalid config")
    except Exception:
        FORMULA_CONFIG_PATH.write_text(
            json.dumps(DEFAULT_FORMULA_CONFIG, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return json.loads(json.dumps(DEFAULT_FORMULA_CONFIG))
    merged = json.loads(json.dumps(DEFAULT_FORMULA_CONFIG))
    for key in ("score_formula", "final_score_formula"):
        if isinstance(raw.get(key), dict):
            merged[key].update(raw[key])
    return merged


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


def _load_sector_map() -> dict[str, str]:
    if not SECTOR_DB_PATH.exists():
        return {}
    try:
        payload = json.loads(SECTOR_DB_PATH.read_text(encoding="utf-8"))
        stock_map = payload.get("stock_map", {}) if isinstance(payload, dict) else {}
        out: dict[str, str] = {}
        for key, item in stock_map.items():
            if not isinstance(item, dict):
                continue
            code = _normalize_code(item.get("stock_code") or key)
            sector = str(item.get("sector") or "").strip()
            if code and sector:
                out[code] = sector
        return out
    except Exception:
        return {}


def _load_recent_stock_name_map(target_date: str) -> dict[str, str]:
    if not FAST_DB_PATH.exists():
        return {}
    try:
        with sqlite3.connect(str(FAST_DB_PATH)) as conn:
            row = conn.execute(
                """
                SELECT file_date_key
                FROM file_meta
                WHERE file_date_key < ?
                ORDER BY file_date_key DESC
                LIMIT 1
                """,
                (target_date,),
            ).fetchone()
            if not row or not row[0]:
                return {}
            rows = conn.execute(
                """
                SELECT stock_code, stock_name
                FROM screening_rows
                WHERE file_date_key = ?
                """,
                (str(row[0]),),
            ).fetchall()
    except Exception:
        return {}
    out: dict[str, str] = {}
    for stock_code, stock_name in rows:
        code = _normalize_code(stock_code)
        name = str(stock_name or "").strip()
        if code and name:
            out[code] = name
    return out


def _build_score_history_maps(target_date: str) -> tuple[dict[str, float], dict[str, float]]:
    if not FAST_DB_PATH.exists():
        return {}, {}
    try:
        with sqlite3.connect(str(FAST_DB_PATH)) as conn:
            date_rows = conn.execute(
                """
                SELECT file_date_key
                FROM file_meta
                WHERE file_date_key < ?
                ORDER BY file_date_key DESC
                LIMIT 60
                """,
                (target_date,),
            ).fetchall()
            recent_date_keys = [str(row[0]) for row in date_rows if row and row[0]]
            if not recent_date_keys:
                return {}, {}, {}
            recent_date_keys.reverse()
            placeholders = ",".join("?" for _ in recent_date_keys)
            score_rows = conn.execute(
                f"""
                SELECT file_date_key, stock_code, score_o
                FROM screening_rows
                WHERE file_date_key IN ({placeholders})
                  AND score_o IS NOT NULL
                """,
                recent_date_keys,
            ).fetchall()
    except Exception:
        return {}, {}, {}

    history_by_date: dict[str, dict[str, float]] = {date_key: {} for date_key in recent_date_keys}
    all_codes: set[str] = set()
    for file_date_key, stock_code, score_o in score_rows:
        date_key = str(file_date_key or "").strip()
        code = _normalize_code(stock_code)
        score = pd.to_numeric(score_o, errors="coerce")
        if not date_key or not code or not np.isfinite(score):
            continue
        history_by_date.setdefault(date_key, {})[code] = float(score)
        all_codes.add(code)

    recent_1w_dates = recent_date_keys[-7:]
    recent_1m_dates = recent_date_keys[-20:]
    avg_1w: dict[str, float] = {}
    avg_1m: dict[str, float] = {}
    avg_3m: dict[str, float] = {}
    for code in all_codes:
        avg_1w[code] = float(
            sum(float(history_by_date.get(date_key, {}).get(code, 0.0)) for date_key in recent_1w_dates) / 7.0
        )
        avg_1m[code] = float(
            sum(float(history_by_date.get(date_key, {}).get(code, 0.0)) for date_key in recent_1m_dates) / 20.0
        )
        avg_3m[code] = float(
            sum(float(history_by_date.get(date_key, {}).get(code, 0.0)) for date_key in recent_date_keys) / 60.0
        )
    return avg_1w, avg_1m, avg_3m


def _load_previous_note_map(target_date: str) -> dict[str, str]:
    if not FAST_DB_PATH.exists():
        return {}
    try:
        with sqlite3.connect(str(FAST_DB_PATH)) as conn:
            row = conn.execute(
                """
                SELECT file_date_key
                FROM file_meta
                WHERE file_date_key < ?
                ORDER BY file_date_key DESC
                LIMIT 1
                """,
                (target_date,),
            ).fetchone()
            if not row or not row[0]:
                return {}
            prev_date_key = str(row[0])
            rows = conn.execute(
                """
                SELECT stock_code, note
                FROM screening_rows
                WHERE file_date_key = ?
                """,
                (prev_date_key,),
            ).fetchall()
            out: dict[str, str] = {}
            for stock_code, note in rows:
                code = _normalize_code(stock_code)
                if code:
                    out[code] = "" if note is None else str(note).strip()
            return out
    except Exception:
        return {}


def _ensure_pykrx_login(krx_id: str = "", krx_password: str = "") -> None:
    if pykrx_stock is None:
        raise RuntimeError("pykrx is not installed.")
    if krx_id and krx_password and _should_attempt_krx_login(krx_id, krx_password):
        try:
            os.environ["KRX_ID"] = krx_id
            os.environ["KRX_PW"] = krx_password
            login_fn = getattr(pykrx_stock, "login", None)
            if callable(login_fn):
                login_fn()
            _record_krx_login_result(krx_id, krx_password, success=True)
        except Exception as exc:
            _record_krx_login_result(krx_id, krx_password, success=False, error=str(exc))


def _resolve_available_market_date(date_key: str, krx_id: str = "", krx_password: str = "") -> str:
    if pykrx_stock is None:
        raise RuntimeError("pykrx is not installed.")
    _ensure_pykrx_login(krx_id, krx_password)
    start_dt = datetime.strptime(date_key, "%Y%m%d")
    checked_dates: set[str] = set()
    for offset in range(8):
        probe_key = (start_dt - timedelta(days=offset)).strftime("%Y%m%d")
        try:
            effective_date = pykrx_stock.get_nearest_business_day_in_a_week(probe_key) or probe_key
        except Exception:
            effective_date = probe_key
        if effective_date in checked_dates:
            continue
        checked_dates.add(effective_date)
        try:
            ohlcv = pykrx_stock.get_market_ohlcv_by_ticker(effective_date, market="ALL")
        except Exception:
            continue
        if ohlcv is not None and not ohlcv.empty:
            return effective_date
    raise RuntimeError(f"pykrx snapshot fetch failed: no available market data on or before {date_key}")


def _fetch_base_snapshot(date_key: str, krx_id: str = "", krx_password: str = "") -> pd.DataFrame:
    if pykrx_stock is None:
        raise RuntimeError("pykrx is not installed.")

    effective_date = _resolve_available_market_date(date_key, krx_id, krx_password)

    ohlcv = pykrx_stock.get_market_ohlcv_by_ticker(effective_date, market="ALL")
    if ohlcv is None or ohlcv.empty:
        raise RuntimeError(f"pykrx snapshot fetch failed: {effective_date}")

    ohlcv = ohlcv.reset_index()
    if ohlcv.shape[1] < 9:
        raise RuntimeError("pykrx snapshot schema changed unexpectedly.")

    ohlcv.columns = [
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

    ohlcv["stock_code"] = ohlcv["stock_code"].astype(str).str.zfill(6)
    cached_name_map = _load_recent_stock_name_map(effective_date)
    unresolved_codes: list[str] = []
    resolved_names: list[str] = []
    for raw_code in ohlcv["stock_code"].tolist():
        code = str(raw_code or "").zfill(6)
        cached_name = str(cached_name_map.get(code) or "").strip()
        if cached_name:
            resolved_names.append(cached_name)
            continue
        unresolved_codes.append(code)
        resolved_names.append("")
    if unresolved_codes:
        fetched_names: dict[str, str] = {}
        for code in unresolved_codes:
            if code in fetched_names:
                continue
            try:
                fetched_names[code] = str(pykrx_stock.get_market_ticker_name(code) or "").strip()
            except Exception:
                fetched_names[code] = ""
        resolved_names = [name or fetched_names.get(str(code or "").zfill(6), "") for code, name in zip(ohlcv["stock_code"].tolist(), resolved_names)]
    ohlcv["stock_name"] = resolved_names
    ohlcv["market_cap"] = pd.to_numeric(ohlcv["market_cap"], errors="coerce").fillna(0.0)
    ohlcv["trading_value"] = pd.to_numeric(ohlcv["trading_value"], errors="coerce").fillna(0.0)
    ohlcv["change_pct"] = pd.to_numeric(ohlcv["change_pct"], errors="coerce").fillna(0.0)
    ohlcv["close_price"] = pd.to_numeric(ohlcv["close_price"], errors="coerce").fillna(0.0)
    return ohlcv[["stock_code", "stock_name", "market_cap", "trading_value", "change_pct", "close_price"]].copy()


def _metrics_from_close_series(close_series: pd.Series) -> dict[str, float]:
    close = pd.to_numeric(close_series, errors="coerce").dropna()
    if close.empty:
        return {"sortino_norm": 0.5, "is_52w_high": 0}
    daily_ret = close.pct_change().dropna().tail(20)
    if len(daily_ret) < 10:
        sortino_norm = 0.5
    else:
        clean = np.asarray(daily_ret.values, dtype=float)
        mean_return = float(np.mean(clean))
        full_vol = float(np.std(clean))
        negative_ratio = float(np.mean(clean < 0))
        losses_pct = np.abs(np.minimum(clean, 0.0)) * 100.0
        downside_penalty = np.power(losses_pct, 1.5) / 100.0
        downside_dev = float(np.sqrt(np.mean(np.square(downside_penalty))))
        if downside_dev <= 1e-8:
            downside_dev = 1e-8
        adjusted_mean = mean_return - (full_vol * 0.35) - (negative_ratio * 0.02)
        ratio = adjusted_mean / downside_dev
        ratio = max(min(float(ratio), 20.0), -20.0)
        sortino_norm = float(1.0 / (1.0 + math.exp(-ratio)))
    last = float(close.iloc[-1])
    recent_252 = close.tail(252)
    is_52w_high = int(not recent_252.empty and last >= float(recent_252.max()))
    return {"sortino_norm": sortino_norm, "is_52w_high": is_52w_high}


def _load_recent_close_history_map(
    conn: sqlite3.Connection,
    target_date: str,
    stock_codes: list[str],
    current_close_map: dict[str, float],
) -> dict[str, dict[str, float]]:
    if not stock_codes:
        return {}
    date_rows = conn.execute(
        "SELECT file_date_key FROM file_meta WHERE file_date_key < ? ORDER BY file_date_key DESC LIMIT 252",
        (target_date,),
    ).fetchall()
    recent_dates = [str(row[0]) for row in date_rows if row and row[0]]
    if not recent_dates:
        recent_dates = []
    placeholders_dates = ",".join("?" for _ in recent_dates) if recent_dates else ""
    placeholders_codes = ",".join("?" for _ in stock_codes)
    params: list[Any] = []
    query = ""
    if recent_dates:
        params.extend(recent_dates)
        params.extend(stock_codes)
        query = f"""
            SELECT file_date_key, stock_code, close_price
            FROM daily_close_cache
            WHERE file_date_key IN ({placeholders_dates})
              AND stock_code IN ({placeholders_codes})
            ORDER BY file_date_key ASC
        """
    else:
        params.extend(stock_codes)
        query = f"""
            SELECT file_date_key, stock_code, close_price
            FROM daily_close_cache
            WHERE 1 = 0
              AND stock_code IN ({placeholders_codes})
        """
    frame = pd.read_sql_query(query, conn, params=params)
    history_by_code: dict[str, list[tuple[str, float]]] = {str(code): [] for code in stock_codes}
    if not frame.empty:
        frame["close_price"] = pd.to_numeric(frame["close_price"], errors="coerce")
        frame = frame.dropna(subset=["close_price"])
        for row in frame.itertuples(index=False):
            code = _normalize_code(row.stock_code)
            if not code:
                continue
            history_by_code.setdefault(code, []).append((str(row.file_date_key), float(row.close_price)))
    metrics: dict[str, dict[str, float]] = {}
    for stock_code in stock_codes:
        code = _normalize_code(stock_code)
        rows = list(history_by_code.get(code, []))
        current_close = pd.to_numeric(current_close_map.get(code), errors="coerce")
        if np.isfinite(current_close):
            rows.append((target_date, float(current_close)))
        if not rows:
            metrics[code] = {"sortino_norm": 0.5, "is_52w_high": 0}
            continue
        rows.sort(key=lambda item: item[0])
        close_series = pd.Series([price for _, price in rows], dtype=float)
        metrics[code] = _metrics_from_close_series(close_series)
    return metrics


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

    score_o = pd.to_numeric(frame["score_o"], errors="coerce").fillna(0.0)
    avg_1w = pd.to_numeric(frame["avg_1w"], errors="coerce").fillna(0.0)
    avg_1m = pd.to_numeric(frame["avg_1m"], errors="coerce").fillna(0.0)
    avg_3m = pd.to_numeric(frame["avg_3m"], errors="coerce").fillna(0.0)

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


def _build_frame(config: BuildConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    formula_cfg = _load_formula_config()
    score_cfg = formula_cfg.get("score_formula", {})
    final_cfg = formula_cfg.get("final_score_formula", {})
    trend_cfg = formula_cfg.get("trend_adjustment_formula", {})
    sector_map = _load_sector_map()

    base = _fetch_base_snapshot(config.date_key, config.krx_id, config.krx_password).copy()
    base = base[base["market_cap"] >= config.min_marcap_100m * 100_000_000].copy()
    if base.empty:
        raise RuntimeError("No stocks above market-cap threshold.")

    base["sector"] = base["stock_code"].map(lambda c: sector_map.get(c, ""))
    base["industry"] = ""
    base["market_cap_100m"] = base["market_cap"] / 100_000_000.0
    base["trading_value_100m"] = base["trading_value"] / 100_000_000.0

    current_close_map = {
        _normalize_code(row.stock_code): float(row.close_price)
        for row in base[["stock_code", "close_price"]].itertuples(index=False)
        if _normalize_code(row.stock_code)
    }
    history_rows: dict[str, dict[str, float]] = {}
    avg_1w_map: dict[str, float] = {}
    avg_1m_map: dict[str, float] = {}
    avg_3m_map: dict[str, float] = {}
    if FAST_DB_PATH.exists():
        try:
            with sqlite3.connect(str(FAST_DB_PATH)) as conn:
                history_rows = _load_recent_close_history_map(conn, config.date_key, base["stock_code"].astype(str).tolist(), current_close_map)
                avg_1w_map, avg_1m_map, avg_3m_map = _build_score_history_maps(config.date_key)
        except Exception:
            history_rows = {}
            avg_1w_map = {}
            avg_1m_map = {}
            avg_3m_map = {}
    base["sortino_norm"] = base["stock_code"].map(lambda c: history_rows.get(_normalize_code(c), {}).get("sortino_norm", 0.5))
    base["is_52w_high"] = base["stock_code"].map(lambda c: int(history_rows.get(_normalize_code(c), {}).get("is_52w_high", 0)))

    chg = base["change_pct"] / 100.0
    amount_100m = pd.to_numeric(base["trading_value_100m"], errors="coerce").fillna(0.0)
    marcap_100m = pd.to_numeric(base["market_cap_100m"], errors="coerce").fillna(0.0)

    amount_power = float(score_cfg.get("amount_power", 1.2))
    marcap_power = float(score_cfg.get("marcap_power", 0.8))
    return_base = float(score_cfg.get("return_base", 1.1))
    return_power = float(score_cfg.get("return_power", 4.0))
    log_base = float(score_cfg.get("log_base", 1.1))
    bonus_if_52w_high = float(score_cfg.get("bonus_if_52w_high", 5.0))
    bonus_if_not_52w_high = float(score_cfg.get("bonus_if_not_52w_high", -4.0))
    offset = float(score_cfg.get("offset", -13.0))
    invalid_fill = float(score_cfg.get("invalid_fill", 0.0))

    core = np.where(
        marcap_100m > 0,
        (np.power(np.maximum(amount_100m, 0.0), amount_power) / np.power(marcap_100m, marcap_power))
        * np.power(return_base + chg, return_power),
        np.nan,
    )
    core = np.where(core > 0, core, np.nan)
    log_term = np.log(core) / np.log(log_base)
    high_bonus = np.where(base["is_52w_high"] == 1, bonus_if_52w_high, bonus_if_not_52w_high)
    base["score_o"] = np.where(np.isfinite(log_term), log_term + high_bonus + offset, invalid_fill)

    base["avg_1w"] = base["stock_code"].map(lambda c: avg_1w_map.get(c, np.nan))
    base["avg_1m"] = base["stock_code"].map(lambda c: avg_1m_map.get(c, np.nan))
    base["avg_3m"] = base["stock_code"].map(lambda c: avg_3m_map.get(c, np.nan))
    base["avg_1w"] = np.where(np.isfinite(base["avg_1w"]), base["avg_1w"], base["score_o"])
    base["avg_1m"] = np.where(np.isfinite(base["avg_1m"]), base["avg_1m"], base["score_o"])
    base["avg_3m"] = np.where(np.isfinite(base["avg_3m"]), base["avg_3m"], base["score_o"])

    weight_today = float(final_cfg.get("weight_today", 0.1))
    weight_1w = float(final_cfg.get("weight_1w", 0.5))
    weight_1m = float(final_cfg.get("weight_1m", 0.0))
    weight_3m = float(final_cfg.get("weight_3m", 0.4))
    sortino_power = float(final_cfg.get("sortino_power", 0.4))
    sortino_floor = float(final_cfg.get("sortino_floor", 1e-6))
    composite = (base["score_o"] * weight_today) + (base["avg_1w"] * weight_1w) + (base["avg_1m"] * weight_1m) + (base["avg_3m"] * weight_3m)
    base_score_s = np.where(
        composite >= 0,
        composite * np.power(base["sortino_norm"].clip(lower=sortino_floor), sortino_power),
        composite * np.power((2.0 - base["sortino_norm"]).clip(lower=sortino_floor), sortino_power),
    )
    base["acceleration_bonus"], base["trend_break_penalty"] = _build_trend_adjustment(base, trend_cfg)
    base["score_s"] = base_score_s + base["acceleration_bonus"] - base["trend_break_penalty"]
    previous_note_map = _load_previous_note_map(config.date_key)

    base = base.sort_values(["score_s", "score_o"], ascending=False).reset_index(drop=True)
    base["rank"] = np.arange(1, len(base) + 1)
    base["note"] = base["stock_code"].map(lambda c: previous_note_map.get(_normalize_code(c), ""))

    out = base[
        [
            "rank",
            "sector",
            "stock_code",
            "stock_name",
            "industry",
            "market_cap_100m",
            "trading_value_100m",
            "change_pct",
            "score_o",
            "avg_1w",
            "avg_1m",
            "avg_3m",
            "sortino_norm",
            "score_s",
            "note",
        ]
    ].copy()
    close_frame = base[["stock_code", "close_price"]].copy()

    out["market_cap_100m"] = out["market_cap_100m"].round(0)
    out["trading_value_100m"] = out["trading_value_100m"].round(0)
    out["change_pct"] = out["change_pct"].round(2)
    out["score_o"] = out["score_o"].round(2)
    out["avg_1w"] = out["avg_1w"].round(2)
    out["avg_1m"] = out["avg_1m"].round(2)
    out["avg_3m"] = out["avg_3m"].round(2)
    out["sortino_norm"] = out["sortino_norm"].round(4)
    out["score_s"] = out["score_s"].round(2)
    close_frame["close_price"] = pd.to_numeric(close_frame["close_price"], errors="coerce").fillna(0.0).round(2)
    return out, close_frame


def _write_sql(date_key: str, out: pd.DataFrame, close_frame: pd.DataFrame) -> None:
    FAST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    file_name = f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:]} SQL 캐시"
    file_date = f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:]}"
    payload = out.copy()
    payload["file_date"] = file_date
    payload["file_date_key"] = date_key
    payload = payload.rename(
        columns={
            "sector": "sector",
            "stock_code": "stock_code",
            "stock_name": "stock_name",
            "industry": "industry",
            "market_cap_100m": "market_cap_100m",
            "trading_value_100m": "trading_value_100m",
            "change_pct": "change_pct",
            "score_o": "score_o",
            "avg_1w": "avg_1w",
            "avg_1m": "avg_1m",
            "avg_3m": "avg_3m",
            "sortino_norm": "sortino_norm",
            "score_s": "score_s",
            "note": "note",
        }
    )
    payload = payload[
        [
            "file_date",
            "file_date_key",
            "stock_code",
            "stock_name",
            "sector",
            "industry",
            "market_cap_100m",
            "trading_value_100m",
            "change_pct",
            "score_o",
            "avg_1w",
            "avg_1m",
            "avg_3m",
            "sortino_norm",
            "score_s",
            "note",
        ]
    ].copy()

    close_payload = close_frame.copy()
    close_payload["file_date_key"] = date_key
    close_payload = close_payload[["file_date_key", "stock_code", "close_price"]]

    with sqlite3.connect(str(FAST_DB_PATH)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS screening_rows (
                file_date TEXT NOT NULL,
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                stock_name TEXT,
                sector TEXT,
                industry TEXT,
                market_cap_100m REAL,
                trading_value_100m REAL,
                change_pct REAL,
                score_o REAL,
                avg_1w REAL,
                avg_1m REAL,
                avg_3m REAL,
                sortino_norm REAL,
                score_s REAL,
                note TEXT,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        existing_columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(screening_rows)").fetchall() if row and len(row) > 1}
        if "avg_1m" not in existing_columns:
            conn.execute("ALTER TABLE screening_rows ADD COLUMN avg_1m REAL")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_screening_date ON screening_rows(file_date_key)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS file_meta (
                file_date_key TEXT PRIMARY KEY,
                file_name TEXT,
                file_mtime REAL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_close_cache (
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                close_price REAL,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_close_cache_date ON daily_close_cache(file_date_key)")
        conn.execute("DELETE FROM screening_rows WHERE file_date_key = ?", (date_key,))
        conn.execute("DELETE FROM daily_close_cache WHERE file_date_key = ?", (date_key,))
        payload.to_sql("screening_rows", conn, if_exists="append", index=False)
        close_payload.to_sql("daily_close_cache", conn, if_exists="append", index=False)
        conn.execute(
            """
            INSERT INTO file_meta(file_date_key, file_name, file_mtime)
            VALUES(?, ?, strftime('%s','now'))
            ON CONFLICT(file_date_key) DO UPDATE SET
                file_name=excluded.file_name,
                file_mtime=excluded.file_mtime
            """,
            (date_key, file_name),
        )
        conn.commit()
        try:
            full = pd.read_sql_query("SELECT * FROM screening_rows ORDER BY file_date_key, score_s DESC", conn)
            full.to_parquet(FAST_PARQUET_PATH, index=False)
        except Exception:
            pass


def _build_excel(config: BuildConfig) -> Path:
    out, _ = _build_frame(config)
    output_path = OUTPUT_DIR / f"{config.date_key}_데일리_기업스크리닝.xlsx"
    out.to_excel(output_path, index=False)
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYYMMDD")
    parser.add_argument("--krx-id", default="", help="KRX login id (optional)")
    parser.add_argument("--krx-password", default="", help="KRX login password (optional)")
    parser.add_argument("--min-marcap-100m", type=float, default=2000.0)
    parser.add_argument("--max-workers", type=int, default=16)
    parser.add_argument("--sql-only", action="store_true", help="Write directly to stock_daily_fast.sqlite without creating xlsx")
    args = parser.parse_args()

    date_key = re.sub(r"\D", "", str(args.date))
    if not re.fullmatch(r"20\d{6}", date_key):
        raise SystemExit("invalid date format, use YYYYMMDD")

    effective_date_key = _resolve_available_market_date(
        date_key,
        str(args.krx_id or "").strip(),
        str(args.krx_password or "").strip(),
    )

    config = BuildConfig(
        date_key=effective_date_key,
        min_marcap_100m=args.min_marcap_100m,
        max_workers=max(1, int(args.max_workers)),
        krx_id=str(args.krx_id or "").strip(),
        krx_password=str(args.krx_password or "").strip(),
    )
    if args.sql_only:
        out, close_frame = _build_frame(config)
        _write_sql(effective_date_key, out, close_frame)
        print(
            f"[DONE] sql_only rows={len(out)} requested_date={date_key} "
            f"effective_date={effective_date_key} db={FAST_DB_PATH}"
        )
    else:
        path = _build_excel(config)
        print(f"[DONE] requested_date={date_key} effective_date={effective_date_key} path={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
