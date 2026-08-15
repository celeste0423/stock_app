from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
VENDOR_DIR = ROOT_DIR / "backend" / "vendor"
if VENDOR_DIR.exists() and sys.platform.startswith("win"):
    sys.path.insert(0, str(VENDOR_DIR))

import FinanceDataReader as fdr
import numpy as np
import pandas as pd


LEGACY_OUTPUT_DIR = ROOT_DIR / "data" / "screening" / "current"
OUTPUT_DIR = Path(
    os.getenv(
        "STOCK_DAILY_OUTPUT_DIR",
        str(LEGACY_OUTPUT_DIR if LEGACY_OUTPUT_DIR.exists() else (ROOT_DIR / "outputs" / "stock_daily")),
    )
)
FORMULA_CONFIG_PATH = OUTPUT_DIR / "asia_score_formula_config.json"
FAST_DB_PATH = Path(os.getenv("STOCK_DAILY_ASIA_FAST_DB_PATH", str(ROOT_DIR / "backend" / "asia_stock_daily_fast.sqlite")))
FAST_PARQUET_PATH = Path(os.getenv("STOCK_DAILY_ASIA_FAST_PARQUET_PATH", str(ROOT_DIR / "backend" / "asia_stock_daily_fast.parquet")))
YAHOO_CACHE_DIR = ROOT_DIR / "backend" / ".yahoo_cache" / "asia_daily"

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
        "weight_1m": 0.0,
        "weight_3m": 0.4,
        "sortino_power": 0.8,
        "sortino_floor": 1e-6,
    },
    "trend_adjustment_formula": {
        "enabled": False,
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

TWSE_LISTING_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
TWSE_LISTING_CACHE_PATH = YAHOO_CACHE_DIR / "twse_listing.json"
ASIA_LISTING_CACHE_PATH = YAHOO_CACHE_DIR / "asia_listing.parquet"
TWSE_INDUSTRY_CODE_MAP: dict[str, str] = {
    "01": "시멘트",
    "02": "식품",
    "03": "플라스틱",
    "04": "섬유",
    "05": "전기기계",
    "06": "전기전자",
    "07": "화학",
    "08": "유리/세라믹",
    "09": "제지",
    "10": "철강",
    "11": "고무",
    "12": "자동차",
    "13": "건설",
    "14": "운송",
    "15": "관광",
    "16": "금융/보험",
    "17": "무역/백화점",
    "18": "기타",
    "19": "화학생명과학",
    "20": "기타",
    "21": "전기전자",
    "22": "전기전자",
    "23": "전자통신",
    "24": "반도체",
    "25": "컴퓨터 및 주변기기",
    "26": "광전",
    "27": "통신/네트워크",
    "28": "전자부품",
    "29": "전자유통",
    "30": "정보서비스",
    "31": "기타전자",
    "80": "관리종목",
    "91": "예탁증권",
    "XX": "기타",
}

@dataclass
class BuildConfig:
    date_key: str
    max_workers: int = 20
    universe_limit: int = 2400
    market_cap_proxy_multiplier: float = 20.0


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
    text = str(value or "").strip().upper().replace(" ", "")
    if not text:
        return ""
    if not re.fullmatch(r"[A-Z0-9:\.\-]{1,24}", text):
        return ""
    return text


def _resolve_available_market_date(date_key: str) -> str:
    probe_start = datetime.strptime(date_key, "%Y%m%d").date()
    best_date = ""
    for yahoo_symbol, default_tz in (("7203.T", "Asia/Tokyo"), ("601288.SS", "Asia/Shanghai"), ("000333.SZ", "Asia/Shanghai"), ("2330.TW", "Asia/Taipei")):
        try:
            response = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}",
                params={"range": "1mo", "interval": "1d"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=20,
            )
            response.raise_for_status()
            result = (response.json().get("chart", {}).get("result") or [{}])[0]
            meta = result.get("meta") or {}
            market_tz = ZoneInfo(str(meta.get("exchangeTimezoneName") or "").strip() or default_tz)
            local_dates = [
                datetime.fromtimestamp(int(value), timezone.utc).astimezone(market_tz).strftime("%Y%m%d")
                for value in (result.get("timestamp") or [])
                if value and datetime.fromtimestamp(int(value), timezone.utc).astimezone(market_tz).date() <= probe_start
            ]
            if local_dates:
                candidate = max(local_dates)
                if candidate > best_date:
                    best_date = candidate
        except Exception:
            continue
    for sentinel in ("TSE:7203", "SSE:601288", "SZSE:000333"):
        for offset in range(8):
            probe = probe_start - timedelta(days=offset)
            start = (probe - timedelta(days=7)).isoformat()
            try:
                frame = fdr.DataReader(sentinel, start, probe.isoformat())
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
        raise RuntimeError(f"No available Asia market date on or before {date_key}")
    return best_date


