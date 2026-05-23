from __future__ import annotations

import html
import json
import os
import urllib.parse
import urllib.request


def compact(text: str, limit: int = 500) -> str:
    snippet = text.replace("\r", " ").replace("\n", " ").strip()
    return snippet[: limit - 3] + "..." if len(snippet) > limit else snippet


def main() -> None:
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    event_path = os.environ.get("GITHUB_EVENT_PATH", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    actor = os.environ.get("GITHUB_ACTOR", "")
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    run_url = f"{server}/{repo}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    action = event.get("action") or "manual"
    title = "Repository event"
    url = f"{server}/{repo}"
    body = ""

    if "issue" in event:
        issue = event["issue"]
        title = f"#{issue.get('number')} {issue.get('title')}"
        url = issue.get("html_url") or url
        body = (issue.get("body") or "").strip()
    if "comment" in event:
        comment = event["comment"]
        url = comment.get("html_url") or url
        body = (comment.get("body") or "").strip()
        if "issue" in event:
            issue = event["issue"]
            title = f"comment on #{issue.get('number')} {issue.get('title')}"
        else:
            title = "new comment"
    if "pull_request" in event:
        pr = event["pull_request"]
        title = f"PR #{pr.get('number')} {pr.get('title')}"
        url = pr.get("html_url") or url
        body = (pr.get("body") or "").strip()
    if "review" in event and "pull_request" in event:
        review = event["review"]
        pr = event["pull_request"]
        title = f"review {review.get('state')} on PR #{pr.get('number')} {pr.get('title')}"
        url = review.get("html_url") or pr.get("html_url") or url
        body = (review.get("body") or "").strip()

    text = "\n".join(
        [
            f"<b>{html.escape(repo)}</b>",
            f"{html.escape(event_name)} - {html.escape(action)} - by {html.escape(actor)}",
            f"<a href=\"{html.escape(url)}\">{html.escape(title)}</a>",
            html.escape(compact(body)) if body else "",
            f"<a href=\"{html.escape(run_url)}\">workflow run</a>",
        ]
    ).strip()

    payload = urllib.parse.urlencode(
        {
            "chat_id": os.environ["TELEGRAM_CHAT_ID"],
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")

    api_url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_BOT_TOKEN']}/sendMessage"
    req = urllib.request.Request(api_url, data=payload, method="POST")
    with urllib.request.urlopen(req, timeout=20) as response:
        print(response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
