from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
VENDOR_DIR = ROOT_DIR / "backend" / "vendor"
if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

import FinanceDataReader as fdr
import numpy as np
import pandas as pd


LEGACY_OUTPUT_DIR = Path("D:/Study/Stock_Daily")
OUTPUT_DIR = Path(
    os.getenv(
        "STOCK_DAILY_OUTPUT_DIR",
        str(LEGACY_OUTPUT_DIR if LEGACY_OUTPUT_DIR.exists() else (ROOT_DIR / "outputs" / "stock_daily")),
    )
)
FORMULA_CONFIG_PATH = OUTPUT_DIR / "score_formula_config.json"
FAST_DB_PATH = Path(os.getenv("STOCK_DAILY_US_FAST_DB_PATH", str(ROOT_DIR / "backend" / "us_stock_daily_fast.sqlite")))
FAST_PARQUET_PATH = Path(os.getenv("STOCK_DAILY_US_FAST_PARQUET_PATH", str(ROOT_DIR / "backend" / "us_stock_daily_fast.parquet")))

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
        "weight_1m": 0.3,
        "weight_3m": 0.4,
        "sortino_power": 0.4,
        "sortino_floor": 1e-6,
    },
    "trend_adjustment_formula": {
        "enabled": True,
        "today_blend_weight": 0.7,
        "trend_floor": 20.0,
        "acceleration_alignment_bonus": 3.0,
        "acceleration_max_bonus": 6.0,
        "acceleration_cap_ratio": 0.25,
        "break_base_penalty_today_below_1w": 5.0,
        "break_base_penalty_1w_below_1m": 5.0,
        "break_base_penalty_1m_below_3m": 3.0,
        "break_max_penalty": 15.0,
        "break_cap_ratio": 0.2,
    },
}

YAHOO_FINANCIAL_TYPES = [
    "trailingMarketCap",
    "quarterlyMarketCap",
    "annualMarketCap",
]


@dataclass
class BuildConfig:
    date_key: str
    min_market_cap_usd: float = 2_000_000_000.0
    max_workers: int = 20
    universe_limit: int = 1800


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
    for key in ("score_formula", "final_score_formula", "trend_adjustment_formula"):
        if isinstance(raw.get(key), dict):
            merged[key].update(raw[key])
    return merged


def _normalize_symbol(value: Any) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return ""
    if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,11}", text):
        return ""
    return text


