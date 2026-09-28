from __future__ import annotations

import argparse
import json
import os
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

import fcntl

import oracle_leader_telegram_bot as leader_bot


STATE_DIR = Path(os.getenv("STOCK_BOT_STATE_DIR", str(leader_bot.BASE_DIR / ".alert_state")))
STATE_PATH = STATE_DIR / "muse_market_close_state.json"
LOCK_PATH = STATE_DIR / "muse_market_close.lock"


@contextmanager
def exclusive_job_lock() -> Iterator[None]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK_PATH.open("a+", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"deliveries": {}}
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            payload.setdefault("deliveries", {})
            return payload
    except Exception:
        pass
    return {"deliveries": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = STATE_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp_path, STATE_PATH)


def wait_for_existing_build(base_url: str, market: str, timeout_seconds: int) -> None:
    deadline = time.monotonic() + max(30, timeout_seconds)
    while time.monotonic() < deadline:
        status = leader_bot.load_build_status(base_url, market)
        state = str(status.get("status") or "").strip().lower()
        if state in {"completed", "complete", "success", "succeeded", "idle", ""}:
            return
        if state in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(str(status.get("message") or f"{market} data build failed"))
        time.sleep(10)
    raise TimeoutError(f"{market} data build did not finish within {timeout_seconds} seconds")


def build_latest_market_data(base_url: str, market: str, timeout_seconds: int) -> dict[str, Any]:
    result = leader_bot.reload_market(base_url, market)
    if str(result.get("status") or "").strip().lower() == "running":
        wait_for_existing_build(base_url, market, timeout_seconds)
    return result


def delivery_entry(state: dict[str, Any], key: str) -> dict[str, Any]:
    deliveries = state.setdefault("deliveries", {})
    entry = deliveries.setdefault(key, {"chats": {}})
    entry.setdefault("chats", {})
    return entry


def deliver_market_close(
    base_url: str,
    market: str,
    max_rows: int,
    force: bool,
    build_timeout: int,
) -> dict[str, Any]:
    build_result = build_latest_market_data(base_url, market, build_timeout)
    payload = leader_bot.load_market_payload(base_url, market)
    file_date = str(payload.get("file_date") or "").strip()
    if not file_date:
        raise RuntimeError(f"{market} leader payload has no file_date")

    built_date = str(build_result.get("file_date") or "").strip()
    if built_date and built_date != file_date:
        raise RuntimeError(f"build result date {built_date} does not match leader payload date {file_date}")

    threshold = leader_bot.current_threshold(base_url, market)
    rows = [row for row in payload.get("qualified_stocks") or [] if isinstance(row, dict)]
    score_rows = leader_bot.filter_rows(rows, "score", threshold)
    state = load_state()
    state_key = f"{market}:{file_date}"
    entry = delivery_entry(state, state_key)
    entry.update(
        {
            "market": market,
            "file_date": file_date,
            "threshold": threshold,
            "updated_at": datetime.now(leader_bot.KST).isoformat(timespec="seconds"),
        }
    )

    if not score_rows:
        entry["status"] = "no_results"
        save_state(state)
        print(f"market={market} file_date={file_date} status=no_results threshold={threshold}", flush=True)
        return entry

    chat_ids = sorted(leader_bot.allowed_chat_ids())
    if not chat_ids:
        raise RuntimeError("TELEGRAM_ALLOWED_CHAT_IDS is required")

    for chat_id in chat_ids:
        chat_state = entry["chats"].setdefault(chat_id, {})
        if force:
            chat_state.clear()
        if not chat_state.get("image_sent"):
            leader_bot.send_market_capture_image(base_url, chat_id, market, threshold)
            chat_state["image_sent"] = datetime.now(leader_bot.KST).isoformat(timespec="seconds")
            save_state(state)
        if market == "us" and not chat_state.get("high52_sent"):
            high_rows = leader_bot.filter_rows(rows, "52w", threshold)
            if high_rows:
                leader_bot.send_message(
                    chat_id,
                    leader_bot.build_rows_message(payload, market, "52w", threshold, max_rows),
                )
            chat_state["high52_sent"] = datetime.now(leader_bot.KST).isoformat(timespec="seconds")
            save_state(state)

    entry["status"] = "completed"
    entry["completed_at"] = datetime.now(leader_bot.KST).isoformat(timespec="seconds")
    save_state(state)
    print(
        f"market={market} file_date={file_date} status=completed chats={len(chat_ids)} rows={len(score_rows)}",
        flush=True,
    )
    return entry


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and deliver one market-close leader report.")
    parser.add_argument("--market", required=True, choices=("kr", "us"))
    parser.add_argument("--server-url", default=leader_bot.env("STOCK_APP_API_URL", "http://127.0.0.1:8124"))
    parser.add_argument("--max-rows", type=int, default=int(leader_bot.env("STOCK_BOT_MAX_ROWS", "20") or 20))
    parser.add_argument("--build-timeout", type=int, default=3300)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    leader_bot.api_get(args.server_url, "/api/health", timeout=10)
    with exclusive_job_lock():
        deliver_market_close(
            base_url=args.server_url,
            market=args.market,
            max_rows=max(1, min(args.max_rows, 50)),
            force=args.force,
            build_timeout=max(30, args.build_timeout),
        )


if __name__ == "__main__":
    main()
