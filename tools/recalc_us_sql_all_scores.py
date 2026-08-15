from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


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
        raise RuntimeError(f"{env_name} 경로 후보가 없습니다.")
    return filtered[0]


screening_dir_env = str(os.getenv("STOCK_DASHBOARD_SCREENING_DIR", "") or "").strip()
DB_PATH = _resolve_existing_path(
    "STOCK_DASHBOARD_US_SCREENING_FAST_DB_PATH",
    [
        BASE_DIR / "backend" / "us_stock_daily_fast.sqlite",
        BASE_DIR / "backend" / "us_stock_daily_fast.sqlite",
    ],
)
CONFIG_PATH = _resolve_existing_path(
    "STOCK_DASHBOARD_US_SCORE_FORMULA_CONFIG_PATH",
    [
        (Path(screening_dir_env) / "us_score_formula_config.json") if screening_dir_env else None,
        BASE_DIR / "us_score_formula_config.json",
        BASE_DIR / "outputs" / "stock_daily" / "us_score_formula_config.json",
        BASE_DIR / "data" / "screening" / "current" / "us_score_formula_config.json",
    ],
)


def _load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    if not isinstance(payload, dict):
        raise RuntimeError("invalid us_score_formula_config.json")
    return payload


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


def _build_trend_adjustment(frame: pd.DataFrame, trend_cfg: dict[str, Any]) -> tuple[pd.Series, pd.Series]:
    enabled = bool(trend_cfg.get("enabled", True))
    if not enabled:
        zeros = pd.Series(np.zeros(len(frame), dtype=float), index=frame.index)
        return zeros, zeros

    today_blend_weight = float(trend_cfg.get("today_blend_weight", 0.7))
    trend_floor = float(trend_cfg.get("trend_floor", 20.0))
    acceleration_alignment_bonus = float(trend_cfg.get("acceleration_alignment_bonus", 3.0))
    acceleration_max_bonus = float(trend_cfg.get("acceleration_max_bonus", 6.0))
    acceleration_cap_ratio = max(float(trend_cfg.get("acceleration_cap_ratio", 0.25)), 1e-6)
    break_penalty_today_below_1w = float(trend_cfg.get("break_base_penalty_today_below_1w", 5.0))
    break_penalty_1w_below_1m = float(trend_cfg.get("break_base_penalty_1w_below_1m", 5.0))
    break_penalty_1m_below_3m = float(trend_cfg.get("break_base_penalty_1m_below_3m", 3.0))
    break_max_penalty = float(trend_cfg.get("break_max_penalty", 15.0))
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


