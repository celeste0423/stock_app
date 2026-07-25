from __future__ import annotations

import argparse
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests


BASE_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = Path(os.getenv("STOCK_BOT_STATE_DIR", str(BASE_DIR / ".alert_state")))
STATE_PATH = STATE_DIR / "oracle_leader_telegram_bot_state.json"
LOCAL_SETTINGS_PATH = BASE_DIR / "backend" / "local_settings.json"
KST = ZoneInfo("Asia/Seoul")
NY = ZoneInfo("America/New_York")
TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


MARKETS: dict[str, dict[str, str]] = {
    "kr": {
        "title": "국내",
        "today_url": "/api/themes/today",
        "build_url": "/api/themes/build-today-data",
        "status_url": "/api/themes/build-status",
        "config_market": "kr",
        "capture_key": "kr_capture_score_threshold",
        "default_threshold": "70",
        "region": "",
    },
    "us": {
        "title": "미국",
        "today_url": "/api/us-themes/today",
        "build_url": "/api/us-themes/build-today-data",
        "status_url": "/api/us-themes/build-status",
        "config_market": "us",
        "capture_key": "us_capture_score_threshold",
        "default_threshold": "15",
        "region": "",
    },
    "jp": {
        "title": "일본",
        "today_url": "/api/asia-themes/today",
        "build_url": "/api/asia-themes/build-today-data",
        "status_url": "/api/asia-themes/build-status",
        "config_market": "asia",
        "capture_key": "asia_capture_score_threshold",
        "default_threshold": "35",
        "region": "jp",
    },
    "cn": {
        "title": "중국",
        "today_url": "/api/asia-themes/today",
        "build_url": "/api/asia-themes/build-today-data",
        "status_url": "/api/asia-themes/build-status",
        "config_market": "asia",
        "capture_key": "asia_capture_score_threshold",
        "default_threshold": "35",
        "region": "cn",
    },
    "tw": {
        "title": "대만",
        "today_url": "/api/asia-themes/today",
        "build_url": "/api/asia-themes/build-today-data",
        "status_url": "/api/asia-themes/build-status",
        "config_market": "asia",
        "capture_key": "asia_capture_score_threshold",
        "default_threshold": "35",
        "region": "tw",
    },
}


HELP_TEXT = """오늘의 주도주 봇
기본 목록
/kr          국내 종합점수 기준 목록
/us          미국 종합점수 기준 목록
/jp /cn /tw  일본/중국/대만 종합점수 기준 목록

이미지
/krimg         국내 현재 캡처 기준 이상 이미지
/usimg         미국 현재 캡처 기준 이상 이미지
/kr 70 img     국내 종합점수 70점 이상 이미지
/us 60 img     미국 종합점수 60점 이상 이미지

조건 지정
/kr 70      국내 종합점수 70점 이상
/us 80      미국 종합점수 80점 이상
/kr100      국내 당일점수 100점 이상
/us100      미국 당일점수 100점 이상
/kr52w      국내 52주 신고가
/us52w      미국 52주 신고가

관리자
/reload_kr /reload_us /reload_jp /reload_cn /reload_tw
"""

BOT_COMMANDS: list[dict[str, str]] = [
    {"command": "help", "description": "사용 가능한 명령 보기"},
    {"command": "kr", "description": "국내 종합점수 기준 목록"},
    {"command": "us", "description": "미국 종합점수 기준 목록"},
    {"command": "jp", "description": "일본 종합점수 기준 목록"},
    {"command": "cn", "description": "중국 종합점수 기준 목록"},
    {"command": "tw", "description": "대만 종합점수 기준 목록"},
    {"command": "krimg", "description": "국내 기준 점수 이상 이미지"},
    {"command": "usimg", "description": "미국 기준 점수 이상 이미지"},
    {"command": "kr100", "description": "국내 당일점수 100점 이상"},
    {"command": "us100", "description": "미국 당일점수 100점 이상"},
    {"command": "kr52w", "description": "국내 52주 신고가"},
    {"command": "us52w", "description": "미국 52주 신고가"},
    {"command": "reload_kr", "description": "국내 데이터 강제 재계산"},
    {"command": "reload_us", "description": "미국 데이터 강제 재계산"},
]

