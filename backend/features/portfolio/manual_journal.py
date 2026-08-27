from __future__ import annotations

import json
import os
import re
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    import FinanceDataReader as fdr
except Exception:  # pragma: no cover
    fdr = None

try:
    import yfinance as yf
except Exception:  # pragma: no cover
    yf = None


class PortfolioManualItemInput(BaseModel):
    item_id: str | None = None
    sector: str | None = ""
    stock_name: str
    stock_code: str | None = None
    avg_price: float | None = 0
    weight_pct: float | None = 0
    quantity: float | None = 0
    stop_loss_price: float | None = None
    sell_price: float | None = None
    note: str | None = ""


class PortfolioManualSnapshotRequest(BaseModel):
    snapshot_id: str | None = None
    trade_date: str
    account_type: str
    account_capital: float | None = 0
    note: str | None = ""
    items: list[PortfolioManualItemInput] = Field(default_factory=list)


ACCOUNT_LABELS = {"kr": "국내 계좌", "us": "미장 계좌"}
BENCHMARK_SPECS = {
    "kospi": {"label": "KOSPI", "source": "fdr", "symbol": "KS11"},
    "kosdaq": {"label": "KOSDAQ", "source": "fdr", "symbol": "KQ11"},
    "nasdaq": {"label": "NASDAQ", "source": "fdr", "symbol": "IXIC"},
    "sp500": {"label": "S&P 500", "source": "fdr", "symbol": "US500"},
}


