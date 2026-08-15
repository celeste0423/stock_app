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
  const DISCLOSURE_PAGE_STATE_VERSION = 5;
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
        return { date: "", kr: false, us: false };
      }
      return {
        date: String(parsed.date || ""),
        kr: !!parsed.kr,
        us: !!parsed.us,
      };
    } catch (error) {
      return { date: "", kr: false, us: false };
    }
  }

  function writeAutoDailyThemeBuildState(nextState) {
    try {
      localStorage.setItem(AUTO_DAILY_THEME_BUILD_KEY, JSON.stringify({
        date: String((nextState && nextState.date) || ""),
        kr: !!(nextState && nextState.kr),
        us: !!(nextState && nextState.us),
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
        chartRef.current.applyOptions({ width: width, height: height });
      });
      resizeObserver.observe(container);

      chartRef.current = chart;
      portfolioSeriesRef.current = portfolioSeries;
      benchmarkSeriesRefs.current = {};

      return function () {
        resizeObserver.disconnect();
        chart.remove();
        chartRef.current = null;
        portfolioSeriesRef.current = null;
        benchmarkSeriesRefs.current = {};
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
  function ThemesPage() {
    const themesRequest = useFetchJson("/api/themes/today?min_score=50&recent_limit=20");
    const dartRequest = useFetchJson("/api/dart/today");

    if (themesRequest.loading || dartRequest.loading) {
      return LoadingPanel({ label: [themesRequest.loading ? themesRequest.label : "", dartRequest.loading ? dartRequest.label : ""].filter(Boolean).join(" · ") });
    }
    if (themesRequest.error) {
      return ErrorPanel({ message: themesRequest.error });
    }
    if (dartRequest.error) {
      return ErrorPanel({ message: dartRequest.error });
    }

    const themes = themesRequest.data || {};
    const dart = dartRequest.data || {};

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "Daily Theme Radar"),
        h("h1", { className: "page-title" }, "포트폴리오 수익"),
        h(
          "p",
          { className: "page-copy" },
          "엑셀 목표 비중을 기준으로 시초가 매수·매도와 보유 수량 유지 규칙을 적용한 수익률입니다. 기본 차트는 월초 기준 0%에서 시작하며, 전체 기간도 선택할 수 있습니다."
        ),
        h(
          "div",
          { className: "summary-grid" },
          h(SummaryCard, { label: "湲곗? ?뚯씪", value: themes.file_name || "-", help: themes.file_date || "" }),
          h(SummaryCard, { label: "50점 이상 종목", value: numberFormat(themes.qualified_count, 0) + "개", help: "종합 50 이상 · 시총 2000억 이상" }),
          h(SummaryCard, { label: "\ud14c\ub9c8 \uc218", value: numberFormat(ensureArray(themes.theme_summary).length, 0) + "\uac1c", help: "\ub2f9\uc77c \uc9d1\uacc4\ub41c \ud14c\ub9c8 \uac1c\uc218" }),
          h(SummaryCard, { label: "DART \uc0c1\ud0dc", value: dart.enabled ? "\ud65c\uc131" : "\ube44\ud65c\uc131", help: dart.message || "" })
        )
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 怨듭떆"),
        h(DataTable, {
          rows: ensureArray(themes.recent_leaders),
          columns: [
            { key: "stock_name", label: "종목" },
            { key: "appearances", label: "\ub4f1\uc7a5 \ud69f\uc218", render: function (row) { return numberFormat(row.appearances, 0); } },
            { key: "strong_days", label: "\uac15\ud55c \ub0a0 \uc218", render: function (row) { return numberFormat(row.strong_days, 0); } },
            { key: "avg_score", label: "평균 점수", render: function (row) { return numberFormat(row.avg_score, 2); } },
            { key: "max_score", label: "최고 점수", render: function (row) { return numberFormat(row.max_score, 2); } },
            { key: "avg_change_pct", label: "\ud3c9\uade0 \ub4f1\ub77d\ub960", render: function (row) { return formatPercent(row.avg_change_pct, 2); } },
            { key: "themes", label: "반복 테마", render: function (row) { return ensureArray(row.themes).join(", "); } },
            { key: "notes", label: "핵심 메모", render: function (row) { return row.notes || "-"; } },
          ],
          emptyMessage: "최근 반복 등장 종목 데이터가 없습니다.",
          compact: true,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 怨듭떆"),
        ensureArray(themes.theme_summary).length
          ? h(
              "div",
              { className: "theme-grid" },
              ensureArray(themes.theme_summary).map(function (item) {
                return h(
                  "div",
                  { key: item.theme, className: "theme-card" },
                  h("div", { className: "theme-name" }, item.theme),
                  h("div", { className: "theme-metrics" }, "\uc885\ubaa9 \uc218 " + numberFormat(item.count, 0) + "\uac1c / \ud3c9\uade0 \uc810\uc218 " + numberFormat(item.avg_score, 2)),
                  h("div", { className: "theme-leaders" }, "\ub300\ud45c \uc885\ubaa9: " + (item.leaders || "-")),
                  h("div", { className: "summary-help" }, "\ud575\uc2ec \ud0a4\uc6cc\ub4dc: " + (item.keywords || "-"))
                );
              })
            )
          : EmptyState({ message: "오늘 테마 데이터가 없습니다." })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "오늘 조건 충족 종목"),
        h(DataTable, {
          rows: ensureArray(themes.qualified_stocks),
          columns: [
            { key: "stock_name", label: "종목" },
            { key: "theme", label: "테마" },
            { key: "score", label: "점수", render: function (row) { return numberFormat(row.score, 2); } },
            { key: "change_pct", label: "\ub4f1\ub77d\ub960", render: function (row) { return formatPercent(row.change_pct, 2); } },
            { key: "lead_count", label: "주도 횟수", render: function (row) { return numberFormat(row.lead_count, 0); } },
            { key: "avg_lead_score", label: "평균 점수", render: function (row) { return numberFormat(row.avg_lead_score, 2); } },
            { key: "note", label: "비고" },
          ],
          emptyMessage: "점수 50 이상 종목이 없습니다.",
          compact: true,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 怨듭떆"),
        dart.message ? h("div", { className: "summary-help" }, dart.message) : null,
        dart.items && dart.items.length
          ? h(DataTable, {
              rows: dart.items,
              columns: [
                { key: "corp_name", label: "?뚯궗" },
                { key: "report_name", label: "\uacf5\uc2dc\uba85" },
                { key: "date", label: "날짜" },
              ],
            })
          : EmptyState({ message: dart.message || "?ㅻ뒛 怨듭떆媛 ?놁뒿?덈떎." })
      )
    );
  }

  function StrategyBacktestPage() {
    const STRATEGY_BACKTEST_PREFS_LEGACY_KEY = "stock-dashboard-strategy-backtest-leader";
    const STRATEGY_BACKTEST_PREFS_KEYS = {
      kr: "stock-dashboard-strategy-backtest-leader-kr",
      us: "stock-dashboard-strategy-backtest-leader-us",
    };
    function loadSavedLeaderBacktestPrefs(marketMode) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      try {
        let raw = localStorage.getItem(STRATEGY_BACKTEST_PREFS_KEYS[normalizedMarket]);
        if (!raw) {
          const legacyRaw = localStorage.getItem(STRATEGY_BACKTEST_PREFS_LEGACY_KEY);
          if (legacyRaw) {
            const legacyParsed = JSON.parse(legacyRaw);
            const legacyMarket = legacyParsed && legacyParsed.market === "us" ? "us" : "kr";
            if (legacyMarket === normalizedMarket) {
              raw = legacyRaw;
              localStorage.setItem(STRATEGY_BACKTEST_PREFS_KEYS[normalizedMarket], legacyRaw);
            }
          }
        }
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (parsed && parsed.stop_loss_mode === "atr2") {
          parsed.stop_loss_mode = "atr";
          if (!(Number(parsed.stop_loss_pct || 0) > 0)) {
            parsed.stop_loss_pct = 2;
          }
        }
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (error) {
        return null;
      }
    }
    const savedKrLeaderBacktestPrefs = loadSavedLeaderBacktestPrefs("kr");
    const savedUsLeaderBacktestPrefs = loadSavedLeaderBacktestPrefs("us");
    const savedLeaderBacktestPrefs = savedKrLeaderBacktestPrefs;
    const [strategyMode, setStrategyMode] = useState("leader_top10");
    const [leaderUsBenchmark, setLeaderUsBenchmark] = useState(
      savedUsLeaderBacktestPrefs && (savedUsLeaderBacktestPrefs.index === "US500" || savedUsLeaderBacktestPrefs.index === "NDX100")
        ? savedUsLeaderBacktestPrefs.index
        : "US500"
    );
    const [indexKey, setIndexKey] = useState("KS11");
    const [leaderTopN, setLeaderTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100);
    const [leaderExitTopN, setLeaderExitTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_top_n != null ? savedLeaderBacktestPrefs.exit_top_n : (savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100));
    const [leaderUseEntryTopN, setLeaderUseEntryTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_top_n != null ? !!savedLeaderBacktestPrefs.use_entry_top_n : true);
    const [leaderUseExitTopN, setLeaderUseExitTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_exit_top_n != null ? !!savedLeaderBacktestPrefs.use_exit_top_n : true);
    const [leaderEntryThreshold, setLeaderEntryThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.entry_threshold != null ? savedLeaderBacktestPrefs.entry_threshold : 65);
    const [leaderExitThreshold, setLeaderExitThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_threshold != null ? savedLeaderBacktestPrefs.exit_threshold : 50);
    const [leaderUseEntryThreshold, setLeaderUseEntryThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_threshold != null ? !!savedLeaderBacktestPrefs.use_entry_threshold : true);
    const [leaderUseExitThreshold, setLeaderUseExitThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_exit_threshold != null ? !!savedLeaderBacktestPrefs.use_exit_threshold : true);
    const [leaderStopLossPct, setLeaderStopLossPct] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.stop_loss_pct != null ? savedLeaderBacktestPrefs.stop_loss_pct : 0);
    const [leaderUseStopLoss, setLeaderUseStopLoss] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_stop_loss != null ? !!savedLeaderBacktestPrefs.use_stop_loss : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.stop_loss_pct || 0) > 0));
    const [leaderStopLossMode, setLeaderStopLossMode] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.stop_loss_mode ? savedLeaderBacktestPrefs.stop_loss_mode : "pct");
    const [leaderExitMa20Break, setLeaderExitMa20Break] = useState(!!(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_ma20_break));
    const [leaderExitMa60Break, setLeaderExitMa60Break] = useState(!!(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_ma60_break));
    const [leaderEntryStreakDays, setLeaderEntryStreakDays] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.entry_streak_days != null ? savedLeaderBacktestPrefs.entry_streak_days : 1);
    const [leaderUseEntryStreak, setLeaderUseEntryStreak] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_streak != null ? !!savedLeaderBacktestPrefs.use_entry_streak : true);
    const [leaderRunupLookbackDays, setLeaderRunupLookbackDays] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.runup_lookback_days != null ? savedLeaderBacktestPrefs.runup_lookback_days : 0);
    const [leaderRunupExcludePct, setLeaderRunupExcludePct] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.runup_exclude_pct != null ? savedLeaderBacktestPrefs.runup_exclude_pct : 0);
    const [leaderUseRunupFilter, setLeaderUseRunupFilter] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_runup_filter != null ? !!savedLeaderBacktestPrefs.use_runup_filter : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.runup_lookback_days || 0) > 0));
    const [leaderMinMarketCap100m, setLeaderMinMarketCap100m] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.min_market_cap_100m != null ? savedLeaderBacktestPrefs.min_market_cap_100m : 0);
    const [leaderUseMinMarketCapFilter, setLeaderUseMinMarketCapFilter] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_min_market_cap_filter != null ? !!savedLeaderBacktestPrefs.use_min_market_cap_filter : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.min_market_cap_100m || 0) > 0));
    const [leaderMaxAtr20, setLeaderMaxAtr20] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.max_atr_20 != null ? savedLeaderBacktestPrefs.max_atr_20 : 0);
    const [leaderUseAtrFilter, setLeaderUseAtrFilter] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_atr_filter != null ? !!savedLeaderBacktestPrefs.use_atr_filter : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.max_atr_20 || 0) > 0));
    const [leaderEntryHighFilter, setLeaderEntryHighFilter] = useState(
      savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.entry_high_filter
        ? String(savedLeaderBacktestPrefs.entry_high_filter)
        : (!!(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_52w_high) ? "52w" : "none")
    );
    const [leaderAllocationMode, setLeaderAllocationMode] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.allocation_mode ? savedLeaderBacktestPrefs.allocation_mode : "score_weight");
    const [strategyKey, setStrategyKey] = useState("ma20_cross");
    const [startDate, setStartDate] = useState(function () { return savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.start ? savedLeaderBacktestPrefs.start : isoDateOffset(-365); });
    const [endDate, setEndDate] = useState(function () { return savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.end ? savedLeaderBacktestPrefs.end : isoDateOffset(0); });
    const [advancedStartDate, setAdvancedStartDate] = useState(function () { return isoDateOffset(-180); });
    const [advancedEndDate, setAdvancedEndDate] = useState(function () { return isoDateOffset(0); });
    const [advancedMinScore, setAdvancedMinScore] = useState(50);
    const [advancedTopSectors, setAdvancedTopSectors] = useState(4);
    const [advancedStocksCount, setAdvancedStocksCount] = useState(4);
    const [advancedMaxLeverage, setAdvancedMaxLeverage] = useState(1.5);
    const [advancedBenchmark, setAdvancedBenchmark] = useState("KS11");
    const [advancedWeightMethod, setAdvancedWeightMethod] = useState("entry_beta");
    const [advancedBetaWindow, setAdvancedBetaWindow] = useState(63);
    const [advancedMinBreadth, setAdvancedMinBreadth] = useState(60);
    const [advancedMaxDisparity, setAdvancedMaxDisparity] = useState(110);
    const [advancedTradingRankLimit, setAdvancedTradingRankLimit] = useState(20);
    const [advancedStockSelection, setAdvancedStockSelection] = useState("trend_strength");
    const [selectedAdvancedDate, setSelectedAdvancedDate] = useState("");
    const [selectedSectorDate, setSelectedSectorDate] = useState("");
    const [strategyTradeChartPopup, setStrategyTradeChartPopup] = useState({
      open: false,
      trade: null,
      loading: false,
      error: "",
      data: null,
      scoreLoading: false,
      scoreError: "",
      scoreData: null,
    });
    const leaderSnapshotRequest = useFetchJson("/api/strategy/snapshots?strategy_group=leader_kr&limit=60", { refreshOnMount: true });
    const [activeLeaderSnapshot, setActiveLeaderSnapshot] = useState(null);
    const [activeLeaderSnapshotId, setActiveLeaderSnapshotId] = useState(0);
    const [leaderSnapshotSaving, setLeaderSnapshotSaving] = useState(false);
    const [leaderSnapshotMessage, setLeaderSnapshotMessage] = useState("");
    const [compareLeftSnapshotId, setCompareLeftSnapshotId] = useState("");
    const [compareRightSnapshotId, setCompareRightSnapshotId] = useState("");
    const [compareLeftSnapshot, setCompareLeftSnapshot] = useState(null);
    const [compareRightSnapshot, setCompareRightSnapshot] = useState(null);
    const [compareStockKey, setCompareStockKey] = useState("");
    const [sectorStartDate, setSectorStartDate] = useState(function () { return isoDateOffset(-120); });
    const [sectorEndDate, setSectorEndDate] = useState(function () { return isoDateOffset(0); });
    const [sectorMinScore, setSectorMinScore] = useState(50);
    const [sectorTopCount, setSectorTopCount] = useState(4);
    const [sectorStocksCount, setSectorStocksCount] = useState(4);
    const [sectorLeverage, setSectorLeverage] = useState(1);
    const [sectorWeightMethod, setSectorWeightMethod] = useState("strength");
    const [indexBacktestStarted, setIndexBacktestStarted] = useState(false);
    const [leaderBacktestStarted, setLeaderBacktestStarted] = useState(false);
    const [leaderPeriodSummaryMode, setLeaderPeriodSummaryMode] = useState("year");
    const [leaderAiMessagesByMarket, setLeaderAiMessagesByMarket] = useState({ kr: [], us: [] });
    const [leaderAiInputByMarket, setLeaderAiInputByMarket] = useState({ kr: "", us: "" });
    const [leaderAiLoadingByMarket, setLeaderAiLoadingByMarket] = useState({ kr: false, us: false });
    const [leaderAiErrorByMarket, setLeaderAiErrorByMarket] = useState({ kr: "", us: "" });
    const leaderLastQueryByMarketRef = useRef({ kr: null, us: null });
    const [sectorBacktestStarted, setSectorBacktestStarted] = useState(false);
    const [advancedBacktestStarted, setAdvancedBacktestStarted] = useState(false);
    const [queryState, setQueryState] = useState(function () {
      if (savedLeaderBacktestPrefs) {
        return {
          index: savedLeaderBacktestPrefs.index || "KS11",
          market: savedLeaderBacktestPrefs.market || "kr",
          strategy: "leader_custom",
          start: savedLeaderBacktestPrefs.start || isoDateOffset(-365),
          end: savedLeaderBacktestPrefs.end || isoDateOffset(0),
          top_n: savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100,
          exit_top_n: savedLeaderBacktestPrefs.exit_top_n != null ? savedLeaderBacktestPrefs.exit_top_n : (savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100),
          use_entry_top_n: savedLeaderBacktestPrefs.use_entry_top_n != null ? !!savedLeaderBacktestPrefs.use_entry_top_n : true,
          use_exit_top_n: savedLeaderBacktestPrefs.use_exit_top_n != null ? !!savedLeaderBacktestPrefs.use_exit_top_n : true,
          entry_threshold: savedLeaderBacktestPrefs.entry_threshold != null ? savedLeaderBacktestPrefs.entry_threshold : 65,
          exit_threshold: savedLeaderBacktestPrefs.exit_threshold != null ? savedLeaderBacktestPrefs.exit_threshold : 50,
          use_entry_threshold: savedLeaderBacktestPrefs.use_entry_threshold != null ? !!savedLeaderBacktestPrefs.use_entry_threshold : true,
          use_exit_threshold: savedLeaderBacktestPrefs.use_exit_threshold != null ? !!savedLeaderBacktestPrefs.use_exit_threshold : true,
          stop_loss_pct: savedLeaderBacktestPrefs.stop_loss_pct != null ? savedLeaderBacktestPrefs.stop_loss_pct : 0,
          use_stop_loss: savedLeaderBacktestPrefs.use_stop_loss != null ? !!savedLeaderBacktestPrefs.use_stop_loss : !!Number(savedLeaderBacktestPrefs.stop_loss_pct || 0),
          stop_loss_mode: savedLeaderBacktestPrefs.stop_loss_mode || "pct",
          exit_ma20_break: !!savedLeaderBacktestPrefs.exit_ma20_break,
          exit_ma60_break: !!savedLeaderBacktestPrefs.exit_ma60_break,
          entry_streak_days: savedLeaderBacktestPrefs.entry_streak_days != null ? savedLeaderBacktestPrefs.entry_streak_days : 1,
          use_entry_streak: savedLeaderBacktestPrefs.use_entry_streak != null ? !!savedLeaderBacktestPrefs.use_entry_streak : true,
          runup_lookback_days: savedLeaderBacktestPrefs.runup_lookback_days != null ? savedLeaderBacktestPrefs.runup_lookback_days : 0,
          runup_exclude_pct: savedLeaderBacktestPrefs.runup_exclude_pct != null ? savedLeaderBacktestPrefs.runup_exclude_pct : 0,
          use_runup_filter: savedLeaderBacktestPrefs.use_runup_filter != null ? !!savedLeaderBacktestPrefs.use_runup_filter : !!Number(savedLeaderBacktestPrefs.runup_lookback_days || 0),
          min_market_cap_100m: savedLeaderBacktestPrefs.min_market_cap_100m != null ? savedLeaderBacktestPrefs.min_market_cap_100m : 0,
          use_min_market_cap_filter: savedLeaderBacktestPrefs.use_min_market_cap_filter != null ? !!savedLeaderBacktestPrefs.use_min_market_cap_filter : !!Number(savedLeaderBacktestPrefs.min_market_cap_100m || 0),
          max_atr_20: savedLeaderBacktestPrefs.max_atr_20 != null ? savedLeaderBacktestPrefs.max_atr_20 : 0,
          use_atr_filter: savedLeaderBacktestPrefs.use_atr_filter != null ? !!savedLeaderBacktestPrefs.use_atr_filter : !!Number(savedLeaderBacktestPrefs.max_atr_20 || 0),
          entry_high_filter: savedLeaderBacktestPrefs.entry_high_filter
            ? String(savedLeaderBacktestPrefs.entry_high_filter)
            : (!!savedLeaderBacktestPrefs.use_entry_52w_high ? "52w" : "none"),
          use_entry_52w_high: !!savedLeaderBacktestPrefs.use_entry_52w_high,
          allocation_mode: savedLeaderBacktestPrefs.allocation_mode || "score_weight",
          refresh: String(savedLeaderBacktestPrefs.refresh || Date.now()),
        };
      }
      return {
        index: "KS11",
        market: "kr",
        strategy: "leader_custom",
        start: isoDateOffset(-365),
        end: isoDateOffset(0),
        top_n: 100,
        exit_top_n: 100,
        use_entry_top_n: true,
        use_exit_top_n: true,
        entry_threshold: 65,
        exit_threshold: 50,
        use_entry_threshold: true,
        use_exit_threshold: true,
        stop_loss_pct: 0,
        use_stop_loss: false,
        stop_loss_mode: "pct",
        exit_ma20_break: false,
        exit_ma60_break: false,
        entry_streak_days: 1,
        use_entry_streak: true,
        runup_lookback_days: 0,
        runup_exclude_pct: 0,
        use_runup_filter: false,
        min_market_cap_100m: 0,
        use_min_market_cap_filter: false,
        max_atr_20: 0,
        use_atr_filter: false,
        entry_high_filter: "none",
        use_entry_52w_high: false,
        allocation_mode: "score_weight",
        refresh: String(Date.now()),
      };
    });
    const [sectorQueryState, setSectorQueryState] = useState(function () {
      return {
        start: isoDateOffset(-120),
        end: isoDateOffset(0),
        min_score: 50,
        top_sectors: 4,
        stocks_per_sector: 4,
        leverage: 1,
        weight_method: "strength",
      };
    });
    const [advancedQueryState, setAdvancedQueryState] = useState(function () {
      return {
        start: isoDateOffset(-180),
        end: isoDateOffset(0),
        min_score: 50,
        top_sectors: 4,
        stocks_per_sector: 4,
        max_leverage: 1.5,
        benchmark: "KS11",
        weight_method: "entry_beta",
        beta_window: 63,
        min_breadth: 60,
        max_disparity: 110,
        trading_rank_limit: 20,
        stock_selection: "trend_strength",
      };
    });
    const params = new URLSearchParams({
      index: (strategyMode === "leader_top10" || strategyMode === "us_leader")
        ? String(queryState.index || (strategyMode === "us_leader" ? leaderUsBenchmark : "KS11"))
        : queryState.index,
      market: (strategyMode === "leader_top10" || strategyMode === "us_leader")
        ? String(queryState.market || (strategyMode === "us_leader" ? "us" : "kr"))
        : "kr",
      strategy: (strategyMode === "leader_top10" || strategyMode === "us_leader") ? "leader_custom" : queryState.strategy,
      start: queryState.start,
      end: queryState.end,
    });
    if (strategyMode === "leader_top10" || strategyMode === "us_leader") {
      params.set("strategy", "leader_custom");
      params.set("top_n", String(queryState.top_n || leaderTopN || 100));
      params.set("exit_top_n", String(queryState.exit_top_n || leaderExitTopN || queryState.top_n || leaderTopN || 100));
      params.set("use_entry_top_n", String(!!(queryState.use_entry_top_n != null ? queryState.use_entry_top_n : leaderUseEntryTopN)));
      params.set("use_exit_top_n", String(!!(queryState.use_exit_top_n != null ? queryState.use_exit_top_n : leaderUseExitTopN)));
      params.set("entry_threshold", String(queryState.entry_threshold != null ? queryState.entry_threshold : leaderEntryThreshold));
      params.set("exit_threshold", String(queryState.exit_threshold != null ? queryState.exit_threshold : leaderExitThreshold));
      params.set("use_entry_threshold", String(!!(queryState.use_entry_threshold != null ? queryState.use_entry_threshold : leaderUseEntryThreshold)));
      params.set("use_exit_threshold", String(!!(queryState.use_exit_threshold != null ? queryState.use_exit_threshold : leaderUseExitThreshold)));
      params.set("stop_loss_pct", String(queryState.stop_loss_pct != null ? queryState.stop_loss_pct : leaderStopLossPct || 0));
      params.set("use_stop_loss", String(!!(queryState.use_stop_loss != null ? queryState.use_stop_loss : leaderUseStopLoss)));
      params.set("stop_loss_mode", String(queryState.stop_loss_mode || leaderStopLossMode || "pct"));
      params.set("exit_ma20_break", String(!!(queryState.exit_ma20_break != null ? queryState.exit_ma20_break : leaderExitMa20Break)));
      params.set("exit_ma60_break", String(!!(queryState.exit_ma60_break != null ? queryState.exit_ma60_break : leaderExitMa60Break)));
      params.set("entry_streak_days", String(queryState.entry_streak_days != null ? queryState.entry_streak_days : leaderEntryStreakDays || 1));
      params.set("use_entry_streak", String(!!(queryState.use_entry_streak != null ? queryState.use_entry_streak : leaderUseEntryStreak)));
      params.set("runup_lookback_days", String(queryState.runup_lookback_days != null ? queryState.runup_lookback_days : leaderRunupLookbackDays || 0));
      params.set("runup_exclude_pct", String(queryState.runup_exclude_pct != null ? queryState.runup_exclude_pct : leaderRunupExcludePct || 0));
      params.set("use_runup_filter", String(!!(queryState.use_runup_filter != null ? queryState.use_runup_filter : leaderUseRunupFilter)));
      params.set("min_market_cap_100m", String(queryState.min_market_cap_100m != null ? queryState.min_market_cap_100m : leaderMinMarketCap100m || 0));
      params.set("use_min_market_cap_filter", String(!!(queryState.use_min_market_cap_filter != null ? queryState.use_min_market_cap_filter : leaderUseMinMarketCapFilter)));
      params.set("max_atr_20", String(queryState.max_atr_20 != null ? queryState.max_atr_20 : leaderMaxAtr20 || 0));
      params.set("use_atr_filter", String(!!(queryState.use_atr_filter != null ? queryState.use_atr_filter : leaderUseAtrFilter)));
      params.set("entry_high_filter", String(queryState.entry_high_filter || leaderEntryHighFilter || "none"));
      params.set("use_entry_52w_high", String((queryState.entry_high_filter || leaderEntryHighFilter || "none") === "52w"));
      params.set("allocation_mode", String(queryState.allocation_mode || leaderAllocationMode || "score_weight"));
      params.set("refresh", String(queryState.refresh || Date.now()));
    }
    const sectorParams = new URLSearchParams({
      start: sectorQueryState.start,
      end: sectorQueryState.end,
      min_score: sectorQueryState.min_score,
      top_sectors: sectorQueryState.top_sectors,
      stocks_per_sector: sectorQueryState.stocks_per_sector,
      leverage: sectorQueryState.leverage,
      weight_method: sectorQueryState.weight_method,
    });
    const advancedParams = new URLSearchParams({
      start: advancedQueryState.start,
      end: advancedQueryState.end,
      min_score: advancedQueryState.min_score,
      top_sectors: advancedQueryState.top_sectors,
      stocks_per_sector: advancedQueryState.stocks_per_sector,
      max_leverage: advancedQueryState.max_leverage,
      benchmark: advancedQueryState.benchmark,
      weight_method: advancedQueryState.weight_method,
      beta_window: advancedQueryState.beta_window,
      min_breadth: advancedQueryState.min_breadth,
      max_disparity: advancedQueryState.max_disparity,
      trading_rank_limit: advancedQueryState.trading_rank_limit,
      stock_selection: advancedQueryState.stock_selection,
    });
    const indexRequest = useFetchJson("/api/strategy/backtest?" + params.toString(), {
      enabled: (strategyMode === "index" && indexBacktestStarted) || ((strategyMode === "leader_top10" || strategyMode === "us_leader") && leaderBacktestStarted),
    });
    const sectorRequest = useFetchJson("/api/strategy/sector-rotation?" + sectorParams.toString(), { enabled: strategyMode === "sector_rotation" && sectorBacktestStarted });
    const advancedRequest = useFetchJson("/api/strategy/advanced-sector?" + advancedParams.toString(), { enabled: strategyMode === "advanced_sector" && advancedBacktestStarted });
    const diagnosticRequest = useFetchJson("/api/strategy/portfolio-diagnostic", { enabled: strategyMode === "portfolio_diagnostic" });
    const data = indexRequest.data || {};
    const sectorData = sectorRequest.data || {};
    const advancedData = advancedRequest.data || {};
    const diagnosticData = diagnosticRequest.data || {};
    const rows = ensureArray(data.rows);
    const sectorRows = ensureArray(sectorData.rows);
    const advancedRows = ensureArray(advancedData.rows);
    const diagnosticRows = ensureArray(diagnosticData.rows);
    const summary = data.summary || {};
    const sectorSummary = sectorData.summary || {};
    const advancedSummary = advancedData.summary || {};
    const diagnosticSummary = diagnosticData.summary || {};
    const availableIndexes = ensureArray(data.available_indexes).length
      ? ensureArray(data.available_indexes)
      : [
          { key: "KS11", name: "KOSPI" },
          { key: "KQ11", name: "KOSDAQ" },
          { key: "IXIC", name: "NASDAQ" },
          { key: "US500", name: "S&P 500" },
        ];
    const availableStrategies = ensureArray(data.available_strategies).length
      ? ensureArray(data.available_strategies).filter(function (item) { return item && item.key !== "leader_top10_score70"; })
      : [
          { key: "ma20_cross", name: "20일선 돌파" },
          { key: "ma20_cross_mdd7", name: "20일선 돌파 + MDD 7% 매도" },
          { key: "golden_cross", name: "골든크로스" },
          { key: "rsi_rebound", name: "RSI 반등" },
      ];
    const availableAdvancedBenchmarks = ensureArray(advancedData.available_benchmarks).length
        ? ensureArray(advancedData.available_benchmarks)
        : [
            { key: "leader_avg", name: "시총 2000억 이상 주도주 평균" },
            { key: "portfolio_dashboard", name: "포트폴리오 수익 페이지" },
            { key: "KS11", name: "KOSPI" },
          { key: "KQ11", name: "KOSDAQ" },
          { key: "KRX_BLEND", name: "KOSPI/KOSDAQ 50:50" },
          { key: "IXIC", name: "NASDAQ" },
          { key: "US500", name: "S&P 500" },
        ];
    const savedLeaderSnapshots = ensureArray(leaderSnapshotRequest.data && leaderSnapshotRequest.data.snapshots);

    function leaderSnapshotDefaultLabel() {
      const marketLabel = "국내 주도주";
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mi = String(now.getMinutes()).padStart(2, "0");
      return marketLabel + " " + yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi;
    }

    function hydrateLeaderControlsFromQuery(savedQuery) {
      const query = savedQuery || {};
      if (query.index === "US500" || query.index === "NDX100") {
        setLeaderUsBenchmark(String(query.index));
      }
      setLeaderTopN(query.top_n != null ? Number(query.top_n) : 100);
      setLeaderExitTopN(query.exit_top_n != null ? Number(query.exit_top_n) : (query.top_n != null ? Number(query.top_n) : 100));
      setLeaderUseEntryTopN(query.use_entry_top_n != null ? !!query.use_entry_top_n : true);
      setLeaderUseExitTopN(query.use_exit_top_n != null ? !!query.use_exit_top_n : true);
      setLeaderEntryThreshold(query.entry_threshold != null ? Number(query.entry_threshold) : 65);
      setLeaderExitThreshold(query.exit_threshold != null ? Number(query.exit_threshold) : 50);
      setLeaderUseEntryThreshold(query.use_entry_threshold != null ? !!query.use_entry_threshold : true);
      setLeaderUseExitThreshold(query.use_exit_threshold != null ? !!query.use_exit_threshold : true);
      setLeaderStopLossPct(query.stop_loss_pct != null ? Number(query.stop_loss_pct) : 0);
      setLeaderUseStopLoss(query.use_stop_loss != null ? !!query.use_stop_loss : false);
      setLeaderStopLossMode(String(query.stop_loss_mode || "pct"));
      setLeaderExitMa20Break(!!query.exit_ma20_break);
      setLeaderExitMa60Break(!!query.exit_ma60_break);
      setLeaderEntryStreakDays(query.entry_streak_days != null ? Number(query.entry_streak_days) : 1);
      setLeaderUseEntryStreak(query.use_entry_streak != null ? !!query.use_entry_streak : true);
      setLeaderRunupLookbackDays(query.runup_lookback_days != null ? Number(query.runup_lookback_days) : 0);
      setLeaderRunupExcludePct(query.runup_exclude_pct != null ? Number(query.runup_exclude_pct) : 0);
      setLeaderUseRunupFilter(query.use_runup_filter != null ? !!query.use_runup_filter : false);
      setLeaderMinMarketCap100m(query.min_market_cap_100m != null ? Number(query.min_market_cap_100m) : 0);
      setLeaderUseMinMarketCapFilter(query.use_min_market_cap_filter != null ? !!query.use_min_market_cap_filter : false);
      setLeaderMaxAtr20(query.max_atr_20 != null ? Number(query.max_atr_20) : 0);
      setLeaderUseAtrFilter(query.use_atr_filter != null ? !!query.use_atr_filter : false);
      setLeaderEntryHighFilter(String(query.entry_high_filter || (query.use_entry_52w_high ? "52w" : "none")));
      setLeaderAllocationMode(String(query.allocation_mode || "score_weight"));
      setStartDate(String(query.start || isoDateOffset(-365)));
      setEndDate(String(query.end || isoDateOffset(0)));
    }

    function defaultLeaderQuery(marketMode) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      return {
        index: normalizedMarket === "us" ? "US500" : "KS11",
        market: normalizedMarket,
        strategy: "leader_custom",
        start: isoDateOffset(-365),
        end: isoDateOffset(0),
        top_n: 100,
        exit_top_n: 100,
        use_entry_top_n: true,
        use_exit_top_n: true,
        entry_threshold: 65,
        exit_threshold: 50,
        use_entry_threshold: true,
        use_exit_threshold: true,
        stop_loss_pct: 0,
        use_stop_loss: false,
        stop_loss_mode: "pct",
        exit_ma20_break: false,
        exit_ma60_break: false,
        entry_streak_days: 1,
        use_entry_streak: true,
        runup_lookback_days: 0,
        runup_exclude_pct: 0,
        use_runup_filter: false,
        min_market_cap_100m: 0,
        use_min_market_cap_filter: false,
        max_atr_20: 0,
        use_atr_filter: false,
        entry_high_filter: "none",
        use_entry_52w_high: false,
        allocation_mode: "score_weight",
      };
    }

    function buildLeaderQueryFromControls(marketMode, refreshValue) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      const nextQuery = {
        index: normalizedMarket === "us" ? leaderUsBenchmark : "KS11",
        market: normalizedMarket,
        strategy: "leader_custom",
        start: startDate || isoDateOffset(-365),
        end: endDate || isoDateOffset(0),
        top_n: Number(leaderTopN || 0) > 0 ? Number(leaderTopN) : 9999,
        exit_top_n: Number(leaderExitTopN || 0) > 0 ? Number(leaderExitTopN) : (Number(leaderTopN || 0) > 0 ? Number(leaderTopN) : 9999),
        use_entry_top_n: !!leaderUseEntryTopN,
        use_exit_top_n: !!leaderUseExitTopN,
        entry_threshold: Number(leaderEntryThreshold || 0),
        exit_threshold: Number(leaderExitThreshold || 0),
        use_entry_threshold: !!leaderUseEntryThreshold,
        use_exit_threshold: !!leaderUseExitThreshold,
        stop_loss_pct: Number(leaderStopLossPct || 0),
        use_stop_loss: !!leaderUseStopLoss,
        stop_loss_mode: leaderStopLossMode || "pct",
        exit_ma20_break: !!leaderExitMa20Break,
        exit_ma60_break: !!leaderExitMa60Break,
        entry_streak_days: Number(leaderEntryStreakDays || 1),
        use_entry_streak: !!leaderUseEntryStreak,
        runup_lookback_days: Number(leaderRunupLookbackDays || 0),
        runup_exclude_pct: Number(leaderRunupExcludePct || 0),
        use_runup_filter: !!leaderUseRunupFilter,
        min_market_cap_100m: Number(leaderMinMarketCap100m || 0),
        use_min_market_cap_filter: !!leaderUseMinMarketCapFilter,
        max_atr_20: Number(leaderMaxAtr20 || 0),
        use_atr_filter: !!leaderUseAtrFilter,
        entry_high_filter: String(leaderEntryHighFilter || "none"),
        use_entry_52w_high: String(leaderEntryHighFilter || "none") === "52w",
        allocation_mode: leaderAllocationMode || "score_weight",
      };
      if (refreshValue != null) {
        nextQuery.refresh = String(refreshValue);
      }
      return nextQuery;
    }

    function saveLeaderBacktestPrefs(marketMode, query) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      try {
        localStorage.setItem(STRATEGY_BACKTEST_PREFS_KEYS[normalizedMarket], JSON.stringify(query));
      } catch (error) {
      }
    }

    function switchStrategyMode(nextMode) {
      const currentLeaderMarket = strategyMode === "us_leader" ? "us" : (strategyMode === "leader_top10" ? "kr" : "");
      if (currentLeaderMarket) {
        saveLeaderBacktestPrefs(currentLeaderMarket, buildLeaderQueryFromControls(currentLeaderMarket));
      }
      const nextLeaderMarket = nextMode === "us_leader" ? "us" : (nextMode === "leader_top10" ? "kr" : "");
      if (nextLeaderMarket) {
        const savedPrefs = loadSavedLeaderBacktestPrefs(nextLeaderMarket) || defaultLeaderQuery(nextLeaderMarket);
        hydrateLeaderControlsFromQuery(savedPrefs);
        const lastExecutedQuery = leaderLastQueryByMarketRef.current[nextLeaderMarket];
        setQueryState(lastExecutedQuery || savedPrefs);
        setLeaderBacktestStarted(!!lastExecutedQuery);
        setActiveLeaderSnapshot(null);
        setActiveLeaderSnapshotId(0);
        setLeaderSnapshotMessage("");
      } else {
        setLeaderBacktestStarted(false);
      }
      setStrategyMode(nextMode);
    }

    useEffect(function () {
      const activeMarket = strategyMode === "us_leader" ? "us" : (strategyMode === "leader_top10" ? "kr" : "");
      if (!activeMarket) {
        return;
      }
      saveLeaderBacktestPrefs(activeMarket, buildLeaderQueryFromControls(activeMarket));
    }, [
      strategyMode,
      leaderUsBenchmark,
      leaderTopN,
      leaderExitTopN,
      leaderUseEntryTopN,
      leaderUseExitTopN,
      leaderEntryThreshold,
      leaderExitThreshold,
      leaderUseEntryThreshold,
      leaderUseExitThreshold,
      leaderStopLossPct,
      leaderUseStopLoss,
      leaderStopLossMode,
      leaderExitMa20Break,
      leaderExitMa60Break,
      leaderEntryStreakDays,
      leaderUseEntryStreak,
      leaderRunupLookbackDays,
      leaderRunupExcludePct,
      leaderUseRunupFilter,
      leaderMinMarketCap100m,
      leaderUseMinMarketCapFilter,
      leaderMaxAtr20,
      leaderUseAtrFilter,
      leaderEntryHighFilter,
      leaderAllocationMode,
      startDate,
      endDate,
    ]);

    function extractLeaderSellRows(sourceRows) {
      const results = [];
      ensureArray(sourceRows).forEach(function (row) {
        ensureArray(row && row.entry_exit && row.entry_exit.sell_details).forEach(function (detail) {
          results.push({
            date: row.date,
            signal_date: detail.signal_date || row.signal_date || "",
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            buy_reason: detail.buy_reason || "",
            reason: detail.reason || "-",
            buy_avg_price: detail.avg_buy_price,
            buy_date: detail.buy_date || "",
            sell_avg_price: detail.sell_price,
            sell_date: detail.sell_date || detail.date || row.date,
            sell_return_pct: detail.sell_return_pct,
            markers: strategyTradeMarkers({
              entry_date: detail.buy_date || "",
              exit_date: detail.sell_date || row.date,
              entry_price: detail.avg_buy_price,
              exit_price: detail.sell_price,
              trade_return_pct: detail.sell_return_pct,
            }),
          });
        });
      });
      return results;
    }

    function buildLeaderPeriodMeta(dateText, mode) {
      const raw = String(dateText || "");
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
      }
      const quarter = Math.floor((month - 1) / 3) + 1;
      if (mode === "quarter") {
        return {
          key: year + "-Q" + quarter,
          label: year + "." + quarter + "Q",
          sortValue: year * 10 + quarter,
        };
      }
      return {
        key: String(year),
        label: String(year),
        sortValue: year,
      };
    }

    function calculateLeaderPeriodMdd(navPath) {
      let peak = null;
      let worstDrawdown = 0;
      ensureArray(navPath).forEach(function (value) {
        const nav = Number(value);
        if (!Number.isFinite(nav) || nav <= 0) return;
        if (peak == null || nav > peak) {
          peak = nav;
        }
        if (!peak) return;
        const drawdownPct = ((nav - peak) / peak) * 100;
        if (drawdownPct < worstDrawdown) {
          worstDrawdown = drawdownPct;
        }
      });
      return worstDrawdown;
    }

    function buildLeaderPeriodicSummaryRows(backtestRows, sellRows, mode) {
      const groups = {};
      ensureArray(backtestRows).forEach(function (row) {
        const meta = buildLeaderPeriodMeta(row && row.date, mode);
        if (!meta) return;
        if (!groups[meta.key]) {
          groups[meta.key] = {
            key: meta.key,
            label: meta.label,
            sortValue: meta.sortValue,
            nav: 100,
            navPath: [100],
            tradeReturns: [],
          };
        }
        const group = groups[meta.key];
        const dailyReturnPct = Number(row && row.daily_return_pct);
        if (Number.isFinite(dailyReturnPct)) {
          group.nav *= 1 + (dailyReturnPct / 100);
        }
        group.navPath.push(group.nav);
      });
      ensureArray(sellRows).forEach(function (row) {
        const meta = buildLeaderPeriodMeta((row && (row.sell_date || row.date)) || "", mode);
        if (!meta) return;
        if (!groups[meta.key]) {
          groups[meta.key] = {
            key: meta.key,
            label: meta.label,
            sortValue: meta.sortValue,
            nav: 100,
            navPath: [100],
            tradeReturns: [],
          };
        }
        const returnPct = Number(row && row.sell_return_pct);
        if (Number.isFinite(returnPct)) {
          groups[meta.key].tradeReturns.push(returnPct);
        }
      });
      return Object.keys(groups).map(function (key) {
        const item = groups[key];
        const tradeReturns = ensureArray(item.tradeReturns);
        const winningReturns = tradeReturns.filter(function (value) { return Number(value) > 0; });
        const losingReturns = tradeReturns.filter(function (value) { return Number(value) < 0; });
        const tradeCount = tradeReturns.length;
        return {
          key: item.key,
          label: item.label,
          sortValue: item.sortValue,
          trade_count: tradeCount,
          return_pct: item.nav - 100,
          win_rate_pct: tradeCount ? (winningReturns.length / tradeCount) * 100 : null,
          avg_profit_pct: winningReturns.length
            ? (winningReturns.reduce(function (sum, value) { return sum + Number(value || 0); }, 0) / winningReturns.length)
            : null,
          avg_loss_pct: losingReturns.length
            ? (losingReturns.reduce(function (sum, value) { return sum + Number(value || 0); }, 0) / losingReturns.length)
            : null,
          mdd_pct: calculateLeaderPeriodMdd(item.navPath),
        };
      }).sort(function (a, b) {
        return Number(a.sortValue || 0) - Number(b.sortValue || 0);
      });
    }

    function buildLeaderTradeLookup(snapshotPayload) {
      const byStock = {};
      const rowsToUse = ensureArray(snapshotPayload && snapshotPayload.rows);
      extractLeaderSellRows(rowsToUse).forEach(function (item) {
        const codeKey = String(item.stock_code || "").trim().toUpperCase();
        const nameKey = String(item.stock_name || "").trim();
        const stockKey = codeKey || nameKey;
        if (!stockKey) return;
        if (!byStock[stockKey]) {
          byStock[stockKey] = [];
        }
        byStock[stockKey].push(item);
      });
      Object.keys(byStock).forEach(function (key) {
        byStock[key] = byStock[key].slice().sort(function (a, b) {
          return String(a.sell_date || a.date || "").localeCompare(String(b.sell_date || b.date || ""));
        });
      });
      return byStock;
    }

    function buildLeaderCompareStockOptions(leftSnapshot, rightSnapshot) {
      const stockMap = {};
      [leftSnapshot, rightSnapshot].forEach(function (snapshot) {
        const rowsToUse = ensureArray(snapshot && snapshot.payload && snapshot.payload.rows);
        extractLeaderSellRows(rowsToUse).forEach(function (item) {
          const codeKey = String(item.stock_code || "").trim().toUpperCase();
          const nameKey = String(item.stock_name || "").trim();
          const key = codeKey || nameKey;
          if (!key) return;
          if (!stockMap[key]) {
            stockMap[key] = {
              key: key,
              stock_code: codeKey,
              stock_name: nameKey || codeKey || "-",
            };
          }
        });
      });
      return Object.keys(stockMap).map(function (key) { return stockMap[key]; }).sort(function (a, b) {
        return String(a.stock_name || a.key).localeCompare(String(b.stock_name || b.key), "ko");
      });
    }

    function applyBacktest() {
      setIndexBacktestStarted(true);
      setQueryState({
        index: indexKey,
        strategy: strategyKey,
        start: startDate,
        end: endDate,
      });
    }

    function applyLeaderBacktest(marketMode) {
      var normalizedMarket = marketMode === "us" ? "us" : "kr";
      const nextLeaderQuery = buildLeaderQueryFromControls(normalizedMarket, Date.now());
      setLeaderBacktestStarted(true);
      setIndexKey(normalizedMarket === "us" ? leaderUsBenchmark : "KS11");
      setQueryState(nextLeaderQuery);
      leaderLastQueryByMarketRef.current[normalizedMarket] = nextLeaderQuery;
      saveLeaderBacktestPrefs(normalizedMarket, nextLeaderQuery);
      setActiveLeaderSnapshot(null);
      setActiveLeaderSnapshotId(0);
      setLeaderSnapshotMessage("");
    }

    async function saveCurrentLeaderBacktest() {
      const payloadToSave = (activeLeaderSnapshot && activeLeaderSnapshot.payload) ? activeLeaderSnapshot.payload : data;
      const rowsToSave = ensureArray(payloadToSave && payloadToSave.rows);
      if (!payloadToSave || !rowsToSave.length || String(queryState.market || "kr") !== "kr") {
        setLeaderSnapshotMessage("저장할 국내 주도주 백테스트 결과가 없습니다.");
        return;
      }
      const nextLabel = window.prompt("저장 이름", leaderSnapshotDefaultLabel());
      if (nextLabel == null) {
        return;
      }
      const trimmedLabel = String(nextLabel || "").trim();
      if (!trimmedLabel) {
        setLeaderSnapshotMessage("저장 이름이 비어 있습니다.");
        return;
      }
      setLeaderSnapshotSaving(true);
      setLeaderSnapshotMessage("");
      try {
        const payload = await postJson("/api/strategy/snapshots", {
          strategy_group: "leader_kr",
          market: "kr",
          label: trimmedLabel,
          query: queryState,
          payload: payloadToSave,
        });
        const savedSnapshot = payload && payload.snapshot ? payload.snapshot : null;
        setActiveLeaderSnapshot(savedSnapshot);
        setActiveLeaderSnapshotId(savedSnapshot && savedSnapshot.id ? Number(savedSnapshot.id) : 0);
        setLeaderSnapshotMessage("저장 완료");
        await leaderSnapshotRequest.refresh(true);
      } catch (error) {
        setLeaderSnapshotMessage(error.message || String(error));
      } finally {
        setLeaderSnapshotSaving(false);
      }
    }

    async function loadLeaderSnapshot(snapshotId) {
      const targetId = Number(snapshotId || 0);
      if (!(targetId > 0)) {
        setActiveLeaderSnapshot(null);
        setActiveLeaderSnapshotId(0);
        return;
      }
      try {
        const payload = await fetchJson("/api/strategy/snapshots/" + targetId, { forceRefresh: true, noCache: true });
        const snapshot = payload && payload.snapshot ? payload.snapshot : null;
        if (!snapshot) {
          return;
        }
        const savedQuery = snapshot.query || {};
        hydrateLeaderControlsFromQuery(savedQuery);
        setQueryState(Object.assign({}, savedQuery));
        setStrategyMode("leader_top10");
        setLeaderBacktestStarted(false);
        setActiveLeaderSnapshot(snapshot);
        setActiveLeaderSnapshotId(targetId);
        setLeaderSnapshotMessage("저장 결과 불러옴");
      } catch (error) {
        setLeaderSnapshotMessage(error.message || String(error));
      }
    }

    async function submitLeaderAiChat(marketMode, payload, questionText) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      const question = String(questionText || "").trim();
      if (!question || !payload) {
        return;
      }
      setLeaderAiErrorByMarket(function (prev) {
        return Object.assign({}, prev, { [normalizedMarket]: "" });
      });
      setLeaderAiLoadingByMarket(function (prev) {
        return Object.assign({}, prev, { [normalizedMarket]: true });
      });
      setLeaderAiMessagesByMarket(function (prev) {
        const next = Object.assign({}, prev);
        const rows = ensureArray(next[normalizedMarket]).slice();
        rows.push({ role: "user", text: question, created_at: new Date().toISOString() });
        next[normalizedMarket] = rows;
        return next;
      });
      setLeaderAiInputByMarket(function (prev) {
        return Object.assign({}, prev, { [normalizedMarket]: "" });
      });
      try {
        const response = await postJson("/api/strategy/backtest/ai-chat", {
          market: normalizedMarket,
          question: question,
          query: Object.assign({}, queryState, { market: normalizedMarket }),
          payload: {
            strategy_name: payload.strategy_name,
            index_name: payload.index_name,
            start_date: payload.start_date,
            end_date: payload.end_date,
            summary: payload.summary || {},
            rows: ensureArray(payload.rows).slice(-180),
            signals: ensureArray(payload.signals).slice(-80),
          },
        });
        const result = response && response.result ? response.result : {};
        setLeaderAiMessagesByMarket(function (prev) {
          const next = Object.assign({}, prev);
          const rows = ensureArray(next[normalizedMarket]).slice();
          rows.push({
            role: "assistant",
            text: String(result.answer || "").trim() || "답변을 생성하지 못했습니다.",
            bullet_points: ensureArray(result.bullet_points).filter(Boolean),
            suggested_questions: ensureArray(result.suggested_questions).filter(Boolean),
            created_at: result.generated_at || new Date().toISOString(),
          });
          next[normalizedMarket] = rows;
          return next;
        });
      } catch (error) {
        setLeaderAiErrorByMarket(function (prev) {
          return Object.assign({}, prev, {
            [normalizedMarket]: error && error.message ? error.message : "AI 답변 요청 중 오류가 발생했습니다.",
          });
        });
      } finally {
        setLeaderAiLoadingByMarket(function (prev) {
          return Object.assign({}, prev, { [normalizedMarket]: false });
        });
      }
    }

    function renderLeaderAiPanel(marketMode, payload, mddContributorRows) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      const messages = ensureArray(leaderAiMessagesByMarket[normalizedMarket]);
      const inputValue = String((leaderAiInputByMarket && leaderAiInputByMarket[normalizedMarket]) || "");
      const loading = !!(leaderAiLoadingByMarket && leaderAiLoadingByMarket[normalizedMarket]);
      const error = String((leaderAiErrorByMarket && leaderAiErrorByMarket[normalizedMarket]) || "");
      return h(
        "div",
        { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "subsection-title" }, "AI 전략 리뷰"),
            h("div", { className: "summary-help" }, "현재 백테스트 결과와 20일 신고가→52주 신고가 전이 통계를 함께 사용합니다.")
          ),
          loading ? h("span", { className: "telegram-status-pill" }, "답변 생성 중") : null
        ),
        h(
          "div",
          { className: "mini-table-panel", style: { marginBottom: "10px", background: "#fbfdff" } },
          h("div", { className: "subsection-title" }, "MDD 구간 기여 종목"),
          h(DataTable, {
            rows: ensureArray(mddContributorRows).slice(0, 10),
            emptyMessage: "MDD 기여 종목 데이터가 없습니다.",
            compact: true,
            columns: [
              { key: "stock_name", label: "종목", render: function (row) {
                return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row.trade || row); } }, row.stock_name || row.stock_code || "-");
              } },
              { key: "contribution_pct", label: "누적 기여", render: function (row) {
                return row.contribution_pct == null ? "-" : h("span", { className: pnlClass(row.contribution_pct) }, formatPercent(row.contribution_pct, 2));
              } },
              { key: "active_days", label: "영향 일수", render: function (row) { return numberFormat(row.active_days, 0) + "일"; } },
              { key: "trade_count", label: "매도 건", render: function (row) { return numberFormat(row.trade_count, 0) + "건"; } },
              { key: "latest_sell_date", label: "최근 매도일", render: function (row) { return row.latest_sell_date || "-"; } },
            ],
          })
        ),
        h(
          "div",
          {
            className: "strategy-scroll-panel",
            style: { maxHeight: "360px", overflowY: "auto", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#f8fbff" },
          },
          messages.length
            ? messages.map(function (message, index) {
                const isUser = message.role === "user";
                return h(
                  "div",
                  {
                    key: String(message.created_at || index) + "-" + index,
                    style: { display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "10px" },
                  },
                  h(
                    "div",
                    {
                      style: {
                        maxWidth: "88%",
                        border: "1px solid " + (isUser ? "#c7d8ff" : "#dbe7f5"),
                        background: isUser ? "#eef4ff" : "#ffffff",
                        borderRadius: "12px",
                        padding: "10px 12px",
                      },
                    },
                    h("div", { style: { whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#1e293b", fontSize: "13px" } }, message.text || "-"),
                    ensureArray(message.bullet_points).length
                      ? h("ul", { style: { margin: "8px 0 0", paddingLeft: "18px", color: "#475569", fontSize: "12px", lineHeight: 1.6 } },
                          ensureArray(message.bullet_points).map(function (item, bulletIndex) {
                            return h("li", { key: bulletIndex }, item);
                          })
                        )
                      : null
                  )
                );
              })
            : h("div", { className: "summary-help" }, "현재 전략의 약점, MDD 원인, 신고가 전이 통계 등에 대해 질문할 수 있습니다.")
        ),
        error ? h("div", { className: "summary-help", style: { color: "#dc2626", marginTop: "8px" } }, error) : null,
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", marginTop: "10px", alignItems: "end" } },
          h("textarea", {
            className: "text-input",
            rows: 3,
            value: inputValue,
            placeholder: "예: 20일 신고가 후 52주 신고가까지 평균 상승률과 탈락 비율을 설명해줘",
            onChange: function (event) {
              const nextValue = event.target.value;
              setLeaderAiInputByMarket(function (prev) {
                return Object.assign({}, prev, { [normalizedMarket]: nextValue });
              });
            },
          }),
          h("button", {
            type: "button",
            className: "primary-button",
            disabled: loading || !inputValue.trim(),
            onClick: function () { submitLeaderAiChat(normalizedMarket, payload, inputValue); },
          }, loading ? "답변 생성 중" : "질문하기")
        )
      );
    }

    function BacktestEventCurveChart(props) {
      var series = ensureArray(props && props.series).filter(function (item) {
        return ensureArray(item && item.points).length > 0;
      });
      if (!series.length) {
        return h("div", { className: "summary-help" }, "이벤트 이후 수익률 곡선 데이터가 없습니다.");
      }
      var width = Number(props && props.width) || 920;
      var height = Number(props && props.height) || 280;
      var paddingLeft = 44;
      var paddingRight = 18;
      var paddingTop = 16;
      var paddingBottom = 34;
      var innerWidth = Math.max(10, width - paddingLeft - paddingRight);
      var innerHeight = Math.max(10, height - paddingTop - paddingBottom);
      var palette = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ef4444"];
      var allPoints = [];
      series.forEach(function (item) {
        ensureArray(item.points).forEach(function (point) {
          var day = Number(point && point.day);
          var value = Number(point && point.avg_return_pct);
          if (Number.isFinite(day) && Number.isFinite(value)) {
            allPoints.push({ day: day, value: value });
          }
        });
      });
      if (!allPoints.length) {
        return h("div", { className: "summary-help" }, "이벤트 이후 수익률 곡선 데이터가 없습니다.");
      }
      var minDay = Math.min.apply(null, allPoints.map(function (item) { return item.day; }));
      var maxDay = Math.max.apply(null, allPoints.map(function (item) { return item.day; }));
      var minValue = Math.min(0, Math.min.apply(null, allPoints.map(function (item) { return item.value; })));
      var maxValue = Math.max(0, Math.max.apply(null, allPoints.map(function (item) { return item.value; })));
      if (!(maxDay > minDay)) maxDay = minDay + 1;
      if (!(maxValue > minValue)) {
        maxValue = minValue + 1;
      }
      var xOf = function (day) {
        return paddingLeft + (((day - minDay) / (maxDay - minDay)) * innerWidth);
      };
      var yOf = function (value) {
        return paddingTop + (1 - ((value - minValue) / (maxValue - minValue))) * innerHeight;
      };
      var zeroY = yOf(0);
      var yTicks = 5;
      var gridRows = [];
      for (var i = 0; i <= yTicks; i += 1) {
        var ratio = i / yTicks;
        var value = maxValue - ((maxValue - minValue) * ratio);
        var y = paddingTop + (innerHeight * ratio);
        gridRows.push(
          h("g", { key: "y-grid-" + i },
            h("line", { x1: paddingLeft, y1: y, x2: width - paddingRight, y2: y, stroke: "#e2e8f0", strokeWidth: 1 }),
            h("text", { x: 6, y: y + 4, fill: "#64748b", fontSize: 11 }, formatPercent(value, 1))
          )
        );
      }
      var xTickDays = [1, 5, 10, 20, 40, 60].filter(function (day) {
        return day >= minDay && day <= maxDay;
      });
      var xTickRows = xTickDays.map(function (day) {
        var x = xOf(day);
        return h("g", { key: "x-grid-" + day },
          h("line", { x1: x, y1: paddingTop, x2: x, y2: height - paddingBottom, stroke: "#f1f5f9", strokeWidth: 1 }),
          h("text", { x: x, y: height - 10, fill: "#64748b", fontSize: 11, textAnchor: "middle" }, "D+" + day)
        );
      });
      return h(
        "div",
        null,
        h(
          "div",
          { className: "score-history-lightweight-legend", style: { marginBottom: "8px" } },
          series.map(function (item, index) {
            return h(
              "span",
              { key: item.key || index, className: "legend-item" },
              h("span", { className: "legend-swatch", style: { background: palette[index % palette.length] } }),
              item.label || ("시리즈 " + (index + 1))
            );
          })
        ),
        h(
          "svg",
          { viewBox: "0 0 " + width + " " + height, style: { width: "100%", height: "280px", display: "block" } },
          gridRows,
          xTickRows,
          h("line", { x1: paddingLeft, y1: zeroY, x2: width - paddingRight, y2: zeroY, stroke: "#94a3b8", strokeDasharray: "4 4", strokeWidth: 1 }),
          series.map(function (item, index) {
            var points = ensureArray(item.points).filter(function (point) {
              return Number.isFinite(Number(point && point.day)) && Number.isFinite(Number(point && point.avg_return_pct));
            });
            if (!points.length) return null;
            var path = points.map(function (point, pointIndex) {
              var prefix = pointIndex === 0 ? "M" : "L";
              return prefix + xOf(Number(point.day)) + " " + yOf(Number(point.avg_return_pct));
            }).join(" ");
            return h("path", {
              key: item.key || index,
              d: path,
              fill: "none",
              stroke: palette[index % palette.length],
              strokeWidth: 2.5,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            });
          })
        )
      );
    }

    function renderLeaderBreakoutInsightsPanel(payload) {
      var insights = payload && payload.breakout_insights ? payload.breakout_insights : null;
      var summaryRows = ensureArray(insights && insights.summary_rows);
      var whipsawRows = ensureArray(insights && insights.whipsaw_rows);
      var forwardCurves = ensureArray(insights && insights.forward_curves);
      var clusterRows = ensureArray(insights && insights.cluster_rows);
      if (!summaryRows.length && !whipsawRows.length && !forwardCurves.length && !clusterRows.length) {
        return null;
      }
      return h(
        "div",
        { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "subsection-title" }, "신고가 돌파 분석"),
            h("div", { className: "summary-help" }, "실제 체결된 돌파 매매를 기준으로 분포, 휩소, 이벤트 이후 경로, 유형별 특성을 정리합니다.")
          )
        ),
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table" },
            h("div", { className: "subsection-title" }, "신고가 돌파 분포 요약"),
            h(DataTable, {
              rows: summaryRows,
              compact: true,
              emptyMessage: "돌파 요약 데이터가 없습니다.",
              columns: [
                { key: "label", label: "유형", render: function (row) { return row.label || "-"; } },
                { key: "event_count", label: "건수", render: function (row) { return numberFormat(row.event_count, 0) + "건"; } },
                { key: "avg_return_pct", label: "평균 수익률", render: function (row) { return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2)); } },
                { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
                { key: "avg_peak_return_pct", label: "평균 최대 상승", render: function (row) { return row.avg_peak_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_peak_return_pct) }, formatPercent(row.avg_peak_return_pct, 2)); } },
                { key: "hit_20_pct", label: "+20% 도달", render: function (row) { return row.hit_20_pct == null ? "-" : formatPercent(row.hit_20_pct, 1); } },
                { key: "reached_52w_pct", label: "52주 신고가 도달", render: function (row) { return row.reached_52w_pct == null ? "-" : formatPercent(row.reached_52w_pct, 1); } },
              ],
            })
          ),
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table" },
            h("div", { className: "subsection-title" }, "휩소 분석"),
            h("div", { className: "summary-help", style: { marginBottom: "8px" } }, "손실 또는 본전 이하로 매도된 거래를 매도 사유별로 묶었습니다."),
            h(DataTable, {
              rows: whipsawRows,
              compact: true,
              emptyMessage: "휩소 분석 대상 거래가 없습니다.",
              columns: [
                { key: "reason", label: "매도 사유", render: function (row) { return row.reason || "-"; } },
                { key: "event_count", label: "건수", render: function (row) { return numberFormat(row.event_count, 0) + "건"; } },
                { key: "share_pct", label: "비중", render: function (row) { return row.share_pct == null ? "-" : formatPercent(row.share_pct, 1); } },
                { key: "avg_return_pct", label: "평균 손익", render: function (row) { return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2)); } },
                { key: "avg_hold_days", label: "평균 보유일", render: function (row) { return row.avg_hold_days == null ? "-" : numberFormat(row.avg_hold_days, 1) + "일"; } },
              ],
            })
          )
        ),
        h(
          "div",
          { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
          h("div", { className: "subsection-title" }, "이벤트 이후 수익률 곡선"),
          h("div", { className: "summary-help", style: { marginBottom: "8px" } }, "돌파 이벤트 이후 D+1, 3, 5, 10, 20, 40, 60 거래일 평균 수익률입니다."),
          h(BacktestEventCurveChart, { series: forwardCurves })
        ),
        h(
          "div",
          { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
          h("div", { className: "subsection-title" }, "유형별 클러스터 비교"),
          h(DataTable, {
            rows: clusterRows,
            compact: true,
            emptyMessage: "클러스터 비교 데이터가 없습니다.",
            columns: [
              { key: "cluster", label: "클러스터", render: function (row) { return row.cluster || "-"; } },
              { key: "event_count", label: "건수", render: function (row) { return numberFormat(row.event_count, 0) + "건"; } },
              { key: "avg_return_pct", label: "평균 수익률", render: function (row) { return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2)); } },
              { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
              { key: "avg_peak_return_pct", label: "평균 최대 상승", render: function (row) { return row.avg_peak_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_peak_return_pct) }, formatPercent(row.avg_peak_return_pct, 2)); } },
              { key: "whipsaw_rate_pct", label: "휩소 비율", render: function (row) { return row.whipsaw_rate_pct == null ? "-" : formatPercent(row.whipsaw_rate_pct, 1); } },
            ],
          })
        )
      );
    }

    async function deleteLeaderSnapshot(snapshotId) {
      const targetId = Number(snapshotId || 0);
      if (!(targetId > 0)) {
        return;
      }
      if (!window.confirm("저장된 백테스트를 삭제할까요?")) {
        return;
      }
      try {
        await deleteJson("/api/strategy/snapshots/" + targetId);
        if (Number(activeLeaderSnapshotId || 0) === targetId) {
          setActiveLeaderSnapshot(null);
          setActiveLeaderSnapshotId(0);
        }
        if (String(compareLeftSnapshotId || "") === String(targetId)) {
          setCompareLeftSnapshotId("");
          setCompareLeftSnapshot(null);
        }
        if (String(compareRightSnapshotId || "") === String(targetId)) {
          setCompareRightSnapshotId("");
          setCompareRightSnapshot(null);
        }
        setLeaderSnapshotMessage("삭제 완료");
        await leaderSnapshotRequest.refresh(true);
      } catch (error) {
        setLeaderSnapshotMessage(error.message || String(error));
      }
    }

    useEffect(function () {
      if (!savedLeaderSnapshots.length) {
        return;
      }
      if (!compareLeftSnapshotId) {
        setCompareLeftSnapshotId(String(savedLeaderSnapshots[0].id || ""));
      }
      if (!compareRightSnapshotId && savedLeaderSnapshots.length > 1) {
        setCompareRightSnapshotId(String(savedLeaderSnapshots[1].id || ""));
      }
    }, [savedLeaderSnapshots, compareLeftSnapshotId, compareRightSnapshotId]);

    useEffect(function () {
      let cancelled = false;
      const targetId = Number(compareLeftSnapshotId || 0);
      if (!(targetId > 0)) {
        setCompareLeftSnapshot(null);
        return function () { cancelled = true; };
      }
      fetchJson("/api/strategy/snapshots/" + targetId, { forceRefresh: true, noCache: true })
        .then(function (payload) {
          if (!cancelled) {
            setCompareLeftSnapshot(payload && payload.snapshot ? payload.snapshot : null);
          }
        })
        .catch(function () {
          if (!cancelled) {
            setCompareLeftSnapshot(null);
          }
        });
      return function () { cancelled = true; };
    }, [compareLeftSnapshotId]);

    useEffect(function () {
      let cancelled = false;
      const targetId = Number(compareRightSnapshotId || 0);
      if (!(targetId > 0)) {
        setCompareRightSnapshot(null);
        return function () { cancelled = true; };
      }
      fetchJson("/api/strategy/snapshots/" + targetId, { forceRefresh: true, noCache: true })
        .then(function (payload) {
          if (!cancelled) {
            setCompareRightSnapshot(payload && payload.snapshot ? payload.snapshot : null);
          }
        })
        .catch(function () {
          if (!cancelled) {
            setCompareRightSnapshot(null);
          }
      });
      return function () { cancelled = true; };
    }, [compareRightSnapshotId]);

    useEffect(function () {
      const options = buildLeaderCompareStockOptions(compareLeftSnapshot, compareRightSnapshot);
      if (!options.length) {
        if (compareStockKey) {
          setCompareStockKey("");
        }
        return;
      }
      const exists = options.some(function (item) { return String(item.key) === String(compareStockKey || ""); });
      if (!exists) {
        setCompareStockKey(String(options[0].key || ""));
      }
    }, [compareLeftSnapshot, compareRightSnapshot, compareStockKey]);

    function applySectorBacktest() {
      setSectorBacktestStarted(true);
      setSelectedSectorDate("");
      setSectorQueryState({
        start: sectorStartDate,
        end: sectorEndDate,
        min_score: sectorMinScore,
        top_sectors: sectorTopCount,
        stocks_per_sector: sectorStocksCount,
        leverage: sectorLeverage,
        weight_method: sectorWeightMethod,
      });
    }

    function applyAdvancedBacktest() {
      setAdvancedBacktestStarted(true);
      setSelectedAdvancedDate("");
      setAdvancedQueryState({
        start: advancedStartDate,
        end: advancedEndDate,
        min_score: advancedMinScore,
        top_sectors: advancedTopSectors,
        stocks_per_sector: advancedStocksCount,
        max_leverage: advancedMaxLeverage,
        benchmark: advancedBenchmark,
        weight_method: advancedWeightMethod,
        beta_window: advancedBetaWindow,
        min_breadth: advancedMinBreadth,
        max_disparity: advancedMaxDisparity,
        trading_rank_limit: advancedTradingRankLimit,
        stock_selection: advancedStockSelection,
      });
    }

    function renderModeButton(mode, label) {
      return h(
        "button",
        {
          type: "button",
          className: "strategy-mode-button" + (strategyMode === mode ? " active" : ""),
          onClick: function () { switchStrategyMode(mode); },
        },
        label
      );
    }

    function formatWon(value) {
      return numberFormat(Number(value || 0), 0) + "원";
    }

    function closeStrategyTradeChart() {
      setStrategyTradeChartPopup({ open: false, trade: null, loading: false, error: "", data: null, scoreLoading: false, scoreError: "", scoreData: null });
    }

    function strategyTradeMarkers(trade) {
      const markers = [];
      if (trade && trade.entry_date) {
        markers.push({
          date: trade.entry_date,
          type: "buy",
          label: "매수",
          price: trade.entry_price,
        });
      }
      if (trade && trade.exit_date) {
        markers.push({
          date: trade.exit_date,
          type: "sell",
          label: "매도",
          price: trade.exit_price,
          return_pct: trade.trade_return_pct,
        });
      } else if (trade && trade.apply_date && (trade.action === "매수" || trade.action === "증액")) {
        markers.push({
          date: trade.apply_date,
          type: "buy",
          label: trade.action,
        });
      }
      return markers;
    }

    function addDaysToIsoDate(value, days) {
      if (!value) return "";
      const text = String(value).slice(0, 10);
      const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return "";
      const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (Number.isNaN(dt.getTime())) return "";
      dt.setDate(dt.getDate() + Number(days || 0));
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    }

    function openStrategyTradeChart(trade) {
      const row = trade || {};
      const rawCode = String(row.stock_code || "").trim();
      const normalizedDigits = rawCode.replace(/\D/g, "");
      const normalizedSymbol = rawCode.toUpperCase();
      const isGlobalSymbol = !!normalizedSymbol && /[A-Z]/.test(normalizedSymbol) && !normalizedDigits;
      const code = normalizedDigits ? normalizedDigits.padStart(6, "0") : "";
      const name = row.stock_name || row.resolved_name || row.stock_key || normalizedSymbol || "";
      if (isGlobalSymbol) {
        openStockInGlobalCompany({
          stock_code: normalizedSymbol,
          stock_name: name,
        });
        return;
      }
      if (!code || code === "000000") {
        return;
      }
      setStrategyTradeChartPopup({ open: true, trade: row, loading: true, error: "", data: null, scoreLoading: true, scoreError: "", scoreData: null });
      const params = new URLSearchParams();
      params.set("code", code);
      params.set("name", name);
      const focusStartDate = row.entry_date || row.buy_date || row.apply_date || row.date || "";
      const focusEndDate = row.exit_date || row.sell_date || row.date || row.apply_date || focusStartDate;
      const chartStartDate = addDaysToIsoDate(focusStartDate, -14);
      const chartEndDate = addDaysToIsoDate(focusEndDate, 14);
      if (chartStartDate && chartEndDate) {
        params.set("start_date", chartStartDate);
        params.set("end_date", chartEndDate);
      } else {
        params.set("months", "3");
      }
      fetchJson("/api/stocks/chart-preview?" + params.toString())
        .then(function (payload) {
          const tradeMarkers = strategyTradeMarkers(row);
          setStrategyTradeChartPopup({
            open: true,
            trade: row,
            loading: false,
            error: "",
            data: Object.assign({}, payload, {
              entry_markers: ensureArray(payload.entry_markers).concat(tradeMarkers),
            }),
            scoreLoading: true,
            scoreError: "",
            scoreData: null,
          });
        })
        .catch(function (error) {
          setStrategyTradeChartPopup({
            open: true,
            trade: row,
            loading: false,
            error: error.message || String(error),
            data: null,
            scoreLoading: true,
            scoreError: "",
            scoreData: null,
          });
        });

      const scoreParams = new URLSearchParams();
      scoreParams.set("days", "62");
      if (code && code !== "000000") scoreParams.set("stock_code", code);
      if (name) scoreParams.set("stock_name", name);
      if (row.date) scoreParams.set("end_date", row.date);
      fetchJson("/api/themes/score-history?" + scoreParams.toString(), { noCache: true })
        .then(function (payload) {
          setStrategyTradeChartPopup(function (current) {
            if (!current.open) return current;
            return Object.assign({}, current, { scoreLoading: false, scoreError: "", scoreData: payload });
          });
        })
        .catch(function (error) {
          setStrategyTradeChartPopup(function (current) {
            if (!current.open) return current;
            return Object.assign({}, current, { scoreLoading: false, scoreError: error.message || String(error), scoreData: null });
          });
        });
    }

    function renderStrategyTradeChartPopup() {
      if (!strategyTradeChartPopup.open) {
        return null;
      }
      const trade = strategyTradeChartPopup.trade || {};
      const label = trade.stock_name || trade.resolved_name || trade.stock_key || "종목";
      const code = String(trade.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      return h(
        "div",
        { className: "modal-backdrop theme-stock-chart-backdrop", onClick: closeStrategyTradeChart },
        h(
          "div",
          {
            className: "modal-panel theme-stock-chart-modal strategy-trade-chart-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Trade Review"),
              h("h2", null, label + (code && code !== "000000" ? " (" + code + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeStrategyTradeChart }, "닫기")
          ),
          h(
            "div",
            { className: "strategy-trade-chart-summary" },
            h("span", null, "편입 " + (trade.entry_date || trade.apply_date || "-")),
            h("span", null, "편출 " + (trade.exit_date || "-")),
            h("strong", { className: pnlClass(trade.trade_return_pct) }, "수익률 " + (trade.trade_return_pct == null ? "-" : formatPercent(trade.trade_return_pct, 2))),
            trade.holding_days != null ? h("span", null, "보유 " + numberFormat(trade.holding_days, 0) + "일") : null
          ),
          h(StockChartPreview, {
            label: label,
            loading: strategyTradeChartPopup.loading,
            error: strategyTradeChartPopup.error,
            data: strategyTradeChartPopup.data,
          }),
          h(
            "div",
            { className: "mini-table-panel", style: { marginTop: "10px" } },
            h("div", { className: "subsection-title" }, "점수/주가 추이 (2개월)"),
            strategyTradeChartPopup.scoreLoading
              ? h(LoadingBlock, { compact: true, label: "\uc810\uc218 \ucd94\uc774 \ubd88\ub7ec\uc624\ub294 \uc911" })
              : strategyTradeChartPopup.scoreError
                ? h("div", { className: "summary-help danger-text" }, strategyTradeChartPopup.scoreError)
                : (strategyTradeChartPopup.scoreData && ensureArray(strategyTradeChartPopup.scoreData.rows).length
                  ? h(ScoreHistoryChart, {
                      rows: strategyTradeChartPopup.scoreData.rows,
                      markers: ensureArray(trade.markers),
                    })
                  : h(EmptyState, { compact: true, message: "\uc810\uc218 \ucd94\uc774 \ub370\uc774\ud130\uac00 \uc5c6\uc2b5\ub2c8\ub2e4." }))
          )
        )
      );
    }

    function renderDiagnosticResult() {
      const diagnosis = diagnosticData.diagnosis || {};
      const scenarios = ensureArray(diagnosticData.scenarios);
      const tailSummary = diagnosis.tail_summary || {};
      const worstStocks = ensureArray(diagnosis.worst_stocks);
      const topContributors = ensureArray(diagnosis.top_contributors);
      const sectorContribution = ensureArray(diagnosis.sector_contribution);
      const feedback = ensureArray(diagnosis.feedback);
      const tailRule = diagnosis.tail_rule || {};
      const tailRuleExamples = ensureArray(tailRule.examples);
      const tailRuleRules = ensureArray(tailRule.rules);
      const tailRuleModeCounts = ensureArray(tailRule.mode_counts);
      return diagnosticRequest.error
        ? h(ErrorPanel, { message: diagnosticRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel portfolio-diagnostic-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, diagnosticData.strategy_name || "현재 방식 진단"),
                h("div", { className: "summary-help" }, diagnosticData.description || "실제 포트폴리오 수익을 기준으로 개선 시나리오를 비교합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (diagnosticData.start_date || "-") + " ~ " + (diagnosticData.end_date || "-"))
            ),
            diagnosticRequest.loading && !diagnosticRows.length
              ? h(LoadingPanel, { label: diagnosticRequest.label })
              : diagnosticRows.length
                ? h(React.Fragment, null,
                    h(
                      "div",
                      { className: "summary-grid-small strategy-summary-grid sector-rotation-summary-grid" },
                      h(SummaryCard, { label: "현재 수익률", value: formatPercent(diagnosticSummary.total_return_pct, 2), help: "포트폴리오 수익 페이지 기준" }),
                      h(SummaryCard, { label: "꼬리 손실 기여", value: formatPercent(diagnosticSummary.tail_loss_contribution_pct_points, 2), help: "음의 기여 종목 합계" }),
                      h(SummaryCard, { label: "꼬리 종목 수", value: numberFormat(diagnosticSummary.tail_stock_count, 0) + "개", help: "손실 또는 음의 기여도 종목" }),
                      h(SummaryCard, { label: "실전 꼬리룰 비중", value: formatPercent(diagnosticSummary.avg_rule_tail_weight_pct, 1), help: "당시 조건으로 판별한 일별 꼬리 비중" }),
                      h(SummaryCard, { label: "시장 OFF 일수", value: numberFormat(diagnosis.market_off_days, 0) + "일", help: "양 지수 20일선 아래" }),
                      h(SummaryCard, { label: "섹터 신호 일수", value: numberFormat(diagnosis.sector_gate_days, 0) + "일", help: "강한 섹터 신호가 켜진 날" })
                    ),
                    h(PortfolioDiagnosticChart, { rows: diagnosticRows }),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                      h(
                        "div",
                        { className: "strategy-feedback-list" },
                        tailRuleRules.length
                          ? tailRuleRules.map(function (text, index) {
                              return h("div", { key: index, className: "strategy-feedback-item" }, text);
                            })
                          : h("div", { className: "summary-help" }, "꼬리 판별 규칙이 없습니다.")
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "꼬리룰 판별 모드"),
                      h(DataTable, {
                        rows: tailRuleModeCounts,
                        emptyMessage: "섹터 기여도 데이터가 없습니다.",
                        columns: [
                          { key: "mode", label: "모드" },
                          { key: "count", label: "건수", render: function (row) { return numberFormat(row.count, 0) + "건"; } },
                        ],
                      })
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "개선 시나리오 표"),
                        h(DataTable, {
                          rows: scenarios,
                          emptyMessage: "비교 시나리오가 없습니다.",
                          columns: [
                            { key: "name", label: "전략" },
                            { key: "total_return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2)); } },
                            { key: "excess_vs_actual_pct", label: "현재 대비", render: function (row) { return h("span", { className: pnlClass(row.excess_vs_actual_pct) }, formatPercent(row.excess_vs_actual_pct, 2)); } },
                            { key: "mdd_pct", label: "MDD", render: function (row) { return formatPercent(row.mdd_pct, 2); } },
                            { key: "cagr_pct", label: "CAGR", render: function (row) { return row.cagr_pct == null ? "-" : formatPercent(row.cagr_pct, 2); } },
                            { key: "description", label: "의미" },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "전략 피드백"),
                        h(
                          "div",
                          { className: "strategy-feedback-list" },
                          feedback.length
                            ? feedback.map(function (text, index) {
                                return h("div", { key: index, className: "strategy-feedback-item" }, text);
                              })
                            : h("div", { className: "summary-help" }, "피드백 데이터가 없습니다." )
                        )
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "꼬리 규칙 예시"),
                      h(DataTable, {
                        rows: tailRuleExamples,
                        emptyMessage: "실전 꼬리룰에 걸린 종목이 없습니다.",
                        columns: [
                          { key: "date", label: "일자" },
                          { key: "sector", label: "섹터" },
                          { key: "stock_name", label: "종목", render: function (row) { return row.stock_name || row.stock_code || "-"; } },
                          { key: "rule_mode", label: "모드", render: function (row) { return row.rule_mode || "-"; } },
                          { key: "position_state", label: "상태", render: function (row) {
                            const labelMap = { "new": "신규", "increase": "증액", "decrease": "감액", "held": "보유" };
                            return labelMap[row.position_state] || row.position_state || "-";
                          } },
                          { key: "score", label: "점수", render: function (row) { return row.score == null ? "-" : numberFormat(row.score, 1); } },
                          { key: "disparity", label: "이격", render: function (row) { return row.disparity == null ? "-" : formatPercent(row.disparity, 1); } },
                          { key: "prior_contribution_pct_points", label: "누적기여", render: function (row) { return h("span", { className: pnlClass(row.prior_contribution_pct_points) }, formatPercent(row.prior_contribution_pct_points, 2)); } },
                          { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          { key: "reason", label: "적용 근거" },
                        ],
                      })
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "꼬리 손실 후보"),
                        h(DataTable, {
                          rows: worstStocks,
                          emptyMessage: "꼬리 후보가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "resolved_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || row.stock_code || "-"; } },
                            { key: "total_pnl", label: "총손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatWon(row.total_pnl)); } },
                            { key: "total_return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2)); } },
                            { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "수익 기여 종목"),
                        h(DataTable, {
                          rows: topContributors,
                          emptyMessage: "기여 종목이 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "resolved_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || row.stock_code || "-"; } },
                            { key: "total_pnl", label: "총손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatWon(row.total_pnl)); } },
                            { key: "total_return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2)); } },
                            { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          ],
                        })
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                      h(DataTable, {
                        rows: sectorContribution,
                        emptyMessage: "섹터 기여도 데이터가 없습니다.",
                        columns: [
                          { key: "sector", label: "섹터" },
                          { key: "stock_count", label: "종목", render: function (row) { return numberFormat(row.stock_count, 0); } },
                          { key: "total_pnl", label: "총손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatWon(row.total_pnl)); } },
                          { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          { key: "winners", label: "승/패", render: function (row) { return numberFormat(row.winners, 0) + " / " + numberFormat(row.losers, 0); } },
                        ],
                      })
                    )
                  )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
          );
    }

    function renderIndexControls() {
      return h(
        "div",
        { className: "strategy-control-grid" },
        h("label", null,
          h("span", null, "비교지수"),
          h("select", {
            className: "select-input",
            value: indexKey,
            onChange: function (event) { setIndexKey(event.target.value); },
          }, availableIndexes.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "전략"),
          h("select", {
            className: "select-input",
            value: strategyKey,
            onChange: function (event) { setStrategyKey(event.target.value); },
          }, availableStrategies.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "기간 시작"),
          h("input", {
            className: "text-input",
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "기간 마감"),
          h("input", {
            className: "text-input",
            type: "date",
            value: endDate,
            onChange: function (event) { setEndDate(event.target.value); },
          })
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: applyBacktest,
            disabled: indexRequest.loading,
          },
          indexRequest.loading ? "계산 중" : "백테스트 실행"
        )
      );
    }

    function renderLeaderControls(marketMode) {
      var isUsLeaderMode = marketMode === "us";
      function renderLeaderConditionTitle(label, checked, onChange) {
        return h(
          "span",
          { className: "strategy-condition-title" },
          h("input", {
            type: "checkbox",
            checked: !!checked,
            onChange: function (event) { onChange(event.target.checked); },
          }),
          " " + label
        );
      }
      return h(
        "div",
        { className: "strategy-control-grid" },
        h("label", null,
          renderLeaderConditionTitle("편입 TopN", leaderUseEntryTopN, setLeaderUseEntryTopN),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderTopN,
            disabled: !leaderUseEntryTopN,
            onChange: function (event) { setLeaderTopN(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("편출 TopN", leaderUseExitTopN, setLeaderUseExitTopN),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderExitTopN,
            disabled: !leaderUseExitTopN,
            onChange: function (event) { setLeaderExitTopN(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("편입기준", leaderUseEntryThreshold, setLeaderUseEntryThreshold),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderEntryThreshold,
            disabled: !leaderUseEntryThreshold,
            onChange: function (event) { setLeaderEntryThreshold(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("편출기준", leaderUseExitThreshold, setLeaderUseExitThreshold),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderExitThreshold,
            disabled: !leaderUseExitThreshold,
            onChange: function (event) { setLeaderExitThreshold(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("로스컷", leaderUseStopLoss, setLeaderUseStopLoss),
          h("select", {
            className: "select-input",
            value: leaderStopLossMode,
            disabled: !leaderUseStopLoss,
            onChange: function (event) { setLeaderStopLossMode(event.target.value); },
          },
            h("option", { value: "pct" }, "평가손실 %"),
            h("option", { value: "atr" }, "ATR")
          ),
          leaderStopLossMode === "pct"
            ? h("input", {
                className: "text-input",
                type: "number",
                min: "0",
                step: "0.1",
                value: leaderStopLossPct,
                disabled: !leaderUseStopLoss,
                onChange: function (event) { setLeaderStopLossPct(event.target.value); },
              })
            : h(React.Fragment, null,
                h("input", {
                  className: "text-input",
                  type: "number",
                  min: "0",
                  step: "0.1",
                  value: leaderStopLossPct,
                  disabled: !leaderUseStopLoss,
                  onChange: function (event) { setLeaderStopLossPct(event.target.value); },
                }),
                h("div", { className: "summary-help" }, "매수가 대비 입력한 ATR 배수만큼 역행 시 강제 매도")
              )
        ),
        h("label", null,
          h("span", null, "추세 이탈 매도"),
          h("div", { className: "toggle-group", style: { gap: "12px", alignItems: "center" } },
            h("label", { className: "telegram-all-room-toggle", style: { padding: 0, border: "none", background: "transparent" } },
              h("input", {
                type: "checkbox",
                checked: !!leaderExitMa20Break,
                onChange: function (event) { setLeaderExitMa20Break(event.target.checked); },
              }),
              h("em", null, "20일선")
            ),
            h("label", { className: "telegram-all-room-toggle", style: { padding: 0, border: "none", background: "transparent" } },
              h("input", {
                type: "checkbox",
                checked: !!leaderExitMa60Break,
                onChange: function (event) { setLeaderExitMa60Break(event.target.checked); },
              }),
              h("em", null, "60일선")
            )
          )
        ),
        h("label", null,
          renderLeaderConditionTitle("매수연속일", leaderUseEntryStreak, setLeaderUseEntryStreak),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderEntryStreakDays,
            disabled: !leaderUseEntryStreak,
            onChange: function (event) { setLeaderEntryStreakDays(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("급등 제외 기준일", leaderUseRunupFilter, setLeaderUseRunupFilter),
          h("input", {
            className: "text-input",
            type: "number",
            min: "0",
            step: "1",
            value: leaderRunupLookbackDays,
            disabled: !leaderUseRunupFilter,
            onChange: function (event) { setLeaderRunupLookbackDays(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("급등 제외 상승률", leaderUseRunupFilter, setLeaderUseRunupFilter),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderRunupExcludePct,
            disabled: !leaderUseRunupFilter,
            onChange: function (event) { setLeaderRunupExcludePct(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("최소 시총(억)", leaderUseMinMarketCapFilter, setLeaderUseMinMarketCapFilter),
          h("input", {
            className: "text-input",
            type: "number",
            min: "0",
            step: "1",
            value: leaderMinMarketCap100m,
            disabled: !leaderUseMinMarketCapFilter,
            onChange: function (event) { setLeaderMinMarketCap100m(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("최대 ATR(%)", leaderUseAtrFilter, setLeaderUseAtrFilter),
          h("input", {
            className: "text-input",
            type: "number",
            min: "0",
            step: "0.1",
            value: leaderMaxAtr20,
            disabled: !leaderUseAtrFilter,
            onChange: function (event) { setLeaderMaxAtr20(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("신고가 매수", String(leaderEntryHighFilter || "none") !== "none", function (nextEnabled) {
            setLeaderEntryHighFilter(nextEnabled ? "52w" : "none");
          }),
          h("select", {
            className: "select-input",
            value: leaderEntryHighFilter,
            disabled: String(leaderEntryHighFilter || "none") === "none",
            onChange: function (event) { setLeaderEntryHighFilter(event.target.value || "52w"); },
          },
            h("option", { value: "20d" }, "20일 신고가 매수"),
            h("option", { value: "60d" }, "60일 신고가 매수"),
            h("option", { value: "52w" }, "52주 신고가 매수")
          ),
          h("div", { className: "summary-help" }, "진입 시점 신고가 조건을 만족한 종목만 신규 편입")
        ),
        h("label", null,
          h("span", null, "편입 비중"),
          h("select", {
            className: "select-input",
            value: leaderAllocationMode,
            onChange: function (event) { setLeaderAllocationMode(event.target.value); },
          },
            h("option", { value: "score_weight" }, "\uc810\uc218 \ube44\uc911\ub300\ub85c"),
            h("option", { value: "fixed_20" }, "\uc885\ubaa9\ub2f9 20%"),
            h("option", { value: "vol_inverse" }, "\ubcc0\ub3d9\uc131 \uc5ed\uac00\uc911")
          )
        ),
        isUsLeaderMode ? h("label", null,
          h("span", null, "비교 지수"),
          h("select", {
            className: "select-input",
            value: leaderUsBenchmark,
            onChange: function (event) { setLeaderUsBenchmark(event.target.value || "US500"); },
          },
            h("option", { value: "US500" }, "S&P 500"),
            h("option", { value: "NDX100" }, "NASDAQ 100")
          )
        ) : null,
        h("label", null,
          h("span", null, "기간 시작"),
          h("input", {
            className: "text-input",
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "기간 마감"),
          h("input", {
            className: "text-input",
            type: "date",
            value: endDate,
            onChange: function (event) { setEndDate(event.target.value); },
          })
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: function () { applyLeaderBacktest(isUsLeaderMode ? "us" : "kr"); },
            disabled: indexRequest.loading,
          },
          indexRequest.loading ? "계산 중" : "백테스트 실행"
        )
      );
    }

    function renderLeaderResult() {
      var expectedLeaderMarket = strategyMode === "us_leader" ? "us" : "kr";
      var liveDataMatchesMarket = !data.market || String(data.market) === expectedLeaderMarket;
      var leaderSnapshotPayload = (strategyMode === "leader_top10" && activeLeaderSnapshot && activeLeaderSnapshot.payload)
        ? activeLeaderSnapshot.payload
        : (liveDataMatchesMarket ? data : {});
      var leaderRows = ensureArray(leaderSnapshotPayload && leaderSnapshotPayload.rows);
      var leaderSummary = (leaderSnapshotPayload && leaderSnapshotPayload.summary) || {};
      var leaderMarketMode = String(
        (strategyMode === "leader_top10" && activeLeaderSnapshot && activeLeaderSnapshot.query && activeLeaderSnapshot.query.market)
        || queryState.market
        || (strategyMode === "us_leader" ? "us" : "kr")
      );
      var leaderTitleText = leaderMarketMode === "us" ? "미국 주도주 전략" : "국내 주도주 전략";
      var benchmarkLabel = String((leaderSnapshotPayload && leaderSnapshotPayload.index_name) || (leaderMarketMode === "us"
        ? (String(queryState.index || leaderUsBenchmark) === "NDX100" ? "NASDAQ 100" : "S&P 500")
        : "KOSPI"));
      function leaderPriceText(value) {
        if (value == null || !Number.isFinite(Number(value))) return "-";
        return leaderMarketMode === "us"
          ? "$" + numberFormat(value, 2)
          : numberFormat(value, 0) + "원";
      }
      var leaderAllocationModeValue = queryState.allocation_mode || leaderAllocationMode || "score_weight";
      var leaderAllocationLabel = leaderAllocationModeValue === "fixed_20"
        ? "\uc885\ubaa9\ub2f9 20%"
        : (leaderAllocationModeValue === "vol_inverse" ? "\ubcc0\ub3d9\uc131 \uc5ed\uac00\uc911" : "\uc810\uc218 \ube44\uc911\ub300\ub85c");
      var leaderUseEntryTopNLabel = !!(queryState.use_entry_top_n != null ? queryState.use_entry_top_n : leaderUseEntryTopN);
      var leaderUseExitTopNLabel = !!(queryState.use_exit_top_n != null ? queryState.use_exit_top_n : leaderUseExitTopN);
      var leaderUseEntryThresholdLabel = !!(queryState.use_entry_threshold != null ? queryState.use_entry_threshold : leaderUseEntryThreshold);
      var leaderUseExitThresholdLabel = !!(queryState.use_exit_threshold != null ? queryState.use_exit_threshold : leaderUseExitThreshold);
      var leaderUseStopLossLabel = !!(queryState.use_stop_loss != null ? queryState.use_stop_loss : leaderUseStopLoss);
      var leaderStopLossModeLabel = String(queryState.stop_loss_mode || leaderStopLossMode || "pct");
      var leaderStopLossLabel = Number(queryState.stop_loss_pct != null ? queryState.stop_loss_pct : leaderStopLossPct || 0);
      var leaderExitMa20BreakLabel = !!(queryState.exit_ma20_break != null ? queryState.exit_ma20_break : leaderExitMa20Break);
      var leaderExitMa60BreakLabel = !!(queryState.exit_ma60_break != null ? queryState.exit_ma60_break : leaderExitMa60Break);
      var leaderUseEntryStreakLabel = !!(queryState.use_entry_streak != null ? queryState.use_entry_streak : leaderUseEntryStreak);
      var leaderUseRunupFilterLabel = !!(queryState.use_runup_filter != null ? queryState.use_runup_filter : leaderUseRunupFilter);
      var leaderRunupLookbackLabel = Number(queryState.runup_lookback_days != null ? queryState.runup_lookback_days : leaderRunupLookbackDays || 0);
      var leaderRunupExcludeLabel = Number(queryState.runup_exclude_pct != null ? queryState.runup_exclude_pct : leaderRunupExcludePct || 0);
      var leaderUseMinMarketCapFilterLabel = !!(queryState.use_min_market_cap_filter != null ? queryState.use_min_market_cap_filter : leaderUseMinMarketCapFilter);
      var leaderMinMarketCapLabel = Number(queryState.min_market_cap_100m != null ? queryState.min_market_cap_100m : leaderMinMarketCap100m || 0);
      var leaderUseAtrFilterLabel = !!(queryState.use_atr_filter != null ? queryState.use_atr_filter : leaderUseAtrFilter);
      var leaderMaxAtr20Label = Number(queryState.max_atr_20 != null ? queryState.max_atr_20 : leaderMaxAtr20 || 0);
      var leaderEntryHighFilterLabel = String(queryState.entry_high_filter || leaderEntryHighFilter || "none");
      var leaderEntryHighFilterText = "";
      if (leaderEntryHighFilterLabel === "20d") {
        leaderEntryHighFilterText = "20일 신고가만 매수";
      } else if (leaderEntryHighFilterLabel === "60d") {
        leaderEntryHighFilterText = "60일 신고가만 매수";
      } else if (leaderEntryHighFilterLabel === "52w") {
        leaderEntryHighFilterText = "52주 신고가만 매수";
      }
      var selectedLeaderLabel = leaderTitleText
        + (leaderUseEntryTopNLabel ? " / \uc9c4\uc785Top" + numberFormat(Number(queryState.top_n || leaderTopN || 100), 0) : " / \uc9c4\uc785TopN \ud574\uc81c")
        + (leaderUseExitTopNLabel ? " / \uc720\uc9c0Top" + numberFormat(Number(queryState.exit_top_n || leaderExitTopN || queryState.top_n || leaderTopN || 100), 0) : " / \ud3b8\ucd9cTopN \ud574\uc81c")
        + (leaderUseEntryThresholdLabel ? " / \ub9e4\uc218 " + numberFormat(Number(queryState.entry_threshold != null ? queryState.entry_threshold : leaderEntryThreshold), 1) : "")
        + (leaderUseExitThresholdLabel ? " / \ub9e4\ub3c4 " + numberFormat(Number(queryState.exit_threshold != null ? queryState.exit_threshold : leaderExitThreshold), 1) : "")
        + (leaderUseStopLossLabel ? (leaderStopLossModeLabel === "atr" ? " / " + numberFormat(leaderStopLossLabel, 1) + "ATR \ub85c\uc2a4\ucef7" : " / \ub85c\uc2a4\ucef7 " + numberFormat(leaderStopLossLabel, 1) + "%") : "")
        + (leaderExitMa20BreakLabel ? " / 20\uc77c\uc120 \uc774\ud0c8" : "")
        + (leaderExitMa60BreakLabel ? " / 60\uc77c\uc120 \uc774\ud0c8" : "")
        + (leaderUseEntryStreakLabel ? " / \ub9e4\uc218 " + numberFormat(Number(queryState.entry_streak_days != null ? queryState.entry_streak_days : leaderEntryStreakDays || 1), 0) + "\uc77c \uc5f0\uc18d" : "")
        + (leaderUseRunupFilterLabel && leaderRunupLookbackLabel > 0 ? " / " + numberFormat(leaderRunupLookbackLabel, 0) + "\uc77c " + numberFormat(leaderRunupExcludeLabel, 1) + "% \uae09\ub4f1 \uc81c\uc678" : "")
        + (leaderUseMinMarketCapFilterLabel && leaderMinMarketCapLabel > 0 ? " / \uc2dc\ucd1d " + numberFormat(leaderMinMarketCapLabel, 0) + "\uc5b5+" : "")
        + (leaderUseAtrFilterLabel && leaderMaxAtr20Label > 0 ? " / ATR " + numberFormat(leaderMaxAtr20Label, 1) + "% 이하" : "")
        + (leaderEntryHighFilterText ? " / " + leaderEntryHighFilterText : "")
        + " / " + leaderAllocationLabel;
      var holdingsTimelineRows = leaderRows
        .map(function (row) {
          var holdingsAll = ensureArray(row.holdings)
            .filter(function (item) { return Number(item && item.weight_pct) > 0; })
            .sort(function (a, b) { return Number(b.weight_pct || 0) - Number(a.weight_pct || 0); });
          var holdings = holdingsAll.slice(0, 5);
          var text = holdings.map(function (item) {
              var name = item.stock_name || item.stock_key || "-";
              return name + " " + formatPercent(item.weight_pct, 1);
          }).join(", ");
          var allText = holdingsAll.map(function (item) {
            var name = item.stock_name || item.stock_key || "-";
            return name + " " + formatPercent(item.weight_pct, 1);
          }).join(", ");
          var entryExit = row.entry_exit || {};
          var buys = ensureArray(entryExit.buy).join(", ");
          var sells = ensureArray(entryExit.sell).join(", ");
          var sectors = ensureArray(row.sector_weights).map(function (item) {
            return (item.sector || "-") + " " + formatPercent(item.weight_pct, 1);
          }).join(", ");
          return {
            date: row.date,
            holdings_count: Number(row.holdings_count || holdingsAll.length || 0),
            all_holdings: allText || "-",
            top5_holdings: text || "-",
            entry_exit: (buys ? "\ud3b8\uc785: " + buys : "") + ((buys && sells) ? " | " : "") + (sells ? "\ud3b8\ucd9c: " + sells : "") || "-",
            sector_weight_sum: sectors || "-",
          };
        });
      var tradeEventRows = [];
      leaderRows.forEach(function (row) {
        ensureArray(row.entry_exit && row.entry_exit.buy_details).forEach(function (detail) {
          tradeEventRows.push({
            date: row.date,
            signal_date: detail.signal_date || row.signal_date || "",
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            action: "\ub9e4\uc218",
            buy_reason: detail.reason || "",
            reason: "",
            buy_avg_price: detail.buy_price,
            buy_date: detail.buy_date || row.date,
            sell_avg_price: null,
            sell_date: null,
            sell_return_pct: null,
            markers: [{ date: row.date, type: "buy", label: "\ub9e4\uc218" }],
          });
        });
        ensureArray(row.entry_exit && row.entry_exit.sell_details).forEach(function (detail) {
          tradeEventRows.push({
            date: row.date,
            signal_date: detail.signal_date || row.signal_date || "",
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            action: "\ub9e4\ub3c4",
            buy_reason: detail.buy_reason || "",
            reason: detail.reason || "\uc810\uc218",
            buy_avg_price: detail.avg_buy_price,
            buy_date: detail.buy_date || "",
            sell_avg_price: detail.sell_price,
            sell_date: detail.sell_date || row.date,
            sell_return_pct: detail.sell_return_pct,
            markers: [{ date: row.date, type: "sell", label: "\ub9e4\ub3c4" }],
          });
        });
      });
      var stockMarkerMap = {};
      tradeEventRows.forEach(function (item) {
        var code = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var key = code || String(item.stock_name || "");
        if (!key) return;
        if (!stockMarkerMap[key]) stockMarkerMap[key] = [];
        stockMarkerMap[key] = stockMarkerMap[key].concat(ensureArray(item.markers));
      });
      var holdingDetailRows = tradeEventRows.map(function (item) {
        var code = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var key = code || String(item.stock_name || "");
        return Object.assign({}, item, { markers: ensureArray(stockMarkerMap[key]) });
      }).filter(function (item) {
        return String(item.action || "") === "매도";
      });
      var derivedSellRows = holdingDetailRows.slice();
      var topLossTradeRows = derivedSellRows
        .filter(function (item) { return Number.isFinite(Number(item.sell_return_pct)); })
        .slice()
        .sort(function (a, b) { return Number(a.sell_return_pct || 0) - Number(b.sell_return_pct || 0); })
        .slice(0, 12);
      var topProfitTradeRows = derivedSellRows
        .filter(function (item) { return Number.isFinite(Number(item.sell_return_pct)); })
        .slice()
        .sort(function (a, b) { return Number(b.sell_return_pct || 0) - Number(a.sell_return_pct || 0); })
        .slice(0, 12);
      var profitStockMap = {};
      derivedSellRows.forEach(function (item) {
        var rawCode = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var stockKey = rawCode || String(item.stock_name || "");
        if (!stockKey) return;
        var returnPct = Number(item.sell_return_pct);
        if (!Number.isFinite(returnPct)) return;
        if (!profitStockMap[stockKey]) {
          profitStockMap[stockKey] = {
            stock_key: stockKey,
            stock_code: rawCode || item.stock_code || "",
            stock_name: item.stock_name || item.stock_code || "-",
            trade_count: 0,
            winning_count: 0,
            losing_count: 0,
            total_return_pct: 0,
            avg_return_pct: 0,
            best_return_pct: null,
            worst_return_pct: null,
            latest_sell_date: "",
            latest_trade: item,
          };
        }
        var summaryRow = profitStockMap[stockKey];
        summaryRow.trade_count += 1;
        summaryRow.total_return_pct += returnPct;
        if (returnPct > 0) {
          summaryRow.winning_count += 1;
        } else if (returnPct < 0) {
          summaryRow.losing_count += 1;
        }
        if (summaryRow.best_return_pct == null || returnPct > summaryRow.best_return_pct) {
          summaryRow.best_return_pct = returnPct;
        }
        if (summaryRow.worst_return_pct == null || returnPct < summaryRow.worst_return_pct) {
          summaryRow.worst_return_pct = returnPct;
        }
        if (!summaryRow.latest_sell_date || String(item.sell_date || item.date || "") > summaryRow.latest_sell_date) {
          summaryRow.latest_sell_date = String(item.sell_date || item.date || "");
          summaryRow.latest_trade = item;
        }
      });
      var topProfitStockRows = Object.keys(profitStockMap).map(function (key) {
        var item = profitStockMap[key];
        var tradeCount = Number(item.trade_count || 0);
        return Object.assign({}, item, {
          avg_return_pct: tradeCount ? item.total_return_pct / tradeCount : null,
          win_rate_pct: tradeCount ? (Number(item.winning_count || 0) / tradeCount) * 100 : null,
        });
      }).sort(function (a, b) {
        var totalDiff = Number(b.total_return_pct || 0) - Number(a.total_return_pct || 0);
        if (Math.abs(totalDiff) > 0.000001) return totalDiff;
        var avgDiff = Number(b.avg_return_pct || 0) - Number(a.avg_return_pct || 0);
        if (Math.abs(avgDiff) > 0.000001) return avgDiff;
        return Number(b.trade_count || 0) - Number(a.trade_count || 0);
      }).slice(0, 12);
      var derivedSellCount = derivedSellRows.length;
      var derivedWinningSellCount = derivedSellRows.filter(function (item) {
        return Number(item.sell_return_pct) > 0;
      }).length;
      var derivedAverageSellReturnPct = derivedSellRows.length
        ? (derivedSellRows.reduce(function (sum, item) {
            var value = Number(item.sell_return_pct);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0) / derivedSellRows.length)
        : null;
      var effectiveSellCount = leaderSummary.sell_count != null && Number.isFinite(Number(leaderSummary.sell_count))
        ? Number(leaderSummary.sell_count)
        : derivedSellCount;
      var effectiveWinningSellCount = leaderSummary.winning_sell_count != null && Number.isFinite(Number(leaderSummary.winning_sell_count))
        ? Number(leaderSummary.winning_sell_count)
        : derivedWinningSellCount;
      var effectiveAverageSellReturnPct = leaderSummary.avg_sell_return_pct != null && Number.isFinite(Number(leaderSummary.avg_sell_return_pct))
        ? Number(leaderSummary.avg_sell_return_pct)
        : derivedAverageSellReturnPct;
      var derivedWinningSellRows = derivedSellRows.filter(function (item) {
        return Number(item.sell_return_pct) > 0;
      });
      var derivedLosingSellRows = derivedSellRows.filter(function (item) {
        return Number(item.sell_return_pct) < 0;
      });
      var derivedWinningAverageSellReturnPct = derivedWinningSellRows.length
        ? (derivedWinningSellRows.reduce(function (sum, item) {
            var value = Number(item.sell_return_pct);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0) / derivedWinningSellRows.length)
        : null;
      var derivedLosingAverageSellReturnPct = derivedLosingSellRows.length
        ? (derivedLosingSellRows.reduce(function (sum, item) {
            var value = Number(item.sell_return_pct);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0) / derivedLosingSellRows.length)
        : null;
      var effectiveWinRatePct = leaderSummary.win_rate_pct != null && Number.isFinite(Number(leaderSummary.win_rate_pct))
        ? Number(leaderSummary.win_rate_pct)
        : (derivedSellCount ? (derivedWinningSellCount / derivedSellCount) * 100 : null);
      var effectiveWinningAverageSellReturnPct = leaderSummary.avg_winning_sell_return_pct != null && Number.isFinite(Number(leaderSummary.avg_winning_sell_return_pct))
        ? Number(leaderSummary.avg_winning_sell_return_pct)
        : derivedWinningAverageSellReturnPct;
      var effectiveLosingAverageSellReturnPct = leaderSummary.avg_losing_sell_return_pct != null && Number.isFinite(Number(leaderSummary.avg_losing_sell_return_pct))
        ? Number(leaderSummary.avg_losing_sell_return_pct)
        : derivedLosingAverageSellReturnPct;
      var leaderDrawdownPeak = -Infinity;
      var leaderDrawdownMin = 0;
      var leaderDrawdownPeakDate = "";
      var leaderDrawdownTroughDate = "";
      leaderRows.forEach(function (row) {
        var value = Number(row && row.strategy_return_pct);
        if (!Number.isFinite(value)) {
          return;
        }
        if (value > leaderDrawdownPeak) {
          leaderDrawdownPeak = value;
          leaderDrawdownPeakDate = String(row.date || "");
        }
        var drawdown = value - leaderDrawdownPeak;
        if (drawdown < leaderDrawdownMin) {
          leaderDrawdownMin = drawdown;
          leaderDrawdownTroughDate = String(row.date || "");
        }
      });
      var mddContributionMap = {};
      leaderRows.forEach(function (row) {
        var rowDate = String(row && row.date || "");
        if (!rowDate || !leaderDrawdownPeakDate || !leaderDrawdownTroughDate) {
          return;
        }
        if (rowDate < leaderDrawdownPeakDate || rowDate > leaderDrawdownTroughDate) {
          return;
        }
        ensureArray(row.holdings_before_close).forEach(function (item) {
          if (!item || typeof item !== "object") {
            return;
          }
          var stockKey = String(item.stock_key || item.stock_code || item.stock_name || "").trim();
          if (!stockKey) {
            return;
          }
          var contribution = Number(item.daily_contribution_pct);
          if (!Number.isFinite(contribution)) {
            contribution = 0;
          }
          if (!mddContributionMap[stockKey]) {
            var matchedTrade = derivedSellRows.find(function (tradeRow) {
              var tradeCode = String(tradeRow.stock_code || "").trim();
              var itemCode = String(item.stock_code || "").trim();
              return (tradeCode && itemCode && tradeCode === itemCode) || String(tradeRow.stock_name || "") === String(item.stock_name || "");
            }) || null;
            mddContributionMap[stockKey] = {
              stock_key: stockKey,
              stock_code: item.stock_code || "",
              stock_name: item.stock_name || item.stock_code || stockKey,
              contribution_pct: 0,
              active_days: 0,
              trade_count: 0,
              latest_sell_date: "",
              trade: matchedTrade,
            };
          }
          mddContributionMap[stockKey].contribution_pct += contribution;
          mddContributionMap[stockKey].active_days += 1;
        });
      });
      derivedSellRows.forEach(function (tradeRow) {
        var stockKey = String(tradeRow.stock_code || tradeRow.stock_name || "").trim();
        if (!stockKey || !mddContributionMap[stockKey]) {
          return;
        }
        mddContributionMap[stockKey].trade_count += 1;
        var sellDate = String(tradeRow.sell_date || tradeRow.date || "");
        if (sellDate && (!mddContributionMap[stockKey].latest_sell_date || sellDate > mddContributionMap[stockKey].latest_sell_date)) {
          mddContributionMap[stockKey].latest_sell_date = sellDate;
          mddContributionMap[stockKey].trade = tradeRow;
        }
      });
      var mddContributorRows = Object.keys(mddContributionMap).map(function (key) {
        var row = mddContributionMap[key];
        row.contribution_pct = Number(numberFormat(row.contribution_pct, 3));
        return row;
      }).sort(function (a, b) {
        return Number(a.contribution_pct || 0) - Number(b.contribution_pct || 0);
      });
      var leaderPeriodicSummaryRows = buildLeaderPeriodicSummaryRows(leaderRows, holdingDetailRows, leaderPeriodSummaryMode);
      return (((strategyMode !== "leader_top10") || !activeLeaderSnapshot) && indexRequest.error)
        ? h(ErrorPanel, { message: indexRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, "\ubc31\ud14c\uc2a4\ud2b8 \uacb0\uacfc \u00b7 " + selectedLeaderLabel),
                h("div", { className: "summary-help" }, "당일 점수 기준 편입/편출 전략으로, 일부 구간에서는 현금 비중이 커집니다.")
              ),
              h(
                "div",
                { className: "toolbar-actions", style: { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" } },
                strategyMode === "leader_top10"
                  ? h("button", {
                      type: "button",
                      className: "mini-button",
                      onClick: saveCurrentLeaderBacktest,
                      disabled: leaderSnapshotSaving || !leaderRows.length,
                    }, leaderSnapshotSaving ? "저장 중" : "현재 결과 저장")
                  : null,
                h("span", { className: "telegram-status-pill" }, (leaderSnapshotPayload.start_date || startDate) + " ~ " + (leaderSnapshotPayload.end_date || endDate))
              )
            ),
            h(
              "div",
              { className: "strategy-summary-scroll" },
              h(
                "div",
                { className: "strategy-summary-row" },
                h(SummaryCard, { label: benchmarkLabel + " 수익률", value: formatPercent(leaderSummary.index_return_pct, 2) }),
                h(SummaryCard, { label: "포트폴리오 수익률", value: formatPercent(leaderSummary.strategy_return_pct, 2) }),
                h(SummaryCard, { label: "알파", value: formatPercent(leaderSummary.excess_return_pct, 2) }),
                h(SummaryCard, { label: "최대 MDD", value: formatPercent(leaderSummary.mdd_pct, 2), help: benchmarkLabel + " " + formatPercent(leaderSummary.benchmark_mdd_pct, 2) }),
                h(SummaryCard, { label: "총 매도", value: numberFormat(effectiveSellCount, 0) + "회" }),
                h(SummaryCard, { label: "수익 매도", value: numberFormat(effectiveWinningSellCount, 0) + "회" }),
                h(SummaryCard, { label: "평균 매도수익률", value: effectiveAverageSellReturnPct == null ? "-" : formatPercent(effectiveAverageSellReturnPct, 2) }),
                h(SummaryCard, { label: "수익매도 평균", value: effectiveWinningAverageSellReturnPct == null ? "-" : formatPercent(effectiveWinningAverageSellReturnPct, 2) }),
                h(SummaryCard, { label: "손실매도 평균", value: effectiveLosingAverageSellReturnPct == null ? "-" : formatPercent(effectiveLosingAverageSellReturnPct, 2) }),
                h(SummaryCard, { label: "승률", value: effectiveWinRatePct == null ? "-" : formatPercent(effectiveWinRatePct, 1), help: "매도 완료 건 중 수익 거래 비율" }),
                h(SummaryCard, { label: "\ud3c9\uade0 \ubcf4\uc720 \uc885\ubaa9", value: numberFormat(leaderSummary.avg_holdings_count, 1) + "\uac1c" }),
                h(SummaryCard, { label: "\ub204\uc801 \uc218\uc218\ub8cc", value: formatPercent(leaderSummary.total_fee_pct_points, 2) })
              )
            ),
            indexRequest.loading && !leaderRows.length
              ? h(LoadingPanel, { label: indexRequest.label })
              : leaderRows.length
                ? h(
                    React.Fragment,
                    null,
                    h(StrategyBacktestChart, {
                      rows: leaderRows,
                      indexName: benchmarkLabel,
                      strategyName: leaderMarketMode === "us" ? "미국 주도주" : "국내 주도주",
                    }),
                    h(
                      "div",
                      { className: "strategy-detail-single" },
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "최근 편출 로그"),
                        h(DataTable, {
                          rows: holdingDetailRows,
                          emptyMessage: "매도 완료 이벤트 데이터가 없습니다.",
                          columns: [
                            { key: "date", label: "신호일" },
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "buy_reason", label: "매수 사유", render: function (row) { return row.buy_reason || "-"; } },
                            { key: "reason", label: "매도 사유", render: function (row) { return row.reason || "-"; } },
                            { key: "buy_avg_price", label: "\ub9e4\uc218\uac00", render: function (row) { return row.buy_avg_price == null ? "-" : leaderPriceText(row.buy_avg_price) + (row.buy_date ? " (" + row.buy_date + ")" : ""); } },
                            { key: "sell_avg_price", label: "\ub9e4\ub3c4\uac00", render: function (row) { return row.sell_avg_price == null ? "-" : leaderPriceText(row.sell_avg_price) + (row.sell_date ? " (" + row.sell_date + ")" : ""); } },
                            { key: "sell_return_pct", label: "\ub9e4\ub3c4\uc218\uc775\ub960", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      )
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "손실 상위 거래"),
                        h(DataTable, {
                          rows: topLossTradeRows,
                          emptyMessage: "완료된 매도 거래가 없습니다.",
                          columns: [
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "buy_reason", label: "\ub9e4\uc218 \uc0ac\uc720", render: function (row) { return row.buy_reason || "-"; } },
                            { key: "reason", label: "\ub9e4\ub3c4 \uc0ac\uc720", render: function (row) { return row.reason || "-"; } },
                            { key: "buy_avg_price", label: "매수가", render: function (row) { return leaderPriceText(row.buy_avg_price); } },
                            { key: "buy_date", label: "매수일", render: function (row) { return row.buy_date || "-"; } },
                            { key: "sell_avg_price", label: "매도가", render: function (row) { return leaderPriceText(row.sell_avg_price); } },
                            { key: "sell_date", label: "매도일", render: function (row) { return row.sell_date || row.date || "-"; } },
                            { key: "sell_return_pct", label: "수익률", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "수익 상위 거래"),
                        h(DataTable, {
                          rows: topProfitTradeRows,
                          emptyMessage: "완료된 매도 거래가 없습니다.",
                          columns: [
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "buy_reason", label: "\ub9e4\uc218 \uc0ac\uc720", render: function (row) { return row.buy_reason || "-"; } },
                            { key: "reason", label: "\ub9e4\ub3c4 \uc0ac\uc720", render: function (row) { return row.reason || "-"; } },
                            { key: "buy_avg_price", label: "매수가", render: function (row) { return leaderPriceText(row.buy_avg_price); } },
                            { key: "buy_date", label: "매수일", render: function (row) { return row.buy_date || "-"; } },
                            { key: "sell_avg_price", label: "매도가", render: function (row) { return leaderPriceText(row.sell_avg_price); } },
                            { key: "sell_date", label: "매도일", render: function (row) { return row.sell_date || row.date || "-"; } },
                            { key: "sell_return_pct", label: "수익률", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "수익 상위 종목"),
                        h(DataTable, {
                          rows: topProfitStockRows,
                          emptyMessage: "완료된 매도 거래가 없습니다.",
                          columns: [
                            { key: "stock_name", label: "종목", render: function (row) {
                              var tradeRow = row.latest_trade || {};
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(tradeRow); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "trade_count", label: "매도 수", render: function (row) { return numberFormat(row.trade_count, 0) + "회"; } },
                            { key: "winning_count", label: "수익 매도", render: function (row) { return numberFormat(row.winning_count, 0) + "회"; } },
                            { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
                            { key: "total_return_pct", label: "누적 수익률", render: function (row) {
                              return row.total_return_pct == null ? "-" : h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2));
                            } },
                            { key: "avg_return_pct", label: "평균 수익률", render: function (row) {
                              return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2));
                            } },
                            { key: "latest_sell_date", label: "최근 매도일", render: function (row) { return row.latest_sell_date || "-"; } },
                          ],
                          compact: true,
                        })
                      )
                    ),
                    strategyMode === "leader_top10"
                      ? h(
                          "div",
                          { className: "mini-table-panel strategy-wide-table strategy-scroll-panel", style: { marginTop: "12px" } },
                          h(
                            "div",
                            { className: "section-toolbar" },
                            h("div", { className: "subsection-title" }, "기간별 성과"),
                            h(
                              "div",
                              { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                              h("button", {
                                type: "button",
                                className: "mini-button" + (leaderPeriodSummaryMode === "year" ? " active" : ""),
                                onClick: function () { setLeaderPeriodSummaryMode("year"); },
                              }, "연도별"),
                              h("button", {
                                type: "button",
                                className: "mini-button" + (leaderPeriodSummaryMode === "quarter" ? " active" : ""),
                                onClick: function () { setLeaderPeriodSummaryMode("quarter"); },
                              }, "분기별")
                            )
                          ),
                          h(DataTable, {
                            rows: leaderPeriodicSummaryRows,
                            emptyMessage: "기간별 성과 데이터가 없습니다.",
                            columns: [
                              { key: "label", label: leaderPeriodSummaryMode === "quarter" ? "분기" : "연도", render: function (row) { return row.label || "-"; } },
                              { key: "trade_count", label: "거래건", render: function (row) { return numberFormat(row.trade_count, 0) + "건"; } },
                              { key: "return_pct", label: leaderPeriodSummaryMode === "quarter" ? "분기수익률" : "연수익률", render: function (row) {
                                return row.return_pct == null ? "-" : h("span", { className: pnlClass(row.return_pct) }, formatPercent(row.return_pct, 2));
                              } },
                              { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
                              { key: "avg_profit_pct", label: "평균수익", render: function (row) {
                                return row.avg_profit_pct == null ? "-" : h("span", { className: pnlClass(row.avg_profit_pct) }, formatPercent(row.avg_profit_pct, 2));
                              } },
                              { key: "avg_loss_pct", label: "평균손실", render: function (row) {
                                return row.avg_loss_pct == null ? "-" : h("span", { className: pnlClass(row.avg_loss_pct) }, formatPercent(row.avg_loss_pct, 2));
                              } },
                              { key: "mdd_pct", label: "MDD", render: function (row) {
                                return row.mdd_pct == null ? "-" : h("span", { className: pnlClass(row.mdd_pct) }, formatPercent(row.mdd_pct, 2));
                              } },
                            ],
                            compact: true,
                          })
                        )
                      : null,
                    strategyMode === "leader_top10"
                      ? renderLeaderBreakoutInsightsPanel(leaderSnapshotPayload)
                      : null,
                    renderLeaderAiPanel(leaderMarketMode, leaderSnapshotPayload, mddContributorRows)
                    )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
          );
    }

    function renderLeaderSavedSnapshotsPanel() {
      if (strategyMode !== "leader_top10") {
        return null;
      }
      return h(
        "div",
        { className: "panel strategy-panel" },
        h(
          "div",
          { className: "mini-table-panel" },
          h("div", { className: "subsection-title" }, "저장된 국내 주도주 백테스트"),
          leaderSnapshotMessage ? h("div", { className: "summary-help" }, leaderSnapshotMessage) : null,
          leaderSnapshotRequest.loading && !savedLeaderSnapshots.length
            ? h(LoadingPanel, { label: leaderSnapshotRequest.label })
            : h(DataTable, {
                rows: savedLeaderSnapshots,
                emptyMessage: "저장된 백테스트가 없습니다.",
                columns: [
                  { key: "label", label: "이름", render: function (row) { return h("strong", null, row.label || "-"); } },
                  { key: "created_at", label: "저장시각", render: function (row) { return row.created_at || "-"; } },
                  { key: "strategy_return_pct", label: "수익률", render: function (row) {
                    return row.strategy_return_pct == null ? "-" : h("span", { className: pnlClass(row.strategy_return_pct) }, formatPercent(row.strategy_return_pct, 2));
                  } },
                  { key: "excess_return_pct", label: "알파", render: function (row) {
                    return row.excess_return_pct == null ? "-" : h("span", { className: pnlClass(row.excess_return_pct) }, formatPercent(row.excess_return_pct, 2));
                  } },
                  { key: "mdd_pct", label: "MDD", render: function (row) { return row.mdd_pct == null ? "-" : formatPercent(row.mdd_pct, 2); } },
                  { key: "actions", label: "관리", render: function (row) {
                    var rowId = Number(row.id || 0);
                    return h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                      h("button", { type: "button", className: "mini-button", onClick: function () { loadLeaderSnapshot(rowId); } }, Number(activeLeaderSnapshotId || 0) === rowId ? "불러옴" : "불러오기"),
                      h("button", { type: "button", className: "mini-button danger", onClick: function () { deleteLeaderSnapshot(rowId); } }, "삭제")
                    );
                  } },
                ],
                compact: true,
              })
        )
      );
    }

    function renderLeaderCompareResult() {
      var leftSnapshot = compareLeftSnapshot && compareLeftSnapshot.payload ? compareLeftSnapshot : null;
      var rightSnapshot = compareRightSnapshot && compareRightSnapshot.payload ? compareRightSnapshot : null;
      var stockOptions = buildLeaderCompareStockOptions(leftSnapshot, rightSnapshot);
      var selectedStock = stockOptions.filter(function (item) {
        return String(item.key) === String(compareStockKey || "");
      })[0] || stockOptions[0] || null;
      var leftTradesByStock = buildLeaderTradeLookup(leftSnapshot && leftSnapshot.payload);
      var rightTradesByStock = buildLeaderTradeLookup(rightSnapshot && rightSnapshot.payload);
      var leftStockTrades = selectedStock ? ensureArray(leftTradesByStock[selectedStock.key]) : [];
      var rightStockTrades = selectedStock ? ensureArray(rightTradesByStock[selectedStock.key]) : [];
      var leftRecentRows = extractLeaderSellRows(leftSnapshot && leftSnapshot.payload && leftSnapshot.payload.rows).slice().sort(function (a, b) {
        return String(b.sell_date || b.date || "").localeCompare(String(a.sell_date || a.date || ""));
      }).slice(0, 20);
      var rightRecentRows = extractLeaderSellRows(rightSnapshot && rightSnapshot.payload && rightSnapshot.payload.rows).slice().sort(function (a, b) {
        return String(b.sell_date || b.date || "").localeCompare(String(a.sell_date || a.date || ""));
      }).slice(0, 20);
      function renderSnapshotSummaryColumn(title, snapshot) {
        var payload = (snapshot && snapshot.payload) || {};
        var localSummary = payload.summary || {};
        return h(
          "div",
          { className: "mini-table-panel strategy-wide-table" },
          h("div", { className: "subsection-title" }, title),
          snapshot
            ? h(
                React.Fragment,
                null,
                h("div", { className: "summary-help", style: { marginBottom: "8px" } }, (snapshot.label || "-") + " · " + (snapshot.created_at || "-")),
                h(
                  "div",
                  { className: "summary-grid summary-grid-small" },
                  h(SummaryCard, { label: "수익률", value: formatPercent(localSummary.strategy_return_pct, 2) }),
                  h(SummaryCard, { label: "알파", value: formatPercent(localSummary.excess_return_pct, 2) }),
                  h(SummaryCard, { label: "MDD", value: formatPercent(localSummary.mdd_pct, 2) }),
                  h(SummaryCard, { label: "승률", value: localSummary.win_rate_pct == null ? "-" : formatPercent(localSummary.win_rate_pct, 1) })
                ),
                h("div", { style: { marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" } },
                  h("button", { type: "button", className: "mini-button", onClick: function () { loadLeaderSnapshot(snapshot.id); } }, "국내 주도주 탭에서 열기")
                )
              )
            : h(EmptyState, { compact: true, message: "전략을 선택해 주세요." })
        );
      }
      function comparePriceText(value) {
        return value == null || !Number.isFinite(Number(value)) ? "-" : numberFormat(value, 0) + "원";
      }
      function renderTradeTableRows(rowsToRender) {
        return h(DataTable, {
          rows: rowsToRender,
          emptyMessage: "해당 종목 거래가 없습니다.",
          columns: [
            { key: "stock_name", label: "종목", render: function (row) { return row.stock_name || row.stock_code || "-"; } },
            { key: "buy_date", label: "매수일", render: function (row) { return row.buy_date || "-"; } },
            { key: "buy_avg_price", label: "매수가", render: function (row) { return comparePriceText(row.buy_avg_price); } },
            { key: "sell_date", label: "매도일", render: function (row) { return row.sell_date || row.date || "-"; } },
            { key: "sell_avg_price", label: "매도가", render: function (row) { return comparePriceText(row.sell_avg_price); } },
            { key: "reason", label: "매도 사유", render: function (row) { return row.reason || "-"; } },
            { key: "sell_return_pct", label: "수익률", render: function (row) {
              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
            } },
          ],
          compact: true,
        });
      }
      return h(
        "div",
        { className: "panel strategy-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h(SectionTitle, null, "국내 주도주 전략 비교"),
            h("div", { className: "summary-help" }, "저장해둔 국내 주도주 백테스트를 좌우로 선택해 매매 결과를 비교합니다.")
          ),
          leaderSnapshotRequest.loading
            ? h("span", { className: "telegram-status-pill" }, "목록 불러오는 중")
            : h("span", { className: "telegram-status-pill" }, "저장 전략 " + numberFormat(savedLeaderSnapshots.length, 0) + "개")
        ),
        h(
          "div",
          { className: "strategy-control-grid" },
          h("label", null,
            h("span", null, "왼쪽 전략"),
            h("select", {
              className: "select-input",
              value: compareLeftSnapshotId,
              onChange: function (event) { setCompareLeftSnapshotId(event.target.value); },
            },
              h("option", { value: "" }, "선택"),
              savedLeaderSnapshots.map(function (item) {
                return h("option", { key: "left-" + item.id, value: String(item.id) }, item.label || ("저장 전략 #" + item.id));
              })
            )
          ),
          h("label", null,
            h("span", null, "오른쪽 전략"),
            h("select", {
              className: "select-input",
              value: compareRightSnapshotId,
              onChange: function (event) { setCompareRightSnapshotId(event.target.value); },
            },
              h("option", { value: "" }, "선택"),
              savedLeaderSnapshots.map(function (item) {
                return h("option", { key: "right-" + item.id, value: String(item.id) }, item.label || ("저장 전략 #" + item.id));
              })
            )
          ),
          h("label", null,
            h("span", null, "종목별 비교"),
            h("select", {
              className: "select-input",
              value: compareStockKey,
              onChange: function (event) { setCompareStockKey(event.target.value); },
            },
              h("option", { value: "" }, stockOptions.length ? "종목 선택" : "비교할 종목 없음"),
              stockOptions.map(function (item) {
                return h("option", { key: item.key, value: item.key }, item.stock_name + (item.stock_code ? " (" + item.stock_code + ")" : ""));
              })
            )
          )
        ),
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          renderSnapshotSummaryColumn("왼쪽 전략", leftSnapshot),
          renderSnapshotSummaryColumn("오른쪽 전략", rightSnapshot)
        ),
        selectedStock
          ? h(
              "div",
              { className: "sector-rotation-table-grid advanced-detail-grid" },
              h(
                "div",
                { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                h("div", { className: "subsection-title" }, "왼쪽 전략 · " + selectedStock.stock_name),
                renderTradeTableRows(leftStockTrades)
              ),
              h(
                "div",
                { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                h("div", { className: "subsection-title" }, "오른쪽 전략 · " + selectedStock.stock_name),
                renderTradeTableRows(rightStockTrades)
              )
            )
          : null,
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
            h("div", { className: "subsection-title" }, "왼쪽 전략 최근 매도"),
            renderTradeTableRows(leftRecentRows)
          ),
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
            h("div", { className: "subsection-title" }, "오른쪽 전략 최근 매도"),
            renderTradeTableRows(rightRecentRows)
          )
        )
      );
    }

    function renderSectorControls() {
      return h(
        "div",
        { className: "strategy-control-grid sector-rotation-controls" },
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: sectorStartDate,
            onChange: function (event) { setSectorStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: sectorEndDate,
            onChange: function (event) { setSectorEndDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 100,
            step: 1,
            value: sectorMinScore,
            onChange: function (event) { setSectorMinScore(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 12,
            step: 1,
            value: sectorTopCount,
            onChange: function (event) { setSectorTopCount(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 20,
            step: 1,
            value: sectorStocksCount,
            onChange: function (event) { setSectorStocksCount(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 2.5,
            step: 0.1,
            value: sectorLeverage,
            onChange: function (event) { setSectorLeverage(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: sectorWeightMethod,
            onChange: function (event) { setSectorWeightMethod(event.target.value); },
          }, [
            h("option", { key: "strength", value: "strength" }, "섹터 강도 비례"),
            h("option", { key: "equal", value: "equal" }, "동일 비중"),
          ])
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: applySectorBacktest,
            disabled: sectorRequest.loading,
          },
          sectorRequest.loading ? "계산 중" : "로테이션 실행"
        )
      );
    }

    function renderAdvancedControls() {
      return h(
        "div",
        { className: "strategy-control-grid sector-rotation-controls advanced-strategy-controls" },
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: advancedStartDate,
            onChange: function (event) { setAdvancedStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: advancedEndDate,
            onChange: function (event) { setAdvancedEndDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: advancedBenchmark,
            onChange: function (event) { setAdvancedBenchmark(event.target.value); },
          }, availableAdvancedBenchmarks.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 2.5,
            step: 0.1,
            value: advancedMaxLeverage,
            onChange: function (event) { setAdvancedMaxLeverage(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 10,
            step: 1,
            value: advancedTopSectors,
            onChange: function (event) { setAdvancedTopSectors(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 12,
            step: 1,
            value: advancedStocksCount,
            onChange: function (event) { setAdvancedStocksCount(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 100,
            step: 1,
            value: advancedMinScore,
            onChange: function (event) { setAdvancedMinScore(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 50,
            step: 1,
            value: advancedTradingRankLimit,
            onChange: function (event) { setAdvancedTradingRankLimit(Number(event.target.value) || 20); },
          })
        ),
        h("label", null,
          h("span", null, "20일선 비율"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 100,
            step: 5,
            value: advancedMinBreadth,
            onChange: function (event) { setAdvancedMinBreadth(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 100,
            max: 140,
            step: 1,
            value: advancedMaxDisparity,
            onChange: function (event) { setAdvancedMaxDisparity(Number(event.target.value) || 110); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: String(advancedBetaWindow),
            onChange: function (event) { setAdvancedBetaWindow(Number(event.target.value) || 63); },
          }, [
            h("option", { key: "63", value: "63" }, "3개월"),
            h("option", { key: "252", value: "252" }, "1년"),
          ])
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: advancedWeightMethod,
            onChange: function (event) { setAdvancedWeightMethod(event.target.value); },
          }, [
            h("option", { key: "entry_beta", value: "entry_beta" }, "베타 가중"),
            h("option", { key: "equal", value: "equal" }, "동일 비중"),
          ])
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: advancedStockSelection,
            onChange: function (event) { setAdvancedStockSelection(event.target.value); },
          }, [
            h("option", { key: "trend_strength", value: "trend_strength" }, "추세 강도 우선"),
                h("option", { key: "score", value: "score" }, "종합점수 우선"),
          ])
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: applyAdvancedBacktest,
            disabled: advancedRequest.loading,
          },
          advancedRequest.loading ? "계산 중" : "고급 백테스트 실행"
        )
      );
    }

    function renderIndexResult() {
      return indexRequest.error
        ? h(ErrorPanel, { message: indexRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, (data.index_name || "지수") + " · " + (data.strategy_name || "전략")),
                h("div", { className: "summary-help" }, data.strategy_description || "전략 조건을 선택해 백테스트를 실행해 주세요.")
              ),
              h("span", { className: "telegram-status-pill" }, (data.start_date || startDate) + " ~ " + (data.end_date || endDate))
            ),
            h(
              "div",
              { className: "summary-grid-small strategy-summary-grid" },
              h(SummaryCard, { label: "지수 수익률", value: formatPercent(summary.index_return_pct, 2) }),
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(summary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "초과 수익", value: formatPercent(summary.excess_return_pct, 2) }),
              h(SummaryCard, { label: "매매 신호", value: numberFormat(summary.signal_count, 0) + "회" }),
              h(SummaryCard, { label: "승률", value: summary.win_rate_pct == null ? "-" : formatPercent(summary.win_rate_pct, 1) }),
              h(SummaryCard, { label: "수수료", value: "매수/매도 " + formatPercent(summary.trade_fee_rate_pct, 1), help: "누적 비용 " + formatPercent(summary.total_fee_pct_points, 2) })
            ),
            indexRequest.loading && !rows.length
              ? h(LoadingPanel, { label: indexRequest.label })
              : rows.length
                ? h(React.Fragment, null,
                    h(StrategyBacktestChart, {
                      rows: rows,
                      indexName: data.index_name,
                      strategyName: data.strategy_name,
                    }),
                    h(
                      "div",
                      { className: "strategy-rsi-section" },
                      h("div", { className: "section-toolbar compact" },
                        h(SectionTitle, null, "RSI(14)"),
                        h("span", { className: "summary-help" }, "70 이상 과매수 · 30 이하 과매도")
                      ),
                      h(StrategyRsiChart, { rows: rows })
                    ),
                  )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
          );
    }

    function renderLatestSectorSelection() {
      const lastRow = sectorRows.length ? sectorRows[sectorRows.length - 1] : null;
      const sectors = ensureArray(lastRow && lastRow.selected_sectors);
      if (!sectors.length) {
        return null;
      }
      return h(
        "div",
        { className: "sector-selection-strip" },
        sectors.map(function (sector) {
          return h(
            "div",
            { key: sector.sector, className: "sector-selection-card" },
            h("div", { className: "sector-selection-head" },
              h("strong", null, sector.sector),
              h("span", null, formatPercent(sector.target_weight_pct, 1))
            ),
            h("div", { className: "sector-selection-stocks" },
              ensureArray(sector.stocks).map(function (stock) {
                return h("span", { key: stock.stock_key || stock.stock_name }, (stock.stock_name || "-") + " " + formatPercent(stock.weight_pct, 1));
              })
            )
          );
        })
      );
    }

    function renderAdvancedExecutionPanel() {
      const execution = advancedData.execution || {};
      const kis = execution.kis || {};
      const latestHoldings = ensureArray(advancedData.latest_holdings);
      return h(
        "div",
        { className: "strategy-execution-panel" },
        h("div", { className: "section-toolbar compact" },
          h("div", null,
            h(SectionTitle, null, "주문 전 포트폴리오"),
            h("div", { className: "summary-help" }, execution.message || "한투 모의투자 계좌로 넘기기 전 목표 포트폴리오를 확인합니다.")
          ),
          h("span", { className: "telegram-status-pill" }, kis.configured ? "KIS 연결됨 · " + (kis.environment || "mock") : "KIS 미설정")
        ),
        h(DataTable, {
          rows: latestHoldings,
          emptyMessage: "최근 목표 포트폴리오가 없습니다.",
          columns: [
            { key: "sector", label: "섹터" },
            { key: "stock_name", label: "종목" },
            { key: "stock_code", label: "코드" },
            { key: "weight_pct", label: "목표비중", render: function (row) { return formatPercent(row.weight_pct, 2); } },
            { key: "beta", label: "β", render: function (row) { return row.beta == null ? "-" : numberFormat(row.beta, 2); } },
            { key: "score", label: "점수", render: function (row) { return row.score == null ? "-" : numberFormat(row.score, 1); } },
          ],
        }),
        h(
          "div",
          { className: "strategy-execution-actions" },
          h("button", { type: "button", className: "secondary-button", disabled: true }, "모의 주문 실행 잠금"),
          h("span", { className: "summary-help" }, "실제 주문 API는 다음 단계에서 주문 전 확인/수량 검증/취소 가능 로그까지 붙인 뒤 열겠습니다.")
        )
      );
    }

    function renderDateSelectorStrip(rows, selectedDate, onSelect) {
      const sourceRows = ensureArray(rows).slice(-18);
      if (!sourceRows.length) {
        return null;
      }
      return h(
        "div",
        { className: "strategy-date-strip" },
        sourceRows.map(function (row) {
          const active = String(row.date || "") === String(selectedDate || "");
          return h(
            "button",
            {
              key: row.date,
              type: "button",
              className: "strategy-date-chip" + (active ? " active" : ""),
              onClick: function () { onSelect(row.date); },
              title: (row.date || "") + " 포트폴리오 보기",
            },
            h("span", null, formatDateLabel(row.date)),
            h("strong", { className: pnlClass(row.daily_return_pct) }, formatPercent(row.daily_return_pct, 1))
          );
        })
      );
    }

    function renderSelectedAdvancedPortfolio() {
      const tradeLog = ensureArray(advancedData.trade_log);
      const timeline = ensureArray(advancedData.holdings_timeline);
      const activeDate = selectedAdvancedDate || (advancedRows.length ? advancedRows[advancedRows.length - 1].date : "");
      const row = advancedRows.find(function (item) { return item.date === activeDate; }) || (advancedRows.length ? advancedRows[advancedRows.length - 1] : null);
      const holdingFrame = timeline.find(function (item) { return item.date === activeDate; }) || (timeline.length ? timeline[timeline.length - 1] : null);
      const holdings = ensureArray(holdingFrame && holdingFrame.holdings);
      const trades = tradeLog.filter(function (item) {
        return String(item.apply_date || item.date || "") === String(activeDate || "");
      });
      return h(
        "div",
        { className: "strategy-selected-portfolio" },
        h("div", { className: "section-toolbar compact" },
          h("div", null,
            h(SectionTitle, null, "선택일 포트폴리오"),
            h("div", { className: "summary-help" }, (activeDate || "-") + " · 차트나 아래 날짜 버튼을 눌러 그날 포트를 확인합니다.")
          ),
          row ? h("span", { className: "telegram-status-pill" }, "노출 " + formatPercent(row.exposure_pct, 1) + " · 일수익 " + formatPercent(row.daily_return_pct, 2)) : null
        ),
        renderDateSelectorStrip(advancedRows, activeDate, setSelectedAdvancedDate),
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          h(
            "div",
            { className: "mini-table-panel" },
            h("div", { className: "subsection-title" }, "보유 종목/비중"),
            h(DataTable, {
              rows: holdings,
              emptyMessage: "해당 일자 보유 종목이 없습니다.",
              columns: [
                { key: "sector", label: "섹터" },
                { key: "stock_name", label: "종목" },
                { key: "weight_pct", label: "비중", render: function (item) { return formatPercent(item.weight_pct, 2); } },
                { key: "beta", label: "β", render: function (item) { return item.beta == null ? "-" : numberFormat(item.beta, 2); } },
                { key: "trend_score", label: "추세", render: function (item) { return item.trend_score == null ? "-" : numberFormat(item.trend_score, 1); } },
                { key: "score", label: "점수", render: function (item) { return item.score == null ? "-" : numberFormat(item.score, 1); } },
              ],
            })
          ),
          h(
            "div",
            { className: "mini-table-panel" },
            h("div", { className: "subsection-title" }, "당일 매수/매도"),
            h(DataTable, {
              rows: trades,
              emptyMessage: "해당 일자 리밸런싱 기록이 없습니다.",
              columns: [
                { key: "action", label: "구분" },
                { key: "sector", label: "섹터" },
                { key: "stock_name", label: "종목", render: function (item) {
                  return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(item); } }, item.stock_name || item.stock_code || "-");
                } },
                { key: "before_weight_pct", label: "전", render: function (item) { return formatPercent(item.before_weight_pct, 2); } },
                { key: "after_weight_pct", label: "후", render: function (item) { return formatPercent(item.after_weight_pct, 2); } },
                { key: "trade_return_pct", label: "매매수익", render: function (item) { return item.trade_return_pct == null ? "-" : h("span", { className: pnlClass(item.trade_return_pct) }, formatPercent(item.trade_return_pct, 2)); } },
                { key: "holding_days", label: "보유", render: function (item) { return item.holding_days == null ? "-" : numberFormat(item.holding_days, 0) + "일"; } },
              ],
            })
          )
        )
      );
    }

    function renderSelectedSectorPortfolio() {
      const activeDate = selectedSectorDate || (sectorRows.length ? sectorRows[sectorRows.length - 1].date : "");
      const row = sectorRows.find(function (item) { return item.date === activeDate; }) || (sectorRows.length ? sectorRows[sectorRows.length - 1] : null);
      const sectors = ensureArray(row && row.selected_sectors);
      const stocks = [];
      sectors.forEach(function (sector) {
        ensureArray(sector.stocks).forEach(function (stock) {
          stocks.push(Object.assign({}, stock, { sector: sector.sector }));
        });
      });
      return h(
        "div",
        { className: "strategy-selected-portfolio" },
        h("div", { className: "section-toolbar compact" },
          h("div", null,
            h(SectionTitle, null, "선택일 포트폴리오"),
            h("div", { className: "summary-help" }, (activeDate || "-") + " · 차트나 아래 날짜 버튼을 눌러 그날 포트를 확인합니다.")
          ),
          row ? h("span", { className: "telegram-status-pill" }, "노출 " + formatPercent(row.exposure_pct, 1) + " · 일수익 " + formatPercent(row.daily_return_pct, 2)) : null
        ),
        renderDateSelectorStrip(sectorRows, activeDate, setSelectedSectorDate),
        h(DataTable, {
          rows: stocks,
          emptyMessage: "해당 일자 선택 종목이 없습니다.",
          columns: [
            { key: "sector", label: "섹터" },
            { key: "stock_name", label: "종목" },
            { key: "stock_code", label: "코드" },
            { key: "score", label: "점수", render: function (item) { return item.score == null ? "-" : numberFormat(item.score, 1); } },
            { key: "weight_pct", label: "비중", render: function (item) { return formatPercent(item.weight_pct, 2); } },
          ],
        })
      );
    }

    function renderAdvancedResult() {
      const tradeLog = ensureArray(advancedData.trade_log).slice().reverse();
      const holdingsTimeline = ensureArray(advancedData.holdings_timeline);
      const latestTimeline = holdingsTimeline.length ? holdingsTimeline[holdingsTimeline.length - 1] : null;
      const latestHoldings = ensureArray(latestTimeline && latestTimeline.holdings);
      return advancedRequest.error
        ? h(ErrorPanel, { message: advancedRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel advanced-strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, advancedData.strategy_name || "고급 섹터 진입 신호 포트폴리오"),
                h("div", { className: "summary-help" }, advancedData.description || "시장 20일선 필터와 섹터 진입 신호를 결합해 주식 노출을 가변 조절합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (advancedData.start_date || advancedStartDate) + " ~ " + (advancedData.end_date || advancedEndDate))
            ),
            h(
              "div",
              { className: "summary-grid-small strategy-summary-grid sector-rotation-summary-grid" },
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(advancedSummary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "비교군 수익률", value: formatPercent(advancedSummary.benchmark_return_pct, 2), help: advancedData.benchmark_name || "-" }),
              h(SummaryCard, { label: "초과 수익", value: formatPercent(advancedSummary.excess_return_pct, 2) }),
              h(SummaryCard, { label: "MDD", value: formatPercent(advancedSummary.mdd_pct, 2), help: "비교군 " + formatPercent(advancedSummary.benchmark_mdd_pct, 2) }),
              h(SummaryCard, { label: "평균/최대 노출", value: formatPercent(advancedSummary.avg_exposure_pct, 1), help: "최대 " + formatPercent(advancedSummary.max_exposure_pct, 1) }),
              h(SummaryCard, { label: "매매/수수료", value: numberFormat(advancedSummary.trade_count, 0) + "건", help: "누적 비용 " + formatPercent(advancedSummary.total_fee_pct_points, 2) })
            ),
            advancedRequest.loading && !advancedRows.length
              ? h(LoadingPanel, { label: advancedRequest.label })
              : advancedRows.length
                ? h(React.Fragment, null,
                    h(SectorRotationBacktestChart, {
                      rows: advancedRows,
                      strategyName: advancedData.strategy_name,
                      benchmarkName: advancedData.benchmark_name,
                      tradeLog: advancedData.trade_log,
                      selectedDate: selectedAdvancedDate || (advancedRows.length ? advancedRows[advancedRows.length - 1].date : ""),
                      onSelectDate: setSelectedAdvancedDate,
                    }),
                    renderSelectedAdvancedPortfolio(),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: latestHoldings,
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "stock_name", label: "종목" },
                            { key: "weight_pct", label: "비중", render: function (row) { return formatPercent(row.weight_pct, 2); } },
                            { key: "beta", label: "β", render: function (row) { return row.beta == null ? "-" : numberFormat(row.beta, 2); } },
                            { key: "trend_score", label: "추세", render: function (row) { return row.trend_score == null ? "-" : numberFormat(row.trend_score, 1); } },
                            { key: "score", label: "점수", render: function (row) { return row.score == null ? "-" : numberFormat(row.score, 1); } },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "최근 편입/제외 로그"),
                        h(DataTable, {
                          rows: tradeLog.slice(0, 80),
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "date", label: "신호일" },
                            { key: "action", label: "구분" },
                            { key: "sector", label: "섹터" },
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "after_weight_pct", label: "목표", render: function (row) { return formatPercent(row.after_weight_pct, 2); } },
                            { key: "trade_return_pct", label: "매매수익", render: function (row) { return row.trade_return_pct == null ? "-" : h("span", { className: pnlClass(row.trade_return_pct) }, formatPercent(row.trade_return_pct, 2)); } },
                            { key: "holding_days", label: "보유", render: function (row) { return row.holding_days == null ? "-" : numberFormat(row.holding_days, 0) + "일"; } },
                          ],
                        })
                      )
                    ),
                    renderAdvancedExecutionPanel()
                  )
                : h(EmptyState, { compact: true, message: "고급 백테스트 데이터가 없습니다. 기간이나 조건을 완화해 보세요." })
          );
    }

    function renderSectorResult() {
      const sectorPerformance = ensureArray(sectorData.sector_performance);
      const latestScores = ensureArray(sectorData.latest_sector_scores);
      return sectorRequest.error
        ? h(ErrorPanel, { message: sectorRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, sectorData.strategy_name || "주도주 섹터 로테이션"),
                h("div", { className: "summary-help" }, sectorData.description || "오늘의 주도주 점수와 수동 섹터 DB를 이용해 D일 신호를 만들고 D+1일 수익률로 검증합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (sectorData.start_date || sectorStartDate) + " ~ " + (sectorData.end_date || sectorEndDate))
            ),
            h(
              "div",
              { className: "summary-grid-small strategy-summary-grid sector-rotation-summary-grid" },
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(sectorSummary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "비교군 수익률", value: formatPercent(sectorSummary.benchmark_return_pct, 2), help: sectorData.benchmark_name || "조건 충족 종목 평균" }),
              h(SummaryCard, { label: "MDD", value: formatPercent(sectorSummary.mdd_pct, 2) }),
              h(SummaryCard, { label: "CAGR", value: formatPercent(sectorSummary.cagr_pct, 1) }),
              h(SummaryCard, { label: "평균 노출", value: formatPercent(sectorSummary.avg_exposure_pct, 1) }),
              h(SummaryCard, { label: "누적 수수료", value: formatPercent(sectorSummary.total_fee_pct_points, 2), help: "회전율 " + formatPercent(sectorSummary.total_turnover_pct, 1) })
            ),
            sectorRequest.loading && !sectorRows.length
              ? h(LoadingPanel, { label: sectorRequest.label })
              : sectorRows.length
                ? h(React.Fragment, null,
                    h(SectorRotationBacktestChart, {
                      rows: sectorRows,
                      strategyName: sectorData.strategy_name,
                      benchmarkName: sectorData.benchmark_name,
                      selectedDate: selectedSectorDate || (sectorRows.length ? sectorRows[sectorRows.length - 1].date : ""),
                      onSelectDate: setSelectedSectorDate,
                    }),
                    renderSelectedSectorPortfolio(),
                    renderLatestSectorSelection(),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: latestScores,
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "strength_score", label: "강도", render: function (row) { return numberFormat(row.strength_score, 1); } },
                            { key: "avg_score", label: "평균점수", render: function (row) { return numberFormat(row.avg_score, 1); } },
                            { key: "stock_count", label: "종목", render: function (row) { return numberFormat(row.stock_count, 0); } },
                            { key: "turnover_ratio_pct", label: "거래대금/시총", render: function (row) { return formatPercent(row.turnover_ratio_pct, 2); } },
                            { key: "leaders", label: "대표", render: function (row) { return ensureArray(row.leaders).slice(0, 4).join(", "); } },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: sectorPerformance,
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "selected_days", label: "선택일", render: function (row) { return numberFormat(row.selected_days, 0); } },
                            { key: "contribution_pct", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct) }, formatPercent(row.contribution_pct, 2)); } },
                            { key: "avg_weight_pct", label: "평균비중", render: function (row) { return formatPercent(row.avg_weight_pct, 1); } },
                            { key: "win_rate_pct", label: "승률", render: function (row) { return formatPercent(row.win_rate_pct, 1); } },
                          ],
                        })
                      )
                    )
                  )
                : h(EmptyState, { compact: true, message: "섹터 로테이션 백테스트 데이터가 없습니다. 오늘의 주도주 DB를 먼저 로드해 주세요." })
          );
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel strategy-hero" },
        h("div", { className: "eyebrow" }, "Quant Strategy"),
        h("h1", { className: "page-title" }, "전략 백테스트"),
        h("p", { className: "page-copy compact-copy" }, "현재 투자 방식의 꼬리 손실과 시장 필터, 섹터 진입 신호를 비교해 추세추종 전략을 개선합니다."),
        h(
          "div",
          { className: "strategy-mode-tabs" },
          renderModeButton("leader_top10", "국내 주도주"),
          renderModeButton("us_leader", "미국 주도주"),
          renderModeButton("leader_compare", "전략 비교"),
          renderModeButton("advanced_sector", "고급 섹터 신호"),
          renderModeButton("sector_rotation", "주도주 섹터 로테이션"),
          renderModeButton("index", "지수 전략")
        ),
        strategyMode === "leader_top10"
          ? renderLeaderControls("kr")
          : strategyMode === "us_leader"
            ? renderLeaderControls("us")
          : strategyMode === "leader_compare"
            ? null
          : strategyMode === "advanced_sector" ? renderAdvancedControls() : strategyMode === "sector_rotation" ? renderSectorControls() : renderIndexControls()
      ),
      renderLeaderSavedSnapshotsPanel(),
      strategyMode === "leader_top10" || strategyMode === "us_leader"
        ? (leaderBacktestStarted || (strategyMode === "leader_top10" && activeLeaderSnapshot)
          ? renderLeaderResult()
          : h(EmptyState, { compact: true, message: "설정값을 확인한 뒤 백테스트 실행 버튼을 눌러 주세요." }))
        : strategyMode === "leader_compare"
          ? renderLeaderCompareResult()
        : strategyMode === "advanced_sector" ? renderAdvancedResult() : strategyMode === "sector_rotation" ? renderSectorResult() : renderIndexResult(),
      renderStrategyTradeChartPopup()
    );
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
        marketPayload: validVersion ? parsed.marketPayload || null : null,
        marketScrollTop: Number(parsed.marketScrollTop || 0),
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
        marketPayload: state.marketPayload || null,
        marketScrollTop: Number(state.marketScrollTop || 0),
        financialTrend: state.financialTrend || null,
        financialTrendMessage: state.financialTrendMessage || "",
      }));
    } catch (err) {
    }
  }

  function DisclosurePage() {
    const savedState = loadDisclosurePageState();
    const statusRequest = useFetchJson("/api/telegram/status");
    const status = statusRequest.data || {};
    const [earningsQuery, setEarningsQuery] = useState(savedState.earningsQuery || "");
    const [earningsSuggestions, setEarningsSuggestions] = useState([]);
    const [earningsActiveIndex, setEarningsActiveIndex] = useState(0);
    const [earningsResults, setEarningsResults] = useState(ensureArray(savedState.earningsResults));
    const [earningsMessage, setEarningsMessage] = useState(savedState.earningsMessage || "");
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [disclosureCategory, setDisclosureCategory] = useState(savedState.disclosureCategory || "earnings");
    const [disclosureNextOffsetId, setDisclosureNextOffsetId] = useState(Number(savedState.disclosureNextOffsetId || 0));
    const [disclosureHasMore, setDisclosureHasMore] = useState(!!savedState.disclosureHasMore);
    const [marketPayload, setMarketPayload] = useState(savedState.marketPayload || null);
    const [marketLoading, setMarketLoading] = useState(false);
    const [marketMessage, setMarketMessage] = useState("");
    const [marketScope, setMarketScope] = useState("kr");
    const [financialTrend, setFinancialTrend] = useState(savedState.financialTrend || null);
    const [financialTrendLoading, setFinancialTrendLoading] = useState(false);
    const [financialTrendMessage, setFinancialTrendMessage] = useState(savedState.financialTrendMessage || "");
    const [upcomingScope, setUpcomingScope] = useState("kr");
    const earningsTimerRef = useRef(null);
    const earningsSuggestWrapRef = useRef(null);
    const marketLoadedRef = useRef(!!savedState.marketPayload);
    const marketScrollBoxRef = useRef(null);
    const marketScrollTopRef = useRef(Number(savedState.marketScrollTop || 0));
    const marketScrollSaveTimerRef = useRef(null);
    const upcomingStart = shiftIsoDate(todayIsoDate(), 1);
    const upcomingTabConfig = UPCOMING_EARNINGS_TABS.find(function (item) { return item.key === upcomingScope; }) || UPCOMING_EARNINGS_TABS[0];
    const marketForeignRequest = useFetchJson(
      "/api/disclosure/recent-foreign-earnings?days=" + encodeURIComponent(14)
      + "&min_market_cap_100m=" + encodeURIComponent(10000)
    );
    const upcomingRequest = useFetchJson(
      "/api/disclosure/upcoming-earnings?start=" + encodeURIComponent(upcomingStart)
      + "&days=" + encodeURIComponent(14)
      + "&scope=" + encodeURIComponent(upcomingScope)
      + "&min_market_cap_100m=" + encodeURIComponent(upcomingTabConfig.minMarketCap100m || 0)
    );

    useEffect(function () {
      return function () {
        if (earningsTimerRef.current) {
          clearTimeout(earningsTimerRef.current);
        }
        if (marketScrollSaveTimerRef.current) {
          clearTimeout(marketScrollSaveTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      function closeOnOutsideClick(event) {
        if (!earningsSuggestWrapRef.current) {
          return;
        }
        if (!earningsSuggestWrapRef.current.contains(event.target)) {
          setEarningsSuggestions([]);
        }
      }
      document.addEventListener("mousedown", closeOnOutsideClick);
      return function () {
        document.removeEventListener("mousedown", closeOnOutsideClick);
      };
    }, []);

    useEffect(function () {
      persistDisclosurePageState({
        earningsQuery: earningsQuery,
        earningsResults: earningsResults,
        earningsMessage: earningsMessage,
        disclosureCategory: disclosureCategory,
        disclosureNextOffsetId: disclosureNextOffsetId,
        disclosureHasMore: disclosureHasMore,
        marketPayload: marketPayload,
        marketScrollTop: marketScrollTopRef.current,
        financialTrend: financialTrend,
        financialTrendMessage: financialTrendMessage,
      });
    }, [earningsQuery, earningsResults, earningsMessage, disclosureCategory, disclosureNextOffsetId, disclosureHasMore, marketPayload, financialTrend, financialTrendMessage]);

    useEffect(function () {
      const categoryLabel = disclosureTabLabel(disclosureCategory);
      emitWindowTitleDetail("disclosure", earningsQuery ? categoryLabel + ": " + earningsQuery : "");
    }, [earningsQuery, disclosureCategory]);

    useEffect(function () {
      if (status.authorized && !marketLoadedRef.current && !marketLoading) {
        marketLoadedRef.current = true;
        loadMarketEarnings();
      }
    }, [status.authorized]);

    useEffect(function () {
      if (!marketScrollBoxRef.current || !marketPayload) {
        return;
      }
      const savedTop = Number(marketScrollTopRef.current || 0);
      if (savedTop <= 0) {
        return;
      }
      window.setTimeout(function () {
        if (marketScrollBoxRef.current) {
          marketScrollBoxRef.current.scrollTop = savedTop;
        }
      }, 0);
    }, [marketPayload]);

    function rememberMarketScroll(event) {
      const target = event && event.currentTarget;
      if (!target) {
        return;
      }
      marketScrollTopRef.current = Number(target.scrollTop || 0);
      if (marketScrollSaveTimerRef.current) {
        clearTimeout(marketScrollSaveTimerRef.current);
      }
      marketScrollSaveTimerRef.current = setTimeout(function () {
        persistDisclosurePageState({
          earningsQuery: earningsQuery,
          earningsResults: earningsResults,
          earningsMessage: earningsMessage,
          disclosureCategory: disclosureCategory,
          disclosureNextOffsetId: disclosureNextOffsetId,
          disclosureHasMore: disclosureHasMore,
          marketPayload: marketPayload,
          marketScrollTop: marketScrollTopRef.current,
          financialTrend: financialTrend,
          financialTrendMessage: financialTrendMessage,
        });
      }, 180);
    }

    function chooseEarningsCompany(item) {
      setEarningsQuery(item.name || item.query || "");
      setEarningsSuggestions([]);
      setEarningsActiveIndex(0);
    }

    function searchEarningsCompany(value) {
      setEarningsQuery(value);
      setEarningsActiveIndex(0);
      if (earningsTimerRef.current) {
        clearTimeout(earningsTimerRef.current);
      }
      if (!value || value.trim().length < 1) {
        setEarningsSuggestions([]);
        return;
      }
      earningsTimerRef.current = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()));
          setEarningsSuggestions(ensureArray(payload.items || []));
        } catch (err) {
          setEarningsSuggestions([]);
        }
      }, 160);
    }

    function handleEarningsKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        setEarningsSuggestions([]);
        if (!earningsLoading && status.authorized) {
          runEarningsSearch();
        }
        return;
      }
      if (!earningsSuggestions.length) {
        if (event.key === "Enter") {
          event.preventDefault();
          setEarningsSuggestions([]);
          runEarningsSearch();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setEarningsActiveIndex((earningsActiveIndex + 1) % earningsSuggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setEarningsActiveIndex((earningsActiveIndex - 1 + earningsSuggestions.length) % earningsSuggestions.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const selected = earningsSuggestions[earningsActiveIndex] || earningsSuggestions[0];
        setEarningsSuggestions([]);
        if (selected) {
          chooseEarningsCompany(selected);
          setTimeout(function () { runEarningsSearch(false, selected.name || selected.query || ""); }, 0);
        } else {
          runEarningsSearch(false);
        }
      } else if (event.key === "Escape") {
        setEarningsSuggestions([]);
      }
    }

    function changeDisclosureCategory(category) {
      setDisclosureCategory(category);
      setDisclosureNextOffsetId(0);
      setDisclosureHasMore(false);
      setEarningsResults([]);
      setEarningsMessage("");
      if (String(earningsQuery || "").trim()) {
        setTimeout(function () { runEarningsSearch(false, null, category); }, 0);
      }
    }

    async function loadFinancialTrend(company) {
      const target = String(company || "").trim();
      if (!target) {
        setFinancialTrend(null);
        setFinancialTrendMessage("");
        return;
      }
      setFinancialTrendLoading(true);
      setFinancialTrendMessage("");
      try {
        const payload = await fetchJson("/api/dart/earnings-trend?company=" + encodeURIComponent(target));
        setFinancialTrend(payload);
      } catch (err) {
        setFinancialTrend(null);
        setFinancialTrendMessage(err.message || String(err));
      } finally {
        setFinancialTrendLoading(false);
      }
    }

    async function loadBusinessSegments(company) {
      const target = String(company || "").trim();
      if (!target) {
        setBusinessSegments(null);
        setBusinessSegmentsMessage("");
        return;
      }
      setBusinessSegmentsLoading(true);
      setBusinessSegmentsMessage("");
      try {
        const payload = await fetchJson("/api/kind/business-segments?company=" + encodeURIComponent(target), { noCache: true });
        setBusinessSegments(payload);
      } catch (err) {
        setBusinessSegments(null);
        setBusinessSegmentsMessage(err.message || String(err));
      } finally {
        setBusinessSegmentsLoading(false);
      }
    }

    async function loadStockOverview(company) {
      const target = String(company || "").trim();
      if (!target) {
        setStockOverview(null);
        setStockOverviewMessage("");
        return;
      }
      setStockOverviewLoading(true);
      setStockOverviewMessage("");
      try {
        const payload = await fetchJson("/api/stocks/overview?name=" + encodeURIComponent(target) + "&months=3", { noCache: true });
        setStockOverview(payload);
      } catch (err) {
        setStockOverview(null);
        setStockOverviewMessage(err.message || String(err));
      } finally {
        setStockOverviewLoading(false);
      }
    }

    async function loadWiseTargetHistory(company) {
      const target = String(company || "").trim();
      if (!target) {
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage("");
        return;
      }
      setWiseTargetHistoryLoading(true);
      setWiseTargetHistoryMessage("");
      try {
        const payload = await fetchJson("/api/stocks/wisereport-targets?name=" + encodeURIComponent(target) + "&months=12", { noCache: true });
        setWiseTargetHistory(payload);
      } catch (err) {
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage(err.message || String(err));
      } finally {
        setWiseTargetHistoryLoading(false);
      }
    }

    async function loadWiseConsensusHistory(company) {
      const target = String(company || "").trim();
      if (!target) {
        setWiseConsensusHistory(null);
        setWiseConsensusHistoryMessage("");
        return;
      }
      setWiseConsensusHistoryLoading(true);
      setWiseConsensusHistoryMessage("");
      try {
        const payload = await fetchJson("/api/stocks/wisereport-consensus?name=" + encodeURIComponent(target) + "&fin_gubun=MAIN", { noCache: true });
        setWiseConsensusHistory(payload);
      } catch (err) {
        setWiseConsensusHistory(null);
        setWiseConsensusHistoryMessage(err.message || String(err));
      } finally {
        setWiseConsensusHistoryLoading(false);
      }
    }

    async function toggleFinancialTrend() {
      const nextExpanded = !financialTrendExpanded;
      setFinancialTrendExpanded(nextExpanded);
      if (!nextExpanded) {
        return;
      }
      const target = String(earningsQuery || "").trim();
      if (!target) {
        return;
      }
      if (!financialTrend && !financialTrendLoading) {
        await loadFinancialTrend(target);
      }
    }

    function navigateBackToThemes() {
      const target = String(earningsQuery || "").trim();
      if (target) {
        stashThemeStockNavigation(target);
      }
      requestPageNavigation("themes", { stockQuery: target || "" });
    }

    async function runEarningsSearch(append, overrideCompany, overrideCategory) {
      const company = String(overrideCompany || earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage("검색 상태를 초기화했습니다.");
        return;
      }
      setEarningsSuggestions([]);
      const category = overrideCategory || disclosureCategory;
      setEarningsLoading(true);
      setEarningsMessage("");
      if (!append) {
        setEarningsResults([]);
        setDisclosureNextOffsetId(0);
        setDisclosureHasMore(false);
        loadFinancialTrend(company);
      }
      try {
        const payload = await postJson("/api/telegram/earnings_search", {
          company: company,
          category: category,
          limit: 20,
          offset_id: append ? disclosureNextOffsetId || null : null,
        });
        const nextRows = ensureArray(payload.results);
        setEarningsResults(function (current) {
          const source = append ? ensureArray(current).concat(nextRows) : nextRows;
          const seen = {};
          return source.filter(function (row) {
            const key = row.chat_id + ":" + row.message_id;
            if (seen[key]) {
              return false;
            }
            seen[key] = true;
            return true;
          });
        });
        setDisclosureNextOffsetId(Number(payload.next_offset_id || 0));
        setDisclosureHasMore(!!payload.has_more && nextRows.length > 0);
        setEarningsMessage(payload.message || "");
      } catch (err) {
        setEarningsMessage(err.message || String(err));
      } finally {
        setEarningsLoading(false);
      }
    }

    async function loadMarketEarnings() {
      if (marketLoading) {
        return;
      }
      setMarketLoading(true);
      setMarketMessage("");
      try {
        const payload = await postJson("/api/telegram/market_earnings", {
          days: 1095,
          limit: 100,
          scan_limit: 5000,
        });
        setMarketPayload(payload);
        setMarketMessage(payload.message || "");
      } catch (err) {
        setMarketMessage(err.message || String(err));
      } finally {
        setMarketLoading(false);
      }
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt disclosure-hero" },
        h(
          "div",
          { className: "disclosure-hero-row" },
          h(
            "div",
            null,
            h("div", { className: "eyebrow" }, "Disclosure & Earnings"),
            h("h1", { className: "page-title" }, "공시/실적")
          ),
          statusRequest.loading && !statusRequest.data
            ? h("div", { className: "telegram-status-pill muted" }, "상태 확인 중")
            : status.authorized
              ? h("div", { className: "telegram-status-pill" }, "텔레그램 연결됨")
              : h("div", { className: "telegram-status-pill warning" }, "텔레그램 연결 필요")
        )
      ),
      false ? h(
        "div",
        { className: "panel telegram-control-panel telegram-earnings-panel" },
        h(
          "div",
          { className: "telegram-earnings-head" },
          h(SectionTitle, null, "공시 유형 검색"),
          h("span", { className: "summary-help" }, "Awake-실시간 주식 공시 정리채널")
        ),
        h(
          "div",
          { className: "disclosure-tabbar" },
          DISCLOSURE_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "disclosure-tab" + (disclosureCategory === tab.key ? " active" : ""),
                onClick: function () { changeDisclosureCategory(tab.key); },
              },
              tab.label
            );
          })
        ),
        h(
          "div",
          { className: "earnings-search-row" },
          h("button", {
            type: "button",
            className: "earnings-nav-button",
            onClick: navigateBackToThemes,
            title: "오늘의 주도주로 돌아가기",
            "aria-label": "오늘의 주도주로 돌아가기",
          }, "<"),
          h(
            "label",
            { className: "form-field earnings-company-field", ref: earningsSuggestWrapRef },
            "&days=45",
            h("input", {
              value: earningsQuery,
              onChange: function (event) { searchEarningsCompany(event.target.value); },
              onKeyDown: handleEarningsKeyDown,
              onFocus: selectTextOnFocus,
              onBlur: function () { setTimeout(function () { setEarningsSuggestions([]); }, 120); },
              placeholder: "예: 로보티즈, HD현대중공업",
            }),
            earningsSuggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list inline" },
                  earningsSuggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: (item.code || item.name || "") + index,
                        type: "button",
                        className: "autocomplete-item" + (index === earningsActiveIndex ? " active" : ""),
                        onMouseDown: function (event) { event.preventDefault(); },
                        onMouseEnter: function () { setEarningsActiveIndex(index); },
                        onClick: function () { chooseEarningsCompany(item); },
                      },
                      h("strong", null, item.name || item.query || ""),
                      h("span", null, [item.code, item.market].filter(Boolean).join(" · "))
                    );
                  })
                )
              : null
          ),
          h("button", {
            className: "primary-button",
            onClick: function () { runEarningsSearch(false); },
            disabled: earningsLoading || !status.authorized,
          }, earningsLoading ? "검색 중..." : "검색")
        ),
        earningsMessage ? h("div", { className: "notice-box compact" }, earningsMessage) : null,
        h(TelegramStockOverviewPanel, {
          payload: stockOverview,
          loading: stockOverviewLoading,
          message: stockOverviewMessage,
          consensus: wiseConsensusHistory,
          targetHistory: wiseTargetHistory,
          onOpenForwardConsensus: openWiseConsensusModal,
        }),
        h(
          "div",
          { className: "earnings-overview-actions" },
          h("button", {
            type: "button",
            className: "mini-button" + (financialTrendExpanded ? " active" : ""),
            onClick: toggleFinancialTrend,
            disabled: !String(earningsQuery || "").trim(),
          }, financialTrendExpanded ? "실적 추이 접기" : "실적 추이 보기")
        ),
        h(
          "div",
          { className: "earnings-result-visual-grid" },
          h(
            "div",
            { className: "earnings-scroll-box" },
            h(TelegramEarningsResults, {
              rows: earningsResults,
              emptyMessage: earningsLoading ? "텔레그램 메시지 검색 중입니다." : "기업명을 입력하면 선택한 유형의 공시를 최근 3년 범위에서 표시합니다.",
            }),
            earningsResults.length
              ? h(
                  "div",
                  { className: "earnings-more-row" },
                  h("button", {
                    className: "mini-button",
                    onClick: function () { runEarningsSearch(true); },
                    disabled: earningsLoading || !disclosureHasMore,
                  }, disclosureHasMore ? "최근 3년 내 더 보기" : "더 불러올 공시 없음")
                )
              : null
          ),
          h(EarningsTrendSidePanel, {
            trend: financialTrend,
            loading: financialTrendLoading,
            message: financialTrendMessage,
          })
        )
      ) : null,
      h(
        "div",
        { className: "panel telegram-earnings-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h(SectionTitle, null, marketScope === "kr" ? "시총 2000억 이상 실적 공시" : "시총 1조 이상 해외 실적 일정"),
            h("div", { className: "summary-help" },
              marketScope === "kr"
                ? (marketPayload
                  ? "최근 " + numberFormat(marketPayload.days, 0) + "일 · " + numberFormat(marketPayload.result_count, 0) + "건 · 스캔 " + numberFormat(marketPayload.scanned_count, 0) + "개 메시지"
                  : "텔레그램 공시 채널에서 실적 공시를 날짜순으로 모읍니다.")
                : (marketForeignRequest.data
                  ? (marketForeignRequest.data.start || "") + " ~ " + (marketForeignRequest.data.end || "") + " · 실적 " + numberFormat(marketForeignRequest.data.result_count, 0) + "개"
                  : "최근 2주간 시총 1조 이상 해외 발표 실적을 보여줍니다.")
            )
          ),
          h("button", {
            className: "mini-button",
            onClick: function () {
              if (marketScope === "kr") {
                loadMarketEarnings();
              } else {
                marketForeignRequest.refresh(true);
              }
            },
            disabled: marketScope === "kr" ? (marketLoading || !status.authorized) : marketForeignRequest.loading,
          }, marketScope === "kr"
            ? (marketLoading ? "불러오는 중..." : "새로고침")
            : (marketForeignRequest.loading ? "새로고침 중..." : "새로고침"))
        ),
        h(
          "div",
          { className: "disclosure-tabbar" },
          MARKET_EARNINGS_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "disclosure-tab" + (marketScope === tab.key ? " active" : ""),
                onClick: function () { setMarketScope(tab.key); },
              },
              tab.label
            );
          })
        ),
        marketScope === "kr" && marketMessage ? h("div", { className: "notice-box compact" }, marketMessage) : null,
        marketScope === "foreign" && ensureArray(marketForeignRequest.data && marketForeignRequest.data.errors).length
          ? h("div", { className: "notice-box compact warning" }, ensureArray(marketForeignRequest.data.errors).join(" / "))
          : null,
        h(
          "div",
          { className: "earnings-scroll-box market-earnings-scroll-box", ref: marketScrollBoxRef, onScroll: rememberMarketScroll },
          marketScope === "kr"
            ? (
              marketLoading && !marketPayload
                ? h(LoadingBlock, { compact: true, title: "실적 공시 수집 중", label: "최근 메시지를 훑어 시총 2000억 이상 종목과 매칭합니다." })
                : h(MarketEarningsTable, {
                    rows: ensureArray(marketPayload && marketPayload.results),
                    emptyMessage: status.authorized ? "조건에 맞는 실적 공시가 아직 없습니다." : "텔레그램 연결 후 확인할 수 있습니다.",
                  })
            )
            : (
              marketForeignRequest.loading && !ensureArray(marketForeignRequest.data && marketForeignRequest.data.rows).length
                ? h(LoadingBlock, { compact: true, title: "해외 발표 실적 수집 중", label: "최근 2주간 Yahoo 발표 실적과 시총 데이터를 정리하고 있습니다." })
                : h(ForeignReportedEarningsTable, {
                    rows: ensureArray(marketForeignRequest.data && marketForeignRequest.data.rows),
                    emptyMessage: "조건에 맞는 최근 해외 발표 실적이 없습니다.",
                  })
            )
        )
      ),
      marketScope === "kr" ? h(EarningsSurpriseRankList, {
        rows: ensureArray(marketPayload && marketPayload.results),
      }) : null,
      h(
        "div",
        { className: "panel upcoming-earnings-panel" },
        h(
          "div",
          { className: "section-toolbar upcoming-earnings-toolbar" },
          h("div", null,
            h(SectionTitle, null, "예정 실적 달력"),
            h("div", { className: "summary-help" },
              upcomingRequest.data
                ? (upcomingRequest.data.start || upcomingStart) + " ~ " + (upcomingRequest.data.end || "") + " · 날짜 " + numberFormat(upcomingRequest.data.date_count, 0) + "일 · 일정 " + numberFormat(upcomingRequest.data.result_count, 0) + "개"
                : "다음날부터 국내 KIND IR 일정과 해외 Yahoo 실적 일정을 날짜별로 묶어 보여줍니다."
            )
          ),
          h("div", { className: "upcoming-earnings-actions" },
            h("button", {
              className: "mini-button",
              onClick: function () { upcomingRequest.refresh(true); },
              disabled: upcomingRequest.loading,
            }, upcomingRequest.loading ? "새로고침 중..." : "새로고침")
          )
        ),
        h(
          "div",
          { className: "upcoming-earnings-tabbar" },
          UPCOMING_EARNINGS_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "upcoming-earnings-tab" + (upcomingScope === tab.key ? " active" : ""),
                onClick: function () { setUpcomingScope(tab.key); },
              },
              tab.label
            );
          }),
          h("div", { className: "upcoming-earnings-filter-note" },
            h("strong", null, upcomingScope === "kr" ? "국내 2주" : "해외 2주"),
            h("span", null, upcomingScope === "kr"
              ? "다음날부터 2주간, 시총 2000억 이상 국내 예정 실적만 표시합니다."
              : "다음날부터 2주간, 시총 1조 이상 해외 예정 실적만 표시합니다.")
          )
        ),
        ensureArray(upcomingRequest.data && upcomingRequest.data.errors).length
          ? h("div", { className: "notice-box compact warning" }, ensureArray(upcomingRequest.data.errors).join(" / "))
          : null,
        h(UpcomingEarningsCalendarPanel, {
          payload: upcomingRequest.data,
          loading: upcomingRequest.loading,
          error: upcomingRequest.error,
        })
      )
    );
  }

  function TelegramPage() {
    const savedTelegramState = loadTelegramSearchState() || {};
    const statusRequest = useFetchJson("/api/telegram/status");
    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [keywords, setKeywords] = useState(savedTelegramState.keywords || "");
    const [matchMode, setMatchMode] = useState(savedTelegramState.matchMode || "any");
    const [exactPhrase, setExactPhrase] = useState(!!savedTelegramState.exactPhrase);
    const [hasFile, setHasFile] = useState(savedTelegramState.hasFile || "all");
    const [startDate, setStartDate] = useState(savedTelegramState.startDate || "");
    const [endDate, setEndDate] = useState(savedTelegramState.endDate || "");
    const [chatQuery, setChatQuery] = useState(savedTelegramState.chatQuery || "");
    const [selectedChats, setSelectedChats] = useState(ensureArray(savedTelegramState.selectedChats));
    const [allRoomsSearch, setAllRoomsSearch] = useState(Object.prototype.hasOwnProperty.call(savedTelegramState, "allRoomsSearch") ? !!savedTelegramState.allRoomsSearch : !ensureArray(savedTelegramState.selectedChats).length);
    const [favoriteChatGroups, setFavoriteChatGroups] = useState(ensureArray(savedTelegramState.favoriteChatGroups));
    const [favoriteGroupName, setFavoriteGroupName] = useState("");
    const [results, setResults] = useState(ensureArray(savedTelegramState.results));
    const [jobState, setJobState] = useState(savedTelegramState.jobState || null);
    const [formMessage, setFormMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [showConnection, setShowConnection] = useState(true);
    const [earningsQuery, setEarningsQuery] = useState(savedTelegramState.earningsQuery || "");
    const [earningsSuggestions, setEarningsSuggestions] = useState([]);
    const [earningsActiveIndex, setEarningsActiveIndex] = useState(0);
    const [earningsResults, setEarningsResults] = useState(ensureArray(savedTelegramState.earningsResults));
    const [earningsMessage, setEarningsMessage] = useState(savedTelegramState.earningsMessage || "");
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [earningsJobState, setEarningsJobState] = useState(null);
    const [disclosureCategory, setDisclosureCategory] = useState(savedTelegramState.disclosureCategory || "earnings");
    const [disclosureNextOffsetId, setDisclosureNextOffsetId] = useState(Number(savedTelegramState.disclosureNextOffsetId || 0));
    const [disclosureHasMore, setDisclosureHasMore] = useState(!!savedTelegramState.disclosureHasMore);
    const [financialTrend, setFinancialTrend] = useState(savedTelegramState.financialTrend || null);
    const [financialTrendLoading, setFinancialTrendLoading] = useState(false);
    const [financialTrendMessage, setFinancialTrendMessage] = useState(savedTelegramState.financialTrendMessage || "");
    const [financialTrendExpanded, setFinancialTrendExpanded] = useState(!!savedTelegramState.financialTrendExpanded);
    const [businessSegments, setBusinessSegments] = useState(savedTelegramState.businessSegments || null);
    const [businessSegmentsLoading, setBusinessSegmentsLoading] = useState(false);
    const [businessSegmentsMessage, setBusinessSegmentsMessage] = useState(savedTelegramState.businessSegmentsMessage || "");
    const [stockOverview, setStockOverview] = useState(savedTelegramState.stockOverview || null);
    const [stockOverviewLoading, setStockOverviewLoading] = useState(false);
    const [stockOverviewMessage, setStockOverviewMessage] = useState(savedTelegramState.stockOverviewMessage || "");
    const [stockNewsBrief, setStockNewsBrief] = useState(savedTelegramState.stockNewsBrief || null);
    const [stockNewsBriefLoading, setStockNewsBriefLoading] = useState(false);
    const [stockNewsBriefMessage, setStockNewsBriefMessage] = useState(savedTelegramState.stockNewsBriefMessage || "");
    const [wiseConsensusHistory, setWiseConsensusHistory] = useState(savedTelegramState.wiseConsensusHistory || null);
    const [wiseConsensusHistoryLoading, setWiseConsensusHistoryLoading] = useState(false);
    const [wiseConsensusHistoryMessage, setWiseConsensusHistoryMessage] = useState(savedTelegramState.wiseConsensusHistoryMessage || "");
    const [wiseTargetHistory, setWiseTargetHistory] = useState(savedTelegramState.wiseTargetHistory || null);
    const [wiseTargetHistoryLoading, setWiseTargetHistoryLoading] = useState(false);
    const [wiseTargetHistoryMessage, setWiseTargetHistoryMessage] = useState(savedTelegramState.wiseTargetHistoryMessage || "");
    const [wiseConsensusModalOpen, setWiseConsensusModalOpen] = useState(false);
    const [companyLinkLoading, setCompanyLinkLoading] = useState("");
    const [reportListModal, setReportListModal] = useState({ open: false, loading: false, error: "", payload: null });
    const [investorFlowModal, setInvestorFlowModal] = useState({ open: false, loading: false, error: "", payload: null });
    const pollRef = useRef(null);
    const earningsPollRef = useRef(null);
    const earningsJobModeRef = useRef("replace");
    const linkedMessageSearchRef = useRef({ pending: false, company: "" });
    const pendingFinancialTrendRef = useRef("");
    const earningsTimerRef = useRef(null);
    const earningsSuggestWrapRef = useRef(null);
    const backendStateLoadedRef = useRef(false);
    const backendStateSaveTimerRef = useRef(null);
    const overviewHydrationRefreshDoneRef = useRef(false);

    async function loadStockNewsBrief(company, forceRefresh) {
      const target = String(company || "").trim();
      if (!target) {
        setStockNewsBrief(null);
        setStockNewsBriefMessage("");
        return;
      }
      setStockNewsBriefLoading(true);
      setStockNewsBriefMessage("");
      try {
        const payload = await fetchJson(
          "/api/stocks/news-brief?q=" + encodeURIComponent(target) +
            "&days=7&force_refresh=" + (forceRefresh ? "true" : "false"),
          { noCache: !!forceRefresh }
        );
        setStockNewsBrief(payload);
        setStockNewsBriefMessage(payload && payload.ai_error ? "Gemini 요약을 불러오지 못해 중요 기사 목록만 표시합니다." : "");
      } catch (err) {
        setStockNewsBrief(null);
        setStockNewsBriefMessage(err.message || String(err));
      } finally {
        setStockNewsBriefLoading(false);
      }
    }

    useEffect(function () {
      const status = statusRequest.data;
      if (!status) {
        return;
      }
      setPhone(function (current) { return current || status.phone || ""; });
      setShowConnection(!status.authorized);
    }, [statusRequest.data]);

    useEffect(function () {
      return function () {
        if (pollRef.current) {
          clearTimeout(pollRef.current);
        }
        if (earningsTimerRef.current) {
          clearTimeout(earningsTimerRef.current);
        }
        if (earningsPollRef.current) {
          clearTimeout(earningsPollRef.current);
        }
        if (backendStateSaveTimerRef.current) {
          clearTimeout(backendStateSaveTimerRef.current);
        }
      };
    }, []);

    function applyTelegramSavedState(state) {
      const source = state || {};
      setKeywords(String(source.keywords || ""));
      setMatchMode(source.matchMode === "all" ? "all" : "any");
      setExactPhrase(!!source.exactPhrase);
      setHasFile(["all", "with", "without"].indexOf(source.hasFile) >= 0 ? source.hasFile : "all");
      setStartDate(String(source.startDate || ""));
      setEndDate(String(source.endDate || ""));
      setChatQuery(String(source.chatQuery || ""));
      const nextSelectedChats = ensureArray(source.selectedChats).map(function (item) {
        return { id: Number(item.id), name: String(item.name || "") };
      }).filter(function (item) {
        return Number.isFinite(item.id) && item.name;
      });
      setSelectedChats(nextSelectedChats);
      setAllRoomsSearch(Object.prototype.hasOwnProperty.call(source, "allRoomsSearch") ? !!source.allRoomsSearch : !nextSelectedChats.length);
      setFavoriteChatGroups(ensureArray(source.favoriteChatGroups).map(function (group) {
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
      }));
      setResults(ensureArray(source.results));
      setJobState(source.jobState || null);
      setEarningsQuery(String(source.earningsQuery || ""));
      setEarningsResults(ensureArray(source.earningsResults));
      setEarningsMessage(String(source.earningsMessage || ""));
      setDisclosureCategory(source.disclosureCategory || "earnings");
      setDisclosureNextOffsetId(Number(source.disclosureNextOffsetId || 0));
      setDisclosureHasMore(!!source.disclosureHasMore);
      setFinancialTrend(source.financialTrend || null);
      setFinancialTrendMessage(String(source.financialTrendMessage || ""));
      setFinancialTrendExpanded(!!source.financialTrendExpanded);
      setBusinessSegments(source.businessSegments || null);
      setBusinessSegmentsMessage(String(source.businessSegmentsMessage || ""));
      setStockOverview(source.stockOverview || null);
      setStockOverviewMessage(String(source.stockOverviewMessage || ""));
      setStockNewsBrief(source.stockNewsBrief || null);
      setStockNewsBriefMessage(String(source.stockNewsBriefMessage || ""));
      setWiseConsensusHistory(source.wiseConsensusHistory || null);
      setWiseConsensusHistoryMessage(String(source.wiseConsensusHistoryMessage || ""));
      setWiseTargetHistory(source.wiseTargetHistory || null);
      setWiseTargetHistoryMessage(String(source.wiseTargetHistoryMessage || ""));
    }

    function currentTelegramState() {
      return {
        keywords: keywords,
        matchMode: matchMode,
        exactPhrase: exactPhrase,
        hasFile: hasFile,
        startDate: startDate,
        endDate: endDate,
        chatQuery: chatQuery,
        allRoomsSearch: allRoomsSearch,
        selectedChats: selectedChats,
        favoriteChatGroups: favoriteChatGroups,
        results: results,
        jobState: jobState,
        earningsQuery: earningsQuery,
        earningsResults: earningsResults,
        earningsMessage: earningsMessage,
        disclosureCategory: disclosureCategory,
        disclosureNextOffsetId: disclosureNextOffsetId,
        disclosureHasMore: disclosureHasMore,
        financialTrend: financialTrend,
        financialTrendMessage: financialTrendMessage,
        financialTrendExpanded: financialTrendExpanded,
        businessSegments: businessSegments,
        businessSegmentsMessage: businessSegmentsMessage,
        stockOverview: stockOverview,
        stockOverviewMessage: stockOverviewMessage,
        stockNewsBrief: stockNewsBrief,
        stockNewsBriefMessage: stockNewsBriefMessage,
        wiseConsensusHistory: wiseConsensusHistory,
        wiseConsensusHistoryMessage: wiseConsensusHistoryMessage,
        wiseTargetHistory: wiseTargetHistory,
        wiseTargetHistoryMessage: wiseTargetHistoryMessage,
      };
    }

    function applyThemeStockSearch(nextCompany) {
      const pendingCompany = String(nextCompany || "").trim();
      if (!pendingCompany) {
        return;
      }
      setEarningsQuery(pendingCompany);
      setEarningsSuggestions([]);
      setEarningsActiveIndex(0);
      setEarningsResults([]);
      setEarningsMessage("");
      setDisclosureCategory("earnings");
      setDisclosureNextOffsetId(0);
      setDisclosureHasMore(false);
      setFinancialTrend(null);
      setFinancialTrendMessage("");
      setFinancialTrendExpanded(false);
      setBusinessSegments(null);
      setBusinessSegmentsMessage("");
      setStockOverview(null);
      setStockOverviewMessage("");
      setStockNewsBrief(null);
      setStockNewsBriefMessage("");
      setWiseConsensusHistory(null);
      setWiseConsensusHistoryMessage("");
      setWiseTargetHistory(null);
      setWiseTargetHistoryMessage("");
      setTimeout(function () {
        runEarningsSearch(false, pendingCompany, "earnings", true);
      }, 0);
    }

    useEffect(function () {
      let cancelled = false;
      let appliedBackendState = false;
      fetchJson("/api/telegram/ui_state", { noCache: true })
        .then(function (payload) {
          if (cancelled) {
            return;
          }
          const backendState = payload && payload.state ? payload.state : null;
          if (backendState && Object.keys(backendState).length) {
            appliedBackendState = true;
            applyTelegramSavedState(backendState);
          }
        })
        .catch(function () {})
        .finally(function () {
          if (!cancelled) {
            backendStateLoadedRef.current = true;
            const pendingThemeStock = consumeTelegramStockNavigation();
            const pendingCompany = String((pendingThemeStock && pendingThemeStock.query) || "").trim();
            if (pendingCompany) {
              applyThemeStockSearch(pendingCompany);
            }
            if (!appliedBackendState) {
              postJson("/api/telegram/ui_state", { state: currentTelegramState() }).catch(function () {});
            }
          }
        });
      return function () {
        cancelled = true;
      };
    }, []);

    useEffect(function () {
      function handleThemeStockNavigation(event) {
        const payload = (event && event.detail) || {};
        if (payload.page !== "telegram") {
          return;
        }
        const directQuery = String(payload.stockQuery || "").trim();
        const stashed = consumeTelegramStockNavigation();
        const stashedQuery = String((stashed && stashed.query) || "").trim();
        const targetQuery = directQuery || stashedQuery;
        if (!targetQuery) {
          return;
        }
        applyThemeStockSearch(targetQuery);
      }
      window.addEventListener(PAGE_NAV_EVENT, handleThemeStockNavigation);
      return function () {
        window.removeEventListener(PAGE_NAV_EVENT, handleThemeStockNavigation);
      };
    }, [runEarningsSearch]);

    useEffect(function () {
      function closeOnOutsideClick(event) {
        if (!earningsSuggestWrapRef.current) {
          return;
        }
        if (!earningsSuggestWrapRef.current.contains(event.target)) {
          setEarningsSuggestions([]);
        }
      }
      document.addEventListener("mousedown", closeOnOutsideClick);
      return function () {
        document.removeEventListener("mousedown", closeOnOutsideClick);
      };
    }, []);

    useEffect(function () {
      if (jobState && jobState.job_id && !jobState.finished) {
        setJobState(Object.assign({}, jobState, {
          finished: true,
          message: "이전 검색 결과를 불러왔습니다.",
        }));
      }
    }, []);

    useEffect(function () {
      if (!backendStateLoadedRef.current) {
        return;
      }
      const target = String(earningsQuery || "").trim();
      if (!target || overviewHydrationRefreshDoneRef.current) {
        return;
      }
      const overviewNeedsRefresh = !stockOverview || (!Number.isFinite(Number(stockOverview.forward_per)) && !Number.isFinite(Number(stockOverview.forward_pbr)));
      const consensusNeedsRefresh = !wiseConsensusHistory || !wiseConsensusHistory.latest;
      const targetHistoryNeedsRefresh = !wiseTargetHistory || !ensureArray(wiseTargetHistory.series).length;
      const newsBriefNeedsRefresh = !stockNewsBrief;
      if (!overviewNeedsRefresh && !consensusNeedsRefresh && !targetHistoryNeedsRefresh && !newsBriefNeedsRefresh) {
        overviewHydrationRefreshDoneRef.current = true;
        return;
      }
      overviewHydrationRefreshDoneRef.current = true;
      loadStockOverview(target);
      loadWiseConsensusHistory(target);
      loadWiseTargetHistory(target);
      loadStockNewsBrief(target, false);
    }, [earningsQuery, stockOverview, wiseConsensusHistory, wiseTargetHistory, stockNewsBrief]);

    useEffect(function () {
      const snapshot = currentTelegramState();
      persistTelegramSearchState(snapshot);
      if (!backendStateLoadedRef.current) {
        return;
      }
      if (backendStateSaveTimerRef.current) {
        clearTimeout(backendStateSaveTimerRef.current);
      }
      backendStateSaveTimerRef.current = setTimeout(function () {
        postJson("/api/telegram/ui_state", { state: snapshot }).catch(function () {});
      }, 350);
    }, [keywords, matchMode, exactPhrase, hasFile, startDate, endDate, chatQuery, allRoomsSearch, selectedChats, favoriteChatGroups, results, jobState, earningsQuery, earningsResults, earningsMessage, disclosureCategory, disclosureNextOffsetId, disclosureHasMore, financialTrend, financialTrendMessage, businessSegments, businessSegmentsMessage, stockOverview, stockOverviewMessage, stockNewsBrief, stockNewsBriefMessage, wiseConsensusHistory, wiseConsensusHistoryMessage, wiseTargetHistory, wiseTargetHistoryMessage]);

    useEffect(function () {
      const categoryLabel = disclosureTabLabel(disclosureCategory);
      const detail = earningsQuery
        ? categoryLabel + ": " + earningsQuery
        : keywords
          ? "검색: " + keywords
          : "";
      emitWindowTitleDetail("telegram", detail);
    }, [earningsQuery, disclosureCategory, keywords]);

    const dialogs = ensureArray(statusRequest.data && statusRequest.data.dialogs);
    const filteredDialogs = useMemo(function () {
      const query = normalizeSearchValue(chatQuery);
      if (!query) {
        return [];
      }
      return dialogs
        .filter(function (dialog) {
          return normalizeSearchValue(dialog.name || "").indexOf(query) >= 0;
        })
        .slice(0, 50);
    }, [chatQuery, dialogs]);

    const selectedChatIds = selectedChats.map(function (item) { return item.id; });

    function syncJob(job) {
      setJobState(job);
      setResults(ensureArray(job && job.results));
      if (!job || job.finished) {
        pollRef.current = null;
        return;
      }
      pollRef.current = setTimeout(async function () {
        try {
          const next = await fetchJson("/api/telegram/search_jobs/" + job.job_id);
          syncJob(next);
        } catch (err) {
          setFormMessage(err.message || String(err));
        }
      }, 1200);
    }

    function mergeEarningsResults(current, incoming, append) {
      const source = append ? ensureArray(current).concat(ensureArray(incoming)) : ensureArray(incoming);
      const seen = {};
      return source.filter(function (row) {
        const key = row.chat_id + ":" + row.message_id;
        if (seen[key]) {
          return false;
        }
        seen[key] = true;
        return true;
      });
    }

    function syncEarningsJob(job, append) {
      const shouldAppend = append || earningsJobModeRef.current === "append";
      const incomingRows = ensureArray(job && job.results);
      setEarningsJobState(job);
      setEarningsResults(function (current) {
        return mergeEarningsResults(current, incomingRows, shouldAppend);
      });
      setDisclosureNextOffsetId(Number(job && job.next_offset_id || 0));
      setDisclosureHasMore(!!(job && job.has_more));
      setEarningsMessage(job && job.message ? job.message : "");
      if (
        linkedMessageSearchRef.current.pending &&
        linkedMessageSearchRef.current.company &&
        (incomingRows.length || (job && job.finished))
      ) {
        const linkedCompany = linkedMessageSearchRef.current.company;
        linkedMessageSearchRef.current = { pending: false, company: "" };
        setTimeout(function () {
          runSearch(linkedCompany);
        }, 0);
      }
      if (!job || job.finished || !job.job_id) {
        setEarningsLoading(false);
        if (earningsPollRef.current) {
          clearTimeout(earningsPollRef.current);
        }
        earningsPollRef.current = null;
        return;
      }
      if (earningsPollRef.current) {
        clearTimeout(earningsPollRef.current);
        earningsPollRef.current = null;
      }
      earningsPollRef.current = setTimeout(async function () {
        try {
          const next = await fetchJson("/api/telegram/earnings_search_jobs/" + job.job_id);
          syncEarningsJob(next, shouldAppend);
        } catch (err) {
          setEarningsLoading(false);
          setEarningsMessage(err.message || String(err));
        }
      }, 250);
    }

    async function cancelEarningsSearch() {
      const job = earningsJobState;
      if (!job || !job.job_id) {
        setEarningsLoading(false);
        setEarningsMessage("검색 상태를 초기화했습니다.");
        return;
      }
      if (earningsPollRef.current) {
        clearTimeout(earningsPollRef.current);
        earningsPollRef.current = null;
      }
      try {
        const cancelled = await postJson("/api/telegram/earnings_search_jobs/" + job.job_id + "/cancel", {});
        syncEarningsJob(cancelled, earningsJobModeRef.current === "append");
      } catch (err) {
        setEarningsLoading(false);
        setEarningsMessage(err.message || String(err));
      }
    }

    async function sendCode() {
      setSubmitting(true);
      setFormMessage("");
      try {
        const payload = await postJson("/api/telegram/send_code", {
          api_id: Number(apiId || 0),
          api_hash: apiHash,
          phone: phone,
        });
        setFormMessage(payload.message || "인증 코드를 전송했습니다.");
      } catch (err) {
        setFormMessage(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    }

    async function verifyCode() {
      setSubmitting(true);
      setFormMessage("");
      try {
        const payload = await postJson("/api/telegram/verify_code", {
          phone: phone,
          code: code,
          password: password || null,
        });
        setFormMessage(payload.message || "로그인이 완료되었습니다.");
        await statusRequest.refresh();
        setShowConnection(false);
      } catch (err) {
        setFormMessage(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    }

    function addChat(dialog) {
      if (selectedChatIds.indexOf(dialog.id) >= 0) {
        return;
      }
      setSelectedChats(selectedChats.concat([{ id: dialog.id, name: dialog.name }]));
      setAllRoomsSearch(false);
      setChatQuery("");
    }

    function removeChat(chatId) {
      setSelectedChats(selectedChats.filter(function (item) { return item.id !== chatId; }));
    }

    function normalizeChatSelection(chats) {
      const seen = {};
      return ensureArray(chats).map(function (item) {
        return { id: Number(item.id), name: String(item.name || "") };
      }).filter(function (item) {
        if (!Number.isFinite(item.id) || !item.name || seen[item.id]) {
          return false;
        }
        seen[item.id] = true;
        return true;
      });
    }

    function saveFavoriteChatGroup() {
      const groupName = String(favoriteGroupName || "").trim();
      const chats = normalizeChatSelection(selectedChats);
      if (!groupName) {
        setFormMessage("즐겨찾기 그룹 이름을 입력해 주세요.");
        return;
      }
      if (!chats.length) {
        setFormMessage("즐겨찾기 그룹에 넣을 방을 먼저 선택해 주세요.");
        return;
      }
      setFavoriteChatGroups(function (current) {
        const nextGroup = { id: makeId("tg-group"), name: groupName, chats: chats };
        return ensureArray(current).filter(function (group) { return group.name !== groupName; }).concat([nextGroup]);
      });
      setFavoriteGroupName("");
      setFormMessage("즐겨찾기 그룹을 저장했습니다.");
    }

    function applyFavoriteChatGroup(group) {
      const chats = normalizeChatSelection(group && group.chats);
      if (!chats.length) {
        return;
      }
      setSelectedChats(chats);
      setAllRoomsSearch(false);
      setChatQuery("");
      setFormMessage("'" + group.name + "' 그룹으로 검색 대상을 전환했습니다.");
    }

    function removeFavoriteChatGroup(groupId) {
      setFavoriteChatGroups(function (current) {
        return ensureArray(current).filter(function (group) { return group.id !== groupId; });
      });
    }

    function chooseEarningsCompany(item) {
      setEarningsQuery(item.name || item.query || "");
      setEarningsSuggestions([]);
      setEarningsActiveIndex(0);
    }

    function searchEarningsCompany(value) {
      setEarningsQuery(value);
      setEarningsActiveIndex(0);
      if (earningsTimerRef.current) {
        clearTimeout(earningsTimerRef.current);
      }
      if (!value || value.trim().length < 1) {
        setEarningsSuggestions([]);
        return;
      }
      earningsTimerRef.current = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()));
          setEarningsSuggestions(ensureArray(payload.items || []));
        } catch (err) {
          setEarningsSuggestions([]);
        }
      }, 160);
    }

    function handleEarningsKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        setEarningsSuggestions([]);
        if (!earningsLoading && status.authorized) {
          runEarningsSearch();
        }
        return;
      }
      if (!earningsSuggestions.length) {
        if (event.key === "Enter") {
          event.preventDefault();
          setEarningsSuggestions([]);
          runEarningsSearch();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setEarningsActiveIndex((earningsActiveIndex + 1) % earningsSuggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setEarningsActiveIndex((earningsActiveIndex - 1 + earningsSuggestions.length) % earningsSuggestions.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const selected = earningsSuggestions[earningsActiveIndex] || earningsSuggestions[0];
        setEarningsSuggestions([]);
        if (selected) {
          chooseEarningsCompany(selected);
          setTimeout(function () { runEarningsSearch(false, selected.name || selected.query || ""); }, 0);
        } else {
          runEarningsSearch(false);
        }
      } else if (event.key === "Escape") {
        setEarningsSuggestions([]);
      }
    }

    function changeDisclosureCategory(category) {
      setDisclosureCategory(category);
      setDisclosureNextOffsetId(0);
      setDisclosureHasMore(false);
      setEarningsResults([]);
      setEarningsMessage("");
      if (String(earningsQuery || "").trim()) {
        setTimeout(function () { runEarningsSearch(false, null, category); }, 0);
      }
    }

    async function loadFinancialTrend(company) {
      const target = String(company || "").trim();
      if (!target) {
        setFinancialTrend(null);
        setFinancialTrendMessage("");
        return;
      }
      setFinancialTrendLoading(true);
      setFinancialTrendMessage("");
      try {
        const payload = await fetchJson("/api/dart/earnings-trend?company=" + encodeURIComponent(target));
        setFinancialTrend(payload);
      } catch (err) {
        setFinancialTrend(null);
        setFinancialTrendMessage(err.message || String(err));
      } finally {
        setFinancialTrendLoading(false);
      }
    }

    async function loadBusinessSegments(company) {
      const target = String(company || "").trim();
      if (!target) {
        setBusinessSegments(null);
        setBusinessSegmentsMessage("");
        return;
      }
      setBusinessSegmentsLoading(true);
      setBusinessSegmentsMessage("");
      try {
        const payload = await fetchJson("/api/kind/business-segments?company=" + encodeURIComponent(target), { noCache: true });
        setBusinessSegments(payload);
      } catch (err) {
        setBusinessSegments(null);
        setBusinessSegmentsMessage(err.message || String(err));
      } finally {
        setBusinessSegmentsLoading(false);
      }
    }

    async function loadStockOverview(company) {
      const target = String(company || "").trim();
      if (!target) {
        setStockOverview(null);
        setStockOverviewMessage("");
        return;
      }
      setStockOverviewLoading(true);
      setStockOverviewMessage("");
      try {
        const payload = await fetchJson("/api/stocks/overview?name=" + encodeURIComponent(target) + "&months=3", { noCache: true });
        setStockOverview(payload);
      } catch (err) {
        setStockOverview(null);
        setStockOverviewMessage(err.message || String(err));
      } finally {
        setStockOverviewLoading(false);
      }
    }

    async function loadWiseTargetHistory(company) {
      const target = String(company || "").trim();
      if (!target) {
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage("");
        return;
      }
      setWiseTargetHistoryLoading(true);
      setWiseTargetHistoryMessage("");
      try {
        const payload = await fetchJson("/api/stocks/wisereport-targets?name=" + encodeURIComponent(target) + "&months=12", { noCache: true });
        setWiseTargetHistory(payload);
      } catch (err) {
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage(err.message || String(err));
      } finally {
        setWiseTargetHistoryLoading(false);
      }
    }

    async function loadWiseConsensusHistory(company) {
      const target = String(company || "").trim();
      if (!target) {
        setWiseConsensusHistory(null);
        setWiseConsensusHistoryMessage("");
        return;
      }
      setWiseConsensusHistoryLoading(true);
      setWiseConsensusHistoryMessage("");
      try {
        const payload = await fetchJson("/api/stocks/wisereport-consensus?name=" + encodeURIComponent(target) + "&fin_gubun=MAIN", { noCache: true });
        setWiseConsensusHistory(payload);
      } catch (err) {
        setWiseConsensusHistory(null);
        setWiseConsensusHistoryMessage(err.message || String(err));
      } finally {
        setWiseConsensusHistoryLoading(false);
      }
    }

    async function toggleFinancialTrend() {
      const nextExpanded = !financialTrendExpanded;
      setFinancialTrendExpanded(nextExpanded);
      if (!nextExpanded) {
        return;
      }
      const target = String(earningsQuery || "").trim();
      if (!target) {
        return;
      }
      if (!financialTrend && !financialTrendLoading) {
        await loadFinancialTrend(target);
      }
    }

    function navigateBackToThemes() {
      const target = String(earningsQuery || "").trim();
      if (target) {
        stashThemeStockNavigation(target);
      }
      requestPageNavigation("themes", { stockQuery: target || "" });
    }

    async function runEarningsSearch(append, overrideCompany, overrideCategory, forceLinkedMessageSearch) {
      const company = String(overrideCompany || earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage("사업보고서를 열 기업명을 입력해 주세요.");
        return;
      }
      overviewHydrationRefreshDoneRef.current = true;
      setEarningsSuggestions([]);
      const category = overrideCategory || disclosureCategory;
      setEarningsLoading(true);
      setEarningsMessage("");
      if (earningsPollRef.current) {
        clearTimeout(earningsPollRef.current);
        earningsPollRef.current = null;
      }
      earningsJobModeRef.current = append ? "append" : "replace";
      if (!append) {
        setEarningsResults([]);
        setDisclosureNextOffsetId(0);
        setDisclosureHasMore(false);
        setEarningsJobState(null);
        setKeywords(company);
        const shouldRunLinkedMessageSearch = !!forceLinkedMessageSearch || !overrideCategory;
        linkedMessageSearchRef.current = {
          pending: shouldRunLinkedMessageSearch,
          company: shouldRunLinkedMessageSearch ? company : "",
        };
        setFinancialTrend(null);
        setFinancialTrendMessage("");
        setFinancialTrendExpanded(false);
        setBusinessSegments(null);
        setBusinessSegmentsMessage("");
        setStockOverview(null);
        setStockOverviewMessage("");
        setStockNewsBrief(null);
        setStockNewsBriefMessage("");
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage("");
        loadStockOverview(company);
        loadStockNewsBrief(company, false);
        loadWiseConsensusHistory(company);
        loadWiseTargetHistory(company);
        if (jobState && jobState.job_id && !jobState.finished) {
          postJson("/api/telegram/search_jobs/" + jobState.job_id + "/cancel", {})
            .then(syncJob)
            .catch(function () {});
        }
        await postJson("/api/telegram/jobs/cancel_all", {}).catch(function () {});
      }
      try {
        const job = await postJson("/api/telegram/earnings_search_jobs", {
          company: company,
          category: category,
          limit: 20,
          offset_id: append ? disclosureNextOffsetId || null : null,
        });
        syncEarningsJob(job, append);
      } catch (err) {
        setEarningsLoading(false);
        setEarningsMessage(err.message || String(err));
      }
    }

    async function runSearch(overrideKeywords) {
      const searchText = String(overrideKeywords == null ? keywords : overrideKeywords);
      const tokens = searchText
        .split(/[\s,;]+/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
      if (!tokens.length) {
        setFormMessage("검색할 단어를 하나 이상 입력해 주세요.");
        return;
      }
      if (!allRoomsSearch && !selectedChatIds.length) {
        setFormMessage("모든 방 검색을 끄려면 검색할 방이나 즐겨찾기 그룹을 선택해 주세요.");
        return;
      }
      setSubmitting(true);
      setFormMessage("");
      setResults([]);
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      try {
        const job = await postJson("/api/telegram/search_jobs", {
          keywords: tokens,
          chat_ids: allRoomsSearch ? null : selectedChatIds,
          has_file: hasFile === "all" ? null : hasFile === "with",
          match_mode: matchMode,
          exact_phrase: exactPhrase,
          start_date: startDate || null,
          end_date: endDate || null,
        });
        syncJob(job);
      } catch (err) {
        setFormMessage(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    }

    function closeReportListModal() {
      setReportListModal({ open: false, loading: false, error: "", payload: null });
    }

    function openWiseConsensusModal() {
      setWiseConsensusModalOpen(true);
    }

    function closeWiseConsensusModal() {
      setWiseConsensusModalOpen(false);
    }

    async function openKindReportList(reportScope) {
      const scope = reportScope === "business" ? "business" : "periodic";
      const company = String(earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage((scope === "periodic" ? "공시리스트" : "사업보고서 목록") + "를 열 종목명을 입력해 주세요.");
        return;
      }
      setCompanyLinkLoading(scope === "periodic" ? "kind-report-list" : "kind-business-list");
      setEarningsMessage("");
      setReportListModal({ open: true, loading: true, error: "", payload: null });
      try {
        const payload = await fetchJson(
          "/api/kind/report-list?company=" + encodeURIComponent(company) +
          "&scope=" + encodeURIComponent(scope) +
          "&years=3",
          { noCache: true }
        );
        setReportListModal({ open: true, loading: false, error: "", payload: payload });
        setEarningsMessage((payload.stock_name || company) + " 최근 3개년 공시 목록을 불러왔습니다.");
      } catch (err) {
        const message = err.message || String(err);
        setReportListModal({ open: true, loading: false, error: message, payload: null });
        setEarningsMessage(message);
      } finally {
        setCompanyLinkLoading("");
      }
    }

    async function openKindReportListItem(url) {
      if (!url) {
        return;
      }
      try {
        await openUrlInDefaultBrowser(url);
      } catch (err) {
        setEarningsMessage(err.message || String(err));
      }
    }

    async function resolveCompanyStockForLinks() {
      const company = String(earningsQuery || "").trim();
      if (!company) {
        throw new Error("기업명을 입력해 주세요.");
      }
      const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(company) + "&limit=1", { noCache: true });
      const item = ensureArray(payload.items)[0];
      const code = String((item && item.code) || "").replace(/\D/g, "").padStart(6, "0");
      if (!item || !code || code.length !== 6) {
        throw new Error("해당 기업의 종목코드를 찾지 못했습니다.");
      }
      return { code: code, name: item.name || company };
    }

    async function openCompanyInfoSite(site) {
      setCompanyLinkLoading(site);
      setEarningsMessage("");
      try {
        const stock = await resolveCompanyStockForLinks();
        if (site === "tradingview") {
          const payload = await postJson("/api/tradingview/open", {
            stock_code: stock.code,
            stock_name: stock.name,
          });
          setEarningsMessage(payload.message || ((payload.stock_name || stock.name) + " 차트를 TradingView에서 열었습니다."));
          return;
        }
        const url = site === "wisereport"
          ? "https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd=" + encodeURIComponent(stock.code)
          : site === "irgo"
            ? "https://m.irgo.co.kr/IR-COMP/" + encodeURIComponent(stock.code) + "/" + encodeURIComponent(stock.name + "-IR-PAGE")
            : "https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd=" + encodeURIComponent(stock.code);
        await openUrlInDefaultBrowser(url);
        setEarningsMessage(stock.name + " 정보를 " + (site === "wisereport" ? "WiseReport" : site === "irgo" ? "IRGO" : "외부 사이트") + "에서 열었습니다.");
      } catch (err) {
        setEarningsMessage(err.message || String(err));
      } finally {
        setCompanyLinkLoading("");
      }
    }

    function closeInvestorFlowPopup() {
      setInvestorFlowModal({ open: false, loading: false, error: "", payload: null });
    }

    async function openInvestorFlowPopup() {
      setCompanyLinkLoading("flows");
      setEarningsMessage("");
      setInvestorFlowModal({ open: true, loading: true, error: "", payload: null });
      try {
        const stock = await resolveCompanyStockForLinks();
        const payload = await fetchJson(
          "/api/stocks/investor-flows?code=" + encodeURIComponent(stock.code) +
            "&name=" + encodeURIComponent(stock.name || "") +
            "&days=45",
          { noCache: true }
        );
        setInvestorFlowModal({ open: true, loading: false, error: "", payload: payload });
      } catch (err) {
        setInvestorFlowModal({ open: true, loading: false, error: err.message || String(err), payload: null });
      } finally {
        setCompanyLinkLoading("");
      }
    }

    function flowClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) {
        return "flow-number neutral";
      }
      return "flow-number " + (number > 0 ? "positive" : "negative");
    }

    function formatFlowNumber(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, 0);
    }

    function formatFlowPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, 2) + "%";
    }

    function renderInvestorFlowPopup() {
      if (!investorFlowModal.open) {
        return null;
      }
      const payload = investorFlowModal.payload || {};
      const rows = ensureArray(payload.rows);
      const columns = ensureArray(payload.columns);
      const totals = payload.totals || {};
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeInvestorFlowPopup },
        h(
          "div",
          { className: "modal-panel investor-flow-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head investor-flow-head" },
            h(
              "div",
              null,
              h("span", { className: "eyebrow" }, "일별 주체별 수급"),
              h("h2", null, payload.stock_name ? payload.stock_name + " (" + payload.stock_code + ")" : "수급 조회")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeInvestorFlowPopup }, "닫기")
          ),
          investorFlowModal.loading
            ? h("div", { className: "stock-chart-loading" }, "수급 데이터를 불러오는 중입니다.")
            : investorFlowModal.error
              ? h("div", { className: "stock-chart-error" }, investorFlowModal.error)
              : h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "investor-flow-summary" },
                    h("span", null, [payload.from_date, payload.to_date].filter(Boolean).join(" ~ ")),
                    h("span", null, payload.source || "수급 데이터"),
                    h("span", null, "단위: " + (payload.unit || "주"))
                  ),
                  payload.note ? h("div", { className: "notice-box compact investor-flow-note" }, payload.note) : null,
                  h(
                    "div",
                    { className: "investor-flow-table-wrap" },
                    h(
                      "table",
                      { className: "investor-flow-table" },
                      h(
                        "thead",
                        null,
                        h(
                          "tr",
                          null,
                          ["일자", "종가", "전일대비", "등락률", "거래량"].map(function (label) {
                            return h("th", { key: label }, label);
                          }),
                          columns.map(function (column) {
                            return h("th", { key: column.key }, column.label);
                          })
                        )
                      ),
                      h(
                        "tbody",
                        null,
                        rows.map(function (row) {
                          return h(
                            "tr",
                            { key: row.date },
                            h("td", { className: "flow-date-cell" }, row.date),
                            h("td", null, numberFormat(row.close, 0)),
                            h("td", { className: flowClass(row.change) }, formatFlowNumber(row.change)),
                            h("td", { className: flowClass(row.change_pct) }, formatFlowPercent(row.change_pct)),
                            h("td", null, numberFormat(row.volume, 0)),
                            columns.map(function (column) {
                              return h("td", { key: column.key, className: flowClass(row[column.key]) }, formatFlowNumber(row[column.key]));
                            })
                          );
                        }),
                        rows.length
                          ? h(
                              "tr",
                              { className: "investor-flow-total-row" },
                              h("td", null, "합계"),
                              h("td", null, ""),
                              h("td", null, ""),
                              h("td", null, ""),
                              h("td", null, ""),
                              columns.map(function (column) {
                                return h("td", { key: column.key, className: flowClass(totals[column.key]) }, formatFlowNumber(totals[column.key]));
                              })
                            )
                          : null
                      )
                    )
                  )
                )
        )
      );
    }

    function renderReportListModal() {
      if (!reportListModal.open) {
        return null;
      }
      const payload = reportListModal.payload || {};
      const rows = ensureArray(payload.items);
      const stockLabel = payload.stock_name
        ? payload.stock_name + (payload.stock_code ? " (" + payload.stock_code + ")" : "")
        : "공시리스트";
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeReportListModal },
        h(
          "div",
          { className: "modal-panel investor-flow-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head investor-flow-head" },
            h(
              "div",
              null,
              h("span", { className: "eyebrow" }, "KIND REPORT LIST"),
              h("h2", null, stockLabel)
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeReportListModal }, "닫기")
          ),
          reportListModal.loading
            ? h("div", { className: "stock-chart-loading" }, "최근 3개년 공시 목록을 불러오는 중입니다.")
            : reportListModal.error
              ? h("div", { className: "stock-chart-error" }, reportListModal.error)
              : h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "investor-flow-summary" },
                    h("span", null, stockLabel),
                    h("span", null, "최근 " + numberFormat(Number(payload.years || 3), 0) + "개년"),
                    h("span", null, payload.scope === "business" ? "사업보고서" : "정기공시")
                  ),
                  rows.length
                    ? h(
                        "div",
                        { className: "earnings-scroll-box" },
                        rows.map(function (row, index) {
                          return h(
                            "button",
                            {
                              key: (row.acpt_no || row.url || "") + index,
                              type: "button",
                              className: "autocomplete-item",
                              style: { width: "100%", textAlign: "left", marginBottom: "8px" },
                              onClick: function () { openKindReportListItem(row.url); },
                            },
                            h("strong", null, row.title || "공시"),
                            h("span", null, [row.accepted_at, row.report_year ? row.report_year + "년" : "", row.report_type].filter(Boolean).join(" · "))
                          );
                        })
                      )
                    : h("div", { className: "empty-state" }, "최근 3개년 내 표시할 공시가 없습니다.")
            )
        )
      );
    }

    function renderWiseConsensusModal() {
      if (!wiseConsensusModalOpen) {
        return null;
      }
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeWiseConsensusModal },
        h(
          "div",
          { className: "modal-panel investor-flow-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head investor-flow-head" },
            h("div", null,
              h("strong", null, "WiseReport 추정실적 컨센서스"),
              h("div", { className: "summary-help" }, "Forward PER/PBR 클릭 시 열리는 상세 팝업입니다.")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeWiseConsensusModal }, "닫기")
          ),
          h(WiseReportConsensusPanel, {
            payload: wiseConsensusHistory,
            loading: wiseConsensusHistoryLoading,
            message: wiseConsensusHistoryMessage,
          })
        )
      );
    }

    function formatBusinessSegmentAmount(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return numberFormat(number / 100, 0) + "\uc5b5\uc6d0";
    }

    function renderBusinessSegmentsPanel() {
      const payload = businessSegments || {};
      const rows = ensureArray(payload.segments);
      if (businessSegmentsLoading) {
        return h(
          "div",
          { className: "business-segment-panel loading" },
          h("div", { className: "business-segment-title" },
            h("strong", null, "방 즐겨찾기 그룹"),
            h("span", null, "최신 사업보고서 기준 매출 비중입니다.")
          ),
          h("div", { className: "business-segment-skeleton" })
        );
      }
      if (businessSegmentsMessage) {
        return h(
          "div",
          { className: "business-segment-panel muted" },
          h("div", { className: "business-segment-title" },
            h("strong", null, "방 즐겨찾기 그룹"),
            h("span", null, businessSegmentsMessage)
          )
        );
      }
      if (!rows.length) {
        return null;
      }
      const summary = payload.summary || {};
      return h(
        "div",
        { className: "business-segment-panel" },
        h(
          "div",
          { className: "business-segment-title" },
          h("strong", null, "사업부문 분석 결과"),
          h("span", null, [
            payload.stock_name || "",
            payload.accepted_at || "",
            summary.unit ? "\ub2e8\uc704 " + summary.unit : "",
          ].filter(Boolean).join(" · "))
        ),
        h(
          "div",
          { className: "business-segment-bars" },
          rows.map(function (row, index) {
            const ratio = Math.max(0, Math.min(100, Number(row.ratio_pct || 0)));
            return h(
              "div",
              { key: row.segment + index, className: "business-segment-row" },
              h("div", { className: "business-segment-main" },
                h("strong", null, row.segment || "-"),
                h("span", null, row.items || row.usage || "")
              ),
              h(
                "div",
                { className: "business-segment-bar-wrap" },
                h("div", { className: "business-segment-bar", style: { width: ratio + "%" } })
              ),
              h("div", { className: "business-segment-number" },
                h("strong", null, numberFormat(ratio, 2) + "%"),
                h("span", null, formatBusinessSegmentAmount(row.amount_million_krw))
              )
            );
          })
        ),
        h(
          "div",
          { className: "business-segment-foot" },
          h("span", null, payload.report_title || "KIND \uc0ac\uc5c5 \ubd80\ubb38 \uc815\ubcf4"),
          payload.kind_url
            ? h("a", { href: payload.kind_url, target: "_blank", rel: "noreferrer" }, "\uc6d0\ubb38\ubcf4\uae30")
            : null
        )
      );
    }

    async function cancelSearch() {
      if (!jobState || !jobState.job_id) {
        return;
      }
      try {
        const cancelled = await postJson("/api/telegram/search_jobs/" + jobState.job_id + "/cancel", {});
        syncJob(cancelled);
      } catch (err) {
        setFormMessage(err.message || String(err));
      }
    }

    function renderDisclosureSearchPanel() {
      return h(
        "div",
        { className: "panel telegram-control-panel telegram-earnings-panel" },
        h(
          "div",
          { className: "telegram-earnings-head" },
          h(SectionTitle, null, "검색 결과"),
          h("span", { className: "summary-help" }, "검색하면 아래 텔레그램 메시지 검색도 같은 기업명으로 자동 실행됩니다.")
        ),
        h(
          "div",
          { className: "disclosure-tabbar" },
          DISCLOSURE_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "disclosure-tab" + (disclosureCategory === tab.key ? " active" : ""),
                onClick: function () { changeDisclosureCategory(tab.key); },
              },
              tab.label
            );
          })
        ),
        h(
          "div",
          { className: "earnings-search-row" },
          h("button", {
            type: "button",
            className: "earnings-nav-button",
            onClick: navigateBackToThemes,
            title: "오늘의 주도주로 돌아가기",
            "aria-label": "오늘의 주도주로 돌아가기",
          }, "<"),
          h(
            "label",
            { className: "form-field earnings-company-field", ref: earningsSuggestWrapRef },
            "기업명",
            h("input", {
              value: earningsQuery,
              onChange: function (event) { searchEarningsCompany(event.target.value); },
              onKeyDown: handleEarningsKeyDown,
              onFocus: selectTextOnFocus,
              onBlur: function () { setTimeout(function () { setEarningsSuggestions([]); }, 120); },
              placeholder: "예: 삼성전자, HD현대에너지솔루션, 005930",
            }),
            earningsSuggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list inline" },
                  earningsSuggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: (item.code || item.name || "") + index,
                        type: "button",
                        className: "autocomplete-item" + (index === earningsActiveIndex ? " active" : ""),
                        onMouseDown: function (event) { event.preventDefault(); },
                        onMouseEnter: function () { setEarningsActiveIndex(index); },
                        onClick: function () { chooseEarningsCompany(item); },
                      },
                      h("strong", null, item.name || item.query || ""),
                      h("span", null, [item.code, item.market].filter(Boolean).join(" · "))
                    );
                  })
                )
              : null
          ),
          h(
            "div",
            { className: "earnings-action-buttons" },
            h("button", {
              className: "earnings-action-button primary",
              onClick: function () { earningsLoading ? cancelEarningsSearch() : runEarningsSearch(false); },
              disabled: !status.authorized,
            }, earningsLoading ? "검색 중..." : "검색"),
            earningsLoading
              ? h("button", {
                  className: "earnings-action-button",
                  onClick: cancelEarningsSearch,
                  disabled: !status.authorized,
                }, "중단")
              : null,
            h(
              "span",
              { className: "earnings-split-button-group", role: "group", "aria-label": "KIND \uacf5\uc2dc \ubc14\ub85c\uac00\uae30" },
              h("button", {
                className: "earnings-action-button split-left",
                onClick: function () { openKindReportList("periodic"); },
                disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
                title: "분기보고서, 반기보고서, 사업보고서 등 최신 정기 공시를 엽니다.",
              }, companyLinkLoading === "kind-report-list" ? "조회 중..." : "공시리스트")
            ),
            h("button", {
              className: "earnings-action-button",
              onClick: function () { openCompanyInfoSite("wisereport"); },
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "wisereport" ? "조회 중..." : "WiseReport"),
            h("button", {
              className: "earnings-action-button",
              onClick: function () { openCompanyInfoSite("irgo"); },
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "irgo" ? "조회 중..." : "IRGO"),
            h("button", {
              className: "earnings-action-button",
              onClick: function () { openCompanyInfoSite("tradingview"); },
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "tradingview" ? "조회 중..." : "TradingView"),
            h("button", {
              className: "earnings-action-button",
              onClick: openInvestorFlowPopup,
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "flows" ? "조회 중..." : "수급")
          )
        ),
        earningsMessage ? h("div", { className: "notice-box compact" }, earningsMessage) : null,
        h(StockNewsBriefPanel, {
          payload: stockNewsBrief,
          loading: stockNewsBriefLoading,
          message: stockNewsBriefMessage,
          onRefresh: function () { loadStockNewsBrief(earningsQuery, true); },
        }),
        h(TelegramStockOverviewPanel, {
          payload: stockOverview,
          loading: stockOverviewLoading,
          message: stockOverviewMessage,
          consensus: wiseConsensusHistory,
          targetHistory: wiseTargetHistory,
          onOpenForwardConsensus: openWiseConsensusModal,
        }),
        h(
          "div",
          { className: "earnings-overview-actions" },
          h("button", {
            type: "button",
            className: "mini-button" + (financialTrendExpanded ? " active" : ""),
            onClick: toggleFinancialTrend,
            disabled: !String(earningsQuery || "").trim(),
          }, financialTrendExpanded ? "실적 추이 접기" : "실적 추이 보기")
        ),
        h(
          "div",
          { className: "earnings-result-visual-grid" },
          h(
            "div",
            { className: "earnings-scroll-box" },
            h(TelegramEarningsResults, {
              rows: earningsResults,
              emptyMessage: earningsLoading ? "텔레그램 메시지 검색 중입니다." : "기업명을 입력하면 선택한 유형의 공시를 최근 3년 범위에서 표시합니다.",
            }),
            earningsResults.length
              ? h(
                  "div",
                  { className: "earnings-more-row" },
                  h("button", {
                    className: "mini-button",
                    onClick: function () { runEarningsSearch(true); },
                    disabled: earningsLoading || !disclosureHasMore,
                  }, disclosureHasMore ? "최근 3년 내 더 보기" : "더 불러올 공시 없음")
                )
              : null
          ),
          financialTrendExpanded
            ? h(EarningsTrendSidePanel, {
                trend: financialTrend,
                loading: financialTrendLoading,
                message: financialTrendMessage,
              })
            : null
        )
      );
    }

    if (statusRequest.loading) {
      return LoadingPanel({ label: statusRequest.label });
    }
    if (statusRequest.error) {
      return ErrorPanel({ message: statusRequest.error });
    }

    const status = statusRequest.data || {};
    const progressMessage = jobState
      ? (jobState.message || (numberFormat(jobState.processed_chat_count, 0) + " / " + numberFormat(jobState.total_chat_count, 0) + "개 방 확인 중"))
      : "";

    return h(
      React.Fragment,
      null,
      renderDisclosureSearchPanel(),
      renderReportListModal(),
      renderWiseConsensusModal(),
      renderInvestorFlowPopup(),
      h(
        "div",
        { className: "panel telegram-status-panel" },
        h(
          "div",
          { className: "telegram-status-row" },
          h("div", { className: "telegram-status-title" }, "종목 정보 검색기"),
          h("div", { className: "telegram-status-items" },
            h("span", { className: "telegram-status-pill" }, "계정 " + (status.authorized ? "연결됨" : "미연결")),
            h("span", { className: "telegram-status-pill" }, "방 " + numberFormat(dialogs.length, 0) + "개"),
            h("span", { className: "telegram-status-pill" }, allRoomsSearch ? "검색대상 전체 방" : "선택 " + numberFormat(selectedChats.length, 0) + "개"),
            h("span", { className: "telegram-status-pill" }, "결과 " + numberFormat(results.length, 0) + "개"),
            status.phone ? h("span", { className: "telegram-status-phone" }, status.phone) : null
          ),
          status.authorized
            ? h("button", {
                className: "mini-button",
                onClick: function () { setShowConnection(!showConnection); },
              }, showConnection ? "접기" : "계정 설정")
            : null
        ),
        status.message ? h("div", { className: "telegram-status-message" }, status.message) : null,
        showConnection || !status.authorized
          ? h(
              "div",
              { className: "telegram-account-inline" },
              h("input", {
                value: apiId,
                onChange: function (event) { setApiId(event.target.value); },
                placeholder: "API ID",
              }),
              h("input", {
                value: apiHash,
                onChange: function (event) { setApiHash(event.target.value); },
                placeholder: "API Hash",
              }),
              h("input", {
                value: phone,
                onChange: function (event) { setPhone(event.target.value); },
                placeholder: "전화번호",
              }),
              h("input", {
                value: code,
                onChange: function (event) { setCode(event.target.value); },
                placeholder: "인증 코드",
              }),
              h("input", {
                type: "password",
                value: password,
                onChange: function (event) { setPassword(event.target.value); },
                placeholder: "2단계 비밀번호",
              }),
              h(
                "div",
                { className: "telegram-account-actions" },
                h("button", { className: "primary-button", onClick: sendCode, disabled: submitting }, "코드 요청"),
                h("button", { className: "primary-button", onClick: verifyCode, disabled: submitting }, "로그인")
                )
              )
          : null,
        formMessage ? h("div", { className: "notice-box" }, formMessage) : null
      ),
      h(
        "div",
        { className: "panel telegram-control-panel" },
        h(SectionTitle, null, "메시지 검색"),
        h(
          "div",
          { className: "form-grid telegram-search-grid" },
          h("label", { className: "form-field form-field-wide" }, "검색 단어", h("textarea", {
            value: keywords,
            onChange: function (event) { setKeywords(event.target.value); },
            onFocus: selectTextOnFocus,
            onKeyDown: function (event) {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                if (!submitting && status.authorized) {
                  runSearch();
                }
              }
            },
            placeholder: "여러 단어는 줄바꿈이나 쉼표로 구분해 입력하세요.",
          })),
          h("label", { className: "form-field" }, "매칭 방식", h("select", {
            value: matchMode,
            onChange: function (event) { setMatchMode(event.target.value); },
          },
            h("option", { value: "any" }, "하나라도 포함"),
            h("option", { value: "all" }, "모두 포함")
          )),
          h("label", { className: "form-field" }, "첨부파일 조건", h("select", {
            value: hasFile,
            onChange: function (event) { setHasFile(event.target.value); },
          },
            h("option", { value: "all" }, "전체"),
            h("option", { value: "with" }, "파일 있는 메시지"),
            h("option", { value: "without" }, "파일 없는 메시지")
          )),
          h("label", { className: "form-field" }, "시작 날짜", h("input", {
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })),
          h("label", { className: "form-field" }, "종료 날짜", h("input", {
            type: "date",
            value: endDate,
            onChange: function (event) { setEndDate(event.target.value); },
          })),
          h("label", { className: "check-field" }, h("span", null, "정확 문구"), h("input", {
            type: "checkbox",
            checked: exactPhrase,
            onChange: function (event) { setExactPhrase(event.target.checked); },
          })),
          h(
            "div",
            { className: "form-actions" },
            h(
              "div",
              { className: "toggle-group" },
              h("button", { className: "primary-button", onClick: function () { runSearch(); }, disabled: submitting || !status.authorized }, "검색 시작"),
              jobState && !jobState.finished
                ? h("button", { className: "mini-button danger", onClick: cancelSearch }, "검색 중단")
                : null
            )
          )
        ),
        h("div", { className: "subsection-title" }, "방 선택"),
        h(
          "label",
          { className: "telegram-all-room-toggle" },
          h("input", {
            type: "checkbox",
            checked: allRoomsSearch,
            onChange: function (event) { setAllRoomsSearch(event.target.checked); },
          }),
          h("span", null, "모든 방 대상 검색"),
          h("em", null, allRoomsSearch ? "선택 방과 즐겨찾기 그룹은 유지되지만 검색은 전체 방에서 진행합니다." : "선택한 방/그룹에서만 검색합니다.")
        ),
        h("label", { className: "form-field" }, "방 이름 검색", h("input", {
          value: chatQuery,
          onChange: function (event) { setChatQuery(event.target.value); },
          onFocus: selectTextOnFocus,
          placeholder: "방 이름을 검색해 직접 선택하세요.",
          disabled: allRoomsSearch,
        })),
        chatQuery && filteredDialogs.length
          ? h(
              "div",
              { className: "chat-search-results" },
              filteredDialogs.map(function (dialog) {
                return h("button", {
                  key: dialog.id,
                  className: "chat-search-item",
                  onClick: function () { addChat(dialog); },
                }, dialog.name + (dialog.unread_count ? " (" + dialog.unread_count + ")" : ""));
              })
            )
          : null,
        h("div", { className: "selected-chat-wrap" },
          selectedChats.length
            ? selectedChats.map(function (chat) {
                return h("button", {
                  key: chat.id,
                  className: "chat-chip active",
                  onClick: function () { removeChat(chat.id); },
                  title: "선택 채팅 제거",
                }, chat.name + " x");
              })
            : h("div", { className: "summary-help" }, allRoomsSearch ? "현재 전체 방을 대상으로 검색합니다." : "검색할 방을 선택하거나 즐겨찾기 그룹을 눌러주세요.")
        ),
        h(
          "div",
          { className: "telegram-favorite-groups" },
          h(
            "div",
            { className: "telegram-favorite-head" },
            h("strong", null, "방 즐겨찾기 그룹"),
            h("span", null, "현재 선택한 방 묶음을 저장하고, 그룹 클릭으로 검색 대상을 바로 바꿉니다.")
          ),
          h(
            "div",
            { className: "telegram-favorite-create" },
            h("input", {
              value: favoriteGroupName,
              onChange: function (event) { setFavoriteGroupName(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveFavoriteChatGroup();
                }
              },
              placeholder: "그룹 이름",
            }),
            h("button", { type: "button", className: "mini-button", onClick: saveFavoriteChatGroup }, "현재 선택 저장")
          ),
          favoriteChatGroups.length
            ? h(
                "div",
                { className: "telegram-favorite-list" },
                favoriteChatGroups.map(function (group) {
                  const active = !allRoomsSearch && ensureArray(group.chats).length === selectedChats.length && ensureArray(group.chats).every(function (chat) {
                    return selectedChatIds.indexOf(chat.id) >= 0;
                  });
                  return h(
                    "div",
                    { key: group.id, className: "telegram-favorite-group" + (active ? " active" : "") },
                    h("button", { type: "button", onClick: function () { applyFavoriteChatGroup(group); } },
                      h("strong", null, group.name),
                      h("span", null, numberFormat(ensureArray(group.chats).length, 0) + "개 방")
                    ),
                    h("button", {
                      type: "button",
                      className: "telegram-favorite-delete",
                      title: "그룹 삭제",
                      onClick: function () { removeFavoriteChatGroup(group.id); },
                    }, "x")
                  );
                })
              )
            : h("div", { className: "summary-help" }, "아직 저장된 즐겨찾기 그룹이 없습니다.")
        ),
        jobState
          ? h(
              "div",
              { className: "notice-box" },
              progressMessage,
              h("div", { className: "summary-help" }, "확인한 방 " + numberFormat(jobState.processed_chat_count, 0) + " / " + numberFormat(jobState.total_chat_count, 0) + ", 누적 결과 " + numberFormat(jobState.result_count, 0) + "개")
            )
          : null
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "검색 결과"),
        h(TelegramChatFeed, {
          rows: results,
          emptyMessage: jobState && !jobState.finished ? "검색 진행 중입니다. 첫 결과가 잡히면 바로 표시합니다." : "조건에 맞는 메시지가 없습니다.",
        })
      )
    );
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
        ThemesPage: ThemesPage,
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
  function NextPage() {
    return h(
      "div",
      { className: "panel placeholder" },
      h(
        "div",
        null,
        h("div", { className: "eyebrow" }, "Coming Next"),
        h("h1", { className: "page-title" }, "\uCD94\uAC00 \uC608\uC815 \uD398\uC774\uC9C0"),
        h("p", { className: "page-copy compact-copy" }, "\uD544\uC694\uD55C \uD398\uC774\uC9C0\uB97C \uCD94\uAC00\uB85C \uC5F0\uACB0\uD560 \uC218 \uC788\uB3C4\uB85D \uBE44\uC6CC\uB454 \uACF5\uAC04\uC785\uB2C8\uB2E4.")
      )
    );
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
  function App() {
    const [page, setPage] = useState(function () {
      const sharedMode = new URLSearchParams(window.location.search || "").get("shared") === "1";
      const savedPage = sharedMode ? "themes" : (localStorage.getItem(LAST_PAGE_KEY) || "portfolio");
      return ["portfolio", "themes", "global-themes", "asia-themes", "telegram", "global-company", "sector-entry", "sector-snapshot", "naver-blog", "next"].indexOf(savedPage) >= 0
        ? savedPage
        : "portfolio";
    });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(function () {
      if (window.innerWidth <= 1080) {
        return true;
      }
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    });

    useEffect(function () {
      localStorage.setItem(LAST_PAGE_KEY, page);
    }, [page]);

    useEffect(function () {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    }, [sidebarCollapsed]);

    useEffect(function () {
      function collapseSidebarOnNarrowWidth() {
        if (window.innerWidth <= 760) {
          setSidebarCollapsed(true);
        }
      }
      collapseSidebarOnNarrowWidth();
      window.addEventListener("resize", collapseSidebarOnNarrowWidth);
      return function () {
        window.removeEventListener("resize", collapseSidebarOnNarrowWidth);
      };
    }, []);

    const tabs = [
      { key: "portfolio", label: "비중 백테스트" },
      { key: "themes", label: "오늘의 주도주" },
      { key: "telegram", label: "텔레그램 검색기" },
      { key: "next", label: "추가 예정 페이지" },
    ];

    const tabLabels = {
      portfolio: "비중 백테스트",
      themes: "오늘의 주도주",
      telegram: "텔레그램 검색기",
      "sector-snapshot": "섹터 스냅샷",
      next: "추가 예정 페이지",
    };

    let content = null;
    if (page === "portfolio") {
      content = h(PortfolioPageModern);
    } else if (page === "themes") {
      content = h(MemoThemesPageV2);
    } else if (page === "telegram") {
      content = h(TelegramPage);
    } else {
      content = h(NextPage);
    }

    return h(
      "div",
      { className: "app-shell" + (sidebarCollapsed ? " sidebar-collapsed" : "") },
      h(BackgroundPreloader),
      h(GlobalLoadingDock),
      h(
        "button",
        {
          type: "button",
          className: "sidebar-toggle",
          title: sidebarCollapsed ? "탭 열기" : "탭 닫기",
          onClick: function () { setSidebarCollapsed(function (value) { return !value; }); },
        },
        sidebarCollapsed ? "탭 열기" : "탭 닫기"
      ),
      h(
        "button",
        {
          type: "button",
          className: "app-refresh-button",
          title: "페이지 새로고침",
          onClick: function () { window.location.reload(); },
        },
        "새로고침"
      ),
      h(
        "aside",
        { className: "sidebar" },
        h("div", { className: "brand" }, "Stock Dashboard"),
        h(
          "div",
          { className: "nav-list" },
          tabs.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                className: "nav-item" + (page === tab.key ? " active" : ""),
                onClick: function () { setPage(tab.key); },
              },
              tabLabels[tab.key] || tab.label
            );
          })
        )
      ),
      h("main", { className: "main-content" }, content)
    );
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

  function buildEmptySectorGroup() {
    return { id: makeId("sector"), sector: "", query: "", suggestions: [], stocks: [] };
  }

  function SectorSnapshotPage() {
    const [groups, setGroups] = useState([buildEmptySectorGroup()]);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [message, setMessage] = useState("");
    const timerRef = useRef({});

    useEffect(function () {
      return function () {
        Object.keys(timerRef.current).forEach(function (key) {
          clearTimeout(timerRef.current[key]);
        });
      };
    }, []);

    function patchGroup(groupId, patch) {
      setGroups(function (current) {
        return current.map(function (group) {
          return group.id === groupId ? Object.assign({}, group, patch) : group;
        });
      });
    }

    function updateSectorName(groupId, value) {
      patchGroup(groupId, { sector: value });
    }

    function updateQuery(groupId, value) {
      patchGroup(groupId, { query: value, suggestions: [] });
      if (timerRef.current[groupId]) {
        clearTimeout(timerRef.current[groupId]);
      }
      if (!value.trim()) {
        return;
      }
      timerRef.current[groupId] = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()));
          patchGroup(groupId, { query: value, suggestions: ensureArray(payload.items || []) });
        } catch (err) {
          patchGroup(groupId, { suggestions: [] });
        }
      }, 180);
    }

    function addSector() {
      setGroups(function (current) { return current.concat([buildEmptySectorGroup()]); });
    }

    function removeSector(groupId) {
      setGroups(function (current) {
        const next = current.filter(function (group) { return group.id !== groupId; });
        return next.length ? next : [buildEmptySectorGroup()];
      });
    }

    function addStock(groupId, stock) {
      setGroups(function (current) {
        return current.map(function (group) {
          if (group.id !== groupId) {
            return group;
          }
          const exists = group.stocks.some(function (item) { return item.code === stock.code; });
          if (exists) {
            return Object.assign({}, group, { query: "", suggestions: [] });
          }
          return Object.assign({}, group, {
            query: "",
            suggestions: [],
            stocks: group.stocks.concat([{ code: stock.code, name: stock.name, market: stock.market }]),
          });
        });
      });
    }

    function removeStock(groupId, stockCode) {
      setGroups(function (current) {
        return current.map(function (group) {
          if (group.id !== groupId) {
            return group;
          }
          return Object.assign({}, group, {
            stocks: group.stocks.filter(function (item) { return item.code !== stockCode; }),
          });
        });
      });
    }

    function buildRequestBody() {
      return {
        groups: groups
          .map(function (group) {
            return {
              sector: String(group.sector || "").trim(),
              stocks: ensureArray(group.stocks).map(function (stock) {
                return { code: stock.code, name: stock.name };
              }),
            };
          })
          .filter(function (group) {
            return group.sector && ensureArray(group.stocks).length;
          }),
      };
    }

    async function runPreview() {
      const body = buildRequestBody();
      if (!body.groups.length) {
        setMessage("추가할 입출금 금액을 입력해주세요.");
        return;
      }
      setLoading(true);
      setMessage("");
      try {
        const payload = await postJson("/api/sector-snapshot/preview", body);
        setPreview(payload);
        if (ensureArray(payload.errors).length) {
          setMessage("일부 종목의 데이터를 가져오지 못했습니다.");
        }
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    async function runExport() {
      const body = buildRequestBody();
      if (!body.groups.length) {
        setMessage("추가할 입출금 금액을 입력해주세요.");
        return;
      }
      setExporting(true);
      setMessage("");
      try {
        await postDownload("/api/sector-snapshot/export.xlsx", body, "sector_snapshot.xlsx");
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setExporting(false);
      }
    }

    const sectorColumns = [
      { key: "sector", label: "섹터" },
      { key: "stock_count", label: "\uc885\ubaa9 \uc218", render: function (row) { return numberFormat(row.stock_count, 0); } },
      { key: "strength_score", label: "媛뺣룄 ?먯닔", render: function (row) { return metricSpan(row.strength_score, "percent"); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "foreigner_pct", label: "\uc678\uad6d\uc778(%)", render: function (row) { return metricSpan(row.foreigner_pct, "percent"); } },
      { key: "institution_pct", label: "湲곌?(%)", render: function (row) { return metricSpan(row.institution_pct, "percent"); } },
      { key: "ma200_gap_pct", label: "200ma", render: function (row) { return metricSpan(row.ma200_gap_pct, "percent"); } },
      { key: "ma20_gap_pct", label: "20ma", render: function (row) { return metricSpan(row.ma20_gap_pct, "percent"); } }
    ];

    const stockColumns = [
      { key: "sector", label: "?뱁꽣" },
      { key: "stock_name", label: "\uc885\ubaa9\uba85" },
      { key: "current_price", label: "현재가", render: function (row) { return metricSpan(row.current_price, "price"); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "foreigner_net_k", label: "\uc678\uad6d\uc778", render: function (row) { return numberFormat(row.foreigner_net_k, 1); } },
      { key: "institution_net_k", label: "기관", render: function (row) { return numberFormat(row.institution_net_k, 1); } },
      { key: "foreigner_pct", label: "\uc678\uad6d\uc778(%)", render: function (row) { return metricSpan(row.foreigner_pct, "percent"); } },
      { key: "institution_pct", label: "기관(%)", render: function (row) { return metricSpan(row.institution_pct, "percent"); } },
      { key: "ma200_gap_pct", label: "200ma", render: function (row) { return metricSpan(row.ma200_gap_pct, "percent"); } },
      { key: "ma20_gap_pct", label: "20ma", render: function (row) { return metricSpan(row.ma20_gap_pct, "percent"); } }
    ];

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "Sector Snapshot"),
        h("h1", { className: "page-title" }, "건물 관리"),
        h("p", { className: "page-copy" }, "\uc0ac\uc6a9\uc790\uac00 \uc9c0\uc815\ud55c \uc139\ud130 \uad6c\uc131\uc73c\ub85c \uc885\ubaa9 \uc218\uc775\ub960\uacfc \uc218\uae09, \uc774\ub3d9\ud3c9\uade0 \uad34\ub9ac\ub97c \ube44\uad50\ud558\uace0 \uc5d1\uc140\ub85c \ub0b4\ubcf4\ub0bc \uc218 \uc788\uc2b5\ub2c8\ub2e4."),
        preview
          ? h(
              "div",
              { className: "summary-grid summary-grid-small" },
              h(SummaryCard, { label: "기준일", value: preview.as_of_date || "-" }),
              h(SummaryCard, { label: "섹터 수", value: numberFormat(preview.summary ? preview.summary.sector_count : 0, 0) }),
              h(SummaryCard, { label: "종목 수", value: numberFormat(preview.summary ? preview.summary.stock_count : 0, 0) }),
              h(SummaryCard, { label: "미수집 종목", value: numberFormat(preview.summary ? preview.summary.error_count : 0, 0) })
            )
          : null,
        h(
          "div",
          { className: "form-actions section-actions" },
          h("button", { className: "mini-button", onClick: addSector }, "섹터 추가"),
          h("button", { className: "primary-button", onClick: runPreview, disabled: loading }, loading ? "미리보기 생성 중.." : "미리보기"),
          h("button", { className: "primary-button", onClick: runExport, disabled: exporting }, exporting ? "엑셀 생성 중.." : "엑셀 출력")
        ),
        message ? h("div", { className: "notice-box" }, message) : null
      ),
      h(
        "div",
        { className: "sector-card-grid" },
        groups.map(function (group, index) {
          return h(
            "div",
            { key: group.id, className: "panel sector-builder-card" },
            h(
              "div",
              { className: "section-toolbar" },
              h("strong", null, "섹터 " + numberFormat(index + 1, 0)),
              h("button", { className: "mini-button", onClick: function () { removeSector(group.id); } }, "삭제")
            ),
            h("label", { className: "form-field" }, "\uc139\ud130\uba85", h("input", {
              value: group.sector,
              onChange: function (event) { updateSectorName(group.id, event.target.value); },
              placeholder: "\uc608: \ubc18\ub3c4\uccb4, \uc790\ub3d9\ucc28, \ubc29\uc0b0"
            })),
            h("label", { className: "form-field" }, "\uac80\uc0c9 \uc870\uac74", h("input", {
              value: group.query,
              onChange: function (event) { updateQuery(group.id, event.target.value); },
              onFocus: selectTextOnFocus,
              placeholder: "\uc885\ubaa9\ucf54\ub4dc \ub610\ub294 \uc885\ubaa9\uba85\uc744 \uc27c\ud45c\ub85c \uad6c\ubd84"
            })),
            group.query && ensureArray(group.suggestions).length
              ? h(
                  "div",
                  { className: "autocomplete-list" },
                  group.suggestions.map(function (item) {
                    return h(
                      "button",
                      {
                        key: group.id + "-" + item.code,
                        className: "autocomplete-item",
                        onClick: function () { addStock(group.id, item); }
                      },
                      h("strong", null, item.name),
                      h("span", null, item.code + (item.market ? " 쨌 " + item.market : ""))
                    );
                  })
                )
              : null,
            h(
              "div",
              { className: "selected-stock-wrap" },
              ensureArray(group.stocks).length
                ? group.stocks.map(function (stock) {
                    return h(
                      "button",
                      {
                        key: group.id + ":" + stock.code,
                        className: "chat-chip active",
                        onClick: function () { removeStock(group.id, stock.code); }
                      },
                      stock.name + " ×"
                    );
                  })
                : h("div", { className: "summary-help" }, "섹터에 들어갈 종목을 검색해 추가해 주세요.")
            )
          );
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "섹터 평균 미리보기"),
        loading
          ? h("div", { className: "summary-help" }, "종목 데이터를 불러오는 중입니다.")
          : h(DataTable, {
              rows: preview ? preview.sector_rows : [],
              columns: sectorColumns,
              emptyMessage: "미리보기를 실행하면 섹터 평균이 여기에 표시됩니다."
            })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "섹터별 월별 히트맵"),
        loading
          ? h("div", { className: "summary-help" }, "종목 데이터를 불러오는 중입니다.")
          : h(DataTable, {
              rows: preview ? preview.stock_rows : [],
              columns: stockColumns,
              emptyMessage: "섹터와 종목을 입력한 뒤 미리보기를 눌러 주세요."
            }),
        preview && ensureArray(preview.errors).length
          ? h("div", { className: "notice-box" }, ensureArray(preview.errors).join(" / "))
          : null
      )
    );
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
          { key: "global-themes", label: "\ubbf8\uad6d \uc8fc\ub3c4\uc8fc" },
          { key: "asia-themes", label: "\uc544\uc2dc\uc544 \uc8fc\ub3c4\uc8fc" },
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
      return ["sector-watch", "portfolio", "themes", "chart-game", "global-themes", "asia-themes", "telegram", "disclosure", "stock-news", "global-company", "pair-correlation", "etf-flow", "global-indices", "institutional-rebalance", "sector-entry", "sector-snapshot", "trade-data", "economy-cycle", "strategy-backtest", "market-calendar", "naver-blog", "real-estate-prices", "subscription-list", "building-management", "next"].indexOf(savedPage) >= 0
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
      const running = { kr: false, us: false };

      function getStateForToday() {
        const today = todayIsoDate();
        const currentState = readAutoDailyThemeBuildState();
        if (currentState.date === today) {
          return currentState;
        }
        const nextState = { date: today, kr: false, us: false };
        writeAutoDailyThemeBuildState(nextState);
        return nextState;
      }

      function runAutoBuild(market) {
        const todayState = getStateForToday();
        if (running[market] || todayState[market]) {
          return;
        }
        const delayMs = getAutoBuildDelayMs(market);
        if (delayMs == null) {
          return;
        }
        if (delayMs > 0) {
          timers.push(window.setTimeout(function () {
            runAutoBuild(market);
          }, delayMs));
          return;
        }
        running[market] = true;
        const url = market === "us" ? "/api/us-themes/build-today-data" : "/api/themes/build-today-data";
        postJson(url, {
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

      getStateForToday();
      runAutoBuild("kr");
      runAutoBuild("us");
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
        return h(MemoThemesPageV2);
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
          h("div", { className: "brand" }, "Stock Dashboard"),
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
                onClick: function () { window.location.reload(); },
              },
              "?"
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
                "?",
                h("span", null, "새로고침")
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

