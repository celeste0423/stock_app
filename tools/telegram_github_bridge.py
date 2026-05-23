"""Telegram -> GitHub issue bridge for Codex Cloud tasks.

Run this on an always-on host, not on the local desktop app process.
Required environment variables:
  TELEGRAM_BOT_TOKEN
  TELEGRAM_ALLOWED_CHAT_ID
  GITHUB_TOKEN
  GITHUB_REPOSITORY          owner/name

Optional:
  CODEX_MENTION             default: @codex
  GITHUB_DEFAULT_LABELS      comma-separated labels
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
GITHUB_API = "https://api.github.com"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def telegram_call(method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    token = env("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")
    data = urllib.parse.urlencode(payload or {}).encode("utf-8")
    req = urllib.request.Request(TELEGRAM_API.format(token=token, method=method), data=data, method="POST")
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.loads(response.read().decode("utf-8"))


def github_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    token = env("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN is required")
    data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(f"{GITHUB_API}{path}", data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def send_message(chat_id: str, text: str) -> None:
    telegram_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": "true",
        },
    )


def parse_task(text: str) -> tuple[str, str] | None:
    stripped = text.strip()
    if stripped.startswith("/task"):
        stripped = stripped[len("/task") :].strip()
    elif stripped.startswith("/issue"):
        stripped = stripped[len("/issue") :].strip()
    else:
        return None
    if not stripped:
        return None
    if "|" in stripped:
        title, body = stripped.split("|", 1)
    else:
        lines = stripped.splitlines()
        title = lines[0]
        body = "\n".join(lines[1:]).strip()
    return title.strip(), body.strip()


def create_codex_issue(title: str, body: str) -> dict[str, Any]:
    repo = env("GITHUB_REPOSITORY")
    if "/" not in repo:
        raise RuntimeError("GITHUB_REPOSITORY must be owner/name")
    codex_mention = env("CODEX_MENTION", "@codex")
    labels = [item.strip() for item in env("GITHUB_DEFAULT_LABELS", "codex-task").split(",") if item.strip()]
    issue_body = body or "Telegram에서 생성한 Codex 작업입니다."
    if codex_mention and codex_mention not in issue_body:
        issue_body = f"{issue_body}\n\n{codex_mention} 이 작업을 코드 변경 PR로 처리해줘."
    payload: dict[str, Any] = {"title": title, "body": issue_body}
    if labels:
        payload["labels"] = labels
    return github_request("POST", f"/repos/{repo}/issues", payload)


def handle_message(message: dict[str, Any]) -> None:
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id") or "")
    allowed_chat_id = env("TELEGRAM_ALLOWED_CHAT_ID")
    if not allowed_chat_id or chat_id != allowed_chat_id:
        if chat_id:
            send_message(chat_id, "허용되지 않은 채팅입니다.")
        return

    text = str(message.get("text") or "").strip()
    if text in {"/start", "/help"}:
        send_message(
            chat_id,
            "명령어:\n"
            "/task 제목 | 상세 요구사항\n"
            "/issue 제목 | 상세 요구사항\n"
            "/status",
        )
        return
    if text == "/status":
        send_message(chat_id, f"연결됨: {env('GITHUB_REPOSITORY')}")
        return

    parsed = parse_task(text)
    if not parsed:
        send_message(chat_id, "알 수 없는 명령입니다. /help 를 입력해 주세요.")
        return

    title, body = parsed
    issue = create_codex_issue(title, body)
    send_message(chat_id, f"GitHub 이슈를 만들었습니다.\n#{issue.get('number')} {issue.get('html_url')}")


def main() -> None:
    offset = 0
    print("Telegram GitHub bridge started.")
    while True:
        try:
            result = telegram_call("getUpdates", {"timeout": 30, "offset": offset})
            for update in result.get("result", []):
                offset = max(offset, int(update.get("update_id", 0)) + 1)
                message = update.get("message") or update.get("edited_message")
                if message:
                    handle_message(message)
        except urllib.error.HTTPError as exc:
            print(f"HTTP error: {exc.code} {exc.read().decode('utf-8', errors='replace')}")
            time.sleep(10)
        except Exception as exc:
            print(f"Bridge error: {exc}")
            time.sleep(10)


if __name__ == "__main__":
    main()
