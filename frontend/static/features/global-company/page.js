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


(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};
  const GLOBAL_COMPANY_KEY = "stock-dashboard:global-company-state";
  const GLOBAL_STOCK_NAV_KEY = "stock-dashboard:global-stock-navigation";
  const GLOBAL_STOCK_NAV_EVENT = "stock-dashboard:global-stock-navigation";

  function consumeGlobalStockNavigation() {
    try {
      const raw = global.sessionStorage.getItem(GLOBAL_STOCK_NAV_KEY);
      if (!raw) {
        return null;
      }
      global.sessionStorage.removeItem(GLOBAL_STOCK_NAV_KEY);
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const buildGlobalEarningsText = deps.buildGlobalEarningsText;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const fetchJson = deps.fetchJson;
    const formatGlobalMarketCap = deps.formatGlobalMarketCap;
    const formatGlobalMoney = deps.formatGlobalMoney;
    const formatGlobalNumberCompact = deps.formatGlobalNumberCompact;
    const formatGlobalPrice = deps.formatGlobalPrice;
    const formatKrwWon = deps.formatKrwWon;
    const formatPercent = deps.formatPercent;
    const formatUsdCompact = deps.formatUsdCompact;
    const getStockAppModule = deps.getStockAppModule;
    const GlobalEarningsCallPanel = deps.GlobalEarningsCallPanel;
    const globalMarginPercent = deps.globalMarginPercent;
    const globalTradingViewSymbol = deps.globalTradingViewSymbol;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const StockNewsBriefPanel = deps.StockNewsBriefPanel;
    const SummaryCard = deps.SummaryCard;
    const TradingViewEmbed = deps.TradingViewEmbed;
    const tradingViewWidgetUrl = deps.tradingViewWidgetUrl;

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
    const globalCompanyModule = getStockAppModule("globalCompanyPage");
    const globalCompanyLabel = typeof globalCompanyModule.label === "function"
      ? globalCompanyModule.label
      : function (_path, fallback) { return fallback; };
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
    const [loadingTelegramEarnings, setLoadingTelegramEarnings] = useState(false);
    const [loadingGlobalNewsBrief, setLoadingGlobalNewsBrief] = useState(false);
    const [message, setMessage] = useState("");
    const [aiMessage, setAiMessage] = useState("");
    const [globalNewsBriefMessage, setGlobalNewsBriefMessage] = useState("");
    const [telegramEarningsMessage, setTelegramEarningsMessage] = useState("");
    const [telegramEarningsRows, setTelegramEarningsRows] = useState([]);
    const [telegramEarningsPayload, setTelegramEarningsPayload] = useState(null);
    const [globalNewsBrief, setGlobalNewsBrief] = useState(null);
    const [statementMode, setStatementMode] = useState(savedGlobalCompanyState.statementMode || "quarter");
    const searchTimerRef = useRef(null);

    function applyPendingGlobalStockNavigation() {
      const pending = consumeGlobalStockNavigation();
      const symbol = String((pending && pending.symbol) || "").trim().toUpperCase();
      const name = String((pending && pending.name) || "").trim();
      const nextQuery = String((pending && pending.query) || "").trim();
      if (!symbol && !name && !nextQuery) {
        return;
      }
      const target = {
        symbol: symbol || nextQuery.toUpperCase(),
        name: name || nextQuery,
      };
      const resolvedQuery = nextQuery || (target.name ? target.name + (target.symbol ? " (" + target.symbol + ")" : "") : target.symbol);
      setQuery(resolvedQuery);
      setSelected(target);
      setSuggestions([]);
      setMessage("");
      setAiBrief(null);
      setAiMessage("");
      setLoadingDetail(true);
      fetchJson("/api/global-stocks/detail?symbol=" + encodeURIComponent(target.symbol))
        .then(function (payload) {
          setDetail(payload);
          persistGlobalCompanyState({
            query: resolvedQuery,
            selected: target,
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

    useEffect(function () {
      applyPendingGlobalStockNavigation();
      function handleGlobalStockNavigation() {
        applyPendingGlobalStockNavigation();
      }
      if (typeof window !== "undefined") {
        window.addEventListener(GLOBAL_STOCK_NAV_EVENT, handleGlobalStockNavigation);
      }
      return function () {
        if (typeof window !== "undefined") {
          window.removeEventListener(GLOBAL_STOCK_NAV_EVENT, handleGlobalStockNavigation);
        }
      };
    }, [statementMode]);

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

    function fallbackGlobalCompanyFromQuery(value) {
      const raw = String(value || "").trim();
      if (!raw) {
        return null;
      }
      const parenMatch = raw.match(/\(([A-Z0-9.\-=\^]{1,16})\)\s*$/i);
      const symbol = parenMatch ? String(parenMatch[1] || "").toUpperCase() : raw.toUpperCase();
      const name = parenMatch ? raw.replace(/\s*\([A-Z0-9.\-=\^]{1,16}\)\s*$/i, "").trim() : raw;
      return { symbol: symbol, name: name || symbol };
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

    useEffect(function () {
      const symbol = detail && detail.symbol ? String(detail.symbol) : "";
      if (!symbol) {
        setGlobalNewsBrief(null);
        setGlobalNewsBriefMessage("");
        return;
      }
      setLoadingGlobalNewsBrief(true);
      setGlobalNewsBriefMessage("");
      fetchJson("/api/global-stocks/news-brief?symbol=" + encodeURIComponent(symbol))
        .then(function (payload) {
          setGlobalNewsBrief(payload);
        })
        .catch(function (err) {
          setGlobalNewsBrief(null);
          setGlobalNewsBriefMessage(err.message || String(err));
        })
        .finally(function () {
          setLoadingGlobalNewsBrief(false);
        });
    }, [detail && detail.symbol]);

    useEffect(function () {
      const symbol = detail && detail.symbol ? String(detail.symbol || "").trim().toUpperCase() : "";
      let cancelled = false;
      if (!symbol) {
        setTelegramEarningsRows([]);
        setTelegramEarningsPayload(null);
        setTelegramEarningsMessage("");
        return function () {
          cancelled = true;
        };
      }
      setLoadingTelegramEarnings(true);
      setTelegramEarningsRows([]);
      setTelegramEarningsPayload(null);
      setTelegramEarningsMessage("");
      fetchJson("/api/global-stocks/earnings-call?symbol=" + encodeURIComponent(symbol))
        .then(function (payload) {
          if (cancelled) {
            return;
          }
          setTelegramEarningsPayload(payload || null);
          const rows = ensureArray(payload && payload.rows).sort(function (a, b) {
            return String(b && b.date || "").localeCompare(String(a && a.date || ""));
          });
          setTelegramEarningsRows(rows);
          if (!rows.length) {
            setTelegramEarningsMessage(symbol + " 종목의 최근 earnings call transcript를 찾지 못했습니다.");
          }
        })
        .catch(function (error) {
          if (cancelled) {
            return;
          }
          setTelegramEarningsRows([]);
          setTelegramEarningsMessage(error && error.message ? error.message : String(error));
        })
        .finally(function () {
          if (!cancelled) {
            setLoadingTelegramEarnings(false);
          }
        });
      return function () {
        cancelled = true;
      };
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
          chooseCompany(fallbackGlobalCompanyFromQuery(query));
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
        h("h1", { className: "page-title" }, globalCompanyLabel("pageTitle", "해외기업 검색기")),
        h("p", { className: "page-copy" }, globalCompanyLabel("pageCopy", "한글명, 영문명, 티커로 해외 상장사를 검색하고 최근 주가, 실적, 주요 투자지표를 함께 확인합니다.")),
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
                : h(EmptyState, { compact: true, message: globalCompanyLabel("empty.chart", "표시할 차트 정보가 없습니다.") })
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
                  h(SummaryCard, { className: "global-stat-card compact", label: "최근 보고", value: latest.filed || "-" }),
                  h(SummaryCard, { className: "global-stat-card compact", label: statementMode === "annual" ? "최근 연도" : "최근 분기", value: latest.label || "-" })
                )
              ),
              h(
                "div",
                { className: "panel global-earnings-card" },
                h(SectionTitle, null, "최근 실적 / 컨콜 메시지"),
                h("div", { className: "summary-help" }, "earningscalls.dev · " + (detail.symbol || "") + " 최근 transcript"),
                loadingTelegramEarnings
                  ? h(LoadingBlock, { compact: true, title: "최근 실적/컨콜 메시지 불러오는 중", label: "earningscalls.dev 공개 transcript를 읽어 번역하고 있습니다." })
                  : telegramEarningsPayload
                    ? h(GlobalEarningsCallPanel, { payload: telegramEarningsPayload, emptyMessage: "검색 결과가 없습니다." })
                    : telegramEarningsMessage
                      ? h(
                          React.Fragment,
                          null,
                          h("div", { className: "notice-box" }, telegramEarningsMessage),
                          h("pre", { className: "global-earnings-note" }, buildGlobalEarningsText(detail, visibleStatements, latest, rate))
                        )
                      : h("pre", { className: "global-earnings-note" }, buildGlobalEarningsText(detail, visibleStatements, latest, rate))
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
                  h(SectionTitle, null, "차트 아래 기업 브리프")
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
                    }, loadingAiBrief ? "불러오는 중..." : "AI 새로고침")
                  : null
              ),
              loadingAiBrief && !aiBriefPayload
                ? h(LoadingBlock, { compact: true, title: "AI 기업 브리프 생성 중", label: "차트 아래 영역을 채우고 있습니다." })
                : aiMessage
                  ? h("div", { className: "notice-box error" }, aiMessage)
                  : aiBriefPayload
                    ? h(
                        "div",
                        { className: "global-ai-brief-grid" },
                        h(
                          "div",
                          { className: "global-ai-brief-card" },
                          h("h3", null, "기업 요약"),
                          h("p", { className: "global-ai-brief-overview" }, aiBriefPayload.overview || "-"),
                          h("div", { className: "global-ai-brief-note" }, (aiBriefPayload.model || "") + (aiBrief && aiBrief.cached_at ? " · " + aiBrief.cached_at : ""))
                        ),
                        h(
                          "div",
                          { className: "global-ai-brief-card" },
                          h("h3", null, "연혁"),
                          ensureArray(aiBriefPayload.history).length
                            ? h("div", { className: "global-ai-history-list" }, ensureArray(aiBriefPayload.history).map(function (item, index) {
                                return h("div", { key: "hist-" + index, className: "global-ai-history-item" },
                                  h("strong", null, item.year || "-"),
                                  h("span", null, item.event || "-")
                                );
                              }))
                            : h(EmptyState, { compact: true, message: globalCompanyLabel("empty.history", "표시할 연혁 정보가 없습니다.") })
                        ),
                        h(
                          "div",
                          { className: "global-ai-brief-card global-ai-segment-card" },
                          h("h3", null, "사업분야"),
                          ensureArray(aiBriefPayload.business_segments).length
                            ? h("div", { className: "global-ai-segment-list" }, ensureArray(aiBriefPayload.business_segments).map(function (item, index) {
                                return h("div", { key: "seg-" + index, className: "global-ai-segment-item" },
                                  h("div", { className: "global-ai-segment-head" },
                                    h("strong", null, item.name || "-"),
                                    h("span", null, item.share_pct == null ? "매출 비중 미공개" : numberFormat(item.share_pct, 1) + "%")
                                  ),
                                  h("p", null, item.description || "-")
                                );
                              }))
                            : h(EmptyState, { compact: true, message: globalCompanyLabel("empty.segments", "표시할 사업분야 정보가 없습니다.") }),
                          h("div", { className: "global-ai-brief-note" }, aiBriefPayload.revenue_mix_note || "사업분야는 AI 추정치입니다.")
                        ),
                        ensureArray(aiBriefPayload.risks).length
                          ? h(
                              "div",
                              { className: "global-ai-brief-card" },
                              h("h3", null, "체크 포인트"),
                              h("ul", { className: "global-ai-risk-list" }, ensureArray(aiBriefPayload.risks).map(function (item, index) {
                                return h("li", { key: "risk-" + index }, item);
                              }))
                            )
                          : null
                      )
                    : h(EmptyState, { compact: true, message: globalCompanyLabel("empty.aiBrief", "AI 기업 브리프를 불러오지 못했습니다.") })
            ),
            h(
              "div",
              { className: "panel" },
              h(StockNewsBriefPanel, {
                payload: globalNewsBrief,
                loading: loadingGlobalNewsBrief,
                message: globalNewsBriefMessage,
                title: "최근 1주 뉴스 / 상승·하락 이유",
                description: "최근 1주 기사 기준으로 상승·하락 배경을 요약합니다.",
                positiveLabel: "상승 이유",
                riskLabel: "하락 이유",
                eventsLabel: "체크 포인트",
                onRefresh: detail && detail.symbol
                  ? function () {
                      setLoadingGlobalNewsBrief(true);
                      setGlobalNewsBriefMessage("");
                      fetchJson("/api/global-stocks/news-brief?symbol=" + encodeURIComponent(detail.symbol) + "&force_refresh=true", { noCache: true })
                        .then(function (payload) {
                          setGlobalNewsBrief(payload);
                        })
                        .catch(function (err) {
                          setGlobalNewsBrief(null);
                          setGlobalNewsBriefMessage(err.message || String(err));
                        })
                        .finally(function () {
                          setLoadingGlobalNewsBrief(false);
                        });
                    }
                  : null,
              })
            ),
            h(
              "div",
              { className: "panel" },
              h(
                "div",
                { className: "section-toolbar" },
                h(SectionTitle, null, "최근 재무 추이"),
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
                          renderStatementMetric(globalCompanyLabel("statementMetrics.revenue", "매출"), row.revenue, revenueMax),
                          renderStatementMetric(globalCompanyLabel("statementMetrics.operatingIncome", "영업이익"), row.operating_income, opMax),
                          renderStatementMetric(globalCompanyLabel("statementMetrics.netIncome", "순이익"), row.net_income, netMax),
                          renderStatementMarginRow(row)
                        ),
                        h("div", { className: "global-quarter-filed" }, row.filed || row.form || "-")
                      );
                    })
                  )
                : h(EmptyState, { compact: true, message: globalCompanyLabel("empty.statements", "표시할 재무 데이터가 없습니다.") })
            ),
            h(
              "div",
              { className: "panel" },
              h(SectionTitle, null, "주요 투자지표"),
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


    return GlobalCompanyPage;
  }

  modules.globalCompanyPage = Object.assign(modules.globalCompanyPage || {}, { createPage: createPage });
  global.StockAppModules = modules;
})(window);