def _to_yahoo_symbol(exchange_code: str, symbol: str) -> str:
    base = str(symbol or "").strip().upper()
    if exchange_code == "TSE":
        return f"{base}.T"
    if exchange_code == "TWSE":
        return f"{base}.TW"
    if exchange_code == "SSE":
        return f"{base}.SS"
    if exchange_code == "SZSE":
        return f"{base}.SZ"
    return base


def _load_twse_listing() -> pd.DataFrame:
    payload = _load_cached_json(TWSE_LISTING_CACHE_PATH, 86400)
    if not isinstance(payload, list):
        response = requests.get(TWSE_LISTING_URL, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, list):
            _store_cached_json(TWSE_LISTING_CACHE_PATH, payload)
    if not isinstance(payload, list):
        raise RuntimeError("invalid TWSE listing payload")
    rows: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        raw_symbol = str(item.get("\u516c\u53f8\u4ee3\u865f") or "").strip().upper()
        stock_name = str(item.get("\u516c\u53f8\u7c21\u7a31") or item.get("\u516c\u53f8\u540d\u7a31") or "").strip()
        if not raw_symbol or not stock_name:
            continue
        industry_code = str(item.get("\u7522\u696d\u5225") or "").strip().upper()
        industry_name = TWSE_INDUSTRY_CODE_MAP.get(industry_code, f"산업코드 {industry_code}" if industry_code else "기타")
        rows.append(
            {
                "Symbol": f"TWSE:{raw_symbol}",
                "raw_symbol": raw_symbol,
                "Name": stock_name,
                "Sector": industry_name,
                "Industry": f"TWSE · {industry_name}",
                "exchange": "TWSE",
                "region": "TW",
                "yahoo_symbol": _to_yahoo_symbol("TWSE", raw_symbol),
            }
        )
    if not rows:
        raise RuntimeError("TWSE listing is empty")
    return pd.DataFrame(rows)


def _load_asia_listing() -> pd.DataFrame:
    try:
        if ASIA_LISTING_CACHE_PATH.exists() and (time.time() - ASIA_LISTING_CACHE_PATH.stat().st_mtime) <= 43200:
            cached_listing = pd.read_parquet(ASIA_LISTING_CACHE_PATH)
            if isinstance(cached_listing, pd.DataFrame) and not cached_listing.empty:
                return cached_listing
    except Exception:
        pass
    frames: list[pd.DataFrame] = []
    market_specs = [("TSE", "JP"), ("SSE", "CN"), ("SZSE", "CN")]
    for exchange_code, region in market_specs:
        listing = fdr.StockListing(exchange_code).copy()
        listing["Symbol"] = listing["Symbol"].map(lambda value: str(value or "").strip().upper())
        listing = listing[listing["Symbol"] != ""].copy()
        listing["raw_symbol"] = listing["Symbol"]
        listing["Symbol"] = listing["raw_symbol"].map(lambda value: f"{exchange_code}:{value}")
        listing["yahoo_symbol"] = listing["raw_symbol"].map(lambda value: _to_yahoo_symbol(exchange_code, value))
        listing["exchange"] = exchange_code
        listing["region"] = region
        listing["Sector"] = listing.get("Industry", pd.Series(index=listing.index, dtype=object)).fillna("")
        listing["Industry"] = (
            listing["exchange"].fillna("").astype(str).str.strip()
            + " · "
            + listing.get("Industry", pd.Series(index=listing.index, dtype=object)).fillna("").astype(str).str.strip()
        ).str.strip(" ·")
        frames.append(listing)
    frames.append(_load_twse_listing())
    listing = pd.concat(frames, ignore_index=True)
    listing = listing.drop_duplicates(subset=["Symbol"], keep="first").reset_index(drop=True)
    try:
        ASIA_LISTING_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        listing.to_parquet(ASIA_LISTING_CACHE_PATH, index=False)
    except Exception:
        pass
    return listing


