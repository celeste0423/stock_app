from __future__ import annotations

import argparse
import hashlib
import html
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


OUTPUT_DIR = Path(os.getenv("STOCK_DAILY_OUTPUT_DIR", str(ROOT_DIR / "outputs" / "stock_daily")))
CONFIG_DIR = ROOT_DIR / "config" / "screening"
FORMULA_CONFIG_PATH = Path(
    os.getenv("STOCK_DASHBOARD_US_SCORE_FORMULA_CONFIG_PATH", str(CONFIG_DIR / "us_score_formula_config.json"))
)
LEGACY_FORMULA_CONFIG_PATH = CONFIG_DIR / "score_formula_config.json"
FAST_DB_PATH = Path(os.getenv("STOCK_DAILY_US_FAST_DB_PATH", str(ROOT_DIR / "backend" / "us_stock_daily_fast.sqlite")))
FAST_PARQUET_PATH = Path(os.getenv("STOCK_DAILY_US_FAST_PARQUET_PATH", str(ROOT_DIR / "backend" / "us_stock_daily_fast.parquet")))
YAHOO_CACHE_DIR = ROOT_DIR / "backend" / ".yahoo_cache" / "us_daily"
UNIVERSE_CACHE_DIR = YAHOO_CACHE_DIR / "universe"

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
        "sortino_tanh_scale": 0.8,
        "sortino_min_obs": 10,
        "sortino_insufficient_value": 0.25,
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
    min_market_cap_usd: float = 10_000_000_000.0
    max_workers: int = 20
    universe_limit: int = 1800


def _date_key_to_datetime_utc(date_key: str) -> datetime:
    return datetime.strptime(str(date_key), "%Y%m%d").replace(tzinfo=timezone.utc)


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return float(default)
        result = float(value)
        if not math.isfinite(result):
            return float(default)
        return result
    except Exception:
        return float(default)