def _resolve_available_market_date(date_key: str) -> str:
    probe_start = datetime.strptime(date_key, "%Y%m%d").date()
    best_date = ""
    try:
        response = requests.get(
            "https://query1.finance.yahoo.com/v8/finance/chart/AAPL",
            params={"range": "1mo", "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
        )
        response.raise_for_status()
        result = (response.json().get("chart", {}).get("result") or [{}])[0]
        meta = result.get("meta") or {}
        market_tz = ZoneInfo(str(meta.get("exchangeTimezoneName") or "").strip() or "America/New_York")
        local_dates = [
            datetime.fromtimestamp(int(value), timezone.utc).astimezone(market_tz).strftime("%Y%m%d")
            for value in (result.get("timestamp") or [])
            if value and datetime.fromtimestamp(int(value), timezone.utc).astimezone(market_tz).date() <= probe_start
        ]
        if local_dates:
            best_date = max(local_dates)
    except Exception:
        best_date = ""
    for offset in range(8):
        probe = probe_start - timedelta(days=offset)
        start = (probe - timedelta(days=7)).isoformat()
        try:
            frame = fdr.DataReader("AAPL", start, probe.isoformat())
        except Exception:
            continue
        if frame is None or frame.empty:
            continue
        frame = frame.reset_index()
        if "Date" not in frame.columns:
            frame = frame.rename(columns={frame.columns[0]: "Date"})
        frame["Date"] = pd.to_datetime(frame["Date"], errors="coerce")
        frame = frame.dropna(subset=["Date"])
        if frame.empty:
            continue
        candidate = frame["Date"].max().strftime("%Y%m%d")
        if candidate > best_date:
            best_date = candidate
        break
    if not best_date:
        raise RuntimeError(f"No available US market date on or before {date_key}")
    return best_date


def _load_us_listing() -> pd.DataFrame:
    listing = fdr.StockListing("S&P500").copy()
    listing["Symbol"] = listing["Symbol"].map(_normalize_symbol)
    listing = listing[listing["Symbol"] != ""].copy()
    listing = listing.drop_duplicates(subset=["Symbol"], keep="first").reset_index(drop=True)
    listing["Sector"] = listing.get("Sector", pd.Series(index=listing.index, dtype=object)).fillna("")
    listing["Industry"] = listing.get("Industry", pd.Series(index=listing.index, dtype=object)).fillna("")
    listing["exchange"] = "S&P500"
    return listing


def _load_yahoo_chart_meta(symbol: str) -> dict[str, Any]:
    response = requests.get(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"range": "1y", "interval": "1d"},
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()
    result = (response.json().get("chart", {}).get("result") or [{}])[0]
    meta = result.get("meta", {}) or {}
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = [float(value) for value in quote.get("close", []) if value not in (None, "")]
    first_close = closes[0] if closes else None
    last_close = closes[-1] if closes else None
    previous_close = closes[-2] if len(closes) >= 2 else float(meta.get("chartPreviousClose") or meta.get("previousClose") or 0.0)
    return {
        "price": float(meta.get("regularMarketPrice") or meta.get("previousClose") or 0.0),
        "previous_close": previous_close,
        "volume": float(meta.get("regularMarketVolume") or 0.0),
        "exchange": str(meta.get("fullExchangeName") or meta.get("exchangeName") or ""),
        "one_year_return_pct": ((last_close / first_close - 1.0) * 100.0) if first_close and last_close else None,
    }


def _load_yahoo_financial_timeseries(symbol: str) -> dict[str, Any]:
    response = requests.get(
        f"https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{symbol}",
        params={
            "symbol": symbol,
            "type": ",".join(YAHOO_FINANCIAL_TYPES),
            "period1": 0,
            "period2": int(datetime.now().timestamp()),
        },
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def _yahoo_timeseries_items(payload: dict[str, Any], type_name: str) -> list[dict[str, Any]]:
    for item in payload.get("timeseries", {}).get("result", []) or []:
        rows = item.get(type_name)
        if isinstance(rows, list):
            return rows
    return []


def _yahoo_latest_value(payload: dict[str, Any], type_names: list[str]) -> float | None:
    best: dict[str, Any] | None = None
    for type_name in type_names:
        for row in _yahoo_timeseries_items(payload, type_name):
            reported = row.get("reportedValue") or {}
            value = reported.get("raw")
            if value in (None, ""):
                continue
            if not best or str(row.get("asOfDate") or "") >= str(best.get("asOfDate") or ""):
                best = row
    if not best:
        return None
    value = (best.get("reportedValue") or {}).get("raw")
    return float(value) if value not in (None, "") else None


def _fetch_snapshot_for_symbol(symbol: str, stock_name: str) -> dict[str, Any] | None:
    try:
        chart_meta = _load_yahoo_chart_meta(symbol)
        timeseries = _load_yahoo_financial_timeseries(symbol)
    except Exception:
        return None
    price = float(chart_meta.get("price") or 0.0)
    previous_close = float(chart_meta.get("previous_close") or 0.0)
    volume = float(chart_meta.get("volume") or 0.0)
    market_cap = _yahoo_latest_value(timeseries, YAHOO_FINANCIAL_TYPES)
    if price <= 0 or volume <= 0 or market_cap in (None, 0):
        return None
    change_pct = ((price / previous_close) - 1.0) * 100.0 if previous_close > 0 else 0.0
    return {
        "Symbol": symbol,
        "stock_name": stock_name,
        "close_price": price,
        "volume": volume,
        "market_cap": float(market_cap),
        "change_pct": change_pct,
        "exchange": str(chart_meta.get("exchange") or ""),
    }


def _fetch_us_snapshots(listing: pd.DataFrame, max_workers: int) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_fetch_snapshot_for_symbol, row.Symbol, str(row.Name or row.Symbol)): row.Symbol
            for row in listing.itertuples(index=False)
        }
        for future in as_completed(futures):
            payload = future.result()
            if payload:
                rows.append(payload)
    return pd.DataFrame(rows)


