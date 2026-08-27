from __future__ import annotations

import copy
import datetime as dt
import html
import json
import math
import os
import re
import sqlite3
import subprocess
import sys
import time
from urllib.parse import urljoin
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi.responses import JSONResponse, Response
from fastapi import Body

from backend.core.legacy_loader import execute_legacy_backend


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = PROJECT_ROOT / "data"
SCREENING_CONFIG_ROOT = PROJECT_ROOT / "config" / "screening"
os.environ.setdefault("STOCK_DASHBOARD_SCREENING_DIR", str(SCREENING_CONFIG_ROOT))
os.environ.setdefault("STOCK_DASHBOARD_SCORE_FORMULA_CONFIG_PATH", str(SCREENING_CONFIG_ROOT / "score_formula_config.json"))
os.environ.setdefault("STOCK_DASHBOARD_US_SCORE_FORMULA_CONFIG_PATH", str(SCREENING_CONFIG_ROOT / "us_score_formula_config.json"))
os.environ.setdefault("STOCK_DASHBOARD_REAL_ESTATE_EXCEL_PATH", str(DATA_ROOT / "real-estate" / "안암해링턴 상가 관리.xlsx"))
os.environ.setdefault("STOCK_DASHBOARD_REAL_ESTATE_BANK_IMPORT_DIR", str(DATA_ROOT / "real-estate" / "계좌입출금내역"))
os.environ.setdefault("STOCK_DASHBOARD_REAL_ESTATE_BUILDING_EXPORT_DIR", str(DATA_ROOT / "real-estate" / "건물 정리"))

# Preserve the last known-good runtime while the historical backend is migrated
# behind stable package boundaries.
execute_legacy_backend(globals())

_LEGACY_SEARCH_STOCK_NEWS = search_stock_news
_LEGACY_BUILD_KR_STOCK_OVERVIEW = build_kr_stock_overview
_LEGACY_BUILD_DISCLOSURE_COMPANY_TARGET = build_disclosure_company_target
_LEGACY_LOAD_SCREENING_SUMMARY = load_screening_summary

IR_MATERIALS_CACHE_TTL_SECONDS = 60 * 60 * 12
IR_MATERIALS_LINK_CACHE: dict[str, dict[str, object]] = {}

# The US leader board response is assembled from the screening database and is
# requested together with its sector calendar whenever the page opens.  Keep a
# short-lived server-side copy so returning to the page (or opening it in a
# second window) does not repeat that work.  The cache is cleared immediately
# after an explicit US data rebuild/reload.
US_THEME_PAGE_CACHE_TTL_SECONDS = 60 * 10
US_THEME_PAGE_CACHE: dict[str, dict[str, object]] = {}


def _clear_us_theme_page_cache() -> None:
    US_THEME_PAGE_CACHE.clear()


@app.middleware("http")
async def _cache_us_theme_page_responses(request, call_next):
    path = request.url.path
    is_cached_get = request.method == "GET" and path in {
        "/api/us-themes/today",
        "/api/us-theme-sector-calendar",
    }
    if is_cached_get:
        cache_key = str(request.url)
        now = time.monotonic()
        cached = US_THEME_PAGE_CACHE.get(cache_key)
        if cached and float(cached.get("expires_at") or 0) > now:
            return Response(
                content=cached["body"],
                status_code=int(cached["status_code"]),
                media_type=str(cached["media_type"] or "application/json"),
                headers={"Cache-Control": "private, max-age=600", "X-Stock-Cache": "HIT"},
            )

        response = await call_next(request)
        if response.status_code < 400:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            US_THEME_PAGE_CACHE[cache_key] = {
                "body": body,
                "status_code": response.status_code,
                "media_type": response.media_type or "application/json",
                "expires_at": now + US_THEME_PAGE_CACHE_TTL_SECONDS,
            }
            return Response(
                content=body,
                status_code=response.status_code,
                media_type=response.media_type,
                headers={"Cache-Control": "private, max-age=600", "X-Stock-Cache": "MISS"},
            )
        return response

    response = await call_next(request)
    if request.method != "GET" and path in {
        "/api/us-themes/reload",
        "/api/us-themes/build-today-data",
    } and response.status_code < 400:
        _clear_us_theme_page_cache()
    return response

# This endpoint only generated workbooks from the retired Excel archive.
app.router.routes = [
    route for route in app.router.routes if getattr(route, "path", "") != "/api/themes/test-excel"
]


def _safe_float(value, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return number


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_list(value):
    return value if isinstance(value, list) else []


def _date_key_from_value(value: object) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[:8] if len(digits) >= 8 else ""


def _augment_screening_high_flags(payload: object) -> object:
    if not isinstance(payload, dict):
        return payload
    date_key = (
        _date_key_from_value(payload.get("file_date"))
        or _date_key_from_value(payload.get("requested_file_date"))
        or _date_key_from_value(payload.get("fallback_file_date"))
    )
    if not date_key:
        return payload
    row_groups = []
    for key in ("qualified_stocks", "recent_leaders"):
        value = payload.get(key)
        if isinstance(value, list):
            row_groups.append(value)
    if not row_groups:
        return payload
    codes = sorted({
        str(row.get("stock_code") or "").strip()
        for rows in row_groups
        for row in rows
        if isinstance(row, dict) and str(row.get("stock_code") or "").strip()
    })
    if not codes:
        return payload
    db_path = globals().get("SCREENING_FAST_DB_PATH")
    if not db_path or not Path(db_path).exists():
        return payload
    placeholders = ",".join("?" for _ in codes)
    try:
        with sqlite3.connect(str(db_path)) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                f"""
                SELECT stock_code,
                       COALESCE(is_52w_high, 0) AS is_52w_high,
                       COALESCE(is_60d_high, 0) AS is_60d_high,
                       COALESCE(is_20d_high, 0) AS is_20d_high
                FROM screening_rows
                WHERE file_date_key = ?
                  AND stock_code IN ({placeholders})
                """,
                [date_key, *codes],
            ).fetchall()
    except Exception:
        return payload
    flag_map = {str(row["stock_code"]): dict(row) for row in rows}
    for rows in row_groups:
        for item in rows:
            if not isinstance(item, dict):
                continue
            flags = flag_map.get(str(item.get("stock_code") or "").strip())
            if not flags:
                item.setdefault("is_60d_high", 0)
                continue
            item["is_52w_high"] = int(flags.get("is_52w_high") or 0)
            item["is_60d_high"] = int(flags.get("is_60d_high") or 0)
            item["is_20d_high"] = int(flags.get("is_20d_high") or 0)
    return payload


def load_screening_summary(*args, **kwargs):
    return _augment_screening_high_flags(_LEGACY_LOAD_SCREENING_SUMMARY(*args, **kwargs))


@app.middleware("http")
async def _augment_themes_today_high_flags(request, call_next):
    response = await call_next(request)
    if request.url.path != "/api/themes/today" or response.status_code >= 400:
        return response
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
    try:
        payload = json.loads(body.decode("utf-8"))
        payload = _augment_screening_high_flags(payload)
    except Exception:
        headers = dict(response.headers)
        headers.pop("content-length", None)
        return Response(content=body, status_code=response.status_code, headers=headers, media_type=response.media_type)
    return JSONResponse(payload, status_code=response.status_code)


def _safe_request_text(url: str, timeout: int = 8) -> str:
    target = str(url or "").strip()
    if not target:
        return ""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
        )
    }
    try:
        response = requests.get(target, headers=headers, timeout=timeout)
        response.raise_for_status()
    except Exception:
        return ""
    response.encoding = response.encoding or response.apparent_encoding or "utf-8"
    return response.text or ""


def _strip_html_tags(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_external_url(value: str, base_url: str = "") -> str:
    target = html.unescape(str(value or "").strip()).replace("&#13;", "").strip()
    if not target or target.startswith(("#", "javascript:", "mailto:", "tel:")):
        return ""
    return urljoin(base_url, target)


def _extract_company_homepage_from_wisereport(stock_code: str) -> str:
    code = str(stock_code or "").strip().zfill(6)
    if not code:
        return ""
    url = f"https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd={code}"
    page = _safe_request_text(url)
    if not page:
        return ""
    match = re.search(
        r'href="([^"]+)"[^>]*target="comPage"|target="comPage"[^>]*href="([^"]+)"',
        page,
        re.IGNORECASE,
    )
    if match:
        return _normalize_external_url(match.group(1) or match.group(2) or "", url)
    matches = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, re.IGNORECASE | re.DOTALL)
    for href, inner_html in matches:
        label = _strip_html_tags(inner_html)
        if "홈페이지" in label or "Homepage" in label or "Website" in label:
            return _normalize_external_url(href, url)
    return ""


