(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const DataTable = deps.DataTable;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

  function InstitutionalRebalancePage() {
    const request = useFetchJson("/api/institutional-rebalance");
    const aiRequest = useFetchJson("/api/institutional-rebalance/ai-brief", { enabled: !!request.data });
    function metricClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "";
      return number > 0 ? "positive" : "negative";
    }
    function scoreText(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "-";
      return (number > 0 ? "+" : "") + numberFormat(number, 1) + "점";
    }
    if (request.loading && !request.data) {
      return LoadingPanel({ label: request.label });
    }
    if (request.error) {
      return ErrorPanel({ message: request.error });
    }
    const data = request.data || {};
    const aiData = aiRequest.data || {};
    const aiBrief = aiData.brief || {};
    const cards = ensureArray(data.cards);
    const regionalRows = ensureArray(data.regional_rows);
    const scheduleRows = ensureArray(data.schedule);
    const assets = ensureArray(data.assets).filter(function (item) {
      return item && item.category === "index";
    });
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "INSTITUTIONAL REBALANCE"),
        h("h1", { className: "page-title" }, "기관 리밸런싱 추정"),
        h("p", { className: "page-copy compact-copy" }, data.subtitle || "공개 가격·일정 데이터 기반의 규칙형 추정입니다."),
        h("div", { className: "summary-help" }, "기준일 " + (data.as_of || "-") + " · 생성 " + (data.generated_at || "-"))
      ),
      h(
        "div",
        { className: "panel institutional-ai-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "eyebrow" }, "Gemini Commentary"),
            h(SectionTitle, null, aiBrief.title || "오늘의 기관 수급 해설"),
            h("div", { className: "summary-help" }, aiBrief.market_regime || "기관 수급 관점 시장 해설")
          ),
          h("button", {
            type: "button",
            className: "mini-button",
            onClick: function () { aiRequest.refresh(true); },
            disabled: aiRequest.loading,
          }, aiRequest.loading ? "AI 생성 중..." : "AI 새로고침")
        ),
        aiRequest.loading && !aiRequest.data
          ? h(LoadingBlock, { compact: true, title: "Gemini 해설 생성 중", label: aiRequest.label })
          : aiRequest.error
            ? h("div", { className: "notice-box error" }, aiRequest.error)
            : h(
                React.Fragment,
                null,
                h("div", { className: "institutional-ai-one-liner" }, aiBrief.one_liner || "오늘 공개 데이터 기준으로 기관 리밸런싱 가능성을 요약합니다."),
                h("p", { className: "institutional-ai-summary" }, aiBrief.executive_summary || ""),
                h(
                  "div",
                  { className: "institutional-ai-grid" },
                  h(
                    "div",
                    { className: "institutional-ai-card" },
                    h("h3", null, "수급 해석"),
                    ensureArray(aiBrief.flow_summary).length
                      ? h("div", { className: "institutional-ai-flow-list" }, ensureArray(aiBrief.flow_summary).map(function (item, index) {
                          return h("div", { key: "flow-" + index, className: "institutional-ai-flow-item" },
                            h("strong", null, item.name || "-"),
                            h("em", null, item.view || "-"),
                            h("p", null, item.reason || "-")
                          );
                        }))
                      : h(EmptyState, { compact: true, message: "AI 해설이 아직 없습니다." })
                  ),
                  h(
                    "div",
                    { className: "institutional-ai-card" },
                    h("h3", null, "타이밍"),
                    h("ul", { className: "institutional-rebalance-reasons" },
                      ensureArray(aiBrief.timing_points).map(function (item, index) {
                        return h("li", { key: "timing-" + index }, item);
                      })
                    ),
                    h("h3", null, "액션 포인트"),
                    h("ul", { className: "institutional-rebalance-reasons" },
                      ensureArray(aiBrief.action_points).map(function (item, index) {
                        return h("li", { key: "action-" + index }, item);
                      })
                    )
                  ),
                  h(
                    "div",
                    { className: "institutional-ai-card" },
                    h("h3", null, "시나리오"),
                    h("div", { className: "institutional-ai-scenario" },
                      h("strong", null, "강세"),
                      h("p", null, (aiBrief.scenarios || {}).bull || "-")
                    ),
                    h("div", { className: "institutional-ai-scenario" },
                      h("strong", null, "기본"),
                      h("p", null, (aiBrief.scenarios || {}).base || "-")
                    ),
                    h("div", { className: "institutional-ai-scenario" },
                      h("strong", null, "약세"),
                      h("p", null, (aiBrief.scenarios || {}).bear || "-")
                    ),
                    h("h3", null, "리스크"),
                    h("ul", { className: "institutional-rebalance-reasons" },
                      ensureArray(aiBrief.risks).map(function (item, index) {
                        return h("li", { key: "risk-" + index }, item);
                      })
                    ),
                    h("div", { className: "summary-help institutional-ai-footnote" }, (aiBrief.model || "") + (aiData.cached_at ? " · " + aiData.cached_at : ""))
                  )
                )
              )
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null, h(SectionTitle, null, "핵심 추정"), h("div", { className: "summary-help" }, "CTA, 옵션 만기, 패시브, 매크로 관점에서 리밸런싱 가능성을 요약합니다.")),
          h("button", { type: "button", className: "mini-button", onClick: function () { request.refresh(true); } }, request.loading ? "새로고침 중..." : "새로고침")
        ),
        h(
          "div",
          { className: "summary-grid summary-grid-small" },
          cards.map(function (card) {
            return h(SummaryCard, {
              key: card.key,
              label: card.label,
              value: scoreText(card.score),
              help: (card.direction || "중립") + " · " + (card.window || "-"),
            });
          })
        )
      ),
      h(
        "div",
        { className: "institutional-rebalance-card-grid" },
        cards.map(function (card) {
          return h(
            "div",
            { key: card.key, className: "panel institutional-rebalance-card" },
            h("div", { className: "section-toolbar" },
              h("div", null,
                h("div", { className: "section-title" }, card.label || "-"),
                h("div", { className: "summary-help" }, card.summary || "")
              ),
              h("strong", { className: metricClass(card.score) }, scoreText(card.score))
            ),
            h("div", { className: "summary-help" }, (card.direction || "중립") + " · " + (card.window || "-")),
            h("ul", { className: "institutional-rebalance-reasons" },
              ensureArray(card.reasons).map(function (reason, index) {
                return h("li", { key: card.key + "-" + index }, reason);
              })
            )
          );
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "시장별 추정"),
        h(DataTable, {
          compact: true,
          rows: regionalRows,
          columns: [
            { key: "market", label: "시장" },
            { key: "focus", label: "대상 자금" },
            { key: "score", label: "점수", render: function (row) { return h("strong", { className: metricClass(row.score) }, scoreText(row.score)); } },
            { key: "direction", label: "방향" },
            { key: "window", label: "예상 시점" },
            { key: "one_week", label: "1W", render: function (row) { return h("span", { className: metricClass(row.one_week) }, formatPercent(row.one_week, 2)); } },
            { key: "one_month", label: "1M", render: function (row) { return h("span", { className: metricClass(row.one_month) }, formatPercent(row.one_month, 2)); } },
            { key: "three_month", label: "3M", render: function (row) { return h("span", { className: metricClass(row.three_month) }, formatPercent(row.three_month, 2)); } },
            { key: "summary", label: "근거" },
          ],
          emptyMessage: "표시할 시장별 추정 데이터가 없습니다.",
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "다가오는 일정"),
        h(DataTable, {
          compact: true,
          rows: scheduleRows,
          columns: [
            { key: "date", label: "날짜" },
            { key: "market", label: "시장" },
            { key: "category", label: "분류" },
            { key: "title", label: "이벤트" },
            { key: "days_left", label: "D-Day", render: function (row) { return "D" + (Number(row.days_left) > 0 ? "-" + numberFormat(row.days_left, 0) : Number(row.days_left) === 0 ? "-0" : "+" + numberFormat(Math.abs(Number(row.days_left)), 0)); } },
            { key: "note", label: "비고" },
          ],
          emptyMessage: "표시할 일정이 없습니다.",
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "지수 근거 데이터"),
        h(DataTable, {
          compact: true,
          rows: assets,
          columns: [
            { key: "market", label: "시장" },
            { key: "name", label: "지수" },
            { key: "trend_score", label: "추세점수", render: function (row) { return h("strong", { className: metricClass(row.trend_score) }, scoreText(row.trend_score)); } },
            { key: "return_1w_pct", label: "1W", render: function (row) { return h("span", { className: metricClass(row.return_1w_pct) }, formatPercent(row.return_1w_pct, 2)); } },
            { key: "return_1m_pct", label: "1M", render: function (row) { return h("span", { className: metricClass(row.return_1m_pct) }, formatPercent(row.return_1m_pct, 2)); } },
            { key: "return_3m_pct", label: "3M", render: function (row) { return h("span", { className: metricClass(row.return_3m_pct) }, formatPercent(row.return_3m_pct, 2)); } },
            { key: "ma20_gap_pct", label: "20일선 괴리", render: function (row) { return h("span", { className: metricClass(row.ma20_gap_pct) }, formatPercent(row.ma20_gap_pct, 2)); } },
            { key: "ma200_gap_pct", label: "200일선 괴리", render: function (row) { return h("span", { className: metricClass(row.ma200_gap_pct) }, formatPercent(row.ma200_gap_pct, 2)); } },
            { key: "trend_direction", label: "판정" },
          ],
          emptyMessage: "표시할 지수 데이터가 없습니다.",
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "판정 기준"),
        h("ul", { className: "institutional-rebalance-reasons" },
          ensureArray(data.method_notes).map(function (note, index) {
            return h("li", { key: "note-" + index }, note);
          })
        ),
        ensureArray(data.errors).length
          ? h("div", { className: "notice-box compact" }, "일부 보조 데이터는 제외되었습니다: " + ensureArray(data.errors).slice(0, 4).join(" / "))
          : null
      )
    );
  }


    return InstitutionalRebalancePage;
  }

  modules.institutionalRebalancePage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
