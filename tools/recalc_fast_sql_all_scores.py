from __future__ import annotations

import json
import math
import os
import sqlite3
import hashlib
from pathlib import Path
from typing import Any
from datetime import datetime

import numpy as np
import pandas as pd

try:
    from pykrx import stock as pykrx_stock
except Exception:
    pykrx_stock = None


DB_PATH = Path("D:/Study/stock app/backend/stock_daily_fast.sqlite")
CONFIG_PATH = Path("D:/Study/Stock_Daily/score_formula_config.json")
SETTINGS_PATH = Path("D:/Study/stock app/backend/local_settings.json")


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
        return 0.5
    clean = np.asarray(values, dtype=float)
    mean_return = float(np.mean(clean))
    full_vol = float(np.std(clean))
    negative_ratio = float(np.mean(clean < 0))

    # Decimal returns are smaller than 1, so a plain power(1.5) would actually
    # shrink losses. Convert to percent space first, then scale back down.
    losses_pct = np.abs(np.minimum(clean, 0.0)) * 100.0
    downside_penalty = np.power(losses_pct, 1.5) / 100.0
    downside_dev = float(np.sqrt(np.mean(np.square(downside_penalty))))
    if downside_dev <= 1e-8:
        downside_dev = 1e-8

    adjusted_mean = mean_return - (full_vol * 0.35) - (negative_ratio * 0.02)
    ratio = float(adjusted_mean / downside_dev)
    ratio = max(min(ratio, 20.0), -20.0)
    return float(1.0 / (1.0 + np.exp(-ratio)))


def _sortino_norm_window_with_min_obs(values: np.ndarray, min_obs: int = 10) -> float:
    clean = np.asarray(values, dtype=float)
    clean = clean[np.isfinite(clean)]
    if clean.size < int(min_obs):
        return 0.5
    return _sortino_norm_window(clean)


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
    if "avg_1m" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN avg_1m REAL")
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
    conn.commit()


def _fetch_missing_daily_closes(conn: sqlite3.Connection, dates: list[str]) -> None:
    if pykrx_stock is None:
        raise RuntimeError("pykrx is not installed.")

    existing = {
        row[0]
        for row in conn.execute(
            f"SELECT DISTINCT file_date_key FROM daily_close_cache WHERE file_date_key IN ({','.join(['?'] * len(dates))})",
            dates,
        ).fetchall()
    } if dates else set()
    missing = [d for d in dates if d not in existing]
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
        frame = frame.reset_index().rename(columns={"티커": "stock_code", "종가": "close_price"})
        frame["stock_code"] = frame["stock_code"].astype(str).str.zfill(6)
        frame["file_date_key"] = date_key
        payload = frame[["file_date_key", "stock_code", "close_price"]].copy()
        payload["close_price"] = pd.to_numeric(payload["close_price"], errors="coerce")
        payload = payload.dropna(subset=["close_price"])
        payload.to_sql("daily_close_cache", conn, if_exists="append", index=False)
        conn.commit()
        if idx % 25 == 0 or idx == total:
            print(f"[CLOSE CACHE] {idx}/{total} dates")


def _build_52w_flags(conn: sqlite3.Connection) -> pd.DataFrame:
    rows = pd.read_sql_query(
        """
        SELECT file_date_key, stock_code, close_price
        FROM daily_close_cache
        ORDER BY stock_code, file_date_key
        """,
        conn,
    )
    if rows.empty:
        return pd.DataFrame(columns=["file_date_key", "stock_code", "is_52w_high"])

    rows["close_price"] = pd.to_numeric(rows["close_price"], errors="coerce")
    rows = rows.dropna(subset=["close_price"]).copy()

    rolling_high = (
        rows.groupby("stock_code", sort=False)["close_price"]
        .rolling(window=252, min_periods=1)
        .max()
        .reset_index(level=0, drop=True)
    )
    rows["rolling_52w_high"] = rolling_high
    rows["is_52w_high"] = (rows["close_price"] >= (rows["rolling_52w_high"] - 1e-9)).astype(int)
    return rows[["file_date_key", "stock_code", "is_52w_high"]].copy()


