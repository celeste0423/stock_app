from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests


BASE_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = BASE_DIR / ".alert_state"
STATE_PATH = STATE_DIR / "telegram_stock_bot_state.json"
LOCAL_SETTINGS_PATH = BASE_DIR / "backend" / "local_settings.json"
KST = ZoneInfo("Asia/Seoul")
TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"

MARKET_CONFIG: dict[str, dict[str, str]] = {
    "kr": {
        "title": "국내",
        "build_url": "/api/themes/build-today-data",
        "today_url": "/api/themes/today",
        "region": "",
    },
    "us": {
        "title": "미국",
        "build_url": "/api/us-themes/build-today-data",
        "today_url": "/api/us-themes/today",
        "region": "",
    },
    "jp": {
        "title": "일본",
        "build_url": "/api/asia-themes/build-today-data",
        "today_url": "/api/asia-themes/today",
        "region": "jp",
    },
    "tw": {
        "title": "대만",
        "build_url": "/api/asia-themes/build-today-data",
        "today_url": "/api/asia-themes/today",
        "region": "tw",
    },
}

COMMAND_HELP = """가능한 명령
/help
/kr100 /us100 /jp100 /tw100  - 당일점수 100점 이상
/kr50 /us50 /jp50 /tw50      - 종합점수 50점 이상
/kr52w /us52w /jp52w /tw52w  - 52주 신고가 리스트"""


def env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or default).strip()


def load_local_settings() -> dict[str, Any]:
    if not LOCAL_SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(LOCAL_SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def resolve_telegram_secret(name: str) -> str:
    direct = env(name)
    if direct:
        return direct
    settings = load_local_settings()
    stock_alert = settings.get("stock_alert", {}) if isinstance(settings, dict) else {}
    if name == "TELEGRAM_BOT_TOKEN":
        return str(stock_alert.get("telegram_bot_token", "") or "").strip()
    if name == "TELEGRAM_CHAT_ID":
        return str(stock_alert.get("telegram_chat_id", "") or "").strip()
    return ""


def resolve_allowed_chat_id() -> str:
    return env("TELEGRAM_ALLOWED_CHAT_ID") or resolve_telegram_secret("TELEGRAM_CHAT_ID")


def ensure_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"offset": 0, "daily": {}}
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            payload.setdefault("offset", 0)
            payload.setdefault("daily", {})
            return payload
    except Exception:
        pass
    return {"offset": 0, "daily": {}}


def save_state(payload: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def telegram_call(method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    token = resolve_telegram_secret("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")
    data = urllib.parse.urlencode(payload or {}).encode("utf-8")
    req = urllib.request.Request(TELEGRAM_API.format(token=token, method=method), data=data, method="POST")
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))


def send_message(chat_id: str, text: str) -> None:
    telegram_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text[:4000],
            "disable_web_page_preview": "true",
        },
    )


def find_free_port(start: int = 8134, attempts: int = 30) -> int:
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("No free port available")