def _ensure_columns(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("pragma table_info(screening_rows)").fetchall()}
    if "rank" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN rank INTEGER")
    if "is_52w_high" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN is_52w_high INTEGER")
    if "avg_1m" not in cols:
        conn.execute("ALTER TABLE screening_rows ADD COLUMN avg_1m REAL")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_screening_date ON screening_rows(file_date_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_screening_code_date ON screening_rows(stock_code, file_date_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_screening_date_score_code ON screening_rows(file_date_key, score_s DESC, stock_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_close_cache_date ON daily_close_cache(file_date_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_close_cache_code_date ON daily_close_cache(stock_code, file_date_key)")
    conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", default="", help="YYYYMMDD. full history is read, but only rows on/after this date are updated.")
    args = parser.parse_args()

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
    invalid_score = float(score_cfg.get("invalid_fill", 0.0))

    w_today = float(final_cfg.get("weight_today", 0.1))
    w_1w = float(final_cfg.get("weight_1w", 0.5))
    w_1m = float(final_cfg.get("weight_1m", 0.3))
    w_3m = float(final_cfg.get("weight_3m", 0.4))
    sortino_power = float(final_cfg.get("sortino_power", 0.4))
    sortino_floor = float(final_cfg.get("sortino_floor", 1e-6))
    sortino_tanh_scale = max(float(final_cfg.get("sortino_tanh_scale", 0.8)), 1e-6)
    sortino_min_obs = max(int(final_cfg.get("sortino_min_obs", 10)), 1)
    sortino_insufficient_value = float(final_cfg.get("sortino_insufficient_value", 0.25))

    conn = sqlite3.connect(str(DB_PATH))
    try:
        _ensure_columns(conn)
        df = pd.read_sql_query(
            """
            SELECT
                file_date,
                file_date_key,
                stock_code,
                market_cap_100m,
                trading_value_100m,
                change_pct,
                COALESCE(is_52w_high, 0) AS is_52w_high
            FROM screening_rows
            ORDER BY stock_code, file_date_key
            """,
            conn,
        )
        if df.empty:
            print("[DONE] no rows")
            return 0

        for col in ("market_cap_100m", "trading_value_100m", "change_pct", "is_52w_high"):
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
        df["score_o_new"] = np.where(np.isfinite(log_term), log_term + bonus + offset, invalid_score)

        all_dates = sorted(df["file_date_key"].astype(str).unique().tolist())
        score_matrix = (
            df.pivot(index="stock_code", columns="file_date_key", values="score_o_new")
            .reindex(columns=all_dates)
            .fillna(0.0)
        )
        avg_1w_matrix = score_matrix.shift(axis=1).T.rolling(window=7, min_periods=1).sum().div(7.0).T
        avg_1m_matrix = score_matrix.shift(axis=1).T.rolling(window=20, min_periods=1).sum().div(20.0).T
        avg_3m_matrix = score_matrix.shift(axis=1).T.rolling(window=60, min_periods=1).sum().div(60.0).T

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
        sortino_matrix = pd.DataFrame(index=return_matrix.index, columns=return_matrix.columns, dtype=float)
        for stock_code, row_values in return_matrix.iterrows():
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

        avg_1w_long = avg_1w_matrix.stack().rename("avg_1w_new").reset_index().rename(columns={"level_1": "file_date_key"})
        avg_1m_long = avg_1m_matrix.stack().rename("avg_1m_new").reset_index().rename(columns={"level_1": "file_date_key"})
        avg_3m_long = avg_3m_matrix.stack().rename("avg_3m_new").reset_index().rename(columns={"level_1": "file_date_key"})
        sortino_long = sortino_matrix.stack().rename("sortino_norm_new").reset_index().rename(columns={"level_1": "file_date_key"})
        df = df.merge(avg_1w_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(avg_1m_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(avg_3m_long, on=["stock_code", "file_date_key"], how="left")
        df = df.merge(sortino_long, on=["stock_code", "file_date_key"], how="left")
        df["avg_1w_new"] = pd.to_numeric(df["avg_1w_new"], errors="coerce")
        df["avg_1m_new"] = pd.to_numeric(df["avg_1m_new"], errors="coerce")
        df["avg_3m_new"] = pd.to_numeric(df["avg_3m_new"], errors="coerce")
        df["sortino_norm_new"] = pd.to_numeric(df["sortino_norm_new"], errors="coerce").fillna(sortino_insufficient_value)
        df["avg_1w_new"] = np.where(np.isfinite(df["avg_1w_new"]), df["avg_1w_new"], df["score_o_new"])
        df["avg_1m_new"] = np.where(np.isfinite(df["avg_1m_new"]), df["avg_1m_new"], df["score_o_new"])
        df["avg_3m_new"] = np.where(np.isfinite(df["avg_3m_new"]), df["avg_3m_new"], df["score_o_new"])

        composite = (df["score_o_new"] * w_today) + (df["avg_1w_new"] * w_1w) + (df["avg_1m_new"] * w_1m) + (df["avg_3m_new"] * w_3m)
        base_score_s_new = composite * np.power(df["sortino_norm_new"].clip(lower=sortino_floor), sortino_power)
        df["acceleration_bonus_new"], df["trend_break_penalty_new"] = _build_trend_adjustment(df, trend_cfg)
        df["score_s_new"] = base_score_s_new + df["acceleration_bonus_new"] - df["trend_break_penalty_new"]

        df["score_o_new"] = np.round(pd.to_numeric(df["score_o_new"], errors="coerce").fillna(0.0), 2)
        df["avg_1w_new"] = np.round(pd.to_numeric(df["avg_1w_new"], errors="coerce").fillna(0.0), 2)
        df["avg_1m_new"] = np.round(pd.to_numeric(df["avg_1m_new"], errors="coerce").fillna(0.0), 2)
        df["avg_3m_new"] = np.round(pd.to_numeric(df["avg_3m_new"], errors="coerce").fillna(0.0), 2)
        df["sortino_norm_new"] = np.round(pd.to_numeric(df["sortino_norm_new"], errors="coerce").fillna(sortino_insufficient_value), 4)
        df["score_s_new"] = np.round(pd.to_numeric(df["score_s_new"], errors="coerce").fillna(0.0), 2)

        rank_base = df[["file_date_key", "stock_code", "score_s_new", "score_o_new"]].copy()
        rank_base = rank_base.sort_values(["file_date_key", "score_s_new", "score_o_new", "stock_code"], ascending=[True, False, False, True])
        rank_base["rank_new"] = rank_base.groupby("file_date_key").cumcount() + 1
        df = df.merge(rank_base[["file_date_key", "stock_code", "rank_new"]], on=["file_date_key", "stock_code"], how="left")

        update_start_key = ""
        if args.start_date:
            digits = "".join(ch for ch in str(args.start_date or "") if ch.isdigit())
            if not digits or len(digits) != 8:
                raise SystemExit("--start-date must be YYYYMMDD")
            update_start_key = digits
            df = df[df["file_date_key"].astype(str) >= update_start_key].copy()

        upd = df[
            ["file_date_key", "stock_code", "rank_new", "is_52w_high", "score_o_new", "avg_1w_new", "avg_1m_new", "avg_3m_new", "sortino_norm_new", "score_s_new"]
        ].copy()
        upd = upd.rename(
            columns={
                "rank_new": "rank",
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
                rank INTEGER,
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
                rank = (SELECT u.rank FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
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
            "[DONE] us_local_recalc rows={} amount_power={} return_power={} weights=({}, {}, {}, {}) trend_adjustment={} start_date={}".format(
                len(upd), amount_power, return_power, w_today, w_1w, w_1m, w_3m, bool(trend_cfg.get("enabled", True)), update_start_key or "ALL"
            )
        )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