def _score_ir_link(href: str, label: str) -> int:
    combined = f"{href} {label}".lower()
    score = 0
    strong_keywords = [
        "ir-report",
        "investor relations",
        "investors",
        "ir 자료",
        "ir자료",
        "ir자료실",
        "투자정보",
        "전자공고",
        "investor",
    ]
    medium_keywords = [
        "/ir/",
        "ir center",
        "ir센터",
        "irroom",
        "financial information",
        "financials",
        "shareholder",
    ]
    weak_keywords = [
        "ir",
        "invest",
        "주주",
        "공시",
    ]
    for keyword in strong_keywords:
        if keyword in combined:
            score += 8
    for keyword in medium_keywords:
        if keyword in combined:
            score += 4
    for keyword in weak_keywords:
        if keyword in combined:
            score += 1
    if any(blocked in combined for blocked in ("news", "notice", "press", "recruit", "career", "채용", "보도자료")):
        score -= 3
    return score


def _find_ir_materials_url_from_homepage(homepage_url: str) -> str:
    base_url = str(homepage_url or "").strip()
    if not base_url:
        return ""
    page = _safe_request_text(base_url)
    if not page:
        return ""
    best_url = ""
    best_score = 0
    for href, inner_html in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, re.IGNORECASE | re.DOTALL):
        label = _strip_html_tags(inner_html)
        candidate_url = _normalize_external_url(href, base_url)
        if not candidate_url:
            continue
        score = _score_ir_link(candidate_url, label)
        if score > best_score:
            best_score = score
            best_url = candidate_url
    return best_url if best_score >= 4 else ""


def _load_ir_materials_links(stock_code: str) -> tuple[str, str]:
    code = str(stock_code or "").strip().zfill(6)
    if not code:
        return "", ""
    now = time.time()
    cached = IR_MATERIALS_LINK_CACHE.get(code)
    if isinstance(cached, dict):
        expires_at = _safe_float(cached.get("expires_at"), 0.0)
        if expires_at > now:
            return str(cached.get("homepage_url") or ""), str(cached.get("ir_materials_url") or "")
    homepage_url = _extract_company_homepage_from_wisereport(code)
    ir_materials_url = _find_ir_materials_url_from_homepage(homepage_url) if homepage_url else ""
    IR_MATERIALS_LINK_CACHE[code] = {
        "expires_at": now + IR_MATERIALS_CACHE_TTL_SECONDS,
        "homepage_url": homepage_url,
        "ir_materials_url": ir_materials_url,
    }
    return homepage_url, ir_materials_url


def _move_routes_before_spa_catchall(*paths: str) -> None:
    requested = {str(path or "").strip() for path in paths if str(path or "").strip()}
    if not requested:
        return
    routes = list(app.router.routes)
    catchall_index = next(
        (index for index, route in enumerate(routes) if getattr(route, "path", "") == "/{full_path:path}"),
        -1,
    )
    if catchall_index < 0:
        return
    promoted = [route for route in routes if getattr(route, "path", "") in requested]
    if not promoted:
        return
    remaining = [route for route in routes if getattr(route, "path", "") not in requested]
    catchall_index = next(
        (index for index, route in enumerate(remaining) if getattr(route, "path", "") == "/{full_path:path}"),
        -1,
    )
    if catchall_index < 0:
        app.router.routes = remaining + promoted
        return
    app.router.routes = remaining[:catchall_index] + promoted + remaining[catchall_index:]


def _normalize_company_text(value: object) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = text.replace("(주)", "").replace("㈜", "")
    return re.sub(r"[^0-9a-z가-힣]+", "", text)


def _find_exact_autocomplete_stock(query: str):
    raw_query = str(query or "").strip()
    if not raw_query:
        return None
    query_digits = re.sub(r"\D", "", raw_query)
    normalized_query = _normalize_company_text(raw_query)
    try:
        candidates = autocomplete_stocks(raw_query, limit=20) or []
    except Exception:
        candidates = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or item.get("stock_code") or "").strip()
        name = str(item.get("name") or item.get("stock_name") or "").strip()
        if query_digits and code and code.zfill(6) == query_digits.zfill(6):
            return {"code": code.zfill(6), "name": name or raw_query}
        if normalized_query and _normalize_company_text(name) == normalized_query:
            return {"code": code.zfill(6) if code else "", "name": name or raw_query}
    return None


def build_disclosure_company_target(company: str) -> dict:
    raw = str(company or "").strip()
    exact_stock = _find_exact_autocomplete_stock(raw)
    if not exact_stock:
        return _LEGACY_BUILD_DISCLOSURE_COMPANY_TARGET(company)
    code = str(exact_stock.get("code") or "").strip().zfill(6)
    name = str(exact_stock.get("name") or raw).strip()
    normalized_names = {_normalize_company_text(value) for value in (raw, name) if _normalize_company_text(value)}
    query_terms = []
    if code:
        query_terms.extend([code, f"A{code}"])
    for value in (name, raw):
        value = str(value or "").strip()
        if value and value not in query_terms:
            query_terms.append(value)
    return {
        "raw": raw,
        "code": code,
        "name": name,
        "normalized_names": normalized_names,
        "query_terms": query_terms,
    }


def _has_exact_company_mention(text: str, company_name: str) -> bool:
    base = str(company_name or "").strip()
    if not text or not base:
        return False
    escaped = re.escape(base)
    pattern = rf"(^|[^0-9A-Za-z가-힣]){escaped}([^0-9A-Za-z가-힣]|$)"
    return re.search(pattern, text) is not None


def _collect_conflicting_company_names(company_name: str, company_code: str = "") -> list[str]:
    target_name = str(company_name or "").strip()
    normalized_target = _normalize_company_text(target_name)
    if not normalized_target:
        return []
    conflicts: list[str] = []
    seen: set[str] = set()
    candidates = []
    try:
        listing = get_listing_table()
        if listing is not None and not listing.empty:
            for _, row in listing.iterrows():
                candidates.append(
                    {
                        "name": str(row.get("Name") or "").strip(),
                        "code": str(row.get("Code") or "").strip(),
                    }
                )
    except Exception:
        candidates = []
    if not candidates:
        try:
            candidates = autocomplete_stocks(target_name, limit=50) or []
        except Exception:
            candidates = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        candidate_name = str(item.get("name") or item.get("stock_name") or "").strip()
        candidate_code = str(item.get("code") or item.get("stock_code") or "").strip()
        normalized_candidate = _normalize_company_text(candidate_name)
        if not candidate_name or not normalized_candidate or normalized_candidate == normalized_target:
            continue
        if company_code and candidate_code and candidate_code.zfill(6) == company_code.zfill(6):
            continue
        if not normalized_candidate.startswith(normalized_target):
            continue
        if candidate_name not in seen:
            seen.add(candidate_name)
            conflicts.append(candidate_name)
    return conflicts


def _filter_group_ambiguous_news_items(items, company_name: str, company_code: str = ""):
    exact_name = str(company_name or "").strip()
    if not exact_name:
        return _safe_list(items)
    conflicting_names = _collect_conflicting_company_names(exact_name, company_code)
    if not conflicting_names:
        return _safe_list(items)
    filtered = []
    for item in _safe_list(items):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "")
        summary = str(item.get("summary") or "")
        body_text = " ".join(part for part in (title, summary) if part).strip()
        normalized_body = _normalize_company_text(body_text)
        if not normalized_body:
            filtered.append(item)
            continue
        matched_conflicts = [name for name in conflicting_names if _normalize_company_text(name) in normalized_body]
        has_exact_mention = _has_exact_company_mention(body_text, exact_name)
        has_prefixed_longer_name = re.search(rf"{re.escape(exact_name)}[0-9A-Za-z가-힣]{{1,20}}", body_text) is not None
        if (matched_conflicts or has_prefixed_longer_name) and not has_exact_mention:
            continue
        filtered.append(item)
    return filtered


def _extract_news_articles(payload: dict) -> tuple[str, list]:
    if not isinstance(payload, dict):
        return "items", []
    if isinstance(payload.get("key_articles"), list):
        return "key_articles", _safe_list(payload.get("key_articles"))
    return "items", _safe_list(payload.get("items"))


