(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ETF_FLOW_PAGE_KEY = deps.ETF_FLOW_PAGE_KEY;
    const fetchJson = deps.fetchJson;
    const formatCorrelationAssetLabel = deps.formatCorrelationAssetLabel;
    const formatMoneyByCurrency = deps.formatMoneyByCurrency;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const SortableDataTable = deps.SortableDataTable;
    const SummaryCard = deps.SummaryCard;

  function EtfFlowPage() {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [data, setData] = useState(null);
    const timerRef = useRef(null);
    const requestSeqRef = useRef(0);

    useEffect(function () {
      try {
        const saved = JSON.parse(localStorage.getItem(ETF_FLOW_PAGE_KEY) || "{}");
        if (saved && saved.selected) {
          setSelected(saved.selected);
          setQuery(formatCorrelationAssetLabel(saved.selected));
        }
      } catch (error) {
      }
    }, []);

    useEffect(function () {
      try {
        localStorage.setItem(ETF_FLOW_PAGE_KEY, JSON.stringify({ selected: selected || null }));
      } catch (error) {
      }
    }, [selected]);

    useEffect(function () {
      return function () {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    }, []);

    function queueSearch(value) {
      const trimmed = String(value || "").trim();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (!trimmed) {
        setSuggestions([]);
        return;
      }
      timerRef.current = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/etf-flow/assets/search?q=" + encodeURIComponent(trimmed) + "&limit=12");
          setSuggestions(ensureArray(payload.items));
        } catch (fetchError) {
          setSuggestions([]);
        }
      }, 160);
    }

    function handleInput(value) {
      setQuery(value);
      setSelected(null);
      setSuggestions([]);
      setData(null);
      setError("");
      queueSearch(value);
    }

    function selectAsset(item) {
      const normalized = {
        id: item.id,
        kind: item.kind,
        value: item.value,
        code: item.code || "",
        symbol: item.symbol || item.value || "",
        name: item.name || item.symbol || item.value || "",
        market: item.market || "",
        label: item.label || "",
      };
      setSelected(normalized);
      setQuery(formatCorrelationAssetLabel(normalized));
      setSuggestions([]);
      setData(null);
      setError("");
    }

    async function runEstimate() {
      if (!selected) {
        setError("종목을 먼저 선택해 주세요.");
        setData(null);
        return;
      }
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          kind: selected.kind,
          value: selected.value,
          name: selected.name || "",
        });
        const payload = await fetchJson("/api/etf-flow/estimate?" + params.toString(), { noCache: true });
        if (requestSeqRef.current !== requestSeq) {
          return;
        }
        setData(payload);
        emitWindowTitleDetail("etf-flow", payload && payload.asset ? payload.asset.name || payload.asset.symbol || "" : "");
      } catch (fetchError) {
        if (requestSeqRef.current !== requestSeq) {
          return;
        }
        setError(fetchError.message || String(fetchError));
        setData(null);
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setLoading(false);
        }
      }
    }

    function renderSuggestionList() {
      const rows = ensureArray(suggestions);
      if (!rows.length) return null;
      return h(
        "div",
        { className: "autocomplete-list pair-correlation-suggestions" },
        rows.map(function (item) {
          return h(
            "button",
            {
              key: item.id || item.kind + ":" + item.value,
              type: "button",
              className: "autocomplete-item pair-correlation-item",
              onClick: function () { selectAsset(item); },
            },
            h("strong", null, item.name || item.symbol || item.value || "-"),
            h("span", null, [item.symbol || item.code || item.value || "", item.market || "", item.label || ""].filter(Boolean).join(" · "))
          );
        })
      );
    }

    const payload = data || {};
    const rows = ensureArray(payload.rows);
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "ETF FLOW"),
        h("h1", { className: "page-title" }, "ETF 자금 추정"),
        h("p", { className: "page-copy compact-copy" }, "국내 또는 미국 종목을 검색하면 추적 중인 대표 ETF 바스켓 기준으로 현재 편입 비중, 1년 ETF 순유입, 종목별 추정 유입 영향을 역산합니다.")
      ),
      h(
        "div",
        { className: "pair-correlation-layout" },
        h(
          "div",
          { className: "panel pair-correlation-search-panel" },
          h(SectionTitle, null, "종목 검색"),
          h("label", { className: "form-field" },
            h("input", {
              value: query,
              onChange: function (event) { handleInput(event.target.value); },
              placeholder: "국내 종목명/코드 또는 미국 티커/기업명 검색",
              onFocus: selectTextOnFocus,
            })
          ),
          renderSuggestionList(),
          selected
            ? h("div", { className: "pair-correlation-selected" },
                h("strong", null, formatCorrelationAssetLabel(selected)),
                h("span", null, [selected.market || "", selected.kind === "kr_stock" ? "국내 종목" : "미국 종목"].filter(Boolean).join(" · "))
              )
            : h("div", { className: "summary-help" }, "국내 상장 종목과 미국 상장 종목을 대상으로 합니다.")
        ),
        h(
          "div",
          { className: "panel pair-correlation-action-panel" },
          h(SectionTitle, null, "계산 방식"),
          h("div", { className: "summary-help" }, "대표 ETF 바스켓 기준입니다. 1년 ETF 순유입 금액 × 편입 비중으로 종목별 추정 유입액을 계산하고, AUM × 편입 비중으로 현재 보유 노출액도 함께 보여줍니다."),
          h("button", { type: "button", className: "primary-button", onClick: runEstimate, disabled: loading || !selected }, loading ? "계산 중..." : "ETF 자금 추정")
        )
      ),
      error ? h("div", { className: "notice-box error" }, error) : null,
      loading && !data ? LoadingPanel({ label: "ETF 자금 추정" }) : null,
      data
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              { className: "summary-grid summary-grid-small" },
              h(SummaryCard, { label: "추적 ETF 수", value: numberFormat(payload.tracked_etf_count, 0) + "개" }),
              h(SummaryCard, { label: "편입 ETF 수", value: numberFormat(payload.matched_etf_count, 0) + "개" }),
              h(SummaryCard, { label: "1년 추정 순유입", value: formatMoneyByCurrency(payload.total_estimated_stock_flow_1y, payload.market_scope === "KR" ? "KRW" : "USD", true) }),
              h(SummaryCard, { label: "현재 보유 노출액", value: formatMoneyByCurrency(payload.total_holding_exposure, payload.market_scope === "KR" ? "KRW" : "USD", true) })
            ),
            h("div", { className: "summary-help", style: { marginTop: "8px" } }, payload.coverage_note || ""),
            rows.length
              ? h(
                  "div",
                  { className: "panel", style: { marginTop: "14px" } },
                  h(SectionTitle, null, "ETF별 추정 내역"),
                  h("div", { className: "summary-help" }, (payload.asset && payload.asset.name ? payload.asset.name : "-") + " · 기준일 " + (payload.as_of || "-")),
                  h(SortableDataTable, {
                    rows: rows,
                    compact: true,
                    columns: [
                      { key: "etf_symbol", label: "ETF", render: function (row) { return (row.etf_name || row.etf_symbol || "-") + " (" + (row.etf_symbol || "-") + ")"; } },
                      { key: "theme", label: "분류", render: function (row) { return row.theme || "-"; } },
                      { key: "weight_pct", label: "비중", render: function (row) { return formatPercent(row.weight_pct, 2); } },
                      { key: "flow_1y", label: "ETF 1Y 순유입", render: function (row) { return formatMoneyByCurrency(row.flow_1y, row.currency, true); } },
                      { key: "estimated_stock_flow_1y", label: "종목 1Y 추정 유입", render: function (row) { return formatMoneyByCurrency(row.estimated_stock_flow_1y, row.currency, true); } },
                      { key: "holding_exposure", label: "현재 보유 노출액", render: function (row) { return formatMoneyByCurrency(row.holding_exposure, row.currency, true); } },
                      { key: "holding_rank", label: "편입순위", render: function (row) { return row.holding_rank ? numberFormat(row.holding_rank, 0) + "위" : "-"; } },
                    ],
                    sortState: { key: "estimated_stock_flow_1y", direction: "desc" },
                  })
                )
              : h(EmptyState, { message: "추적 중인 ETF 바스켓에서 이 종목을 찾지 못했습니다.", compact: true }),
            ensureArray(payload.failures).length
              ? h("div", { className: "summary-help", style: { marginTop: "10px" } }, "일부 ETF는 수집 실패가 있어 제외되었습니다.")
              : null
          )
        : null
    );
  }


    return EtfFlowPage;
  }

  modules.etfFlowPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
