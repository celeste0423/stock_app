(function (global) {
  "use strict";
  const modules = global.StockAppModules || {};
  function createPage(deps) {
    const React = deps.React, h = deps.h;
    const { useEffect, useMemo, useRef, useState } = React;
    const { ensureArray, numberFormat, formatPercent, fetchJson, postJson, ThemeSectorInput, SectionTitle, SummaryCard, colorForKey } = deps;
    const tone = (value) => Number(value || 0) >= 0 ? "positive" : "negative";
    const chartDay = (day) => new Date(Date.UTC(2020, 0, day + 1)).toISOString().slice(0, 10);
    const eventKey = (row) => String((row && row.stock_code) || "") + "|" + String((row && row.date) || "");
    function alphaColor(color, alpha) {
      const text = String(color || "#64748b");
      const match = /^#([0-9a-f]{6})$/i.exec(text);
      if (!match) return text;
      const value = match[1];
      return "rgba(" + parseInt(value.slice(0, 2), 16) + "," + parseInt(value.slice(2, 4), 16) + "," + parseInt(value.slice(4, 6), 16) + "," + alpha + ")";
    }
    function fallbackPeriods() {
      const lastYear = new Date().getFullYear(), items = [];
      for (let year = lastYear; year >= 2019; year -= 1) {
        items.push({ key: year + "-year", label: year + "년 전체", start_date: year + "-01-01", end_date: year + "-12-31" });
        items.push({ key: year + "-h1", label: year + "년 상반기", start_date: year + "-01-01", end_date: year + "-06-30" });
        items.push({ key: year + "-h2", label: year + "년 하반기", start_date: year + "-07-01", end_date: year + "-12-31" });
        for (let month = 1; month <= 12; month += 1) {
          const start = new Date(Date.UTC(year, month - 1, 1)), end = new Date(Date.UTC(year, month, 0));
          items.push({ key: year + "-m" + month, label: year + "년 " + month + "월", start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) });
        }
        for (let quarter = 1; quarter <= 4; quarter += 1) {
          const month = (quarter - 1) * 3 + 1, endMonth = month + 2, endDay = endMonth === 3 || endMonth === 12 ? 31 : 30;
          items.push({ key: year + "-q" + quarter, label: year + "년 " + quarter + "분기", start_date: year + "-" + String(month).padStart(2, "0") + "-01", end_date: year + "-" + String(endMonth).padStart(2, "0") + "-" + endDay });
        }
      }
      return items;
    }

    function AlignedTradingViewChart(props) {
      const hostRef = useRef(null);
      const events = ensureArray(props.events);
      useEffect(function () {
        const host = hostRef.current, lib = global.LightweightCharts;
        if (!host || !lib || !events.length) return undefined;
        host.innerHTML = "";
        const chart = lib.createChart(host, {
          width: Math.max(host.clientWidth, 240), height: 350,
          layout: { background: { color: "#ffffff" }, textColor: "#64748b" },
          grid: { vertLines: { color: "#edf1f6" }, horzLines: { color: "#edf1f6" } },
          rightPriceScale: { borderColor: "#dfe7f0" },
          timeScale: { borderColor: "#dfe7f0", tickMarkFormatter: function (time) {
            const text = typeof time === "string" ? time : "";
            return text ? "+" + Math.round((Date.parse(text + "T00:00:00Z") - Date.parse("2020-01-01T00:00:00Z")) / 86400000) : "";
          }},
          crosshair: { mode: 1 },
        });
        const hasFocus = props.selectedSector !== "all" || props.selectedTrend !== "all" || !!props.selectedStockKey;
        events.forEach(function (event) {
          const matches = props.selectedStockKey ? eventKey(event) === props.selectedStockKey : (props.selectedSector === "all" || event.sector === props.selectedSector) && (props.selectedTrend === "all" || event.trend_state === props.selectedTrend);
          const emphasis = !hasFocus || matches;
          const series = chart.addLineSeries({ color: alphaColor(colorForKey(event.sector || "미분류"), emphasis ? 1 : 0.24), lineWidth: emphasis ? 2 : 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: emphasis });
          series.setData(ensureArray(event.trajectory).map(function (value, day) { return { time: chartDay(day), value: Number(value || 0) }; }));
        });
        chart.timeScale().fitContent();
        const observer = new ResizeObserver(function () { if (host.clientWidth) chart.applyOptions({ width: host.clientWidth }); });
        observer.observe(host);
        return function () { observer.disconnect(); chart.remove(); };
      }, [events, props.selectedSector, props.selectedTrend, props.selectedStockKey]);
      const hasSelection = props.selectedSector !== "all" || props.selectedTrend !== "all" || props.selectedStockKey;
      const selectableEvents = events.filter(function (row) {
        if (props.selectedStockKey && props.selectedSector === "all" && props.selectedTrend === "all") return eventKey(row) === props.selectedStockKey;
        // A sector selection is a case-study list: retain every event in the
        // sector, including exited/whipsaw names, while trend filters only
        // control which chart lines receive emphasis.
        if (props.selectedSector !== "all") return row.sector === props.selectedSector;
        return (props.selectedSector === "all" || row.sector === props.selectedSector) && (props.selectedTrend === "all" || row.trend_state === props.selectedTrend);
      });
      if (props.selectedTrend === "상승") {
        selectableEvents.sort(function (left, right) {
          const leftReturn = left.effective_return_pct != null ? Number(left.effective_return_pct) : (left.realized_return_pct != null ? Number(left.realized_return_pct) : Number(left.mark_return_pct || left.max_return_pct || -Infinity));
          const rightReturn = right.effective_return_pct != null ? Number(right.effective_return_pct) : (right.realized_return_pct != null ? Number(right.realized_return_pct) : Number(right.mark_return_pct || right.max_return_pct || -Infinity));
          return rightReturn - leftReturn;
        });
      }
      return h("div", { className: "breakout-tv-shell" },
        h("div", { className: "breakout-chart-caption" }, "TradingView Lightweight Charts · 모든 선은 각 종목의 돌파일(Day 0)부터 정렬됩니다."),
        events.length ? h("div", { ref: hostRef, className: "breakout-tv-host" }) : h("div", { className: "summary-help" }, "조건에 맞는 종목이 없습니다."),
        hasSelection ? h("div", { className: "breakout-event-date-strip" }, selectableEvents.map(function (row) { const key = eventKey(row); const returnPct = row.effective_return_pct != null ? row.effective_return_pct : (row.realized_return_pct != null ? row.realized_return_pct : (row.mark_return_pct != null ? row.mark_return_pct : row.max_return_pct)); const status = row.exit_date ? (row.whipsaw ? "휩쏘 청산" : "청산") : "오늘 기준 보유"; return h("button", { type: "button", className: "breakout-event-date-chip" + (props.selectedStockKey === key ? " active" : ""), key: key, onClick: function () { if (typeof props.onSelectStock === "function") props.onSelectStock(props.selectedStockKey === key ? "" : key); } }, h("strong", null, row.stock_name), " · ", props.selectedTrend === "상승" ? formatPercent(returnPct, 1) + " · " + row.date : row.date, " · ", status); })) : null
      );
    }

    function BreakoutStatsPage() {
      const [startDate, setStartDate] = useState(function () { return new Date().getFullYear() + "-01-01"; }), [endDate, setEndDate] = useState(function () { return new Date().getFullYear() + "-03-31"; });
      const [periods, setPeriods] = useState(fallbackPeriods), [periodMode, setPeriodMode] = useState("quarter"), [periodYear, setPeriodYear] = useState(String(new Date().getFullYear())), [periodSegment, setPeriodSegment] = useState("1");
      const [breakoutType, setBreakoutType] = useState("52w"), [tradingValue, setTradingValue] = useState("300"), [marketCap, setMarketCap] = useState("10000"), [sellTrigger, setSellTrigger] = useState("ma20"), [stopLossMode, setStopLossMode] = useState("atr1"), [stopLossPct, setStopLossPct] = useState("8");
      const [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
      const studyRequestSeqRef = useRef(0);
      const [sectorDb, setSectorDb] = useState({ stockMap: {}, sectors: [] }), [selectedSector, setSelectedSector] = useState("all"), [selectedTrend, setSelectedTrend] = useState("all"), [selectedStockKey, setSelectedStockKey] = useState(""), [chartRow, setChartRow] = useState(null), [saveMessage, setSaveMessage] = useState("");
      const [research, setResearch] = useState(null), [researchLoading, setResearchLoading] = useState(false), [researchError, setResearchError] = useState("");
      useEffect(function () {
        fetchJson("/api/sector-db", { silent: true }).then(setSectorDb).catch(function () {});
        fetchJson("/api/breakout-stats/periods", { silent: true }).then(function (payload) {
          const serverPeriods = ensureArray(payload.periods);
          if (serverPeriods.length) {
            // Keep browser-generated month entries when an older backend only
            // knows quarter/half-year ranges; server data still overrides
            // matching keys to retain the actual latest trading date.
            setPeriods(function (current) {
              const merged = {};
              fallbackPeriods().concat(ensureArray(current)).concat(serverPeriods).forEach(function (item) { if (item && item.key) merged[item.key] = item; });
              return Object.keys(merged).sort().reverse().map(function (key) { return merged[key]; });
            });
          }
        }).catch(function () {});
      }, []);
      function runStudy() {
        setLoading(true); setError(""); setSelectedSector("all"); setSelectedTrend("all"); setSelectedStockKey("");
        const requestSeq = studyRequestSeqRef.current + 1;
        studyRequestSeqRef.current = requestSeq;
        const url = "/api/breakout-stats?start_date=" + encodeURIComponent(startDate) + "&end_date=" + encodeURIComponent(endDate) + "&breakout_type=" + breakoutType + "&min_trading_value_100m=" + tradingValue + "&min_market_cap_100m=" + marketCap + "&sell_trigger=" + sellTrigger + "&stop_loss_mode=" + stopLossMode + "&stop_loss_pct=" + encodeURIComponent(stopLossPct) + "&request_id=" + Date.now();
        fetchJson(url, { noCache: true }).then(function (payload) { if (studyRequestSeqRef.current === requestSeq) setData(payload); }).catch(function (err) { if (studyRequestSeqRef.current === requestSeq) setError(err.message || String(err)); }).finally(function () { if (studyRequestSeqRef.current === requestSeq) setLoading(false); });
      }
      function applyPeriod(mode, year, segment) {
        const suffix = mode === "quarter" ? "q" + segment : mode === "half" ? "h" + segment : mode === "month" ? "m" + segment : "year";
        const item = periods.filter(function (value) { return value.key === year + "-" + suffix; })[0];
        if (item) { setStartDate(item.start_date); setEndDate(item.end_date); }
      }
      function commitSector(row, value) {
        postJson("/api/sector-db/assign", { stock_code: row.stock_code, stock_name: row.stock_name, sector: String(value || "").trim() })
          .then(function () { setSaveMessage(row.stock_name + " 섹터 저장 완료"); runStudy(); })
          .catch(function (err) { setSaveMessage("저장 실패: " + (err.message || err)); });
      }
      const summary = (data && data.summary) || {}, sectorStats = ensureArray(data && data.sector_stats), regimeStats = ensureArray(data && data.market_regime_stats), trendStats = ensureArray(data && data.trend_stats), events = ensureArray(data && data.events);
      const selectedStock = events.filter(function (row) { return eventKey(row) === selectedStockKey; })[0] || null;
      const sectorOptions = useMemo(function () { return ensureArray(sectorDb.sectors); }, [sectorDb]);
      const periodYears = useMemo(function () { return Array.from(new Set(periods.map(function (item) { return String(item.key || "").slice(0, 4); }).filter(function (year) { return /^20\d{2}$/.test(year); }))).sort(function (a, b) { return Number(b) - Number(a); }); }, [periods]);
      function generateResearch() {
        const best = sectorStats.filter(function (row) { return Number(row.whipsaw_pct || 0) === 0; })[0] || sectorStats[0];
        if (!best) { setResearchError("먼저 조건을 만족하는 돌파 표본을 조회해 주세요."); return; }
        setResearchLoading(true); setResearchError("");
        postJson("/api/breakout-stats/research", { sector: best.sector, events: events.filter(function (row) { return row.sector === best.sector; }), date_range: startDate + " ~ " + endDate })
          .then(setResearch).catch(function (err) { setResearchError(err.message || String(err)); }).finally(function () { setResearchLoading(false); });
      }
      const ruleHelp = { ma10: "10일선 종가 이탈", ma20: "20일선 종가 이탈", mdd15: "돌파 후 고점 대비 MDD -15%" }[sellTrigger];
      const stopLossHelp = stopLossMode === "atr1" ? "1 ATR 손절" : "손절 -" + stopLossPct + "%";
      const filterSelect = (label, child) => h("label", null, label, child);
      return h("div", { className: "page breakout-stats-page" },
        h("section", { className: "panel hero-panel breakout-hero" },
          h("div", { className: "eyebrow" }, "Breakout Case Study"), h("h1", { className: "page-title" }, "돌파 통계"),
          h("p", { className: "page-copy" }, "신고가 돌파일을 Day 0으로 정렬하여 섹터 액션과 추세추종의 성공 조건을 검증합니다."),
          h("div", { className: "breakout-filter-bar" },
            filterSelect("기간 구분", h("select", { value: periodMode, onChange: function (e) { const mode = e.target.value; const segment = mode === "year" ? "" : "1"; setPeriodMode(mode); setPeriodSegment(segment); applyPeriod(mode, periodYear, segment); } }, h("option", { value: "month" }, "월별"), h("option", { value: "quarter" }, "분기"), h("option", { value: "half" }, "반기"), h("option", { value: "year" }, "연간"))),
            filterSelect("연도", h("select", { value: periodYear, onChange: function (e) { setPeriodYear(e.target.value); applyPeriod(periodMode, e.target.value, periodSegment); } }, periodYears.map(function (year) { return h("option", { key: year, value: year }, year + "년"); }))),
            periodMode !== "year" ? filterSelect(periodMode === "quarter" ? "분기" : periodMode === "half" ? "반기" : "월", h("select", { value: periodSegment, onChange: function (e) { setPeriodSegment(e.target.value); applyPeriod(periodMode, periodYear, e.target.value); } }, (periodMode === "quarter" ? [["1","1분기"],["2","2분기"],["3","3분기"],["4","4분기"]] : periodMode === "half" ? [["1","상반기"],["2","하반기"]] : Array.from({ length: 12 }, function (_, index) { return [String(index + 1), (index + 1) + "월"]; })).map(function (item) { return h("option", { key: item[0], value: item[0] }, item[1]); }))) : null,
            filterSelect("시작", h("input", { type: "date", value: startDate, onChange: function (e) { setStartDate(e.target.value); } })),
            filterSelect("종료", h("input", { type: "date", value: endDate, onChange: function (e) { setEndDate(e.target.value); } })),
            filterSelect("신고가", h("select", { value: breakoutType, onChange: function (e) { setBreakoutType(e.target.value); } }, h("option", { value: "52w" }, "52주 신고가"), h("option", { value: "60d" }, "60일 신고가"), h("option", { value: "20d" }, "20일 신고가"))),
            filterSelect("매도 트리거", h("select", { value: sellTrigger, onChange: function (e) { setSellTrigger(e.target.value); } }, h("option", { value: "ma10" }, "10일선 이탈"), h("option", { value: "ma20" }, "20일선 이탈"), h("option", { value: "mdd15" }, "고점 대비 MDD -15%"))),
            filterSelect("손절 기준", h("select", { value: stopLossMode, onChange: function (e) { setStopLossMode(e.target.value); } }, h("option", { value: "atr1" }, "1 ATR"), h("option", { value: "pct" }, "고정 손절률"))),
            stopLossMode === "pct" ? filterSelect("손절률", h("input", { type: "number", min: "0.1", max: "50", step: "0.1", value: stopLossPct, onChange: function (e) { setStopLossPct(e.target.value); }, title: "손절률(%)" })) : null,
            filterSelect("최소 거래대금", h("select", { value: tradingValue, onChange: function (e) { setTradingValue(e.target.value); } }, [100,300,500,1000,3000].map(function (v) { return h("option", { key: v, value: v }, numberFormat(v,0) + "억"); }))),
            filterSelect("최소 시가총액", h("select", { value: marketCap, onChange: function (e) { setMarketCap(e.target.value); } }, [[3000,"3,000억"],[5000,"5,000억"],[10000,"1조"],[30000,"3조"],[50000,"5조"]].map(function (v) { return h("option", { key: v[0], value: v[0] }, v[1]); }))),
            h("button", { type: "button", className: "primary-button breakout-run-button", disabled: loading, onClick: runStudy }, loading ? "계산 중…" : "통계 갱신")
          )
        ),
        error ? h("div", { className: "notice-box error" }, error) : null,
        !data && !error ? h("div", { className: "notice-box" }, "기간과 조건을 설정한 뒤 ‘통계 갱신’을 누르면 신규 신고가 표본과 성과 분석을 계산합니다.") : null,
        h("section", { className: "panel breakout-signal-list-panel" },
          h("div", { className: "breakout-signal-list-head" }, h(SectionTitle, null, "선택 구간 신고가 발생 종목"), h("span", null, ((data && data.params && data.params.start_date) || startDate) + " ~ " + ((data && data.params && data.params.end_date) || endDate) + " · " + events.length + "건")),
          h("div", { className: "breakout-signal-list" },
            events.length ? [
              h("div", { className: "breakout-signal-list-table-head", key: "head" }, ["돌파일", "종목", "섹터", "종합점수", "거래대금", "시가총액", "매도 수익", "고점 수익", "상태"].map(function (label) { return h("span", { key: label }, label); })),
              events.map(function (row) { const key = eventKey(row); return h("button", { type: "button", className: "breakout-signal-list-row" + (selectedStockKey === key ? " active" : ""), key: key, onClick: function () { setSelectedStockKey(selectedStockKey === key ? "" : key); } },
                h("span", { className: "breakout-signal-date" }, row.date), h("strong", null, row.stock_name, h("small", null, row.stock_code)), h("span", { className: "breakout-signal-sector", style: { borderColor: colorForKey(row.sector) } }, row.sector), h("span", null, numberFormat(row.score, 1)), h("span", null, numberFormat(row.trading_value_100m, 0) + "억"), h("span", null, numberFormat(row.market_cap_100m / 10000, 1) + "조"), h("span", { className: row.whipsaw ? "negative" : tone(row.effective_return_pct) }, row.effective_return_pct == null ? "-" : formatPercent(row.effective_return_pct, 1)), h("span", { className: tone(row.max_return_pct) }, row.max_return_pct == null ? "-" : formatPercent(row.max_return_pct, 1)), h("span", { className: row.whipsaw ? "breakout-tag whipsaw" : row.trend_success ? "breakout-tag success" : "breakout-tag" }, row.whipsaw ? "휩쏘" : row.exit_date ? "청산" : "오늘 기준 보유")
              ); })
            ] : h("p", { className: "summary-help" }, "현재 필터 조건에서 신고가 종목이 없습니다.")
          )
        ),
        h("div", { className: "summary-grid breakout-summary-grid" },
          h(SummaryCard, { label: "돌파 표본", value: numberFormat(summary.event_count,0) + "건", help: "20거래일 내 동일 종목 중복 제거" }),
          h(SummaryCard, { label: "평균 매도 수익률", value: summary.avg_realized_return_pct == null ? "-" : formatPercent(summary.avg_realized_return_pct,1), help: "청산 " + numberFormat(summary.closed_count,0) + "건 · 미청산은 오늘 종가 매도 가정" }),
          h(SummaryCard, { label: "휩쏘 비율", value: formatPercent(summary.whipsaw_pct,1), help: ruleHelp + " 또는 " + stopLossHelp + "로 손실 청산" }),
          h(SummaryCard, { label: "수익 연결률", value: formatPercent(summary.profit_conversion_pct,1), help: "오늘 기준 평가 포함 · 플러스 수익 비율" }),
          h(SummaryCard, { label: "수익 종목 평균", value: summary.avg_profit_when_profitable_pct == null ? "-" : formatPercent(summary.avg_profit_when_profitable_pct,1), help: "오늘 기준 플러스 수익 종목" }),
          h(SummaryCard, { label: "추세추종 성공", value: formatPercent(summary.trend_success_pct,1), help: "오늘 기준 수익률 +20% 이상" })
        ),
        h("section", { className: "panel breakout-main-panel" },
          h("div", { className: "breakout-analysis-grid" },
            h("div", null, h(SectionTitle, null, selectedStock ? selectedStock.stock_name + " 강조 · 전체 돌파일 정렬 차트" : selectedTrend !== "all" ? selectedTrend + " 추세 강조 · 전체 돌파일 정렬 차트" : selectedSector === "all" ? "전체 돌파일 정렬 차트" : selectedSector + " 강조 · 전체 돌파일 정렬 차트"), h(AlignedTradingViewChart, { events: events, selectedSector: selectedSector, selectedTrend: selectedTrend, selectedStockKey: selectedStockKey, onSelectStock: setSelectedStockKey })),
            h("aside", { className: "breakout-sector-ranking" },
              h("h3", null, "섹터별 평균 매도 수익률"),
              h("div", { className: "breakout-trend-summary" }, h("strong", null, "돌파 후 추세 상태"), trendStats.map(function (row) { return h("button", { type: "button", className: "breakout-trend-row " + row.trend_state + (selectedTrend === row.trend_state ? " active" : ""), key: row.trend_state, onClick: function () { setSelectedTrend(selectedTrend === row.trend_state ? "all" : row.trend_state); setSelectedStockKey(""); } }, h("span", null, row.trend_state), h("b", null, formatPercent(row.pct, 1)), h("em", null, row.count + "종목")); }), h("small", null, (data && data.trend_definition) || "")),
              h("button", { type: "button", className: "breakout-sector-all" + (selectedSector === "all" && !selectedStockKey ? " active" : ""), onClick: function () { setSelectedSector("all"); setSelectedStockKey(""); } }, "전체 종목 " + events.length + "건"),
              sectorStats.map(function (row) { const closedCount = Number(row.closed_count || 0); const eventCount = Number(row.count || 0); return h("button", { type: "button", className: "breakout-sector-rank" + (selectedSector === row.sector && !selectedStockKey ? " active" : ""), key: row.sector, onClick: function () { setSelectedSector(row.sector); setSelectedStockKey(""); } }, h("span", { className: "breakout-sector-dot", style: { backgroundColor: colorForKey(row.sector) } }), h("strong", null, row.sector), h("em", { className: tone(row.avg_realized_return_pct) }, row.avg_realized_return_pct == null ? "-" : formatPercent(row.avg_realized_return_pct,1)), h("small", null, "청산 " + closedCount + "/" + eventCount + " · 성공 " + formatPercent(row.trend_success_pct,0))); })
            )
          )
        ),
        h("section", { className: "panel" }, h(SectionTitle, null, "섹터 액션별 케이스스터디"),
          h("div", { className: "breakout-sector-table" }, h("div", { className: "breakout-sector-head" }, h("span", null, "섹터"), h("span", null, "청산/표본"), h("span", null, "평균 매도"), h("span", null, "휩쏘"), h("span", null, "추세 성공")),
            sectorStats.map(function (row) { return h("div", { className: "breakout-sector-row", key: row.sector }, h("span", null, h("i", { style: { backgroundColor: colorForKey(row.sector) } }), row.sector), h("span", null, Number(row.closed_count || 0) + "/" + Number(row.count || 0) + "건"), h("span", { className: tone(row.avg_realized_return_pct) }, row.avg_realized_return_pct == null ? "-" : formatPercent(row.avg_realized_return_pct,1)), h("span", null, formatPercent(row.whipsaw_pct,1)), h("span", null, formatPercent(row.trend_success_pct,1))); })
          )
        ),
        h("section", { className: "panel" }, h(SectionTitle, null, "시장 강도별 돌파 성과"), h("p", { className: "summary-help" }, (data && data.market_strength_definition) || "시장 신고가 확산을 기준으로 구간을 나눕니다."),
          h("div", { className: "breakout-sector-table breakout-market-table" }, h("div", { className: "breakout-market-head" }, h("span", null, "시장 강도"), h("span", null, "평균 52주 신고가"), h("span", null, "강도 배수"), h("span", null, "돌파 표본"), h("span", null, "수익 연결률"), h("span", null, "수익 종목 평균"), h("span", null, "전체 평균 매도")),
            regimeStats.map(function (row) { return h("div", { className: "breakout-market-row", key: row.market_strength }, h("span", { className: "breakout-market-tag " + row.market_strength }, row.market_strength), h("span", null, numberFormat(row.avg_market_high_count,0) + "개"), h("span", null, numberFormat(row.avg_strength_ratio,2) + "x"), h("span", null, row.event_count + "건"), h("span", null, formatPercent(row.profit_conversion_pct,1)), h("span", { className: tone(row.avg_profit_when_profitable_pct) }, row.avg_profit_when_profitable_pct == null ? "-" : formatPercent(row.avg_profit_when_profitable_pct,1)), h("span", { className: tone(row.avg_realized_return_pct) }, row.avg_realized_return_pct == null ? "-" : formatPercent(row.avg_realized_return_pct,1)) ); })
          )
        ),
        h("section", { className: "panel" }, h(SectionTitle, null, "돌파 종목 · 섹터 보정"), saveMessage ? h("p", { className: "summary-help" }, saveMessage) : null,
          h("div", { className: "breakout-event-table" }, h("div", { className: "breakout-event-head" }, ["돌파일","종목","섹터","S/O 점수","등락 · ATR","시총","거래대금","매도 수익","청산/판정"].map(function (v) { return h("span", { key: v }, v); })),
            events.map(function (row) { return h("div", { className: "breakout-event-row", key: row.date + row.stock_code },
              h("span", null, row.date), h("button", { type: "button", className: "breakout-stock-link", onClick: function () { const key = eventKey(row); setSelectedStockKey(selectedStockKey === key ? "" : key); } }, row.stock_name, h("small", null, row.stock_code)),
              h("span", null, ThemeSectorInput ? h(ThemeSectorInput, { value: row.sector === "미분류" ? "" : row.sector, options: sectorOptions, onCommit: function (value) { commitSector(row, value); } }) : row.sector),
              h("span", null, numberFormat(row.score,1) + " / " + numberFormat(row.score_o,1)), h("span", null, formatPercent(row.change_pct,1) + " · " + numberFormat(row.atr_20,1)), h("span", null, numberFormat(row.market_cap_100m / 10000,1) + "조"), h("span", null, numberFormat(row.trading_value_100m,0) + "억"), h("span", { className: tone(row.effective_return_pct) }, row.effective_return_pct == null ? "-" : formatPercent(row.effective_return_pct,1)),
              h("span", { className: row.whipsaw ? "breakout-tag whipsaw" : row.trend_success ? "breakout-tag success" : "breakout-tag" }, row.exit_date ? row.exit_date + " " : "오늘 기준 ", row.whipsaw ? "휩쏘 " + (row.exit_reason || "손절") : row.trend_success ? "추세 성공" : row.exit_date ? (row.exit_reason || "청산") : "보유 중")
            ); })
          )
        ),
        h("section", { className: "panel breakout-ai-panel" }, h(SectionTitle, null, "Gemini 리서치 브리프"), h("p", null, "휩쏘 없이 가장 크게 오른 섹터를 우선 선정해 뉴스·재료·대장주 선택을 검색 근거와 함께 정리합니다."),
          h("button", { type: "button", className: "secondary-button", disabled: researchLoading || !events.length, onClick: generateResearch }, researchLoading ? "Gemini 조사 중…" : "Gemini 리서치 생성"), researchError ? h("p", { className: "notice-box error" }, researchError) : null,
          research && research.research ? h("div", { className: "breakout-research-result" }, h("h3", null, research.research.headline || "리서치 결과"), h("p", null, research.research.thesis || ""), h("dl", null, h("dt", null, "대장 선택"), h("dd", null, research.research.leader_selection || "-"), h("dt", null, "진입 계획"), h("dd", null, research.research.entry_plan || "-"), h("dt", null, "리스크 관리"), h("dd", null, research.research.risk_controls || "-"))) : null
        ),
        chartRow ? h("div", { className: "breakout-modal-backdrop", onClick: function () { setChartRow(null); } }, h("div", { className: "breakout-chart-modal", onClick: function (e) { e.stopPropagation(); } }, h("button", { type: "button", className: "modal-close", onClick: function () { setChartRow(null); } }, "×"), h("h2", null, chartRow.stock_name + " · " + chartRow.date + " 돌파"), h("p", null, chartRow.sector + " · 돌파가 " + numberFormat(chartRow.entry_price,0) + "원 · 고점 " + formatPercent(chartRow.max_return_pct,1)), h("iframe", { title: chartRow.stock_name + " 차트", src: "https://kr.tradingview.com/chart/?symbol=KRX%3A" + encodeURIComponent(chartRow.stock_code), loading: "lazy" }), h("a", { href: "https://kr.tradingview.com/chart/?symbol=KRX%3A" + encodeURIComponent(chartRow.stock_code), target: "_blank", rel: "noreferrer" }, "TradingView에서 전체 차트 열기 ↗"))) : null
      );
    }
    return BreakoutStatsPage;
  }
  modules.breakoutStatsPage = { createPage: createPage }; global.StockAppModules = modules;
})(window);
