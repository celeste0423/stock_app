(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  const labels = {
    pageTitle: "해외기업 검색기",
    pageCopy: "한글명, 영문명, 티커로 해외 상장사를 검색하고 최근 주가, 실적, 주요 투자지표를 함께 확인합니다.",
    statementMetrics: {
      revenue: "매출",
      operatingIncome: "영업이익",
      netIncome: "순이익",
    },
    empty: {
      chart: "표시할 차트 정보가 없습니다.",
      history: "표시할 연혁 정보가 없습니다.",
      segments: "표시할 사업분야 정보가 없습니다.",
      aiBrief: "AI 기업 브리프를 불러오지 못했습니다.",
      statements: "표시할 재무 데이터가 없습니다.",
    },
  };

  function label(path, fallback) {
    const parts = String(path || "").split(".").filter(Boolean);
    let value = labels;
    for (let index = 0; index < parts.length; index += 1) {
      value = value && value[parts[index]];
    }
    return value == null ? fallback : value;
  }

  modules.globalCompanyPage = {
    labels,
    label,
  };

  global.StockAppModules = modules;
})(window);