def _guess_news_sentiment(articles: list[dict]) -> str:
    positive_hits = 0
    negative_hits = 0
    positive_keywords = ("실적", "수주", "계약", "증가", "확대", "상승", "개선", "흑자", "공급")
    negative_keywords = ("감소", "적자", "하락", "소송", "중단", "리스크", "악화", "부진")
    for article in articles[:5]:
        if not isinstance(article, dict):
            continue
        text = " ".join(
            str(article.get(field) or "")
            for field in ("title", "summary", "importance_reason")
        )
        if any(keyword in text for keyword in positive_keywords):
            positive_hits += 1
        if any(keyword in text for keyword in negative_keywords):
            negative_hits += 1
    if positive_hits > negative_hits:
        return "positive"
    if negative_hits > positive_hits:
        return "negative"
    return "neutral"


def _rebuild_news_brief(stock_name: str, articles: list[dict], original_brief=None) -> dict:
    if not articles:
        return {
            "headline": f"{stock_name} 관련 최근 중요 기사를 찾지 못했습니다.",
            "summary": f"{stock_name} 기준으로 종목명이 정확히 일치하는 최근 중요 기사가 없어 요약을 비웠습니다.",
            "sentiment": "neutral",
            "positive_factors": [],
            "risk_factors": [],
            "upcoming_events": [],
        }
    first = articles[0] if isinstance(articles[0], dict) else {}
    summaries: list[str] = []
    for article in articles[:2]:
        if not isinstance(article, dict):
            continue
        summary = str(article.get("summary") or "").strip()
        title = str(article.get("title") or "").strip()
        text = summary or title
        if text and text not in summaries:
            summaries.append(text)
    sentiment = _guess_news_sentiment(articles)
    if isinstance(original_brief, dict) and not summaries:
        return dict(original_brief)
    return {
        "headline": str(first.get("title") or f"{stock_name} 최근 뉴스"),
        "summary": " ".join(summaries).strip(),
        "sentiment": sentiment,
        "positive_factors": [],
        "risk_factors": [],
        "upcoming_events": [],
    }


def _stock_key(item) -> str:
    if not isinstance(item, dict):
        return ""
    for field in ("stock_key", "stock_code", "stock_name", "resolved_name"):
        value = str(item.get(field) or "").strip()
        if value:
            return value
    return ""


def _weight_pct(item) -> float:
    if not isinstance(item, dict):
        return 0.0
    for field in ("weight_pct", "before_weight_pct", "after_weight_pct"):
        value = _safe_float(item.get(field), float("nan"))
        if math.isfinite(value):
            return value
    return 0.0


def _daily_stock_return_pct(item) -> float:
    if not isinstance(item, dict):
        return 0.0
    weight_pct = _weight_pct(item)
    contribution_pct = _safe_float(item.get("daily_contribution_pct"), float("nan"))
    if math.isfinite(weight_pct) and abs(weight_pct) > 1e-9 and math.isfinite(contribution_pct):
        return (contribution_pct / weight_pct) * 100.0
    return _safe_float(item.get("daily_return_pct"), 0.0)


def _build_stock_map(rows) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for item in _safe_list(rows):
        key = _stock_key(item)
        if key:
            result[key] = item
    return result


def _calculate_mdd(nav_values: list[float]) -> float:
    peak = None
    worst = 0.0
    for nav in nav_values:
        if not math.isfinite(nav) or nav <= 0:
            continue
        if peak is None or nav > peak:
            peak = nav
        if peak:
            drawdown_pct = ((nav - peak) / peak) * 100.0
            if drawdown_pct < worst:
                worst = drawdown_pct
    return worst


def _apply_leader_pyramiding(
    payload: dict,
    *,
    enabled: bool,
    trigger_pct: float,
    add_weight_pct: float,
    max_add_count: int,
) -> dict:
    if not enabled or trigger_pct <= 0 or add_weight_pct <= 0 or max_add_count <= 0:
        return payload
    rows = _safe_list(payload.get("rows"))
    if not rows:
        return payload

    result = copy.deepcopy(payload)
    rows = _safe_list(result.get("rows"))
    summary = result.get("summary")
    if not isinstance(summary, dict):
        summary = {}
        result["summary"] = summary

    active_lots: list[dict] = []
    pending_lots: list[dict] = []
    realized_pnl = 0.0
    modified_nav_history: list[float] = []
    previous_modified_nav = None

    for row in rows:
        if not isinstance(row, dict):
            continue

        before_close_map = _build_stock_map(row.get("holdings_before_close"))
        holdings_map = _build_stock_map(row.get("holdings"))
        sell_keys = {
            _stock_key(item)
            for item in _safe_list(((row.get("entry_exit") or {}).get("sell_details")))
            if _stock_key(item)
        }

        if pending_lots:
            carry_pending = []
            for lot in pending_lots:
                if lot["stock_key"] in before_close_map or lot["stock_key"] in holdings_map:
                    active_lots.append(
                        {
                            **lot,
                            "current_value": lot["cost"],
                        }
                    )
                else:
                    carry_pending.append(lot)
            pending_lots = carry_pending

        next_active_lots = []
        for lot in active_lots:
            item = before_close_map.get(lot["stock_key"]) or holdings_map.get(lot["stock_key"])
            stock_return_pct = _daily_stock_return_pct(item)
            lot["current_value"] *= 1 + (stock_return_pct / 100.0)
            still_held = lot["stock_key"] in before_close_map or lot["stock_key"] in holdings_map
            if lot["stock_key"] in sell_keys or not still_held:
                realized_pnl += lot["current_value"] - lot["cost"]
            else:
                next_active_lots.append(lot)
        active_lots = next_active_lots

        base_nav = 100.0 * (1.0 + (_safe_float(row.get("strategy_return_pct")) / 100.0))
        extra_unrealized_pnl = sum(lot["current_value"] - lot["cost"] for lot in active_lots)
        modified_nav = base_nav + realized_pnl + extra_unrealized_pnl
        if modified_nav <= 0:
            modified_nav = base_nav
        modified_nav_history.append(modified_nav)

        if previous_modified_nav and previous_modified_nav > 0:
            row["daily_return_pct"] = round(((modified_nav / previous_modified_nav) - 1.0) * 100.0, 4)
        row["strategy_return_pct"] = round(((modified_nav / 100.0) - 1.0) * 100.0, 4)
        previous_modified_nav = modified_nav

        active_value_by_stock: dict[str, float] = {}
        for lot in active_lots:
            active_value_by_stock[lot["stock_key"]] = active_value_by_stock.get(lot["stock_key"], 0.0) + lot["current_value"]

        for field_name in ("holdings", "holdings_before_close"):
            items = _safe_list(row.get(field_name))
            for item in items:
                stock_key = _stock_key(item)
                if not stock_key:
                    continue
                extra_value = active_value_by_stock.get(stock_key, 0.0)
                if extra_value <= 0 or modified_nav <= 0:
                    continue
                extra_weight_pct = (extra_value / modified_nav) * 100.0
                item["pyramiding_weight_pct"] = round(extra_weight_pct, 4)
                if "weight_pct" in item:
                    item["weight_pct"] = round(_safe_float(item.get("weight_pct")) + extra_weight_pct, 4)
                if "before_weight_pct" in item:
                    item["before_weight_pct"] = round(_safe_float(item.get("before_weight_pct")) + extra_weight_pct, 4)
            row[field_name] = items

        holdings = _safe_list(row.get("holdings"))
        base_exposure_pct = sum(max(_safe_float(item.get("weight_pct")), 0.0) for item in holdings)
        base_exposure_pct = min(max(base_exposure_pct, 0.0), 100.0)
        base_cash_value = base_nav * (1.0 - (base_exposure_pct / 100.0))
        reserved_cost = sum(lot["cost"] for lot in active_lots) + sum(lot["cost"] for lot in pending_lots)
        available_cash_value = max(base_cash_value - reserved_cost, 0.0)
        if available_cash_value <= 0:
            continue

        sorted_holdings = sorted(
            holdings,
            key=lambda item: _safe_float((item or {}).get("avg_buy_return_pct"), -1e9),
            reverse=True,
        )
        for item in sorted_holdings:
            stock_key = _stock_key(item)
            if not stock_key:
                continue
            active_count = sum(1 for lot in active_lots if lot["stock_key"] == stock_key)
            active_count += sum(1 for lot in pending_lots if lot["stock_key"] == stock_key)
            if active_count >= max_add_count:
                continue
            current_return_pct = _safe_float(item.get("avg_buy_return_pct"), -1e9)
            required_trigger_pct = trigger_pct * (active_count + 1)
            if current_return_pct + 1e-9 < required_trigger_pct:
                continue
            lot_cost = min((base_nav * add_weight_pct) / 100.0, available_cash_value)
            if lot_cost <= 1e-9:
                continue
            pending_lots.append(
                {
                    "stock_key": stock_key,
                    "stock_code": str(item.get("stock_code") or ""),
                    "stock_name": str(item.get("stock_name") or item.get("resolved_name") or stock_key),
                    "cost": lot_cost,
                    "scheduled_date": str(row.get("date") or ""),
                }
            )
            available_cash_value -= lot_cost
            row.setdefault("entry_exit", {}).setdefault("pyramid_buy_details", []).append(
                {
                    "stock_key": stock_key,
                    "stock_code": str(item.get("stock_code") or ""),
                    "stock_name": str(item.get("stock_name") or item.get("resolved_name") or stock_key),
                    "scheduled_date": str(row.get("date") or ""),
                    "trigger_return_pct": round(required_trigger_pct, 4),
                    "target_weight_pct": round(add_weight_pct, 4),
                }
            )
            if available_cash_value <= 1e-9:
                break

    if rows:
        final_strategy_return_pct = _safe_float(rows[-1].get("strategy_return_pct"))
        index_return_pct = _safe_float(summary.get("index_return_pct"), _safe_float(summary.get("benchmark_return_pct")))
        summary["strategy_return_pct"] = round(final_strategy_return_pct, 4)
        summary["excess_return_pct"] = round(final_strategy_return_pct - index_return_pct, 4)
        summary["mdd_pct"] = round(_calculate_mdd(modified_nav_history), 4)
        summary["avg_holdings_count"] = round(
            sum(_safe_float(row.get("holdings_count")) for row in rows) / len(rows),
            4,
        )
        summary["pyramiding_enabled"] = True
        summary["pyramiding_trigger_pct"] = round(trigger_pct, 4)
        summary["pyramiding_add_weight_pct"] = round(add_weight_pct, 4)
        summary["pyramiding_max_add_count"] = _safe_int(max_add_count, 1)
    result["rows"] = rows
    result["summary"] = summary
    return result


