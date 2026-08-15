from __future__ import annotations

from collections.abc import Iterable
from typing import Any


DOMAIN_PREFIXES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("naver-blog", ("/api/naver-blog",)),
    ("portfolio", ("/api/portfolio", "/api/subscription", "/api/chart-game")),
    ("real-estate", ("/api/real-estate", "/api/building")),
    ("disclosure", ("/api/disclosure", "/api/telegram")),
    ("market-analysis", ("/api/market", "/api/economy", "/api/etf", "/api/sector", "/api/trade")),
    ("global-stocks", ("/api/global", "/api/international", "/api/pair")),
    ("stock-research", ("/api/stock", "/api/stocks", "/api/themes", "/api/strategy")),
)


def domain_for_path(path: str) -> str:
    for domain, prefixes in DOMAIN_PREFIXES:
        if path.startswith(prefixes):
            return domain
    return "system"


def _api_routes(routes: Iterable[Any]) -> Iterable[Any]:
    return (route for route in routes if str(getattr(route, "path", "")).startswith("/api/"))


def apply_route_domains(app: Any) -> None:
    """Attach stable domain tags without changing route handlers or ordering."""
    for route in _api_routes(app.routes):
        domain = domain_for_path(route.path)
        tags = list(getattr(route, "tags", None) or [])
        if domain not in tags:
            route.tags = [domain, *tags]
    app.openapi_schema = None
