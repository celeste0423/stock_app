"""Export current portfolio holdings as JSON for cloud news alerts.

Use the output as the GitHub Actions secret STOCK_ALERT_HOLDINGS_JSON.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.portfolio_news_alert import holdings_from_portfolio  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export latest portfolio holdings for GitHub Actions")
    parser.add_argument("--min-weight-pct", type=float, default=0.0)
    parser.add_argument("--strict-latest", action="store_true", help="Do not fall back to the latest non-empty holding day")
    parser.add_argument("--indent", type=int, default=2)
    parser.add_argument("--output", help="Optional UTF-8 file path to write the JSON")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    holdings = holdings_from_portfolio(min_weight_pct=args.min_weight_pct, latest_non_empty=not args.strict_latest)
    text = json.dumps(holdings, ensure_ascii=False, indent=args.indent)
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    print(text)
