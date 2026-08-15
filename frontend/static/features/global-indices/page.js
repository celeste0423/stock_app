(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useState = React.useState;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const formatPercent = deps.formatPercent;
    const GlobalIndicesChart = deps.GlobalIndicesChart;
    const h = deps.h;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const useFetchJson = deps.useFetchJson;

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


    return GlobalIndicesPage;
  }

  modules.globalIndicesPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