class ManualJournalFeature:
    def __init__(self, legacy: Any) -> None:
        self.legacy = legacy
        state_dir = Path(getattr(legacy, "STATE_DIR", Path(__file__).resolve().parents[2]))
        self.path = state_dir / "portfolio_manual_journal.json"
        self.local_settings_path = state_dir / "local_settings.json"
        self.legacy_calculate = legacy.calculate_portfolio_performance
        self.ai_cache: dict[str, dict[str, Any]] = {}

    @staticmethod
    def account_type(value: Any) -> str:
        return "us" if str(value or "").strip().lower() in {"us", "usa", "american", "overseas", "global"} else "kr"

    def trade_date(self, value: Any) -> str:
        parsed = self.legacy.parse_date_label(value)
        if parsed is not None:
            return parsed.strftime("%Y-%m-%d")
        text = str(value or "").strip()
        try:
            return datetime.strptime(text, "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception as exc:
            raise ValueError(f"포트폴리오 날짜 형식이 올바르지 않습니다: {text}") from exc

    def normalize_item(self, raw: dict[str, Any], account_type: str) -> dict[str, Any] | None:
        account = self.account_type(account_type)
        name = str(raw.get("stock_name") or "").strip()
        code = str(raw.get("stock_code") or "").strip()
        if account == "us":
            normalized_code = re.sub(r"[^A-Za-z0-9._-]", "", code or name).upper()
            resolved_name = name or normalized_code
        else:
            normalized_code = self.legacy.normalize_stock_code_value(code)
            resolved_name = name
            if not normalized_code and name:
                resolved_code, resolved_name = self.legacy.resolve_stock(name)
                normalized_code = self.legacy.normalize_stock_code_value(resolved_code)
        avg_price = max(0.0, float(self.legacy.to_float(raw.get("avg_price")) or 0.0))
        quantity = max(0.0, float(self.legacy.to_float(raw.get("quantity")) or 0.0))
        stop_loss = self.legacy.to_float(raw.get("stop_loss_price"))
        sell_price = self.legacy.to_float(raw.get("sell_price"))
        weight = max(0.0, float(self.legacy.to_float(raw.get("weight_pct")) or 0.0))
        has_manual_sell = sell_price is not None and float(sell_price or 0.0) > 0
        if not normalized_code or not (name or resolved_name) or (weight <= 0 and not has_manual_sell):
            return None
        return {
            "item_id": str(raw.get("item_id") or raw.get("id") or uuid.uuid4()),
            "sector": str(raw.get("sector") or "").strip(),
            "stock_name": name or resolved_name or normalized_code,
            "stock_code": normalized_code,
            "resolved_name": resolved_name or name or normalized_code,
            "avg_price": round(avg_price, 4),
            "weight_pct": round(weight, 4),
            "quantity": round(quantity, 8),
            "stop_loss_price": round(float(stop_loss), 4) if stop_loss is not None else None,
            "sell_price": round(float(sell_price), 4) if sell_price is not None else None,
            "note": str(raw.get("note") or "").strip(),
            "account_type": account,
            "account_label": ACCOUNT_LABELS[account],
            "entry_pending": avg_price <= 0 or quantity <= 0,
        }

    def normalize_snapshot(self, raw: dict[str, Any]) -> dict[str, Any]:
        account = self.account_type(raw.get("account_type"))
        items = [item for value in raw.get("items") or [] if (item := self.normalize_item(value if isinstance(value, dict) else {}, account))]
        return {
            "snapshot_id": str(raw.get("snapshot_id") or raw.get("id") or uuid.uuid4()),
            "trade_date": self.trade_date(raw.get("trade_date")),
            "account_type": account,
            "account_label": ACCOUNT_LABELS[account],
            "account_capital": round(max(0.0, float(self.legacy.to_float(raw.get("account_capital")) or 0.0)), 2),
            "note": str(raw.get("note") or "").strip(),
            "items": items,
        }

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "snapshots": []}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {"version": 1, "snapshots": []}
        snapshots = []
        for value in raw.get("snapshots") or []:
            try:
                snapshots.append(self.normalize_snapshot(value))
            except Exception:
                continue
        snapshots.sort(key=lambda row: (row["trade_date"], row["account_type"], row["snapshot_id"]))
        return {"version": 1, "snapshots": snapshots}

    def save(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = {"version": 1, "snapshots": [self.normalize_snapshot(row) for row in payload.get("snapshots") or []]}
        result["snapshots"].sort(key=lambda row: (row["trade_date"], row["account_type"], row["snapshot_id"]))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)
        return result

    @staticmethod
    def capital(snapshot: dict[str, Any], fallback_capital: float | None = None) -> float:
        explicit = float(snapshot.get("account_capital") or 0.0)
        if explicit > 0:
            return explicit
        if fallback_capital is not None and fallback_capital > 0:
            return fallback_capital
        invested = sum(float(row.get("avg_price") or 0.0) * float(row.get("quantity") or 0.0) for row in snapshot.get("items") or [])
        exposure = sum(float(row.get("weight_pct") or 0.0) for row in snapshot.get("items") or []) / 100
        return invested / exposure if invested > 0 and exposure > 0 else invested

    @staticmethod
    def _extract_close_rows(frame: Any) -> list[tuple[str, float]]:
        if not isinstance(frame, pd.DataFrame) or frame.empty:
            return []
        close_series = None
        if "Close" in frame.columns:
            close_series = pd.to_numeric(frame["Close"], errors="coerce")
        elif isinstance(frame.columns, pd.MultiIndex):
            close_columns = [column for column in frame.columns if len(column) >= 1 and column[0] == "Close"]
            if close_columns:
                close_series = pd.to_numeric(frame[close_columns[0]], errors="coerce")
        if close_series is None:
            return []
        result: list[tuple[str, float]] = []
        for index_value, close_value in close_series.dropna().items():
            try:
                date_text = pd.Timestamp(index_value).strftime("%Y-%m-%d")
                result.append((date_text, float(close_value)))
            except Exception:
                continue
        result.sort(key=lambda row: row[0])
        return result

    def _fetch_price_rows(self, account_type: str, symbol: str, start_date: str, end_date: str) -> list[tuple[str, float]]:
        try:
            extended_end = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y-%m-%d")
        except Exception:
            extended_end = end_date
        try:
            if account_type == "kr":
                if fdr is None:
                    return []
                frame = fdr.DataReader(symbol, start_date, extended_end)
            else:
                if yf is None:
                    return []
                frame = yf.download(symbol, start=start_date, end=extended_end, progress=False, auto_adjust=False)
            return self._extract_close_rows(frame)
        except Exception:
            return []

    def _fetch_yahoo_chart_rows(self, symbol: str, start_date: str, end_date: str) -> list[tuple[str, float]]:
        try:
            period1 = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp())
            period2 = int((datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=5)).timestamp())
            response = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                params={"period1": period1, "period2": period2, "interval": "1d", "events": "history"},
                timeout=10,
            )
            response.raise_for_status()
            result = ((response.json().get("chart") or {}).get("result") or [None])[0] or {}
            timestamps = result.get("timestamp") or []
            quote = (((result.get("indicators") or {}).get("quote") or [None])[0] or {})
            rows: list[tuple[str, float]] = []
            for timestamp_value, close_value in zip(timestamps, quote.get("close") or []):
                if close_value is None:
                    continue
                rows.append((datetime.fromtimestamp(int(timestamp_value)).strftime("%Y-%m-%d"), float(close_value)))
            rows.sort(key=lambda row: row[0])
            return rows
        except Exception:
            return []

    def _lookup_price(self, rows: list[tuple[str, float]], target_date: str) -> float | None:
        if not rows:
            return None
        target_text = str(target_date or "")
        for date_text, close_value in reversed(rows):
            if date_text <= target_text:
                return float(close_value)
        return float(rows[0][1]) if rows else None

    @staticmethod
    def _effective_exit_price(item: dict[str, Any], price_value: float | None) -> tuple[float | None, str | None]:
        sell_price = item.get("sell_price")
        if sell_price is not None and float(sell_price or 0) > 0:
            return float(sell_price), "manual_sell"
        stop_loss = item.get("stop_loss_price")
        if stop_loss is not None and float(stop_loss or 0) > 0 and price_value is not None and float(price_value) <= float(stop_loss):
            return float(stop_loss), "stop_loss"
        return None, None

    @staticmethod
    def _build_capture_rows(snapshot_view: dict[str, Any], previous_view: dict[str, Any] | None) -> list[dict[str, Any]]:
        current_items = list(snapshot_view.get("items") or [])
        previous_items = list(previous_view.get("items") or []) if previous_view else []
        current_code_map = {
            str(item.get("stock_code") or item.get("item_id") or item.get("stock_name") or ""): item
            for item in current_items
        }
        previous_code_map = {
            str(item.get("stock_code") or item.get("item_id") or item.get("stock_name") or ""): item
            for item in previous_items
        }

        rows: list[dict[str, Any]] = []
        for item in current_items:
            key = str(item.get("stock_code") or item.get("item_id") or item.get("stock_name") or "")
            rows.append(
                {
                    **item,
                    "prev_weight_pct": round(float((previous_code_map.get(key) or {}).get("weight_pct") or 0.0), 4),
                }
            )

        for previous_item in previous_items:
            key = str(previous_item.get("stock_code") or previous_item.get("item_id") or previous_item.get("stock_name") or "")
            if key in current_code_map:
                continue
            rows.append(
                {
                    **previous_item,
                    "weight_pct": 0.0,
                    "quantity": 0.0,
                    "current_value": 0.0,
                    "mark_value": 0.0,
                    "pnl": 0.0,
                    "return_pct": None,
                    "is_exited": False,
                    "prev_weight_pct": round(float(previous_item.get("weight_pct") or 0.0), 4),
                }
            )
        return rows

    @staticmethod
    def _stock_key(item: dict[str, Any]) -> str:
        return str(item.get("stock_code") or item.get("item_id") or item.get("stock_name") or "")

    @staticmethod
    def _realized_trade_from_item(item: dict[str, Any], exit_price: float, trade_date: str, reason: str) -> dict[str, Any] | None:
        avg_price = float(item.get("avg_price") or 0.0)
        quantity = float(item.get("quantity") or 0.0)
        if avg_price <= 0 or quantity <= 0 or exit_price <= 0:
            return None
        invested_value = avg_price * quantity
        realized_value = exit_price * quantity
        pnl = realized_value - invested_value
        return {
            "trade_date": trade_date,
            "stock_code": item.get("stock_code"),
            "stock_name": item.get("stock_name") or item.get("resolved_name"),
            "sector": item.get("sector"),
            "quantity": round(quantity, 8),
            "avg_price": round(avg_price, 4),
            "exit_price": round(exit_price, 4),
            "invested_value": round(invested_value, 2),
            "realized_value": round(realized_value, 2),
            "realized_pnl": round(pnl, 2),
            "realized_return_pct": round(((realized_value / invested_value) - 1) * 100, 2),
            "exit_reason": reason,
        }

    def _realized_trades_between(self, snapshot_view: dict[str, Any], previous_view: dict[str, Any] | None) -> list[dict[str, Any]]:
        if not previous_view:
            return []
        trade_date = str(snapshot_view.get("trade_date") or "")
        current_items = list(snapshot_view.get("items") or [])
        previous_items = list(previous_view.get("items") or [])
        current_map = {self._stock_key(item): item for item in current_items}
        trades: list[dict[str, Any]] = []

        for current_item in current_items:
            sell_price = float(current_item.get("sell_price") or 0.0)
            if sell_price <= 0:
                continue
            trade = self._realized_trade_from_item(current_item, sell_price, trade_date, "manual_sell")
            if trade:
                trades.append(trade)

        for previous_item in previous_items:
            key = self._stock_key(previous_item)
            if key in current_map or float(previous_item.get("weight_pct") or 0.0) <= 0:
                continue
            stop_loss_price = float(previous_item.get("stop_loss_price") or 0.0)
            if stop_loss_price <= 0:
                continue
            trade = self._realized_trade_from_item(previous_item, stop_loss_price, trade_date, "implicit_stop_loss")
            if trade:
                trades.append(trade)
        return trades

    def _fetch_benchmark_series(self, all_dates: list[str], start_date: str, cutoff_date: str) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str]]:
        benchmarks: dict[str, list[dict[str, Any]]] = {}
        labels = {key: meta["label"] for key, meta in BENCHMARK_SPECS.items()}
        for key, meta in BENCHMARK_SPECS.items():
            try:
                if meta["source"] == "fdr":
                    if fdr is None:
                        benchmarks[key] = []
                        continue
                    frame = fdr.DataReader(meta["symbol"], start_date, cutoff_date)
                    close_rows = self._extract_close_rows(frame)
                else:
                    close_rows = []
                    if yf is not None:
                        frame = yf.download(meta["symbol"], start=start_date, end=(datetime.strptime(cutoff_date, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y-%m-%d"), progress=False, auto_adjust=False)
                        close_rows = self._extract_close_rows(frame)
                    if not close_rows:
                        close_rows = self._fetch_yahoo_chart_rows(meta["symbol"], start_date, cutoff_date)
                if not close_rows:
                    benchmarks[key] = []
                    continue
                base_close = float(close_rows[0][1])
                benchmark_rows = []
                for date_text in all_dates:
                    close_value = self._lookup_price(close_rows, min(date_text, cutoff_date))
                    if close_value is None or base_close <= 0:
                        continue
                    benchmark_rows.append({
                        "date": date_text,
                        "value": round((close_value / base_close) * 100, 2),
                        "return_pct": round(((close_value / base_close) - 1) * 100, 2),
                    })
                benchmarks[key] = benchmark_rows
            except Exception:
                benchmarks[key] = []
        return benchmarks, labels

    def _load_gemini_api_key(self) -> str:
        try:
            payload = json.loads(self.local_settings_path.read_text(encoding="utf-8"))
        except Exception:
            payload = {}
        public_data = payload.get("public_data") if isinstance(payload, dict) else {}
        key = str((public_data or {}).get("gemini_api_key") or os.environ.get("GEMINI_API_KEY") or "").strip()
        return key

    def _deterministic_review(self, snapshot: dict[str, Any], cutoff_date: str) -> dict[str, Any]:
        items = [item for item in snapshot.get("items") or [] if float(item.get("weight_pct") or 0.0) > 0]
        sector_totals: dict[str, float] = defaultdict(float)
        pending_count = 0
        stop_loss_missing = 0
        stop_loss_far_count = 0
        equal_weight_deviation = 0
        for item in items:
            sector_totals[str(item.get("sector") or "미분류")] += float(item.get("weight_pct") or 0.0)
            if item.get("entry_pending"):
                pending_count += 1
            avg_price = float(item.get("avg_price") or 0.0)
            stop_loss_price = float(item.get("stop_loss_price") or 0.0)
            if stop_loss_price <= 0:
                stop_loss_missing += 1
            elif avg_price > 0:
                stop_gap = ((stop_loss_price / avg_price) - 1) * 100
                if abs(stop_gap + 8.0) > 2.5:
                    stop_loss_far_count += 1
            equal_weight_deviation += abs(float(item.get("weight_pct") or 0.0) - 5.0)
        total_weight = sum(float(item.get("weight_pct") or 0.0) for item in items)
        cash_weight = max(0.0, 100.0 - total_weight)
        largest_sector = max(sector_totals.items(), key=lambda row: row[1]) if sector_totals else ("없음", 0.0)
        current_pnl = sum(float(item.get("pnl") or 0.0) for item in items)
        current_return_pct = snapshot.get("portfolio_return_pct_current")
        rule_checks = [
            {
                "rule": "5% 단위 분할 편입",
                "status": "양호" if equal_weight_deviation <= max(2.5, len(items) * 0.5) else "이탈",
                "detail": f"포지션 {len(items)}개, 목표 5% 대비 총 편차 {round(equal_weight_deviation, 2)}%p",
            },
            {
                "rule": "손절가 설정",
                "status": "양호" if stop_loss_missing == 0 else "보완 필요",
                "detail": f"손절가 누락 {stop_loss_missing}건, -8% 기준 벗어남 {stop_loss_far_count}건",
            },
            {
                "rule": "진입 완료 여부",
                "status": "양호" if pending_count == 0 else "대기 종목 존재",
                "detail": f"평단/수량 미확정 종목 {pending_count}건",
            },
            {
                "rule": "섹터 집중도",
                "status": "양호" if largest_sector[1] <= 25.0 else "집중 높음",
                "detail": f"최대 섹터 {largest_sector[0]} {round(largest_sector[1], 1)}%",
            },
        ]
        strengths = []
        risks = []
        if cash_weight >= 50:
            strengths.append(f"현금 비중이 {round(cash_weight, 1)}%로 높아 변동성 방어력이 있다.")
        if pending_count == 0 and items:
            strengths.append("주요 종목의 평단가와 수량이 모두 입력돼 규칙 점검이 가능하다.")
        if stop_loss_missing == 0 and items:
            strengths.append("모든 보유 종목에 손절가가 있어 손실 통제가 구조화되어 있다.")
        if largest_sector[1] > 25:
            risks.append(f"{largest_sector[0]} 섹터 비중이 {round(largest_sector[1], 1)}%로 높아 섹터 리스크가 크다.")
        if pending_count > 0:
            risks.append("평단가/수량 미확정 종목이 있어 실제 리스크와 계획 비중이 다를 수 있다.")
        if stop_loss_far_count > 0:
            risks.append("일부 손절가가 -8% 추세추종 규칙에서 벗어나 있다.")
        if not strengths:
            strengths.append("비중, 수량, 손절가 데이터가 있어 전략 점검을 체계화할 수 있다.")
        if not risks:
            risks.append("현재 구조에서 큰 규칙 위반은 없지만, 종목별 추세 훼손 여부는 가격 흐름과 함께 점검해야 한다.")
        return {
            "cutoff_date": cutoff_date,
            "trade_date": snapshot.get("trade_date"),
            "overview": f"현재 포트폴리오는 {len(items)}종목, 주식 비중 {round(total_weight, 1)}%, 현금 비중 {round(cash_weight, 1)}%이며 현재가 기준 손익은 {round(current_pnl, 0)}원, 수익률은 {round(float(current_return_pct or 0.0), 2)}%다.",
            "strengths": strengths[:4],
            "risks": risks[:4],
            "rule_checks": rule_checks,
            "action_points": [
                "손절가와 평단가 미입력 종목이 있으면 먼저 확정한다." if pending_count else "손절가 갱신이 필요한 종목이 없는지 점검한다.",
                "최대 섹터 비중이 높으면 신규 편입은 다른 섹터로 분산한다.",
                "계획 스냅샷이라면 다음 거래일 실제 체결 후 평단가와 수량을 바로 갱신한다.",
            ],
        }

    def _gemini_review(self, account_label: str, deterministic: dict[str, Any], snapshot: dict[str, Any]) -> dict[str, Any] | None:
        api_key = self._load_gemini_api_key()
        if not api_key:
            return None
        prompt = {
            "account_label": account_label,
            "cutoff_date": deterministic.get("cutoff_date"),
            "portfolio_summary": deterministic,
            "positions": [
                {
                    "sector": item.get("sector"),
                    "stock_name": item.get("stock_name"),
                    "weight_pct": item.get("weight_pct"),
                    "avg_price": item.get("avg_price"),
                    "current_price": item.get("current_price"),
                    "return_pct": item.get("return_pct"),
                    "pnl": item.get("pnl"),
                    "stop_loss_price": item.get("stop_loss_price"),
                    "entry_pending": item.get("entry_pending"),
                    "note": item.get("note"),
                }
                for item in snapshot.get("items") or []
            ],
            "strategy_context": [
                "사용자는 추세추종 전략을 사용한다.",
                "기본 포지션 단위는 대체로 5%다.",
                "손절은 평균단가 대비 대략 -8% 룰을 선호한다.",
                "현재 포트폴리오가 규칙을 잘 지키는지, 장점/약점/개선 포인트를 한국어로 체계적으로 평가한다.",
            ],
            "response_schema": {
                "overview": "string",
                "strengths": ["string"],
                "risks": ["string"],
                "rule_checks": [{"rule": "string", "status": "양호|보완 필요|이탈", "detail": "string"}],
                "action_points": ["string"],
            },
        }
        body = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": "다음 JSON을 읽고 한국어로 포트폴리오를 평가해라. 응답은 반드시 JSON만 반환하고, status는 양호/보완 필요/이탈 중 하나만 사용한다.\n"
                            + json.dumps(prompt, ensure_ascii=False)
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "responseMimeType": "application/json",
            },
        }
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
                json=body,
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            text = ""
            for candidate in payload.get("candidates") or []:
                content = candidate.get("content") or {}
                for part in content.get("parts") or []:
                    if part.get("text"):
                        text += str(part.get("text") or "")
            if not text.strip():
                return None
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                parsed["model"] = "gemini-2.5-flash"
                return parsed
        except Exception:
            return None
        return None

    def ai_review(self, account_type: str, force_refresh: bool = False) -> dict[str, Any]:
        normalized_account = self.account_type(account_type)
        cutoff_date = date.today().strftime("%Y-%m-%d")
        performance_payload = self.cached_performance(force_refresh=force_refresh)
        cache_key = f"{normalized_account}:{cutoff_date}:{self.path.stat().st_mtime if self.path.exists() else 0:.0f}"
        if not force_refresh and cache_key in self.ai_cache:
            return self.ai_cache[cache_key]
        account = next((row for row in performance_payload.get("manual_accounts") or [] if row.get("account_type") == normalized_account), None)
        latest_saved = account.get("latest_saved_snapshot") if isinstance(account, dict) else None
        latest_actual = account.get("latest_snapshot") if isinstance(account, dict) else None
        target_snapshot = latest_actual or latest_saved
        if not target_snapshot:
            payload = {"account_type": normalized_account, "error": "분석할 스냅샷이 없습니다."}
            self.ai_cache[cache_key] = payload
            return payload
        deterministic = self._deterministic_review(target_snapshot, cutoff_date)
        gemini_payload = self._gemini_review(account.get("account_label") or normalized_account, deterministic, target_snapshot)
        result = {
            "account_type": normalized_account,
            "account_label": account.get("account_label") if isinstance(account, dict) else ACCOUNT_LABELS.get(normalized_account, normalized_account),
            "snapshot_trade_date": target_snapshot.get("trade_date"),
            "cutoff_date": cutoff_date,
            "is_future_plan": str(target_snapshot.get("trade_date") or "") > cutoff_date,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "deterministic": deterministic,
            "ai": gemini_payload or {
                "overview": deterministic.get("overview"),
                "strengths": deterministic.get("strengths"),
                "risks": deterministic.get("risks"),
                "rule_checks": deterministic.get("rule_checks"),
                "action_points": deterministic.get("action_points"),
                "model": "deterministic-fallback",
            },
        }
        self.ai_cache[cache_key] = result
        return result

    def performance(self) -> dict[str, Any]:
        journal = self.load()
        snapshots = journal.get("snapshots") or []
        if not snapshots:
            return self.legacy_calculate()

        cutoff_date = date.today().strftime("%Y-%m-%d")
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        price_cache: dict[tuple[str, str], list[tuple[str, float]]] = {}
        unique_symbols: set[tuple[str, str]] = set()
        for snapshot in snapshots:
            grouped[snapshot["account_type"]].append(snapshot)
            for item in snapshot.get("items") or []:
                code = str(item.get("stock_code") or "").strip()
                if code:
                    unique_symbols.add((snapshot["account_type"], code))
        start_date = min(snapshot["trade_date"] for snapshot in snapshots)
        for account_type, code in sorted(unique_symbols):
            price_cache[(account_type, code)] = self._fetch_price_rows(account_type, code, start_date, cutoff_date)

        account_views: list[dict[str, Any]] = []
        account_rows_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        capture_sets: list[dict[str, Any]] = []
        monthly_stats: list[dict[str, Any]] = []

        for account_type in ("kr", "us"):
            rows = sorted(grouped.get(account_type) or [], key=lambda row: (row["trade_date"], row["snapshot_id"]))
            if not rows:
                continue
            previous_capital: float | None = None
            previous_nav: float | None = None
            previous_snapshot_view: dict[str, Any] | None = None
            snapshot_views: list[dict[str, Any]] = []
            account_realized_trades: list[dict[str, Any]] = []
            cumulative_realized_pnl = 0.0
            for snapshot in rows:
                trade_date = snapshot["trade_date"]
                nav_mark_date = trade_date if trade_date <= cutoff_date else cutoff_date
                capital = self.capital(snapshot, previous_capital)
                invested_cost = 0.0
                historical_market_value = 0.0
                current_market_value = 0.0
                items_view: list[dict[str, Any]] = []
                previous_item_map = {
                    str(item.get("stock_code") or ""): item
                    for item in (previous_snapshot_view.get("items") or [] if previous_snapshot_view else [])
                }
                for item in snapshot.get("items") or []:
                    code = str(item.get("stock_code") or "").strip()
                    price_rows = price_cache.get((account_type, code), [])
                    latest_price = self._lookup_price(price_rows, cutoff_date)
                    historical_price = self._lookup_price(price_rows, nav_mark_date)
                    avg_price = float(item.get("avg_price") or 0.0)
                    quantity = float(item.get("quantity") or 0.0)
                    stop_loss_price = float(item.get("stop_loss_price") or 0.0) if item.get("stop_loss_price") is not None else None
                    sell_price = float(item.get("sell_price") or 0.0) if item.get("sell_price") is not None else None
                    weight_pct = float(item.get("weight_pct") or 0.0)
                    is_manual_sell = sell_price is not None and sell_price > 0
                    is_open_position = weight_pct > 0 and not is_manual_sell
                    current_price = latest_price if latest_price is not None else (historical_price if historical_price is not None else avg_price)
                    nav_price = historical_price if historical_price is not None else current_price
                    effective_current_price, exit_reason_current = self._effective_exit_price(item, current_price)
                    effective_nav_price, exit_reason_nav = self._effective_exit_price(item, nav_price)
                    current_mark_price = float(effective_current_price) if effective_current_price is not None else float(current_price or 0.0)
                    historical_mark_price = float(effective_nav_price) if effective_nav_price is not None else float(nav_price or 0.0)
                    invested_value = avg_price * quantity
                    current_value = current_mark_price * quantity
                    mark_value = historical_mark_price * quantity
                    if is_open_position:
                        invested_cost += invested_value
                        historical_market_value += mark_value
                        current_market_value += current_value
                    previous_item = previous_item_map.get(code) or {}
                    items_view.append(
                        {
                            **item,
                            "current_price": round(float(current_price or 0.0), 4) if current_price is not None else None,
                            "mark_price": round(float(nav_price or 0.0), 4) if nav_price is not None else None,
                            "effective_mark_price": round(float(current_mark_price), 4),
                            "historical_mark_price": round(float(historical_mark_price), 4),
                            "effective_exit_price": round(float(effective_current_price), 4) if effective_current_price is not None else None,
                            "is_exited": bool(effective_current_price is not None),
                            "exit_reason": exit_reason_current or exit_reason_nav,
                            "current_value": round(current_value, 2),
                            "mark_value": round(mark_value, 2),
                            "invested_value": round(invested_value, 2),
                            "pnl": round(current_value - invested_value, 2),
                            "return_pct": round(((current_value / invested_value) - 1) * 100, 2) if invested_value > 0 else None,
                            "prev_weight_pct": round(float(previous_item.get("weight_pct") or 0.0), 4),
                            "is_open_position": is_open_position,
                        }
                    )
                realized_trades = self._realized_trades_between({"trade_date": trade_date, "items": items_view}, previous_snapshot_view)
                realized_pnl_delta = sum(float(trade.get("realized_pnl") or 0.0) for trade in realized_trades)
                snapshot_cumulative_realized_pnl = cumulative_realized_pnl + realized_pnl_delta
                cash_value = capital + snapshot_cumulative_realized_pnl - invested_cost
                nav_close = cash_value + historical_market_value
                current_nav_close = cash_value + current_market_value
                daily_return_pct = ((nav_close / previous_nav) - 1) * 100 if previous_nav not in (None, 0) else 0.0
                portfolio_return_pct_current = ((current_nav_close / capital) - 1) * 100 if capital > 0 else 0.0
                snapshot_view = {
                    "snapshot_id": snapshot["snapshot_id"],
                    "trade_date": trade_date,
                    "account_type": account_type,
                    "account_label": ACCOUNT_LABELS[account_type],
                    "account_capital": round(capital, 2),
                    "capital": round(capital, 2),
                    "cash_value": round(cash_value, 2),
                    "invested_cost": round(invested_cost, 2),
                    "market_value": round(historical_market_value, 2),
                    "current_market_value": round(current_market_value, 2),
                    "nav_close": round(nav_close, 2),
                    "current_nav_close": round(current_nav_close, 2),
                    "daily_return_pct": round(daily_return_pct, 3),
                    "portfolio_return_pct_current": round(portfolio_return_pct_current, 2),
                    "profit_amount_current": round(current_nav_close - capital, 2),
                    "realized_pnl_cumulative": round(snapshot_cumulative_realized_pnl, 2),
                    "items": items_view,
                    "note": snapshot.get("note", ""),
                    "is_future_plan": trade_date > cutoff_date,
                }
                snapshot_view["realized_trades"] = realized_trades
                snapshot_views.append(snapshot_view)
                if trade_date <= cutoff_date:
                    account_rows_by_date[trade_date].append(snapshot_view)
                    account_realized_trades.extend(realized_trades)
                    cumulative_realized_pnl = snapshot_cumulative_realized_pnl
                    previous_nav = nav_close
                previous_capital = capital
                previous_snapshot_view = snapshot_view

            ordered_views = list(reversed(snapshot_views))
            for index, snapshot_view in enumerate(ordered_views):
                previous_view = ordered_views[index + 1] if index + 1 < len(ordered_views) else None
                previous_weights = {
                    str(item.get("stock_code") or ""): float(item.get("weight_pct") or 0.0)
                    for item in (previous_view.get("items") or [] if previous_view else [])
                }
                capture_sets.append(
                    {
                        "snapshot_id": snapshot_view["snapshot_id"],
                        "trade_date": snapshot_view["trade_date"],
                        "account_type": account_type,
                        "account_label": ACCOUNT_LABELS[account_type],
                        "rows": self._build_capture_rows(snapshot_view, previous_view),
                    }
                )

            actual_views = [row for row in snapshot_views if row["trade_date"] <= cutoff_date]
            latest_actual = actual_views[-1] if actual_views else None
            latest_saved = snapshot_views[-1] if snapshot_views else None
            latest_summary_snapshot = None
            if latest_actual:
                latest_summary_snapshot = {
                    **latest_actual,
                    "trade_date": cutoff_date,
                    "nav_close": latest_actual["current_nav_close"],
                    "profit_amount_current": latest_actual["profit_amount_current"],
                }
            elif latest_saved:
                latest_summary_snapshot = latest_saved
            if actual_views:
                month_buckets: dict[str, dict[str, Any]] = {}
                for row in actual_views:
                    month_key = str(row["trade_date"])[:7]
                    bucket = month_buckets.setdefault(
                        month_key,
                        {
                            "month": month_key,
                            "account_type": account_type,
                            "account_label": ACCOUNT_LABELS[account_type],
                            "start_nav": row["nav_close"],
                            "end_nav": row["nav_close"],
                            "trade_count": 0,
                            "winning_trade_count": 0,
                            "realized_pnl": 0.0,
                            "realized_invested_value": 0.0,
                        },
                    )
                    bucket["end_nav"] = row["nav_close"]
                for trade in account_realized_trades:
                    month_key = str(trade.get("trade_date") or "")[:7]
                    if month_key not in month_buckets:
                        continue
                    bucket = month_buckets[month_key]
                    pnl = float(trade.get("realized_pnl") or 0.0)
                    bucket["trade_count"] += 1
                    bucket["winning_trade_count"] += 1 if pnl > 0 else 0
                    bucket["realized_pnl"] += pnl
                    bucket["realized_invested_value"] += float(trade.get("invested_value") or 0.0)
                for bucket in month_buckets.values():
                    start_nav = float(bucket["start_nav"] or 0.0)
                    end_nav = float(bucket["end_nav"] or 0.0)
                    trade_count = int(bucket["trade_count"] or 0)
                    realized_invested = float(bucket["realized_invested_value"] or 0.0)
                    monthly_stats.append(
                        {
                            "month": bucket["month"],
                            "account_type": account_type,
                            "account_label": ACCOUNT_LABELS[account_type],
                            "month_return_pct": round(((end_nav / start_nav) - 1) * 100, 2) if start_nav > 0 else 0.0,
                            "trade_count": trade_count,
                            "winning_trade_count": int(bucket["winning_trade_count"] or 0),
                            "win_rate_pct": round((float(bucket["winning_trade_count"] or 0) / trade_count) * 100, 1) if trade_count > 0 else None,
                            "realized_pnl": round(float(bucket["realized_pnl"] or 0.0), 2),
                            "realized_return_pct": round((float(bucket["realized_pnl"] or 0.0) / realized_invested) * 100, 2) if realized_invested > 0 else None,
                            "realized_trades": [trade for trade in account_realized_trades if str(trade.get("trade_date") or "")[:7] == bucket["month"]],
                        }
                    )
            account_views.append(
                {
                    "account_type": account_type,
                    "account_label": ACCOUNT_LABELS[account_type],
                    "snapshots": snapshot_views,
                    "latest_snapshot": latest_summary_snapshot,
                    "latest_saved_snapshot": latest_saved,
                    "summary": {
                        "snapshot_count": len(snapshot_views),
                        "latest_date": latest_summary_snapshot.get("trade_date") if latest_summary_snapshot else None,
                        "latest_nav": latest_summary_snapshot.get("nav_close") if latest_summary_snapshot else None,
                    },
                }
            )

        actual_dates = sorted(account_rows_by_date)
        if not actual_dates:
            return self.legacy_calculate()

        initial_capital = sum(float(row.get("capital") or 0.0) for row in account_rows_by_date[actual_dates[0]])
        series: list[dict[str, Any]] = []
        daily_details: list[dict[str, Any]] = []
        daily_allocations: list[dict[str, Any]] = []
        previous_total_nav: float | None = None
        for trade_date in actual_dates:
            rows = account_rows_by_date[trade_date]
            total_nav = sum(float(row.get("nav_close") or 0.0) for row in rows)
            daily_return_pct = ((total_nav / previous_total_nav) - 1) * 100 if previous_total_nav not in (None, 0) else 0.0
            series.append(
                {
                    "date": trade_date,
                    "value": round((total_nav / initial_capital) * 100, 2) if initial_capital > 0 else 100.0,
                    "return_pct": round(((total_nav / initial_capital) - 1) * 100, 2) if initial_capital > 0 else 0.0,
                    "nav": round(total_nav, 2),
                    "daily_return_pct": round(daily_return_pct, 3),
                }
            )
            daily_details.append(
                {
                    "date": trade_date,
                    "nav_close": round(total_nav, 2),
                    "cash_close": round(sum(float(row.get("cash_value") or 0.0) for row in rows), 2),
                    "daily_return_pct": round(daily_return_pct, 3),
                    "account_summaries": [
                        {
                            "account_type": row.get("account_type"),
                            "account_label": row.get("account_label"),
                            "nav_close": row.get("nav_close"),
                            "daily_return_pct": row.get("daily_return_pct"),
                            "exposure_pct": round(sum(float(item.get("weight_pct") or 0.0) for item in row.get("items") or []), 2),
                        }
                        for row in rows
                    ],
                }
            )
            stock_weights: dict[str, float] = {}
            sector_weights: dict[str, float] = defaultdict(float)
            for row in rows:
                for item in row.get("items") or []:
                    if float(item.get("weight_pct") or 0.0) <= 0:
                        continue
                    stock_weights[str(item.get("resolved_name") or item.get("stock_name") or item.get("stock_code") or "")] = float(item.get("weight_pct") or 0.0)
                    sector_weights[str(item.get("sector") or "미분류")] += float(item.get("weight_pct") or 0.0)
            daily_allocations.append(
                {
                    "date": trade_date,
                    "stock_weights": {key: round(value, 4) for key, value in stock_weights.items()},
                    "sector_weights": {key: round(value, 4) for key, value in sector_weights.items()},
                }
            )
            previous_total_nav = total_nav

        latest_actual_snapshots = [row.get("latest_snapshot") for row in account_views if row.get("latest_snapshot")]
        if latest_actual_snapshots and cutoff_date > actual_dates[-1]:
            current_total_nav = sum(float(row.get("nav_close") or 0.0) for row in latest_actual_snapshots)
            current_daily_return = ((current_total_nav / previous_total_nav) - 1) * 100 if previous_total_nav not in (None, 0) else 0.0
            series.append(
                {
                    "date": cutoff_date,
                    "value": round((current_total_nav / initial_capital) * 100, 2) if initial_capital > 0 else 100.0,
                    "return_pct": round(((current_total_nav / initial_capital) - 1) * 100, 2) if initial_capital > 0 else 0.0,
                    "nav": round(current_total_nav, 2),
                    "daily_return_pct": round(current_daily_return, 3),
                }
            )
            daily_details.append(
                {
                    "date": cutoff_date,
                    "nav_close": round(current_total_nav, 2),
                    "cash_close": round(sum(float(row.get("cash_value") or 0.0) for row in latest_actual_snapshots), 2),
                    "daily_return_pct": round(current_daily_return, 3),
                    "account_summaries": [
                        {
                            "account_type": row.get("account_type"),
                            "account_label": row.get("account_label"),
                            "nav_close": row.get("nav_close"),
                            "daily_return_pct": row.get("daily_return_pct"),
                            "exposure_pct": round(sum(float(item.get("weight_pct") or 0.0) for item in row.get("items") or []), 2),
                        }
                        for row in latest_actual_snapshots
                    ],
                }
            )

        benchmark_map, benchmark_labels = self._fetch_benchmark_series([row["date"] for row in series], start_date, cutoff_date)
        latest_holding_count = sum(
            len(
                [
                    item
                    for item in (account.get("latest_snapshot", {}) or {}).get("items") or []
                    if item.get("is_open_position") is not False
                    and float(item.get("weight_pct") or 0.0) > 0
                    and not float(item.get("sell_price") or 0.0)
                ]
            )
            for account in account_views
        )
        final_nav = float(series[-1].get("nav") or initial_capital) if series else initial_capital
        current_month_key = cutoff_date[:7]
        current_month_realized_pnl = sum(
            float(row.get("realized_pnl") or 0.0)
            for row in monthly_stats
            if row.get("month") == current_month_key
        )
        current_month_trade_count = sum(
            int(row.get("trade_count") or 0)
            for row in monthly_stats
            if row.get("month") == current_month_key
        )
        summary = {
            "start_date": series[0]["date"] if series else None,
            "end_date": series[-1]["date"] if series else None,
            "initial_capital": round(initial_capital, 2),
            "final_nav": round(final_nav, 2),
            "profit_amount_current": round(final_nav - initial_capital, 2),
            "current_month_realized_pnl": round(current_month_realized_pnl, 2),
            "current_month_trade_count": current_month_trade_count,
            "final_value": round((final_nav / initial_capital) * 100, 2) if initial_capital > 0 else 100.0,
            "total_return_pct": round(((final_nav / initial_capital) - 1) * 100, 2) if initial_capital > 0 else 0.0,
            "rebalance_count": len(series),
            "holding_count_latest": latest_holding_count,
            "snapshot_count": len(snapshots),
        }
        return {
            "series": series,
            "benchmark": benchmark_map.get("kospi", []),
            "benchmarks": benchmark_map,
            "benchmark_labels": benchmark_labels,
            "summary": summary,
            "rebalances": [],
            "daily_details": daily_details,
            "daily_allocations": daily_allocations,
            "trade_analysis": {},
            "manual_journal": journal,
            "manual_accounts": account_views,
            "monthly_stats": monthly_stats,
            "capture_sets": capture_sets,
        }

    def cache_key(self) -> str:
        manual_mtime = self.path.stat().st_mtime if self.path.exists() else 0
        return f"manual:{manual_mtime:.0f}:{date.today().isoformat()}"

    def cached_performance(self, force_refresh: bool = False) -> dict[str, Any]:
        key = self.cache_key()
        cache = self.legacy.PORTFOLIO_PERFORMANCE_CACHE
        with self.legacy.PORTFOLIO_PERFORMANCE_CACHE_LOCK:
            if not force_refresh and cache.get("key") == key and time.time() - float(cache.get("cached_at") or 0) < self.legacy.PORTFOLIO_PERFORMANCE_CACHE_TTL_SECONDS:
                return cache["payload"]
            payload = self.performance()
            cache.clear()
            cache.update({"key": key, "cached_at": time.time(), "payload": payload})
            return payload


def _promote_routes(app: Any, paths: set[str]) -> None:
    promoted = [route for route in app.routes if getattr(route, "path", None) in paths]
    remainder = [route for route in app.routes if route not in promoted]
    catchall = next((index for index, route in enumerate(remainder) if getattr(route, "path", None) == "/{full_path:path}"), len(remainder))
    app.router.routes[:] = remainder[:catchall] + promoted + remainder[catchall:]


def install_portfolio_manual_journal(legacy: Any) -> None:
    feature = ManualJournalFeature(legacy)
    legacy.PortfolioManualItemInput = PortfolioManualItemInput
    legacy.PortfolioManualSnapshotRequest = PortfolioManualSnapshotRequest
    legacy.load_portfolio_manual_db = feature.load
    legacy.save_portfolio_manual_db = feature.save
    legacy.calculate_portfolio_performance = feature.performance
    legacy.get_cached_portfolio_performance = feature.cached_performance

    def save_journal(request: PortfolioManualSnapshotRequest) -> JSONResponse:
        try:
            current = feature.load()
            snapshot = feature.normalize_snapshot(request.model_dump())
            snapshots = [row for row in current["snapshots"] if row["snapshot_id"] != snapshot["snapshot_id"]]
            feature.save({"snapshots": [*snapshots, snapshot]})
            legacy.PORTFOLIO_PERFORMANCE_CACHE.clear()
            feature.ai_cache.clear()
            return JSONResponse(feature.cached_performance(force_refresh=True))
        except Exception as exc:
            return JSONResponse({"error": str(exc)}, status_code=500)

    def delete_journal(snapshot_id: str) -> JSONResponse:
        key = str(snapshot_id or "").strip()
        if not key:
            return JSONResponse({"error": "snapshot_id가 필요합니다."}, status_code=400)
        try:
            current = feature.load()
            feature.save({"snapshots": [row for row in current["snapshots"] if row["snapshot_id"] != key]})
            legacy.PORTFOLIO_PERFORMANCE_CACHE.clear()
            feature.ai_cache.clear()
            return JSONResponse(feature.cached_performance(force_refresh=True))
        except Exception as exc:
            return JSONResponse({"error": str(exc)}, status_code=500)

    def portfolio_ai_review(account_type: str = "kr", force_refresh: bool = False) -> JSONResponse:
        try:
            return JSONResponse(feature.ai_review(account_type=account_type, force_refresh=force_refresh))
        except Exception as exc:
            return JSONResponse({"error": str(exc)}, status_code=500)

    save_journal.__name__ = "portfolio_journal_save"
    delete_journal.__name__ = "portfolio_journal_delete"
    portfolio_ai_review.__name__ = "portfolio_ai_review"
    legacy.app.post("/api/portfolio/journal")(save_journal)
    legacy.app.delete("/api/portfolio/journal")(delete_journal)
    legacy.app.get("/api/portfolio/ai-review")(portfolio_ai_review)
    _promote_routes(legacy.app, {"/api/portfolio/journal", "/api/portfolio/ai-review"})
