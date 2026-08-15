(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;
    const useState = React.useState;
    const consumeTelegramStockNavigation = deps.consumeTelegramStockNavigation;
    const DISCLOSURE_TABS = deps.DISCLOSURE_TABS;
    const disclosureTabLabel = deps.disclosureTabLabel;
    const EarningsTrendSidePanel = deps.EarningsTrendSidePanel;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const h = deps.h;
    const LoadingPanel = deps.LoadingPanel;
    const loadTelegramSearchState = deps.loadTelegramSearchState;
    const makeId = deps.makeId;
    const normalizeSearchValue = deps.normalizeSearchValue;
    const numberFormat = deps.numberFormat;
    const openUrlInDefaultBrowser = deps.openUrlInDefaultBrowser;
    const PAGE_NAV_EVENT = deps.PAGE_NAV_EVENT;
    const persistTelegramSearchState = deps.persistTelegramSearchState;
    const postJson = deps.postJson;
    const requestPageNavigation = deps.requestPageNavigation;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const stashThemeStockNavigation = deps.stashThemeStockNavigation;
    const StockNewsBriefPanel = deps.StockNewsBriefPanel;
    const TelegramChatFeed = deps.TelegramChatFeed;
    const TelegramEarningsResults = deps.TelegramEarningsResults;
    const TelegramStockOverviewPanel = deps.TelegramStockOverviewPanel;
    const useFetchJson = deps.useFetchJson;
    const WiseReportConsensusPanel = deps.WiseReportConsensusPanel;

  function TelegramPage() {
    const savedTelegramState = loadTelegramSearchState() || {};
    const statusRequest = useFetchJson("/api/telegram/status");
    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [keywords, setKeywords] = useState(savedTelegramState.keywords || "");
    const [matchMode, setMatchMode] = useState(savedTelegramState.matchMode || "any");
    const [exactPhrase, setExactPhrase] = useState(!!savedTelegramState.exactPhrase);
    const [hasFile, setHasFile] = useState(savedTelegramState.hasFile || "all");
    const [startDate, setStartDate] = useState(savedTelegramState.startDate || "");
    const [endDate, setEndDate] = useState(savedTelegramState.endDate || "");
    const [chatQuery, setChatQuery] = useState(savedTelegramState.chatQuery || "");
    const [selectedChats, setSelectedChats] = useState(ensureArray(savedTelegramState.selectedChats));
    const [allRoomsSearch, setAllRoomsSearch] = useState(Object.prototype.hasOwnProperty.call(savedTelegramState, "allRoomsSearch") ? !!savedTelegramState.allRoomsSearch : !ensureArray(savedTelegramState.selectedChats).length);
    const [favoriteChatGroups, setFavoriteChatGroups] = useState(ensureArray(savedTelegramState.favoriteChatGroups));
    const [favoriteGroupName, setFavoriteGroupName] = useState("");
    const [results, setResults] = useState(ensureArray(savedTelegramState.results));
    const [jobState, setJobState] = useState(savedTelegramState.jobState || null);
    const [formMessage, setFormMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [showConnection, setShowConnection] = useState(true);
    const [earningsQuery, setEarningsQuery] = useState(savedTelegramState.earningsQuery || "");
    const [earningsSuggestions, setEarningsSuggestions] = useState([]);
    const [earningsActiveIndex, setEarningsActiveIndex] = useState(0);
    const [earningsResults, setEarningsResults] = useState(ensureArray(savedTelegramState.earningsResults));
    const [earningsMessage, setEarningsMessage] = useState(savedTelegramState.earningsMessage || "");
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [earningsJobState, setEarningsJobState] = useState(null);
    const [disclosureCategory, setDisclosureCategory] = useState(savedTelegramState.disclosureCategory || "earnings");
    const [disclosureNextOffsetId, setDisclosureNextOffsetId] = useState(Number(savedTelegramState.disclosureNextOffsetId || 0));
    const [disclosureHasMore, setDisclosureHasMore] = useState(!!savedTelegramState.disclosureHasMore);
    const [financialTrend, setFinancialTrend] = useState(savedTelegramState.financialTrend || null);
    const [financialTrendLoading, setFinancialTrendLoading] = useState(false);
    const [financialTrendMessage, setFinancialTrendMessage] = useState(savedTelegramState.financialTrendMessage || "");
    const [financialTrendExpanded, setFinancialTrendExpanded] = useState(!!savedTelegramState.financialTrendExpanded);
    const [businessSegments, setBusinessSegments] = useState(savedTelegramState.businessSegments || null);
    const [businessSegmentsLoading, setBusinessSegmentsLoading] = useState(false);
    const [businessSegmentsMessage, setBusinessSegmentsMessage] = useState(savedTelegramState.businessSegmentsMessage || "");
    const [stockOverview, setStockOverview] = useState(savedTelegramState.stockOverview || null);
    const [stockOverviewLoading, setStockOverviewLoading] = useState(false);
    const [stockOverviewMessage, setStockOverviewMessage] = useState(savedTelegramState.stockOverviewMessage || "");
    const [stockNewsBrief, setStockNewsBrief] = useState(savedTelegramState.stockNewsBrief || null);
    const [stockNewsBriefLoading, setStockNewsBriefLoading] = useState(false);
    const [stockNewsBriefMessage, setStockNewsBriefMessage] = useState(savedTelegramState.stockNewsBriefMessage || "");
    const [wiseConsensusHistory, setWiseConsensusHistory] = useState(savedTelegramState.wiseConsensusHistory || null);
    const [wiseConsensusHistoryLoading, setWiseConsensusHistoryLoading] = useState(false);
    const [wiseConsensusHistoryMessage, setWiseConsensusHistoryMessage] = useState(savedTelegramState.wiseConsensusHistoryMessage || "");
    const [wiseTargetHistory, setWiseTargetHistory] = useState(savedTelegramState.wiseTargetHistory || null);
    const [wiseTargetHistoryLoading, setWiseTargetHistoryLoading] = useState(false);
    const [wiseTargetHistoryMessage, setWiseTargetHistoryMessage] = useState(savedTelegramState.wiseTargetHistoryMessage || "");
    const [wiseConsensusModalOpen, setWiseConsensusModalOpen] = useState(false);
    const [companyLinkLoading, setCompanyLinkLoading] = useState("");
    const [reportListModal, setReportListModal] = useState({ open: false, loading: false, error: "", payload: null });
    const [investorFlowModal, setInvestorFlowModal] = useState({ open: false, loading: false, error: "", payload: null });
    const pollRef = useRef(null);
    const earningsPollRef = useRef(null);
    const earningsJobModeRef = useRef("replace");
    const linkedMessageSearchRef = useRef({ pending: false, company: "" });
    const pendingFinancialTrendRef = useRef("");
    const earningsTimerRef = useRef(null);
    const earningsSuggestWrapRef = useRef(null);
    const backendStateLoadedRef = useRef(false);
    const backendStateSaveTimerRef = useRef(null);
    const overviewHydrationRefreshDoneRef = useRef(false);

    async function loadStockNewsBrief(company, forceRefresh) {
      const target = String(company || "").trim();
      if (!target) {
        setStockNewsBrief(null);
        setStockNewsBriefMessage("");
        return;
      }
      setStockNewsBriefLoading(true);
      setStockNewsBriefMessage("");
      try {
        const payload = await fetchJson(
          "/api/stocks/news-brief?q=" + encodeURIComponent(target) +
            "&days=7&force_refresh=" + (forceRefresh ? "true" : "false"),
          { noCache: !!forceRefresh }
        );
        setStockNewsBrief(payload);
        setStockNewsBriefMessage(payload && payload.ai_error ? "Gemini 요약을 불러오지 못해 중요 기사 목록만 표시합니다." : "");
      } catch (err) {
        setStockNewsBrief(null);
        setStockNewsBriefMessage(err.message || String(err));
      } finally {
        setStockNewsBriefLoading(false);
      }
    }

    useEffect(function () {
      const status = statusRequest.data;
      if (!status) {
        return;
      }
      setPhone(function (current) { return current || status.phone || ""; });
      setShowConnection(!status.authorized);
    }, [statusRequest.data]);

    useEffect(function () {
      return function () {
        if (pollRef.current) {
          clearTimeout(pollRef.current);
        }
        if (earningsTimerRef.current) {
          clearTimeout(earningsTimerRef.current);
        }
        if (earningsPollRef.current) {
          clearTimeout(earningsPollRef.current);
        }
        if (backendStateSaveTimerRef.current) {
          clearTimeout(backendStateSaveTimerRef.current);
        }
      };
    }, []);

    function applyTelegramSavedState(state) {
      const source = state || {};
      setKeywords(String(source.keywords || ""));
      setMatchMode(source.matchMode === "all" ? "all" : "any");
      setExactPhrase(!!source.exactPhrase);
      setHasFile(["all", "with", "without"].indexOf(source.hasFile) >= 0 ? source.hasFile : "all");
      setStartDate(String(source.startDate || ""));
      setEndDate(String(source.endDate || ""));
      setChatQuery(String(source.chatQuery || ""));
      const nextSelectedChats = ensureArray(source.selectedChats).map(function (item) {
        return { id: Number(item.id), name: String(item.name || "") };
      }).filter(function (item) {
        return Number.isFinite(item.id) && item.name;
      });
      setSelectedChats(nextSelectedChats);
      setAllRoomsSearch(Object.prototype.hasOwnProperty.call(source, "allRoomsSearch") ? !!source.allRoomsSearch : !nextSelectedChats.length);
      setFavoriteChatGroups(ensureArray(source.favoriteChatGroups).map(function (group) {
        return {
          id: String(group.id || makeId("tg-group")),
          name: String(group.name || "").trim(),
          chats: ensureArray(group.chats).map(function (item) {
            return { id: Number(item.id), name: String(item.name || "") };
          }).filter(function (item) {
            return Number.isFinite(item.id) && item.name;
          }),
        };
      }).filter(function (group) {
        return group.name && group.chats.length;
      }));
      setResults(ensureArray(source.results));
      setJobState(source.jobState || null);
      setEarningsQuery(String(source.earningsQuery || ""));
      setEarningsResults(ensureArray(source.earningsResults));
      setEarningsMessage(String(source.earningsMessage || ""));
      setDisclosureCategory(source.disclosureCategory || "earnings");
      setDisclosureNextOffsetId(Number(source.disclosureNextOffsetId || 0));
      setDisclosureHasMore(!!source.disclosureHasMore);
      setFinancialTrend(source.financialTrend || null);
      setFinancialTrendMessage(String(source.financialTrendMessage || ""));
      setFinancialTrendExpanded(!!source.financialTrendExpanded);
      setBusinessSegments(source.businessSegments || null);
      setBusinessSegmentsMessage(String(source.businessSegmentsMessage || ""));
      setStockOverview(source.stockOverview || null);
      setStockOverviewMessage(String(source.stockOverviewMessage || ""));
      setStockNewsBrief(source.stockNewsBrief || null);
      setStockNewsBriefMessage(String(source.stockNewsBriefMessage || ""));
      setWiseConsensusHistory(source.wiseConsensusHistory || null);
      setWiseConsensusHistoryMessage(String(source.wiseConsensusHistoryMessage || ""));
      setWiseTargetHistory(source.wiseTargetHistory || null);
      setWiseTargetHistoryMessage(String(source.wiseTargetHistoryMessage || ""));
    }

    function currentTelegramState() {
      return {
        keywords: keywords,
        matchMode: matchMode,
        exactPhrase: exactPhrase,
        hasFile: hasFile,
        startDate: startDate,
        endDate: endDate,
        chatQuery: chatQuery,
        allRoomsSearch: allRoomsSearch,
        selectedChats: selectedChats,
        favoriteChatGroups: favoriteChatGroups,
        results: results,
        jobState: jobState,
        earningsQuery: earningsQuery,
        earningsResults: earningsResults,
        earningsMessage: earningsMessage,
        disclosureCategory: disclosureCategory,
        disclosureNextOffsetId: disclosureNextOffsetId,
        disclosureHasMore: disclosureHasMore,
        financialTrend: financialTrend,
        financialTrendMessage: financialTrendMessage,
        financialTrendExpanded: financialTrendExpanded,
        businessSegments: businessSegments,
        businessSegmentsMessage: businessSegmentsMessage,
        stockOverview: stockOverview,
        stockOverviewMessage: stockOverviewMessage,
        stockNewsBrief: stockNewsBrief,
        stockNewsBriefMessage: stockNewsBriefMessage,
        wiseConsensusHistory: wiseConsensusHistory,
        wiseConsensusHistoryMessage: wiseConsensusHistoryMessage,
        wiseTargetHistory: wiseTargetHistory,
        wiseTargetHistoryMessage: wiseTargetHistoryMessage,
      };
    }

    function applyThemeStockSearch(nextCompany) {
      const pendingCompany = String(nextCompany || "").trim();
      if (!pendingCompany) {
        return;
      }
      setEarningsQuery(pendingCompany);
      setEarningsSuggestions([]);
      setEarningsActiveIndex(0);
      setEarningsResults([]);
      setEarningsMessage("");
      setDisclosureCategory("earnings");
      setDisclosureNextOffsetId(0);
      setDisclosureHasMore(false);
      setFinancialTrend(null);
      setFinancialTrendMessage("");
      setFinancialTrendExpanded(false);
      setBusinessSegments(null);
      setBusinessSegmentsMessage("");
      setStockOverview(null);
      setStockOverviewMessage("");
      setStockNewsBrief(null);
      setStockNewsBriefMessage("");
      setWiseConsensusHistory(null);
      setWiseConsensusHistoryMessage("");
      setWiseTargetHistory(null);
      setWiseTargetHistoryMessage("");
      setTimeout(function () {
        runEarningsSearch(false, pendingCompany, "earnings", true);
      }, 0);
    }

    useEffect(function () {
      let cancelled = false;
      let appliedBackendState = false;
      fetchJson("/api/telegram/ui_state", { noCache: true })
        .then(function (payload) {
          if (cancelled) {
            return;
          }
          const backendState = payload && payload.state ? payload.state : null;
          if (backendState && Object.keys(backendState).length) {
            appliedBackendState = true;
            applyTelegramSavedState(backendState);
          }
        })
        .catch(function () {})
        .finally(function () {
          if (!cancelled) {
            backendStateLoadedRef.current = true;
            const pendingThemeStock = consumeTelegramStockNavigation();
            const pendingCompany = String((pendingThemeStock && pendingThemeStock.query) || "").trim();
            if (pendingCompany) {
              applyThemeStockSearch(pendingCompany);
            }
            if (!appliedBackendState) {
              postJson("/api/telegram/ui_state", { state: currentTelegramState() }).catch(function () {});
            }
          }
        });
      return function () {
        cancelled = true;
      };
    }, []);

    useEffect(function () {
      function handleThemeStockNavigation(event) {
        const payload = (event && event.detail) || {};
        if (payload.page !== "telegram") {
          return;
        }
        const directQuery = String(payload.stockQuery || "").trim();
        const stashed = consumeTelegramStockNavigation();
        const stashedQuery = String((stashed && stashed.query) || "").trim();
        const targetQuery = directQuery || stashedQuery;
        if (!targetQuery) {
          return;
        }
        applyThemeStockSearch(targetQuery);
      }
      window.addEventListener(PAGE_NAV_EVENT, handleThemeStockNavigation);
      return function () {
        window.removeEventListener(PAGE_NAV_EVENT, handleThemeStockNavigation);
      };
    }, [runEarningsSearch]);

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
      if (jobState && jobState.job_id && !jobState.finished) {
        setJobState(Object.assign({}, jobState, {
          finished: true,
          message: "이전 검색 결과를 불러왔습니다.",
        }));
      }
    }, []);

    useEffect(function () {
      if (!backendStateLoadedRef.current) {
        return;
      }
      const target = String(earningsQuery || "").trim();
      if (!target || overviewHydrationRefreshDoneRef.current) {
        return;
      }
      const overviewNeedsRefresh = !stockOverview || (!Number.isFinite(Number(stockOverview.forward_per)) && !Number.isFinite(Number(stockOverview.forward_pbr)));
      const consensusNeedsRefresh = !wiseConsensusHistory || !wiseConsensusHistory.latest;
      const targetHistoryNeedsRefresh = !wiseTargetHistory || !ensureArray(wiseTargetHistory.series).length;
      const newsBriefNeedsRefresh = !stockNewsBrief;
      if (!overviewNeedsRefresh && !consensusNeedsRefresh && !targetHistoryNeedsRefresh && !newsBriefNeedsRefresh) {
        overviewHydrationRefreshDoneRef.current = true;
        return;
      }
      overviewHydrationRefreshDoneRef.current = true;
      loadStockOverview(target);
      loadWiseConsensusHistory(target);
      loadWiseTargetHistory(target);
      loadStockNewsBrief(target, false);
    }, [earningsQuery, stockOverview, wiseConsensusHistory, wiseTargetHistory, stockNewsBrief]);

    useEffect(function () {
      const snapshot = currentTelegramState();
      persistTelegramSearchState(snapshot);
      if (!backendStateLoadedRef.current) {
        return;
      }
      if (backendStateSaveTimerRef.current) {
        clearTimeout(backendStateSaveTimerRef.current);
      }
      backendStateSaveTimerRef.current = setTimeout(function () {
        postJson("/api/telegram/ui_state", { state: snapshot }).catch(function () {});
      }, 350);
    }, [keywords, matchMode, exactPhrase, hasFile, startDate, endDate, chatQuery, allRoomsSearch, selectedChats, favoriteChatGroups, results, jobState, earningsQuery, earningsResults, earningsMessage, disclosureCategory, disclosureNextOffsetId, disclosureHasMore, financialTrend, financialTrendMessage, businessSegments, businessSegmentsMessage, stockOverview, stockOverviewMessage, stockNewsBrief, stockNewsBriefMessage, wiseConsensusHistory, wiseConsensusHistoryMessage, wiseTargetHistory, wiseTargetHistoryMessage]);

    useEffect(function () {
      const categoryLabel = disclosureTabLabel(disclosureCategory);
      const detail = earningsQuery
        ? categoryLabel + ": " + earningsQuery
        : keywords
          ? "검색: " + keywords
          : "";
      emitWindowTitleDetail("telegram", detail);
    }, [earningsQuery, disclosureCategory, keywords]);

    const dialogs = ensureArray(statusRequest.data && statusRequest.data.dialogs);
    const filteredDialogs = useMemo(function () {
      const query = normalizeSearchValue(chatQuery);
      if (!query) {
        return [];
      }
      return dialogs
        .filter(function (dialog) {
          return normalizeSearchValue(dialog.name || "").indexOf(query) >= 0;
        })
        .slice(0, 50);
    }, [chatQuery, dialogs]);

    const selectedChatIds = selectedChats.map(function (item) { return item.id; });

    function syncJob(job) {
      setJobState(job);
      setResults(ensureArray(job && job.results));
      if (!job || job.finished) {
        pollRef.current = null;
        return;
      }
      pollRef.current = setTimeout(async function () {
        try {
          const next = await fetchJson("/api/telegram/search_jobs/" + job.job_id);
          syncJob(next);
        } catch (err) {
          setFormMessage(err.message || String(err));
        }
      }, 1200);
    }

    function mergeEarningsResults(current, incoming, append) {
      const source = append ? ensureArray(current).concat(ensureArray(incoming)) : ensureArray(incoming);
      const seen = {};
      return source.filter(function (row) {
        const key = row.chat_id + ":" + row.message_id;
        if (seen[key]) {
          return false;
        }
        seen[key] = true;
        return true;
      });
    }

    function syncEarningsJob(job, append) {
      const shouldAppend = append || earningsJobModeRef.current === "append";
      const incomingRows = ensureArray(job && job.results);
      setEarningsJobState(job);
      setEarningsResults(function (current) {
        return mergeEarningsResults(current, incomingRows, shouldAppend);
      });
      setDisclosureNextOffsetId(Number(job && job.next_offset_id || 0));
      setDisclosureHasMore(!!(job && job.has_more));
      setEarningsMessage(job && job.message ? job.message : "");
      if (
        linkedMessageSearchRef.current.pending &&
        linkedMessageSearchRef.current.company &&
        (incomingRows.length || (job && job.finished))
      ) {
        const linkedCompany = linkedMessageSearchRef.current.company;
        linkedMessageSearchRef.current = { pending: false, company: "" };
        setTimeout(function () {
          runSearch(linkedCompany);
        }, 0);
      }
      if (!job || job.finished || !job.job_id) {
        setEarningsLoading(false);
        if (earningsPollRef.current) {
          clearTimeout(earningsPollRef.current);
        }
        earningsPollRef.current = null;
        return;
      }
      if (earningsPollRef.current) {
        clearTimeout(earningsPollRef.current);
        earningsPollRef.current = null;
      }
      earningsPollRef.current = setTimeout(async function () {
        try {
          const next = await fetchJson("/api/telegram/earnings_search_jobs/" + job.job_id);
          syncEarningsJob(next, shouldAppend);
        } catch (err) {
          setEarningsLoading(false);
          setEarningsMessage(err.message || String(err));
        }
      }, 250);
    }

    async function cancelEarningsSearch() {
      const job = earningsJobState;
      if (!job || !job.job_id) {
        setEarningsLoading(false);
        setEarningsMessage("검색 상태를 초기화했습니다.");
        return;
      }
      if (earningsPollRef.current) {
        clearTimeout(earningsPollRef.current);
        earningsPollRef.current = null;
      }
      try {
        const cancelled = await postJson("/api/telegram/earnings_search_jobs/" + job.job_id + "/cancel", {});
        syncEarningsJob(cancelled, earningsJobModeRef.current === "append");
      } catch (err) {
        setEarningsLoading(false);
        setEarningsMessage(err.message || String(err));
      }
    }

    async function sendCode() {
      setSubmitting(true);
      setFormMessage("");
      try {
        const payload = await postJson("/api/telegram/send_code", {
          api_id: Number(apiId || 0),
          api_hash: apiHash,
          phone: phone,
        });
        setFormMessage(payload.message || "인증 코드를 전송했습니다.");
      } catch (err) {
        setFormMessage(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    }

    async function verifyCode() {
      setSubmitting(true);
      setFormMessage("");
      try {
        const payload = await postJson("/api/telegram/verify_code", {
          phone: phone,
          code: code,
          password: password || null,
        });
        setFormMessage(payload.message || "로그인이 완료되었습니다.");
        await statusRequest.refresh();
        setShowConnection(false);
      } catch (err) {
        setFormMessage(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    }

    function addChat(dialog) {
      if (selectedChatIds.indexOf(dialog.id) >= 0) {
        return;
      }
      setSelectedChats(selectedChats.concat([{ id: dialog.id, name: dialog.name }]));
      setAllRoomsSearch(false);
      setChatQuery("");
    }

    function removeChat(chatId) {
      setSelectedChats(selectedChats.filter(function (item) { return item.id !== chatId; }));
    }

    function normalizeChatSelection(chats) {
      const seen = {};
      return ensureArray(chats).map(function (item) {
        return { id: Number(item.id), name: String(item.name || "") };
      }).filter(function (item) {
        if (!Number.isFinite(item.id) || !item.name || seen[item.id]) {
          return false;
        }
        seen[item.id] = true;
        return true;
      });
    }

    function saveFavoriteChatGroup() {
      const groupName = String(favoriteGroupName || "").trim();
      const chats = normalizeChatSelection(selectedChats);
      if (!groupName) {
        setFormMessage("즐겨찾기 그룹 이름을 입력해 주세요.");
        return;
      }
      if (!chats.length) {
        setFormMessage("즐겨찾기 그룹에 넣을 방을 먼저 선택해 주세요.");
        return;
      }
      setFavoriteChatGroups(function (current) {
        const nextGroup = { id: makeId("tg-group"), name: groupName, chats: chats };
        return ensureArray(current).filter(function (group) { return group.name !== groupName; }).concat([nextGroup]);
      });
      setFavoriteGroupName("");
      setFormMessage("즐겨찾기 그룹을 저장했습니다.");
    }

    function applyFavoriteChatGroup(group) {
      const chats = normalizeChatSelection(group && group.chats);
      if (!chats.length) {
        return;
      }
      setSelectedChats(chats);
      setAllRoomsSearch(false);
      setChatQuery("");
      setFormMessage("'" + group.name + "' 그룹으로 검색 대상을 전환했습니다.");
    }

    function removeFavoriteChatGroup(groupId) {
      setFavoriteChatGroups(function (current) {
        return ensureArray(current).filter(function (group) { return group.id !== groupId; });
      });
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

    async function runEarningsSearch(append, overrideCompany, overrideCategory, forceLinkedMessageSearch) {
      const company = String(overrideCompany || earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage("사업보고서를 열 기업명을 입력해 주세요.");
        return;
      }
      overviewHydrationRefreshDoneRef.current = true;
      setEarningsSuggestions([]);
      const category = overrideCategory || disclosureCategory;
      setEarningsLoading(true);
      setEarningsMessage("");
      if (earningsPollRef.current) {
        clearTimeout(earningsPollRef.current);
        earningsPollRef.current = null;
      }
      earningsJobModeRef.current = append ? "append" : "replace";
      if (!append) {
        setEarningsResults([]);
        setDisclosureNextOffsetId(0);
        setDisclosureHasMore(false);
        setEarningsJobState(null);
        setKeywords(company);
        const shouldRunLinkedMessageSearch = !!forceLinkedMessageSearch || !overrideCategory;
        linkedMessageSearchRef.current = {
          pending: shouldRunLinkedMessageSearch,
          company: shouldRunLinkedMessageSearch ? company : "",
        };
        setFinancialTrend(null);
        setFinancialTrendMessage("");
        setFinancialTrendExpanded(false);
        setBusinessSegments(null);
        setBusinessSegmentsMessage("");
        setStockOverview(null);
        setStockOverviewMessage("");
        setStockNewsBrief(null);
        setStockNewsBriefMessage("");
        setWiseTargetHistory(null);
        setWiseTargetHistoryMessage("");
        loadStockOverview(company);
        loadStockNewsBrief(company, false);
        loadWiseConsensusHistory(company);
        loadWiseTargetHistory(company);
        if (jobState && jobState.job_id && !jobState.finished) {
          postJson("/api/telegram/search_jobs/" + jobState.job_id + "/cancel", {})
            .then(syncJob)
            .catch(function () {});
        }
        await postJson("/api/telegram/jobs/cancel_all", {}).catch(function () {});
      }
      try {
        const job = await postJson("/api/telegram/earnings_search_jobs", {
          company: company,
          category: category,
          limit: 20,
          offset_id: append ? disclosureNextOffsetId || null : null,
        });
        syncEarningsJob(job, append);
      } catch (err) {
        setEarningsLoading(false);
        setEarningsMessage(err.message || String(err));
      }
    }

    async function runSearch(overrideKeywords) {
      const searchText = String(overrideKeywords == null ? keywords : overrideKeywords);
      const tokens = searchText
        .split(/[\s,;]+/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
      if (!tokens.length) {
        setFormMessage("검색할 단어를 하나 이상 입력해 주세요.");
        return;
      }
      if (!allRoomsSearch && !selectedChatIds.length) {
        setFormMessage("모든 방 검색을 끄려면 검색할 방이나 즐겨찾기 그룹을 선택해 주세요.");
        return;
      }
      setSubmitting(true);
      setFormMessage("");
      setResults([]);
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      try {
        const job = await postJson("/api/telegram/search_jobs", {
          keywords: tokens,
          chat_ids: allRoomsSearch ? null : selectedChatIds,
          has_file: hasFile === "all" ? null : hasFile === "with",
          match_mode: matchMode,
          exact_phrase: exactPhrase,
          start_date: startDate || null,
          end_date: endDate || null,
        });
        syncJob(job);
      } catch (err) {
        setFormMessage(err.message || String(err));
      } finally {
        setSubmitting(false);
      }
    }

    function closeReportListModal() {
      setReportListModal({ open: false, loading: false, error: "", payload: null });
    }

    function openWiseConsensusModal() {
      setWiseConsensusModalOpen(true);
    }

    function closeWiseConsensusModal() {
      setWiseConsensusModalOpen(false);
    }

    async function openKindReportList(reportScope) {
      const scope = reportScope === "business" ? "business" : "periodic";
      const company = String(earningsQuery || "").trim();
      if (!company) {
        setEarningsMessage((scope === "periodic" ? "공시리스트" : "사업보고서 목록") + "를 열 종목명을 입력해 주세요.");
        return;
      }
      setCompanyLinkLoading(scope === "periodic" ? "kind-report-list" : "kind-business-list");
      setEarningsMessage("");
      setReportListModal({ open: true, loading: true, error: "", payload: null });
      try {
        const payload = await fetchJson(
          "/api/kind/report-list?company=" + encodeURIComponent(company) +
          "&scope=" + encodeURIComponent(scope) +
          "&years=3",
          { noCache: true }
        );
        setReportListModal({ open: true, loading: false, error: "", payload: payload });
        setEarningsMessage((payload.stock_name || company) + " 최근 3개년 공시 목록을 불러왔습니다.");
      } catch (err) {
        const message = err.message || String(err);
        setReportListModal({ open: true, loading: false, error: message, payload: null });
        setEarningsMessage(message);
      } finally {
        setCompanyLinkLoading("");
      }
    }

    async function openKindReportListItem(url) {
      if (!url) {
        return;
      }
      try {
        await openUrlInDefaultBrowser(url);
      } catch (err) {
        setEarningsMessage(err.message || String(err));
      }
    }

    async function resolveCompanyStockForLinks() {
      const company = String(earningsQuery || "").trim();
      if (!company) {
        throw new Error("기업명을 입력해 주세요.");
      }
      const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(company) + "&limit=1", { noCache: true });
      const item = ensureArray(payload.items)[0];
      const code = String((item && item.code) || "").replace(/\D/g, "").padStart(6, "0");
      if (!item || !code || code.length !== 6) {
        throw new Error("해당 기업의 종목코드를 찾지 못했습니다.");
      }
      return { code: code, name: item.name || company };
    }

    async function openCompanyInfoSite(site) {
      setCompanyLinkLoading(site);
      setEarningsMessage("");
      try {
        const stock = await resolveCompanyStockForLinks();
        if (site === "tradingview") {
          const payload = await postJson("/api/tradingview/open", {
            stock_code: stock.code,
            stock_name: stock.name,
          });
          setEarningsMessage(payload.message || ((payload.stock_name || stock.name) + " 차트를 TradingView에서 열었습니다."));
          return;
        }
        const url = site === "wisereport"
          ? "https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd=" + encodeURIComponent(stock.code)
          : site === "irgo"
            ? "https://m.irgo.co.kr/IR-COMP/" + encodeURIComponent(stock.code) + "/" + encodeURIComponent(stock.name + "-IR-PAGE")
            : "https://comp.wisereport.co.kr/company/c1010001.aspx?cn=&cmp_cd=" + encodeURIComponent(stock.code);
        await openUrlInDefaultBrowser(url);
        setEarningsMessage(stock.name + " 정보를 " + (site === "wisereport" ? "WiseReport" : site === "irgo" ? "IRGO" : "외부 사이트") + "에서 열었습니다.");
      } catch (err) {
        setEarningsMessage(err.message || String(err));
      } finally {
        setCompanyLinkLoading("");
      }
    }

    function closeInvestorFlowPopup() {
      setInvestorFlowModal({ open: false, loading: false, error: "", payload: null });
    }

    async function openInvestorFlowPopup() {
      setCompanyLinkLoading("flows");
      setEarningsMessage("");
      setInvestorFlowModal({ open: true, loading: true, error: "", payload: null });
      try {
        const stock = await resolveCompanyStockForLinks();
        const payload = await fetchJson(
          "/api/stocks/investor-flows?code=" + encodeURIComponent(stock.code) +
            "&name=" + encodeURIComponent(stock.name || "") +
            "&days=45",
          { noCache: true }
        );
        setInvestorFlowModal({ open: true, loading: false, error: "", payload: payload });
      } catch (err) {
        setInvestorFlowModal({ open: true, loading: false, error: err.message || String(err), payload: null });
      } finally {
        setCompanyLinkLoading("");
      }
    }

    function flowClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) {
        return "flow-number neutral";
      }
      return "flow-number " + (number > 0 ? "positive" : "negative");
    }

    function formatFlowNumber(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, 0);
    }

    function formatFlowPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, 2) + "%";
    }

    function renderInvestorFlowPopup() {
      if (!investorFlowModal.open) {
        return null;
      }
      const payload = investorFlowModal.payload || {};
      const rows = ensureArray(payload.rows);
      const columns = ensureArray(payload.columns);
      const totals = payload.totals || {};
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeInvestorFlowPopup },
        h(
          "div",
          { className: "modal-panel investor-flow-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head investor-flow-head" },
            h(
              "div",
              null,
              h("span", { className: "eyebrow" }, "일별 주체별 수급"),
              h("h2", null, payload.stock_name ? payload.stock_name + " (" + payload.stock_code + ")" : "수급 조회")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeInvestorFlowPopup }, "닫기")
          ),
          investorFlowModal.loading
            ? h("div", { className: "stock-chart-loading" }, "수급 데이터를 불러오는 중입니다.")
            : investorFlowModal.error
              ? h("div", { className: "stock-chart-error" }, investorFlowModal.error)
              : h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "investor-flow-summary" },
                    h("span", null, [payload.from_date, payload.to_date].filter(Boolean).join(" ~ ")),
                    h("span", null, payload.source || "수급 데이터"),
                    h("span", null, "단위: " + (payload.unit || "주"))
                  ),
                  payload.note ? h("div", { className: "notice-box compact investor-flow-note" }, payload.note) : null,
                  h(
                    "div",
                    { className: "investor-flow-table-wrap" },
                    h(
                      "table",
                      { className: "investor-flow-table" },
                      h(
                        "thead",
                        null,
                        h(
                          "tr",
                          null,
                          ["일자", "종가", "전일대비", "등락률", "거래량"].map(function (label) {
                            return h("th", { key: label }, label);
                          }),
                          columns.map(function (column) {
                            return h("th", { key: column.key }, column.label);
                          })
                        )
                      ),
                      h(
                        "tbody",
                        null,
                        rows.map(function (row) {
                          return h(
                            "tr",
                            { key: row.date },
                            h("td", { className: "flow-date-cell" }, row.date),
                            h("td", null, numberFormat(row.close, 0)),
                            h("td", { className: flowClass(row.change) }, formatFlowNumber(row.change)),
                            h("td", { className: flowClass(row.change_pct) }, formatFlowPercent(row.change_pct)),
                            h("td", null, numberFormat(row.volume, 0)),
                            columns.map(function (column) {
                              return h("td", { key: column.key, className: flowClass(row[column.key]) }, formatFlowNumber(row[column.key]));
                            })
                          );
                        }),
                        rows.length
                          ? h(
                              "tr",
                              { className: "investor-flow-total-row" },
                              h("td", null, "합계"),
                              h("td", null, ""),
                              h("td", null, ""),
                              h("td", null, ""),
                              h("td", null, ""),
                              columns.map(function (column) {
                                return h("td", { key: column.key, className: flowClass(totals[column.key]) }, formatFlowNumber(totals[column.key]));
                              })
                            )
                          : null
                      )
                    )
                  )
                )
        )
      );
    }

    function renderReportListModal() {
      if (!reportListModal.open) {
        return null;
      }
      const payload = reportListModal.payload || {};
      const rows = ensureArray(payload.items);
      const stockLabel = payload.stock_name
        ? payload.stock_name + (payload.stock_code ? " (" + payload.stock_code + ")" : "")
        : "공시리스트";
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeReportListModal },
        h(
          "div",
          { className: "modal-panel investor-flow-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head investor-flow-head" },
            h(
              "div",
              null,
              h("span", { className: "eyebrow" }, "KIND REPORT LIST"),
              h("h2", null, stockLabel)
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeReportListModal }, "닫기")
          ),
          reportListModal.loading
            ? h("div", { className: "stock-chart-loading" }, "최근 3개년 공시 목록을 불러오는 중입니다.")
            : reportListModal.error
              ? h("div", { className: "stock-chart-error" }, reportListModal.error)
              : h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "investor-flow-summary" },
                    h("span", null, stockLabel),
                    h("span", null, "최근 " + numberFormat(Number(payload.years || 3), 0) + "개년"),
                    h("span", null, payload.scope === "business" ? "사업보고서" : "정기공시")
                  ),
                  rows.length
                    ? h(
                        "div",
                        { className: "earnings-scroll-box" },
                        rows.map(function (row, index) {
                          return h(
                            "button",
                            {
                              key: (row.acpt_no || row.url || "") + index,
                              type: "button",
                              className: "autocomplete-item",
                              style: { width: "100%", textAlign: "left", marginBottom: "8px" },
                              onClick: function () { openKindReportListItem(row.url); },
                            },
                            h("strong", null, row.title || "공시"),
                            h("span", null, [row.accepted_at, row.report_year ? row.report_year + "년" : "", row.report_type].filter(Boolean).join(" · "))
                          );
                        })
                      )
                    : h("div", { className: "empty-state" }, "최근 3개년 내 표시할 공시가 없습니다.")
            )
        )
      );
    }

    function renderWiseConsensusModal() {
      if (!wiseConsensusModalOpen) {
        return null;
      }
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeWiseConsensusModal },
        h(
          "div",
          { className: "modal-panel investor-flow-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head investor-flow-head" },
            h("div", null,
              h("strong", null, "WiseReport 추정실적 컨센서스"),
              h("div", { className: "summary-help" }, "Forward PER/PBR 클릭 시 열리는 상세 팝업입니다.")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeWiseConsensusModal }, "닫기")
          ),
          h(WiseReportConsensusPanel, {
            payload: wiseConsensusHistory,
            loading: wiseConsensusHistoryLoading,
            message: wiseConsensusHistoryMessage,
          })
        )
      );
    }

    function formatBusinessSegmentAmount(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return numberFormat(number / 100, 0) + "\uc5b5\uc6d0";
    }

    function renderBusinessSegmentsPanel() {
      const payload = businessSegments || {};
      const rows = ensureArray(payload.segments);
      if (businessSegmentsLoading) {
        return h(
          "div",
          { className: "business-segment-panel loading" },
          h("div", { className: "business-segment-title" },
            h("strong", null, "방 즐겨찾기 그룹"),
            h("span", null, "최신 사업보고서 기준 매출 비중입니다.")
          ),
          h("div", { className: "business-segment-skeleton" })
        );
      }
      if (businessSegmentsMessage) {
        return h(
          "div",
          { className: "business-segment-panel muted" },
          h("div", { className: "business-segment-title" },
            h("strong", null, "방 즐겨찾기 그룹"),
            h("span", null, businessSegmentsMessage)
          )
        );
      }
      if (!rows.length) {
        return null;
      }
      const summary = payload.summary || {};
      return h(
        "div",
        { className: "business-segment-panel" },
        h(
          "div",
          { className: "business-segment-title" },
          h("strong", null, "사업부문 분석 결과"),
          h("span", null, [
            payload.stock_name || "",
            payload.accepted_at || "",
            summary.unit ? "\ub2e8\uc704 " + summary.unit : "",
          ].filter(Boolean).join(" · "))
        ),
        h(
          "div",
          { className: "business-segment-bars" },
          rows.map(function (row, index) {
            const ratio = Math.max(0, Math.min(100, Number(row.ratio_pct || 0)));
            return h(
              "div",
              { key: row.segment + index, className: "business-segment-row" },
              h("div", { className: "business-segment-main" },
                h("strong", null, row.segment || "-"),
                h("span", null, row.items || row.usage || "")
              ),
              h(
                "div",
                { className: "business-segment-bar-wrap" },
                h("div", { className: "business-segment-bar", style: { width: ratio + "%" } })
              ),
              h("div", { className: "business-segment-number" },
                h("strong", null, numberFormat(ratio, 2) + "%"),
                h("span", null, formatBusinessSegmentAmount(row.amount_million_krw))
              )
            );
          })
        ),
        h(
          "div",
          { className: "business-segment-foot" },
          h("span", null, payload.report_title || "KIND \uc0ac\uc5c5 \ubd80\ubb38 \uc815\ubcf4"),
          payload.kind_url
            ? h("a", { href: payload.kind_url, target: "_blank", rel: "noreferrer" }, "\uc6d0\ubb38\ubcf4\uae30")
            : null
        )
      );
    }

    async function cancelSearch() {
      if (!jobState || !jobState.job_id) {
        return;
      }
      try {
        const cancelled = await postJson("/api/telegram/search_jobs/" + jobState.job_id + "/cancel", {});
        syncJob(cancelled);
      } catch (err) {
        setFormMessage(err.message || String(err));
      }
    }

    function renderDisclosureSearchPanel() {
      return h(
        "div",
        { className: "panel telegram-control-panel telegram-earnings-panel" },
        h(
          "div",
          { className: "telegram-earnings-head" },
          h(SectionTitle, null, "검색 결과"),
          h("span", { className: "summary-help" }, "검색하면 아래 텔레그램 메시지 검색도 같은 기업명으로 자동 실행됩니다.")
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
            "기업명",
            h("input", {
              value: earningsQuery,
              onChange: function (event) { searchEarningsCompany(event.target.value); },
              onKeyDown: handleEarningsKeyDown,
              onFocus: selectTextOnFocus,
              onBlur: function () { setTimeout(function () { setEarningsSuggestions([]); }, 120); },
              placeholder: "예: 삼성전자, HD현대에너지솔루션, 005930",
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
          h(
            "div",
            { className: "earnings-action-buttons" },
            h("button", {
              className: "earnings-action-button primary",
              onClick: function () { earningsLoading ? cancelEarningsSearch() : runEarningsSearch(false); },
              disabled: !status.authorized,
            }, earningsLoading ? "검색 중..." : "검색"),
            earningsLoading
              ? h("button", {
                  className: "earnings-action-button",
                  onClick: cancelEarningsSearch,
                  disabled: !status.authorized,
                }, "중단")
              : null,
            h(
              "span",
              { className: "earnings-split-button-group", role: "group", "aria-label": "KIND \uacf5\uc2dc \ubc14\ub85c\uac00\uae30" },
              h("button", {
                className: "earnings-action-button split-left",
                onClick: function () { openKindReportList("periodic"); },
                disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
                title: "분기보고서, 반기보고서, 사업보고서 등 최신 정기 공시를 엽니다.",
              }, companyLinkLoading === "kind-report-list" ? "조회 중..." : "공시리스트")
            ),
            h("button", {
              className: "earnings-action-button",
              onClick: function () { openCompanyInfoSite("wisereport"); },
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "wisereport" ? "조회 중..." : "WiseReport"),
            h("button", {
              className: "earnings-action-button",
              onClick: function () { openCompanyInfoSite("irgo"); },
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "irgo" ? "조회 중..." : "IRGO"),
            h("button", {
              className: "earnings-action-button",
              onClick: function () { openCompanyInfoSite("tradingview"); },
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "tradingview" ? "조회 중..." : "TradingView"),
            h("button", {
              className: "earnings-action-button",
              onClick: openInvestorFlowPopup,
              disabled: !!companyLinkLoading || !String(earningsQuery || "").trim(),
            }, companyLinkLoading === "flows" ? "조회 중..." : "수급")
          )
        ),
        earningsMessage ? h("div", { className: "notice-box compact" }, earningsMessage) : null,
        h(StockNewsBriefPanel, {
          payload: stockNewsBrief,
          loading: stockNewsBriefLoading,
          message: stockNewsBriefMessage,
          onRefresh: function () { loadStockNewsBrief(earningsQuery, true); },
        }),
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
          financialTrendExpanded
            ? h(EarningsTrendSidePanel, {
                trend: financialTrend,
                loading: financialTrendLoading,
                message: financialTrendMessage,
              })
            : null
        )
      );
    }

    if (statusRequest.loading) {
      return LoadingPanel({ label: statusRequest.label });
    }
    if (statusRequest.error) {
      return ErrorPanel({ message: statusRequest.error });
    }

    const status = statusRequest.data || {};
    const progressMessage = jobState
      ? (jobState.message || (numberFormat(jobState.processed_chat_count, 0) + " / " + numberFormat(jobState.total_chat_count, 0) + "개 방 확인 중"))
      : "";

    return h(
      React.Fragment,
      null,
      renderDisclosureSearchPanel(),
      renderReportListModal(),
      renderWiseConsensusModal(),
      renderInvestorFlowPopup(),
      h(
        "div",
        { className: "panel telegram-status-panel" },
        h(
          "div",
          { className: "telegram-status-row" },
          h("div", { className: "telegram-status-title" }, "종목 정보 검색기"),
          h("div", { className: "telegram-status-items" },
            h("span", { className: "telegram-status-pill" }, "계정 " + (status.authorized ? "연결됨" : "미연결")),
            h("span", { className: "telegram-status-pill" }, "방 " + numberFormat(dialogs.length, 0) + "개"),
            h("span", { className: "telegram-status-pill" }, allRoomsSearch ? "검색대상 전체 방" : "선택 " + numberFormat(selectedChats.length, 0) + "개"),
            h("span", { className: "telegram-status-pill" }, "결과 " + numberFormat(results.length, 0) + "개"),
            status.phone ? h("span", { className: "telegram-status-phone" }, status.phone) : null
          ),
          status.authorized
            ? h("button", {
                className: "mini-button",
                onClick: function () { setShowConnection(!showConnection); },
              }, showConnection ? "접기" : "계정 설정")
            : null
        ),
        status.message ? h("div", { className: "telegram-status-message" }, status.message) : null,
        showConnection || !status.authorized
          ? h(
              "div",
              { className: "telegram-account-inline" },
              h("input", {
                value: apiId,
                onChange: function (event) { setApiId(event.target.value); },
                placeholder: "API ID",
              }),
              h("input", {
                value: apiHash,
                onChange: function (event) { setApiHash(event.target.value); },
                placeholder: "API Hash",
              }),
              h("input", {
                value: phone,
                onChange: function (event) { setPhone(event.target.value); },
                placeholder: "전화번호",
              }),
              h("input", {
                value: code,
                onChange: function (event) { setCode(event.target.value); },
                placeholder: "인증 코드",
              }),
              h("input", {
                type: "password",
                value: password,
                onChange: function (event) { setPassword(event.target.value); },
                placeholder: "2단계 비밀번호",
              }),
              h(
                "div",
                { className: "telegram-account-actions" },
                h("button", { className: "primary-button", onClick: sendCode, disabled: submitting }, "코드 요청"),
                h("button", { className: "primary-button", onClick: verifyCode, disabled: submitting }, "로그인")
                )
              )
          : null,
        formMessage ? h("div", { className: "notice-box" }, formMessage) : null
      ),
      h(
        "div",
        { className: "panel telegram-control-panel" },
        h(SectionTitle, null, "메시지 검색"),
        h(
          "div",
          { className: "form-grid telegram-search-grid" },
          h("label", { className: "form-field form-field-wide" }, "검색 단어", h("textarea", {
            value: keywords,
            onChange: function (event) { setKeywords(event.target.value); },
            onFocus: selectTextOnFocus,
            onKeyDown: function (event) {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                if (!submitting && status.authorized) {
                  runSearch();
                }
              }
            },
            placeholder: "여러 단어는 줄바꿈이나 쉼표로 구분해 입력하세요.",
          })),
          h("label", { className: "form-field" }, "매칭 방식", h("select", {
            value: matchMode,
            onChange: function (event) { setMatchMode(event.target.value); },
          },
            h("option", { value: "any" }, "하나라도 포함"),
            h("option", { value: "all" }, "모두 포함")
          )),
          h("label", { className: "form-field" }, "첨부파일 조건", h("select", {
            value: hasFile,
            onChange: function (event) { setHasFile(event.target.value); },
          },
            h("option", { value: "all" }, "전체"),
            h("option", { value: "with" }, "파일 있는 메시지"),
            h("option", { value: "without" }, "파일 없는 메시지")
          )),
          h("label", { className: "form-field" }, "시작 날짜", h("input", {
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })),
          h("label", { className: "form-field" }, "종료 날짜", h("input", {
            type: "date",
            value: endDate,
            onChange: function (event) { setEndDate(event.target.value); },
          })),
          h("label", { className: "check-field" }, h("span", null, "정확 문구"), h("input", {
            type: "checkbox",
            checked: exactPhrase,
            onChange: function (event) { setExactPhrase(event.target.checked); },
          })),
          h(
            "div",
            { className: "form-actions" },
            h(
              "div",
              { className: "toggle-group" },
              h("button", { className: "primary-button", onClick: function () { runSearch(); }, disabled: submitting || !status.authorized }, "검색 시작"),
              jobState && !jobState.finished
                ? h("button", { className: "mini-button danger", onClick: cancelSearch }, "검색 중단")
                : null
            )
          )
        ),
        h("div", { className: "subsection-title" }, "방 선택"),
        h(
          "label",
          { className: "telegram-all-room-toggle" },
          h("input", {
            type: "checkbox",
            checked: allRoomsSearch,
            onChange: function (event) { setAllRoomsSearch(event.target.checked); },
          }),
          h("span", null, "모든 방 대상 검색"),
          h("em", null, allRoomsSearch ? "선택 방과 즐겨찾기 그룹은 유지되지만 검색은 전체 방에서 진행합니다." : "선택한 방/그룹에서만 검색합니다.")
        ),
        h("label", { className: "form-field" }, "방 이름 검색", h("input", {
          value: chatQuery,
          onChange: function (event) { setChatQuery(event.target.value); },
          onFocus: selectTextOnFocus,
          placeholder: "방 이름을 검색해 직접 선택하세요.",
          disabled: allRoomsSearch,
        })),
        chatQuery && filteredDialogs.length
          ? h(
              "div",
              { className: "chat-search-results" },
              filteredDialogs.map(function (dialog) {
                return h("button", {
                  key: dialog.id,
                  className: "chat-search-item",
                  onClick: function () { addChat(dialog); },
                }, dialog.name + (dialog.unread_count ? " (" + dialog.unread_count + ")" : ""));
              })
            )
          : null,
        h("div", { className: "selected-chat-wrap" },
          selectedChats.length
            ? selectedChats.map(function (chat) {
                return h("button", {
                  key: chat.id,
                  className: "chat-chip active",
                  onClick: function () { removeChat(chat.id); },
                  title: "선택 채팅 제거",
                }, chat.name + " x");
              })
            : h("div", { className: "summary-help" }, allRoomsSearch ? "현재 전체 방을 대상으로 검색합니다." : "검색할 방을 선택하거나 즐겨찾기 그룹을 눌러주세요.")
        ),
        h(
          "div",
          { className: "telegram-favorite-groups" },
          h(
            "div",
            { className: "telegram-favorite-head" },
            h("strong", null, "방 즐겨찾기 그룹"),
            h("span", null, "현재 선택한 방 묶음을 저장하고, 그룹 클릭으로 검색 대상을 바로 바꿉니다.")
          ),
          h(
            "div",
            { className: "telegram-favorite-create" },
            h("input", {
              value: favoriteGroupName,
              onChange: function (event) { setFavoriteGroupName(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveFavoriteChatGroup();
                }
              },
              placeholder: "그룹 이름",
            }),
            h("button", { type: "button", className: "mini-button", onClick: saveFavoriteChatGroup }, "현재 선택 저장")
          ),
          favoriteChatGroups.length
            ? h(
                "div",
                { className: "telegram-favorite-list" },
                favoriteChatGroups.map(function (group) {
                  const active = !allRoomsSearch && ensureArray(group.chats).length === selectedChats.length && ensureArray(group.chats).every(function (chat) {
                    return selectedChatIds.indexOf(chat.id) >= 0;
                  });
                  return h(
                    "div",
                    { key: group.id, className: "telegram-favorite-group" + (active ? " active" : "") },
                    h("button", { type: "button", onClick: function () { applyFavoriteChatGroup(group); } },
                      h("strong", null, group.name),
                      h("span", null, numberFormat(ensureArray(group.chats).length, 0) + "개 방")
                    ),
                    h("button", {
                      type: "button",
                      className: "telegram-favorite-delete",
                      title: "그룹 삭제",
                      onClick: function () { removeFavoriteChatGroup(group.id); },
                    }, "x")
                  );
                })
              )
            : h("div", { className: "summary-help" }, "아직 저장된 즐겨찾기 그룹이 없습니다.")
        ),
        jobState
          ? h(
              "div",
              { className: "notice-box" },
              progressMessage,
              h("div", { className: "summary-help" }, "확인한 방 " + numberFormat(jobState.processed_chat_count, 0) + " / " + numberFormat(jobState.total_chat_count, 0) + ", 누적 결과 " + numberFormat(jobState.result_count, 0) + "개")
            )
          : null
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "검색 결과"),
        h(TelegramChatFeed, {
          rows: results,
          emptyMessage: jobState && !jobState.finished ? "검색 진행 중입니다. 첫 결과가 잡히면 바로 표시합니다." : "조건에 맞는 메시지가 없습니다.",
        })
      )
    );
  }


    return TelegramPage;
  }

  modules.telegramPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
