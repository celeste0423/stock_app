from __future__ import annotations

import json
import re
import time
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


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


ACCOUNT_LABELS = {"kr": "국장 계좌", "us": "미장 계좌"}


class ManualJournalFeature:
    def __init__(self, legacy: Any) -> None:
        self.legacy = legacy
        state_dir = Path(getattr(legacy, "STATE_DIR", Path(__file__).resolve().parents[2]))
        self.path = state_dir / "portfolio_manual_journal.json"
        self.legacy_calculate = legacy.calculate_portfolio_performance

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
        weight = max(0.0, float(self.legacy.to_float(raw.get("weight_pct")) or 0.0))
        if not normalized_code or not (name or resolved_name) or weight <= 0:
            return None
        avg_price = max(0.0, float(self.legacy.to_float(raw.get("avg_price")) or 0.0))
        quantity = max(0.0, float(self.legacy.to_float(raw.get("quantity")) or 0.0))
        stop_loss = self.legacy.to_float(raw.get("stop_loss_price"))
        sell_price = self.legacy.to_float(raw.get("sell_price"))
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
    def capital(snapshot: dict[str, Any]) -> float:
        explicit = float(snapshot.get("account_capital") or 0.0)
        if explicit > 0:
            return explicit
        invested = sum(float(row.get("avg_price") or 0.0) * float(row.get("quantity") or 0.0) for row in snapshot.get("items") or [])
        exposure = sum(float(row.get("weight_pct") or 0.0) for row in snapshot.get("items") or []) / 100
        return invested / exposure if invested > 0 and exposure > 0 else invested

    def blocks(self, journal: dict[str, Any]) -> list[dict[str, Any]]:
        blocks = []
        for trade_date in sorted({row["trade_date"] for row in journal.get("snapshots") or []}):
            snapshots = [row for row in journal["snapshots"] if row["trade_date"] == trade_date]
            total_capital = sum(self.capital(row) for row in snapshots)
            items = []
            for snapshot in snapshots:
                account_capital = self.capital(snapshot)
                for item in snapshot.get("items") or []:
                    target = (float(item.get("weight_pct") or 0.0) / 100) * (account_capital / total_capital if total_capital else 0)
                    items.append({**item, "prev_weight": 0.0, "target_weight": target})
            blocks.append({"rebalance_date": trade_date, "seed_capital": total_capital if not blocks else None, "items": items, "holdings": items})
        return blocks

    def performance(self) -> dict[str, Any]:
        journal = self.load()
        snapshots = journal.get("snapshots") or []
        if not snapshots:
            return self.legacy_calculate()
        blocks = self.blocks(journal)
        series = []
        rebalances = []
        allocations = []
        account_views = []
        initial_nav = sum(self.capital(row) for row in snapshots if row["trade_date"] == snapshots[0]["trade_date"])
        for block in blocks:
            nav = sum(float(item.get("avg_price") or 0.0) * float(item.get("quantity") or 0.0) for item in block["items"])
            capital = float(block.get("seed_capital") or nav or initial_nav)
            value = (nav / initial_nav) * 100 if initial_nav else 100.0
            series.append({"date": block["rebalance_date"], "value": round(value, 2), "return_pct": round(value - 100, 2), "nav": round(nav or capital, 2), "daily_return_pct": 0.0})
            rebalances.append({**block, "executed_date": block["rebalance_date"], "trades": []})
            allocations.append({"date": block["rebalance_date"], "stock_weights": {row["resolved_name"]: row["weight_pct"] for row in block["items"]}, "sector_weights": {}})
        for account in ("kr", "us"):
            rows = [row for row in snapshots if row["account_type"] == account]
            if rows:
                account_views.append({"account_type": account, "account_label": ACCOUNT_LABELS[account], "snapshots": rows, "latest_snapshot": rows[-1], "summary": {"snapshot_count": len(rows), "latest_date": rows[-1]["trade_date"]}})
        final_nav = float(series[-1]["nav"] if series else initial_nav)
        return {
            "series": series, "benchmark": [], "benchmarks": {}, "benchmark_labels": {},
            "summary": {"start_date": series[0]["date"], "end_date": series[-1]["date"], "initial_capital": initial_nav, "final_nav": final_nav, "final_value": series[-1]["value"], "total_return_pct": series[-1]["return_pct"], "rebalance_count": len(rebalances), "holding_count_latest": len(rebalances[-1]["holdings"]), "snapshot_count": len(snapshots)},
            "rebalances": rebalances, "daily_details": [], "daily_allocations": allocations, "trade_analysis": {},
            "manual_journal": journal, "manual_accounts": account_views, "monthly_stats": [], "capture_sets": [],
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
            return JSONResponse(feature.cached_performance(force_refresh=True))
        except Exception as exc:
            return JSONResponse({"error": str(exc)}, status_code=500)

    save_journal.__name__ = "portfolio_journal_save"
    delete_journal.__name__ = "portfolio_journal_delete"
    legacy.app.post("/api/portfolio/journal")(save_journal)
    legacy.app.delete("/api/portfolio/journal")(delete_journal)
    _promote_routes(legacy.app, {"/api/portfolio/journal"})
