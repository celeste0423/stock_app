from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd


DB_PATH = Path("D:/Study/stock app/backend/stock_daily_fast.sqlite")
CONFIG_PATH = Path("D:/Study/Stock_Daily/score_formula_config.json")


def _load_weights() -> tuple[float, float, float, float, float]:
    default = {
        "weight_today": 0.35,
        "weight_1w": 0.45,
        "weight_3m": 0.2,  # preferred key
        "sortino_power": 0.8,
        "sortino_floor": 1e-6,
    }
    if CONFIG_PATH.exists():
        try:
            payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                cfg = payload.get("final_score_formula", {})
                if isinstance(cfg, dict):
                    default.update(cfg)
        except Exception:
            pass
    weight_3m = float(default.get("weight_3m", 0.0))
    return (
        float(default["weight_today"]),
        float(default["weight_1w"]),
        weight_3m,
        float(default["sortino_power"]),
        float(default["sortino_floor"]),
    )


def main() -> int:
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    w_today, w_1w, w_3m, sortino_power, sortino_floor = _load_weights()

    conn = sqlite3.connect(str(DB_PATH))
    try:
        df = pd.read_sql_query(
            """
            SELECT
                file_date_key,
                stock_code,
                score_o,
                avg_1w,
                sortino_norm
            FROM screening_rows
            ORDER BY stock_code, file_date_key
            """,
            conn,
        )
        if df.empty:
            print("[DONE] no rows")
            return 0

        df["score_o"] = pd.to_numeric(df["score_o"], errors="coerce")
        df["avg_1w"] = pd.to_numeric(df["avg_1w"], errors="coerce")
        df["sortino_norm"] = pd.to_numeric(df["sortino_norm"], errors="coerce").fillna(0.5)

        # 3M average over latest 60 trading rows per stock in DB timeline
        df["avg_3m_new"] = (
            df.groupby("stock_code", sort=False)["score_o"]
            .rolling(window=60, min_periods=1)
            .sum()
            .div(60.0)
            .reset_index(level=0, drop=True)
        )
        df["avg_1w_eff"] = df["avg_1w"].where(df["avg_1w"].notna(), df["score_o"])

        composite = (df["score_o"] * w_today) + (df["avg_1w_eff"] * w_1w) + (df["avg_3m_new"] * w_3m)
        sortino = df["sortino_norm"].clip(lower=sortino_floor)
        down_factor = (2.0 - df["sortino_norm"]).clip(lower=sortino_floor)
        final_score = np.where(
            composite >= 0,
            composite * np.power(sortino, sortino_power),
            composite * np.power(down_factor, sortino_power),
        )

        df["avg_3m_new"] = df["avg_3m_new"].round(2)
        df["score_s_new"] = np.round(final_score, 2)

        updates = df[["file_date_key", "stock_code", "avg_3m_new", "score_s_new"]].copy()

        conn.execute("BEGIN")
        conn.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS _upd (
                file_date_key TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                avg_3m REAL,
                score_s REAL,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        conn.execute("DELETE FROM _upd")
        updates.rename(columns={"avg_3m_new": "avg_3m", "score_s_new": "score_s"}).to_sql(
            "_upd", conn, if_exists="append", index=False
        )
        conn.execute(
            """
            UPDATE screening_rows
            SET
                avg_3m = (SELECT u.avg_3m FROM _upd u WHERE u.file_date_key = screening_rows.file_date_key AND u.stock_code = screening_rows.stock_code),
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
            f"[DONE] updated_rows={len(updates)} "
            f"weights(today={w_today},1w={w_1w},3m={w_3m},power={sortino_power},floor={sortino_floor})"
        )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