def _calc_history_metrics(symbol: str, end_date: str) -> dict[str, float]:
    try:
        hist = fdr.DataReader(symbol, start="2025-01-01", end=f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:]}")
    except Exception:
        return {"sortino_norm": 0.5, "is_52w_high": 0}
    if hist is None or hist.empty or "Close" not in hist.columns:
        return {"sortino_norm": 0.5, "is_52w_high": 0}
    close = pd.to_numeric(hist["Close"], errors="coerce").dropna()
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
        ratio = max(min(float(adjusted_mean / downside_dev), 20.0), -20.0)
        sortino_norm = float(1.0 / (1.0 + math.exp(-ratio)))
    recent_252 = close.tail(252)
    is_52w_high = int(not recent_252.empty and float(close.iloc[-1]) >= float(recent_252.max()))
    return {"sortino_norm": sortino_norm, "is_52w_high": is_52w_high}


def _load_recent_score_history_map(conn: sqlite3.Connection, target_date: str, symbols: list[str]) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    if not symbols:
        return {}, {}, {}
    date_rows = conn.execute(
        "SELECT file_date_key FROM file_meta WHERE file_date_key < ? ORDER BY file_date_key DESC LIMIT 60",
        (target_date,),
    ).fetchall()
    recent_dates = [str(row[0]) for row in date_rows if row and row[0]]
    if not recent_dates:
        return {}, {}, {}
    placeholders_dates = ",".join(["?"] * len(recent_dates))
    placeholders_symbols = ",".join(["?"] * len(symbols))
    params: list[Any] = [*recent_dates, *symbols]
    query = f"""
        SELECT file_date_key, stock_code, score_o
        FROM screening_rows
        WHERE file_date_key IN ({placeholders_dates})
          AND stock_code IN ({placeholders_symbols})
        ORDER BY file_date_key ASC
    """
    frame = pd.read_sql_query(query, conn, params=params)
    if frame.empty:
        return {}, {}, {}
    frame["score_o"] = pd.to_numeric(frame["score_o"], errors="coerce")
    frame = frame.dropna(subset=["score_o"])
    avg_1w: dict[str, float] = {}
    avg_1m: dict[str, float] = {}
    avg_3m: dict[str, float] = {}
    recent_dates_sorted = sorted(recent_dates)
    for stock_code, group in frame.groupby("stock_code", sort=False):
        score_map = {str(row.file_date_key): float(row.score_o) for row in group.itertuples(index=False)}
        values = np.array([score_map.get(date_key, 0.0) for date_key in recent_dates_sorted], dtype=float)
        if values.size == 0:
            continue
        avg_1w[str(stock_code)] = float(values[-7:].sum() / 7.0)
        avg_1m[str(stock_code)] = float(values[-20:].sum() / 20.0)
        avg_3m[str(stock_code)] = float(values[-60:].sum() / 60.0)
    return avg_1w, avg_1m, avg_3m


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
    formula_cfg = _load_formula_config()
    score_cfg = formula_cfg.get("score_formula", {})
    final_cfg = formula_cfg.get("final_score_formula", {})
    trend_cfg = formula_cfg.get("trend_adjustment_formula", {})

    listing = _load_us_listing()
    quote_df = _fetch_us_snapshots(listing, config.max_workers)
    if quote_df.empty:
        raise RuntimeError("US quote snapshot is empty.")
    base = listing.merge(quote_df, on="Symbol", how="inner")
    if "Name" in base.columns and "stock_name" not in base.columns:
        base["stock_name"] = base["Name"]
    if "stock_name" not in base.columns:
        base["stock_name"] = base["Symbol"]
    if "exchange_y" in base.columns and "exchange" not in base.columns:
        base["exchange"] = base["exchange_y"]
    elif "exchange_x" in base.columns and "exchange" not in base.columns:
        base["exchange"] = base["exchange_x"]
    base["market_cap"] = pd.to_numeric(base["market_cap"], errors="coerce")
    base["close_price"] = pd.to_numeric(base["close_price"], errors="coerce")
    base["volume"] = pd.to_numeric(base["volume"], errors="coerce")
    base["change_pct"] = pd.to_numeric(base["change_pct"], errors="coerce")
    base = base.dropna(subset=["market_cap", "close_price", "volume", "change_pct"]).copy()
    base = base[base["market_cap"] >= float(config.min_market_cap_usd)].copy()
    base["trading_value"] = base["close_price"] * base["volume"]
    base["market_cap_100m"] = base["market_cap"] / 100_000_000.0
    base["trading_value_100m"] = base["trading_value"] / 100_000_000.0
    base = base.sort_values(["market_cap", "trading_value"], ascending=False).head(max(200, int(config.universe_limit))).copy()
    if base.empty:
        raise RuntimeError("No US stocks above market-cap threshold.")

    history_rows: dict[str, dict[str, float]] = {}
    with ThreadPoolExecutor(max_workers=config.max_workers) as executor:
        futures = {
            executor.submit(_calc_history_metrics, row.Symbol, config.date_key): row.Symbol
            for row in base.itertuples(index=False)
        }
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                history_rows[symbol] = future.result()
            except Exception:
                history_rows[symbol] = {"sortino_norm": 0.5, "is_52w_high": 0}

    base["sortino_norm"] = base["Symbol"].map(lambda s: history_rows.get(s, {}).get("sortino_norm", 0.5))
    base["is_52w_high"] = base["Symbol"].map(lambda s: int(history_rows.get(s, {}).get("is_52w_high", 0)))

    amount_100m = pd.to_numeric(base["trading_value_100m"], errors="coerce").fillna(0.0)
    marcap_100m = pd.to_numeric(base["market_cap_100m"], errors="coerce").fillna(0.0)
    chg = base["change_pct"] / 100.0

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

    avg_1w_map: dict[str, float] = {}
    avg_1m_map: dict[str, float] = {}
    avg_3m_map: dict[str, float] = {}
    if FAST_DB_PATH.exists():
        with sqlite3.connect(str(FAST_DB_PATH)) as conn:
            avg_1w_map, avg_1m_map, avg_3m_map = _load_recent_score_history_map(conn, config.date_key, base["Symbol"].tolist())
    base["avg_1w"] = base["Symbol"].map(lambda s: avg_1w_map.get(s, np.nan))
    base["avg_1m"] = base["Symbol"].map(lambda s: avg_1m_map.get(s, np.nan))
    base["avg_3m"] = base["Symbol"].map(lambda s: avg_3m_map.get(s, np.nan))
    base["avg_1w"] = np.where(np.isfinite(base["avg_1w"]), base["avg_1w"], base["score_o"])
    base["avg_1m"] = np.where(np.isfinite(base["avg_1m"]), base["avg_1m"], base["score_o"])
    base["avg_3m"] = np.where(np.isfinite(base["avg_3m"]), base["avg_3m"], base["score_o"])

    weight_today = float(final_cfg.get("weight_today", 0.1))
    weight_1w = float(final_cfg.get("weight_1w", 0.5))
    weight_1m = float(final_cfg.get("weight_1m", 0.3))
    weight_3m = float(final_cfg.get("weight_3m", 0.1))
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

    base = base.sort_values(["score_s", "score_o"], ascending=False).reset_index(drop=True)
    base["rank"] = np.arange(1, len(base) + 1)
    base["sector"] = base.get("Sector", pd.Series(index=base.index, dtype=object)).fillna("").astype(str).str.strip()
    base["industry"] = base.get("Industry", pd.Series(index=base.index, dtype=object)).fillna("").astype(str).str.strip()
    base["stock_code"] = base["Symbol"]
    base["note"] = ""

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
    out["is_52w_high"] = base["is_52w_high"].astype(int)
    for column in ("market_cap_100m", "trading_value_100m", "change_pct", "score_o", "avg_1w", "avg_1m", "avg_3m", "sortino_norm", "score_s"):
        out[column] = pd.to_numeric(out[column], errors="coerce")
    out["market_cap_100m"] = out["market_cap_100m"].round(2)
    out["trading_value_100m"] = out["trading_value_100m"].round(2)
    out["change_pct"] = out["change_pct"].round(2)
    out["score_o"] = out["score_o"].round(2)
    out["avg_1w"] = out["avg_1w"].round(2)
    out["avg_1m"] = out["avg_1m"].round(2)
    out["avg_3m"] = out["avg_3m"].round(2)
    out["sortino_norm"] = out["sortino_norm"].round(4)
    out["score_s"] = out["score_s"].round(2)
    close_frame["close_price"] = pd.to_numeric(close_frame["close_price"], errors="coerce").fillna(0.0).round(4)
    return out, close_frame


