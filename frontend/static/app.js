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
  const GLOBAL_COMPANY_KEY = "stock-dashboard:global-company-state";
  const STOCK_NEWS_KEY = "stock-dashboard:stock-news-state";
  const DISCLOSURE_PAGE_KEY = "stock-dashboard:disclosure-page-state";
  const DISCLOSURE_PAGE_STATE_VERSION = 5;
  const WINDOW_TITLE_DETAIL_EVENT = "stock-dashboard:title-detail";
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
    "global-themes",
    "asia-themes",
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
    "next"
  ];
  const ACTIVE_API_REQUESTS = {};
  const CHART_PREVIEW_CACHE = {};
  let API_REQUEST_SEQ = 0;

  function normalizeAppPageKey(pageKey, fallback) {
    const normalized = String(pageKey || "").trim();
    return APP_PAGE_KEYS.indexOf(normalized) >= 0 ? normalized : (fallback || "sector-watch");
  }

  function buildPageLocationHash(pageKey) {
    return "#page=" + encodeURIComponent(normalizeAppPageKey(pageKey, "sector-watch"));
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

  installDomMutationGuard();

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
    const markerByDate = {};
    ensureArray(props.markers).forEach(function (marker) {
      const dateKey = String(marker.date || "").slice(0, 10);
      if (dateKey) {
        markerByDate[dateKey] = marker;
      }
    });
    const width = 318;
    const height = 142;
    const pad = { top: 10, right: 46, bottom: 22, left: 10 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const lows = rows.map(function (row) { return Number(row.low); }).filter(Number.isFinite);
    const highs = rows.map(function (row) { return Number(row.high); }).filter(Number.isFinite);
    if (!rows.length || !lows.length || !highs.length) {
      return h("div", { className: "stock-chart-empty" }, "차트 데이터 없음");
    }
    let minPrice = Math.min.apply(null, lows);
    let maxPrice = Math.max.apply(null, highs);
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
    const closeLine = closePoints.map(function (point) {
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
      h("polyline", { points: closeLine, className: "stock-chart-close-line" }),
      rows.map(function (row, index) {
        const marker = markerByDate[String(row.date || "").slice(0, 10)];
        if (!marker) {
          return null;
        }
        const itemX = x(index);
        const itemY = y(row.close);
        const markerType = String(marker.type || marker.marker_type || "entry");
        const markerLabel = marker.label || (markerType === "buy" ? "매수" : markerType === "sell" ? "매도" : marker.signal_level || "섹터 진입 신호");
        const title = [
          marker.date,
          markerLabel,
          marker.sector ? "섹터: " + marker.sector : "",
          marker.trading_rank ? "거래대금 " + marker.trading_rank + "위" : "",
          marker.avg_score != null ? "평균점수 " + numberFormat(marker.avg_score, 1) : "",
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
          : h(MiniCandlestickChart, { rows: rows, markers: data.entry_markers }),
      !props.loading && !props.error
        ? h(
            "div",
            { className: "stock-chart-preview-foot" },
            h("span", null, (summary.start_date || "").slice(5) + " ~ " + (summary.end_date || "").slice(5)),
            h("span", null, "종가 " + numberFormat(summary.last_close, 0)),
            ensureArray(data.entry_markers).length
              ? h("span", { className: "stock-chart-marker-note" }, "초록점 " + numberFormat(ensureArray(data.entry_markers).length, 0) + "회")
              : null
          )
        : null
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
    const requestId = startApiRequest(url, options);
    const requestPromise = fetch(url, requestOptions).then(async function (response) {
      const payload = await response.json();
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
    if (text.indexOf("/api/portfolio/performance") === 0) return "포트폴리오 수익 데이터";
    if (text.indexOf("/api/app-config") === 0) return "앱 실행 모드";
    if (text.indexOf("/api/portfolio/export") === 0) return "포트폴리오 수익 엑셀";
    if (text.indexOf("/api/strategy/backtest") === 0) return "전략 백테스트 데이터";
    if (text.indexOf("/api/strategy/sector-rotation") === 0) return "섹터 로테이션 백테스트";
    if (text.indexOf("/api/strategy/advanced-sector") === 0) return "고급 섹터 신호 백테스트";
    if (text.indexOf("/api/strategy/portfolio-diagnostic") === 0) return "현재 방식 진단";
    if (text.indexOf("/api/market-calendar") === 0) return "증시 일정";
    if (text.indexOf("/api/themes/today") === 0) return "오늘의 주도주 엑셀 데이터";
    if (text.indexOf("/api/us-themes/today") === 0) return "\ubbf8\uad6d \uc8fc\ub3c4\uc8fc SQL \ub370\uc774\ud130";
    if (text.indexOf("/api/asia-themes/today") === 0) return "\uc544\uc2dc\uc544 \uc8fc\ub3c4\uc8fc SQL \ub370\uc774\ud130";
    if (text.indexOf("/api/themes/reload") === 0) return "주도주 엑셀 직접 로드";
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
    if (text.indexOf("/api/global-stocks/detail") === 0) return "해외기업 실적 데이터";
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

  function prefetchJson(url) {
    if (getCachedJson(url) || (API_GET_CACHE[url] && API_GET_CACHE[url].promise)) {
      return;
    }
    fetchJson(url).catch(function () {});
  }

  function invalidateApiCache(match) {
    Object.keys(API_GET_CACHE).forEach(function (key) {
      if (typeof match === "function" ? match(key) : key.indexOf(match) === 0) {
        delete API_GET_CACHE[key];
      }
    });
  }

  async function postJson(url, body) {
    const payload = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
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
    }
    return payload;
  }

  function makeId(prefix) {
    return (prefix || "id") + "-" + Math.random().toString(36).slice(2, 10);
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
        const payload = await response.json();
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
      const shouldForceRefresh = forceRefresh !== false;
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
      { className: "summary-card" },
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

  function linkifyText(text) {
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
      parts.push(h("a", { key: href + "-" + match.index, href: href, target: "_blank", rel: "noreferrer" }, raw));
      lastIndex = match.index + raw.length;
    }
    if (lastIndex < source.length) {
      parts.push(source.slice(lastIndex));
    }
    return parts;
  }

  function LinkifiedText(props) {
    return h("div", { className: "telegram-text" }, linkifyText(props.text));
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
        return { stockMap: {}, sectors: [], lastFileDate: "" };
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
      };
    } catch (err) {
      return { stockMap: {}, sectors: [], lastFileDate: "" };
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
    if (mode === "week") {
      const anchorKey = anchor.toISOString().slice(0, 10);
      const beforeAnchor = rows.filter(function (item) {
        return String(item.date || "") <= anchorKey;
      });
      return beforeAnchor.slice(-5);
    }
    return rows.filter(function (item) {
      const current = new Date(item.date);
      return current.getFullYear() === anchor.getFullYear() && current.getMonth() === anchor.getMonth();
    });
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
    const labels = props.series.map(function (item) { return item.date; });
    const portfolioInvestedFlags = props.series.map(function (item) { return item && item.invested !== false; });
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
            {
              label: "KOSPI",
              data: props.benchmark.map(function (item) { return portfolioChartPoint(item.return_pct); }),
              borderColor: "#4c8bf5",
              backgroundColor: "rgba(76, 139, 245, 0.12)",
              pointRadius: 1.8,
              pointHoverRadius: 4,
              tension: 0.12,
              borderWidth: 2,
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
    }, [props.series, props.benchmark, props.xRange]);

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
    }, [props.onRangeChange, props.series, props.benchmark]);

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
      h("div", { className: "subsection-title" }, "매수-매도 라운드트립 손실 상위"),
          h(PortfolioContributionChart, { rows: worstRows, limit: 12 })
        ),
        h(
          "div",
          null,
      h("div", { className: "subsection-title" }, "매수-매도 라운드트립 손실 상위"),
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
          { key: "unrealized_pnl", label: "미실현", className: "num-cell", render: function (row) { return h("span", { className: pnlClass(row.unrealized_pnl) }, formatCurrency(row.unrealized_pnl)); } },
          { key: "total_pnl", label: "총 손익", className: "num-cell", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatCurrency(row.total_pnl)); } },
          { key: "contribution_pct_points", label: "기여도", render: function (row) { return formatPercent(row.contribution_pct_points, 3); } },
        ],
      }),
      h("div", { className: "subsection-title" }, "매수-매도 라운드트립 손실 상위"),
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
      h("div", { className: "subsection-title" }, "매수-매도 라운드트립 손실 상위"),
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
    const labels = rows.map(function (item) { return item.date; });
    const pricePoint = function (value) {
      return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
    };
    const hasPriceSeries = rows.some(function (item) {
      return Number.isFinite(Number(item && item.ma20)) || Number.isFinite(Number(item && item.ma60)) || Number.isFinite(Number(item && item.ma200));
    });
    const { canvasRef } = useChartLifecycle(function (canvas) {
      var datasets = [
        {
          label: props.indexName || "Index",
          data: rows.map(function (item) { return portfolioChartPoint(item.benchmark_return_pct); }),
          borderColor: "#111827",
          backgroundColor: "rgba(17, 24, 39, 0.08)",
          yAxisID: "yReturn",
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.16,
          borderWidth: 2,
        },
        {
          label: props.strategyName || "Strategy",
          data: rows.map(function (item) { return portfolioChartPoint(item.strategy_return_pct); }),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.14)",
          yAxisID: "yReturn",
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.16,
          borderWidth: 2.4,
        },
      ];
      if (hasPriceSeries) {
        datasets = datasets.concat([
          {
              label: "매도",
            data: rows.map(function (item) { return pricePoint(item.ma20); }),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
            yAxisID: "yPrice",
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.12,
            borderWidth: 1.1,
          },
          {
              label: "RSI(14)",
            data: rows.map(function (item) { return pricePoint(item.ma60); }),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.05)",
            yAxisID: "yPrice",
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.12,
            borderWidth: 1.1,
          },
          {
              label: "RSI(14)",
            data: rows.map(function (item) { return pricePoint(item.ma200); }),
            borderColor: "#16a34a",
            backgroundColor: "rgba(22, 163, 74, 0.05)",
            yAxisID: "yPrice",
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.12,
            borderWidth: 1.1,
          },
        ]);
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
            yPrice: {
              position: "right",
              display: hasPriceSeries,
              ticks: {
                color: "#111827",
                callback: function (value) { return numberFormat(value, 0); },
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
                  const isReturn = context.dataset.yAxisID === "yReturn";
                  if (isReturn) {
                    return context.dataset.label + ": " + formatPercent(context.raw, 2);
                  }
                  return context.dataset.label + ": " + numberFormat(context.raw, 2);
                },
                afterBody: function (items) {
                  if (!items.length) {
                    return "";
                  }
                  const row = rows[items[0].dataIndex] || {};
                  const lines = [];
                  const holdings = ensureArray(row.holdings);
                  if (holdings.length) {
                    const sorted = holdings.slice().sort(function (a, b) {
                      return Number(b && b.weight_pct || 0) - Number(a && a.weight_pct || 0);
                    });
                    lines.push("\ubcf4\uc720 \uc885\ubaa9 (" + numberFormat(holdings.length, 0) + "\uac1c)");
                    sorted.slice(0, 12).forEach(function (item) {
                      const stockName = String((item && (item.stock_name || item.stock_code)) || "-");
                      const weightPct = Number(item && item.weight_pct);
                      lines.push("? " + stockName + " " + (Number.isFinite(weightPct) ? numberFormat(weightPct, 2) + "%" : "-"));
                    });
                    if (sorted.length > 12) {
                      lines.push("? " + numberFormat(sorted.length - 12, 0) + "?");
                    }
                  }
                  if (!hasPriceSeries) {
                    return lines;
                  }
                  lines.push("\uc885\uac00: " + numberFormat(row.close, 2));
                  lines.push("20\uc77c\uc120: " + (row.ma20 == null ? "-" : numberFormat(row.ma20, 2)));
                  lines.push("60\uc77c\uc120: " + (row.ma60 == null ? "-" : numberFormat(row.ma60, 2)));
                  lines.push("200\uc77c\uc120: " + (row.ma200 == null ? "-" : numberFormat(row.ma200, 2)));
                  lines.push("RSI(14): " + (row.rsi14 == null ? "-" : numberFormat(row.rsi14, 1)));
                  return lines;
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
    }, [props.rows, props.indexName, props.strategyName]);

    return h("div", { className: "chart-shell strategy-chart-shell" }, h("canvas", { ref: canvasRef }));
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
              label: "오늘 점수",
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
              label: "오늘 점수",
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
              label: "오늘 점수",
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
              label: "오늘 점수",
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

  function SectorWatchBoardPage() {
    const request = useFetchJson("/api/sector-watch-board?limit_per_sector=80");
    const [selectedStock, setSelectedStock] = useState(null);
    const [chartState, setChartState] = useState({ loading: false, error: "", data: null });
    const [orderedSectors, setOrderedSectors] = useState([]);
    const [dragState, setDragState] = useState(null);
    const [savingOrder, setSavingOrder] = useState(false);
    const [refreshingPrices, setRefreshingPrices] = useState(false);

    const data = request.data || {};
    const sectors = orderedSectors.length ? orderedSectors : ensureArray(data.sectors);

    useEffect(function () {
      setOrderedSectors(ensureArray(data.sectors));
    }, [request.data]);

    useEffect(function () {
      if (!selectedStock) {
        return;
      }
      let updatedStock = null;
      ensureArray(data.sectors).some(function (sector) {
        return ensureArray(sector.stocks).some(function (stock) {
          if (stock.stock_code === selectedStock.stock_code) {
            updatedStock = stock;
            return true;
          }
          return false;
        });
      });
      if (updatedStock) {
        setSelectedStock(updatedStock);
      }
    }, [request.data]);

    useEffect(function () {
      if (selectedStock || !sectors.length) {
        return;
      }
      const firstStock = ensureArray(sectors[0].stocks)[0];
      if (firstStock) {
        setSelectedStock(firstStock);
      }
    }, [request.data]);

    useEffect(function () {
      emitWindowTitleDetail(
        "sector-watch",
        selectedStock ? selectedStock.stock_name + " " + selectedStock.stock_code : ""
      );
    }, [selectedStock]);

    useEffect(function () {
      if (!selectedStock) {
        return;
      }
      const code = String(selectedStock.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      if (!code || code === "000000") {
        setChartState({ loading: false, error: "차트 데이터를 가져올 종목코드가 없습니다.", data: null });
        return;
      }
      setChartState({ loading: true, error: "", data: null });
      fetchJson("/api/stocks/chart-preview?code=" + encodeURIComponent(code) + "&months=3")
        .then(function (payload) {
          setChartState({ loading: false, error: "", data: payload });
        })
        .catch(function (error) {
          setChartState({ loading: false, error: error.message || String(error), data: null });
        });
    }, [selectedStock && selectedStock.stock_code]);

    function metricClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "flat";
      return number > 0 ? "positive" : "negative";
    }

    function moveArrayItem(items, fromIndex, toIndex) {
      const next = ensureArray(items).slice();
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length || fromIndex === toIndex) {
        return next;
      }
      const removed = next.splice(fromIndex, 1)[0];
      next.splice(toIndex, 0, removed);
      return next;
    }

    function persistOrder(nextSectors) {
      const body = {
        sectors: ensureArray(nextSectors).map(function (sector) { return sector.sector; }).filter(Boolean),
        stocks_by_sector: {},
      };
      ensureArray(nextSectors).forEach(function (sector) {
        body.stocks_by_sector[sector.sector] = ensureArray(sector.stocks).map(function (stock) { return stock.stock_code; }).filter(Boolean);
      });
      setSavingOrder(true);
      postJson("/api/sector-watch-board/order", body)
        .catch(function () {})
        .finally(function () { setSavingOrder(false); });
    }

    function reorderSectors(fromIndex, toIndex) {
      setOrderedSectors(function (current) {
        const next = moveArrayItem(current, fromIndex, toIndex);
        persistOrder(next);
        return next;
      });
    }

    function reorderStocks(sectorName, fromIndex, toIndex) {
      setOrderedSectors(function (current) {
        const next = ensureArray(current).map(function (sector) {
          if (sector.sector !== sectorName) {
            return sector;
          }
          return { ...sector, stocks: moveArrayItem(sector.stocks, fromIndex, toIndex) };
        });
        persistOrder(next);
        return next;
      });
    }

    function refreshWatchPrices() {
      if (refreshingPrices || request.loading) {
        return;
      }
      setRefreshingPrices(true);
      request.refresh(true).finally(function () {
        setRefreshingPrices(false);
      });
    }

    function formatMarketFlowAmount(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, 1);
    }

    function renderMarketInvestorFlows() {
      const payload = data.market_investor_flows || {};
      const columns = ensureArray(payload.columns);
      const markets = ensureArray(payload.markets);
      return h(
        "div",
        { className: "panel market-investor-flow-panel" },
        h(
          "div",
          { className: "market-investor-flow-head" },
          h("div", null,
            h("div", { className: "eyebrow" }, "Market Flow"),
            h("h2", null, "코스피/코스닥 주체별 순매수"),
            h("p", null, payload.as_of_date ? payload.as_of_date + " · 단위 " + (payload.unit || "억원") : "단위 " + (payload.unit || "억원"))
          ),
          h("span", null, payload.source || "한국투자증권 OpenAPI")
        ),
        payload.error
          ? h("div", { className: "notice-box compact" }, payload.error)
          : h(
              React.Fragment,
              null,
              payload.warning ? h("div", { className: "notice-box compact market-flow-warning" }, payload.warning) : null,
              h(
                "div",
                { className: "market-investor-flow-table-wrap" },
                h(
                  "table",
                  { className: "market-investor-flow-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "등락률"),
                      h("th", null, "등락률"),
                      h("th", null, "등락률"),
                      columns.map(function (column) {
                        return h("th", { key: column.key }, column.label);
                      })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    markets.map(function (market) {
                      const values = market.values || {};
                      return h(
                        "tr",
                        { key: market.market || market.name },
                        h("td", { className: "market-investor-name" }, market.name || market.market || "-"),
                        h("td", null, market.index_value == null ? "-" : numberFormat(market.index_value, 2)),
                        h("td", { className: "sector-watch-change " + metricClass(market.change_pct) }, market.change_pct == null ? "-" : formatPercent(market.change_pct, 2)),
                        columns.map(function (column) {
                          return h(
                            "td",
                            { key: column.key, className: "market-flow-number " + metricClass(values[column.key]) },
                            formatMarketFlowAmount(values[column.key])
                          );
                        })
                      );
                    }),
                    markets.length
                      ? null
                      : h("tr", null, h("td", { colSpan: columns.length + 3 }, "수급 데이터가 없습니다."))
                  )
                )
              )
            )
      );
    }

    function renderStockRow(stock, sectorName, stockIndex) {
      const selected = selectedStock && selectedStock.stock_code === stock.stock_code;
      return h(
        "button",
        {
          key: stock.stock_code,
          type: "button",
          draggable: true,
          className: "sector-watch-stock" + (selected ? " active" : "") + (dragState && dragState.type === "stock" && dragState.sector === sectorName && dragState.index === stockIndex ? " dragging" : ""),
          onClick: function () { setSelectedStock(stock); },
          onDragStart: function (event) {
            event.stopPropagation();
            setDragState({ type: "stock", sector: sectorName, index: stockIndex });
            event.dataTransfer.effectAllowed = "move";
          },
          onDragOver: function (event) {
            if (dragState && dragState.type === "stock" && dragState.sector === sectorName) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          },
          onDrop: function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (dragState && dragState.type === "stock" && dragState.sector === sectorName) {
              reorderStocks(sectorName, dragState.index, stockIndex);
            }
            setDragState(null);
          },
          onDragEnd: function () { setDragState(null); },
        },
        h("span", { className: "sector-watch-name" }, stock.stock_name || "-"),
        h("span", { className: "sector-watch-price" }, stock.current_price == null ? "-" : numberFormat(stock.current_price, 0)),
        h("span", { className: "sector-watch-change " + metricClass(stock.change_pct) }, stock.change_pct == null ? "-" : formatPercent(stock.change_pct, 2))
      );
    }

    function renderSectorBox(sector, sectorIndex) {
      const stocks = ensureArray(sector.stocks);
      return h(
        "section",
        {
          key: sector.sector,
          className: "sector-watch-box" + (dragState && dragState.type === "sector" && dragState.index === sectorIndex ? " dragging" : ""),
          draggable: true,
          onDragStart: function (event) {
            setDragState({ type: "sector", index: sectorIndex });
            event.dataTransfer.effectAllowed = "move";
          },
          onDragOver: function (event) {
            if (dragState && dragState.type === "sector") {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          },
          onDrop: function (event) {
            event.preventDefault();
            if (dragState && dragState.type === "sector") {
              reorderSectors(dragState.index, sectorIndex);
            }
            setDragState(null);
          },
          onDragEnd: function () { setDragState(null); },
        },
        h(
          "div",
          { className: "sector-watch-box-head" },
          h("strong", null, h("span", { className: "drag-handle" }, "≡"), "(관) " + sector.sector),
          h("em", { className: metricClass(sector.avg_change_pct) }, sector.avg_change_pct == null ? "-" : formatPercent(sector.avg_change_pct, 2))
        ),
        h(
          "div",
          { className: "sector-watch-table-head" },
            h("span", null, "표시 기간"),
            h("span", null, "표시 기간"),
          h("span", null, "등락률")
        ),
        stocks.length
          ? h("div", { className: "sector-watch-stock-list" }, stocks.map(function (stock, index) { return renderStockRow(stock, sector.sector, index); }))
          : h("div", { className: "sector-watch-empty" }, "저장된 종목 없음"),
        h("div", { className: "sector-watch-more" }, savingOrder ? "순서 저장 중..." : numberFormat(sector.stock_count || stocks.length, 0) + "개 종목")
      );
    }

    if (request.loading && !sectors.length) {
      return LoadingPanel({ label: request.label });
    }
    if (request.error) {
      return ErrorPanel({ message: request.error });
    }
    if (!sectors.length) {
      return ErrorPanel({ message: "섹터 DB에 저장된 종목이 없습니다. 오늘의 주도주나 섹터 비교 테이블에서 섹터를 먼저 등록해주세요." });
    }

    return h(
      React.Fragment,
      null,
      h(KrxMarketMapPanel),
      renderMarketInvestorFlows(),
      h(
        "div",
        { className: "panel sector-watch-hero" },
        h(
          "div",
          { className: "sector-watch-hero-head" },
          h("div", null,
            h("div", { className: "eyebrow" }, "Watch Board"),
            h("h1", { className: "page-title" }, "관심종목 보드"),
            h("p", { className: "page-copy compact-copy" }, "섹터 DB에 저장된 종목을 섹터별 박스로 모아 현재가와 일간 등락률을 빠르게 확인합니다.")
          ),
          h(
            "button",
            {
              type: "button",
              className: "mini-button sector-watch-refresh-button",
              disabled: refreshingPrices || request.loading,
              onClick: refreshWatchPrices,
            },
            refreshingPrices || request.loading ? "가격 갱신 중..." : "현재가/등락률 새로고침"
          )
        )
      ),
      h(
        "div",
        { className: "sector-watch-layout" },
        h(
          "div",
          { className: "sector-watch-grid" },
          sectors.map(renderSectorBox)
        ),
        h(
          "div",
          { className: "panel sector-watch-detail theme-stock-chart-modal" },
          h(
            "div",
            { className: "section-toolbar" },
            h("div", null, h(SectionTitle, null, selectedStock ? selectedStock.stock_name + " 차트" : "종목 차트"), h("div", { className: "summary-help" }, data.as_of_date ? "가격 기준일 " + data.as_of_date : data.source || "")),
            selectedStock ? h("span", { className: "sector-watch-selected-code" }, selectedStock.stock_code) : null
          ),
          selectedStock
            ? h(StockChartPreview, {
                label: selectedStock.stock_name,
                loading: chartState.loading,
                error: chartState.error,
                data: chartState.data,
              })
            : h("div", { className: "notice-box compact" }, "위 섹터 박스에서 종목을 선택하면 차트가 표시됩니다.")
        )
      )
    );
  }

  function PortfolioPage() {
    const request = useFetchJson("/api/portfolio/performance");
    const alertRequest = useFetchJson("/api/stock-alert/status");
    const [selectedDate, setSelectedDate] = useState("");
    const [periodKey, setPeriodKey] = useState("");
    const [allocationMode, setAllocationMode] = useState("sector");
    const [xRange, setXRange] = useState(null);
    const [resetSignal, setResetSignal] = useState(0);
    const [alertRepo, setAlertRepo] = useState("celeste0423/stock_app");
    const [alertToken, setAlertToken] = useState("");
    const [telegramBotToken, setTelegramBotToken] = useState("");
    const [telegramChatId, setTelegramChatId] = useState("");
    const [alertSaving, setAlertSaving] = useState(false);
    const [telegramSaving, setTelegramSaving] = useState(false);
    const [telegramDetecting, setTelegramDetecting] = useState(false);
    const [telegramSyncing, setTelegramSyncing] = useState(false);
    const [alertSyncing, setAlertSyncing] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertPanelOpen, setAlertPanelOpen] = useState(false);
    const holdingsRequest = useFetchJson("/api/stock-alert/holdings", { enabled: alertPanelOpen });

    useEffect(function () {
      if (!request.data) {
        return;
      }
      const monthOptions = portfolioMonthOptions(request.data.series);
      const activePeriod = periodKey || monthOptions[monthOptions.length - 1] || "all";
      if (!periodKey) {
        setPeriodKey(activePeriod);
        return;
      }
      const details = ensureArray(request.data.daily_details).filter(function (item) {
        return itemInPortfolioPeriod(item, activePeriod);
      });
      if (details.length && !details.some(function (item) { return item.date === selectedDate; })) {
        setSelectedDate(details[details.length - 1].date);
      }
    }, [request.data, periodKey, selectedDate]);

    useEffect(function () {
      setXRange(null);
      setResetSignal(function (value) { return value + 1; });
    }, [periodKey]);

    if (request.loading) {
      return LoadingPanel({ label: request.label });
    }
    if (request.error) {
      return ErrorPanel({ message: request.error });
    }

    const data = request.data || {};
    const summary = data.summary || {};
    const alertStatus = alertRequest.data || {};
    const alertSnapshot = alertStatus.snapshot || {};
    const telegramStatus = alertStatus.telegram || {};
    const alertHoldings = ensureArray((holdingsRequest.data || {}).holdings);
    const monthOptions = portfolioMonthOptions(data.series);
    const activePeriod = periodKey || monthOptions[monthOptions.length - 1] || "all";
    const viewSeries = normalizePortfolioSeriesForPeriod(data.series, activePeriod);
    const viewLabels = viewSeries.map(function (item) { return item.date; });
    const viewBenchmark = normalizeBenchmarkForLabels(data.benchmark, viewLabels);
    const relativeStats = calculateRelativePortfolioStats(viewSeries, viewBenchmark);
    const details = ensureArray(data.daily_details).filter(function (item) {
      return itemInPortfolioPeriod(item, activePeriod);
    });
    const viewAllocations = ensureArray(data.daily_allocations).filter(function (item) {
      return itemInPortfolioPeriod(item, activePeriod);
    });
    const viewSeriesWithInvestmentState = markPortfolioInvestmentState(viewSeries, viewAllocations);
    const selectedDetail = details.find(function (item) { return item.date === selectedDate; }) || details[details.length - 1];
    const periodLabel = activePeriod === "all" ? "전체 기간" : monthLabel(activePeriod);

    function saveAlertSettings() {
      if (!alertRepo.trim() || !alertToken.trim()) {
        setAlertMessage("GitHub repository와 token을 입력해 주세요.");
        return;
      }
      setAlertSaving(true);
      setAlertMessage("");
      fetchJson("/api/stock-alert/github-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: alertRepo.trim(), token: alertToken.trim() }),
      }).then(function () {
        setAlertToken("");
        setAlertMessage("GitHub Secret 동기화 설정을 저장했습니다.");
        alertRequest.refresh(true);
      }).catch(function (error) {
        setAlertMessage(error.message || String(error));
      }).finally(function () {
        setAlertSaving(false);
      });
    }

    function syncAlertHoldings() {
      setAlertSyncing(true);
      setAlertMessage("");
      fetchJson("/api/stock-alert/sync-holdings", { method: "POST", noCache: true })
        .then(function (payload) {
          setAlertMessage("보유종목 " + numberFormat(payload.holding_count, 0) + "개를 GitHub Secret에 동기화했습니다.");
          alertRequest.refresh(true);
          holdingsRequest.refresh(true);
        })
        .catch(function (error) {
          setAlertMessage(error.message || String(error));
        })
        .finally(function () {
          setAlertSyncing(false);
        });
    }

    function saveTelegramSettings() {
      if (!telegramBotToken.trim()) {
        setAlertMessage("Telegram bot token을 입력해 주세요.");
        return;
      }
      setTelegramSaving(true);
      setAlertMessage("");
      fetchJson("/api/stock-alert/telegram-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: telegramBotToken.trim(), chat_id: telegramChatId.trim() }),
      }).then(function () {
        setTelegramBotToken("");
        setAlertMessage("Telegram bot 설정을 저장했습니다.");
        alertRequest.refresh(true);
      }).catch(function (error) {
        setAlertMessage(error.message || String(error));
      }).finally(function () {
        setTelegramSaving(false);
      });
    }

    function detectTelegramChat() {
      setTelegramDetecting(true);
      setAlertMessage("");
      fetchJson("/api/stock-alert/detect-telegram-chat", { method: "POST", noCache: true })
        .then(function (payload) {
          const picked = payload.picked || {};
          setTelegramChatId(picked.chat_id || "");
          setAlertMessage("Telegram chat id를 찾았습니다: " + (picked.title || picked.chat_id || ""));
          alertRequest.refresh(true);
        })
        .catch(function (error) {
          setAlertMessage(error.message || String(error));
        })
        .finally(function () {
          setTelegramDetecting(false);
        });
    }

    function syncTelegramSecrets() {
      setTelegramSyncing(true);
      setAlertMessage("");
      fetchJson("/api/stock-alert/sync-telegram-secrets", { method: "POST", noCache: true })
        .then(function () {
          setAlertMessage("Telegram bot token과 chat id를 GitHub Secrets에 동기화했습니다.");
          alertRequest.refresh(true);
        })
        .catch(function (error) {
          setAlertMessage(error.message || String(error));
        })
        .finally(function () {
          setTelegramSyncing(false);
        });
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel" },
        h("div", { className: "eyebrow" }, "Portfolio Backtest"),
        h("h1", { className: "page-title" }, "포트폴리오 수익"),
        h(
          "p",
          { className: "page-copy" },
          "엑셀 목표 비중을 기준으로 시초가 매수·매도와 보유 수량 유지 규칙을 적용한 수익률입니다. 기본 차트는 월초 기준 0%에서 시작하며, 전체 기간도 선택할 수 있습니다."
        ),
        h(
          "div",
          { className: "summary-grid" },
          h(SummaryCard, { label: "최종 수익률", value: formatPercent(summary.total_return_pct, 2), help: "초기 자본 대비 누적 기준" }),
          h(SummaryCard, { label: "\ub3d9\uae30\uac04 \ucd08\uacfc \uc218\uc775", value: formatPercent(relativeStats.alpha_pct, 2), help: periodLabel + " \ud3ec\ud2b8\ud3f4\ub9ac\uc624 \uc218\uc775\ub960 - KOSPI \uc218\uc775\ub960" }),
          h(SummaryCard, { label: "KOSPI \ubca0\ud0c0", value: relativeStats.beta == null ? "-" : numberFormat(relativeStats.beta, 2), help: periodLabel + " \ub3d9\uc548 \uc218\uc775\ub960 \ube44\uad50 \uae30\uc900 \ud45c\ubcf8 " + numberFormat(relativeStats.sample_count, 0) + "\uac1c" }),
          h(SummaryCard, { label: "리밸런싱 횟수", value: numberFormat(summary.rebalance_count, 0) + "회", help: "엑셀 기준 거래 발생일" }),
          h(SummaryCard, { label: "최근 보유 종목 수", value: numberFormat(summary.holding_count_latest, 0) + "개", help: "마지막 리밸런싱 이후 기준" })
        ),
        h(
          "div",
          { className: "toggle-group", style: { marginTop: "16px" } },
          h("label", { className: "inline-field" },
            h("span", null, "표시 기간"),
            h(
              "select",
              {
                value: activePeriod,
                onChange: function (event) { setPeriodKey(event.target.value); },
              },
              [
                h("option", { key: "all", value: "all" }, "전체 기간"),
              ].concat(monthOptions.slice().reverse().map(function (month) {
                return h("option", { key: month, value: month }, monthLabel(month));
              }))
            )
          ),
          h("button", {
            className: "primary-button",
            onClick: function () {
              window.location.href = "/api/portfolio/export.xlsx";
            },
          }, "엑셀로 내보내기")
        )
      ),
      h(
        "div",
        { className: "panel stock-alert-sync-panel" + (alertPanelOpen ? " open" : " collapsed") },
        h("div", { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "stock-alert-title" }, "\ubcf4\uc720\uc885\ubaa9 \ub274\uc2a4 \uc54c\ub9bc \ub3d9\uae30\ud654"),
            h("div", { className: "summary-help" }, "PC가 꺼져 있어도 GitHub Actions가 현재 보유종목 기준으로 뉴스를 감시하도록 GitHub Secret을 갱신합니다.")
          ),
          h("div", { className: "toggle-group" },
            h("span", { className: "telegram-status-pill" }, alertStatus.configured && telegramStatus.configured ? "연결됨" : "설정 필요"),
            h("button", { type: "button", className: "mini-button", onClick: function () { setAlertPanelOpen(!alertPanelOpen); } }, alertPanelOpen ? "접기" : "펼치기")
          )
        ),
        h(
          "div",
          { className: "stock-alert-mini-grid" },
          h("div", { className: "stock-alert-mini-card" },
            h("span", null, "표시 기간"),
            h("strong", null, alertStatus.configured && telegramStatus.configured ? "\ud65c\uc131\ud654\ub428" : "\uc124\uc815 \ud544\uc694"),
            h("em", null, alertStatus.repository || alertRepo || "-")
          ),
          h("div", { className: "stock-alert-mini-card" },
            h("span", null, "표시 기간"),
            h("strong", null, alertPanelOpen && holdingsRequest.loading ? "\ub85c\ub529" : numberFormat(alertPanelOpen ? alertHoldings.length : summary.holding_count_latest, 0) + "\uac1c"),
            h("em", null, (holdingsRequest.data || {}).source_date || alertSnapshot.source_date || "-")
          ),
          h("div", { className: "stock-alert-mini-card" },
            h("span", null, "표시 기간"),
            h("strong", null, numberFormat(alertSnapshot.holding_count, 0) + "?"),
            h("em", null, alertSnapshot.updated_at ? String(alertSnapshot.updated_at).slice(0, 16) : "\ubbf8\uc218\uc2e0")
          )
        ),
        alertPanelOpen
          ? h(React.Fragment, null,
              h("div", { className: "market-calendar-form-grid stock-alert-settings-grid" },
                h("label", null, h("span", null, "GitHub repo"), h("input", { className: "text-input", value: alertRepo, placeholder: "owner/repo", onChange: function (event) { setAlertRepo(event.target.value); } })),
                h("label", { className: "wide" }, h("span", null, "Fine-grained token"), h("input", { className: "text-input", type: "password", value: alertToken, placeholder: alertStatus.has_token ? "저장된 토큰 유지" : "Actions secrets write 권한 token", onChange: function (event) { setAlertToken(event.target.value); } })),
                h("button", { type: "button", className: "secondary-button", disabled: alertSaving, onClick: saveAlertSettings }, alertSaving ? "저장 중" : "설정 저장"),
                h("button", { type: "button", className: "primary-button", disabled: alertSyncing || !alertStatus.configured, onClick: syncAlertHoldings }, alertSyncing ? "동기화 중" : "보유종목 Secret 동기화")
              ),
              h("div", { className: "market-calendar-form-grid stock-alert-settings-grid" },
                h("label", { className: "wide" }, h("span", null, "Telegram bot token"), h("input", { className: "text-input", type: "password", value: telegramBotToken, placeholder: telegramStatus.has_bot_token ? "저장된 봇 토큰 유지" : "BotFather token", onChange: function (event) { setTelegramBotToken(event.target.value); } })),
                h("label", null, h("span", null, "Telegram chat id"), h("input", { className: "text-input", value: telegramChatId || telegramStatus.chat_id || "", placeholder: "봇에게 /start 후 자동 찾기", onChange: function (event) { setTelegramChatId(event.target.value); } })),
                h("button", { type: "button", className: "secondary-button", disabled: telegramSaving, onClick: saveTelegramSettings }, telegramSaving ? "저장 중" : "봇 설정 저장"),
                h("button", { type: "button", className: "secondary-button", disabled: telegramDetecting || !telegramStatus.has_bot_token, onClick: detectTelegramChat }, telegramDetecting ? "찾는 중" : "Chat ID 자동 찾기"),
                h("button", { type: "button", className: "primary-button", disabled: telegramSyncing || !alertStatus.configured || !telegramStatus.configured, onClick: syncTelegramSecrets }, telegramSyncing ? "동기화 중" : "Telegram Secrets 동기화")
              ),
              alertMessage ? h("div", { className: "summary-help" + (alertMessage.indexOf("오류") >= 0 || alertMessage.indexOf("필요") >= 0 ? " text-danger" : "") }, alertMessage) : null,
              alertHoldings.length
                ? h(DataTable, {
                    rows: alertHoldings.slice(0, 8),
                    emptyMessage: "보유 종목이 없습니다.",
                    columns: [
                      { key: "name", label: "종목" },
                      { key: "code", label: "코드" },
                      { key: "weight_pct", label: "비중", render: function (row) { return formatPercent(row.weight_pct, 1); } },
                      { key: "source_date", label: "기준일" },
                    ],
                  })
                : null
            )
          : null
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "chart-toolbar" },
          h("div", { className: "section-title" }, "일자별 설명"),
          h(
            "div",
            { className: "toggle-group" },
            h("div", { className: "chart-hint" }, periodLabel + " 기준"),
            h("button", {
              className: "mini-button",
              onClick: function () {
                setXRange(null);
                setResetSignal(function (value) { return value + 1; });
              },
            }, "줌 초기화")
          )
        ),
        h("div", { className: "chart-hint" }, "세로축은 선택 기간 첫 거래일 대비 수익률 %입니다. 코스피와 포트폴리오 모두 같은 지점에서 출발합니다."),
        h(PerformanceChart, {
          series: viewSeriesWithInvestmentState,
          benchmark: viewBenchmark,
          xRange: xRange,
          onRangeChange: setXRange,
          resetSignal: resetSignal,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "chart-toolbar" },
          h("div", { className: "section-title" }, "MDD"),
          h("div", { className: "chart-hint" }, periodLabel + " 기준")
        ),
        h("div", { className: "chart-hint" }, "선택 기간 내 누적수익률의 직전 고점 대비 하락률입니다. 0%에 가까울수록 고점 회복 상태입니다."),
        h(PortfolioMddChart, {
          series: viewSeries,
          benchmark: viewBenchmark,
          xRange: xRange,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "chart-toolbar" },
          h("div", { className: "section-title" }, "일별 비중 누적 막대"),
          h(
            "div",
            { className: "toggle-group" },
            h("button", {
              className: "mini-button" + (allocationMode === "sector" ? " active" : ""),
              onClick: function () { setAllocationMode("sector"); },
            }, "섹터별"),
            h("button", {
              className: "mini-button" + (allocationMode === "stock" ? " active" : ""),
              onClick: function () { setAllocationMode("stock"); },
            }, "종목별")
          )
        ),
        h("div", { className: "chart-hint" }, "주식 비중만 표시합니다. 100% 초과 구간은 레버리지 사용으로 해석합니다."),
        h(AllocationChart, {
          allocations: viewAllocations,
          mode: allocationMode,
          xRange: xRange,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h("div", { className: "section-toolbar" },
          h("div", { className: "section-title" }, "일자별 설명"),
          h(
            "select",
            {
              value: selectedDetail ? selectedDetail.date : "",
              onChange: function (event) { setSelectedDate(event.target.value); },
            },
            details.slice().reverse().map(function (item) {
              return h("option", { key: item.date, value: item.date }, item.date);
            })
          )
        ),
        selectedDetail ? h(
          React.Fragment,
          null,
          h(
            "div",
            { className: "summary-grid summary-grid-small" },
            h(SummaryCard, { label: "일간 수익률", value: formatPercent(selectedDetail.daily_return_pct, 3), help: selectedDetail.date }),
            h(SummaryCard, { label: "거래 수", value: numberFormat(selectedDetail.trade_count, 0) + "건", help: "비중 증감분만 집계" })
          ),
          h("div", { className: "subsection-title" }, "종목별 기여도"),
          h(DataTable, {
            rows: ensureArray(selectedDetail.trades),
            emptyMessage: "해당 일자에는 시초가 거래가 없습니다.",
            columns: [
              { key: "stock_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || "-"; } },
              { key: "action", label: "구분" },
              { key: "delta_weight_pct", label: "비중 변화", render: function (row) { return formatPercent(row.delta_weight_pct, 2); } },
              { key: "open_price", label: "시초가", render: function (row) { return numberFormat(row.open_price, 0); } },
              { key: "trade_value", label: "거래 금액", render: function (row) { return formatCurrency(row.trade_value); } },
              { key: "delta_shares", label: "수량 변화", render: function (row) { return numberFormat(row.delta_shares, 4); } },
            ],
          }),
          h("div", { className: "subsection-title" }, "종목별 기여도"),
          h(DataTable, {
            rows: ensureArray(selectedDetail.contributors),
            emptyMessage: "기여도 데이터가 없습니다.",
            columns: [
              { key: "stock_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || "-"; } },
              { key: "sector", label: "섹터" },
              { key: "total_pct_points", label: "총 기여", render: function (row) { return h("span", { className: pnlClass(row.total_pct_points) }, formatPercent(row.total_pct_points, 3)); } },
              { key: "overnight_pct_points", label: "갭 기여", render: function (row) { return h("span", { className: pnlClass(row.overnight_pct_points) }, formatPercent(row.overnight_pct_points, 3)); } },
              { key: "intraday_pct_points", label: "장중 기여", render: function (row) { return h("span", { className: pnlClass(row.intraday_pct_points) }, formatPercent(row.intraday_pct_points, 3)); } },
              { key: "close_change_pct", label: "당일 등락", render: function (row) { return h("span", { className: pnlClass(row.close_change_pct) }, formatPercent(row.close_change_pct, 2)); } },
            ],
          })
        ) : EmptyState({ message: "선택 가능한 일별 상세 데이터가 없습니다." })
      ),
      h(PortfolioTradeAnalysisPanel, { analysis: data.trade_analysis })
    );
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
                h(SummaryCard, { label: "시총 2000억 이상", value: numberFormat(themes.qualified_count, 0) + "개", help: "점수와 관계없이 표시" }),
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
            { key: "avg_score", label: "?됯퇏 ?먯닔", render: function (row) { return numberFormat(row.avg_score, 2); } },
            { key: "max_score", label: "理쒓퀬 ?먯닔", render: function (row) { return numberFormat(row.max_score, 2); } },
            { key: "avg_change_pct", label: "\ud3c9\uade0 \ub4f1\ub77d\ub960", render: function (row) { return formatPercent(row.avg_change_pct, 2); } },
            { key: "themes", label: "諛섎났 ?뚮쭏", render: function (row) { return ensureArray(row.themes).join(", "); } },
            { key: "notes", label: "?뱀쭠 硫붾え", render: function (row) { return row.notes || "-"; } },
          ],
          emptyMessage: "理쒓렐 諛섎났 ?깆옣 醫낅ぉ ?곗씠?곌? ?놁뒿?덈떎.",
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
          : EmptyState({ message: "?ㅻ뒛 ?뚮쭏 ?곗씠?곌? ?놁뒿?덈떎." })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 議곌굔 異⑹” 醫낅ぉ"),
        h(DataTable, {
          rows: ensureArray(themes.qualified_stocks),
          columns: [
            { key: "stock_name", label: "종목" },
            { key: "theme", label: "?뚮쭏" },
            { key: "score", label: "?먯닔", render: function (row) { return numberFormat(row.score, 2); } },
            { key: "change_pct", label: "\ub4f1\ub77d\ub960", render: function (row) { return formatPercent(row.change_pct, 2); } },
            { key: "lead_count", label: "二쇰룄 ?잛닔", render: function (row) { return numberFormat(row.lead_count, 0); } },
            { key: "avg_lead_score", label: "?됯퇏 ?먯닔", render: function (row) { return numberFormat(row.avg_lead_score, 2); } },
            { key: "note", label: "비고" },
          ],
                        emptyMessage: "판별 모드 집계가 없습니다.",
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
    const [strategyMode, setStrategyMode] = useState("leader_top10");
    const [indexKey, setIndexKey] = useState("KS11");
    const [leaderTopN, setLeaderTopN] = useState(100);
    const [leaderEntryThreshold, setLeaderEntryThreshold] = useState(65);
    const [leaderExitThreshold, setLeaderExitThreshold] = useState(50);
    const [leaderAllocationMode, setLeaderAllocationMode] = useState("score_weight");
    const [strategyKey, setStrategyKey] = useState("ma20_cross");
    const [startDate, setStartDate] = useState(function () { return isoDateOffset(-365); });
    const [endDate, setEndDate] = useState(function () { return isoDateOffset(0); });
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
    const [sectorStartDate, setSectorStartDate] = useState(function () { return isoDateOffset(-120); });
    const [sectorEndDate, setSectorEndDate] = useState(function () { return isoDateOffset(0); });
    const [sectorMinScore, setSectorMinScore] = useState(50);
    const [sectorTopCount, setSectorTopCount] = useState(4);
    const [sectorStocksCount, setSectorStocksCount] = useState(4);
    const [sectorLeverage, setSectorLeverage] = useState(1);
    const [sectorWeightMethod, setSectorWeightMethod] = useState("strength");
    const [queryState, setQueryState] = useState(function () {
      return {
        index: "KS11",
        strategy: "leader_custom",
        start: isoDateOffset(-365),
        end: isoDateOffset(0),
        top_n: 100,
        entry_threshold: 65,
        exit_threshold: 50,
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
      index: strategyMode === "leader_top10" ? "KS11" : queryState.index,
      strategy: strategyMode === "leader_top10" ? "leader_custom" : queryState.strategy,
      start: queryState.start,
      end: queryState.end,
    });
    if (strategyMode === "leader_top10") {
      params.set("strategy", "leader_custom");
      params.set("top_n", String(queryState.top_n || leaderTopN || 100));
      params.set("entry_threshold", String(queryState.entry_threshold != null ? queryState.entry_threshold : leaderEntryThreshold));
      params.set("exit_threshold", String(queryState.exit_threshold != null ? queryState.exit_threshold : leaderExitThreshold));
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
    const indexRequest = useFetchJson("/api/strategy/backtest?" + params.toString(), { enabled: strategyMode === "index" || strategyMode === "leader_top10" });
    const sectorRequest = useFetchJson("/api/strategy/sector-rotation?" + sectorParams.toString(), { enabled: strategyMode === "sector_rotation" });
    const advancedRequest = useFetchJson("/api/strategy/advanced-sector?" + advancedParams.toString(), { enabled: strategyMode === "advanced_sector" });
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

    function applyBacktest() {
      setQueryState({
        index: indexKey,
        strategy: strategyKey,
        start: startDate,
        end: endDate,
      });
    }

    function applyLeaderBacktest() {
      const leaderStart = startDate || isoDateOffset(-365);
      const leaderEnd = endDate || isoDateOffset(0);
      setIndexKey("KS11");
      setStartDate(leaderStart);
      setQueryState({
        index: "KS11",
        strategy: "leader_custom",
        start: leaderStart,
        end: leaderEnd,
        top_n: Number(leaderTopN || 0) > 0 ? Number(leaderTopN) : 9999,
        entry_threshold: Number(leaderEntryThreshold || 0),
        exit_threshold: Number(leaderExitThreshold || 0),
        allocation_mode: leaderAllocationMode || "score_weight",
        refresh: String(Date.now()),
      });
    }

    function applySectorBacktest() {
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
          onClick: function () { setStrategyMode(mode); },
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
          label: "편출",
          price: trade.entry_price,
        });
      }
      if (trade && trade.exit_date) {
        markers.push({
          date: trade.exit_date,
          type: "sell",
          label: "편출",
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

    function openStrategyTradeChart(trade) {
      const row = trade || {};
      const code = String(row.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = row.stock_name || row.resolved_name || row.stock_key || "";
      if (!code || code === "000000") {
        return;
      }
      setStrategyTradeChartPopup({ open: true, trade: row, loading: true, error: "", data: null, scoreLoading: true, scoreError: "", scoreData: null });
      const params = new URLSearchParams();
      params.set("code", code);
      params.set("name", name);
      params.set("months", "12");
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
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
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
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: scenarios,
                        emptyMessage: "섹터 기여도 데이터가 없습니다.",
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
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(
                          "div",
                          { className: "strategy-feedback-list" },
                          feedback.length
                            ? feedback.map(function (text, index) {
                                return h("div", { key: index, className: "strategy-feedback-item" }, text);
                              })
                            : h("div", { className: "summary-help" }, "피드백 데이터가 없습니다.")
                        )
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                      h(DataTable, {
                        rows: tailRuleExamples,
                        emptyMessage: "실전 꼬리룰에 걸린 종목이 없습니다.",
                        columns: [
                          { key: "date", label: "날짜" },
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
                          { key: "reason", label: "판별 근거" },
                        ],
                      })
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
            h("div", { className: "subsection-title" }, "보유 종목/비중"),
                        h(DataTable, {
                          rows: worstStocks,
          emptyMessage: "최근 목표 포트폴리오가 없습니다.",
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
            h("div", { className: "subsection-title" }, "보유 종목/비중"),
                        h(DataTable, {
                          rows: topContributors,
          emptyMessage: "최근 목표 포트폴리오가 없습니다.",
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
          emptyMessage: "최근 목표 포트폴리오가 없습니다.",
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
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: indexKey,
            onChange: function (event) { setIndexKey(event.target.value); },
          }, availableIndexes.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: strategyKey,
            onChange: function (event) { setStrategyKey(event.target.value); },
          }, availableStrategies.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
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

    function renderLeaderControls() {
      return h(
        "div",
        { className: "strategy-control-grid" },
        h("label", null,
          h("span", null, "TopN"),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderTopN,
            onChange: function (event) { setLeaderTopN(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderEntryThreshold,
            onChange: function (event) { setLeaderEntryThreshold(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderExitThreshold,
            onChange: function (event) { setLeaderExitThreshold(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: leaderAllocationMode,
            onChange: function (event) { setLeaderAllocationMode(event.target.value); },
          },
            h("option", { value: "score_weight" }, "\uc810\uc218 \ube44\uc911\ub300\ub85c"),
            h("option", { value: "fixed_20" }, "\uc885\ubaa9\ub2f9 20%")
          )
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
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
            onClick: applyLeaderBacktest,
            disabled: indexRequest.loading,
          },
          indexRequest.loading ? "계산 중" : "백테스트 실행"
        )
      );
    }

    function renderLeaderResult() {
      var leaderRows = rows;
      var leaderAllocationLabel = (queryState.allocation_mode || leaderAllocationMode || "score_weight") === "fixed_20" ? "\uc885\ubaa9\ub2f9 20%" : "\uc810\uc218 \ube44\uc911\ub300\ub85c";
      var selectedLeaderLabel = "\uc624\ub298\uc758 \uc8fc\ub3c4\uc8fc \uc804\ub7b5 Top" + numberFormat(Number(queryState.top_n || leaderTopN || 100), 0)
        + " / \ub9e4\uc218 " + numberFormat(Number(queryState.entry_threshold != null ? queryState.entry_threshold : leaderEntryThreshold), 1)
        + " / \ub9e4\ub3c4 " + numberFormat(Number(queryState.exit_threshold != null ? queryState.exit_threshold : leaderExitThreshold), 1)
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
      var holdingDetailRows = [];
      leaderRows.forEach(function (row) {
        var currentHoldings = ensureArray(row.holdings);
        currentHoldings.forEach(function (item) {
          if (String(item.status || "") === "\ud3b8\uc785") {
            holdingDetailRows.push({
              date: row.date,
              stock_code: item.stock_code || "",
              stock_name: item.stock_name || item.stock_key || "-",
              action: "\ub9e4\uc218",
              buy_avg_price: item.avg_buy_price,
              sell_avg_price: null,
              sell_return_pct: null,
              markers: [{ date: row.date, type: "buy", label: "\ub9e4\uc218" }],
            });
          }
        });
        ensureArray(row.entry_exit && row.entry_exit.sell_details).forEach(function (detail) {
          holdingDetailRows.push({
            date: row.date,
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            action: "\ub9e4\ub3c4",
            buy_avg_price: detail.avg_buy_price,
            sell_avg_price: detail.sell_price,
            sell_return_pct: detail.sell_return_pct,
            markers: [{ date: row.date, type: "sell", label: "\ub9e4\ub3c4" }],
          });
        });
      });
      var stockMarkerMap = {};
      holdingDetailRows.forEach(function (item) {
        var code = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var key = code || String(item.stock_name || "");
        if (!key) return;
        if (!stockMarkerMap[key]) stockMarkerMap[key] = [];
        stockMarkerMap[key] = stockMarkerMap[key].concat(ensureArray(item.markers));
      });
      holdingDetailRows = holdingDetailRows.map(function (item) {
        var code = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var key = code || String(item.stock_name || "");
        return Object.assign({}, item, { markers: ensureArray(stockMarkerMap[key]) });
      });
      return indexRequest.error
        ? h(ErrorPanel, { message: indexRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, "\ubc31\ud14c\uc2a4\ud2b8 \uacb0\uacfc \u00b7 " + selectedLeaderLabel),
            h("div", { className: "summary-help" }, "PC가 꺼져 있어도 GitHub Actions가 현재 보유종목 기준으로 뉴스를 감시하도록 GitHub Secret을 갱신합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (data.start_date || startDate) + " ~ " + (data.end_date || endDate))
            ),
            h(
              "div",
              { className: "strategy-summary-scroll" },
              h(
                "div",
                { className: "strategy-summary-row" },
              h(SummaryCard, { label: "지수 수익률", value: formatPercent(summary.index_return_pct, 2) }),
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(summary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "초과 수익", value: formatPercent(summary.excess_return_pct, 2) }),
              h(SummaryCard, { label: "매매 신호", value: numberFormat(summary.signal_count, 0) + "회" }),
                h(SummaryCard, { label: "\ud3c9\uade0 \ubcf4\uc720 \uc885\ubaa9", value: numberFormat(summary.avg_holdings_count, 1) + "\uac1c" }),
                h(SummaryCard, { label: "\ub204\uc801 \uc218\uc218\ub8cc", value: formatPercent(summary.total_fee_pct_points, 2) })
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
                      indexName: "KOSPI",
                      strategyName: "\uc624\ub298\uc758 \uc8fc\ub3c4\uc8fc",
                    }),
                    h(
                      "div",
                      { className: "strategy-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
            h("div", { className: "subsection-title" }, "그날 편입/편출"),
                        h(DataTable, {
                          rows: holdingsTimelineRows,
          emptyMessage: "해당 일자 선택 종목이 없습니다.",
                          columns: [
                            { key: "date", label: "date" },
                            { key: "holdings_count", label: "\ubcf4\uc720\uc885\ubaa9\uc218" },
                            { key: "all_holdings", label: "all_holdings" },
                            { key: "top5_holdings", label: "top5_holdings" },
                            { key: "entry_exit", label: "\ud3b8\uc785/\ud3b8\ucd9c" },
                            { key: "sector_weight_sum", label: "\uc139\ud130 \ube44\uc911 \ud569\uacc4" },
                          ],
                          compact: true,
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "최근 편입/제외 로그"),
                        h(DataTable, {
                          rows: holdingDetailRows,
          emptyMessage: "해당 일자 선택 종목이 없습니다.",
                          columns: [
                            { key: "date", label: "신호일" },
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "action", label: "구분" },
                            { key: "buy_avg_price", label: "\ub9e4\uc218\ud3c9\uade0\uac00", render: function (row) { return row.buy_avg_price == null ? "-" : numberFormat(row.buy_avg_price, 0) + "\uc6d0"; } },
                            { key: "sell_avg_price", label: "\ub9e4\ub3c4\ud3c9\uade0\uac00", render: function (row) { return row.sell_avg_price == null ? "-" : numberFormat(row.sell_avg_price, 0) + "\uc6d0"; } },
                            { key: "sell_return_pct", label: "\ub9e4\ub3c4\uc218\uc775\ub960", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      )
                    )
                  )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
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
            h("option", { key: "score", value: "score" }, "기존 점수순"),
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
        h(SectionTitle, null, "이번 분기 어닝 서프라이즈"),
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
        h(SectionTitle, null, "이번 분기 어닝 서프라이즈"),
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
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
            h(DataTable, {
              rows: holdings,
                          emptyMessage: "기여도 데이터가 없습니다.",
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
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
            h(DataTable, {
              rows: trades,
                          emptyMessage: "기여도 데이터가 없습니다.",
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
        h(SectionTitle, null, "이번 분기 어닝 서프라이즈"),
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
          renderModeButton("leader_top10", "\uc8fc\ub3c4\uc8fc Top10\u00b770\uc810"),
          renderModeButton("advanced_sector", "고급 섹터 신호"),
          renderModeButton("sector_rotation", "주도주 섹터 로테이션"),
          renderModeButton("index", "지수 전략")
        ),
        strategyMode === "leader_top10"
          ? renderLeaderControls()
          : strategyMode === "advanced_sector" ? renderAdvancedControls() : strategyMode === "sector_rotation" ? renderSectorControls() : renderIndexControls()
      ),
      strategyMode === "leader_top10"
        ? renderLeaderResult()
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
              h(LinkifiedText, { text: row.text || "(\uD14D\uC2A4\uD2B8 \uC5C6\uC74C)" }),
              row.attachment_url
                ? h("a", {
                    className: "attachment-pill",
                    href: row.attachment_url,
                    target: "_blank",
                    rel: "noreferrer",
                  }, row.file_name || "\uCCA8\uBD80\uD30C\uC77C \uC5F4\uAE30")
                : null,
              ensureArray(row.links).length
                ? h(
                    "div",
                    { className: "telegram-links" },
                    ensureArray(row.links).map(function (link, index) {
                      return h("a", { key: link + index, href: link, target: "_blank", rel: "noreferrer" }, link);
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
        if (/^(\uacf5\uc2dc\ub9c1\ud06c|\ud68c\uc0ac\uc815\ubcf4)\\s*:/i.test(trimmed)) {
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
          h("div", { className: "earnings-message-text" }, h(LinkifiedText, { text: row.text || "" })),
          links.length
            ? h(
                "div",
                { className: "telegram-links" },
                links.map(function (link) {
                  return h("a", { key: link.href, href: link.href, target: "_blank", rel: "noreferrer" }, link.label);
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
            h("th", null, "영익 예상"),
            h("th", null, "영익 예상"),
            h("th", null, "영익 예상"),
            h("th", null, "영익 예상"),
            h("th", null, "영익 예상"),
            h("th", null, "영익 예상"),
            h("th", null, "영익 예상"),
            h("th", null, "OPM")
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
            const companyMeta = [
              row.stock_code || row.company_code || "",
              formatMarketCap100m(row.market_cap_100m) ? "시총 " + formatMarketCap100m(row.market_cap_100m) : "",
            ].filter(Boolean).join(" · ");
            return h(
              React.Fragment,
              { key: row.chat_id + ":" + row.message_id },
              h(
                "tr",
                { className: "market-earnings-delta-row" },
                h("td", { colSpan: 3 }, "증감률"),
                h("td", { className: "num-cell delta-strip" }, renderDeltaBadge("", sales.qoq), renderDeltaBadge("", sales.yoy)),
                h("td", { className: "num-cell delta-strip" }, renderDeltaBadge("", sales.surprise, "surprise-text")),
                h("td", { className: "num-cell delta-strip" }, renderDeltaBadge("", operating.qoq), renderDeltaBadge("", operating.yoy)),
                h("td", { className: "num-cell delta-strip" }, renderDeltaBadge("", operating.surprise, "surprise-text")),
                h("td", null)
              ),
              h(
                "tr",
                { className: "market-earnings-main-row" },
                h("td", { className: "market-earnings-date" }, h("strong", null, dateParts.date), dateParts.time ? h("span", null, dateParts.time) : null),
                h("td", { className: "market-earnings-company" }, h("strong", null, row.stock_name || row.company || "-"), companyMeta ? h("span", null, companyMeta) : null),
                h("td", { className: "market-earnings-report", title: report }, report),
                h("td", { className: "num-cell metric-with-deltas" }, h("div", { className: "metric-inline" }, h("strong", null, sales.actual || "-"))),
                h("td", { className: "num-cell subtle-cell" }, sales.expected || "-"),
                h("td", { className: "num-cell metric-with-deltas" }, h("div", { className: "metric-inline" }, h("strong", null, operating.actual || "-"))),
                h("td", { className: "num-cell subtle-cell" }, operating.expected || "-"),
                h("td", { className: "num-cell opm-cell" }, operating.opm || "-")
              )
            );
          })
        )
      )
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
    const [financialTrend, setFinancialTrend] = useState(savedState.financialTrend || null);
    const [financialTrendLoading, setFinancialTrendLoading] = useState(false);
    const [financialTrendMessage, setFinancialTrendMessage] = useState(savedState.financialTrendMessage || "");
    const earningsTimerRef = useRef(null);
    const earningsSuggestWrapRef = useRef(null);
    const marketLoadedRef = useRef(!!savedState.marketPayload);
    const marketScrollBoxRef = useRef(null);
    const marketScrollTopRef = useRef(Number(savedState.marketScrollTop || 0));
    const marketScrollSaveTimerRef = useRef(null);

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
        renderBusinessSegmentsPanel(),
        h(
          "div",
          { className: "earnings-result-visual-grid" },
          h(
            "div",
            { className: "earnings-scroll-box" },
            h(TelegramEarningsResults, {
              rows: earningsResults,
              emptyMessage: earningsLoading ? "공시를 검색 중입니다." : "기업명을 입력하면 선택한 유형의 공시를 최근 3년 범위에서 표시합니다.",
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
            h(SectionTitle, null, "시총 2000억 이상 실적 공시"),
            h("div", { className: "summary-help" },
              marketPayload
                ? "최근 " + numberFormat(marketPayload.days, 0) + "일 · " + numberFormat(marketPayload.result_count, 0) + "건 · 스캔 " + numberFormat(marketPayload.scanned_count, 0) + "개 메시지"
                : "텔레그램 공시 채널에서 실적 공시를 날짜순으로 모읍니다."
            )
          ),
          h("button", {
            className: "mini-button",
            onClick: loadMarketEarnings,
            disabled: marketLoading || !status.authorized,
          }, marketLoading ? "불러오는 중..." : "새로고침")
        ),
        marketMessage ? h("div", { className: "notice-box compact" }, marketMessage) : null,
        h(
          "div",
          { className: "earnings-scroll-box market-earnings-scroll-box", ref: marketScrollBoxRef, onScroll: rememberMarketScroll },
          marketLoading && !marketPayload
            ? h(LoadingBlock, { compact: true, title: "실적 공시 수집 중", label: "최근 메시지를 훑어 시총 2000억 이상 종목과 매칭합니다." })
            : h(MarketEarningsTable, {
                rows: ensureArray(marketPayload && marketPayload.results),
                emptyMessage: status.authorized ? "조건에 맞는 실적 공시가 아직 없습니다." : "텔레그램 연결 후 확인할 수 있습니다.",
              })
        )
      ),
      h(EarningsSurpriseRankList, {
        rows: ensureArray(marketPayload && marketPayload.results),
      })
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
    const [businessSegments, setBusinessSegments] = useState(savedTelegramState.businessSegments || null);
    const [businessSegmentsLoading, setBusinessSegmentsLoading] = useState(false);
    const [businessSegmentsMessage, setBusinessSegmentsMessage] = useState(savedTelegramState.businessSegmentsMessage || "");
    const [companyLinkLoading, setCompanyLinkLoading] = useState("");
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
      setBusinessSegments(source.businessSegments || null);
      setBusinessSegmentsMessage(String(source.businessSegmentsMessage || ""));
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
        businessSegments: businessSegments,
        businessSegmentsMessage: businessSegmentsMessage,
      };
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
    }, [keywords, matchMode, exactPhrase, hasFile, startDate, endDate, chatQuery, allRoomsSearch, selectedChats, favoriteChatGroups, results, jobState, earningsQuery, earningsResults, earningsMessage, disclosureCategory, disclosureNextOffsetId, disclosureHasMore, financialTrend, financialTrendMessage, businessSegments, businessSegmentsMessage]);

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
      if (
        pendingFinancialTrendRef.current &&
        (incomingRows.length || (job && job.finished))
      ) {
        const trendCompany = pendingFinancialTrendRef.current;
        pendingFinancialTrendRef.current = "";
        loadFinancialTrend(trendCompany);
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

    async function runEarningsSearch(append, overrideCompany, overrideCategory) {
      const company = String(overrideCompany || earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage("사업보고서를 열 기업명을 입력해 주세요.");
        return;
      }
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
        linkedMessageSearchRef.current = {
          pending: !overrideCategory,
          company: !overrideCategory ? company : "",
        };
        pendingFinancialTrendRef.current = company;
        setFinancialTrend(null);
        setFinancialTrendMessage("");
        setBusinessSegments(null);
        setBusinessSegmentsMessage("");
        loadBusinessSegments(company);
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

    async function openLatestKindReport(reportScope) {
      const scope = reportScope === "periodic" ? "periodic" : "business";
      const company = String(earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage((scope === "periodic" ? "\uc815\uae30 \ubcf4\uace0\uc11c" : "\uc0ac\uc5c5\ubcf4\uace0\uc11c") + "\ub97c \uc5f4 \uc885\ubaa9\uba85\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.");
        return;
      }
      const popup = window.open("about:blank", "_blank");
      setCompanyLinkLoading(scope === "periodic" ? "kind-periodic" : "kind-business");
      setEarningsMessage("");
      try {
        const endpoint = scope === "periodic" ? "/api/kind/latest-periodic-report" : "/api/kind/latest-business-report";
        const payload = await fetchJson(endpoint + "?company=" + encodeURIComponent(company), { noCache: true });
        if (popup) {
          popup.location.href = payload.url;
        } else {
          window.open(payload.url, "_blank", "noopener,noreferrer");
        }
        setEarningsMessage((payload.stock_name || company) + " " + (payload.title || (scope === "periodic" ? "\uc815\uae30 \ubcf4\uace0\uc11c" : "\uc0ac\uc5c5 \ubcf4\uace0\uc11c")) + "\ub97c KIND\uc5d0\uc11c \uc5f4\uc5c8\uc2b5\ub2c8\ub2e4.");
      } catch (err) {
        if (popup) {
          popup.close();
        }
        setEarningsMessage(err.message || String(err));
      } finally {
        setCompanyLinkLoading("");
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
      let popup = null;
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
        popup = window.open("about:blank", "_blank");
        const url = site === "wisereport"
          ? "https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd=" + encodeURIComponent(stock.code)
          : site === "irgo"
            ? "https://m.irgo.co.kr/IR-COMP/" + encodeURIComponent(stock.code) + "/" + encodeURIComponent(stock.name + "-IR-PAGE")
            : "https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd=" + encodeURIComponent(stock.code);
        if (popup) {
          popup.location.href = url;
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        setEarningsMessage(stock.name + " 정보를 " + (site === "wisereport" ? "WiseReport" : site === "irgo" ? "IRGO" : "외부 사이트") + "에서 열었습니다.");
      } catch (err) {
        if (popup) {
          popup.close();
        }
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
            h("strong", null, "사업 분야"),
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
            h("strong", null, "사업 분야"),
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
            h("strong", null, "사업 분야"),
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
          h("span", { className: "summary-help" }, "Awake - 실시간 주식 공시 정리채널과 텔레그램 메시지 검색을 같은 기업명으로 함께 조회합니다.")
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
          h(
            "label",
            { className: "form-field earnings-company-field", ref: earningsSuggestWrapRef },
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
                onClick: function () { openLatestKindReport("business"); },
                disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
              }, companyLinkLoading === "kind-business" ? "\ubd88\ub7ec\uc624\ub294 \uc911..." : "\uc0ac\uc5c5\ubcf4\uace0\uc11c"),
              h("button", {
                className: "earnings-action-button split-right",
                onClick: function () { openLatestKindReport("periodic"); },
                disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
              }, companyLinkLoading === "kind-periodic" ? "\ubd88\ub7ec\uc624\ub294 \uc911..." : "\uc815\uae30\ubcf4\uace0\uc11c")
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
        renderBusinessSegmentsPanel(),
        h(
          "div",
          { className: "earnings-result-visual-grid" },
          h(
            "div",
            { className: "earnings-scroll-box" },
            h(TelegramEarningsResults, {
              rows: earningsResults,
              emptyMessage: earningsLoading ? "공시를 검색 중입니다." : "기업명을 입력하면 선택한 유형의 공시를 최근 3년 범위에서 표시합니다.",
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
                h(SectionTitle, null, "최근 실적 요약"),
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
          h("label", { className: "form-field" }, "첨부파일 조건", h("select", {
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
        h("label", { className: "form-field" }, "방 이름 검색", h("input", {
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })),
        h("label", { className: "form-field" }, "방 이름 검색", h("input", {
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
          h("em", null, allRoomsSearch ? "선택 방과 즐겨찾기 그룹은 유지하지만 검색은 전체 방에서 진행합니다." : "선택한 방/그룹에서만 검색합니다.")
        ),
        h("label", { className: "form-field" }, "방 이름 검색", h("input", {
          value: chatQuery,
          onChange: function (event) { setChatQuery(event.target.value); },
          onFocus: selectTextOnFocus,
          placeholder: "방 이름을 검색해서 선택하세요.",
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
                      title: "그룹 삭제",
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
                h(SectionTitle, null, "최근 실적 요약"),
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

  function formatUsdCompactFromHundredMillion(value100m, digits) {
    const number = Number(value100m);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return formatUsdCompact(number * 100000000, digits == null ? 1 : digits);
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

  function StockNewsPage() {
    const savedState = loadStockNewsState();
    const [query, setQuery] = useState(savedState.query || "");
    const [suggestions, setSuggestions] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [selected, setSelected] = useState(savedState.selected || null);
    const [days, setDays] = useState(savedState.days || 365);
    const [payload, setPayload] = useState(savedState.payload || null);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingNews, setLoadingNews] = useState(false);
    const [message, setMessage] = useState("");
    const searchTimerRef = useRef(null);

    useEffect(function () {
      return function () {
        if (searchTimerRef.current) {
          clearTimeout(searchTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      persistStockNewsState({
        query: query,
        selected: selected,
        days: days,
        payload: payload,
      });
    }, [query, selected, days, payload]);

    useEffect(function () {
      const stock = (payload || {}).stock || selected || {};
      const detail = stock.name || query || "";
      emitWindowTitleDetail("stock-news", detail ? "뉴스: " + detail : "");
    }, [query, selected, payload]);

    function runAutocomplete(value) {
      setQuery(value);
      setSelected(null);
      setMessage("");
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      if (!String(value || "").trim()) {
        setSuggestions([]);
        return;
      }
      searchTimerRef.current = setTimeout(function () {
        setLoadingSearch(true);
        fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()) + "&limit=10")
          .then(function (nextPayload) {
            setSuggestions(ensureArray(nextPayload.items));
            setActiveIndex(0);
          })
          .catch(function () {
            setSuggestions([]);
          })
          .finally(function () {
            setLoadingSearch(false);
          });
      }, 160);
    }

    function searchNews(target) {
      const searchText = String((target && target.name) || query || "").trim();
      if (!searchText) {
            setMessage("중요 뉴스로 분류된 결과가 없습니다. 기간을 넓히거나 다른 종목명으로 검색해 보세요.");
        return;
      }
      setSuggestions([]);
      setLoadingNews(true);
      setMessage("");
      fetchJson(
        "/api/news/search?q=" + encodeURIComponent(searchText) +
          "&days=" + encodeURIComponent(days) +
          "&limit=40",
        { noCache: true }
      )
        .then(function (nextPayload) {
          setPayload(nextPayload);
          if (target) {
            setSelected(target);
            setQuery(target.name + (target.code ? " (" + target.code + ")" : ""));
          }
          if (!ensureArray(nextPayload.items).length) {
            setMessage("중요 뉴스로 분류된 결과가 없습니다. 기간을 넓히거나 다른 종목명으로 검색해 보세요.");
          }
        })
        .catch(function (err) {
          setMessage(err.message || String(err));
        })
        .finally(function () {
          setLoadingNews(false);
        });
    }

    function chooseStock(stock) {
      if (!stock) {
        return;
      }
      setSelected(stock);
      setQuery(stock.name + (stock.code ? " (" + stock.code + ")" : ""));
      searchNews(stock);
    }

    function handleKeyDown(event) {
      const items = ensureArray(suggestions);
      if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        setActiveIndex(function (index) { return Math.min(index + 1, items.length - 1); });
      } else if (event.key === "ArrowUp" && items.length) {
        event.preventDefault();
        setActiveIndex(function (index) { return Math.max(index - 1, 0); });
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (items.length) {
          chooseStock(items[activeIndex || 0]);
        } else {
          searchNews(null);
        }
      } else if (event.key === "Escape") {
        setSuggestions([]);
      }
    }

    const newsItems = ensureArray((payload || {}).items);
    const stock = (payload || {}).stock || selected || {};

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel stock-news-hero" },
        h("div", { className: "eyebrow" }, "Stock News"),
        h("h1", { className: "page-title" }, "지수/가격동향"),
        h("p", { className: "page-copy compact-copy" }, "네이버 뉴스와 구글 뉴스에서 종목 관련 뉴스를 가져온 뒤 시세 단신과 중복 기사를 걷어내고 이벤트성 뉴스만 날짜순으로 보여줍니다."),
        h(
          "div",
          { className: "stock-news-search-row" },
          h(
            "div",
            { className: "global-search-wrap stock-news-search-wrap" },
            h("input", {
              className: "global-search-input",
              value: query,
              placeholder: "예: 삼성전자, HD현대에너지솔루션, 005930",
              onChange: function (event) { runAutocomplete(event.target.value); },
              onKeyDown: handleKeyDown,
              onFocus: selectTextOnFocus,
              onBlur: function () { setTimeout(function () { setSuggestions([]); }, 160); },
            }),
            loadingSearch ? h("span", { className: "global-search-status" }, "종목 찾는 중") : null,
            suggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list global-autocomplete" },
                  suggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: item.code || item.name,
                        type: "button",
                        className: "autocomplete-item" + (index === activeIndex ? " active" : ""),
                        onMouseDown: function (event) {
                          event.preventDefault();
                          chooseStock(item);
                        },
                      },
                      h("strong", null, item.name),
                      h("span", null, item.code || "-"),
                      h("em", null, item.market || "")
                    );
                  })
                )
              : null
          ),
          h(
            "select",
            {
              className: "select-input stock-news-days",
              value: days,
              onChange: function (event) { setDays(Number(event.target.value)); },
            },
            h("option", { value: 30 }, "최근 1개월"),
            h("option", { value: 90 }, "최근 3개월"),
            h("option", { value: 365 }, "최근 1년"),
            h("option", { value: 1095 }, "최근 3년")
          ),
          h(
            "button",
            {
              type: "button",
              className: "primary-button",
              disabled: loadingNews,
              onClick: function () { searchNews(selected); },
            },
            loadingNews ? "검색 중" : "뉴스 검색"
          )
        ),
        message ? h("div", { className: "summary-help text-danger" }, message) : null
      ),
      payload
        ? h(
            "div",
            { className: "panel stock-news-results-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, (stock.name || query || "종목") + " 뉴스"),
                h("div", { className: "summary-help" },
                  "원본 " + numberFormat((payload || {}).raw_count || 0, 0) +
                    "건 중 중요/중복 필터 후 " + numberFormat(newsItems.length, 0) + "건"
                )
              ),
              stock.code ? h("span", { className: "telegram-status-pill" }, stock.code) : null
            ),
            newsItems.length
              ? h(
                  "div",
                  { className: "stock-news-list" },
                  newsItems.map(function (item, index) {
                    return h(
                      "article",
                      { key: (item.url || item.title || "") + index, className: "stock-news-card" },
                      h(
                        "div",
                        { className: "stock-news-meta" },
                        h("span", null, item.published_date || "-"),
                        h("span", null, item.source || "-"),
                        h("span", null, item.source_type || "")
                      ),
                      h(
                        "a",
                        {
                          className: "stock-news-title",
                          href: item.url || "#",
                          target: "_blank",
                          rel: "noreferrer",
                        },
                        item.title || "제목 없음"
                      ),
                      item.summary ? h("p", { className: "stock-news-summary" }, item.summary) : null,
                      ensureArray(item.reason_tags).length
                        ? h(
                            "div",
                            { className: "stock-news-tags" },
                            ensureArray(item.reason_tags).map(function (tag) {
                              return h("span", { key: tag }, tag);
                            })
                          )
                        : null
                    );
                  })
                )
              : h(EmptyState, { compact: true, message: "표시할 뉴스가 없습니다." })
          )
        : h(
            "div",
            { className: "panel stock-news-empty-panel" },
            h(EmptyState, { compact: true, message: "종목명을 입력하고 Enter 또는 뉴스 검색을 눌러 주세요." })
          )
    );
  }

  function loadGlobalCompanyState() {
    try {
      const raw = localStorage.getItem(GLOBAL_COMPANY_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return {
        query: String(parsed.query || ""),
        selected: parsed.selected || null,
        detail: parsed.detail || null,
        aiBrief: parsed.aiBrief || null,
        statementMode: parsed.statementMode === "annual" ? "annual" : "quarter",
      };
    } catch (err) {
      return {};
    }
  }

  function persistGlobalCompanyState(state) {
    try {
      localStorage.setItem(GLOBAL_COMPANY_KEY, JSON.stringify({
        query: state.query || "",
        selected: state.selected || null,
        detail: state.detail || null,
        aiBrief: state.aiBrief || null,
        statementMode: state.statementMode || "quarter",
      }));
    } catch (err) {
      // Ignore storage quota or private-mode failures.
    }
  }

  function GlobalCompanyPage() {
    const savedGlobalCompanyState = loadGlobalCompanyState();
    const [query, setQuery] = useState(savedGlobalCompanyState.query || "");
    const [suggestions, setSuggestions] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [selected, setSelected] = useState(savedGlobalCompanyState.selected || null);
    const [detail, setDetail] = useState(savedGlobalCompanyState.detail || null);
    const [aiBrief, setAiBrief] = useState(savedGlobalCompanyState.aiBrief || null);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [loadingAiBrief, setLoadingAiBrief] = useState(false);
    const [message, setMessage] = useState("");
    const [aiMessage, setAiMessage] = useState("");
    const [statementMode, setStatementMode] = useState(savedGlobalCompanyState.statementMode || "quarter");
    const searchTimerRef = useRef(null);

    useEffect(function () {
      return function () {
        if (searchTimerRef.current) {
          clearTimeout(searchTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      persistGlobalCompanyState({
        query: query,
        selected: selected,
        detail: detail,
        aiBrief: aiBrief,
        statementMode: statementMode,
      });
    }, [query, selected, detail, aiBrief, statementMode]);

    useEffect(function () {
      const companyName = (detail && (detail.name || detail.symbol)) || (selected && (selected.name || selected.symbol)) || query || "";
      emitWindowTitleDetail("global-company", companyName);
    }, [query, selected, detail]);

    function runSearch(value) {
      setQuery(value);
      setSelected(null);
      setDetail(null);
      setMessage("");
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      if (!String(value || "").trim()) {
        setSuggestions([]);
        return;
      }
      searchTimerRef.current = setTimeout(function () {
        setLoadingSearch(true);
        fetchJson("/api/global-stocks/search?q=" + encodeURIComponent(value.trim()) + "&limit=10")
          .then(function (payload) {
            setSuggestions(ensureArray(payload.items));
            setActiveIndex(0);
          })
          .catch(function (err) {
            setSuggestions([]);
            setMessage(err.message || String(err));
          })
          .finally(function () {
            setLoadingSearch(false);
          });
      }, 180);
    }

    function chooseCompany(company) {
      const item = company || suggestions[activeIndex || 0];
      if (!item) {
        return;
      }
      setSelected(item);
      setQuery((item.name || item.symbol) + " (" + item.symbol + ")");
      setSuggestions([]);
      setMessage("");
      setAiBrief(null);
      setAiMessage("");
      setLoadingDetail(true);
      fetchJson("/api/global-stocks/detail?symbol=" + encodeURIComponent(item.symbol))
        .then(function (payload) {
          setDetail(payload);
          persistGlobalCompanyState({
            query: (item.name || item.symbol) + " (" + item.symbol + ")",
            selected: item,
            detail: payload,
            aiBrief: null,
            statementMode: statementMode,
          });
        })
        .catch(function (err) {
          setDetail(null);
          setMessage(err.message || String(err));
        })
        .finally(function () {
          setLoadingDetail(false);
        });
    }

    useEffect(function () {
      const symbol = detail && detail.symbol ? String(detail.symbol) : "";
      if (!symbol) {
        return;
      }
      setLoadingAiBrief(true);
      setAiMessage("");
      fetchJson("/api/global-stocks/ai-brief?symbol=" + encodeURIComponent(symbol))
        .then(function (payload) {
          setAiBrief(payload);
        })
        .catch(function (err) {
          setAiBrief(null);
          setAiMessage(err.message || String(err));
        })
        .finally(function () {
          setLoadingAiBrief(false);
        });
    }, [detail && detail.symbol]);

    function handleKeyDown(event) {
      const items = ensureArray(suggestions);
      if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        setActiveIndex(function (index) { return Math.min(index + 1, items.length - 1); });
      } else if (event.key === "ArrowUp" && items.length) {
        event.preventDefault();
        setActiveIndex(function (index) { return Math.max(index - 1, 0); });
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (items.length) {
          chooseCompany(items[activeIndex || 0]);
        } else if (query.trim()) {
          chooseCompany({ symbol: query.trim().toUpperCase(), name: query.trim() });
        }
      } else if (event.key === "Escape") {
        setSuggestions([]);
      }
    }

    const quarters = ensureArray((detail || {}).quarters);
    const annuals = ensureArray((detail || {}).annuals);
    const visibleStatements = statementMode === "annual" ? annuals : quarters;
    const latest = visibleStatements[0] || quarters[0] || annuals[0] || {};
    const stats = (detail || {}).stats || {};
    const rate = Number((detail || {}).usd_krw);
    const tvSymbol = globalTradingViewSymbol(detail);
    const tvUrl = tradingViewWidgetUrl(tvSymbol);
    const revenueMax = Math.max.apply(null, visibleStatements.map(function (row) { return Math.abs(Number(row.revenue) || 0); }).concat([1]));
    const opMax = Math.max.apply(null, visibleStatements.map(function (row) { return Math.abs(Number(row.operating_income) || 0); }).concat([1]));
    const netMax = Math.max.apply(null, visibleStatements.map(function (row) { return Math.abs(Number(row.net_income) || 0); }).concat([1]));
    const aiBriefPayload = aiBrief && aiBrief.brief ? aiBrief.brief : null;
    const statGroups = [
      [
        ["전일 종가", formatGlobalPrice(stats.previous_close)],
        ["금일 시가", formatGlobalPrice(stats.open)],
        ["금일 변동", formatGlobalPrice(stats.day_low) + " - " + formatGlobalPrice(stats.day_high)],
        ["52주 변동폭", formatGlobalPrice(stats.fifty_two_week_low) + " - " + formatGlobalPrice(stats.fifty_two_week_high)],
        ["거래량", formatGlobalNumberCompact(stats.volume, 2)],
        ["평균 거래량 (3개월)", formatGlobalNumberCompact(stats.avg_volume_3m, 2)],
        ["1년 변동률", formatPercent(stats.one_year_return_pct, 2)],
      ],
      [
        ["시가총액", formatUsdCompact(detail && detail.market_cap, 2)],
        ["발행주식수", formatGlobalNumberCompact(stats.shares_outstanding, 2)],
        ["매출", formatGlobalMoney(stats.latest_revenue, rate)],
        ["순이익", formatGlobalMoney(stats.latest_net_income, rate)],
        ["EBITDA", formatGlobalMoney(stats.latest_ebitda, rate)],
      ],
      [
        ["GPM", formatPercent(stats.gross_margin_pct, 1)],
        ["OPM", formatPercent(stats.operating_margin_pct, 1)],
        ["순이익률", formatPercent(stats.net_margin_pct, 1)],
        ["환율", "USD/KRW " + numberFormat(rate, 1)],
        ["데이터 기준", (detail && detail.fx_date) || "-"],
      ],
    ];

    function renderStatementMetric(label, value, maxAbs) {
      const number = Number(value);
      const isFiniteValue = Number.isFinite(number);
      const width = isFiniteValue && maxAbs > 0 ? Math.min(Math.abs(number) / maxAbs * 50, 50) : 0;
      const isNegative = isFiniteValue && number < 0;
      return h(
        "div",
        { className: "statement-metric-row" + (isNegative ? " negative" : "") },
        h("span", null, label),
        h("strong", null, formatGlobalMoney(value, rate)),
        h("b", { className: "statement-axis", "aria-hidden": "true" }),
        h("i", {
          className: "statement-bar" + (isNegative ? " negative" : " positive"),
          style: isNegative
            ? { right: "50%", width: width + "%" }
            : { left: "50%", width: width + "%" },
        })
      );
    }

    function renderStatementMarginRow(row) {
      const gpm = globalMarginPercent(row && row.gross_profit, row && row.revenue);
      const opm = globalMarginPercent(row && row.operating_income, row && row.revenue);
      return h(
        "div",
        { className: "statement-margin-row" },
        h("span", null, "GPM ", h("strong", null, formatPercent(gpm, 1))),
        h("span", null, "OPM ", h("strong", null, formatPercent(opm, 1)))
      );
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel global-company-hero" },
        h("div", { className: "eyebrow" }, "Global Equity"),
        h("h1", { className: "page-title" }, "섹터 진입 신호"),
        h("p", { className: "page-copy" }, "한글명, 영문명, 티커로 미국 상장사를 검색하고 최근 분기 실적을 달러와 원화 환산으로 함께 확인합니다."),
        h(
          "div",
          { className: "global-search-wrap" },
          h("input", {
            className: "global-search-input",
            value: query,
            placeholder: "예: 엔비디아, Apple, AAPL, 테슬라",
            onChange: function (event) { runSearch(event.target.value); },
            onKeyDown: handleKeyDown,
            onFocus: selectTextOnFocus,
            onBlur: function () { setTimeout(function () { setSuggestions([]); }, 160); },
          }),
          loadingSearch ? h("span", { className: "global-search-status" }, "검색 중") : null,
          suggestions.length
            ? h(
                "div",
                { className: "autocomplete-list global-autocomplete" },
                suggestions.map(function (item, index) {
                  return h(
                    "button",
                    {
                      key: item.symbol,
                      type: "button",
                      className: "autocomplete-item" + (index === activeIndex ? " active" : ""),
                      onMouseDown: function (event) {
                        event.preventDefault();
                        chooseCompany(item);
                      },
                    },
                    h("strong", null, item.symbol),
                    h("span", null, item.name || "-"),
                    h("em", null, item.exchange || item.source || "")
                  );
                })
              )
            : null
        ),
        message ? h("div", { className: "summary-help text-danger" }, message) : null
      ),
      loadingDetail ? h(LoadingPanel, { label: "해외기업 실적과 환율을 불러오는 중입니다." }) : null,
      detail
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              { className: "panel global-tradingview-panel" },
              h(
                "div",
                { className: "section-toolbar" },
                h("div", null,
                  h("div", { className: "eyebrow" }, "TradingView Chart"),
                  h(SectionTitle, null, (detail.symbol || "") + " 최근 주가 차트")
                ),
                tvSymbol
                  ? h("a", {
                      className: "mini-button",
                      href: "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(tvSymbol),
                      target: "_blank",
                      rel: "noreferrer",
                    }, "TradingView 열기")
                  : null
              ),
              tvUrl
                ? h(TradingViewEmbed, {
                    key: tvSymbol,
                    src: tvUrl,
                    title: (detail.symbol || "해외기업") + " TradingView chart",
                  })
                : h(EmptyState, { compact: true, message: "표시할 분기 실적 데이터가 없습니다." })
            ),
            h(
              "div",
              { className: "global-company-layout" },
              h(
                "div",
                { className: "panel global-company-card" },
                h("div", { className: "global-company-ticker" }, detail.symbol),
                h("h2", null, detail.name || (selected || {}).name || detail.symbol),
                h("div", { className: "global-company-meta" },
                  h("span", null, detail.exchange || "US"),
                  h("span", null, detail.currency || "USD"),
                  detail.local_currency && detail.local_currency !== detail.currency ? h("span", null, "원자료 " + detail.local_currency) : null,
                  detail.fx_date ? h("span", null, "USD/KRW " + numberFormat(rate, 1) + " · " + detail.fx_date) : null
                ),
                h(
                  "div",
                  { className: "global-stat-grid" },
                  h(SummaryCard, { label: "현재가", value: formatGlobalPrice(detail.price) + " (" + formatKrwWon(detail.price, rate) + ")" }),
                  h(SummaryCard, { label: "시가총액", value: formatGlobalMarketCap(detail.market_cap, detail.market_cap_billion, rate) }),
                  h(SummaryCard, { label: "최근 보고", value: latest.filed || "-" }),
                  h(SummaryCard, { label: statementMode === "annual" ? "최근 연도" : "최근 분기", value: latest.label || "-" })
                )
              ),
              h(
                "div",
                { className: "panel global-earnings-card" },
            h(SectionTitle, null, "현재 진입 후보"),
                h("pre", { className: "global-earnings-note" }, buildGlobalEarningsText(detail, visibleStatements, latest, rate))
              )
            ),
            h(
              "div",
              { className: "panel" },
              h(
                "div",
                { className: "section-toolbar" },
                h("div", null,
                  h("div", { className: "eyebrow" }, "AI Company Brief"),
                  h(SectionTitle, null, "\ucc28\ud2b8 \uc544\ub798 \uae30\uc5c5 \ube0c\ub9ac\ud504")
                ),
                detail && detail.symbol
                  ? h("button", {
                      type: "button",
                      className: "mini-button",
                      onClick: function () {
                        setLoadingAiBrief(true);
                        setAiMessage("");
                        fetchJson("/api/global-stocks/ai-brief?symbol=" + encodeURIComponent(detail.symbol) + "&force_refresh=true", { noCache: true })
                          .then(function (payload) { setAiBrief(payload); })
                          .catch(function (err) {
                            setAiBrief(null);
                            setAiMessage(err.message || String(err));
                          })
                          .finally(function () { setLoadingAiBrief(false); });
                      },
                      disabled: loadingAiBrief,
                    }, loadingAiBrief ? "\uc0dd\uc131 \uc911..." : "AI \uc0c8\ub85c\uace0\uce68")
                  : null
              ),
              loadingAiBrief && !aiBriefPayload
          ? h(LoadingBlock, { compact: true, title: "AI \ube0c\ub9ac\ud504 \uc0dd\uc131 \uc911", label: "\ud574\ub2f9 \uae30\uc5c5\uc758 \ucd5c\uc2e0 \ub370\uc774\ud130\ub97c \uc815\ub9ac\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4." })
                : aiMessage
                  ? h("div", { className: "notice-box error" }, aiMessage)
                  : aiBriefPayload
                    ? h(
                        "div",
                        { className: "global-ai-brief-grid" },
                        h(
                          "div",
                          { className: "global-ai-brief-card" },
                          h("h3", null, "\uae30\uc5c5 \uac1c\uc694"),
                          h("p", { className: "global-ai-brief-overview" }, aiBriefPayload.overview || "-"),
                          h("div", { className: "global-ai-brief-note" }, (aiBriefPayload.model || "") + (aiBrief && aiBrief.cached_at ? " ? " + aiBrief.cached_at : ""))
                        ),
                        h(
                          "div",
                          { className: "global-ai-brief-card" },
                          h("h3", null, "\uc5f0\ud601"),
                          ensureArray(aiBriefPayload.history).length
                            ? h("div", { className: "global-ai-history-list" }, ensureArray(aiBriefPayload.history).map(function (item, index) {
                                return h("div", { key: "hist-" + index, className: "global-ai-history-item" },
                                  h("strong", null, item.year || "-"),
                                  h("span", null, item.event || "-")
                                );
                              }))
                : h(EmptyState, { compact: true, message: "표시할 분기 실적 데이터가 없습니다." })
                        ),
                        h(
                          "div",
                          { className: "global-ai-brief-card global-ai-segment-card" },
                          h("h3", null, "\uc0ac\uc5c5 \ubd84\uc57c"),
                          ensureArray(aiBriefPayload.business_segments).length
                            ? h("div", { className: "global-ai-segment-list" }, ensureArray(aiBriefPayload.business_segments).map(function (item, index) {
                                return h("div", { key: "seg-" + index, className: "global-ai-segment-item" },
                                  h("div", { className: "global-ai-segment-head" },
                                    h("strong", null, item.name || "-"),
                                    h("span", null, item.share_pct == null ? "\ub9e4\ucd9c \ube44\uc911 \uc815\ubcf4 \uc5c6\uc74c" : numberFormat(item.share_pct, 1) + "%")
                                  ),
                                  h("p", null, item.description || "-")
                                );
                              }))
                  : h(EmptyState, { compact: true, message: "현재 조건을 만족하는 진입 후보가 없습니다." }),
                          h("div", { className: "global-ai-brief-note" }, aiBriefPayload.revenue_mix_note || "\uc0ac\uc5c5 \ubd84\uc57c\uc640 \ub9e4\ucd9c \ube44\uc911\uc740 AI \uc694\uc57d \uae30\uc900\uc785\ub2c8\ub2e4.")
                        ),
                        ensureArray(aiBriefPayload.risks).length
                          ? h(
                              "div",
                              { className: "global-ai-brief-card" },
                              h("h3", null, "\uc8fc\uc694 \ub9ac\uc2a4\ud06c"),
                              h("ul", { className: "global-ai-risk-list" }, ensureArray(aiBriefPayload.risks).map(function (item, index) {
                                return h("li", { key: "risk-" + index }, item);
                              }))
                            )
                          : null
                      )
                : h(EmptyState, { compact: true, message: "표시할 분기 실적 데이터가 없습니다." })
            ),
            h(
              "div",
              { className: "panel" },
              h(
                "div",
                { className: "section-toolbar" },
            h(SectionTitle, null, "현재 진입 후보"),
                h(
                  "div",
                  { className: "segmented-control" },
                  h("button", {
                    type: "button",
                    className: statementMode === "quarter" ? "active" : "",
                    onClick: function () { setStatementMode("quarter"); },
                  }, "분기"),
                  h("button", {
                    type: "button",
                    className: statementMode === "annual" ? "active" : "",
                    onClick: function () { setStatementMode("annual"); },
                  }, "연간")
                )
              ),
              visibleStatements.length
                ? h(
                    "div",
                    { className: "global-quarter-list" },
                    visibleStatements.map(function (row) {
                      return h(
                        "div",
                        { key: row.frame, className: "global-quarter-row" },
                        h("div", { className: "global-quarter-label" }, row.label),
                        h("div", { className: "global-quarter-metrics" },
                          renderStatementMetric("매출", row.revenue, revenueMax),
                          renderStatementMetric("영업익", row.operating_income, opMax),
                          renderStatementMetric("순이익", row.net_income, netMax),
                          renderStatementMarginRow(row)
                        ),
                        h("div", { className: "global-quarter-filed" }, row.filed || row.form || "-")
                      );
                    })
                  )
                : h(EmptyState, { compact: true, message: "표시할 분기 실적 데이터가 없습니다." })
            ),
            h(
              "div",
              { className: "panel" },
            h(SectionTitle, null, "현재 진입 후보"),
              h(
                "div",
                { className: "global-finviz-grid" },
                statGroups.map(function (group, groupIndex) {
                  return h(
                    "div",
                    { key: "stat-group-" + groupIndex, className: "global-finviz-column" },
                    group.map(function (item) {
                      return h(
                        "div",
                        { key: item[0], className: "global-finviz-row" },
                        h("strong", null, item[0]),
                        h("span", null, item[1])
                      );
                    })
                  );
                })
              )
            )
          )
        : null
    );
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

  function GlobalIndicesPage() {
    const globalIndexGroups = ["\uad6d\uac00\ubcc4 \uc9c0\uc218", "\ud55c\uad6d\uc8fc\uc2ddETF", "\uc6d0\uc790\uc7ac", "KOMIS \uc218\ucd9c\uc785\uc9c0\uc218", "PPI", "\ud658\uc728", "\ucf54\uc778/\ucc44\uad8c", "\uad6d\ucc44\uae08\ub9ac"];
    const globalIndexSymbolAliases = {
      "^GSPC": "US500",
      "^IXIC": "IXIC",
      "^DJI": "DJI",
      "^RUT": "RUT",
      "^KS11": "KS11",
      "^KQ11": "KQ11",
      "^N225": "N225",
      "^HSI": "HSI",
      "TWII": "^TWII",
      "TAIEX": "^TWII",
      "^TAIEX": "^TWII",
      "000001.SS": "SSEC",
      "^GDAXI": "GDAXI",
      "^FTSE": "FTSE",
      "HG=F": "CMCU3",
      "ALI=F": "CMAL3",
    };
    function normalizeGlobalIndexSymbols(symbols) {
      const seen = {};
      return ensureArray(symbols).map(function (symbol) {
        return globalIndexSymbolAliases[symbol] || symbol;
      }).filter(function (symbol) {
        if (!symbol || seen[symbol]) {
          return false;
        }
        seen[symbol] = true;
        return true;
      });
    }
    const [activeGroup, setActiveGroup] = useState(function () {
      return localStorage.getItem("stock-dashboard-global-indices-group") || "국가별 지수";
    });
    const activeGroupName = globalIndexGroups.indexOf(activeGroup) >= 0 ? activeGroup : "국가별 지수";
    const request = useFetchJson("/api/global-indices?group=" + encodeURIComponent(activeGroupName));
    const dramRequest = useFetchJson("/api/dram/prices");
    const ssdRequest = useFetchJson("/api/ssd/prices");
    const [selectedSymbols, setSelectedSymbols] = useState(function () {
      try {
        const parsed = JSON.parse(localStorage.getItem("stock-dashboard-global-indices-selected") || "[]");
        return Array.isArray(parsed) && parsed.length ? normalizeGlobalIndexSymbols(parsed) : ["US500", "IXIC", "KS11", "GC=F", "BTC-USD", "^TNX", "KRW=X", "JPY=X", "CNY=X", "DX-Y.NYB"];
      } catch (error) {
        return ["US500", "IXIC", "KS11", "GC=F", "BTC-USD", "^TNX", "KRW=X", "JPY=X", "CNY=X", "DX-Y.NYB"];
      }
    });
    useEffect(function () {
      localStorage.setItem("stock-dashboard-global-indices-group", activeGroup);
    }, [activeGroup]);
    useEffect(function () {
      localStorage.setItem("stock-dashboard-global-indices-selected", JSON.stringify(selectedSymbols));
    }, [selectedSymbols]);
    if (request.loading) {
      return LoadingPanel({ label: request.label });
    }
    if (request.error) {
      return ErrorPanel({ message: request.error });
    }
    const data = request.data || {};
    const dramPayload = dramRequest.data || {};
    const ssdPayload = ssdRequest.data || {};
    const items = ensureArray(data.items);
    const groups = globalIndexGroups.slice();
    ensureArray(data.groups).forEach(function (group) {
      if (group && groups.indexOf(group) < 0) groups.push(group);
    });
    items.forEach(function (item) {
      const group = item.group || "기타";
      if (groups.indexOf(group) < 0) groups.push(group);
    });
    const activeItems = items.filter(function (item) { return (item.group || "기타") === activeGroupName; });
    const selectedItems = items.filter(function (item) {
      return selectedSymbols.indexOf(item.symbol) >= 0 && ensureArray(item.series).length > 0;
    });
    const validActiveSymbols = activeItems.filter(function (item) { return ensureArray(item.series).length > 0; }).map(function (item) { return item.symbol; });
    function toggleSymbol(symbol) {
      setSelectedSymbols(function (current) {
        const next = ensureArray(current).slice();
        const index = next.indexOf(symbol);
        if (index >= 0) {
          next.splice(index, 1);
        } else {
          next.push(symbol);
        }
        return next;
      });
    }
    function setGroupSelection(symbols) {
      setSelectedSymbols(function (current) {
        const outside = ensureArray(current).filter(function (symbol) { return validActiveSymbols.indexOf(symbol) < 0; });
        return outside.concat(symbols);
      });
    }
    function metricText(value) {
      return value == null ? "-" : formatPercent(value, 2);
    }
    function metricClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "flat";
      return number > 0 ? "positive" : "negative";
    }
    function renderMetric(label, value) {
      return h("em", { className: metricClass(value) }, label + " " + metricText(value));
    }
    const returnLabels = activeGroupName === "PPI"
      ? { short: "MoM", medium: "3M", long: "YoY", chartTitle: "\ucd5c\uadfc 3\uac1c\uc6d4 PPI \ubcc0\ud654 \ucd94\uc774" }
      : activeGroupName === "\ud55c\uad6d\uc8fc\uc2ddETF"
        ? { short: "WoW", medium: "MoM", long: "1Y", chartTitle: "\ucd5c\uadfc 1\ub144 \ud55c\uad6d \uc8fc\uc2dd ETF \ubcc0\ud654 \ucd94\uc774" }
      : { short: "WoW", medium: "MoM", long: "3M", chartTitle: "\ucd5c\uadfc 3\uac1c\uc6d4 \uac00\uaca9/\uc9c0\uc218 \ubcc0\ud654 \ucd94\uc774" };
    function renderToplineMetric(item) {
      return h(
        "span",
        { key: item.symbol },
        item.name + " ",
        h("strong", { className: metricClass(item.return_1w_pct) }, returnLabels.short + " " + metricText(item.return_1w_pct)),
        " / ",
        h("strong", { className: metricClass(item.return_1m_pct) }, returnLabels.medium + " " + metricText(item.return_1m_pct))
      );
    }
    function renderGroupButton(group) {
      return h(
        "button",
        {
          key: group,
          type: "button",
          className: "global-tv-group-tab" + (activeGroupName === group ? " active" : ""),
          onClick: function () { setActiveGroup(group); },
        },
        group
      );
    }
    function renderItemButton(item) {
      const checked = selectedSymbols.indexOf(item.symbol) >= 0;
      const disabled = !ensureArray(item.series).length;
      return h(
        "button",
        {
          key: item.symbol,
          type: "button",
          className: "global-index-check" + (checked ? " checked" : "") + (disabled ? " muted-row" : ""),
          disabled: disabled,
          onClick: function () { if (!disabled) toggleSymbol(item.symbol); },
          title: disabled ? (item.error || "가격 데이터를 불러오지 못했습니다.") : "",
        },
        h("input", { type: "checkbox", readOnly: true, checked: checked && !disabled, tabIndex: -1 }),
        h("strong", null, item.symbol),
        h("span", null, item.name),
        item.source ? h("small", { className: "global-index-source" }, item.source_symbol ? item.source + " · " + item.source_symbol : item.source) : null,
        h("div", { className: "global-index-metrics" }, renderMetric(returnLabels.short, item.return_1w_pct), renderMetric(returnLabels.medium, item.return_1m_pct))
      );
    }
    function renderIndexRow(item) {
      return h(
        "tr",
        { key: item.symbol, className: ensureArray(item.series).length ? "" : "muted-row" },
        h("td", { className: "ticker-cell" }, item.symbol),
        h("td", null, item.name),
        h("td", null, item.group || "-"),
        h("td", null, item.source_symbol || item.fetch_symbol || item.symbol),
        h("td", null, item.last_close == null ? "-" : numberFormat(item.last_close, 2)),
        h("td", { className: metricClass(item.return_1w_pct) }, metricText(item.return_1w_pct)),
        h("td", { className: metricClass(item.return_1m_pct) }, metricText(item.return_1m_pct)),
        h("td", { className: metricClass(item.return_3m_pct) }, metricText(item.return_3m_pct)),
        h("td", { className: metricClass(item.return_ytd_pct) }, metricText(item.return_ytd_pct)),
        h("td", null, item.last_date || "-")
      );
    }
    function dramPricePriority(item) {
      const label = String((item.section || "") + " " + (item.item || "")).toLowerCase();
      if (label.indexOf("dram_spot") >= 0 && label.indexOf("ddr5") >= 0 && label.indexOf("16gb") >= 0) return 0;
      if (label.indexOf("dram_spot") >= 0 && label.indexOf("ddr5") >= 0) return 1;
      if (label.indexOf("module_spot") >= 0 && label.indexOf("ddr5") >= 0) return 2;
      if (label.indexOf("ddr5") >= 0) return 3;
      if (label.indexOf("dram_spot") >= 0) return 4;
      if (label.indexOf("dram_contract") >= 0) return 5;
      if (label.indexOf("ssd") >= 0) return 6;
      return 9;
    }
    function renderDramTrendChart(item) {
      const points = ensureArray(item.points).filter(function (point) {
        return Number.isFinite(Number(point.value));
      });
      const width = 520;
      const height = 180;
      const pad = { top: 18, right: 54, bottom: 32, left: 48 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      if (!points.length) {
        return h("div", { className: "dram-chart-empty" }, "누적된 가격 스냅샷이 없습니다.");
      }
      let minValue = Math.min.apply(null, points.map(function (point) { return Number(point.value); }));
      let maxValue = Math.max.apply(null, points.map(function (point) { return Number(point.value); }));
      if (minValue === maxValue) {
        minValue *= 0.96;
        maxValue *= 1.04;
      }
      const range = maxValue - minValue || 1;
      function x(index) {
        return pad.left + (points.length === 1 ? chartWidth : index / (points.length - 1) * chartWidth);
      }
      function y(value) {
        return pad.top + (maxValue - Number(value)) / range * chartHeight;
      }
      const linePoints = points.map(function (point, index) {
        return x(index).toFixed(1) + "," + y(point.value).toFixed(1);
      }).join(" ");
      const gridValues = [maxValue, minValue + range * 0.5, minValue];
      return h(
        "svg",
        { className: "dram-trend-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
        gridValues.map(function (value, index) {
          const lineY = y(value);
          return h(
            React.Fragment,
            { key: "grid-" + index },
            h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "dram-chart-grid" }),
            h("text", { x: width - 6, y: lineY + 4, className: "dram-chart-axis", textAnchor: "end" }, numberFormat(value, 2))
          );
        }),
        h("polyline", { points: linePoints, className: "dram-chart-line" }),
        points.map(function (point, index) {
          return h("circle", {
            key: point.date + "-" + index,
            cx: x(index),
            cy: y(point.value),
            r: 3.2,
            className: "dram-chart-dot",
          }, h("title", null, String(point.date || "") + " · $" + numberFormat(point.value, 2)));
        }),
        h("text", { x: pad.left, y: height - 8, className: "dram-chart-axis" }, String(points[0].date || "").replace("Last Update ", "")),
        h("text", { x: width - pad.right, y: height - 8, className: "dram-chart-axis", textAnchor: "end" }, String(points[points.length - 1].date || "").replace("Last Update ", ""))
      );
    }
    function renderDramCard(item) {
      const points = ensureArray(item.points);
      const lastPoint = points.length ? points[points.length - 1] : null;
      const current = Number(lastPoint && lastPoint.value);
      const change = Number(lastPoint && lastPoint.change_pct);
      const changeClass = Number.isFinite(change) && change < 0 ? "down" : Number.isFinite(change) && change > 0 ? "up" : "";
      return h(
        "div",
        { key: item.key || item.item, className: "panel dram-price-card" },
        h(
          "div",
          { className: "dram-price-head" },
          h("div", null,
            h("strong", null, item.item || "-"),
            h("span", null, item.section_label || "DRAM Price")
          ),
          h("div", { className: "dram-current-price" }, "$" + numberFormat(current, 2))
        ),
        h(
          "div",
          { className: "dram-price-meta" },
          h("span", null, "High $" + numberFormat(lastPoint && lastPoint.session_high, 2)),
          h("span", null, "Low $" + numberFormat(lastPoint && lastPoint.session_low, 2)),
          h("span", { className: changeClass }, "Change " + (Number.isFinite(change) ? formatPercent(change, 2) : "-"))
        ),
        renderDramTrendChart(item)
      );
    }
    const memoryPriceHistory = ensureArray(dramPayload.history).concat(ensureArray(ssdPayload.history)).filter(function (item) {
      return ensureArray(item.points).length > 0;
    }).sort(function (a, b) {
      const priorityDiff = dramPricePriority(a) - dramPricePriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return String(a.item || "").localeCompare(String(b.item || ""));
    }).slice(0, 18);
    if (!items.length) {
      return ErrorPanel({ message: "지수/가격동향 데이터를 불러오지 못했습니다." });
    }
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel global-indices-hero" },
        h("div", { className: "eyebrow" }, "Index & Price Trend"),
        h("h1", { className: "page-title" }, "지수/가격동향"),
        h("p", { className: "page-copy compact-copy" }, "국가별 지수, 원자재, 환율, 비트코인, 국채금리와 DRAM/SSD 가격 변화를 함께 봅니다.")
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null, h(SectionTitle, null, returnLabels.chartTitle), h("div", { className: "summary-help" }, data.source || "FinanceDataReader / Yahoo Finance")),
          h("div", { className: "global-indices-topline" }, selectedItems.slice(0, 5).map(renderToplineMetric))
        ),
        selectedItems.length
          ? h(GlobalIndicesChart, { items: selectedItems })
          : h("div", { className: "notice-box compact" }, "선택된 항목이 없습니다. 아래에서 비교할 지수나 원자재를 선택해주세요.")
      ),
      h(
        "div",
        { className: "panel global-indices-picker" },
        h("div", { className: "global-tv-group-tabs" }, groups.map(renderGroupButton)),
        h(
          "div",
          { className: "global-indices-picker-actions" },
          h("button", { type: "button", className: "mini-button", onClick: function () { setGroupSelection(validActiveSymbols); } }, "현재 탭 전체 선택"),
          h("button", { type: "button", className: "mini-button", onClick: function () { setGroupSelection([]); } }, "현재 탭 선택 해제")
        ),
        h("div", { className: "global-indices-checkbox-grid" }, activeItems.map(renderItemButton))
      ),
      h(
        "div",
        { className: "panel trade-summary-panel" },
        h(SectionTitle, null, "DRAM/SSD 가격 동향"),
        h("div", { className: "summary-help" }, (dramPayload.source_label || "DramExchange / TrendForce") + " · DRAM " + (dramPayload.fetched_at || "-") + " · SSD " + (ssdPayload.fetched_at || "-")),
        h("div", { className: "summary-help" }, "DDR5 Spot Price를 우선 표시하고, 공개 가격표를 로컬에 누적 저장해 변화 추이를 표시합니다.")
      ),
      dramRequest.loading && !memoryPriceHistory.length ? h(LoadingPanel, { label: dramRequest.label }) : null,
      ssdRequest.loading && !memoryPriceHistory.length ? h(LoadingPanel, { label: ssdRequest.label }) : null,
      dramRequest.error ? h("div", { className: "notice-box compact" }, "DRAM 가격 확인 필요: " + dramRequest.error) : null,
      ssdRequest.error ? h("div", { className: "notice-box compact" }, "SSD 가격 확인 필요: " + ssdRequest.error) : null,
      dramPayload.error ? h("div", { className: "notice-box compact" }, "DRAM 가격 확인 필요: " + dramPayload.error) : null,
      ssdPayload.error ? h("div", { className: "notice-box compact" }, "SSD 가격 확인 필요: " + ssdPayload.error) : null,
      memoryPriceHistory.length
        ? h("div", { className: "dram-price-grid" }, memoryPriceHistory.map(renderDramCard))
        : h(EmptyState, { message: "표시할 DRAM/SSD 가격 데이터가 없습니다." }),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, activeGroupName + " 지표 표"),
        h(
          "div",
          { className: "global-indices-table-wrap" },
          h(
            "table",
            { className: "data-table global-indices-table" },
            h("thead", null, h("tr", null, h("th", null, "\ud2f0\ucee4"), h("th", null, "\uc774\ub984"), h("th", null, "\uadf8\ub8f9"), h("th", null, "\uae30\uc900"), h("th", null, "\ud604\uc7ac\uac00"), h("th", null, returnLabels.short), h("th", null, returnLabels.medium), h("th", null, returnLabels.long), h("th", null, "YTD"), h("th", null, "\uae30\uc900\uc77c"))),
            h("tbody", null, items.map(renderIndexRow))
          )
        )
      )
    );
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

  function SectorEntrySignalPage() {
    const [betaWindow, setBetaWindow] = useState(63);
    const [chartPopup, setChartPopup] = useState({
      open: false,
      row: null,
      loading: false,
      error: "",
      data: null,
      openingExternal: false,
      externalMessage: "",
    });
    const [expandedFormulaMap, setExpandedFormulaMap] = useState({});
    const chartRequestSeqRef = useRef(0);
    const betaWindowLabel = betaWindow <= 100 ? "3개월" : "1년";
    const request = useFetchJson("/api/sector-snapshot/entry-signals?lookback_days=80&min_score=50&trading_rank_limit=20&min_avg_score=55&min_strong_count=2&min_stock_count=1&beta_window=" + betaWindow);
    const radarRequest = useFetchJson("/api/sector-snapshot/signal-radar?lookback_days=120&max_stocks=30&min_score=50&max_history_events=180");
    const data = request.data || {};
    const radarData = radarRequest.data || {};
    const summary = data.summary || {};
    const radarSummary = radarData.summary || {};
    const params = data.params || {};
    const latestActive = ensureArray(data.latest_active);
    const rows = ensureArray(data.rows);
    const radarRows = ensureArray(radarData.signals);
    const radarPerformanceRows = ensureArray((radarData.performance || {}).rows);
    const radarDefinitionMap = {};
    ensureArray(radarData.definitions).forEach(function (item) {
      if (item && item.key) {
        radarDefinitionMap[item.key] = item;
      }
    });
    const entrySignalColumns = [
      { key: "date", label: "날짜" },
      { key: "entry_phase", label: "\uad6d\uba74", render: function (row) { return row.entry_phase || row.signal || "-"; } },
      { key: "signal_level", label: "신호" },
      { key: "sector", label: "섹터" },
      { key: "trading_rank", label: "거래대금 순위", render: function (row) { return numberFormat(row.trading_rank, 0) + "위"; } },
      { key: "avg_5d_trading_value_100m", label: "5일 거래대금(억)", render: function (row) { return numberFormat(row.avg_5d_trading_value_100m, 0); } },
      { key: "avg_score", label: "평균점수", render: function (row) { return numberFormat(row.avg_score, 1); } },
      { key: "strong_count", label: "70점 이상", render: function (row) { return numberFormat(row.strong_count, 0); } },
      { key: "entry_score", label: "진입점수", render: function (row) { return scoreSpan(row.entry_score); } },
      { key: "formula", label: "산식", render: function (row) { return renderEntryFormulaToggle(row, "table"); } },
      { key: "leader_stocks", label: "대표 종목 β순", render: function (row) { return h(SectorEntryLeaderChips, { stocks: row.leader_stocks, betaLabel: betaWindowLabel, onOpenChart: openSectorEntryStockChart }); } },
    ];

    function entryFormulaKey(item, scope) {
      return [
        scope || "entry",
        item.date || summary.latest_date || "",
        item.sector || "",
        item.trading_rank || "",
      ].join("|");
    }

    function toggleEntryFormulaDetails(item, scope, event) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }
      const key = entryFormulaKey(item, scope);
      setExpandedFormulaMap(function (current) {
        return Object.assign({}, current, { [key]: !current[key] });
      });
    }

    function formulaMetric(label, value, detail, tone) {
      return h(
        "div",
        { className: "sector-entry-formula-metric" + (tone ? " " + tone : "") },
        h("span", null, label),
        h("strong", null, value),
        detail ? h("em", null, detail) : null
      );
    }

    function renderEntryFormulaDetails(item) {
      const tradingRankLimit = Number(params.trading_rank_limit || 20);
      const avgScore = Number(item.avg_score || 0);
      const maxScore = Number(item.max_score || 0);
      const stockCount = Number(item.stock_count || 0);
      const strongCount = Number(item.strong_count || 0);
      const tradingRank = Number(item.trading_rank || 9999);
      const turnoverRatioPct = Number(item.turnover_ratio_pct || 0);
      const maxScoreBonus = maxScore * 0.18;
      const stockCountBonus = Math.min(stockCount, 12) * 1.4;
      const turnoverStrengthBonus = Math.min(turnoverRatioPct, 30);
      const calculatedStrengthScore = avgScore + maxScoreBonus + stockCountBonus + turnoverStrengthBonus;
      const rankBonus = Math.max(0, tradingRankLimit + 1 - tradingRank) * 2;
      const turnoverEntryBonus = Math.min(turnoverRatioPct, 10) * 1.2;
      const calculatedEntryScore = calculatedStrengthScore + rankBonus + turnoverEntryBonus;
      const breadthRatio = Number(item.breadth_ratio);
      const avgDisparity = Number(item.avg_disparity);
      const breadthPass = Number.isFinite(breadthRatio) && breadthRatio >= 60;
      const fullLeverage = breadthPass && Number.isFinite(avgDisparity) && avgDisparity <= 105;
      const entryLeverage = breadthPass && Number.isFinite(avgDisparity) && avgDisparity <= 110;
      return h(
        "div",
        { className: "sector-entry-formula-detail" },
        h("div", { className: "sector-entry-formula-title" }, "1차 필터"),
        h(
          "div",
          { className: "sector-entry-formula-grid" },
          formulaMetric("거래대금 순위", numberFormat(item.trading_rank, 0) + "위", "<= " + tradingRankLimit + "위", tradingRank <= tradingRankLimit ? "pass" : "fail"),
          formulaMetric("평균점수", numberFormat(item.avg_score, 2), ">= " + numberFormat(params.min_avg_score || 55, 0), avgScore >= Number(params.min_avg_score || 55) ? "pass" : "fail"),
          formulaMetric("70점 이상", numberFormat(strongCount, 0) + "개", ">= " + numberFormat(params.min_strong_count || 2, 0) + "개", strongCount >= Number(params.min_strong_count || 2) ? "pass" : "fail"),
          formulaMetric("종목 수", numberFormat(stockCount, 0) + "개", ">= " + numberFormat(params.min_stock_count || 1, 0) + "개", stockCount >= Number(params.min_stock_count || 1) ? "pass" : "fail")
        ),
        h("div", { className: "sector-entry-formula-title" }, "섹터 강도 점수"),
        h(
          "div",
          { className: "sector-entry-formula-code" },
              "원본 엑셀이 열려 있어 일반 저장으로는 반영할 수 없습니다.\n\n열려 있는 엑셀 화면에 직접 비고를 기록하고 저장할까요?\n엑셀 창은 닫지 않습니다."
        ),
        h(
          "div",
          { className: "sector-entry-formula-grid" },
          formulaMetric("평균점수", numberFormat(avgScore, 2), "기본값"),
          formulaMetric("최고점 보너스", numberFormat(maxScoreBonus, 2), numberFormat(maxScore, 2) + " × 0.18"),
          formulaMetric("종목수 보너스", numberFormat(stockCountBonus, 2), "min(" + numberFormat(stockCount, 0) + ",12) × 1.4"),
          formulaMetric("거래회전 보너스", numberFormat(turnoverStrengthBonus, 2), "min(" + numberFormat(turnoverRatioPct, 2) + "%,30)")
        ),
        h(
          "div",
          { className: "sector-entry-formula-result" },
          h("span", null, "최종 진입점수"),
          h("strong", null, numberFormat(calculatedStrengthScore, 2)),
          h("em", null, "서버값 " + numberFormat(item.strength_score, 2))
        ),
        h("div", { className: "sector-entry-formula-title" }, "최종 진입점수"),
        h(
          "div",
          { className: "sector-entry-formula-code" },
          "entry_score = strength_score + (21 - 거래대금순위)×2 + min(거래대금/시총%,10)×1.2"
        ),
        h(
          "div",
          { className: "sector-entry-formula-grid" },
          formulaMetric("강도점수", numberFormat(calculatedStrengthScore, 2), "위 계산값"),
          formulaMetric("순위 보너스", numberFormat(rankBonus, 2), "(" + (tradingRankLimit + 1) + " - " + numberFormat(tradingRank, 0) + ") × 2"),
          formulaMetric("회전율 보너스", numberFormat(turnoverEntryBonus, 2), "min(" + numberFormat(turnoverRatioPct, 2) + "%,10) × 1.2")
        ),
        h(
          "div",
          { className: "sector-entry-formula-result primary" },
          h("span", null, "최종 진입점수"),
          h("strong", null, numberFormat(calculatedEntryScore, 2)),
          h("em", null, "서버값 " + numberFormat(item.entry_score, 2))
        ),
        h("div", { className: "sector-entry-formula-title" }, "20일선 확산/이격도"),
        h(
          "div",
          { className: "sector-entry-formula-grid" },
          formulaMetric("Breadth", Number.isFinite(breadthRatio) ? formatPercent(breadthRatio, 1) : "-", "20일선 위 종목 비율 >= 60%", breadthPass ? "pass" : "fail"),
          formulaMetric("평균 이격도", Number.isFinite(avgDisparity) ? formatPercent(avgDisparity, 2) : "-", "FULL <=105%, ENTRY <=110%", fullLeverage ? "pass" : entryLeverage ? "warn" : "fail"),
          formulaMetric("기술 필터", item.leverage_label || "-", item.leverage_status || "watch", item.entry_pass ? "pass" : "warn")
        )
      );
    }

    function renderEntryFormulaToggle(item, scope) {
      const key = entryFormulaKey(item, scope);
      const open = !!expandedFormulaMap[key];
      return h(
        "div",
        { className: "sector-entry-formula-wrap " + (scope || "") },
        h(
          "button",
          {
            type: "button",
            className: "mini-button sector-entry-formula-toggle" + (open ? " active" : ""),
            onClick: function (event) { toggleEntryFormulaDetails(item, scope, event); },
          },
          open ? "산식 접기" : "산식 보기"
        ),
        open ? renderEntryFormulaDetails(item) : null
      );
    }

    function signalBadge(signalKey) {
      const definition = radarDefinitionMap[signalKey] || {};
      const label = definition.short_label || definition.label || signalKey;
      return h("span", { key: signalKey, className: "radar-signal-badge " + signalKey }, label);
    }

    function signedMetric(value, digits) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, digits == null ? 2 : digits) + "%";
    }

    function renderRadarReturn(value) {
      const number = Number(value);
      return h("span", { className: number > 0 ? "metric-up" : number < 0 ? "metric-down" : "" }, signedMetric(value, 2));
    }

    function renderRadarPerformanceCell(row, horizon) {
      const avg = row["avg_return_" + horizon + "d_pct"];
      const win = row["win_rate_" + horizon + "d_pct"];
      const mdd = row["mdd_" + horizon + "d_pct"];
      return h(
        "div",
        { className: "radar-performance-cell" },
        h("strong", null, renderRadarReturn(avg)),
        h("span", null, "\uc2b9\ub960 " + (win == null ? "-" : numberFormat(win, 1) + "%")),
        h("em", null, "MDD " + (mdd == null ? "-" : signedMetric(mdd, 2)))
      );
    }

    function renderRadarFlow(row) {
      const flow = row.flow || {};
      const smart = Number(flow.smart_money);
      const individual = Number(flow.individual);
      if (!flow.date && !Number.isFinite(smart) && !Number.isFinite(individual)) {
        return row.flow_error ? h("span", { className: "summary-help" }, "\uc218\uae09 \uc870\ud68c \uc2e4\ud328") : h("span", { className: "summary-help" }, "-");
      }
      return h(
        "div",
        { className: "radar-flow-mini" },
        h("span", null, "\uc678\uc778 " + numberFormat(flow.foreigner, 0)),
        h("span", null, "\uae30\uad00 " + numberFormat(flow.institution, 0)),
        h("span", { className: smart > 0 ? "metric-up" : smart < 0 ? "metric-down" : "" }, "\uc2a4\ub9c8\ud2b8 " + numberFormat(smart, 0)),
        h("em", null, flow.date || "")
      );
    }

    function renderRadarStockButton(row) {
      const label = row.stock_name || row.stock_code || "-";
      return h(
        "button",
        {
          type: "button",
          className: "table-link-button radar-stock-link",
          onClick: function () { openSectorEntryStockChart(row); },
          title: "페이지 새로고침",
        },
        label
      );
    }

    function renderSignalRadarPanel() {
      const radarColumns = [
        { key: "stock_name", label: "\uc885\ubaa9", render: renderRadarStockButton },
      { key: "sector", label: "섹터" },
        { key: "signals", label: "\uc2dc\uadf8\ub110 \uc0c1\ud0dc", render: function (row) { return h("div", { className: "radar-signal-badges" }, ensureArray(row.signals).map(signalBadge)); } },
        { key: "score", label: "\uc2dc\uadf8\ub110\uc810\uc218", render: function (row) { return scoreSpan(row.score); } },
        { key: "flow", label: "\uc218\uae09 \ud750\ub984", render: renderRadarFlow },
        { key: "change_pct", label: "\ub4f1\ub77d\ub960", render: function (row) { return renderRadarReturn(row.change_pct); } },
        { key: "trading_value_100m", label: "\uac70\ub798\ub300\uae08(\uc5b5)", render: function (row) { return numberFormat(row.trading_value_100m, 0); } },
      ];
      const performanceColumns = [
        { key: "label", label: "\uad6c\ubd84" },
        { key: "event_count", label: "\ubc1c\uc0dd \ud69f\uc218", render: function (row) { return numberFormat(row.event_count, 0) + "\ud68c"; } },
        { key: "d5", label: "5\uac70\ub798\uc77c", render: function (row) { return renderRadarPerformanceCell(row, 5); } },
        { key: "d20", label: "20\uac70\ub798\uc77c", render: function (row) { return renderRadarPerformanceCell(row, 20); } },
        { key: "d60", label: "60\uac70\ub798\uc77c", render: function (row) { return renderRadarPerformanceCell(row, 60); } },
      ];
      return h(
        "div",
        { className: "panel signal-radar-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
        h(SectionTitle, null, "종목 상세 미리보기"),
            h("div", { className: "summary-help" }, radarData.description || "\ud3b8\uc785\uacfc \ud3b8\ucd9c \uc2dc\uadf8\ub110\uc744 \ud55c \ubc88\uc5d0 \ud655\uc778\ud560 \uc218 \uc788\ub294 \uc694\uc57d \ud328\ub110\uc785\ub2c8\ub2e4.")
          ),
          h(
            "div",
            { className: "radar-summary-pills" },
            h("span", null, "\uae30\uc900\uc77c " + (radarData.date || "-")),
            h("span", null, "\uc2e0\ud638 \uc218 " + numberFormat(radarSummary.signal_count, 0) + "\uac1c"),
            h("span", null, "\ud3ec\ud2b8\ud3f4\ub9ac\uc624 " + numberFormat(radarSummary.portfolio_hit_count, 0) + "\uac1c"),
            h("span", null, "\uad00\uc2ec\uc885\ubaa9 " + numberFormat(radarSummary.watch_hit_count, 0) + "\uac1c")
          )
        ),
        radarRequest.loading && !radarRequest.data
          ? h(LoadingBlock, { compact: true, title: "\ud3b8\uc785/\ud3b8\ucd9c \uc2dc\uadf8\ub110 \ub808\uc774\ub354 \ubd88\ub7ec\uc624\ub294 \uc911", label: radarRequest.label })
          : radarRequest.error
            ? h(ErrorPanel, { message: radarRequest.error })
            : h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "radar-definition-scroll" },
                  h(
                    "div",
                    { className: "radar-definition-grid" },
                    ensureArray(radarData.definitions).map(function (definition) {
                      return h(
                        "div",
                        { key: definition.key, className: "radar-definition-card " + definition.key },
                        h("div", { className: "radar-definition-top" },
                          h("strong", null, definition.label || definition.key),
                          h("span", null, numberFormat(definition.today_count, 0))
                        ),
                        h("p", null, definition.description || "")
                      );
                    })
                  )
                ),
                h(
                  "div",
                  { className: "radar-table-section" },
                  h("div", { className: "radar-subhead" },
                h("div", { className: "subsection-title" }, "날짜별 신규 진입 신호"),
                    h("span", null, numberFormat(radarRows.length, 0) + "\uc885\ubaa9")
                  ),
                  h(
                    "div",
                    { className: "radar-table-scroll radar-signal-scroll" },
                    h(SortableDataTable, {
                      rows: radarRows,
                      columns: radarColumns,
                      emptyMessage: "해당 섹터의 종목 데이터가 없습니다.",
                      rowClassName: function (row) {
                        return (row.is_portfolio ? "radar-owned-row " : "") + (row.is_watch ? "radar-watch-row" : "");
                      },
                    })
                  )
                ),
                h(
                  "div",
                  { className: "radar-table-section compact" },
                  h("div", { className: "radar-subhead" },
                h("div", { className: "subsection-title" }, "날짜별 신규 진입 신호"),
                    h("span", null, "5/20/60\uac70\ub798\uc77c")
                  ),
                h("div", { className: "summary-help" }, "\uc870\ud68c \ud30c\uc77c \ub0a0\uc9dc"),
                  h(
                    "div",
                    { className: "radar-table-scroll radar-performance-scroll" },
                    h(SortableDataTable, {
                      rows: radarPerformanceRows,
                      columns: performanceColumns,
                      emptyMessage: "해당 섹터의 종목 데이터가 없습니다.",
                    })
                  )
                )
              )
      );
    }

    function closeSectorEntryStockChart() {
      chartRequestSeqRef.current += 1;
      setChartPopup({ open: false, row: null, loading: false, error: "", data: null, openingExternal: false, externalMessage: "" });
    }

    function openSectorEntryStockChart(stock) {
      const row = stock || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const stockName = row.stock_name || row.resolved_name || "";
      const cacheKey = code && code !== "000000" ? code : stockName;
      chartRequestSeqRef.current += 1;
      const requestSeq = chartRequestSeqRef.current;
      setChartPopup({
        open: true,
        row: row,
        loading: true,
        error: "",
        data: null,
        openingExternal: false,
        externalMessage: "",
      });
      if (cacheKey && CHART_PREVIEW_CACHE[cacheKey]) {
        setChartPopup({
          open: true,
          row: row,
          loading: false,
          error: "",
          data: CHART_PREVIEW_CACHE[cacheKey],
          openingExternal: false,
          externalMessage: "",
        });
        return;
      }
      const params = new URLSearchParams();
      if (code && code !== "000000") {
        params.set("code", code);
      }
      if (stockName) {
        params.set("name", stockName);
      }
      params.set("months", "3");
      fetchJson("/api/stocks/chart-preview?" + params.toString())
        .then(function (payload) {
          if (cacheKey) {
            CHART_PREVIEW_CACHE[cacheKey] = payload;
          }
          if (chartRequestSeqRef.current !== requestSeq) {
            return;
          }
          setChartPopup({
            open: true,
            row: row,
            loading: false,
            error: "",
            data: payload,
            openingExternal: false,
            externalMessage: "",
          });
        })
        .catch(function (error) {
          if (chartRequestSeqRef.current !== requestSeq) {
            return;
          }
          setChartPopup({
            open: true,
            row: row,
            loading: false,
            error: error.message || String(error),
            data: null,
            openingExternal: false,
            externalMessage: "",
          });
        });
    }

    function openSectorEntryStockInTradingView() {
      const row = chartPopup.row || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const stockName = row.stock_name || row.resolved_name || "";
      setChartPopup(function (current) {
        return Object.assign({}, current, { openingExternal: true, externalMessage: "" });
      });
      postJson("/api/tradingview/open", {
        stock_code: code && code !== "000000" ? code : null,
        stock_name: stockName || null,
      }).then(function (payload) {
        setChartPopup(function (current) {
          return Object.assign({}, current, {
            openingExternal: false,
            externalMessage: (payload && payload.message) || "TradingView 열기 요청을 보냈습니다.",
          });
        });
      }).catch(function (error) {
        setChartPopup(function (current) {
          return Object.assign({}, current, {
            openingExternal: false,
            externalMessage: "TradingView 열기 실패: " + (error.message || String(error)),
          });
        });
      });
    }

    function renderSectorEntryStockChartPopup() {
      if (!chartPopup.open) {
        return null;
      }
      const row = chartPopup.row || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const label = row.stock_name || row.resolved_name || "종목";
      return h(
        "div",
        {
          className: "modal-backdrop theme-stock-chart-backdrop",
          onClick: closeSectorEntryStockChart,
        },
        h(
          "div",
          {
            className: "modal-panel theme-stock-chart-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "3개월 주가"),
              h("h2", null, label + (code && code !== "000000" ? " (" + code + ")" : ""))
            ),
            h(
              "div",
              { className: "theme-stock-chart-actions" },
              h("button", {
                type: "button",
                className: "mini-button tradingview-open-button",
                onClick: openSectorEntryStockInTradingView,
                disabled: chartPopup.openingExternal,
              }, chartPopup.openingExternal ? "여는 중..." : "TradingView 앱에서 열기"),
              h("button", { type: "button", className: "mini-button", onClick: closeSectorEntryStockChart }, "닫기")
            )
          ),
          chartPopup.externalMessage
            ? h("div", { className: "summary-help theme-stock-chart-message" }, chartPopup.externalMessage)
            : null,
          h(StockChartPreview, {
            label: label,
            loading: chartPopup.loading,
            error: chartPopup.error,
            data: chartPopup.data,
          })
        )
      );
    }

    return h(
      React.Fragment,
      null,
      renderSectorEntryStockChartPopup(),
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "Sector Entry Signal"),
        h("h1", { className: "page-title" }, "섹터 비교 테이블"),
        h("p", { className: "page-copy" }, "최근 5거래일 섹터 거래대금 평균 순위와 오늘의 주도주 점수로, 잡주 꼬리 대신 신규 진입할 주도 섹터를 찾습니다."),
        data.start_date
          ? h(
              "div",
              { className: "summary-grid summary-grid-small" },
              h(SummaryCard, { label: "조회 기간", value: (data.start_date || "") + " ~ " + (data.end_date || "") }),
              h(SummaryCard, { label: "신규 진입", value: numberFormat(summary.signal_count, 0) + "건" }),
              h(SummaryCard, { label: "최근 활성 섹터", value: numberFormat(summary.latest_active_count, 0) + "개" })
            )
          : null
      ),
      renderSignalRadarPanel(),
      h(
        "div",
        { className: "panel sector-entry-signal-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
        h(SectionTitle, null, "종목 상세 미리보기"),
            h("div", { className: "summary-help" }, data.description || "진입 신호를 계산합니다.")
          ),
          h(
            "div",
            { className: "toggle-group" },
            h("button", {
              type: "button",
              className: "mini-button" + (betaWindow <= 100 ? " active" : ""),
              onClick: function () { setBetaWindow(63); },
            }, "β 3개월"),
            h("button", {
              type: "button",
              className: "mini-button" + (betaWindow > 100 ? " active" : ""),
              onClick: function () { setBetaWindow(252); },
            }, "β 1년"),
            data.start_date
              ? h("span", { className: "telegram-status-pill" }, (data.start_date || "") + " ~ " + (data.end_date || ""))
              : null
          )
        ),
        request.loading && !request.data
          ? h(LoadingBlock, { compact: true, title: "섹터 진입 신호 계산 중", label: request.label })
          : request.error
            ? h(ErrorPanel, { message: request.error })
            : h(
                React.Fragment,
                null,
                latestActive.length
                  ? h(
                      "div",
                      { className: "sector-entry-card-grid" },
                      latestActive.map(function (item) {
                        return h(
                          "div",
                          { key: item.sector, className: "sector-entry-card" },
                          h("div", { className: "sector-entry-card-head" },
                            h("strong", null, item.sector),
                            h("span", null, item.entry_phase || item.signal_level || "\uad6d\uba74")
                          ),
                          h("div", { className: "sector-entry-score" }, numberFormat(item.entry_score, 1)),
                          h("div", { className: "summary-help" }, "권장 후보 비중 " + formatPercent(item.suggested_weight_pct, 1)),
                          h("div", { className: "sector-entry-meta" },
                            h("span", null, "거래대금 " + numberFormat(item.trading_rank, 0) + "위"),
                            h("span", null, "평균점수 " + numberFormat(item.avg_score, 1)),
                            h("span", null, "70점+ " + numberFormat(item.strong_count, 0) + "개")
                          ),
                          h(SectorEntryLeaderChips, { stocks: item.leader_stocks, betaLabel: betaWindowLabel, onOpenChart: openSectorEntryStockChart }),
                          renderEntryFormulaToggle(item, "card")
                        );
                      })
                    )
                  : h(EmptyState, { compact: true, message: "현재 조건을 만족하는 진입 후보가 없습니다." }),
                h("div", { className: "subsection-title" }, "날짜별 신규 진입 신호"),
                h(SortableDataTable, {
                  rows: rows.slice(0, 120),
                  columns: entrySignalColumns,
                  emptyMessage: "아직 신규 진입 신호가 없습니다.",
                })
              )
      )
    );
  }

  function SectorSnapshotPageV2() {
    const sectorDbRequest = useFetchJson("/api/sector-db");
    const [groups, setGroups] = useState([buildEmptySectorGroupV2()]);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [message, setMessage] = useState("");
    const [selectedSectorIds, setSelectedSectorIds] = useState({});
    const [builderCollapsed, setBuilderCollapsed] = useState(function () {
      return localStorage.getItem(SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY) === "1";
    });
    const timerRef = useRef({});
    const saveTimerRef = useRef(null);
    const sectorDbLoadedRef = useRef(false);
    const skipNextSectorSaveRef = useRef(false);

    useEffect(function () {
      return function () {
        Object.keys(timerRef.current).forEach(function (key) {
          clearTimeout(timerRef.current[key]);
        });
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      localStorage.setItem(SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY, builderCollapsed ? "1" : "0");
    }, [builderCollapsed]);

    useEffect(function () {
      if (sectorDbRequest.data) {
        const nextGroups = buildSectorSnapshotGroupsFromDb(sectorDbRequest.data.groups);
        const nextSelected = {};
        nextGroups.forEach(function (group) {
          nextSelected[group.id] = true;
        });
        localStorage.removeItem(SECTOR_SNAPSHOT_KEY);
        skipNextSectorSaveRef.current = true;
        setGroups(nextGroups);
        setSelectedSectorIds(nextSelected);
        sectorDbLoadedRef.current = true;
      }
    }, [sectorDbRequest.data]);

    useEffect(function () {
      if (!sectorDbLoadedRef.current) {
        return;
      }
      if (skipNextSectorSaveRef.current) {
        skipNextSectorSaveRef.current = false;
        return;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(function () {
        const body = buildRequestBody(false);
        if (!body.groups.length) {
          return;
        }
        postJson("/api/sector-db/groups", body).catch(function () {});
      }, 500);
    }, [groups]);

    if (sectorDbRequest.loading) {
      return LoadingPanel({ label: sectorDbRequest.label });
    }
    if (sectorDbRequest.error) {
      return ErrorPanel({ message: sectorDbRequest.error });
    }

    function updateGroup(groupId, updater) {
      setGroups(function (current) {
        return current.map(function (group) {
          return group.id === groupId ? updater(group) : group;
        });
      });
    }

    function updateSector(groupId, value) {
      updateGroup(groupId, function (group) {
        return Object.assign({}, group, { sector: value });
      });
    }

    function updateStockRow(groupId, rowId, patch) {
      updateGroup(groupId, function (group) {
        return Object.assign({}, group, {
          rows: group.rows.map(function (row) {
            return row.id === rowId ? Object.assign({}, row, patch) : row;
          }),
        });
      });
    }

    function searchStock(groupId, rowId, value) {
      updateStockRow(groupId, rowId, { query: value, name: value, code: "", market: "", suggestions: [] });
      const timerKey = groupId + ":" + rowId;
      if (timerRef.current[timerKey]) {
        clearTimeout(timerRef.current[timerKey]);
      }
      if (!value.trim()) {
        return;
      }
      timerRef.current[timerKey] = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()));
          updateStockRow(groupId, rowId, { suggestions: ensureArray(payload.items || []), activeIndex: 0 });
        } catch (err) {
          updateStockRow(groupId, rowId, { suggestions: [] });
        }
      }, 180);
    }

    function chooseStock(groupId, rowId, stock) {
      updateGroup(groupId, function (group) {
        const rows = group.rows.map(function (row) {
          if (row.id !== rowId) {
            return row;
          }
          return {
            id: row.id,
            query: stock.name,
            code: stock.code,
            name: stock.name,
            market: stock.market || "",
            suggestions: [],
            activeIndex: 0,
          };
        });
        const hasBlank = rows.some(function (row) { return !String(row.query || "").trim(); });
        return Object.assign({}, group, { rows: hasBlank ? rows : rows.concat([buildEmptyStockRow()]) });
      });
    }

    function handleStockKeyDown(groupId, row, event) {
      const suggestions = ensureArray(row.suggestions);
      if (!suggestions.length) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        updateStockRow(groupId, row.id, {
          activeIndex: Math.min((row.activeIndex || 0) + 1, suggestions.length - 1),
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateStockRow(groupId, row.id, {
          activeIndex: Math.max((row.activeIndex || 0) - 1, 0),
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        chooseStock(groupId, row.id, suggestions[row.activeIndex || 0]);
      } else if (event.key === "Escape") {
        updateStockRow(groupId, row.id, { suggestions: [] });
      }
    }

    function addStockLine(groupId) {
      updateGroup(groupId, function (group) {
        return Object.assign({}, group, { rows: group.rows.concat([buildEmptyStockRow()]) });
      });
    }

    function removeStockLine(groupId, rowId) {
      updateGroup(groupId, function (group) {
        const rows = group.rows.filter(function (row) { return row.id !== rowId; });
        return Object.assign({}, group, { rows: rows.length ? rows : [buildEmptyStockRow()] });
      });
    }

    function moveStockLine(groupId, rowId, direction) {
      updateGroup(groupId, function (group) {
        const rows = group.rows.slice();
        const index = rows.findIndex(function (row) { return row.id === rowId; });
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) {
          return group;
        }
        const temp = rows[index];
        rows[index] = rows[nextIndex];
        rows[nextIndex] = temp;
        return Object.assign({}, group, { rows: rows });
      });
    }

    function addSector() {
      const nextGroup = buildEmptySectorGroupV2();
      setGroups(function (current) { return current.concat([nextGroup]); });
      setSelectedSectorIds(function (current) {
        return Object.assign({}, current, { [nextGroup.id]: true });
      });
    }

    function removeSector(groupId) {
      const fallbackGroup = buildEmptySectorGroupV2();
      setGroups(function (current) {
        const next = current.filter(function (group) { return group.id !== groupId; });
        return next.length ? next : [fallbackGroup];
      });
      setSelectedSectorIds(function (current) {
        const next = Object.assign({}, current);
        delete next[groupId];
        if (!Object.keys(next).length) {
          next[fallbackGroup.id] = true;
        }
        return next;
      });
    }

    function getGroupStockCount(group) {
      return ensureArray(group.rows).filter(function (row) {
        return String(row.name || row.query || row.code || "").trim();
      }).length;
    }

    function togglePreviewSector(groupId) {
      setSelectedSectorIds(function (current) {
        const next = Object.assign({}, current);
        next[groupId] = current[groupId] === false;
        return next;
      });
    }

    function setAllPreviewSectors(selected) {
      const next = {};
      groups.forEach(function (group) {
        next[group.id] = !!selected;
      });
      setSelectedSectorIds(next);
    }

    function buildRequestBody(selectedOnly) {
      return {
        groups: groups
          .filter(function (group) {
            return !selectedOnly || selectedSectorIds[group.id] !== false;
          })
          .map(function (group) {
            const stocks = ensureArray(group.rows)
              .filter(function (row) { return String(row.name || row.query || row.code || "").trim(); })
              .map(function (row) {
                return { code: row.code || null, name: row.name || row.query };
              });
            return { sector: String(group.sector || "").trim(), stocks: stocks };
          })
          .filter(function (group) {
            return group.sector && group.stocks.length;
          }),
      };
    }

    async function runPreview() {
      const body = buildRequestBody(true);
      if (!body.groups.length) {
        setMessage("엑셀로 출력할 섹터를 하나 이상 선택해 주세요.");
        return;
      }
      setLoading(true);
      setMessage("");
      try {
        await postJson("/api/sector-db/groups", buildRequestBody(false));
        const payload = await postJson("/api/sector-snapshot/preview", body);
        setPreview(payload);
        setMessage(ensureArray(payload.errors).length ? "일부 종목은 데이터를 가져오지 못했습니다." : "");
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    async function runExport() {
      const body = buildRequestBody(true);
      if (!body.groups.length) {
        setMessage("엑셀로 출력할 섹터를 하나 이상 선택해 주세요.");
        return;
      }
      setExporting(true);
      setMessage("");
      try {
        await postJson("/api/sector-db/groups", buildRequestBody(false));
        await postDownload("/api/sector-snapshot/export.xlsx", body, "sector_snapshot.xlsx");
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setExporting(false);
      }
    }

    const sectorColumns = [
      { key: "sector", label: "섹터" },
      { key: "stock_count", label: "종목 수", render: function (row) { return numberFormat(row.stock_count, 0); } },
      { key: "beta_120d", label: "베타", render: function (row) { return row.beta_120d == null ? "-" : numberFormat(row.beta_120d, 2); } },
      { key: "market_cap_100m", label: "시가총액(억)", render: function (row) { return numberFormat(row.market_cap_100m, 1); } },
      { key: "strength_score", label: "강도 점수", render: function (row) { return scoreSpan(row.strength_score); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "ytd_return_pct", label: "YTD Return", render: function (row) { return metricSpan(row.ytd_return_pct, "percent"); } },
      { key: "avg_trading_value_marcap_pct", label: "일평균 거래대금/시총 x1000", render: function (row) { return ratioSpan(row.avg_trading_value_marcap_pct); } },
      { key: "foreigner_net_value_marcap_pct", label: "외국인 순매수/시총 x1000", render: function (row) { return ratioSpan(row.foreigner_net_value_marcap_pct); } },
    ];

    const stockColumns = [
      { key: "stock_name", label: "종목명" },
      { key: "beta_120d", label: "베타", render: function (row) { return row.beta_120d == null ? "-" : numberFormat(row.beta_120d, 2); } },
      { key: "market_cap_100m", label: "시가총액(억)", render: function (row) { return numberFormat(row.market_cap_100m, 1); } },
      { key: "strength_score", label: "강도 점수", render: function (row) { return scoreSpan(row.strength_score); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "ytd_return_pct", label: "YTD Return", render: function (row) { return metricSpan(row.ytd_return_pct, "percent"); } },
      { key: "avg_trading_value_marcap_pct", label: "일평균 거래대금/시총 x1000", render: function (row) { return ratioSpan(row.avg_trading_value_marcap_pct); } },
      { key: "foreigner_net_value_marcap_pct", label: "외국인 순매수/시총 x1000", render: function (row) { return ratioSpan(row.foreigner_net_value_marcap_pct); } },
    ];

    const previewSectorCandidates = groups.filter(function (group) {
      return String(group.sector || "").trim() && getGroupStockCount(group) > 0;
    });
    const selectedPreviewGroups = previewSectorCandidates.filter(function (group) {
      return selectedSectorIds[group.id] !== false;
    });
    const selectedPreviewStockCount = selectedPreviewGroups.reduce(function (total, group) {
      return total + getGroupStockCount(group);
    }, 0);

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "Sector Snapshot"),
        h("h1", { className: "page-title" }, "\uCD94\uAC00 \uC608\uC815 \uD398\uC774\uC9C0"),
        h("p", { className: "page-copy" }, "섹터별 종목을 입력하고 FinanceDataReader 데이터로 수익률, 시가총액, 수급/거래대금 지표를 비교합니다."),
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
          h("button", { className: "primary-button", onClick: runPreview, disabled: loading || !selectedPreviewGroups.length }, loading ? "미리보기 생성 중..." : "선택 섹터 미리보기"),
          h("button", { className: "primary-button", onClick: runExport, disabled: exporting || !selectedPreviewGroups.length }, exporting ? "엑셀 생성 중..." : "선택 섹터 엑셀 출력")
        ),
        message ? h("div", { className: "notice-box" }, message) : null
      ),
      h(
        "div",
        { className: "panel sector-builder-toggle-panel" },
        h(
          "button",
          {
            type: "button",
            className: "sector-builder-toggle",
            onClick: function () { setBuilderCollapsed(function (value) { return !value; }); },
          },
          h("span", { className: "sector-builder-arrow" }, builderCollapsed ? "▼" : "▲"),
          h("strong", null, builderCollapsed ? "섹터 입력/선택 열기" : "섹터 입력/선택 접기"),
          h("span", null, "선택 " + numberFormat(selectedPreviewGroups.length, 0) + "개 섹터 · " + numberFormat(selectedPreviewStockCount, 0) + "종목")
        )
      ),
      h(
        "div",
        { className: "panel sector-preview-picker", style: builderCollapsed ? { display: "none" } : null },
        h(
          "div",
          { className: "section-toolbar" },
          h(SectionTitle, null, "날짜별 주도 섹터 흐름"),
          h(
            "div",
            { className: "toggle-group" },
            h("button", { className: "mini-button", onClick: function () { setAllPreviewSectors(true); } }, "전체 선택"),
            h("button", { className: "mini-button", onClick: function () { setAllPreviewSectors(false); } }, "전체 해제")
          )
        ),
        h(
          "div",
          { className: "summary-help" },
          "선택 " + numberFormat(selectedPreviewGroups.length, 0) + " / " + numberFormat(previewSectorCandidates.length, 0) + "개 섹터 · 예상 수집 종목 " + numberFormat(selectedPreviewStockCount, 0) + "개"
        ),
        previewSectorCandidates.length
          ? h(
              "div",
              { className: "sector-preview-chip-grid" },
              previewSectorCandidates.map(function (group) {
                const selected = selectedSectorIds[group.id] !== false;
                return h(
                  "button",
                  {
                    key: group.id,
                    type: "button",
                    className: "sector-preview-chip" + (selected ? " active" : ""),
                    onClick: function () { togglePreviewSector(group.id); },
                  },
                  h("span", { className: "sector-preview-check" }, selected ? "?" : ""),
                  h("strong", null, group.sector),
                  h("span", null, numberFormat(getGroupStockCount(group), 0) + "종목")
                );
              })
            )
          : EmptyState({ message: "섹터명과 종목을 입력하면 선택 목록이 표시됩니다.", compact: true })
      ),
      h(
        "div",
        { className: "sector-card-grid", style: builderCollapsed ? { display: "none" } : null },
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
            h("label", { className: "form-field" }, "섹터명", h("input", {
              value: group.sector,
              onChange: function (event) { updateSector(group.id, event.target.value); },
              placeholder: "예: 조선, 반도체, 원전",
            })),
            h(
              "div",
              { className: "stock-input-list" },
              ensureArray(group.rows).map(function (row, rowIndex) {
                const isFirst = rowIndex === 0;
                const isLast = rowIndex === ensureArray(group.rows).length - 1;
                return h(
                  "div",
                  { key: row.id, className: "stock-input-row" },
                  h("div", { className: "row-number" }, numberFormat(rowIndex + 1, 0)),
                  h(
                    "div",
                    { className: "stock-input-cell" },
                    h("input", {
                      value: row.query,
                      onChange: function (event) { searchStock(group.id, row.id, event.target.value); },
                      onKeyDown: function (event) { handleStockKeyDown(group.id, row, event); },
                      onFocus: selectTextOnFocus,
                      placeholder: "종목명 또는 종목코드",
                    }),
                    row.query && ensureArray(row.suggestions).length
                      ? h(
                          "div",
                          { className: "autocomplete-list inline" },
                          row.suggestions.map(function (item) {
                            const itemIndex = row.suggestions.indexOf(item);
                            return h(
                              "button",
                              {
                                key: row.id + "-" + item.code,
                                className: "autocomplete-item" + (itemIndex === (row.activeIndex || 0) ? " active" : ""),
                                onMouseEnter: function () { updateStockRow(group.id, row.id, { activeIndex: itemIndex }); },
                                onClick: function () { chooseStock(group.id, row.id, item); },
                              },
                              h("strong", null, item.name),
                              h("span", null, item.code + (item.market ? " \u00b7 " + item.market : ""))
                            );
                          })
                        )
                      : null
                  ),
                  h("div", { className: "stock-code-cell" }, row.code || "-"),
                  h(
                    "div",
                    { className: "stock-row-actions" },
                    h("button", {
                      className: "icon-button",
            title: "최근 한 달 점수 변동 추이 보기",
                      disabled: isFirst,
                      onClick: function () { moveStockLine(group.id, row.id, -1); },
            }, "월간"),
                    h("button", {
                      className: "icon-button",
            title: "최근 한 달 점수 변동 추이 보기",
                      disabled: isLast,
                      onClick: function () { moveStockLine(group.id, row.id, 1); },
            }, "월간"),
                    h("button", {
                      className: "icon-button danger",
            title: "최근 한 달 점수 변동 추이 보기",
                      onClick: function () { removeStockLine(group.id, row.id); },
                    }, "×")
                  )
                );
              })
            ),
            h("button", { className: "mini-button", onClick: function () { addStockLine(group.id); } }, "종목 줄 추가")
          );
        })
      ),
      h(
        "div",
        { className: "panel" },
          h(SectionTitle, null, "날짜별 주도 섹터 흐름"),
        loading
          ? h(LoadingBlock, { compact: true, title: "섹터 평균 미리보기 생성 중", label: "선택한 섹터의 종목 데이터를 수집하고 있습니다." })
          : h(SortableDataTable, {
              rows: preview ? preview.sector_rows : [],
              columns: sectorColumns,
              emptyMessage: "미리보기를 실행하면 섹터 평균이 여기에 표시됩니다.",
            })
      ),
      h(
        "div",
        { className: "panel" },
          h(SectionTitle, null, "날짜별 주도 섹터 흐름"),
        loading
          ? h(LoadingBlock, { compact: true, title: "종목 상세 데이터 로드 중", label: "FinanceDataReader와 수급 지표를 수집하고 있습니다." })
          : preview && ensureArray(preview.stock_rows).length
            ? h(
                "div",
                { className: "sector-stock-groups" },
                ensureArray(preview.sector_rows).map(function (sectorRow) {
                  const rows = ensureArray(preview.stock_rows).filter(function (row) {
                    return row.sector === sectorRow.sector;
                  });
                  if (!rows.length) {
                    return null;
                  }
                  return h(
                    "div",
                    { key: sectorRow.sector, className: "sector-stock-group" },
                    h(
                      "div",
                      { className: "sector-stock-heading" },
                      h("strong", null, sectorRow.sector),
                      h("span", null, numberFormat(rows.length, 0) + "종목")
                    ),
                    h(SortableDataTable, {
                      rows: rows,
                      columns: stockColumns,
                      emptyMessage: "해당 섹터의 종목 데이터가 없습니다.",
                    })
                  );
                })
              )
            : h(EmptyState, { message: "섹터와 종목을 입력한 뒤 미리보기를 눌러 주세요." }),
        preview && ensureArray(preview.errors).length
          ? h("div", { className: "notice-box" }, ensureArray(preview.errors).join(" / "))
          : null
      )
    );
  }

  function ThemesPageV2() {
    const [selectedFileDate, setSelectedFileDate] = useState(function () {
      const saved = loadThemeSectorState();
      return saved.lastFileDate || "";
    });
    const [sectorFilter, setSectorFilter] = useState("all");
    const [calendarMode, setCalendarMode] = useState("week");
    const [calendarScoreBasis, setCalendarScoreBasis] = useState("score");
    const [themeBoxExpanded, setThemeBoxExpanded] = useState(false);
    const [calendarRefreshing, setCalendarRefreshing] = useState(false);
    const [sectorSaveState, setSectorSaveState] = useState({ status: "idle", message: "" });
    const [noteSaveState, setNoteSaveState] = useState({ status: "idle", message: "" });
    const [noteOverrides, setNoteOverrides] = useState({});
    const [sectorState, setSectorState] = useState({ stockMap: {}, sectors: [] });
    const [reloadingExcel, setReloadingExcel] = useState(false);
    
    const [reloadMessage, setReloadMessage] = useState("");
    const [reloadStartedAt, setReloadStartedAt] = useState(0);
    const [reloadElapsedSec, setReloadElapsedSec] = useState(0);
    const sectorSaveSeqRef = useRef(0);
    const leaderCalendarRef = useRef(null);
    const manualSummaryRef = useRef(null);
    const scoreTableCaptureRef = useRef(null);
    const scoreHistoryHoverOpenRef = useRef(null);
    const scoreHistoryHoverCloseRef = useRef(null);
    const scoreHistoryCacheRef = useRef({});
    const scoreHistoryRequestSeqRef = useRef(0);
    const [calendarCopyState, setCalendarCopyState] = useState({ status: "", message: "" });
    const [manualSummaryCopyState, setManualSummaryCopyState] = useState({ status: "", message: "" });
    const [scoreTableCopyState, setScoreTableCopyState] = useState({ status: "", message: "" });
    const [captureStageReady, setCaptureStageReady] = useState(false);
    const [stockSearchText, setStockSearchText] = useState("");
    const [stockSearchOpen, setStockSearchOpen] = useState(false);
    const [stockSearchActiveIndex, setStockSearchActiveIndex] = useState(0);
    const [stockSearchMessage, setStockSearchMessage] = useState("");
    const [highlightedStockKey, setHighlightedStockKey] = useState("");
    const [themeTableSortState, setThemeTableSortState] = useState({ key: "score", direction: "desc" });
    const stockRowRefs = useRef({});
    const pendingStockScrollKeyRef = useRef("");
    const themeTableScrollRef = useRef(null);
    const themeTableScrollRafRef = useRef(null);
    const [themeTableScrollTop, setThemeTableScrollTop] = useState(0);
    const [scoreHistoryPopup, setScoreHistoryPopup] = useState({
      open: false,
      mode: "modal",
      loading: false,
      error: "",
      row: null,
      payload: null,
      position: null,
    });
    const [tradingViewPopup, setTradingViewPopup] = useState({
      open: false,
      row: null,
      symbol: "",
      label: "",
      loading: false,
      error: "",
      data: null,
    });
    const stockChartRequestSeqRef = useRef(0);
    const [sectorMarketCapPopup, setSectorMarketCapPopup] = useState({
      open: false,
      sector: "",
      loading: false,
      error: "",
      payload: null,
    });
    const sectorMarketCapRequestSeqRef = useRef(0);
    const [datePickerMonth, setDatePickerMonth] = useState(function () {
      const saved = loadThemeSectorState();
      const today = new Date();
      const fallback = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
      return saved.lastFileDate ? String(saved.lastFileDate).slice(0, 7) : fallback;
    });
    const themesUrl = "/api/themes/today?min_score=0&recent_limit=20" + (selectedFileDate ? "&file_date=" + encodeURIComponent(selectedFileDate) : "");
    const themesRequest = useFetchJson(themesUrl, { refreshOnMount: true });
    const sectorDbRequest = useFetchJson("/api/sector-db");
    const calendarRequest = useFetchJson("/api/theme-sector-calendar?min_score=0&limit=60&score_basis=" + encodeURIComponent(calendarScoreBasis));

    useEffect(function () {
      persistThemeSectorState({
        stockMap: {},
        sectors: [],
        lastFileDate: selectedFileDate,
      });
    }, [selectedFileDate]);

    useEffect(function () {
      if (!sectorDbRequest.data) {
        return;
      }
      const stockMap = {};
      Object.keys(sectorDbRequest.data.stock_map || {}).forEach(function (key) {
        const item = sectorDbRequest.data.stock_map[key] || {};
        if (item.stock_name && item.sector) {
          stockMap[item.stock_name] = item.sector;
          if (item.stock_code) {
            stockMap[item.stock_code] = item.sector;
          }
        }
      });
      setSectorState({
        stockMap: stockMap,
        sectors: ensureArray(sectorDbRequest.data.sectors),
      });
    }, [sectorDbRequest.data]);

    useEffect(function () {
      if (!themesRequest.data || !themesRequest.data.file_date) {
        return;
      }
      if (!selectedFileDate || themesRequest.data.fallback_reason === "requested_file_missing") {
        setSelectedFileDate(themesRequest.data.file_date);
        if (themesRequest.data.fallback_reason === "requested_file_missing") {
          setReloadMessage("선택했던 " + (themesRequest.data.requested_file_date || "날짜") + " 파일이 없어 " + themesRequest.data.file_date + " 파일로 다시 불러왔습니다.");
        }
      }
    }, [selectedFileDate, themesRequest.data]);

    useEffect(function () {
      if (selectedFileDate) {
        setDatePickerMonth(String(selectedFileDate).slice(0, 7));
      }
      setNoteOverrides({});
      setNoteSaveState({ status: "idle", message: "" });
    }, [selectedFileDate]);

    useEffect(function () {
      setThemeTableScrollTop(0);
      if (themeTableScrollRef.current) {
        themeTableScrollRef.current.scrollTop = 0;
      }
    }, [selectedFileDate, sectorFilter, themeTableSortState.key, themeTableSortState.direction]);

    useEffect(function () {
      return function () {
        if (scoreHistoryHoverOpenRef.current) {
          clearTimeout(scoreHistoryHoverOpenRef.current);
        }
        if (scoreHistoryHoverCloseRef.current) {
          clearTimeout(scoreHistoryHoverCloseRef.current);
        }
        if (themeTableScrollRafRef.current) {
          window.cancelAnimationFrame(themeTableScrollRafRef.current);
        }
      };
    }, []);

    useEffect(function () {
      if (!reloadingExcel || !reloadStartedAt) {
        setReloadElapsedSec(0);
        return undefined;
      }
      const tick = function () {
        setReloadElapsedSec(Math.max(0, Math.floor((Date.now() - reloadStartedAt) / 1000)));
      };
      tick();
      const timer = window.setInterval(tick, 1000);
      return function () {
        window.clearInterval(timer);
      };
    }, [reloadingExcel, reloadStartedAt]);

    useEffect(function () {
      if (!highlightedStockKey) {
        return undefined;
      }
      function clearStockHighlight(event) {
        const target = event.target;
        if (!target || !target.closest) {
          setHighlightedStockKey("");
          return;
        }
        if (target.closest(".theme-stock-search-bar")) {
          return;
        }
        const row = target.closest("[data-stock-search-key]");
        if (row && row.getAttribute("data-stock-search-key") === highlightedStockKey) {
          return;
        }
        setHighlightedStockKey("");
      }
      document.addEventListener("pointerdown", clearStockHighlight, true);
      return function () {
        document.removeEventListener("pointerdown", clearStockHighlight, true);
      };
    }, [highlightedStockKey]);

    useEffect(function () {
      if (!pendingStockScrollKeyRef.current || sectorFilter !== "all") {
        return undefined;
      }
      const stockKey = pendingStockScrollKeyRef.current;
      pendingStockScrollKeyRef.current = "";
      const timer = window.setTimeout(function () {
        scrollToStockRow(stockKey, 0);
      }, 80);
      return function () {
        window.clearTimeout(timer);
      };
    }, [sectorFilter, highlightedStockKey, selectedFileDate]);

    if (themesRequest.loading && !themesRequest.data) {
      return LoadingPanel({ label: themesRequest.label });
    }
    if (themesRequest.error) {
      return ErrorPanel({ message: themesRequest.error });
    }

    const themes = themesRequest.data || {};
    const calendar = calendarRequest.data || {};
    const anchorDate = selectedFileDate || themes.file_date || "";
    const selectedDateValue = selectedFileDate || themes.file_date || "";
    const availableFiles = ensureArray(themes.available_files);
    const availableDateMap = {};
    availableFiles.forEach(function (item) {
      if (item.file_date) {
        availableDateMap[item.file_date] = item;
      }
    });
    const datePickerCells = buildBusinessMonthCells(datePickerMonth);
    const sortedCalendarDays = ensureArray(calendar.days).slice().sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });
    const calendarDayScoreMap = {};
    sortedCalendarDays.forEach(function (day) {
      const key = String(day.date || "");
      if (!key) return;
      const score = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
      if (Number.isFinite(score)) {
        calendarDayScoreMap[key] = score;
      }
    });
    const visibleCalendarDays = filterCalendarDays(sortedCalendarDays, anchorDate, calendarMode);
    const calendarTopSectors = getCalendarTopSectors(visibleCalendarDays, 5);
    function noteKeyForRow(row) {
      return String(row.stock_code || row.stock_name || "");
    }
    const rows = ensureArray(themes.qualified_stocks).map(function (row) {
      const stockMap = sectorState.stockMap || {};
      const hasCodeOverride = row.stock_code && Object.prototype.hasOwnProperty.call(stockMap, row.stock_code);
      const hasNameOverride = row.stock_name && Object.prototype.hasOwnProperty.call(stockMap, row.stock_name);
      const localSector = hasCodeOverride ? stockMap[row.stock_code] : (hasNameOverride ? stockMap[row.stock_name] : undefined);
      const noteKey = noteKeyForRow(row);
      const hasNoteOverride = noteKey && Object.prototype.hasOwnProperty.call(noteOverrides, noteKey);
      return Object.assign({}, row, {
        manual_sector: String(localSector !== undefined ? localSector : (row.manual_sector || "")),
        note: hasNoteOverride ? noteOverrides[noteKey] : (row.note || ""),
      });
    });
    const usedSectorSet = new Set();
    Object.keys(sectorState.stockMap || {}).forEach(function (key) {
      const sector = String((sectorState.stockMap || {})[key] || "").trim();
      if (sector) {
        usedSectorSet.add(sector);
      }
    });
    rows.forEach(function (row) {
      const sector = String(row.manual_sector || "").trim();
      if (sector) {
        usedSectorSet.add(sector);
      }
    });
    const sectorOptions = Array.from(usedSectorSet);
    const sectorSummary = [];
    const sectorIndexMap = {};
    rows.forEach(function (row, index) {
      const sector = String(row.manual_sector || "").trim();
      if (!sector) {
        return;
      }
      if (!sectorIndexMap[sector]) {
        sectorIndexMap[sector] = {
          sector: sector,
          count: 0,
          scoreTotal: 0,
          leaders: [],
          firstIndex: index,
        };
        sectorSummary.push(sectorIndexMap[sector]);
      }
      sectorIndexMap[sector].count += 1;
      sectorIndexMap[sector].scoreTotal += Number(row.score || 0);
      if (sectorIndexMap[sector].leaders.length < 4) {
        sectorIndexMap[sector].leaders.push(row.stock_name);
      }
    });
    sectorSummary.forEach(function (item) {
      item.avg_score = item.count ? item.scoreTotal / item.count : 0;
    });


    const visibleRows = sectorFilter === "all"
      ? rows
      : rows.filter(function (row) { return String(row.manual_sector || "").trim() === sectorFilter; });
    const themeTableSortColumns = {
      rank: function (row) { return Number(row.rank || 0); },
      sector: function (row) { return String(row.manual_sector || "").trim(); },
      stock_name: function (row) { return String(row.stock_name || row.resolved_name || row.stock_code || ""); },
      sortino_norm: function (row) { return Number(row.sortino_norm || 0); },
      score_o: function (row) { return Number(row.score_o || 0); },
      market_cap_100m: function (row) { return Number(row.market_cap_100m || 0); },
      trading_value_100m: function (row) { return Number(row.trading_value_100m || 0); },
      change_pct: function (row) { return Number(row.change_pct || 0); },
      score: function (row) { return Number(row.score || 0); },
      note: function (row) { return String(row.note || ""); },
    };
    const sortKey = themeTableSortState.key || "score";
    const baseVisibleRows = sortKey === "rank"
      ? visibleRows.filter(function (row) { return isTradableHigh52(row); })
      : visibleRows;
    const sortedVisibleRows = baseVisibleRows.slice().sort(function (left, right) {
      if (sortKey === "rank") {
        const dailyGap = Number(right.score_o || 0) - Number(left.score_o || 0);
        if (dailyGap !== 0) {
          return dailyGap;
        }
        return Number(left.rank || 0) - Number(right.rank || 0);
      }
      const valueFactory = themeTableSortColumns[sortKey] || themeTableSortColumns.score;
      const leftValue = valueFactory(left);
      const rightValue = valueFactory(right);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      var result = 0;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        result = leftNumber - rightNumber;
      } else {
        result = String(leftValue || "").localeCompare(String(rightValue || ""), "ko");
      }
      if (result === 0) {
        result = Number(left.rank || 0) - Number(right.rank || 0);
      }
      return themeTableSortState.direction === "asc" ? result : -result;
    });
    const themeTableHeaderColumns = [
      { key: "rank", label: "순위" },
      { key: "sector", label: "섹터" },
      { key: "stock_name", label: "종목명" },
      { key: "sortino_norm", label: "Sortino" },
      { key: "score_o", label: "당일점수" },
      { key: "market_cap_100m", label: "시총(억)" },
      { key: "trading_value_100m", label: "거래대금(억)" },
      { key: "change_pct", label: "등락률" },
      { key: "score", label: "종합점수" },
      { key: "note", label: "비고" },
    ];
    const themeTableRowHeight = 38;
    const themeTableViewportHeight = Math.min(620, Math.max(320, sortedVisibleRows.length * themeTableRowHeight + 42));
    const themeTableOverscan = 14;
    const themeTableMaxScrollTop = Math.max(0, sortedVisibleRows.length * themeTableRowHeight - themeTableViewportHeight);
    const themeTableEffectiveScrollTop = Math.min(themeTableScrollTop, themeTableMaxScrollTop);
    const themeTableStartIndex = Math.max(0, Math.floor(themeTableEffectiveScrollTop / themeTableRowHeight) - themeTableOverscan);
    const themeTableEndIndex = Math.min(
      sortedVisibleRows.length,
      Math.ceil((themeTableEffectiveScrollTop + themeTableViewportHeight) / themeTableRowHeight) + themeTableOverscan
    );
    const themeTableTopSpacer = themeTableStartIndex * themeTableRowHeight;
    const themeTableBottomSpacer = Math.max(0, (sortedVisibleRows.length - themeTableEndIndex) * themeTableRowHeight);
    const renderedVisibleRows = sortedVisibleRows.slice(themeTableStartIndex, themeTableEndIndex);
    const visibleRowIndexByKey = {};
    sortedVisibleRows.forEach(function (row, index) {
      visibleRowIndexByKey[buildStockSearchKey(row)] = index;
    });
    const isRankSort = themeTableSortState.key === "rank";
    const isDailyScoreSort = themeTableSortState.key === "score_o";
    const captureTitle = isRankSort
      ? "종목 추세 순위 · 52주 신고가"
      : (isDailyScoreSort ? "종목 추세 순위 · 당일점수 100점 이상" : "종목 추세 순위 · 종합점수 50점 이상");
    const captureButtonLabel = isRankSort
      ? "52주 신고가 캡쳐"
      : (isDailyScoreSort ? "당일점수 100점 이상 캡쳐" : "종합점수 50점 이상 캡쳐");
    const captureSummaryLabel = isRankSort
      ? "52주 신고가"
      : (isDailyScoreSort ? "당일점수 100점 이상" : "종합점수 50점 이상");
    const captureEmptyMessage = isRankSort
      ? "52주 신고가 종목이 없습니다."
      : (isDailyScoreSort ? "당일점수 100점 이상 종목이 없습니다." : "종합점수 50점 이상 종목이 없습니다.");
    const scoreCaptureRows = (isRankSort ? sortedVisibleRows : sortedVisibleRows
      .filter(function (row) {
        return isDailyScoreSort ? Number(row.score_o || 0) >= 100 : Number(row.score || 0) >= 50;
      }))
      .map(function (row, index) {
        return Object.assign({}, row, { __display_rank: index + 1 });
      });
    const maxLeadCount = sortedVisibleRows.reduce(function (maxValue, row) {
      return Math.max(maxValue, Math.abs(Number(row.lead_count || 0)));
    }, 0);
    const maxAvgLeadScoreAbs = sortedVisibleRows.reduce(function (maxValue, row) {
      return Math.max(maxValue, Math.abs(Number(row.avg_lead_score || 0)));
    }, 0);

    function toggleThemeTableSort(sortKey) {
      setThemeTableSortState(function (current) {
        if (sortKey === "rank") {
          return { key: "rank", direction: "desc" };
        }
        if (current && current.key === sortKey) {
          return { key: sortKey, direction: current.direction === "desc" ? "asc" : "desc" };
        }
        return { key: sortKey, direction: sortKey === "stock_name" || sortKey === "sector" || sortKey === "note" ? "asc" : "desc" };
      });
    }

    function normalizeStockSearchText(value) {
      return String(value || "").toLowerCase().replace(/\s+/g, "");
    }

    function buildStockSearchKey(row) {
      const code = String((row || {}).stock_code || "").replace(/\D/g, "").padStart(6, "0");
      return code && code !== "000000" ? code : String((row || {}).stock_name || "");
    }

    function stockSearchHaystack(row) {
      return normalizeStockSearchText([
        row.stock_name,
        row.resolved_name,
        row.stock_code,
        String(row.stock_code || "").replace(/\D/g, "").padStart(6, "0"),
      ].filter(Boolean).join(" "));
    }

    const stockSearchQuery = normalizeStockSearchText(stockSearchText);
    const stockSearchSuggestions = stockSearchOpen && stockSearchQuery
      ? rows.filter(function (row) {
          return stockSearchHaystack(row).indexOf(stockSearchQuery) >= 0;
        }).slice().sort(function (a, b) {
          const aName = normalizeStockSearchText(a.stock_name || "");
          const bName = normalizeStockSearchText(b.stock_name || "");
          const aStarts = aName.indexOf(stockSearchQuery) === 0 ? 0 : 1;
          const bStarts = bName.indexOf(stockSearchQuery) === 0 ? 0 : 1;
          if (aStarts !== bStarts) {
            return aStarts - bStarts;
          }
          return Number(a.rank || 9999) - Number(b.rank || 9999);
        }).slice(0, 10)
      : [];

    function scrollToStockRow(stockKey, delay) {
      window.setTimeout(function () {
        const targetIndex = visibleRowIndexByKey[stockKey];
        if (themeTableScrollRef.current && Number.isFinite(targetIndex)) {
          themeTableScrollRef.current.scrollTop = Math.max(0, targetIndex * themeTableRowHeight - (themeTableViewportHeight / 2));
        }
        const rowElement = stockRowRefs.current[stockKey];
        if (rowElement && rowElement.scrollIntoView) {
          rowElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
      }, delay || 0);
    }

    function handleThemeTableScroll(event) {
      const nextTop = Number((event.currentTarget && event.currentTarget.scrollTop) || 0);
      if (themeTableScrollRafRef.current) {
        window.cancelAnimationFrame(themeTableScrollRafRef.current);
      }
      themeTableScrollRafRef.current = window.requestAnimationFrame(function () {
        themeTableScrollRafRef.current = null;
        setThemeTableScrollTop(nextTop);
      });
    }

    function submitStockSearch(event) {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      const query = normalizeStockSearchText(stockSearchText);
      if (!query) {
        setStockSearchMessage("검색할 종목명을 입력해 주세요.");
        return;
      }
      const matched = rows.find(function (row) {
        return stockSearchHaystack(row).indexOf(query) >= 0;
      });
      if (!matched) {
        setStockSearchMessage("조건에 맞는 종목을 찾지 못했습니다.");
        setHighlightedStockKey("");
        return;
      }
      const stockKey = buildStockSearchKey(matched);
      const isVisibleNow = visibleRows.some(function (row) {
        return buildStockSearchKey(row) === stockKey;
      });
      if (!isVisibleNow) {
        pendingStockScrollKeyRef.current = stockKey;
        setSectorFilter("all");
      }
      setHighlightedStockKey(stockKey);
      setStockSearchMessage((matched.stock_name || "종목") + " · " + numberFormat(matched.rank, 0) + "위 위치로 이동합니다.");
      scrollToStockRow(stockKey, 80);
      scrollToStockRow(stockKey, 260);
    }

    function chooseStockSearchRow(row) {
      if (!row) {
        return;
      }
      setStockSearchText(row.stock_name || row.stock_code || "");
      setStockSearchOpen(false);
      setStockSearchActiveIndex(0);
      const stockKey = buildStockSearchKey(row);
      const isVisibleNow = visibleRows.some(function (visibleRow) {
        return buildStockSearchKey(visibleRow) === stockKey;
      });
      if (!isVisibleNow) {
        pendingStockScrollKeyRef.current = stockKey;
        setSectorFilter("all");
      }
      setHighlightedStockKey(stockKey);
      setStockSearchMessage((row.stock_name || "종목") + " · " + numberFormat(row.rank, 0) + "위 위치로 이동합니다.");
      scrollToStockRow(stockKey, 80);
      scrollToStockRow(stockKey, 260);
    }

    function handleStockSearchKeyDown(event) {
      if (!stockSearchOpen || !stockSearchSuggestions.length) {
        if (event.key === "Enter") {
          setStockSearchOpen(false);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setStockSearchActiveIndex(function (current) {
          return Math.min(current + 1, stockSearchSuggestions.length - 1);
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setStockSearchActiveIndex(function (current) {
          return Math.max(current - 1, 0);
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        chooseStockSearchRow(stockSearchSuggestions[stockSearchActiveIndex] || stockSearchSuggestions[0]);
      } else if (event.key === "Escape") {
        setStockSearchOpen(false);
      }
    }

    function renderSignedPercent(value) {
      const number = Number(value);
      let className = "metric-flat";
      if (number > 0) {
        className = "metric-up";
      } else if (number < 0) {
        className = "metric-down";
      }
      return h("span", { className: className }, formatPercent(number, 2));
    }

    function isHigh52(value) {
      const normalized = String(value || "").trim().toUpperCase();
      return normalized === "O" || normalized === "Y" || normalized === "TRUE" || normalized === "1";
    }

    function isTradableHigh52(row) {
      return isHigh52(row && row.is_52w_high)
        && Number((row && row.trading_value_100m) || 0) > 0
        && Number((row && row.score_o) || 0) > 0;
    }

    function renderRankCell(row, rankValue) {
      const high52 = isHigh52(row.is_52w_high);
      const displayRank = Number(rankValue != null ? rankValue : (row && row.__display_rank != null ? row.__display_rank : row.rank));
      return h(
        "span",
        {
          className: "rank-cell" + (high52 ? " high52" : ""),
          title: high52 ? "52주 신고가" : "",
        },
        numberFormat(displayRank, 0)
      );
    }

    function renderNumberCell(value, digits) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return numberFormat(number, digits == null ? 2 : digits);
    }

    function scoreHeatColor(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "#f8fafc";
      }
      const clamped = Math.max(0, Math.min(100, number));
      const hue = 120 - clamped * 1.2;
      return "hsl(" + hue.toFixed(0) + " 72% 76%)";
    }

    function renderHeatScore(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return h("span", { className: "heat-score-cell empty" }, "-");
      }
      return h("span", { className: "heat-score-cell" }, numberFormat(number, 2));
    }

    function heatScoreCellProps(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return { className: "heat-score-td empty" };
      }
      return {
        className: "heat-score-td",
        style: { background: scoreHeatColor(number) },
      };
    }

    function scoreHistoryPositionFromEvent(event) {
      const width = 430;
      const height = 360;
      const left = Math.max(10, Math.min((event.clientX || 0) + 14, window.innerWidth - width - 10));
      const top = Math.max(10, Math.min((event.clientY || 0) + 14, window.innerHeight - height - 34));
      return { left: left, top: top };
    }

    function buildScoreHistoryKey(row) {
      const code = String((row || {}).stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = (row || {}).resolved_name || (row || {}).stock_name || "";
      const endDate = themes.file_date || selectedDateValue || selectedFileDate || "";
      const cacheLoadedAt = (themes && themes.cache_loaded_at) ? String(themes.cache_loaded_at) : "";
      return [code, name, endDate, cacheLoadedAt].join("|");
    }

    function openScoreHistory(row, options) {
      if (!row) {
        return;
      }
      const openOptions = options || {};
      const mode = openOptions.mode || "modal";
      const position = openOptions.position || null;
      const code = String(row.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = row.resolved_name || row.stock_name || "";
      const endDate = themes.file_date || selectedDateValue || selectedFileDate || "";
      const cacheKey = buildScoreHistoryKey(row);
      const cached = scoreHistoryCacheRef.current[cacheKey];
      scoreHistoryRequestSeqRef.current += 1;
      const requestSeq = scoreHistoryRequestSeqRef.current;
      if (cached) {
        setScoreHistoryPopup({
          open: true,
          mode: mode,
          loading: false,
          error: "",
          row: row,
          payload: cached,
          position: position,
        });
        return;
      }
      setScoreHistoryPopup({
        open: true,
        mode: mode,
        loading: true,
        error: "",
        row: row,
        payload: null,
        position: position,
      });
      const params = new URLSearchParams();
      if (code && code !== "000000") {
        params.set("code", code);
      }
      if (name) {
        params.set("name", name);
      }
      if (endDate) {
        params.set("end_date", endDate);
      }
      params.set("days", "62");
      fetchJson("/api/themes/score-history?" + params.toString(), { noCache: true })
        .then(function (payload) {
          scoreHistoryCacheRef.current[cacheKey] = payload;
          if (scoreHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setScoreHistoryPopup({
            open: true,
            mode: mode,
            loading: false,
            error: "",
            row: row,
            payload: payload,
            position: position,
          });
        })
        .catch(function (error) {
          if (scoreHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setScoreHistoryPopup({
            open: true,
            mode: mode,
            loading: false,
            error: error.message || String(error),
            row: row,
            payload: null,
            position: position,
          });
        });
    }

    function closeScoreHistory() {
      scoreHistoryRequestSeqRef.current += 1;
      setScoreHistoryPopup({
        open: false,
        mode: "modal",
        loading: false,
        error: "",
        row: null,
        payload: null,
        position: null,
      });
    }

    function scheduleScoreHistoryHover(row, event) {
      const position = scoreHistoryPositionFromEvent(event);
      if (scoreHistoryHoverCloseRef.current) {
        clearTimeout(scoreHistoryHoverCloseRef.current);
      }
      if (scoreHistoryHoverOpenRef.current) {
        clearTimeout(scoreHistoryHoverOpenRef.current);
      }
      scoreHistoryHoverOpenRef.current = setTimeout(function () {
        openScoreHistory(row, { mode: "hover", position: position });
      }, 180);
    }

    function updateScoreHistoryHoverPosition(event) {
      if (!scoreHistoryPopup.open || scoreHistoryPopup.mode !== "hover") {
        return;
      }
      const position = scoreHistoryPositionFromEvent(event);
      setScoreHistoryPopup(function (current) {
        if (!current.open || current.mode !== "hover") {
          return current;
        }
        return Object.assign({}, current, { position: position });
      });
    }

    function scheduleScoreHistoryHoverClose() {
      if (scoreHistoryHoverOpenRef.current) {
        clearTimeout(scoreHistoryHoverOpenRef.current);
      }
      if (scoreHistoryHoverCloseRef.current) {
        clearTimeout(scoreHistoryHoverCloseRef.current);
      }
      scoreHistoryHoverCloseRef.current = setTimeout(function () {
        scoreHistoryRequestSeqRef.current += 1;
        setScoreHistoryPopup(function (current) {
          if (current.mode !== "hover") {
            return current;
          }
          return {
            open: false,
            mode: "modal",
            loading: false,
            error: "",
            row: null,
            payload: null,
            position: null,
          };
        });
      }, 160);
    }

    function keepScoreHistoryHoverOpen() {
      if (scoreHistoryHoverCloseRef.current) {
        clearTimeout(scoreHistoryHoverCloseRef.current);
      }
    }

    function renderTodayScore(value, row) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      if (row) {
        return h(
          "button",
          {
            type: "button",
            className: "today-score-cell today-score-button",
            title: "최근 한 달 점수 변동 추이 보기",
            onClick: function () { openScoreHistory(row, { mode: "modal" }); },
          },
          numberFormat(number, 2)
        );
      }
      return h("span", { className: "today-score-cell" }, numberFormat(number, 2));
    }

    function renderStockNameWithCode(row) {
      const stockEntryLabel = String((row || {}).entry_signal_label || "").trim();
      const signalType = String((row || {}).entry_signal_type || "").trim();
      const capturePlain = !!(row && row.__capture_plain);
      return h(
        "div",
        {
          className: "theme-stock-name-cell"
            + (!capturePlain && row.entry_signal_active ? " entry-signal-stock signal-no_leverage" : "")
            + (!capturePlain && signalType === "exit" ? " exit-signal-stock" : ""),
          title: stockEntryLabel
            ? ("종목 신호 상태 · " + stockEntryLabel)
            : "",
        },
        h(
          React.Fragment,
          null,
          capturePlain
            ? h("span", { className: "theme-capture-stock-label" }, row.stock_name || "-")
            : h(TradingViewStockLink, {
                row: row,
                label: row.stock_name || "-",
                onOpenChart: function (chartRow, symbol, label) {
                  openStockChartPopup(chartRow || row, symbol, label || row.stock_name || "-");
                },
              })
        )
      );
    }

    function renderDataBar(value, maxAbs, digits) {
      const number = Number(value || 0);
      const width = maxAbs > 0 ? Math.min(Math.abs(number) / maxAbs * 100, 100) : 0;
      return h(
        "div",
        { className: "data-bar-cell" },
        h("span", {
          className: "data-bar-fill" + (number < 0 ? " negative" : ""),
          style: { width: width + "%" },
        }),
        h("span", { className: "data-bar-value" }, numberFormat(number, digits))
      );
    }

    function openSectorMarketCapChart(sector) {
      const targetSector = String(sector || "").trim();
      if (!targetSector || targetSector === "all") {
        setSectorFilter("all");
        return;
      }
      const sectorRows = rows.filter(function (row) {
        return String(row.manual_sector || "").trim() === targetSector;
      });
      setSectorFilter(targetSector);
      sectorMarketCapRequestSeqRef.current += 1;
      const requestSeq = sectorMarketCapRequestSeqRef.current;
      setSectorMarketCapPopup({
        open: true,
        sector: targetSector,
        loading: true,
        error: "",
        payload: null,
      });
      postJson("/api/themes/sector-market-cap-chart", {
        sector: targetSector,
        months: 3,
        stocks: sectorRows.map(function (row) {
          return {
            code: row.stock_code || "",
            name: row.resolved_name || row.stock_name || "",
          };
        }),
      }).then(function (payload) {
        if (sectorMarketCapRequestSeqRef.current !== requestSeq) {
          return;
        }
        setSectorMarketCapPopup({
          open: true,
          sector: targetSector,
          loading: false,
          error: "",
          payload: payload,
        });
      }).catch(function (error) {
        if (sectorMarketCapRequestSeqRef.current !== requestSeq) {
          return;
        }
        setSectorMarketCapPopup({
          open: true,
          sector: targetSector,
          loading: false,
          error: error.message || String(error),
          payload: null,
        });
      });
    }

    function closeSectorMarketCapChart() {
      sectorMarketCapRequestSeqRef.current += 1;
      setSectorMarketCapPopup({
        open: false,
        sector: "",
        loading: false,
        error: "",
        payload: null,
      });
    }

    function updateStockSector(stockName, value) {
      const targetRow = rows.find(function (row) { return row.stock_name === stockName; }) || {};
      setSectorState(function (current) {
        const nextMap = Object.assign({}, current.stockMap || {});
        const rawValue = String(value || "");
        const normalized = rawValue.trim();
        nextMap[stockName] = rawValue;
        if (targetRow.stock_code) {
          nextMap[targetRow.stock_code] = rawValue;
        }
        return {
          stockMap: nextMap,
          sectors: ensureArray(current.sectors),
        };
      });
    }

    function commitStockSector(row, value) {
      const normalized = String(value || "").trim();
      const previous = String(row.manual_sector || "").trim();
      if (normalized === previous) {
        return;
      }
      updateStockSector(row.stock_name, normalized);
      rememberSectorName(normalized);
      const requestSeq = sectorSaveSeqRef.current + 1;
      sectorSaveSeqRef.current = requestSeq;
      setSectorSaveState({ status: "saving", message: "섹터 자동 저장 중..." });
      postJson("/api/sector-db/assign", {
        stock_code: row.stock_code || null,
        stock_name: row.stock_name || "",
        sector: normalized,
      })
        .then(function () {
          if (sectorSaveSeqRef.current === requestSeq) {
            setSectorSaveState({ status: "saved", message: "섹터 DB 저장 완료" });
          }
        })
        .catch(function (err) {
          if (sectorSaveSeqRef.current === requestSeq) {
            setSectorSaveState({ status: "error", message: "자동 저장 실패: " + (err.message || String(err)) });
          }
        });
    }

    function commitStockNote(row, value) {
      const normalized = String(value || "").trim();
      const previous = String(row.note || "").trim();
      const noteKey = noteKeyForRow(row);
      if (normalized === previous) {
        return Promise.resolve();
      }
      if (noteKey) {
        setNoteOverrides(function (current) {
          return Object.assign({}, current, { [noteKey]: normalized });
        });
      }
      setNoteSaveState({ status: "saving", message: "비고 SQL에 저장 중..." });
      return postJson("/api/themes/note", {
        file_date: selectedDateValue || null,
        stock_code: row.stock_code || null,
        stock_name: row.stock_name || "",
        note: normalized,
      })
        .then(function (payload) {
          setNoteSaveState({
            status: "saved",
            message: "비고 SQL 저장 완료",
          });
          themesRequest.refresh();
          return payload;
        })
        .catch(function (err) {
          setNoteSaveState({ status: "error", message: "비고 저장 실패: " + (err.message || String(err)) });
          throw err;
        });
    }

    function refreshLeaderCalendar() {
      if (calendarRefreshing) {
        return;
      }
      setCalendarRefreshing(true);
      invalidateApiCache(function (key) {
        return key.indexOf("/api/theme-sector-calendar") === 0;
      });
      fetchJson("/api/theme-sector-calendar?min_score=0&limit=60&score_basis=" + encodeURIComponent(calendarScoreBasis) + "&force_refresh=true&refresh=" + Date.now(), { noCache: true })
        .then(function (payload) {
          calendarRequest.refresh();
        })
        .catch(function () {
          return calendarRequest.refresh();
        })
        .finally(function () {
          setCalendarRefreshing(false);
        });
    }

    function copyElementToClipboard(target, setCopyState, options) {
      const captureOptions = options || {};
      function finishWithoutTarget() {
        if (typeof captureOptions.afterFinish === "function") {
          captureOptions.afterFinish();
        }
      }
      if (!target) {
        setCopyState({ status: "error", message: "캘린더 복사 이미지를 만들지 못했습니다." });
        finishWithoutTarget();
        return;
      }
      if (!window.html2canvas) {
        setCopyState({ status: "error", message: "캘린더 캡쳐 이미지를 복사하지 못했습니다." });
        finishWithoutTarget();
        return;
      }
      if (!navigator.clipboard || !window.ClipboardItem) {
        setCopyState({ status: "error", message: "현재 환경에서 이미지 클립보드 복사를 지원하지 않습니다." });
        finishWithoutTarget();
        return;
      }
      setCopyState({ status: "working", message: "캡쳐 복사 중..." });
      const scale = captureOptions.scale || Math.max(2, Math.min(3, window.devicePixelRatio || 2));
      const temporaryClass = captureOptions.temporaryClass || "";
      const settleMs = Number(captureOptions.settleMs || 0);
      function finishCapture() {
        if (temporaryClass) {
          target.classList.remove(temporaryClass);
        }
        if (typeof captureOptions.afterFinish === "function") {
          captureOptions.afterFinish();
        }
      }
      if (temporaryClass) {
        target.classList.add(temporaryClass);
      }
      const waitForLayout = function () {
        return new Promise(function (resolve) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              if (settleMs > 0) {
                window.setTimeout(resolve, settleMs);
              } else {
                resolve();
              }
            });
          });
        });
      };
      waitForLayout().then(function () {
        return window.html2canvas(target, {
          backgroundColor: "#ffffff",
          scale: scale,
          useCORS: true,
          logging: false,
          windowWidth: Math.max(document.documentElement.clientWidth || 0, target.scrollWidth || 0),
          windowHeight: Math.max(document.documentElement.clientHeight || 0, target.scrollHeight || 0),
          ignoreElements: function (element) {
            return element && element.getAttribute && element.getAttribute("data-capture-ignore") === "true";
          },
        });
      }).then(function (canvas) {
        const pixelMessage = numberFormat(canvas.width, 0) + " x " + numberFormat(canvas.height, 0) + "px";
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              reject(new Error("이미지 생성에 실패했습니다."));
              return;
            }
            resolve({ blob: blob, pixelMessage: pixelMessage });
          }, "image/png");
        });
      }).then(function (result) {
        return navigator.clipboard.write([new ClipboardItem({ "image/png": result.blob })])
          .then(function () { return result.pixelMessage; });
      }).then(function (pixelMessage) {
        finishCapture();
        setCopyState({ status: "saved", message: "클립보드에 복사 완료 · " + pixelMessage });
        window.setTimeout(function () {
          setCopyState(function (current) {
            return current.status === "saved" ? { status: "", message: "" } : current;
          });
        }, 3200);
      }).catch(function (error) {
        finishCapture();
        setCopyState({ status: "error", message: error.message || "캡쳐 복사에 실패했습니다." });
      });
    }

    function copyLeaderCalendarToClipboard() {
      copyElementToClipboard(leaderCalendarRef.current, setCalendarCopyState);
    }

    function copyManualSummaryToClipboard() {
      copyElementToClipboard(manualSummaryRef.current, setManualSummaryCopyState);
    }

    function copyScoreTableToClipboard() {
      setCaptureStageReady(true);
      window.setTimeout(function () {
        if (!scoreTableCaptureRef.current) {
          setCaptureStageReady(false);
          setScoreTableCopyState({ status: "error", message: "캡쳐용 이미지를 만들지 못했습니다." });
          return;
        }
        copyElementToClipboard(scoreTableCaptureRef.current, setScoreTableCopyState, {
          scale: 4,
          temporaryClass: "capture-ultra",
          settleMs: 80,
          afterFinish: function () {
            window.setTimeout(function () { setCaptureStageReady(false); }, 300);
          },
        });
      }, 80);
    }

    function renderLeaderTimelineContent(options) {
      const captureMode = options && options.capture;
      if (!visibleCalendarDays.length) {
        return EmptyState({ message: "오늘의 주도주에서 섹터를 지정하면 날짜별 흐름이 여기에 표시됩니다.", compact: true });
      }
      return h(
        "div",
        { className: "leader-timeline-wrap" + (captureMode ? " capture-mode" : "") },
        h(
          "div",
          {
            className: "leader-timeline",
            style: { gridTemplateColumns: "86px repeat(" + visibleCalendarDays.length + ", minmax(54px, 1fr))" },
          },
          [
            h("div", { key: "corner", className: "leader-timeline-corner" }, "순위"),
          ].concat(visibleCalendarDays.map(function (day) {
            const isSelected = (selectedFileDate || themes.file_date || "") === day.date;
            const top10Avg = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
            const top10LabelPrefix = calendarScoreBasis === "score_o" ? "Top10 당일점수 평균 " : "Top10 종합점수 평균 ";
            const top10Label = Number.isFinite(top10Avg) ? top10LabelPrefix + numberFormat(top10Avg, 1) : top10LabelPrefix + "-";
            return h("button", {
              key: "head-" + day.date,
              className: "leader-timeline-date" + (isSelected ? " active" : ""),
              type: "button",
              title: day.date + " 주도 섹터 흐름\n" + top10Label,
              onClick: captureMode ? null : function () { selectCalendarDate(day.date, "all"); },
            }, [
              h("span", { key: "d", className: "leader-timeline-date-label" }, formatDateLabel(day.date)),
              h("span", { key: "a", className: "leader-timeline-date-score" }, Number.isFinite(top10Avg) ? numberFormat(top10Avg, 1) : "-"),
            ]);
          })).concat([0, 1, 2, 3, 4].flatMap(function (rankIndex) {
            return [
              h("div", { key: "rank-" + rankIndex, className: "leader-timeline-rank" }, (rankIndex + 1) + "위"),
            ].concat(visibleCalendarDays.map(function (day, dayIndex) {
              const linkedDay = Object.assign({}, day, {
                prevDay: visibleCalendarDays[dayIndex - 1],
                nextDay: visibleCalendarDays[dayIndex + 1],
              });
              const ranked = ensureArray(day.sectors).slice(0, 5)[rankIndex];
              if (!ranked) {
                return h("button", {
                  key: "empty-" + rankIndex + "-" + day.date,
                  type: "button",
                  className: "leader-timeline-cell empty-click",
                  title: day.date + " 주도주 파일 열기",
                  onClick: captureMode ? null : function () { selectCalendarDate(day.date, "all"); },
                });
              }
              return h(
                "div",
                { key: ranked.sector + "-" + rankIndex + "-" + day.date, className: "leader-timeline-cell" },
                h(
                  "button",
                  {
                    type: "button",
                    className: calendarRankCellClass(linkedDay, rankIndex, ranked.sector),
                    style: calendarRankCellStyle(linkedDay, rankIndex, ranked.sector, colorForKey(ranked.sector)),
                    title: ranked.sector + "\n섹터강도 " + numberFormat(ranked.sector_strength, 1) + " / 순위파워 " + numberFormat(ranked.rank_power, 1) + "\n평균 " + (calendarScoreBasis === "score_o" ? "당일점수 " : "종합점수 ") + numberFormat(ranked.avg_score, 1) + " / 신뢰도 " + (ranked.confidence || "-") + "\nTop20 " + numberFormat(Number(ranked.top20_ratio || 0) * 100, 0) + "% (" + numberFormat(ranked.top20_count, 0) + "개) / Top50 " + numberFormat(Number(ranked.top50_ratio || 0) * 100, 0) + "% (" + numberFormat(ranked.top50_count, 0) + "개)\n거래집중도 " + numberFormat(Number(ranked.turnover_ratio || 0) * 100, 2) + "% / 거래대금 " + numberFormat(ranked.trading_value_100m, 0) + "억\n대표주: " + ensureArray(ranked.leaders).join(", "),
                    onClick: captureMode ? null : function () { selectCalendarDate(day.date, ranked.sector); },
                  },
                  h("span", null, ranked.sector)
                )
              );
            }));
          }))
        ),
        h(
          "div",
          { className: "leader-timeline-legend" },
          calendarTopSectors.map(function (sector) {
            return h(
              "button",
              {
                key: sector,
                type: "button",
                className: "theme-sector-chip",
                onClick: captureMode ? null : function () { setSectorFilter(sector); },
              },
              h("span", { className: "theme-sector-dot", style: { background: colorForKey(sector) } }),
              h("span", { className: "theme-sector-chip-name" }, sector)
            );
          })
        )
      );
    }

    function rememberSectorName(value) {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }
      setSectorState(function (current) {
        if (ensureArray(current.sectors).indexOf(normalized) >= 0) {
          return current;
        }
        return {
          stockMap: Object.assign({}, current.stockMap || {}),
          sectors: ensureArray(current.sectors).concat([normalized]),
        };
      });
    }

    function selectCalendarDate(date, sector) {
      if (!date) {
        return;
      }
      setSelectedFileDate(date);
      setSectorFilter(sector || "all");
      setReloadMessage("");
    }

    function selectFileDate(date) {
      if (!date || !availableDateMap[date]) {
        return;
      }
      setSelectedFileDate(date);
      setSectorFilter("all");
      setReloadMessage("");
    }

    function reloadThemeExcel() {
      if (reloadingExcel) {
        return;
      }
      setReloadingExcel(true);
      setReloadMessage("");
      setReloadStartedAt(Date.now());
      setReloadElapsedSec(0);
      postJson("/api/themes/reload", {
        file_date: selectedFileDate || themes.file_date || null,
        min_score: 0,
        recent_limit: 20,
        reload_all: false,
      }).then(function (payload) {
        if (payload && payload.file_date) {
          setSelectedFileDate(payload.file_date);
        }
        if (payload && payload.fallback_reason === "requested_file_missing") {
          setReloadMessage("선택했던 " + (payload.requested_file_date || "날짜") + " 파일이 없어 " + payload.file_date + " 파일로 다시 불러왔습니다.");
        } else if (payload && payload.score_average_update) {
          const averageUpdate = payload.score_average_update;
          setReloadMessage(
            "점수 평균값 업데이트를 완료했습니다. "
              + formatNumber(averageUpdate.updated_rows || 0, 0)
              + "개 행 / 소스 "
              + formatNumber(averageUpdate.source_files || 0, 0)
              + "개 파일 / DB 변경 "
              + formatNumber(averageUpdate.db_changed_files || 0, 0)
              + "개"
          );
        } else if (payload && payload.direct_load_script) {
          setReloadMessage("오늘자 데이터 계산 결과를 기준으로 다시 불러왔습니다.");
        } else {
          setReloadMessage("SQL 데이터를 기준으로 화면을 새로고침했습니다.");
        }
        return themesRequest.refresh();
      }).catch(function (error) {
        setReloadMessage(error.message || "오늘자 데이터 로드 중 문제가 발생했습니다.");
      }).finally(function () {
        setReloadingExcel(false);
        setReloadStartedAt(0);
      });
    }

    function buildTodayThemeExcel() {
      if (reloadingExcel) {
        return;
      }
      setReloadingExcel(true);
      setReloadMessage("");
      setReloadStartedAt(Date.now());
      setReloadElapsedSec(0);
      postJson("/api/themes/build-today-data", {
        min_score: 0,
        recent_limit: 20,
      }).then(function (payload) {
        if (payload && payload.file_date) {
          setSelectedFileDate(payload.file_date);
        }
        if (payload && payload.today_excel_build && payload.today_excel_build.mode === "sql_cached") {
          setReloadMessage("오늘자 데이터가 SQL 캐시 기준으로 이미 반영되어 있어 바로 불러왔습니다.");
        } else {
          setReloadMessage("오늘자 데이터를 새로 계산하고 SQL과 캐시를 갱신했습니다.");
        }
        return themesRequest.refresh();
      }).catch(function (error) {
        setReloadMessage(error.message || "오늘자 데이터 생성/로드 중 문제가 발생했습니다.");
      }).finally(function () {
        setReloadingExcel(false);
        setReloadStartedAt(0);
      });
    }

    function renderScoreHistoryPopup() {
      if (!scoreHistoryPopup.open) {
        return null;
      }
      const payload = scoreHistoryPopup.payload || {};
      const popupRow = scoreHistoryPopup.row || {};
      const historyRows = ensureArray(payload.rows);
      const summary = payload.summary || {};
      const stockName = payload.stock_name || popupRow.resolved_name || popupRow.stock_name || "종목";
      const stockCode = payload.stock_code || popupRow.stock_code || "";
      const isHover = scoreHistoryPopup.mode === "hover";
      const content = scoreHistoryPopup.loading
        ? h(LoadingBlock, { compact: true, title: "점수 변동 추이 로드 중", label: "최근 한 달 주도주 파일 확인" })
        : scoreHistoryPopup.error
          ? h("div", { className: "notice-box error" }, scoreHistoryPopup.error)
          : historyRows.length
            ? h(
                React.Fragment,
                null,
                isHover
                  ? h(
                      "div",
                      { className: "score-history-hover-summary" },
                      h("span", null, "최근 종합점수 " + numberFormat(summary.latest_score, 2)),
                      h("span", null, "평균 종합점수 " + numberFormat(summary.avg_score, 2)),
                      h("span", null, numberFormat(summary.count, 0) + "ȸ")
                    )
                  : h(
                      "div",
                      { className: "summary-grid summary-grid-small score-history-summary" },
                      h(SummaryCard, { label: "기간", value: (payload.start_date || "").slice(5) + " ~ " + (payload.end_date || "").slice(5), help: "최근 한 달" }),
                      h(SummaryCard, { label: "최근 점수", value: numberFormat(summary.latest_score, 2), help: "선택 기준일" }),
                      h(SummaryCard, { label: "평균 점수", value: numberFormat(summary.avg_score, 2), help: numberFormat(summary.count, 0) + "회 등장" }),
                      h(SummaryCard, { label: "최고 점수", value: numberFormat(summary.max_score, 2), help: "기간 내 최고" })
                    ),
                h(ScoreHistoryChart, { rows: historyRows }),
                isHover
                  ? null
                  : h(
                      "div",
                      { className: "score-history-list" },
                      historyRows.slice().reverse().map(function (item) {
                        return h(
                          "div",
                          { key: item.date, className: "score-history-item" },
                          h("strong", null, item.date),
                          h("span", null, "점수 " + numberFormat(item.score, 2)),
                          h("span", { className: Number(item.change_pct || 0) >= 0 ? "metric-up-light" : "metric-down-light" }, formatPercent(item.change_pct, 2)),
                          h("span", null, numberFormat(item.rank, 0) + "위")
                        );
                      })
                    )
              )
            : EmptyState({ message: "최근 한 달 안에 해당 종목의 점수 이력이 없습니다.", compact: true });
      if (isHover) {
        const position = scoreHistoryPopup.position || { left: 16, top: 16 };
        return h(
          "div",
          {
            className: "score-history-hover-card",
            style: { left: position.left + "px", top: position.top + "px" },
            onMouseEnter: keepScoreHistoryHoverOpen,
            onMouseLeave: scheduleScoreHistoryHoverClose,
          },
          h(
            "div",
            { className: "score-history-hover-head" },
            h("strong", null, stockName),
            stockCode ? h("span", null, stockCode) : null
          ),
          content
        );
      }
      return h(
        "div",
        {
          className: "modal-backdrop score-history-backdrop",
          onClick: closeScoreHistory,
        },
        h(
          "div",
          {
            className: "modal-panel score-history-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Score Trend"),
              h("h2", null, stockName + (stockCode ? " (" + stockCode + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeScoreHistory }, "닫기")
          ),
          content
        )
      );
    }

    function closeTradingViewPopup() {
      stockChartRequestSeqRef.current += 1;
      setTradingViewPopup({ open: false, row: null, symbol: "", label: "", loading: false, error: "", data: null, openingExternal: false, externalMessage: "" });
    }

    function openStockChartPopup(row, symbol, label) {
      const chartRow = row || {};
      const code = String(chartRow.stock_code || chartRow.code || "").replace(/\D/g, "").padStart(6, "0");
      const stockName = chartRow.stock_name || chartRow.resolved_name || label || "";
      const cacheKey = code && code !== "000000" ? code : stockName;
      stockChartRequestSeqRef.current += 1;
      const requestSeq = stockChartRequestSeqRef.current;
      setTradingViewPopup({
        open: true,
        row: chartRow,
        symbol: symbol || "",
        label: label || stockName || "-",
        loading: true,
        error: "",
        data: null,
        openingExternal: false,
        externalMessage: "",
      });
      if (cacheKey && CHART_PREVIEW_CACHE[cacheKey]) {
        setTradingViewPopup({
          open: true,
          row: chartRow,
          symbol: symbol || "",
          label: label || stockName || "-",
          loading: false,
          error: "",
          data: CHART_PREVIEW_CACHE[cacheKey],
          openingExternal: false,
          externalMessage: "",
        });
        return;
      }
      const params = new URLSearchParams();
      if (code && code !== "000000") {
        params.set("code", code);
      }
      if (stockName) {
        params.set("name", stockName);
      }
      params.set("months", "3");
      fetchJson("/api/stocks/chart-preview?" + params.toString())
        .then(function (payload) {
          if (cacheKey) {
            CHART_PREVIEW_CACHE[cacheKey] = payload;
          }
          if (stockChartRequestSeqRef.current !== requestSeq) {
            return;
          }
          setTradingViewPopup({
            open: true,
            row: chartRow,
            symbol: symbol || "",
            label: label || stockName || "-",
            loading: false,
            error: "",
            data: payload,
            openingExternal: false,
            externalMessage: "",
          });
        })
        .catch(function (error) {
          if (stockChartRequestSeqRef.current !== requestSeq) {
            return;
          }
          setTradingViewPopup({
            open: true,
            row: chartRow,
            symbol: symbol || "",
            label: label || stockName || "-",
            loading: false,
            error: error.message || String(error),
            data: null,
            openingExternal: false,
            externalMessage: "",
          });
        });
    }

    function openPopupStockInTradingView() {
      const row = tradingViewPopup.row || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const label = tradingViewPopup.label || row.stock_name || row.resolved_name || "";
      setTradingViewPopup(function (current) {
        return Object.assign({}, current, { openingExternal: true, externalMessage: "" });
      });
      postJson("/api/tradingview/open", {
        stock_code: code && code !== "000000" ? code : null,
        stock_name: label || null,
      }).then(function (payload) {
        setTradingViewPopup(function (current) {
          return Object.assign({}, current, {
            openingExternal: false,
            externalMessage: (payload && payload.message) || "TradingView 앱에서 열었습니다.",
          });
        });
      }).catch(function (error) {
        setTradingViewPopup(function (current) {
          return Object.assign({}, current, {
            openingExternal: false,
            externalMessage: "TradingView 실행 실패: " + (error.message || String(error)),
          });
        });
      });
    }

    function renderTradingViewPopup() {
      if (!tradingViewPopup.open) {
        return null;
      }
      const row = tradingViewPopup.row || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const label = tradingViewPopup.label || row.stock_name || row.resolved_name || "-";
      return h(
        "div",
        {
          className: "modal-backdrop theme-stock-chart-backdrop",
          onClick: closeTradingViewPopup,
        },
        h(
          "div",
          {
            className: "modal-panel theme-stock-chart-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "3개월 주가"),
              h("h2", null, label + (code && code !== "000000" ? " (" + code + ")" : ""))
            ),
            h(
              "div",
              { className: "theme-stock-chart-actions" },
              h("button", {
                type: "button",
                className: "mini-button tradingview-open-button",
                onClick: openPopupStockInTradingView,
                disabled: tradingViewPopup.openingExternal,
              }, tradingViewPopup.openingExternal ? "여는 중..." : "TradingView 앱에서 열기"),
              h("button", { type: "button", className: "mini-button", onClick: closeTradingViewPopup }, "닫기")
            )
          ),
          tradingViewPopup.externalMessage
            ? h("div", { className: "summary-help theme-stock-chart-message" }, tradingViewPopup.externalMessage)
            : null,
          h(StockChartPreview, {
            label: label,
            loading: tradingViewPopup.loading,
            error: tradingViewPopup.error,
            data: tradingViewPopup.data,
          })
        )
      );
    }

    function renderSectorMarketCapPopup() {
      if (!sectorMarketCapPopup.open) {
        return null;
      }
      const payload = sectorMarketCapPopup.payload || {};
      const sector = payload.sector || sectorMarketCapPopup.sector || "섹터";
      return h(
        "div",
        {
          className: "modal-backdrop sector-market-cap-backdrop",
          onClick: closeSectorMarketCapChart,
        },
        h(
          "div",
          {
            className: "modal-panel sector-market-cap-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Sector Market Cap"),
              h("h2", null, sector + " · 3개월 합산 시가총액")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeSectorMarketCapChart }, "닫기")
          ),
          sectorMarketCapPopup.loading
            ? h(LoadingBlock, { compact: true, title: "섹터 시가총액 차트 계산 중", label: "FinanceDataReader로 섹터 종목의 3개월 시총을 합산합니다." })
            : sectorMarketCapPopup.error
              ? h("div", { className: "notice-box error" }, sectorMarketCapPopup.error)
              : h(SectorMarketCapChart, { data: payload })
        )
      );
    }

    return h(
      React.Fragment,
      null,
      renderScoreHistoryPopup(),
      renderTradingViewPopup(),
      renderSectorMarketCapPopup(),
      h(
        "div",
        { className: "panel leader-calendar-panel", ref: leaderCalendarRef },
        h(
          "div",
          { className: "section-toolbar leader-calendar-head" },
          h(SectionTitle, null, "날짜별 주도 섹터 흐름"),
          h(
            "div",
            { className: "toggle-group" },
            h("button", {
              className: "mini-button capture-button",
              onClick: copyLeaderCalendarToClipboard,
              disabled: calendarCopyState.status === "working",
              "data-capture-ignore": "true",
            }, calendarCopyState.status === "working" ? "복사 중..." : "캡쳐 복사"),
            h("button", {
              className: "mini-button",
              onClick: refreshLeaderCalendar,
              disabled: calendarRefreshing,
            }, calendarRefreshing ? "새로고침 중..." : "흐름 새로고침"),
            h("button", {
              className: "mini-button" + (calendarMode === "month" ? " active" : ""),
              onClick: function () { setCalendarMode("month"); },
            }, "월간"),
            h("button", {
              className: "mini-button" + (calendarMode === "week" ? " active" : ""),
              onClick: function () { setCalendarMode("week"); },
            }, "주간"),
            h("button", {
              className: "mini-button" + (calendarScoreBasis === "score" ? " active" : ""),
              onClick: function () { setCalendarScoreBasis("score"); },
            }, "종합"),
            h("button", {
              className: "mini-button" + (calendarScoreBasis === "score_o" ? " active" : ""),
              onClick: function () { setCalendarScoreBasis("score_o"); },
            }, "당일"),
          ),
          h(
            "div",
            { className: "summary-help" + (sectorSaveState.status === "error" || calendarCopyState.status === "error" ? " text-danger" : "") },
            (calendarScoreBasis === "score_o" ? "당일점수 기준 상위 5개 섹터" : "종합점수 기준 상위 5개 섹터")
              + " 흐름 및 선택 날짜 연동 결과"
              + (sectorSaveState.message ? " · " + sectorSaveState.message : "")
              + (calendarCopyState.message ? " · " + calendarCopyState.message : "")
          ),
        ),
        calendarRequest.error
          ? h("div", { className: "notice-box error" }, "날짜별 주도 섹터 흐름을 불러오지 못했습니다: " + calendarRequest.error)
          : calendarRequest.loading && !calendarRequest.data
            ? h(LoadingBlock, { compact: true, title: "날짜별 주도 섹터 흐름 로드 중", label: calendarRequest.label })
            : renderLeaderTimelineContent()
      ),
      h(
        "div",
        { className: "panel hero-panel alt themes-compact-hero" + (themeBoxExpanded ? " expanded" : " collapsed") },
        h(
          "div",
          { className: "themes-compact-titlebar" },
          h(
            "button",
            {
              type: "button",
              className: "theme-box-toggle",
              onClick: function () { setThemeBoxExpanded(function (value) { return !value; }); },
              "aria-expanded": themeBoxExpanded ? "true" : "false",
            },
            h("span", { className: "calendar-arrow", "aria-hidden": "true" }, themeBoxExpanded ? "?" : "?"),
            h("span", { className: "theme-box-title-text" },
              h("span", { className: "eyebrow" }, "Daily Theme Radar"),
              h("span", { className: "page-title" }, "오늘의 주도주")
            )
          ),
          h("div", { className: "summary-help" }, themeBoxExpanded ? "시총 2000억 이상 전체" : "접힘 · 화살표를 누르면 조회 파일과 요약을 볼 수 있습니다"),
        ),
        themeBoxExpanded
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "section-toolbar themes-compact-toolbar" },
                h("div", { className: "summary-help" }, "\uc870\ud68c \ud30c\uc77c \ub0a0\uc9dc"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mini-button",
                    onClick: buildTodayThemeExcel,
                    disabled: reloadingExcel,
                    title: "오늘 날짜 기준으로 데이터를 계산하고 SQL과 화면 캐시를 함께 갱신합니다.",
                  },
                  reloadingExcel ? "오늘자 데이터 생성 중..." : "오늘자 데이터 로드"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mini-button",
                    onClick: reloadThemeExcel,
                    disabled: reloadingExcel,
                    title: "SQL에 저장된 최신 데이터를 기준으로 현재 화면만 다시 불러옵니다.",
                  },
                  reloadingExcel ? "데이터 로드 중..." : "데이터 직접 로드"
                ),
                reloadingExcel
                  ? h(
                      "div",
                      { className: "summary-help" },
                      "진행중: 1) 오늘자 데이터 계산  2) SQL/캐시 갱신  3) 화면 재로드 (" + numberFormat(reloadElapsedSec, 0) + "초)"
                    )
                  : null,
                reloadMessage ? h("div", { className: "summary-help" }, reloadMessage) : null
              ),
              h(
                "div",
                { className: "theme-file-calendar" },
                h(
                  "div",
                  { className: "theme-file-calendar-head" },
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, -1)); },
                  }, "\uc774\uc804\ub2ec"),
                  h("strong", null, monthLabel(datePickerMonth)),
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, 1)); },
                  }, "\ub2e4\uc74c\ub2ec")
                ),
                h(
                  "div",
                  { className: "theme-file-calendar-weekdays" },
                  ["\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08"].map(function (day) {
                    return h("span", { key: day }, day);
                  })
                ),
                h(
                  "div",
                  { className: "theme-file-calendar-grid" },
                  datePickerCells.map(function (cell) {
                    const file = availableDateMap[cell.date];
                    const isSelected = selectedDateValue === cell.date;
                    const top50AvgScore = Number(calendarDayScoreMap[cell.date]);
                    return h(
                      "button",
                      {
                        key: cell.date,
                        type: "button",
                        className:
                          "theme-file-calendar-day" +
                          (cell.inMonth ? "" : " muted") +
                          (file ? " has-file" : "") +
                          (isSelected ? " active" : ""),
                        disabled: !file,
                        title: file ? cell.date + " · " + file.file_name : cell.date + " 엑셀 파일 없음",
                        onClick: function () { selectFileDate(cell.date); },
                      },
                      h("span", { className: "theme-file-calendar-number" }, cell.day),
                      Number.isFinite(top50AvgScore)
                        ? h("span", { className: "theme-file-calendar-score", title: calendarScoreBasis === "score_o" ? "Top10 당일점수 평균" : "Top10 종합점수 평균" }, numberFormat(top50AvgScore, 1))
                        : null,
                      file ? h("span", { className: "theme-file-calendar-dot" }) : null
                    );
                  })
                ),
                h("div", { className: "summary-help" }, selectedDateValue ? "\uc120\ud0dd\ub41c \ub0a0\uc9dc: " + selectedDateValue : "\ub0a0\uc9dc\ub97c \uc120\ud0dd\ud574 \uc8fc\uc138\uc694.")
              ),
              h(
                "div",
                { className: "summary-grid themes-compact-summary" },
                h(SummaryCard, { label: "기준 파일", value: themes.file_name || "-", help: themes.file_date || "" }),
                h(SummaryCard, { label: "시총 2000억 이상", value: numberFormat(themes.qualified_count, 0) + "개", help: "점수와 관계없이 표시" }),
                h(SummaryCard, { label: "지정된 섹터", value: numberFormat(sectorSummary.length, 0) + "개", help: "직접 입력 기준" })
              )
            )
          : null
      ),
      h(
        "div",
        { className: "panel", ref: manualSummaryRef },
        h(
          "div",
          { className: "section-toolbar" },
          h(SectionTitle, null, "수동 섹터 요약"),
          h(
            "div",
            { className: "toggle-group", "data-capture-ignore": "true" },
            h("button", {
              className: "mini-button capture-button",
              onClick: copyManualSummaryToClipboard,
              disabled: manualSummaryCopyState.status === "working",
            }, manualSummaryCopyState.status === "working" ? "복사 중..." : "캡쳐 복사")
          )
        ),
        manualSummaryCopyState.message
          ? h("div", { className: "summary-help" + (manualSummaryCopyState.status === "error" ? " text-danger" : ""), "data-capture-ignore": "true" }, manualSummaryCopyState.message)
          : null,
        sectorSummary.length
          ? h(
              "div",
              { className: "manual-theme-strip" },
              [
                h(
                  "button",
                  {
                    key: "all",
                    type: "button",
                    className: "theme-sector-chip" + (sectorFilter === "all" ? " active" : ""),
                    onClick: function () { setSectorFilter("all"); },
                  },
                  h("span", { className: "theme-sector-dot", style: { background: "#64748b" } }),
                  h("span", { className: "theme-sector-chip-name" }, "전체"),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(rows.length, 0) + "개")
                )
              ].concat(sectorSummary.map(function (item) {
                const color = colorForKey(item.sector);
                return h(
                  "button",
                  {
                    key: item.sector,
                    type: "button",
                    className: "theme-sector-chip" + (sectorFilter === item.sector ? " active" : ""),
                    title: "3개월 평균 점수가 높은 순으로 모인 대표 종목: " + item.leaders.join(", "),
                    onClick: function () { openSectorMarketCapChart(item.sector); },
                  },
                  h("span", { className: "theme-sector-dot", style: { background: color } }),
                  h("span", { className: "theme-sector-chip-name" }, item.sector),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(item.count, 0) + "개 · " + numberFormat(item.avg_score, 1))
                );
              }))
            )
          : EmptyState({ message: "섹터를 입력하면 평균 점수와 대표 종목이 여기에 모입니다." })
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h(SectionTitle, null, "종목 추세 순위"),
          h(
            "div",
            { className: "toggle-group" },
            h("div", { className: "summary-help" }, sectorFilter === "all" ? "전체 표시" : "선택 섹터: " + sectorFilter),
            h("button", {
              className: "mini-button capture-button",
              onClick: copyScoreTableToClipboard,
              disabled: scoreTableCopyState.status === "working",
            }, scoreTableCopyState.status === "working" ? "캡쳐 복사 중..." : captureButtonLabel)
          )
        ),
        scoreTableCopyState.message
          ? h("div", { className: "summary-help" + (scoreTableCopyState.status === "error" ? " text-danger" : "") }, scoreTableCopyState.message)
          : null,
        noteSaveState.message
          ? h("div", { className: "summary-help" + (noteSaveState.status === "error" ? " text-danger" : "") }, noteSaveState.message)
          : null,
        h(
          "form",
          { className: "theme-stock-search-bar", onSubmit: submitStockSearch },
          h(
            "div",
            { className: "theme-stock-search-wrap" },
            h("input", {
              type: "search",
              value: stockSearchText,
              onFocus: function (event) {
                selectTextOnFocus(event);
                setStockSearchOpen(true);
              },
              onBlur: function () {
                setTimeout(function () { setStockSearchOpen(false); }, 120);
              },
              onKeyDown: handleStockSearchKeyDown,
              onChange: function (event) {
                setStockSearchText(event.target.value);
                setStockSearchActiveIndex(0);
                setStockSearchOpen(true);
                if (stockSearchMessage) {
                  setStockSearchMessage("");
                }
              },
              placeholder: "종목명 또는 종목코드 검색",
              "aria-label": "종목 추세 순위 종목 검색 입력",
            }),
            stockSearchOpen && stockSearchSuggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list inline theme-stock-search-suggestions" },
                  stockSearchSuggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: buildStockSearchKey(item) + ":" + index,
                        type: "button",
                        className: "autocomplete-item" + (index === stockSearchActiveIndex ? " active" : ""),
                        onMouseDown: function (event) { event.preventDefault(); },
                        onMouseEnter: function () { setStockSearchActiveIndex(index); },
                        onClick: function () { chooseStockSearchRow(item); },
                      },
                      h("strong", null, item.stock_name || "-"),
                      h("span", null, [item.stock_code, item.industry, item.rank ? numberFormat(item.rank, 0) + "위" : ""].filter(Boolean).join(" · "))
                    );
                  })
                )
              : null
          ),
          h("button", { type: "submit", className: "mini-button" }, "검색"),
          stockSearchMessage ? h("span", { className: "summary-help" }, stockSearchMessage) : null
        ),
        visibleRows.length
          ? h(
              "div",
              {
                className: "table-wrap theme-table-virtual-wrap",
                ref: themeTableScrollRef,
                onScroll: handleThemeTableScroll,
                style: { maxHeight: themeTableViewportHeight + "px" },
              },
              h(
                "table",
                { key: "theme-edit-table-" + (themes.file_date || selectedDateValue || ""), className: "data-table compact theme-edit-table" },
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    themeTableHeaderColumns.map(function (column) {
                      const active = themeTableSortState.key === column.key;
                      return h(
                        "th",
                        { key: column.key },
                        h(
                          "button",
                          {
                            type: "button",
                            className: "table-sort-button" + (active ? " active" : ""),
                            onClick: function () { toggleThemeTableSort(column.key); },
                          },
                          column.label,
                          active ? h("span", null, themeTableSortState.direction === "desc" ? " ?" : " ?") : null
                        )
                      );
                    })
                  )
                ),
                h(
                  "tbody",
                  null,
                  [
                    themeTableTopSpacer
                      ? h("tr", { key: "top-spacer", className: "virtual-spacer-row", "aria-hidden": "true" }, h("td", { colSpan: 10, style: { height: themeTableTopSpacer + "px", padding: 0, border: 0 } }))
                      : null,
                  ].concat(renderedVisibleRows.map(function (row, rowIndex) {
                    const sector = String(row.manual_sector || "").trim();
                    const color = sector ? colorForKey(sector) : "#d7dee8";
                    const stockKey = buildStockSearchKey(row);
                    return h(
                      "tr",
                      {
                        key: stockKey,
                        ref: function (element) {
                          if (element) {
                            stockRowRefs.current[stockKey] = element;
                          } else {
                            delete stockRowRefs.current[stockKey];
                          }
                        },
                        "data-stock-search-key": stockKey,
                        className: highlightedStockKey === stockKey ? "stock-search-highlight" : "",
                      },
                      h("td", null, renderRankCell(row, themeTableStartIndex + rowIndex + 1)),
                      h(
                        "td",
                        { className: "theme-sector-cell", style: { borderLeft: "4px solid " + color } },
                        h(
                          "div",
                          {
                            className: "theme-sector-cell-inner",
                            style: { background: sector ? color + "22" : "#f8fafc" },
                            title: "",
                          },
                          h(ThemeSectorInput, {
                            value: row.manual_sector || "",
                            options: sectorOptions,
                            onCommit: function (value) { commitStockSector(row, value); },
                          })
                        )
                      ),
                      h("td", null, renderStockNameWithCode(row)),
                      h("td", null, renderNumberCell(row.sortino_norm, 4)),
                      h("td", null, renderNumberCell(row.score_o, 2)),
                      h("td", null, renderNumberCell(row.market_cap_100m, 0)),
                      h("td", null, renderNumberCell(row.trading_value_100m, 0)),
                      h("td", null, renderSignedPercent(row.change_pct)),
                      h("td", null, renderTodayScore(row.score, row)),
                      h("td", { className: "theme-note-cell" }, h(ThemeNoteInput, {
                        value: row.note || "",
                        onCommit: function (value) { return commitStockNote(row, value); },
                      }))
                    );
                  })).concat([
                    themeTableBottomSpacer
                      ? h("tr", { key: "bottom-spacer", className: "virtual-spacer-row", "aria-hidden": "true" }, h("td", { colSpan: 10, style: { height: themeTableBottomSpacer + "px", padding: 0, border: 0 } }))
                      : null,
                  ])
                )
              )
            )
          : EmptyState({ message: "선택한 섹터에 해당하는 종목이 없습니다." })
      ),
      captureStageReady ? h(
        "div",
        { className: "capture-hidden-stage" },
        h(
          "div",
          { className: "theme-score-capture-bundle", ref: scoreTableCaptureRef },
          h(
            "div",
            { className: "panel theme-score-capture-panel" },
            h(SectionTitle, null, captureTitle),
            h(
              "div",
              { className: "summary-help" },
              [
                themes.file_date || selectedDateValue || "",
                sectorFilter === "all" ? "전체 섹터" : "선택 섹터: " + sectorFilter,
                captureSummaryLabel,
                numberFormat(scoreCaptureRows.length, 0) + "개",
              ].filter(Boolean).join(" · ")
            ),
            scoreCaptureRows.length
              ? h(
                  "table",
                  { className: "data-table compact theme-edit-table theme-capture-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "순위"),
                      h("th", null, "섹터"),
                      h("th", null, "종목"),
                      h("th", null, "Sortino"),
                      h("th", null, "당일점수"),
                      h("th", null, "등락률"),
                      h("th", null, "종합점수"),
                      h("th", null, "비고")
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    scoreCaptureRows.map(function (row) {
                      const sector = String(row.manual_sector || "").trim();
                      const color = sector ? colorForKey(sector) : "#d7dee8";
                      const captureRow = Object.assign({}, row, { __capture_plain: true });
                      return h(
                        "tr",
                        { key: "capture-" + row.stock_name },
                        h("td", null, renderRankCell(row)),
                        h("td", { className: "theme-sector-cell", style: { borderLeft: "4px solid " + color } }, sector || "-"),
                        h("td", null, renderStockNameWithCode(captureRow)),
                        h("td", null, renderNumberCell(row.sortino_norm, 4)),
                        h("td", null, renderNumberCell(row.score_o, 2)),
                        h("td", null, renderSignedPercent(row.change_pct)),
                        h("td", null, renderTodayScore(row.score)),
                        h("td", null, row.note || "-")
                      );
                    })
                  )
                )
              : EmptyState({ message: captureEmptyMessage, compact: true })
          )
        )
      ) : null
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
        h("h1", { className: "page-title" }, "\uCD94\uAC00 \uC608\uC815 \uD398\uC774\uC9C0"),
        h("p", { className: "page-copy compact-copy" }, "\uD544\uC694\uD55C \uD398\uC774\uC9C0\uB97C \uCD94\uAC00\uB85C \uC5F0\uACB0\uD560 \uC218 \uC788\uB3C4\uB85D \uBE44\uC6CC\uB454 \uACF5\uAC04\uC785\uB2C8\uB2E4.")
      )
    );
  }

  const MemoThemesPageV2 = React.memo(ThemesPageV2);

  function InternationalThemesBoardPage(config) {
    const [selectedFileDate, setSelectedFileDate] = useState("");
    const [sectorFilter, setSectorFilter] = useState("all");
    const [selectedRegion, setSelectedRegion] = useState(function () {
      const options = ensureArray(config.regionOptions);
      return options.length ? String(options[0].code || "all") : "all";
    });
    const [calendarMode, setCalendarMode] = useState("week");
    const [themeBoxExpanded, setThemeBoxExpanded] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [reloadMessage, setReloadMessage] = useState("");
    const [themeTableSortState, setThemeTableSortState] = useState({ key: "score", direction: "desc" });
    const [chartPopup, setChartPopup] = useState({ open: false, row: null, loading: false, error: "", data: null });
    const [datePickerMonth, setDatePickerMonth] = useState(function () {
      const today = new Date();
      return today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
    });
    const baseThemesParams = ["min_score=0", "recent_limit=20"];
    if (selectedFileDate) {
      baseThemesParams.push("file_date=" + encodeURIComponent(selectedFileDate));
    }
    if (selectedRegion && ensureArray(config.regionOptions).length) {
      baseThemesParams.push("region=" + encodeURIComponent(selectedRegion));
    }
    const themesUrl = config.themesTodayUrl + "?" + baseThemesParams.join("&");
    const themesRequest = useFetchJson(themesUrl);
    const baseCalendarParams = ["min_score=0", "limit=60"];
    if (selectedRegion && ensureArray(config.regionOptions).length) {
      baseCalendarParams.push("region=" + encodeURIComponent(selectedRegion));
    }
    const calendarRequest = useFetchJson(config.calendarUrl + "?" + baseCalendarParams.join("&"));

    useEffect(function () {
        emitWindowTitleDetail(config.pageKey, selectedFileDate || "전체");
    }, [selectedFileDate]);

    useEffect(function () {
      if (!themesRequest.data || !themesRequest.data.file_date) {
        return;
      }
      if (!selectedFileDate || themesRequest.data.fallback_reason === "requested_file_missing") {
        setSelectedFileDate(themesRequest.data.file_date);
      }
    }, [selectedFileDate, themesRequest.data]);

    useEffect(function () {
      if (selectedFileDate) {
        setDatePickerMonth(String(selectedFileDate).slice(0, 7));
      }
    }, [selectedFileDate]);

    useEffect(function () {
      setSectorFilter("all");
    }, [selectedRegion]);

    if (themesRequest.loading && !themesRequest.data) {
      return LoadingPanel({ label: themesRequest.label });
    }
    if (themesRequest.error) {
      return ErrorPanel({ message: themesRequest.error });
    }

    const themes = themesRequest.data || {};
    const calendar = calendarRequest.data || {};
    const availableFiles = ensureArray(themes.available_files);
    const availableDateMap = {};
    availableFiles.forEach(function (item) {
      if (item.file_date) {
        availableDateMap[item.file_date] = item;
      }
    });
    const datePickerCells = buildBusinessMonthCells(datePickerMonth);
    const sortedCalendarDays = ensureArray(calendar.days).slice().sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });
    const calendarDayScoreMap = {};
    sortedCalendarDays.forEach(function (day) {
      const key = String(day.date || "");
      if (!key) return;
      const score = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
      if (Number.isFinite(score)) {
        calendarDayScoreMap[key] = score;
      }
    });
    const anchorDate = selectedFileDate || themes.file_date || "";
    const visibleCalendarDays = filterCalendarDays(sortedCalendarDays, anchorDate, calendarMode);
    const calendarTopSectors = getCalendarTopSectors(visibleCalendarDays, 5);
    const rows = ensureArray(themes.qualified_stocks);
    const sectorSummary = [];
    const sectorMap = {};
    rows.forEach(function (row) {
      const sector = String(row.manual_sector || row.theme || "Other").trim() || "Other";
      if (!sectorMap[sector]) {
        sectorMap[sector] = { sector: sector, count: 0, scoreTotal: 0, leaders: [] };
        sectorSummary.push(sectorMap[sector]);
      }
      sectorMap[sector].count += 1;
      sectorMap[sector].scoreTotal += Number(row.score || 0);
      if (sectorMap[sector].leaders.length < 4) {
        sectorMap[sector].leaders.push(row.stock_name || row.stock_code || "-");
      }
    });
    sectorSummary.forEach(function (item) {
      item.avg_score = item.count ? item.scoreTotal / item.count : 0;
    });
    sectorSummary.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return Number(b.avg_score || 0) - Number(a.avg_score || 0);
    });
    const visibleRows = sectorFilter === "all"
      ? rows
      : rows.filter(function (row) { return String(row.manual_sector || row.theme || "").trim() === sectorFilter; });
    const sortColumns = {
      rank: function (row) { return Number(row.rank || 0); },
      sector: function (row) { return String(row.manual_sector || row.theme || ""); },
      stock_code: function (row) { return String(row.stock_code || ""); },
      stock_name: function (row) { return String(row.stock_name || row.stock_code || ""); },
      sortino_norm: function (row) { return Number(row.sortino_norm || 0); },
      score_o: function (row) { return Number(row.score_o || 0); },
      score: function (row) { return Number(row.score || 0); },
      change_pct: function (row) { return Number(row.change_pct || 0); },
      market_cap_100m: function (row) { return Number(row.market_cap_usd || 0) || Number(row.market_cap_100m || 0); },
      trading_value_100m: function (row) { return Number(row.trading_value_usd || 0) || Number(row.trading_value_100m || 0); },
      industry: function (row) { return String(row.industry || ""); },
      note: function (row) { return String(row.note || ""); },
    };
    const sortedVisibleRows = visibleRows.slice().sort(function (left, right) {
      const sortKey = themeTableSortState.key || "score";
      const valueFactory = sortColumns[sortKey] || sortColumns.score;
      const leftValue = valueFactory(left);
      const rightValue = valueFactory(right);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      var result = 0;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        result = leftNumber - rightNumber;
      } else {
        result = String(leftValue || "").localeCompare(String(rightValue || ""), "en");
      }
      if (result === 0) {
        result = Number(left.rank || 0) - Number(right.rank || 0);
      }
      return themeTableSortState.direction === "asc" ? result : -result;
    });
    const showMarketColumn = config.showMarketColumn !== false;
    const showTickerColumn = !!config.showTickerColumn;

    function toggleTableSort(sortKey) {
      setThemeTableSortState(function (current) {
        if (current && current.key === sortKey) {
          return { key: sortKey, direction: current.direction === "desc" ? "asc" : "desc" };
        }
        return { key: sortKey, direction: sortKey === "stock_name" || sortKey === "sector" || sortKey === "industry" || sortKey === "note" ? "asc" : "desc" };
      });
    }

    function invalidateOwnCache() {
      invalidateApiCache(function (key) {
        return key.indexOf(config.apiPrefix) === 0 || key.indexOf(config.calendarUrl) === 0;
      });
    }

    function refreshThemeData() {
      setReloading(true);
      setReloadMessage("");
      postJson(config.reloadUrl, {
        file_date: selectedFileDate || null,
        min_score: 0,
        recent_limit: 20,
        reload_all: false,
        region: selectedRegion,
      }).then(function (payload) {
        invalidateOwnCache();
        setReloadMessage("데이터를 다시 불러왔습니다: " + ((payload && payload.file_date) || ""));
      }).catch(function (error) {
        setReloadMessage("데이터 새로고침 실패: " + (error.message || String(error)));
      }).finally(function () {
        setReloading(false);
      });
    }

    function buildTodayData() {
      setReloading(true);
      setReloadMessage("");
      postJson(config.buildTodayUrl, { min_score: 0, recent_limit: 20, region: selectedRegion })
        .then(function (payload) {
          invalidateOwnCache();
          if (payload && payload.file_date) {
            setSelectedFileDate(payload.file_date);
          }
          setReloadMessage(((payload && payload.today_excel_build && payload.today_excel_build.date) || "") + " 데이터 생성/로드 완료");
        })
        .catch(function (error) {
          setReloadMessage("오늘자 데이터 생성 결과 반영 실패: " + (error.message || String(error)));
        })
        .finally(function () {
          setReloading(false);
        });
    }

    function openChart(row) {
      setChartPopup({ open: true, row: row, loading: true, error: "", data: null });
      const params = new URLSearchParams();
      if (row.stock_code) params.set("code", row.stock_code);
      if (row.stock_name) params.set("name", row.stock_name);
      params.set("months", "3");
      fetchJson("/api/stocks/chart-preview?" + params.toString())
        .then(function (payload) {
          setChartPopup({ open: true, row: row, loading: false, error: "", data: payload });
        })
        .catch(function (error) {
          setChartPopup({ open: true, row: row, loading: false, error: error.message || String(error), data: null });
        });
    }

    function selectCalendarDate(date, sector) {
      if (!date) return;
      setSelectedFileDate(date);
      setSectorFilter(sector || "all");
    }

    function selectFileDate(date) {
      if (!date || !availableDateMap[date]) {
        return;
      }
      setSelectedFileDate(date);
      setSectorFilter("all");
    }

    function renderNumberCell(value, digits) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return numberFormat(number, digits == null ? 2 : digits);
    }

    function renderCompactUsdCell(absoluteUsdValue, fallbackHundredMillionValue) {
      const direct = Number(absoluteUsdValue);
      if (Number.isFinite(direct) && direct > 0) {
        return formatUsdCompact(direct, 1);
      }
      return formatUsdCompactFromHundredMillion(fallbackHundredMillionValue, 1);
    }

    function columnWidthStyle(key) {
      const widthMap = {
        rank: 46,
        sector: 124,
        stock_code: 88,
        stock_name: 188,
        sortino_norm: 86,
        score_o: 96,
        score: 96,
        change_pct: 88,
        market_cap_100m: 102,
        trading_value_100m: 102,
        industry: 176,
      };
      const width = widthMap[key];
      if (!width) {
        return null;
      }
      return { width: width + "px", minWidth: width + "px", maxWidth: width + "px" };
    }

    function renderSignedPercent(value) {
      const number = Number(value);
      let className = "metric-flat";
      if (number > 0) className = "metric-up";
      else if (number < 0) className = "metric-down";
      return h("span", { className: className }, formatPercent(number, 2));
    }

    function renderNameCell(row) {
      return h(
        "button",
        {
          type: "button",
          className: "tradingview-stock-link inline-button",
          title: row.stock_name || row.stock_code || "-",
          onClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            openChart(row);
          },
        },
        row.stock_name || row.stock_code || "-"
      );
    }

    function renderChartPopup() {
      if (!chartPopup.open) {
        return null;
      }
      const row = chartPopup.row || {};
      const label = row.stock_name || row.stock_code || "종목";
      return h(
        "div",
        { className: "modal-backdrop theme-stock-chart-backdrop", onClick: function () { setChartPopup({ open: false, row: null, loading: false, error: "", data: null }); } },
        h(
          "div",
          { className: "modal-panel theme-stock-chart-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, config.chartEyebrow),
              h("h2", null, label + (row.stock_code ? " (" + row.stock_code + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: function () { setChartPopup({ open: false, row: null, loading: false, error: "", data: null }); } }, "닫기")
          ),
          h(StockChartPreview, {
            label: label,
            loading: chartPopup.loading,
            error: chartPopup.error,
            data: chartPopup.data,
          })
        )
      );
    }

    return h(
      React.Fragment,
      null,
      renderChartPopup(),
      ensureArray(config.regionOptions).length
        ? h(
            "div",
            { className: "panel", style: { padding: "16px 20px" } },
            h(
              "div",
              { className: "segmented-control", role: "tablist", "aria-label": config.regionTabTitle || "시장 선택" },
              ensureArray(config.regionOptions).map(function (option) {
                const code = String(option.code || "");
                const active = selectedRegion === code;
                return h("button", {
                  key: code,
                  type: "button",
                  className: active ? "active" : "",
                  onClick: function () { setSelectedRegion(code); },
                }, option.label || code);
              })
            )
          )
        : null,
      h(
        "div",
        { className: "panel leader-calendar-panel" },
        h("div", { className: "section-toolbar leader-calendar-head" },
          h(SectionTitle, null, config.calendarTitle),
          h(
            "div",
            { className: "toggle-group" },
            h("button", {
              className: "mini-button",
              onClick: refreshThemeData,
              disabled: reloading,
            }, reloading ? "새로고침 중..." : "흐름 새로고침"),
            h("button", {
              className: "mini-button" + (calendarMode === "month" ? " active" : ""),
              onClick: function () { setCalendarMode("month"); },
            }, "월간"),
            h("button", {
              className: "mini-button" + (calendarMode === "week" ? " active" : ""),
              onClick: function () { setCalendarMode("week"); },
            }, "주간")
          )
        ),
        calendarRequest.loading && !calendarRequest.data
          ? h(LoadingBlock, { compact: true, title: config.calendarLoadingTitle, label: calendarRequest.label })
          : calendarRequest.error
            ? h("div", { className: "notice-box error" }, calendarRequest.error)
            : h(
                "div",
                { className: "leader-timeline-wrap" },
                h(
                  "div",
                  {
                    className: "leader-timeline",
                    style: { gridTemplateColumns: "86px repeat(" + visibleCalendarDays.length + ", minmax(54px, 1fr))" },
                  },
                  [
                    h("div", { key: "corner", className: "leader-timeline-corner" }, "순위"),
                  ].concat(visibleCalendarDays.map(function (day) {
                    const isSelected = (selectedFileDate || themes.file_date || "") === day.date;
                    const top10Avg = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
                    return h("button", {
                      key: "head-" + day.date,
                      className: "leader-timeline-date" + (isSelected ? " active" : ""),
                      type: "button",
                      title: day.date,
                      onClick: function () { selectCalendarDate(day.date, "all"); },
                    }, [
                      h("span", { key: "d", className: "leader-timeline-date-label" }, formatDateLabel(day.date)),
                      h("span", { key: "a", className: "leader-timeline-date-score" }, Number.isFinite(top10Avg) ? numberFormat(top10Avg, 1) : "-"),
                    ]);
                  })).concat([0, 1, 2, 3, 4].flatMap(function (rankIndex) {
                    return [
                      h("div", { key: "rank-" + rankIndex, className: "leader-timeline-rank" }, (rankIndex + 1) + "위"),
                    ].concat(visibleCalendarDays.map(function (day, dayIndex) {
                      const linkedDay = Object.assign({}, day, {
                        prevDay: visibleCalendarDays[dayIndex - 1],
                        nextDay: visibleCalendarDays[dayIndex + 1],
                      });
                      const ranked = ensureArray(day.sectors).slice(0, 5)[rankIndex];
                      if (!ranked) {
                        return h("button", {
                          key: "empty-" + rankIndex + "-" + day.date,
                          type: "button",
                          className: "leader-timeline-cell empty-click",
                          onClick: function () { selectCalendarDate(day.date, "all"); },
                        });
                      }
                      return h(
                        "div",
                        { key: ranked.sector + "-" + rankIndex + "-" + day.date, className: "leader-timeline-cell" },
                        h(
                          "button",
                          {
                            type: "button",
                            className: calendarRankCellClass(linkedDay, rankIndex, ranked.sector),
                            style: calendarRankCellStyle(linkedDay, rankIndex, ranked.sector, colorForKey(ranked.sector)),
                            title: ranked.sector + "\n평균점수 " + numberFormat(ranked.avg_score, 1) + "\n대표주: " + ensureArray(ranked.leaders).join(", "),
                            onClick: function () { selectCalendarDate(day.date, ranked.sector); },
                          },
                          h("span", null, ranked.sector)
                        )
                      );
                    }));
                  }))
                ),
                h(
                  "div",
                  { className: "leader-timeline-legend" },
                  calendarTopSectors.map(function (sector) {
                    return h(
                      "button",
                      {
                        key: sector,
                        type: "button",
                        className: "theme-sector-chip",
                        onClick: function () { setSectorFilter(sector); },
                      },
                      h("span", { className: "theme-sector-dot", style: { background: colorForKey(sector) } }),
                      h("span", { className: "theme-sector-chip-name" }, sector)
                    );
                  })
                )
              )
      ),
      h(
        "div",
        { className: "panel hero-panel alt themes-compact-hero expanded" },
        h(
          "div",
          { className: "hero-panel-head" },
          h(
            "div",
            null,
            h("div", { className: "eyebrow" }, config.eyebrow),
            h("h1", { className: "page-title" }, config.title)
          ),
          h(
            "button",
            {
              type: "button",
              className: "mini-button",
              onClick: function () { setThemeBoxExpanded(!themeBoxExpanded); },
            },
            themeBoxExpanded ? "닫기" : "펼치기"
          )
        ),
        h("div", { className: "summary-help" }, config.copy),
        themeBoxExpanded
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "section-toolbar themes-compact-toolbar" },
                h("div", { className: "summary-help" }, "조회 파일 날짜"),
                h("button", {
                  type: "button",
                  className: "mini-button",
                  onClick: buildTodayData,
                  disabled: reloading,
                }, reloading ? "오늘자 데이터 생성 중..." : "오늘자 데이터 로드"),
                h("button", {
                  type: "button",
                  className: "mini-button",
                  onClick: refreshThemeData,
                  disabled: reloading,
                }, reloading ? "데이터 로드 중..." : "데이터 직접 로드"),
                reloadMessage ? h("div", { className: "summary-help" }, reloadMessage) : null
              ),
              h(
                "div",
                { className: "theme-file-calendar" },
                h(
                  "div",
                  { className: "theme-file-calendar-head" },
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, -1)); },
                  }, "이전달"),
                  h("strong", null, monthLabel(datePickerMonth)),
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, 1)); },
                  }, "다음달")
                ),
                h("div", { className: "theme-file-calendar-weekdays" },
                  ["월", "화", "수", "목", "금"].map(function (day) { return h("span", { key: day }, day); })
                ),
                h(
                  "div",
                  { className: "theme-file-calendar-grid" },
                  datePickerCells.map(function (cell) {
                    const file = availableDateMap[cell.date];
                    const isSelected = selectedFileDate === cell.date;
                    const top10AvgScore = Number(calendarDayScoreMap[cell.date]);
                    return h(
                      "button",
                      {
                        key: cell.date,
                        type: "button",
                        className:
                          "theme-file-calendar-day" +
                          (cell.inMonth ? "" : " muted") +
                          (file ? " has-file" : "") +
                          (isSelected ? " active" : ""),
                        disabled: !file,
                        onClick: function () { selectFileDate(cell.date); },
                      },
                      h("span", { className: "theme-file-calendar-number" }, cell.day),
                      Number.isFinite(top10AvgScore)
                        ? h("span", { className: "theme-file-calendar-score" }, numberFormat(top10AvgScore, 1))
                        : null,
                      file ? h("span", { className: "theme-file-calendar-dot" }) : null
                    );
                  })
                ),
                h("div", { className: "summary-help" }, selectedFileDate ? "선택된 날짜: " + selectedFileDate : "날짜를 선택하면 데이터를 불러옵니다.")
              ),
              h(
                "div",
                { className: "summary-grid themes-compact-summary" },
                h(SummaryCard, { label: "기준 파일", value: themes.file_name || "-", help: themes.file_date || "" }),
                h(SummaryCard, { label: "대상 종목수", value: numberFormat(themes.qualified_count, 0) + "개", help: config.universeHelp }),
                h(SummaryCard, { label: "산업군 수", value: numberFormat(sectorSummary.length, 0) + "개", help: config.groupHelp })
              )
            )
          : null
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "산업군 요약"),
        sectorSummary.length
          ? h(
              "div",
              { className: "manual-theme-strip" },
              [
                h("button", {
                  key: "all",
                  type: "button",
                  className: "theme-sector-chip" + (sectorFilter === "all" ? " active" : ""),
                  onClick: function () { setSectorFilter("all"); },
                },
                  h("span", { className: "theme-sector-dot", style: { background: "#64748b" } }),
                  h("span", { className: "theme-sector-chip-name" }, "전체"),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(rows.length, 0) + "개")
                )
              ].concat(sectorSummary.map(function (item) {
                return h("button", {
                  key: item.sector,
                  type: "button",
                  className: "theme-sector-chip" + (sectorFilter === item.sector ? " active" : ""),
                  onClick: function () { setSectorFilter(item.sector); },
                },
                  h("span", { className: "theme-sector-dot", style: { background: colorForKey(item.sector) } }),
                  h("span", { className: "theme-sector-chip-name" }, item.sector),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(item.count, 0) + "개 · " + numberFormat(item.avg_score, 1))
                );
              }))
            )
          : EmptyState({ compact: true, message: "표시할 산업군 요약이 없습니다." })
      ),
      h(
        "div",
        { className: "panel" },
        h("div", { className: "section-toolbar" },
          h(SectionTitle, null, config.tableTitle),
          h("div", { className: "summary-help" }, "행을 누르거나 종목명을 눌러 3개월 차트를 엽니다."),
        ),
        sortedVisibleRows.length
          ? h(
              "div",
              { className: "table-wrap" },
              h(
                "table",
                { className: "data-table compact theme-edit-table international-theme-table" },
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    [
                      { key: "rank", label: "순위" },
                      { key: "sector", label: "섹터" },
                      showTickerColumn ? { key: "stock_code", label: config.codeLabel || "티커" } : null,
                      { key: "stock_name", label: "종목" },
                      { key: "sortino_norm", label: "Sortino" },
                      { key: "score_o", label: "당일점수" },
                      { key: "score", label: "종합점수" },
                      { key: "change_pct", label: "등락률" },
                      { key: "market_cap_100m", label: config.marketCapLabel },
                      { key: "trading_value_100m", label: config.tradingValueLabel },
                    ].filter(Boolean).concat(showMarketColumn ? [{ key: "industry", label: config.marketColumnLabel }] : []).map(function (column) {
                      const key = column.key;
                      const label = column.label;
                      const active = themeTableSortState.key === key;
                      return h(
                        "th",
                        { key: key, className: "theme-col-" + key, style: columnWidthStyle(key) },
                        h(
                          "button",
                          {
                            type: "button",
                            className: "table-sort-button" + (active ? " active" : ""),
                            onClick: function () { toggleTableSort(key); },
                          },
                          label,
                           active ? h("span", null, themeTableSortState.direction === "desc" ? " ↓" : " ↑") : null
                        )
                      );
                    })
                  )
                ),
                h(
                  "tbody",
                  null,
                  sortedVisibleRows.map(function (row, index) {
                    const sector = String(row.manual_sector || row.theme || "").trim() || "Other";
                    const color = colorForKey(sector);
                    return h(
                      "tr",
                      { key: row.stock_code || row.stock_name || index, onClick: function () { openChart(row); } },
                      h("td", { className: "theme-col-rank rank-cell", style: columnWidthStyle("rank") }, numberFormat(index + 1, 0)),
                      h("td", { className: "theme-sector-cell theme-col-sector truncate-cell", style: Object.assign({ borderLeft: "4px solid " + color }, columnWidthStyle("sector")), title: sector }, sector),
                      showTickerColumn ? h("td", { className: "theme-col-stock_code truncate-cell", style: columnWidthStyle("stock_code"), title: row.stock_code || "-" }, row.stock_code || "-") : null,
                      h("td", { className: "theme-stock-name-cell theme-col-stock_name truncate-cell", style: columnWidthStyle("stock_name") }, renderNameCell(row)),
                      h("td", { className: "theme-col-sortino_norm numeric-cell", style: columnWidthStyle("sortino_norm") }, renderNumberCell(row.sortino_norm, 4)),
                      h("td", { className: "theme-col-score_o numeric-cell", style: columnWidthStyle("score_o") }, renderNumberCell(row.score_o, 2)),
                      h("td", { className: "theme-col-score numeric-cell", style: columnWidthStyle("score") }, renderNumberCell(row.score, 2)),
                      h("td", { className: "theme-col-change_pct numeric-cell", style: columnWidthStyle("change_pct") }, renderSignedPercent(row.change_pct)),
                      h("td", { className: "theme-col-market_cap_100m numeric-cell", style: columnWidthStyle("market_cap_100m"), title: renderCompactUsdCell(row.market_cap_usd, row.market_cap_100m) }, renderCompactUsdCell(row.market_cap_usd, row.market_cap_100m)),
                      h("td", { className: "theme-col-trading_value_100m numeric-cell", style: columnWidthStyle("trading_value_100m"), title: renderCompactUsdCell(row.trading_value_usd, row.trading_value_100m) }, renderCompactUsdCell(row.trading_value_usd, row.trading_value_100m)),
                      showMarketColumn ? h("td", { className: "theme-col-industry truncate-cell", style: columnWidthStyle("industry"), title: row.industry || "-" }, row.industry || "-") : null
                    );
                  })
                )
              )
            )
          : EmptyState({ message: config.tableEmptyMessage })
      )
    );
  }

  function GlobalThemesPage() {
    return h(InternationalThemesBoardPage, {
      pageKey: "global-themes",
      apiPrefix: "/api/us-themes/",
      themesTodayUrl: "/api/us-themes/today",
      reloadUrl: "/api/us-themes/reload",
      buildTodayUrl: "/api/us-themes/build-today-data",
      calendarUrl: "/api/us-theme-sector-calendar",
      eyebrow: "US Daily Theme Radar",
      title: "미국 주도주",
      copy: "NASDAQ/NYSE/AMEX 기준으로 점수를 계산해 미국 시장의 강한 종목 흐름을 같은 방식으로 확인합니다.",
      universeHelp: "미국 시가총액 10억달러 이상",
      groupHelp: "대분류 Industry 기준",
      calendarTitle: "날짜별 미국 주도 섹터 흐름",
      calendarHelp: "미국 Industry 기준 상위 5개 흐름",
      calendarLoadingTitle: "미국 캘린더 불러오는 중",
      calendarEmptyMessage: "표시할 미국 주도주 데이터가 없습니다. 오늘자 데이터를 먼저 로드해 주세요.",
      tableTitle: "미국 점수 테이블",
      tableEmptyMessage: "조건에 맞는 미국 주도주 데이터가 없습니다.",
      codeLabel: "티커",
      showTickerColumn: true,
      marketColumnLabel: "거래소",
      showMarketColumn: false,
      marketCapLabel: "시총",
      tradingValueLabel: "거래대금",
      chartEyebrow: "US 3개월 주가",
    });
  }

  function AsiaThemesPage() {
    return h(InternationalThemesBoardPage, {
      pageKey: "asia-themes",
      apiPrefix: "/api/asia-themes/",
      themesTodayUrl: "/api/asia-themes/today",
      reloadUrl: "/api/asia-themes/reload",
      buildTodayUrl: "/api/asia-themes/build-today-data",
      calendarUrl: "/api/asia-theme-sector-calendar",
      eyebrow: "Asia Daily Theme Radar",
      title: "아시아 주도주",
      copy: "일본, 중국, 대만 시장을 분리해서 같은 점수 체계로 비교하고 강한 종목 흐름을 확인합니다.",
      universeHelp: "일본/중국/대만 주요 종목",
      groupHelp: "국가별 대분류 Industry 기준",
      calendarTitle: "날짜별 아시아 주도 섹터 흐름",
      calendarHelp: "선택한 시장의 Industry 기준 상위 5개 흐름",
      calendarLoadingTitle: "아시아 캘린더 불러오는 중",
      calendarEmptyMessage: "표시할 아시아 주도주 데이터가 없습니다. 오늘자 데이터를 먼저 로드해 주세요.",
      tableTitle: "아시아 점수 테이블",
      tableEmptyMessage: "조건에 맞는 아시아 주도주 데이터가 없습니다.",
      codeLabel: "티커",
      marketColumnLabel: "시장",
      marketCapLabel: "시총",
      tradingValueLabel: "거래대금",
      chartEyebrow: "Asia 3개월 주가",
      regionTabTitle: "아시아 시장 선택",
      regionOptions: [
        { code: "jp", label: "일본" },
        { code: "cn", label: "중국" },
        { code: "tw", label: "대만" }
      ],
    });
  }

  function BackgroundPreloader(props) {
    useEffect(function () {
      if (props && props.publicWeb) {
        return;
      }
      const savedThemeState = loadThemeSectorState();
      const lastFileDate = savedThemeState.lastFileDate || "";
      const urls = [
        "/api/sector-watch-board?limit_per_sector=80",
        "/api/portfolio/performance",
        "/api/themes/today?min_score=0&recent_limit=20",
        "/api/sector-db",
        "/api/theme-sector-calendar?min_score=0&limit=60",
        "/api/real-estate/building",
      ];
      if (!(props && props.publicWeb)) {
        urls.push("/api/telegram/status");
      }
      if (lastFileDate) {
        urls.push("/api/themes/today?min_score=0&recent_limit=20&file_date=" + encodeURIComponent(lastFileDate));
      }
      urls.forEach(function (url, index) {
        window.setTimeout(function () { prefetchJson(url); }, index * 180);
      });
    }, [props && props.publicWeb]);
    return null;
  }

  function GlobalLoadingDock() {
    const [requests, setRequests] = useState(getActiveApiRequests());
    const [tick, setTick] = useState(0);

    useEffect(function () {
      function syncRequests() {
        setRequests(getActiveApiRequests());
      }
      window.addEventListener("stock-api-loading-change", syncRequests);
      const timer = window.setInterval(function () {
        setTick(function (value) { return value + 1; });
        syncRequests();
      }, 1000);
      syncRequests();
      return function () {
        window.removeEventListener("stock-api-loading-change", syncRequests);
        window.clearInterval(timer);
      };
    }, []);

    if (!requests.length) {
      return null;
    }
    const firstRequest = requests[0];
    const firstSeconds = Math.max(0, Math.round((Date.now() - firstRequest.startedAt) / 1000));
    const extraCount = Math.max(0, requests.length - 1);
    return h(
      "div",
      { className: "global-loading-dock", "aria-live": "polite" },
      h("div", { className: "global-loading-title" },
        h("strong", null, "로드 중"),
        h("span", null, extraCount ? firstRequest.label + " 외 " + numberFormat(extraCount, 0) + "개" : firstRequest.label)
      ),
      h("div", { className: "loading-bar indeterminate" }, h("span", null)),
      h("em", { className: "global-loading-time" }, firstSeconds + "초")
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

  function MarketCalendarPage() {
    const todayMonth = new Date().toISOString().slice(0, 7);
    const [activeMonth, setActiveMonth] = useState(todayMonth);
    const [form, setForm] = useState({
      date: isoDateOffset(0),
      title: "",
      category: "경제지표",
      market: "US",
      time: "",
      importance: "medium",
      note: "",
    });
    const [autoReloading, setAutoReloading] = useState(false);
    const cells = buildMonthCells(activeMonth);
    const calendarStart = cells.length ? cells[0].date : activeMonth + "-01";
    const calendarEnd = cells.length ? cells[cells.length - 1].date : activeMonth + "-31";
    const request = useFetchJson("/api/market-calendar?start=" + encodeURIComponent(calendarStart) + "&end=" + encodeURIComponent(calendarEnd));
    const data = request.data || {};
    const auto = data.auto || {};
    const byDate = data.by_date || {};
    const allEvents = ensureArray(data.events);
    const autoErrors = ensureArray(auto.errors);
    const upcomingEvents = allEvents.filter(function (event) {
      return String(event.date || "") >= isoDateOffset(0);
    }).slice(0, 14);
    const highEvents = allEvents.filter(function (event) {
      return event.importance === "high";
    });

    function updateForm(key, value) {
      setForm(function (current) {
        return Object.assign({}, current, { [key]: value });
      });
    }

    function addEvent() {
      if (!form.date || !form.title.trim()) {
        return;
      }
      fetchJson("/api/market-calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(function () {
        setForm(function (current) {
          return Object.assign({}, current, { title: "", note: "", time: "" });
        });
        request.reload();
      }).catch(function (error) {
        alert(error.message || String(error));
      });
    }

    function reloadAutoCalendar() {
      if (autoReloading) {
        return;
      }
      setAutoReloading(true);
      fetchJson(
        "/api/market-calendar/reload?start=" + encodeURIComponent(calendarStart) + "&end=" + encodeURIComponent(calendarEnd),
        { method: "POST", noCache: true }
      ).then(function () {
        request.reload();
      }).catch(function (error) {
        alert(error.message || String(error));
      }).finally(function () {
        setAutoReloading(false);
      });
    }

    function renderEventChip(event) {
      return h(
        "div",
        {
          key: event.id || event.title,
          className: "market-calendar-event " + (event.importance === "high" ? "high" : event.importance === "low" ? "low" : "medium"),
          title: [event.title, event.time, event.note].filter(Boolean).join(" · "),
        },
        h("span", { className: "market-calendar-category" }, event.category || "기타"),
        event.url
          ? h("a", { href: event.url, target: "_blank", rel: "noreferrer" }, event.title)
          : h("strong", null, event.title),
        h("small", null, [event.market, event.time].filter(Boolean).join(" · "))
      );
    }

    function renderCalendarDay(cell) {
      const events = ensureArray(byDate[cell.date]);
      const isToday = cell.date === isoDateOffset(0);
      return h(
        "button",
        {
          key: cell.date,
          type: "button",
          className: "market-calendar-day" + (cell.inMonth ? "" : " muted") + (isToday ? " today" : "") + (events.length ? " has-events" : ""),
          onClick: function () { updateForm("date", cell.date); },
        },
        h("div", { className: "market-calendar-day-head" },
          h("strong", null, cell.day),
          events.length ? h("span", null, events.length + "개") : null
        ),
        h("div", { className: "market-calendar-day-events" }, events.slice(0, 5).map(renderEventChip)),
        events.length > 5 ? h("em", null, "+" + (events.length - 5) + " more") : null
      );
    }

    function renderSourceCard(source) {
      return h(
        "a",
        { key: source.name, className: "market-calendar-source-card", href: source.url, target: "_blank", rel: "noreferrer" },
        h("strong", null, source.name),
        h("span", null, source.type),
        h("small", null, source.note)
      );
    }

    return h(
      "div",
      { className: "page market-calendar-page" },
      h(
        "div",
        { className: "panel hero-panel market-calendar-hero" },
        h("div", null,
          h("h1", { className: "page-title" }, "증시 일정"),
          h("p", { className: "page-copy compact-copy" }, "휴장, 경제지표, 실적, ETF 상장 같은 주요 일정을 월간 캘린더로 보고 Google Calendar에 가져올 수 있게 정리합니다.")
        ),
        h("div", { className: "market-calendar-actions" },
          h("button", { type: "button", className: "secondary-button", disabled: autoReloading, onClick: reloadAutoCalendar }, autoReloading ? "자동 로드 중" : "자동 일정 새로고침"),
          h("a", { className: "secondary-button", href: "/api/market-calendar.ics" }, "ICS 다운로드"),
          h("a", { className: "secondary-button", href: "https://calendar.google.com/calendar/u/0/r/settings/export", target: "_blank", rel: "noreferrer" }, "Google Calendar 가져오기")
        )
      ),
      h(
        "div",
        { className: "summary-grid-small market-calendar-summary" },
        h(SummaryCard, { label: "이번 화면 일정", value: numberFormat(allEvents.length, 0) + "개" }),
        h(SummaryCard, { label: "중요 일정", value: numberFormat(highEvents.length, 0) + "개" }),
        h(SummaryCard, { label: "다음 일정", value: upcomingEvents.length ? formatDateLabel(upcomingEvents[0].date) : "-", help: upcomingEvents.length ? upcomingEvents[0].title : "예정 없음" }),
        h(SummaryCard, { label: "자동 일정", value: numberFormat(auto.event_count, 0) + "개", help: auto.updated_at ? "최근 로드 " + auto.updated_at : "KIND/Investing.com 자동 로드" }),
        h(SummaryCard, { label: "국내 필터", value: "2000억+", help: "KIND 국내 기업 공시는 시가총액 2000억원 이상만 표시" })
      ),
      autoErrors.length
        ? h("div", { className: "notice-box warning" }, "자동 일정 일부를 불러오지 못했습니다: " + autoErrors.join(" / "))
        : null,
      h(
        "div",
        { className: "panel market-calendar-panel" },
        h("div", { className: "market-calendar-toolbar" },
          h("button", { type: "button", className: "calendar-arrow", onClick: function () { setActiveMonth(shiftMonth(activeMonth, -1)); } }, "?"),
          h("strong", null, monthLabel(activeMonth)),
          h("button", { type: "button", className: "calendar-arrow", onClick: function () { setActiveMonth(shiftMonth(activeMonth, 1)); } }, "?"),
          h("button", { type: "button", className: "secondary-button compact", onClick: function () { setActiveMonth(todayMonth); } }, "이번달")
        ),
        request.loading && !allEvents.length
          ? h(LoadingPanel, { label: request.label })
          : request.error
            ? h(ErrorPanel, { message: request.error, onRetry: request.reload })
            : h(React.Fragment, null,
                h("div", { className: "market-calendar-weekdays" }, ["월", "화", "수", "목", "금", "토", "일"].map(function (day) { return h("span", { key: day }, day); })),
                h("div", { className: "market-calendar-grid" }, cells.map(renderCalendarDay))
              )
      ),
      h(
        "div",
        { className: "market-calendar-bottom-grid" },
        h(
          "div",
          { className: "panel market-calendar-form-panel" },
              h(SectionTitle, null, "지표별 위치"),
          h("div", { className: "market-calendar-form-grid" },
            h("label", null, h("span", null, "날짜"), h("input", { className: "text-input", type: "date", value: form.date, onChange: function (event) { updateForm("date", event.target.value); } })),
            h("label", null, h("span", null, "시장"), h("select", { className: "select-input", value: form.market, onChange: function (event) { updateForm("market", event.target.value); } }, ["KR", "US", "CN", "JP", "EU", "Global"].map(function (value) { return h("option", { key: value, value: value }, value); }))),
            h("label", null, h("span", null, "분류"), h("select", { className: "select-input", value: form.category, onChange: function (event) { updateForm("category", event.target.value); } }, ["경제지표", "실적", "휴장", "중앙은행", "상장/ETF", "정책", "기타"].map(function (value) { return h("option", { key: value, value: value }, value); }))),
            h("label", null, h("span", null, "중요도"), h("select", { className: "select-input", value: form.importance, onChange: function (event) { updateForm("importance", event.target.value); } }, [
              h("option", { value: "high" }, "높음"),
              h("option", { value: "medium" }, "보통"),
              h("option", { value: "low" }, "낮음"),
            ])),
            h("label", { className: "wide" }, h("span", null, "제목"), h("input", { className: "text-input", value: form.title, placeholder: "예: 미국 CPI, 엔비디아 실적(장후)", onChange: function (event) { updateForm("title", event.target.value); } })),
            h("label", null, h("span", null, "시간/구분"), h("input", { className: "text-input", value: form.time, placeholder: "장후, 21:30 등", onChange: function (event) { updateForm("time", event.target.value); } })),
            h("label", { className: "wide" }, h("span", null, "메모"), h("input", { className: "text-input", value: form.note, onChange: function (event) { updateForm("note", event.target.value); } })),
            h("button", { type: "button", className: "primary-button", onClick: addEvent }, "일정 추가")
          )
        ),
        h(
          "div",
          { className: "panel market-calendar-side-panel" },
              h(SectionTitle, null, "지표별 위치"),
          upcomingEvents.length
            ? h("div", { className: "market-calendar-upcoming-list" }, upcomingEvents.map(function (event) {
                return h("div", { key: event.id, className: "market-calendar-upcoming-item" },
                  h("span", null, formatDateLabel(event.date)),
                  h("strong", null, event.title),
                  h("small", null, [event.category, event.market, event.time].filter(Boolean).join(" · "))
                );
              }))
            : h(EmptyState, { compact: true, message: "다가오는 일정이 없습니다." })
        )
      ),
      h(
        "div",
        { className: "panel market-calendar-source-panel" },
        h("div", { className: "section-toolbar compact" },
              h(SectionTitle, null, "지표별 위치"),
          h("span", { className: "summary-help" }, "국내 기업 일정은 KIND 공시, 해외 주요 이벤트는 Investing.com 경제 캘린더를 사용합니다.")
        ),
        h("div", { className: "market-calendar-source-grid" }, ensureArray(data.sources).map(renderSourceCard))
      )
    );
  }

  function App() {
    const [page, setPage] = useState(function () {
      const sharedMode = new URLSearchParams(window.location.search || "").get("shared") === "1";
      const savedPage = sharedMode ? "themes" : (localStorage.getItem(LAST_PAGE_KEY) || "portfolio");
      return ["portfolio", "themes", "global-themes", "asia-themes", "telegram", "global-company", "sector-entry", "sector-snapshot", "next"].indexOf(savedPage) >= 0
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
      { key: "portfolio", label: "鍮꾩쨷 諛깊뀒?ㅽ듃" },
      { key: "themes", label: "오늘의 주도주" },
      { key: "telegram", label: "?붾젅洹몃옩 寃?됯린" },
      { key: "next", label: "異붽? ?덉젙 ?섏씠吏" },
    ];

    const tabLabels = {
      portfolio: "鍮꾩쨷 諛깊뀒?ㅽ듃",
      themes: "오늘의 주도주",
      telegram: "?붾젅洹몃옩 寃?됯린",
    "sector-snapshot": "섹터 비교 테이블",
      next: "異붽? ?덉젙 ?섏씠吏",
    };

    let content = null;
    if (page === "portfolio") {
      content = h(PortfolioPage);
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
        setMessage("추가할 입출금 금액을 입력해주세요.");
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
      { key: "sector", label: "?뱁꽣" },
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
      { key: "current_price", label: "?꾩옱媛", render: function (row) { return metricSpan(row.current_price, "price"); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "foreigner_net_k", label: "\uc678\uad6d\uc778", render: function (row) { return numberFormat(row.foreigner_net_k, 1); } },
      { key: "institution_net_k", label: "湲곌?", render: function (row) { return numberFormat(row.institution_net_k, 1); } },
      { key: "foreigner_pct", label: "\uc678\uad6d\uc778(%)", render: function (row) { return metricSpan(row.foreigner_pct, "percent"); } },
      { key: "institution_pct", label: "湲곌?(%)", render: function (row) { return metricSpan(row.institution_pct, "percent"); } },
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
              h(SummaryCard, { label: "誘몄닔吏?醫낅ぉ", value: numberFormat(preview.summary ? preview.summary.error_count : 0, 0) })
            )
          : null,
        h(
          "div",
          { className: "form-actions section-actions" },
          h("button", { className: "mini-button", onClick: addSector }, "?뱁꽣 異붽?"),
          h("button", { className: "primary-button", onClick: runPreview, disabled: loading }, loading ? "誘몃━蹂닿린 ?앹꽦 以?.." : "誘몃━蹂닿린"),
          h("button", { className: "primary-button", onClick: runExport, disabled: exporting }, exporting ? "\ub0b4\ubcf4\ub0b4\ub294 \uc911..." : "\uc5d1\uc140 \ub0b4\ubcf4\ub0b4\uae30"),
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
              h("strong", null, "?뱁꽣 " + numberFormat(index + 1, 0)),
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
          : h("div", { className: "summary-help" }, "캘린더가 접혀 있습니다. 날짜별 입출금 기록은 펼쳐서 확인할 수 있습니다.")
            )
          );
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?뱁꽣 ?됯퇏 誘몃━蹂닿린"),
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
          h(SectionTitle, null, "상가 호실"),
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

  function TradeImportExportPage() {
    const [refreshSeq, setRefreshSeq] = useState(0);
    const [tradeRegion, setTradeRegion] = useState(function () {
      return localStorage.getItem("stock-dashboard-trade-region") || "all";
    });
    const [selectedTradeItemKey, setSelectedTradeItemKey] = useState(function () {
      return localStorage.getItem("stock-dashboard-trade-selected-item") || "ramen";
    });
    const tradeQuery = "?region=" + encodeURIComponent(tradeRegion) + "&item_key=" + encodeURIComponent(selectedTradeItemKey || "ramen") + (refreshSeq ? "&force_refresh=true&refresh=" + refreshSeq : "");
    const request = useFetchJson("/api/trade/import-export" + tradeQuery);
    const tourismRequest = useFetchJson("/api/tourism/inbound-visitors" + (refreshSeq ? "?force_refresh=true&refresh=" + refreshSeq : ""));
    const payload = request.data || {};
    const tourismPayload = tourismRequest.data || {};
    const years = ensureArray(payload.years);
    const latestYear = years.length ? Math.max.apply(null, years.map(function (year) { return Number(year) || 0; })) : new Date().getFullYear();
    const greyYearColors = ["#eeeeee", "#cfcfcf", "#9f9f9f", "#6f6f6f", "#3f3f3f"];
    const regionOptions = ensureArray(payload.region_options).length ? ensureArray(payload.region_options) : [{ code: "all", name: "전국" }];

    useEffect(function () {
      localStorage.setItem("stock-dashboard-trade-region", tradeRegion);
    }, [tradeRegion]);

    useEffect(function () {
      const items = ensureArray(payload.items);
      if (!items.length) return;
      const exists = items.some(function (item) { return item.key === selectedTradeItemKey; });
      if (!selectedTradeItemKey || !exists) {
        setSelectedTradeItemKey(items[0].key);
      }
    }, [payload.items, selectedTradeItemKey]);

    useEffect(function () {
      if (selectedTradeItemKey) {
        localStorage.setItem("stock-dashboard-trade-selected-item", selectedTradeItemKey);
      }
    }, [selectedTradeItemKey]);

    function tradeYearColor(year) {
      const numericYear = Number(year);
      if (numericYear === latestYear) {
        return "#d40000";
      }
      const olderYears = years.filter(function (item) {
        return Number(item) !== latestYear;
      });
      const index = Math.max(0, olderYears.indexOf(year));
      return greyYearColors[index % greyYearColors.length];
    }

    function maxItemValue(item) {
      let maxValue = 1;
      ensureArray(item.rows).forEach(function (row) {
        ensureArray(row.values).forEach(function (entry) {
          const value = Number(entry.value);
          if (Number.isFinite(value) && value > maxValue) {
            maxValue = value;
          }
        });
      });
      return maxValue;
    }

    function tradeDeltaLabel(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "-";
      return (number > 0 ? "+" : "") + numberFormat(number, 1) + "%";
    }

    function tradeDeltaClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "flat";
      return number > 0 ? "up" : "down";
    }

    function renderTradeItemTabs(items) {
      return h(
        "div",
        { className: "panel trade-item-tab-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null, h(SectionTitle, null, "품목 선택"), h("div", { className: "summary-help" }, "탭을 누르면 해당 품목 차트만 아래에 표시됩니다.")),
          h("div", { className: "summary-help" }, ensureArray(items).length + "개 품목")
        ),
        h(
          "div",
          { className: "trade-item-tabs", role: "tablist" },
          ensureArray(items).map(function (item) {
            const metrics = item.metrics || {};
            const active = item.key === selectedTradeItemKey;
            return h(
              "button",
              {
                key: item.key,
                type: "button",
                role: "tab",
                "aria-selected": active ? "true" : "false",
                className: "trade-item-tab" + (active ? " active" : ""),
                onClick: function () { setSelectedTradeItemKey(item.key); },
              },
              h("strong", null, item.name),
              h(
                "span",
                null,
                h("em", { className: tradeDeltaClass(metrics.qoq_pct) }, "QoQ " + tradeDeltaLabel(metrics.qoq_pct)),
                h("em", { className: tradeDeltaClass(metrics.yoy_pct) }, "YoY " + tradeDeltaLabel(metrics.yoy_pct))
              )
            );
          })
        )
      );
    }

    function renderTradeStackedBar(entry, maxValue, item) {
      const total = Number(entry && entry.value);
      const height = Number.isFinite(total) && total > 0 ? Math.max(3, total / maxValue * 100) : 0;
      return h(
        "div",
        {
          key: entry.year,
          className: "trade-stacked-bar" + (height ? "" : " empty"),
          title: entry.year + "년: " + (height ? numberFormat(total, 0) : "-") + " " + (item.unit || ""),
          style: { height: height + "%", "--trade-year-color": tradeYearColor(entry.year) },
        },
        h("span", { className: "trade-bar-fill" }),
        h("em", null, String(entry.year).slice(2))
      );
    }

    function renderChart(item) {
      const maxValue = maxItemValue(item);
      return h(
        "div",
        { key: item.key, className: "panel trade-chart-panel" },
        h(
          "div",
          { className: "trade-chart-heading" },
          h(
            "div",
            { className: "trade-chart-title-wrap" },
            h("div", null,
              h("div", { className: "trade-chart-title" }, item.name),
              ensureArray(item.companies).length
                ? h("div", { className: "trade-chart-companies" }, "(" + ensureArray(item.companies).join(", ") + ")")
                : null
            ),
            null
          )
        ),
        h(
          "div",
          { className: "trade-chart-wrap" },
          h(
            "div",
            { className: "trade-y-axis" },
            [1, 0.8, 0.6, 0.4, 0.2, 0].map(function (ratio) {
              const label = ratio === 0 ? "-" : numberFormat(maxValue * ratio, 0);
              return h("span", { key: ratio }, label);
            })
          ),
          h(
            "div",
            { className: "trade-month-grid" },
            ensureArray(item.rows).map(function (row) {
              return h(
                "div",
                { key: item.key + "-" + row.month, className: "trade-month-group" },
                h(
                  "div",
                  { className: "trade-bars" },
                  ensureArray(row.values).map(function (entry) {
                    return renderTradeStackedBar(entry, maxValue, item);
                  })
                ),
                h("div", { className: "trade-month-label" }, row.month + "월")
              );
            })
          )
        ),
        h(
          "div",
          { className: "trade-legend" },
          years.map(function (year) {
            return h("span", { key: year }, h("i", { style: { background: tradeYearColor(year) } }), String(year).slice(2) + "년");
          }),
          h("span", { className: "trade-year-note" }, "1일/11일/21일 발표 스냅샷은 수집 시점별로 DB에 저장됩니다.")
        ),
        h("div", { className: "summary-help" }, "HS " + ensureArray(item.hs_codes).join(", ") + " · 단위: " + (item.unit || "") + " · 선택 지역: " + (regionOptions.find(function (option) { return option.code === tradeRegion; }) || { name: "전국" }).name)
      );
    }

    function renderDramTrendChart(item) {
      const points = ensureArray(item.points).filter(function (point) {
        return Number.isFinite(Number(point.value));
      });
      const width = 520;
      const height = 180;
      const pad = { top: 18, right: 54, bottom: 32, left: 48 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      if (!points.length) {
        return h("div", { className: "dram-chart-empty" }, "누적된 가격 스냅샷이 없습니다.");
      }
      let minValue = Math.min.apply(null, points.map(function (point) { return Number(point.value); }));
      let maxValue = Math.max.apply(null, points.map(function (point) { return Number(point.value); }));
      if (minValue === maxValue) {
        minValue *= 0.96;
        maxValue *= 1.04;
      }
      const range = maxValue - minValue || 1;
      function x(index) {
        return pad.left + (points.length === 1 ? chartWidth : index / (points.length - 1) * chartWidth);
      }
      function y(value) {
        return pad.top + (maxValue - Number(value)) / range * chartHeight;
      }
      const linePoints = points.map(function (point, index) {
        return x(index).toFixed(1) + "," + y(point.value).toFixed(1);
      }).join(" ");
      const gridValues = [maxValue, minValue + range * 0.5, minValue];
      return h(
        "svg",
        { className: "dram-trend-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
        gridValues.map(function (value, index) {
          const lineY = y(value);
          return h(
            React.Fragment,
            { key: "grid-" + index },
            h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "dram-chart-grid" }),
            h("text", { x: width - 6, y: lineY + 4, className: "dram-chart-axis", textAnchor: "end" }, numberFormat(value, 2))
          );
        }),
        h("polyline", { points: linePoints, className: "dram-chart-line" }),
        points.map(function (point, index) {
          return h("circle", {
            key: point.date + "-" + index,
            cx: x(index),
            cy: y(point.value),
            r: 3.2,
            className: "dram-chart-dot",
          });
        }),
        h("text", { x: pad.left, y: height - 8, className: "dram-chart-axis" }, String(points[0].date || "").replace("Last Update ", "")),
        h("text", { x: width - pad.right, y: height - 8, className: "dram-chart-axis", textAnchor: "end" }, String(points[points.length - 1].date || "").replace("Last Update ", ""))
      );
    }

    function renderDramCard(item) {
      const points = ensureArray(item.points);
      const lastPoint = points.length ? points[points.length - 1] : null;
      const current = Number(lastPoint && lastPoint.value);
      const change = Number(lastPoint && lastPoint.change_pct);
      const changeClass = Number.isFinite(change) && change < 0 ? "down" : Number.isFinite(change) && change > 0 ? "up" : "";
      return h(
        "div",
        { key: item.key || item.item, className: "panel dram-price-card" },
        h(
          "div",
          { className: "dram-price-head" },
          h("div", null,
            h("strong", null, item.item || "-"),
            h("span", null, item.section_label || "DRAM Price")
          ),
          h("div", { className: "dram-current-price" }, "$" + numberFormat(current, 2))
        ),
        h(
          "div",
          { className: "dram-price-meta" },
          h("span", null, "High $" + numberFormat(lastPoint && lastPoint.session_high, 2)),
          h("span", null, "Low $" + numberFormat(lastPoint && lastPoint.session_low, 2)),
          h("span", { className: changeClass }, "Change " + (Number.isFinite(change) ? formatPercent(change, 2) : "-"))
        ),
        renderDramTrendChart(item)
      );
    }

    function renderTourismVisitorsChart(tourismData) {
      const rows = ensureArray(tourismData.rows).filter(function (row) {
        return Number.isFinite(Number(row.visitors));
      });
      if (!rows.length) {
        return h(EmptyState, { message: "표시할 인바운드 관광객 데이터가 없습니다." });
      }
      const chartYears = [];
      rows.forEach(function (row) {
        const year = Number(row.year);
        if (chartYears.indexOf(year) < 0) chartYears.push(year);
      });
      chartYears.sort(function (a, b) { return a - b; });
      const shownYears = chartYears.slice(-6);
      const latestTourismYear = shownYears.length ? shownYears[shownYears.length - 1] : new Date().getFullYear();
      const monthMap = {};
      rows.forEach(function (row) {
        const year = Number(row.year);
        const month = Number(row.month);
        if (shownYears.indexOf(year) < 0 || !month) return;
        monthMap[month] = monthMap[month] || {};
        monthMap[month][year] = row;
      });
      const maxValue = Math.max.apply(null, rows.filter(function (row) {
        return shownYears.indexOf(Number(row.year)) >= 0;
      }).map(function (row) { return Number(row.visitors) || 0; }).concat([1]));
      const width = 1040;
      const height = 360;
      const pad = { top: 30, right: 28, bottom: 58, left: 72 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      const groupWidth = chartWidth / 12;
      const barGap = 2;
      const barWidth = Math.max(4, Math.min(14, (groupWidth - 14) / Math.max(1, shownYears.length) - barGap));
      const colors = ["#eeeeee", "#cfcfcf", "#9f9f9f", "#6f6f6f", "#3f3f3f", "#dc2626"];
      function y(value) {
        return pad.top + chartHeight - (Number(value || 0) / maxValue) * chartHeight;
      }
      function yearColor(year) {
        const index = shownYears.indexOf(year);
        return year === latestTourismYear ? "#dc2626" : colors[Math.max(0, index) % (colors.length - 1)];
      }
      const gridValues = [1, 0.75, 0.5, 0.25, 0];
      const latestRow = rows[rows.length - 1] || {};
      return h(
        "div",
        { className: "panel tourism-chart-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
          h(SectionTitle, null, "상가 호실"),
            h("div", { className: "summary-help" }, (tourismData.source_label || "관광지식정보시스템") + " · " + (tourismData.fetched_at || "-"))
          ),
          h(
            "div",
            { className: "tourism-latest-pill" },
            h("strong", null, tourismData.latest_month || "-"),
            h("span", null, numberFormat(tourismData.latest_visitors, 0) + "명")
          )
        ),
        tourismData.message ? h("div", { className: "notice-box compact" }, tourismData.message) : null,
        h(
          "div",
          { className: "tourism-chart-scroll" },
          h(
            "svg",
            { className: "tourism-visitors-chart", viewBox: "0 0 " + width + " " + height, role: "img" },
            gridValues.map(function (ratio) {
              const value = maxValue * ratio;
              const lineY = y(value);
              return h(
                React.Fragment,
                { key: ratio },
                h("line", { x1: pad.left, x2: width - pad.right, y1: lineY, y2: lineY, className: "tourism-chart-grid" }),
                h("text", { x: pad.left - 8, y: lineY + 4, className: "tourism-chart-axis", textAnchor: "end" }, ratio === 0 ? "-" : numberFormat(value, 0))
              );
            }),
            Array.from({ length: 12 }, function (_, monthIndex) {
              const month = monthIndex + 1;
              const groupX = pad.left + monthIndex * groupWidth + 8;
              return h(
                React.Fragment,
                { key: "month-" + month },
                shownYears.map(function (year, yearIndex) {
                  const row = (monthMap[month] || {})[year];
                  const value = Number(row && row.visitors) || 0;
                  const barHeight = value ? Math.max(2, chartHeight - (y(value) - pad.top)) : 0;
                  const x = groupX + yearIndex * (barWidth + barGap);
                  const barY = pad.top + chartHeight - barHeight;
                  return h("rect", {
                    key: year + "-" + month,
                    x: x,
                    y: barY,
                    width: barWidth,
                    height: barHeight,
                    rx: 2,
                    fill: yearColor(year),
                  }, h("title", null, year + "년 " + month + "월: " + (value ? numberFormat(value, 0) + "명" : "-")));
                }),
                h("text", { x: groupX + groupWidth * 0.42, y: height - 22, className: "tourism-chart-axis", textAnchor: "middle" }, month + "월")
              );
            })
          )
        ),
        h(
          "div",
          { className: "trade-legend tourism-legend" },
          shownYears.map(function (year) {
            return h("span", { key: year }, h("i", { style: { background: yearColor(year) } }), String(year).slice(2) + "년");
          }),
          h("span", { className: Number(latestRow.yoy_pct) >= 0 ? "metric-up" : "metric-down" }, "최근 YoY " + (latestRow.yoy_pct == null ? "-" : tradeDeltaLabel(latestRow.yoy_pct)))
        )
      );
    }

    const tradeItems = ensureArray(payload.items);
    const selectedTradeItem = tradeItems.find(function (item) { return item.key === selectedTradeItemKey; }) || tradeItems[0];

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel trade-hero" },
        h("div", { className: "eyebrow" }, "Trade Data"),
        h("h1", { className: "page-title" }, "건물 관리"),
        h("p", { className: "page-copy compact-copy" }, "주요 품목 수출입 데이터와 인바운드 관광객 흐름을 봅니다.")
      ),
      request.loading && !payload.items ? h(LoadingPanel, { label: request.label }) : null,
      request.error ? h("div", { className: "notice-box" }, request.error) : null,
      tourismRequest.error ? h("div", { className: "notice-box" }, tourismRequest.error) : null,
      payload.message ? h("div", { className: "notice-box compact" }, payload.message) : null,
      h(
        "div",
        { className: "panel trade-summary-panel" },
          h(SectionTitle, null, "상가 호실"),
        h("div", { className: "summary-help" }, (payload.source_label || "-") + " · " + (payload.release_hint || "")),
        payload.motie_api
          ? h("div", { className: "summary-help" }, "산업부 API: " + (payload.motie_api.ok ? "연결 정상" : "확인 필요") + " · " + (payload.motie_api.message || "-"))
          : null,
        h("div", { className: "summary-help" }, "불러온 시각: " + (payload.loaded_at || "-")),
        h(
          "label",
          { className: "trade-region-picker" },
          h("span", null, "폴더: D:\\Study\\상가_관리_데이터"),
          h(
            "select",
            {
              value: tradeRegion,
              onChange: function (event) {
                setTradeRegion(event.target.value || "all");
              },
            },
            regionOptions.map(function (option) {
              return h("option", { key: option.code, value: option.code }, option.name);
            })
          )
        ),
        h("button", { className: "mini-button", onClick: function () { setRefreshSeq(Date.now()); } }, "새로고침")
      ),
      payload.region_note ? h("div", { className: "notice-box compact" }, payload.region_note) : null,
      tradeItems.length
        ? h(React.Fragment, null, renderTradeItemTabs(tradeItems), h("div", { className: "trade-chart-grid" }, selectedTradeItem ? renderChart(selectedTradeItem) : null))
        : h(EmptyState, { message: "표시할 경기순환 데이터가 없습니다." }),
      tourismRequest.loading && !ensureArray(tourismPayload.rows).length ? h(LoadingPanel, { label: tourismRequest.label }) : null,
      tourismPayload.error ? h("div", { className: "notice-box compact" }, "관광객 통계 확인 필요: " + tourismPayload.error) : null,
      renderTourismVisitorsChart(tourismPayload)
    );
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

  function EconomyCycleClockPage() {
    const [refreshSeq, setRefreshSeq] = useState(0);
    const request = useFetchJson("/api/economy/cycle-clock" + (refreshSeq ? "?force_refresh=true&refresh=" + refreshSeq : ""));
    const sectorClockRequest = useFetchJson("/api/economy/sector-cycle-clock?min_score=50&limit=50" + (refreshSeq ? "&force_refresh=true&refresh=" + refreshSeq : ""));
    const data = request.data || {};
    const sectorClockData = sectorClockRequest.data || {};
    const indicators = ensureArray(data.indicators);
    const sectorGroups = ensureArray(sectorClockData.groups);
    const categories = ensureArray(data.categories);
    const phaseCounts = data.phase_counts || {};
    const average = { x: data.average_x || 0, y: data.average_y || 0, phase: data.current_phase || "회복" };
    const phaseOrder = ["회복", "상승", "둔화", "하강"];

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel economy-cycle-hero" },
        h("div", { className: "eyebrow" }, "Business Cycle Clock"),
        h("h1", { className: "page-title" }, "건물 관리"),
        h("p", { className: "page-copy compact-copy" }, "OECD/FRED 공개 시계열을 경기순환시계 방식으로 표준화해 회복·상승·둔화·하강 위치를 확인합니다.")
      ),
      request.loading && !indicators.length ? h(LoadingPanel, { label: request.label }) : null,
      data.error ? h("div", { className: "notice-box" }, data.error) : null,
      h(
        "div",
        { className: "panel economy-cycle-summary" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null, h(SectionTitle, null, "현재 경기 위치"), h("div", { className: "summary-help" }, data.source_label || "OECD/FRED")),
          h("button", { className: "mini-button", onClick: function () { setRefreshSeq(Date.now()); } }, "새로고침")
        ),
        h(
          "div",
          { className: "summary-grid summary-grid-small" },
          h(SummaryCard, { label: "종합 국면", value: data.current_phase || "-", help: "국내 핵심 지표 평균 좌표" }),
          h(SummaryCard, { label: "다수 지표", value: data.dominant_phase || "-", help: "가장 많은 지표가 위치한 구간" }),
          h(SummaryCard, { label: "최신 기준", value: data.latest_date || "-", help: "지표별 발표 지연이 있을 수 있음" })
        ),
        h("div", { className: "economy-phase-strip" }, phaseOrder.map(function (phase) {
          return h("span", { key: phase, className: economyPhaseClass(phase) }, phase + " " + numberFormat(phaseCounts[phase] || 0, 0));
        })),
        h("div", { className: "economy-category-legend" }, categories.map(function (category) {
          const categoryClass = economyCategoryClass(category.key);
          return h(
            "span",
            { key: category.key, className: "economy-category-pill " + categoryClass, title: category.description || "" },
            h("i", null),
            category.label
          );
        })),
        h("div", { className: "notice-box compact" }, data.method_note || "")
      ),
      indicators.length
        ? h(
            "div",
            { className: "economy-cycle-layout" },
            h(
              "div",
              { className: "panel economy-clock-panel" },
          h(SectionTitle, null, "상가 호실"),
              h(EconomyCycleClock, { indicators: indicators, average: average })
            ),
            h(
              "div",
              { className: "panel economy-cycle-table-panel" },
          h(SectionTitle, null, "상가 호실"),
              h(DataTable, {
                compact: true,
                rows: indicators,
                columns: [
                  { key: "name", label: "지표" },
                  { key: "category", label: "\ubd84\ub958", render: function (row) {
                    return h("span", { className: "economy-category-pill compact " + economyCategoryClass(row.category_key) }, h("i", null), row.category || "-");
                  } },
                  { key: "phase", label: "국면", render: function (row) { return h("span", { className: "economy-phase-pill " + economyPhaseClass(row.phase) }, row.phase); } },
                  { key: "latest_date", label: "기준월" },
                  { key: "latest_value", label: "값", render: function (row) {
                    const unit = row.display_unit || "";
                    const decimals = unit === "원" ? 1 : (unit === "YoY %" || unit === "%p" ? 2 : 3);
                    const suffix = unit === "YoY %" ? "%" : (unit === "%p" ? "%p" : (unit === "원" ? "원" : ""));
                    return numberFormat(row.latest_value, decimals) + suffix;
                  } },
                  { key: "three_month_change", label: "3M 신호", render: function (row) {
                    const value = row.kind === "risk_inverse" ? row.favorable_three_month_change : row.three_month_change;
                    return h("span", { className: pnlClass(value) }, numberFormat(value, 3));
                  } },
                  { key: "stale", label: "상태", render: function (row) { return row.stale ? h("span", { className: "economy-stale" }, "지연") : "정상"; } },
                ],
              })
            )
          )
        : h(EmptyState, { message: "\uacbd\uae30\uc21c\ud658 \uc9c0\ud45c \ub370\uc774\ud130\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4." }),
      sectorGroups.length
        ? h(
            "div",
            { className: "panel economy-cycle-table-panel" },
          h(SectionTitle, null, "상가 호실"),
            h("div", { className: "summary-help" }, (sectorClockData.latest_date || "-") + " \uae30\uc900 \ub370\uc774\ud130 \u00b7 " + (sectorClockData.source_note || "")),
            h(DataTable, {
              compact: true,
              rows: sectorGroups,
              columns: [
                { key: "group", label: "\ub300\ud45c \uc139\ud130" },
                  { key: "phase", label: "국면", render: function (row) { return h("span", { className: "economy-phase-pill " + economyPhaseClass(row.phase) }, row.phase); } },
                { key: "strength", label: "\uac15\ub3c4", render: function (row) { return numberFormat(row.strength, 2); } },
                { key: "momentum", label: "\ubaa8\uba58\ud140", render: function (row) { return h("span", { className: pnlClass(row.momentum) }, numberFormat(row.momentum, 2)); } },
                { key: "details", label: "\uc138\ubd80 \uad6c\uc131", render: function (row) {
                  return ensureArray(row.details).slice(0, 4).map(function (item) {
                    return (item.detail || item.sector) + " (" + numberFormat(item.strength, 1) + ")";
                  }).join(", ");
                } },
              ],
            })
          )
        : null,
      indicators.length
        ? h(
            "div",
            { className: "economy-trend-grid" },
            indicators.map(function (indicator) {
              return h(
                "div",
                { key: indicator.key, className: "panel economy-indicator-card category-" + economyCategoryClass(indicator.category_key) },
                h("div", { className: "economy-indicator-head" },
                  h(
                    "div",
                    null,
                    h("strong", null, indicator.name),
                    h("span", { className: "economy-category-pill compact " + economyCategoryClass(indicator.category_key) }, h("i", null), indicator.category || "\ubbf8\ubd84\ub958 \uc9c0\ud45c"),
                    h("small", null, indicator.description || "")
                  ),
                  h("span", { className: "economy-phase-pill " + economyPhaseClass(indicator.phase) }, indicator.phase)
                ),
                h(EconomyCycleTrend, { indicator: indicator })
              );
            })
          )
        : null,
      ensureArray(data.errors).length
        ? h("div", { className: "notice-box compact" }, "일부 지표 확인 필요: " + ensureArray(data.errors).join(" / "))
        : null
    );
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

  function RealEstatePricePage() {
    const request = useFetchJson("/api/real-estate/prices");
    const data = request.data || {};
    const maps = ensureArray(data.maps);
    const allRegions = maps.reduce(function (items, mapInfo) {
      return items.concat(ensureArray(mapInfo.regions).map(function (region) {
        return Object.assign({ mapTitle: mapInfo.title }, region);
      }));
    }, []);
    const [selectedKey, setSelectedKey] = useState("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [tradePayload, setTradePayload] = useState(null);
    const [tradeLoading, setTradeLoading] = useState(false);
    const [tradeMessage, setTradeMessage] = useState("");
    const [housingType, setHousingType] = useState("apartment");
    const [selectedDong, setSelectedDong] = useState("");
    const selectedRegion = allRegions.find(function (region) { return region.key === selectedKey; }) || allRegions[0] || null;

    useEffect(function () {
      if (!selectedKey && allRegions.length) {
        setSelectedKey(allRegions[0].key);
      }
    }, [selectedKey, allRegions.length]);

    useEffect(function () {
      let cancelled = false;
      async function loadTradeDetail() {
        if (!popupOpen || !selectedRegion) {
          return;
        }
        setTradeLoading(true);
        setTradeMessage("");
        try {
          const payload = await fetchJson(
            "/api/real-estate/trade-detail?region_name=" +
              encodeURIComponent(selectedRegion.name || "") +
              "&full_name=" +
              encodeURIComponent(selectedRegion.full_name || selectedRegion.name || "")
          );
          if (!cancelled) {
            setTradePayload(payload);
            setTradeMessage(payload.message || "");
            const types = ensureArray(payload.housing_types);
            if (types.length && !types.some(function (item) { return item.key === housingType; })) {
              setHousingType(types[0].key);
            }
          }
        } catch (err) {
          if (!cancelled) {
            setTradePayload(null);
            setTradeMessage(err.message || String(err));
          }
        } finally {
          if (!cancelled) {
            setTradeLoading(false);
          }
        }
      }
      loadTradeDetail();
      return function () {
        cancelled = true;
      };
    }, [popupOpen, selectedRegion && selectedRegion.key]);

    function metricClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || Math.abs(number) < 0.01) {
        return "flat";
      }
      return number > 0 ? "positive" : "negative";
    }

    function openRegion(region) {
      setSelectedKey(region.key);
      setPopupOpen(true);
      setTradePayload(null);
      setTradeMessage("");
      setHousingType("apartment");
      setSelectedDong("");
    }

    function renderPreview(region) {
      return h(
        "button",
        {
          key: region.key,
          type: "button",
          className: "price-region-row" + (selectedRegion && selectedRegion.key === region.key ? " selected" : ""),
          onClick: function () { openRegion(region); },
        },
        h("span", { className: "region-name" }, region.name),
        h("span", { className: metricClass(region.wow_pct) }, "WoW " + formatPercent(region.wow_pct, 2)),
        h("span", { className: metricClass(region.yoy_pct) }, "YoY " + formatPercent(region.yoy_pct, 2))
      );
    }

    function renderMap(mapInfo) {
      const regions = ensureArray(mapInfo.regions);
      return h(
        "section",
        { key: mapInfo.key, className: "panel price-map-card" },
        h(
          "div",
          { className: "price-map-head" },
          h("div", null, h("h3", null, mapInfo.title), h("p", null, mapInfo.subtitle || "")),
          h("span", { className: "price-map-count" }, regions.length + "개 지역")
        ),
        h(
          "div",
          { className: "price-map-canvas " + mapInfo.key },
          h("div", { className: "price-map-shape", "aria-hidden": "true" }),
          h(
            "div",
            { className: "price-map-bg-labels", "aria-hidden": "true" },
            mapInfo.key === "national"
              ? [
                  h("span", { className: "label-north" }, "수도권"),
                  h("span", { className: "label-east" }, "강원·경북"),
                  h("span", { className: "label-south" }, "영남"),
                  h("span", { className: "label-west" }, "호남·충청"),
                  h("span", { className: "label-jeju" }, "제주")
                ]
              : mapInfo.key === "seoul"
                ? [
                    h("span", { className: "label-north" }, "\ubd81\ubd80"),
                    h("span", { className: "label-east" }, "\ub3d9\ubd80"),
                    h("span", { className: "label-south" }, "\ub0a8\ubd80"),
                    h("span", { className: "label-west" }, "서부")
                  ]
                : [
                    h("span", { className: "label-north" }, "\ubd81\ubd80"),
                    h("span", { className: "label-east" }, "\ub3d9\ubd80"),
                    h("span", { className: "label-south" }, "\ub0a8\ubd80"),
                    h("span", { className: "label-west" }, "서부")
                  ]
          ),
          regions.map(function (region) {
            return h(
              "button",
              {
                key: region.key,
                type: "button",
                className: "price-region-marker " + metricClass(region.yoy_pct) + (selectedRegion && selectedRegion.key === region.key ? " selected" : ""),
                style: { left: region.x + "%", top: region.y + "%" },
                title: region.name + " WoW " + formatPercent(region.wow_pct, 2) + " / YoY " + formatPercent(region.yoy_pct, 2),
                onClick: function () { openRegion(region); },
              },
              h("strong", null, region.name),
              h("small", null, formatPercent(region.yoy_pct, 1))
            );
          })
        ),
        h("div", { className: "price-region-preview" }, regions.map(renderPreview))
      );
    }

    function renderLeaderValue(item) {
      return h(
        React.Fragment,
        null,
        h("strong", { className: metricClass(item.change_pct) }, item.change_pct == null ? "-" : formatPercent(item.change_pct, 2)),
        h("span", null, "최근 " + numberFormat(item.recent_price_per_m2, 1) + "만/㎡"),
        h("span", null, "거래 " + numberFormat(item.recent_count, 0) + "건")
      );
    }

    function openNaverRealEstateComplex(item) {
      const query = [
        selectedRegion && selectedRegion.name,
        item.dong,
        item.apartment,
      ].filter(Boolean).join(" ");
      window.open("https://fin.land.naver.com/map?keyword=" + encodeURIComponent(query) + "&search-expanded=true&zoom=15", "_blank", "noopener,noreferrer");
    }

    function renderTradeDetail() {
      const payload = tradePayload || {};
      const types = ensureArray(payload.housing_types);
      const activeType = types.find(function (item) { return item.key === housingType; }) || types[0] || {};
      const dongRows = ensureArray(activeType.dong_leaders);
      const allApartmentRows = ensureArray(activeType.apartment_leaders);
      const apartmentRows = selectedDong
        ? allApartmentRows.filter(function (item) { return item.dong === selectedDong; })
        : allApartmentRows;
      if (tradeLoading && !tradePayload) {
        return h(LoadingBlock, { compact: true, title: "실거래 상세 조회 중", label: "국토부 실거래가를 동·단지별로 정리하고 있습니다." });
      }
      return h(
        "div",
        { className: "real-estate-trade-detail" },
        h(
          "div",
          { className: "housing-type-tabs" },
          (types.length ? types : [{ key: "apartment", label: "아파트" }, { key: "villa", label: "빌라·연립" }]).map(function (item) {
            return h(
              "button",
              {
                key: item.key,
                type: "button",
                className: "housing-type-tab" + (housingType === item.key ? " active" : ""),
                onClick: function () { setHousingType(item.key); },
              },
              item.label
            );
          })
        ),
        tradeMessage ? h("div", { className: "inline-help compact" }, tradeMessage) : null,
        activeType.message ? h("div", { className: "notice-box compact" }, activeType.message) : null,
        h(
          "div",
          { className: "real-estate-drilldown-grid" },
          h(
            "section",
            { className: "real-estate-drilldown-card" },
            h("h3", null, "동별 상승률"),
            dongRows.length
              ? h("div", { className: "real-estate-leader-list" },
                  dongRows.slice(0, 20).map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: item.dong + index,
                        type: "button",
                        className: "real-estate-leader-row" + (selectedDong === item.dong ? " active" : ""),
                        title: item.dong + "을 주도한 단지는 오른쪽 목록에서 확인할 수 있습니다.",
                        onClick: function () { setSelectedDong(selectedDong === item.dong ? "" : item.dong); },
                      },
                      h("span", { className: "rank" }, index + 1),
                      h("span", { className: "name" }, item.dong),
                      h("span", { className: "leader-metrics" }, renderLeaderValue(item))
                    );
                  })
                )
              : h(EmptyState, { message: "표시할 동 단위 실거래 비교 데이터가 없습니다." })
          ),
          h(
            "section",
            { className: "real-estate-drilldown-card" },
            h(
              "div",
              { className: "real-estate-drilldown-title" },
              h("h3", null, selectedDong ? selectedDong + " 상승 주도 단지" : "상승 주도 단지"),
              selectedDong
                ? h("button", { type: "button", className: "mini-button compact", onClick: function () { setSelectedDong(""); } }, "전체")
                : null
            ),
            apartmentRows.length
              ? h("div", { className: "real-estate-leader-list" },
                  apartmentRows.slice(0, 30).map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: item.dong + item.apartment + index,
                        type: "button",
                        className: "real-estate-leader-row apartment clickable",
                        title: "네이버 부동산에서 " + item.apartment + " 검색",
                        onClick: function () { openNaverRealEstateComplex(item); },
                      },
                      h("span", { className: "rank" }, index + 1),
                      h("span", { className: "name" }, item.apartment, h("small", null, item.dong || "")),
                      h("span", { className: "leader-metrics" }, renderLeaderValue(item))
                    );
                  })
                )
              : h(EmptyState, { message: "표시할 단지별 비교 데이터가 없습니다." })
          )
        )
      );
    }

    function renderPricePopup() {
      if (!popupOpen || !selectedRegion) {
        return null;
      }
      const children = ensureArray(selectedRegion.children);
      return h(
        "div",
        {
          className: "modal-backdrop real-estate-price-backdrop",
          onMouseDown: function (event) {
            if (event.target === event.currentTarget) {
              setPopupOpen(false);
            }
          },
        },
        h(
          "div",
          { className: "modal-panel real-estate-price-modal", onMouseDown: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-header real-estate-price-modal-head" },
            h("div", null, h("h2", null, selectedRegion.mapTitle + " · " + selectedRegion.name), h("p", null, selectedRegion.full_name || "최근 2년 주택가격지수")),
            h(
              "button",
              { type: "button", className: "real-estate-modal-close", "aria-label": "닫기", onClick: function () { setPopupOpen(false); } },
              "↻"
            )
          ),
          h(
            "div",
            { className: "price-chart-metrics modal-metrics" },
            h("span", { className: metricClass(selectedRegion.wow_pct) }, "WoW " + formatPercent(selectedRegion.wow_pct, 2)),
            h("span", { className: metricClass(selectedRegion.yoy_pct) }, "YoY " + formatPercent(selectedRegion.yoy_pct, 2)),
            h("span", null, "지수 " + numberFormat(selectedRegion.latest_index, 2))
          ),
          h(RealEstatePriceChart, { key: selectedRegion.key, region: selectedRegion }),
          children.length
            ? h(
                "section",
                { className: "real-estate-child-card" },
                h("h3", null, "하위 지역 상승률"),
                h("div", { className: "real-estate-child-list" },
                  children.slice(0, 36).map(function (item, index) {
                    return h(
                      "div",
                      { key: item.key || item.name + index, className: "real-estate-child-row" },
                      h("span", null, item.name),
                      h("strong", { className: metricClass(item.yoy_pct) }, "YoY " + formatPercent(item.yoy_pct, 2)),
                      h("em", null, "WoW " + formatPercent(item.wow_pct, 2))
                    );
                  })
                )
              )
            : null,
          renderTradeDetail()
        )
      );
    }

    if (request.loading && !maps.length) {
      return h(LoadingPanel, { label: request.label });
    }
    if (request.error) {
      return h(ErrorPanel, { title: "부동산 가격 데이터를 불러오지 못했습니다.", message: request.error, onRetry: request.reload });
    }

    return h(
      "div",
      { className: "page real-estate-price-page" },
      h(
        "section",
        { className: "panel hero-panel real-estate-price-hero" },
        h("div", null, h("h1", null, "부동산 가격"), h("p", null, "전국, 서울, 경기도 지역별 주택가격지수 변화를 지도와 차트로 확인합니다.")),
        h(
          "div",
          { className: "hero-actions" },
          h("span", { className: "status-pill" }, data.as_of || "-"),
          h("span", { className: "status-pill" }, data.source || "주택가격지수")
        )
      ),
      data.note ? h("div", { className: "inline-help real-estate-price-note" }, data.note) : null,
      h(
        "div",
        { className: "real-estate-price-layout" },
        h("div", { className: "price-map-grid" }, maps.map(renderMap))
      ),
      renderPricePopup()
    );
  }

  function BuildingManagementPage() {
    const request = useFetchJson("/api/real-estate/building");
    const [data, setData] = useState(null);
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [draft, setDraft] = useState(null);
    const [unitEditMode, setUnitEditMode] = useState(false);
    const [serviceEditMode, setServiceEditMode] = useState(false);
    const [serviceEditSnapshot, setServiceEditSnapshot] = useState(null);
    const [calendarOpen, setCalendarOpen] = useState(true);
    const [calendarMonth, setCalendarMonth] = useState(function () {
      return new Date().toISOString().slice(0, 7);
    });
    const [calendarDate, setCalendarDate] = useState("");
    const [calendarDraft, setCalendarDraft] = useState(null);
    const [waterPanelOpen, setWaterPanelOpen] = useState(false);
    const [electricPanelOpen, setElectricPanelOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncingWater, setSyncingWater] = useState(false);
    const [syncingElectric, setSyncingElectric] = useState(false);
    const [syncingBank, setSyncingBank] = useState(false);
    const [bankDraft, setBankDraft] = useState(function () {
      return { date: isoToday(), kind: "income", category: "수동입금", amount: "", target: "", memo: "", payment_method: "현금인출" };
    });
    const [message, setMessage] = useState("");

    useEffect(function () {
      if (request.data && !data) {
        setData(request.data);
      }
    }, [request.data, data]);

    function money(value) {
      return numberFormat(Number(value || 0), 0) + "?";
    }

    function manwon(value) {
      return numberFormat(Number(value || 0), 0) + "\ub9cc\uc6d0";
    }

    function cleanNumberInput(value) {
      return String(value == null ? "" : value).replace(/,/g, "").replace(/[^\d.-]/g, "");
    }

    function formatNumberInput(value) {
      const raw = String(value == null ? "" : value);
      if (!raw) return "";
      const cleaned = cleanNumberInput(raw);
      if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return cleaned;
      const isNegative = cleaned.charAt(0) === "-";
      const unsigned = isNegative ? cleaned.slice(1) : cleaned;
      const parts = unsigned.split(".");
      const integerPart = parts[0] || "0";
      const decimalPart = parts.length > 1 ? "." + parts.slice(1).join("") : "";
      const formattedInteger = new Intl.NumberFormat("ko-KR").format(Number(integerPart || 0));
      return (isNegative ? "-" : "") + formattedInteger + decimalPart;
    }

    function parseNumberInput(value) {
      const cleaned = cleanNumberInput(value);
      const parsed = Number(cleaned || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function specialPhaseLabel(phase) {
      if (phase === "rent_free") return "렌트프리";
      if (phase === "settlement_support") return "창업정착지원";
      return "정상청구";
    }

    function areaText(area) {
      const source = area || {};
      const exclusive = Number(source.exclusive_m2 || 0);
      const parking = Number(source.parking_m2 || 0);
      const common = Number(source.common_m2 || 0);
      const salePy = Number(source.sale_py || 0);
      return numberFormat(exclusive + parking + common, 2) + "m² / " + numberFormat(salePy, 2) + "평";
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value || {}));
    }

    function isoToday() {
      return new Date().toISOString().slice(0, 10);
    }

    function calendarMonthLabel(value) {
      const parts = String(value || "").split("-");
      if (parts.length < 2) return value || "";
      return parts[0] + "년 " + Number(parts[1]) + "월";
    }

    function shiftCalendarMonth(delta) {
      const parts = String(calendarMonth || isoToday().slice(0, 7)).split("-");
      let year = Number(parts[0]);
      let monthIndex = Number(parts[1] || 1) - 1 + Number(delta || 0);
      if (!year || Number.isNaN(monthIndex)) return;
      year += Math.floor(monthIndex / 12);
      monthIndex = ((monthIndex % 12) + 12) % 12;
      setCalendarMonth(String(year).padStart(4, "0") + "-" + String(monthIndex + 1).padStart(2, "0"));
    }

    function renderCalendarMonthControls(position) {
      return h(
        "div",
        { className: "building-calendar-controls" + (position === "bottom" ? " bottom" : "") },
        h("button", { type: "button", className: "mini-button", onClick: function () { shiftCalendarMonth(-1); } }, "이전"),
        h("strong", null, calendarMonthLabel(calendarMonth)),
        h("button", { type: "button", className: "mini-button", onClick: function () { shiftCalendarMonth(1); } }, "다음")
      );
    }

    function lastDayOfMonth(monthText) {
      const parts = String(monthText || isoToday().slice(0, 7)).split("-");
      return new Date(Number(parts[0]), Number(parts[1] || 1), 0).getDate();
    }

    function paymentDateForMonth(monthText, ruleText) {
      const rule = String(ruleText || "");
      let day = 1;
      if (rule.indexOf("말일") >= 0) {
        day = lastDayOfMonth(monthText);
      } else {
        const match = rule.match(/매월\s*(\d{1,2})\s*일/);
        if (match) day = Number(match[1]);
      }
      day = Math.max(1, Math.min(day, lastDayOfMonth(monthText)));
      return monthText + "-" + String(day).padStart(2, "0");
    }

    function servicePaymentDateForMonth(monthText, service) {
      const rawDay = Number((service && (service.payment_day || service.due_day)) || 1);
      const day = Math.max(1, Math.min(rawDay || 1, lastDayOfMonth(monthText)));
      return monthText + "-" + String(day).padStart(2, "0");
    }

    function serviceAnnualPaymentDateForMonth(monthText, service) {
      const rawDate = String(
        (service && (service.payment_date || service.annual_payment_date || service.yearly_payment_date)) ||
          (service && service.start_date) ||
          ""
      ).slice(0, 10);
      if (!rawDate || rawDate.length < 10) return "";
      const monthDay = rawDate.slice(5, 10);
      if (!/^\d{2}-\d{2}$/.test(monthDay)) return "";
      const requestedMonth = monthDay.slice(0, 2);
      if (requestedMonth !== String(monthText || "").slice(5, 7)) return "";
      const rawDay = Number(monthDay.slice(3, 5));
      const day = Math.max(1, Math.min(rawDay || 1, lastDayOfMonth(monthText)));
      return monthText + "-" + String(day).padStart(2, "0");
    }

    function managementVatFlag(value) {
      const text = String(value || "").trim().toUpperCase();
      const compact = text.replace(/\s+/g, "");
      if (!compact) return "X";
      if (["O", "Y", "YES", "TRUE", "1"].indexOf(compact) >= 0) return "O";
      if (["X", "N", "NO", "FALSE", "0"].indexOf(compact) >= 0) return "X";
      if (compact.indexOf("미적용") >= 0 || compact.indexOf("없음") >= 0 || compact.indexOf("면세") >= 0 || compact.indexOf("포함") >= 0) return "X";
      if (compact.indexOf("적용") >= 0 || compact.indexOf("별도") >= 0) return "O";
      return "X";
    }

    function managementVatLabel(value) {
      return managementVatFlag(value) === "O" ? "O" : "X";
    }

    function expectedMonthlyChargeParts(contract, rent, managementFee) {
      const rentAmount = Math.max(0, Number(rent || 0));
      const managementAmount = Math.max(0, Number(managementFee || 0));
      const rentVat = Math.round(Number(rent || 0) * 0.1);
      const managementVat = managementVatFlag(contract && contract.vat_note) === "O"
        ? Math.round(managementAmount * 0.1)
        : 0;
      return {
        rent: rentAmount,
        rent_vat: rentVat,
        management_fee: managementAmount,
        management_vat: managementVat,
        vat_total: rentVat + managementVat,
        total: rentAmount + rentVat + managementAmount + managementVat,
      };
    }

    function isDateWithinLease(dateText, contract) {
      const start = String((contract && (contract.balance_date || contract.contract_date)) || "");
      const end = String((contract && contract.lease_end_date) || "");
      if (start && dateText < start.slice(0, 10)) return false;
      if (end && dateText > end.slice(0, 10)) return false;
      return true;
    }

    function monthlyDueDateWithinLease(monthText, contract) {
      const regularDueDate = paymentDateForMonth(monthText, contract && contract.rent_payment_day);
      const leaseStart = String((contract && (contract.balance_date || contract.contract_date)) || "").slice(0, 10);
      if (leaseStart && leaseStart.slice(0, 7) === monthText && regularDueDate < leaseStart) {
        return leaseStart;
      }
      return regularDueDate;
    }

    function expectedRentForDate(unit, dateText) {
      const contract = (unit && unit.contract) || {};
      const special = (unit && unit.special_terms) || {};
      if (special.paid_rent_start_date && dateText < String(special.paid_rent_start_date).slice(0, 10)) return 0;
      return Number(special.contract_monthly_rent || special.discounted_monthly_rent || contract.monthly_rent || 0);
    }

    function expectedManagementFeeForDate(unit, dateText, rent) {
      const contract = (unit && unit.contract) || {};
      const special = (unit && unit.special_terms) || {};
      let managementFee = Number(contract.management_fee || special.management_fee || 0);
      const currentMonthlyDue = Number(special.current_monthly_due || 0);
      const currentRentDue = Number(special.current_rent_due || 0);
      if (!managementFee && currentMonthlyDue > currentRentDue) {
        managementFee = currentMonthlyDue - currentRentDue;
      }
      const baseRent = Number(rent || special.contract_monthly_rent || special.discounted_monthly_rent || contract.monthly_rent || 0);
      if (baseRent && managementFee > Math.max(baseRent * 3, 2000000)) {
        return 0;
      }
      return Math.max(0, managementFee);
    }

    function plannedManagementFeeManwon(unit) {
      const rentPlan = (unit && unit.rent_plan) || {};
      const planned = Number(rentPlan.management_fee_manwon || 0);
      return planned;
    }

    function expectedEntriesForMonth(buildingData, monthText) {
      const rows = [];
      Object.keys((buildingData && buildingData.units) || {}).forEach(function (unitId) {
        const unit = buildingData.units[unitId] || {};
        const contract = unit.contract || {};
        if (!String(contract.tenant || contract.tenant_business || "").trim()) return;
        const target = unitId + "ȣ";
        const memo = contract.tenant_business || contract.tenant || "";
        if (String(contract.contract_date || "").slice(0, 7) === monthText && Number(contract.contract_deposit || 0) > 0) {
          rows.push({ date: String(contract.contract_date).slice(0, 10), target: target, kind: "expected_income", category: "계약금", amount: Number(contract.contract_deposit || 0), signed: Number(contract.contract_deposit || 0), memo: memo });
        }
        if (String(contract.balance_date || "").slice(0, 7) === monthText && Number(contract.balance_amount || 0) > 0) {
          rows.push({ date: String(contract.balance_date).slice(0, 10), target: target, kind: "expected_income", category: "보증금", amount: Number(contract.balance_amount || 0), signed: Number(contract.balance_amount || 0), memo: memo });
        }
        const dueDate = monthlyDueDateWithinLease(monthText, contract);
        if (!isDateWithinLease(dueDate, contract)) return;
        const rent = expectedRentForDate(unit, dueDate);
        const managementFee = expectedManagementFeeForDate(unit, dueDate, rent);
        const charge = expectedMonthlyChargeParts(contract, rent, managementFee);
        if (charge.rent > 0) {
          rows.push({ date: dueDate, target: target, kind: "expected_income", category: "월세", amount: charge.rent, signed: charge.rent, memo: memo });
        }
        if (charge.management_fee > 0) {
          rows.push({ date: dueDate, target: target, kind: "expected_income", category: "관리비", amount: charge.management_fee, signed: charge.management_fee, memo: memo });
        }
        if (charge.vat_total > 0) {
          rows.push({
            date: dueDate,
            target: target,
            kind: "expected_income",
          category: "전기세 예정",
            amount: charge.vat_total,
            signed: charge.vat_total,
            memo: "월세VAT " + money(charge.rent_vat) + " · 관리비VAT " + money(charge.management_vat) + " (" + managementVatLabel(contract.vat_note) + ")",
          });
        }
      });
      ensureArray(buildingData && buildingData.service_contracts).forEach(function (service) {
        const amount = Number(service.amount || 0);
        if (!amount) return;
        const startDate = String(service.start_date || "");
        if (startDate && monthText < startDate.slice(0, 7)) return;
        const cycle = String(service.cycle || "monthly");
        const dueDate = cycle === "yearly" || cycle === "annual"
          ? serviceAnnualPaymentDateForMonth(monthText, service)
          : servicePaymentDateForMonth(monthText, service);
        if (!dueDate) return;
        rows.push({ date: dueDate, target: "공통", kind: "expected_expense", category: service.category || "관리비/용역 예정", amount: amount, signed: -amount, memo: service.vendor || "" });
      });
      return rows;
    }

    function combineMonthlyIncomeExpectedRows(rows) {
      const grouped = {};
      const result = [];
      ensureArray(rows).forEach(function (row) {
        const category = String(row.category || "");
        const isMonthlyIncome = row.kind === "expected_income" && ["월세", "관리비", "부가세"].indexOf(category) >= 0;
        if (!isMonthlyIncome) {
          result.push(row);
          return;
        }
        const key = [row.date, row.target].join("|");
        if (!grouped[key]) {
          grouped[key] = {
            date: row.date,
            target: row.target,
            kind: "expected_income",
            category: "월세+관리비+부가세",
            amount: 0,
            signed: 0,
            memo: row.memo || "",
            parts: {},
          };
          result.push(grouped[key]);
        }
        grouped[key].amount += Number(row.amount || 0);
        grouped[key].signed += Number(row.signed || row.amount || 0);
        grouped[key].parts[category] = Number(grouped[key].parts[category] || 0) + Number(row.amount || 0);
      });
      return result;
    }

    function expectedAmountWithBreakdown(row) {
      const amountText = money(row && row.amount);
      const parts = (row && row.parts) || {};
      const hasMonthlyBreakdown = row && row.category === "월세+관리비+부가세" && (
        Number(parts["\uc6d4\uc138"] || 0) ||
        Number(parts["\ubd80\uac00\uc138"] || 0) ||
        Number(parts["관리비"] || 0)
      );
      if (!hasMonthlyBreakdown) {
        return amountText;
      }
      return amountText + "(" + [
        numberFormat(Number(parts["\uc6d4\uc138"] || 0), 0),
        numberFormat(Number(parts["\ubd80\uac00\uc138"] || 0), 0),
        numberFormat(Number(parts["\uad00\ub9ac\ube44"] || 0), 0),
      ].join("/") + ")";
    }

    function expectedAmountBreakdownTitle(row) {
      const parts = (row && row.parts) || {};
      if (!row || row.category !== "월세+관리비+부가세") return "";
      return "월세 " + money(parts["월세"]) +
        " / 부가세 " + money(parts["부가세"]) +
        " / 관리비 " + money(parts["관리비"]);
    }

    function openCalendarDate(dateText) {
      setCalendarDate(dateText);
      setCalendarDraft({
        target: "common",
        unit_id: "",
        date: dateText,
        kind: "income",
        category: "월세",
        amount: 0,
        memo: "",
      });
      setMessage("");
    }

    function closeCalendarDate() {
      setCalendarDate("");
      setCalendarDraft(null);
    }

    function setCalendarDraftField(field, value) {
      setCalendarDraft(function (current) {
        return { ...(current || {}), [field]: value };
      });
    }

    function openUnit(unitId) {
      const unit = data && data.units && data.units[unitId];
      if (!unit) return;
      setSelectedUnitId(unitId);
      setDraft(clone(unit));
      setUnitEditMode(false);
      setMessage("");
    }

    function closeUnit() {
      setSelectedUnitId("");
      setDraft(null);
      setUnitEditMode(false);
    }

    function setContract(field, value) {
      setDraft(function (current) {
        const next = clone(current);
        next.contract = next.contract || {};
        next.contract[field] = value;
        return next;
      });
    }

    function setWater(field, value) {
      setDraft(function (current) {
        const next = clone(current);
        next.water = next.water || {};
        next.water[field] = value;
        return next;
      });
    }

    function setTransaction(index, field, value) {
      setDraft(function (current) {
        const next = clone(current);
        next.transactions = ensureArray(next.transactions);
        next.transactions[index] = { ...(next.transactions[index] || {}), [field]: value };
        return next;
      });
    }

    function addTransaction() {
      setDraft(function (current) {
        const next = clone(current);
        next.transactions = ensureArray(next.transactions);
        next.transactions.unshift({
          id: Date.now(),
          date: new Date().toISOString().slice(0, 10),
          kind: "income",
          category: "월세",
          amount: 0,
          memo: "",
        });
        return next;
      });
    }

    function removeTransaction(index) {
      setDraft(function (current) {
        const next = clone(current);
        next.transactions = ensureArray(next.transactions).filter(function (_, itemIndex) {
          return itemIndex !== index;
        });
        return next;
      });
    }

    function setService(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = ensureArray(next.service_contracts);
        next.service_contracts[index] = { ...(next.service_contracts[index] || {}), [field]: value };
        return next;
      });
    }

    function addService() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = ensureArray(next.service_contracts);
        next.service_contracts.unshift({
          id: Date.now(),
          category: "CCTV",
          vendor: "",
          amount: 0,
          cycle: "monthly",
          start_date: "",
          payment_day: 1,
          payment_date: "",
          memo: "",
        });
        return next;
      });
    }

    function removeService(index) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = ensureArray(next.service_contracts).filter(function (_, itemIndex) {
          return itemIndex !== index;
        });
        return next;
      });
    }

    function setOperatingTransaction(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.operating_transactions = ensureArray(next.operating_transactions);
        next.operating_transactions[index] = { ...(next.operating_transactions[index] || {}), [field]: value };
        return next;
      });
    }

    function addOperatingTransaction() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.operating_transactions = ensureArray(next.operating_transactions);
        next.operating_transactions.unshift({
          id: Date.now(),
          date: new Date().toISOString().slice(0, 10),
          kind: "expense",
          category: "전기세 예정",
          amount: 0,
          memo: "",
        });
        return next;
      });
    }

    function removeOperatingTransaction(index) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.operating_transactions = ensureArray(next.operating_transactions).filter(function (_, itemIndex) {
          return itemIndex !== index;
        });
        return next;
      });
    }

    function setWaterBillingMonth(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.water_billing = next.water_billing || {};
        next.water_billing.months = ensureArray(next.water_billing.months);
        next.water_billing.months[index] = { ...(next.water_billing.months[index] || {}), [field]: value };
        return next;
      });
    }

    function setWaterReading(monthIndex, unitId, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.water_billing = next.water_billing || {};
        next.water_billing.months = ensureArray(next.water_billing.months);
        const month = { ...(next.water_billing.months[monthIndex] || {}) };
        month.readings = { ...(month.readings || {}), [unitId]: value };
        next.water_billing.months[monthIndex] = month;
        return next;
      });
    }

    function setElectricityBillingMonth(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.electricity_billing = next.electricity_billing || {};
        next.electricity_billing.months = ensureArray(next.electricity_billing.months);
        next.electricity_billing.months[index] = { ...(next.electricity_billing.months[index] || {}), [field]: value };
        return next;
      });
    }

    function setElectricityBill(monthIndex, unitId, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.electricity_billing = next.electricity_billing || {};
        next.electricity_billing.months = ensureArray(next.electricity_billing.months);
        const month = { ...(next.electricity_billing.months[monthIndex] || {}) };
        month.bills = { ...(month.bills || {}), [unitId]: value };
        month.total_bill = Object.keys(month.bills).reduce(function (sum, key) { return sum + Number(month.bills[key] || 0); }, 0);
        next.electricity_billing.months[monthIndex] = month;
        return next;
      });
    }

    function addElectricityMonth() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.electricity_billing = next.electricity_billing || {};
        next.electricity_billing.months = ensureArray(next.electricity_billing.months);
        next.electricity_billing.months.unshift({ month: calendarMonth, total_bill: 0, bills: {}, memo: "" });
        return next;
      });
      setElectricPanelOpen(true);
    }

    async function saveBuildingData(payload, shouldCloseUnit) {
      const nextData = clone(payload || data || request.data || {});
      setSaving(true);
      setMessage("");
      try {
        const saved = await postJson("/api/real-estate/building", { data: nextData });
        setData(saved);
        setMessage(saved.excel_sync && saved.excel_sync.message ? "저장되었습니다. " + saved.excel_sync.message : "저장되었습니다.");
        if (shouldCloseUnit) closeUnit();
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSaving(false);
      }
    }

    async function importBankFiles() {
      setSyncingBank(true);
      setMessage("");
      try {
        const result = await postJson("/api/real-estate/bank/import-files", {});
        if (result.real_estate) {
          setData(result.real_estate);
        }
        const files = ensureArray(result.files);
        const failed = files.filter(function (file) { return file.error; });
        setMessage(
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            numberFormat(result.imported || 0, 0) +
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            (failed.length ? " 확인 필요 파일 " + numberFormat(failed.length, 0) + "개" : "")
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSyncingBank(false);
      }
    }

    async function syncWaterFromTelegram() {
      setSyncingWater(true);
      setMessage("");
      try {
        const result = await postJson("/api/real-estate/water/sync-telegram", {
          month: "",
          limit: 500,
        });
        if (result.real_estate) {
          setData(result.real_estate);
        }
        setWaterPanelOpen(true);
        const syncedMonths = ensureArray(result.synced_months);
        const latest = syncedMonths.length ? syncedMonths[syncedMonths.length - 1] : {};
        setMessage(
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            numberFormat(result.synced_count || syncedMonths.length || 0, 0) +
            "건을 반영했습니다. 최근 " +
            (latest.month || result.month || "") +
            " 총사용량 " +
            numberFormat(latest.total_usage_m3 || result.parsed && result.parsed.total_usage_m3 || 0, 2) +
            "m³ / 총요금 " +
            money(latest.total_bill || result.parsed && result.parsed.total_bill || 0)
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSyncingWater(false);
      }
    }

    async function syncElectricityFromTelegram() {
      setSyncingElectric(true);
      setMessage("");
      try {
        const result = await postJson("/api/real-estate/electricity/sync-telegram", {
          month: "",
          limit: 800,
        });
        if (result.real_estate) {
          setData(result.real_estate);
        }
        setElectricPanelOpen(true);
        setMessage(
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            numberFormat(result.synced_count || 0, 0) +
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            (result.month ? " 최근 " + result.month : "")
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSyncingElectric(false);
      }
    }

    async function saveCalendarTransaction() {
      if (!calendarDraft) return;
      const nextData = clone(data || request.data || {});
      const tx = {
        id: Date.now(),
        date: calendarDraft.date || calendarDate || isoToday(),
        kind: calendarDraft.kind || "income",
        category: calendarDraft.category || "",
        amount: calendarDraft.amount || 0,
        memo: calendarDraft.memo || "",
      };
      if (calendarDraft.target === "unit" && calendarDraft.unit_id && nextData.units && nextData.units[calendarDraft.unit_id]) {
        nextData.units[calendarDraft.unit_id].transactions = ensureArray(nextData.units[calendarDraft.unit_id].transactions);
        nextData.units[calendarDraft.unit_id].transactions.unshift(tx);
      } else {
        nextData.operating_transactions = ensureArray(nextData.operating_transactions);
        nextData.operating_transactions.unshift(tx);
      }
      await saveBuildingData(nextData, false);
      closeCalendarDate();
    }

    function setBankDraftField(field, value) {
      setBankDraft(function (current) {
        return { ...(current || {}), [field]: value };
      });
    }

    async function saveManualBankTransaction() {
      const amount = parseNumberInput(bankDraft && bankDraft.amount);
      if (!amount) {
        setMessage("\uae08\uc561\uc744 \uc785\ub825\ud55c \ub4a4 \uc800\uc7a5\ud574 \uc8fc\uc138\uc694.");
        return;
      }
      const nextData = clone(data || request.data || {});
      nextData.bank_transactions = ensureArray(nextData.bank_transactions);
      nextData.bank_transactions.unshift({
        id: "manual_" + Date.now(),
        source: "manual_bank_file",
        date: (bankDraft && bankDraft.date) || isoToday(),
        time: "",
        kind: (bankDraft && bankDraft.kind) || "income",
        category: (bankDraft && bankDraft.category) || ((bankDraft && bankDraft.kind) === "expense" ? "수동출금" : "수동입금"),
        target: (bankDraft && bankDraft.target) || "",
        payment_method: (bankDraft && bankDraft.payment_method) || "현금인출",
        amount: Math.round(Math.abs(amount)),
        balance: 0,
        memo: (bankDraft && bankDraft.memo) || "",
        source_file: "수동추가",
        source_row: "",
      });
      await saveBuildingData(nextData, false);
      setBankDraft({ date: isoToday(), kind: "income", category: "수동입금", amount: "", target: "", memo: "", payment_method: "현금인출" });
    }

    async function deleteBankTransaction(tx) {
      if (!tx || !tx.id) return;
      if (!window.confirm("이 입출금 내역을 제거할까요?")) return;
      const nextData = clone(data || request.data || {});
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).filter(function (item) {
        return String(item.id || "") !== String(tx.id || "");
      });
      if (tx.source === "bank_file") {
        nextData.bank_transaction_exclusions = ensureArray(nextData.bank_transaction_exclusions);
        if (nextData.bank_transaction_exclusions.indexOf(String(tx.id)) < 0) {
          nextData.bank_transaction_exclusions.push(String(tx.id));
        }
      }
      await saveBuildingData(nextData, false);
    }

    async function saveBankMemoTarget(tx, targetValue) {
      if (!tx || !tx.id) return;
      const nextData = clone(data || request.data || {});
      const memoKey = String(tx.memo || "").trim();
      const nextTarget = String(targetValue || "").trim();
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).map(function (item) {
        const sameMemo = memoKey && String(item.memo || "").trim() === memoKey;
        const sameId = String(item.id || "") === String(tx.id || "");
        if (!sameMemo && !sameId) return item;
        return { ...item, target: nextTarget };
      });
      nextData.bank_memo_unit_map = { ...(nextData.bank_memo_unit_map || {}) };
      if (memoKey) {
        if (nextTarget) {
          nextData.bank_memo_unit_map[memoKey] = nextTarget;
        } else {
          delete nextData.bank_memo_unit_map[memoKey];
        }
      }
      await saveBuildingData(nextData, false);
    }

    async function saveBankMemoCategory(tx, categoryValue) {
      if (!tx || !tx.id) return;
      const nextData = clone(data || request.data || {});
      const memoKey = String(tx.memo || "").trim();
      const nextCategory = String(categoryValue || "").trim();
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).map(function (item) {
        const sameId = String(item.id || "") === String(tx.id || "");
        if (!sameId) return item;
        return { ...item, category: nextCategory || item.category || "" };
      });
      nextData.bank_memo_category_map = { ...(nextData.bank_memo_category_map || {}) };
      if (memoKey) {
        if (nextCategory) {
          nextData.bank_memo_category_map[memoKey] = nextCategory;
        } else {
          delete nextData.bank_memo_category_map[memoKey];
        }
      }
      await saveBuildingData(nextData, false);
    }

    async function saveBankPaymentMethod(tx, paymentMethodValue) {
      if (!tx || !tx.id) return;
      const nextData = clone(data || request.data || {});
      const nextPaymentMethod = String(paymentMethodValue || "현금인출").trim() || "현금인출";
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).map(function (item) {
        const sameId = String(item.id || "") === String(tx.id || "");
        if (!sameId) return item;
        return { ...item, payment_method: nextPaymentMethod };
      });
      await saveBuildingData(nextData, false);
    }

    async function saveUnit() {
      if (!data || !draft || !selectedUnitId) return;
      const nextData = clone(data);
      const nextDraft = clone(draft);
      nextDraft.contract = {
        ...((nextDraft && nextDraft.contract) || {}),
        vat_note: managementVatFlag(nextDraft && nextDraft.contract && nextDraft.contract.vat_note),
      };
      nextData.units[selectedUnitId] = nextDraft;
      saveBuildingData(nextData, true);
    }

    async function saveServices() {
      await saveBuildingData(building, false);
      setServiceEditMode(false);
      setServiceEditSnapshot(null);
    }

    function beginServiceEdit() {
      setServiceEditSnapshot(clone(serviceContracts));
      setServiceEditMode(true);
    }

    function cancelServiceEdit() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = clone(serviceEditSnapshot || []);
        return next;
      });
      setServiceEditMode(false);
      setServiceEditSnapshot(null);
    }

    function renderField(label, value, setter, type) {
      const isNumberField = type === "number";
      return h(
        "label",
        { className: "building-field" },
        h("span", null, label),
        h("input", {
          type: isNumberField ? "text" : type || "text",
          inputMode: isNumberField ? "decimal" : undefined,
          value: isNumberField ? formatNumberInput(value) : value == null ? "" : value,
          onChange: function (event) { setter(isNumberField ? cleanNumberInput(event.target.value) : event.target.value); },
        })
      );
    }

    function renderSelectField(label, value, setter, options) {
      const normalizedValue = value == null || value === "" ? (options[0] && options[0].value) || "" : value;
      return h(
        "label",
        { className: "building-field" },
        h("span", null, label),
        h(
          "select",
          {
            value: normalizedValue,
            onChange: function (event) { setter(event.target.value); },
          },
          options.map(function (option) {
            return h("option", { key: option.value, value: option.value }, option.label);
          })
        )
      );
    }

    function renderUnit(unitId) {
      const unit = data && data.units && data.units[unitId] ? data.units[unitId] : {};
      const contract = unit.contract || {};
      const area = unit.area || {};
      const rentPlan = unit.rent_plan || {};
      const special = unit.special_terms || {};
      const monthlyMoney = (unitMonthlyMoneyMap && unitMonthlyMoneyMap[unitId]) || {};
      const tenant = String(contract.tenant || "").trim();
      const tenantBusiness = String(contract.tenant_business || "").trim();
      const displayTenant = tenantBusiness || tenant;
      const occupied = Boolean(tenant || tenantBusiness);
      const rentDue = occupied ? Number(monthlyMoney.expected_rent || 0) : 0;
      const managementDue = occupied ? Number(monthlyMoney.expected_management || 0) : 0;
      const expectedTotal = occupied ? rentDue + managementDue : 0;
      const paidTotal = occupied ? Number(monthlyMoney.paid_total || 0) : 0;
      return h(
        "button",
        {
          key: unitId,
          type: "button",
          className: "building-unit-card" + (occupied ? " occupied" : " vacant"),
          onClick: function () { openUnit(unitId); },
        },
        h("strong", null, unitId),
        h("span", null, displayTenant || "공실"),
        h("small", null, areaText(area)),
        h("small", null, "계획 " + manwon(rentPlan.deposit_manwon) + " / 월 " + manwon(rentPlan.monthly_rent_manwon)),
        special.discount_rate ? h("small", null, "특별조건 " + numberFormat(special.discount_rate, 0) + "% 할인 · " + specialPhaseLabel(special.current_phase)) : null,
        h(
          "div",
          { className: "building-unit-money" },
          h(
            "em",
            { className: "due" },
            h("span", null, calendarMonth + " \uc608\uc815 \uccad\uad6c\uc561"),
            h("strong", null, money(expectedTotal)),
            h("small", null, "월세 " + money(rentDue) + " · 관리 " + money(managementDue))
          ),
          h(
            "em",
            { className: "paid" },
            h("span", null, calendarMonth + " \uc2e4\uc81c \uc785\uae08\uc561"),
            h("strong", null, money(paidTotal)),
            h("small", null, paidTotal >= expectedTotal && expectedTotal > 0 ? "납부 확인" : expectedTotal > 0 ? "미납 " + money(Math.max(0, expectedTotal - paidTotal)) : "입금 없음")
          )
        )
      );
    }

    const building = data || request.data || {};
    const summary = building.summary || {};
    const areaTotals = summary.area_totals || {};
    const layout = ensureArray(building.layout).slice().reverse();
    const serviceContracts = ensureArray(building.service_contracts);
    const operatingTransactions = ensureArray(building.operating_transactions);
    const bankTransactions = ensureArray(building.bank_transactions);
    const waterBillingMonths = ensureArray(building.water_billing && building.water_billing.months);
    const waterBillingRows = ensureArray(summary.water_billing_rows);
    const waterYearlyRows = ensureArray(summary.water_yearly_rows);
    const unitIds = Object.keys(building.units || {});
    const electricityBilling = building.electricity_billing || {};
    const electricityBillingMonths = ensureArray(electricityBilling.months);
    const electricityBillingRows = ensureArray(summary.electricity_billing_rows);
    const unitMonthlyMoneyMap = {};
    function normalizeUnitTarget(target) {
      const compact = String(target || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      return unitIds.find(function (unitId) {
        return compact === String(unitId).toUpperCase() || compact.indexOf(String(unitId).toUpperCase()) === 0;
      }) || "";
    }
    function getUnitMonthlyMoney(unitId) {
      unitMonthlyMoneyMap[unitId] = unitMonthlyMoneyMap[unitId] || {
        expected_total: 0,
        expected_rent: 0,
        expected_management: 0,
        paid_total: 0,
      };
      return unitMonthlyMoneyMap[unitId];
    }
    expectedEntriesForMonth(building, calendarMonth).forEach(function (row) {
      if (row.kind !== "expected_income") return;
      const unitId = normalizeUnitTarget(row.target);
      if (!unitId) return;
      const moneyBucket = getUnitMonthlyMoney(unitId);
      const amount = Number(row.amount || 0);
      const category = String(row.category || "");
      if (category.indexOf("월세") >= 0) {
        moneyBucket.expected_rent += amount;
        moneyBucket.expected_total += amount;
      } else if (category.indexOf("관리") >= 0) {
        moneyBucket.expected_management += amount;
        moneyBucket.expected_total += amount;
      }
    });
    function addActualUnitPayment(tx, fallbackUnitId) {
      if (!tx || String(tx.date || "").slice(0, 7) !== calendarMonth || tx.kind === "expense") return;
      const category = String(tx.category || "");
      const isMonthlyPayment = category.indexOf("월세") >= 0 || category.indexOf("관리") >= 0 || category.indexOf("부가세") >= 0;
      if (!isMonthlyPayment) return;
      const unitId = fallbackUnitId || normalizeUnitTarget(tx.target);
      if (!unitId) return;
      getUnitMonthlyMoney(unitId).paid_total += Number(tx.amount || 0);
    }
    Object.keys((building && building.units) || {}).forEach(function (unitId) {
      ensureArray(building.units[unitId] && building.units[unitId].transactions).forEach(function (tx) {
        addActualUnitPayment(tx, unitId);
      });
    });
    bankTransactions.forEach(function (tx) {
      addActualUnitPayment(tx, "");
    });
    function annualWaterExpectedEntriesForMonth(monthText) {
      if (String(monthText || "").slice(5, 7) !== "12") return [];
      const year = String(monthText || "").slice(0, 4);
      const row = waterYearlyRows.find(function (item) { return String(item.year || "") === year; });
      if (!row) return [];
      return ensureArray(row.units)
        .filter(function (unit) { return Number(unit.amount || 0) > 0; })
        .map(function (unit) {
          const amount = Number(unit.amount || 0);
          return {
            date: year + "-12-31",
            target: unit.unit_id + "ȣ",
            kind: "expected_income",
          category: "전기세 예정",
            amount: amount,
            signed: amount,
            memo: year + "년 수도세 연말 정산",
          };
        });
    }
    function calendarEntryTargetLabel(entry) {
      const target = String((entry && entry.target) || "").trim();
      if (target && target !== "은행") return target;
      if (entry && entry.kind === "event") return "일정";
      if (entry && (entry.kind === "expected_income" || entry.kind === "expected_expense")) return "예정";
      return entry && Number(entry.signed || 0) < 0 ? "출금" : "입금";
    }
    function calendarEntryChipLabel(entry) {
      const parts = [];
      const target = String((entry && entry.target) || "").trim();
      const category = String((entry && entry.category) || "").trim();
      if (target && target !== "은행") parts.push(target);
      if (category) parts.push(category);
      if (entry && entry.kind !== "event") {
        const signed = Number(entry.signed || 0);
        parts.push((signed >= 0 ? "+" : "") + money(signed));
      }
      return parts.join(" ");
    }
    const electricCustomers = ["common"].concat(unitIds).map(function (unitId) {
      const customer = (electricityBilling.customers && electricityBilling.customers[unitId]) || {};
      return {
        unit_id: unitId,
        label: customer.label || (unitId === "common" ? "상가" : unitId + "호"),
        customer_no: customer.customer_no || "",
      };
    });
    const calendarEntriesByDate = useMemo(function () {
      const grouped = {};
      function pushEntry(dateText, entry) {
        if (!dateText) return;
        grouped[dateText] = grouped[dateText] || [];
        grouped[dateText].push(entry);
      }
      Object.keys((building && building.units) || {}).forEach(function (unitId) {
        const unit = building.units[unitId] || {};
        const contract = unit.contract || {};
        [
          ["contract_date", "계약일"],
          ["balance_date", "잔금/인도일"],
          ["lease_end_date", "임대종료일"],
          ["rent_start_date", "월세 개시일"],
        ].forEach(function (pair) {
          const dateText = contract[pair[0]];
          if (dateText) {
            pushEntry(dateText, {
              unit_id: unitId,
              target: unitId + "ȣ",
              kind: "event",
              category: pair[1],
              amount: 0,
              signed: 0,
              memo: contract.tenant || contract.tenant_business || "",
            });
          }
        });
        const special = unit.special_terms || {};
        [
          ["rent_free_end_date", "렌트프리 종료"],
          ["settlement_support_end_date", "창업정착지원 종료"],
          ["paid_rent_start_date", "월세 정상청구 시작"],
        ].forEach(function (pair) {
          const dateText = special[pair[0]];
          if (dateText) {
            pushEntry(dateText, {
              unit_id: unitId,
              target: unitId + "ȣ",
              kind: "event",
              category: pair[1],
              amount: 0,
              signed: 0,
              memo: special.source || "특별임대조건",
            });
          }
        });
        ensureArray(unit.transactions).forEach(function (tx) {
          const amount = Number(tx.amount || 0);
          pushEntry(tx.date, {
            unit_id: unitId,
            target: unitId + "ȣ",
            kind: tx.kind || "income",
            category: tx.category || "",
            amount: amount,
            signed: tx.kind === "expense" ? -amount : amount,
            memo: tx.memo || "",
          });
        });
      });
      ensureArray(building.service_contracts).forEach(function (service) {
        if (service.start_date) {
          pushEntry(service.start_date, {
            unit_id: "",
            target: "공통",
            kind: "event",
            category: "서비스 시작",
            amount: 0,
            signed: 0,
            memo: service.category || "",
          });
        }
      });
      ensureArray(building.operating_transactions).forEach(function (tx) {
        const amount = Number(tx.amount || 0);
        pushEntry(tx.date, {
          unit_id: "",
          target: "\uc6b4\uc601\ube44",
          kind: tx.kind || "expense",
          category: tx.category || "",
          amount: amount,
          signed: tx.kind === "income" ? amount : -amount,
          memo: tx.memo || "",
        });
      });
      ensureArray(building.bank_transactions).forEach(function (tx) {
        const amount = Number(tx.amount || 0);
        pushEntry(tx.date, {
          unit_id: "",
          target: tx.target || "",
          kind: tx.kind || "income",
          category: tx.category || "하나은행 엑셀",
          amount: amount,
          signed: tx.kind === "expense" ? -amount : amount,
          memo: tx.memo || "",
        });
      });
      electricityBillingRows.forEach(function (row) {
        const amount = Number(row.total_bill || 0);
        if (!amount || !row.month) return;
        pushEntry(row.due_date || row.month + "-25", {
          unit_id: "",
          target: "\uc804\uae30\uc694\uae08",
          kind: "expected_expense",
          category: "\uc804\uae30\uc694\uae08 \uccad\uad6c",
          amount: amount,
          signed: -amount,
          memo: "한국전력 고객번호별 청구 합계",
        });
      });
      combineMonthlyIncomeExpectedRows(expectedEntriesForMonth(building, calendarMonth)).forEach(function (entry) {
        pushEntry(entry.date, entry);
      });
      annualWaterExpectedEntriesForMonth(calendarMonth).forEach(function (entry) {
        pushEntry(entry.date, entry);
      });
      return grouped;
    }, [building, calendarMonth, electricityBillingRows, waterYearlyRows]);
    const calendarDays = useMemo(function () {
      const parts = String(calendarMonth || isoToday().slice(0, 7)).split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      if (!year || !month) return [];
      const first = new Date(year, month - 1, 1);
      const daysInMonth = new Date(year, month, 0).getDate();
      const cells = [];
      for (let blank = 0; blank < first.getDay(); blank += 1) {
        cells.push(null);
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateText = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        const entries = ensureArray(calendarEntriesByDate[dateText]);
        const net = entries.reduce(function (sum, item) { return sum + Number(item.signed || 0); }, 0);
        cells.push({ date: dateText, day: day, entries: entries, net: net });
      }
      return cells;
    }, [calendarMonth, calendarEntriesByDate]);
    const selectedCalendarEntries = ensureArray(calendarEntriesByDate[calendarDate]);
    const bankImport = building.bank_import || {};
    const bankImportFiles = ensureArray(bankImport.file_results);
    const bankImportErrors = bankImportFiles.filter(function (file) { return file.error; });
    const bankMemoUnitMap = building.bank_memo_unit_map || {};
    const bankMemoCategoryMap = building.bank_memo_category_map || {};
    const expectedBankRows = combineMonthlyIncomeExpectedRows(expectedEntriesForMonth(building, calendarMonth)).concat(annualWaterExpectedEntriesForMonth(calendarMonth));
    const actualBankRows = [];
    Object.keys((building && building.units) || {}).forEach(function (unitId) {
      ensureArray(building.units[unitId] && building.units[unitId].transactions).forEach(function (tx) {
        if (String(tx.date || "").slice(0, 7) === calendarMonth) actualBankRows.push({ ...tx, target: unitId + "ȣ" });
      });
    });
    operatingTransactions.forEach(function (tx) {
      if (String(tx.date || "").slice(0, 7) === calendarMonth) actualBankRows.push({ ...tx, target: "공통" });
    });
    bankTransactions.forEach(function (tx) {
      if (String(tx.date || "").slice(0, 7) === calendarMonth) {
        const memoKey = String(tx.memo || "").trim();
        const mappedTarget = String(tx.target || bankMemoUnitMap[memoKey] || "");
        actualBankRows.push({
          ...tx,
          target: mappedTarget,
          display_target: mappedTarget || "은행",
          category: defaultBankCategory(tx, mappedTarget),
          source: tx.source || "bank_file",
        });
      }
    });
    const bankExpectedIncome = expectedBankRows.filter(function (row) { return row.kind === "expected_income"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const bankExpectedExpense = expectedBankRows.filter(function (row) { return row.kind === "expected_expense"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const bankActualIncome = actualBankRows.filter(function (row) { return row.kind !== "expense"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const bankActualExpense = actualBankRows.filter(function (row) { return row.kind === "expense"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const selectedMonthActualIncome = actualBankRows
      .filter(function (row) { return row.kind !== "expense"; })
      .reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const selectedMonthActualExpense = actualBankRows
      .filter(function (row) { return row.kind === "expense" && !isProfitWithdrawalCategory(row.category); })
      .reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const selectedMonthActualNet = selectedMonthActualIncome - selectedMonthActualExpense;
    const bankIncomeCategoryOptions = ["가계약금", "계약금", "보증금", "자본납입", "월세+관리비+부가세", "월세", "관리비", "수도세", "부가세", "기타입금"];
    const bankExpenseCategoryOptions = ["세금", "수도세", "전기세", "청소용역", "CCTV", "엘리베이터", "세무사", "보험", "승강기 보험", "화재보험", "기타 결제", "수익 출금"];
    const bankPaymentMethodOptions = ["현금인출", "하나카드", "삼성카드", "신한카드", "현대카드"];
    const serviceCategoryOptions = ["CCTV", "\uc5d8\ub9ac\ubca0\uc774\ud130", "\uc138\ubb34\uc0ac", "\uccad\uc18c\uc6a9\uc5ed", "\uc804\uae30\uc548\uc804\uad00\ub9ac\uc790", "\ubcf4\ud5d8", "\uc2b9\uac15\uae30 \ubcf4\ud5d8", "\ud654\uc7ac\ubcf4\ud5d8"];
    const bankTargetOptions = [
      { value: "", label: "미지정" },
                  { value: "매월 25일(선불)", label: "매월 25일(선불)" },
    ].concat(unitIds.map(function (unitId) {
      return { value: unitId + "ȣ", label: unitId + "ȣ" };
    }));
    function defaultBankCategory(tx, mappedTarget) {
      const isExpense = tx && tx.kind === "expense";
      const memoKey = String((tx && tx.memo) || "").trim();
      const savedCategory = String((isExpense && memoKey && bankMemoCategoryMap[memoKey]) || (tx && tx.category) || "").trim();
      const genericIncome = !savedCategory || savedCategory === "은행입금" || savedCategory === "수동입금" || savedCategory === "기타입금";
      const genericExpense = !savedCategory || savedCategory === "은행출금" || savedCategory === "수동출금" || savedCategory === "기타출금";
      if (isExpense) {
        return genericExpense ? "세금" : savedCategory;
      }
      if (!savedCategory || savedCategory === "은행입금" || savedCategory === "수동입금") {
        return mappedTarget ? "월세+관리비+부가세" : "기타입금";
      }
      return savedCategory;
    }
    function sameBankCategoryForExpected(txCategory, rowCategory) {
      const txText = String(txCategory || "").replace(" 예정", "").trim();
      const rowText = String(rowCategory || "").replace(" 예정", "").trim();
      if (!rowText || !txText) return true;
      if (txText === rowText) return true;
      if (txText === "월세+관리비+부가세") {
        return rowText === "월세" || rowText === "관리비" || rowText === "부가세" ||
          rowText.indexOf("월세") >= 0 || rowText.indexOf("관리") >= 0 || rowText.indexOf("부가세") >= 0;
      }
      if (rowText === "월세+관리비+부가세") {
        return txText === "월세" || txText === "관리비" || txText === "부가세" ||
          txText.indexOf("월세") >= 0 || txText.indexOf("관리") >= 0 || txText.indexOf("부가세") >= 0;
      }
      return false;
    }
    function isProfitWithdrawalCategory(value) {
      return String(value || "").replace(/\s+/g, "") === "수익출금";
    }
    const bankLedgerRows = bankTransactions
      .filter(function (tx) { return String(tx.date || "").slice(0, 7) === calendarMonth; })
      .slice()
      .sort(function (a, b) {
        return (String(b.date || "") + " " + String(b.time || "") + " " + String(b.source_row || "")).localeCompare(String(a.date || "") + " " + String(a.time || "") + " " + String(a.source_row || ""));
      });
    const bankIncomeRows = bankLedgerRows.filter(function (tx) { return tx.kind !== "expense"; });
    const bankExpenseRows = bankLedgerRows.filter(function (tx) { return tx.kind === "expense"; });
    const defaultInvestment = {
      acquired_date: "2025-08-28",
      purchase_price: 1250000000,
      land_supply_price: 890000000,
      building_supply_price: 360000000,
      brokerage_fee: 11250000,
      acquisition_tax_legal_fee: 62209922,
      completion_date: "2024-07-29",
      registration_date: "2025-07-02",
      defect_warranty_years: 5,
    };
    const investment = { ...defaultInvestment, ...((building && building.investment) || {}) };
    const investmentBasis =
      Number(investment.purchase_price || 0) +
      Number(investment.brokerage_fee || 0) +
      Number(investment.acquisition_tax_legal_fee || 0);
    const depositYieldAnnualRate = 0.05;
    const depositYieldMonthly = Math.round(Number(summary.total_deposit || 0) * depositYieldAnnualRate / 12);
    const buildingDepreciationMonthly = Math.round(Number(investment.building_supply_price || 0) / 360);

    function monthKeyFromDate(dateText) {
      const text = String(dateText || "").slice(0, 7);
      return /^\d{4}-\d{2}$/.test(text) ? text : "";
    }

    function shiftMonthKey(monthText, delta) {
      const parts = String(monthText || "").split("-");
      let year = Number(parts[0]);
      let monthIndex = Number(parts[1] || 1) - 1 + Number(delta || 0);
      if (!year || Number.isNaN(monthIndex)) return "";
      year += Math.floor(monthIndex / 12);
      monthIndex = ((monthIndex % 12) + 12) % 12;
      return String(year).padStart(4, "0") + "-" + String(monthIndex + 1).padStart(2, "0");
    }

    function monthRange(startMonth, endMonth) {
      const rows = [];
      let cursor = startMonth;
      let guard = 0;
      while (cursor && cursor <= endMonth && guard < 240) {
        rows.push(cursor);
        cursor = shiftMonthKey(cursor, 1);
        guard += 1;
      }
      return rows;
    }

    function createProfitBucket(month) {
      return {
        month: month,
        income: 0,
        expense: 0,
        deposit_yield_income: 0,
        depreciation_expense: 0,
        net: 0,
        fcf_income: 0,
        fcf_expense: 0,
        fcf_net: 0,
        fcf_cumulative_net: 0,
        fcf_return_pct: 0,
        fcf_cumulative_return_pct: 0,
        cumulative_net: 0,
        return_pct: 0,
        cumulative_return_pct: 0,
      };
    }

    function isDepositProfitCategory(value) {
      const compact = String(value || "").replace(/\s+/g, "");
      return compact.indexOf("보증금") >= 0 || compact.indexOf("계약금") >= 0 || compact.indexOf("가계약금") >= 0 || compact.indexOf("자본납입") >= 0;
    }

    function isAcquisitionCostTransaction(tx) {
      return String(tx && tx.source_file || "") === "취득정보" || String(tx && tx.source_row || "").indexOf("acq_") === 0;
    }

    const monthlyProfitMap = {};
    function addActualProfitFlow(tx, fallbackTarget) {
      if (!tx || !tx.date) return;
      if (isAcquisitionCostTransaction(tx)) return;
      const month = monthKeyFromDate(tx.date);
      const acquiredMonth = monthKeyFromDate(investment.acquired_date);
      if (!month || (acquiredMonth && month < acquiredMonth)) return;
      const memoKey = String(tx.memo || "").trim();
      const mappedTarget = String(tx.target || fallbackTarget || bankMemoUnitMap[memoKey] || "");
      const category = defaultBankCategory(tx, mappedTarget);
      if (String(tx.kind || "") === "expense" && isProfitWithdrawalCategory(category)) return;
      if (String(tx.kind || "") !== "expense" && isDepositProfitCategory(category)) return;
      const amount = Number(tx.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      monthlyProfitMap[month] = monthlyProfitMap[month] || createProfitBucket(month);
      if (String(tx.kind || "") === "expense") {
        monthlyProfitMap[month].expense += amount;
        monthlyProfitMap[month].fcf_expense += amount;
      } else {
        monthlyProfitMap[month].income += amount;
        monthlyProfitMap[month].fcf_income += amount;
      }
    }

    Object.keys((building && building.units) || {}).forEach(function (unitId) {
      ensureArray(building.units[unitId] && building.units[unitId].transactions).forEach(function (tx) {
        addActualProfitFlow(tx, unitId + "ȣ");
      });
    });
    operatingTransactions.forEach(function (tx) {
      addActualProfitFlow(tx, "공통");
    });
    bankTransactions.forEach(function (tx) {
      addActualProfitFlow(tx, "");
    });
    const acquiredMonth = monthKeyFromDate(investment.acquired_date) || "2025-08";
    const latestProfitMonth = Object.keys(monthlyProfitMap).concat([calendarMonth || isoToday().slice(0, 7)]).sort().slice(-1)[0] || acquiredMonth;
    const monthlyProfitRows = monthRange(acquiredMonth, latestProfitMonth).map(function (month) {
      const bucket = monthlyProfitMap[month] || createProfitBucket(month);
      bucket.deposit_yield_income = depositYieldMonthly;
      bucket.depreciation_expense = buildingDepreciationMonthly;
      bucket.income += depositYieldMonthly;
      bucket.expense += buildingDepreciationMonthly;
      bucket.fcf_income += depositYieldMonthly;
      bucket.fcf_net = bucket.fcf_income - bucket.fcf_expense;
      bucket.fcf_return_pct = investmentBasis ? bucket.fcf_net / investmentBasis * 100 : 0;
      bucket.net = bucket.income - bucket.expense;
      bucket.return_pct = investmentBasis ? bucket.net / investmentBasis * 100 : 0;
      return bucket;
    });
    let cumulativeProfitNet = 0;
    let cumulativeFcfNet = 0;
    monthlyProfitRows.forEach(function (row) {
      cumulativeProfitNet += Number(row.net || 0);
      cumulativeFcfNet += Number(row.fcf_net || 0);
      row.cumulative_net = cumulativeProfitNet;
      row.fcf_cumulative_net = cumulativeFcfNet;
      row.cumulative_return_pct = investmentBasis ? cumulativeProfitNet / investmentBasis * 100 : 0;
      row.fcf_cumulative_return_pct = investmentBasis ? cumulativeFcfNet / investmentBasis * 100 : 0;
    });
    const yearlyProfitMap = {};
    monthlyProfitRows.forEach(function (row) {
      const year = String(row.month || "").slice(0, 4);
      yearlyProfitMap[year] = yearlyProfitMap[year] || { year: year, income: 0, expense: 0, net: 0, return_pct: 0, fcf_income: 0, fcf_expense: 0, fcf_net: 0, fcf_return_pct: 0 };
      yearlyProfitMap[year].income += Number(row.income || 0);
      yearlyProfitMap[year].expense += Number(row.expense || 0);
      yearlyProfitMap[year].net += Number(row.net || 0);
      yearlyProfitMap[year].fcf_income += Number(row.fcf_income || 0);
      yearlyProfitMap[year].fcf_expense += Number(row.fcf_expense || 0);
      yearlyProfitMap[year].fcf_net += Number(row.fcf_net || 0);
    });
    const yearlyProfitRows = Object.keys(yearlyProfitMap).sort().map(function (year) {
      const row = yearlyProfitMap[year];
      row.return_pct = investmentBasis ? row.net / investmentBasis * 100 : 0;
      row.fcf_return_pct = investmentBasis ? row.fcf_net / investmentBasis * 100 : 0;
      return row;
    });
    const investmentProfitSummary = monthlyProfitRows.reduce(function (sum, row) {
      sum.income += Number(row.income || 0);
      sum.expense += Number(row.expense || 0);
      sum.net += Number(row.net || 0);
      sum.fcf_income += Number(row.fcf_income || 0);
      sum.fcf_expense += Number(row.fcf_expense || 0);
      sum.fcf_net += Number(row.fcf_net || 0);
      return sum;
    }, { income: 0, expense: 0, net: 0, fcf_income: 0, fcf_expense: 0, fcf_net: 0 });
    investmentProfitSummary.return_pct = investmentBasis ? investmentProfitSummary.net / investmentBasis * 100 : 0;
    investmentProfitSummary.fcf_return_pct = investmentBasis ? investmentProfitSummary.fcf_net / investmentBasis * 100 : 0;

    function renderBankIncomeTable() {
      return h(
        React.Fragment,
        null,
        h("div", { className: "building-ledger-subhead" }, h(SectionTitle, null, "입금 내역"), h("span", null, numberFormat(bankIncomeRows.length, 0) + "건")),
        h(
          "div",
          { className: "building-bank-table-wrap bank-ledger-wrap" },
          h(
            "table",
            { className: "building-bank-table bank-ledger-table" },
            h("thead", null, h("tr", null, h("th", null, "예정일"), h("th", null, "구분"), h("th", null, "대상"), h("th", null, "항목"), h("th", null, "예정금액"), h("th", null, "실입/출금액"), h("th", null, "상태"))),
            h(
              "tbody",
              null,
              bankIncomeRows.length
                ? bankIncomeRows.map(function (tx) {
                    const memoKey = String(tx.memo || "").trim();
                    const mappedTarget = String(tx.target || bankMemoUnitMap[memoKey] || "");
                    const mappedCategory = defaultBankCategory(tx, mappedTarget);
                    return h(
                      "tr",
                      { key: tx.id || String(tx.source_file || "") + "-" + String(tx.source_row || "") },
                      h("td", null, tx.date || "-"),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-category-select",
                            value: mappedCategory,
                            onChange: function (event) { saveBankMemoCategory(tx, event.target.value); },
                          },
                          bankIncomeCategoryOptions.map(function (category) {
                            return h("option", { key: category, value: category }, category);
                          })
                        )
                      ),
                      h("td", { className: "ok" }, "+" + money(tx.amount)),
                      h("td", { className: "bank-ledger-memo" }, tx.memo || "-"),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-target-select",
                            value: mappedTarget,
                            onChange: function (event) {
                              const nextTarget = event.target.value;
                              saveBankMemoTarget(tx, nextTarget);
                              if ((mappedCategory === "월세+관리비+부가세" || mappedCategory === "은행입금" || mappedCategory === "수동입금" || !mappedCategory) && !nextTarget) {
                                saveBankMemoCategory(tx, "기타입금");
                              }
                            },
                          },
                          bankTargetOptions.map(function (option) {
                            return h("option", { key: option.value, value: option.value }, option.label);
                          })
                        )
                      ),
                      h("td", null, tx.source === "bank_file" ? (tx.source_file || "은행파일") + (tx.source_row ? " #" + tx.source_row : "") : "수동"),
                      h("td", null, h("button", { type: "button", className: "mini-button danger", onClick: function () { deleteBankTransaction(tx); } }, "제거"))
                    );
                  })
                : h("tr", null, h("td", { colSpan: 7 }, "이번 달 예정 입출금이 없습니다."))
            )
          )
        )
      );
    }

    function renderBankExpenseTable() {
      return h(
        React.Fragment,
        null,
        h("div", { className: "building-ledger-subhead" }, h(SectionTitle, null, "출금 내역"), h("span", null, numberFormat(bankExpenseRows.length, 0) + "건")),
        h(
          "div",
          { className: "building-bank-table-wrap bank-ledger-wrap" },
          h(
            "table",
            { className: "building-bank-table bank-ledger-table" },
            h("thead", null, h("tr", null, h("th", null, "예정일"), h("th", null, "구분"), h("th", null, "대상"), h("th", null, "항목"), h("th", null, "예정금액"), h("th", null, "실입/출금액"), h("th", null, "상태"))),
            h(
              "tbody",
              null,
              bankExpenseRows.length
                ? bankExpenseRows.map(function (tx) {
                    const memoKey = String(tx.memo || "").trim();
                    const mappedTarget = String(tx.target || bankMemoUnitMap[memoKey] || "");
                    const mappedCategory = defaultBankCategory(tx, mappedTarget);
                    return h(
                      "tr",
                      { key: tx.id || String(tx.source_file || "") + "-" + String(tx.source_row || "") },
                      h("td", null, tx.date || "-"),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-target-select",
                            value: mappedCategory,
                            onChange: function (event) { saveBankMemoCategory(tx, event.target.value); },
                          },
                          bankExpenseCategoryOptions.map(function (category) {
                            return h("option", { key: category, value: category }, category);
                          })
                        )
                      ),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-target-select",
                            value: tx.payment_method || "현금인출",
                            onChange: function (event) { saveBankPaymentMethod(tx, event.target.value); },
                          },
                          bankPaymentMethodOptions.map(function (method) {
                            return h("option", { key: method, value: method }, method);
                          })
                        )
                      ),
                      h("td", { className: "warn" }, "-" + money(tx.amount)),
                      h("td", { className: "bank-ledger-memo" }, tx.memo || "-"),
                      h("td", null, tx.source === "bank_file" ? (tx.source_file || "은행파일") + (tx.source_row ? " #" + tx.source_row : "") : "수동"),
                      h("td", null, h("button", { type: "button", className: "mini-button danger", onClick: function () { deleteBankTransaction(tx); } }, "제거"))
                    );
                  })
                : h("tr", null, h("td", { colSpan: 7 }, "이번 달 예정 입출금이 없습니다."))
            )
          )
        )
      );
    }

    function renderProfitMoney(value) {
      const number = Number(value || 0);
      return h("span", { className: number >= 0 ? "ok" : "warn" }, (number >= 0 ? "+" : "-") + money(Math.abs(number)));
    }

    function renderProfitRate(value) {
      const number = Number(value || 0);
      return h("span", { className: number >= 0 ? "ok" : "warn" }, (number >= 0 ? "+" : "") + formatPercent(number, 2));
    }

    function renderMonthlyProfitTable() {
      return h(
        "div",
        { className: "building-investment-table-card" },
        h("div", { className: "building-investment-table-title" }, "\uc6d4\ubcc4 \uc218\uc775"),
        h(
          "div",
          { className: "building-investment-table-wrap" },
          h(
            "table",
            { className: "building-bank-table building-investment-table" },
            h("thead", null, h("tr", null, h("th", null, "월"), h("th", null, "수익 입금"), h("th", null, "비용 출금"), h("th", null, "수익금"), h("th", null, "FCF"), h("th", null, "수익률"), h("th", null, "FCF률"), h("th", null, "누적 FCF"))),
            h(
              "tbody",
              null,
              monthlyProfitRows.slice().reverse().map(function (row) {
                return h(
                  "tr",
                  {
                    key: row.month,
                    title: "보증금 운용수익 +" + money(row.deposit_yield_income) + " / 건물 상각비 -" + money(row.depreciation_expense),
                  },
                  h("td", null, row.month),
                  h("td", null, money(row.income)),
                  h("td", null, money(row.expense)),
                  h("td", null, renderProfitMoney(row.net)),
                  h("td", null, renderProfitMoney(row.fcf_net)),
                  h("td", null, renderProfitRate(row.return_pct)),
                  h("td", null, renderProfitRate(row.fcf_return_pct)),
                  h("td", null, renderProfitMoney(row.fcf_cumulative_net))
                );
              })
            )
          )
        )
      );
    }

    function renderYearlyProfitTable() {
      return h(
        "div",
        { className: "building-investment-table-card" },
        h("div", { className: "building-investment-table-title" }, "\uc5f0\ub3c4\ubcc4 \uc218\uc775"),
        h(
          "div",
          { className: "building-investment-table-wrap compact" },
          h(
            "table",
            { className: "building-bank-table building-investment-table" },
            h("thead", null, h("tr", null, h("th", null, "연도"), h("th", null, "수익 입금"), h("th", null, "비용 출금"), h("th", null, "수익금"), h("th", null, "FCF"), h("th", null, "수익률"), h("th", null, "FCF률"))),
            h(
              "tbody",
              null,
              yearlyProfitRows.slice().reverse().map(function (row) {
                return h(
                  "tr",
                  { key: row.year },
                  h("td", null, row.year),
                  h("td", null, money(row.income)),
                  h("td", null, money(row.expense)),
                  h("td", null, renderProfitMoney(row.net)),
                  h("td", null, renderProfitMoney(row.fcf_net)),
                  h("td", null, renderProfitRate(row.return_pct)),
                  h("td", null, renderProfitRate(row.fcf_return_pct))
                );
              })
            )
          )
        )
      );
    }

    function renderInvestmentProfitPanel() {
      return h(
        "div",
        { className: "panel building-investment-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h("div", null, h(SectionTitle, null, "실제 수익금 / 수익률"), h("div", { className: "summary-help" }, "보증금성 입금은 수익에서 제외하고, 보증금 운용수익 5%/년과 건물 30년 정액상각 비용을 월별로 반영합니다.")),
          h("span", { className: "building-bank-status ok" }, "실제 입출금 기준")
        ),
        h(
          "div",
          { className: "summary-grid summary-grid-small building-investment-summary" },
          h(SummaryCard, { label: "투자원금", value: money(investmentBasis), help: "매매대금+중개수수료+취득세/법무사" }),
          h(SummaryCard, { label: "누적 수익 입금", value: money(investmentProfitSummary.income), help: "보증금 제외 실제 입금+보증금 운용수익" }),
          h(SummaryCard, { label: "누적 비용 출금", value: money(investmentProfitSummary.expense), help: "실제 출금+건물 상각비, 수익 출금 제외" }),
          h(SummaryCard, { label: "누적 수익금", value: money(investmentProfitSummary.net), help: "실입금-실출금" }),
          h(SummaryCard, { label: "누적 수익률", value: formatPercent(investmentProfitSummary.return_pct, 2), help: "누적 수익금 / 투자원금" }),
          h(SummaryCard, { label: "FCF 누적 수익", value: money(investmentProfitSummary.fcf_net), help: "취득금액과 건물 상각비 제외" }),
          h(SummaryCard, { label: "FCF 수익률", value: formatPercent(investmentProfitSummary.fcf_return_pct, 2), help: "FCF 누적 수익 / 투자원금" })
        ),
        h(
          "div",
          { className: "building-investment-facts" },
          h("span", null, "취득일 ", h("strong", null, investment.acquired_date || "-")),
          h("span", null, "준공일 ", h("strong", null, investment.completion_date || "-")),
          h("span", null, "등기일 ", h("strong", null, investment.registration_date || "-")),
          h("span", null, "하자보수 ", h("strong", null, "준공 후 " + numberFormat(investment.defect_warranty_years || 0, 0) + "년")),
          h("span", null, "토지 ", h("strong", null, money(investment.land_supply_price))),
          h("span", null, "건물 ", h("strong", null, money(investment.building_supply_price))),
          h("span", null, "보증금 운용수익 ", h("strong", null, money(depositYieldMonthly) + "/월")),
          h("span", null, "건물 상각비 ", h("strong", null, money(buildingDepreciationMonthly) + "/월")),
          h("span", null, "중개수수료 ", h("strong", null, money(investment.brokerage_fee))),
          h("span", null, "취득세/법무사 ", h("strong", null, money(investment.acquisition_tax_legal_fee)))
        ),
        h(
          "div",
          { className: "building-investment-grid" },
          renderMonthlyProfitTable(),
          renderYearlyProfitTable()
        )
      );
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel building-hero" },
        h("div", { className: "eyebrow" }, "Real Estate"),
        h("h1", { className: "page-title" }, "\uac74\ubb3c \uad00\ub9ac"),
        h("p", { className: "page-copy compact-copy" }, "호실별 계약, 수도세, 입출금 내역을 관리하고 월별/연별 수익을 확인합니다.")
      ),
      request.loading && !data ? h(LoadingPanel, { label: request.label }) : null,
      request.error ? h("div", { className: "notice-box" }, request.error) : null,
      message ? h("div", { className: "notice-box compact" }, message) : null,
      h(
        "div",
        { className: "panel building-calendar-panel" },
        h(
          "div",
          { className: "building-calendar-head" },
          h(
            "button",
            {
              type: "button",
              className: "building-collapse-button",
              onClick: function () { setCalendarOpen(!calendarOpen); },
            },
            h("span", null, calendarOpen ? "?" : "?"),
            h("strong", null, "입출금 캘린더")
          ),
          renderCalendarMonthControls("top")
        ),
        calendarOpen
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "building-calendar-weekdays" },
                ["일", "월", "화", "수", "목", "금", "토"].map(function (label) {
                  return h("span", { key: label }, label);
                })
              ),
              h(
                "div",
                { className: "building-calendar-grid" },
                calendarDays.map(function (day, index) {
                  if (!day) {
                    return h("div", { key: "blank-" + index, className: "building-calendar-day blank" });
                  }
                  const hasEntries = day.entries.length > 0;
                  const hasMoneyEntries = day.entries.some(function (entry) { return entry.kind !== "event"; });
                  const actualMoneyEntries = day.entries.filter(function (entry) { return entry.kind !== "event" && entry.kind !== "expected_income" && entry.kind !== "expected_expense"; });
                  const actualNet = actualMoneyEntries.reduce(function (sum, entry) { return sum + Number(entry.signed || 0); }, 0);
                  const hasActualMoneyEntries = actualMoneyEntries.length > 0;
                  return h(
                    "button",
                    {
                      key: day.date,
                      type: "button",
                      className: "building-calendar-day" + (hasEntries ? " has-entries" : "") + (day.date === isoToday() ? " today" : ""),
                      onClick: function () { openCalendarDate(day.date); },
                    },
                    h("span", { className: "building-calendar-date" }, day.day),
                    hasActualMoneyEntries
                      ? h("strong", { className: actualNet >= 0 ? "positive" : "negative" }, (actualNet >= 0 ? "+" : "") + money(actualNet))
                      : hasMoneyEntries
                        ? h("strong", { className: "expected" }, "예정")
                        : hasEntries ? h("em", null, "일정") : h("em", null, "기록"),
                    h(
                      "div",
                      { className: "building-calendar-chips" },
                      day.entries.map(function (entry, entryIndex) {
                        return h("span", { key: entryIndex, className: entry.kind === "event" ? "event" : entry.kind === "expected_income" ? "expected-income" : entry.kind === "expected_expense" ? "expected-expense" : entry.signed >= 0 ? "income" : "expense" }, calendarEntryChipLabel(entry));
                      })
                    )
                  );
                })
              )
            )
          : h("div", { className: "summary-help" }, "캘린더가 접혀 있습니다. 날짜별 입출금 기록은 펼쳐서 확인할 수 있습니다.")
      ),
      h(
        "div",
        { className: "summary-grid building-summary-grid" },
        h(SummaryCard, { label: "입주율", value: numberFormat(summary.occupancy_rate || 0, 1) + "%", help: numberFormat(summary.occupied_count || 0, 0) + " / " + numberFormat(summary.units_count || 10, 0) + "호" }),
        h(SummaryCard, { label: "예상 월수입", value: money(summary.expected_monthly_income), help: "월세+부가세+관리비+수도세" }),
        h(SummaryCard, { label: "예상 월 순수익", value: money(summary.expected_monthly_net_income), help: "수입-전기세/용역/서비스" }),
        h(SummaryCard, { label: "예상 연 순수익", value: money(summary.expected_yearly_net_income), help: "월 순수익 x 12" }),
        h(SummaryCard, { label: "총 보증금", value: money(summary.total_deposit), help: "입력 계약 기준" }),
        h(SummaryCard, { label: "이번달 순입출금", value: money(selectedMonthActualNet), help: calendarMonth + " 실제 입출금 기준" }),
        h(SummaryCard, { label: "올해 순입출금", value: money(summary.actual_year_net_income), help: "실제 기록 기준" })
      ),
      h(
        "div",
        { className: "panel building-layout-panel" },
        h(
          "div",
          { className: "building-section-head" },
              h(SectionTitle, null, "수도세"),
          h(
            "div",
            { className: "building-area-total" },
            h("span", null, "전체 " + numberFormat((Number(areaTotals.exclusive_m2 || 0) + Number(areaTotals.parking_m2 || 0) + Number(areaTotals.common_m2 || 0)), 2) + "m²"),
            h("strong", null, "전용 " + numberFormat(areaTotals.exclusive_py || 0, 2) + "평 / 분양 " + numberFormat(areaTotals.sale_py || 0, 2) + "평")
          )
        ),
        h(
          "div",
          { className: "building-floor-stack" },
          layout.map(function (floor) {
            return h(
              "div",
              { key: floor.floor, className: "building-floor-row" },
              h("div", { className: "building-floor-label" }, floor.floor),
              h("div", { className: "building-unit-grid" }, ensureArray(floor.units).map(renderUnit))
            );
          })
        )
      ),
      h(
        "div",
        { className: "panel building-ledger-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h(SectionTitle, null, "용역/서비스 계약"),
          serviceEditMode
            ? h("div", { className: "button-row compact" },
                h("button", { type: "button", className: "mini-button", onClick: addService }, "항목 추가"),
                h("button", { type: "button", className: "mini-button", onClick: cancelServiceEdit }, "취소"),
                h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: saveServices }, saving ? "저장 중..." : "저장")
              )
            : h("button", { type: "button", className: "mini-button", onClick: beginServiceEdit }, "수정")
        ),
        serviceEditMode
          ? h(
              "div",
              { className: "building-service-list" },
              serviceContracts.length
                ? serviceContracts.map(function (service, index) {
                    return h(
                      "div",
                      { key: service.id || index, className: "building-service-row" },
                      h(
                        "select",
                        { value: service.category || "CCTV", onChange: function (event) { setService(index, "category", event.target.value); } },
                        serviceCategoryOptions.map(function (category) {
                          return h("option", { key: category, value: category }, category);
                        })
                      ),
                      h("input", { value: service.vendor || "", placeholder: "업체/계약처", onChange: function (event) { setService(index, "vendor", event.target.value); } }),
                      h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(service.amount), placeholder: "금액", onChange: function (event) { setService(index, "amount", cleanNumberInput(event.target.value)); } }),
                      h(
                        "select",
                        { value: service.cycle || "monthly", onChange: function (event) { setService(index, "cycle", event.target.value); } },
                        h("option", { value: "monthly" }, "매월"),
                        h("option", { value: "yearly" }, "년에 한번")
                      ),
                      (service.cycle === "yearly" || service.cycle === "annual")
                        ? h("input", { type: "date", value: service.payment_date || service.annual_payment_date || service.yearly_payment_date || "", title: "연 1회 지급일", onChange: function (event) { setService(index, "payment_date", event.target.value); } })
                        : h(
                            "select",
                            { value: String(service.payment_day || service.due_day || "1"), onChange: function (event) { setService(index, "payment_day", Number(event.target.value)); } },
                            Array.from({ length: 31 }).map(function (_, dayIndex) {
                              const day = String(dayIndex + 1);
                              return h("option", { key: day, value: day }, "매월 " + day + "일");
                            })
                          ),
                      h("input", { type: "date", value: service.start_date || "", onChange: function (event) { setService(index, "start_date", event.target.value); } }),
                      h("input", { value: service.memo || "", placeholder: "메모", onChange: function (event) { setService(index, "memo", event.target.value); } }),
                      h("button", { type: "button", className: "mini-button danger", onClick: function () { removeService(index); } }, "삭제")
                    );
                  })
                : h("div", { className: "summary-help" }, "등록된 용역/서비스 계약이 없습니다. 수정을 눌러 항목을 추가하세요.")
            )
          : h(
              "div",
              { className: "building-service-view-list" },
              serviceContracts.length
                ? serviceContracts.map(function (service, index) {
                    const cycle = service.cycle === "yearly" || service.cycle === "annual" ? "년에 한번" : "매월";
                    const payText = cycle === "년에 한번"
                      ? (service.payment_date || service.annual_payment_date || service.yearly_payment_date || "지급일 미정")
                      : "매월 " + String(service.payment_day || service.due_day || 1) + "일";
                    return h(
                      "div",
                      { key: service.id || index, className: "building-service-view-row" },
                      h("strong", null, service.category || "기타"),
                      h("span", null, service.vendor || "-"),
                      h("em", null, money(service.amount)),
                      h("small", null, cycle + " · " + payText + (service.start_date ? " · 시작 " + service.start_date : "")),
                      service.memo ? h("small", { className: "memo" }, service.memo) : null
                    );
                  })
                : h("div", { className: "summary-help" }, "등록된 용역/서비스 계약이 없습니다.")
            )
      ),
      h(
        "div",
        { className: "panel building-ledger-panel" },
        h(
          "div",
          { className: "building-section-head" },
              h(SectionTitle, null, "수도세"),
          h("div", { className: "button-row compact" },
            h("button", { type: "button", className: "mini-button", onClick: addOperatingTransaction }, "입출금 추가"),
            h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: function () { saveBuildingData(building, false); } }, saving ? "저장 중..." : "저장")
          )
        ),
        h(
          "div",
          { className: "building-transaction-list" },
          operatingTransactions.length
            ? operatingTransactions.map(function (tx, index) {
                return h(
                  "div",
                  { key: tx.id || index, className: "building-transaction-row global" },
                  h("input", { type: "date", value: tx.date || "", onChange: function (event) { setOperatingTransaction(index, "date", event.target.value); } }),
                  h("select", { value: tx.kind || "expense", onChange: function (event) { setOperatingTransaction(index, "kind", event.target.value); } }, h("option", { value: "income" }, "입금"), h("option", { value: "expense" }, "출금")),
                  h("input", { value: tx.category || "", placeholder: "항목", onChange: function (event) { setOperatingTransaction(index, "category", event.target.value); } }),
                  h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(tx.amount), placeholder: "금액", onChange: function (event) { setOperatingTransaction(index, "amount", cleanNumberInput(event.target.value)); } }),
                  h("input", { value: tx.memo || "", placeholder: "메모", onChange: function (event) { setOperatingTransaction(index, "memo", event.target.value); } }),
                  h("button", { type: "button", className: "mini-button danger", onClick: function () { removeOperatingTransaction(index); } }, "삭제")
                );
              })
                        : h("div", { className: "summary-help" }, "입출금 내역이 없습니다.")
        )
      ),
      h(
        "div",
        { className: "panel building-ledger-panel" },
        h(SectionTitle, null, "수익/비용 계산"),
        h(
          "div",
          { className: "building-profit-table" },
          ensureArray(summary.profit_rows).map(function (row, index) {
            const isWaterRow = String(row.label || "").indexOf("수도세") === 0;
            const isElectricRow = row.label === "전기세 청구";
            return h(
              "div",
              {
                key: row.label || index,
                className: "building-profit-row " + (row.kind || "") + (isWaterRow || isElectricRow ? " clickable" : ""),
                onClick: isWaterRow ? function () { setWaterPanelOpen(!waterPanelOpen); } : isElectricRow ? function () { setElectricPanelOpen(!electricPanelOpen); } : undefined,
                role: isWaterRow || isElectricRow ? "button" : undefined,
                tabIndex: isWaterRow || isElectricRow ? 0 : undefined,
              },
              h("span", null, row.kind === "minus" ? "-" : row.kind === "plus" ? "+" : "="),
              h("strong", null, row.label + (isWaterRow ? (waterPanelOpen ? " 접기" : " 보기") : isElectricRow ? (electricPanelOpen ? " 접기" : " 보기") : "")),
              h("em", null, "월 " + money(row.monthly)),
              h("em", null, "연 " + money(row.yearly))
            );
          })
        ),
        waterPanelOpen
          ? h(
              "div",
              { className: "building-water-panel" },
              h(
                "div",
                { className: "building-section-head" },
                h(SectionTitle, null, "수도 검침/청구 배분표"),
                h(
                  "div",
                  { className: "button-row compact" },
                  h("button", { type: "button", className: "mini-button", disabled: syncingWater, onClick: syncWaterFromTelegram }, syncingWater ? "불러오는 중..." : "텔레그램 수도 알림 불러오기"),
                  h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: function () { saveBuildingData(building, false); } }, saving ? "저장 중..." : "수도 데이터 저장")
                )
              ),
              h("div", { className: "building-ledger-note" }, "총 수도요금과 총 사용량은 텔레그램 엄마 방의 [중부수도사업소 알림]을 불러와 자동 입력할 수 있습니다. 공용 사용량은 총 사용량에서 호실 계량기 합계를 뺀 값으로 계산합니다."),
              h(
                "div",
                { className: "building-water-table-wrap" },
                h(
                  "table",
                  { className: "building-water-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      unitIds.map(function (unitId) { return h("th", { key: unitId }, unitId); })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    waterBillingMonths.map(function (month, monthIndex) {
                      const calculated = waterBillingRows.find(function (row) { return row.month === month.month; }) || {};
                      const calculatedUnits = ensureArray(calculated.units);
                      return h(
                        "tr",
                        { key: month.month || monthIndex },
                        h("td", null, h("input", { value: month.month || "", onChange: function (event) { setWaterBillingMonth(monthIndex, "month", event.target.value); } })),
                        h("td", null, h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.total_usage_m3), placeholder: "예: 15", onChange: function (event) { setWaterBillingMonth(monthIndex, "total_usage_m3", cleanNumberInput(event.target.value)); } })),
                        h("td", null, h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.total_bill), placeholder: "상가 전체 수도요금", onChange: function (event) { setWaterBillingMonth(monthIndex, "total_bill", cleanNumberInput(event.target.value)); } })),
                        h("td", { className: "readonly" }, numberFormat(calculated.common_usage_m3 || 0, 2)),
                        h("td", { className: "readonly" }, money(calculated.common_amount || 0)),
                        unitIds.map(function (unitId) {
                          const unitCalc = calculatedUnits.find(function (item) { return item.unit_id === unitId; }) || {};
                          return h(
                            "td",
                            { key: unitId },
                            h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.readings && month.readings[unitId] != null ? month.readings[unitId] : ""), onChange: function (event) { setWaterReading(monthIndex, unitId, cleanNumberInput(event.target.value)); } }),
                            h("small", null, money(unitCalc.amount || 0))
                          );
                        })
                      );
                    })
                  )
                )
              ),
              h("div", { className: "building-ledger-note" }, "연말에는 아래 연도별 호실 수도세 합계를 기준으로 실제 입금 내역의 '수도세' 항목과 대조합니다."),
              h(
                "div",
                { className: "building-water-table-wrap" },
                h(
                  "table",
                  { className: "building-water-table building-water-yearly-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      unitIds.map(function (unitId) { return h("th", { key: unitId }, unitId); })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    waterYearlyRows.length
                      ? waterYearlyRows.map(function (row) {
                          const units = ensureArray(row.units);
                          return h(
                            "tr",
                            { key: row.year },
                            h("td", null, row.year),
                            h("td", { className: "readonly" }, money(row.total_bill || 0)),
                            h("td", { className: "readonly" }, money(row.charge_amount || 0)),
                            h("td", { className: "readonly" }, money(row.common_amount || 0)),
                            h("td", { className: "readonly ok" }, money(row.paid_total || 0)),
                            h("td", { className: Number(row.outstanding_total || 0) > 0 ? "readonly warn" : "readonly ok" }, money(row.outstanding_total || 0)),
                            unitIds.map(function (unitId) {
                              const unit = units.find(function (item) { return item.unit_id === unitId; }) || {};
                              return h(
                                "td",
                                { key: unitId, className: "readonly" },
                                h("strong", null, money(unit.amount || 0)),
                                h("small", null, "납부 " + money(unit.paid_amount || 0))
                              );
                            })
                          );
                        })
                      : h("tr", null, h("td", { colSpan: unitIds.length + 6 }, "연도별 수도세 정산 데이터가 없습니다."))
                  )
                )
              )
            )
          : null,
        electricPanelOpen
          ? h(
              "div",
              { className: "building-water-panel building-electric-panel" },
              h(
                "div",
                { className: "building-section-head" },
              h(SectionTitle, null, "수도세"),
                h(
                  "div",
                  { className: "button-row compact" },
                  h("button", { type: "button", className: "mini-button", onClick: addElectricityMonth }, "월 추가"),
                  h("button", { type: "button", className: "mini-button", disabled: syncingElectric, onClick: syncElectricityFromTelegram }, syncingElectric ? "불러오는 중..." : "텔레그램 한국전력 청구서 불러오기"),
                  h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: function () { saveBuildingData(building, false); } }, saving ? "저장 중..." : "전기요금 저장")
                )
              ),
              h("div", { className: "building-ledger-note" }, "텔레그램 엄마 방의 한국전력 모바일 청구서에서 고객번호를 찾아 호실별 전기요금을 정리합니다. 고객번호별 금액은 직접 수정할 수도 있습니다."),
              h(
                "div",
                { className: "building-water-table-wrap" },
                h(
                  "table",
                  { className: "building-water-table building-electric-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "\uccad\uad6c\uc6d4"),
                      h("th", null, "\ucd1d\uae08\uc561"),
                      electricCustomers.map(function (customer) {
                        return h("th", { key: customer.unit_id }, customer.label + " " + customer.customer_no);
                      })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    electricityBillingMonths.length
                      ? electricityBillingMonths.map(function (month, monthIndex) {
                          const calculated = electricityBillingRows.find(function (row) { return row.month === month.month; }) || {};
                          return h(
                            "tr",
                            { key: month.month || monthIndex },
                            h("td", null, h("input", { value: month.month || "", placeholder: "YYYY-MM", onChange: function (event) { setElectricityBillingMonth(monthIndex, "month", event.target.value); } })),
                            h("td", { className: "readonly" }, money(calculated.total_bill || month.total_bill || 0)),
                            electricCustomers.map(function (customer) {
                              return h(
                                "td",
                                { key: customer.unit_id },
                                h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.bills && month.bills[customer.unit_id] != null ? month.bills[customer.unit_id] : ""), placeholder: "0", onChange: function (event) { setElectricityBill(monthIndex, customer.unit_id, cleanNumberInput(event.target.value)); } })
                              );
                            })
                          );
                        })
                      : h("tr", null, h("td", { colSpan: electricCustomers.length + 2 }, "등록된 전기요금 청구월이 없습니다. 월 추가 또는 텔레그램 불러오기를 눌러주세요."))
                  )
                )
              )
            )
          : null,
        h("div", { className: "building-ledger-note" }, "일회성 비용은 실제 가계부에는 반영되지만 예상 월 고정비 계산에서는 제외됩니다.")
      ),
      h(
        "div",
        { className: "panel building-ledger-panel building-bank-panel" },
        h(
          "div",
          { className: "building-section-head" },
              h(SectionTitle, null, "수도세"),
          h("span", { className: "building-bank-status " + (bankImportErrors.length ? "warn" : "ok") }, bankImportErrors.length ? "확인 필요" : "파일 기반")
        ),
        h(
          "div",
          { className: "building-bank-actions" },
                  h("span", null, "현재 청구 기준"),
          h(
            "button",
            {
              type: "button",
              className: "mini-button primary",
              disabled: syncingBank,
              onClick: importBankFiles,
            },
            syncingBank ? "새로고침 중..." : "거래내역 새로고침"
          )
        ),
        h(
          "div",
          { className: "building-ledger-note" },
          "\ud558\ub098\uc740\ud589 \uacc4\uc88c \uc785\ucd9c\uae08 \ub0b4\uc5ed\uc740 \uae30\ubcf8\uc801\uc73c\ub85c \uc790\ub3d9 \ub9e4\uce6d\ub41c \uc0c1\ud0dc\ub85c \ud45c\uc2dc\ub429\ub2c8\ub2e4. \uc2e0\uaddc \ud30c\uc77c\uc740 D:\\Study\\\uc0c1\uac00_\uad00\ub9ac_\ub370\uc774\ud130\\\uacc4\uc88c\uc785\ucd9c\uae08\ub0b4\uc5ed \ud3f4\ub354\uc5d0\uc11c \uc77d\uace0, \uacfc\uac70 \ub370\uc774\ud130\ub294 \uac70\ub798\ub0b4\uc5ed\uc870\ud68c_\uae30\ubcf8\uc5d0\uc11c \uac00\uc838\uc635\ub2c8\ub2e4. \uc774\ud6c4\uc5d0\ub294 \uac70\ub798\ub0b4\uc5ed\uc870\ud68c_202605 \uac19\uc740 \uc6d4\ubcc4 \ud30c\uc77c\uba85\uc744 \ucd94\uac00\ud558\uba74 \uc790\ub3d9\uc73c\ub85c \ubd88\ub7ec\uc635\ub2c8\ub2e4." +
            (bankImport.last_imported_at ? " 마지막 불러오기: " + bankImport.last_imported_at : "")
        ),
        bankImportErrors.length
          ? h("div", { className: "notice-box compact" }, "읽지 못한 파일: " + bankImportErrors.map(function (file) { return file.file; }).join(", "))
          : null,
        h(
          "div",
          { className: "building-bank-summary" },
          h("div", null, h("span", null, "예정 입금"), h("strong", null, money(bankExpectedIncome)), h("em", null, "월세+관리비+연말 수도세")),
          h("div", null, h("span", null, "실제 입금"), h("strong", null, money(bankActualIncome)), h("em", { className: bankActualIncome >= bankExpectedIncome ? "ok" : "warn" }, bankActualIncome >= bankExpectedIncome ? "정상" : "부족 " + money(bankExpectedIncome - bankActualIncome))),
          h("div", null, h("span", null, "예정 출금"), h("strong", null, money(bankExpectedExpense)), h("em", null, "용역/서비스 예정")),
          h("div", null, h("span", null, "실제 출금"), h("strong", null, money(bankActualExpense)), h("em", { className: bankActualExpense <= bankExpectedExpense ? "ok" : "warn" }, bankActualExpense <= bankExpectedExpense ? "범위 내" : "초과 " + money(bankActualExpense - bankExpectedExpense)))
        ),
        h(
          "div",
          { className: "building-bank-table-wrap" },
          h(
            "table",
            { className: "building-bank-table" },
            h("thead", null, h("tr", null, h("th", null, "예정일"), h("th", null, "구분"), h("th", null, "대상"), h("th", null, "항목"), h("th", null, "예정금액"), h("th", null, "실입/출금액"), h("th", null, "상태"))),
            h(
              "tbody",
              null,
              expectedBankRows.length
                ? expectedBankRows.map(function (row, index) {
                    const isIncome = row.kind === "expected_income";
                    const matchedActualRows = actualBankRows.filter(function (tx) {
                        const sameDirection = isIncome ? tx.kind !== "expense" : tx.kind === "expense";
                        const txCategory = String(tx.category || "");
                        const rowCategory = String(row.category || "");
                        const sameTarget = !tx.target || !row.target || row.target === "공통" || tx.target === row.target;
                        const sameCategory = sameBankCategoryForExpected(txCategory, rowCategory);
                        return sameDirection && sameTarget && sameCategory && String(tx.date || "").slice(0, 7) === calendarMonth;
                      });
                    const actualSum = matchedActualRows.reduce(function (sum, tx) { return sum + Number(tx.amount || 0); }, 0);
                    const expectedAmount = Number(row.amount || 0);
                    const diff = actualSum - expectedAmount;
                    const tolerance = 1;
                    const ok = expectedAmount > 0 && Math.abs(diff) <= tolerance;
                    const statusText = ok
                      ? "확인"
                      : actualSum > 0
                        ? (diff > 0 ? "초과 " : "부족 ") + money(Math.abs(diff))
                        : "미확인";
                    const actualHelp = matchedActualRows.length
                      ? matchedActualRows.map(function (tx) {
                          return [tx.date || "", tx.display_target || tx.target || "", tx.category || "", money(tx.amount)].filter(Boolean).join(" · ");
                        }).join("\n")
                      : "조건에 맞는 실제 입출금이 없습니다.";
                    return h(
                      "tr",
                      { key: index, title: actualHelp },
                      h("td", null, row.date),
                      h("td", null, isIncome ? "입금" : "출금"),
                      h("td", null, row.target),
                      h("td", null, row.category),
                      h("td", { className: "building-expected-amount", title: expectedAmountBreakdownTitle(row) }, expectedAmountWithBreakdown(row)),
                      h("td", { className: ok ? "ok" : actualSum > 0 ? "warn" : "" }, money(actualSum)),
                      h("td", { className: ok ? "ok" : "warn" }, statusText)
                    );
                  })
                : h("tr", null, h("td", { colSpan: 7 }, "\ud45c\uc2dc\ud560 \uc6d4\ubcc4 \uc785\ucd9c\uae08 \ub0b4\uc5ed\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."))
            )
          )
        ),
              h(SectionTitle, null, "수도세"),
        h(
          "div",
          { className: "building-bank-manual" },
          h("input", { type: "date", value: bankDraft.date || "", onChange: function (event) { setBankDraftField("date", event.target.value); } }),
          h(
            "select",
            {
              value: bankDraft.kind || "income",
              onChange: function (event) {
                const nextKind = event.target.value;
                setBankDraft(function (current) {
                  return {
                    ...(current || {}),
                    kind: nextKind,
                    category: nextKind === "expense" ? "세금" : ((current && current.target) ? "월세+관리비+부가세" : "기타입금"),
                  };
                });
              },
            },
            h("option", { value: "income" }, "입금"),
            h("option", { value: "expense" }, "출금")
          ),
          bankDraft.kind === "expense"
            ? h(
                "select",
                {
                  value: bankDraft.category || "세금",
                  onChange: function (event) { setBankDraftField("category", event.target.value); },
                },
                bankExpenseCategoryOptions.map(function (category) { return h("option", { key: category, value: category }, category); })
              )
            : h("input", {
                type: "text",
                placeholder: "대상/호실",
                value: bankDraft.target || "",
                onChange: function (event) {
                  const nextTarget = event.target.value;
                  setBankDraft(function (current) {
                    const currentCategory = String((current && current.category) || "").trim();
                    const shouldDefaultCategory = !currentCategory || currentCategory === "수동입금";
                    return {
                      ...(current || {}),
                      target: nextTarget,
                      category: shouldDefaultCategory ? (String(nextTarget || "").trim() ? "월세+관리비+부가세" : "기타입금") : currentCategory,
                    };
                  });
                },
              }),
          bankDraft.kind === "expense"
            ? h("span", { className: "bank-ledger-category-pill" }, "비용분류")
            : h(
                "select",
                { value: bankDraft.category || (bankDraft.target ? "월세+관리비+부가세" : "기타입금"), onChange: function (event) { setBankDraftField("category", event.target.value); } },
                bankIncomeCategoryOptions.map(function (category) { return h("option", { key: category, value: category }, category); })
              ),
          bankDraft.kind === "expense"
            ? h(
                "select",
                {
                  value: bankDraft.payment_method || "현금인출",
                  onChange: function (event) { setBankDraftField("payment_method", event.target.value); },
                },
                bankPaymentMethodOptions.map(function (method) { return h("option", { key: method, value: method }, method); })
              )
            : null,
          h("input", { type: "text", inputMode: "decimal", placeholder: "금액", value: formatNumberInput(bankDraft.amount), onChange: function (event) { setBankDraftField("amount", cleanNumberInput(event.target.value)); } }),
          h("input", { type: "text", placeholder: "메모", value: bankDraft.memo || "", onChange: function (event) { setBankDraftField("memo", event.target.value); } }),
          h("button", { type: "button", className: "mini-button primary", disabled: saving, onClick: saveManualBankTransaction }, "직접 추가")
        ),
        renderBankIncomeTable(),
        renderBankExpenseTable()
      ),
      h(
        "div",
        { className: "panel building-page-bottom-calendar-controls" },
        h("span", null, "입출금 캘린더 월 이동"),
        renderCalendarMonthControls("bottom")
      ),
      renderInvestmentProfitPanel(),
      calendarDraft
        ? h(
            "div",
            { className: "modal-backdrop", onMouseDown: function (event) { if (event.target === event.currentTarget) closeCalendarDate(); } },
            h(
              "div",
              { className: "building-modal building-calendar-modal" },
              h(
                "div",
                { className: "building-modal-head" },
                h("div", null, h("div", { className: "eyebrow" }, "Calendar"), h("h2", null, calendarDate + " 입출금")),
                h("button", { type: "button", className: "mini-button", onClick: closeCalendarDate }, "닫기")
              ),
              h(
                "div",
                { className: "building-calendar-existing" },
                selectedCalendarEntries.length
                  ? selectedCalendarEntries.map(function (entry, index) {
                      return h(
                        "div",
                        { key: index, className: "building-calendar-existing-row " + (entry.kind === "event" ? "event" : entry.kind === "expected_income" ? "expected-income" : entry.kind === "expected_expense" ? "expected-expense" : entry.signed >= 0 ? "income" : "expense") },
                        h("strong", null, calendarEntryTargetLabel(entry)),
                        h("span", null, entry.category || "-"),
                        h("em", null, entry.kind === "event" ? "일정" : (entry.kind === "expected_income" || entry.kind === "expected_expense" ? "예정 " : "") + (entry.signed >= 0 ? "+" : "") + money(entry.signed)),
                        h("small", null, entry.memo || "")
                      );
                    })
                  : h("div", { className: "summary-help" }, "이 날짜의 기존 입출금 기록이 없습니다.")
              ),
              h(SectionTitle, null, "새 기록 추가"),
              h(
                "div",
                { className: "building-form-grid" },
                h(
                  "label",
                  { className: "building-field" },
                  h("span", null, "현재 청구 기준"),
                  h(
                    "select",
                    {
                      value: calendarDraft.target || "common",
                      onChange: function (event) { setCalendarDraftField("target", event.target.value); },
                    },
                    h("option", { value: "common" }, "공통 운영 가계부"),
                    h("option", { value: "unit" }, "호실별 입출금")
                  )
                ),
                calendarDraft.target === "unit"
                  ? h(
                      "label",
                      { className: "building-field" },
                      h("span", null, "호실"),
                      h(
                        "select",
                        {
                          value: calendarDraft.unit_id || "",
                          onChange: function (event) { setCalendarDraftField("unit_id", event.target.value); },
                        },
                        h("option", { value: "" }, "호실 선택"),
                        unitIds.map(function (unitId) {
                          return h("option", { key: unitId, value: unitId }, unitId + "ȣ");
                        })
                      )
                    )
                  : null,
                h(
                  "label",
                  { className: "building-field" },
                  h("span", null, "입출금"),
                  h(
                    "select",
                    {
                      value: calendarDraft.kind || "income",
                      onChange: function (event) { setCalendarDraftField("kind", event.target.value); },
                    },
                    h("option", { value: "income" }, "입금"),
                    h("option", { value: "expense" }, "출금")
                  )
                ),
                renderField("날짜", calendarDraft.date, function (value) { setCalendarDraftField("date", value); }, "date"),
                renderField("항목", calendarDraft.category, function (value) { setCalendarDraftField("category", value); }),
                renderField("금액", calendarDraft.amount, function (value) { setCalendarDraftField("amount", value); }, "number"),
                renderField("메모", calendarDraft.memo, function (value) { setCalendarDraftField("memo", value); })
              ),
              h("div", { className: "building-modal-actions" },
                h("button", { type: "button", className: "secondary-button", onClick: closeCalendarDate }, "취소"),
                h("button", { type: "button", className: "primary-button", disabled: saving || (calendarDraft.target === "unit" && !calendarDraft.unit_id), onClick: saveCalendarTransaction }, saving ? "저장 중..." : "기록 저장")
              )
            )
          )
        : null,
      draft
        ? h(
            "div",
            { className: "modal-backdrop", onMouseDown: function (event) { if (event.target === event.currentTarget) closeUnit(); } },
            h(
              "div",
              { className: "building-modal" },
              h(
                "div",
                { className: "building-modal-head" },
                h("div", null, h("div", { className: "eyebrow" }, "Unit"), h("h2", null, selectedUnitId + "호 계약/입출금")),
                h("button", { type: "button", className: "mini-button", onClick: closeUnit }, "닫기")
              ),
              h(
                "div",
                { className: "building-area-detail" },
                h("div", null, h("span", null, "전용"), h("strong", null, numberFormat((draft.area && draft.area.exclusive_py) || 0, 2) + "평"), h("em", null, numberFormat((draft.area && draft.area.exclusive_m2) || 0, 2) + "m²")),
                h("div", null, h("span", null, "주차"), h("strong", null, numberFormat((draft.area && draft.area.parking_m2) || 0, 2) + "m²")),
                h("div", null, h("span", null, "공용"), h("strong", null, numberFormat((draft.area && draft.area.common_m2) || 0, 2) + "m²")),
                h("div", null, h("span", null, "분양"), h("strong", null, numberFormat((draft.area && draft.area.sale_py) || 0, 2) + "평"), h("em", null, numberFormat(Number((draft.area && draft.area.exclusive_m2) || 0) + Number((draft.area && draft.area.parking_m2) || 0) + Number((draft.area && draft.area.common_m2) || 0), 2) + "m²"))
              ),
              h(
                "div",
                { className: "building-rent-plan" },
                h("div", null, h("span", null, "임대 계획 보증금"), h("strong", null, manwon(draft.rent_plan && draft.rent_plan.deposit_manwon))),
                h("div", null, h("span", null, "임대 계획 월세"), h("strong", null, manwon(draft.rent_plan && draft.rent_plan.monthly_rent_manwon))),
                h("div", null, h("span", null, "예상 관리비(G열)"), h("strong", null, manwon(plannedManagementFeeManwon(draft))))
              ),
              h(
                "div",
                { className: "building-special-terms" },
                h(
                  "div",
                  null,
                  h("span", null, "\ubb34\uc0c1 \uc784\ub300 \uae30\uac04"),
                  h("strong", null, "렌트프리 " + numberFormat((draft.special_terms && draft.special_terms.rent_free_months) || 0, 0) + "개월 + 정착지원 " + numberFormat((draft.special_terms && draft.special_terms.settlement_support_months) || 0, 0) + "개월"),
                  h("em", null, "총 " + numberFormat((draft.special_terms && draft.special_terms.total_zero_rent_months) || 0, 0) + "개월 월세 0원")
                ),
                h(
                  "div",
                  null,
                  h("span", null, "\ud560\uc778\uc728 \uc801\uc6a9"),
                  h("strong", null, numberFormat((draft.special_terms && draft.special_terms.discount_rate) || 0, 0) + "%"),
                  h("em", null, (draft.special_terms && draft.special_terms.discount_label) || "할인 조건 미해당")
                ),
                h(
                  "div",
                  null,
                  h("span", null, "\ud560\uc778 \ud6c4 \uc6d4\uc138"),
                  h("strong", null, money(draft.special_terms && draft.special_terms.discounted_monthly_rent)),
                  h("em", null, "계약 월세 " + money(draft.special_terms && draft.special_terms.contract_monthly_rent))
                ),
                h(
                  "div",
                  null,
                  h("span", null, "\ud604\uc7ac \uccad\uad6c \uae08\uc561"),
                  h("strong", null, money(draft.special_terms && draft.special_terms.current_monthly_due)),
                  h("em", null, specialPhaseLabel(draft.special_terms && draft.special_terms.current_phase) + " · 월세 개시 " + ((draft.special_terms && draft.special_terms.paid_rent_start_date) || "-"))
                )
              ),
              unitEditMode
                ? [
                    h(
                "div",
                { className: "building-form-grid" },
                renderField("계약자", draft.contract && draft.contract.tenant, function (value) { setContract("tenant", value); }),
                renderField("임차인 사업", draft.contract && draft.contract.tenant_business, function (value) { setContract("tenant_business", value); }),
                renderField("계약일", draft.contract && draft.contract.contract_date, function (value) { setContract("contract_date", value); }, "date"),
                renderField("잔금일", draft.contract && draft.contract.balance_date, function (value) { setContract("balance_date", value); }, "date"),
                renderField("보증금", draft.contract && draft.contract.deposit, function (value) { setContract("deposit", value); }, "number"),
                renderField("월세", draft.contract && draft.contract.monthly_rent, function (value) { setContract("monthly_rent", value); }, "number"),
                renderField("실제 관리비", draft.contract && draft.contract.management_fee, function (value) { setContract("management_fee", value); }, "number"),
                renderField("할인율(%)", draft.contract && draft.contract.discount_rate, function (value) { setContract("discount_rate", value); }, "number"),
                renderSelectField("렌트프리기간", draft.contract && draft.contract.rent_free_months, function (value) { setContract("rent_free_months", value); }, [
                  { value: "0", label: "0개월" },
                  { value: "1", label: "1개월" },
                  { value: "2", label: "2개월" },
                  { value: "3", label: "3개월" },
                  { value: "4", label: "4개월" },
                  { value: "5", label: "5개월" },
                  { value: "6", label: "6개월" }
                ]),
                renderSelectField("창업정착지원기간", draft.contract && draft.contract.settlement_support_months, function (value) { setContract("settlement_support_months", value); }, [
                  { value: "0", label: "0개월" },
                  { value: "1", label: "1개월" },
                  { value: "2", label: "2개월" },
                  { value: "3", label: "3개월" },
                  { value: "4", label: "4개월" },
                  { value: "5", label: "5개월" },
                  { value: "6", label: "6개월" }
                ]),
                renderField("월세 개시일", draft.contract && draft.contract.rent_start_date, function (value) { setContract("rent_start_date", value); }, "date"),
                renderField("임대종료일", draft.contract && draft.contract.lease_end_date, function (value) { setContract("lease_end_date", value); }, "date"),
                renderSelectField("임대기간", draft.contract && draft.contract.lease_term, function (value) { setContract("lease_term", value); }, [
                  { value: "24개월", label: "24개월" },
                  { value: "12개월", label: "12개월" },
                  { value: "18개월", label: "18개월" },
                  { value: "30개월", label: "30개월" },
                  { value: "36개월", label: "36개월" },
                  { value: "48개월", label: "48개월" },
                  { value: "60개월", label: "60개월" }
                ]),
                renderSelectField("납부일", draft.contract && draft.contract.rent_payment_day, function (value) { setContract("rent_payment_day", value); }, [
                  { value: "매월 1일(선불)", label: "매월 1일(선불)" },
                  { value: "매월 5일(선불)", label: "매월 5일(선불)" },
                  { value: "매월 10일(선불)", label: "매월 10일(선불)" },
                  { value: "매월 15일(선불)", label: "매월 15일(선불)" },
                  { value: "매월 20일(선불)", label: "매월 20일(선불)" },
                  { value: "매월 25일(선불)", label: "매월 25일(선불)" },
                  { value: "매월 말일(후불)", label: "매월 말일(후불)" }
                ]),
                renderField("등록번호", draft.contract && draft.contract.registration_no, function (value) { setContract("registration_no", value); }),
                renderField("전화번호", draft.contract && draft.contract.phone, function (value) { setContract("phone", value); }),
                renderField("주소", draft.contract && draft.contract.address, function (value) { setContract("address", value); }),
                renderField("계약금", draft.contract && draft.contract.contract_deposit, function (value) { setContract("contract_deposit", value); }, "number"),
                renderField("잔금", draft.contract && draft.contract.balance_amount, function (value) { setContract("balance_amount", value); }, "number"),
                renderSelectField("관리비 부가세", managementVatFlag(draft.contract && draft.contract.vat_note), function (value) { setContract("vat_note", value); }, [
                  { value: "O", label: "O - 관리비에도 10% 부과" },
                  { value: "X", label: "X - 관리비 부가세 없음" }
                ]),
                renderField("비고", draft.contract && draft.contract.memo, function (value) { setContract("memo", value); })
              ),
              h(SectionTitle, null, "\uc218\ub3c4\uc138"),
              h(
                "div",
                { className: "building-form-grid compact" },
                renderField("부과월", draft.water && draft.water.month, function (value) { setWater("month", value); }, "month"),
                renderField("전월 계량기", draft.water && draft.water.meter_start, function (value) { setWater("meter_start", value); }, "number"),
                renderField("당월 계량기", draft.water && draft.water.meter_end, function (value) { setWater("meter_end", value); }, "number"),
                renderField("청구금액", draft.water && draft.water.amount, function (value) { setWater("amount", value); }, "number")
              ),
              h("div", { className: "building-section-head" }, h(SectionTitle, null, "입출금 내역"), h("button", { type: "button", className: "mini-button", onClick: addTransaction }, "내역 추가")),
              h(
                "div",
                { className: "building-transaction-list" },
                ensureArray(draft.transactions).length
                  ? ensureArray(draft.transactions).map(function (tx, index) {
                      return h(
                        "div",
                        { key: tx.id || index, className: "building-transaction-row" },
                        h("input", { type: "date", value: tx.date || "", onChange: function (event) { setTransaction(index, "date", event.target.value); } }),
                        h("select", { value: tx.kind || "income", onChange: function (event) { setTransaction(index, "kind", event.target.value); } }, h("option", { value: "income" }, "입금"), h("option", { value: "expense" }, "출금")),
                        h("input", { value: tx.category || "", placeholder: "항목", onChange: function (event) { setTransaction(index, "category", event.target.value); } }),
                        h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(tx.amount), placeholder: "금액", onChange: function (event) { setTransaction(index, "amount", cleanNumberInput(event.target.value)); } }),
                        h("input", { value: tx.memo || "", placeholder: "메모", onChange: function (event) { setTransaction(index, "memo", event.target.value); } }),
                        h("button", { type: "button", className: "mini-button danger", onClick: function () { removeTransaction(index); } }, "삭제")
                      );
                    })
                  : h("div", { className: "summary-help" }, "입출금 내역이 없습니다.")
              ),
              h("div", { className: "building-modal-actions" }, h("button", { type: "button", className: "secondary-button", onClick: closeUnit }, "취소"), h("button", { type: "button", className: "primary-button", disabled: saving, onClick: saveUnit }, saving ? "저장 중..." : "저장"))
                  ]
                : [
                    h(SectionTitle, { key: "contract-title" }, "계약 정보"),
                    h(
                      "div",
                      { key: "contract-view", className: "building-readonly-grid" },
                      h("div", null, h("span", null, "임차인 사업"), h("strong", null, (draft.contract && draft.contract.tenant_business) || "공실")),
                      h("div", null, h("span", null, "계약자"), h("strong", null, (draft.contract && draft.contract.tenant) || "-")),
                      h("div", null, h("span", null, "주소"), h("strong", null, (draft.contract && draft.contract.address) || "-")),
                      h("div", null, h("span", null, "계약기간"), h("strong", null, ((draft.contract && draft.contract.contract_date) || "-") + " ~ " + ((draft.contract && draft.contract.lease_end_date) || "-"))),
                      h("div", null, h("span", null, "잔금일"), h("strong", null, (draft.contract && draft.contract.balance_date) || "-")),
                      h("div", null, h("span", null, "납부일"), h("strong", null, (draft.contract && draft.contract.rent_payment_day) || "-")),
                      h("div", null, h("span", null, "보증금"), h("strong", null, money(draft.contract && draft.contract.deposit))),
                      h("div", null, h("span", null, "월세"), h("strong", null, money(draft.contract && draft.contract.monthly_rent))),
                      h("div", null, h("span", null, "예상 관리비"), h("strong", null, manwon(plannedManagementFeeManwon(draft)))),
                      h("div", null, h("span", null, "실제 관리비"), h("strong", null, money(draft.contract && draft.contract.management_fee))),
                      h("div", null, h("span", null, "계약금"), h("strong", null, money(draft.contract && draft.contract.contract_deposit))),
                      h("div", null, h("span", null, "잔금"), h("strong", null, money(draft.contract && draft.contract.balance_amount))),
                      h("div", null, h("span", null, "관리비 부가세"), h("strong", null, managementVatLabel(draft.contract && draft.contract.vat_note))),
                      h("div", null, h("span", null, "렌트프리"), h("strong", null, numberFormat((draft.contract && draft.contract.rent_free_months) || 0, 0) + "개월")),
                      h("div", null, h("span", null, "창업정착지원"), h("strong", null, numberFormat((draft.contract && draft.contract.settlement_support_months) || 0, 0) + "개월")),
                      h("div", { className: "wide" }, h("span", null, "비고"), h("strong", null, (draft.contract && draft.contract.memo) || "-"))
                    ),
                    h(SectionTitle, { key: "water-title" }, "수도세"),
                    h(
                      "div",
                      { key: "water-view", className: "building-readonly-grid compact" },
                      h("div", null, h("span", null, "부과월"), h("strong", null, (draft.water && draft.water.month) || "-")),
                      h("div", null, h("span", null, "전월 계량기"), h("strong", null, numberFormat((draft.water && draft.water.meter_start) || 0, 2))),
                      h("div", null, h("span", null, "당월 계량기"), h("strong", null, numberFormat((draft.water && draft.water.meter_end) || 0, 2))),
                      h("div", null, h("span", null, "청구금액"), h("strong", null, money(draft.water && draft.water.amount)))
                    ),
                    h(SectionTitle, { key: "tx-title" }, "입출금 내역"),
                    h(
                      "div",
                      { key: "tx-view", className: "building-readonly-list" },
                      ensureArray(draft.transactions).length
                        ? ensureArray(draft.transactions).map(function (tx, index) {
                            return h(
                              "div",
                              { key: tx.id || index, className: "building-readonly-row" },
                              h("strong", null, tx.date || "-"),
                              h("span", null, (tx.kind === "expense" ? "출금" : "입금") + " · " + (tx.category || "-")),
                              h("em", { className: tx.kind === "expense" ? "warn" : "ok" }, (tx.kind === "expense" ? "-" : "+") + money(tx.amount)),
                              h("small", null, tx.memo || "")
                            );
                          })
                        : h("div", { className: "summary-help" }, "입출금 내역이 없습니다.")
                    ),
                    h("div", { key: "view-actions", className: "building-modal-actions" }, h("button", { type: "button", className: "primary-button", onClick: function () { setUnitEditMode(true); } }, "수정"))
                  ]
            )
          )
        : null
    );
  }

  function App() {
    const [page, setPageState] = useState(function () {
      const savedPage = localStorage.getItem(LAST_PAGE_KEY) || "sector-watch";
      const migratedFirstPage = localStorage.getItem(FIRST_PAGE_MIGRATION_KEY) === "1";
      const locationPage = parsePageFromLocationHash();
      if (!migratedFirstPage) {
        localStorage.setItem(FIRST_PAGE_MIGRATION_KEY, "1");
        if (savedPage === "portfolio") {
          return normalizeAppPageKey(locationPage || "sector-watch", "sector-watch");
        }
      }
      return normalizeAppPageKey(locationPage || savedPage, "sector-watch");
    });
    const [visitedPages, setVisitedPages] = useState(function () {
      return [page];
    });
    const historySyncRef = useRef({ initialized: false, popNavigating: false, lastPage: "" });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(function () {
      if (window.innerWidth <= 1080) {
        return true;
      }
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    });
    const appConfigRequest = useFetchJson("/api/app-config");
    const appConfig = appConfigRequest.data || {};
    const publicWeb = !!appConfig.public_web;
    const [titleDetails, setTitleDetails] = useState({});

    function setPage(nextPage, options) {
      const opts = options || {};
      const normalized = normalizeAppPageKey(nextPage, page);
      if (opts.fromHistory) {
        historySyncRef.current.popNavigating = true;
      }
      setPageState(function (current) {
        return current === normalized ? current : normalized;
      });
    }

    useEffect(function () {
      localStorage.setItem(LAST_PAGE_KEY, page);
      setVisitedPages(function (current) {
        return current.indexOf(page) >= 0 ? current : current.concat(page);
      });
    }, [page]);

    useEffect(function () {
      const syncState = historySyncRef.current;
      const nextHash = buildPageLocationHash(page);
      if (!syncState.initialized) {
        window.history.replaceState({ page: page }, "", nextHash);
        syncState.initialized = true;
        syncState.lastPage = page;
        return;
      }
      if (syncState.popNavigating) {
        syncState.popNavigating = false;
        syncState.lastPage = page;
        if (window.location.hash !== nextHash) {
          window.history.replaceState({ page: page }, "", nextHash);
        }
        return;
      }
      if (syncState.lastPage !== page) {
        window.history.pushState({ page: page }, "", nextHash);
        syncState.lastPage = page;
      }
    }, [page]);

    useEffect(function () {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    }, [sidebarCollapsed]);

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
      document.title = buildWindowTitle(page, titleDetails[page]);
    }, [page, titleDetails]);

    useEffect(function () {
      function handlePopState(event) {
        const statePage = normalizeAppPageKey(event && event.state && event.state.page, "");
        const hashPage = parsePageFromLocationHash();
        const nextPage = normalizeAppPageKey(statePage || hashPage || page, page);
        setPage(nextPage, { fromHistory: true });
      }

      function handleHistoryShortcut(event) {
        const key = String(event.key || "");
        if (event.defaultPrevented || isEditableTarget(event.target)) {
          return;
        }
        if ((event.ctrlKey || event.metaKey) && !event.altKey && key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            window.history.forward();
          } else {
            window.history.back();
          }
          return;
        }
        if (key === "BrowserBack") {
          event.preventDefault();
          window.history.back();
        } else if (key === "BrowserForward") {
          event.preventDefault();
          window.history.forward();
        }
      }

      window.addEventListener("popstate", handlePopState);
      window.addEventListener("keydown", handleHistoryShortcut);
      return function () {
        window.removeEventListener("popstate", handlePopState);
        window.removeEventListener("keydown", handleHistoryShortcut);
      };
    }, [page]);

    const tabGroups = [
      {
        label: "\uc8fc\uc2dd",
        tabs: [
          { key: "sector-watch", label: "관심종목 보드" },
          { key: "themes", label: "오늘의 주도주" },
          { key: "global-themes", label: "\ubbf8\uad6d \uc8fc\ub3c4\uc8fc" },
          { key: "asia-themes", label: "\uc544\uc2dc\uc544 \uc8fc\ub3c4\uc8fc" },
          { key: "telegram", label: "종목 정보 검색기" },
          { key: "disclosure", label: "공시/실적" },
          { key: "stock-news", label: "뉴스 검색기" },
          { key: "global-company", label: "해외기업 검색기" },
          { key: "global-indices", label: "지수/가격동향" },
          { key: "portfolio", label: "포트폴리오 수익" },
          { key: "sector-entry", label: "섹터 진입 신호" },
          { key: "sector-snapshot", label: "섹터 비교 테이블" },
          { key: "trade-data", label: "수출입" },
          { key: "economy-cycle", label: "경기순환" },
          { key: "strategy-backtest", label: "전략 백테스트" },
          { key: "market-calendar", label: "증시 일정" },
          { key: "next", label: "추가 예정 페이지" }
        ]
      },
      {
        label: "\ubd80\ub3d9\uc0b0",
        tabs: [
          { key: "real-estate-prices", label: "부동산 가격" },
          { key: "building-management", label: "건물 관리" }
        ]
      }
    ];

    function renderPageContent(pageKey) {
      if (pageKey === "sector-watch") {
        return h(SectorWatchBoardPage);
      }
      if (pageKey === "portfolio") {
        return h(PortfolioPage);
      }
      if (pageKey === "themes") {
        return h(MemoThemesPageV2);
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
      if (pageKey === "global-indices") {
        return h(GlobalIndicesPage);
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
      if (pageKey === "real-estate-prices") {
        return h(RealEstatePricePage);
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
          tabGroups.map(function (group) {
            return h(
              "div",
              { key: group.label, className: "nav-group" },
              h("div", { className: "nav-group-title" }, group.label),
              group.tabs.map(function (tab) {
                return h(
                  "button",
                  {
                    key: tab.key,
                    className: "nav-item" + (page === tab.key ? " active" : ""),
                    onClick: function () { setPage(tab.key); }
                  },
                  tab.label
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
