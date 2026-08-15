(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const correlationClassName = deps.correlationClassName;
    const describeCorrelation = deps.describeCorrelation;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const ensureArray = deps.ensureArray;
    const fetchJson = deps.fetchJson;
    const formatCorrelationAssetLabel = deps.formatCorrelationAssetLabel;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const PAIR_CORRELATION_KEY = deps.PAIR_CORRELATION_KEY;
    const PairCorrelationChart = deps.PairCorrelationChart;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const SummaryCard = deps.SummaryCard;

  function PairCorrelationPage() {
    const [leftQuery, setLeftQuery] = useState("");
    const [rightQuery, setRightQuery] = useState("");
    const [leftSuggestions, setLeftSuggestions] = useState([]);
    const [rightSuggestions, setRightSuggestions] = useState([]);
    const [leftSelected, setLeftSelected] = useState(null);
    const [rightSelected, setRightSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [data, setData] = useState(null);
    const leftTimerRef = useRef(null);
    const rightTimerRef = useRef(null);
    const requestSeqRef = useRef(0);
    const autoRunRef = useRef(false);

    useEffect(function () {
      try {
        const saved = JSON.parse(localStorage.getItem(PAIR_CORRELATION_KEY) || "{}");
        if (saved && saved.left) {
          setLeftSelected(saved.left);
          setLeftQuery(formatCorrelationAssetLabel(saved.left));
        }
        if (saved && saved.right) {
          setRightSelected(saved.right);
          setRightQuery(formatCorrelationAssetLabel(saved.right));
        }
      } catch (error) {
      }
    }, []);

    useEffect(function () {
      try {
        localStorage.setItem(PAIR_CORRELATION_KEY, JSON.stringify({
          left: leftSelected || null,
          right: rightSelected || null,
        }));
      } catch (error) {
      }
    }, [leftSelected, rightSelected]);

    useEffect(function () {
      if (leftSelected && rightSelected && !autoRunRef.current) {
        autoRunRef.current = true;
        runCorrelation();
      }
    }, [leftSelected, rightSelected]);

    useEffect(function () {
      return function () {
        if (leftTimerRef.current) clearTimeout(leftTimerRef.current);
        if (rightTimerRef.current) clearTimeout(rightTimerRef.current);
      };
    }, []);

    function queueSearch(side, value) {
      const trimmed = String(value || "").trim();
      const setSuggestions = side === "left" ? setLeftSuggestions : setRightSuggestions;
      const timerRef = side === "left" ? leftTimerRef : rightTimerRef;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (!trimmed) {
        setSuggestions([]);
        return;
      }
      timerRef.current = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/correlation/assets/search?q=" + encodeURIComponent(trimmed) + "&limit=12");
          setSuggestions(ensureArray(payload.items));
        } catch (fetchError) {
          setSuggestions([]);
        }
      }, 160);
    }

    function handleLeftInput(value) {
      setLeftQuery(value);
      setLeftSelected(null);
      setData(null);
      setError("");
      autoRunRef.current = true;
      queueSearch("left", value);
    }

    function handleRightInput(value) {
      setRightQuery(value);
      setRightSelected(null);
      setData(null);
      setError("");
      autoRunRef.current = true;
      queueSearch("right", value);
    }

    function selectAsset(side, item) {
      const normalized = {
        id: item.id,
        kind: item.kind,
        value: item.value,
        code: item.code || "",
        symbol: item.symbol || item.value || "",
        name: item.name || item.symbol || item.value || "",
        market: item.market || "",
        badge: item.badge || "",
        source: item.source || "",
      };
      if (side === "left") {
        setLeftSelected(normalized);
        setLeftQuery(formatCorrelationAssetLabel(normalized));
        setLeftSuggestions([]);
      } else {
        setRightSelected(normalized);
        setRightQuery(formatCorrelationAssetLabel(normalized));
        setRightSuggestions([]);
      }
      setData(null);
      setError("");
    }

    async function runCorrelation() {
      if (!leftSelected || !rightSelected) {
        setError("좌우 자산을 모두 선택해 주세요.");
        setData(null);
        return;
      }
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          left_kind: leftSelected.kind,
          left_value: leftSelected.value,
          left_name: leftSelected.name || "",
          right_kind: rightSelected.kind,
          right_value: rightSelected.value,
          right_name: rightSelected.name || "",
          window_days: "31",
        });
        const payload = await fetchJson("/api/correlation/pair?" + params.toString(), { noCache: true });
        if (requestSeqRef.current !== requestSeq) {
          return;
        }
        setData(payload);
        emitWindowTitleDetail("pair-correlation", (payload.left ? payload.left.name : "") + " vs " + (payload.right ? payload.right.name : ""));
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

    function renderSuggestionList(items, side) {
      const rows = ensureArray(items);
      if (!rows.length) return null;
      return h(
        "div",
        { className: "autocomplete-list pair-correlation-suggestions" },
        rows.map(function (item) {
          return h(
            "button",
            {
              key: side + ":" + (item.id || item.kind + ":" + item.value),
              type: "button",
              className: "autocomplete-item pair-correlation-item",
              onClick: function () { selectAsset(side, item); },
            },
            h("strong", null, item.name || item.symbol || item.value || "-"),
            h("span", null, [
              item.symbol || item.code || item.value || "",
              item.market || item.badge || "",
              item.kind === "index" ? "지수" : (item.kind === "kr_stock" ? "국내" : "해외"),
            ].filter(Boolean).join(" · "))
          );
        })
      );
    }

    function renderSelectedMeta(item) {
      if (!item) {
        return h("div", { className: "summary-help" }, "국내/해외 종목 또는 지수를 검색해 선택하세요.");
      }
      return h(
        "div",
        { className: "pair-correlation-selected" },
        h("strong", null, formatCorrelationAssetLabel(item)),
        h("span", null, [item.market || item.badge || "", item.kind === "index" ? "지수" : (item.kind === "kr_stock" ? "국내 종목" : "해외 종목"), item.source || ""].filter(Boolean).join(" · "))
      );
    }

    const payload = data || {};
    const corrValue = Number(payload.correlation);
    const priceCorrValue = Number(payload.price_correlation);
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "PAIR CORRELATION"),
        h("h1", { className: "page-title" }, "최근 1개월 주가 상관관계"),
        h("p", { className: "page-copy compact-copy" }, "국내/해외 종목과 주요 지수 두 개를 선택해 최근 1개월 공통 거래일 기준 상관관계를 계산합니다.")
      ),
      h(
        "div",
        { className: "pair-correlation-layout" },
        h(
          "div",
          { className: "panel pair-correlation-search-panel" },
          h(SectionTitle, null, "왼쪽 자산"),
          h("label", { className: "form-field" },
            h("input", {
              value: leftQuery,
              onChange: function (event) { handleLeftInput(event.target.value); },
              placeholder: "종목명, 티커, 지수명 검색",
              onFocus: selectTextOnFocus,
            })
          ),
          renderSuggestionList(leftSuggestions, "left"),
          renderSelectedMeta(leftSelected)
        ),
        h(
          "div",
          { className: "panel pair-correlation-search-panel" },
          h(SectionTitle, null, "오른쪽 자산"),
          h("label", { className: "form-field" },
            h("input", {
              value: rightQuery,
              onChange: function (event) { handleRightInput(event.target.value); },
              placeholder: "종목명, 티커, 지수명 검색",
              onFocus: selectTextOnFocus,
            })
          ),
          renderSuggestionList(rightSuggestions, "right"),
          renderSelectedMeta(rightSelected)
        )
      ),
      h(
        "div",
        { className: "panel pair-correlation-action-panel" },
        h("div", { className: "summary-help" }, "상관계수는 최근 1개월 공통 거래일 종가의 일별 수익률 Pearson 기준입니다."),
        h("button", { type: "button", className: "primary-button", onClick: runCorrelation, disabled: loading || !leftSelected || !rightSelected }, loading ? "계산 중..." : "상관관계 계산")
      ),
      error ? h("div", { className: "notice-box error" }, error) : null,
      loading && !data ? LoadingPanel({ label: "주가 상관관계 계산" }) : null,
      data
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              { className: "summary-grid summary-grid-small" },
              h(SummaryCard, { label: "상관계수", value: h("span", { className: correlationClassName(corrValue) }, numberFormat(corrValue, 4)) }),
              h(SummaryCard, { label: "가격 동조화", value: h("span", { className: correlationClassName(priceCorrValue) }, numberFormat(priceCorrValue, 4)) }),
              h(SummaryCard, { label: "공통 거래일", value: numberFormat(payload.observation_count, 0) + "일" }),
              h(SummaryCard, { label: "해석", value: describeCorrelation(corrValue) })
            ),
            h(
              "div",
              { className: "pair-correlation-layout" },
              h(
                "div",
                { className: "panel" },
                h(SectionTitle, null, "정규화 주가 비교"),
                h("div", { className: "summary-help" }, (payload.start_date || "-") + " ~ " + (payload.end_date || "-") + " · 기준값 100"),
                h(PairCorrelationChart, { rows: payload.rows, left: payload.left, right: payload.right })
              ),
              h(
                "div",
                { className: "panel pair-correlation-summary-panel" },
                h(SectionTitle, null, "자산 요약"),
                h("div", { className: "pair-correlation-asset-card" },
                  h("strong", null, formatCorrelationAssetLabel(payload.left)),
                  h("span", null, [payload.left && payload.left.market, payload.left && payload.left.kind === "index" ? "지수" : payload.left && payload.left.kind === "kr_stock" ? "국내 종목" : "해외 종목"].filter(Boolean).join(" · ")),
                  h("div", { className: "pair-correlation-asset-metrics" },
                    h("span", null, "종가 " + numberFormat(payload.left && payload.left.last_close, 2)),
                    h("span", { className: Number((payload.left && payload.left.period_return_pct) || 0) >= 0 ? "metric-up" : "metric-down" }, "1개월 " + formatPercent(payload.left && payload.left.period_return_pct, 2))
                  )
                ),
                h("div", { className: "pair-correlation-asset-card" },
                  h("strong", null, formatCorrelationAssetLabel(payload.right)),
                  h("span", null, [payload.right && payload.right.market, payload.right && payload.right.kind === "index" ? "지수" : payload.right && payload.right.kind === "kr_stock" ? "국내 종목" : "해외 종목"].filter(Boolean).join(" · ")),
                  h("div", { className: "pair-correlation-asset-metrics" },
                    h("span", null, "종가 " + numberFormat(payload.right && payload.right.last_close, 2)),
                    h("span", { className: Number((payload.right && payload.right.period_return_pct) || 0) >= 0 ? "metric-up" : "metric-down" }, "1개월 " + formatPercent(payload.right && payload.right.period_return_pct, 2))
                  )
                ),
                h("div", { className: "summary-help" }, payload.method || "")
              )
            )
          )
        : null
    );
  }


    return PairCorrelationPage;
  }

  modules.pairCorrelationPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
