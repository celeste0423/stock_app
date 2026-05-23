"""Send Telegram alerts for fresh news about current portfolio holdings.

The script reuses the dashboard's existing news filters. It can discover
holdings from the local portfolio data, or from STOCK_ALERT_HOLDINGS_JSON when
running in the cloud without private Excel/state files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import calculate_portfolio_performance, clean_news_text, search_stock_news  # noqa: E402


DEFAULT_CACHE_PATH = ROOT / "backend" / "stock_news_alert_cache.json"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def load_json_file(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_holding(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, str):
        name = raw.strip()
        return {"name": name, "code": "", "weight_pct": None} if name else None
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or raw.get("stock_name") or raw.get("resolved_name") or "").strip()
    code = str(raw.get("code") or raw.get("stock_code") or "").strip()
    if not name and not code:
        return None
    weight = raw.get("weight_pct")
    if weight is None:
        weight = raw.get("weight")
    try:
        weight_pct = float(weight) if weight is not None and str(weight).strip() != "" else None
    except Exception:
        weight_pct = None
    return {"name": name or code, "code": code, "weight_pct": weight_pct}


def holdings_from_env() -> list[dict[str, Any]]:
    text = env("STOCK_ALERT_HOLDINGS_JSON")
    if not text:
        return []
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("STOCK_ALERT_HOLDINGS_JSON is not valid JSON") from exc
    if isinstance(payload, dict):
        payload = payload.get("holdings") or payload.get("stocks") or []
    holdings = [item for item in (normalize_holding(row) for row in payload) if item]
    return dedupe_holdings(holdings)


def holdings_from_portfolio(min_weight_pct: float = 0.0) -> list[dict[str, Any]]:
    performance = calculate_portfolio_performance()
    allocations = performance.get("daily_allocations") or []
    rebalances = performance.get("rebalances") or []
    if not allocations:
        return []

    latest_weights = (allocations[-1].get("stock_weights") or {}) if isinstance(allocations[-1], dict) else {}
    meta_by_name: dict[str, dict[str, Any]] = {}
    if rebalances:
        for item in rebalances[-1].get("holdings") or []:
            name = str(item.get("resolved_name") or item.get("stock_name") or item.get("stock_code") or "").strip()
            if name:
                meta_by_name[name] = item

    holdings: list[dict[str, Any]] = []
    for name, weight in sorted(latest_weights.items(), key=lambda item: float(item[1] or 0), reverse=True):
        try:
            weight_pct = float(weight or 0.0)
        except Exception:
            weight_pct = 0.0
        if weight_pct < min_weight_pct:
            continue
        meta = meta_by_name.get(str(name)) or {}
        holdings.append(
            {
                "name": str(name),
                "code": str(meta.get("stock_code") or "").strip(),
                "weight_pct": weight_pct,
                "sector": meta.get("sector") or "",
            }
        )
    return dedupe_holdings(holdings)


def dedupe_holdings(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in holdings:
        key = str(item.get("code") or item.get("name") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def news_key(stock: dict[str, Any], item: dict[str, Any]) -> str:
    source = "|".join(
        [
            str(stock.get("code") or stock.get("name") or ""),
            str(item.get("url") or ""),
            str(item.get("title") or ""),
            str(item.get("published_at") or item.get("published_date") or ""),
        ]
    )
    return hashlib.sha256(source.encode("utf-8", errors="ignore")).hexdigest()


def telegram_send(text: str) -> None:
    token = env("TELEGRAM_BOT_TOKEN")
    chat_id = env("TELEGRAM_CHAT_ID") or env("TELEGRAM_ALLOWED_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required")
    payload = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": "false",
        }
    ).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=payload, method="POST")
    with urllib.request.urlopen(req, timeout=20) as response:
        response.read()


def html_escape(text: Any) -> str:
    import html

    return html.escape(str(text or ""), quote=True)


def build_message(stock: dict[str, Any], item: dict[str, Any]) -> str:
    title = clean_news_text(item.get("title"))
    summary = clean_news_text(item.get("summary"))
    if len(summary) > 220:
        summary = summary[:217] + "..."
    stock_label = stock.get("name") or stock.get("code") or "보유종목"
    weight = stock.get("weight_pct")
    weight_text = f" · 비중 {float(weight):.1f}%" if isinstance(weight, (int, float)) else ""
    tags = ", ".join(str(tag) for tag in item.get("reason_tags") or [])
    lines = [
        "<b>보유종목 뉴스</b>",
        f"<b>{html_escape(stock_label)}</b>{html_escape(weight_text)}",
        f"<a href=\"{html_escape(item.get('url'))}\">{html_escape(title)}</a>",
        f"{html_escape(item.get('source') or '')} · {html_escape(item.get('published_at') or item.get('published_date') or '')}",
    ]
    if tags:
        lines.append(f"키워드: {html_escape(tags)}")
    if summary:
        lines.append(html_escape(summary))
    return "\n".join(line for line in lines if line)


def prune_sent(sent: dict[str, Any], keep_days: int) -> dict[str, Any]:
    cutoff = datetime.now() - timedelta(days=keep_days)
    output: dict[str, Any] = {}
    for key, value in sent.items():
        try:
            sent_at = datetime.fromisoformat(str(value.get("sent_at") if isinstance(value, dict) else value))
        except Exception:
            continue
        if sent_at >= cutoff:
            output[key] = value
    return output


def run(args: argparse.Namespace) -> dict[str, Any]:
    cache_path = Path(args.cache_path) if args.cache_path else DEFAULT_CACHE_PATH
    cache = load_json_file(cache_path, {"sent": {}})
    sent = prune_sent(cache.get("sent") if isinstance(cache.get("sent"), dict) else {}, args.keep_sent_days)

    holdings = holdings_from_env()
    source = "env"
    if not holdings:
        holdings = holdings_from_portfolio(min_weight_pct=args.min_weight_pct)
        source = "portfolio"
    holdings = holdings[: args.max_holdings]
    if not holdings:
        raise RuntimeError("No holdings found. Set STOCK_ALERT_HOLDINGS_JSON for cloud runs.")

    sent_count = 0
    checked_count = 0
    errors: list[str] = []
    for stock in holdings:
        query = stock.get("code") or stock.get("name")
        if not query:
            continue
        checked_count += 1
        try:
            payload = search_stock_news(str(query), limit=args.limit_per_stock, days=args.days)
        except Exception as exc:
            errors.append(f"{stock.get('name')}: {exc}")
            continue
        for item in payload.get("items") or []:
            key = news_key(stock, item)
            if key in sent:
                continue
            if args.dry_run:
                print(build_message(stock, item))
                print("-" * 60)
            else:
                telegram_send(build_message(stock, item))
                time.sleep(args.telegram_delay)
            sent[key] = {
                "sent_at": datetime.now().isoformat(timespec="seconds"),
                "stock": stock.get("name"),
                "title": item.get("title"),
                "url": item.get("url"),
            }
            sent_count += 1
            if sent_count >= args.max_alerts:
                break
        if sent_count >= args.max_alerts:
            break

    write_json_file(
        cache_path,
        {
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "source": source,
            "checked_count": checked_count,
            "sent": sent,
            "errors": errors[-20:],
        },
    )
    return {"source": source, "holdings": len(holdings), "checked": checked_count, "sent": sent_count, "errors": errors}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Telegram news alerts for portfolio holdings")
    parser.add_argument("--days", type=int, default=int(env("STOCK_ALERT_NEWS_DAYS", "2") or 2))
    parser.add_argument("--limit-per-stock", type=int, default=int(env("STOCK_ALERT_LIMIT_PER_STOCK", "3") or 3))
    parser.add_argument("--max-holdings", type=int, default=int(env("STOCK_ALERT_MAX_HOLDINGS", "30") or 30))
    parser.add_argument("--max-alerts", type=int, default=int(env("STOCK_ALERT_MAX_ALERTS", "10") or 10))
    parser.add_argument("--min-weight-pct", type=float, default=float(env("STOCK_ALERT_MIN_WEIGHT_PCT", "0") or 0))
    parser.add_argument("--keep-sent-days", type=int, default=int(env("STOCK_ALERT_KEEP_SENT_DAYS", "30") or 30))
    parser.add_argument("--telegram-delay", type=float, default=float(env("STOCK_ALERT_TELEGRAM_DELAY", "0.7") or 0.7))
    parser.add_argument("--cache-path", default=env("STOCK_ALERT_CACHE_PATH", str(DEFAULT_CACHE_PATH)))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    result = run(parse_args())
    print(json.dumps(result, ensure_ascii=False, indent=2))