def _cache_path(kind: str, symbol: str) -> Path:
    digest = hashlib.sha1(symbol.encode("utf-8")).hexdigest()[:16]
    safe_symbol = re.sub(r"[^A-Za-z0-9._-]+", "_", symbol)[:40] or "symbol"
    return YAHOO_CACHE_DIR / kind / f"{safe_symbol}_{digest}.json"


def _load_cached_json(path: Path, max_age_seconds: int) -> Any | None:
    try:
        if not path.exists():
            return None
        if max_age_seconds > 0 and (time.time() - path.stat().st_mtime) > max_age_seconds:
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _store_cached_json(path: Path, payload: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def _load_cached_yahoo_json(url: str, params: dict[str, Any], cache_path: Path, *, max_age_seconds: int = 43200) -> dict[str, Any]:
    cached = _load_cached_json(cache_path, max_age_seconds)
    if isinstance(cached, dict):
        return cached
    response = requests.get(
        url,
        params=params,
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict):
        _store_cached_json(cache_path, payload)
    return payload


def _load_yahoo_chart_result(symbol: str) -> dict[str, Any]:
    payload = _load_cached_yahoo_json(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        {"range": "18mo", "interval": "1d", "includePrePost": "false", "events": "div,splits"},
        _cache_path("chart", symbol),
    )
    return (payload.get("chart", {}).get("result") or [{}])[0]


def _build_chart_frame(result: dict[str, Any], default_tz: str) -> tuple[dict[str, Any], pd.DataFrame]:
    meta = result.get("meta", {}) or {}
    market_tz = ZoneInfo(str(meta.get("exchangeTimezoneName") or "").strip() or default_tz)
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    timestamps = result.get("timestamp") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    rows: list[dict[str, Any]] = []
    for idx, raw_ts in enumerate(timestamps):
        if raw_ts in (None, ""):
            continue
        close_value = closes[idx] if idx < len(closes) else None
        if close_value in (None, ""):
            continue
        local_dt = datetime.fromtimestamp(int(raw_ts), timezone.utc).astimezone(market_tz)
        volume_value = volumes[idx] if idx < len(volumes) else 0
        rows.append(
            {
                "date_key": local_dt.strftime("%Y%m%d"),
                "close": float(close_value),
                "volume": float(volume_value or 0.0),
            }
        )
    frame = pd.DataFrame(rows)
    if not frame.empty:
        frame = frame.sort_values("date_key").drop_duplicates(subset=["date_key"], keep="last").reset_index(drop=True)
    return meta, frame


def _calc_history_metrics_from_close(close: pd.Series) -> dict[str, float]:
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


def _fetch_snapshot_for_symbol(symbol: str, yahoo_symbol: str, stock_name: str, market_cap_proxy_multiplier: float, target_date: str) -> dict[str, Any] | None:
    try:
        result = _load_yahoo_chart_result(yahoo_symbol)
    except Exception:
        return None
    default_tz = "Asia/Tokyo" if str(symbol).startswith("TSE:") else "Asia/Shanghai"
    if str(symbol).startswith("TWSE:"):
        default_tz = "Asia/Taipei"
    meta, history_frame = _build_chart_frame(result, default_tz)
    if history_frame.empty:
        return None
    target_frame = history_frame[history_frame["date_key"] <= target_date].reset_index(drop=True)
    if target_frame.empty:
        return None
    target_row = target_frame.iloc[-1]
    price = float(target_row["close"] or 0.0)
    previous_close = float(target_frame.iloc[-2]["close"] or 0.0) if len(target_frame) >= 2 else price
    volume = float(target_row["volume"] or 0.0)
    trading_value = price * volume
    market_cap_proxy = trading_value * max(1.0, float(market_cap_proxy_multiplier))
    if price <= 0 or volume <= 0 or trading_value <= 0 or market_cap_proxy <= 0:
        return None
    change_pct = ((price / previous_close) - 1.0) * 100.0 if previous_close > 0 else 0.0
    resolved_name = stock_name
    if str(symbol).startswith("TWSE:"):
        resolved_name = str(meta.get("longName") or meta.get("shortName") or stock_name).strip() or stock_name
    metrics = _calc_history_metrics_from_close(pd.to_numeric(target_frame["close"], errors="coerce").dropna())
    return {
        "Symbol": symbol,
        "stock_name": resolved_name,
        "close_price": price,
        "volume": volume,
        "market_cap": float(market_cap_proxy),
        "trading_value": float(trading_value),
        "change_pct": change_pct,
        "exchange": str(meta.get("fullExchangeName") or meta.get("exchangeName") or ""),
        "sortino_norm": float(metrics.get("sortino_norm", 0.5)),
        "is_52w_high": int(metrics.get("is_52w_high", 0)),
    }


def _fetch_asia_snapshots(listing: pd.DataFrame, max_workers: int, market_cap_proxy_multiplier: float, target_date: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _fetch_snapshot_for_symbol,
                row.Symbol,
                str(row.yahoo_symbol or ""),
                str(row.Name or row.Symbol),
                market_cap_proxy_multiplier,
                target_date,
            ): row.Symbol
            for row in listing.itertuples(index=False)
        }
        for future in as_completed(futures):
            payload = future.result()
            if payload:
                rows.append(payload)
    return pd.DataFrame(rows)


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

    listing = _load_asia_listing()
    quote_df = _fetch_asia_snapshots(listing, config.max_workers, config.market_cap_proxy_multiplier, config.date_key)
    if quote_df.empty:
        raise RuntimeError("Asia quote snapshot is empty.")
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
    if "trading_value" not in base.columns:
        base["trading_value"] = base["close_price"] * base["volume"]
    base["market_cap_100m"] = base["market_cap"] / 100_000_000.0
    base["trading_value_100m"] = base["trading_value"] / 100_000_000.0
    base = base.sort_values(["market_cap", "trading_value"], ascending=False).head(max(300, int(config.universe_limit))).copy()
    if base.empty:
        raise RuntimeError("No Asia stocks matched the liquidity threshold.")

    base["sortino_norm"] = pd.to_numeric(base.get("sortino_norm"), errors="coerce").fillna(0.5)
    base["is_52w_high"] = pd.to_numeric(base.get("is_52w_high"), errors="coerce").fillna(0).astype(int)

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
    weight_1m = float(final_cfg.get("weight_1m", 0.0))
    weight_3m = float(final_cfg.get("weight_3m", 0.4))
    sortino_power = float(final_cfg.get("sortino_power", 0.8))
    sortino_floor = float(final_cfg.get("sortino_floor", 1e-6))
    composite = (base["score_o"] * weight_today) + (base["avg_1w"] * weight_1w) + (base["avg_1m"] * weight_1m) + (base["avg_3m"] * weight_3m)
    base_score_s = composite * np.power(base["sortino_norm"].clip(lower=sortino_floor), sortino_power)
    trend_enabled = bool((trend_cfg or {}).get("enabled"))
    if trend_enabled:
        base["acceleration_bonus"], base["trend_break_penalty"] = _build_trend_adjustment(base, trend_cfg)
    else:
        base["acceleration_bonus"] = 0.0
        base["trend_break_penalty"] = 0.0
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
            (date_key, f"{date_key}_asia_daily_screening.xlsx"),
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
    parser.add_argument("--max-workers", type=int, default=20)
    parser.add_argument("--universe-limit", type=int, default=2400)
    parser.add_argument("--market-cap-proxy-multiplier", type=float, default=20.0)
    args = parser.parse_args()

    date_key = re.sub(r"\D", "", str(args.date))
    if not re.fullmatch(r"20\d{6}", date_key):
        raise SystemExit("invalid date format, use YYYYMMDD")
    effective_date = _resolve_available_market_date(date_key)
    config = BuildConfig(
        date_key=effective_date,
        max_workers=max(1, int(args.max_workers)),
        universe_limit=max(300, int(args.universe_limit)),
        market_cap_proxy_multiplier=max(1.0, float(args.market_cap_proxy_multiplier)),
    )
    out, close_frame = _build_frame(config)
    _write_sql(effective_date, out, close_frame)
    print(
        f"[DONE] asia_sql_only rows={len(out)} requested_date={date_key} "
        f"effective_date={effective_date} db={FAST_DB_PATH}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