def main() -> int:
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
    bonus_hi = float(score_cfg.get("bonus_if_52w_high", 5.0))
    bonus_lo = float(score_cfg.get("bonus_if_not_52w_high", -4.0))
    offset = float(score_cfg.get("offset", -13.0))
    invalid_score = 0.0

    w_today = float(final_cfg.get("weight_today", 0.1))
    w_1w = float(final_cfg.get("weight_1w", 0.5))
    w_1m = float(final_cfg.get("weight_1m", 0.0))
    w_3m = float(final_cfg.get("weight_3m", 0.4))
    sortino_power = float(final_cfg.get("sortino_power", 0.5))
    sortino_floor = float(final_cfg.get("sortino_floor", 1e-6))

    conn = sqlite3.connect(str(DB_PATH))
    try:
        _ensure_columns(conn)

        dates = [row[0] for row in conn.execute("SELECT DISTINCT file_date_key FROM screening_rows ORDER BY file_date_key").fetchall()]
        print(f"[INFO] dates={len(dates)}")
        _fetch_missing_daily_closes(conn, dates)

        flags = _build_52w_flags(conn)
        print(f"[INFO] 52w flags rows={len(flags)}")

        conn.execute("BEGIN")
        conn.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS _flags (
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                is_52w_high INTEGER,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        conn.execute("DELETE FROM _flags")
        flags.to_sql("_flags", conn, if_exists="append", index=False)
        conn.execute(
            """
            UPDATE screening_rows
            SET is_52w_high = (
                SELECT f.is_52w_high
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
                COALESCE(is_52w_high, 0) AS is_52w_high
            FROM screening_rows
            ORDER BY stock_code, file_date_key
            """,
            conn,
        )
        if df.empty:
            print("[DONE] no rows")
            return 0

        for col in ("market_cap_100m", "trading_value_100m", "change_pct", "avg_1w", "avg_1m", "sortino_norm", "is_52w_high"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["is_52w_high"] = df["is_52w_high"].fillna(0).astype(int)

        marcap = df["market_cap_100m"].fillna(0.0)
        amount = df["trading_value_100m"].fillna(0.0)
        chg = df["change_pct"].fillna(0.0) / 100.0

        core = np.where(
            marcap > 0,
            (np.power(np.maximum(amount, 0.0), amount_power) / np.power(marcap, marcap_power))
            * np.power(return_base + chg, return_power),
            np.nan,
        )
        core = np.where(core > 0, core, np.nan)
        log_term = np.log(core) / np.log(log_base)
        bonus = np.where(df["is_52w_high"] == 1, bonus_hi, bonus_lo)
        score_o_new = np.where(np.isfinite(log_term), log_term + bonus + offset, invalid_score)
        df["score_o_new"] = np.round(score_o_new, 2)

        all_dates = sorted(df["file_date_key"].astype(str).unique().tolist())
        score_matrix = (
            df.pivot(index="stock_code", columns="file_date_key", values="score_o_new")
            .reindex(columns=all_dates)
            .fillna(0.0)
        )
        close_df = pd.read_sql_query(
            """
            SELECT file_date_key, stock_code, close_price
            FROM daily_close_cache
            ORDER BY stock_code, file_date_key
            """,
            conn,
        )
        close_df["close_price"] = pd.to_numeric(close_df["close_price"], errors="coerce")
        close_matrix = (
            close_df.pivot(index="stock_code", columns="file_date_key", values="close_price")
            .reindex(columns=all_dates)
        )
        return_matrix = close_matrix.pct_change(axis=1, fill_method=None)
        avg_1w_matrix = score_matrix.T.rolling(window=7, min_periods=1).sum().div(7.0).T
        avg_1m_matrix = score_matrix.T.rolling(window=20, min_periods=1).sum().div(20.0).T
        avg_3m_matrix = score_matrix.T.rolling(window=60, min_periods=1).sum().div(60.0).T
        sortino_matrix = pd.DataFrame(index=return_matrix.index, columns=return_matrix.columns, dtype=float)
        for stock_code, row_values in return_matrix.iterrows():
            values = row_values.to_numpy(dtype=float)
            out = np.zeros_like(values, dtype=float)
            for i in range(len(values)):
                start = max(0, i - 19)
                out[i] = _sortino_norm_window_with_min_obs(values[start : i + 1], min_obs=10)
            sortino_matrix.loc[stock_code] = out
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
        sortino_long = (
            sortino_matrix.stack()
            .rename("sortino_norm_new")
            .reset_index()
            .rename(columns={"level_1": "file_date_key"})
        )
        df = df.merge(avg_1w_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(avg_1m_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(avg_3m_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(sortino_long, on=["stock_code", "file_date_key"], how="left")
        df["sortino_norm_new"] = pd.to_numeric(df["sortino_norm_new"], errors="coerce").fillna(0.5)

        composite = (df["score_o_new"] * w_today) + (df["avg_1w_new"] * w_1w) + (df["avg_1m_new"] * w_1m) + (df["avg_3m_new"] * w_3m)
        up_factor = df["sortino_norm_new"].clip(lower=sortino_floor)
        dn_factor = (2.0 - df["sortino_norm_new"]).clip(lower=sortino_floor)
        base_score_s_new = np.where(
            composite >= 0,
            composite * np.power(up_factor, sortino_power),
            composite * np.power(dn_factor, sortino_power),
        )
        df["acceleration_bonus_new"], df["trend_break_penalty_new"] = _build_trend_adjustment(df, trend_cfg)
        score_s_new = base_score_s_new + df["acceleration_bonus_new"] - df["trend_break_penalty_new"]
        df["score_s_new"] = np.round(score_s_new, 2)

        upd = df[
            ["file_date_key", "stock_code", "is_52w_high", "score_o_new", "avg_1w_new", "avg_1m_new", "avg_3m_new", "sortino_norm_new", "score_s_new"]
        ].copy()
        upd = upd.rename(
            columns={
                "score_o_new": "score_o",
                "avg_1w_new": "avg_1w",
                "avg_1m_new": "avg_1m",
                "avg_3m_new": "avg_3m",
                "sortino_norm_new": "sortino_norm",
                "score_s_new": "score_s",
            }
        )

        conn.execute("BEGIN")
        conn.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS _upd (
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                is_52w_high INTEGER,
                score_o REAL,
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
                score_o = (SELECT u.score_o FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
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
            "[DONE] recalculated rows={} direct_52w=true amount_power={} return_power={} weights=({}, {}, {}, {}) trend_adjustment={}".format(
                len(upd), amount_power, return_power, w_today, w_1w, w_1m, w_3m, bool(trend_cfg.get('enabled', True))
            )
        )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
