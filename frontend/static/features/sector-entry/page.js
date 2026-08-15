(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useRef = React.useRef;
    const useState = React.useState;
    const CHART_PREVIEW_CACHE = deps.CHART_PREVIEW_CACHE;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const numberFormat = deps.numberFormat;
    const postJson = deps.postJson;
    const scoreSpan = deps.scoreSpan;
    const SectionTitle = deps.SectionTitle;
    const SectorEntryLeaderChips = deps.SectorEntryLeaderChips;
    const SortableDataTable = deps.SortableDataTable;
    const StockChartPreview = deps.StockChartPreview;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

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
          "strength_score = 평균 점수 + 최고 점수×0.18 + min(종목수,12)×1.4 + min(거래대금/시총%,30)"
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
            h(SectionTitle, null, "편입/편출 시그널 레이더"),
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
                    h("div", { className: "subsection-title" }, "시그널 발생 종목"),
                    h("span", null, numberFormat(radarRows.length, 0) + "\uc885\ubaa9")
                  ),
                  h(
                    "div",
                    { className: "radar-table-scroll radar-signal-scroll" },
                    h(SortableDataTable, {
                      rows: radarRows,
                      columns: radarColumns,
                      emptyMessage: "해당 시그널 종목 데이터가 없습니다.",
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
                    h("div", { className: "subsection-title" }, "신호별 평균 성과"),
                    h("span", null, "5/20/60\uac70\ub798\uc77c")
                  ),
                  h("div", { className: "summary-help" }, "오늘의 주도주 DB에서 각 신호가 발생했던 종목을 집계하고, 신호별 평균 성과를 요약합니다."),
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
            h(SectionTitle, null, "진입 신호 후보"),
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


    return SectorEntrySignalPage;
  }

  modules.sectorEntryPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