RECALCULATE_ON_QUERY = os.getenv("STOCK_BOT_RECALCULATE_ON_QUERY", "1").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
RECALCULATE_PROGRESS_MESSAGE = os.getenv("STOCK_BOT_RECALCULATE_PROGRESS_MESSAGE", "0").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
SCHEDULED_IMAGE_ENABLED = os.getenv("STOCK_BOT_SCHEDULED_IMAGE_ENABLED", "1").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
ALLOW_ALL_GROUP_CHATS = os.getenv("TELEGRAM_ALLOW_ALL_GROUPS", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or default).strip()

KR_SCHEDULE_HOUR = int(env("STOCK_BOT_KR_SCHEDULE_HOUR", "15") or 15)
KR_SCHEDULE_MINUTE = int(env("STOCK_BOT_KR_SCHEDULE_MINUTE", "30") or 30)
US_SCHEDULE_HOUR = int(env("STOCK_BOT_US_SCHEDULE_HOUR", "17") or 17)
US_SCHEDULE_MINUTE = int(env("STOCK_BOT_US_SCHEDULE_MINUTE", "0") or 0)


def load_local_settings() -> dict[str, Any]:
    if not LOCAL_SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(LOCAL_SETTINGS_PATH.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}


def resolve_secret(name: str) -> str:
    direct = env(name)
    if direct:
        return direct
    settings = load_local_settings()
    stock_alert = settings.get("stock_alert", {}) if isinstance(settings, dict) else {}
    if name == "TELEGRAM_BOT_TOKEN":
        return str(stock_alert.get("telegram_bot_token", "") or "").strip()
    if name in {"TELEGRAM_ALLOWED_CHAT_IDS", "TELEGRAM_ALLOWED_CHAT_ID", "TELEGRAM_CHAT_ID"}:
        return str(stock_alert.get("telegram_chat_id", "") or "").strip()
    return ""


def allowed_chat_ids() -> set[str]:
    raw = env("TELEGRAM_ALLOWED_CHAT_IDS") or env("TELEGRAM_ALLOWED_CHAT_ID") or resolve_secret("TELEGRAM_CHAT_ID")
    return {item.strip() for item in re.split(r"[,;\s]+", raw) if item.strip()}


def is_allowed_chat(chat_id: str, chat_type: str = "") -> bool:
    normalized_type = str(chat_type or "").strip().lower()
    if normalized_type == "private":
        return bool(chat_id)
    if ALLOW_ALL_GROUP_CHATS and normalized_type in {"group", "supergroup"}:
        return bool(chat_id)
    allowed = allowed_chat_ids()
    return bool(chat_id and allowed and chat_id in allowed)


