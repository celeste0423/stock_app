(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useState = React.useState;
    const DataTable = deps.DataTable;
    const economyCategoryClass = deps.economyCategoryClass;
    const EconomyCycleClock = deps.EconomyCycleClock;
    const EconomyCycleTrend = deps.EconomyCycleTrend;
    const economyPhaseClass = deps.economyPhaseClass;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const h = deps.h;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const pnlClass = deps.pnlClass;
    const SectionTitle = deps.SectionTitle;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

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
              h(SectionTitle, null, "경기순환시계"),
              h(EconomyCycleClock, { indicators: indicators, average: average })
            ),
            h(
              "div",
              { className: "panel economy-cycle-table-panel" },
              h(SectionTitle, null, "지표별 위치"),
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
            h(SectionTitle, null, "업종 순환 시계 (그룹/섹터)"),
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


    return EconomyCycleClockPage;
  }

  modules.economyCyclePage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
