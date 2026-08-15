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
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const useFetchJson = deps.useFetchJson;

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
            h(SectionTitle, null, "월별 외국인 관광객 추이"),
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
        h(SectionTitle, null, "관광객 데이터"),
        h("div", { className: "summary-help" }, (payload.source_label || "-") + " · " + (payload.release_hint || "")),
        payload.motie_api
          ? h("div", { className: "summary-help" }, "산업부 API: " + (payload.motie_api.ok ? "연결 정상" : "확인 필요") + " · " + (payload.motie_api.message || "-"))
          : null,
        h("div", { className: "summary-help" }, "불러온 시각: " + (payload.loaded_at || "-")),
        h(
          "label",
          { className: "trade-region-picker" },
          h("span", null, "폴더: stock app\\data\\real-estate"),
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


    return TradeImportExportPage;
  }

  modules.tradeDataPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