def search_stock_news(query, limit=30, days=365):
    payload = _LEGACY_SEARCH_STOCK_NEWS(query, limit=limit, days=days)
    if not isinstance(payload, dict):
        return payload
    stock = payload.get("stock") if isinstance(payload.get("stock"), dict) else {}
    stock_name = str(stock.get("name") or "").strip()
    stock_code = str(stock.get("code") or "").strip()
    article_field, articles = _extract_news_articles(payload)
    filtered_articles = _filter_group_ambiguous_news_items(articles, stock_name, stock_code)
    if len(filtered_articles) == len(articles):
        return payload
    result = dict(payload)
    result[article_field] = filtered_articles
    if article_field != "items" and "items" in result:
        result["items"] = filtered_articles
    if article_field != "key_articles" and "key_articles" in result:
        result["key_articles"] = filtered_articles
    if "article_count" in result:
        result["article_count"] = len(filtered_articles)
    result["brief"] = _rebuild_news_brief(stock_name or str(query or "").strip(), filtered_articles, payload.get("brief"))
    result["filtered_count"] = len(filtered_articles)
    return result


def build_kr_stock_overview(stock_code=None, stock_name=None, months=3):
    payload = _LEGACY_BUILD_KR_STOCK_OVERVIEW(stock_code=stock_code, stock_name=stock_name, months=months)
    if not isinstance(payload, dict):
        return payload
    code = str(payload.get("stock_code") or stock_code or "").strip()
    if not code:
        return payload
    homepage_url, ir_materials_url = _load_ir_materials_links(code)
    if not homepage_url and not ir_materials_url:
        return payload
    result = dict(payload)
    if homepage_url:
        result["company_homepage_url"] = homepage_url
    if ir_materials_url:
        result["ir_materials_url"] = ir_materials_url
    return result


app.router.routes = [
    route for route in app.router.routes if getattr(route, "path", "") != "/api/stocks/news-brief"
]


@app.get("/api/stocks/news-brief")
def stock_news_brief(q: str = "", days: int = 7, force_refresh: bool = False, limit: int = 3):
    try:
        payload = search_stock_news(q, limit=limit, days=days)
        if isinstance(payload, dict):
            payload = dict(payload)
            payload["force_refresh"] = bool(force_refresh)
        return JSONResponse(payload)
    except Exception as exc:
        return JSONResponse(
            {
                "stock": {"code": "", "name": str(q or "").strip()},
                "days": days,
                "article_count": 0,
                "brief": _rebuild_news_brief(str(q or "").strip() or "종목", [], None),
                "key_articles": [],
                "model": "",
                "generated_at": "",
                "cache_source": "",
                "ai_error": str(exc),
                "source_errors": [],
                "force_refresh": bool(force_refresh),
            },
            status_code=200,
        )


# Replace the legacy route so new query params can be handled in Python source.
app.router.routes = [
    route for route in app.router.routes if getattr(route, "path", "") != "/api/strategy/backtest"
]


@app.get("/api/strategy/backtest")
def strategy_backtest(
    index: str = "KS11",
    strategy: str = "ma20_cross",
    market: str = "kr",
    start: str = "",
    end: str = "",
    top_n: int = 100,
    exit_top_n: int = 100,
    entry_threshold: float = 65,
    exit_threshold: float = 50,
    allocation_mode: str = "score_weight",
    entry_streak_days: int = 1,
    runup_lookback_days: int = 0,
    runup_exclude_pct: float = 0,
    stop_loss_pct: float = 0,
    stop_loss_mode: str = "pct",
    exit_ma20_break: bool = False,
    exit_ma60_break: bool = False,
    min_market_cap_100m: float = 0,
    max_atr_20: float = 0,
    use_entry_top_n: bool = True,
    use_exit_top_n: bool = True,
    use_entry_threshold: bool = True,
    use_exit_threshold: bool = True,
    use_entry_streak: bool = True,
    use_runup_filter: bool = False,
    use_stop_loss: bool = False,
    use_min_market_cap_filter: bool = False,
    use_atr_filter: bool = False,
    use_entry_52w_high: bool = False,
    entry_high_filter: str = "none",
    use_pyramiding: bool = False,
    pyramid_trigger_pct: float = 0,
    pyramid_add_weight_pct: float = 0,
    pyramid_max_add_count: int = 1,
):
    try:
        payload = build_strategy_backtest(
            index=index,
            strategy=strategy,
            market=market,
            start=start,
            end=end,
            top_n=top_n,
            exit_top_n=exit_top_n,
            entry_threshold=entry_threshold,
            exit_threshold=exit_threshold,
            allocation_mode=allocation_mode,
            entry_streak_days=entry_streak_days,
            runup_lookback_days=runup_lookback_days,
            runup_exclude_pct=runup_exclude_pct,
            stop_loss_pct=stop_loss_pct,
            stop_loss_mode=stop_loss_mode,
            exit_ma20_break=exit_ma20_break,
            exit_ma60_break=exit_ma60_break,
            min_market_cap_100m=min_market_cap_100m,
            max_atr_20=max_atr_20,
            use_entry_top_n=use_entry_top_n,
            use_exit_top_n=use_exit_top_n,
            use_entry_threshold=use_entry_threshold,
            use_exit_threshold=use_exit_threshold,
            use_entry_streak=use_entry_streak,
            use_runup_filter=use_runup_filter,
            use_stop_loss=use_stop_loss,
            use_min_market_cap_filter=use_min_market_cap_filter,
            use_atr_filter=use_atr_filter,
            use_entry_52w_high=use_entry_52w_high,
            entry_high_filter=entry_high_filter,
        )
        if isinstance(payload, dict) and str(strategy or "").strip().lower() == "leader_custom":
            payload = _apply_leader_pyramiding(
                payload,
                enabled=use_pyramiding,
                trigger_pct=pyramid_trigger_pct,
                add_weight_pct=pyramid_add_weight_pct,
                max_add_count=pyramid_max_add_count,
            )
        return JSONResponse(payload)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