def _load_formula_config() -> dict[str, Any]:
    FORMULA_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not FORMULA_CONFIG_PATH.exists():
        seed_config = json.loads(json.dumps(DEFAULT_FORMULA_CONFIG))
        if LEGACY_FORMULA_CONFIG_PATH.exists():
            try:
                raw_legacy = json.loads(LEGACY_FORMULA_CONFIG_PATH.read_text(encoding="utf-8"))
                if isinstance(raw_legacy, dict):
                    for key in ("score_formula", "final_score_formula", "trend_adjustment_formula"):
                        if isinstance(raw_legacy.get(key), dict):
                            seed_config[key].update(raw_legacy[key])
            except Exception:
                pass
        FORMULA_CONFIG_PATH.write_text(
            json.dumps(seed_config, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return seed_config
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
    cached_payload = _load_cached_json(_cache_path("chart", "AAPL"), max_age_seconds=10_000_000)
    if isinstance(cached_payload, dict):
        try:
            result = (cached_payload.get("chart", {}).get("result") or [{}])[0]
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
        pass
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


def _merge_us_listing_frames(frames: list[pd.DataFrame]) -> pd.DataFrame:
    prepared: list[pd.DataFrame] = []
    for frame in frames:
        if frame is None or frame.empty:
            continue
        current = frame.copy()
        current["Symbol"] = current.get("Symbol", pd.Series(index=current.index, dtype=object)).map(_normalize_symbol)
        current = current[current["Symbol"] != ""].copy()
        if current.empty:
            continue
        for column in ("Name", "Sector", "Industry", "exchange"):
            if column not in current.columns:
                current[column] = ""
            current[column] = current[column].fillna("").astype(str)
        prepared.append(current[["Symbol", "Name", "Sector", "Industry", "exchange"]].copy())
    if not prepared:
        return pd.DataFrame(columns=["Symbol", "Name", "Sector", "Industry", "exchange"])
    combined = pd.concat(prepared, ignore_index=True)
    combined = combined.drop_duplicates(subset=["Symbol"], keep="first").reset_index(drop=True)
    return combined


def _load_fdr_exchange_listing(exchange: str) -> pd.DataFrame:
    try:
        frame = fdr.StockListing(exchange).copy()
    except Exception:
        return pd.DataFrame(columns=["Symbol", "Name", "Sector", "Industry", "exchange"])
    if frame.empty:
        return pd.DataFrame(columns=["Symbol", "Name", "Sector", "Industry", "exchange"])
    frame["Symbol"] = frame.get("Symbol", pd.Series(index=frame.index, dtype=object)).map(_normalize_symbol)
    frame = frame[frame["Symbol"] != ""].copy()
    if frame.empty:
        return pd.DataFrame(columns=["Symbol", "Name", "Sector", "Industry", "exchange"])
    frame["Name"] = frame.get("Name", pd.Series(index=frame.index, dtype=object)).fillna("").astype(str)
    industry_fallback = frame.get("Industry", pd.Series(index=frame.index, dtype=object)).fillna("").astype(str)
    frame["Sector"] = industry_fallback
    frame["Industry"] = industry_fallback
    frame["exchange"] = str(exchange or "").upper()
    return frame[["Symbol", "Name", "Sector", "Industry", "exchange"]].copy()


def _load_us_listing(min_market_cap_usd: float) -> pd.DataFrame:
    try:
        listing = fdr.StockListing("S&P500").copy()
        listing["Symbol"] = listing["Symbol"].map(_normalize_symbol)
        listing = listing[listing["Symbol"] != ""].copy()
        listing = listing.drop_duplicates(subset=["Symbol"], keep="first").reset_index(drop=True)
        listing["Sector"] = listing.get("Sector", pd.Series(index=listing.index, dtype=object)).fillna("").astype(str)
        listing["Industry"] = listing.get("Industry", pd.Series(index=listing.index, dtype=object)).fillna("").astype(str)
        listing["exchange"] = "S&P500"
    except Exception:
        listing = pd.DataFrame(columns=["Symbol", "Name", "Sector", "Industry", "exchange"])
    try:
        response = requests.get(
            "https://api.nasdaq.com/api/quote/list-type/nasdaq100",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
        )
        response.raise_for_status()
        rows = (((response.json() or {}).get("data") or {}).get("data") or {}).get("rows") or []
    except Exception:
        rows = []

    nasdaq_rows: list[dict[str, Any]] = []
    if isinstance(rows, list):
        for row in rows:
            symbol = _normalize_symbol((row or {}).get("symbol"))
            if not symbol:
                continue
            name = str((row or {}).get("companyName") or "").strip() or symbol
            nasdaq_rows.append(
                {
                    "Symbol": symbol,
                    "Name": name,
                    "Sector": str((row or {}).get("sector") or "").strip(),
                    "Industry": "",
                    "exchange": "NASDAQ100",
                }
            )
    nasdaq_df = pd.DataFrame(nasdaq_rows)
    nyse_df = _load_fdr_exchange_listing("NYSE")
    nasdaq_all_df = _load_fdr_exchange_listing("NASDAQ")
    combined = _merge_us_listing_frames([listing, nasdaq_df, nyse_df, nasdaq_all_df])

    filtered_rows = _fetch_companiesmarketcap_rows(float(min_market_cap_usd))
    filtered_symbols = {str(row.get("Symbol") or "").strip() for row in filtered_rows if row.get("Symbol")}
    if filtered_symbols:
        combined = combined[combined["Symbol"].astype(str).isin(filtered_symbols)].copy()
        market_cap_map = {
            str(row.get("Symbol") or "").strip(): float(row.get("market_cap_usd") or 0.0)
            for row in filtered_rows
            if row.get("Symbol")
        }
        combined["universe_market_cap_usd"] = combined["Symbol"].map(lambda symbol: market_cap_map.get(str(symbol), 0.0))
        combined = combined.sort_values(["universe_market_cap_usd", "Symbol"], ascending=[False, True]).reset_index(drop=True)
        return combined.drop(columns=["universe_market_cap_usd"], errors="ignore")

    if not combined.empty:
        return combined

    if FAST_DB_PATH.exists():
        with sqlite3.connect(str(FAST_DB_PATH)) as conn:
            fallback = pd.read_sql_query(
                """
                SELECT stock_code AS Symbol,
                       MAX(stock_name) AS Name,
                       MAX(sector) AS Sector,
                       MAX(industry) AS Industry,
                       MAX(exchange) AS exchange
                FROM screening_rows
                GROUP BY stock_code
                ORDER BY stock_code ASC
                """,
                conn,
            )
        if not fallback.empty:
            fallback["Symbol"] = fallback["Symbol"].map(_normalize_symbol)
            fallback = fallback[fallback["Symbol"] != ""].drop_duplicates(subset=["Symbol"], keep="first").reset_index(drop=True)
            return fallback
    return combined


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


def _load_cached_text(path: Path, max_age_seconds: int) -> str | None:
    try:
        if not path.exists():
            return None
        if max_age_seconds > 0 and (time.time() - path.stat().st_mtime) > max_age_seconds:
            return None
        return path.read_text(encoding="utf-8")
    except Exception:
        return None


def _store_cached_text(path: Path, payload: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(payload), encoding="utf-8")
    except Exception:
        pass


def _load_cached_text_url(url: str, cache_path: Path, *, max_age_seconds: int = 86400) -> str:
    cached = _load_cached_text(cache_path, max_age_seconds)
    if cached:
        return cached
    response = requests.get(
        url,
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.text
    _store_cached_text(cache_path, payload)
    return payload


def _parse_market_cap_text(text: Any) -> float | None:
    raw = str(text or "").strip().upper().replace("$", "").replace(",", "")
    if not raw:
        return None
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*([TBM]?)", raw)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2)
    if unit == "T":
        value *= 1_000_000_000_000.0
    elif unit == "B":
        value *= 1_000_000_000.0
    elif unit == "M":
        value *= 1_000_000.0
    return value


def _strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", str(text or ""))).strip()


def _fetch_companiesmarketcap_rows(min_market_cap_usd: float, max_pages: int = 30) -> list[dict[str, Any]]:
    cache_key = f"cmc_global_{int(float(min_market_cap_usd))}.json"
    cache_path = UNIVERSE_CACHE_DIR / cache_key
    cached = _load_cached_json(cache_path, max_age_seconds=86400)
    if isinstance(cached, list) and cached:
        return [row for row in cached if isinstance(row, dict)]

    rows: list[dict[str, Any]] = []
    row_pattern = re.compile(r"<tr>(.*?)</tr>", re.S | re.I)
    name_pattern = re.compile(r'<div class="company-name">\s*(.*?)\s*</div>', re.S | re.I)
    code_pattern = re.compile(r'<div class="company-code">.*?([A-Z0-9.\-]+)\s*</div>', re.S | re.I)
    market_cap_pattern = re.compile(r'<td class="td-right" data-sort="(-?\d+)">', re.S | re.I)
    country_pattern = re.compile(r'<span class="responsive-hidden">\s*([^<]+?)\s*</span>', re.S | re.I)

    below_threshold_streak = 0
    for page in range(1, max_pages + 1):
        url = f"https://companiesmarketcap.com/page/{page}/"
        page_html = _load_cached_text_url(url, UNIVERSE_CACHE_DIR / f"cmc_page_{page}.html", max_age_seconds=86400)
        page_rows = 0
        for row_html in row_pattern.findall(page_html):
            name_match = name_pattern.search(row_html)
            code_match = code_pattern.search(row_html)
            market_cap_matches = market_cap_pattern.findall(row_html)
            if not name_match or not code_match or not market_cap_matches:
                continue
            symbol = _normalize_symbol(code_match.group(1))
            if not symbol:
                continue
            company_name = _strip_tags(name_match.group(1))
            market_cap_usd = float(market_cap_matches[0] or 0.0)
            if market_cap_usd <= 0:
                continue
            country_match = country_pattern.search(row_html)
            country = _strip_tags(country_match.group(1)) if country_match else ""
            rows.append(
                {
                    "Symbol": symbol,
                    "Name": company_name or symbol,
                    "market_cap_usd": market_cap_usd,
                    "country": country,
                }
            )
            page_rows += 1

        if page_rows <= 0:
            break

        qualifying = [float(row.get("market_cap_usd") or 0.0) for row in rows[-page_rows:]]
        if qualifying and max(qualifying) < float(min_market_cap_usd):
            below_threshold_streak += 1
        else:
            below_threshold_streak = 0
        if below_threshold_streak >= 2:
            break

    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        symbol = str(row.get("Symbol") or "").strip()
        if not symbol:
            continue
        current_cap = float(row.get("market_cap_usd") or 0.0)
        existing = deduped.get(symbol)
        if existing is None or current_cap > float(existing.get("market_cap_usd") or 0.0):
            deduped[symbol] = row

    filtered = [
        row
        for row in deduped.values()
        if float(row.get("market_cap_usd") or 0.0) >= float(min_market_cap_usd)
    ]
    filtered.sort(key=lambda item: (-float(item.get("market_cap_usd") or 0.0), str(item.get("Symbol") or "")))
    _store_cached_json(cache_path, filtered)
    return filtered


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


def _load_yahoo_chart_result_for_period(symbol: str, start_date_key: str, end_date_key: str) -> dict[str, Any]:
    existing_cached = _load_cached_json(_cache_path("chart", symbol), max_age_seconds=10_000_000)
    if isinstance(existing_cached, dict):
        existing_result = (existing_cached.get("chart", {}).get("result") or [{}])[0]
        timestamps = existing_result.get("timestamp") or []
        if timestamps:
            try:
                existing_meta = existing_result.get("meta", {}) or {}
                market_tz = ZoneInfo(str(existing_meta.get("exchangeTimezoneName") or "").strip() or "America/New_York")
                local_dates = [
                    datetime.fromtimestamp(int(value), timezone.utc).astimezone(market_tz).strftime("%Y%m%d")
                    for value in timestamps
                    if value
                ]
                if local_dates and min(local_dates) <= str(start_date_key) and max(local_dates) >= str(end_date_key):
                    return existing_result
            except Exception:
                pass
    padded_start = datetime.strptime(start_date_key, "%Y%m%d").date() - timedelta(days=400)
    padded_end = datetime.strptime(end_date_key, "%Y%m%d").date() + timedelta(days=5)
    cache_name = f"{symbol}_{start_date_key}_{end_date_key}"
    payload = _load_cached_yahoo_json(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        {
            "period1": int(_date_key_to_datetime_utc(padded_start.strftime('%Y%m%d')).timestamp()),
            "period2": int(_date_key_to_datetime_utc(padded_end.strftime('%Y%m%d')).timestamp()),
            "interval": "1d",
            "includePrePost": "false",
            "events": "div,splits",
        },
        _cache_path("chart_range", cache_name),
        max_age_seconds=86400,
    )
    return (payload.get("chart", {}).get("result") or [{}])[0]


def _build_chart_frame(result: dict[str, Any], default_tz: str) -> tuple[dict[str, Any], pd.DataFrame]:
    meta = result.get("meta", {}) or {}
    market_tz = ZoneInfo(str(meta.get("exchangeTimezoneName") or "").strip() or default_tz)
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    timestamps = result.get("timestamp") or []
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
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
        open_value = opens[idx] if idx < len(opens) else None
        high_value = highs[idx] if idx < len(highs) else None
        low_value = lows[idx] if idx < len(lows) else None
        rows.append(
            {
                "date_key": local_dt.strftime("%Y%m%d"),
                "open": float(open_value) if open_value not in (None, "") else np.nan,
                "high": float(high_value) if high_value not in (None, "") else np.nan,
                "low": float(low_value) if low_value not in (None, "") else np.nan,
                "close": float(close_value),
                "volume": float(volume_value or 0.0),
            }
        )
    frame = pd.DataFrame(rows)
    if not frame.empty:
        frame = frame.sort_values("date_key").drop_duplicates(subset=["date_key"], keep="last").reset_index(drop=True)
    return meta, frame


def _load_yahoo_financial_timeseries(symbol: str) -> dict[str, Any]:
    return _load_cached_yahoo_json(
        f"https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{symbol}",
        {
            "symbol": symbol,
            "type": ",".join(YAHOO_FINANCIAL_TYPES),
            "period1": 0,
            "period2": int(datetime.now().timestamp()),
        },
        _cache_path("fundamentals", symbol),
    )


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


def _calc_history_metrics_from_close(close: pd.Series) -> dict[str, float]:
    if close.empty:
        return {"sortino_norm": 0.25, "is_52w_high": 0}
    daily_ret = close.pct_change().dropna().tail(20)
    formula_cfg = _load_formula_config()
    final_cfg = formula_cfg.get("final_score_formula", {}) if isinstance(formula_cfg.get("final_score_formula"), dict) else {}
    sortino_scale = max(float(final_cfg.get("sortino_tanh_scale", 0.8)), 1e-6)
    sortino_min_obs = max(int(final_cfg.get("sortino_min_obs", 10)), 1)
    insufficient_value = float(final_cfg.get("sortino_insufficient_value", 0.25))
    if len(daily_ret) < sortino_min_obs:
        sortino_norm = insufficient_value
    else:
        clean = np.asarray(daily_ret.values, dtype=float)
        mean_return = float(np.mean(clean))
        downside_returns = np.minimum(clean, 0.0)
        downside_dev = float(np.sqrt(np.mean(np.square(downside_returns))))
        if downside_dev <= 1e-8:
            raw_sortino = 6.0 if mean_return > 0 else -6.0 if mean_return < 0 else 0.0
        else:
            raw_sortino = float(mean_return / downside_dev)
        raw_sortino = max(min(raw_sortino, 6.0), -6.0)
        sortino_norm = float(0.5 + (0.5 * math.tanh(raw_sortino / sortino_scale)))
    recent_252 = close.tail(252)
    is_52w_high = int(not recent_252.empty and float(close.iloc[-1]) >= float(recent_252.max()))
    return {"sortino_norm": sortino_norm, "is_52w_high": is_52w_high}


def _fetch_snapshot_for_symbol(symbol: str, stock_name: str, target_date: str) -> dict[str, Any] | None:
    try:
        result = _load_yahoo_chart_result(symbol)
        timeseries = _load_yahoo_financial_timeseries(symbol)
    except Exception:
        return None
    meta, history_frame = _build_chart_frame(result, "America/New_York")
    if history_frame.empty:
        return None
    target_frame = history_frame[history_frame["date_key"] <= target_date].reset_index(drop=True)
    if target_frame.empty:
        return None
    target_row = target_frame.iloc[-1]
    price = float(target_row["close"] or 0.0)
    previous_close = float(target_frame.iloc[-2]["close"] or 0.0) if len(target_frame) >= 2 else price
    volume = float(target_row["volume"] or 0.0)
    market_cap = _yahoo_latest_value(timeseries, YAHOO_FINANCIAL_TYPES)
    if price <= 0 or volume <= 0 or market_cap in (None, 0):
        return None
    latest_close = float(history_frame.iloc[-1]["close"] or 0.0) if not history_frame.empty else 0.0
    if latest_close > 0:
        market_cap = float(market_cap) * (price / latest_close)
    change_pct = ((price / previous_close) - 1.0) * 100.0 if previous_close > 0 else 0.0
    metrics = _calc_history_metrics_from_close(pd.to_numeric(target_frame["close"], errors="coerce").dropna())
    return {
        "Symbol": symbol,
        "stock_name": stock_name,
        "open_price": to_float(target_row.get("open")),
        "high_price": to_float(target_row.get("high")),
        "low_price": to_float(target_row.get("low")),
        "close_price": price,
        "volume": volume,
        "market_cap": float(market_cap),
        "change_pct": change_pct,
        "exchange": str(meta.get("fullExchangeName") or meta.get("exchangeName") or ""),
        "sortino_norm": float(metrics.get("sortino_norm", 0.5)),
        "is_52w_high": int(metrics.get("is_52w_high", 0)),
    }


def _fetch_us_snapshots(listing: pd.DataFrame, max_workers: int, target_date: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_fetch_snapshot_for_symbol, row.Symbol, str(row.Name or row.Symbol), target_date): row.Symbol
            for row in listing.itertuples(index=False)
        }
        failures = 0
        for future in as_completed(futures):
            symbol = str(futures.get(future) or "")
            try:
                payload = future.result()
            except Exception as exc:
                failures += 1
                if failures <= 10:
                    print(f"[WARN] US snapshot skipped {symbol}: {exc}", file=sys.stderr, flush=True)
                continue
            if payload:
                rows.append(payload)
        if failures:
            print(f"[WARN] US snapshot skipped {failures} symbols", file=sys.stderr, flush=True)
    return pd.DataFrame(rows)


def _calc_sortino_norm_series(close: pd.Series, *, min_obs: int, insufficient_value: float, tanh_scale: float) -> pd.Series:
    values = pd.to_numeric(close, errors="coerce").astype(float).to_numpy()
    returns = pd.Series(values).pct_change().to_numpy()
    output = np.full(len(values), float(insufficient_value), dtype=float)
    for idx in range(len(values)):
        window = returns[max(1, idx - 19) : idx + 1]
        window = window[np.isfinite(window)]
        if window.size < int(min_obs):
            output[idx] = float(insufficient_value)
            continue
        mean_return = float(np.mean(window))
        downside_returns = np.minimum(window, 0.0)
        downside_dev = float(np.sqrt(np.mean(np.square(downside_returns))))
        if downside_dev <= 1e-8:
            raw_sortino = 6.0 if mean_return > 0 else -6.0 if mean_return < 0 else 0.0
        else:
            raw_sortino = float(mean_return / downside_dev)
        raw_sortino = max(min(raw_sortino, 6.0), -6.0)
        output[idx] = float(0.5 + (0.5 * math.tanh(raw_sortino / max(float(tanh_scale), 1e-6))))
    return pd.Series(output, index=close.index)


def _fetch_history_for_symbol(
    symbol: str,
    stock_name: str,
    sector: str,
    industry: str,
    start_date_key: str,
    end_date_key: str,
    min_obs: int,
    insufficient_value: float,
    tanh_scale: float,
) -> pd.DataFrame | None:
    try:
        result = _load_yahoo_chart_result_for_period(symbol, start_date_key, end_date_key)
        timeseries = _load_yahoo_financial_timeseries(symbol)
    except Exception:
        return None
    meta, history_frame = _build_chart_frame(result, "America/New_York")
    if history_frame.empty:
        return None
    history_frame["close"] = pd.to_numeric(history_frame["close"], errors="coerce")
    history_frame["volume"] = pd.to_numeric(history_frame["volume"], errors="coerce").fillna(0.0)
    history_frame = history_frame.dropna(subset=["close"]).copy()
    if history_frame.empty:
        return None
    latest_close = float(history_frame["close"].iloc[-1] or 0.0)
    latest_market_cap = _yahoo_latest_value(timeseries, YAHOO_FINANCIAL_TYPES)
    if latest_close <= 0 or latest_market_cap in (None, 0):
        return None
    history_frame["market_cap"] = float(latest_market_cap) * (history_frame["close"] / latest_close)
    history_frame["change_pct"] = history_frame["close"].pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0) * 100.0
    history_frame["sortino_norm"] = _calc_sortino_norm_series(
        history_frame["close"],
        min_obs=min_obs,
        insufficient_value=insufficient_value,
        tanh_scale=tanh_scale,
    )
    history_frame["rolling_52w_high"] = history_frame["close"].rolling(window=252, min_periods=1).max()
    history_frame["is_52w_high"] = (history_frame["close"] >= (history_frame["rolling_52w_high"] - 1e-9)).astype(int)
    history_frame = history_frame[
        (history_frame["date_key"] >= str(start_date_key)) & (history_frame["date_key"] <= str(end_date_key))
    ].copy()
    if history_frame.empty:
        return None
    history_frame["stock_code"] = symbol
    history_frame["stock_name"] = stock_name
    history_frame["sector"] = sector
    history_frame["industry"] = industry
    history_frame["exchange"] = str(meta.get("fullExchangeName") or meta.get("exchangeName") or "")
    history_frame["market_cap_100m"] = history_frame["market_cap"] / 100_000_000.0
    history_frame["trading_value_100m"] = (history_frame["close"] * history_frame["volume"]) / 100_000_000.0
    history_frame["open_price"] = history_frame["open"]
    history_frame["high_price"] = history_frame["high"]
    history_frame["low_price"] = history_frame["low"]
    history_frame["close_price"] = history_frame["close"]
    return history_frame[
        [
            "date_key",
            "stock_code",
            "stock_name",
            "sector",
            "industry",
            "exchange",
            "open_price",
            "high_price",
            "low_price",
            "close_price",
            "volume",
            "market_cap",
            "market_cap_100m",
            "trading_value_100m",
            "change_pct",
            "sortino_norm",
            "is_52w_high",
        ]
    ].copy()


def _build_range_frames(
    start_date_key: str,
    end_date_key: str,
    *,
    min_market_cap_usd: float,
    max_workers: int,
    universe_limit: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    formula_cfg = _load_formula_config()
    score_cfg = formula_cfg.get("score_formula", {})
    final_cfg = formula_cfg.get("final_score_formula", {})
    trend_cfg = formula_cfg.get("trend_adjustment_formula", {})
    sortino_scale = max(float(final_cfg.get("sortino_tanh_scale", 0.8)), 1e-6)
    sortino_min_obs = max(int(final_cfg.get("sortino_min_obs", 10)), 1)
    insufficient_value = float(final_cfg.get("sortino_insufficient_value", 0.25))

    listing = _load_us_listing(float(min_market_cap_usd))
    listing = listing.copy()
    listing["Sector"] = listing.get("Sector", pd.Series(index=listing.index, dtype=object)).fillna("").astype(str)
    listing["Industry"] = listing.get("Industry", pd.Series(index=listing.index, dtype=object)).fillna("").astype(str)

    frames: list[pd.DataFrame] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _fetch_history_for_symbol,
                str(row.Symbol),
                str(row.Name or row.Symbol),
                str(row.Sector or ""),
                str(row.Industry or ""),
                start_date_key,
                end_date_key,
                sortino_min_obs,
                insufficient_value,
                sortino_scale,
            ): str(row.Symbol)
            for row in listing.itertuples(index=False)
        }
        failures = 0
        for future in as_completed(futures):
            symbol = str(futures.get(future) or "")
            try:
                payload = future.result()
            except Exception as exc:
                failures += 1
                if failures <= 10:
                    print(f"[WARN] US history skipped {symbol}: {exc}", file=sys.stderr, flush=True)
                continue
            if payload is not None and not payload.empty:
                frames.append(payload)
        if failures:
            print(f"[WARN] US history skipped {failures} symbols", file=sys.stderr, flush=True)
    if not frames:
        raise RuntimeError("US history fetch returned no rows.")

    base = pd.concat(frames, ignore_index=True)
    base["market_cap"] = pd.to_numeric(base["market_cap"], errors="coerce")
    base["close_price"] = pd.to_numeric(base["close_price"], errors="coerce")
    base["volume"] = pd.to_numeric(base["volume"], errors="coerce")
    base["change_pct"] = pd.to_numeric(base["change_pct"], errors="coerce")
    base["market_cap_100m"] = pd.to_numeric(base["market_cap_100m"], errors="coerce")
    base["trading_value_100m"] = pd.to_numeric(base["trading_value_100m"], errors="coerce")
    base = base.dropna(subset=["market_cap", "close_price", "volume", "change_pct", "market_cap_100m", "trading_value_100m"]).copy()
    base = base[base["market_cap"] >= float(min_market_cap_usd)].copy()
    if base.empty:
        raise RuntimeError("No US historical rows above market-cap threshold.")

    if int(universe_limit) > 0:
        rank_proxy = (
            base.groupby("stock_code", as_index=False)[["market_cap", "trading_value_100m"]]
            .max()
            .sort_values(["market_cap", "trading_value_100m"], ascending=False)
            .head(max(200, int(universe_limit)))
        )
        allowed_codes = set(rank_proxy["stock_code"].astype(str))
        base = base[base["stock_code"].astype(str).isin(allowed_codes)].copy()

    amount_power = float(score_cfg.get("amount_power", 1.2))
    marcap_power = float(score_cfg.get("marcap_power", 0.8))
    return_base = float(score_cfg.get("return_base", 1.1))
    return_power = float(score_cfg.get("return_power", 4.0))
    log_base = float(score_cfg.get("log_base", 1.1))
    bonus_if_52w_high = float(score_cfg.get("bonus_if_52w_high", 5.0))
    bonus_if_not_52w_high = float(score_cfg.get("bonus_if_not_52w_high", -4.0))
    offset = float(score_cfg.get("offset", -13.0))
    invalid_fill = float(score_cfg.get("invalid_fill", 0.0))

    chg = base["change_pct"] / 100.0
    core = np.where(
        base["market_cap_100m"] > 0,
        (np.power(np.maximum(base["trading_value_100m"], 0.0), amount_power) / np.power(base["market_cap_100m"], marcap_power))
        * np.power(return_base + chg, return_power),
        np.nan,
    )
    core = np.where(core > 0, core, np.nan)
    log_term = np.log(core) / np.log(log_base)
    high_bonus = np.where(base["is_52w_high"] == 1, bonus_if_52w_high, bonus_if_not_52w_high)
    base["score_o"] = np.where(np.isfinite(log_term), log_term + high_bonus + offset, invalid_fill)

    base = base.sort_values(["stock_code", "date_key"]).reset_index(drop=True)
    grouped = base.groupby("stock_code", sort=False)["score_o"]
    avg_1w = grouped.transform(lambda s: s.shift(1).rolling(window=7, min_periods=1).sum() / 7.0)
    avg_1m = grouped.transform(lambda s: s.shift(1).rolling(window=20, min_periods=1).sum() / 20.0)
    avg_3m = grouped.transform(lambda s: s.shift(1).rolling(window=60, min_periods=1).sum() / 60.0)
    base["avg_1w"] = avg_1w.where(pd.notna(avg_1w), base["score_o"])
    base["avg_1m"] = avg_1m.where(pd.notna(avg_1m), base["score_o"])
    base["avg_3m"] = avg_3m.where(pd.notna(avg_3m), base["score_o"])

    weight_today = float(final_cfg.get("weight_today", 0.1))
    weight_1w = float(final_cfg.get("weight_1w", 0.5))
    weight_1m = float(final_cfg.get("weight_1m", 0.3))
    weight_3m = float(final_cfg.get("weight_3m", 0.4))
    sortino_power = float(final_cfg.get("sortino_power", 0.4))
    sortino_floor = float(final_cfg.get("sortino_floor", 1e-6))
    composite = (base["score_o"] * weight_today) + (base["avg_1w"] * weight_1w) + (base["avg_1m"] * weight_1m) + (base["avg_3m"] * weight_3m)
    base_score_s = composite * np.power(base["sortino_norm"].clip(lower=sortino_floor), sortino_power)
    base["acceleration_bonus"], base["trend_break_penalty"] = _build_trend_adjustment(base, trend_cfg)
    base["score_s"] = base_score_s + base["acceleration_bonus"] - base["trend_break_penalty"]

    ranked_frames: list[pd.DataFrame] = []
    for date_key, group in base.groupby("date_key", sort=True):
        ordered = group.sort_values(["score_s", "score_o", "stock_code"], ascending=[False, False, True]).reset_index(drop=True)
        ordered["rank"] = np.arange(1, len(ordered) + 1)
        ordered["file_date_key"] = str(date_key)
        ordered["file_date"] = f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:]}"
        ordered["note"] = ""
        ranked_frames.append(ordered)
    ranked = pd.concat(ranked_frames, ignore_index=True)

    out = ranked[
        [
            "file_date",
            "file_date_key",
            "rank",
            "stock_code",
            "stock_name",
            "sector",
            "industry",
            "market_cap_100m",
            "trading_value_100m",
            "change_pct",
            "score_o",
            "is_52w_high",
            "avg_1w",
            "avg_1m",
            "avg_3m",
            "sortino_norm",
            "score_s",
            "note",
        ]
    ].copy()
    close_frame = ranked[["file_date_key", "stock_code", "open_price", "high_price", "low_price", "close_price"]].copy()
    for column in ("market_cap_100m", "trading_value_100m", "change_pct", "score_o", "avg_1w", "avg_1m", "avg_3m", "sortino_norm", "score_s", "close_price"):
        if column in out.columns:
            out[column] = pd.to_numeric(out[column], errors="coerce")
        if column in close_frame.columns:
            close_frame[column] = pd.to_numeric(close_frame[column], errors="coerce")
    for column in ("open_price", "high_price", "low_price"):
        close_frame[column] = pd.to_numeric(close_frame[column], errors="coerce")
    out["market_cap_100m"] = out["market_cap_100m"].round(2)
    out["trading_value_100m"] = out["trading_value_100m"].round(2)
    out["change_pct"] = out["change_pct"].round(2)
    out["score_o"] = out["score_o"].round(2)
    out["avg_1w"] = out["avg_1w"].round(2)
    out["avg_1m"] = out["avg_1m"].round(2)
    out["avg_3m"] = out["avg_3m"].round(2)
    out["sortino_norm"] = out["sortino_norm"].round(4)
    out["score_s"] = out["score_s"].round(2)
    close_frame["close_price"] = close_frame["close_price"].fillna(0.0).round(4)
    return out, close_frame


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

    listing = _load_us_listing(float(config.min_market_cap_usd))
    quote_df = _fetch_us_snapshots(listing, config.max_workers, config.date_key)
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
    weight_1m = float(final_cfg.get("weight_1m", 0.3))
    weight_3m = float(final_cfg.get("weight_3m", 0.1))
    sortino_power = float(final_cfg.get("sortino_power", 0.4))
    sortino_floor = float(final_cfg.get("sortino_floor", 1e-6))
    composite = (base["score_o"] * weight_today) + (base["avg_1w"] * weight_1w) + (base["avg_1m"] * weight_1m) + (base["avg_3m"] * weight_3m)
    base_score_s = composite * np.power(base["sortino_norm"].clip(lower=sortino_floor), sortino_power)
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
    close_frame = base[["stock_code", "open_price", "high_price", "low_price", "close_price"]].copy()
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
    for column in ("open_price", "high_price", "low_price", "close_price"):
        close_frame[column] = pd.to_numeric(close_frame[column], errors="coerce").round(4)
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
                open_price REAL,
                high_price REAL,
                low_price REAL,
                close_price REAL,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        close_columns = {
            str(row[1])
            for row in conn.execute("PRAGMA table_info(daily_close_cache)").fetchall()
            if row and len(row) > 1
        }
        if "open_price" not in close_columns:
            conn.execute("ALTER TABLE daily_close_cache ADD COLUMN open_price REAL")
        if "high_price" not in close_columns:
            conn.execute("ALTER TABLE daily_close_cache ADD COLUMN high_price REAL")
        if "low_price" not in close_columns:
            conn.execute("ALTER TABLE daily_close_cache ADD COLUMN low_price REAL")
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