def telegram_call(method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    token = resolve_secret("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")
    data = urllib.parse.urlencode(payload or {}).encode("utf-8")
    request = urllib.request.Request(TELEGRAM_API.format(token=token, method=method), data=data, method="POST")
    with urllib.request.urlopen(request, timeout=70) as response:
        return json.loads(response.read().decode("utf-8"))


def ensure_bot_commands() -> None:
    try:
        telegram_call(
            "setMyCommands",
            {
                "commands": json.dumps(BOT_COMMANDS, ensure_ascii=False),
            },
        )
    except Exception as exc:
        print(f"failed to register bot commands: {exc}", flush=True)


def send_message(chat_id: str, text: str) -> list[int]:
    message_ids: list[int] = []
    for chunk in split_message(text):
        response = telegram_call(
            "sendMessage",
            {
                "chat_id": chat_id,
                "text": chunk,
                "disable_web_page_preview": "true",
            },
        )
        result = response.get("result") if isinstance(response, dict) else None
        try:
            message_id = int((result or {}).get("message_id"))
            message_ids.append(message_id)
        except Exception:
            pass
    return message_ids


def delete_messages(chat_id: str, message_ids: list[int]) -> None:
    for message_id in message_ids:
        try:
            telegram_call(
                "deleteMessage",
                {
                    "chat_id": chat_id,
                    "message_id": int(message_id),
                },
            )
        except Exception:
            pass


def send_photo(chat_id: str, image_bytes: bytes, caption: str = "") -> int | None:
    token = resolve_secret("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")
    response = requests.post(
        TELEGRAM_API.format(token=token, method="sendPhoto"),
        data={
            "chat_id": chat_id,
            "caption": caption,
        },
        files={
            "photo": ("leader_capture.png", image_bytes, "image/png"),
        },
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and not payload.get("ok", True):
        raise RuntimeError(str(payload))
    try:
        return int(((payload or {}).get("result") or {}).get("message_id"))
    except Exception:
        return None


def split_message(text: str, limit: int = 3900) -> list[str]:
    value = str(text or "")
    if len(value) <= limit:
        return [value]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for line in value.splitlines():
        part_len = len(line) + 1
        if current and current_len + part_len > limit:
            chunks.append("\n".join(current))
            current = []
            current_len = 0
        current.append(line)
        current_len += part_len
    if current:
        chunks.append("\n".join(current))
    return chunks or [value[:limit]]


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"offset": 0}
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            payload.setdefault("offset", 0)
            return payload
    except Exception:
        pass
    return {"offset": 0}


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def api_get(base_url: str, path: str, params: dict[str, Any] | None = None, timeout: int = 40) -> dict[str, Any]:
    response = requests.get(base_url.rstrip("/") + path, params=params or {}, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and payload.get("error"):
        raise RuntimeError(str(payload.get("error")))
    return payload


def api_get_bytes(base_url: str, path: str, params: dict[str, Any] | None = None, timeout: int = 120) -> bytes:
    response = requests.get(base_url.rstrip("/") + path, params=params or {}, timeout=timeout)
    response.raise_for_status()
    return response.content


def api_post(base_url: str, path: str, payload: dict[str, Any] | None = None, timeout: int = 900) -> dict[str, Any]:
    response = requests.post(base_url.rstrip("/") + path, json=payload or {}, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(str(data.get("error")))
    return data


def current_threshold(base_url: str, market: str) -> float:
    config = MARKETS[market]
    fallback = float(config["default_threshold"])
    try:
        payload = api_get(base_url, "/api/themes/score-formula-config", {"market": config["config_market"]}, timeout=10)
        formula = ((payload.get("config") or {}).get("display_formula") or {})
        value = formula.get(config["capture_key"])
        return float(value) if value not in {None, ""} else fallback
    except Exception:
        return fallback


def load_market_payload(base_url: str, market: str) -> dict[str, Any]:
    config = MARKETS[market]
    params: dict[str, Any] = {"market": config["config_market"] if config["region"] else market, "min_score": 0}
    if config["region"]:
        params["region"] = config["region"]
    return api_get(base_url, "/api/shared/leader-capture-data", params, timeout=60)


def reload_market(base_url: str, market: str) -> dict[str, Any]:
    config = MARKETS[market]
    payload: dict[str, Any] = {"min_score": 0, "recent_limit": 20}
    if config["region"]:
        payload["region"] = config["region"]
    return api_post(base_url, config["build_url"], payload, timeout=1800)


def load_build_status(base_url: str, market: str) -> dict[str, Any]:
    config = MARKETS[market]
    status_url = str(config.get("status_url") or "").strip()
    if not status_url:
        return {}
    params: dict[str, Any] = {}
    if config["region"]:
        params["region"] = config["region"]
    return api_get(base_url, status_url, params=params, timeout=15)


def previous_business_day(value: datetime.date) -> datetime.date:
    current = value - timedelta(days=1)
    while current.weekday() >= 5:
        current -= timedelta(days=1)
    return current


def should_recalculate_market(base_url: str, market: str) -> bool:
    if not RECALCULATE_ON_QUERY:
        return False
    now = datetime.now(KST)
    try:
        payload = load_market_payload(base_url, market)
    except Exception:
        return True
    file_date = str(payload.get("file_date") or "").strip()
    if not file_date:
        return True
    if market == "us":
        now_ny = datetime.now(NY)
        if now_ny.weekday() >= 5:
            expected = now_ny.date()
            while expected.weekday() >= 5:
                expected -= timedelta(days=1)
            return file_date != expected.isoformat()
        if (now_ny.hour, now_ny.minute) < (17, 0):
            expected = previous_business_day(now_ny.date())
            return file_date != expected.isoformat()
        return file_date != now_ny.strftime("%Y-%m-%d")
    if market in {"jp", "cn", "tw"}:
        if now.weekday() >= 5:
            return False
        if (now.hour, now.minute) < (16, 10):
            return True
        return file_date != now.strftime("%Y-%m-%d")
    if now.weekday() >= 5:
        return False
    if (now.hour, now.minute) < (16, 10):
        return True
    return file_date != now.strftime("%Y-%m-%d")


def recalculate_market_for_query(base_url: str, market: str, chat_id: str) -> None:
    if not should_recalculate_market(base_url, market):
        return
    title = MARKETS[market]["title"]
    if RECALCULATE_PROGRESS_MESSAGE:
        send_message(chat_id, f"{title} 데이터를 최신 점수 공식으로 새로 계산합니다. 완료 후 결과를 보냅니다.")
    status_url = str(MARKETS[market].get("status_url") or "").strip()
    if not status_url:
        reload_market(base_url, market)
        return

    result: dict[str, Any] = {}

    def _runner() -> None:
        try:
            result["payload"] = reload_market(base_url, market)
        except Exception as exc:
            result["error"] = exc

    worker = threading.Thread(target=_runner, daemon=True)
    worker.start()
    last_progress_key: tuple[int, str] | None = None
    while worker.is_alive():
        try:
            status = load_build_status(base_url, market)
            percent = int(max(0, min(100, number(status.get("percent"), 0.0))))
            bucket = int(percent / 5) * 5
            message = str(status.get("message") or "").strip()
            progress_key = (bucket, message)
            if progress_key != last_progress_key and (bucket > 0 or message):
                body = f"{title} 계산 중 {bucket}%"
                if message:
                    body = f"{body}\n{message}"
                send_message(chat_id, body)
                last_progress_key = progress_key
        except Exception:
            pass
        worker.join(timeout=5)

    if "error" in result:
        raise result["error"]


def number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def is_52w_high(row: dict[str, Any]) -> bool:
    raw = row.get("is_52w_high")
    if isinstance(raw, bool):
        return raw
    text = str(raw or "").strip().upper()
    if text in {"1", "Y", "YES", "TRUE", "O"}:
        return True
    return number(raw) == 1


def filter_rows(rows: list[dict[str, Any]], mode: str, threshold: float) -> list[dict[str, Any]]:
    if mode == "today100":
        result = [row for row in rows if number(row.get("score_o")) >= 100]
        return sorted(result, key=lambda row: (-number(row.get("score_o")), -number(row.get("score"))))
    if mode == "52w":
        result = [
            row
            for row in rows
            if is_52w_high(row)
            and number(row.get("trading_value_100m") or row.get("trading_value_usd")) > 0
        ]
        return sorted(result, key=lambda row: (-number(row.get("score")), -number(row.get("score_o"))))
    result = [row for row in rows if number(row.get("score")) >= threshold]
    return sorted(result, key=lambda row: (-number(row.get("score")), -number(row.get("score_o"))))


def format_float(value: Any, digits: int = 2) -> str:
    try:
        return f"{float(value):,.{digits}f}"
    except Exception:
        return "-"


def format_money_100m(value: Any, market: str) -> str:
    n = number(value, default=-1)
    if n < 0:
        return "-"
    if market == "kr":
        return f"{n:,.0f}억"
    return f"${n / 10:,.1f}B"


def row_name(row: dict[str, Any]) -> str:
    name = str(row.get("stock_name") or row.get("resolved_name") or "-").strip()
    code = str(row.get("stock_code") or "").strip()
    return f"{name}({code})" if code else name


def build_rows_message(payload: dict[str, Any], market: str, mode: str, threshold: float, max_rows: int) -> str:
    rows = [row for row in payload.get("qualified_stocks") or [] if isinstance(row, dict)]
    filtered = filter_rows(rows, mode, threshold)
    market_title = MARKETS[market]["title"]
    file_date = str(payload.get("file_date") or "-")
    if mode == "today100":
        title = f"{market_title} 당일점수 100점 이상"
    elif mode == "52w":
        title = f"{market_title} 52주 신고가"
    else:
        title = f"{market_title} 종합점수 {format_float(threshold, 0)}점 이상"
    lines = [title, f"기준일 {file_date} · {len(filtered)}개"]
    if not filtered:
        lines.append("조건을 만족하는 종목이 없습니다.")
        return "\n".join(lines)
    for idx, row in enumerate(filtered[:max_rows], start=1):
        sector = str(row.get("manual_sector") or row.get("theme") or row.get("industry") or "-").strip()
        lines.append(
            f"{idx}. {row_name(row)} | {sector}"
            f" | 종합 {format_float(row.get('score'), 2)}"
            f" | 오늘 {format_float(row.get('score_o'), 2)}"
            f" | 등락 {format_float(row.get('change_pct'), 2)}%"
            f" | 거래 {format_money_100m(row.get('trading_value_100m'), market)}"
        )
    return "\n".join(lines)


def normalize_command_text(text: str) -> str:
    raw = str(text or "").strip().lower()
    if not raw.startswith("/"):
        return raw
    parts = raw.split(None, 1)
    command = re.sub(r"@[\w_]+$", "", parts[0])
    if len(parts) == 1:
        return command
    return f"{command} {parts[1].strip()}"


def parse_command(text: str) -> tuple[str, str, float | None, bool] | None:
    raw = normalize_command_text(text)
    if raw in {"/start", "/help"}:
        return "help", "", None, False
    image_mode = False
    normalized = raw
    if normalized.endswith(" img"):
        normalized = normalized[:-4].rstrip()
        image_mode = True
    match = re.fullmatch(r"/(kr|us|jp|cn|tw)(100|52w|img)?(?:\s+([+-]?\d+(?:\.\d+)?))?", normalized)
    if not match:
        return None
    market = match.group(1)
    suffix = match.group(2) or ""
    threshold = float(match.group(3)) if match.group(3) else None
    if suffix == "img":
        return market, "score", threshold, True
    if suffix == "100":
        return market, "today100", threshold, image_mode
    if suffix == "52w":
        return market, "52w", threshold, image_mode
    return market, "score", threshold, image_mode


def build_capture_caption(payload: dict[str, Any], market: str, threshold: float) -> str:
    market_title = MARKETS[market]["title"]
    file_date = str(payload.get("file_date") or "-")
    return f"{market_title} 종합점수 {format_float(threshold, 0)}점 이상 · {file_date}"


def send_market_capture_image(base_url: str, chat_id: str, market: str, threshold: float) -> None:
    config = MARKETS[market]
    payload = load_market_payload(base_url, market)
    rows = [row for row in payload.get("qualified_stocks") or [] if isinstance(row, dict)]
    filtered = filter_rows(rows, "score", threshold)
    if not filtered:
        return
    params: dict[str, Any] = {
        "market": config["config_market"] if market in {"jp", "cn", "tw"} else market,
        "min_score": threshold,
        "limit": 40,
    }
    if config["region"]:
        params["region"] = config["region"]
    image_bytes = api_get_bytes(base_url, "/shared/leader-capture.png", params=params, timeout=600)
    send_photo(chat_id, image_bytes, build_capture_caption(payload, market, threshold))


def send_market_score_output(base_url: str, chat_id: str, market: str, mode: str, threshold: float, image_mode: bool, max_rows: int) -> None:
    payload = load_market_payload(base_url, market)
    if image_mode:
        if mode != "score":
            send_message(chat_id, "이미지 캡쳐는 현재 종합점수 기준 명령만 지원합니다. 예: /krimg, /kr 70 img, /usimg")
            return
        send_market_capture_image(base_url, chat_id, market, threshold)
        return
    send_message(chat_id, build_rows_message(payload, market, mode, threshold, max_rows))


def scheduled_jobs_due(now_kst: datetime) -> list[tuple[str, str]]:
    jobs: list[tuple[str, str]] = []
    if not SCHEDULED_IMAGE_ENABLED:
        return jobs
    if now_kst.weekday() < 5 and (now_kst.hour, now_kst.minute) >= (KR_SCHEDULE_HOUR, KR_SCHEDULE_MINUTE):
        jobs.append(("kr", now_kst.strftime("%Y-%m-%d")))
    now_ny = now_kst.astimezone(NY)
    if now_ny.weekday() < 5 and (now_ny.hour, now_ny.minute) >= (US_SCHEDULE_HOUR, US_SCHEDULE_MINUTE):
        jobs.append(("us", now_ny.strftime("%Y-%m-%d")))
    return jobs


def run_scheduled_image_jobs(base_url: str, state: dict[str, Any]) -> None:
    scheduled_state = state.setdefault("scheduled_images", {})
    for market, date_key in scheduled_jobs_due(datetime.now(KST)):
        state_key = f"{market}:{date_key}"
        if scheduled_state.get(state_key):
            continue
        try:
            threshold = current_threshold(base_url, market)
            if should_recalculate_market(base_url, market):
                reload_market(base_url, market)
            delivered = False
            for chat_id in sorted(allowed_chat_ids()):
                before_payload = load_market_payload(base_url, market)
                rows = [row for row in before_payload.get("qualified_stocks") or [] if isinstance(row, dict)]
                if not filter_rows(rows, "score", threshold):
                    continue
                send_market_capture_image(base_url, chat_id, market, threshold)
                delivered = True
            if delivered:
                scheduled_state[state_key] = datetime.now(KST).isoformat(timespec="seconds")
        except Exception as exc:
            print(
                f"[{datetime.now(KST).isoformat(timespec='seconds')}] scheduled image job failed market={market}: {exc}",
                flush=True,
            )


def run_market_refresh_with_cleanup(base_url: str, market: str, chat_id: str) -> list[int]:
    transient_message_ids: list[int] = []
    if not should_recalculate_market(base_url, market):
        return transient_message_ids

    title = MARKETS[market]["title"]
    if RECALCULATE_PROGRESS_MESSAGE:
        transient_message_ids.extend(
            send_message(chat_id, f"{title} 데이터를 최신 점수 공식으로 새로 계산합니다. 완료 후 결과를 보냅니다.")
        )

    status_url = str(MARKETS[market].get("status_url") or "").strip()
    if not status_url:
        reload_market(base_url, market)
        return transient_message_ids

    result: dict[str, Any] = {}

    def _runner() -> None:
        try:
            result["payload"] = reload_market(base_url, market)
        except Exception as exc:
            result["error"] = exc

    worker = threading.Thread(target=_runner, daemon=True)
    worker.start()
    last_progress_key: tuple[int, str] | None = None
    while worker.is_alive():
        try:
            status = load_build_status(base_url, market)
            percent = int(max(0, min(100, number(status.get("percent"), 0.0))))
            bucket = int(percent / 5) * 5
            message = str(status.get("message") or "").strip()
            progress_key = (bucket, message)
            if progress_key != last_progress_key and (bucket > 0 or message):
                body = f"{title} 계산 중 {bucket}%"
                if message:
                    body = f"{body}\n{message}"
                transient_message_ids.extend(send_message(chat_id, body))
                last_progress_key = progress_key
        except Exception:
            pass
        worker.join(timeout=5)

    if "error" in result:
        raise result["error"]
    return transient_message_ids


def handle_text(base_url: str, chat_id: str, text: str, max_rows: int) -> None:
    raw = normalize_command_text(text)
    reload_match = re.fullmatch(r"/reload_(kr|us|jp|cn|tw)", raw)
    if reload_match:
        market = reload_match.group(1)
        send_message(chat_id, f"{MARKETS[market]['title']} 데이터 갱신을 시작합니다.")
        reload_market(base_url, market)
        send_message(chat_id, f"{MARKETS[market]['title']} 데이터 갱신 요청이 완료됐습니다.")
        return

    parsed = parse_command(text)
    if not parsed:
        send_message(chat_id, "지원하지 않는 명령입니다.\n/help")
        return
    market, mode, explicit_threshold, image_mode = parsed
    if market == "help":
        send_message(chat_id, HELP_TEXT)
        return
    threshold = explicit_threshold if explicit_threshold is not None else current_threshold(base_url, market)
    transient_message_ids: list[int] = []
    try:
        transient_message_ids = run_market_refresh_with_cleanup(base_url, market, chat_id)
        send_market_score_output(base_url, chat_id, market, mode, threshold, image_mode, max_rows)
    finally:
        if transient_message_ids:
            time.sleep(1)
            delete_messages(chat_id, transient_message_ids)


def process_update(base_url: str, update: dict[str, Any], max_rows: int) -> None:
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id") or "").strip()
    chat_type = str(chat.get("type") or "").strip()
    if not is_allowed_chat(chat_id, chat_type=chat_type):
        return
    text = str(message.get("text") or "").strip()
    if not text:
        return
    try:
        handle_text(base_url, chat_id, text, max_rows)
    except Exception as exc:
        send_message(chat_id, f"처리 중 오류가 발생했습니다.\n{exc}")


def run_loop(base_url: str, poll_timeout: int, max_rows: int) -> None:
    state = load_state()
    while True:
        try:
            run_scheduled_image_jobs(base_url, state)
            save_state(state)
            result = telegram_call("getUpdates", {"timeout": poll_timeout, "offset": int(state.get("offset") or 0)})
            for update in result.get("result", []):
                state["offset"] = max(int(state.get("offset") or 0), int(update.get("update_id", 0)) + 1)
                process_update(base_url, update, max_rows=max_rows)
            save_state(state)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"[{datetime.now(KST).isoformat(timespec='seconds')}] bot error: {exc}", flush=True)
            time.sleep(5)


def main() -> None:
    parser = argparse.ArgumentParser(description="Always-on Telegram bot for current leader score APIs.")
    parser.add_argument("--server-url", default=env("STOCK_APP_API_URL", "http://127.0.0.1:8124"))
    parser.add_argument("--poll-timeout", type=int, default=int(env("STOCK_BOT_POLL_TIMEOUT", "35") or 35))
    parser.add_argument("--max-rows", type=int, default=int(env("STOCK_BOT_MAX_ROWS", "20") or 20))
    args = parser.parse_args()

    api_get(args.server_url, "/api/health", timeout=10)
    if not allowed_chat_ids():
        raise RuntimeError("TELEGRAM_ALLOWED_CHAT_IDS or TELEGRAM_ALLOWED_CHAT_ID is required")
    ensure_bot_commands()
    print(f"Leader Telegram bot started. server={args.server_url}", flush=True)
    run_loop(args.server_url, poll_timeout=args.poll_timeout, max_rows=max(1, min(args.max_rows, 50)))


if __name__ == "__main__":
    main()