# Older runtime snapshots used fixed screening paths. Override every derived
# configuration path before feature modules and requests can access them.
SCREENING_DIR = SCREENING_CONFIG_ROOT
SCORE_FORMULA_CONFIG_PATH = SCREENING_DIR / "score_formula_config.json"
US_SCORE_FORMULA_CONFIG_PATH = SCREENING_DIR / "us_score_formula_config.json"
ASIA_SCORE_FORMULA_CONFIG_PATH = SCREENING_DIR / "asia_score_formula_config.json"

from backend.api.route_domains import apply_route_domains
from backend.features.portfolio import install_portfolio_manual_journal
from backend.features.themes import install_theme_rebuild_date


install_portfolio_manual_journal(sys.modules[__name__])
install_theme_rebuild_date(sys.modules[__name__])

app.router.routes = [
    route for route in app.router.routes
    if getattr(route, "path", "") != "/api/us-themes/build-today-data"
]


def _strip_progress_noise(text: str) -> str:
    cleaned_lines: list[str] = []
    for raw_line in str(text or "").replace("\r", "\n").splitlines():
        line = html.unescape(raw_line).strip()
        if not line:
            continue
        if re.search(r"\d+%\|", line) or re.search(r"\d+/\d+\s*\[", line):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines[-12:]).strip()


def _parse_us_build_output(stdout: str, requested_key: str) -> dict[str, str]:
    text = str(stdout or "")
    effective_match = re.search(r"effective_date=(20\d{6})", text)
    range_end_match = re.search(r"end_date=(20\d{6})", text)
    range_start_match = re.search(r"start_date=(20\d{6})", text)
    dates_match = re.search(r"dates=(\d+)", text)
    rows_match = re.search(r"rows=(\d+)", text)
    requested_match = re.search(r"requested_date=(20\d{6})", text)
    effective_key = (
        effective_match.group(1)
        if effective_match
        else range_end_match.group(1)
        if range_end_match
        else requested_key
    )
    requested_key = requested_match.group(1) if requested_match else requested_key
    iso = f"{effective_key[:4]}-{effective_key[4:6]}-{effective_key[6:8]}" if len(effective_key) == 8 else ""
    return {
        "requested_key": requested_key,
        "effective_key": effective_key,
        "start_key": range_start_match.group(1) if range_start_match else "",
        "dates": dates_match.group(1) if dates_match else "",
        "rows": rows_match.group(1) if rows_match else "",
        "file_date": iso,
    }


def _previous_us_weekday_key(date_key: str) -> str:
    probe = dt.datetime.strptime(str(date_key), "%Y%m%d").date()
    while not _is_us_market_session(probe):
        probe -= dt.timedelta(days=1)
    return probe.strftime("%Y%m%d")


def _last_completed_us_session_key(date_key: str) -> str:
    now_ny = dt.datetime.now(dt.timezone.utc).astimezone(ZoneInfo("America/New_York"))
    try:
        probe = dt.datetime.strptime(str(date_key), "%Y%m%d").date()
    except Exception:
        probe = now_ny.date()
    if probe >= now_ny.date() and (not _is_us_market_session(now_ny.date()) or now_ny.time() < dt.time(17, 0)):
        probe = now_ny.date() - dt.timedelta(days=1)
    while not _is_us_market_session(probe):
        probe -= dt.timedelta(days=1)
    return probe.strftime("%Y%m%d")


def _next_date_key(date_key: str) -> str:
    probe = dt.datetime.strptime(str(date_key), "%Y%m%d").date() + dt.timedelta(days=1)
    return probe.strftime("%Y%m%d")


def _latest_us_screening_date_key() -> str:
    db_path = PROJECT_ROOT / "backend" / "us_stock_daily_fast.sqlite"
    if not db_path.exists():
        return ""
    try:
        with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=10) as conn:
            row = conn.execute("SELECT MAX(file_date_key) FROM screening_rows").fetchone()
        latest = re.sub(r"\D", "", str((row or [""])[0] or ""))[:8]
        return latest if re.fullmatch(r"20\d{6}", latest) else ""
    except Exception:
        return ""


