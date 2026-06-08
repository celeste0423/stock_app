from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd


DEFAULT_SCREENING_DIR = Path("D:/Study/Stock_Daily")
DEFAULT_DB_PATH = Path("D:/Study/stock app/backend/stock_daily_fast.sqlite")
DEFAULT_PARQUET_PATH = Path("D:/Study/stock app/backend/stock_daily_fast.parquet")


def _date_key_from_name(name: str) -> str:
    m = re.match(r"^(20\d{6})_", name)
    return m.group(1) if m else ""


def _to_num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _pick_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _normalize_frame(path: Path, date_key: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0)
    df = df.rename(columns=lambda c: str(c).strip())

    col_code = _pick_col(df, ["stock_code", "종목코드", "code"])
    col_name = _pick_col(df, ["stock_name", "종목 이름", "종목명", "name"])
    col_sector = _pick_col(df, ["sector", "섹터"])
    col_industry = _pick_col(df, ["industry", "업종", "업종구분"])
    col_mcap = _pick_col(df, ["market_cap_100m", "시총 (억원)", "시가총액", "시총"])
    col_tv = _pick_col(df, ["trading_value_100m", "거래대금(억원)", "거래대금"])
    col_chg = _pick_col(df, ["change_pct", "등락률"])
    col_score_o = _pick_col(df, ["score_o", "점수", "O열점수"])
    col_avg_1w = _pick_col(df, ["avg_1w", "1W 평균 점수", "1W 평균"])
    col_avg_3m = _pick_col(df, ["avg_3m", "3M 평균 점수", "1M 평균 점수", "1M 평균"])
    col_sortino = _pick_col(df, ["sortino_norm", "60일기준 Sortino 정규화 점수", "20일기준 Sortino 정규화 점수"])
    col_score_s = _pick_col(df, ["score_s", "종합 점수", "종합점수"])
    col_note = _pick_col(df, ["note", "비고"])

    required = {
        "stock_code": col_code,
        "stock_name": col_name,
        "market_cap_100m": col_mcap,
        "trading_value_100m": col_tv,
        "change_pct": col_chg,
        "score_o": col_score_o,
        "avg_1w": col_avg_1w,
        "avg_3m": col_avg_3m,
        "sortino_norm": col_sortino,
        "score_s": col_score_s,
    }
    missing = [k for k, v in required.items() if v is None]
    if missing:
        raise ValueError(f"필수 컬럼 누락: {missing}")

    out = pd.DataFrame(
        {
            "file_date": f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:]}",
            "file_date_key": date_key,
            "stock_code": df[col_code].astype(str).str.replace(r"\D", "", regex=True).str.zfill(6),
            "stock_name": df[col_name].fillna("").astype(str).str.strip(),
            "sector": (df[col_sector] if col_sector else "").fillna("").astype(str).str.strip(),
            "industry": (df[col_industry] if col_industry else "").fillna("").astype(str).str.strip(),
            "market_cap_100m": _to_num(df[col_mcap]),
            "trading_value_100m": _to_num(df[col_tv]),
            "change_pct": _to_num(df[col_chg]),
            "score_o": _to_num(df[col_score_o]),
            "avg_1w": _to_num(df[col_avg_1w]),
            "avg_3m": _to_num(df[col_avg_3m]),
            "sortino_norm": _to_num(df[col_sortino]),
            "score_s": _to_num(df[col_score_s]),
            "note": (df[col_note] if col_note else "").fillna("").astype(str),
        }
    )

    out = out[out["stock_code"].str.len() == 6].copy()
    out = out.drop_duplicates(subset=["file_date_key", "stock_code"], keep="last")
    return out


def _init_db(conn: sqlite3.Connection) -> None:
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
            avg_3m REAL,
            sortino_norm REAL,
            score_s REAL,
            note TEXT,
            PRIMARY KEY (file_date_key, stock_code)
        )
        """
    )
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
    conn.commit()


def _upsert_frame(conn: sqlite3.Connection, frame: pd.DataFrame, file_name: str, file_mtime: float) -> int:
    if frame.empty:
        return 0
    date_key = str(frame.iloc[0]["file_date_key"])
    conn.execute("DELETE FROM screening_rows WHERE file_date_key = ?", (date_key,))
    frame.to_sql("screening_rows", conn, if_exists="append", index=False)
    conn.execute(
        """
        INSERT INTO file_meta(file_date_key, file_name, file_mtime)
        VALUES(?, ?, ?)
        ON CONFLICT(file_date_key) DO UPDATE SET
            file_name=excluded.file_name,
            file_mtime=excluded.file_mtime
        """,
        (date_key, file_name, file_mtime),
    )
    conn.commit()
    return len(frame)


def _load_meta(conn: sqlite3.Connection) -> dict[str, float]:
    cur = conn.execute("SELECT file_date_key, file_mtime FROM file_meta")
    return {str(r[0]): float(r[1]) for r in cur.fetchall()}


def build_store(screening_dir: Path, db_path: Path, parquet_path: Path, mode: str = "incremental") -> dict[str, Any]:
    files = sorted(p for p in screening_dir.glob("*.xlsx") if _date_key_from_name(p.name))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    _init_db(conn)
    meta = _load_meta(conn)

    updated_files = 0
    updated_rows = 0

    for path in files:
        date_key = _date_key_from_name(path.name)
        mtime = path.stat().st_mtime
        if mode == "incremental" and date_key in meta and abs(meta[date_key] - mtime) < 1e-6:
            continue
        try:
            frame = _normalize_frame(path, date_key)
            rows = _upsert_frame(conn, frame, path.name, mtime)
            updated_files += 1
            updated_rows += rows
        except Exception as e:
            print(f"[WARN] skip {path.name}: {e}")

    if updated_files > 0 or (not parquet_path.exists()):
        full = pd.read_sql_query("SELECT * FROM screening_rows ORDER BY file_date_key, score_s DESC", conn)
        parquet_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            full.to_parquet(parquet_path, index=False)
        except Exception as e:
            print(f"[WARN] parquet write skipped: {e}")

    conn.close()
    return {
        "files_total": len(files),
        "files_updated": updated_files,
        "rows_updated": updated_rows,
        "db_path": str(db_path),
        "parquet_path": str(parquet_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--screening-dir", default=str(DEFAULT_SCREENING_DIR))
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    parser.add_argument("--parquet-path", default=str(DEFAULT_PARQUET_PATH))
    parser.add_argument("--mode", choices=["full", "incremental"], default="incremental")
    args = parser.parse_args()

    out = build_store(
        screening_dir=Path(args.screening_dir),
        db_path=Path(args.db_path),
        parquet_path=Path(args.parquet_path),
        mode=args.mode,
    )
    print(f"[DONE] files_total={out['files_total']} files_updated={out['files_updated']} rows_updated={out['rows_updated']}")
    print(f"[DONE] db={out['db_path']}")
    print(f"[DONE] parquet={out['parquet_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

