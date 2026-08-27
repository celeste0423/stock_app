(function () {
  "use strict";

  const h = React.createElement;
  const { useEffect, useMemo, useRef, useState } = React;
  const LAST_PAGE_KEY = "stock-dashboard:last-page";
  const FIRST_PAGE_MIGRATION_KEY = "stock-dashboard:first-page-watch-board-v1";
  const SIDEBAR_COLLAPSED_KEY = "stock-dashboard:sidebar-collapsed";
  const SECTOR_SNAPSHOT_KEY = "stock-dashboard:sector-snapshot-groups";
  const SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY = "stock-dashboard:sector-snapshot-builder-collapsed";
  const TELEGRAM_SEARCH_KEY = "stock-dashboard:telegram-search-state";
  const THEME_SECTOR_KEY = "stock-dashboard:theme-sector-state";
  const STOCK_NEWS_KEY = "stock-dashboard:stock-news-state";
  const DISCLOSURE_PAGE_KEY = "stock-dashboard:disclosure-page-state";
  const DISCLOSURE_PAGE_STATE_VERSION = 7;
  const WINDOW_TITLE_DETAIL_EVENT = "stock-dashboard:title-detail";
  const PAGE_NAV_EVENT = "stock-dashboard:navigate-page";
  const TAB_ORDER_KEY = "stock-dashboard:tab-order-v1";
  const THEME_STOCK_NAV_KEY = "stock-dashboard:theme-stock-navigation";
  const TELEGRAM_STOCK_NAV_KEY = "stock-dashboard:telegram-stock-navigation";
  const GLOBAL_STOCK_NAV_KEY = "stock-dashboard:global-stock-navigation";
  const GLOBAL_STOCK_NAV_EVENT = "stock-dashboard:global-stock-navigation";
  const AUTO_DAILY_THEME_BUILD_KEY = "stock-dashboard:auto-daily-theme-build-v1";
  const AUTO_DAILY_THEME_BUILD_EVENT = "stock-dashboard:auto-daily-theme-build";
  const PAIR_CORRELATION_KEY = "stock-dashboard:pair-correlation-state";
  const ETF_FLOW_PAGE_KEY = "stock-dashboard:etf-flow-page-state";
  const SUBSCRIPTION_LIST_KEY = "stock-dashboard:subscription-list-state";
  const SUBSCRIPTION_RUNTIME_CACHE_KEY = "stock-dashboard:subscription-runtime-cache-v5";
  const CHART_GAME_STATE_KEY = "stock-dashboard:chart-game-state-v1";
  const PAGE_TITLE_LABELS = {
    "sector-watch": "관심종목 보드",
    "themes": "오늘의 주도주",
    "chart-game": "차트 게임",
    "global-themes": "미국 주도주",
    "asia-themes": "아시아 주도주",
    "telegram": "종목 정보 검색기",
    "disclosure": "공시/실적",
    "stock-news": "뉴스 검색기",
    "global-company": "해외기업 검색기",
    "pair-correlation": "주가 상관관계",
    "etf-flow": "ETF 자금 추정",
    "global-indices": "지수/가격동향",
    "institutional-rebalance": "기관 리밸런싱 추정",
    "portfolio": "포트폴리오 수익",
    "sector-entry": "섹터 진입 신호",
    "breakout-stats": "돌파 통계",
    "sector-snapshot": "섹터 비교 테이블",
    "trade-data": "수출입",
    "economy-cycle": "경기순환",
    "strategy-backtest": "전략 백테스트",
    "market-calendar": "증시 일정",
    "naver-blog": "네이버 블로그 브리핑",
    "real-estate-prices": "부동산 가격",
    "subscription-list": "아파트 청약 리스트",
    "building-management": "건물 관리",
    "next": "추가 예정 페이지",
  };
  const ACTIVE_API_REQUESTS = {};

  function getStockAppModule(name) {
    const modules = window.StockAppModules || {};
    return modules[name] || {};
  }

  function requestPageNavigation(page, detail) {
    const payload = Object.assign({ page: page }, detail || {});
    window.dispatchEvent(new CustomEvent(PAGE_NAV_EVENT, { detail: payload }));
  }

  function moveArrayItem(items, fromIndex, toIndex) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length || fromIndex === toIndex) {
      return list;
    }
    const removed = list.splice(fromIndex, 1);
    if (!removed.length) {
      return list;
    }
    list.splice(toIndex, 0, removed[0]);
    return list;
  }

  function normalizeTabOrder(savedOrder, defaultKeys) {
    const defaults = Array.isArray(defaultKeys) ? defaultKeys.filter(Boolean) : [];
    const seen = {};
    const ordered = [];
    ensureArray(savedOrder).forEach(function (key) {
      const text = String(key || "").trim();
      if (!text || seen[text] || defaults.indexOf(text) < 0) {
        return;
      }
      seen[text] = true;
      ordered.push(text);
    });
    defaults.forEach(function (key) {
      if (!seen[key]) {
        seen[key] = true;
        ordered.push(key);
      }
    });
    return ordered;
  }

  function isEditableHotkeyTarget(target) {
    if (!target) {
      return false;
    }
    const tag = String(target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return true;
    }
    return !!target.isContentEditable;
  }

  function stashThemeStockNavigation(query) {
    const target = String(query || "").trim();
    if (!target) {
      return;
    }
    try {
      sessionStorage.setItem(THEME_STOCK_NAV_KEY, JSON.stringify({ query: target }));
    } catch (error) {
    }
  }

  function stashTelegramStockNavigation(query) {
    const target = String(query || "").trim();
    if (!target) {
      return;
    }
    try {
      sessionStorage.setItem(TELEGRAM_STOCK_NAV_KEY, JSON.stringify({ query: target }));
    } catch (error) {
    }
  }

  function consumeTelegramStockNavigation() {
    try {
      const raw = sessionStorage.getItem(TELEGRAM_STOCK_NAV_KEY);
      if (!raw) {
        return null;
      }
      sessionStorage.removeItem(TELEGRAM_STOCK_NAV_KEY);
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function stashGlobalStockNavigation(payload) {
    const symbol = String((payload && payload.symbol) || "").trim().toUpperCase();
    const name = String((payload && payload.name) || "").trim();
    const query = String((payload && payload.query) || "").trim();
    if (!symbol && !name && !query) {
      return;
    }
    try {
      sessionStorage.setItem(GLOBAL_STOCK_NAV_KEY, JSON.stringify({
        symbol: symbol,
        name: name,
        query: query,
      }));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GLOBAL_STOCK_NAV_EVENT));
      }
    } catch (error) {
    }
  }

  function openStockInGlobalCompany(row) {
    const symbol = String((row && row.stock_code) || "").trim().toUpperCase();
    const stockName = String((row && row.stock_name) || "").trim();
    const displayQuery = stockName
      ? stockName + (symbol ? " (" + symbol + ")" : "")
      : symbol;
    if (!displayQuery) {
      return;
    }
    stashGlobalStockNavigation({
      symbol: symbol,
      name: stockName,
      query: displayQuery,
    });
    requestPageNavigation("global-company");
  }
  const CHART_PREVIEW_CACHE = {};
  const TARGET_HISTORY_CACHE = {};
  let API_REQUEST_SEQ = 0;

  function loadChartGameState() {
    try {
      const raw = localStorage.getItem(CHART_GAME_STATE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function persistChartGameState(payload) {
    try {
      localStorage.setItem(CHART_GAME_STATE_KEY, JSON.stringify(payload || {}));
    } catch (error) {
    }
  }

  function clearChartGameState() {
    try {
      localStorage.removeItem(CHART_GAME_STATE_KEY);
    } catch (error) {
    }
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

  installDomMutationGuard();

  function compactTitleText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 48);
  }

  function normalizeLooseSearchText(value) {
    return String(value || "").toLowerCase().replace(/[\s\-_·•.,:/\\()\[\]{}<>|]+/g, "");
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

  function normalizeTimestampMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return Date.now();
    }
    return number < 100000000000 ? Math.round(number * 1000) : Math.round(number);
  }

  function formatDateTimeShort(value) {
    const timestamp = normalizeTimestampMs(value);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
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

  function formatMoneyByCurrency(value, currency, compact) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    const normalizedCurrency = String(currency || "KRW").toUpperCase();
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: normalizedCurrency,
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 2 : 0,
      }).format(number);
    } catch (error) {
      return (normalizedCurrency === "KRW" ? "₩" : normalizedCurrency + " ") + numberFormat(number, compact ? 2 : 0);
    }
  }

  function formatMoneyByCurrencyKoreanCompact(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    const normalizedCurrency = String(currency || "KRW").toUpperCase();
    if (normalizedCurrency !== "KRW") {
      return formatMoneyByCurrency(number, normalizedCurrency, true);
    }
    const abs = Math.abs(number);
    const sign = number < 0 ? "-" : "";
    if (abs >= 100000000) {
      const eok = abs / 100000000;
      return sign + numberFormat(eok >= 10 ? Math.round(eok) : eok, eok >= 10 ? 0 : 2) + "억 원";
    }
    if (abs >= 10000) {
      const man = abs / 10000;
      return sign + numberFormat(man >= 1000 ? Math.round(man) : man, man >= 1000 ? 0 : 1) + "만 원";
    }
    return sign + numberFormat(abs, 0) + "원";
  }

  function formatDateLabel(value) {
    if (!value) {
      return "";
    }
    return String(value).slice(5).replace("-", "/");
  }

  function formatYearMonthLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    if (!match) {
      return "";
    }
    return match[1] + "/" + match[2];
  }

  function shiftIsoDate(dateText, deltaDays) {
    if (!dateText) {
      return "";
    }
    const base = new Date(String(dateText).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(base.getTime())) {
      return "";
    }
    base.setDate(base.getDate() + Number(deltaDays || 0));
    return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0") + "-" + String(base.getDate()).padStart(2, "0");
  }

  function mergeScoreHistoryPayloadRows(currentPayload, olderPayload) {
    const currentRows = ensureArray(currentPayload && currentPayload.rows);
    const olderRows = ensureArray(olderPayload && olderPayload.rows);
    const mergedMap = {};
    olderRows.forEach(function (item) {
      if (item && item.date) {
        mergedMap[String(item.date)] = item;
      }
    });
    currentRows.forEach(function (item) {
      if (item && item.date) {
        mergedMap[String(item.date)] = item;
      }
    });
    const mergedRows = Object.keys(mergedMap).sort().map(function (key) { return mergedMap[key]; });
    return Object.assign({}, currentPayload || {}, olderPayload || {}, {
      rows: mergedRows,
      start_date: mergedRows.length ? String(mergedRows[0].date || (olderPayload && olderPayload.start_date) || "") : ((olderPayload && olderPayload.start_date) || (currentPayload && currentPayload.start_date) || ""),
      end_date: currentPayload && currentPayload.end_date ? currentPayload.end_date : (olderPayload && olderPayload.end_date),
      summary: currentPayload && currentPayload.summary ? currentPayload.summary : (olderPayload && olderPayload.summary),
      stock_code: (currentPayload && currentPayload.stock_code) || (olderPayload && olderPayload.stock_code) || "",
      stock_name: (currentPayload && currentPayload.stock_name) || (olderPayload && olderPayload.stock_name) || "",
    });
  }

  function renderHighDrawdownPercent(row) {
    const rawDistance = row && row.pct_to_52w_high;
    if (rawDistance === null || rawDistance === undefined || rawDistance === "") {
      return "-";
    }
    const distance = Number(rawDistance);
    const tradingValue = Number((row && row.trading_value_100m) || 0);
    if (!Number.isFinite(distance) || tradingValue <= 0) {
      return "-";
    }
    const drawdown = distance <= 0 ? 0 : -((distance / (100 + distance)) * 100);
    return h("span", null, formatPercent(drawdown, 2));
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
    return match[1] + "\ub144 " + String(Number(match[2])) + "\uc6d4";
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

  function MiniCandlestickChart(props) {
    const rows = ensureArray(props.rows).filter(function (row) {
      return ["open", "high", "low", "close"].every(function (key) {
        return Number.isFinite(Number(row[key]));
      });
    });
    const targetSeries = ensureArray(props.targetSeries);
    const targetByDate = {};
    targetSeries.forEach(function (row) {
      const dateKey = String(row.date || "").slice(0, 10);
      if (dateKey && Number.isFinite(Number(row.avg_target_price))) {
        targetByDate[dateKey] = row;
      }
    });
    const targetReportMap = {};
    ensureArray(props.targetReports).forEach(function (row) {
      const dateKey = String(row.report_date || "").slice(0, 10);
      if (!dateKey || !Number.isFinite(Number(row.target_price))) {
        return;
      }
      if (!targetReportMap[dateKey]) {
        targetReportMap[dateKey] = [];
      }
      targetReportMap[dateKey].push(row);
    });
    const markerByDate = {};
    ensureArray(props.markers).forEach(function (marker) {
      const dateKey = String(marker.date || "").slice(0, 10);
      if (dateKey) {
        markerByDate[dateKey] = marker;
      }
    });
    const width = 336;
    const height = 176;
    const pad = { top: 6, right: 40, bottom: 14, left: 4 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const lows = rows.map(function (row) { return Number(row.low); }).filter(Number.isFinite);
    const highs = rows.map(function (row) { return Number(row.high); }).filter(Number.isFinite);
    const targetValues = rows
      .map(function (row) {
        const targetRow = targetByDate[String(row.date || "").slice(0, 10)];
        return targetRow ? Number(targetRow.avg_target_price) : null;
      })
      .filter(Number.isFinite);
    if (!rows.length || !lows.length || !highs.length) {
      return h("div", { className: "stock-chart-empty" }, "차트 데이터 없음");
    }
    let minPrice = Math.min.apply(null, lows);
    let maxPrice = Math.max.apply(null, highs);
    if (targetValues.length) {
      minPrice = Math.min(minPrice, Math.min.apply(null, targetValues));
      maxPrice = Math.max(maxPrice, Math.max.apply(null, targetValues));
    }
    if (minPrice === maxPrice) {
      minPrice *= 0.98;
      maxPrice *= 1.02;
    }
    const range = maxPrice - minPrice;
    const xStep = rows.length > 1 ? chartWidth / (rows.length - 1) : chartWidth;
    const candleWidth = Math.max(2, Math.min(7, xStep * 0.55));
    function y(value) {
      return pad.top + (maxPrice - Number(value)) / range * chartHeight;
    }
    function x(index) {
      return pad.left + index * xStep;
    }
    const gridValues = [maxPrice, minPrice + range * 0.5, minPrice];
    const closePoints = rows.map(function (row, index) {
      return { x: x(index), y: y(row.close) };
    });
    const targetPoints = rows
      .map(function (row, index) {
        const targetRow = targetByDate[String(row.date || "").slice(0, 10)];
        if (!targetRow) {
          return null;
        }
        return {
          x: x(index),
          y: y(Number(targetRow.avg_target_price)),
          row: targetRow,
        };
      })
      .filter(Boolean);
    const closeLine = closePoints.map(function (point) {
      return point.x.toFixed(1) + "," + point.y.toFixed(1);
    }).join(" ");
    const targetLine = targetPoints.map(function (point) {
      return point.x.toFixed(1) + "," + point.y.toFixed(1);
    }).join(" ");
    const areaPath = closePoints.length
      ? "M " + closePoints.map(function (point) {
          return point.x.toFixed(1) + " " + point.y.toFixed(1);
        }).join(" L ") + " L " + closePoints[closePoints.length - 1].x.toFixed(1) + " " + (height - pad.bottom) + " L " + closePoints[0].x.toFixed(1) + " " + (height - pad.bottom) + " Z"
      : "";
    return h(
      "svg",
      { className: "stock-mini-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
      h(
        "defs",
        null,
        h("linearGradient", { id: "stockChartGlow", x1: "0", y1: "0", x2: "0", y2: "1" },
          h("stop", { offset: "0%", stopColor: "#2563eb", stopOpacity: "0.16" }),
          h("stop", { offset: "100%", stopColor: "#2563eb", stopOpacity: "0" })
        )
      ),
      gridValues.map(function (value, index) {
        const lineY = y(value);
        return h(
          React.Fragment,
          { key: "grid-" + index },
          h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "stock-chart-grid" }),
          h("text", { x: width - 4, y: lineY + 4, className: "stock-chart-axis", textAnchor: "end" }, numberFormat(value, 0))
        );
      }),
      areaPath ? h("path", { d: areaPath, className: "stock-chart-area" }) : null,
      rows.map(function (row, index) {
        const up = Number(row.close) >= Number(row.open);
        const itemX = x(index);
        const openY = y(row.open);
        const closeY = y(row.close);
        const topY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.6, Math.abs(closeY - openY));
        return h(
          "g",
          { key: row.date || index, className: up ? "stock-candle up" : "stock-candle down" },
          h("line", { x1: itemX, x2: itemX, y1: y(row.high), y2: y(row.low) }),
          h("rect", { x: itemX - candleWidth / 2, y: topY, width: candleWidth, height: bodyHeight, rx: 1 })
        );
      }),
      targetPoints.length ? h("polyline", { points: targetLine, className: "stock-chart-target-line" }) : null,
      targetPoints.map(function (point, index) {
        const rowDate = String((point.row && point.row.date) || "").slice(0, 10);
        const reports = ensureArray(targetReportMap[rowDate]);
        const title = reports.length
          ? reports.map(function (report) {
              const brokerName = report.broker_short_name || report.broker_name || "-";
              return [
                report.report_date || rowDate,
                brokerName,
                report.report_title || "",
                "목표가 " + numberFormat(report.target_price, 0),
              ].filter(Boolean).join(" · ");
            }).join("\n")
          : [
              rowDate,
              "평균 목표가 " + numberFormat(point.row.avg_target_price, 0),
            ].join(" · ");
        return h(
          "g",
          { key: "target-line-point-" + index, className: "stock-target-marker" },
          h("circle", { cx: point.x, cy: point.y, r: 2.2, className: "stock-target-marker-dot" }),
          h("circle", { cx: point.x, cy: point.y, r: 7.5, className: "stock-target-marker-hit" }),
          h("title", null, title)
        );
      }),
      h("polyline", { points: closeLine, className: "stock-chart-close-line" }),
      rows.map(function (row, index) {
        const marker = markerByDate[String(row.date || "").slice(0, 10)];
        if (!marker) {
          return null;
        }
        const itemX = x(index);
        const itemY = y(row.close);
        const markerType = String(marker.type || marker.marker_type || "entry");
        if (markerType !== "entry" && markerType !== "exit") {
          return null;
        }
        const markerLabel = marker.label || (markerType === "entry" ? "100점 상향 돌파" : "80점 하향 이탈");
        const title = [
          marker.date,
          markerLabel,
          marker.score != null ? "종합점수 " + numberFormat(marker.score, 2) : "",
          marker.price != null ? "가격 " + numberFormat(marker.price, 0) : "",
          marker.return_pct != null ? "수익률 " + formatPercent(marker.return_pct, 2) : "",
        ].filter(Boolean).join(" · ");
        return h(
          "g",
          { key: "entry-marker-" + row.date + "-" + markerType, className: "stock-entry-signal-marker stock-marker-" + markerType },
          h("circle", { cx: itemX, cy: itemY, r: markerType === "entry" ? 2.4 : 3.1 }),
          h("circle", { cx: itemX, cy: itemY, r: markerType === "entry" ? 4.4 : 5.3 }),
          h("title", null, title)
        );
      })
    );
  }

  function StockOverviewTradingChart(props) {
    const containerRef = useRef(null);
    const rows = ensureArray(props.rows);
    const markers = ensureArray(props.markers);
    const targetSeries = ensureArray(props.targetSeries);

    useEffect(function () {
      const container = containerRef.current;
      const lib = window.LightweightCharts;
      if (!container || !lib) {
        return undefined;
      }
      const candleRows = rows.map(function (row) {
        const time = String(row.date || row.time || "").slice(0, 10);
        const open = Number(row.open);
        const high = Number(row.high);
        const low = Number(row.low);
        const close = Number(row.close);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(time) || ![open, high, low, close].every(Number.isFinite)) {
          return null;
        }
        return { time: time, open: open, high: high, low: low, close: close, volume: Number(row.volume || row.trading_volume || 0) };
      }).filter(Boolean).sort(function (left, right) { return left.time.localeCompare(right.time); });
      if (!candleRows.length) {
        return undefined;
      }
      container.innerHTML = "";
      const chart = lib.createChart(container, {
        width: Math.max(container.clientWidth || 0, 320),
        height: Math.max(container.clientHeight || 0, 250),
        layout: {
          background: { color: "#f8fafc" },
          textColor: "#64748b",
          fontFamily: "\"Segoe UI\", \"Apple SD Gothic Neo\", sans-serif",
        },
        grid: { vertLines: { color: "#e7edf5" }, horzLines: { color: "#e7edf5" } },
        crosshair: { mode: lib.CrosshairMode ? lib.CrosshairMode.Normal : 0 },
        rightPriceScale: {
          visible: true,
          borderColor: "#d7dee8",
          scaleMargins: { top: 0.08, bottom: 0.25 },
        },
        timeScale: {
          borderColor: "#d7dee8",
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 2,
          barSpacing: 7,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: {
          locale: "ko-KR",
          priceFormatter: function (value) { return numberFormat(value, 0); },
        },
      });
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#ef4444",
        downColor: "#3b82f6",
        borderUpColor: "#ef4444",
        borderDownColor: "#3b82f6",
        wickUpColor: "#ef4444",
        wickDownColor: "#3b82f6",
        priceLineVisible: true,
        lastValueVisible: true,
      });
      candleSeries.setData(candleRows.map(function (row) {
        return { time: row.time, open: row.open, high: row.high, low: row.low, close: row.close };
      }));
      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: "volume" },
      });
      volumeSeries.setData(candleRows.map(function (row) {
        return {
          time: row.time,
          value: Number.isFinite(row.volume) ? row.volume : 0,
          color: row.close >= row.open ? "rgba(239, 68, 68, 0.42)" : "rgba(59, 130, 246, 0.42)",
        };
      }));
      chart.priceScale("volume").applyOptions({ visible: false, scaleMargins: { top: 0.8, bottom: 0 } });

      const validTargets = targetSeries.map(function (row) {
        const time = String(row.date || "").slice(0, 10);
        const value = Number(row.avg_target_price);
        return /^\d{4}-\d{2}-\d{2}$/.test(time) && Number.isFinite(value) ? { time: time, value: value } : null;
      }).filter(Boolean).sort(function (left, right) { return left.time.localeCompare(right.time); });
      if (validTargets.length) {
        const targetLine = chart.addLineSeries({
          color: "#16a34a",
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "평균 목표가",
        });
        targetLine.setData(validTargets);
      }

      const markerRows = markers.map(function (marker) {
        const time = String(marker.date || "").slice(0, 10);
        const type = String(marker.type || marker.marker_type || "entry");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(time) || (type !== "entry" && type !== "exit")) {
          return null;
        }
        return {
          time: time,
          position: type === "entry" ? "belowBar" : "aboveBar",
          color: type === "entry" ? "#16a34a" : "#dc2626",
          shape: type === "entry" ? "arrowUp" : "arrowDown",
          text: type === "entry" ? "진입" : "편출",
        };
      }).filter(Boolean).sort(function (left, right) { return left.time.localeCompare(right.time); });
      if (markerRows.length && typeof candleSeries.setMarkers === "function") {
        candleSeries.setMarkers(markerRows);
      }
      chart.timeScale().fitContent();

      const resize = function () {
        chart.applyOptions({
          width: Math.max(container.clientWidth || 0, 320),
          height: Math.max(container.clientHeight || 0, 250),
        });
      };
      let observer = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      }
      window.addEventListener("resize", resize);
      return function () {
        window.removeEventListener("resize", resize);
        if (observer) {
          observer.disconnect();
        }
        chart.remove();
      };
    }, [rows, markers, targetSeries]);

    return h("div", { className: "stock-overview-trading-chart", ref: containerRef });
  }

  function StockChartPreview(props) {
    const data = props.data || {};
    const summary = data.summary || {};
    const rows = ensureArray(data.rows);
    const positive = Number(summary.return_pct || 0) >= 0;
    return h(
      "div",
      {
        className: "stock-chart-preview",
        style: props.position ? { left: props.position.left + "px", top: props.position.top + "px" } : null,
      },
      h(
        "div",
        { className: "stock-chart-preview-head" },
        h("div", null,
          h("strong", null, data.stock_name || props.label || "종목"),
          h("span", null, data.stock_code ? data.stock_code : "3개월")
        ),
        h(
          "div",
          { className: positive ? "stock-chart-return up" : "stock-chart-return down" },
          formatPercent(summary.return_pct, 2)
        )
      ),
      props.loading
        ? h("div", { className: "stock-chart-loading" }, "3개월 차트 불러오는 중...")
        : props.error
          ? props.fallbackUrl
            ? h(
                "div",
                { className: "stock-chart-fallback" },
                h("iframe", {
                  title: (props.label || "종목") + " TradingView preview",
                  src: props.fallbackUrl,
                  loading: "lazy",
                }),
                h("div", { className: "stock-chart-fallback-note" }, "서버 차트 대신 TradingView 미리보기")
              )
            : h("div", { className: "stock-chart-error" }, props.error)
          : props.tradingView
            ? h(StockOverviewTradingChart, {
                rows: rows,
                markers: data.entry_markers,
                targetSeries: props.targetSeries,
                targetReports: props.targetReports,
              })
            : h(MiniCandlestickChart, {
                rows: rows,
                markers: data.entry_markers,
                targetSeries: props.targetSeries,
                targetReports: props.targetReports,
              }),
      !props.loading && !props.error
        ? h(
            "div",
            { className: "stock-chart-preview-foot" },
            h("span", null, (summary.start_date || "").slice(5) + " ~ " + (summary.end_date || "").slice(5)),
            h("span", null, "종가 " + numberFormat(summary.last_close, 0))
          )
        : null
    );
  }

  function latestTargetReportRows(targetHistory) {
    const latestDate = String((targetHistory && targetHistory.latest && targetHistory.latest.date) || "").slice(0, 10);
    if (!latestDate) {
      return [];
    }
    return ensureArray(targetHistory && targetHistory.recent_reports)
      .filter(function (row) {
        return String(row && row.report_date || "").slice(0, 10) === latestDate && Number.isFinite(Number(row && row.target_price));
      })
      .sort(function (left, right) {
        return Number(right.target_price || 0) - Number(left.target_price || 0);
      });
  }

  function TargetReportHoverBadge(props) {
    const reports = ensureArray(props.reports);
    const title = reports.map(function (report) {
      const brokerName = report.broker_short_name || report.broker_name || "-";
      const analystName = report.analyst_name || "";
      return [
        report.report_date || "",
        brokerName,
        analystName,
        report.report_title || "",
        "목표가 " + numberFormat(report.target_price, 0),
      ].filter(Boolean).join(" · ");
    }).join("\n");
    return h(
      "div",
      { className: "target-report-hover" },
      h("span", { className: props.className || "", title: title || props.label }, props.label),
      reports.length
        ? h(
            "div",
            { className: "target-report-hover-card" },
            h("div", { className: "target-report-hover-head" }, props.heading || "리포트 상세"),
            reports.map(function (report, index) {
              const brokerName = report.broker_short_name || report.broker_name || "-";
              const analystName = report.analyst_name || "";
              return h(
                "div",
                { key: (report.report_uid || report.report_date || "target-report") + "-" + index, className: "target-report-hover-row" },
                h("strong", null, brokerName),
                h("span", null, (analystName ? analystName + " · " : "") + "목표가 " + numberFormat(report.target_price, 0)),
                report.report_title ? h("span", { className: "target-report-hover-title" }, report.report_title) : null
              );
            })
          )
        : null
    );
  }

  function DividendHistoryDetail(props) {
    const history = props.history || {};
    const annualRows = ensureArray(history.annual_rows);
    const quarterlyRows = ensureArray(history.quarterly_rows);
    if (!annualRows.length && !quarterlyRows.length) {
      return null;
    }
    function renderDividendMetric(label, value, suffix, digits) {
      if (!Number.isFinite(Number(value))) {
        return label + " -";
      }
      return label + " " + numberFormat(value, digits || 0) + (suffix || "");
    }
    return h(
      "div",
      { className: "telegram-dividend-history" },
      annualRows.length
        ? h(
            "div",
            { className: "telegram-dividend-history-section" },
            h("div", { className: "telegram-dividend-history-title" }, "최근 2개년"),
            annualRows.map(function (row, index) {
              return h(
                "div",
                { key: (row.period_label || "annual") + "-" + index, className: "telegram-dividend-history-row" },
                h("strong", null, row.period_label || row.year || "-"),
                h("span", null, renderDividendMetric("배당", row.dps, "원", 0)),
                h("span", null, renderDividendMetric("수익률", row.dividend_yield, "%", 2)),
                h("span", null, renderDividendMetric("성향", row.payout_ratio, "%", 1))
              );
            })
          )
        : null,
      quarterlyRows.length
        ? h(
            "div",
            { className: "telegram-dividend-history-section" },
            h("div", { className: "telegram-dividend-history-title" }, "분기 배당"),
            quarterlyRows.map(function (row, index) {
              return h(
                "div",
                { key: (row.period_label || "quarter") + "-" + index, className: "telegram-dividend-history-row" },
                h("strong", null, row.period_label || "-"),
                h("span", null, renderDividendMetric("배당", row.dps, "원", 0)),
                h("span", null, renderDividendMetric("수익률", row.dividend_yield, "%", 2)),
                h("span", null, renderDividendMetric("성향", row.payout_ratio, "%", 1))
              );
            })
          )
        : null
    );
  }

  function formatCompactMarketCap100m(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return "-";
    }
    const jo = number / 10000;
    if (jo >= 1) {
      return numberFormat(jo, jo >= 100 ? 0 : 1) + "조원";
    }
    return numberFormat(number, 0) + "억원";
  }

  function TelegramStockOverviewPanel(props) {
    const payload = props.payload || null;
    const consensus = (props.consensus && props.consensus.latest) ? props.consensus.latest : null;
    const targetHistory = props.targetHistory || null;
    const targetLatest = targetHistory && targetHistory.latest ? targetHistory.latest : null;
    const dividendHistory = payload && payload.dividend_history ? payload.dividend_history : {};
    const [dividendOpen, setDividendOpen] = useState(false);
    const latestTargetReports = latestTargetReportRows(targetHistory);
    useEffect(function () {
      setDividendOpen(false);
    }, [payload && payload.stock_code]);
    if (props.loading) {
      return h("div", { className: "business-segment-panel telegram-stock-overview-panel muted" },
        h("div", { className: "business-segment-title" },
          h("strong", null, "주가 요약"),
          h("span", null, "최근 3개월 차트와 핵심 지표를 불러오는 중입니다.")
        ),
        h("div", { className: "business-segment-skeleton" })
      );
    }
    if (props.message) {
      return h("div", { className: "business-segment-panel telegram-stock-overview-panel muted" },
        h("div", { className: "business-segment-title" },
          h("strong", null, "주가 요약"),
          h("span", null, props.message)
        )
      );
    }
    if (!payload || !payload.chart) {
      return null;
    }
    const metricRows = [
      { key: "price", label: "현재가", value: numberFormat(payload.price, 0) },
      { key: "change_pct", label: "등락률", value: formatPercent(payload.change_pct, 2), className: Number(payload.change_pct || 0) >= 0 ? "metric-up" : "metric-down" },
      { key: "market_cap", label: "시가총액", value: formatCompactMarketCap100m(payload.market_cap_100m) },
      { key: "per", label: "PER", value: Number.isFinite(Number(payload.per)) ? numberFormat(payload.per, 2) : "-" },
      { key: "pbr", label: "PBR", value: Number.isFinite(Number(payload.pbr)) ? numberFormat(payload.pbr, 2) : "-" },
      { key: "forward_per", label: "Forward PER", value: Number.isFinite(Number((consensus && consensus.forward_per) || payload.forward_per)) ? numberFormat((consensus && consensus.forward_per) || payload.forward_per, 2) : "-" },
      { key: "forward_pbr", label: "Forward PBR", value: Number.isFinite(Number((consensus && consensus.forward_pbr) || payload.forward_pbr)) ? numberFormat((consensus && consensus.forward_pbr) || payload.forward_pbr, 2) : "-" },
      { key: "foreign", label: "외국인 비율", value: Number.isFinite(Number(payload.foreign_ownership_pct)) ? numberFormat(payload.foreign_ownership_pct, 2) + "%" : "-" },
      { key: "dividend_yield", label: "배당수익률", value: Number(payload.dividend_yield) > 0 ? numberFormat(payload.dividend_yield, 2) + "%" : "무배당" },
      { key: "payout_ratio", label: "배당성향", value: Number(payload.payout_ratio) > 0 ? numberFormat(payload.payout_ratio, 1) + "%" : "무배당" },
    ];
    const indexMembership = payload.index_membership || {};
    const includedIndices = ensureArray(indexMembership.included || []);
    const candidateIndices = ensureArray(indexMembership.candidates || []);
    const warningProjection = payload.warning_projection || {};
    const warningEstimates = ensureArray(warningProjection.estimates || []);
    const warningCalculation = warningProjection.calculation || {};
    const hasScheduledWarning = Boolean(warningProjection.scheduled_label);
    const currentWarningLevel = String(warningProjection.current_level || "").trim();
    const warningEstimateByKey = {};
    warningEstimates.forEach(function (item) {
      if (item && item.key) {
        warningEstimateByKey[String(item.key)] = item;
      }
    });
    const nextWarningKey = currentWarningLevel === "risk"
      ? ""
      : currentWarningLevel === "warning"
        ? "risk"
        : (currentWarningLevel === "warning_notice" || hasScheduledWarning)
          ? "warning"
          : "warning_notice";
    const nearestWarningEstimate = nextWarningKey ? warningEstimateByKey[nextWarningKey] : null;
    const visibleWarningEstimates = nearestWarningEstimate ? [nearestWarningEstimate] : [];
    function renderDetailPanel() {
      if (detailLoading) {
        return h("div", { className: "panel subscription-detail-panel" }, h(LoadingBlock, { compact: true, title: "상세 데이터 로딩 중", label: "청약 상세와 실거래가 분석을 불러오고 있습니다." }));
      }
      if (!selectedItem) {
        return h("div", { className: "panel subscription-detail-panel" }, h(EmptyState, { message: "왼쪽 목록에서 청약을 선택해 주세요." }));
      }
      if (detail && detail.error) {
        return h("div", { className: "panel subscription-detail-panel" }, h("div", { className: "notice-box error" }, detail.error));
      }

      var currentTrade = (detail && detail.current_trade) || {};
      var currentItem = (detail && detail.item) || selectedItem;
      var modelSummary = (detail && detail.model_summary) || {};
      var competition = (detail && detail.competition) || {};
      var specialRequestStatus = (detail && detail.special_request_status) || {};
      var winningScores = (detail && detail.winning_scores) || {};
      var complexInfo = (detail && detail.complex_info) || null;
      var complexHistory = ensureArray(detail && detail.complex_history);
      var complexAliases = ensureArray(detail && detail.complex_aliases);
      var specialEntries = specialBreakdownEntries(currentItem);
      var tradeRows = ensureArray(currentTrade.sample_trades);
      var competitionSummaryRows = ensureArray(competition.summary);
      var specialRequestRows = ensureArray(specialRequestStatus.rows);
      var scoreRows = ensureArray(winningScores.rows);

      return h(
        "div",
        { className: "subscription-detail-stack" },
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h("div", { className: "subscription-detail-head" },
            h("div", null,
              h("h2", null, currentItem.name || "-"),
              h("p", { className: "subscription-detail-subtitle" }, [currentItem.region, currentItem.district, currentItem.saleType, currentItem.announcementDate].filter(Boolean).join(" · "))
            ),
            currentItem.url ? h("a", { className: "secondary-button subscription-link-button", href: currentItem.url, target: "_blank", rel: "noreferrer" }, "청약홈 공고") : null
          ),
          h("div", { className: "subscription-detail-metrics" },
            h(SummaryCard, { label: "84㎡ 분양가", value: currentItem.private84PriceEok ? numberFormat(currentItem.private84PriceEok, 2) + "억" : "-" }),
            h(SummaryCard, { label: "추정 현재가", value: currentTrade.ok && currentTrade.latest_price_eok != null ? numberFormat(currentTrade.latest_price_eok, 2) + "억" : "-", help: currentTrade.ok ? (currentTrade.latest_trade_date || currentTrade.message || "") : (currentTrade.message || "매칭 실패") }),
            h(SummaryCard, { label: "예상 차익", value: currentTrade.ok && currentTrade.estimated_gain_eok != null ? numberFormat(currentTrade.estimated_gain_eok, 2) + "억" : "-", className: currentTrade.ok ? metricDeltaClass(currentTrade.estimated_gain_eok) : "" }),
            h(SummaryCard, { label: "차익률", value: currentTrade.ok && currentTrade.estimated_gain_pct != null ? numberFormat(currentTrade.estimated_gain_pct, 1) + "%" : "-" })
          ),
          h("div", { className: "subscription-detail-grid" },
            h("div", null, h("span", null, "접수"), h("strong", null, (currentItem.applicationStart || "-") + " ~ " + (currentItem.applicationEnd || "-"))),
            h("div", null, h("span", null, "총 세대수"), h("strong", null, numberFormat(currentItem.supplyHouseholds, 0) + "세대")),
            h("div", null, h("span", null, "특공 비중"), h("strong", null, numberFormat(modelSummary.special_ratio || currentItem.specialSupplyRatio, 1) + "%")),
            h("div", null, h("span", null, "입주 예정"), h("strong", null, currentItem.moveInMonth || "-")),
            h("div", null, h("span", null, "위치"), h("strong", null, currentItem.address || "-")),
            h("div", null, h("span", null, "상태"), h("strong", null, phaseLabel(currentItem)))
          ),
          currentTrade.ok ? h("div", { className: "subscription-inline-note subtle" }, (currentTrade.match_mode || "exact") + " 매칭 · 지역 평균 " + (currentTrade.district_average_price_eok != null ? numberFormat(currentTrade.district_average_price_eok, 2) + "억" : "-")) : null
        ),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h("div", { className: "section-toolbar compact" },
            h(SectionTitle, null, "특별공급 구성"),
            h("span", { className: "summary-help" }, currentItem.specialSupplyRatio ? "총 특별공급 " + numberFormat(currentItem.specialSupplyRatio, 1) + "%" : "")
          ),
          specialEntries.length
            ? h("div", { className: "subscription-special-grid" }, specialEntries.map(function (entry) {
                return h(
                  "div",
                  { key: entry.label, className: "subscription-special-card" },
                  h("strong", null, entry.label),
                  h("span", null, "전체 " + numberFormat(entry.ratioTotal, 1) + "%"),
                  h("span", null, "특공 내 " + numberFormat(entry.ratioSpecial, 1) + "%"),
                  h("em", null, numberFormat(entry.count, 0) + "세대")
                );
              }))
            : h(EmptyState, { compact: true, message: "특별공급 비중 데이터가 없습니다." })
        ),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h("div", { className: "section-toolbar compact" },
            h(SectionTitle, null, "생애최초 케이스 스터디"),
            h("span", { className: "summary-help" }, briefLoading ? "Gemini 분석 중" : "선택 즉시 자동 분석")
          ),
          currentTrade.ok
            ? h("div", { className: "subscription-case-grid" },
                h("div", { className: "subscription-case-card" }, h("span", null, "분양가"), h("strong", null, numberFormat(currentTrade.subscription_price_eok, 2) + "억")),
                h("div", { className: "subscription-case-card" }, h("span", null, "추정 현재가"), h("strong", { className: metricDeltaClass(currentTrade.estimated_gain_eok) }, numberFormat(currentTrade.latest_price_eok, 2) + "억")),
                h("div", { className: "subscription-case-card" }, h("span", null, "예상 차익"), h("strong", { className: metricDeltaClass(currentTrade.estimated_gain_eok) }, numberFormat(currentTrade.estimated_gain_eok, 2) + "억")),
                h("div", { className: "subscription-case-card" }, h("span", null, "실거래 샘플"), h("strong", null, numberFormat(currentTrade.matched_trade_count, 0) + "건")),
                h("div", { className: "subscription-case-card" }, h("span", null, "지역 평균 시세"), h("strong", { className: metricDeltaClass(currentTrade.district_average_gain_eok) }, currentTrade.district_average_price_eok != null ? numberFormat(currentTrade.district_average_price_eok, 2) + "억" : "-")),
                h("div", { className: "subscription-case-card" }, h("span", null, "지역 평균 차익"), h("strong", { className: metricDeltaClass(currentTrade.district_average_gain_eok) }, currentTrade.district_average_gain_eok != null ? numberFormat(currentTrade.district_average_gain_eok, 2) + "억" : "-")),
                h("div", { className: "subscription-case-card" }, h("span", null, "지역 평균 차익률"), h("strong", { className: metricDeltaClass(currentTrade.district_average_gain_eok) }, currentTrade.district_average_gain_pct != null ? numberFormat(currentTrade.district_average_gain_pct, 1) + "%" : "-")),
                h("div", { className: "subscription-case-card" }, h("span", null, "지역 거래건수"), h("strong", null, numberFormat(currentTrade.district_trade_count, 0) + "건"))
              )
            : h("div", { className: "notice-box compact" }, currentTrade.message || "현재 시세 추정값이 없습니다."),
          brief && brief.error ? h("div", { className: "notice-box compact" }, brief.error) : null,
          brief && brief.brief
            ? h("div", { className: "subscription-ai-brief" },
                h("p", { className: "subscription-ai-summary" }, brief.brief.summary || ""),
                ensureArray(brief.brief.strengths).length ? h("div", null, h("strong", null, "강점"), h("ul", null, ensureArray(brief.brief.strengths).map(function (item, index) { return h("li", { key: "s-" + index }, item); }))) : null,
                ensureArray(brief.brief.price_gap_view).length ? h("div", null, h("strong", null, "시세차익 포인트"), h("ul", null, ensureArray(brief.brief.price_gap_view).map(function (item, index) { return h("li", { key: "p-" + index }, item); }))) : null,
                ensureArray(brief.brief.life_first_view).length ? h("div", null, h("strong", null, "생애최초 관점"), h("ul", null, ensureArray(brief.brief.life_first_view).map(function (item, index) { return h("li", { key: "l-" + index }, item); }))) : null,
                ensureArray(brief.brief.risks).length ? h("div", null, h("strong", null, "리스크"), h("ul", null, ensureArray(brief.brief.risks).map(function (item, index) { return h("li", { key: "r-" + index }, item); }))) : null
              )
            : h("div", { className: "summary-help" }, "청약을 클릭하면 분양가, 최근 실거래, 경쟁률을 기준으로 Gemini가 특징을 바로 정리합니다.")
        ),
        h("section", { className: "panel subscription-detail-panel" }, h(SectionTitle, null, "주택형 상세"), h(DataTable, { rows: ensureArray(detail && detail.models), columns: modelColumns, compact: true, emptyMessage: "주택형 상세가 없습니다." })),
        h("section", { className: "panel subscription-detail-panel" }, h(SectionTitle, null, "경쟁률 요약"), competitionSummaryRows.length ? h(DataTable, { rows: competitionSummaryRows, columns: competitionSummaryColumns, compact: true, emptyMessage: "경쟁률 데이터가 없습니다." }) : h(EmptyState, { compact: true, message: "경쟁률 데이터가 아직 공개되지 않았습니다." })),
        h("section", { className: "panel subscription-detail-panel" }, h(SectionTitle, null, "특별공급 신청현황"), specialRequestRows.length ? h(DataTable, { rows: specialRequestRows, columns: specialRequestColumns, compact: true, emptyMessage: "특별공급 신청현황이 없습니다." }) : h(EmptyState, { compact: true, message: "특별공급 신청현황 데이터가 없습니다." })),
        h("section", { className: "panel subscription-detail-panel" }, h(SectionTitle, null, "당첨 가점"), scoreRows.length ? h(DataTable, { rows: scoreRows, columns: scoreColumns, compact: true, emptyMessage: "당첨 가점 데이터가 없습니다." }) : h(EmptyState, { compact: true, message: "당첨 가점 데이터가 아직 공개되지 않았습니다." })),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h(SectionTitle, null, "단지 식별정보"),
          complexInfo
            ? h("div", { className: "subscription-detail-grid" },
                h("div", null, h("span", null, "단지 PK"), h("strong", null, complexInfo.complexPk || "-")),
                h("div", null, h("span", null, "공시가격명"), h("strong", null, complexInfo.namePrice || "-")),
                h("div", null, h("span", null, "건축물대장명"), h("strong", null, complexInfo.nameLedger || "-")),
                h("div", null, h("span", null, "도로명주소명"), h("strong", null, complexInfo.nameRoad || "-")),
                h("div", null, h("span", null, "동 수"), h("strong", null, complexInfo.dongCount != null ? numberFormat(complexInfo.dongCount, 0) : "-")),
                h("div", null, h("span", null, "세대수"), h("strong", null, complexInfo.unitCount != null ? numberFormat(complexInfo.unitCount, 0) : "-")),
                h("div", null, h("span", null, "사용승인일"), h("strong", null, complexInfo.useApprovalDate || "-"))
              )
            : h("div", { className: "notice-box compact" }, "실거래가 매칭용 단지 식별정보를 찾지 못했습니다."),
          complexAliases.length ? h("div", { className: "subscription-inline-note subtle" }, "매칭에 사용한 단지명: " + complexAliases.join(", ")) : null,
          complexHistory.length ? h(DataTable, { rows: complexHistory, columns: complexHistoryColumns, compact: true, emptyMessage: "단지명 이력이 없습니다." }) : null
        ),
        h("section", { className: "panel subscription-detail-panel" }, h(SectionTitle, null, "최근 실거래 샘플"), h(DataTable, { rows: tradeRows, columns: tradeColumns, compact: true, emptyMessage: "실거래 샘플이 없습니다." }))
      );
    }

    return h(
      "div",
      { className: "business-segment-panel telegram-stock-overview-panel" },
      h(
        "div",
        { className: "business-segment-title" },
        h("strong", null, "주가 요약"),
        h("span", null, [payload.stock_name, payload.stock_code, payload.market].filter(Boolean).join(" · "))
      ),
      h(
        "div",
        { className: "telegram-stock-overview-grid" },
        h(
          "div",
          { className: "telegram-stock-overview-chart" },
          targetLatest
            ? h(
                "div",
                { className: "telegram-stock-overview-target-meta" },
                Number.isFinite(Number(targetHistory && targetHistory.report_count))
                  ? h("span", { className: "telegram-stock-overview-target-pill" }, "리포트 " + numberFormat(targetHistory.report_count, 0) + "건")
                  : null,
                Number.isFinite(Number(targetLatest.gap_pct))
                  ? h("span", { className: "telegram-stock-overview-target-pill" }, "괴리율 " + formatPercent(targetLatest.gap_pct, 1))
                  : null,
                Number.isFinite(Number(targetLatest.avg_target_price))
                  ? h(TargetReportHoverBadge, {
                      className: "telegram-stock-overview-target-pill subtle",
                      label: "평균 목표가 " + numberFormat(targetLatest.avg_target_price, 0),
                      heading: (targetLatest.date || "최근") + " 리포트 상세",
                      reports: latestTargetReports,
                    })
                  : null
              )
            : null,
          h(StockChartPreview, {
            label: payload.stock_name || "종목",
            loading: false,
            error: "",
            data: payload.chart,
            tradingView: true,
            targetSeries: targetHistory ? targetHistory.series : null,
            targetReports: targetHistory ? targetHistory.recent_reports : null,
          })
        ),
        h(
          "div",
          { className: "telegram-stock-overview-table" },
          metricRows.reduce(function (nodes, row) {
            const isForwardMetric = row.key === "forward_per" || row.key === "forward_pbr";
            const isDividendMetric = row.key === "dividend_yield" && (ensureArray(dividendHistory.annual_rows).length || ensureArray(dividendHistory.quarterly_rows).length);
            const rowClickable = (isForwardMetric && typeof props.onOpenForwardConsensus === "function") || isDividendMetric;
            nodes.push(h(
              "div",
              {
                key: row.key,
                className: "telegram-stock-overview-row" + (rowClickable ? " clickable" : ""),
                onClick: rowClickable ? function () {
                  if (isDividendMetric) {
                    setDividendOpen(function (current) { return !current; });
                    return;
                  }
                  props.onOpenForwardConsensus();
                } : null,
                role: rowClickable ? "button" : null,
                tabIndex: rowClickable ? 0 : null,
                onKeyDown: rowClickable ? function (event) {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (isDividendMetric) {
                      setDividendOpen(function (current) { return !current; });
                      return;
                    }
                    props.onOpenForwardConsensus();
                  }
                } : null,
              },
              h("div", { className: "telegram-stock-overview-key" }, row.label),
              h("div", { className: "telegram-stock-overview-value" + (row.className ? " " + row.className : "") }, row.value + (isDividendMetric ? (dividendOpen ? "  ▲" : "  ▼") : ""))
            ));
            if (isDividendMetric && dividendOpen) {
              nodes.push(
                h(
                  "div",
                  { key: row.key + "-detail", className: "telegram-stock-overview-row-detail" },
                  h(DividendHistoryDetail, { history: dividendHistory })
                )
              );
            }
            return nodes;
          }, []),
          h(
            "div",
            { className: "telegram-stock-overview-subsection" },
            h("div", { className: "telegram-stock-overview-subtitle" }, "편입 지수"),
            includedIndices.length
              ? h(
                  "div",
                  { className: "telegram-stock-overview-chip-list" },
                  includedIndices.map(function (item) {
                    return h("span", { key: item.key || item.label, className: "telegram-stock-overview-chip active" }, item.label || "-");
                  })
                )
              : h("div", { className: "telegram-stock-overview-empty" }, "현재 확인된 대표 지수 편입 없음")
          ),
          h(
            "div",
            { className: "telegram-stock-overview-subsection" },
            h("div", { className: "telegram-stock-overview-subtitle" }, "편입 가능성"),
            candidateIndices.length
              ? h(
                  "div",
                  { className: "telegram-stock-overview-mini-list" },
                  candidateIndices.slice(0, 3).map(function (item) {
                    return h(
                      "div",
                      { key: item.key || item.label, className: "telegram-stock-overview-mini-row" },
                      h("span", { className: "telegram-stock-overview-mini-label" }, item.label || "-"),
                      h(
                        "span",
                        { className: "telegram-stock-overview-mini-value" },
                        item.rise_needed_pct == null
                          ? "-"
                          : item.rise_needed_pct <= 0
                            ? "시총 기준 충족"
                            : "+" + numberFormat(item.rise_needed_pct, 1) + "%"
                      )
                    );
                  })
                )
              : h("div", { className: "telegram-stock-overview-empty" }, "추정 가능한 편입 후보 지수 없음"),
            indexMembership.note ? h("div", { className: "telegram-stock-overview-note" }, indexMembership.note) : null
          ),
            h(
              "div",
              { className: "telegram-stock-overview-subsection" },
              h("div", { className: "telegram-stock-overview-subtitle" }, "시장경고 추정"),
              warningProjection.scheduled_label
                ? h(
                    "div",
                    { className: "telegram-stock-overview-current-warning scheduled" },
                    warningProjection.scheduled_label
                  )
                : null,
              (warningProjection.current_label || ensureArray(warningProjection.current_items || []).length)
                ? h(
                    "div",
                    { className: "telegram-stock-overview-current-warning" },
                    warningProjection.current_label || ensureArray(warningProjection.current_items || []).join(", ")
                )
              : h("div", { className: "telegram-stock-overview-empty" }, "현재 확인된 투자경고/위험 지정 없음"),
            Number.isFinite(Number(warningCalculation.current_price))
              ? h(
                  "div",
                  { className: "telegram-stock-warning-current" },
                  "현재가 " + numberFormat(warningCalculation.current_price, 0)
                    + " · 최근 15일 최고가 " + (Number.isFinite(Number(warningCalculation.recent_15_high)) ? numberFormat(warningCalculation.recent_15_high, 0) : "-")
                    + " · 최고가 요건 " + (warningCalculation.is_recent_15_high ? "충족" : "미충족")
                )
              : null,
            visibleWarningEstimates.length
              ? h(
                  "div",
                  { className: "telegram-stock-warning-list" },
                  visibleWarningEstimates.map(function (item) {
                    const paths = ensureArray(item && item.paths)
                      .slice()
                      .sort(function (left, right) {
                        const leftValue = Number(left && left.remaining_pct);
                        const rightValue = Number(right && right.remaining_pct);
                        if (!Number.isFinite(leftValue)) {
                          return 1;
                        }
                        if (!Number.isFinite(rightValue)) {
                          return -1;
                        }
                        return leftValue - rightValue;
                      })
                      .slice(0, 1);
                    const unavailable = item && item.eligible === false;
                    return h(
                      "div",
                      { key: item.key || item.label, className: "telegram-stock-warning-item" },
                      h(
                        "div",
                        { className: "telegram-stock-warning-head" },
                        h("strong", null, item.label || "-"),
                        h(
                          "span",
                          { className: "telegram-stock-overview-mini-value" + (item.triggered && !unavailable ? " danger" : "") },
                          unavailable
                            ? "선행단계 미충족"
                            : item.triggered
                              ? "가격요건 충족"
                              : item.remaining_pct == null
                                ? "-"
                                : "가까운 경로 +" + numberFormat(item.remaining_pct, 1) + "%"
                        )
                      ),
                      h("div", { className: "telegram-stock-warning-basis" }, item.basis || ""),
                      paths.map(function (path) {
                        const pathValue = path.remaining_pct == null
                          ? "가격 데이터 부족"
                          : path.price_triggered
                            ? "가격요건 충족"
                            : "+" + numberFormat(path.remaining_pct, 1) + "% 필요";
                        return h(
                          "div",
                          { key: (item.key || "warning") + "-" + (path.key || path.label), className: "telegram-stock-warning-path" },
                          h("span", null, (path.label || "가격경로") + " · " + numberFormat(path.anchor_days, 0) + "일 전 대비 +" + numberFormat(path.required_rise_pct, 0) + "%"),
                          h("strong", { className: path.price_triggered ? "danger" : "" }, pathValue),
                          h(
                            "small",
                            null,
                            "기준 " + (Number.isFinite(Number(path.anchor_price)) ? numberFormat(path.anchor_price, 0) : "-")
                              + " → 목표 " + (Number.isFinite(Number(path.target_price)) ? numberFormat(path.target_price, 0) : "-")
                              + " · 현재 상승률 " + (Number.isFinite(Number(path.current_rise_pct)) ? formatPercent(path.current_rise_pct, 1) : "-")
                          )
                        );
                      }),
                      null
                    );
                  })
                )
              : null,
            warningProjection.note ? h("div", { className: "telegram-stock-overview-note" }, warningProjection.note) : null
          )
        )
      )
    );
  }

  function StockNewsBriefPanel(props) {
    const payload = props.payload || null;
    const brief = (payload && payload.brief) || {};
    const articles = ensureArray(payload && payload.key_articles);
    const panelTitle = props.title || "최근 뉴스 요약";
    const panelDescription = props.description || "중복 기사를 정리하고 핵심 이슈를 요약합니다.";
    const positiveLabel = props.positiveLabel || "긍정 요인";
    const riskLabel = props.riskLabel || "주의 요인";
    const eventsLabel = props.eventsLabel || "예정 일정";
    if (!props.loading && !props.message && !payload) {
      return null;
    }
    const sentiment = String(brief.sentiment || "neutral").toLowerCase();
    const sentimentLabels = {
      positive: "긍정",
      neutral: "중립",
      negative: "부정",
      mixed: "혼조",
    };
    return h(
      "section",
      { className: "stock-news-brief-panel" },
      h(
        "div",
        { className: "stock-news-brief-head" },
        h(
          "div",
          null,
          h("strong", null, panelTitle),
          payload
            ? h("span", null, "최근 " + numberFormat(payload.days || 7, 0) + "일 · 중요 기사 " + numberFormat(articles.length, 0) + "건")
            : h("span", null, panelDescription)
        ),
        h(
          "div",
          { className: "stock-news-brief-actions" },
          payload && brief.sentiment
            ? h("span", { className: "stock-news-sentiment " + sentiment }, sentimentLabels[sentiment] || "중립")
            : null,
          typeof props.onRefresh === "function"
            ? h("button", {
                type: "button",
                className: "mini-button",
                onClick: props.onRefresh,
                disabled: !!props.loading,
              }, props.loading ? "요약 중..." : "새로고침")
            : null
        )
      ),
      props.loading && !payload
        ? h(LoadingBlock, { compact: true, title: "최근 뉴스 정리 중", label: "중복 기사를 제거하고 중요 이슈를 요약하고 있습니다." })
        : props.message && !payload
          ? h("div", { className: "notice-box compact" }, props.message)
          : payload && !articles.length
            ? h("div", { className: "summary-help" }, "최근 기간에 중요 뉴스로 분류된 기사가 없습니다.")
            : h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "stock-news-brief-summary" },
                  brief.headline ? h("h3", null, brief.headline) : null,
                  brief.summary ? h("p", null, brief.summary) : null
                ),
                h(
                  "div",
                  { className: "stock-news-brief-body" },
                  h(
                    "div",
                    { className: "stock-news-factor-grid" },
                    ensureArray(brief.positive_factors).length
                      ? h("div", { className: "stock-news-factor positive" },
                          h("strong", null, positiveLabel),
                          h("ul", null, ensureArray(brief.positive_factors).map(function (item, index) {
                            return h("li", { key: "news-positive-" + index }, item);
                          }))
                        )
                      : null,
                    ensureArray(brief.risk_factors).length
                      ? h("div", { className: "stock-news-factor negative" },
                          h("strong", null, riskLabel),
                          h("ul", null, ensureArray(brief.risk_factors).map(function (item, index) {
                            return h("li", { key: "news-risk-" + index }, item);
                          }))
                        )
                      : null,
                    ensureArray(brief.upcoming_events).length
                      ? h("div", { className: "stock-news-factor event" },
                          h("strong", null, eventsLabel),
                          h("ul", null, ensureArray(brief.upcoming_events).map(function (item, index) {
                            return h("li", { key: "news-event-" + index }, item);
                          }))
                        )
                      : null
                  ),
                  h(
                    "div",
                    { className: "stock-news-key-list" },
                    articles.map(function (item) {
                      return h(
                        "button",
                        {
                          key: item.article_id || item.url || item.title,
                          type: "button",
                          className: "stock-news-key-item",
                          onClick: function () { openUrlInDefaultBrowser(item.url); },
                          disabled: !item.url,
                          title: item.importance_reason || item.title || "",
                        },
                        h("span", { className: "stock-news-key-meta" }, [item.published_date, item.source].filter(Boolean).join(" · ")),
                        h("strong", null, item.title || "-"),
                        item.summary ? h("span", { className: "stock-news-key-summary" }, item.summary) : null
                      );
                    })
                  )
                ),
                props.message ? h("div", { className: "summary-help stock-news-brief-warning" }, props.message) : null
              )
    );
  }

  function WiseConsensusPerChart(props) {
    const rows = ensureArray(props.rows).filter(function (row) {
      return Number.isFinite(Number(row.trailing_per)) || Number.isFinite(Number(row.forward_per));
    });
    if (!rows.length) {
      return h("div", { className: "stock-chart-empty" }, "컨센서스 이력 없음");
    }
    const width = 560;
    const height = 180;
    const pad = { top: 12, right: 44, bottom: 24, left: 10 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const values = [];
    rows.forEach(function (row) {
      if (Number.isFinite(Number(row.trailing_per))) {
        values.push(Number(row.trailing_per));
      }
      if (Number.isFinite(Number(row.forward_per))) {
        values.push(Number(row.forward_per));
      }
    });
    if (!values.length) {
      return h("div", { className: "stock-chart-empty" }, "컨센서스 이력 없음");
    }
    let minValue = Math.min.apply(null, values);
    let maxValue = Math.max.apply(null, values);
    if (minValue === maxValue) {
      minValue *= 0.96;
      maxValue *= 1.04;
    }
    const range = maxValue - minValue;
    function x(index) {
      return pad.left + (rows.length <= 1 ? chartWidth / 2 : (chartWidth * index) / (rows.length - 1));
    }
    function y(value) {
      return pad.top + ((maxValue - Number(value)) / range) * chartHeight;
    }
    function buildLine(key) {
      return rows
        .map(function (row, index) {
          const value = Number(row[key]);
          if (!Number.isFinite(value)) {
            return null;
          }
          return { x: x(index), y: y(value) };
        })
        .filter(Boolean);
    }
    function toPolyline(points) {
      return points.map(function (point) { return point.x.toFixed(1) + "," + point.y.toFixed(1); }).join(" ");
    }
    const trailingPoints = buildLine("trailing_per");
    const forwardPoints = buildLine("forward_per");
    const gridValues = [maxValue, minValue + range * 0.5, minValue];
    const labelIndexes = Array.from(new Set([0, Math.max(0, Math.floor((rows.length - 1) / 2)), rows.length - 1]));
    return h(
      "svg",
      { className: "wise-target-history-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
      gridValues.map(function (value, index) {
        const lineY = y(value);
        return h(
          React.Fragment,
          { key: "per-grid-" + index },
          h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "stock-chart-grid" }),
          h("text", { x: width - 4, y: lineY + 4, className: "stock-chart-axis", textAnchor: "end" }, numberFormat(value, 1))
        );
      }),
      labelIndexes.map(function (index) {
        const row = rows[index];
        const lineX = x(index);
        return h(
          React.Fragment,
          { key: "per-label-" + index },
          h("line", { x1: lineX, x2: lineX, y1: pad.top, y2: height - pad.bottom, className: "stock-chart-grid vertical" }),
          h("text", { x: lineX, y: height - 6, className: "stock-chart-axis", textAnchor: "middle" }, String(row.captured_date || "").slice(5))
        );
      }),
      trailingPoints.length ? h("polyline", { points: toPolyline(trailingPoints), className: "wise-target-line close" }) : null,
      forwardPoints.length ? h("polyline", { points: toPolyline(forwardPoints), className: "wise-target-line target" }) : null
    );
  }

  function WiseReportConsensusPanel(props) {
    const payload = props.payload || null;
    if (props.loading) {
      return h("div", { className: "business-segment-panel wise-target-panel muted" },
        h("div", { className: "business-segment-title" },
          h("strong", null, "WiseReport 추정실적 컨센서스"),
          h("span", null, "연간 컨센서스 스냅샷을 불러오는 중입니다.")
        ),
        h("div", { className: "business-segment-skeleton" })
      );
    }
    if (props.message) {
      return h("div", { className: "business-segment-panel wise-target-panel muted" },
        h("div", { className: "business-segment-title" },
          h("strong", null, "WiseReport 추정실적 컨센서스"),
          h("span", null, props.message)
        )
      );
    }
    if (!payload) {
      return null;
    }
    const latest = payload.latest || null;
    const valuationHistory = ensureArray(payload.valuation_history);
    const latestAnnualRows = ensureArray(payload.latest_annual_rows);
    const estimateHistory = ensureArray(payload.estimate_history).slice(-10).reverse();
    if (!latest && !latestAnnualRows.length) {
      return null;
    }
    const summaryPills = [
      { label: "Trailing PER", value: latest && Number.isFinite(Number(latest.trailing_per)) ? numberFormat(latest.trailing_per, 2) : "-" },
      { label: "Forward PER", value: latest && Number.isFinite(Number(latest.forward_per)) ? numberFormat(latest.forward_per, 2) : "-" },
      { label: "Trailing PBR", value: latest && Number.isFinite(Number(latest.trailing_pbr)) ? numberFormat(latest.trailing_pbr, 2) : "-" },
      { label: "Forward PBR", value: latest && Number.isFinite(Number(latest.forward_pbr)) ? numberFormat(latest.forward_pbr, 2) : "-" },
    ];
    return h(
      "div",
      { className: "business-segment-panel wise-target-panel" },
      h(
        "div",
        { className: "business-segment-title" },
        h("strong", null, "WiseReport 추정실적 컨센서스"),
        h("span", null, [
          payload.stock_name || "",
          latest && latest.estimate_period_label ? "기준 " + latest.estimate_period_label : "",
          payload.fetched_at ? "저장 " + String(payload.fetched_at).slice(0, 10) : "",
        ].filter(Boolean).join(" · "))
      ),
      h(
        "div",
        { className: "wise-target-summary-row" },
        summaryPills.map(function (item) {
          return h("span", { key: item.label, className: "wise-target-summary-pill" }, item.label + " " + item.value);
        })
      ),
      h(
        "div",
        { className: "wise-target-grid" },
        h(
          "div",
          { className: "wise-target-chart-wrap" },
          h("div", { className: "wise-target-mini-head" },
            h("strong", null, "PER 추이"),
            h("span", null, "회색: trailing · 파랑: forward")
          ),
          h(WiseConsensusPerChart, { rows: valuationHistory })
        ),
        h(
          "div",
          { className: "wise-consensus-latest-table" },
          latestAnnualRows.map(function (row, index) {
            return h(
              "div",
              { key: (row.period_label || "") + index, className: "wise-consensus-row" },
              h("strong", null, row.period_label || "-"),
              h("span", null, "매출 " + (Number.isFinite(Number(row.sales_100m)) ? numberFormat(row.sales_100m, 0) : "-") + "억"),
              h("span", null, "영업익 " + (Number.isFinite(Number(row.operating_profit_100m)) ? numberFormat(row.operating_profit_100m, 0) : "-") + "억"),
              h("span", null, "EPS " + (Number.isFinite(Number(row.eps)) ? numberFormat(row.eps, 0) : "-")),
              h("span", null, "PER " + (Number.isFinite(Number(row.per)) ? numberFormat(row.per, 2) : "-")),
              h("span", null, "PBR " + (Number.isFinite(Number(row.pbr)) ? numberFormat(row.pbr, 2) : "-"))
            );
          })
        )
      ),
      estimateHistory.length
        ? h(
            "div",
            { className: "wise-consensus-history-box" },
            h("div", { className: "wise-target-mini-head" },
              h("strong", null, "최근 저장 이력"),
              h("span", null, "가장 최근 10개 스냅샷")
            ),
            h(
              "div",
              { className: "wise-consensus-history-table" },
              estimateHistory.map(function (row, index) {
                return h(
                  "div",
                  { key: String(row.captured_date || "") + "-" + index, className: "wise-consensus-history-row" },
                  h("span", null, row.captured_date || "-"),
                  h("span", null, row.period_label || "-"),
                  h("span", null, "EPS " + (Number.isFinite(Number(row.eps)) ? numberFormat(row.eps, 0) : "-")),
                  h("span", null, "영업익 " + (Number.isFinite(Number(row.operating_profit_100m)) ? numberFormat(row.operating_profit_100m, 0) : "-") + "억"),
                  h("span", null, "PER " + (Number.isFinite(Number(row.per)) ? numberFormat(row.per, 2) : "-")),
                  h("span", null, "PBR " + (Number.isFinite(Number(row.pbr)) ? numberFormat(row.pbr, 2) : "-"))
                );
              })
            )
          )
        : null
    );
  }

  function WiseReportTargetHistoryChart(props) {
    const rows = ensureArray(props.rows).filter(function (row) {
      return Number.isFinite(Number(row.avg_target_price)) || Number.isFinite(Number(row.close_price));
    });
    const reportRows = ensureArray(props.reportRows).filter(function (row) {
      return row && row.report_date && Number.isFinite(Number(row.target_price));
    });
    if (!rows.length) {
      return h("div", { className: "stock-chart-empty" }, "목표가 데이터 없음");
    }
    const width = 520;
    const height = 138;
    const pad = { top: 10, right: 44, bottom: 22, left: 10 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const values = [];
    rows.forEach(function (row) {
      if (Number.isFinite(Number(row.avg_target_price))) {
        values.push(Number(row.avg_target_price));
      }
      if (Number.isFinite(Number(row.close_price))) {
        values.push(Number(row.close_price));
      }
    });
    if (!values.length) {
      return h("div", { className: "stock-chart-empty" }, "목표가 데이터 없음");
    }
    let minValue = Math.min.apply(null, values);
    let maxValue = Math.max.apply(null, values);
    if (minValue === maxValue) {
      minValue *= 0.96;
      maxValue *= 1.04;
    }
    const range = maxValue - minValue;
    function x(index) {
      return pad.left + (rows.length <= 1 ? chartWidth / 2 : (chartWidth * index) / (rows.length - 1));
    }
    function y(value) {
      return pad.top + ((maxValue - Number(value)) / range) * chartHeight;
    }
    function buildLine(key) {
      return rows
        .map(function (row, index) {
          if (!Number.isFinite(Number(row[key]))) {
            return null;
          }
          return {
            x: x(index),
            y: y(Number(row[key])),
            row: row,
          };
        })
        .filter(Boolean);
    }
    const targetPoints = buildLine("avg_target_price");
    const closePoints = buildLine("close_price");
    function toPolyline(points) {
      return points.map(function (point) {
        return point.x.toFixed(1) + "," + point.y.toFixed(1);
      }).join(" ");
    }
    const gridValues = [maxValue, minValue + range * 0.5, minValue];
    const labelIndexes = Array.from(new Set([0, Math.max(0, Math.floor((rows.length - 1) / 2)), rows.length - 1]));
    const reportPoints = reportRows.map(function (row) {
      const rowDate = String(row.report_date || "").slice(0, 10);
      const rowIndex = rows.findIndex(function (item) {
        return String(item.date || "").slice(0, 10) === rowDate;
      });
      if (rowIndex < 0) {
        return null;
      }
      return {
        x: x(rowIndex),
        y: y(Number(row.target_price)),
        row: row,
      };
    }).filter(Boolean);
    return h(
      "svg",
      { className: "wise-target-history-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
      gridValues.map(function (value, index) {
        const lineY = y(value);
        return h(
          React.Fragment,
          { key: "grid-" + index },
          h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "stock-chart-grid" }),
          h("text", { x: width - 4, y: lineY + 4, className: "stock-chart-axis", textAnchor: "end" }, numberFormat(value, 0))
        );
      }),
      labelIndexes.map(function (index) {
        const row = rows[index];
        const lineX = x(index);
        return h(
          React.Fragment,
          { key: "label-" + index },
          h("line", { x1: lineX, x2: lineX, y1: pad.top, y2: height - pad.bottom, className: "stock-chart-grid vertical" }),
          h("text", { x: lineX, y: height - 6, className: "stock-chart-axis", textAnchor: "middle" }, String(row.date || "").slice(5))
        );
      }),
      closePoints.length ? h("polyline", { points: toPolyline(closePoints), className: "wise-target-line close" }) : null,
      targetPoints.length ? h("polyline", { points: toPolyline(targetPoints), className: "wise-target-line target" }) : null,
      reportPoints.map(function (point, index) {
        const row = point.row || {};
        const brokerName = row.broker_short_name || row.broker_name || "-";
        const title = [
          row.report_date || "",
          brokerName,
          row.report_title || "",
          "목표가 " + numberFormat(row.target_price, 0),
          row.recommendation || row.price_action_label || "",
        ].filter(Boolean).join(" · ");
        return h(
          "g",
          { key: "target-report-point-" + index, className: "wise-target-point" },
          h("circle", { cx: point.x, cy: point.y, r: 2.8, className: "wise-target-point-dot" }),
          h("circle", { cx: point.x, cy: point.y, r: 10, className: "wise-target-point-hit" }),
          h("title", null, title)
        );
      })
    );
  }

  function WiseReportRevisionChart(props) {
    const rows = ensureArray(props.rows).filter(function (row) {
      return Number.isFinite(Number(row.target_price)) && row.report_date;
    });
    if (!rows.length) {
      return h("div", { className: "stock-chart-empty" }, "리포트별 목표가 데이터 없음");
    }
    const sortedRows = rows.slice().sort(function (a, b) {
      return String(a.report_date || "").localeCompare(String(b.report_date || ""));
    });
    const width = 560;
    const height = 190;
    const pad = { top: 12, right: 50, bottom: 28, left: 10 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const targetValues = sortedRows.map(function (row) { return Number(row.target_price); });
    const closeValues = sortedRows
      .map(function (row) { return Number(row.close_price); })
      .filter(Number.isFinite);
    const values = targetValues.concat(closeValues);
    let minValue = Math.min.apply(null, values);
    let maxValue = Math.max.apply(null, values);
    if (minValue === maxValue) {
      minValue *= 0.96;
      maxValue *= 1.04;
    }
    const range = maxValue - minValue;
    function x(index) {
      return pad.left + (sortedRows.length <= 1 ? chartWidth / 2 : (chartWidth * index) / (sortedRows.length - 1));
    }
    function y(value) {
      return pad.top + ((maxValue - Number(value)) / range) * chartHeight;
    }
    const targetPoints = sortedRows.map(function (row, index) {
      return { x: x(index), y: y(row.target_price), row: row };
    });
    const closePoints = sortedRows
      .map(function (row, index) {
        const closePrice = Number(row.close_price);
        if (!Number.isFinite(closePrice)) {
          return null;
        }
        return { x: x(index), y: y(closePrice), row: row };
      })
      .filter(Boolean);
    function toPolyline(points) {
      return points.map(function (point) {
        return point.x.toFixed(1) + "," + point.y.toFixed(1);
      }).join(" ");
    }
    const gridValues = [maxValue, minValue + range * 0.5, minValue];
    const labelIndexes = Array.from(new Set([0, Math.max(0, Math.floor((sortedRows.length - 1) / 2)), sortedRows.length - 1]));
    return h(
      "svg",
      { className: "wise-target-history-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
      gridValues.map(function (value, index) {
        const lineY = y(value);
        return h(
          React.Fragment,
          { key: "revision-grid-" + index },
          h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "stock-chart-grid" }),
          h("text", { x: width - 4, y: lineY + 4, className: "stock-chart-axis", textAnchor: "end" }, numberFormat(value, 0))
        );
      }),
      labelIndexes.map(function (index) {
        const row = sortedRows[index];
        const lineX = x(index);
        return h(
          React.Fragment,
          { key: "revision-label-" + index },
          h("line", { x1: lineX, x2: lineX, y1: pad.top, y2: height - pad.bottom, className: "stock-chart-grid vertical" }),
          h("text", { x: lineX, y: height - 6, className: "stock-chart-axis", textAnchor: "middle" }, String(row.report_date || "").slice(5))
        );
      }),
      closePoints.length ? h("polyline", { points: toPolyline(closePoints), className: "wise-target-line close" }) : null,
      targetPoints.length ? h("polyline", { points: toPolyline(targetPoints), className: "wise-target-line target" }) : null,
      targetPoints.map(function (point, index) {
        const row = point.row || {};
        const brokerName = row.broker_short_name || row.broker_name || "-";
        const title = [
          row.report_date,
          brokerName,
          row.report_title || "",
          "목표가 " + numberFormat(row.target_price, 0),
          Number.isFinite(Number(row.close_price)) ? "주가 " + numberFormat(row.close_price, 0) : "",
          row.price_action_label || "",
        ].filter(Boolean).join(" · ");
        return h(
          "g",
          { key: "revision-point-" + index, className: "wise-target-point" },
          h("circle", { cx: point.x, cy: point.y, r: 3.2, className: "wise-target-point-dot" }),
          h("title", null, title)
        );
      })
    );
  }

  function WiseReportTargetHistoryPanel(props) {
    const payload = props.payload || null;
    if (props.loading) {
      return h("div", { className: "business-segment-panel wise-target-panel muted" },
        h("div", { className: "business-segment-title" },
          h("strong", null, "WiseReport 목표가 추이"),
          h("span", null, "최근 리포트 목표가를 불러오는 중입니다.")
        ),
        h("div", { className: "business-segment-skeleton" })
      );
    }
    if (props.message) {
      return h("div", { className: "business-segment-panel wise-target-panel muted" },
        h("div", { className: "business-segment-title" },
          h("strong", null, "WiseReport 목표가 추이"),
          h("span", null, props.message)
        )
      );
    }
    if (!payload) {
      return null;
    }
    const series = ensureArray(payload.series);
    const revisionRows = ensureArray(payload.recent_reports).filter(function (row) {
      return Number.isFinite(Number(row.target_price));
    });
    const latest = payload.latest || null;
    if (!series.length && !revisionRows.length) {
      return null;
    }
    return h(
      "div",
      { className: "business-segment-panel wise-target-panel compact" },
      h(
        "div",
        { className: "business-segment-title" },
        h("strong", null, "WiseReport 목표가 추이"),
        h("span", null, [
          payload.stock_name || "",
          payload.report_count ? "리포트 " + numberFormat(payload.report_count, 0) + "건" : "",
          latest && Number.isFinite(Number(latest.gap_pct)) ? "괴리율 " + formatPercent(latest.gap_pct, 1) : "",
        ].filter(Boolean).join(" · "))
      ),
      h(
        "div",
        { className: "wise-target-summary-row" },
        h("span", { className: "wise-target-legend" }, h("i", { className: "target" }), "평균 목표가"),
        h("span", { className: "wise-target-legend" }, h("i", { className: "close" }), "주가"),
        h("span", { className: "wise-target-legend subtle" }, "점 hover: 증권사 리포트"),
        latest && Number.isFinite(Number(latest.avg_target_price))
          ? h("span", { className: "wise-target-summary-pill" }, "최근 평균 목표가 " + numberFormat(latest.avg_target_price, 0))
          : null
      ),
      h(
        "div",
        { className: "wise-target-grid compact" },
        h(
          "div",
          { className: "wise-target-chart-wrap compact" },
          h(WiseReportTargetHistoryChart, { rows: series, reportRows: revisionRows })
        )
      )
    );
  }

  function SectorMarketCapChart(props) {
    const data = props.data || {};
    const rows = ensureArray(data.rows);
    const summary = data.summary || {};
    const positive = Number(summary.return_pct || 0) >= 0;
    const labels = rows.map(function (row) { return row.date; });
    const marketCapValues = rows.map(function (row) { return Number(row.market_cap_100m); });
    const marketCapByDate = {};
    rows.forEach(function (row) {
      marketCapByDate[String(row.date || "").slice(0, 10)] = Number(row.market_cap_100m);
    });
    const entryMarkerPoints = ensureArray(data.entry_markers).map(function (marker) {
      const dateKey = String(marker.date || "").slice(0, 10);
      const value = marketCapByDate[dateKey];
      if (!Number.isFinite(value)) {
        return null;
      }
      return {
        x: dateKey,
        y: value,
        marker: marker,
      };
    }).filter(Boolean);
    const ma20Values = marketCapValues.map(function (_, index) {
      if (index < 19) {
        return null;
      }
      const windowValues = marketCapValues.slice(index - 19, index + 1).filter(function (value) {
        return Number.isFinite(value);
      });
      if (windowValues.length < 20) {
        return null;
      }
      return windowValues.reduce(function (sum, value) { return sum + value; }, 0) / windowValues.length;
    });
    const lastValue = marketCapValues.length ? marketCapValues[marketCapValues.length - 1] : null;
    const lastMa20 = ma20Values.length ? ma20Values[ma20Values.length - 1] : null;
    const ma20GapPct = Number.isFinite(lastValue) && Number.isFinite(lastMa20) && lastMa20
      ? ((lastValue / lastMa20) - 1) * 100
      : null;
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "20일 평균",
              data: marketCapValues,
              borderColor: positive ? "#dc2626" : "#2563eb",
              backgroundColor: positive ? "rgba(220, 38, 38, 0.10)" : "rgba(37, 99, 235, 0.10)",
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.18,
              fill: true,
            },
            {
              label: "20일 평균",
              data: ma20Values,
              borderColor: "#0f172a",
              backgroundColor: "transparent",
              borderWidth: 1.8,
              borderDash: [6, 4],
              pointRadius: 0,
              pointHoverRadius: 3,
              tension: 0.18,
              fill: false,
              spanGaps: false,
            },
            {
              type: "scatter",
              label: "섹터 진입 신호",
              data: entryMarkerPoints,
              parsing: false,
              borderColor: "#16a34a",
              backgroundColor: "#16a34a",
              pointRadius: 3,
              pointHoverRadius: 5,
              pointStyle: "circle",
              showLine: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: { color: "#475569", maxTicksLimit: 8, maxRotation: 0 },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: "#475569",
                callback: function (value) { return numberFormat(value, 0) + "억"; },
              },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
          },
          plugins: {
            legend: {
              display: true,
              position: "bottom",
              labels: {
                color: "#0f172a",
                boxWidth: 12,
                usePointStyle: true,
                font: { size: 12, weight: "800" },
              },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  if (context.dataset && context.dataset.label === "섹터 진입 신호") {
                    const marker = context.raw && context.raw.marker ? context.raw.marker : {};
                    return [
                      (marker.signal_level || "진입 신호") + " · " + (marker.date || ""),
                      "거래대금 " + numberFormat(marker.trading_rank, 0) + "위 · 평균점수 " + numberFormat(marker.avg_score, 1),
                    ];
                  }
                  const value = context.parsed && context.parsed.y;
                  return context.dataset.label + ": " + (Number.isFinite(value) ? numberFormat(value, 0) + "억" : "-");
                },
              },
            },
          },
        },
      });
    }, [props.data]);
    return h(
      "div",
      { className: "sector-market-cap-chart-card" },
      h(
        "div",
        { className: "sector-market-cap-summary" },
        h("div", null, h("span", null, "3개월 수익률"), h("strong", { className: positive ? "metric-up" : "metric-down" }, formatPercent(summary.return_pct, 2))),
        h("div", null, h("span", null, "현재 합산 시총"), h("strong", null, numberFormat(summary.last_market_cap_100m, 0) + "억")),
        h("div", null, h("span", null, "20일선 대비"), h("strong", { className: Number(ma20GapPct || 0) >= 0 ? "metric-up" : "metric-down" }, Number.isFinite(ma20GapPct) ? formatPercent(ma20GapPct, 2) : "-")),
        h("div", null, h("span", null, "포함 종목"), h("strong", null, numberFormat(summary.stock_count, 0) + "개")),
        h("div", null, h("span", null, "진입 신호"), h("strong", { className: "metric-up" }, numberFormat(entryMarkerPoints.length, 0) + "회"))
      ),
      h("div", { className: "sector-market-cap-chart-shell" }, h("canvas", { ref: canvasRef })),
      h(
        "div",
        { className: "sector-market-cap-stock-list" },
        ensureArray(data.stocks).map(function (stock) {
          return h("span", { key: stock.stock_code || stock.stock_name }, (stock.stock_name || stock.stock_code || "-") + (stock.stock_code ? " " + stock.stock_code : ""));
        })
      )
    );
  }

  function TradingViewStockLink(props) {
    const row = props.row || {};
    const label = props.label || row.resolved_name || row.stock_name || row.name || "-";
    const code = String(row.stock_code || row.code || "").replace(/\D/g, "");
    const stockName = String(row.stock_name || row.resolved_name || row.name || label || "").trim();
    const symbol = code ? "KRX:" + code.padStart(6, "0") : stockName;
    const href = symbol ? "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(symbol) : "";

    if (!href) {
      return h("span", null, label);
    }
    if (typeof props.onOpenChart === "function") {
      return h(
        "button",
        {
          type: "button",
          className: "tradingview-stock-link inline-button",
          title: "페이지 안에서 " + label + " 차트 보기",
          onClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            props.onOpenChart(row, symbol, label);
          },
        },
        label
      );
    }
    return h(
      "a",
      {
        className: "tradingview-stock-link",
        href: href,
        target: "_blank",
        rel: "noreferrer",
        title: "TradingView에서 " + label + " 차트 열기",
        onClick: function (event) { event.stopPropagation(); },
      },
      label
    );
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function colorForKey(key) {
    const palette = [
      "#2563eb",
      "#dc2626",
      "#16a34a",
      "#ea580c",
      "#7c3aed",
      "#0891b2",
      "#be123c",
      "#65a30d",
      "#c2410c",
      "#9333ea",
      "#0284c7",
      "#b45309",
      "#059669",
      "#db2777",
      "#4f46e5",
      "#0d9488",
      "#a16207",
      "#e11d48",
      "#2f855a",
      "#1d4ed8",
      "#b91c1c",
      "#15803d",
      "#9d174d",
      "#6d28d9",
      "#0369a1",
      "#b7791f",
      "#047857",
      "#c026d3",
      "#4338ca",
      "#0f766e",
      "#92400e",
      "#9f1239",
      "#3b82f6",
      "#ef4444",
      "#22c55e",
      "#f97316",
      "#8b5cf6",
      "#06b6d4",
      "#f43f5e",
      "#84cc16",
      "#f59e0b",
      "#a855f7",
      "#0ea5e9",
      "#14b8a6",
      "#eab308",
      "#ec4899",
      "#6366f1",
      "#10b981",
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
      .trim() || "\uAE30\uD0C0";
  }

  const API_GET_CACHE = {};
  const ACTIVE_BACKGROUND_TASKS = {};
  const BACKGROUND_TASK_CLEAR_TIMERS = {};

  function isCacheableJsonRequest(url, options) {
    const method = String((options && options.method) || "GET").toUpperCase();
    if (method !== "GET" || (options && (options.noCache || options.forceRefresh))) {
      return false;
    }
    if (typeof url !== "string" || url.indexOf("/api/") !== 0) {
      return false;
    }
    if (url.indexOf("/api/telegram/search_jobs/") === 0) {
      return false;
    }
    if (url.indexOf("/api/telegram/earnings_search_jobs/") === 0) {
      return false;
    }
    if (url.indexOf("/api/market-calendar") === 0) {
      return false;
    }
    if (url.indexOf("/api/strategy/backtest") === 0) {
      return false;
    }
    return true;
  }

  function getCachedJson(url) {
    const entry = API_GET_CACHE[url];
    return entry && Object.prototype.hasOwnProperty.call(entry, "data") ? entry.data : null;
  }

  async function fetchJson(url, options) {
    const requestOptions = Object.assign({}, options || {});
    delete requestOptions.noCache;
    delete requestOptions.forceRefresh;
    delete requestOptions.silent;
    const useCache = isCacheableJsonRequest(url, options);
    if (useCache) {
      const entry = API_GET_CACHE[url];
      if (entry && Object.prototype.hasOwnProperty.call(entry, "data")) {
        return entry.data;
      }
      if (entry && entry.promise) {
        return entry.promise;
      }
    }
    const requestId = options && options.silent ? "" : startApiRequest(url, options);
    const requestPromise = fetch(url, requestOptions).then(async function (response) {
      const rawText = await response.text();
      let payload = {};
      if (rawText && rawText.trim()) {
        try {
          payload = JSON.parse(rawText);
        } catch (parseError) {
          const error = new Error("서버 응답을 JSON으로 읽지 못했습니다.");
          error.status = response.status;
          error.rawText = rawText;
          throw error;
        }
      }
      if (!response.ok) {
        const error = new Error(payload.error || payload.detail || "Request failed.");
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      if (useCache) {
        API_GET_CACHE[url] = { data: payload, loadedAt: Date.now() };
      }
      return payload;
    }).catch(function (err) {
      if (useCache && API_GET_CACHE[url] && API_GET_CACHE[url].promise) {
        delete API_GET_CACHE[url];
      }
      throw err;
    }).finally(function () {
      finishApiRequest(requestId);
    });
    if (useCache) {
      API_GET_CACHE[url] = { promise: requestPromise, loadedAt: Date.now() };
    }
    return requestPromise;
  }

  function apiRequestLabel(url, options) {
    const method = String((options && options.method) || "GET").toUpperCase();
    const text = String(url || "");
    if (text.indexOf("/api/themes/today") === 0) return "오늘의 주도주 SQL 캐시 요약";
    if (text.indexOf("/api/us-themes/today") === 0) return "미국 주도주 SQL 캐시 요약";
    if (text.indexOf("/api/asia-themes/today") === 0) return "아시아 주도주 SQL 캐시 요약";
    if (text.indexOf("/api/portfolio/performance") === 0) return "포트폴리오 수익 데이터";
    if (text.indexOf("/api/app-config") === 0) return "앱 실행 모드";
    if (text.indexOf("/api/portfolio/export") === 0) return "포트폴리오 수익 엑셀";
    if (text.indexOf("/api/strategy/backtest") === 0) return "전략 백테스트 데이터";
    if (text.indexOf("/api/strategy/sector-rotation") === 0) return "섹터 로테이션 백테스트";
    if (text.indexOf("/api/strategy/advanced-sector") === 0) return "고급 섹터 신호 백테스트";
    if (text.indexOf("/api/strategy/portfolio-diagnostic") === 0) return "현재 방식 진단";
    if (text.indexOf("/api/institutional-rebalance") === 0) return "기관 리밸런싱 추정";
    if (text.indexOf("/api/institutional-rebalance/ai-brief") === 0) return "Gemini 기관 리밸런싱 해설";
    if (text.indexOf("/api/market-calendar") === 0) return "증시 일정";
    if (text.indexOf("/api/disclosure/upcoming-earnings") === 0) return "예정 실적 일정";
    if (text.indexOf("/api/disclosure/recent-foreign-earnings") === 0) return "최근 해외 발표 실적";
    if (text.indexOf("/api/themes/today") === 0) return "오늘의 주도주 SQL 캐시 데이터";
    if (text.indexOf("/api/us-themes/today") === 0) return "\ubbf8\uad6d \uc8fc\ub3c4\uc8fc SQL \ub370\uc774\ud130";
    if (text.indexOf("/api/asia-themes/today") === 0) return "\uc544\uc2dc\uc544 \uc8fc\ub3c4\uc8fc SQL \ub370\uc774\ud130";
    if (text.indexOf("/api/themes/reload") === 0) return "주도주 엑셀 직접 로드";
    if (text.indexOf("/api/themes/recalculate-scores/background") === 0) return "점수 백그라운드 재계산 시작";
    if (text.indexOf("/api/themes/recalculate-scores/status") === 0) return "점수 백그라운드 재계산 상태";
    if (text.indexOf("/api/us-themes/reload") === 0) return "\ubbf8\uad6d \uc8fc\ub3c4\uc8fc SQL \ub370\uc774\ud130 \uc0c8\ub85c\uace0\uce68";
    if (text.indexOf("/api/asia-themes/reload") === 0) return "\uc544\uc2dc\uc544 \uc8fc\ub3c4\uc8fc SQL \ub370\uc774\ud130 \uc0c8\ub85c\uace0\uce68";
    if (text.indexOf("/api/themes/build-today-data") === 0) return "\uc624\ub298\uc758 \uc8fc\ub3c4\uc8fc \uc624\ub298\uc790 \ub370\uc774\ud130 \uc0dd\uc131";
    if (text.indexOf("/api/us-themes/build-today-data") === 0) return "\ubbf8\uad6d \uc8fc\ub3c4\uc8fc \uc624\ub298\uc790 \ub370\uc774\ud130 \uc0dd\uc131";
    if (text.indexOf("/api/asia-themes/build-today-data") === 0) return "\uc544\uc2dc\uc544 \uc8fc\ub3c4\uc8fc \uc624\ub298\uc790 \ub370\uc774\ud130 \uc0dd\uc131";
    if (text.indexOf("/api/themes/build-today-excel") === 0) return "\uc624\ub298\uc758 \uc8fc\ub3c4\uc8fc \uc624\ub298\uc790 \ub370\uc774\ud130 \uc0dd\uc131";
    if (text.indexOf("/api/themes/build-today-data") === 0) return "\uc624\ub298\uc758 \uc8fc\ub3c4\uc8fc \uc624\ub298\uc790 \ub370\uc774\ud130 \uc0dd\uc131";
    if (text.indexOf("/api/themes/test-excel") === 0) return "\uc8fc\ub3c4\uc8fc \ud14c\uc2a4\ud2b8 \ub370\uc774\ud130 \uc810\uac80";
    if (text.indexOf("/api/themes/note") === 0) return "주도주 비고 엑셀 저장";
    if (text.indexOf("/api/themes/score-history") === 0) return "종목 점수 변동 추이";
    if (text.indexOf("/api/themes/sector-market-cap-chart") === 0) return "섹터 시가총액 차트";
    if (text.indexOf("/api/dart/today") === 0) return "오늘 공시 정리";
    if (text.indexOf("/api/sector-db") === 0) return method === "GET" ? "섹터 데이터베이스" : "섹터 데이터 저장";
    if (text.indexOf("/api/theme-sector-calendar") === 0) return "날짜별 주도 섹터 흐름";
    if (text.indexOf("/api/us-theme-sector-calendar") === 0) return "\ub0a0\uc9dc\ubcc4 \ubbf8\uad6d \uc8fc\ub3c4 \uc139\ud130 \ud750\ub984";
    if (text.indexOf("/api/asia-theme-sector-calendar") === 0) return "\ub0a0\uc9dc\ubcc4 \uc544\uc2dc\uc544 \uc8fc\ub3c4 \uc139\ud130 \ud750\ub984";
    if (text.indexOf("/api/sector-snapshot/preview") === 0) return "섹터 비교 미리보기";
    if (text.indexOf("/api/sector-snapshot/market-ytd") === 0) return "시장 전체 YTD 순위";
    if (text.indexOf("/api/sector-snapshot/entry-signals") === 0) return "섹터 진입 신호";
    if (text.indexOf("/api/sector-snapshot/signal-radar") === 0) return "\ud3b8\uc785/\ud3b8\ucd9c \uc2dc\uadf8\ub110 \ub808\uc774\ub354";
    if (text.indexOf("/api/sector-snapshot/export") === 0) return "섹터 비교 엑셀";
    if (text.indexOf("/api/global-stocks/search") === 0) return "해외기업 자동완성";
    if (text.indexOf("/api/etf-flow/assets/search") === 0) return "ETF 자금 추정 종목 자동완성";
    if (text.indexOf("/api/etf-flow/estimate") === 0) return "ETF 자금 추정 데이터";
    if (text.indexOf("/api/kr-etf/detail") === 0) return "국내 ETF 상세";
    if (text.indexOf("/api/correlation/assets/search") === 0) return "상관관계 자산 검색";
    if (text.indexOf("/api/correlation/pair") === 0) return "주가 상관관계 계산";
    if (text.indexOf("/api/global-stocks/detail") === 0) return "해외기업 실적 데이터";
    if (text.indexOf("/api/global-stocks/earnings-call") === 0) return "해외기업 최근 실적/컨콜";
    if (text.indexOf("/api/global-stocks/ai-brief") === 0) return "AI \uae30\uc5c5 \ube0c\ub9ac\ud504 \uc0dd\uc131";
    if (text.indexOf("/api/global-indices") === 0) return "지수/가격동향 데이터";
    if (text.indexOf("/api/sector-watch-board") === 0) return "관심종목 보드";
    if (text.indexOf("/api/news/search") === 0) return "뉴스 검색";
    if (text.indexOf("/api/telegram/status") === 0) return "텔레그램 계정/방 목록";
    if (text.indexOf("/api/telegram/ui_state") === 0) return "텔레그램 검색 상태";
    if (text.indexOf("/api/telegram/search_jobs") === 0) return "텔레그램 메시지 검색";
    if (text.indexOf("/api/telegram/market_earnings") === 0) return "시총 2000억 이상 실적 공시";
    if (text.indexOf("/api/telegram/earnings_search") === 0) return "텔레그램 공시 유형 검색";
    if (text.indexOf("/api/kind/business-segments") === 0) return "KIND \uc0ac\uc5c5\ubd80\ubb38 \ubd84\uc11d";
    if (text.indexOf("/api/stocks/autocomplete") === 0) return "종목 자동완성";
    if (text.indexOf("/api/stocks/investor-flows") === 0) return "종목 수급 데이터";
    if (text.indexOf("/api/trade/import-export") === 0) return "수출입 데이터";
    if (text.indexOf("/api/dram/prices") === 0) return "DRAM 가격 동향";
    if (text.indexOf("/api/ssd/prices") === 0) return "SSD 가격 동향";
    if (text.indexOf("/api/tourism/inbound-visitors") === 0) return "인바운드 관광객 통계";
    if (text.indexOf("/api/economy/cycle-clock") === 0) return "경기순환시계 데이터";
    if (text.indexOf("/api/real-estate/prices") === 0) return "부동산 가격 지수";
    if (text.indexOf("/api/real-estate/building") === 0) return "건물 관리";
    if (text.indexOf("/api/real-estate/bank/export") === 0) return "건물 관리 월별 입출금 엑셀";
    if (text.indexOf("/api/tradingview/open") === 0) return "TradingView 실행";
    return method === "GET" ? "데이터 요청" : "작업 요청";
  }

  function startApiRequest(url, options) {
    if (typeof url !== "string" || url.indexOf("/api/") !== 0) {
      return "";
    }
    const id = "api-" + (++API_REQUEST_SEQ);
    ACTIVE_API_REQUESTS[id] = {
      id: id,
      url: url,
      label: apiRequestLabel(url, options),
      startedAt: Date.now(),
    };
    window.dispatchEvent(new CustomEvent("stock-api-loading-change"));
    return id;
  }

  function finishApiRequest(id) {
    if (!id || !ACTIVE_API_REQUESTS[id]) {
      return;
    }
    delete ACTIVE_API_REQUESTS[id];
    window.dispatchEvent(new CustomEvent("stock-api-loading-change"));
  }

  function getActiveApiRequests() {
    return Object.keys(ACTIVE_API_REQUESTS)
      .map(function (key) { return ACTIVE_API_REQUESTS[key]; })
      .sort(function (a, b) { return a.startedAt - b.startedAt; });
  }

  function upsertBackgroundTask(task) {
    if (!task || !task.id) {
      return;
    }
    const id = String(task.id);
    if (BACKGROUND_TASK_CLEAR_TIMERS[id]) {
      window.clearTimeout(BACKGROUND_TASK_CLEAR_TIMERS[id]);
      delete BACKGROUND_TASK_CLEAR_TIMERS[id];
    }
    ACTIVE_BACKGROUND_TASKS[id] = Object.assign({}, ACTIVE_BACKGROUND_TASKS[id] || {}, task, {
      id: id,
      updatedAt: Date.now(),
    });
    const status = String(task.status || "").toLowerCase();
    if (status === "completed" || status === "failed") {
      BACKGROUND_TASK_CLEAR_TIMERS[id] = window.setTimeout(function () {
        delete ACTIVE_BACKGROUND_TASKS[id];
        delete BACKGROUND_TASK_CLEAR_TIMERS[id];
        window.dispatchEvent(new CustomEvent("stock-background-task-change"));
      }, 15000);
    }
    window.dispatchEvent(new CustomEvent("stock-background-task-change"));
  }

  function removeBackgroundTask(id) {
    const key = String(id || "");
    if (!key) {
      return;
    }
    if (BACKGROUND_TASK_CLEAR_TIMERS[key]) {
      window.clearTimeout(BACKGROUND_TASK_CLEAR_TIMERS[key]);
      delete BACKGROUND_TASK_CLEAR_TIMERS[key];
    }
    if (ACTIVE_BACKGROUND_TASKS[key]) {
      delete ACTIVE_BACKGROUND_TASKS[key];
      window.dispatchEvent(new CustomEvent("stock-background-task-change"));
    }
  }

  function getActiveBackgroundTasks() {
    return Object.keys(ACTIVE_BACKGROUND_TASKS)
      .map(function (key) { return ACTIVE_BACKGROUND_TASKS[key]; })
      .sort(function (a, b) {
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      });
  }

  function prefetchJson(url) {
    if (getCachedJson(url) || (API_GET_CACHE[url] && API_GET_CACHE[url].promise)) {
      return;
    }
    fetchJson(url, { silent: true }).catch(function () {});
  }

  function invalidateApiCache(match) {
    Object.keys(API_GET_CACHE).forEach(function (key) {
      if (typeof match === "function" ? match(key) : key.indexOf(match) === 0) {
        delete API_GET_CACHE[key];
      }
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  async function postJson(url, body) {
    async function executePost() {
      return fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
    }
    let payload;
    try {
      payload = await executePost();
    } catch (error) {
      const isThemeRecalc = typeof url === "string" && url.indexOf("/api/themes/recalculate-scores") === 0;
      const isNetworkError = !error || !error.status;
      if (!isThemeRecalc || !isNetworkError) {
        throw error;
      }
      await sleep(1200);
      payload = await executePost();
    }
    if (url.indexOf("/api/sector-db") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/sector-db") === 0 || key.indexOf("/api/theme-sector-calendar") === 0 || key.indexOf("/api/sector-watch-board") === 0;
      });
    } else if (url.indexOf("/api/sector-watch-board/order") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/sector-watch-board") === 0 || key.indexOf("/api/sector-db") === 0;
      });
    } else if (url.indexOf("/api/themes/reload") === 0 || url.indexOf("/api/themes/build-today-data") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/themes/") === 0 || key.indexOf("/api/dart/") === 0 || key.indexOf("/api/theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/themes/score-formula-config") === 0 || url.indexOf("/api/themes/recalculate-scores") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/themes/") === 0 || key.indexOf("/api/theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/us-themes/") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/us-themes/") === 0 || key.indexOf("/api/us-theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/asia-themes/") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/asia-themes/") === 0 || key.indexOf("/api/asia-theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/themes/note") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/themes/") === 0;
      });
    } else if (url.indexOf("/api/telegram/send_code") === 0 || url.indexOf("/api/telegram/verify_code") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/telegram/status") === 0;
      });
    } else if (url.indexOf("/api/strategy/snapshots") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/strategy/snapshots") === 0;
      });
    }
    return payload;
  }

  async function deleteJson(url) {
    const payload = await fetchJson(url, { method: "DELETE" });
    if (url.indexOf("/api/strategy/snapshots") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/strategy/snapshots") === 0;
      });
    }
    return payload;
  }

  function makeId(prefix) {
    return (prefix || "id") + "-" + Math.random().toString(36).slice(2, 10);
  }

  function todayIsoDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function shiftIsoDate(isoDate, deltaDays) {
    const parsed = new Date(String(isoDate || todayIsoDate()) + "T00:00:00");
    if (Number.isNaN(parsed.getTime())) {
      return todayIsoDate();
    }
    parsed.setDate(parsed.getDate() + Number(deltaDays || 0));
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function readAutoDailyThemeBuildState() {
    try {
      const raw = localStorage.getItem(AUTO_DAILY_THEME_BUILD_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") {
        return { date: "", kr: false, us: false, asia: false };
      }
      return {
        date: String(parsed.date || ""),
        kr: !!parsed.kr,
        us: !!parsed.us,
        asia: !!parsed.asia,
      };
    } catch (error) {
      return { date: "", kr: false, us: false, asia: false };
    }
  }

  function writeAutoDailyThemeBuildState(nextState) {
    try {
      localStorage.setItem(AUTO_DAILY_THEME_BUILD_KEY, JSON.stringify({
        date: String((nextState && nextState.date) || ""),
        kr: !!(nextState && nextState.kr),
        us: !!(nextState && nextState.us),
        asia: !!(nextState && nextState.asia),
      }));
    } catch (error) {
    }
  }

  function emitAutoDailyThemeBuildEvent(market, payload) {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new CustomEvent(AUTO_DAILY_THEME_BUILD_EVENT, {
      detail: Object.assign({ market: market }, payload || {}),
    }));
  }

  function getZonedDateParts(timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = {};
    formatter.formatToParts(new Date()).forEach(function (part) {
      if (part && part.type) {
        parts[part.type] = part.value;
      }
    });
    return {
      weekday: String(parts.weekday || ""),
      hour: Number(parts.hour || 0),
      minute: Number(parts.minute || 0),
      second: Number(parts.second || 0),
    };
  }

  function isWeekdayName(value) {
    return ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(String(value || "")) >= 0;
  }

  function getAutoBuildDelayMs(market) {
    const config = market === "us"
      ? { timeZone: "America/New_York", closeHour: 16, closeMinute: 10 }
      : market === "asia"
        ? { timeZone: "Asia/Shanghai", closeHour: 15, closeMinute: 10 }
        : { timeZone: "Asia/Seoul", closeHour: 15, closeMinute: 35 };
    const parts = getZonedDateParts(config.timeZone);
    if (!isWeekdayName(parts.weekday)) {
      return null;
    }
    const currentSeconds = ((parts.hour * 60) + parts.minute) * 60 + parts.second;
    const closeSeconds = ((config.closeHour * 60) + config.closeMinute) * 60;
    if (currentSeconds >= closeSeconds) {
      return 0;
    }
    return Math.max(1000, (closeSeconds - currentSeconds) * 1000);
  }

  function diffDaysFromToday(value) {
    if (!value) {
      return null;
    }
    const target = new Date(value + "T00:00:00");
    if (Number.isNaN(target.getTime())) {
      return null;
    }
    const today = new Date(todayIsoDate() + "T00:00:00");
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  function normalizeSubscriptionItem(item, index) {
    const source = item || {};
    return {
      id: source.id || makeId("subscription"),
      sourceId: String(source.sourceId || "").trim(),
      name: String(source.name || "").trim(),
      region: String(source.region || "서울").trim(),
      district: String(source.district || "").trim(),
      saleType: String(source.saleType || "민간분양").trim(),
      applicationStart: String(source.applicationStart || "").trim(),
      applicationEnd: String(source.applicationEnd || "").trim(),
      moveInMonth: String(source.moveInMonth || "").trim(),
      supplyHouseholds: Number(source.supplyHouseholds) || 0,
      generalSupplyHouseholds: Number(source.generalSupplyHouseholds) || 0,
      specialSupplyRatio: Number(source.specialSupplyRatio) || 0,
      specialSupplySummary: String(source.specialSupplySummary || "").trim(),
      specialSupplyBreakdown: source.specialSupplyBreakdown || {},
      minPriceEok: Number(source.minPriceEok) || 0,
      maxPriceEok: Number(source.maxPriceEok) || 0,
      private84PriceEok: Number(source.private84PriceEok) || 0,
      monthlyIncomeLimitPct: Number(source.monthlyIncomeLimitPct) || 0,
      assetLimitEok: Number(source.assetLimitEok) || 0,
      minResidenceYears: Number(source.minResidenceYears) || 0,
      commuting: String(source.commuting || "").trim(),
      status: String(source.status || "공고예정").trim(),
      suitableType: String(source.suitableType || "특공+일반").trim(),
      source: String(source.source || "청약홈").trim(),
      url: String(source.url || "").trim(),
      note: String(source.note || "").trim(),
      memo: String(source.memo || "").trim(),
      address: String(source.address || "").trim(),
      announcementDate: String(source.announcementDate || "").trim(),
      houseManageNo: String(source.houseManageNo || "").trim(),
      pblancNo: String(source.pblancNo || "").trim(),
      tags: ensureArray(source.tags).map(function (tag) { return String(tag || "").trim(); }).filter(Boolean),
      interest: source.interest === false ? false : true,
      hidden: !!source.hidden,
      scoreOverride: source.scoreOverride == null ? null : Number(source.scoreOverride),
      order: Number(source.order) || index || 0,
    };
  }

  function buildDefaultSubscriptionPageState() {
    return {
      profile: {
        preferredRegions: ["서울", "경기", "인천"],
        maxBudgetEok: 11,
        minSupplyHouseholds: 250,
        minSpecialSupplyRatio: 25,
        maxMonthlyIncomeLimitPct: 180,
        maxAssetLimitEok: 6,
        minDaysLeft: -3,
        requireCommute: false,
        preferredSuitableType: "특공+일반",
      },
      items: [
        {
          id: "seed-seoul-gangdong",
          name: "고덕 강동 리버파크",
          region: "서울",
          district: "강동구",
          saleType: "민간분양",
          applicationStart: "2026-07-29",
          applicationEnd: "2026-07-31",
          moveInMonth: "2029-02",
          supplyHouseholds: 612,
          generalSupplyHouseholds: 224,
          specialSupplyRatio: 36,
          minPriceEok: 8.9,
          maxPriceEok: 11.4,
          private84PriceEok: 10.8,
          monthlyIncomeLimitPct: 180,
          assetLimitEok: 6.9,
          minResidenceYears: 2,
          commuting: "5호선 상일동권 / 강남권 45분",
          status: "접수예정",
          suitableType: "특공+일반",
          source: "청약홈",
          url: "",
          note: "수도권 거주, 생애최초/신혼부부 특공 비중 확인 필요",
          memo: "",
          tags: ["서울", "84타입", "대단지"],
          interest: true,
          hidden: false,
        },
        {
          id: "seed-gyeonggi-gwacheon",
          name: "과천 지식정보타운 센트럴",
          region: "경기",
          district: "과천시",
          saleType: "공공분양",
          applicationStart: "2026-08-05",
          applicationEnd: "2026-08-07",
          moveInMonth: "2028-11",
          supplyHouseholds: 428,
          generalSupplyHouseholds: 112,
          specialSupplyRatio: 48,
          minPriceEok: 7.1,
          maxPriceEok: 9.4,
          private84PriceEok: 8.8,
          monthlyIncomeLimitPct: 130,
          assetLimitEok: 5.1,
          minResidenceYears: 1,
          commuting: "4호선 과천청사권 / 강남권 30분",
          status: "공고예정",
          suitableType: "특공중심",
          source: "LH",
          url: "",
          note: "가점보다 특별공급 자격 검토 우선",
          memo: "",
          tags: ["과천", "공공분양", "입지강함"],
          interest: true,
          hidden: false,
        },
        {
          id: "seed-incheon-songdo",
          name: "송도 워터프론트 에코시티",
          region: "인천",
          district: "연수구",
          saleType: "민간분양",
          applicationStart: "2026-07-24",
          applicationEnd: "2026-07-28",
          moveInMonth: "2028-06",
          supplyHouseholds: 980,
          generalSupplyHouseholds: 414,
          specialSupplyRatio: 30,
          minPriceEok: 6.2,
          maxPriceEok: 8.1,
          private84PriceEok: 7.6,
          monthlyIncomeLimitPct: 200,
          assetLimitEok: 0,
          minResidenceYears: 0,
          commuting: "인천1호선 / 여의도권 60분+",
          status: "접수중",
          suitableType: "일반공급중심",
          source: "청약홈",
          url: "",
          note: "가격 메리트는 있으나 실거주 동선 검토 필요",
          memo: "",
          tags: ["송도", "가격메리트", "접수중"],
          interest: false,
          hidden: false,
        },
      ],
      draft: {
        name: "",
        region: "서울",
        district: "",
        saleType: "민간분양",
        applicationStart: "",
        applicationEnd: "",
        moveInMonth: "",
        supplyHouseholds: "",
        generalSupplyHouseholds: "",
        specialSupplyRatio: "",
        minPriceEok: "",
        maxPriceEok: "",
        private84PriceEok: "",
        monthlyIncomeLimitPct: "",
        assetLimitEok: "",
        minResidenceYears: "",
        commuting: "",
        status: "공고예정",
        suitableType: "특공+일반",
        source: "청약홈",
        url: "",
        note: "",
        memo: "",
        tagsText: "",
      },
    };
  }

  function loadSubscriptionPageState() {
    try {
      const raw = localStorage.getItem(SUBSCRIPTION_LIST_KEY);
      if (!raw) {
        return buildDefaultSubscriptionPageState();
      }
      const parsed = JSON.parse(raw);
      const base = buildDefaultSubscriptionPageState();
      return {
        profile: Object.assign({}, base.profile, parsed.profile || {}),
        items: ensureArray(parsed.items).map(normalizeSubscriptionItem),
        draft: Object.assign({}, base.draft, parsed.draft || {}),
      };
    } catch (error) {
      return buildDefaultSubscriptionPageState();
    }
  }

  function persistSubscriptionPageState(state) {
    try {
      localStorage.setItem(SUBSCRIPTION_LIST_KEY, JSON.stringify({
        profile: state.profile || {},
        items: ensureArray(state.items).map(normalizeSubscriptionItem),
        draft: state.draft || {},
      }));
    } catch (error) {
    }
  }

  function loadSubscriptionRuntimeCache() {
    try {
      const raw = localStorage.getItem(SUBSCRIPTION_RUNTIME_CACHE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function persistSubscriptionRuntimeCache(payload) {
    try {
      localStorage.setItem(SUBSCRIPTION_RUNTIME_CACHE_KEY, JSON.stringify(payload || {}));
    } catch (error) {
    }
  }

  async function postDownload(url, body, fallbackName) {
    const requestId = startApiRequest(url, { method: "POST" });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!response.ok) {
        const rawText = await response.text();
        let payload = {};
        if (rawText && rawText.trim()) {
          try {
            payload = JSON.parse(rawText);
          } catch (parseError) {
            throw new Error("다운로드 오류 응답을 읽지 못했습니다.");
          }
        }
        throw new Error(payload.error || payload.detail || "Download failed.");
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      anchor.href = objectUrl;
      anchor.download = match ? match[1] : (fallbackName || "export.xlsx");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } finally {
      finishApiRequest(requestId);
    }
  }

  function useFetchJson(url, options) {
    const enabled = !(options && options.enabled === false) && !!url;
    const refreshOnMount = !!(options && options.refreshOnMount);
    const cachedData = enabled && !refreshOnMount ? getCachedJson(url) : null;
    const [data, setData] = useState(cachedData);
    const [loading, setLoading] = useState(enabled && !cachedData);
    const [error, setError] = useState("");
    const requestSeqRef = useRef(0);

    const refresh = async function (forceRefresh) {
      if (!enabled) {
        setLoading(false);
        setError("");
        return null;
      }
      const shouldForceRefresh = forceRefresh === true;
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      const cached = shouldForceRefresh ? null : getCachedJson(url);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError("");
        return cached;
      }
      setLoading(true);
      setError("");
      try {
        const payload = await fetchJson(url, shouldForceRefresh ? { forceRefresh: true } : undefined);
        if (requestSeqRef.current === requestSeq) {
          setData(payload);
        }
        return payload;
      } catch (err) {
        if (requestSeqRef.current === requestSeq) {
          setError(err.message || String(err));
        }
        return null;
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setLoading(false);
        }
      }
    };

    useEffect(function () {
      if (!enabled) {
        setLoading(false);
        setError("");
        return;
      }
      refresh(refreshOnMount);
    }, [url, enabled, refreshOnMount]);

    return { data, loading, error, refresh, label: apiRequestLabel(url) };
  }

  function SummaryCard(props) {
    return h(
      "div",
      { className: "summary-card" + (props.className ? " " + props.className : "") },
      h("div", { className: "summary-label" }, props.label),
      h("div", { className: "summary-value" }, props.value),
      props.help ? h("div", { className: "summary-help" }, props.help) : null
    );
  }

  function SectionTitle(props) {
    return h("div", { className: "section-title" }, props.children);
  }

  function selectTextOnFocus(event) {
    const target = event && event.currentTarget;
    if (!target || typeof target.select !== "function") {
      return;
    }
    window.setTimeout(function () {
      try {
        target.select();
      } catch (err) {
        // Some browser-managed inputs may reject selection during IME composition.
      }
    }, 0);
  }

  function EmptyState(props) {
    return h("div", { className: "empty-state" + (props.compact ? " compact" : "") }, props.message);
  }

  function LoadingBlock(props) {
    return h(
      "div",
      { className: "loading-block" + (props && props.compact ? " compact" : "") },
      h("div", { className: "loading-block-head" },
        h("strong", null, (props && props.title) || "데이터를 불러오는 중입니다."),
        h("span", null, (props && props.label) || "잠시만 기다려 주세요.")
      ),
      h("div", { className: "loading-bar indeterminate" }, h("span", null)),
      props && props.detail ? h("div", { className: "loading-detail" }, props.detail) : null
    );
  }

  function LoadingPanel(props) {
    return h(
      "div",
      { className: "panel loading" },
      h(LoadingBlock, {
        title: props && props.title ? props.title : "페이지를 준비하는 중입니다.",
        label: props && props.label ? props.label : "필요한 데이터를 불러오고 있습니다.",
        detail: props && props.detail,
      })
    );
  }

  function ErrorPanel(props) {
    return h("div", { className: "panel notice-box error" }, props.message);
  }

  function SecurityLockedPanel(props) {
    return h(
      "div",
      { className: "panel security-locked-panel" },
      h("div", { className: "security-lock-badge" }, "보안 문제로 잠겨있음"),
      h("div", { className: "section-title" }, props.title || "잠긴 기능"),
      h(
        "p",
        { className: "page-copy" },
        props.message || "공개 웹 주소에서는 개인 계정, 메시지, 인증 정보가 노출될 수 있는 기능을 사용할 수 없습니다."
      ),
      h(
        "div",
        { className: "security-lock-note" },
        "로컬 데스크탑 앱에서는 기존처럼 사용할 수 있고, 웹 배포 모드에서만 이 박스가 표시됩니다."
      )
    );
  }

  function DataTable(props) {
    const rows = ensureArray(props.rows);
    const columns = ensureArray(props.columns);
    if (!rows.length) {
      return EmptyState({ message: props.emptyMessage || "\uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", compact: true });
    }
    return h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        { className: "data-table" + (props.compact ? " compact" : "") },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            columns.map(function (column) {
              return h("th", { key: column.key }, column.label);
            })
          )
        ),
        h(
          "tbody",
          null,
          rows.map(function (row, rowIndex) {
            const rowKey = props.rowKey ? props.rowKey(row, rowIndex) : rowIndex;
            const rowClassName = props.selectedKey && props.selectedKey === rowKey ? "is-selected" : "";
            return h(
              "tr",
              {
                key: rowKey,
                className: rowClassName,
                onClick: props.onRowClick ? function () { props.onRowClick(row, rowIndex); } : null,
              },
              columns.map(function (column) {
                const value = typeof column.render === "function" ? column.render(row, rowIndex) : row[column.key];
                const cellClassName = typeof column.className === "function" ? column.className(row, rowIndex) : (column.className || "");
                return h("td", { key: column.key, className: cellClassName }, value);
              })
            );
          })
        )
      )
    );
  }

  function SortableDataTable(props) {
    const rows = ensureArray(props.rows);
    const columns = ensureArray(props.columns);
    const [sortState, setSortState] = useState(null);
    if (!rows.length) {
      return EmptyState({ message: props.emptyMessage || "\uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", compact: true });
    }

    function getSortValue(row, column) {
      if (typeof column.sortValue === "function") {
        return column.sortValue(row);
      }
      return row[column.key];
    }

    function updateSort(column) {
      if (column.sortable === false) {
        return;
      }
      setSortState(function (current) {
        if (current && current.key === column.key) {
          if (current.direction === "desc") {
            return { key: column.key, direction: "asc" };
          }
          return null;
        }
        return { key: column.key, direction: "desc" };
      });
    }

    const sortedRows = sortState
      ? rows.slice().sort(function (left, right) {
          const column = columns.find(function (item) { return item.key === sortState.key; }) || {};
          const leftValue = getSortValue(left, column);
          const rightValue = getSortValue(right, column);
          const leftNumber = Number(leftValue);
          const rightNumber = Number(rightValue);
          let result = 0;
          if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            result = leftNumber - rightNumber;
          } else {
            result = String(leftValue || "").localeCompare(String(rightValue || ""), "ko");
          }
          return sortState.direction === "desc" ? -result : result;
        })
      : rows;

    return h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        { className: "data-table sortable-table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            columns.map(function (column) {
              const active = sortState && sortState.key === column.key;
              return h(
                "th",
                { key: column.key },
                h(
                  "button",
                  {
                    className: "table-sort-button" + (active ? " active" : ""),
                    onClick: function () { updateSort(column); },
                    disabled: column.sortable === false,
                  },
                  column.label,
                  active ? h("span", null, sortState.direction === "desc" ? " ↓" : " ↑") : null
                )
              );
            })
          )
        ),
        h(
          "tbody",
          null,
          sortedRows.map(function (row, rowIndex) {
            const rowKey = props.rowKey ? props.rowKey(row, rowIndex) : rowIndex;
            const rowClassName = typeof props.rowClassName === "function" ? props.rowClassName(row, rowIndex) : (props.rowClassName || "");
            return h(
              "tr",
              { key: rowKey, className: rowClassName },
              columns.map(function (column) {
                const value = typeof column.render === "function" ? column.render(row, rowIndex) : row[column.key];
                return h("td", { key: column.key }, value);
              })
            );
          })
        )
      )
    );
  }

  async function openUrlInDefaultBrowser(url) {
    const target = String(url || "").trim();
    if (!target) {
      return;
    }
    try {
      await postJson("/api/system/open-default-browser", { url: target });
    } catch (error) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }

  async function copyImageBlobWithFallback(blob) {
    if (!blob) {
      throw new Error("클립보드에 복사할 이미지가 없습니다.");
    }
    const canUseBrowserClipboard = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
    if (canUseBrowserClipboard) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return { method: "browser" };
      } catch (error) {}
    }
    const dataUrl = await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("이미지를 읽지 못했습니다.")); };
      reader.readAsDataURL(blob);
    });
    await postJson("/api/system/clipboard-image", { image_base64: dataUrl });
    return { method: "system" };
  }

  function linkifyText(text, onOpenLink) {
    const source = String(text || "");
    const pattern = /((?:https?:\/\/|www\.)[^\s<>()]+)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (match.index > lastIndex) {
        parts.push(source.slice(lastIndex, match.index));
      }
      const raw = match[0];
      const href = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
      parts.push(h("a", {
        key: href + "-" + match.index,
        href: href,
        target: "_blank",
        rel: "noreferrer",
        onClick: typeof onOpenLink === "function"
          ? function (event) {
              event.preventDefault();
              onOpenLink(href);
            }
          : null,
      }, raw));
      lastIndex = match.index + raw.length;
    }
    if (lastIndex < source.length) {
      parts.push(source.slice(lastIndex));
    }
    return parts;
  }

  function LinkifiedText(props) {
    return h("div", { className: "telegram-text" }, linkifyText(props.text, props.onOpenLink));
  }

  function loadTelegramSearchState() {
    try {
      const raw = localStorage.getItem(TELEGRAM_SEARCH_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return {
        keywords: String(parsed.keywords || ""),
        matchMode: parsed.matchMode === "all" ? "all" : "any",
        exactPhrase: !!parsed.exactPhrase,
        hasFile: ["all", "with", "without"].indexOf(parsed.hasFile) >= 0 ? parsed.hasFile : "all",
        startDate: String(parsed.startDate || ""),
        endDate: String(parsed.endDate || ""),
        chatQuery: String(parsed.chatQuery || ""),
        selectedChats: ensureArray(parsed.selectedChats).map(function (item) {
          return {
            id: Number(item.id),
            name: String(item.name || ""),
          };
        }).filter(function (item) {
          return Number.isFinite(item.id) && item.name;
        }),
        results: ensureArray(parsed.results),
        jobState: parsed.jobState || null,
      };
    } catch (error) {
      return null;
    }
  }

  function persistTelegramSearchState(state) {
    try {
      localStorage.setItem(TELEGRAM_SEARCH_KEY, JSON.stringify({
        keywords: state.keywords || "",
        matchMode: state.matchMode || "any",
        exactPhrase: !!state.exactPhrase,
        hasFile: state.hasFile || "all",
        startDate: state.startDate || "",
        endDate: state.endDate || "",
        chatQuery: state.chatQuery || "",
        selectedChats: ensureArray(state.selectedChats),
        results: ensureArray(state.results),
        jobState: state.jobState || null,
      }));
    } catch (error) {
    }
  }

  function loadTelegramSearchState() {
    try {
      const raw = localStorage.getItem(TELEGRAM_SEARCH_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return {
        keywords: String(parsed.keywords || ""),
        matchMode: parsed.matchMode === "all" ? "all" : "any",
        exactPhrase: !!parsed.exactPhrase,
        hasFile: ["all", "with", "without"].indexOf(parsed.hasFile) >= 0 ? parsed.hasFile : "all",
        startDate: String(parsed.startDate || ""),
        endDate: String(parsed.endDate || ""),
        chatQuery: String(parsed.chatQuery || ""),
        allRoomsSearch: Object.prototype.hasOwnProperty.call(parsed, "allRoomsSearch") ? !!parsed.allRoomsSearch : !ensureArray(parsed.selectedChats).length,
        selectedChats: ensureArray(parsed.selectedChats).map(function (item) {
          return { id: Number(item.id), name: String(item.name || "") };
        }).filter(function (item) {
          return Number.isFinite(item.id) && item.name;
        }),
        favoriteChatGroups: ensureArray(parsed.favoriteChatGroups).map(function (group) {
          return {
            id: String(group.id || makeId("tg-group")),
            name: String(group.name || "").trim(),
            chats: ensureArray(group.chats).map(function (item) {
              return { id: Number(item.id), name: String(item.name || "") };
            }).filter(function (item) {
              return Number.isFinite(item.id) && item.name;
            }),
          };
        }).filter(function (group) {
          return group.name && group.chats.length;
        }),
        results: ensureArray(parsed.results),
        jobState: parsed.jobState || null,
        earningsQuery: String(parsed.earningsQuery || ""),
        earningsResults: ensureArray(parsed.earningsResults),
        earningsMessage: String(parsed.earningsMessage || ""),
        disclosureCategory: String(parsed.disclosureCategory || "earnings"),
        disclosureNextOffsetId: Number(parsed.disclosureNextOffsetId || 0),
        disclosureHasMore: !!parsed.disclosureHasMore,
        financialTrend: parsed.financialTrend || null,
        financialTrendMessage: String(parsed.financialTrendMessage || ""),
      };
    } catch (err) {
      return null;
    }
  }

  function persistTelegramSearchState(state) {
    try {
      localStorage.setItem(TELEGRAM_SEARCH_KEY, JSON.stringify({
        keywords: state.keywords || "",
        matchMode: state.matchMode || "any",
        exactPhrase: !!state.exactPhrase,
        hasFile: state.hasFile || "all",
        startDate: state.startDate || "",
        endDate: state.endDate || "",
        chatQuery: state.chatQuery || "",
        allRoomsSearch: !!state.allRoomsSearch,
        selectedChats: ensureArray(state.selectedChats),
        favoriteChatGroups: ensureArray(state.favoriteChatGroups),
        results: ensureArray(state.results),
        jobState: state.jobState || null,
        earningsQuery: state.earningsQuery || "",
        earningsResults: ensureArray(state.earningsResults),
        earningsMessage: state.earningsMessage || "",
        disclosureCategory: state.disclosureCategory || "earnings",
        disclosureNextOffsetId: Number(state.disclosureNextOffsetId || 0),
        disclosureHasMore: !!state.disclosureHasMore,
        financialTrend: state.financialTrend || null,
        financialTrendMessage: state.financialTrendMessage || "",
      }));
    } catch (err) {
    }
  }

  function loadThemeSectorState() {
    try {
      const raw = localStorage.getItem(THEME_SECTOR_KEY);
      if (!raw) {
        return { stockMap: {}, sectors: [], lastFileDate: "", universeMode: "stock" };
      }
      const parsed = JSON.parse(raw);
      const stockMap = {};
      Object.keys(parsed.stockMap || {}).forEach(function (key) {
        const stockName = String(key || "").trim();
        const sector = String(parsed.stockMap[key] || "").trim();
        if (stockName && sector) {
          stockMap[stockName] = sector;
        }
      });
      const sectors = ensureArray(parsed.sectors).map(function (item) {
        return String(item || "").trim();
      }).filter(Boolean);
      return {
        stockMap: stockMap,
        sectors: Array.from(new Set(sectors.concat(Object.keys(stockMap).map(function (name) { return stockMap[name]; })))),
        lastFileDate: String(parsed.lastFileDate || ""),
        universeMode: String(parsed.universeMode || "stock") === "etf" ? "etf" : "stock",
      };
    } catch (err) {
      return { stockMap: {}, sectors: [], lastFileDate: "", universeMode: "stock" };
    }
  }

  function persistThemeSectorState(state) {
    try {
      const stockMap = {};
      Object.keys(state.stockMap || {}).forEach(function (key) {
        const stockName = String(key || "").trim();
        const sector = String((state.stockMap || {})[key] || "").trim();
        if (stockName && sector) {
          stockMap[stockName] = sector;
        }
      });
      const sectors = Array.from(new Set(
        ensureArray(state.sectors).map(function (item) { return String(item || "").trim(); }).filter(Boolean)
          .concat(Object.keys(stockMap).map(function (name) { return stockMap[name]; }))
      ));
      localStorage.setItem(THEME_SECTOR_KEY, JSON.stringify({
        stockMap: stockMap,
        sectors: sectors,
        lastFileDate: state.lastFileDate || "",
        universeMode: state.universeMode === "etf" ? "etf" : "stock",
      }));
    } catch (err) {
    }
  }

  function buildThemeSectorSuggestions(options, value) {
    const query = normalizeSearchValue(value);
    const uniq = Array.from(new Set(ensureArray(options).map(function (item) {
      return String(item || "").trim();
    }).filter(Boolean)));
    const filtered = query
      ? uniq.filter(function (item) { return normalizeSearchValue(item).indexOf(query) >= 0; })
      : uniq;
    return filtered.slice(0, 12);
  }

  function filterCalendarDays(days, anchorDate, mode) {
    const rows = ensureArray(days).filter(function (item) { return isBusinessDate(item.date); });
    if (!rows.length) {
      return [];
    }
    const anchor = new Date(anchorDate || rows[rows.length - 1].date);
    if (Number.isNaN(anchor.getTime())) {
      return rows.slice(-22);
    }
    const anchorKey = anchor.toISOString().slice(0, 10);
    const beforeAnchor = rows.filter(function (item) {
      return String(item.date || "") <= anchorKey;
    });
    return beforeAnchor.slice(mode === "month" ? -22 : -5);
  }

  function getCalendarTopSectors(days, limit) {
    const totals = {};
    ensureArray(days).forEach(function (day) {
      ensureArray(day.sectors).forEach(function (sector) {
        const key = sector.sector || "";
        if (!key) {
          return;
        }
        if (!totals[key]) {
          totals[key] = { scoreTotal: 0, count: 0 };
        }
        totals[key].scoreTotal += Number(sector.sector_strength || sector.rank_power || sector.rank_strength || sector.avg_score || 0);
        totals[key].count += 1;
      });
    });
    return Object.keys(totals)
      .sort(function (a, b) {
        const left = totals[a].count ? totals[a].scoreTotal / totals[a].count : 0;
        const right = totals[b].count ? totals[b].scoreTotal / totals[b].count : 0;
        return right - left;
      })
      .slice(0, limit || 5);
  }

  function calendarSectorRank(day, sectorName) {
    if (!day || !sectorName) {
      return -1;
    }
    return ensureArray(day.sectors).slice(0, 5).findIndex(function (item) {
      return item && item.sector === sectorName;
    });
  }

  function calendarRankCellClass(day, rankIndex, sectorName) {
    return "leader-timeline-segment";
  }

  function calendarRankCellStyle(day, rankIndex, sectorName, color) {
    return { background: color };
  }

  function focusNextThemeSectorInput(currentInput) {
    const inputs = Array.from(document.querySelectorAll(".theme-sector-input"));
    const currentIndex = inputs.indexOf(currentInput);
    const nextInput = currentIndex >= 0 ? inputs[currentIndex + 1] : null;
    if (nextInput) {
      window.setTimeout(function () {
        nextInput.focus();
        nextInput.select();
      }, 0);
    }
  }

  function ThemeSectorInput(props) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [draftValue, setDraftValue] = useState(props.value || "");
    const inputRef = useRef(null);
    const committedValueRef = useRef(props.value || "");
    const suggestions = useMemo(function () {
      return buildThemeSectorSuggestions(props.options, draftValue);
    }, [props.options, draftValue]);

    useEffect(function () {
      const nextValue = props.value || "";
      setDraftValue(nextValue);
      committedValueRef.current = nextValue;
    }, [props.value]);

    useEffect(function () {
      if (activeIndex >= suggestions.length) {
        setActiveIndex(0);
      }
    }, [suggestions.length]);

    function commitValue(value) {
      const nextValue = String(value || "");
      if (nextValue === committedValueRef.current) {
        return;
      }
      committedValueRef.current = nextValue;
      if (typeof props.onCommit === "function") {
        props.onCommit(nextValue);
      }
    }

    function choose(value, moveNext) {
      setDraftValue(value);
      commitValue(value);
      setOpen(false);
      if (moveNext) {
        focusNextThemeSectorInput(inputRef.current);
      }
    }

    return h(
      "div",
      { className: "theme-sector-input-wrap" },
      h("input", {
        ref: inputRef,
        className: "theme-sector-input",
        value: draftValue,
        onFocus: function () {
          if (suggestions.length) {
            setOpen(true);
          }
        },
        onBlur: function () {
          commitValue(draftValue);
          window.setTimeout(function () { setOpen(false); }, 120);
        },
        onChange: function (event) {
          setDraftValue(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        },
        onKeyDown: function (event) {
          if (!suggestions.length) {
            if (event.key === "Enter") {
              event.preventDefault();
              commitValue(draftValue);
              setOpen(false);
              focusNextThemeSectorInput(inputRef.current);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(function (current) { return Math.min(current + 1, suggestions.length - 1); });
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(function (current) { return Math.max(current - 1, 0); });
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (open) {
              choose(suggestions[activeIndex] || suggestions[0], true);
            } else {
              commitValue(draftValue);
              focusNextThemeSectorInput(inputRef.current);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        },
      }),
      open && suggestions.length
        ? h(
            "div",
            { className: "autocomplete-list inline theme-sector-autocomplete" },
            suggestions.map(function (item, index) {
              return h(
                "button",
                {
                  key: item,
                  type: "button",
                  className: "autocomplete-item" + (index === activeIndex ? " active" : ""),
                  onMouseEnter: function () { setActiveIndex(index); },
                  onMouseDown: function (event) { event.preventDefault(); },
                  onClick: function () { choose(item); },
                },
                h("strong", null, item)
              );
            })
          )
        : null
    );
  }

  function ThemeNoteInput(props) {
    const [draftValue, setDraftValue] = useState(props.value || "");
    const [saving, setSaving] = useState(false);
    const committedValueRef = useRef(props.value || "");

    useEffect(function () {
      const nextValue = props.value || "";
      setDraftValue(nextValue);
      committedValueRef.current = nextValue;
    }, [props.value]);

    function commitValue() {
      const nextValue = String(draftValue || "").trim();
      if (nextValue === committedValueRef.current) {
        return;
      }
      committedValueRef.current = nextValue;
      setSaving(true);
      Promise.resolve(props.onCommit ? props.onCommit(nextValue) : null)
        .catch(function () {
          committedValueRef.current = props.value || "";
          setDraftValue(props.value || "");
        })
        .finally(function () {
          setSaving(false);
        });
    }

    return h("input", {
      className: "theme-note-input" + (saving ? " saving" : ""),
      value: draftValue,
      disabled: saving,
      onChange: function (event) { setDraftValue(event.target.value); },
      onBlur: commitValue,
      onKeyDown: function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraftValue(committedValueRef.current);
          event.currentTarget.blur();
        }
      },
    });
  }

  function loadTelegramSearchState() {
    try {
      const raw = localStorage.getItem(TELEGRAM_SEARCH_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return {
        keywords: String(parsed.keywords || ""),
        matchMode: parsed.matchMode === "all" ? "all" : "any",
        exactPhrase: !!parsed.exactPhrase,
        hasFile: ["all", "with", "without"].indexOf(parsed.hasFile) >= 0 ? parsed.hasFile : "all",
        startDate: String(parsed.startDate || ""),
        endDate: String(parsed.endDate || ""),
        chatQuery: String(parsed.chatQuery || ""),
        selectedChats: ensureArray(parsed.selectedChats).map(function (item) {
          return { id: Number(item.id), name: String(item.name || "") };
        }).filter(function (item) {
          return Number.isFinite(item.id) && item.name;
        }),
        results: ensureArray(parsed.results),
        jobState: parsed.jobState || null,
        earningsQuery: String(parsed.earningsQuery || ""),
        earningsResults: ensureArray(parsed.earningsResults),
        earningsMessage: String(parsed.earningsMessage || ""),
        disclosureCategory: String(parsed.disclosureCategory || "earnings"),
        disclosureNextOffsetId: Number(parsed.disclosureNextOffsetId || 0),
        disclosureHasMore: !!parsed.disclosureHasMore,
        financialTrend: parsed.financialTrend || null,
        financialTrendMessage: String(parsed.financialTrendMessage || ""),
      };
    } catch (err) {
      return null;
    }
  }

  function persistTelegramSearchState(state) {
    try {
      localStorage.setItem(TELEGRAM_SEARCH_KEY, JSON.stringify({
        keywords: state.keywords || "",
        matchMode: state.matchMode || "any",
        exactPhrase: !!state.exactPhrase,
        hasFile: state.hasFile || "all",
        startDate: state.startDate || "",
        endDate: state.endDate || "",
        chatQuery: state.chatQuery || "",
        selectedChats: ensureArray(state.selectedChats),
        results: ensureArray(state.results),
        jobState: state.jobState || null,
        earningsQuery: state.earningsQuery || "",
        earningsResults: ensureArray(state.earningsResults),
        earningsMessage: state.earningsMessage || "",
        disclosureCategory: state.disclosureCategory || "earnings",
        disclosureNextOffsetId: Number(state.disclosureNextOffsetId || 0),
        disclosureHasMore: !!state.disclosureHasMore,
        financialTrend: state.financialTrend || null,
        financialTrendMessage: state.financialTrendMessage || "",
      }));
    } catch (err) {
    }
  }

  function useChartLifecycle(createChart, deps) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(function () {
      if (!canvasRef.current || !window.Chart) {
        return undefined;
      }
      if (chartRef.current) {
        chartRef.current.destroy();
      }
      chartRef.current = createChart(canvasRef.current);
      return function () {
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, deps);

    return { canvasRef, chartRef };
  }

  function buildAllocationDatasets(allocations, mode) {
    const keyName = mode === "sector" ? "sector_weights" : "stock_weights";
    const rows = ensureArray(allocations);
    const totals = {};
    rows.forEach(function (row) {
      const map = row[keyName] || {};
      Object.keys(map).forEach(function (key) {
        const normalizedKey = mode === "sector" ? normalizeAllocationLabel(key) : key;
        totals[normalizedKey] = (totals[normalizedKey] || 0) + Number(map[key] || 0);
      });
    });

    let keys = Object.keys(totals).sort(function (left, right) {
      return totals[right] - totals[left];
    });

    if (mode === "stock" && keys.length > 13) {
      const visible = keys.slice(0, 13);
      const hidden = new Set(keys.slice(13));
      keys = visible.concat("\uAE30\uD0C0");
      return keys.map(function (key) {
        return {
          label: key,
          backgroundColor: colorForKey(key),
          stack: "allocation",
          data: rows.map(function (row) {
            const map = row[keyName] || {};
            if (key !== "\uAE30\uD0C0") {
              let value = 0;
              Object.keys(map).forEach(function (name) {
                const normalizedName = mode === "sector" ? normalizeAllocationLabel(name) : name;
                if (normalizedName === key) {
                  value += Number(map[name] || 0);
                }
              });
              return Number(value.toFixed(3));
            }
            let remainder = 0;
            Object.keys(map).forEach(function (name) {
              const normalizedName = mode === "sector" ? normalizeAllocationLabel(name) : name;
              if (hidden.has(normalizedName)) {
                remainder += Number(map[name] || 0);
              }
            });
            return Number(remainder.toFixed(3));
          }),
        };
      });
    }

    return keys.map(function (key) {
      return {
        label: key,
        backgroundColor: colorForKey(key),
        stack: "allocation",
        data: rows.map(function (row) {
          const map = row[keyName] || {};
          let value = 0;
          Object.keys(map).forEach(function (name) {
            const normalizedName = mode === "sector" ? normalizeAllocationLabel(name) : name;
            if (normalizedName === key) {
              value += Number(map[name] || 0);
            }
          });
          return Number(value.toFixed(3));
        }),
      };
    });
  }

  function computeAllocationMax(allocations, mode) {
    const keyName = mode === "sector" ? "sector_weights" : "stock_weights";
    const maximum = ensureArray(allocations).reduce(function (accumulator, row) {
      const total = Object.values(row[keyName] || {}).reduce(function (sum, value) {
        return sum + Number(value || 0);
      }, 0);
      return Math.max(accumulator, total);
    }, 0);
    return Math.max(100, Math.ceil(maximum / 10) * 10 || 100);
  }

  function roundNumber(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return null;
    }
    const multiplier = Math.pow(10, digits || 0);
    return Math.round(number * multiplier) / multiplier;
  }

  function portfolioMetricValue(item) {
    if (!item) {
      return null;
    }
    const nav = Number(item.nav);
    if (Number.isFinite(nav) && nav > 0) {
      return nav;
    }
    const value = Number(item.value);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    const returnPct = Number(item.return_pct);
    if (Number.isFinite(returnPct)) {
      return 100 + returnPct;
    }
    return null;
  }

  function itemInPortfolioPeriod(item, periodKey) {
    if (!item || !item.date) {
      return false;
    }
    if (!periodKey || periodKey === "all") {
      return true;
    }
    return String(item.date).slice(0, 7) === periodKey;
  }

  function normalizePortfolioSeriesForPeriod(series, periodKey) {
    const rows = ensureArray(series).filter(function (item) {
      return itemInPortfolioPeriod(item, periodKey);
    });
    const baseRow = rows.find(function (item) {
      return portfolioMetricValue(item) != null;
    });
    const baseValue = portfolioMetricValue(baseRow);
    if (!baseValue) {
      return rows;
    }
    return rows.map(function (item) {
      const metric = portfolioMetricValue(item);
      const normalizedReturn = metric == null ? null : ((metric / baseValue) - 1) * 100;
      return Object.assign({}, item, {
        value: metric == null ? null : roundNumber((metric / baseValue) * 100, 2),
        return_pct: normalizedReturn == null ? null : roundNumber(normalizedReturn, 2),
      });
    });
  }

  function normalizeBenchmarkForLabels(benchmark, labels) {
    const labelSet = new Set(labels);
    const rows = ensureArray(benchmark).filter(function (item) {
      return labelSet.has(item.date) && portfolioMetricValue(item) != null;
    });
    const baseValue = rows.length ? portfolioMetricValue(rows[0]) : null;
    const normalizedByDate = {};
    rows.forEach(function (item) {
      const metric = portfolioMetricValue(item);
      normalizedByDate[item.date] = metric == null || !baseValue
        ? null
        : roundNumber(((metric / baseValue) - 1) * 100, 2);
    });
    return labels.map(function (date) {
      return {
        date: date,
        return_pct: Object.prototype.hasOwnProperty.call(normalizedByDate, date) ? normalizedByDate[date] : null,
      };
    });
  }

  function cumulativeReturnFromRows(rows) {
    const valid = ensureArray(rows).filter(function (item) {
      return item && Number.isFinite(Number(item.return_pct));
    });
    if (!valid.length) {
      return null;
    }
    return Number(valid[valid.length - 1].return_pct);
  }

  function dailyReturnsFromCumulativeRows(rows) {
    const values = ensureArray(rows).map(function (item) {
      const value = item && Number.isFinite(Number(item.return_pct))
        ? 1 + Number(item.return_pct) / 100
        : null;
      return value && value > 0 ? value : null;
    });
    const returns = [];
    for (let index = 1; index < values.length; index += 1) {
      const prev = values[index - 1];
      const current = values[index];
      if (prev == null || current == null || prev <= 0) {
        returns.push(null);
      } else {
        returns.push((current / prev) - 1);
      }
    }
    return returns;
  }

  function calculateRelativePortfolioStats(series, benchmark) {
    const portfolioReturn = cumulativeReturnFromRows(series);
    const benchmarkReturn = cumulativeReturnFromRows(benchmark);
    const portfolioDaily = dailyReturnsFromCumulativeRows(series);
    const benchmarkDaily = dailyReturnsFromCumulativeRows(benchmark);
    const pairs = [];
    for (let index = 0; index < Math.min(portfolioDaily.length, benchmarkDaily.length); index += 1) {
      const portfolioValue = portfolioDaily[index];
      const benchmarkValue = benchmarkDaily[index];
      if (Number.isFinite(portfolioValue) && Number.isFinite(benchmarkValue)) {
        pairs.push([portfolioValue, benchmarkValue]);
      }
    }
    let beta = null;
    if (pairs.length >= 2) {
      const portfolioMean = pairs.reduce(function (sum, pair) { return sum + pair[0]; }, 0) / pairs.length;
      const benchmarkMean = pairs.reduce(function (sum, pair) { return sum + pair[1]; }, 0) / pairs.length;
      const covariance = pairs.reduce(function (sum, pair) {
        return sum + ((pair[0] - portfolioMean) * (pair[1] - benchmarkMean));
      }, 0);
      const variance = pairs.reduce(function (sum, pair) {
        return sum + Math.pow(pair[1] - benchmarkMean, 2);
      }, 0);
      if (variance > 0) {
        beta = covariance / variance;
      }
    }
    return {
      portfolio_return_pct: portfolioReturn,
      benchmark_return_pct: benchmarkReturn,
      alpha_pct: portfolioReturn == null || benchmarkReturn == null ? null : portfolioReturn - benchmarkReturn,
      beta: beta,
      sample_count: pairs.length,
    };
  }

  function allocationExposurePct(item) {
    const stockWeights = (item && item.stock_weights) || {};
    const sectorWeights = (item && item.sector_weights) || {};
    const source = Object.keys(stockWeights).length ? stockWeights : sectorWeights;
    return Object.keys(source).reduce(function (total, key) {
      const value = Number(source[key]);
      return total + (Number.isFinite(value) ? Math.abs(value) : 0);
    }, 0);
  }

  function markPortfolioInvestmentState(series, allocations) {
    const exposureByDate = {};
    ensureArray(allocations).forEach(function (item) {
      if (item && item.date) {
        exposureByDate[item.date] = allocationExposurePct(item);
      }
    });
    return ensureArray(series).map(function (item) {
      const exposure = Object.prototype.hasOwnProperty.call(exposureByDate, item.date)
        ? exposureByDate[item.date]
        : null;
      return Object.assign({}, item, {
        invested_pct: exposure,
        invested: exposure == null ? true : exposure > 0.0001,
      });
    });
  }

  function portfolioChartPoint(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function portfolioMonthOptions(series) {
    const seen = new Set();
    ensureArray(series).forEach(function (item) {
      const month = String(item.date || "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) {
        seen.add(month);
      }
    });
    return Array.from(seen).sort();
  }

  function isoDateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function PerformanceChart(props) {
    if (window.LightweightCharts && ensureArray(props.series).length) {
      return h(LightweightPerformanceChart, props);
    }
    const labels = props.series.map(function (item) { return item.date; });
    const portfolioInvestedFlags = props.series.map(function (item) { return item && item.invested !== false; });
    const benchmarkSets = ensureArray(props.benchmarks);
    const resetSignal = props.resetSignal;
    const { canvasRef, chartRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Portfolio",
              data: props.series.map(function (item) { return portfolioChartPoint(item.return_pct); }),
              borderColor: "#f6c445",
              backgroundColor: "rgba(246, 196, 69, 0.18)",
              pointRadius: 2.8,
              pointHoverRadius: 4.5,
              tension: 0.14,
              borderWidth: 2,
              segment: {
                borderDash: function (context) {
                  const currentInvested = portfolioInvestedFlags[context.p0DataIndex] !== false;
                  const nextInvested = portfolioInvestedFlags[context.p1DataIndex] !== false;
                  return currentInvested && nextInvested ? [] : [6, 5];
                },
              },
            },
          ].concat(benchmarkSets.map(function (benchmark) {
            return {
              label: benchmark.label || benchmark.key || "Benchmark",
              data: ensureArray(benchmark.rows).map(function (item) { return portfolioChartPoint(item.return_pct); }),
              borderColor: benchmark.color,
              backgroundColor: benchmark.color,
              pointRadius: 1.2,
              pointHoverRadius: 3,
              tension: 0.12,
              borderWidth: 2,
            };
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          animation: false,
          scales: {
            x: {
              ticks: {
                color: "#111827",
                maxTicksLimit: 12,
                callback: function (value, index) {
                  const label = labels[index];
                  return formatDateLabel(label);
                },
              },
              grid: { color: "#e5e7eb" },
              min: props.xRange ? props.xRange.min : undefined,
              max: props.xRange ? props.xRange.max : undefined,
            },
            y: {
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 1) + "%"; },
              },
              grid: { color: "#e5e7eb" },
            },
          },
          plugins: {
            legend: { labels: { color: "#111827", font: { weight: "700" } } },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  return context.dataset.label + ": " + formatPercent(context.raw, 2);
                },
              },
            },
            zoom: {
              pan: {
                enabled: true,
                mode: "x",
                modifierKey: null,
              },
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                drag: { enabled: true },
                mode: "x",
              },
            },
          },
          onHover: function (event) {
            const target = event && event.native ? event.native.target : null;
            if (target) {
              target.style.cursor = "crosshair";
            }
          },
        },
      });
    }, [props.series, props.benchmarks, props.xRange]);

    useEffect(function () {
      if (!chartRef.current) {
        return;
      }
      const chart = chartRef.current;
      chart.options.plugins.zoom.onZoomComplete = function ({ chart: sourceChart }) {
        props.onRangeChange({
          min: sourceChart.scales.x.min,
          max: sourceChart.scales.x.max,
        });
      };
      chart.options.plugins.zoom.onPanComplete = function ({ chart: sourceChart }) {
        props.onRangeChange({
          min: sourceChart.scales.x.min,
          max: sourceChart.scales.x.max,
        });
      };
      chart.update("none");
    }, [props.onRangeChange, props.series, props.benchmarks]);

    useEffect(function () {
      if (!chartRef.current) {
        return;
      }
      const chart = chartRef.current;
      if (resetSignal > 0 && typeof chart.resetZoom === "function") {
        chart.resetZoom();
      }
      if (!props.xRange) {
        chart.options.scales.x.min = undefined;
        chart.options.scales.x.max = undefined;
        chart.update("none");
      }
    }, [resetSignal, props.xRange]);

    return h("div", { className: "chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function LightweightPerformanceChart(props) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const portfolioSeriesRef = useRef(null);
    const benchmarkSeriesRefs = useRef({});
    const suppressRangeEventRef = useRef(false);
    const resizeFrameRef = useRef(null);
    const lastSizeRef = useRef({ width: 0, height: 0 });

    const labels = ensureArray(props.series).map(function (item) { return String(item.date || ""); });

    useEffect(function () {
      const container = containerRef.current;
      const lib = window.LightweightCharts;
      if (!container || !lib || chartRef.current) {
        return undefined;
      }

      container.innerHTML = "";
      const chart = lib.createChart(container, {
        width: Math.max(container.clientWidth || 0, 320),
        height: Math.max(container.clientHeight || 0, 280),
        layout: {
          background: { color: "#ffffff" },
          textColor: "#64748b",
          fontFamily: "Arial, sans-serif",
        },
        grid: {
          vertLines: { color: "#eef2f7" },
          horzLines: { color: "#eef2f7" },
        },
        crosshair: {
          mode: lib.CrosshairMode ? lib.CrosshairMode.Normal : 0,
          vertLine: { color: "rgba(37, 99, 235, 0.18)", width: 1, style: 0 },
          horzLine: { color: "rgba(37, 99, 235, 0.18)", width: 1, style: 0 },
        },
        rightPriceScale: {
          visible: true,
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        leftPriceScale: {
          visible: false,
        },
        timeScale: {
          borderColor: "#e2e8f0",
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 0,
          fixLeftEdge: true,
          lockVisibleTimeRangeOnResize: true,
          allowShiftVisibleRangeOnWhitespaceReplacement: false,
          barSpacing: labels.length > 365 ? 4 : labels.length > 180 ? 5 : 7,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: { locale: "ko-KR" },
      });

      const portfolioSeries = chart.addAreaSeries({
        lineColor: "#f6c445",
        topColor: "rgba(246, 196, 69, 0.22)",
        bottomColor: "rgba(246, 196, 69, 0.02)",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      });

      chart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
        if (!range || suppressRangeEventRef.current || typeof props.onRangeChange !== "function") {
          return;
        }
        props.onRangeChange({
          min: Math.max(0, Math.floor(Number(range.from || 0))),
          max: Math.max(0, Math.ceil(Number(range.to || 0))),
        });
      });

      const resizeObserver = new ResizeObserver(function (entries) {
        const entry = entries && entries[0];
        if (!entry || !chartRef.current) {
          return;
        }
        const width = Math.max(Math.round(entry.contentRect.width || 0), 320);
        const height = Math.max(Math.round(entry.contentRect.height || 0), 280);
        if (lastSizeRef.current.width === width && lastSizeRef.current.height === height) {
          return;
        }
        if (resizeFrameRef.current && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(resizeFrameRef.current);
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          resizeFrameRef.current = window.requestAnimationFrame(function () {
            resizeFrameRef.current = null;
            if (!chartRef.current) {
              return;
            }
            if (lastSizeRef.current.width === width && lastSizeRef.current.height === height) {
              return;
            }
            lastSizeRef.current = { width: width, height: height };
            chartRef.current.applyOptions({ width: width, height: height });
          });
          return;
        }
        lastSizeRef.current = { width: width, height: height };
        chartRef.current.applyOptions({ width: width, height: height });
      });
      resizeObserver.observe(container);

      chartRef.current = chart;
      portfolioSeriesRef.current = portfolioSeries;
      benchmarkSeriesRefs.current = {};

      return function () {
        resizeObserver.disconnect();
        if (resizeFrameRef.current && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        chart.remove();
        chartRef.current = null;
        portfolioSeriesRef.current = null;
        benchmarkSeriesRefs.current = {};
        lastSizeRef.current = { width: 0, height: 0 };
      };
    }, []);

    useEffect(function () {
      if (!portfolioSeriesRef.current || !chartRef.current) {
        return;
      }
      const lib = window.LightweightCharts;
      ensureArray(props.benchmarks).forEach(function (benchmark) {
        if (!benchmark || !benchmark.key || benchmarkSeriesRefs.current[benchmark.key]) {
          return;
        }
        benchmarkSeriesRefs.current[benchmark.key] = chartRef.current.addLineSeries({
          color: benchmark.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });
      });
      const portfolioRows = ensureArray(props.series).map(function (item) {
        return {
          time: String(item.date || ""),
          value: Number(item.return_pct || 0),
        };
      }).filter(function (item) {
        return item.time && Number.isFinite(item.value);
      });
      portfolioSeriesRef.current.setData(portfolioRows);
      ensureArray(props.benchmarks).forEach(function (benchmark) {
        const series = benchmarkSeriesRefs.current[benchmark.key];
        if (!series) {
          return;
        }
        const benchmarkRows = ensureArray(benchmark.rows).map(function (item) {
          return {
            time: String(item.date || ""),
            value: Number(item.return_pct || 0),
          };
        }).filter(function (item) {
          return item.time && Number.isFinite(item.value);
        });
        series.setData(benchmarkRows);
      });
      if (chartRef.current && !props.xRange) {
        chartRef.current.timeScale().fitContent();
      }
    }, [props.series, props.benchmarks]);

    useEffect(function () {
      if (!chartRef.current) {
        return;
      }
      if (!props.xRange || props.xRange.min == null || props.xRange.max == null) {
        suppressRangeEventRef.current = true;
        chartRef.current.timeScale().fitContent();
        window.setTimeout(function () {
          suppressRangeEventRef.current = false;
        }, 0);
        return;
      }
      suppressRangeEventRef.current = true;
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Number(props.xRange.min || 0),
        to: Number(props.xRange.max || 0),
      });
      window.setTimeout(function () {
        suppressRangeEventRef.current = false;
      }, 0);
    }, [props.xRange, props.resetSignal]);

    return h("div", { className: "chart-shell" }, h("div", { ref: containerRef, className: "tv-performance-chart-shell" }));
  }

  function buildDrawdownSeries(rows) {
    let peak = null;
    return ensureArray(rows).map(function (item) {
      const returnPct = Number(item && item.return_pct);
      if (!Number.isFinite(returnPct)) {
        return { date: item && item.date, drawdown_pct: null };
      }
      const equity = 100 + returnPct;
      if (peak == null || equity > peak) {
        peak = equity;
      }
      const drawdown = peak ? ((equity / peak) - 1) * 100 : 0;
      return {
        date: item.date,
        drawdown_pct: roundNumber(drawdown, 2),
      };
    });
  }

  function drawdownMin(rows) {
    const values = ensureArray(rows)
      .map(function (item) { return Number(item && item.drawdown_pct); })
      .filter(function (value) { return Number.isFinite(value); });
    if (!values.length) {
      return null;
    }
    return Math.min.apply(null, values);
  }

  function formatOptionalPercent(value, digits) {
    return value == null || !Number.isFinite(Number(value)) ? "-" : formatPercent(value, digits);
  }

  function PortfolioMddChart(props) {
    const labels = props.series.map(function (item) { return item.date; });
    const portfolioDrawdown = buildDrawdownSeries(props.series);
    const benchmarkDrawdown = buildDrawdownSeries(props.benchmark);
    const portfolioMdd = drawdownMin(portfolioDrawdown);
    const benchmarkMdd = drawdownMin(benchmarkDrawdown);
    const { canvasRef, chartRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Portfolio MDD",
              data: portfolioDrawdown.map(function (item) { return portfolioChartPoint(item.drawdown_pct); }),
              borderColor: "#ef4444",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              pointRadius: 1.8,
              pointHoverRadius: 4,
              tension: 0.14,
              borderWidth: 2,
              fill: true,
            },
            {
              label: "KOSPI MDD",
              data: benchmarkDrawdown.map(function (item) { return portfolioChartPoint(item.drawdown_pct); }),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.08)",
              pointRadius: 1.4,
              pointHoverRadius: 4,
              tension: 0.12,
              borderWidth: 2,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          animation: false,
          scales: {
            x: {
              ticks: {
                color: "#111827",
                maxTicksLimit: 12,
                callback: function (value, index) {
                  return formatDateLabel(labels[index]);
                },
              },
              grid: { color: "#e5e7eb" },
              min: props.xRange ? props.xRange.min : undefined,
              max: props.xRange ? props.xRange.max : undefined,
            },
            y: {
              max: 0,
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 1) + "%"; },
              },
              grid: { color: "#e5e7eb" },
            },
          },
          plugins: {
            legend: { labels: { color: "#111827", font: { weight: "700" } } },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  return context.dataset.label + ": " + formatOptionalPercent(context.raw, 2);
                },
                footer: function () {
                  return "MDD  Portfolio " + formatOptionalPercent(portfolioMdd, 2) + " / KOSPI " + formatOptionalPercent(benchmarkMdd, 2);
                },
              },
            },
          },
        },
      });
    }, [props.series, props.benchmark, props.xRange]);

    useEffect(function () {
      if (!chartRef.current) {
        return;
      }
      const chart = chartRef.current;
      if (!props.xRange) {
        chart.options.scales.x.min = undefined;
        chart.options.scales.x.max = undefined;
      } else {
        chart.options.scales.x.min = props.xRange.min;
        chart.options.scales.x.max = props.xRange.max;
      }
      chart.update("none");
    }, [props.xRange, props.series, props.benchmark]);

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "summary-grid summary-grid-small", style: { marginBottom: "12px" } },
        h(SummaryCard, { label: "Portfolio MDD", value: formatOptionalPercent(portfolioMdd, 2), help: "선택 기간 고점 대비 최대 하락률" }),
        h(SummaryCard, { label: "KOSPI MDD", value: formatOptionalPercent(benchmarkMdd, 2), help: "동일 기간 코스피 최대 하락률" })
      ),
      h("div", { className: "chart-shell" }, h("canvas", { ref: canvasRef }))
    );
  }

  function pnlClass(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return "flat";
    return number > 0 ? "positive" : "negative";
  }

  function PortfolioContributionChart(props) {
    const rows = ensureArray(props.rows).slice(0, props.limit || 20);
    const labels = rows.map(function (item) {
      return item.resolved_name || item.stock_name || item.stock_code || "-";
    });
    const values = rows.map(function (item) { return Number(item.total_pnl || 0); });
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "지수 종가",
              data: values,
              backgroundColor: values.map(function (value) {
                return value >= 0 ? "rgba(220, 38, 38, 0.72)" : "rgba(37, 99, 235, 0.72)";
              }),
              borderColor: values.map(function (value) {
                return value >= 0 ? "#dc2626" : "#2563eb";
              }),
              borderWidth: 1,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: {
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value / 1000000, 0) + "백만"; },
              },
              grid: { color: "#e5e7eb" },
            },
            y: {
              ticks: { color: "#111827", font: { weight: "700" } },
              grid: { display: false },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  const row = rows[context.dataIndex] || {};
                  return [
                    "총 손익: " + formatCurrency(row.total_pnl),
                    "실현: " + formatCurrency(row.realized_pnl),
                    "미실현: " + formatCurrency(row.unrealized_pnl),
                    "기여도: " + formatPercent(row.contribution_pct_points, 3),
                  ];
                },
              },
            },
          },
        },
      });
    }, [props.rows, props.limit]);
    return h("div", { className: "chart-shell portfolio-tail-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function PortfolioTradeAnalysisPanel(props) {
    const analysis = props.analysis || {};
    const tailSummary = analysis.tail_summary || {};
    const stockRows = ensureArray(analysis.stocks);
    const worstRows = ensureArray(tailSummary.worst_stocks);
    const topRows = ensureArray(analysis.top_contributors);
    const sectorRows = ensureArray(analysis.sectors);
    const roundTrips = ensureArray(analysis.round_trips);
    if (!stockRows.length) {
      return h("div", { className: "panel" }, h(SectionTitle, null, "꼬리 손실 분석"), EmptyState({ message: "거래 분석 데이터가 없습니다." }));
    }
    return h(
      "div",
      { className: "panel portfolio-trade-analysis-panel" },
      h("div", { className: "section-toolbar" },
        h("div", null, h(SectionTitle, null, "꼬리 손실 / 주요 기여 분석"), h("div", { className: "summary-help" }, "매수·매도 단가와 종목별 손익을 기준으로 꼬리 종목을 찾습니다.")),
        h("span", { className: "summary-help" }, "손실 후보 " + numberFormat(tailSummary.tail_stock_count, 0) + "개")
      ),
      h(
        "div",
        { className: "summary-grid summary-grid-small" },
        h(SummaryCard, { label: "꼬리 손실 합계", value: formatCurrency(tailSummary.tail_loss_pnl), help: "총 손익이 음수인 후보 합산" }),
        h(SummaryCard, { label: "꼬리 기여도", value: formatPercent(tailSummary.tail_loss_contribution_pct_points, 3), help: "누적 수익률을 깎은 폭" }),
        h(SummaryCard, { label: "분석 종목 수", value: numberFormat(stockRows.length, 0) + "개", help: "매수/매도 또는 기여도 발생 종목" })
      ),
      h(
        "div",
        { className: "portfolio-analysis-grid" },
        h(
          "div",
          null,
          h("div", { className: "subsection-title" }, "손실 기여 상위 차트"),
          h(PortfolioContributionChart, { rows: worstRows, limit: 12 })
        ),
        h(
          "div",
          null,
          h("div", { className: "subsection-title" }, "수익 기여 상위 차트"),
          h(PortfolioContributionChart, { rows: topRows, limit: 12 })
        )
      ),
      h("div", { className: "subsection-title" }, "매수-매도 라운드트립 손실 상위"),
      h(DataTable, {
        rows: worstRows,
        emptyMessage: "손실 후보가 없습니다.",
        columns: [
          { key: "stock_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || "-"; } },
          { key: "sector", label: "섹터" },
          { key: "avg_buy_price", label: "평균 매수가", render: function (row) { return numberFormat(row.avg_buy_price, 0); } },
          { key: "avg_sell_price", label: "평균 매도가", render: function (row) { return numberFormat(row.avg_sell_price, 0); } },
          { key: "realized_pnl", label: "실현 손익", className: "num-cell", render: function (row) { return h("span", { className: pnlClass(row.realized_pnl) }, formatCurrency(row.realized_pnl)); } },
          { key: "unrealized_pnl", label: "미실현 손익", className: "num-cell", render: function (row) { return h("span", { className: pnlClass(row.unrealized_pnl) }, formatCurrency(row.unrealized_pnl)); } },
          { key: "total_pnl", label: "총 손익", className: "num-cell", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatCurrency(row.total_pnl)); } },
          { key: "contribution_pct_points", label: "기여도", render: function (row) { return formatPercent(row.contribution_pct_points, 3); } },
        ],
      }),
      h("div", { className: "subsection-title" }, "섹터별 기여도"),
      h(DataTable, {
        rows: sectorRows,
        emptyMessage: "매도 완료된 거래가 없습니다.",
        columns: [
          { key: "sector", label: "섹터" },
          { key: "stock_count", label: "종목 수", render: function (row) { return numberFormat(row.stock_count, 0); } },
          { key: "winners", label: "수익/손실", render: function (row) { return numberFormat(row.winners, 0) + " / " + numberFormat(row.losers, 0); } },
          { key: "realized_pnl", label: "실현 손익", render: function (row) { return h("span", { className: pnlClass(row.realized_pnl) }, formatCurrency(row.realized_pnl)); } },
          { key: "total_pnl", label: "총 손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatCurrency(row.total_pnl)); } },
          { key: "contribution_pct_points", label: "기여도", render: function (row) { return formatPercent(row.contribution_pct_points, 3); } },
        ],
      }),
      h("div", { className: "subsection-title" }, "매수-매도 라운드트립 상세"),
      h(DataTable, {
        rows: roundTrips,
        emptyMessage: "매도 완료된 거래가 없습니다.",
        columns: [
          { key: "stock_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || "-"; } },
          { key: "sector", label: "섹터" },
          { key: "buy_date", label: "매수일" },
          { key: "sell_date", label: "매도일" },
          { key: "avg_buy_price", label: "매수가", render: function (row) { return numberFormat(row.avg_buy_price, 0); } },
          { key: "sell_price", label: "매도가", render: function (row) { return numberFormat(row.sell_price, 0); } },
          { key: "realized_pnl", label: "실현 손익", render: function (row) { return h("span", { className: pnlClass(row.realized_pnl) }, formatCurrency(row.realized_pnl)); } },
          { key: "return_pct", label: "수익률", render: function (row) { return formatPercent(row.return_pct, 2); } },
        ],
      })
    );
  }

  function StrategyBacktestChart(props) {
    const rows = ensureArray(props.rows);
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const rowsRef = useRef(rows);
    const visibleBaseIndexRef = useRef(0);
    const [hoverData, setHoverData] = useState(null);

    useEffect(function () {
      rowsRef.current = rows;
    }, [rows]);

    const buildNormalizedSeriesData = function (sourceRows, baseIndex) {
      const safeRows = ensureArray(sourceRows);
      if (!safeRows.length) {
        return { benchmarkData: [], strategyData: [] };
      }
      const clampedBaseIndex = Math.max(0, Math.min(safeRows.length - 1, Number.isFinite(baseIndex) ? baseIndex : 0));
      const baseRow = safeRows[clampedBaseIndex] || {};
      const baseBenchmarkNavRaw = Number(baseRow.benchmark_nav);
      const baseStrategyNavRaw = Number(baseRow.nav);
      const fallbackBaseBenchmark = 100 + Number(baseRow.benchmark_return_pct || 0);
      const fallbackBaseStrategy = 100 + Number(baseRow.strategy_return_pct || 0);
      const safeBaseBenchmarkNav = Number.isFinite(baseBenchmarkNavRaw) && baseBenchmarkNavRaw > 0
        ? baseBenchmarkNavRaw
        : (Number.isFinite(fallbackBaseBenchmark) && fallbackBaseBenchmark > 0 ? fallbackBaseBenchmark : 100);
      const safeBaseStrategyNav = Number.isFinite(baseStrategyNavRaw) && baseStrategyNavRaw > 0
        ? baseStrategyNavRaw
        : (Number.isFinite(fallbackBaseStrategy) && fallbackBaseStrategy > 0 ? fallbackBaseStrategy : 100);
      const benchmarkData = [];
      const strategyData = [];
      safeRows.forEach(function (item) {
        const time = String(item.date || "").slice(0, 10);
        const benchmarkNavRaw = Number(item && item.benchmark_nav);
        const strategyNavRaw = Number(item && item.nav);
        const fallbackBenchmarkNav = 100 + Number(item && item.benchmark_return_pct || 0);
        const fallbackStrategyNav = 100 + Number(item && item.strategy_return_pct || 0);
        const benchmarkNav = Number.isFinite(benchmarkNavRaw) && benchmarkNavRaw >= 0
          ? benchmarkNavRaw
          : (Number.isFinite(fallbackBenchmarkNav) && fallbackBenchmarkNav >= 0 ? fallbackBenchmarkNav : null);
        const strategyNav = Number.isFinite(strategyNavRaw) && strategyNavRaw >= 0
          ? strategyNavRaw
          : (Number.isFinite(fallbackStrategyNav) && fallbackStrategyNav >= 0 ? fallbackStrategyNav : null);
        if (time && benchmarkNav != null) {
          benchmarkData.push({ time: time, value: ((benchmarkNav / safeBaseBenchmarkNav) - 1.0) * 100.0 });
        }
        if (time && strategyNav != null) {
          strategyData.push({ time: time, value: ((strategyNav / safeBaseStrategyNav) - 1.0) * 100.0 });
        }
      });
      return {
        benchmarkData: benchmarkData,
        strategyData: strategyData,
      };
    };

    const chartTimeToIso = function (time) {
      if (!time) {
        return "";
      }
      if (typeof time === "string") {
        return String(time).slice(0, 10);
      }
      if (time && typeof time.year === "number") {
        return String(time.year) + "-" + String(time.month || 1).padStart(2, "0") + "-" + String(time.day || 1).padStart(2, "0");
      }
      return "";
    };

    const applyNormalizedSeries = function (baseIndex, preserveRange) {
      const chart = chartRef.current;
      const series = seriesRef.current;
      const sourceRows = rowsRef.current;
      if (!chart || !series) {
        return;
      }
      const range = preserveRange && chart.timeScale() && typeof chart.timeScale().getVisibleLogicalRange === "function"
        ? chart.timeScale().getVisibleLogicalRange()
        : null;
      const normalized = buildNormalizedSeriesData(sourceRows, baseIndex);
      series.benchmarkSeries.setData(normalized.benchmarkData);
      series.strategySeries.setData(normalized.strategyData);
      if (range && chart.timeScale() && typeof chart.timeScale().setVisibleLogicalRange === "function") {
        chart.timeScale().setVisibleLogicalRange(range);
      }
    };

    useEffect(function () {
      const container = containerRef.current;
      const lib = window.LightweightCharts;
      if (!container || !lib || chartRef.current) {
        return undefined;
      }

      container.innerHTML = "";
      const chart = lib.createChart(container, {
        width: Math.max(container.clientWidth || 0, 320),
        height: Math.max(container.clientHeight || 0, 320),
        layout: {
          background: { color: "#ffffff" },
          textColor: "#64748b",
          fontFamily: "Arial, sans-serif",
        },
        grid: {
          vertLines: { color: "#eef2f7" },
          horzLines: { color: "#eef2f7" },
        },
        crosshair: {
          mode: lib.CrosshairMode ? lib.CrosshairMode.Normal : 0,
          vertLine: { color: "rgba(37, 99, 235, 0.16)", width: 1, style: 0 },
          horzLine: { color: "rgba(37, 99, 235, 0.16)", width: 1, style: 0 },
        },
        rightPriceScale: {
          visible: true,
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        timeScale: {
          borderColor: "#e2e8f0",
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 2,
          barSpacing: rows.length > 1200 ? 2 : rows.length > 700 ? 2.8 : rows.length > 365 ? 3.8 : 5.4,
          tickMarkFormatter: function (time) {
            const iso = typeof time === "string"
              ? time
              : time && typeof time.year === "number"
                ? String(time.year) + "-" + String(time.month || 1).padStart(2, "0") + "-" + String(time.day || 1).padStart(2, "0")
                : "";
            return formatYearMonthLabel(iso);
          },
        },
        localization: {
          locale: "ko-KR",
          priceFormatter: function (value) { return numberFormat(value, 1) + "%"; },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });
      chartRef.current = chart;

      const benchmarkSeries = chart.addLineSeries({
        color: "#111827",
        lineWidth: 2.2,
        crosshairMarkerRadius: 4,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      const strategySeries = chart.addLineSeries({
        color: "#f59e0b",
        lineWidth: 2.6,
        crosshairMarkerRadius: 4,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      seriesRef.current = {
        benchmarkSeries: benchmarkSeries,
        strategySeries: strategySeries,
      };

      const handleCrosshairMove = function (param) {
        if (!param || !param.point || !param.time || !container) {
          setHoverData(null);
          return;
        }
        const point = param.point;
        const width = container.clientWidth || 0;
        const height = container.clientHeight || 0;
        if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
          setHoverData(null);
          return;
        }
        const iso = chartTimeToIso(param.time);
        if (!iso) {
          setHoverData(null);
          return;
        }
        const sourceRows = rowsRef.current;
        const row = sourceRows.find(function (item) {
          return String(item && item.date || "").slice(0, 10) === iso;
        }) || null;
        if (!row) {
          setHoverData(null);
          return;
        }
        const holdings = ensureArray(row.holdings)
          .filter(function (item) { return Number(item && item.weight_pct) > 0; })
          .slice()
          .sort(function (a, b) { return Number(b && b.weight_pct || 0) - Number(a && a.weight_pct || 0); });
        setHoverData({
          date: iso,
          benchmark: Number(row.benchmark_return_pct),
          strategy: Number(row.strategy_return_pct),
          holdings: holdings.slice(0, 12),
          holdingsCount: holdings.length,
        });
      };
      if (typeof chart.subscribeCrosshairMove === "function") {
        chart.subscribeCrosshairMove(handleCrosshairMove);
      }

      const handleVisibleRangeChange = function (range) {
        if (!range || !Number.isFinite(range.from)) {
          return;
        }
        const nextBaseIndex = Math.max(0, Math.min(rowsRef.current.length - 1, Math.floor(range.from)));
        if (nextBaseIndex === visibleBaseIndexRef.current) {
          return;
        }
        visibleBaseIndexRef.current = nextBaseIndex;
        applyNormalizedSeries(nextBaseIndex, true);
      };
      if (chart.timeScale() && typeof chart.timeScale().subscribeVisibleLogicalRangeChange === "function") {
        chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      }

      const resize = function () {
        if (!container || !chartRef.current) {
          return;
        }
        chartRef.current.applyOptions({
          width: Math.max(container.clientWidth || 0, 320),
          height: Math.max(container.clientHeight || 0, 320),
        });
      };

      let observer = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      } else {
        window.addEventListener("resize", resize);
      }

      return function () {
        if (loadMoreTimerRef.current) {
          clearTimeout(loadMoreTimerRef.current);
          loadMoreTimerRef.current = null;
        }
        if (observer) {
          observer.disconnect();
        } else {
          window.removeEventListener("resize", resize);
        }
        setHoverData(null);
        if (chart && typeof chart.unsubscribeCrosshairMove === "function") {
          chart.unsubscribeCrosshairMove(handleCrosshairMove);
        }
        if (chart && chart.timeScale() && typeof chart.timeScale().unsubscribeVisibleLogicalRangeChange === "function") {
          chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
        }
        seriesRef.current = null;
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        if (container) {
          container.innerHTML = "";
        }
      };
    }, []);

    useEffect(function () {
      const chart = chartRef.current;
      if (!chart || !rows.length) {
        return;
      }
      visibleBaseIndexRef.current = 0;
      applyNormalizedSeries(0, false);
      if (chart.timeScale()) {
        chart.timeScale().fitContent();
      }
    }, [rows]);

    return h(
      "div",
      { className: "chart-shell strategy-chart-shell strategy-lightweight-shell" },
      h("div", { ref: containerRef, className: "strategy-lightweight-host" }),
      h(
        "div",
        { className: "score-history-lightweight-legend strategy-lightweight-legend" },
        h("span", null, h("i", { className: "benchmark" }), props.indexName || "Index"),
        h("span", null, h("i", { className: "strategy" }), props.strategyName || "Strategy")
      ),
      hoverData
        ? h(
            "div",
            { className: "strategy-lightweight-hover-card" },
            h(
              "div",
              { className: "strategy-lightweight-hover-head" },
              h("strong", null, hoverData.date),
              h("span", null, (props.indexName || "Index") + " " + formatPercent(hoverData.benchmark, 2)),
              h("span", null, (props.strategyName || "Strategy") + " " + formatPercent(hoverData.strategy, 2))
            ),
            hoverData.holdingsCount
              ? h(
                  "div",
                  { className: "strategy-lightweight-hover-body" },
                  h("div", { className: "strategy-lightweight-hover-title" }, "보유 종목 " + numberFormat(hoverData.holdingsCount, 0) + "개"),
                  hoverData.holdings.map(function (item, index) {
                    const stockName = String((item && (item.stock_name || item.stock_code)) || "-");
                    return h(
                      "div",
                      { key: stockName + "-" + index, className: "strategy-lightweight-hover-row" },
                      h("span", null, stockName),
                      h("strong", null, formatPercent(item.weight_pct, 2))
                    );
                  })
                )
              : h("div", { className: "strategy-lightweight-hover-empty" }, "보유 종목 없음")
          )
        : null
    );
  }

  function StrategyRsiChart(props) {
    const rows = ensureArray(props.rows);
    const labels = rows.map(function (item) { return item.date; });
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "RSI(14)",
              data: rows.map(function (item) {
                return item.rsi14 == null || !Number.isFinite(Number(item.rsi14)) ? null : Number(item.rsi14);
              }),
              borderColor: "#0f766e",
              backgroundColor: "rgba(15, 118, 110, 0.08)",
              pointRadius: 0,
              pointHoverRadius: 3,
              tension: 0.16,
              borderWidth: 1.8,
            },
            {
              label: "과매수 70",
              data: labels.map(function () { return 70; }),
              borderColor: "rgba(239, 68, 68, 0.55)",
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1,
            },
            {
              label: "과매도 30",
              data: labels.map(function () { return 30; }),
              borderColor: "rgba(37, 99, 235, 0.55)",
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: {
                color: "#111827",
                maxTicksLimit: 10,
                callback: function (value, index) {
                  return formatDateLabel(labels[index]);
                },
              },
              grid: { color: "#eef2f7" },
            },
            y: {
              min: 0,
              max: 100,
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 0); },
              },
              grid: { color: "#e5e7eb" },
            },
          },
          plugins: {
            legend: { labels: { color: "#111827", font: { weight: "800" } } },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  return context.dataset.label + ": " + numberFormat(context.raw, 1);
                },
              },
            },
            zoom: {
              pan: { enabled: true, mode: "x", modifierKey: null },
              zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: true }, mode: "x" },
            },
          },
        },
      });
    }, [props.rows]);

    return h("div", { className: "chart-shell strategy-rsi-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function SectorRotationBacktestChart(props) {
    const rows = ensureArray(props.rows);
    const labels = rows.map(function (item) { return item.date; });
    const tradeLog = ensureArray(props.tradeLog);
    const tradeByDate = {};
    tradeLog.forEach(function (item) {
      const dateKey = String(item.apply_date || item.date || "");
      if (!dateKey) {
        return;
      }
      if (!tradeByDate[dateKey]) {
        tradeByDate[dateKey] = { buy: 0, sell: 0, rows: [] };
      }
      const action = String(item.action || "");
      if (action === "매수" || action === "증액") {
        tradeByDate[dateKey].buy += 1;
      } else if (action === "매도" || action === "감액") {
        tradeByDate[dateKey].sell += 1;
      }
      tradeByDate[dateKey].rows.push(item);
    });
    const selectedDate = String(props.selectedDate || "");
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: props.strategyName || "섹터 로테이션",
              data: rows.map(function (item) { return portfolioChartPoint(item.strategy_return_pct); }),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.12)",
              yAxisID: "yReturn",
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.18,
              borderWidth: 2.4,
            },
            {
              label: props.benchmarkName || "비교군",
              data: rows.map(function (item) { return portfolioChartPoint(item.benchmark_return_pct); }),
              borderColor: "#111827",
              backgroundColor: "rgba(17, 24, 39, 0.08)",
              yAxisID: "yReturn",
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.18,
              borderWidth: 2,
            },
            {
              label: "선택일",
              data: rows.map(function (item) {
                return item.exposure_pct == null ? null : Number(item.exposure_pct);
              }),
              type: "bar",
              yAxisID: "yExposure",
              backgroundColor: "rgba(14, 165, 233, 0.14)",
              borderColor: "rgba(14, 165, 233, 0.28)",
              borderWidth: 1,
              order: 3,
            },
            {
              label: "선택일",
              data: rows.map(function (item) {
                const group = tradeByDate[item.date];
                return group && group.buy ? portfolioChartPoint(item.strategy_return_pct) : null;
              }),
              borderColor: "#ef4444",
              backgroundColor: "#ef4444",
              yAxisID: "yReturn",
              pointRadius: rows.map(function (item) {
                const group = tradeByDate[item.date];
                return group && group.buy ? Math.min(7, 3 + group.buy * 0.45) : 0;
              }),
              pointHoverRadius: 7,
              showLine: false,
              order: 0,
            },
            {
              label: "선택일",
              data: rows.map(function (item) {
                const group = tradeByDate[item.date];
                return group && group.sell ? portfolioChartPoint(item.strategy_return_pct) : null;
              }),
              borderColor: "#2563eb",
              backgroundColor: "#2563eb",
              yAxisID: "yReturn",
              pointRadius: rows.map(function (item) {
                const group = tradeByDate[item.date];
                return group && group.sell ? Math.min(7, 3 + group.sell * 0.45) : 0;
              }),
              pointHoverRadius: 7,
              showLine: false,
              order: 0,
            },
            {
              label: "선택일",
              data: rows.map(function (item) {
                return selectedDate && item.date === selectedDate ? portfolioChartPoint(item.strategy_return_pct) : null;
              }),
              borderColor: "#f59e0b",
              backgroundColor: "#f59e0b",
              yAxisID: "yReturn",
              pointStyle: "rectRot",
              pointRadius: 7,
              pointHoverRadius: 9,
              showLine: false,
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          onClick: function (event, elements, chart) {
            if (typeof props.onSelectDate !== "function") {
              return;
            }
            const points = chart.getElementsAtEventForMode(event, "index", { intersect: false }, false);
            if (!points.length) {
              return;
            }
            const date = labels[points[0].index];
            if (date) {
              props.onSelectDate(date);
            }
          },
          scales: {
            x: {
              ticks: {
                color: "#111827",
                maxTicksLimit: 12,
                callback: function (value, index) {
                  return formatDateLabel(labels[index]);
                },
              },
              grid: { color: "#e5e7eb" },
            },
            yReturn: {
              position: "left",
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 1) + "%"; },
              },
              grid: { color: "#e5e7eb" },
            },
            yExposure: {
              position: "right",
              min: 0,
              max: 260,
              ticks: {
                color: "#475569",
                callback: function (value) { return numberFormat(value, 0) + "%"; },
              },
              grid: { drawOnChartArea: false },
            },
          },
          plugins: {
            legend: { labels: { color: "#111827", font: { weight: "800" } } },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  if (context.dataset.yAxisID === "yExposure") {
                    return context.dataset.label + ": " + formatPercent(context.raw, 1);
                  }
                  return context.dataset.label + ": " + formatPercent(context.raw, 2);
                },
                afterBody: function (items) {
                  if (!items.length) {
                    return "";
                  }
                  const row = rows[items[0].dataIndex] || {};
                  const group = tradeByDate[row.date] || { rows: [] };
                  const sectors = ensureArray(row.selected_sectors).map(function (item) {
                    return item.sector + " " + formatPercent(item.target_weight_pct, 1);
                  });
                  const tradePreview = ensureArray(group.rows).slice(0, 6).map(function (item) {
                    return (item.action || "") + " " + (item.stock_name || item.stock_code || "") + " " + formatPercent(item.after_weight_pct, 1);
                  });
                  return [
                    "신호일: " + (row.signal_date || "-"),
                    "일수익: " + formatPercent(row.daily_return_pct, 2),
                    "회전율: " + formatPercent(row.turnover_pct, 1),
                    "수수료: " + formatPercent(row.fee_pct, 2),
                    sectors.length ? "섹터: " + sectors.join(" · ") : "",
                    tradePreview.length ? "매매: " + tradePreview.join(" · ") : "",
                  ].filter(Boolean);
                },
              },
            },
            zoom: {
              pan: { enabled: true, mode: "x", modifierKey: null },
              zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: true }, mode: "x" },
            },
          },
        },
      });
    }, [props.rows, props.strategyName, props.benchmarkName, props.tradeLog, props.selectedDate]);

    return h("div", { className: "chart-shell strategy-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function PortfolioDiagnosticChart(props) {
    const rows = ensureArray(props.rows);
    const labels = rows.map(function (item) { return item.date; });
    const scenarios = [
      { key: "actual", label: "현재 방식", color: "#111827" },
      { key: "tail_cash", label: "사후 꼬리·현금", color: "#93c5fd" },
      { key: "tail_index", label: "사후 꼬리·지수", color: "#86efac" },
      { key: "rule_tail_cash", label: "실전 꼬리룰·현금", color: "#2563eb" },
      { key: "rule_tail_index", label: "실전 꼬리룰·지수", color: "#16a34a" },
      { key: "market_filter", label: "시장필터", color: "#f97316" },
      { key: "sector_gate", label: "섹터신호 게이트", color: "#8b5cf6" },
      { key: "combined", label: "결합 개선", color: "#dc2626" },
    ];
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: scenarios.map(function (scenario) {
            return {
              label: scenario.label,
              data: rows.map(function (item) { return portfolioChartPoint(item[scenario.key + "_return_pct"]); }),
              borderColor: scenario.color,
              backgroundColor: scenario.color,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.18,
              borderWidth: scenario.key === "actual" ? 2.6 : 2,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: {
                color: "#111827",
                maxTicksLimit: 12,
                callback: function (value, index) { return formatDateLabel(labels[index]); },
              },
              grid: { color: "#e5e7eb" },
            },
            y: {
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 1) + "%"; },
              },
              grid: { color: "#e5e7eb" },
            },
          },
          plugins: {
            legend: { labels: { color: "#111827", font: { weight: "800" } } },
            tooltip: {
              callbacks: {
                title: function (items) { return items.length ? labels[items[0].dataIndex] : ""; },
                label: function (context) { return context.dataset.label + ": " + formatPercent(context.raw, 2); },
                afterBody: function (items) {
                  if (!items.length) return "";
                  const row = rows[items[0].dataIndex] || {};
                  return [
                    "실전 꼬리 기여: " + formatPercent(row.rule_tail_contribution_pct, 2),
                    "실전 꼬리 비중: " + formatPercent(row.rule_tail_weight_pct, 1),
                    "사후 꼬리 기여: " + formatPercent(row.tail_contribution_pct, 2),
                    "시장필터: x" + numberFormat(row.market_multiplier, 2) + " · " + (row.market_label || "-"),
                  ];
                },
              },
            },
            zoom: {
              pan: { enabled: true, mode: "x", modifierKey: null },
              zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: true }, mode: "x" },
            },
          },
        },
      });
    }, [props.rows]);
    return h("div", { className: "chart-shell strategy-chart-shell diagnostic-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function AllocationChart(props) {
    const allocations = ensureArray(props.allocations);
    const labels = allocations.map(function (item) { return item.date; });
    const datasets = buildAllocationDatasets(allocations, props.mode);
    const yMax = computeAllocationMax(allocations, props.mode);
    const { canvasRef, chartRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              stacked: true,
              min: props.xRange ? props.xRange.min : undefined,
              max: props.xRange ? props.xRange.max : undefined,
              ticks: {
                color: "#111827",
                maxTicksLimit: 12,
                callback: function (value, index) {
                  return formatDateLabel(labels[index]);
                },
              },
              grid: { color: "#e5e7eb" },
            },
            y: {
              stacked: true,
              min: 0,
              max: yMax,
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 0) + "%"; },
              },
              grid: { color: "#e5e7eb" },
            },
          },
          plugins: {
            legend: {
              labels: { color: "#111827", boxWidth: 12, font: { weight: "700" } },
            },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  if (!context || !Number(context.raw)) {
                    return null;
                  }
                  return context.dataset.label + ": " + formatPercent(context.raw, 2);
                },
              },
              filter: function (context) {
                return Number(context.raw) !== 0;
              },
            },
          },
        },
      });
    }, [props.allocations, props.mode, props.xRange]);

    useEffect(function () {
      if (!chartRef.current) {
        return;
      }
      const chart = chartRef.current;
      chart.options.scales.x.min = props.xRange ? props.xRange.min : undefined;
      chart.options.scales.x.max = props.xRange ? props.xRange.max : undefined;
      chart.update("none");
    }, [props.xRange]);

    return h("div", { className: "allocation-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function ScoreHistoryChart(props) {
    const rows = ensureArray(props.rows);
    if (!props.forceClassic && window.LightweightCharts && rows.length) {
      return h(LightweightScoreHistoryChart, {
        rows: rows,
        markers: props.markers,
        hasMore: !!props.hasMore,
        loadingMore: !!props.loadingMore,
        onNeedMore: props.onNeedMore,
      });
    }
    const labels = rows.map(function (item) { return item.date; });
    const scoreData = rows.map(function (item) { return portfolioChartPoint(item.score); });
    const markerMap = {};
    ensureArray(props.markers).forEach(function (marker) {
      if (!marker || !marker.date) return;
      const markerType = String(marker.type || "").toLowerCase();
      if (!markerMap[marker.date]) markerMap[marker.date] = [];
      markerMap[marker.date].push(markerType);
    });
    const scoreValues = scoreData.filter(function (value) { return Number.isFinite(Number(value)); }).map(function (value) { return Number(value); });
    var scoreAxisMin = 0;
    var scoreAxisMax = 100;
    if (scoreValues.length) {
      var localMin = Math.min.apply(null, scoreValues);
      var localMax = Math.max.apply(null, scoreValues);
      var span = Math.max(localMax - localMin, 8);
      var pad = Math.max(span * 0.2, 4);
      scoreAxisMin = Math.floor((localMin - pad) * 10) / 10;
      scoreAxisMax = Math.ceil((localMax + pad) * 10) / 10;
      if (scoreAxisMin < -100000) scoreAxisMin = -100000;
      if (scoreAxisMax <= scoreAxisMin) scoreAxisMax = scoreAxisMin + 10;
    }
    const priceNormalizedFromApi = rows.map(function (item) {
      var normalized = Number(item && item.close_normalized);
      return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
    });
    const hasNormalizedApi = priceNormalizedFromApi.some(function (value) { return value != null; });
    const priceRaw = rows.map(function (item) {
      var close = Number(item && item.close);
      return Number.isFinite(close) && close > 0 ? close : null;
    });
    var firstPrice = null;
    for (var pi = 0; pi < priceRaw.length; pi += 1) {
      if (priceRaw[pi] != null) {
        firstPrice = priceRaw[pi];
        break;
      }
    }
    const priceNormalized = hasNormalizedApi
      ? priceNormalizedFromApi
      : (firstPrice
        ? priceRaw.map(function (value) { return value == null ? null : (value / firstPrice) * 100; })
        : []);
    const buyMarkerData = labels.map(function (dateText, idx) {
      const list = markerMap[dateText] || [];
      return list.indexOf("buy") >= 0 ? scoreData[idx] : null;
    });
    const sellMarkerData = labels.map(function (dateText, idx) {
      const list = markerMap[dateText] || [];
      return list.indexOf("sell") >= 0 ? scoreData[idx] : null;
    });
    const { canvasRef } = useChartLifecycle(function (canvas) {
      const datasets = [
        {
          label: "주가(정규화)",
          data: priceNormalized,
          yAxisID: "yPrice",
          borderColor: "rgba(71, 85, 105, 0.35)",
          backgroundColor: "rgba(71, 85, 105, 0.06)",
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.15,
          borderWidth: 1.5,
          fill: false,
        },
        {
          label: "종합점수",
          data: scoreData,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          pointBackgroundColor: "#2563eb",
          pointBorderColor: "#ffffff",
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.2,
          borderWidth: 2.4,
          fill: true,
        },
      ];
      if (buyMarkerData.some(function (v) { return v != null; })) {
        datasets.push({
          label: "매수",
          data: buyMarkerData,
          borderColor: "#16a34a",
          backgroundColor: "#16a34a",
          pointBackgroundColor: "#16a34a",
          pointBorderColor: "#ffffff",
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          fill: false,
        });
      }
      if (sellMarkerData.some(function (v) { return v != null; })) {
        datasets.push({
          label: "매도",
          data: sellMarkerData,
          borderColor: "#dc2626",
          backgroundColor: "#dc2626",
          pointBackgroundColor: "#dc2626",
          pointBorderColor: "#ffffff",
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          fill: false,
        });
      }
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: {
                color: "#64748b",
                maxTicksLimit: 8,
                callback: function (value, index) {
                  return formatDateLabel(labels[index]);
                },
              },
              grid: { color: "#eef2f7" },
            },
            y: {
              min: scoreAxisMin,
              max: scoreAxisMax,
              ticks: {
                color: "#64748b",
                callback: function (value) { return numberFormat(value, 0); },
              },
              grid: { color: "#eef2f7" },
            },
            yPrice: {
              display: false,
              position: "right",
              grid: { display: false, drawBorder: false },
              ticks: { display: false },
            },
          },
          plugins: {
            legend: { display: true },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  const row = rows[context.dataIndex] || {};
                  if (context.dataset && context.dataset.label === "섹터 진입 신호") {
                    return "\uc885\uac00: " + (row.close != null ? numberFormat(row.close, 0) : "-");
                  }
                  return [
                    "점수: " + numberFormat(context.raw, 2),
                    "\uc885\uac00: " + (row.close != null ? numberFormat(row.close, 0) : "-"),
                    "등락률: " + formatPercent(row.change_pct, 2),
                    "순위: " + numberFormat(row.rank, 0) + "위",
                  ];
                },
              },
            },
          },
        },
      });
    }, [props.rows]);

    return h("div", { className: "score-history-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function LightweightScoreHistoryChart(props) {
    const rows = ensureArray(props.rows);
    const markers = ensureArray(props.markers);
    const INITIAL_VISIBLE_BARS = 120;
    const LOAD_MORE_THRESHOLD = 14;
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const didFitContentRef = useRef(false);
    const didSetInitialRangeRef = useRef(false);
    const onNeedMoreRef = useRef(props.onNeedMore);
    const loadingMoreRef = useRef(!!props.loadingMore);
    const hasMoreRef = useRef(props.hasMore !== false);
    const earliestDateRef = useRef("");
    const visibleRangeRef = useRef(null);
    const previousRowsLengthRef = useRef(rows.length);
    const previousEarliestDateRef = useRef(rows.length ? String(rows[0].date || "") : "");
    const lastRequestedEarliestDateRef = useRef("");
    const requestMoreForRangeRef = useRef(function () {});
    const loadMoreTimerRef = useRef(null);

    useEffect(function () {
      onNeedMoreRef.current = props.onNeedMore;
      loadingMoreRef.current = !!props.loadingMore;
      hasMoreRef.current = props.hasMore !== false;
      earliestDateRef.current = rows.length ? String(rows[0].date || "") : "";
    }, [props.onNeedMore, props.loadingMore, props.hasMore, props.rows]);

    useEffect(function () {
      const container = containerRef.current;
      const lib = window.LightweightCharts;
      if (!container || !lib || chartRef.current) {
        return undefined;
      }

      container.innerHTML = "";

      const chart = lib.createChart(container, {
        width: Math.max(container.clientWidth || 0, 320),
        height: Math.max(container.clientHeight || 0, 260),
        layout: {
          background: { color: "#ffffff" },
          textColor: "#64748b",
          fontFamily: "Arial, sans-serif",
        },
        grid: {
          vertLines: { color: "#eef2f7" },
          horzLines: { color: "#eef2f7" },
        },
        crosshair: {
          mode: lib.CrosshairMode ? lib.CrosshairMode.Normal : 0,
          vertLine: { color: "rgba(37, 99, 235, 0.18)", width: 1, style: 0 },
          horzLine: { color: "rgba(37, 99, 235, 0.18)", width: 1, style: 0 },
        },
        rightPriceScale: {
          visible: true,
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.08, bottom: 0.32 },
        },
        leftPriceScale: {
          visible: true,
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.08, bottom: 0.32 },
        },
        timeScale: {
          borderColor: "#e2e8f0",
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 0,
          fixLeftEdge: true,
          lockVisibleTimeRangeOnResize: true,
          allowShiftVisibleRangeOnWhitespaceReplacement: false,
          barSpacing: rows.length > 800 ? 2.5 : rows.length > 365 ? 3.5 : rows.length > 180 ? 5 : 8,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: {
          locale: "ko-KR",
        },
      });
      chartRef.current = chart;
      const buildScoreAutoscale = function (scoreRows) {
        const numericScores = ensureArray(scoreRows)
          .map(function (item) { return Number(item && item.value); })
          .filter(function (value) { return Number.isFinite(value); });
        if (!numericScores.length) {
          return undefined;
        }
        var minScore = Math.min.apply(null, numericScores);
        var maxScore = Math.max.apply(null, numericScores);
        if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
          return undefined;
        }
        if (minScore === maxScore) {
          minScore -= 5;
          maxScore += 5;
        } else {
          var pad = Math.max((maxScore - minScore) * 0.12, 6);
          minScore -= pad;
          maxScore += pad;
        }
        return {
          priceRange: {
            minValue: minScore,
            maxValue: maxScore,
          },
        };
      };

      const priceSeries = chart.addCandlestickSeries({
        priceScaleId: "left",
        upColor: "#ef4444",
        downColor: "#2563eb",
        borderUpColor: "#ef4444",
        borderDownColor: "#2563eb",
        wickUpColor: "#ef4444",
        wickDownColor: "#2563eb",
        priceLineVisible: false,
      });
      const scoreSeries = chart.addAreaSeries({
        priceScaleId: "right",
        lineColor: "#2563eb",
        topColor: "rgba(37, 99, 235, 0.22)",
        bottomColor: "rgba(37, 99, 235, 0.05)",
        lineWidth: 2.5,
        priceLineVisible: false,
        autoscaleInfoProvider: function () {
          return buildScoreAutoscale(scoreSeries._codexScoreData || []);
        },
      });
      const tradingValueSeries = chart.addHistogramSeries({
        priceScaleId: "volume",
        base: 0,
        color: "rgba(148, 163, 184, 0.72)",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale("volume").applyOptions({
        visible: false,
        scaleMargins: { top: 0.76, bottom: 0.02 },
      });
      seriesRef.current = {
        priceSeries: priceSeries,
        scoreSeries: scoreSeries,
        tradingValueSeries: tradingValueSeries,
      };

      const scheduleLoadMore = function (earliestDate) {
        if (!earliestDate || lastRequestedEarliestDateRef.current === earliestDate) {
          return;
        }
        if (loadMoreTimerRef.current) {
          clearTimeout(loadMoreTimerRef.current);
        }
        loadMoreTimerRef.current = setTimeout(function () {
          loadMoreTimerRef.current = null;
          if (!hasMoreRef.current || loadingMoreRef.current || typeof onNeedMoreRef.current !== "function") {
            return;
          }
          if (lastRequestedEarliestDateRef.current === earliestDate) {
            return;
          }
          lastRequestedEarliestDateRef.current = earliestDate;
          loadingMoreRef.current = true;
          onNeedMoreRef.current(earliestDate);
        }, 120);
      };

      const requestMoreForRange = function (range) {
        if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) {
          return;
        }
        if (!hasMoreRef.current || loadingMoreRef.current || typeof onNeedMoreRef.current !== "function") {
          return;
        }
        var barsBefore = null;
        var barsCount = null;
        if (seriesRef.current && seriesRef.current.priceSeries && typeof seriesRef.current.priceSeries.barsInLogicalRange === "function") {
          var barsInfo = seriesRef.current.priceSeries.barsInLogicalRange(range);
          if (barsInfo) {
            barsBefore = Number.isFinite(barsInfo.barsBefore) ? barsInfo.barsBefore : null;
            barsCount = Number.isFinite(barsInfo.barsCount) ? barsInfo.barsCount : null;
          }
        }
        if (barsBefore == null && Number.isFinite(range.from)) {
          barsBefore = range.from;
        }
        const visibleSpan = Number.isFinite(range.to - range.from) ? (range.to - range.from) : 0;
        const nearLeftEdge = barsBefore != null && barsBefore <= LOAD_MORE_THRESHOLD;
        const zoomedOutGap = barsBefore != null && barsCount != null && visibleSpan > 0 && barsBefore <= (LOAD_MORE_THRESHOLD * 2) && barsCount < (visibleSpan - 6);
        if (!nearLeftEdge && !zoomedOutGap) {
          return;
        }
        scheduleLoadMore(earliestDateRef.current);
      };
      requestMoreForRangeRef.current = requestMoreForRange;
      const rangeHandler = function (range) {
        visibleRangeRef.current = range || null;
        requestMoreForRange(range);
      };
      if (chart.timeScale() && typeof chart.timeScale().subscribeVisibleLogicalRangeChange === "function") {
        chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);
      }

      const resize = function () {
        if (!container || !chartRef.current) {
          return;
        }
        chartRef.current.applyOptions({
          width: Math.max(container.clientWidth || 0, 320),
          height: Math.max(container.clientHeight || 0, 260),
        });
      };

      let observer = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      } else {
        window.addEventListener("resize", resize);
      }

      return function () {
        if (observer) {
          observer.disconnect();
        } else {
          window.removeEventListener("resize", resize);
        }
        if (chart && chart.timeScale() && typeof chart.timeScale().unsubscribeVisibleLogicalRangeChange === "function") {
          chart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeHandler);
        }
        seriesRef.current = null;
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        if (container) {
          container.innerHTML = "";
        }
      };
    }, []);

    useEffect(function () {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !rows.length) {
        return;
      }

      const priceData = [];
      const scoreData = [];
      const tradingValueData = [];
      const markerMap = {};
      markers.forEach(function (marker) {
        if (!marker || !marker.date) {
          return;
        }
        const dateKey = String(marker.date || "").slice(0, 10);
        const list = markerMap[dateKey] || [];
        list.push(String(marker.type || "").toLowerCase());
        markerMap[dateKey] = list;
      });
      const scoreMarkers = [];
      rows.forEach(function (item) {
        const time = String(item.date || "").slice(0, 10);
        const score = Number(item.score);
        const plotScore = Number.isFinite(score) && Math.abs(score) <= 1000 ? score : null;
        const open = Number(item.open);
        const high = Number(item.high);
        const low = Number(item.low);
        const close = Number(item.close);
        const tradingValue = Number(item.trading_value_100m);
        if (
          time
          && Number.isFinite(open) && open > 0
          && Number.isFinite(high) && high > 0
          && Number.isFinite(low) && low > 0
          && Number.isFinite(close) && close > 0
        ) {
          priceData.push({
            time: time,
            open: open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close: close,
          });
        }
        if (time && plotScore != null) {
          scoreData.push({ time: time, value: plotScore });
          const dayMarkers = markerMap[time] || [];
          if (dayMarkers.indexOf("buy") >= 0) {
            scoreMarkers.push({
              time: time,
              position: "belowBar",
              color: "#16a34a",
              shape: "arrowUp",
              text: "매수",
            });
          }
          if (dayMarkers.indexOf("sell") >= 0) {
            scoreMarkers.push({
              time: time,
              position: "aboveBar",
              color: "#dc2626",
              shape: "arrowDown",
              text: "매도",
            });
          }
        }
        if (time && Number.isFinite(tradingValue) && tradingValue >= 0) {
          tradingValueData.push({
            time: time,
            value: tradingValue,
            color: Number(item.change_pct || 0) >= 0 ? "rgba(37, 99, 235, 0.42)" : "rgba(239, 68, 68, 0.36)",
          });
        }
      });

      series.priceSeries.setData(priceData);
      series.scoreSeries.setData(scoreData);
      series.tradingValueSeries.setData(tradingValueData);
      series.scoreSeries._codexScoreData = scoreData;
      if (typeof series.scoreSeries.setMarkers === "function") {
        series.scoreSeries.setMarkers(scoreMarkers);
      }
      if (!didFitContentRef.current) {
        chart.timeScale().fitContent();
        didFitContentRef.current = true;
      }
      if (!didSetInitialRangeRef.current && priceData.length) {
        const initialBars = Math.min(INITIAL_VISIBLE_BARS, priceData.length);
        const fromIndex = Math.max(0, priceData.length - initialBars);
        const fromTime = priceData[fromIndex] && priceData[fromIndex].time;
        const toTime = priceData[priceData.length - 1] && priceData[priceData.length - 1].time;
        if (fromTime && toTime && chart.timeScale() && typeof chart.timeScale().setVisibleRange === "function") {
          chart.timeScale().setVisibleRange({ from: fromTime, to: toTime });
        } else if (chart.timeScale() && typeof chart.timeScale().setVisibleLogicalRange === "function") {
          const to = priceData.length + 2;
          chart.timeScale().setVisibleLogicalRange({ from: fromIndex, to: to });
        }
        didSetInitialRangeRef.current = true;
      } else if (didSetInitialRangeRef.current && rows.length) {
        const previousRowsLength = Number(previousRowsLengthRef.current) || 0;
        const previousEarliestDate = previousEarliestDateRef.current;
        const currentEarliestDate = String(rows[0].date || "");
        const prependedBars = rows.length > previousRowsLength && previousEarliestDate && currentEarliestDate && currentEarliestDate < previousEarliestDate
          ? rows.length - previousRowsLength
          : 0;
        const currentVisibleRange = visibleRangeRef.current;
        if (prependedBars > 0 && currentVisibleRange && chart.timeScale() && typeof chart.timeScale().setVisibleLogicalRange === "function") {
          chart.timeScale().setVisibleLogicalRange({
            from: currentVisibleRange.from + prependedBars,
            to: currentVisibleRange.to + prependedBars,
          });
        }
      }
      previousRowsLengthRef.current = rows.length;
      previousEarliestDateRef.current = rows.length ? String(rows[0].date || "") : "";
      if (!loadingMoreRef.current) {
        lastRequestedEarliestDateRef.current = "";
      }
      if (chart.timeScale() && typeof chart.timeScale().getVisibleLogicalRange === "function") {
        const nextRange = chart.timeScale().getVisibleLogicalRange();
        visibleRangeRef.current = nextRange || visibleRangeRef.current;
        if (visibleRangeRef.current && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(function () {
            if (visibleRangeRef.current) {
              requestMoreForRangeRef.current(visibleRangeRef.current);
            }
          });
        }
      }
    }, [rows, markers]);

    return h(
      "div",
      { className: "score-history-chart-shell score-history-lightweight-shell" },
      h("div", { ref: containerRef, className: "score-history-lightweight-host" }),
      props.loadingMore
        ? h(
            "div",
            { className: "score-history-chart-loading" },
            h("div", { className: "loading-bar indeterminate" }, h("span", null)),
            h("span", null, "이전 구간 로드 중")
          )
        : null,
      h(
        "div",
        { className: "score-history-lightweight-legend" },
        h("span", null, h("i", { className: "price" }), "주가(캔들)"),
        h("span", null, h("i", { className: "score" }), "종합점수"),
        h("span", null, h("i", { className: "volume" }), "거래대금(억)")
      )
    );
  }

  function TradingValueHistoryChart(props) {
    const rows = ensureArray(props.rows);
    const compact = !!props.compact;
    const hidePrice = !!props.hidePrice;
    const labels = rows.map(function (item) { return item.date; });
    const tradingValues = rows.map(function (item) {
      const value = Number(item && item.trading_value_100m);
      return Number.isFinite(value) ? value : null;
    });
    const closeRaw = rows.map(function (item) {
      const value = Number(item && item.close);
      return Number.isFinite(value) && value > 0 ? value : null;
    });
    var firstClose = null;
    for (var i = 0; i < closeRaw.length; i += 1) {
      if (closeRaw[i] != null) {
        firstClose = closeRaw[i];
        break;
      }
    }
    const closeNormalized = firstClose
      ? closeRaw.map(function (value) { return value == null ? null : (value / firstClose) * 100; })
      : [];
    const tradingOnly = tradingValues.filter(function (value) { return Number.isFinite(Number(value)); }).map(function (value) { return Number(value); });
    var tradingAxisMin = 0;
    var tradingAxisMax = 100;
    if (tradingOnly.length) {
      var localMin = Math.min.apply(null, tradingOnly);
      var localMax = Math.max.apply(null, tradingOnly);
      var span = Math.max(localMax - localMin, 20);
      var pad = Math.max(span * 0.2, 10);
      tradingAxisMin = Math.max(0, Math.floor(localMin - pad));
      tradingAxisMax = Math.ceil(localMax + pad);
      if (tradingAxisMax <= tradingAxisMin) {
        tradingAxisMax = tradingAxisMin + 10;
      }
    }
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: compact ? "bar" : "line",
        data: {
          labels: labels,
          datasets: (hidePrice ? [] : [
            {
              label: "주가(정규화)",
              data: closeNormalized,
              yAxisID: "yPrice",
              borderColor: "rgba(71, 85, 105, 0.35)",
              backgroundColor: "rgba(71, 85, 105, 0.06)",
              pointRadius: 0,
              pointHoverRadius: 0,
              tension: 0.15,
              borderWidth: 1.5,
              fill: false,
              type: "line",
              order: 1,
            },
          ]).concat([
            {
              label: "거래대금(억)",
              data: tradingValues,
              borderColor: compact ? "rgba(37, 99, 235, 0.9)" : "#2563eb",
              backgroundColor: compact ? "rgba(37, 99, 235, 0.72)" : "rgba(37, 99, 235, 0.12)",
              pointBackgroundColor: "#2563eb",
              pointBorderColor: "#ffffff",
              pointRadius: compact ? 0 : 4,
              pointHoverRadius: compact ? 0 : 6,
              tension: 0.2,
              borderWidth: compact ? 0 : 2.4,
              fill: !compact,
              type: compact ? "bar" : "line",
              order: 2,
              barPercentage: compact ? 0.78 : undefined,
              categoryPercentage: compact ? 0.86 : undefined,
            },
          ]),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: {
                color: "#64748b",
                maxTicksLimit: compact ? 8 : 8,
                callback: function (value, index) {
                  return formatDateLabel(labels[index]);
                },
                display: !compact,
              },
              grid: { color: "#eef2f7" },
            },
            y: {
              min: tradingAxisMin,
              max: tradingAxisMax,
              ticks: {
                color: "#64748b",
                callback: function (value) { return numberFormat(value, 0); },
                display: !compact,
              },
              grid: { color: "#eef2f7", display: !compact },
              border: { display: !compact },
            },
            yPrice: {
              display: !hidePrice && !compact,
              position: "right",
              grid: { display: false, drawBorder: false },
              ticks: { display: false },
            },
          },
          plugins: {
            legend: { display: !compact },
            tooltip: {
              callbacks: {
                title: function (items) {
                  return items.length ? labels[items[0].dataIndex] : "";
                },
                label: function (context) {
                  const row = rows[context.dataIndex] || {};
                  if (context.dataset && context.dataset.label === "주가(정규화)") {
                    return "종가: " + (row.close != null ? numberFormat(row.close, 0) : "-");
                  }
                  return [
                    "거래대금: " + numberFormat(context.raw, 1) + "억",
                    "종가: " + (row.close != null ? numberFormat(row.close, 0) : "-"),
                    "등락률: " + formatPercent(row.change_pct, 2),
                    "순위: " + numberFormat(row.rank, 0) + "위",
                  ];
                },
              },
            },
          },
        },
      });
    }, [props.rows]);

    return h("div", { className: "score-history-chart-shell" + (compact ? " compact trading-bars-compact" : "") }, h("canvas", { ref: canvasRef }));
  }

  function LeaderCalendarScoreChart(props) {
    const rows = ensureArray(props.rows).filter(function (item) {
      return item && item.date && Number.isFinite(Number(item.score));
    });
    const scoreBasis = props.scoreBasis === "score_o" ? "score_o" : "score";
    const buildKospiMddRows = function (sourceRows) {
      var peak = null;
      return ensureArray(sourceRows).map(function (item) {
        var closeValue = Number(item && (item.kospi_close != null ? item.kospi_close : item.kospi_normalized));
        if (!Number.isFinite(closeValue) || closeValue <= 0) {
          return { date: item && item.date, value: null };
        }
        if (peak == null || closeValue > peak) {
          peak = closeValue;
        }
        var drawdown = peak ? ((closeValue / peak) - 1) * 100 : 0;
        return {
          date: item.date,
          value: roundNumber(drawdown, 2),
        };
      });
    };
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);

    useEffect(function () {
      const container = containerRef.current;
      if (!container || !window.LightweightCharts || typeof window.LightweightCharts.createChart !== "function") {
        return undefined;
      }
      const chart = window.LightweightCharts.createChart(container, {
        width: Math.max(container.clientWidth || 0, 320),
        height: Math.max(container.clientHeight || 0, 280),
        layout: {
          background: { color: "#ffffff" },
          textColor: "#475467",
          fontFamily: "'Pretendard', 'Segoe UI', sans-serif",
        },
        grid: {
          vertLines: { color: "#eef2f7" },
          horzLines: { color: "#eef2f7" },
        },
        rightPriceScale: {
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        leftPriceScale: {
          visible: true,
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        timeScale: {
          borderColor: "#e2e8f0",
          rightOffset: 2,
          barSpacing: 10,
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: function (time) {
            var text = "";
            if (typeof time === "string") {
              text = time;
            } else if (time && typeof time === "object") {
              var year = Number(time.year || 0);
              var month = Number(time.month || 0);
              if (year > 0 && month > 0) {
                text = String(year) + "/" + String(month).padStart(2, "0");
              }
            }
            if (!text) {
              return "";
            }
            return String(text).slice(0, 7).replace(/-/g, "/");
          },
        },
        crosshair: {
          vertLine: { color: "rgba(37, 99, 235, 0.18)", width: 1, labelBackgroundColor: "#1d4ed8" },
          horzLine: { color: "rgba(15, 23, 42, 0.18)", width: 1, labelBackgroundColor: "#0f172a" },
        },
        localization: {
          locale: "ko-KR",
        },
      });
      const scoreSeries = chart.addAreaSeries({
        lineColor: "#2563eb",
        topColor: "rgba(37, 99, 235, 0.22)",
        bottomColor: "rgba(37, 99, 235, 0.05)",
        lineWidth: 2.5,
        priceLineVisible: false,
        lastValueVisible: true,
        priceScaleId: "right",
      });
      const kospiMddSeries = chart.addLineSeries({
        color: "rgba(107, 114, 128, 0.95)",
        lineWidth: 1.8,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 3,
        priceScaleId: "left",
      });
      chartRef.current = chart;
      seriesRef.current = {
        scoreSeries: scoreSeries,
        kospiMddSeries: kospiMddSeries,
      };

      const resize = function () {
        if (!container || !chartRef.current) {
          return;
        }
        chartRef.current.applyOptions({
          width: Math.max(container.clientWidth || 0, 320),
          height: Math.max(container.clientHeight || 0, 280),
        });
      };

      let observer = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      } else {
        window.addEventListener("resize", resize);
      }

      return function () {
        if (observer) {
          observer.disconnect();
        } else {
          window.removeEventListener("resize", resize);
        }
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        seriesRef.current = null;
        if (container) {
          container.innerHTML = "";
        }
      };
    }, []);

    useEffect(function () {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !rows.length) {
        return;
      }
      const scoreData = rows.map(function (item) {
        return {
          time: String(item.date || "").slice(0, 10),
          value: Number(item.score),
        };
      });
      const kospiMddData = buildKospiMddRows(rows).map(function (item) {
        return {
          time: String(item.date || "").slice(0, 10),
          value: Number(item.value),
        };
      }).filter(function (item) {
        return item.time && Number.isFinite(item.value);
      });
      series.scoreSeries.setData(scoreData);
      series.kospiMddSeries.setData(kospiMddData);
      if (chart.timeScale() && typeof chart.timeScale().fitContent === "function") {
        chart.timeScale().fitContent();
      }
    }, [rows]);

    return h(
      "div",
      { className: "score-history-chart-shell score-history-lightweight-shell leader-calendar-score-chart" },
      h("div", { ref: containerRef, className: "score-history-lightweight-host" }),
      h(
        "div",
        { className: "score-history-lightweight-legend" },
        h("span", null, h("i", { className: "score" }), scoreBasis === "score_o" ? "상위 10개 평균 당일점수" : "상위 10개 평균 종합점수"),
        h("span", null, h("i", { className: "benchmark" }), "코스피 MDD")
      )
    );
  }

  function GlobalIndicesChart(props) {
    const items = ensureArray(props.items).filter(function (item) { return ensureArray(item.series).length > 0; });
    const dateSet = {};
    items.forEach(function (item) {
      ensureArray(item.series).forEach(function (point) {
        dateSet[point.date] = true;
      });
    });
    const labels = Object.keys(dateSet).sort();
    const colors = [
      "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316", "#0891b2", "#be185d", "#65a30d",
      "#7c3aed", "#0f766e", "#b45309", "#4f46e5", "#db2777", "#15803d", "#ea580c", "#0369a1",
      "#a16207", "#c026d3", "#475569", "#059669", "#e11d48", "#0284c7", "#854d0e", "#4338ca",
      "#be123c", "#0d9488", "#ca8a04", "#6d28d9"
    ];
    const datasets = items.map(function (item, index) {
      const pointMap = {};
      const closeMap = {};
      ensureArray(item.series).forEach(function (point) {
        pointMap[point.date] = Number(point.return_pct);
        closeMap[point.date] = Number(point.close);
      });
      return {
        label: item.symbol + " " + item.name,
        data: labels.map(function (dateText) {
          return Object.prototype.hasOwnProperty.call(pointMap, dateText) ? pointMap[dateText] : null;
        }),
        rawValues: labels.map(function (dateText) {
          return Object.prototype.hasOwnProperty.call(closeMap, dateText) ? closeMap[dateText] : null;
        }),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length],
        borderWidth: item.symbol === "SPY" || item.symbol === "QQQ" ? 2.4 : 1.35,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.22,
        spanGaps: true,
      };
    });
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#0f172a", boxWidth: 12, usePointStyle: true, font: { size: 11, weight: "700" } },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const value = context.parsed && context.parsed.y;
                  const rawValue = context.dataset.rawValues ? context.dataset.rawValues[context.dataIndex] : null;
                  const returnText = Number.isFinite(value) ? formatPercent(value, 2) : "-";
                  const valueText = Number.isFinite(rawValue) ? numberFormat(rawValue, rawValue >= 100 ? 2 : 4) : "-";
                  return context.dataset.label + ": " + returnText + " / 값 " + valueText;
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: "#64748b", maxTicksLimit: 8 }, grid: { display: false } },
            y: {
              ticks: { color: "#64748b", callback: function (value) { return value + "%"; } },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
          },
        },
      });
    }, [props.items]);
    return h("div", { className: "chart-shell global-indices-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  function KrxMarketMapPanel() {
    const mapUrl = "https://www.kospd.com/maps/1day";
    return h(
      "section",
      { className: "panel krx-market-map-panel" },
      h(
        "div",
        { className: "krx-market-map-head" },
        h(
          "div",
          null,
          h("div", { className: "eyebrow" }, "KRX Market Map"),
          h("h2", null, "오늘 KRX 핀맵"),
          h("p", null, "KOSPD 1일 KRX 맵을 그대로 표시합니다. 원본 기준 약 5분 간격 자동 갱신됩니다.")
        ),
        h(
          "a",
          { className: "mini-button krx-market-map-link", href: mapUrl, target: "_blank", rel: "noreferrer" },
          "원본 열기"
        )
      ),
      h(
        "div",
        { className: "krx-market-map-frame-wrap" },
        h("iframe", {
          title: "KOSPD 1일 KRX 맵",
          src: mapUrl,
          loading: "lazy",
          referrerPolicy: "no-referrer-when-downgrade",
          sandbox: "allow-scripts allow-same-origin allow-popups allow-downloads",
        })
      )
    );
  }

  function ChartGameChart(props) {
    const rows = ensureArray(props.rows);
    const tradeMarkers = ensureArray(props.tradeMarkers);
    const averagePrice = Number(props.averagePrice);
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);

    useEffect(function () {
      const container = containerRef.current;
      const lib = window.LightweightCharts;
      if (!container || !lib || chartRef.current) {
        return undefined;
      }
      container.innerHTML = "";
      const chart = lib.createChart(container, {
        width: Math.max(container.clientWidth || 0, 320),
        height: Math.max(container.clientHeight || 0, 420),
        layout: {
          background: { color: "#ffffff" },
          textColor: "#64748b",
          fontFamily: "\"Segoe UI\", \"Apple SD Gothic Neo\", sans-serif",
        },
        grid: {
          vertLines: { color: "#e9edf5" },
          horzLines: { color: "#e9edf5" },
        },
        crosshair: {
          mode: lib.CrosshairMode ? lib.CrosshairMode.Normal : 0,
          vertLine: { color: "rgba(37, 99, 235, 0.14)", width: 1, style: 0 },
          horzLine: { color: "rgba(37, 99, 235, 0.14)", width: 1, style: 0 },
        },
        rightPriceScale: {
          visible: true,
          borderColor: "#d7dee8",
          scaleMargins: { top: 0.06, bottom: 0.2 },
        },
        timeScale: {
          borderColor: "#d7dee8",
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 3,
          barSpacing: 10,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: {
          locale: "ko-KR",
          priceFormatter: function (value) { return numberFormat(value, 0); },
        },
      });
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#ef4444",
        downColor: "#3b82f6",
        borderUpColor: "#ef4444",
        borderDownColor: "#3b82f6",
        wickUpColor: "#ef4444",
        wickDownColor: "#3b82f6",
        priceLineVisible: true,
        priceLineColor: "#f43f5e",
        priceLineStyle: 2,
        lastValueVisible: true,
      });
      const ma20Series = chart.addLineSeries({
        color: "#f59e0b",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const ma60Series = chart.addLineSeries({
        color: "#8b5cf6",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const ma120Series = chart.addLineSeries({
        color: "#0ea5e9",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const avgPriceSeries = chart.addLineSeries({
        color: "#111827",
        lineWidth: 2,
        lineStyle: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: "volume",
        base: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: "volume" },
      });
      chart.priceScale("volume").applyOptions({
        visible: false,
        scaleMargins: { top: 0.82, bottom: 0.0 },
      });
      chartRef.current = chart;
      seriesRef.current = {
        candleSeries: candleSeries,
        ma20Series: ma20Series,
        ma60Series: ma60Series,
        ma120Series: ma120Series,
        avgPriceSeries: avgPriceSeries,
        volumeSeries: volumeSeries,
      };

      const resize = function () {
        if (!container || !chartRef.current) {
          return;
        }
        chartRef.current.applyOptions({
          width: Math.max(container.clientWidth || 0, 320),
          height: Math.max(container.clientHeight || 0, 420),
        });
      };
      let observer = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      } else {
        window.addEventListener("resize", resize);
      }
      return function () {
        if (loadMoreTimerRef.current) {
          clearTimeout(loadMoreTimerRef.current);
          loadMoreTimerRef.current = null;
        }
        if (observer) {
          observer.disconnect();
        } else {
          window.removeEventListener("resize", resize);
        }
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        seriesRef.current = null;
        if (container) {
          container.innerHTML = "";
        }
      };
    }, []);

    useEffect(function () {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) {
        return;
      }
      if (!rows.length) {
        series.candleSeries.setData([]);
        series.ma20Series.setData([]);
        series.ma60Series.setData([]);
        series.ma120Series.setData([]);
        series.avgPriceSeries.setData([]);
        series.volumeSeries.setData([]);
        return;
      }
      const closes = [];
      const ma20Data = [];
      const ma60Data = [];
      const ma120Data = [];
      const avgPriceData = [];
      const candleData = [];
      const volumeData = [];
      const markerData = [];
      const markerMap = {};
      tradeMarkers.forEach(function (item, markerIndex) {
        const key = String((item && item.date) || "").slice(0, 10);
        if (!key) {
          return;
        }
        if (!markerMap[key]) {
          markerMap[key] = [];
        }
        markerMap[key].push(Object.assign({ __markerIndex: markerIndex }, item));
      });
      rows.forEach(function (row, index) {
        const time = String(row.date || "").slice(0, 10);
        const open = Number(row.open);
        const high = Number(row.high);
        const low = Number(row.low);
        const close = Number(row.close);
        const turnover = Number(row.trading_value_100m);
        if (!time || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          return;
        }
        candleData.push({
          time: time,
          open: open,
          high: Math.max(high, open, close),
          low: Math.min(low, open, close),
          close: close,
        });
        closes.push(close);
        function movingAverage(period) {
          if (closes.length < period) {
            return null;
          }
          var sum = 0;
          for (var pointer = closes.length - period; pointer < closes.length; pointer += 1) {
            sum += closes[pointer];
          }
          return sum / period;
        }
        var ma20 = movingAverage(20);
        var ma60 = movingAverage(60);
        var ma120 = movingAverage(120);
        if (ma20 != null) {
          ma20Data.push({ time: time, value: ma20 });
        }
        if (ma60 != null) {
          ma60Data.push({ time: time, value: ma60 });
        }
        if (ma120 != null) {
          ma120Data.push({ time: time, value: ma120 });
        }
        if (Number.isFinite(averagePrice) && averagePrice > 0) {
          avgPriceData.push({ time: time, value: averagePrice });
        }
        if (Number.isFinite(turnover) && turnover >= 0) {
          volumeData.push({
            time: time,
            value: turnover,
            color: close >= open ? "rgba(239, 68, 68, 0.5)" : "rgba(59, 130, 246, 0.5)",
          });
        }
        ensureArray(markerMap[time]).forEach(function (marker) {
          const type = String(marker.type || "").toLowerCase();
          markerData.push({
            time: time,
            position: type === "sell" ? "aboveBar" : "belowBar",
            color: type === "sell" ? "#dc2626" : "#16a34a",
            shape: type === "sell" ? "arrowDown" : "arrowUp",
            text: type === "sell"
              ? "매도 " + (Number.isFinite(Number(marker.shares)) ? numberFormat(marker.shares, 0) + "주" : "")
              : "매수 " + (Number.isFinite(Number(marker.shares)) ? numberFormat(marker.shares, 0) + "주" : ""),
          });
        });
      });
      series.candleSeries.setData(candleData);
      series.ma20Series.setData(ma20Data);
      series.ma60Series.setData(ma60Data);
      series.ma120Series.setData(ma120Data);
      series.avgPriceSeries.setData(avgPriceData);
      series.volumeSeries.setData(volumeData);
      if (typeof series.candleSeries.setMarkers === "function") {
        series.candleSeries.setMarkers(markerData);
      }
      if (chart.timeScale() && typeof chart.timeScale().setVisibleLogicalRange === "function") {
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, candleData.length - Math.min(121, candleData.length) - 1),
          to: candleData.length + 1,
        });
      }
    }, [rows, tradeMarkers, averagePrice]);

    return h("div", { className: "chart-game-chart-host", ref: containerRef });
  }

  const chartGamePageModule = getStockAppModule("chartGamePage");

  function ChartGamePageModuleUnavailable() {
    return h("div", { className: "page chart-game-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "차트 게임"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let ChartGamePage = ChartGamePageModuleUnavailable;
  if (typeof chartGamePageModule.createPage === "function") {
    try {
      ChartGamePage = chartGamePageModule.createPage({
        React: React,
        ChartGameChart: ChartGameChart,
        clearChartGameState: clearChartGameState,
        emitWindowTitleDetail: emitWindowTitleDetail,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatCurrency: formatCurrency,
        formatPercent: formatPercent,
        h: h,
        isEditableHotkeyTarget: isEditableHotkeyTarget,
        loadChartGameState: loadChartGameState,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        persistChartGameState: persistChartGameState,
        selectTextOnFocus: selectTextOnFocus,
        SummaryCard: SummaryCard,
      });
    } catch (error) {
      console.error("Failed to initialize chart-game page module.", error);
    }
  }
  const sectorWatchPageModule = getStockAppModule("sectorWatchPage");

  function SectorWatchBoardPageModuleUnavailable() {
    return h("div", { className: "page sector-watch-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "관심종목 보드"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let SectorWatchBoardPage = SectorWatchBoardPageModuleUnavailable;
  if (typeof sectorWatchPageModule.createPage === "function") {
    try {
      SectorWatchBoardPage = sectorWatchPageModule.createPage({
        React: React,
        emitWindowTitleDetail: emitWindowTitleDetail,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatPercent: formatPercent,
        h: h,
        KrxMarketMapPanel: KrxMarketMapPanel,
        LoadingPanel: LoadingPanel,
        moveArrayItem: moveArrayItem,
        numberFormat: numberFormat,
        postJson: postJson,
        SectionTitle: SectionTitle,
        StockChartPreview: StockChartPreview,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize sector-watch page module.", error);
    }
  }
  const portfolioPageModule = getStockAppModule("portfolioPage");

  function PortfolioModuleUnavailable() {
    return h("div", { className: "page portfolio-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "포트폴리오 수익"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let PortfolioPageModern = PortfolioModuleUnavailable;
  if (typeof portfolioPageModule.createPage === "function") {
    try {
      PortfolioPageModern = portfolioPageModule.createPage({
        React: React,
        AllocationChart: AllocationChart,
        calculateRelativePortfolioStats: calculateRelativePortfolioStats,
        copyImageBlobWithFallback: copyImageBlobWithFallback,
        DataTable: DataTable,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatCurrency: formatCurrency,
        formatMoneyByCurrency: formatMoneyByCurrency,
        formatMoneyByCurrencyKoreanCompact: formatMoneyByCurrencyKoreanCompact,
        formatPercent: formatPercent,
        formatYearMonthLabel: formatYearMonthLabel,
        h: h,
        isoDateOffset: isoDateOffset,
        itemInPortfolioPeriod: itemInPortfolioPeriod,
        LoadingPanel: LoadingPanel,
        markPortfolioInvestmentState: markPortfolioInvestmentState,
        monthLabel: monthLabel,
        moveArrayItem: moveArrayItem,
        normalizeBenchmarkForLabels: normalizeBenchmarkForLabels,
        normalizeLooseSearchText: normalizeLooseSearchText,
        normalizePortfolioSeriesForPeriod: normalizePortfolioSeriesForPeriod,
        numberFormat: numberFormat,
        PerformanceChart: PerformanceChart,
        pnlClass: pnlClass,
        portfolioMonthOptions: portfolioMonthOptions,
        roundNumber: roundNumber,
        SectionTitle: SectionTitle,
        shiftIsoDate: shiftIsoDate,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize portfolio page module.", error);
    }
  }
  const strategyBacktestPageModule = getStockAppModule("strategyBacktestPage");

  function StrategyBacktestPageModuleUnavailable() {
    return h("div", { className: "page strategy-backtest-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "전략 백테스트"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let StrategyBacktestPage = StrategyBacktestPageModuleUnavailable;
  if (typeof strategyBacktestPageModule.createPage === "function") {
    try {
      StrategyBacktestPage = strategyBacktestPageModule.createPage({
        React: React,
        DataTable: DataTable,
        deleteJson: deleteJson,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatDateLabel: formatDateLabel,
        formatPercent: formatPercent,
        h: h,
        isoDateOffset: isoDateOffset,
        LoadingBlock: LoadingBlock,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        openStockInGlobalCompany: openStockInGlobalCompany,
        pnlClass: pnlClass,
        PortfolioDiagnosticChart: PortfolioDiagnosticChart,
        postJson: postJson,
        ScoreHistoryChart: ScoreHistoryChart,
        SectionTitle: SectionTitle,
        SectorRotationBacktestChart: SectorRotationBacktestChart,
        StockChartPreview: StockChartPreview,
        StrategyBacktestChart: StrategyBacktestChart,
        StrategyRsiChart: StrategyRsiChart,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize strategy-backtest page module.", error);
    }
  }
  function TelegramChatFeed(props) {
    const rows = ensureArray(props.rows);
    if (!rows.length) {
      return EmptyState({ message: props.emptyMessage || "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }

    const nodes = [];
    let lastDate = "";
    rows.forEach(function (row) {
      const day = String(row.date || "").slice(0, 10);
      if (day && day !== lastDate) {
        nodes.push(
          h("div", { key: "day-" + day, className: "telegram-day-divider" }, h("span", null, day))
        );
        lastDate = day;
      }
      const initials = (row.chat_name || "?").slice(0, 2);
      nodes.push(
        h(
          "div",
          { key: row.chat_id + ":" + row.message_id, className: "telegram-msg-row" },
          h("div", { className: "telegram-avatar" }, initials),
          h(
            "div",
            { className: "telegram-msg-body" },
            h(
              "div",
              { className: "telegram-msg-meta" },
              h("strong", null, row.chat_name || "\uC54C \uC218 \uC5C6\uB294 \uBC29"),
              h("span", null, formatDateTime(row.date)),
              ensureArray(row.matched_keywords).length ? h("span", { className: "telegram-tag" }, ensureArray(row.matched_keywords).join(", ")) : null,
              row.has_file ? h("span", { className: "telegram-tag" }, "\uCCA8\uBD80\uD30C\uC77C") : null
            ),
            h(
              "div",
              { className: "telegram-bubble" },
              h(LinkifiedText, {
                text: row.text || "(\uD14D\uC2A4\uD2B8 \uC5C6\uC74C)",
                onOpenLink: openUrlInDefaultBrowser,
              }),
              row.attachment_url
                ? h("a", {
                    className: "attachment-pill",
                    href: row.attachment_url,
                    target: "_blank",
                    rel: "noreferrer",
                    onClick: function (event) {
                      event.preventDefault();
                      openUrlInDefaultBrowser(row.attachment_url);
                    },
                  }, row.file_name || "\uCCA8\uBD80\uD30C\uC77C \uC5F4\uAE30")
                : null,
              ensureArray(row.links).length
                ? h(
                    "div",
                    { className: "telegram-links" },
                    ensureArray(row.links).map(function (link, index) {
                      return h("a", {
                        key: link + index,
                        href: link,
                        target: "_blank",
                        rel: "noreferrer",
                        onClick: function (event) {
                          event.preventDefault();
                          openUrlInDefaultBrowser(link);
                        },
                      }, link);
                    })
                  )
                : null
            )
          )
        )
      );
    });

    return h("div", { className: "telegram-feed" }, nodes);
  }

  function GlobalEarningsCallPanel(props) {
    const payload = props.payload || null;
    const brief = payload && payload.brief ? payload.brief : {};
    const call = payload && payload.call ? payload.call : {};
    const metrics = ensureArray(brief.reported_metrics || (payload && payload.raw && payload.raw.reported_metrics));
    const managementMessages = ensureArray(brief.management_messages);
    const watchPoints = ensureArray(brief.watch_points);
    const summaryPoints = ensureArray(brief.summary_points);
    const links = [];
    if (call.transcript_url) {
      links.push({ label: "원문 transcript", href: call.transcript_url });
    }
    if (!payload) {
      return EmptyState({ compact: true, message: props.emptyMessage || "표시할 어닝콜 데이터가 없습니다." });
    }
    function metricToneClass(value) {
      const tone = String(value || "").toLowerCase();
      if (tone === "beat" || tone === "positive") return "positive";
      if (tone === "miss" || tone === "negative") return "negative";
      if (tone === "inline" || tone === "neutral") return "neutral";
      return "";
    }
    return h(
      "div",
      { className: "global-earnings-brief" },
      h(
        "div",
        { className: "global-earnings-header" },
        h("div", null,
          h("strong", { className: "global-earnings-headline" }, brief.headline || call.title || "최근 earnings call"),
          call.event_date_time ? h("div", { className: "global-earnings-date" }, formatDateTime(call.event_date_time)) : null
        ),
        links.length
          ? h("div", { className: "global-earnings-links" }, links.map(function (item) {
              return h("a", {
                key: item.href,
                href: item.href,
                target: "_blank",
                rel: "noreferrer",
                onClick: function (event) {
                  event.preventDefault();
                  openUrlInDefaultBrowser(item.href);
                },
              }, item.label);
            }))
          : null
      ),
      brief.executive_summary ? h("p", { className: "global-earnings-summary" }, brief.executive_summary) : null,
      metrics.length
        ? h(
            "div",
            { className: "global-earnings-section" },
            h("div", { className: "global-earnings-section-title" }, "실적 요약"),
            h(
              "div",
              { className: "global-earnings-metric-list" },
              metrics.map(function (item, index) {
                return h(
                  "article",
                  { key: (item.metric || "metric") + index, className: "global-earnings-metric-card" },
                  h("div", { className: "global-earnings-metric-top" },
                    h("strong", { className: "global-earnings-metric-name" }, item.metric || "-"),
                    item.beat_miss ? h("span", { className: "global-earnings-tone " + metricToneClass(item.beat_miss) }, item.beat_miss) : null
                  ),
                  h("div", { className: "global-earnings-metric-value" }, item.value || "-"),
                  h("div", { className: "global-earnings-metric-meta" },
                    item.consensus ? h("span", null, "컨센 " + item.consensus) : null,
                    item.qoq ? h("span", null, "QoQ " + item.qoq) : null,
                    item.yoy ? h("span", null, "YoY " + item.yoy) : null
                  ),
                  item.context ? h("div", { className: "global-earnings-metric-context" }, item.context) : null
                );
              })
            )
          )
        : null,
      summaryPoints.length
        ? h(
            "div",
            { className: "global-earnings-section" },
            h("div", { className: "global-earnings-section-title" }, "핵심 요약"),
            h("ul", { className: "global-earnings-bullet-list" }, summaryPoints.map(function (item, index) {
              return h("li", { key: "summary-" + index }, item);
            }))
          )
        : null,
      managementMessages.length
        ? h(
            "div",
            { className: "global-earnings-section" },
            h("div", { className: "global-earnings-section-title" }, "경영진 메시지"),
            h("ul", { className: "global-earnings-bullet-list" }, managementMessages.map(function (item, index) {
              return h("li", { key: "mgmt-" + index }, item);
            }))
          )
        : null,
      watchPoints.length
        ? h(
            "div",
            { className: "global-earnings-section" },
            h("div", { className: "global-earnings-section-title" }, "체크포인트"),
            h("ul", { className: "global-earnings-bullet-list" }, watchPoints.map(function (item, index) {
              return h("li", { key: "watch-" + index }, item);
            }))
          )
        : null
    );
  }

  function buildEarningsCopyText(row) {
    const disclosureLink = String((row && row.disclosure_link) || "").trim();
    const companyInfoLink = String((row && row.company_info_link) || "").trim();
    return String((row && row.text) || "")
      .split(/\r?\n/)
      .filter(function (line) {
        const trimmed = String(line || "").trim();
        if (!trimmed) {
          return true;
        }
        if (/^(?:\uacf5\uc2dc\ub9c1\ud06c|\ud68c\uc0ac\uc815\ubcf4)\s*:/i.test(trimmed)) {
          return false;
        }
        if (disclosureLink && trimmed.indexOf(disclosureLink) >= 0) {
          return false;
        }
        if (companyInfoLink && trimmed.indexOf(companyInfoLink) >= 0) {
          return false;
        }
        if (/^https?:\/\/(dart\.fss\.or\.kr|finance\.naver\.com)\b/i.test(trimmed)) {
          return false;
        }
        return true;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function copyTextToClipboard(text) {
    const value = String(text || "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  function TelegramEarningsResults(props) {
    const rows = ensureArray(props.rows);
    const [copiedKey, setCopiedKey] = useState("");
    if (!rows.length) {
      return EmptyState({ message: props.emptyMessage || "\uAC80\uC0C9\uB41C \uACF5\uC2DC \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    return h(
      "div",
      { className: "earnings-result-list" },
      rows.map(function (row) {
        const rowKey = row.chat_id + ":" + row.message_id;
        const links = [
          row.disclosure_link ? { label: "\uACF5\uC2DC \uC5F4\uAE30", href: row.disclosure_link } : null,
          row.company_info_link ? { label: "\uD68C\uC0AC\uC815\uBCF4", href: row.company_info_link } : null,
        ].filter(Boolean);
        return h(
          "article",
          { key: rowKey, className: "earnings-result-card" },
          h(
            "div",
            { className: "earnings-result-head" },
            h("div", null,
              h("strong", null, row.company || "\uAE30\uC5C5\uBA85 \uC5C6\uC74C"),
              h("span", null, row.report_name || "\uBCF4\uACE0\uC11C\uBA85 \uC5C6\uC74C")
            ),
            h(
              "div",
              { className: "earnings-result-actions" },
              h("button", {
                type: "button",
                className: "earnings-copy-button",
                onClick: function (event) {
                  event.preventDefault();
                  event.stopPropagation();
                  copyTextToClipboard(buildEarningsCopyText(row)).then(function () {
                    setCopiedKey(rowKey);
                    window.setTimeout(function () {
                      setCopiedKey(function (current) {
                        return current === rowKey ? "" : current;
                      });
                    }, 1800);
                  }).catch(function () {
                    setCopiedKey("");
                    window.alert("\ud074\ub9bd\ubcf4\ub4dc \ubcf5\uc0ac\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.");
                  });
                },
              }, copiedKey === rowKey ? "\ubcf5\uc0ac\ub428" : "\ud074\ub9bd\ubcf4\ub4dc \ubcf5\uc0ac"),
              h("time", null, formatDateTime(row.date))
            )
          ),
          h(
            "div",
            { className: "earnings-metric-strip" },
            h("span", null, "\uB9E4\uCD9C " + (row.sales || "-")),
            h("span", null, "\uC601\uC5C5\uC775 " + (row.operating_profit || "-")),
            h("span", null, "\uC21C\uC774\uC775 " + (row.net_income || "-"))
          ),
          h("div", { className: "earnings-message-text" }, h(LinkifiedText, {
            text: row.text || "",
            onOpenLink: openUrlInDefaultBrowser,
          })),
          links.length
            ? h(
                "div",
                { className: "telegram-links" },
                links.map(function (link) {
                  return h("a", {
                    key: link.href,
                    href: link.href,
                    target: "_blank",
                    rel: "noreferrer",
                    onClick: function (event) {
                      event.preventDefault();
                      openUrlInDefaultBrowser(link.href);
                    },
                  }, link.label);
                })
              )
            : null
        );
      })
    );
  }

  function parseEarningsMetricParts(value) {
    const text = String(value || "").trim();
    const actual = text.replace(/\s*\([^)]*\)\s*/g, "").trim();
    let expected = "";
    let surprise = "";
    let opm = "";
    const expectedMatch = text.match(/예상치\s*:\s*([^)]+)/);
    if (expectedMatch) {
      const expectedText = expectedMatch[1].trim();
      const surpriseMatch = expectedText.match(/[-+]?\d+(?:\.\d+)?\s*%/);
      if (surpriseMatch) {
        surprise = surpriseMatch[0].replace(/\s+/g, "");
        expected = expectedText.slice(0, surpriseMatch.index).replace(/[,\s/+]+$/g, "");
      } else {
        expected = expectedText.replace(/[,\s/+]+$/g, "");
      }
    }
    const opmMatch = text.match(/\(opm\s+([^)]+)\)/i);
    if (opmMatch) {
      opm = opmMatch[1].trim();
    }
    return { actual: actual, expected: expected, surprise: surprise, opm: opm };
  }

  function deltaClassName(value) {
    const numeric = Number(String(value || "").replace(/[%+,]/g, ""));
    if (!Number.isFinite(numeric) || numeric === 0) {
      return "flat";
    }
    return numeric > 0 ? "positive" : "negative";
  }

  function renderDeltaBadge(label, value, className) {
    if (!value) {
      return null;
    }
    return h("span", { className: (className || "delta-badge") + " " + deltaClassName(value) }, label ? label + " " + value : value);
  }

  function earningsHeader(label, subLabel) {
    return h(
      "span",
      { className: "earnings-header-label" },
      h("strong", null, label),
      subLabel ? h("small", null, subLabel) : null
    );
  }

  function compactMarketEarningsReportLabel(report) {
    const text = String(report || "").trim();
    if (!text) {
      return "-";
    }
    const statement = text.indexOf("연결") >= 0 ? "연결" : (text.indexOf("별도") >= 0 ? "별도" : "");
    const status = text.indexOf("잠정") >= 0 ? "잠정" : "확정";
    const compact = [statement, status].filter(Boolean).join(" ");
    return compact || text;
  }

  function parsePercentNumber(value) {
    const text = String(value || "").replace(/[,%+\s]/g, "");
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function isCurrentQuarterEarnings(row, rows) {
    const validRows = ensureArray(rows).filter(function (item) { return item && item.date; });
    const latestDate = validRows.reduce(function (latest, item) {
      const dateText = String(item.date || "").slice(0, 10);
      return dateText > latest ? dateText : latest;
    }, "");
    if (!latestDate) {
      return true;
    }
    const latest = new Date(latestDate + "T00:00:00");
    const current = new Date(String(row.date || "").slice(0, 10) + "T00:00:00");
    if (!Number.isFinite(latest.getTime()) || !Number.isFinite(current.getTime())) {
      return true;
    }
    return current >= new Date(latest.getTime() - 1000 * 60 * 60 * 24 * 120);
  }

  function buildEarningsSurpriseRows(rows) {
    return ensureArray(rows).map(function (row) {
      const sales = earningsMetric(row, "sales");
      const operating = earningsMetric(row, "operating_profit");
      const salesSurprise = parsePercentNumber(sales.surprise);
      const operatingSurprise = parsePercentNumber(operating.surprise);
      const scoreParts = [salesSurprise, operatingSurprise].filter(function (value) { return Number.isFinite(value); });
      if (!scoreParts.length || !isCurrentQuarterEarnings(row, rows)) {
        return null;
      }
      const score = scoreParts.reduce(function (sum, value) { return sum + value; }, 0) / scoreParts.length;
      return {
        key: row.chat_id + ":" + row.message_id,
        row: row,
        sales: sales,
        operating: operating,
        salesSurprise: salesSurprise,
        operatingSurprise: operatingSurprise,
        score: score,
      };
    }).filter(Boolean).sort(function (left, right) {
      return Number(right.score || 0) - Number(left.score || 0);
    });
  }

  function EarningsSurpriseRankList(props) {
    const items = buildEarningsSurpriseRows(props.rows).slice(0, 30);
    if (!items.length) {
      return h(
        "div",
        { className: "panel earnings-surprise-panel" },
        h(SectionTitle, null, "이번 분기 어닝 서프라이즈"),
        h(EmptyState, { compact: true, message: "매출/영익 예상 대비 수치가 있는 공시가 아직 없습니다." })
      );
    }
    return h(
      "div",
      { className: "panel earnings-surprise-panel" },
      h(
        "div",
        { className: "section-toolbar" },
        h("div", null, h(SectionTitle, null, "이번 분기 어닝 서프라이즈"), h("div", { className: "summary-help" }, "매출/영익 예상 대비 평균 상회율 순")),
        h("span", { className: "status-pill" }, numberFormat(items.length, 0) + "개")
      ),
      h(
        "div",
        { className: "earnings-surprise-list" },
        items.map(function (item, index) {
          const row = item.row || {};
          const report = row.report_name || "";
          return h(
            "div",
            { key: item.key, className: "earnings-surprise-row" },
            h("span", { className: "earnings-surprise-rank" }, index + 1),
            h(
              "div",
              { className: "earnings-surprise-company" },
              h("strong", null, row.stock_name || row.company || "-"),
              h("span", null, [row.stock_code || row.company_code || "", String(row.date || "").slice(0, 10), report].filter(Boolean).join(" · "))
            ),
            h("div", { className: "earnings-surprise-metric" }, h("span", null, "매출"), h("strong", { className: deltaClassName(item.salesSurprise) }, Number.isFinite(item.salesSurprise) ? formatPercent(item.salesSurprise, 1) : "-")),
            h("div", { className: "earnings-surprise-metric" }, h("span", null, "영익"), h("strong", { className: deltaClassName(item.operatingSurprise) }, Number.isFinite(item.operatingSurprise) ? formatPercent(item.operatingSurprise, 1) : "-")),
            h("div", { className: "earnings-surprise-score" }, h("span", null, "평균"), h("strong", { className: deltaClassName(item.score) }, formatPercent(item.score, 1)))
          );
        })
      )
    );
  }

  function parseEarningsTrendNumber(value) {
    const text = String(value || "").trim();
    if (!text || text === "-") {
      return null;
    }
    const match = text.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    const number = Number(match[0].replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function formatEarningsDelta(current, base) {
    if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) {
      return "";
    }
    const delta = (current - base) / Math.abs(base) * 100;
    if (!Number.isFinite(delta)) {
      return "";
    }
    return (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%";
  }

  function parseEarningsTrendRows(text) {
    return String(text || "").split(/\r?\n/).map(function (line) {
      const match = line.match(/^\s*(\d{4})\.(\d)Q\s+(.+)$/i);
      if (!match) {
        return null;
      }
      const parts = match[3].split("/").map(function (part) { return part.trim(); });
      if (parts.length < 2) {
        return null;
      }
      return {
        year: Number(match[1]),
        quarter: Number(match[2]),
        label: match[1] + "." + match[2] + "Q",
        sales: parseEarningsTrendNumber(parts[0]),
        operating_profit: parseEarningsTrendNumber(parts[1]),
        net_income: parseEarningsTrendNumber(parts[2]),
      };
    }).filter(Boolean);
  }

  function buildEarningsGrowthFromText(text) {
    const rows = parseEarningsTrendRows(text);
    if (!rows.length) {
      return {};
    }
    const current = rows[0];
    const previous = rows[1] || null;
    const priorYear = rows.slice(1).find(function (row) {
      return row.year === current.year - 1 && row.quarter === current.quarter;
    }) || null;
    const result = {};
    ["sales", "operating_profit", "net_income"].forEach(function (key) {
      result[key] = {
        qoq: formatEarningsDelta(current[key], previous && previous[key]),
        yoy: formatEarningsDelta(current[key], priorYear && priorYear[key]),
      };
    });
    return result;
  }

  function earningsMetric(row, key) {
    const metrics = row && row.metrics && row.metrics[key];
    const fallbackGrowth = buildEarningsGrowthFromText(row && row.text)[key] || {};
    if (metrics) {
      return {
        actual: metrics.actual || "-",
        expected: metrics.expected || "-",
        surprise: metrics.surprise || "",
        opm: metrics.opm || "",
        qoq: metrics.qoq || fallbackGrowth.qoq || "",
        yoy: metrics.yoy || fallbackGrowth.yoy || "",
      };
    }
    return { ...parseEarningsMetricParts(row && row[key]), ...fallbackGrowth };
  }

  function buildEarningsTrendDataset(rows) {
    const quarterMap = {};
    ensureArray(rows).forEach(function (row) {
      parseEarningsTrendRows(row && row.text).forEach(function (trend) {
        const key = trend.year + "Q" + trend.quarter;
        if (!quarterMap[key]) {
          quarterMap[key] = trend;
        }
      });
    });
    const quarters = Object.keys(quarterMap).map(function (key) {
      return quarterMap[key];
    }).sort(function (a, b) {
      return (a.year * 10 + a.quarter) - (b.year * 10 + b.quarter);
    });
    const recentQuarters = quarters.slice(-12);
    const annualMap = {};
    recentQuarters.forEach(function (row) {
      const key = String(row.year);
      if (!annualMap[key]) {
        annualMap[key] = { year: row.year, label: key, sales: 0, operating_profit: 0, net_income: 0, quarter_count: 0 };
      }
      annualMap[key].quarter_count += 1;
      ["sales", "operating_profit", "net_income"].forEach(function (metric) {
        const value = Number(row[metric]);
        if (Number.isFinite(value)) {
          annualMap[key][metric] += value;
        }
      });
    });
    const annual = Object.keys(annualMap).map(function (key) {
      return annualMap[key];
    }).sort(function (a, b) {
      return a.year - b.year;
    }).slice(-5);
    return { quarters: recentQuarters, annual: annual };
  }

  function EarningsTrendChart(props) {
    const rows = ensureArray(props.rows);
    const labels = rows.map(function (row) { return row.label; });
    const title = props.title || "";
    const isAnnual = !!props.isAnnual;
    const colors = {
      sales: "#2563eb",
      operating_profit: "#f97316",
      net_income: "#16a34a",
    };
    const profitValues = rows.reduce(function (values, row) {
      ["operating_profit", "net_income"].forEach(function (key) {
        const value = Number(row && row[key]);
        if (Number.isFinite(value)) {
          values.push(value);
        }
      });
      return values;
    }, []);
    const profitAbsMax = profitValues.length
      ? Math.max.apply(null, profitValues.map(function (value) { return Math.abs(value); }))
      : 0;
    const profitScaleMax = profitAbsMax ? profitAbsMax * 1.25 : undefined;
    const { canvasRef } = useChartLifecycle(function (canvas) {
      const quarterYearDividerPlugin = {
        id: "quarterYearDivider",
        afterDatasetsDraw: function (chart) {
          if (isAnnual || !rows.length) {
            return;
          }
          const xScale = chart.scales && chart.scales.x;
          const yScale = chart.scales && chart.scales.y;
          if (!xScale || !yScale) {
            return;
          }
          const ctx = chart.ctx;
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(15, 23, 42, 0.32)";
          ctx.lineWidth = 1;
          ctx.fillStyle = "#475569";
          ctx.font = "700 10px Segoe UI, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          rows.forEach(function (row, index) {
            if (index <= 0) {
              return;
            }
            const currentYear = Number(row && row.year);
            const previousYear = Number(rows[index - 1] && rows[index - 1].year);
            if (!Number.isFinite(currentYear) || currentYear === previousYear) {
              return;
            }
            const prevX = xScale.getPixelForValue(index - 1);
            const currX = xScale.getPixelForValue(index);
            const dividerX = (prevX + currX) / 2;
            ctx.beginPath();
            ctx.moveTo(dividerX, yScale.top);
            ctx.lineTo(dividerX, yScale.bottom);
            ctx.stroke();
            ctx.fillText(String(currentYear), Math.min(Math.max(dividerX + 18, xScale.left + 18), xScale.right - 18), yScale.top + 4);
          });
          ctx.restore();
        },
      };
      const annualOpmLabelPlugin = {
        id: "annualOpmLabel",
        afterDatasetsDraw: function (chart) {
          if (!isAnnual || !rows.length) {
            return;
          }
          const meta = chart.getDatasetMeta ? chart.getDatasetMeta(0) : null;
          const elements = meta && meta.data ? meta.data : [];
          if (!elements.length) {
            return;
          }
          const chartArea = chart.chartArea || {};
          const ctx = chart.ctx;
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "900 10px Segoe UI, sans-serif";
          rows.forEach(function (row, index) {
            const element = elements[index];
            if (!element) {
              return;
            }
            const sales = Number(row && row.sales);
            const operating = Number(row && row.operating_profit);
            if (!Number.isFinite(sales) || !Number.isFinite(operating) || sales === 0) {
              return;
            }
            const label = numberFormat((operating / sales) * 100, 1) + "%";
            const x = Number(element.x);
            const top = Number(element.y);
            const base = Number(element.base);
            if (!Number.isFinite(x) || !Number.isFinite(top) || !Number.isFinite(base)) {
              return;
            }
            const positiveBar = base >= top;
            const barHeight = Math.abs(base - top);
            let y = positiveBar ? top + 14 : top - 14;
            if (barHeight < 24) {
              y = positiveBar ? Math.max((chartArea.top || 0) + 12, top - 10) : Math.min((chartArea.bottom || base) - 12, top + 10);
            }
            y = Math.min(Math.max(y, (chartArea.top || 0) + 12), (chartArea.bottom || base) - 12);
            const width = ctx.measureText(label).width + 10;
            const height = 16;
            const left = x - width / 2;
            const topY = y - height / 2;
            ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
            ctx.strokeStyle = "rgba(30, 64, 175, 0.16)";
            ctx.lineWidth = 1;
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(left, topY, width, height, 8);
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.fillRect(left, topY, width, height);
              ctx.strokeRect(left, topY, width, height);
            }
            ctx.fillStyle = operating >= 0 ? "#0f172a" : "#2563eb";
            ctx.fillText(label, x, y);
          });
          ctx.restore();
        },
      };
      return new Chart(canvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "수정주가",
              data: rows.map(function (row) { return Number.isFinite(Number(row.sales)) ? Number(row.sales) : null; }),
              backgroundColor: "rgba(37, 99, 235, 0.72)",
              borderColor: colors.sales,
              borderWidth: 1,
              yAxisID: "ySales",
            },
            {
              label: "OP",
              data: rows.map(function (row) { return Number.isFinite(Number(row.operating_profit)) ? Number(row.operating_profit) : null; }),
              backgroundColor: "rgba(249, 115, 22, 0.72)",
              borderColor: colors.operating_profit,
              borderWidth: 1,
              yAxisID: "yProfit",
            },
            {
              label: "NI",
              data: rows.map(function (row) { return Number.isFinite(Number(row.net_income)) ? Number(row.net_income) : null; }),
              backgroundColor: "rgba(22, 163, 74, 0.72)",
              borderColor: colors.net_income,
              borderWidth: 1,
              yAxisID: "yProfit",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: { color: "#334155", maxRotation: 0, autoSkip: true, maxTicksLimit: isAnnual ? 5 : 8 },
              grid: { display: false },
            },
            yProfit: {
              position: "left",
              suggestedMin: profitScaleMax ? -profitScaleMax : undefined,
              suggestedMax: profitScaleMax || undefined,
              ticks: {
                color: "#7c2d12",
                callback: function (value) { return numberFormat(value, 0) + "억"; },
              },
              title: { display: true, text: "OP / NI", color: "#7c2d12", font: { size: 11, weight: "900" } },
              grid: {
                color: function (context) {
                  return Number(context.tick && context.tick.value) === 0
                    ? "rgba(15, 23, 42, 0.36)"
                    : "rgba(148, 163, 184, 0.18)";
                },
                lineWidth: function (context) {
                  return Number(context.tick && context.tick.value) === 0 ? 1.4 : 1;
                },
              },
            },
            ySales: {
              position: "right",
              beginAtZero: true,
              ticks: {
                color: "#1d4ed8",
                callback: function (value) { return numberFormat(value, 0) + "억"; },
              },
              title: { display: true, text: "매출", color: "#1d4ed8", font: { size: 11, weight: "900" } },
              grid: { drawOnChartArea: false },
            },
          },
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#0f172a", boxWidth: 10, font: { size: 10, weight: "800" } },
            },
            title: {
              display: !!title,
              text: title,
              color: "#0f172a",
              font: { size: 13, weight: "900" },
              padding: { bottom: 8 },
            },
            tooltip: {
              callbacks: {
                title: function (items) {
                  const row = rows[items[0] && items[0].dataIndex] || {};
                  return row.label + (isAnnual && row.quarter_count ? " · " + row.quarter_count + "개 분기 합산" : "");
                },
                label: function (context) {
                  const value = context.parsed && context.parsed.y;
                  return context.dataset.label + ": " + (Number.isFinite(value) ? numberFormat(value, 0) + "원" : "-");
                },
              },
            },
          },
        },
        plugins: isAnnual ? [annualOpmLabelPlugin] : [quarterYearDividerPlugin],
      });
    }, [props.rows, props.title, props.isAnnual]);
    return h(
      "div",
      { className: "earnings-trend-chart-shell" + (isAnnual ? " annual-earnings-chart-shell" : "") },
      h("canvas", { ref: canvasRef })
    );
  }

  function ValuationBandChart(props) {
    const rows = ensureArray(props.rows).filter(function (row) {
      return row && row.date && Number.isFinite(Number(row.close));
    });
    const labels = rows.map(function (row) { return row.date; });
    const metric = props.metric || "per";
    const lineKey = metric === "pbr" ? "pbr_lines" : "per_lines";
    const multiples = ensureArray(props.multiples);
    const title = props.title || "";
    const color = props.color || "#7c3aed";
    const lineColors = ["#ef4444", "#84cc16", "#a855f7", "#f97316", "#64748b"];
    const { canvasRef, chartRef } = useChartLifecycle(function (canvas) {
      const bandDatasets = multiples.map(function (multiple, index) {
        return {
          label: numberFormat(multiple, 2) + "배",
          data: rows.map(function (row) {
            const lines = ensureArray(row[lineKey]);
            const value = Number(lines[index]);
            return Number.isFinite(value) ? value : null;
          }),
          borderColor: lineColors[index % lineColors.length],
          backgroundColor: lineColors[index % lineColors.length],
          pointRadius: 0,
          borderWidth: 1.6,
          tension: 0.08,
          spanGaps: true,
        };
      });
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "수정주가",
              data: rows.map(function (row) { return Number(row.close); }),
              borderColor: "#2563eb",
              backgroundColor: "#2563eb",
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2.7,
              tension: 0.12,
            },
          ].concat(bandDatasets),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              ticks: {
                color: "#334155",
                maxRotation: 0,
                maxTicksLimit: 7,
                callback: function (value, index) { return formatYearLabel(labels[index]); },
              },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: "#334155",
                callback: function (value) { return numberFormat(value, 0); },
              },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
          },
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#0f172a", boxWidth: 10, font: { size: 10, weight: "800" } },
            },
            title: {
              display: !!title,
              text: title,
              color: "#0f172a",
              font: { size: 13, weight: "900" },
              padding: { bottom: 8 },
            },
            tooltip: {
              callbacks: {
                title: function (items) {
                  const row = rows[items[0] && items[0].dataIndex] || {};
                  return row.date || "";
                },
                label: function (context) {
                  const value = context.parsed && context.parsed.y;
                  return context.dataset.label + ": " + (Number.isFinite(value) ? numberFormat(value, 0) + "원" : "-");
                },
                afterBody: function (items) {
                  const row = rows[items[0] && items[0].dataIndex] || {};
                  return [
                    "PER: " + (row.per == null ? "-" : numberFormat(row.per, 2) + "배"),
                    "PBR: " + (row.pbr == null ? "-" : numberFormat(row.pbr, 2) + "배"),
                    metric === "pbr"
                      ? "BPS: " + (row.bps == null ? "-" : numberFormat(row.bps, 0) + "원")
                      : "EPS: " + (row.eps == null ? "-" : numberFormat(row.eps, 0) + "원"),
                  ];
                },
              },
            },
            zoom: {
              pan: { enabled: true, mode: "x", modifierKey: null },
              zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: true }, mode: "x" },
            },
          },
        },
      });
    }, [props.rows, props.metric, props.multiples, props.title]);
    return h(
      "div",
      {
        className: "earnings-trend-chart-shell valuation-band-chart-shell",
        title: "마우스 휠로 확대/축소, 드래그로 이동, 더블클릭으로 초기화",
        onDoubleClick: function () {
          if (chartRef.current && typeof chartRef.current.resetZoom === "function") {
            chartRef.current.resetZoom();
          }
        },
      },
      h("canvas", { ref: canvasRef })
    );
  }

  function EarningsTrendSidePanel(props) {
    const trend = props.trend || {};
    const hasQuarter = ensureArray(trend.quarters).length > 0;
    const hasAnnual = ensureArray(trend.annual).length > 0;
    const valuation = trend.valuation || {};
    const priceBand = valuation.price_band || {};
    const priceBandRows = ensureArray(priceBand.rows);
    const hasValuation = priceBandRows.length > 0;
    return h(
      "aside",
      { className: "earnings-trend-side-panel" },
      h("div", { className: "earnings-trend-side-title" }, "DART 실적 추이"),
      props.loading ? h("div", { className: "notice-box compact" }, "DART 실적 데이터를 불러오는 중입니다.") : null,
      props.message ? h("div", { className: "notice-box compact warning" }, props.message) : null,
      hasQuarter || hasAnnual
        ? [
            h(EarningsTrendChart, { key: "quarter", title: "3개년 분기 매출 / OP / NI", rows: trend.quarters, isAnnual: false }),
            h(EarningsTrendChart, { key: "annual", title: "연간/YTD 매출 / OP / NI", rows: trend.annual, isAnnual: true }),
            hasValuation ? h(ValuationBandChart, { key: "per", title: "PER 밴드", rows: priceBandRows, metric: "per", multiples: priceBand.per_multiples, color: "#9333ea" }) : null,
            hasValuation ? h(ValuationBandChart, { key: "pbr", title: "PBR 밴드", rows: priceBandRows, metric: "pbr", multiples: priceBand.pbr_multiples, color: "#0f766e" }) : null,
            h("p", { key: "note", className: "summary-help earnings-trend-note" }, (trend.company || "") + (trend.stock_code ? " · " + trend.stock_code : "") + " · " + (trend.source || "DART")),
          ].filter(Boolean)
        : EmptyState({ message: props.loading ? "DART 데이터를 확인 중입니다." : "기업명을 검색하면 DART 기준 실적 차트를 표시합니다." })
    );
  }

  function formatMarketEarningsDateParts(value) {
    if (!value) {
      return { date: "-", time: "" };
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      const hh = String(parsed.getHours()).padStart(2, "0");
      const mi = String(parsed.getMinutes()).padStart(2, "0");
      return { date: yyyy + "-" + mm + "-" + dd, time: hh + ":" + mi };
    }
    const text = String(value);
    return { date: text.slice(0, 10) || "-", time: text.slice(11, 16) };
  }

  function formatMarketCap100m(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return "";
    }
    const rounded = Math.round(number);
    const jo = Math.floor(rounded / 10000);
    const eok = rounded % 10000;
    if (jo > 0 && eok > 0) {
      return jo + "조 " + numberFormat(eok, 0) + "억";
    }
    if (jo > 0) {
      return jo + "조";
    }
    return numberFormat(rounded, 0) + "억";
  }

  function openMarketEarningsCompanyInStockSearch(row) {
    const stockName = String((row && (row.stock_name || row.company)) || "").trim();
    if (!stockName) {
      return;
    }
    const previousState = loadTelegramSearchState() || {};
    persistTelegramSearchState(Object.assign({}, previousState, {
      earningsQuery: stockName,
      earningsResults: [],
      earningsMessage: "",
      disclosureCategory: "earnings",
      disclosureNextOffsetId: 0,
      disclosureHasMore: false,
      financialTrend: null,
      financialTrendMessage: "",
      financialTrendExpanded: false,
      businessSegments: null,
      businessSegmentsMessage: "",
      stockOverview: null,
      stockOverviewMessage: "",
    }));
    stashTelegramStockNavigation(stockName);
    requestPageNavigation("telegram", { stockQuery: stockName, source: "disclosure" });
  }

  function MarketEarningsTable(props) {
    const rows = ensureArray(props.rows);
    if (!rows.length) {
      return EmptyState({ message: props.emptyMessage || "표시할 실적 공시가 없습니다." });
    }
    return h(
      "div",
      { className: "market-earnings-table-wrap" },
      h(
        "table",
        { className: "market-earnings-table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, earningsHeader("일자")),
            h("th", null, earningsHeader("종목")),
            h("th", null, earningsHeader("공시")),
            h("th", null, earningsHeader("매출", "QoQ · YoY")),
            h("th", null, earningsHeader("매출 예상", "예상대비")),
            h("th", null, earningsHeader("영업이익", "QoQ · YoY")),
            h("th", null, earningsHeader("영익 예상", "예상대비")),
            h("th", null, earningsHeader("OPM"))
          )
        ),
        h(
          "tbody",
          null,
          rows.map(function (row) {
            const sales = earningsMetric(row, "sales");
            const operating = earningsMetric(row, "operating_profit");
            const dateParts = formatMarketEarningsDateParts(row.date);
            const report = row.report_name || "-";
            const reportCompact = compactMarketEarningsReportLabel(report);
            const companyMeta = [
              row.stock_code || row.company_code || "",
              formatMarketCap100m(row.market_cap_100m) ? "시총 " + formatMarketCap100m(row.market_cap_100m) : "",
            ].filter(Boolean).join(" · ");
            return h(
              "tr",
              { key: row.chat_id + ":" + row.message_id },
              h("td", { className: "market-earnings-date" }, h("strong", null, dateParts.date), dateParts.time ? h("span", null, dateParts.time) : null),
              h(
                "td",
                { className: "market-earnings-company" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "table-link-button market-earnings-company-button",
                    title: "종목정보 검색기에서 " + (row.stock_name || row.company || "종목") + " 검색",
                    onClick: function () { openMarketEarningsCompanyInStockSearch(row); },
                  },
                  h("strong", null, row.stock_name || row.company || "-")
                ),
                companyMeta ? h("span", null, companyMeta) : null
              ),
              h("td", { className: "market-earnings-report", title: report }, reportCompact),
              h(
                "td",
                { className: "num-cell metric-with-deltas", title: [sales.qoq ? "QoQ " + sales.qoq : "", sales.yoy ? "YoY " + sales.yoy : ""].filter(Boolean).join(" / ") || "증감 정보 없음" },
                h(
                  "div",
                  { className: "metric-stack" },
                  h("strong", null, sales.actual || "-"),
                  h(
                    "div",
                    { className: "metric-meta" },
                    sales.qoq ? h("span", { className: "delta-badge " + deltaClassName(sales.qoq) }, sales.qoq) : h("span", { className: "metric-meta-empty" }, "-"),
                    sales.yoy ? h("span", { className: "delta-badge " + deltaClassName(sales.yoy) }, sales.yoy) : h("span", { className: "metric-meta-empty" }, "-")
                  )
                )
              ),
              h(
                "td",
                { className: "num-cell subtle-cell", title: sales.surprise ? "예상대비 " + sales.surprise : "" },
                h(
                  "div",
                  { className: "metric-stack" },
                  h("strong", null, sales.expected || "-"),
                  h("div", { className: "metric-meta metric-meta-single" }, sales.surprise ? h("span", { className: "surprise-text " + deltaClassName(sales.surprise) }, sales.surprise) : h("span", { className: "metric-meta-empty" }, "-"))
                )
              ),
              h(
                "td",
                { className: "num-cell metric-with-deltas", title: [operating.qoq ? "QoQ " + operating.qoq : "", operating.yoy ? "YoY " + operating.yoy : ""].filter(Boolean).join(" / ") || "증감 정보 없음" },
                h(
                  "div",
                  { className: "metric-stack" },
                  h("strong", null, operating.actual || "-"),
                  h(
                    "div",
                    { className: "metric-meta" },
                    operating.qoq ? h("span", { className: "delta-badge " + deltaClassName(operating.qoq) }, operating.qoq) : h("span", { className: "metric-meta-empty" }, "-"),
                    operating.yoy ? h("span", { className: "delta-badge " + deltaClassName(operating.yoy) }, operating.yoy) : h("span", { className: "metric-meta-empty" }, "-")
                  )
                )
              ),
              h(
                "td",
                { className: "num-cell subtle-cell", title: operating.surprise ? "예상대비 " + operating.surprise : "" },
                h(
                  "div",
                  { className: "metric-stack" },
                  h("strong", null, operating.expected || "-"),
                  h("div", { className: "metric-meta metric-meta-single" }, operating.surprise ? h("span", { className: "surprise-text " + deltaClassName(operating.surprise) }, operating.surprise) : h("span", { className: "metric-meta-empty" }, "-"))
                )
              ),
              h("td", { className: "num-cell opm-cell" }, operating.opm || "-")
            );
          })
        )
      )
    );
  }

  function formatEpsValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    const digits = Math.abs(number) >= 100 ? 0 : (Math.abs(number) >= 10 ? 1 : 2);
    return numberFormat(number, digits);
  }

  function formatSurprisePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return (number > 0 ? "+" : "") + numberFormat(number, 1) + "%";
  }

  function ForeignReportedEarningsTable(props) {
    const rows = ensureArray(props.rows);
    if (!rows.length) {
      return EmptyState({ message: props.emptyMessage || "표시할 해외 발표 실적이 없습니다." });
    }
    return h(
      "div",
      { className: "market-earnings-table-wrap" },
      h(
        "table",
        { className: "market-earnings-table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, earningsHeader("발표일")),
            h("th", null, earningsHeader("종목")),
            h("th", null, earningsHeader("분기")),
            h("th", null, earningsHeader("실제 EPS")),
            h("th", null, earningsHeader("예상 EPS")),
            h("th", null, earningsHeader("서프라이즈")),
            h("th", null, earningsHeader("발표 시점"))
          )
        ),
        h(
          "tbody",
          null,
          rows.map(function (row, index) {
            const dateParts = formatMarketEarningsDateParts(row.date);
            const companyMeta = [
              row.symbol || row.stock_code || "",
              formatMarketCap100m(row.market_cap_100m) ? "시총 " + formatMarketCap100m(row.market_cap_100m) : "",
            ].filter(Boolean).join(" · ");
            const surpriseText = formatSurprisePercent(row.eps_surprise_pct);
            return h(
              "tr",
              { key: row.id || ((row.symbol || "foreign") + ":" + index) },
              h("td", { className: "market-earnings-date" }, h("strong", null, dateParts.date), dateParts.time ? h("span", null, dateParts.time) : null),
              h("td", { className: "market-earnings-company" },
                h("strong", null, row.stock_name || row.company || "-"),
                companyMeta ? h("span", null, companyMeta) : null
              ),
              h("td", { className: "market-earnings-report", title: row.report_name || "-" }, row.report_name || "-"),
              h("td", { className: "num-cell" }, formatEpsValue(row.eps_actual)),
              h("td", { className: "num-cell" }, formatEpsValue(row.eps_estimate)),
              h("td", { className: "num-cell" }, h("span", { className: deltaClassName(surpriseText) }, surpriseText)),
              h("td", { className: "num-cell" }, row.time || "-")
            );
          })
        )
      )
    );
  }

  function upcomingEarningsDateLabel(value) {
    if (!value) {
      return "-";
    }
    const parsed = new Date(String(value) + "T00:00:00");
    if (Number.isNaN(parsed.getTime())) {
      return String(value || "-");
    }
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return (parsed.getMonth() + 1) + "." + parsed.getDate() + " (" + weekdays[parsed.getDay()] + ")";
  }

  function upcomingScopeLabel(value) {
    if (value === "kr") return "국내";
    if (value === "foreign") return "해외";
    return "전체";
  }

  const UPCOMING_EARNINGS_TABS = [
    { key: "kr", label: "국내", minMarketCap100m: 2000 },
    { key: "foreign", label: "해외", minMarketCap100m: 10000 },
  ];

  const MARKET_EARNINGS_TABS = [
    { key: "kr", label: "국내" },
    { key: "foreign", label: "해외" },
  ];

  function UpcomingEarningsCalendarPanel(props) {
    const payload = props.payload || {};
    const dateGroups = ensureArray(payload.dates);
    if (props.loading && !dateGroups.length) {
      return h(LoadingBlock, { compact: true, title: "예정 실적 캘린더 불러오는 중", label: "KIND IR 일정과 Yahoo Finance 예정 실적을 합치는 중입니다." });
    }
    if (props.error) {
      return h("div", { className: "notice-box error" }, props.error);
    }
    if (!dateGroups.length) {
      return EmptyState({ message: "조건에 맞는 예정 실적 일정이 없습니다." });
    }
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "upcoming-earnings-scroll" },
        dateGroups.map(function (group) {
          const items = ensureArray(group.items);
          return h(
            "section",
            { key: group.date, className: "upcoming-earnings-day" },
            h(
              "div",
              { className: "upcoming-earnings-day-head" },
              h("div", null,
                h("strong", null, upcomingEarningsDateLabel(group.date)),
                h("span", null, group.date || "")
              ),
              h("div", { className: "upcoming-earnings-day-stats" },
                h("em", null, numberFormat(group.count, 0) + "개"),
                group.kr_count ? h("span", null, "국내 " + numberFormat(group.kr_count, 0)) : null,
                group.foreign_count ? h("span", null, "해외 " + numberFormat(group.foreign_count, 0)) : null
              )
            ),
            h(
              "div",
              { className: "upcoming-earnings-list" },
              items.map(function (item, index) {
                const marketCapText = formatMarketCap100m(item.market_cap_100m);
                const meta = [
                  upcomingScopeLabel(item.scope),
                  item.market === "US" ? (item.symbol || item.stock_code || "") : (item.stock_code || ""),
                  marketCapText ? "시총 " + marketCapText : "",
                  item.time || "",
                ].filter(Boolean).join(" · ");
                return h(
                  "article",
                  { key: item.id || (group.date + "-" + index), className: "upcoming-earnings-item" },
                  h("div", { className: "upcoming-earnings-main" },
                    h("div", { className: "upcoming-earnings-company-row" },
                      h("strong", null, item.stock_name || item.company || "-"),
                      h("span", { className: "upcoming-earnings-market upcoming-" + (item.scope || "all") }, upcomingScopeLabel(item.scope))
                    ),
                    h("div", { className: "upcoming-earnings-title" }, item.title || "-"),
                    meta ? h("div", { className: "upcoming-earnings-meta" }, meta) : null,
                    item.location ? h("div", { className: "upcoming-earnings-location" }, item.location) : null
                  ),
                  h("div", { className: "upcoming-earnings-side" },
                    item.time ? h("strong", null, item.time) : h("strong", null, "-"),
                    item.source_url ? h("a", { href: item.source_url, target: "_blank", rel: "noreferrer" }, item.scope === "kr" ? "KIND" : "Yahoo") : null
                  )
                );
              })
            )
          );
        })
      ),
      ensureArray(payload.sources).length
        ? h("div", { className: "upcoming-earnings-source-row" },
            ensureArray(payload.sources).map(function (source) {
              return h(
                "a",
                { key: source.name, className: "upcoming-earnings-source-chip", href: source.url, target: "_blank", rel: "noreferrer" },
                h("strong", null, source.name || "-"),
                h("span", null, source.note || "")
              );
            })
          )
        : null
    );
  }

  const DISCLOSURE_TABS = [
    { key: "earnings", label: "실적" },
    { key: "orders", label: "수주" },
    { key: "warning", label: "투자경고" },
    { key: "investment", label: "투자·증자" },
    { key: "ownership", label: "지분 변화" },
    { key: "shareholder", label: "배당·자사주" },
    { key: "all", label: "전체" },
  ];

  function disclosureTabLabel(category) {
    const tab = DISCLOSURE_TABS.find(function (item) {
      return item.key === category;
    });
    return tab ? tab.label : "공시";
  }

  function compactMarketMetricForCache(metric) {
    if (!metric || typeof metric !== "object") {
      return null;
    }
    return {
      actual: metric.actual || "",
      expected: metric.expected || "",
      surprise: metric.surprise || "",
      opm: metric.opm || "",
      qoq: metric.qoq || "",
      yoy: metric.yoy || "",
    };
  }

  function compactMarketEarningsRowForCache(row) {
    if (!row || typeof row !== "object") {
      return null;
    }
    return {
      chat_id: row.chat_id,
      message_id: row.message_id,
      date: row.date || "",
      report_name: row.report_name || "",
      stock_code: row.stock_code || "",
      company_code: row.company_code || "",
      market_cap_100m: row.market_cap_100m,
      stock_name: row.stock_name || "",
      company: row.company || "",
      sales: row.sales || "",
      operating_profit: row.operating_profit || "",
      metrics: {
        sales: compactMarketMetricForCache(row.metrics && row.metrics.sales),
        operating_profit: compactMarketMetricForCache(row.metrics && row.metrics.operating_profit),
      },
    };
  }

  function compactMarketPayloadForCache(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return {
      days: Number(payload.days || 0),
      result_count: Number(payload.result_count || 0),
      scanned_count: Number(payload.scanned_count || 0),
      results: ensureArray(payload.results).map(compactMarketEarningsRowForCache).filter(Boolean),
    };
  }

  function loadDisclosurePageState() {
    try {
      const raw = localStorage.getItem(DISCLOSURE_PAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      const validVersion = Number(parsed.version || 0) === DISCLOSURE_PAGE_STATE_VERSION;
      return {
        earningsQuery: String(parsed.earningsQuery || ""),
        earningsResults: ensureArray(parsed.earningsResults),
        earningsMessage: String(parsed.earningsMessage || ""),
        disclosureCategory: String(parsed.disclosureCategory || "earnings"),
        disclosureNextOffsetId: Number(parsed.disclosureNextOffsetId || 0),
        disclosureHasMore: !!parsed.disclosureHasMore,
        marketPayload: validVersion ? compactMarketPayloadForCache(parsed.marketPayload || null) : null,
        marketScope: validVersion ? String(parsed.marketScope || "kr") : "kr",
        marketForeignPayload: validVersion ? parsed.marketForeignPayload || null : null,
        marketForeignMessage: validVersion ? String(parsed.marketForeignMessage || "") : "",
        marketScrollTop: Number(parsed.marketScrollTop || 0),
        upcomingScope: validVersion ? String(parsed.upcomingScope || "kr") : "kr",
        upcomingPayloads: validVersion && parsed.upcomingPayloads && typeof parsed.upcomingPayloads === "object" ? parsed.upcomingPayloads : {},
        upcomingErrors: validVersion && parsed.upcomingErrors && typeof parsed.upcomingErrors === "object" ? parsed.upcomingErrors : {},
      };
    } catch (err) {
      return {};
    }
  }

  function persistDisclosurePageState(state) {
    try {
      localStorage.setItem(DISCLOSURE_PAGE_KEY, JSON.stringify({
        version: DISCLOSURE_PAGE_STATE_VERSION,
        earningsQuery: state.earningsQuery || "",
        earningsResults: ensureArray(state.earningsResults),
        earningsMessage: state.earningsMessage || "",
        disclosureCategory: state.disclosureCategory || "earnings",
        disclosureNextOffsetId: Number(state.disclosureNextOffsetId || 0),
        disclosureHasMore: !!state.disclosureHasMore,
        marketPayload: compactMarketPayloadForCache(state.marketPayload || null),
        marketScope: state.marketScope || "kr",
        marketForeignPayload: state.marketForeignPayload || null,
        marketForeignMessage: state.marketForeignMessage || "",
        marketScrollTop: Number(state.marketScrollTop || 0),
        upcomingScope: state.upcomingScope || "kr",
        upcomingPayloads: state.upcomingPayloads && typeof state.upcomingPayloads === "object" ? state.upcomingPayloads : {},
        upcomingErrors: state.upcomingErrors && typeof state.upcomingErrors === "object" ? state.upcomingErrors : {},
        financialTrend: state.financialTrend || null,
        financialTrendMessage: state.financialTrendMessage || "",
      }));
    } catch (err) {
    }
  }

  const disclosurePageModule = getStockAppModule("disclosurePage");

  function DisclosurePageModuleUnavailable() {
    return h("div", { className: "page disclosure-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "공시/실적"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let DisclosurePage = DisclosurePageModuleUnavailable;
  if (typeof disclosurePageModule.createPage === "function") {
    try {
      DisclosurePage = disclosurePageModule.createPage({
        React: React,
        DISCLOSURE_TABS: DISCLOSURE_TABS,
        disclosureTabLabel: disclosureTabLabel,
        EarningsSurpriseRankList: EarningsSurpriseRankList,
        EarningsTrendSidePanel: EarningsTrendSidePanel,
        emitWindowTitleDetail: emitWindowTitleDetail,
        ensureArray: ensureArray,
        fetchJson: fetchJson,
        ForeignReportedEarningsTable: ForeignReportedEarningsTable,
        h: h,
        loadDisclosurePageState: loadDisclosurePageState,
        LoadingBlock: LoadingBlock,
        MARKET_EARNINGS_TABS: MARKET_EARNINGS_TABS,
        MarketEarningsTable: MarketEarningsTable,
        numberFormat: numberFormat,
        persistDisclosurePageState: persistDisclosurePageState,
        postJson: postJson,
        requestPageNavigation: requestPageNavigation,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
        shiftIsoDate: shiftIsoDate,
        stashThemeStockNavigation: stashThemeStockNavigation,
        TelegramEarningsResults: TelegramEarningsResults,
        TelegramStockOverviewPanel: TelegramStockOverviewPanel,
        todayIsoDate: todayIsoDate,
        UPCOMING_EARNINGS_TABS: UPCOMING_EARNINGS_TABS,
        UpcomingEarningsCalendarPanel: UpcomingEarningsCalendarPanel,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize disclosure page module.", error);
    }
  }
  const telegramPageModule = getStockAppModule("telegramPage");

  function TelegramPageModuleUnavailable() {
    return h("div", { className: "page telegram-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "종목 정보 검색기"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let TelegramPage = TelegramPageModuleUnavailable;
  if (typeof telegramPageModule.createPage === "function") {
    try {
      TelegramPage = telegramPageModule.createPage({
        React: React,
        consumeTelegramStockNavigation: consumeTelegramStockNavigation,
        DISCLOSURE_TABS: DISCLOSURE_TABS,
        disclosureTabLabel: disclosureTabLabel,
        EarningsTrendSidePanel: EarningsTrendSidePanel,
        emitWindowTitleDetail: emitWindowTitleDetail,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        h: h,
        LoadingPanel: LoadingPanel,
        loadTelegramSearchState: loadTelegramSearchState,
        makeId: makeId,
        normalizeSearchValue: normalizeSearchValue,
        numberFormat: numberFormat,
        openUrlInDefaultBrowser: openUrlInDefaultBrowser,
        PAGE_NAV_EVENT: PAGE_NAV_EVENT,
        persistTelegramSearchState: persistTelegramSearchState,
        postJson: postJson,
        requestPageNavigation: requestPageNavigation,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
        stashThemeStockNavigation: stashThemeStockNavigation,
        StockNewsBriefPanel: StockNewsBriefPanel,
        TelegramChatFeed: TelegramChatFeed,
        TelegramEarningsResults: TelegramEarningsResults,
        TelegramStockOverviewPanel: TelegramStockOverviewPanel,
        useFetchJson: useFetchJson,
        WiseReportConsensusPanel: WiseReportConsensusPanel,
      });
    } catch (error) {
      console.error("Failed to initialize telegram page module.", error);
    }
  }
  function formatUsd(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return "$" + new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits == null ? 0 : digits,
      maximumFractionDigits: digits == null ? 0 : digits,
    }).format(number);
  }

  function formatUsdCompact(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    const abs = Math.abs(number);
    const units = [
      { value: 1000000000000, suffix: "T" },
      { value: 1000000000, suffix: "B" },
      { value: 1000000, suffix: "M" },
      { value: 1000, suffix: "K" },
    ];
    for (let index = 0; index < units.length; index += 1) {
      if (abs >= units[index].value) {
        return "$" + numberFormat(number / units[index].value, digits == null ? 2 : digits) + units[index].suffix;
      }
    }
    return formatUsd(number, digits == null ? 2 : digits);
  }

  function formatKrwEok(value, rate) {
    const number = Number(value);
    const fx = Number(rate);
    if (!Number.isFinite(number) || !Number.isFinite(fx) || fx <= 0) {
      return "-";
    }
    return numberFormat(number * fx / 100000000, 0) + "억원";
  }

  function formatKrwConverted(value, rate) {
    return formatKrwEok(value, rate);
  }

  function formatKrwWon(value, rate) {
    const number = Number(value);
    const fx = Number(rate);
    if (!Number.isFinite(number) || !Number.isFinite(fx) || fx <= 0) {
      return "-";
    }
    return numberFormat(number * fx, 0) + "원";
  }

  function formatGlobalMoney(value, rate) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return formatUsdCompact(number, 2) + " (" + formatKrwEok(number, rate) + ")";
  }

  function formatGlobalMarketCap(value, billion, rate) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    const billionValue = Number.isFinite(Number(billion)) ? Number(billion) : number / 1000000000;
    return "$" + numberFormat(billionValue, 1) + "B · " + formatUsdCompact(number, 2) + " (" + formatKrwEok(number, rate) + ")";
  }

  function formatGlobalPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return formatUsd(number, 2);
  }

  function formatGlobalNumberCompact(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    const abs = Math.abs(number);
    const units = [
      { value: 1000000000000, suffix: "T" },
      { value: 1000000000, suffix: "B" },
      { value: 1000000, suffix: "M" },
      { value: 1000, suffix: "K" },
    ];
    for (let index = 0; index < units.length; index += 1) {
      if (abs >= units[index].value) {
        return numberFormat(number / units[index].value, digits == null ? 2 : digits) + units[index].suffix;
      }
    }
    return numberFormat(number, digits == null ? 0 : digits);
  }

  function formatConsensusLine(value, rate) {
    return formatGlobalMoney(value, rate) + "(예상치 : -)";
  }

  function formatGlobalDateTime(value) {
    if (!value) {
      return "-";
    }
    return String(value).replace(/-/g, ".") + " 00:00:00";
  }

  function globalMarginPercent(numerator, revenue) {
    const value = Number(numerator);
    const sales = Number(revenue);
    if (!Number.isFinite(value) || !Number.isFinite(sales) || sales === 0) {
      return null;
    }
    return value / sales * 100;
  }

  function formatGlobalMarginPair(row) {
    const gpm = globalMarginPercent(row && row.gross_profit, row && row.revenue);
    const opm = globalMarginPercent(row && row.operating_income, row && row.revenue);
    return "(GPM " + formatPercent(gpm, 1) + " / OPM " + formatPercent(opm, 1) + ")";
  }

  function buildGlobalEarningsText(detail, rows, latest, rate) {
    const sourceName = ((detail || {}).source || {}).financials || "SEC XBRL";
    const trendLines = ensureArray(rows).slice(0, 5).map(function (row) {
      return [
        row.label,
        formatGlobalMoney(row.revenue, rate) + "/",
        formatGlobalMoney(row.operating_income, rate) + "/",
        formatGlobalMoney(row.net_income, rate),
        formatGlobalMarginPair(row),
      ].join(" ");
    });
    const latestMargins = formatGlobalMarginPair(latest || {});
    return [
      formatGlobalDateTime(latest.filed),
      "기업명: " + (detail.name || detail.symbol) + "(시가총액: " + formatKrwEok(detail.market_cap, rate) + ") " + detail.symbol,
      "보고서명: " + sourceName + " " + (String(latest.label || "").match(/Q$/) ? "분기" : "연간") + " 재무제표",
      "",
      "매출액 : " + formatConsensusLine(latest.revenue, rate),
      "영업익 : " + formatConsensusLine(latest.operating_income, rate) + " " + latestMargins,
      "순이익 : " + formatConsensusLine(latest.net_income, rate),
      "",
      "**최근 실적 추이**",
    ].concat(trendLines).join("\n");
  }

  function globalTradingViewSymbol(detail) {
    const source = detail || {};
    const symbol = String(source.symbol || "").trim().toUpperCase();
    if (!symbol) {
      return "";
    }
    const exchange = String(source.exchange || "").toLowerCase();
    let tvSymbol = symbol.replace("-", ".");
    let prefix = "NASDAQ";
    if (symbol.endsWith(".TW") || exchange.indexOf("taiwan") >= 0) {
      prefix = "TWSE";
      tvSymbol = symbol.replace(/\.TW$/, "");
    } else if (symbol.endsWith(".T") || exchange.indexOf("tokyo") >= 0 || exchange.indexOf("jpx") >= 0) {
      prefix = "TSE";
      tvSymbol = symbol.replace(/\.T$/, "");
    } else if (symbol.endsWith(".HK") || exchange.indexOf("hong kong") >= 0 || exchange.indexOf("hkse") >= 0) {
      prefix = "HKEX";
      tvSymbol = symbol.replace(/\.HK$/, "");
    } else if (symbol.endsWith(".AS") || exchange.indexOf("amsterdam") >= 0) {
      prefix = "EURONEXT";
      tvSymbol = symbol.replace(/\.AS$/, "");
    } else if (exchange.indexOf("nyse") >= 0 || exchange.indexOf("new york") >= 0) {
      prefix = "NYSE";
    } else if (exchange.indexOf("amex") >= 0 || exchange.indexOf("arca") >= 0) {
      prefix = "AMEX";
    } else if (exchange.indexOf("otc") >= 0) {
      prefix = "OTC";
    } else if (exchange.indexOf("nasdaq") >= 0 || exchange.indexOf("nms") >= 0 || exchange.indexOf("ngm") >= 0) {
      prefix = "NASDAQ";
    }
    return prefix + ":" + tvSymbol;
  }

  function tradingViewWidgetUrl(symbol) {
    if (!symbol) {
      return "";
    }
    return "https://s.tradingview.com/widgetembed/?symbol=" + encodeURIComponent(symbol)
      + "&interval=D&range=6M&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=FFFFFF&theme=light&style=1&timezone=America%2FNew_York&withdateranges=1&hideideas=1&studies=%5B%5D";
  }

  function htmlAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function TradingViewEmbed(props) {
    const src = props.src || "";
    if (!src) {
      return EmptyState({ compact: true, message: "차트를 표시할 티커 정보가 없습니다." });
    }
    const title = props.title || "TradingView chart";
    return h("div", {
      className: "global-tradingview-frame",
      dangerouslySetInnerHTML: {
        __html: '<iframe title="' + htmlAttribute(title) + '" src="' + htmlAttribute(src) + '" loading="lazy" allowfullscreen="true"></iframe>',
      },
    });
  }

  function loadStockNewsState() {
    try {
      const raw = localStorage.getItem(STOCK_NEWS_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return {
        query: String(parsed.query || ""),
        selected: parsed.selected || null,
        days: Number(parsed.days || 365),
        payload: parsed.payload || null,
      };
    } catch (err) {
      return {};
    }
  }

  function persistStockNewsState(state) {
    try {
      localStorage.setItem(STOCK_NEWS_KEY, JSON.stringify({
        query: state.query || "",
        selected: state.selected || null,
        days: state.days || 365,
        payload: state.payload || null,
      }));
    } catch (err) {
      // Ignore storage quota or private-mode failures.
    }
  }

  const stockNewsPageModule = getStockAppModule("stockNewsPage");

  function StockNewsPageModuleUnavailable() {
    return h("div", { className: "page stock-news-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "뉴스 검색기"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let StockNewsPage = StockNewsPageModuleUnavailable;
  if (typeof stockNewsPageModule.createPage === "function") {
    try {
      StockNewsPage = stockNewsPageModule.createPage({
        React: React,
        emitWindowTitleDetail: emitWindowTitleDetail,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        fetchJson: fetchJson,
        h: h,
        loadStockNewsState: loadStockNewsState,
        numberFormat: numberFormat,
        persistStockNewsState: persistStockNewsState,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
      });
    } catch (error) {
      console.error("Failed to initialize stock-news page module.", error);
    }
  }
  const globalCompanyPageModule = getStockAppModule("globalCompanyPage");

  function GlobalCompanyModuleUnavailable() {
    return h("div", { className: "page global-company-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "해외기업 검색기"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let GlobalCompanyPage = GlobalCompanyModuleUnavailable;
  if (typeof globalCompanyPageModule.createPage === "function") {
    try {
      GlobalCompanyPage = globalCompanyPageModule.createPage({
        React: React,
        buildGlobalEarningsText: buildGlobalEarningsText,
        emitWindowTitleDetail: emitWindowTitleDetail,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        fetchJson: fetchJson,
        formatGlobalMarketCap: formatGlobalMarketCap,
        formatGlobalMoney: formatGlobalMoney,
        formatGlobalNumberCompact: formatGlobalNumberCompact,
        formatGlobalPrice: formatGlobalPrice,
        formatKrwWon: formatKrwWon,
        formatPercent: formatPercent,
        formatUsdCompact: formatUsdCompact,
        getStockAppModule: getStockAppModule,
        GlobalEarningsCallPanel: GlobalEarningsCallPanel,
        globalMarginPercent: globalMarginPercent,
        globalTradingViewSymbol: globalTradingViewSymbol,
        h: h,
        LoadingBlock: LoadingBlock,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
        StockNewsBriefPanel: StockNewsBriefPanel,
        SummaryCard: SummaryCard,
        TradingViewEmbed: TradingViewEmbed,
        tradingViewWidgetUrl: tradingViewWidgetUrl,
      });
    } catch (error) {
      console.error("Failed to initialize global-company page module.", error);
    }
  }
  function buildEmptyStockRow() {
    return { id: makeId("stock-row"), query: "", code: "", name: "", market: "", suggestions: [], activeIndex: 0 };
  }

  function buildEmptySectorGroupV2() {
    return { id: makeId("sector"), sector: "", rows: [buildEmptyStockRow()] };
  }

  function buildSectorSnapshotGroupsFromDb(groups) {
    const source = ensureArray(groups).map(function (group) {
      const rows = ensureArray(group.stocks).map(function (stock) {
        return {
          id: makeId("stock-row"),
          query: stock.name || "",
          code: stock.code || "",
          name: stock.name || "",
          market: stock.market || "",
          suggestions: [],
          activeIndex: 0,
        };
      });
      return {
        id: makeId("sector"),
        sector: group.sector || "",
        rows: rows.length ? rows : [buildEmptyStockRow()],
      };
    });
    return source.length ? source : [buildEmptySectorGroupV2()];
  }

  function sanitizeSectorSnapshotGroups(value) {
    const source = ensureArray(value)
      .map(function (group) {
        const rows = ensureArray(group.rows)
          .map(function (row) {
            return {
              id: row.id || makeId("stock-row"),
              query: row.query || row.name || "",
              code: row.code || "",
              name: row.name || row.query || "",
              market: row.market || "",
              suggestions: [],
              activeIndex: 0,
            };
          });
        return {
          id: group.id || makeId("sector"),
          sector: group.sector || "",
          rows: rows.length ? rows : [buildEmptyStockRow()],
        };
      });
    return source.length ? source : [buildEmptySectorGroupV2()];
  }

  function loadSectorSnapshotGroups() {
    try {
      const raw = localStorage.getItem(SECTOR_SNAPSHOT_KEY);
      return raw ? sanitizeSectorSnapshotGroups(JSON.parse(raw)) : [buildEmptySectorGroupV2()];
    } catch (err) {
      return [buildEmptySectorGroupV2()];
    }
  }

  function persistSectorSnapshotGroups(groups) {
    const clean = sanitizeSectorSnapshotGroups(groups).map(function (group) {
      return {
        id: group.id,
        sector: group.sector,
        rows: group.rows.map(function (row) {
          return {
            id: row.id,
            query: row.query,
            code: row.code,
            name: row.name,
            market: row.market,
          };
        }),
      };
    });
    localStorage.setItem(SECTOR_SNAPSHOT_KEY, JSON.stringify(clean));
  }

  const globalIndicesPageModule = getStockAppModule("globalIndicesPage");

  function GlobalIndicesPageModuleUnavailable() {
    return h("div", { className: "page global-indices-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "지수/가격동향"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let GlobalIndicesPage = GlobalIndicesPageModuleUnavailable;
  if (typeof globalIndicesPageModule.createPage === "function") {
    try {
      GlobalIndicesPage = globalIndicesPageModule.createPage({
        React: React,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        formatPercent: formatPercent,
        GlobalIndicesChart: GlobalIndicesChart,
        h: h,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize global-indices page module.", error);
    }
  }
  function correlationClassName(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "metric-flat";
    if (number >= 0.7) return "metric-up";
    if (number <= -0.7) return "metric-down";
    return "metric-flat";
  }

  function describeCorrelation(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    if (number >= 0.8) return "매우 강한 양의 상관";
    if (number >= 0.5) return "강한 양의 상관";
    if (number >= 0.2) return "약한 양의 상관";
    if (number > -0.2) return "상관 약함";
    if (number > -0.5) return "약한 음의 상관";
    if (number > -0.8) return "강한 음의 상관";
    return "매우 강한 음의 상관";
  }

  function formatCorrelationAssetLabel(item) {
    if (!item) return "";
    const name = String(item.name || "").trim();
    const symbol = String(item.symbol || item.code || item.value || "").trim();
    if (!name) return symbol;
    if (!symbol || symbol === name) return name;
    return name + " (" + symbol + ")";
  }

  function PairCorrelationChart(props) {
    const rows = ensureArray(props.rows).filter(function (row) {
      return Number.isFinite(Number(row.left_norm)) && Number.isFinite(Number(row.right_norm));
    });
    const left = props.left || {};
    const right = props.right || {};
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(function (row) { return formatDateLabel(row.date); }),
          datasets: [
            {
              label: formatCorrelationAssetLabel(left) || "왼쪽",
              data: rows.map(function (row) { return Number(row.left_norm); }),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.12)",
              borderWidth: 2.4,
              pointRadius: 0,
              tension: 0.22,
            },
            {
              label: formatCorrelationAssetLabel(right) || "오른쪽",
              data: rows.map(function (row) { return Number(row.right_norm); }),
              borderColor: "#ef4444",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              borderWidth: 2.4,
              pointRadius: 0,
              tension: 0.22,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top", labels: { boxWidth: 18, boxHeight: 6, useBorderRadius: true, borderRadius: 3 } },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const row = rows[context.dataIndex] || {};
                  if (context.datasetIndex === 0) {
                    return (context.dataset.label || "왼쪽") + " " + numberFormat(row.left_norm, 2) + " / 종가 " + numberFormat(row.left_close, 2);
                  }
                  return (context.dataset.label || "오른쪽") + " " + numberFormat(row.right_norm, 2) + " / 종가 " + numberFormat(row.right_close, 2);
                },
              },
            },
          },
          scales: {
            y: {
              title: { display: true, text: "기준값 100" },
              ticks: { callback: function (value) { return numberFormat(value, 1); } },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
            x: {
              grid: { display: false },
            },
          },
        },
      });
    }, [
      rows.map(function (row) { return [row.date, row.left_norm, row.right_norm].join(":"); }).join("|"),
      left.symbol || left.code || left.value || "",
      right.symbol || right.code || right.value || "",
    ]);
    if (!rows.length) {
      return h(EmptyState, { compact: true, message: "비교할 공통 가격 데이터가 없습니다." });
    }
    return h("div", { className: "pair-correlation-chart" }, h("canvas", { ref: canvasRef }));
  }

  const pairCorrelationPageModule = getStockAppModule("pairCorrelationPage");

  function PairCorrelationPageModuleUnavailable() {
    return h("div", { className: "page pair-correlation-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "주가 상관관계"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let PairCorrelationPage = PairCorrelationPageModuleUnavailable;
  if (typeof pairCorrelationPageModule.createPage === "function") {
    try {
      PairCorrelationPage = pairCorrelationPageModule.createPage({
        React: React,
        correlationClassName: correlationClassName,
        describeCorrelation: describeCorrelation,
        emitWindowTitleDetail: emitWindowTitleDetail,
        ensureArray: ensureArray,
        fetchJson: fetchJson,
        formatCorrelationAssetLabel: formatCorrelationAssetLabel,
        formatPercent: formatPercent,
        h: h,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        PAIR_CORRELATION_KEY: PAIR_CORRELATION_KEY,
        PairCorrelationChart: PairCorrelationChart,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
        SummaryCard: SummaryCard,
      });
    } catch (error) {
      console.error("Failed to initialize pair-correlation page module.", error);
    }
  }
  const etfFlowPageModule = getStockAppModule("etfFlowPage");

  function EtfFlowPageModuleUnavailable() {
    return h("div", { className: "page etf-flow-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "ETF 자금 추정"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let EtfFlowPage = EtfFlowPageModuleUnavailable;
  if (typeof etfFlowPageModule.createPage === "function") {
    try {
      EtfFlowPage = etfFlowPageModule.createPage({
        React: React,
        emitWindowTitleDetail: emitWindowTitleDetail,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ETF_FLOW_PAGE_KEY: ETF_FLOW_PAGE_KEY,
        fetchJson: fetchJson,
        formatCorrelationAssetLabel: formatCorrelationAssetLabel,
        formatMoneyByCurrency: formatMoneyByCurrency,
        formatPercent: formatPercent,
        h: h,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
        SortableDataTable: SortableDataTable,
        SummaryCard: SummaryCard,
      });
    } catch (error) {
      console.error("Failed to initialize etf-flow page module.", error);
    }
  }
  const institutionalRebalancePageModule = getStockAppModule("institutionalRebalancePage");

  function InstitutionalRebalancePageModuleUnavailable() {
    return h("div", { className: "page institutional-rebalance-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "기관 리밸런싱 추정"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let InstitutionalRebalancePage = InstitutionalRebalancePageModuleUnavailable;
  if (typeof institutionalRebalancePageModule.createPage === "function") {
    try {
      InstitutionalRebalancePage = institutionalRebalancePageModule.createPage({
        React: React,
        DataTable: DataTable,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        formatPercent: formatPercent,
        h: h,
        LoadingBlock: LoadingBlock,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize institutional-rebalance page module.", error);
    }
  }
  function SectorEntryLeaderChips(props) {
    const stocks = ensureArray(props.stocks);
    const betaLabel = props.betaLabel || "";
    const onOpenChart = props.onOpenChart;
    if (!stocks.length) {
      return h("span", { className: "summary-help" }, "-");
    }
    return h(
      "div",
      { className: "sector-entry-leader-chip-row" },
      stocks.map(function (stock) {
        const status = stock.trend_status || "normal";
        const label = (stock.stock_name || stock.stock_code || "-") + (stock.beta == null ? "" : " β " + numberFormat(stock.beta, 2));
        const content = [
          label,
          stock.trend_label ? h("em", { key: "trend" }, stock.trend_label) : null,
        ];
        const commonProps = {
          key: (stock.stock_code || stock.stock_name || "") + status,
          className: "sector-entry-stock-chip " + status + (onOpenChart ? " clickable" : ""),
          title: [betaLabel ? "베타 " + betaLabel : "", stock.trend_label || "", onOpenChart ? "차트 미리보기" : ""].filter(Boolean).join(" · "),
        };
        if (typeof onOpenChart === "function") {
          return h(
            "button",
            Object.assign({}, commonProps, {
              type: "button",
              onClick: function () { onOpenChart(stock); },
            }),
            content
          );
        }
        return h(
          "span",
          commonProps,
          content
        );
      })
    );
  }

  const sectorEntryPageModule = getStockAppModule("sectorEntryPage");

  function SectorEntrySignalPageModuleUnavailable() {
    return h("div", { className: "page sector-entry-page" },
      h("section", { className: "panel" },
        h(SectionTitle, null, "섹터 진입 신호"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let SectorEntrySignalPage = SectorEntrySignalPageModuleUnavailable;
  if (typeof sectorEntryPageModule.createPage === "function") {
    try {
      SectorEntrySignalPage = sectorEntryPageModule.createPage({
        React: React,
        CHART_PREVIEW_CACHE: CHART_PREVIEW_CACHE,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatPercent: formatPercent,
        h: h,
        LoadingBlock: LoadingBlock,
        numberFormat: numberFormat,
        postJson: postJson,
        scoreSpan: scoreSpan,
        SectionTitle: SectionTitle,
        SectorEntryLeaderChips: SectorEntryLeaderChips,
        SortableDataTable: SortableDataTable,
        StockChartPreview: StockChartPreview,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize sector-entry page module.", error);
    }
  }
  const breakoutStatsPageModule = getStockAppModule("breakoutStatsPage");
  function BreakoutStatsPageUnavailable() {
    return h("div", { className: "page breakout-stats-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "돌파 통계"), h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }
  let BreakoutStatsPage = BreakoutStatsPageUnavailable;
  if (typeof breakoutStatsPageModule.createPage === "function") {
    try {
      BreakoutStatsPage = breakoutStatsPageModule.createPage({
        React: React, h: h, ensureArray: ensureArray, numberFormat: numberFormat,
        formatPercent: formatPercent, fetchJson: fetchJson, postJson: postJson,
        ThemeSectorInput: ThemeSectorInput, SectionTitle: SectionTitle,
        SummaryCard: SummaryCard, colorForKey: colorForKey,
      });
    } catch (error) { console.error("Failed to initialize breakout-stats page module.", error); }
  }
  const sectorSnapshotPageModule = getStockAppModule("sectorSnapshotPage");

  function SectorSnapshotPageV2ModuleUnavailable() {
    return h("div", { className: "page sector-snapshot-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "섹터 비교 테이블"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let SectorSnapshotPageV2 = SectorSnapshotPageV2ModuleUnavailable;
  if (typeof sectorSnapshotPageModule.createPage === "function") {
    try {
      SectorSnapshotPageV2 = sectorSnapshotPageModule.createPage({
        React: React,
        buildEmptySectorGroupV2: buildEmptySectorGroupV2,
        buildEmptyStockRow: buildEmptyStockRow,
        buildSectorSnapshotGroupsFromDb: buildSectorSnapshotGroupsFromDb,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        h: h,
        LoadingBlock: LoadingBlock,
        LoadingPanel: LoadingPanel,
        metricSpan: metricSpan,
        numberFormat: numberFormat,
        postDownload: postDownload,
        postJson: postJson,
        ratioSpan: ratioSpan,
        scoreSpan: scoreSpan,
        SectionTitle: SectionTitle,
        SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY: SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY,
        SECTOR_SNAPSHOT_KEY: SECTOR_SNAPSHOT_KEY,
        selectTextOnFocus: selectTextOnFocus,
        SortableDataTable: SortableDataTable,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize sector-snapshot page module.", error);
    }
  }
  const themesPageFeatureModule = getStockAppModule("themesPageFeature");

  function ThemesPageV2ModuleUnavailable() {
    return h("div", { className: "page themes-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "오늘의 주도주"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let ThemesPageV2 = ThemesPageV2ModuleUnavailable;
  if (typeof themesPageFeatureModule.createPage === "function") {
    try {
      ThemesPageV2 = themesPageFeatureModule.createPage({
        React: React,
        AUTO_DAILY_THEME_BUILD_EVENT: AUTO_DAILY_THEME_BUILD_EVENT,
        buildBusinessMonthCells: buildBusinessMonthCells,
        ensureArray: ensureArray,
        fetchJson: fetchJson,
        filterCalendarDays: filterCalendarDays,
        formatPercent: formatPercent,
        getCalendarTopSectors: getCalendarTopSectors,
        getStockAppModule: getStockAppModule,
        h: h,
        LoadingBlock: LoadingBlock,
        loadThemeSectorState: loadThemeSectorState,
        normalizeTimestampMs: normalizeTimestampMs,
        numberFormat: numberFormat,
        persistThemeSectorState: persistThemeSectorState,
        postJson: postJson,
        prefetchJson: prefetchJson,
        removeBackgroundTask: removeBackgroundTask,
        renderHighDrawdownPercent: renderHighDrawdownPercent,
        THEME_STOCK_NAV_KEY: THEME_STOCK_NAV_KEY,
        DataTable: DataTable,
        ErrorPanel: ErrorPanel,
        LoadingPanel: LoadingPanel,
        upsertBackgroundTask: upsertBackgroundTask,
        useFetchJson: useFetchJson,
        calendarRankCellClass: calendarRankCellClass,
        calendarRankCellStyle: calendarRankCellStyle,
        CHART_PREVIEW_CACHE: CHART_PREVIEW_CACHE,
        colorForKey: colorForKey,
        copyImageBlobWithFallback: copyImageBlobWithFallback,
        EmptyState: EmptyState,
        formatDateLabel: formatDateLabel,
        formatMoneyByCurrency: formatMoneyByCurrency,
        formatNumber: formatNumber,
        invalidateApiCache: invalidateApiCache,
        latestTargetReportRows: latestTargetReportRows,
        LeaderCalendarScoreChart: LeaderCalendarScoreChart,
        loadTelegramSearchState: loadTelegramSearchState,
        mergeScoreHistoryPayloadRows: mergeScoreHistoryPayloadRows,
        monthLabel: monthLabel,
        persistTelegramSearchState: persistTelegramSearchState,
        requestPageNavigation: requestPageNavigation,
        ScoreHistoryChart: ScoreHistoryChart,
        SectionTitle: SectionTitle,
        SectorMarketCapChart: SectorMarketCapChart,
        shiftIsoDate: shiftIsoDate,
        shiftMonth: shiftMonth,
        stashTelegramStockNavigation: stashTelegramStockNavigation,
        StockChartPreview: StockChartPreview,
        SummaryCard: SummaryCard,
        TARGET_HISTORY_CACHE: TARGET_HISTORY_CACHE,
        TargetReportHoverBadge: TargetReportHoverBadge,
        ThemeNoteInput: ThemeNoteInput,
        ThemeSectorInput: ThemeSectorInput,
        TradingValueHistoryChart: TradingValueHistoryChart,
      });
    } catch (error) {
      console.error("Failed to initialize themes page module.", error);
    }
  }

  const MemoThemesPageV2 = React.memo(ThemesPageV2);

  const internationalThemesPagesModule = getStockAppModule("internationalThemesPages");

  function InternationalThemesModuleUnavailable(props) {
    return h("div", { className: "page international-themes-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, (props && props.title) || "해외 주도주"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")));
  }

  let GlobalThemesPage = function () { return h(InternationalThemesModuleUnavailable, { title: "미국 주도주" }); };
  let AsiaThemesPage = function () { return h(InternationalThemesModuleUnavailable, { title: "아시아 주도주" }); };
  if (typeof internationalThemesPagesModule.createPages === "function") {
    try {
      const internationalThemesPages = internationalThemesPagesModule.createPages({
        React: React,
        AUTO_DAILY_THEME_BUILD_EVENT: AUTO_DAILY_THEME_BUILD_EVENT,
        buildBusinessMonthCells: buildBusinessMonthCells,
        calendarRankCellClass: calendarRankCellClass,
        calendarRankCellStyle: calendarRankCellStyle,
        colorForKey: colorForKey,
        copyImageBlobWithFallback: copyImageBlobWithFallback,
        emitWindowTitleDetail: emitWindowTitleDetail,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        filterCalendarDays: filterCalendarDays,
        formatDateLabel: formatDateLabel,
        formatPercent: formatPercent,
        getCalendarTopSectors: getCalendarTopSectors,
        h: h,
        invalidateApiCache: invalidateApiCache,
        LoadingBlock: LoadingBlock,
        LoadingPanel: LoadingPanel,
        mergeScoreHistoryPayloadRows: mergeScoreHistoryPayloadRows,
        monthLabel: monthLabel,
        normalizeTimestampMs: normalizeTimestampMs,
        numberFormat: numberFormat,
        openStockInGlobalCompany: openStockInGlobalCompany,
        postJson: postJson,
        removeBackgroundTask: removeBackgroundTask,
        renderHighDrawdownPercent: renderHighDrawdownPercent,
        ScoreHistoryChart: ScoreHistoryChart,
        SectionTitle: SectionTitle,
        selectTextOnFocus: selectTextOnFocus,
        shiftIsoDate: shiftIsoDate,
        shiftMonth: shiftMonth,
        StockChartPreview: StockChartPreview,
        SummaryCard: SummaryCard,
        THEME_STOCK_NAV_KEY: THEME_STOCK_NAV_KEY,
        TradingValueHistoryChart: TradingValueHistoryChart,
        upsertBackgroundTask: upsertBackgroundTask,
        useFetchJson: useFetchJson,
      });
      GlobalThemesPage = internationalThemesPages.GlobalThemesPage || GlobalThemesPage;
      AsiaThemesPage = internationalThemesPages.AsiaThemesPage || AsiaThemesPage;
    } catch (error) {
      console.error("Failed to initialize international-themes page module.", error);
    }
  }

  const UNIFIED_THEME_MARKET_TAB_KEY = "stock-dashboard:unified-theme-market-tab";

  function readUnifiedThemeMarketTab() {
    try {
      const value = localStorage.getItem(UNIFIED_THEME_MARKET_TAB_KEY);
      return ["us", "jp", "cn", "hk"].indexOf(value) >= 0 ? value : "kr";
    } catch (error) {
      return "kr";
    }
  }

  function writeUnifiedThemeMarketTab(value) {
    try {
      localStorage.setItem(UNIFIED_THEME_MARKET_TAB_KEY, ["us", "jp", "cn", "hk"].indexOf(value) >= 0 ? value : "kr");
    } catch (error) {
    }
  }

  function UnifiedThemesPage() {
    const [marketTab, setMarketTab] = React.useState(readUnifiedThemeMarketTab);
    const tabs = [
      { key: "kr", label: "국내", help: "국내 SQL 데이터" },
      { key: "us", label: "미국", help: "미국 SQL 데이터" },
      { key: "jp", label: "일본", help: "일본 SQL 데이터" },
      { key: "cn", label: "중국", help: "중국 SQL 데이터" },
      { key: "hk", label: "홍콩", help: "홍콩 SQL 데이터" },
    ];

    function changeMarketTab(nextTab) {
      setMarketTab(nextTab);
      writeUnifiedThemeMarketTab(nextTab);
    }

    let activeMarketPage = h(MemoThemesPageV2);
    if (marketTab === "us") {
      activeMarketPage = h(GlobalThemesPage);
    } else if (marketTab === "jp") {
      activeMarketPage = h(AsiaThemesPage, { region: "jp", regionLabel: "일본" });
    } else if (marketTab === "cn") {
      activeMarketPage = h(AsiaThemesPage, { region: "cn", regionLabel: "중국" });
    } else if (marketTab === "hk") {
      activeMarketPage = h(AsiaThemesPage, { region: "hk", regionLabel: "홍콩" });
    }

    return h(
      "div",
      { className: "unified-themes-page" },
      h(
        "section",
        { className: "unified-theme-tabs-panel" },
        h(
          "div",
          { className: "unified-theme-tabs" },
          tabs.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "unified-theme-tab" + (marketTab === tab.key ? " active" : ""),
                onClick: function () { changeMarketTab(tab.key); },
                title: tab.help,
              },
              tab.label
            );
          })
        )
      ),
      activeMarketPage
    );
  }

  const MemoUnifiedThemesPage = React.memo(UnifiedThemesPage);

  function BackgroundPreloader(props) {
    useEffect(function () {
      if (props && props.publicWeb) {
        return;
      }
      const savedThemeState = loadThemeSectorState();
      const lastFileDate = savedThemeState.lastFileDate || "";
      const themesPageModule = getStockAppModule("themesPage");
      const urls = typeof themesPageModule.buildBackgroundPrefetchUrls === "function"
        ? themesPageModule.buildBackgroundPrefetchUrls({ publicWeb: !!(props && props.publicWeb), lastFileDate: lastFileDate })
        : [
            "/api/sector-watch-board?limit_per_sector=80",
            "/api/portfolio/performance",
            "/api/themes/today?min_score=0&recent_limit=20",
            "/api/sector-db",
            "/api/theme-sector-calendar?min_score=0&limit=60",
            "/api/real-estate/building",
          ];
      if (typeof themesPageModule.buildBackgroundPrefetchUrls !== "function") {
        if (!(props && props.publicWeb)) {
          urls.push("/api/telegram/status");
        }
        if (lastFileDate) {
          urls.push("/api/themes/today?min_score=0&recent_limit=20&file_date=" + encodeURIComponent(lastFileDate));
        }
      }
      const filteredUrls = urls.filter(function (url) {
        return typeof url === "string" && url.indexOf("/api/sector-watch-board") !== 0;
      });
      filteredUrls.forEach(function (url, index) {
        window.setTimeout(function () { prefetchJson(url); }, index * 180);
      });
    }, [props && props.publicWeb]);
    return null;
  }

  function GlobalLoadingDock() {
    const [requests, setRequests] = useState(getActiveApiRequests());
    const [tasks, setTasks] = useState(getActiveBackgroundTasks());
    const [tick, setTick] = useState(0);
    const [detailOpen, setDetailOpen] = useState(false);

    useEffect(function () {
      function syncRequests() {
        setRequests(getActiveApiRequests());
        setTasks(getActiveBackgroundTasks());
      }
      window.addEventListener("stock-api-loading-change", syncRequests);
      window.addEventListener("stock-background-task-change", syncRequests);
      const timer = window.setInterval(function () {
        setTick(function (value) { return value + 1; });
        syncRequests();
      }, 1000);
      syncRequests();
      return function () {
        window.removeEventListener("stock-api-loading-change", syncRequests);
        window.removeEventListener("stock-background-task-change", syncRequests);
        window.clearInterval(timer);
      };
    }, []);

    if (!requests.length && !tasks.length) {
      return null;
    }
    const firstRequest = requests[0] || null;
    const firstTask = tasks[0] || null;
    const primaryLabel = firstTask
      ? (firstTask.label || firstTask.message || "백그라운드 작업")
      : (firstRequest ? firstRequest.label : "작업");
    const primarySeconds = Math.max(0, Math.round((Date.now() - normalizeTimestampMs((firstTask && firstTask.startedAt) || (firstRequest && firstRequest.startedAt) || Date.now())) / 1000));
    const extraCount = Math.max(0, requests.length + tasks.length - 1);
    const primaryPercent = firstTask && Number.isFinite(Number(firstTask.percent)) ? Number(firstTask.percent) : null;
    return h(
      React.Fragment,
      null,
      h(
        "button",
        {
          type: "button",
          className: "global-loading-dock",
          "aria-live": "polite",
          onClick: function () { setDetailOpen(true); },
        },
        h("div", { className: "global-loading-title" },
          h("strong", null, "로드 중"),
          h("span", null, extraCount ? primaryLabel + " 외 " + numberFormat(extraCount, 0) + "개" : primaryLabel)
        ),
        primaryPercent == null
          ? h("div", { className: "loading-bar indeterminate" }, h("span", null))
          : h("div", { className: "loading-bar determinate" }, h("span", { style: { width: Math.max(0, Math.min(primaryPercent, 100)) + "%" } })),
        h("div", { className: "global-loading-meta" },
          h("em", { className: "global-loading-time" }, primarySeconds + "초"),
          primaryPercent == null ? null : h("span", { className: "global-loading-percent" }, numberFormat(primaryPercent, 0) + "%")
        )
      ),
      detailOpen
        ? h(
            "div",
            { className: "modal-backdrop", onClick: function () { setDetailOpen(false); } },
            h(
              "div",
              { className: "modal-card global-loading-modal", onClick: function (event) { event.stopPropagation(); } },
              h(
                "div",
                { className: "modal-head" },
                h("div", null, h("strong", null, "진행 중 작업"), h("div", { className: "summary-help" }, "현재 요청과 백그라운드 계산 상태")),
                h("button", { type: "button", className: "mini-button", onClick: function () { setDetailOpen(false); } }, "닫기")
              ),
              h(
                "div",
                { className: "global-loading-modal-body" },
                tasks.length
                  ? h(
                      "div",
                      { className: "global-loading-section" },
                      h("h3", null, "백그라운드 작업"),
                      tasks.map(function (task) {
                        const percent = Number(task.percent);
                        const startedAt = normalizeTimestampMs(task.startedAt || task.updatedAt || Date.now());
                        const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
                        return h(
                          "div",
                          { key: task.id, className: "global-loading-item" },
                          h("div", { className: "global-loading-item-head" },
                            h("strong", null, task.label || task.marketLabel || "백그라운드 작업"),
                            h("span", null, Number.isFinite(percent) ? numberFormat(percent, 0) + "%" : "-")
                          ),
                          h("div", { className: "summary-help" }, task.message || task.status || ""),
                          h("div", { className: "loading-bar determinate compact" }, h("span", { style: { width: Math.max(0, Math.min(Number.isFinite(percent) ? percent : 0, 100)) + "%" } })),
                          h("div", { className: "global-loading-item-meta" },
                            h("span", null, "상태 " + String(task.status || "-")),
                            h("span", null, "시작 " + formatDateTimeShort(startedAt) + " · " + seconds + "초")
                          )
                        );
                      })
                    )
                  : null,
                requests.length
                  ? h(
                      "div",
                      { className: "global-loading-section" },
                      h("h3", null, "실시간 요청"),
                      requests.map(function (request) {
                        const seconds = Math.max(0, Math.round((Date.now() - normalizeTimestampMs(request.startedAt)) / 1000));
                        return h(
                          "div",
                          { key: request.id, className: "global-loading-item" },
                          h("div", { className: "global-loading-item-head" },
                            h("strong", null, request.label),
                            h("span", null, "진행률 없음")
                          ),
                          h("div", { className: "summary-help" }, request.url),
                          h("div", { className: "loading-bar indeterminate compact" }, h("span", null)),
                          h("div", { className: "global-loading-item-meta" },
                            h("span", null, "상태 요청 중"),
                            h("span", null, seconds + "초")
                          )
                        );
                      })
                    )
                  : null
              )
            )
          )
        : null
    );
  }

  function handleMainContentWheel(event) {
    const target = event.currentTarget;
    if (!target) {
      return;
    }
    const canScrollHorizontally = target.scrollWidth > target.clientWidth + 1;
    if (!canScrollHorizontally) {
      return;
    }
    const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const shiftWheelIntent = event.shiftKey && Math.abs(event.deltaY) > 0;
    if (!horizontalIntent && !shiftWheelIntent) {
      return;
    }
    const delta = horizontalIntent ? event.deltaX : event.deltaY;
    if (!delta) {
      return;
    }
    target.scrollLeft += delta;
    event.preventDefault();
  }

  const marketCalendarPageModule = getStockAppModule("marketCalendarPage");

  function MarketCalendarPageModuleUnavailable() {
    return h("div", { className: "page market-calendar-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "증시 일정"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
    ));
  }

  let MarketCalendarPage = MarketCalendarPageModuleUnavailable;
  if (typeof marketCalendarPageModule.createPage === "function") {
    try {
      MarketCalendarPage = marketCalendarPageModule.createPage({
        React: React,
        buildMonthCells: buildMonthCells,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatDateLabel: formatDateLabel,
        h: h,
        isoDateOffset: isoDateOffset,
        LoadingPanel: LoadingPanel,
        monthLabel: monthLabel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        shiftMonth: shiftMonth,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize market-calendar page module.", error);
    }
  }
  function metricSpan(value, kind) {
    if (value == null || !Number.isFinite(Number(value))) {
      return h("span", null, "-");
    }
    const number = Number(value);
    let className = "metric-flat";
    if (number > 0) {
      className = "metric-up";
    } else if (number < 0) {
      className = "metric-down";
    }
    const text = kind === "price" ? numberFormat(number, 0) : formatPercent(number, 2);
    return h("span", { className: className }, text);
  }

  function scoreSpan(value) {
    if (value == null || !Number.isFinite(Number(value))) {
      return h("span", null, "-");
    }
    const number = Number(value);
    let className = "metric-flat";
    if (number > 0) {
      className = "metric-up";
    } else if (number < 0) {
      className = "metric-down";
    }
    return h("span", { className: className }, numberFormat(number, 2));
  }

  function ratioSpan(value) {
    if (value == null || !Number.isFinite(Number(value))) {
      return h("span", null, "-");
    }
    const number = Number(value);
    let className = "metric-flat";
    if (number > 0) {
      className = "metric-up";
    } else if (number < 0) {
      className = "metric-down";
    }
    return h("span", { className: className }, numberFormat(number * 1000, 1));
  }

  function NextPage() {
    return h(
      "div",
      { className: "panel placeholder" },
      h(
        "div",
        null,
        h("div", { className: "eyebrow" }, "Coming Next"),
        h("h1", { className: "page-title" }, "건물 관리"),
        h("p", { className: "page-copy compact-copy" }, "다음 기능을 붙일 자리를 비워두었습니다. 원하는 페이지 구조와 데이터 소스를 알려주시면 이어서 만들 수 있습니다.")
      )
    );
  }

  const tradeDataPageModule = getStockAppModule("tradeDataPage");

  function TradeImportExportPageModuleUnavailable() {
    return h("div", { className: "page trade-data-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "수출입"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
    ));
  }

  let TradeImportExportPage = TradeImportExportPageModuleUnavailable;
  if (typeof tradeDataPageModule.createPage === "function") {
    try {
      TradeImportExportPage = tradeDataPageModule.createPage({
        React: React,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        formatPercent: formatPercent,
        h: h,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize trade-data page module.", error);
    }
  }
  function economyPhaseClass(phase) {
    if (phase === "상승") return "expansion";
    if (phase === "둔화") return "slowdown";
    if (phase === "하강") return "contraction";
    return "recovery";
  }

  function economyCategoryClass(categoryKey) {
    if (categoryKey === "liquidity") return "liquidity";
    if (categoryKey === "breadth") return "breadth";
    if (categoryKey === "risk") return "risk";
    return "fundamental";
  }

  function EconomyCycleClock(props) {
    const indicators = ensureArray(props.indicators);
    const average = props.average || {};
    const size = 560;
    const pad = 54;
    const plotSize = size - pad * 2;
    const maxAbs = 4.2;
    function x(value) {
      return pad + (Number(value || 0) + maxAbs) / (maxAbs * 2) * plotSize;
    }
    function y(value) {
      return pad + (maxAbs - Number(value || 0)) / (maxAbs * 2) * plotSize;
    }
    const phaseLabels = [
      { label: "회복", x: -2.7, y: 2.9, className: "recovery" },
      { label: "상승", x: 2.7, y: 2.9, className: "expansion" },
      { label: "둔화", x: 2.7, y: -2.9, className: "slowdown" },
      { label: "하강", x: -2.7, y: -2.9, className: "contraction" },
    ];
    return h(
      "div",
      { className: "economy-clock-wrap" },
      h(
        "svg",
        { className: "economy-clock-svg", viewBox: "0 0 " + size + " " + size, role: "img" },
        h("rect", { x: pad, y: pad, width: plotSize / 2, height: plotSize / 2, className: "cycle-zone recovery" }),
        h("rect", { x: pad + plotSize / 2, y: pad, width: plotSize / 2, height: plotSize / 2, className: "cycle-zone expansion" }),
        h("rect", { x: pad + plotSize / 2, y: pad + plotSize / 2, width: plotSize / 2, height: plotSize / 2, className: "cycle-zone slowdown" }),
        h("rect", { x: pad, y: pad + plotSize / 2, width: plotSize / 2, height: plotSize / 2, className: "cycle-zone contraction" }),
        h("line", { x1: pad, x2: size - pad, y1: y(0), y2: y(0), className: "cycle-axis" }),
        h("line", { x1: x(0), x2: x(0), y1: pad, y2: size - pad, className: "cycle-axis" }),
        h("text", { x: size / 2, y: 24, className: "cycle-axis-label", textAnchor: "middle" }, "모멘텀 개선"),
        h("text", { x: size / 2, y: size - 16, className: "cycle-axis-label", textAnchor: "middle" }, "모멘텀 둔화"),
        h("text", { x: 14, y: size / 2, className: "cycle-axis-label vertical", textAnchor: "middle" }, "기준선 아래"),
        h("text", { x: size - 14, y: size / 2, className: "cycle-axis-label vertical", textAnchor: "middle" }, "기준선 위"),
        phaseLabels.map(function (phase) {
          return h("text", { key: phase.label, x: x(phase.x), y: y(phase.y), className: "cycle-phase-label " + phase.className, textAnchor: "middle" }, phase.label);
        }),
        indicators.map(function (item, index) {
          const cx = x(item.x);
          const cy = y(item.y);
          const categoryClass = economyCategoryClass(item.category_key);
          return h(
            "g",
            { key: item.key || index, className: "cycle-point " + economyPhaseClass(item.phase) + " category-" + categoryClass },
            h("rect", { x: cx - 4, y: cy - 19, width: 8, height: 8, rx: 2, className: "cycle-category-marker " + categoryClass }),
            h("circle", { cx: cx, cy: cy, r: item.group === "글로벌" ? 7 : 9 }),
            h("text", { x: cx + 12, y: cy + 4 }, item.name)
          );
        }),
        h(
          "g",
          { className: "cycle-average-point " + economyPhaseClass(average.phase) },
          h("circle", { cx: x(average.x), cy: y(average.y), r: 13 }),
          h("text", { x: x(average.x) + 16, y: y(average.y) - 10 }, "종합")
        )
      )
    );
  }

  function EconomyCycleTrend(props) {
    const indicator = props.indicator || {};
    const points = ensureArray(indicator.series).filter(function (point) {
      return Number.isFinite(Number(point.metric));
    });
    if (!points.length) {
      return h("div", { className: "economy-trend-empty" }, "추이 데이터가 없습니다.");
    }
    const width = 420;
    const height = 120;
    const pad = { top: 10, right: 12, bottom: 24, left: 36 };
    const values = points.map(function (point) { return Number(point.metric); });
    let minValue = Math.min.apply(null, values);
    let maxValue = Math.max.apply(null, values);
    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }
    const range = maxValue - minValue || 1;
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    function x(index) {
      return pad.left + (points.length === 1 ? chartWidth : index / (points.length - 1) * chartWidth);
    }
    function y(value) {
      return pad.top + (maxValue - Number(value)) / range * chartHeight;
    }
    const linePoints = points.map(function (point, index) {
      return x(index).toFixed(1) + "," + y(point.metric).toFixed(1);
    }).join(" ");
    const latestPoint = points[points.length - 1];
    return h(
      "svg",
      { className: "economy-trend-svg", viewBox: "0 0 " + width + " " + height },
      h("line", { x1: pad.left, x2: width - pad.right, y1: y(maxValue), y2: y(maxValue), className: "economy-trend-grid-line" }),
      h("line", { x1: pad.left, x2: width - pad.right, y1: y(minValue), y2: y(minValue), className: "economy-trend-grid-line" }),
      indicator.display_unit === "지수" && minValue < 100 && maxValue > 100
        ? h("line", { x1: pad.left, x2: width - pad.right, y1: y(100), y2: y(100), className: "economy-trend-base" })
        : null,
      h("polyline", { points: linePoints, className: "economy-trend-line " + economyPhaseClass(indicator.phase) }),
      h("circle", { cx: x(points.length - 1), cy: y(latestPoint.metric), r: 3.5, className: "economy-trend-dot " + economyPhaseClass(indicator.phase) }),
      h("text", { x: pad.left, y: height - 6, className: "economy-trend-label" }, formatDateLabel(points[0].date)),
      h("text", { x: width - pad.right, y: height - 6, textAnchor: "end", className: "economy-trend-label" }, formatDateLabel(latestPoint.date))
    );
  }

  const economyCyclePageModule = getStockAppModule("economyCyclePage");

  function EconomyCycleClockPageModuleUnavailable() {
    return h("div", { className: "page economy-cycle-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "경기순환"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
    ));
  }

  let EconomyCycleClockPage = EconomyCycleClockPageModuleUnavailable;
  if (typeof economyCyclePageModule.createPage === "function") {
    try {
      EconomyCycleClockPage = economyCyclePageModule.createPage({
        React: React,
        DataTable: DataTable,
        economyCategoryClass: economyCategoryClass,
        EconomyCycleClock: EconomyCycleClock,
        EconomyCycleTrend: EconomyCycleTrend,
        economyPhaseClass: economyPhaseClass,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        h: h,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        pnlClass: pnlClass,
        SectionTitle: SectionTitle,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize economy-cycle page module.", error);
    }
  }
  function RealEstatePriceChart(props) {
    const region = props.region || {};
    const series = ensureArray(region.series);
    const labels = series.map(function (item) { return formatDateLabel(item.date); });
    const { canvasRef } = useChartLifecycle(function (canvas) {
      return new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: (region.name || "지역") + " 주택가격지수",
              data: series.map(function (item) { return Number(item.index); }),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.12)",
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.28,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#0f172a", boxWidth: 12, usePointStyle: true, font: { size: 12, weight: "700" } },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const item = series[context.dataIndex] || {};
                  return [
                    "지수 " + numberFormat(item.index, 2),
                    "WoW " + formatPercent(item.wow_pct, 2),
                    "YoY " + formatPercent(item.yoy_pct, 2),
                  ];
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: "#64748b", maxTicksLimit: 10 }, grid: { display: false } },
            y: {
              ticks: { color: "#64748b", callback: function (value) { return numberFormat(value, 1); } },
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
          },
        },
      });
    }, [region.key, series.length, series.length ? series[series.length - 1].index : null]);
    return h("div", { className: "chart-shell real-estate-price-chart-shell" }, h("canvas", { ref: canvasRef }));
  }

  const realEstatePricesPageModule = getStockAppModule("realEstatePricesPage");

  function RealEstatePricePageModuleUnavailable() {
    return h("div", { className: "page real-estate-price-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "부동산 가격"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
    ));
  }

  let RealEstatePricePage = RealEstatePricePageModuleUnavailable;
  if (typeof realEstatePricesPageModule.createPage === "function") {
    try {
      RealEstatePricePage = realEstatePricesPageModule.createPage({
        React: React,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        ErrorPanel: ErrorPanel,
        fetchJson: fetchJson,
        formatPercent: formatPercent,
        h: h,
        LoadingBlock: LoadingBlock,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        RealEstatePriceChart: RealEstatePriceChart,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize real-estate-prices page module.", error);
    }
  }
  const subscriptionListPageModule = getStockAppModule("subscriptionListPage");

  function SubscriptionListPageModuleUnavailable() {
    return h("div", { className: "page subscription-list-page" }, h("section", { className: "panel" },
      h(SectionTitle, null, "아파트 청약 리스트"),
      h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
    ));
  }

  let SubscriptionListPage = SubscriptionListPageModuleUnavailable;
  if (typeof subscriptionListPageModule.createPage === "function") {
    try {
      SubscriptionListPage = subscriptionListPageModule.createPage({
        React: React,
        DataTable: DataTable,
        diffDaysFromToday: diffDaysFromToday,
        EmptyState: EmptyState,
        ensureArray: ensureArray,
        fetchJson: fetchJson,
        h: h,
        LoadingBlock: LoadingBlock,
        loadSubscriptionRuntimeCache: loadSubscriptionRuntimeCache,
        normalizeLooseSearchText: normalizeLooseSearchText,
        normalizeSubscriptionItem: normalizeSubscriptionItem,
        numberFormat: numberFormat,
        persistSubscriptionRuntimeCache: persistSubscriptionRuntimeCache,
        SectionTitle: SectionTitle,
        SummaryCard: SummaryCard,
        todayIsoDate: todayIsoDate,
      });
    } catch (error) {
      console.error("Failed to initialize subscription-list page module.", error);
    }
  }
  const buildingManagementPageModule = getStockAppModule("buildingManagementPage");

  function BuildingManagementModuleUnavailable() {
    return h(
      "div",
      { className: "page building-management-page" },
      h(
        "section",
        { className: "panel" },
        h(SectionTitle, null, "건물 관리"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let BuildingManagementPage = BuildingManagementModuleUnavailable;
  if (typeof buildingManagementPageModule.createPage === "function") {
    try {
      BuildingManagementPage = buildingManagementPageModule.createPage({
        h: h,
        useEffect: useEffect,
        useMemo: useMemo,
        useState: useState,
        ensureArray: ensureArray,
        formatPercent: formatPercent,
        LoadingPanel: LoadingPanel,
        numberFormat: numberFormat,
        SectionTitle: SectionTitle,
        SummaryCard: SummaryCard,
        useFetchJson: useFetchJson,
      });
    } catch (error) {
      console.error("Failed to initialize building-management page module.", error);
    }
  }
  const naverBlogPageModule = getStockAppModule("naverBlogPage");

  function NaverBlogModuleUnavailable() {
    return h(
      "div",
      { className: "page naver-blog-page" },
      h(
        "section",
        { className: "panel" },
        h(SectionTitle, null, "네이버 블로그 브리핑"),
        h("div", { className: "notice-box error" }, "페이지 모듈을 불러오지 못했습니다. 앱을 새로고침해 주세요.")
      )
    );
  }

  let NaverBlogBriefPage = NaverBlogModuleUnavailable;
  if (typeof naverBlogPageModule.createPage === "function") {
    try {
      NaverBlogBriefPage = naverBlogPageModule.createPage({
        React: React,
        fetchJson: fetchJson,
        postJson: postJson,
        ensureArray: ensureArray,
        numberFormat: numberFormat,
        emitWindowTitleDetail: emitWindowTitleDetail,
        SectionTitle: SectionTitle,
        LoadingBlock: LoadingBlock,
        EmptyState: EmptyState,
      });
    } catch (error) {
      console.error("Failed to initialize naver-blog page module.", error);
    }
  }
  function App() {
    const defaultTabGroups = [
      {
        label: "\uc8fc\uc2dd",
        tabs: [
          { key: "sector-watch", label: "관심종목 보드" },
          { key: "themes", label: "오늘의 주도주" },
          { key: "chart-game", label: "차트 게임" },
          { key: "telegram", label: "종목 정보 검색기" },
          { key: "disclosure", label: "공시/실적" },
          { key: "stock-news", label: "뉴스 검색기" },
          { key: "global-company", label: "해외기업 검색기" },
          { key: "pair-correlation", label: "주가 상관관계" },
          { key: "etf-flow", label: "ETF 자금 추정" },
          { key: "global-indices", label: "지수/가격동향" },
          { key: "institutional-rebalance", label: "기관 리밸런싱 추정" },
          { key: "portfolio", label: "포트폴리오 수익" },
          { key: "sector-entry", label: "섹터 진입 신호" },
          { key: "breakout-stats", label: "돌파 통계" },
          { key: "sector-snapshot", label: "섹터 비교 테이블" },
          { key: "trade-data", label: "수출입" },
          { key: "economy-cycle", label: "경기순환" },
          { key: "strategy-backtest", label: "전략 백테스트" },
          { key: "market-calendar", label: "증시 일정" },
          { key: "naver-blog", label: "네이버 블로그 브리핑" },
          { key: "next", label: "추가 예정 페이지" }
        ]
      },
      {
        label: "\ubd80\ub3d9\uc0b0",
        tabs: [
          { key: "real-estate-prices", label: "부동산 가격" },
          { key: "subscription-list", label: "아파트 청약 리스트" },
          { key: "building-management", label: "건물 관리" }
        ]
      }
    ];
    const defaultTabs = defaultTabGroups.reduce(function (accumulator, group) {
      return accumulator.concat(group.tabs.map(function (tab) {
        return Object.assign({ groupLabel: group.label }, tab);
      }));
    }, []);
    const defaultTabKeys = defaultTabs.map(function (tab) { return tab.key; });
    const tabMap = defaultTabs.reduce(function (accumulator, tab) {
      accumulator[tab.key] = tab;
      return accumulator;
    }, {});
    const [page, setPage] = useState(function () {
      const savedPage = localStorage.getItem(LAST_PAGE_KEY) || "sector-watch";
      const migratedFirstPage = localStorage.getItem(FIRST_PAGE_MIGRATION_KEY) === "1";
      if (!migratedFirstPage) {
        localStorage.setItem(FIRST_PAGE_MIGRATION_KEY, "1");
        if (savedPage === "portfolio") {
          return "sector-watch";
        }
      }
      return ["sector-watch", "portfolio", "themes", "chart-game", "telegram", "disclosure", "stock-news", "global-company", "pair-correlation", "etf-flow", "global-indices", "institutional-rebalance", "sector-entry", "breakout-stats", "sector-snapshot", "trade-data", "economy-cycle", "strategy-backtest", "market-calendar", "naver-blog", "real-estate-prices", "subscription-list", "building-management", "next"].indexOf(savedPage) >= 0
        ? savedPage
        : "sector-watch";
    });
    const [visitedPages, setVisitedPages] = useState(function () {
      return [page];
    });
    const [tabOrder, setTabOrder] = useState(function () {
      try {
        const raw = localStorage.getItem(TAB_ORDER_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return normalizeTabOrder(parsed, defaultTabKeys);
      } catch (error) {
        return defaultTabKeys.slice();
      }
    });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(function () {
      if (window.innerWidth <= 1080) {
        return true;
      }
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    });
    const [colorTheme, setColorTheme] = useState(function () {
      return window.StockAppTheme ? window.StockAppTheme.getTheme() : "light";
    });
    const [draggingTabKey, setDraggingTabKey] = useState("");
    const appConfigRequest = useFetchJson("/api/app-config");
    const appConfig = appConfigRequest.data || {};
    const publicWeb = !!appConfig.public_web;
    const [titleDetails, setTitleDetails] = useState({});

    useEffect(function () {
      localStorage.setItem(LAST_PAGE_KEY, page);
      setVisitedPages(function (current) {
        return current.indexOf(page) >= 0 ? current : current.concat(page);
      });
    }, [page]);

    useEffect(function () {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    }, [sidebarCollapsed]);

    useEffect(function () {
      function handleThemeChange(event) {
        setColorTheme(event && event.detail && event.detail.theme === "dark" ? "dark" : "light");
      }
      window.addEventListener("stock-dashboard:theme-change", handleThemeChange);
      return function () {
        window.removeEventListener("stock-dashboard:theme-change", handleThemeChange);
      };
    }, []);

    useEffect(function () {
      localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(normalizeTabOrder(tabOrder, defaultTabKeys)));
    }, [tabOrder]);

    useEffect(function () {
      function handleTitleDetail(event) {
        const payload = (event && event.detail) || {};
        if (!payload.page) {
          return;
        }
        setTitleDetails(function (current) {
          const next = Object.assign({}, current);
          next[payload.page] = compactTitleText(payload.detail);
          return next;
        });
      }
      window.addEventListener(WINDOW_TITLE_DETAIL_EVENT, handleTitleDetail);
      return function () {
        window.removeEventListener(WINDOW_TITLE_DETAIL_EVENT, handleTitleDetail);
      };
    }, []);

    useEffect(function () {
      function handlePageNavigation(event) {
        const payload = (event && event.detail) || {};
        if (!payload.page) {
          return;
        }
        setPage(payload.page);
      }
      window.addEventListener(PAGE_NAV_EVENT, handlePageNavigation);
      return function () {
        window.removeEventListener(PAGE_NAV_EVENT, handlePageNavigation);
      };
    }, []);

    useEffect(function () {
      function handleSidebarHotkey(event) {
        if (!event || event.defaultPrevented || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
          return;
        }
        if (isEditableHotkeyTarget(event.target)) {
          return;
        }
        const keyText = String(event.key || "");
        if (!/^[1-9]$/.test(keyText)) {
          return;
        }
        const targetIndex = Number(keyText) - 1;
        const orderedKeys = normalizeTabOrder(tabOrder, defaultTabKeys);
        if (targetIndex < 0 || targetIndex >= orderedKeys.length) {
          return;
        }
        event.preventDefault();
        setPage(orderedKeys[targetIndex]);
      }
      window.addEventListener("keydown", handleSidebarHotkey);
      return function () {
        window.removeEventListener("keydown", handleSidebarHotkey);
      };
    }, [tabOrder]);

    useEffect(function () {
      document.title = buildWindowTitle(page, titleDetails[page]);
    }, [page, titleDetails]);

    useEffect(function () {
      const timers = [];
      const running = { kr: false, us: false, asia: false };

      function getStateForToday() {
        const today = todayIsoDate();
        const currentState = readAutoDailyThemeBuildState();
        if (currentState.date === today) {
          return currentState;
        }
        const nextState = { date: today, kr: false, us: false, asia: false };
        writeAutoDailyThemeBuildState(nextState);
        return nextState;
      }

      function runAutoBuild(market) {
        const todayState = getStateForToday();
        if (running[market] || todayState[market]) {
          return Promise.resolve({ skipped: true });
        }
        const delayMs = getAutoBuildDelayMs(market);
        if (delayMs == null) {
          return Promise.resolve({ skipped: true });
        }
        running[market] = true;
        const url = market === "us"
          ? "/api/us-themes/build-today-data"
          : market === "asia"
            ? "/api/asia-themes/build-today-data"
            : "/api/themes/build-today-data";
        return postJson(url, {
          min_score: 0,
          recent_limit: 20,
        }).then(function (payload) {
          const nextState = getStateForToday();
          nextState[market] = true;
          writeAutoDailyThemeBuildState(nextState);
          emitAutoDailyThemeBuildEvent(market, payload || {});
        }).catch(function () {
          const nextState = getStateForToday();
          nextState[market] = false;
          writeAutoDailyThemeBuildState(nextState);
        }).finally(function () {
          running[market] = false;
        });
      }

      function runAutoBuildSequence(markets, index) {
        if (index >= markets.length) {
          return;
        }
        const market = markets[index];
        const delayMs = getAutoBuildDelayMs(market);
        if (delayMs == null) {
          runAutoBuildSequence(markets, index + 1);
          return;
        }
        if (delayMs > 0) {
          timers.push(window.setTimeout(function () {
            runAutoBuildSequence(markets, index);
          }, delayMs));
          return;
        }
        runAutoBuild(market).finally(function () {
          runAutoBuildSequence(markets, index + 1);
        });
      }

      getStateForToday();
      runAutoBuildSequence(["kr", "us", "asia"], 0);
      return function () {
        timers.forEach(function (timerId) {
          window.clearTimeout(timerId);
        });
      };
    }, []);

    const orderedTabs = normalizeTabOrder(tabOrder, defaultTabKeys).map(function (key) {
      return tabMap[key];
    }).filter(Boolean);
    const orderedGroups = [];
    orderedTabs.forEach(function (tab) {
      const groupLabel = tab.groupLabel || "";
      const lastGroup = orderedGroups.length ? orderedGroups[orderedGroups.length - 1] : null;
      if (!lastGroup || lastGroup.label !== groupLabel) {
        orderedGroups.push({ label: groupLabel, tabs: [tab] });
      } else {
        lastGroup.tabs.push(tab);
      }
    });

    function moveTabToPosition(sourceKey, targetKey) {
      if (!sourceKey || !targetKey || sourceKey === targetKey) {
        return;
      }
      setTabOrder(function (current) {
        const normalized = normalizeTabOrder(current, defaultTabKeys);
        const fromIndex = normalized.indexOf(sourceKey);
        const toIndex = normalized.indexOf(targetKey);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return normalized;
        }
        return moveArrayItem(normalized, fromIndex, toIndex);
      });
    }

    function handleTabDragStart(tabKey, event) {
      setDraggingTabKey(tabKey);
      try {
        if (event && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", tabKey);
        }
      } catch (error) {
      }
    }

    function handleTabDrop(targetKey, event) {
      if (event) {
        event.preventDefault();
      }
      var sourceKey = draggingTabKey;
      try {
        if (event && event.dataTransfer) {
          sourceKey = event.dataTransfer.getData("text/plain") || sourceKey;
        }
      } catch (error) {
      }
      setDraggingTabKey("");
      moveTabToPosition(sourceKey, targetKey);
    }

    function renderPageContent(pageKey) {
      if (pageKey === "sector-watch") {
        return h(SectorWatchBoardPage);
      }
      if (pageKey === "portfolio") {
        return h(PortfolioPageModern);
      }
      if (pageKey === "themes") {
        return h(MemoUnifiedThemesPage);
      }
      if (pageKey === "chart-game") {
        return h(ChartGamePage);
      }
      if (pageKey === "global-themes") {
        return h(GlobalThemesPage);
      }
      if (pageKey === "asia-themes") {
        return h(AsiaThemesPage);
      }
      if (pageKey === "telegram") {
        return appConfigRequest.loading
          ? h(LoadingPanel, { label: appConfigRequest.label })
          : publicWeb
            ? h(SecurityLockedPanel, {
                title: "종목 정보 검색기",
                message: "종목 정보 검색기는 개인 계정 세션과 대화 내용에 접근하므로 공개 웹 배포 모드에서는 잠겨 있습니다.",
              })
            : h(TelegramPage);
      }
      if (pageKey === "disclosure") {
        return appConfigRequest.loading
          ? h(LoadingPanel, { label: appConfigRequest.label })
          : publicWeb
            ? h(SecurityLockedPanel, {
                title: "공시/실적",
                message: "공시/실적 페이지는 개인 텔레그램 채널 검색을 사용하므로 공개 웹 배포 모드에서는 잠겨 있습니다.",
              })
            : h(DisclosurePage);
      }
      if (pageKey === "stock-news") {
        return h(StockNewsPage);
      }
      if (pageKey === "global-company") {
        return h(GlobalCompanyPage);
      }
      if (pageKey === "pair-correlation") {
        return h(PairCorrelationPage);
      }
      if (pageKey === "etf-flow") {
        return h(EtfFlowPage);
      }
      if (pageKey === "global-indices") {
        return h(GlobalIndicesPage);
      }
      if (pageKey === "institutional-rebalance") {
        return h(InstitutionalRebalancePage);
      }
      if (pageKey === "sector-entry") {
        return h(SectorEntrySignalPage);
      }
      if (pageKey === "breakout-stats") {
        return h(BreakoutStatsPage);
      }
      if (pageKey === "sector-snapshot") {
        return h(SectorSnapshotPageV2);
      }
      if (pageKey === "trade-data") {
        return h(TradeImportExportPage);
      }
      if (pageKey === "economy-cycle") {
        return h(EconomyCycleClockPage);
      }
      if (pageKey === "strategy-backtest") {
        return h(StrategyBacktestPage);
      }
      if (pageKey === "market-calendar") {
        return h(MarketCalendarPage);
      }
      if (pageKey === "naver-blog") {
        return appConfigRequest.loading
          ? h(LoadingPanel, { label: appConfigRequest.label })
          : publicWeb
            ? h(SecurityLockedPanel, {
                title: "네이버 블로그 브리핑",
                message: "네이버 블로그 브리핑은 개인 로그인 세션을 사용하므로 공개 웹 배포 모드에서는 잠겨 있습니다.",
              })
            : h(NaverBlogBriefPage);
      }
      if (pageKey === "real-estate-prices") {
        return h(RealEstatePricePage);
      }
      if (pageKey === "subscription-list") {
        return h(SubscriptionListPage);
      }
      if (pageKey === "building-management") {
        return h(BuildingManagementPage);
      }
      return h(NextPage);
    }

    return h(
      "div",
      { className: "app-shell" + (sidebarCollapsed ? " sidebar-collapsed" : "") },
      appConfigRequest.data ? h(BackgroundPreloader, { publicWeb: publicWeb }) : null,
      h(GlobalLoadingDock),
      h(
        "aside",
        { className: "sidebar" },
        h(
          "div",
          { className: "sidebar-head" },
          h(
            "div",
            { className: "brand" },
            h("span", { className: "brand-mark", "aria-hidden": "true" }),
            h(
              "span",
              { className: "brand-copy" },
              h("span", { className: "brand-title" }, "Stock Dashboard"),
              h("span", { className: "brand-caption" }, "Market intelligence")
            )
          ),
          h(
            "div",
            { className: "sidebar-actions" },
            h(
              "button",
              {
                type: "button",
                className: "sidebar-icon-button",
                title: sidebarCollapsed ? "탭 열기" : "탭 닫기",
                onClick: function () { setSidebarCollapsed(function (value) { return !value; }); },
              },
              h("span", { className: "hamburger-lines", "aria-hidden": "true" }, h("i"), h("i"), h("i"))
            ),
            h(
              "button",
              {
                type: "button",
                className: "sidebar-icon-button",
                title: "페이지 새로고침",
                "aria-label": "페이지 새로고침",
                onClick: function () { window.location.reload(); },
              },
              h("span", { className: "refresh-icon", "aria-hidden": "true" })
            ),
            h(
              "button",
              {
                type: "button",
                className: "sidebar-icon-button theme-toggle-button",
                title: colorTheme === "dark" ? "라이트 모드" : "다크 모드",
                "aria-label": colorTheme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
                onClick: function () { if (window.StockAppTheme) { window.StockAppTheme.toggleTheme(); } },
              },
              h("span", { className: "theme-icon", "aria-hidden": "true" })
            )
          )
        ),
        h(
          "div",
          { className: "nav-list" },
          orderedGroups.map(function (group, groupIndex) {
            return h(
              "div",
              { key: group.label + ":" + groupIndex, className: "nav-group" },
              h("div", { className: "nav-group-title" }, group.label),
              group.tabs.map(function (tab) {
                const shortcutIndex = orderedTabs.findIndex(function (item) { return item.key === tab.key; });
                const shortcutLabel = shortcutIndex >= 0 && shortcutIndex < 9 ? "Ctrl+" + String(shortcutIndex + 1) : "";
                return h(
                  "button",
                  {
                    key: tab.key,
                    className: "nav-item" + (page === tab.key ? " active" : "") + (draggingTabKey === tab.key ? " dragging" : ""),
                    onClick: function () { setPage(tab.key); },
                    draggable: true,
                    onDragStart: function (event) { handleTabDragStart(tab.key, event); },
                    onDragEnd: function () { setDraggingTabKey(""); },
                    onDragOver: function (event) { event.preventDefault(); },
                    onDrop: function (event) { handleTabDrop(tab.key, event); },
                    title: shortcutLabel ? tab.label + " (" + shortcutLabel + ")" : tab.label,
                  },
                  h("span", { className: "nav-item-label" }, tab.label),
                  shortcutLabel ? h("span", { className: "nav-item-shortcut" }, shortcutLabel) : null
                );
              })
            );
          })
        )
      ),
      h(
        "main",
        { className: "main-content", onWheel: handleMainContentWheel },
        sidebarCollapsed
          ? h(
              "div",
              { className: "content-menu-bar" },
              h(
                "button",
                {
                  type: "button",
                  className: "content-menu-button",
                  title: "\ud0ed \uc5f4\uae30",
                  onClick: function () { setSidebarCollapsed(false); },
                },
                h("span", { className: "hamburger-lines", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
                h("span", null, "탭 열기")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "content-menu-button",
                  title: "\ud398\uc774\uc9c0 \uc0c8\ub85c\uace0\uce68",
                  onClick: function () { window.location.reload(); },
                },
                h("span", { className: "refresh-icon", "aria-hidden": "true" }),
                h("span", null, "새로고침")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "content-menu-button theme-toggle-button",
                  title: colorTheme === "dark" ? "라이트 모드" : "다크 모드",
                  onClick: function () { if (window.StockAppTheme) { window.StockAppTheme.toggleTheme(); } },
                },
                h("span", { className: "theme-icon", "aria-hidden": "true" }),
                h("span", null, colorTheme === "dark" ? "라이트" : "다크")
              )
            )
          : null,
        h(
          "div",
          { className: "page-stack" },
          visitedPages.map(function (pageKey) {
            return h(
              "section",
              {
                key: pageKey,
                className: "page-keepalive" + (page === pageKey ? " active" : ""),
                "aria-hidden": page === pageKey ? "false" : "true",
              },
              renderPageContent(pageKey)
            );
          })
        )
      )
    );
  }

  const rootElement = document.getElementById("root");
  ReactDOM.createRoot(rootElement).render(h(App));
})();