def start_server(port: int) -> subprocess.Popen[str]:
    env_map = os.environ.copy()
    env_map["STOCK_DASHBOARD_HOST"] = "127.0.0.1"
    env_map["STOCK_DASHBOARD_PORT"] = str(port)
    return subprocess.Popen(
        [sys.executable, "-u", "-m", "backend.app"],
        cwd=str(BASE_DIR),
        env=env_map,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def stop_server(process: subprocess.Popen[str] | None) -> None:
    if process is None:
        return
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def wait_for_server(base_url: str, timeout: float = 240.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(base_url + "/api/health", timeout=3)
            response.raise_for_status()
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Server did not start in time")


def request_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: int = 300) -> dict[str, Any]:
    if method.upper() == "POST":
        response = requests.post(url, json=payload or {}, timeout=timeout)
    else:
        response = requests.get(url, params=payload or {}, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(str(data["error"]))
    return data


def market_rows(base_url: str, market: str, build_cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
    key = market.lower().strip()
    if key in build_cache:
        return build_cache[key]
    config = MARKET_CONFIG[key]
    build_payload = {"min_score": 0, "recent_limit": 20}
    if config["region"]:
        build_payload["region"] = config["region"]
    try:
        request_json("POST", base_url + config["build_url"], build_payload, timeout=1800)
    except Exception:
        pass
    query = {"min_score": 0, "recent_limit": 20}
    if config["region"]:
        query["region"] = config["region"]
    payload = request_json("GET", base_url + config["today_url"], query, timeout=600)
    build_cache[key] = payload
    return payload


def is_high52(row: dict[str, Any]) -> bool:
    raw = str(row.get("is_52w_high") or "").strip().upper()
    if raw in {"1", "Y", "TRUE", "O"}:
        return True
    try:
        return int(float(row.get("is_52w_high") or 0)) == 1
    except Exception:
        return False


def as_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def filter_rows(rows: list[dict[str, Any]], suffix: str) -> list[dict[str, Any]]:
    if suffix == "100":
        filtered = [row for row in rows if as_float(row.get("score_o")) >= 100]
        return sorted(filtered, key=lambda row: (-as_float(row.get("score_o")), -as_float(row.get("score"))))
    if suffix == "50":
        filtered = [row for row in rows if as_float(row.get("score")) >= 50]
        return sorted(filtered, key=lambda row: (-as_float(row.get("score")), -as_float(row.get("score_o"))))
    if suffix == "52w":
        filtered = [
            row
            for row in rows
            if is_high52(row)
            and as_float(row.get("trading_value_100m") or row.get("trading_value_usd")) > 0
            and as_float(row.get("score_o")) > 0
        ]
        return sorted(filtered, key=lambda row: (-as_float(row.get("score_o")), -as_float(row.get("score"))))
    return []


def format_number(value: Any, digits: int = 2) -> str:
    try:
        return f"{float(value):,.{digits}f}"
    except Exception:
        return "-"


def command_title(market: str, suffix: str) -> str:
    market_title = MARKET_CONFIG[market]["title"]
    if suffix == "100":
        return f"{market_title} 당일점수 100점 이상"
    if suffix == "50":
        return f"{market_title} 종합점수 50점 이상"
    return f"{market_title} 52주 신고가"


def build_list_message(payload: dict[str, Any], market: str, suffix: str, max_rows: int = 20) -> str:
    rows = list(payload.get("qualified_stocks") or [])
    filtered = filter_rows(rows, suffix)
    header = command_title(market, suffix)
    file_date = str(payload.get("file_date") or "").strip() or "-"
    if not filtered:
        return f"{header}\n{file_date}\n조건을 만족하는 종목이 없습니다."
    lines = [header, file_date]
    for index, row in enumerate(filtered[:max_rows], start=1):
        lines.append(
            f"{index}. {row.get('stock_name') or row.get('resolved_name') or '-'}"
            f" | O {format_number(row.get('score_o'), 2)}"
            f" | S {format_number(row.get('score'), 2)}"
            f" | {format_number(row.get('change_pct'), 2)}%"
        )
    lines.append(f"총 {len(filtered)}개")
    return "\n".join(lines)


def parse_market_command(text: str) -> tuple[str, str] | None:
    match = re.fullmatch(r"/(kr|us|jp|tw)(100|50|52w)", str(text or "").strip().lower())
    if not match:
        return None
    return match.group(1), match.group(2)


def handle_message(message: dict[str, Any], base_url: str, build_cache: dict[str, dict[str, Any]]) -> None:
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id") or "").strip()
    allowed_chat_id = resolve_allowed_chat_id()
    if not chat_id or not allowed_chat_id or chat_id != allowed_chat_id:
        return
    text = str(message.get("text") or "").strip()
    if text in {"/start", "/help"}:
        send_message(chat_id, COMMAND_HELP)
        return
    parsed = parse_market_command(text)
    if not parsed:
        send_message(chat_id, "지원하지 않는 명령입니다.\n/help")
        return
    market, suffix = parsed
    try:
        payload = market_rows(base_url, market, build_cache)
        send_message(chat_id, build_list_message(payload, market, suffix))
    except Exception as exc:
        send_message(chat_id, f"명령 처리 중 오류가 발생했습니다.\n{exc}")


def process_updates(base_url: str, state: dict[str, Any]) -> None:
    result = telegram_call("getUpdates", {"timeout": 0, "offset": int(state.get("offset") or 0)})
    build_cache: dict[str, dict[str, Any]] = {}
    for update in result.get("result", []):
        state["offset"] = max(int(state.get("offset") or 0), int(update.get("update_id", 0)) + 1)
        message = update.get("message") or update.get("edited_message")
        if message:
            handle_message(message, base_url, build_cache)


def maybe_send_daily(base_url: str, state: dict[str, Any]) -> None:
    now_kst = datetime.now(KST)
    if now_kst.weekday() >= 5:
        return
    if now_kst.hour < 16:
        return
    today_key = now_kst.strftime("%Y-%m-%d")
    daily_state = state.setdefault("daily", {})
    if daily_state.get("last_sent_kst_date") == today_key:
        return
    build_cache: dict[str, dict[str, Any]] = {}
    chat_id = resolve_allowed_chat_id()
    if not chat_id:
        raise RuntimeError("No allowed Telegram chat configured.")
    for market in ("kr", "us"):
        try:
            payload = market_rows(base_url, market, build_cache)
            send_message(chat_id, build_list_message(payload, market, "50"))
        except Exception as exc:
            send_message(chat_id, f"{MARKET_CONFIG[market]['title']} 자동 전송 실패\n{exc}")
    daily_state["last_sent_kst_date"] = today_key


def main() -> None:
    parser = argparse.ArgumentParser(description="Telegram stock bot via GitHub Actions polling.")
    parser.add_argument("--skip-daily", action="store_true")
    parser.add_argument("--skip-updates", action="store_true")
    args = parser.parse_args()

    state = ensure_state()
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    server = start_server(port)
    try:
        try:
            wait_for_server(base_url)
        except Exception as exc:
            stderr_tail = ""
            try:
                if server.stderr:
                    time.sleep(1)
                    stderr_tail = (server.stderr.read() or "")[-4000:]
            except Exception:
                stderr_tail = ""
            if stderr_tail:
                raise RuntimeError(f"{exc}\n\n[backend stderr]\n{stderr_tail}") from exc
            raise
        if not args.skip_updates:
            process_updates(base_url, state)
        if not args.skip_daily:
            maybe_send_daily(base_url, state)
        save_state(state)
    finally:
        stop_server(server)


if __name__ == "__main__":
    main()
