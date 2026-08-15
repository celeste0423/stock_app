(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const DISCLOSURE_TABS = deps.DISCLOSURE_TABS;
    const disclosureTabLabel = deps.disclosureTabLabel;
    const EarningsSurpriseRankList = deps.EarningsSurpriseRankList;
    const EarningsTrendSidePanel = deps.EarningsTrendSidePanel;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const ensureArray = deps.ensureArray;
    const fetchJson = deps.fetchJson;
    const ForeignReportedEarningsTable = deps.ForeignReportedEarningsTable;
    const h = deps.h;
    const loadDisclosurePageState = deps.loadDisclosurePageState;
    const LoadingBlock = deps.LoadingBlock;
    const MARKET_EARNINGS_TABS = deps.MARKET_EARNINGS_TABS;
    const MarketEarningsTable = deps.MarketEarningsTable;
    const numberFormat = deps.numberFormat;
    const persistDisclosurePageState = deps.persistDisclosurePageState;
    const postJson = deps.postJson;
    const requestPageNavigation = deps.requestPageNavigation;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const shiftIsoDate = deps.shiftIsoDate;
    const stashThemeStockNavigation = deps.stashThemeStockNavigation;
    const TelegramEarningsResults = deps.TelegramEarningsResults;
    const TelegramStockOverviewPanel = deps.TelegramStockOverviewPanel;
    const todayIsoDate = deps.todayIsoDate;
    const UPCOMING_EARNINGS_TABS = deps.UPCOMING_EARNINGS_TABS;
    const UpcomingEarningsCalendarPanel = deps.UpcomingEarningsCalendarPanel;
    const useFetchJson = deps.useFetchJson;

  function DisclosurePage() {
    const savedState = loadDisclosurePageState();
    const statusRequest = useFetchJson("/api/telegram/status");
    const status = statusRequest.data || {};
    const [earningsQuery, setEarningsQuery] = useState(savedState.earningsQuery || "");
    const [earningsSuggestions, setEarningsSuggestions] = useState([]);
    const [earningsActiveIndex, setEarningsActiveIndex] = useState(0);
    const [earningsResults, setEarningsResults] = useState(ensureArray(savedState.earningsResults));
    const [earningsMessage, setEarningsMessage] = useState(savedState.earningsMessage || "");
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [disclosureCategory, setDisclosureCategory] = useState(savedState.disclosureCategory || "earnings");
    const [disclosureNextOffsetId, setDisclosureNextOffsetId] = useState(Number(savedState.disclosureNextOffsetId || 0));
    const [disclosureHasMore, setDisclosureHasMore] = useState(!!savedState.disclosureHasMore);
    const [marketPayload, setMarketPayload] = useState(savedState.marketPayload || null);
    const [marketLoading, setMarketLoading] = useState(false);
    const [marketMessage, setMarketMessage] = useState("");
    const [marketScope, setMarketScope] = useState("kr");
    const [financialTrend, setFinancialTrend] = useState(savedState.financialTrend || null);
    const [financialTrendLoading, setFinancialTrendLoading] = useState(false);
    const [financialTrendMessage, setFinancialTrendMessage] = useState(savedState.financialTrendMessage || "");
    const [upcomingScope, setUpcomingScope] = useState("kr");
    const earningsTimerRef = useRef(null);
    const earningsSuggestWrapRef = useRef(null);
    const marketLoadedRef = useRef(!!savedState.marketPayload);
    const marketScrollBoxRef = useRef(null);
    const marketScrollTopRef = useRef(Number(savedState.marketScrollTop || 0));
    const marketScrollSaveTimerRef = useRef(null);
    const upcomingStart = shiftIsoDate(todayIsoDate(), 1);
    const upcomingTabConfig = UPCOMING_EARNINGS_TABS.find(function (item) { return item.key === upcomingScope; }) || UPCOMING_EARNINGS_TABS[0];
    const marketForeignRequest = useFetchJson(
      "/api/disclosure/recent-foreign-earnings?days=" + encodeURIComponent(14)
      + "&min_market_cap_100m=" + encodeURIComponent(10000)
    );
    const upcomingRequest = useFetchJson(
      "/api/disclosure/upcoming-earnings?start=" + encodeURIComponent(upcomingStart)
      + "&days=" + encodeURIComponent(14)
      + "&scope=" + encodeURIComponent(upcomingScope)
      + "&min_market_cap_100m=" + encodeURIComponent(upcomingTabConfig.minMarketCap100m || 0)
    );

    useEffect(function () {
      return function () {
        if (earningsTimerRef.current) {
          clearTimeout(earningsTimerRef.current);
        }
        if (marketScrollSaveTimerRef.current) {
          clearTimeout(marketScrollSaveTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      function closeOnOutsideClick(event) {
        if (!earningsSuggestWrapRef.current) {
          return;
        }
        if (!earningsSuggestWrapRef.current.contains(event.target)) {
          setEarningsSuggestions([]);
        }
      }
      document.addEventListener("mousedown", closeOnOutsideClick);
      return function () {
        document.removeEventListener("mousedown", closeOnOutsideClick);
      };
    }, []);

    useEffect(function () {
      persistDisclosurePageState({
        earningsQuery: earningsQuery,
        earningsResults: earningsResults,
        earningsMessage: earningsMessage,
        disclosureCategory: disclosureCategory,
        disclosureNextOffsetId: disclosureNextOffsetId,
        disclosureHasMore: disclosureHasMore,
        marketPayload: marketPayload,
        marketScrollTop: marketScrollTopRef.current,
        financialTrend: financialTrend,
        financialTrendMessage: financialTrendMessage,
      });
    }, [earningsQuery, earningsResults, earningsMessage, disclosureCategory, disclosureNextOffsetId, disclosureHasMore, marketPayload, financialTrend, financialTrendMessage]);

    useEffect(function () {
      const categoryLabel = disclosureTabLabel(disclosureCategory);
      emitWindowTitleDetail("disclosure", earningsQuery ? categoryLabel + ": " + earningsQuery : "");
    }, [earningsQuery, disclosureCategory]);

    useEffect(function () {
      if (status.authorized && !marketLoadedRef.current && !marketLoading) {
        marketLoadedRef.current = true;
        loadMarketEarnings();
      }
    }, [status.authorized]);

    useEffect(function () {
      if (!marketScrollBoxRef.current || !marketPayload) {
        return;
      }
      const savedTop = Number(marketScrollTopRef.current || 0);
      if (savedTop <= 0) {
        return;
      }
      window.setTimeout(function () {
        if (marketScrollBoxRef.current) {
          marketScrollBoxRef.current.scrollTop = savedTop;
        }
      }, 0);
    }, [marketPayload]);

    function rememberMarketScroll(event) {
      const target = event && event.currentTarget;
      if (!target) {
        return;
      }
      marketScrollTopRef.current = Number(target.scrollTop || 0);
      if (marketScrollSaveTimerRef.current) {
        clearTimeout(marketScrollSaveTimerRef.current);
      }
      marketScrollSaveTimerRef.current = setTimeout(function () {
        persistDisclosurePageState({
          earningsQuery: earningsQuery,
          earningsResults: earningsResults,
          earningsMessage: earningsMessage,
          disclosureCategory: disclosureCategory,
          disclosureNextOffsetId: disclosureNextOffsetId,
          disclosureHasMore: disclosureHasMore,
          marketPayload: marketPayload,
          marketScrollTop: marketScrollTopRef.current,
          financialTrend: financialTrend,
          financialTrendMessage: financialTrendMessage,
        });
      }, 180);
    }

    function chooseEarningsCompany(item) {
      setEarningsQuery(item.name || item.query || "");
      setEarningsSuggestions([]);
      setEarningsActiveIndex(0);
    }

    function searchEarningsCompany(value) {
      setEarningsQuery(value);
      setEarningsActiveIndex(0);
      if (earningsTimerRef.current) {
        clearTimeout(earningsTimerRef.current);
      }
      if (!value || value.trim().length < 1) {
        setEarningsSuggestions([]);
        return;
      }
      earningsTimerRef.current = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()));
          setEarningsSuggestions(ensureArray(payload.items || []));
        } catch (err) {
          setEarningsSuggestions([]);
        }
      }, 160);
    }

    function handleEarningsKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        setEarningsSuggestions([]);
        if (!earningsLoading && status.authorized) {
          runEarningsSearch();
        }
        return;
      }
      if (!earningsSuggestions.length) {
        if (event.key === "Enter") {
          event.preventDefault();
          setEarningsSuggestions([]);
          runEarningsSearch();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setEarningsActiveIndex((earningsActiveIndex + 1) % earningsSuggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setEarningsActiveIndex((earningsActiveIndex - 1 + earningsSuggestions.length) % earningsSuggestions.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const selected = earningsSuggestions[earningsActiveIndex] || earningsSuggestions[0];
        setEarningsSuggestions([]);
        if (selected) {
          chooseEarningsCompany(selected);
          setTimeout(function () { runEarningsSearch(false, selected.name || selected.query || ""); }, 0);
        } else {
          runEarningsSearch(false);
        }
      } else if (event.key === "Escape") {
        setEarningsSuggestions([]);
      }
    }

    function changeDisclosureCategory(category) {
      setDisclosureCategory(category);
      setDisclosureNextOffsetId(0);
      setDisclosureHasMore(false);
      setEarningsResults([]);
      setEarningsMessage("");
      if (String(earningsQuery || "").trim()) {
        setTimeout(function () { runEarningsSearch(false, null, category); }, 0);
      }
    }

    async function loadFinancialTrend(company) {
      const target = String(company || "").trim();
      if (!target) {
        setFinancialTrend(null);
        setFinancialTrendMessage("");
        return;
      }
      setFinancialTrendLoading(true);
      setFinancialTrendMessage("");
      try {
        const payload = await fetchJson("/api/dart/earnings-trend?company=" + encodeURIComponent(target));
        setFinancialTrend(payload);
      } catch (err) {
        setFinancialTrend(null);
        setFinancialTrendMessage(err.message || String(err));
      } finally {
        setFinancialTrendLoading(false);
      }
    }

    async function loadBusinessSegments(company) {
      const target = String(company || "").trim();
      if (!target) {
        setBusinessSegments(null);
        setBusinessSegmentsMessage("");
        return;
      }
      setBusinessSegmentsLoading(true);
      setBusinessSegmentsMessage("");
      try {
        const payload = await fetchJson("/api/kind/business-segments?company=" + encodeURIComponent(target), { noCache: true });
        setBusinessSegments(payload);
      } catch (err) {
        setBusinessSegments(null);
        setBusinessSegmentsMessage(err.message || String(err));
      } finally {
        setBusinessSegmentsLoading(false);
      }
    }

    async function loadStockOverview(company) {
      const target = String(company || "").trim();
      if (!target) {
        setStockOverview(null);
        setStockOverviewMessage("");
        return;
      }
      setStockOverviewLoading(true);
      setStockOverviewMessage("");
      try {
        const payload = await fetchJson("/api/stocks/overview?name=" + encodeURIComponent(target) + "&months=3", { noCache: true });
        setStockOverview(payload);
      } catch (err) {
        setStockOverview(null);
        setStockOverviewMessage(err.message || String(err));
      } finally {
        setStockOverviewLoading(false);
      }
    }

    async function loadWiseTargetHistory(company) {
      const target = String(company || "").trim();
      if (!target) {
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage("");
        return;
      }
      setWiseTargetHistoryLoading(true);
      setWiseTargetHistoryMessage("");
      try {
        const payload = await fetchJson("/api/stocks/wisereport-targets?name=" + encodeURIComponent(target) + "&months=12", { noCache: true });
        setWiseTargetHistory(payload);
      } catch (err) {
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage(err.message || String(err));
      } finally {
        setWiseTargetHistoryLoading(false);
      }
    }

    async function loadWiseConsensusHistory(company) {
      const target = String(company || "").trim();
      if (!target) {
        setWiseConsensusHistory(null);
        setWiseConsensusHistoryMessage("");
        return;
      }
      setWiseConsensusHistoryLoading(true);
      setWiseConsensusHistoryMessage("");
      try {
        const payload = await fetchJson("/api/stocks/wisereport-consensus?name=" + encodeURIComponent(target) + "&fin_gubun=MAIN", { noCache: true });
        setWiseConsensusHistory(payload);
      } catch (err) {
        setWiseConsensusHistory(null);
        setWiseConsensusHistoryMessage(err.message || String(err));
      } finally {
        setWiseConsensusHistoryLoading(false);
      }
    }

    async function toggleFinancialTrend() {
      const nextExpanded = !financialTrendExpanded;
      setFinancialTrendExpanded(nextExpanded);
      if (!nextExpanded) {
        return;
      }
      const target = String(earningsQuery || "").trim();
      if (!target) {
        return;
      }
      if (!financialTrend && !financialTrendLoading) {
        await loadFinancialTrend(target);
      }
    }

    function navigateBackToThemes() {
      const target = String(earningsQuery || "").trim();
      if (target) {
        stashThemeStockNavigation(target);
      }
      requestPageNavigation("themes", { stockQuery: target || "" });
    }

    async function runEarningsSearch(append, overrideCompany, overrideCategory) {
      const company = String(overrideCompany || earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage("검색 상태를 초기화했습니다.");
        return;
      }
      setEarningsSuggestions([]);
      const category = overrideCategory || disclosureCategory;
      setEarningsLoading(true);
      setEarningsMessage("");
      if (!append) {
        setEarningsResults([]);
        setDisclosureNextOffsetId(0);
        setDisclosureHasMore(false);
        loadFinancialTrend(company);
      }
      try {
        const payload = await postJson("/api/telegram/earnings_search", {
          company: company,
          category: category,
          limit: 20,
          offset_id: append ? disclosureNextOffsetId || null : null,
        });
        const nextRows = ensureArray(payload.results);
        setEarningsResults(function (current) {
          const source = append ? ensureArray(current).concat(nextRows) : nextRows;
          const seen = {};
          return source.filter(function (row) {
            const key = row.chat_id + ":" + row.message_id;
            if (seen[key]) {
              return false;
            }
            seen[key] = true;
            return true;
          });
        });
        setDisclosureNextOffsetId(Number(payload.next_offset_id || 0));
        setDisclosureHasMore(!!payload.has_more && nextRows.length > 0);
        setEarningsMessage(payload.message || "");
      } catch (err) {
        setEarningsMessage(err.message || String(err));
      } finally {
        setEarningsLoading(false);
      }
    }

    async function loadMarketEarnings() {
      if (marketLoading) {
        return;
      }
      setMarketLoading(true);
      setMarketMessage("");
      try {
        const payload = await postJson("/api/telegram/market_earnings", {
          days: 1095,
          limit: 100,
          scan_limit: 5000,
        });
        setMarketPayload(payload);
        setMarketMessage(payload.message || "");
      } catch (err) {
        setMarketMessage(err.message || String(err));
      } finally {
        setMarketLoading(false);
      }
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt disclosure-hero" },
        h(
          "div",
          { className: "disclosure-hero-row" },
          h(
            "div",
            null,
            h("div", { className: "eyebrow" }, "Disclosure & Earnings"),
            h("h1", { className: "page-title" }, "공시/실적")
          ),
          statusRequest.loading && !statusRequest.data
            ? h("div", { className: "telegram-status-pill muted" }, "상태 확인 중")
            : status.authorized
              ? h("div", { className: "telegram-status-pill" }, "텔레그램 연결됨")
              : h("div", { className: "telegram-status-pill warning" }, "텔레그램 연결 필요")
        )
      ),
      false ? h(
        "div",
        { className: "panel telegram-control-panel telegram-earnings-panel" },
        h(
          "div",
          { className: "telegram-earnings-head" },
          h(SectionTitle, null, "공시 유형 검색"),
          h("span", { className: "summary-help" }, "Awake-실시간 주식 공시 정리채널")
        ),
        h(
          "div",
          { className: "disclosure-tabbar" },
          DISCLOSURE_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "disclosure-tab" + (disclosureCategory === tab.key ? " active" : ""),
                onClick: function () { changeDisclosureCategory(tab.key); },
              },
              tab.label
            );
          })
        ),
        h(
          "div",
          { className: "earnings-search-row" },
          h("button", {
            type: "button",
            className: "earnings-nav-button",
            onClick: navigateBackToThemes,
            title: "오늘의 주도주로 돌아가기",
            "aria-label": "오늘의 주도주로 돌아가기",
          }, "<"),
          h(
            "label",
            { className: "form-field earnings-company-field", ref: earningsSuggestWrapRef },
            "&days=45",
            h("input", {
              value: earningsQuery,
              onChange: function (event) { searchEarningsCompany(event.target.value); },
              onKeyDown: handleEarningsKeyDown,
              onFocus: selectTextOnFocus,
              onBlur: function () { setTimeout(function () { setEarningsSuggestions([]); }, 120); },
              placeholder: "예: 로보티즈, HD현대중공업",
            }),
            earningsSuggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list inline" },
                  earningsSuggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: (item.code || item.name || "") + index,
                        type: "button",
                        className: "autocomplete-item" + (index === earningsActiveIndex ? " active" : ""),
                        onMouseDown: function (event) { event.preventDefault(); },
                        onMouseEnter: function () { setEarningsActiveIndex(index); },
                        onClick: function () { chooseEarningsCompany(item); },
                      },
                      h("strong", null, item.name || item.query || ""),
                      h("span", null, [item.code, item.market].filter(Boolean).join(" · "))
                    );
                  })
                )
              : null
          ),
          h("button", {
            className: "primary-button",
            onClick: function () { runEarningsSearch(false); },
            disabled: earningsLoading || !status.authorized,
          }, earningsLoading ? "검색 중..." : "검색")
        ),
        earningsMessage ? h("div", { className: "notice-box compact" }, earningsMessage) : null,
        h(TelegramStockOverviewPanel, {
          payload: stockOverview,
          loading: stockOverviewLoading,
          message: stockOverviewMessage,
          consensus: wiseConsensusHistory,
          targetHistory: wiseTargetHistory,
          onOpenForwardConsensus: openWiseConsensusModal,
        }),
        h(
          "div",
          { className: "earnings-overview-actions" },
          h("button", {
            type: "button",
            className: "mini-button" + (financialTrendExpanded ? " active" : ""),
            onClick: toggleFinancialTrend,
            disabled: !String(earningsQuery || "").trim(),
          }, financialTrendExpanded ? "실적 추이 접기" : "실적 추이 보기")
        ),
        h(
          "div",
          { className: "earnings-result-visual-grid" },
          h(
            "div",
            { className: "earnings-scroll-box" },
            h(TelegramEarningsResults, {
              rows: earningsResults,
              emptyMessage: earningsLoading ? "텔레그램 메시지 검색 중입니다." : "기업명을 입력하면 선택한 유형의 공시를 최근 3년 범위에서 표시합니다.",
            }),
            earningsResults.length
              ? h(
                  "div",
                  { className: "earnings-more-row" },
                  h("button", {
                    className: "mini-button",
                    onClick: function () { runEarningsSearch(true); },
                    disabled: earningsLoading || !disclosureHasMore,
                  }, disclosureHasMore ? "최근 3년 내 더 보기" : "더 불러올 공시 없음")
                )
              : null
          ),
          h(EarningsTrendSidePanel, {
            trend: financialTrend,
            loading: financialTrendLoading,
            message: financialTrendMessage,
          })
        )
      ) : null,
      h(
        "div",
        { className: "panel telegram-earnings-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h(SectionTitle, null, marketScope === "kr" ? "시총 2000억 이상 실적 공시" : "시총 1조 이상 해외 실적 일정"),
            h("div", { className: "summary-help" },
              marketScope === "kr"
                ? (marketPayload
                  ? "최근 " + numberFormat(marketPayload.days, 0) + "일 · " + numberFormat(marketPayload.result_count, 0) + "건 · 스캔 " + numberFormat(marketPayload.scanned_count, 0) + "개 메시지"
                  : "텔레그램 공시 채널에서 실적 공시를 날짜순으로 모읍니다.")
                : (marketForeignRequest.data
                  ? (marketForeignRequest.data.start || "") + " ~ " + (marketForeignRequest.data.end || "") + " · 실적 " + numberFormat(marketForeignRequest.data.result_count, 0) + "개"
                  : "최근 2주간 시총 1조 이상 해외 발표 실적을 보여줍니다.")
            )
          ),
          h("button", {
            className: "mini-button",
            onClick: function () {
              if (marketScope === "kr") {
                loadMarketEarnings();
              } else {
                marketForeignRequest.refresh(true);
              }
            },
            disabled: marketScope === "kr" ? (marketLoading || !status.authorized) : marketForeignRequest.loading,
          }, marketScope === "kr"
            ? (marketLoading ? "불러오는 중..." : "새로고침")
            : (marketForeignRequest.loading ? "새로고침 중..." : "새로고침"))
        ),
        h(
          "div",
          { className: "disclosure-tabbar" },
          MARKET_EARNINGS_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "disclosure-tab" + (marketScope === tab.key ? " active" : ""),
                onClick: function () { setMarketScope(tab.key); },
              },
              tab.label
            );
          })
        ),
        marketScope === "kr" && marketMessage ? h("div", { className: "notice-box compact" }, marketMessage) : null,
        marketScope === "foreign" && ensureArray(marketForeignRequest.data && marketForeignRequest.data.errors).length
          ? h("div", { className: "notice-box compact warning" }, ensureArray(marketForeignRequest.data.errors).join(" / "))
          : null,
        h(
          "div",
          { className: "earnings-scroll-box market-earnings-scroll-box", ref: marketScrollBoxRef, onScroll: rememberMarketScroll },
          marketScope === "kr"
            ? (
              marketLoading && !marketPayload
                ? h(LoadingBlock, { compact: true, title: "실적 공시 수집 중", label: "최근 메시지를 훑어 시총 2000억 이상 종목과 매칭합니다." })
                : h(MarketEarningsTable, {
                    rows: ensureArray(marketPayload && marketPayload.results),
                    emptyMessage: status.authorized ? "조건에 맞는 실적 공시가 아직 없습니다." : "텔레그램 연결 후 확인할 수 있습니다.",
                  })
            )
            : (
              marketForeignRequest.loading && !ensureArray(marketForeignRequest.data && marketForeignRequest.data.rows).length
                ? h(LoadingBlock, { compact: true, title: "해외 발표 실적 수집 중", label: "최근 2주간 Yahoo 발표 실적과 시총 데이터를 정리하고 있습니다." })
                : h(ForeignReportedEarningsTable, {
                    rows: ensureArray(marketForeignRequest.data && marketForeignRequest.data.rows),
                    emptyMessage: "조건에 맞는 최근 해외 발표 실적이 없습니다.",
                  })
            )
        )
      ),
      marketScope === "kr" ? h(EarningsSurpriseRankList, {
        rows: ensureArray(marketPayload && marketPayload.results),
      }) : null,
      h(
        "div",
        { className: "panel upcoming-earnings-panel" },
        h(
          "div",
          { className: "section-toolbar upcoming-earnings-toolbar" },
          h("div", null,
            h(SectionTitle, null, "예정 실적 달력"),
            h("div", { className: "summary-help" },
              upcomingRequest.data
                ? (upcomingRequest.data.start || upcomingStart) + " ~ " + (upcomingRequest.data.end || "") + " · 날짜 " + numberFormat(upcomingRequest.data.date_count, 0) + "일 · 일정 " + numberFormat(upcomingRequest.data.result_count, 0) + "개"
                : "다음날부터 국내 KIND IR 일정과 해외 Yahoo 실적 일정을 날짜별로 묶어 보여줍니다."
            )
          ),
          h("div", { className: "upcoming-earnings-actions" },
            h("button", {
              className: "mini-button",
              onClick: function () { upcomingRequest.refresh(true); },
              disabled: upcomingRequest.loading,
            }, upcomingRequest.loading ? "새로고침 중..." : "새로고침")
          )
        ),
        h(
          "div",
          { className: "upcoming-earnings-tabbar" },
          UPCOMING_EARNINGS_TABS.map(function (tab) {
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                className: "upcoming-earnings-tab" + (upcomingScope === tab.key ? " active" : ""),
                onClick: function () { setUpcomingScope(tab.key); },
              },
              tab.label
            );
          }),
          h("div", { className: "upcoming-earnings-filter-note" },
            h("strong", null, upcomingScope === "kr" ? "국내 2주" : "해외 2주"),
            h("span", null, upcomingScope === "kr"
              ? "다음날부터 2주간, 시총 2000억 이상 국내 예정 실적만 표시합니다."
              : "다음날부터 2주간, 시총 1조 이상 해외 예정 실적만 표시합니다.")
          )
        ),
        ensureArray(upcomingRequest.data && upcomingRequest.data.errors).length
          ? h("div", { className: "notice-box compact warning" }, ensureArray(upcomingRequest.data.errors).join(" / "))
          : null,
        h(UpcomingEarningsCalendarPanel, {
          payload: upcomingRequest.data,
          loading: upcomingRequest.loading,
          error: upcomingRequest.error,
        })
      )
    );
  }


    return DisclosurePage;
  }

  modules.disclosurePage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