def _write_sql(date_key: str, out: pd.DataFrame, close_frame: pd.DataFrame) -> None:
    FAST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    file_date = f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:]}"
    payload = out.copy()
    payload["file_date"] = file_date
    payload["file_date_key"] = date_key
    close_payload = close_frame.copy()
    close_payload["file_date_key"] = date_key
    with sqlite3.connect(str(FAST_DB_PATH)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS screening_rows (
                file_date TEXT NOT NULL,
                file_date_key TEXT NOT NULL,
                rank INTEGER,
                stock_code TEXT NOT NULL,
                stock_name TEXT,
                sector TEXT,
                industry TEXT,
                market_cap_100m REAL,
                trading_value_100m REAL,
                change_pct REAL,
                score_o REAL,
                is_52w_high INTEGER,
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
        existing_columns = {
            str(row[1])
            for row in conn.execute("PRAGMA table_info(screening_rows)").fetchall()
            if row and len(row) > 1
        }
        if "rank" not in existing_columns:
            conn.execute("ALTER TABLE screening_rows ADD COLUMN rank INTEGER")
        if "is_52w_high" not in existing_columns:
            conn.execute("ALTER TABLE screening_rows ADD COLUMN is_52w_high INTEGER")
        if "avg_1m" not in existing_columns:
            conn.execute("ALTER TABLE screening_rows ADD COLUMN avg_1m REAL")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_screening_date ON screening_rows(file_date_key)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_screening_code_date ON screening_rows(stock_code, file_date_key)")
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
            (date_key, f"{date_key}_us_daily_screening.xlsx"),
        )
        conn.commit()
        try:
            full = pd.read_sql_query("SELECT * FROM screening_rows ORDER BY file_date_key, score_s DESC, stock_code ASC", conn)
            full.to_parquet(FAST_PARQUET_PATH, index=False)
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYYMMDD")
    parser.add_argument("--min-market-cap-usd", type=float, default=2_000_000_000.0)
    parser.add_argument("--max-workers", type=int, default=20)
    parser.add_argument("--universe-limit", type=int, default=1800)
    args = parser.parse_args()

    date_key = re.sub(r"\D", "", str(args.date))
    if not re.fullmatch(r"20\d{6}", date_key):
        raise SystemExit("invalid date format, use YYYYMMDD")
    effective_date = _resolve_available_market_date(date_key)
    config = BuildConfig(
        date_key=effective_date,
        min_market_cap_usd=float(args.min_market_cap_usd),
        max_workers=max(1, int(args.max_workers)),
        universe_limit=max(200, int(args.universe_limit)),
    )
    out, close_frame = _build_frame(config)
    _write_sql(effective_date, out, close_frame)
    print(
        f"[DONE] us_sql_only rows={len(out)} requested_date={date_key} "
        f"effective_date={effective_date} db={FAST_DB_PATH}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
