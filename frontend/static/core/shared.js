(function (global) {
  "use strict";

  const LAST_PAGE_KEY = "stock-dashboard:last-page";
  const FIRST_PAGE_MIGRATION_KEY = "stock-dashboard:first-page-watch-board-v1";
  const SIDEBAR_COLLAPSED_KEY = "stock-dashboard:sidebar-collapsed";
  const SECTOR_SNAPSHOT_KEY = "stock-dashboard:sector-snapshot-groups";
  const SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY = "stock-dashboard:sector-snapshot-builder-collapsed";
  const TELEGRAM_SEARCH_KEY = "stock-dashboard:telegram-search-state";
  const PENDING_TELEGRAM_STOCK_KEY = "stock-dashboard:pending-telegram-stock";
  const THEME_SECTOR_KEY = "stock-dashboard:theme-sector-state";
  const GLOBAL_COMPANY_KEY = "stock-dashboard:global-company-state";
  const STOCK_NEWS_KEY = "stock-dashboard:stock-news-state";
  const DISCLOSURE_PAGE_KEY = "stock-dashboard:disclosure-page-state";
  const DISCLOSURE_PAGE_STATE_VERSION = 5;
  const WINDOW_TITLE_DETAIL_EVENT = "stock-dashboard:title-detail";
  const OPEN_TELEGRAM_STOCK_EVENT = "stock-dashboard:open-telegram-stock";
  const PAGE_TITLE_LABELS = {
    "sector-watch": "관심종목 보드",
    "themes": "오늘의 주도주",
    "global-themes": "미국 주도주",
    "asia-themes": "아시아 주도주",
    "telegram": "종목 정보 검색기",
    "disclosure": "공시/실적",
    "stock-news": "뉴스 검색기",
    "global-company": "해외기업 검색기",
    "global-indices": "지수/가격동향",
    "portfolio": "포트폴리오 수익",
    "sector-entry": "섹터 진입 신호",
    "sector-snapshot": "섹터 비교 테이블",
    "trade-data": "수출입",
    "economy-cycle": "경기순환",
    "strategy-backtest": "전략 백테스트",
    "market-calendar": "증시 일정",
    "real-estate-prices": "부동산 가격",
    "building-management": "건물 관리",
    "next": "추가 예정 페이지",
  };
  const APP_PAGE_KEYS = [
    "sector-watch",
    "portfolio",
    "themes",
    "telegram",
    "disclosure",
    "stock-news",
    "global-company",
    "global-indices",
    "sector-entry",
    "sector-snapshot",
    "trade-data",
    "economy-cycle",
    "strategy-backtest",
    "market-calendar",
    "real-estate-prices",
    "building-management",
    "next",
  ];
  const CHART_PREVIEW_CACHE = {};

  function normalizeAppPageKey(pageKey, fallback) {
    const normalized = String(pageKey || "").trim();
    return APP_PAGE_KEYS.indexOf(normalized) >= 0 ? normalized : (fallback || "sector-watch");
  }

  function buildPageLocationHash(pageKey) {
    return "#page=" + encodeURIComponent(normalizeAppPageKey(pageKey, "sector-watch"));
  }

  function openTelegramStockSearch(payload) {
    const detail = {
      name: String((payload && payload.name) || "").trim(),
      code: String((payload && payload.code) || "").trim(),
    };
    try {
      localStorage.setItem(PENDING_TELEGRAM_STOCK_KEY, JSON.stringify(detail));
    } catch (err) {}
    window.dispatchEvent(new CustomEvent(OPEN_TELEGRAM_STOCK_EVENT, { detail: detail }));
  }

  function consumePendingTelegramStockSearch() {
    try {
      const raw = localStorage.getItem(PENDING_TELEGRAM_STOCK_KEY);
      if (!raw) {
        return null;
      }
      localStorage.removeItem(PENDING_TELEGRAM_STOCK_KEY);
      const parsed = JSON.parse(raw);
      return {
        name: String((parsed && parsed.name) || "").trim(),
        code: String((parsed && parsed.code) || "").trim(),
      };
    } catch (err) {
      return null;
    }
  }

  function parsePageFromLocationHash() {
    const rawHash = String(window.location.hash || "").replace(/^#/, "").trim();
    if (!rawHash) {
      return "";
    }
    if (APP_PAGE_KEYS.indexOf(rawHash) >= 0) {
      return rawHash;
    }
    const params = new URLSearchParams(rawHash);
    return normalizeAppPageKey(params.get("page") || "", "");
  }

  function isEditableTarget(target) {
    if (!target || typeof target.closest !== "function") {
      return false;
    }
    return !!target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], .CodeMirror, .cm-editor");
  }

  function installDomMutationGuard() {
    if (!window.Node || window.__stockDashboardDomMutationGuard) {
      return;
    }
    window.__stockDashboardDomMutationGuard = true;
    const originalRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function (child) {
      if (child && child.parentNode !== this) {
        return child;
      }
      return originalRemoveChild.call(this, child);
    };
  }

  function compactTitleText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 48);
  }

  function emitWindowTitleDetail(page, detail) {
    if (!page || typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new CustomEvent(WINDOW_TITLE_DETAIL_EVENT, {
      detail: {
        page: page,
        detail: compactTitleText(detail),
      },
    }));
  }

  function buildWindowTitle(page, detail) {
    const label = PAGE_TITLE_LABELS[page] || "Stock Dashboard";
    const extra = compactTitleText(detail);
    return extra ? label + " · " + extra + " - Stock Dashboard" : label + " - Stock Dashboard";
  }

  function numberFormat(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return new Intl.NumberFormat("ko-KR", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0,
    }).format(number);
  }

  function formatPercent(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return numberFormat(number, digits == null ? 2 : digits) + "%";
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(number);
  }

  function formatDateLabel(value) {
    if (!value) {
      return "";
    }
    return String(value).slice(5).replace("-", "/");
  }

  function formatNumber(value, digits) {
    return numberFormat(value, digits == null ? 0 : digits);
  }

  function formatYearLabel(value) {
    const match = String(value || "").match(/^(\d{4})/);
    return match ? match[1] : String(value || "");
  }

  function monthLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    if (!match) {
      return "";
    }
    return match[1] + "년 " + String(Number(match[2])) + "월";
  }

  function shiftMonth(value, offset) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    const base = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
    base.setMonth(base.getMonth() + offset);
    return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0");
  }

  function buildMonthCells(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    const base = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset);
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      cells.push({
        date: day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0"),
        day: day.getDate(),
        inMonth: day.getMonth() === month,
      });
    }
    return cells;
  }

  function buildBusinessMonthCells(value) {
    return buildMonthCells(value).filter(function (cell) {
      const day = new Date(cell.date).getDay();
      return day !== 0 && day !== 6;
    });
  }

  function isBusinessDate(value) {
    const day = new Date(value).getDay();
    return day !== 0 && day !== 6;
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function colorForKey(key) {
    const palette = [
      "#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#be123c", "#65a30d",
      "#c2410c", "#9333ea", "#0284c7", "#b45309", "#059669", "#db2777", "#4f46e5", "#0d9488",
      "#a16207", "#e11d48", "#2f855a", "#1d4ed8", "#b91c1c", "#15803d", "#9d174d", "#6d28d9",
      "#0369a1", "#b7791f", "#047857", "#c026d3", "#4338ca", "#0f766e", "#92400e", "#9f1239",
      "#3b82f6", "#ef4444", "#22c55e", "#f97316", "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16",
      "#f59e0b", "#a855f7", "#0ea5e9", "#14b8a6", "#eab308", "#ec4899", "#6366f1", "#10b981",
    ];
    let hash = 0;
    const text = String(key || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  function normalizeSearchValue(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s\-_\u00b7,:/\\()[\]{}<>|]+/g, "");
  }

  function normalizeAllocationLabel(label) {
    return String(label || "")
      .replace(/\s*\(\s*-?\d+(?:\.\d+)?%\s*\)\s*$/u, "")
      .trim() || "기타";
  }

  installDomMutationGuard();

  global.StockAppShared = {
    LAST_PAGE_KEY,
    FIRST_PAGE_MIGRATION_KEY,
    SIDEBAR_COLLAPSED_KEY,
    SECTOR_SNAPSHOT_KEY,
    SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY,
    TELEGRAM_SEARCH_KEY,
    PENDING_TELEGRAM_STOCK_KEY,
    THEME_SECTOR_KEY,
    GLOBAL_COMPANY_KEY,
    STOCK_NEWS_KEY,
    DISCLOSURE_PAGE_KEY,
    DISCLOSURE_PAGE_STATE_VERSION,
    WINDOW_TITLE_DETAIL_EVENT,
    OPEN_TELEGRAM_STOCK_EVENT,
    PAGE_TITLE_LABELS,
    APP_PAGE_KEYS,
    CHART_PREVIEW_CACHE,
    normalizeAppPageKey,
    buildPageLocationHash,
    openTelegramStockSearch,
    consumePendingTelegramStockSearch,
    parsePageFromLocationHash,
    isEditableTarget,
    compactTitleText,
    emitWindowTitleDetail,
    buildWindowTitle,
    numberFormat,
    formatPercent,
    formatCurrency,
    formatDateLabel,
    formatNumber,
    formatYearLabel,
    monthLabel,
    shiftMonth,
    buildMonthCells,
    buildBusinessMonthCells,
    isBusinessDate,
    formatDateTime,
    ensureArray,
    colorForKey,
    normalizeSearchValue,
    normalizeAllocationLabel,
  };
})(window);