def _observed_us_holiday(month: int, day: int, year: int) -> dt.date:
    holiday = dt.date(year, month, day)
    if holiday.weekday() == 5:
        return holiday - dt.timedelta(days=1)
    if holiday.weekday() == 6:
        return holiday + dt.timedelta(days=1)
    return holiday


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> dt.date:
    probe = dt.date(year, month, 1)
    while probe.weekday() != weekday:
        probe += dt.timedelta(days=1)
    return probe + dt.timedelta(days=7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> dt.date:
    probe = dt.date(year, month + 1, 1) - dt.timedelta(days=1) if month < 12 else dt.date(year, 12, 31)
    while probe.weekday() != weekday:
        probe -= dt.timedelta(days=1)
    return probe


def _easter_date(year: int) -> dt.date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return dt.date(year, month, day)


def _is_us_market_session(day: dt.date) -> bool:
    if day.weekday() >= 5:
        return False
    year = day.year
    holidays = {
        _observed_us_holiday(1, 1, year),
        _nth_weekday(year, 1, 0, 3),
        _nth_weekday(year, 2, 0, 3),
        _easter_date(year) - dt.timedelta(days=2),
        _last_weekday(year, 5, 0),
        _observed_us_holiday(6, 19, year),
        _observed_us_holiday(7, 4, year),
        _nth_weekday(year, 9, 0, 1),
        _nth_weekday(year, 11, 3, 4),
        _observed_us_holiday(12, 25, year),
    }
    return day not in holidays


def _earliest_missing_us_weekday_key(end_date_key: str, lookback_days: int = 45) -> str:
    """Return the first missing recent US trading day so range builds fill gaps."""
    db_path = PROJECT_ROOT / "backend" / "us_stock_daily_fast.sqlite"
    if not db_path.exists() or not re.fullmatch(r"20\d{6}", str(end_date_key or "")):
        return ""
    try:
        end_date = dt.datetime.strptime(str(end_date_key), "%Y%m%d").date()
    except Exception:
        return ""
    start_date = end_date - dt.timedelta(days=max(7, int(lookback_days)))
    start_key = start_date.strftime("%Y%m%d")
    try:
        with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=10) as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT file_date_key
                FROM screening_rows
                WHERE file_date_key BETWEEN ? AND ?
                """,
                (start_key, end_date_key),
            ).fetchall()
        saved = {re.sub(r"\D", "", str(row[0] or ""))[:8] for row in rows}
    except Exception:
        return ""
    probe = start_date
    while probe <= end_date:
        if _is_us_market_session(probe):
            key = probe.strftime("%Y%m%d")
            if key not in saved:
                return key
        probe += dt.timedelta(days=1)
    return ""


@app.post("/api/us-themes/build-today-data")
def build_us_themes_today_data(payload: dict = Body(default={})):
    requested_date = _date_key_from_value((payload or {}).get("file_date"))
    has_explicit_date = bool(requested_date)
    if not requested_date:
        requested_date = dt.datetime.now(dt.timezone.utc).astimezone(ZoneInfo("America/New_York")).strftime("%Y%m%d")
    effective_end_date = _previous_us_weekday_key(requested_date) if has_explicit_date else _last_completed_us_session_key(requested_date)
    latest_saved_date = _latest_us_screening_date_key()
    missing_start_date = _earliest_missing_us_weekday_key(effective_end_date)
    script_path = PROJECT_ROOT / "tools" / "build_us_stock_daily_single.py"
    if not script_path.exists():
        return JSONResponse({"error": "미국 데이터 생성 스크립트를 찾지 못했습니다."}, status_code=500)
    if latest_saved_date and latest_saved_date >= effective_end_date and not missing_start_date:
        file_date = f"{latest_saved_date[:4]}-{latest_saved_date[4:6]}-{latest_saved_date[6:8]}"
        return JSONResponse({
            "ok": True,
            "file_date": file_date,
            "requested_file_date": f"{requested_date[:4]}-{requested_date[4:6]}-{requested_date[6:8]}",
            "today_excel_build": {
                "date": file_date,
                "requested_date": requested_date,
                "effective_date": latest_saved_date,
                "source": "sql",
                "mode": "cache",
                "dates": 0,
            },
            "stdout": "미국 최신 거래일 데이터가 이미 저장되어 있습니다.",
        })
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("TQDM_DISABLE", "1")
    start_date = missing_start_date or (_next_date_key(latest_saved_date) if latest_saved_date else "")
    command = [
        sys.executable,
        "-u",
        str(script_path),
    ]
    if start_date and start_date <= effective_end_date:
        command.extend(["--start-date", start_date, "--end-date", effective_end_date])
    else:
        command.extend(["--date", effective_end_date])
    command.extend([
        "--max-workers",
        str(max(1, min(12, _safe_int((payload or {}).get("max_workers"), 8)))),
    ])
    try:
        completed = subprocess.run(
            command,
            cwd=str(PROJECT_ROOT),
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=60 * 45,
        )
    except subprocess.TimeoutExpired:
        return JSONResponse({"error": "미국 오늘자 데이터 생성 시간이 초과되었습니다."}, status_code=504)
    except Exception as exc:
        return JSONResponse({"error": f"미국 오늘자 데이터 생성 실행 실패: {exc}"}, status_code=500)

    if completed.returncode != 0:
        message = _strip_progress_noise(completed.stderr) or _strip_progress_noise(completed.stdout)
        if not message:
            message = f"미국 오늘자 데이터 생성 실패: exit code {completed.returncode}"
        return JSONResponse({"error": message}, status_code=500)

    _clear_us_theme_page_cache()
    parsed = _parse_us_build_output(completed.stdout, effective_end_date)
    file_date = parsed.get("file_date") or ""
    return JSONResponse({
        "ok": True,
        "file_date": file_date,
        "requested_file_date": f"{requested_date[:4]}-{requested_date[4:6]}-{requested_date[6:8]}",
        "today_excel_build": {
            "date": file_date,
            "requested_date": parsed.get("requested_key"),
            "effective_date": parsed.get("effective_key"),
            "source": "sql",
            "mode": "range" if parsed.get("start_key") else "single",
            "start_date": parsed.get("start_key"),
            "dates": _safe_int(parsed.get("dates"), 1),
            "rows": _safe_int(parsed.get("rows"), 0),
        },
        "stdout": _strip_progress_noise(completed.stdout),
    })


# Breakout study -----------------------------------------------------------
# The fast daily cache is the same source used by "오늘의 주도주".  Keeping
# this calculation beside the API (instead of in the browser) makes a study
# reproducible and lets the result be retained as a research snapshot.
BREAKOUT_DB_PATH = PROJECT_ROOT / "backend" / "stock_daily_fast.sqlite"
BREAKOUT_SECTOR_PATH = PROJECT_ROOT / "backend" / "sector_database.json"
BREAKOUT_SNAPSHOT_PATH = PROJECT_ROOT / "backend" / "runtime" / "breakout_stats_snapshots.json"


def _breakout_date_key(value: str) -> str:
    return re.sub(r"\D", "", str(value or ""))[:8]


def _breakout_iso(value: str) -> str:
    key = _breakout_date_key(value)
    return f"{key[:4]}-{key[4:6]}-{key[6:8]}" if len(key) == 8 else ""


def _breakout_sector_map() -> dict[str, str]:
    try:
        raw = json.loads(BREAKOUT_SECTOR_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    stock_map = raw.get("stock_map", {}) if isinstance(raw, dict) else {}
    return {
        str(key).zfill(6): str(value.get("sector") or "").strip()
        for key, value in stock_map.items()
        if isinstance(value, dict) and str(value.get("sector") or "").strip()
    }


def _breakout_load_snapshots() -> list[dict]:
    try:
        data = json.loads(BREAKOUT_SNAPSHOT_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _breakout_store_snapshot(payload: dict) -> None:
    BREAKOUT_SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    snapshots = _breakout_load_snapshots()
    snapshots.insert(0, {
        "saved_at": dt.datetime.now().isoformat(timespec="seconds"),
        "params": payload.get("params", {}),
        "summary": payload.get("summary", {}),
        "sector_stats": payload.get("sector_stats", []),
    })
    BREAKOUT_SNAPSHOT_PATH.write_text(json.dumps(snapshots[:40], ensure_ascii=False, indent=2), encoding="utf-8")


def _build_breakout_stats(start_date: str, end_date: str, breakout_type: str,
                          min_trading_value_100m: float, min_market_cap_100m: float,
                          sell_trigger: str = "ma20", stop_loss_mode: str = "atr1",
                          stop_loss_pct: float = 8.0) -> dict:
    start_key, end_key = _breakout_date_key(start_date), _breakout_date_key(end_date)
    if len(start_key) != 8 or len(end_key) != 8 or start_key > end_key:
        raise ValueError("조회 시작일과 종료일을 확인해 주세요.")
    high_type = breakout_type if breakout_type in {"52w", "60d", "20d"} else "52w"
    exit_rule = sell_trigger if sell_trigger in {"ma10", "ma20", "mdd15"} else "ma20"
    loss_mode = stop_loss_mode if stop_loss_mode in {"atr1", "pct"} else "atr1"
    loss_pct = min(max(_safe_float(stop_loss_pct, 8.0), 0.1), 50.0)
    sector_map = _breakout_sector_map()
    market_start_key = (dt.datetime.strptime(start_key, "%Y%m%d").date() - dt.timedelta(days=180)).strftime("%Y%m%d")
    with sqlite3.connect(f"file:{BREAKOUT_DB_PATH.as_posix()}?mode=ro", uri=True, timeout=20) as conn:
        conn.row_factory = sqlite3.Row
        # Market breadth is intentionally unfiltered: it measures how widely
        # 52-week highs are expanding across the entire Korean stock universe.
        breadth_rows = conn.execute(
            """SELECT file_date_key, COUNT(*) AS high_count
                 FROM screening_rows
                WHERE file_date_key BETWEEN ? AND ? AND COALESCE(security_type, 'stock')='stock' AND is_52w_high=1
                GROUP BY file_date_key ORDER BY file_date_key""", (market_start_key, end_key)
        ).fetchall()
        breadth_values = [(str(item["file_date_key"]), int(item["high_count"] or 0)) for item in breadth_rows]
        breadth_by_date = dict(breadth_values)
        breadth_ratio_by_date = {}
        for index, (date_key, count) in enumerate(breadth_values):
            recent = [value for _, value in breadth_values[max(0, index - 59):index + 1]]
            average = sum(recent) / len(recent) if recent else 0
            breadth_ratio_by_date[date_key] = (count / average) if average else 0
        rows = conn.execute(
            """SELECT file_date_key, stock_code, stock_name, sector, industry, market_cap_100m,
                      trading_value_100m, change_pct, score_s, score_o, is_52w_high, is_20d_high, atr_20
                 FROM screening_rows
                WHERE file_date_key BETWEEN ? AND ?
                  AND COALESCE(security_type, 'stock') = 'stock'
                  AND COALESCE(market_cap_100m, 0) >= ?
                  AND COALESCE(trading_value_100m, 0) >= ?""",
            (start_key, end_key, float(min_market_cap_100m), float(min_trading_value_100m)),
        ).fetchall()
        def became_new_flag(row: dict, flag_column: str) -> bool:
            if int(row.get(flag_column) or 0) != 1:
                return False
            previous = conn.execute(
                f"SELECT {flag_column} FROM screening_rows WHERE stock_code=? AND file_date_key<? ORDER BY file_date_key DESC LIMIT 1",
                (str(row["stock_code"]).zfill(6), row["file_date_key"]),
            ).fetchone()
            return previous is None or int(previous[0] or 0) != 1

        if high_type == "52w":
            candidates = [dict(row) for row in rows if became_new_flag(dict(row), "is_52w_high")]
        elif high_type == "20d":
            candidates = [dict(row) for row in rows if became_new_flag(dict(row), "is_20d_high")]
        else:
            # 60-day highs are not stored as a flag; determine them from the
            # daily OHLC cache using the preceding 60 available sessions.
            candidates = []
            for row in rows:
                latest = conn.execute(
                    """SELECT high_price FROM daily_close_cache
                         WHERE stock_code = ? AND file_date_key <= ?
                         ORDER BY file_date_key DESC LIMIT 61""",
                    (str(row["stock_code"]).zfill(6), row["file_date_key"]),
                ).fetchall()
                if len(latest) >= 20 and latest[0]["high_price"] is not None:
                    current_high = float(latest[0]["high_price"])
                    prior_high = max(float(item["high_price"] or 0) for item in latest[1:]) if len(latest) > 1 else 0
                    previous_day = latest[1] if len(latest) > 1 else None
                    prior_before_previous = max(float(item["high_price"] or 0) for item in latest[2:]) if len(latest) > 2 else 0
                    was_already_high = previous_day is not None and float(previous_day["high_price"] or 0) >= prior_before_previous
                    if current_high >= prior_high and not was_already_high:
                        candidates.append(dict(row))

        events = []
        # Evaluate every state-transition signal first.  Deduplication below
        # then keeps the first signal for each resulting trend state, so a
        # name can appear again only when its later breakout produces a
        # materially different outcome (상승/횡보/하락).
        for row in sorted(candidates, key=lambda item: (item["file_date_key"], str(item["stock_code"]))):
            code = str(row["stock_code"]).zfill(6)
            prior_history = conn.execute(
                """SELECT file_date_key, close_price, high_price, low_price
                     FROM daily_close_cache WHERE stock_code=? AND file_date_key<?
                     ORDER BY file_date_key DESC LIMIT 60""", (code, row["file_date_key"])
            ).fetchall()
            future_history = conn.execute(
                """SELECT file_date_key, close_price, high_price, low_price
                     FROM daily_close_cache WHERE stock_code=? AND file_date_key>=?
                     ORDER BY file_date_key LIMIT 61""", (code, row["file_date_key"])
            ).fetchall()
            if not future_history or not future_history[0]["close_price"]:
                continue
            entry = float(future_history[0]["close_price"])
            if entry <= 0:
                continue
            forward = [dict(item) for item in future_history]
            price_context = [dict(item) for item in reversed(prior_history)] + forward
            entry_index = len(prior_history)
            atr_window = price_context[max(0, entry_index - 20):entry_index]
            atr_ranges = [max(0.0, float(item.get("high_price") or 0) - float(item.get("low_price") or 0)) for item in atr_window]
            atr_amount = (sum(atr_ranges) / len(atr_ranges)) if atr_ranges else (entry * loss_pct / 100.0)
            stop_loss_price = max(0.01, entry - (atr_amount if loss_mode == "atr1" else entry * loss_pct / 100.0))
            stop_loss_return = ((stop_loss_price / entry) - 1) * 100.0
            max_high = max(float(item.get("high_price") or item.get("close_price") or entry) for item in forward)
            peak_index = next((idx for idx, item in enumerate(forward) if float(item.get("high_price") or 0) >= max_high), 0)
            exit_index = None
            exit_price = None
            exit_reason = ""
            peak_since_entry = entry
            for index in range(entry_index + 1, len(price_context)):
                item = price_context[index]
                close = float(item.get("close_price") or entry)
                low = float(item.get("low_price") or close)
                peak_since_entry = max(peak_since_entry, float(item.get("high_price") or close))
                if low <= stop_loss_price:
                    triggered = True
                    trigger_reason = "1 ATR 손절" if loss_mode == "atr1" else "손절 -" + str(round(loss_pct, 2)) + "%"
                    trigger_price = stop_loss_price
                elif exit_rule == "mdd15":
                    triggered = close <= peak_since_entry * 0.85
                    trigger_reason = "고점 대비 MDD -15%"
                    trigger_price = close
                else:
                    window = 10 if exit_rule == "ma10" else 20
                    closes = [float(item.get("close_price") or 0) for item in price_context[index - window + 1:index + 1]]
                    triggered = len(closes) == window and close < (sum(closes) / window)
                    trigger_reason = ("10일선 이탈" if exit_rule == "ma10" else "20일선 이탈")
                    trigger_price = close
                if triggered:
                    exit_index = index
                    exit_price = trigger_price
                    exit_reason = trigger_reason
                    break
            exit_item = price_context[exit_index] if exit_index is not None else None
            exit_price = exit_price if exit_price is not None else (float(exit_item.get("close_price") or entry) if exit_item else None)
            exit_return = ((exit_price / entry) - 1) * 100 if exit_price else None
            # A rule-triggered sale is only a whipsaw when it exits below the
            # breakout price. Profitable exits are treated as valid trends.
            whipsaw = exit_return is not None and exit_return < 0
            max_return = (max_high / entry - 1.0) * 100.0
            # Results use the actual sell-trigger or configured stop-loss
            # price, so changing the loss setting directly changes the study.
            realized_return = exit_return
            mark_return = ((float(forward[-1].get("close_price") or entry) / entry) - 1) * 100.0
            # Open positions are treated as if sold at the latest available
            # close for all performance statistics and trend selection.
            effective_return = realized_return if realized_return is not None else mark_return
            trend_state = "하락" if whipsaw or effective_return <= -8 else "상승" if effective_return > 0 else "횡보"
            sector = sector_map.get(code) or str(row.get("sector") or "").strip() or str(row.get("industry") or "").strip() or "미분류"
            market_high_count = breadth_by_date.get(str(row["file_date_key"]), 0)
            market_strength_ratio = breadth_ratio_by_date.get(str(row["file_date_key"]), 0)
            market_strength = "강함" if market_strength_ratio >= 1.4 else "보통" if market_strength_ratio >= 0.7 else "약함"
            trajectory_end = min(41, exit_index - entry_index + 1) if exit_index is not None else 41
            trajectory = [round(((float(item.get("close_price") or entry) / entry) - 1) * 100, 2) for item in forward[:trajectory_end]]
            # A stop can be hit intraday even when the closing price recovers;
            # show the actual execution return as the final plotted point.
            if trajectory and exit_return is not None:
                trajectory[-1] = round(exit_return, 2)
            events.append({
                "date": _breakout_iso(row["file_date_key"]), "stock_code": code, "stock_name": row["stock_name"],
                "sector": sector, "entry_price": round(entry, 2), "max_return_pct": round(max_return, 2),
                "days_to_peak": peak_index, "whipsaw": whipsaw, "trend_success": effective_return >= 20,
                "exit_date": _breakout_iso(exit_item.get("file_date_key")) if exit_item else "", "exit_return_pct": round(exit_return, 2) if exit_return is not None else None,
                "realized_return_pct": round(realized_return, 2) if realized_return is not None else None,
                "mark_return_pct": round(mark_return, 2), "effective_return_pct": round(effective_return, 2), "trend_state": trend_state,
                "exit_rule": exit_rule, "exit_reason": exit_reason,
                "stop_loss_mode": loss_mode, "stop_loss_price": round(stop_loss_price, 2), "stop_loss_return_pct": round(stop_loss_return, 2),
                "market_high_count": market_high_count, "market_strength_ratio": round(market_strength_ratio, 2), "market_strength": market_strength,
                "market_cap_100m": row.get("market_cap_100m"), "trading_value_100m": row.get("trading_value_100m"),
                "score": row.get("score_s"), "score_o": row.get("score_o"), "change_pct": row.get("change_pct"), "atr_20": row.get("atr_20"),
                "trajectory": trajectory,
            })
        state_representatives = []
        seen_stock_states = set()
        for event in events:
            stock_state = (event["stock_code"], event["trend_state"])
            if stock_state in seen_stock_states:
                continue
            seen_stock_states.add(stock_state)
            state_representatives.append(event)
        events = state_representatives
    events.sort(key=lambda item: (item["date"], item["stock_name"]))
    sector_groups: dict[str, list[dict]] = {}
    for event in events:
        sector_groups.setdefault(event["sector"], []).append(event)
    sector_stats = []
    for sector, items in sector_groups.items():
        count = len(items)
        closed = [item for item in items if item.get("realized_return_pct") is not None]
        sector_stats.append({"sector": sector, "count": count,
            "closed_count": len(closed),
            "avg_realized_return_pct": round(sum(item["effective_return_pct"] for item in items) / count, 2) if count else None,
            "whipsaw_pct": round(sum(1 for item in items if item["whipsaw"]) / count * 100, 1),
            "trend_success_pct": round(sum(1 for item in items if item["trend_success"]) / count * 100, 1) if count else 0})
    sector_stats.sort(key=lambda item: (-(item["avg_realized_return_pct"] if item["avg_realized_return_pct"] is not None else -1e9), -item["count"]))
    whipsaws = sum(1 for item in events if item["whipsaw"])
    closed_events = [item for item in events if item.get("realized_return_pct") is not None]
    successes = sum(1 for item in events if item["trend_success"])
    profitable = [item for item in events if item["effective_return_pct"] > 0]
    trend_stats = []
    for state in ("상승", "횡보", "하락"):
        count = sum(1 for item in events if item.get("trend_state") == state)
        trend_stats.append({"trend_state": state, "count": count, "pct": round(count / len(events) * 100, 1) if events else 0})
    regime_stats = []
    for regime in ("강함", "보통", "약함"):
        items = [item for item in events if item["market_strength"] == regime]
        closed = [item for item in items if item.get("realized_return_pct") is not None]
        winning = [item for item in items if item["effective_return_pct"] > 0]
        regime_stats.append({
            "market_strength": regime, "event_count": len(items), "closed_count": len(closed),
            "avg_market_high_count": round(sum(item["market_high_count"] for item in items) / len(items), 1) if items else 0,
            "avg_strength_ratio": round(sum(item["market_strength_ratio"] for item in items) / len(items), 2) if items else 0,
            "profit_conversion_pct": round(len(winning) / len(items) * 100, 1) if items else 0,
            "avg_profit_when_profitable_pct": round(sum(item["effective_return_pct"] for item in winning) / len(winning), 2) if winning else None,
            "avg_realized_return_pct": round(sum(item["effective_return_pct"] for item in items) / len(items), 2) if items else None,
        })
    return {"params": {"start_date": _breakout_iso(start_key), "end_date": _breakout_iso(end_key), "breakout_type": high_type,
                       "min_trading_value_100m": min_trading_value_100m, "min_market_cap_100m": min_market_cap_100m,
                       "forward_sessions": 60, "sell_trigger": exit_rule, "stop_loss_mode": loss_mode, "stop_loss_pct": loss_pct,
                       "success_definition": "청산 수익률 또는 미청산 오늘 기준 평가수익률 20% 이상"},
            "summary": {"event_count": len(events), "whipsaw_pct": round(whipsaws / len(events) * 100, 1) if events else 0,
                        "closed_count": len(closed_events), "open_count": len(events) - len(closed_events),
                        "trend_success_pct": round(successes / len(events) * 100, 1) if events else 0,
                        "avg_realized_return_pct": round(sum(item["effective_return_pct"] for item in events) / len(events), 2) if events else None,
                        "profit_conversion_pct": round(len(profitable) / len(events) * 100, 1) if events else 0,
                        "avg_profit_when_profitable_pct": round(sum(item["effective_return_pct"] for item in profitable) / len(profitable), 2) if profitable else None},
            "market_strength_definition": "전체 시장 52주 신고가 수 ÷ 직전 포함 60거래일 평균 (강함 ≥ 1.40, 보통 ≥ 0.70, 약함 < 0.70)",
            "trend_definition": "청산 수익률(미청산은 오늘 종가 평가수익률) 플러스면 상승, 손절 또는 -8% 이하 하락, 그 외 횡보",
            "sector_stats": sector_stats, "market_regime_stats": regime_stats, "trend_stats": trend_stats, "events": events}


@app.get("/api/breakout-stats")
def get_breakout_stats(start_date: str, end_date: str, breakout_type: str = "52w",
                       min_trading_value_100m: float = 300, min_market_cap_100m: float = 10000,
                       sell_trigger: str = "ma20", stop_loss_mode: str = "atr1", stop_loss_pct: float = 8,
                       whipsaw_rule: str = ""):
    try:
        payload = _build_breakout_stats(start_date, end_date, breakout_type, min_trading_value_100m, min_market_cap_100m,
                                        sell_trigger or whipsaw_rule, stop_loss_mode, stop_loss_pct)
        _breakout_store_snapshot(payload)
        return JSONResponse(payload)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@app.get("/api/breakout-stats/snapshots")
def get_breakout_stats_snapshots():
    return JSONResponse({"items": _breakout_load_snapshots()})


@app.get("/api/breakout-stats/periods")
def get_breakout_stats_periods():
    with sqlite3.connect(f"file:{BREAKOUT_DB_PATH.as_posix()}?mode=ro", uri=True, timeout=20) as conn:
        first, last = conn.execute("SELECT MIN(file_date_key), MAX(file_date_key) FROM screening_rows").fetchone()
    first_date = dt.datetime.strptime(str(first), "%Y%m%d").date()
    last_date = dt.datetime.strptime(str(last), "%Y%m%d").date()
    periods = []
    for year in range(first_date.year, last_date.year + 1):
        candidates = [("year", f"{year}년 전체", dt.date(year, 1, 1), dt.date(year, 12, 31))]
        candidates += [(f"h{half}", f"{year}년 {'상반기' if half == 1 else '하반기'}", dt.date(year, 1 if half == 1 else 7, 1), dt.date(year, 6 if half == 1 else 12, 30 if half == 1 else 31)) for half in (1, 2)]
        for month in range(1, 13):
            month_start = dt.date(year, month, 1)
            month_end = dt.date(year + 1, 1, 1) - dt.timedelta(days=1) if month == 12 else dt.date(year, month + 1, 1) - dt.timedelta(days=1)
            candidates.append((f"m{month}", f"{year}년 {month}월", month_start, month_end))
        for quarter in range(1, 5):
            month = (quarter - 1) * 3 + 1
            end_month = month + 2
            end_day = 31 if end_month in (3, 12) else 30
            candidates.append((f"q{quarter}", f"{year}년 {quarter}분기", dt.date(year, month, 1), dt.date(year, end_month, end_day)))
        for kind, label, start, end in candidates:
            start, end = max(start, first_date), min(end, last_date)
            if start <= end:
                periods.append({"key": f"{year}-{kind}", "label": label, "start_date": start.isoformat(), "end_date": end.isoformat()})
    return JSONResponse({"min_date": first_date.isoformat(), "max_date": last_date.isoformat(), "periods": list(reversed(periods))})


def _breakout_gemini_key() -> str:
    for path in (PROJECT_ROOT / "backend" / "local_settings.json", PROJECT_ROOT / "local_settings.json"):
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
            if isinstance(raw, dict):
                key = str((raw.get("public_data") or {}).get("gemini_api_key") or raw.get("gemini_api_key") or "").strip()
                if key:
                    return key
        except Exception:
            pass
    return str(os.getenv("GEMINI_API_KEY") or "").strip()


@app.post("/api/breakout-stats/research")
def research_breakout_stats(payload: dict = Body(default={})):  # Gemini with Google Search grounding
    key = _breakout_gemini_key()
    if not key:
        return JSONResponse({"error": "Gemini API 키가 설정되어 있지 않습니다. backend/local_settings.json의 public_data.gemini_api_key 또는 GEMINI_API_KEY를 설정해 주세요."}, status_code=400)
    sector = str(payload.get("sector") or "").strip()
    events = payload.get("events") if isinstance(payload.get("events"), list) else []
    date_range = str(payload.get("date_range") or "").strip()
    if not sector or not events:
        return JSONResponse({"error": "리서치할 섹터와 돌파 표본이 필요합니다."}, status_code=400)
    concise_events = [{key: item.get(key) for key in ("date", "stock_name", "stock_code", "realized_return_pct", "exit_date", "score", "trading_value_100m")} for item in events[:30] if isinstance(item, dict)]
    prompt = (
        "당신은 한국 주식 추세추종 케이스스터디 애널리스트입니다. Google Search 결과를 근거로 아래 섹터의 돌파 이후 추세를 조사하세요. "
        "사실과 추론을 구분하고, 확인 가능한 뉴스 출처 제목/URL/발행일을 포함하세요. "
        "반드시 다음 JSON만 반환: {headline, thesis, catalysts:[{date,detail,source}], leader_selection, entry_plan, risk_controls, confidence}.\n"
        f"기간: {date_range}\n섹터: {sector}\n돌파 표본: {json.dumps(concise_events, ensure_ascii=False)}"
    )
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}",
            json={"contents": [{"parts": [{"text": prompt}]}], "tools": [{"google_search": {}}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}},
            timeout=45,
        )
        response.raise_for_status()
        raw = response.json()
        parts = (((raw.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        text = "".join(str(part.get("text") or "") for part in parts if isinstance(part, dict))
        research = json.loads(text) if text else {}
        metadata = (((raw.get("candidates") or [{}])[0].get("groundingMetadata") or {}).get("groundingChunks") or [])
        sources = [chunk.get("web") for chunk in metadata if isinstance(chunk, dict) and isinstance(chunk.get("web"), dict)]
        return JSONResponse({"research": research, "sources": sources})
    except Exception as exc:
        return JSONResponse({"error": f"Gemini 리서치 생성 실패: {exc}"}, status_code=502)
_move_routes_before_spa_catchall(
    "/api/stocks/news-brief",
    "/api/strategy/backtest",
    "/api/themes/rebuild-date",
    "/api/us-themes/build-today-data",
    "/api/portfolio/journal",
    "/api/breakout-stats",
    "/api/breakout-stats/snapshots",
    "/api/breakout-stats/periods",
    "/api/breakout-stats/research",
)
apply_route_domains(app)