def _write_sql_batch(out: pd.DataFrame, close_frame: pd.DataFrame) -> None:
    if out.empty:
        return
    FAST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    date_keys = sorted({str(value) for value in out["file_date_key"].astype(str).tolist() if value})
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
                open_price REAL,
                high_price REAL,
                low_price REAL,
                close_price REAL,
                PRIMARY KEY (file_date_key, stock_code)
            )
            """
        )
        close_columns = {
            str(row[1])
            for row in conn.execute("PRAGMA table_info(daily_close_cache)").fetchall()
            if row and len(row) > 1
        }
        if "open_price" not in close_columns:
            conn.execute("ALTER TABLE daily_close_cache ADD COLUMN open_price REAL")
        if "high_price" not in close_columns:
            conn.execute("ALTER TABLE daily_close_cache ADD COLUMN high_price REAL")
        if "low_price" not in close_columns:
            conn.execute("ALTER TABLE daily_close_cache ADD COLUMN low_price REAL")
        for date_key in date_keys:
            conn.execute("DELETE FROM screening_rows WHERE file_date_key = ?", (date_key,))
            conn.execute("DELETE FROM daily_close_cache WHERE file_date_key = ?", (date_key,))
        out.to_sql("screening_rows", conn, if_exists="append", index=False)
        close_frame.to_sql("daily_close_cache", conn, if_exists="append", index=False)
        meta_rows = [(date_key, f"{date_key}_us_daily_screening.xlsx") for date_key in date_keys]
        conn.executemany(
            """
            INSERT INTO file_meta(file_date_key, file_name, file_mtime)
            VALUES(?, ?, strftime('%s','now'))
            ON CONFLICT(file_date_key) DO UPDATE SET
                file_name=excluded.file_name,
                file_mtime=excluded.file_mtime
            """,
            meta_rows,
        )
        conn.commit()
        try:
            full = pd.read_sql_query("SELECT * FROM screening_rows ORDER BY file_date_key, score_s DESC, stock_code ASC", conn)
            full.to_parquet(FAST_PARQUET_PATH, index=False)
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="", help="YYYYMMDD")
    parser.add_argument("--start-date", default="", help="YYYYMMDD")
    parser.add_argument("--end-date", default="", help="YYYYMMDD")
    parser.add_argument("--min-market-cap-usd", type=float, default=10_000_000_000.0)
    parser.add_argument("--max-workers", type=int, default=20)
    parser.add_argument("--universe-limit", type=int, default=1800)
    args = parser.parse_args()

    start_date_key = re.sub(r"\D", "", str(args.start_date or ""))
    end_date_key = re.sub(r"\D", "", str(args.end_date or ""))
    single_date_key = re.sub(r"\D", "", str(args.date or ""))
    if start_date_key:
        if not re.fullmatch(r"20\d{6}", start_date_key):
            raise SystemExit("invalid --start-date format, use YYYYMMDD")
        if not end_date_key:
            end_date_key = datetime.now().strftime("%Y%m%d")
        if not re.fullmatch(r"20\d{6}", end_date_key):
            raise SystemExit("invalid --end-date format, use YYYYMMDD")
        effective_end = _resolve_available_market_date(end_date_key)
        out, close_frame = _build_range_frames(
            start_date_key,
            effective_end,
            min_market_cap_usd=float(args.min_market_cap_usd),
            max_workers=max(1, int(args.max_workers)),
            universe_limit=max(200, int(args.universe_limit)),
        )
        _write_sql_batch(out, close_frame)
        print(
            f"[DONE] us_sql_range rows={len(out)} start_date={start_date_key} "
            f"end_date={effective_end} dates={out['file_date_key'].nunique()} db={FAST_DB_PATH}"
        )
        return 0

    if not re.fullmatch(r"20\d{6}", single_date_key):
        raise SystemExit("invalid date format, use --date YYYYMMDD or --start-date YYYYMMDD")
    effective_date = _resolve_available_market_date(single_date_key)
    config = BuildConfig(
        date_key=effective_date,
        min_market_cap_usd=float(args.min_market_cap_usd),
        max_workers=max(1, int(args.max_workers)),
        universe_limit=max(200, int(args.universe_limit)),
    )
    out, close_frame = _build_frame(config)
    _write_sql(effective_date, out, close_frame)
    print(
        f"[DONE] us_sql_only rows={len(out)} requested_date={single_date_key} "
        f"effective_date={effective_date} db={FAST_DB_PATH}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
