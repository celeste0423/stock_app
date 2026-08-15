(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const AUTO_DAILY_THEME_BUILD_EVENT = deps.AUTO_DAILY_THEME_BUILD_EVENT;
    const buildBusinessMonthCells = deps.buildBusinessMonthCells;
    const ensureArray = deps.ensureArray;
    const fetchJson = deps.fetchJson;
    const filterCalendarDays = deps.filterCalendarDays;
    const formatPercent = deps.formatPercent;
    const getCalendarTopSectors = deps.getCalendarTopSectors;
    const getStockAppModule = deps.getStockAppModule;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const loadThemeSectorState = deps.loadThemeSectorState;
    const normalizeTimestampMs = deps.normalizeTimestampMs;
    const numberFormat = deps.numberFormat;
    const persistThemeSectorState = deps.persistThemeSectorState;
    const postJson = deps.postJson;
    const prefetchJson = deps.prefetchJson;
    const removeBackgroundTask = deps.removeBackgroundTask;
    const renderHighDrawdownPercent = deps.renderHighDrawdownPercent;
    const THEME_STOCK_NAV_KEY = deps.THEME_STOCK_NAV_KEY;
    const DataTable = deps.DataTable;
    const ErrorPanel = deps.ErrorPanel;
    const LoadingPanel = deps.LoadingPanel;
    const upsertBackgroundTask = deps.upsertBackgroundTask;
    const useFetchJson = deps.useFetchJson;
    const calendarRankCellClass = deps.calendarRankCellClass;
    const calendarRankCellStyle = deps.calendarRankCellStyle;
    const CHART_PREVIEW_CACHE = deps.CHART_PREVIEW_CACHE;
    const colorForKey = deps.colorForKey;
    const copyImageBlobWithFallback = deps.copyImageBlobWithFallback;
    const EmptyState = deps.EmptyState;
    const formatDateLabel = deps.formatDateLabel;
    const formatMoneyByCurrency = deps.formatMoneyByCurrency;
    const formatNumber = deps.formatNumber;
    const invalidateApiCache = deps.invalidateApiCache;
    const latestTargetReportRows = deps.latestTargetReportRows;
    const LeaderCalendarScoreChart = deps.LeaderCalendarScoreChart;
    const loadTelegramSearchState = deps.loadTelegramSearchState;
    const mergeScoreHistoryPayloadRows = deps.mergeScoreHistoryPayloadRows;
    const monthLabel = deps.monthLabel;
    const persistTelegramSearchState = deps.persistTelegramSearchState;
    const requestPageNavigation = deps.requestPageNavigation;
    const ScoreHistoryChart = deps.ScoreHistoryChart;
    const SectionTitle = deps.SectionTitle;
    const SectorMarketCapChart = deps.SectorMarketCapChart;
    const shiftIsoDate = deps.shiftIsoDate;
    const shiftMonth = deps.shiftMonth;
    const stashTelegramStockNavigation = deps.stashTelegramStockNavigation;
    const StockChartPreview = deps.StockChartPreview;
    const SummaryCard = deps.SummaryCard;
    const TARGET_HISTORY_CACHE = deps.TARGET_HISTORY_CACHE;
    const TargetReportHoverBadge = deps.TargetReportHoverBadge;
    const ThemeNoteInput = deps.ThemeNoteInput;
    const ThemeSectorInput = deps.ThemeSectorInput;
    const TradingValueHistoryChart = deps.TradingValueHistoryChart;

  function ThemesPage() {
    const themesRequest = useFetchJson("/api/themes/today?min_score=50&recent_limit=20");
    const dartRequest = useFetchJson("/api/dart/today");

    if (themesRequest.loading || dartRequest.loading) {
      return LoadingPanel({ label: [themesRequest.loading ? themesRequest.label : "", dartRequest.loading ? dartRequest.label : ""].filter(Boolean).join(" · ") });
    }
    if (themesRequest.error) {
      return ErrorPanel({ message: themesRequest.error });
    }
    if (dartRequest.error) {
      return ErrorPanel({ message: dartRequest.error });
    }

    const themes = themesRequest.data || {};
    const dart = dartRequest.data || {};

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "Daily Theme Radar"),
        h("h1", { className: "page-title" }, "포트폴리오 수익"),
        h(
          "p",
          { className: "page-copy" },
          "엑셀 목표 비중을 기준으로 시초가 매수·매도와 보유 수량 유지 규칙을 적용한 수익률입니다. 기본 차트는 월초 기준 0%에서 시작하며, 전체 기간도 선택할 수 있습니다."
        ),
        h(
          "div",
          { className: "summary-grid" },
          h(SummaryCard, { label: "湲곗? ?뚯씪", value: themes.file_name || "-", help: themes.file_date || "" }),
          h(SummaryCard, { label: "50점 이상 종목", value: numberFormat(themes.qualified_count, 0) + "개", help: "종합 50 이상 · 시총 2000억 이상" }),
          h(SummaryCard, { label: "\ud14c\ub9c8 \uc218", value: numberFormat(ensureArray(themes.theme_summary).length, 0) + "\uac1c", help: "\ub2f9\uc77c \uc9d1\uacc4\ub41c \ud14c\ub9c8 \uac1c\uc218" }),
          h(SummaryCard, { label: "DART \uc0c1\ud0dc", value: dart.enabled ? "\ud65c\uc131" : "\ube44\ud65c\uc131", help: dart.message || "" })
        )
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 怨듭떆"),
        h(DataTable, {
          rows: ensureArray(themes.recent_leaders),
          columns: [
            { key: "stock_name", label: "종목" },
            { key: "appearances", label: "\ub4f1\uc7a5 \ud69f\uc218", render: function (row) { return numberFormat(row.appearances, 0); } },
            { key: "strong_days", label: "\uac15\ud55c \ub0a0 \uc218", render: function (row) { return numberFormat(row.strong_days, 0); } },
            { key: "avg_score", label: "평균 점수", render: function (row) { return numberFormat(row.avg_score, 2); } },
            { key: "max_score", label: "최고 점수", render: function (row) { return numberFormat(row.max_score, 2); } },
            { key: "avg_change_pct", label: "\ud3c9\uade0 \ub4f1\ub77d\ub960", render: function (row) { return formatPercent(row.avg_change_pct, 2); } },
            { key: "themes", label: "반복 테마", render: function (row) { return ensureArray(row.themes).join(", "); } },
            { key: "notes", label: "핵심 메모", render: function (row) { return row.notes || "-"; } },
          ],
          emptyMessage: "최근 반복 등장 종목 데이터가 없습니다.",
          compact: true,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 怨듭떆"),
        ensureArray(themes.theme_summary).length
          ? h(
              "div",
              { className: "theme-grid" },
              ensureArray(themes.theme_summary).map(function (item) {
                return h(
                  "div",
                  { key: item.theme, className: "theme-card" },
                  h("div", { className: "theme-name" }, item.theme),
                  h("div", { className: "theme-metrics" }, "\uc885\ubaa9 \uc218 " + numberFormat(item.count, 0) + "\uac1c / \ud3c9\uade0 \uc810\uc218 " + numberFormat(item.avg_score, 2)),
                  h("div", { className: "theme-leaders" }, "\ub300\ud45c \uc885\ubaa9: " + (item.leaders || "-")),
                  h("div", { className: "summary-help" }, "\ud575\uc2ec \ud0a4\uc6cc\ub4dc: " + (item.keywords || "-"))
                );
              })
            )
          : EmptyState({ message: "오늘 테마 데이터가 없습니다." })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "오늘 조건 충족 종목"),
        h(DataTable, {
          rows: ensureArray(themes.qualified_stocks),
          columns: [
            { key: "stock_name", label: "종목" },
            { key: "theme", label: "테마" },
            { key: "score", label: "점수", render: function (row) { return numberFormat(row.score, 2); } },
            { key: "change_pct", label: "\ub4f1\ub77d\ub960", render: function (row) { return formatPercent(row.change_pct, 2); } },
            { key: "lead_count", label: "주도 횟수", render: function (row) { return numberFormat(row.lead_count, 0); } },
            { key: "avg_lead_score", label: "평균 점수", render: function (row) { return numberFormat(row.avg_lead_score, 2); } },
            { key: "note", label: "비고" },
          ],
          emptyMessage: "점수 50 이상 종목이 없습니다.",
          compact: true,
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "?ㅻ뒛 怨듭떆"),
        dart.message ? h("div", { className: "summary-help" }, dart.message) : null,
        dart.items && dart.items.length
          ? h(DataTable, {
              rows: dart.items,
              columns: [
                { key: "corp_name", label: "?뚯궗" },
                { key: "report_name", label: "\uacf5\uc2dc\uba85" },
                { key: "date", label: "날짜" },
              ],
            })
          : EmptyState({ message: dart.message || "?ㅻ뒛 怨듭떆媛 ?놁뒿?덈떎." })
      )
    );
  }


  function ThemesPageV2() {
    const savedThemeState = loadThemeSectorState();
    const [selectedFileDate, setSelectedFileDate] = useState(function () {
      return "";
    });
    const [universeMode, setUniverseMode] = useState(savedThemeState.universeMode === "etf" ? "etf" : "stock");
    const [sectorFilter, setSectorFilter] = useState("all");
    const [calendarMode, setCalendarMode] = useState("week");
    const [calendarScoreBasis, setCalendarScoreBasis] = useState("score");
    const [themeBoxExpanded, setThemeBoxExpanded] = useState(false);
    const [calendarChartOpen, setCalendarChartOpen] = useState(false);
    const [calendarRefreshing, setCalendarRefreshing] = useState(false);
    const [sectorSaveState, setSectorSaveState] = useState({ status: "idle", message: "" });
    const [noteSaveState, setNoteSaveState] = useState({ status: "idle", message: "" });
    const [noteOverrides, setNoteOverrides] = useState({});
    const [sectorState, setSectorState] = useState({ stockMap: {}, sectors: [] });
    const [reloadingExcel, setReloadingExcel] = useState(false);
    const [rebuildingSelectedDate, setRebuildingSelectedDate] = useState(false);

    const [reloadMessage, setReloadMessage] = useState("");
    const [reloadStartedAt, setReloadStartedAt] = useState(0);
    const [reloadElapsedSec, setReloadElapsedSec] = useState(0);
    const sectorSaveSeqRef = useRef(0);
    const leaderCalendarRef = useRef(null);
    const manualSummaryRef = useRef(null);
    const scoreTableCaptureRef = useRef(null);
    const scoreHistoryHoverOpenRef = useRef(null);
    const scoreHistoryHoverCloseRef = useRef(null);
    const scoreHistoryCacheRef = useRef({});
    const scoreHistoryRequestSeqRef = useRef(0);
    const tradingValueHistoryCacheRef = useRef({});
    const tradingValueHistoryRequestSeqRef = useRef(0);
    const [calendarCopyState, setCalendarCopyState] = useState({ status: "", message: "" });
    const [manualSummaryCopyState, setManualSummaryCopyState] = useState({ status: "", message: "" });
    const [scoreTableCopyState, setScoreTableCopyState] = useState({ status: "", message: "" });
    const [captureStageReady, setCaptureStageReady] = useState(false);
    const [stockSearchText, setStockSearchText] = useState("");
    const [stockSearchOpen, setStockSearchOpen] = useState(false);
    const [stockSearchActiveIndex, setStockSearchActiveIndex] = useState(0);
    const [stockSearchMessage, setStockSearchMessage] = useState("");
    const [highlightedStockKey, setHighlightedStockKey] = useState("");
    const [themeTableSortState, setThemeTableSortState] = useState({ key: "score", direction: "desc" });
    const [rankFilterMode, setRankFilterMode] = useState("all");
    const stockRowRefs = useRef({});
    const pendingStockScrollKeyRef = useRef("");
    const themeTableScrollRef = useRef(null);
    const themeTableScrollRafRef = useRef(null);
    const [themeTableScrollTop, setThemeTableScrollTop] = useState(0);
    const [scoreHistoryPopup, setScoreHistoryPopup] = useState({
      open: false,
      mode: "modal",
      loading: false,
      loadingMore: false,
      hasMore: true,
      error: "",
      row: null,
      payload: null,
      cacheKey: "",
      position: null,
      activeTab: "trend",
    });
    const scoreHistoryClickTimerRef = useRef(null);
    const [tradingValueHistoryPopup, setTradingValueHistoryPopup] = useState({
      open: false,
      loading: false,
      error: "",
      row: null,
      payload: null,
    });
    const [krEtfDetailPopup, setKrEtfDetailPopup] = useState({
      open: false,
      loading: false,
      error: "",
      row: null,
      payload: null,
    });
    const krEtfDetailRequestSeqRef = useRef(0);
    const [scoreFormulaModalOpen, setScoreFormulaModalOpen] = useState(false);
    const [scoreFormulaDraft, setScoreFormulaDraft] = useState(null);
    const [scoreFormulaStatus, setScoreFormulaStatus] = useState({ type: "", message: "" });
    const [scoreFormulaSaving, setScoreFormulaSaving] = useState(false);
    const [scoreFormulaRecalculating, setScoreFormulaRecalculating] = useState(false);
    const [scoreFormulaSnapshotSaving, setScoreFormulaSnapshotSaving] = useState(false);
    const [scoreFormulaOracleSyncing, setScoreFormulaOracleSyncing] = useState(false);
    const [scoreFormulaJobState, setScoreFormulaJobState] = useState(null);
    const scoreFormulaJobPollRef = useRef(null);
    const scoreFormulaConfigRequest = useFetchJson("/api/themes/score-formula-config");
    const scoreFormulaSnapshotsRequest = useFetchJson("/api/themes/score-formula-snapshots?market=kr&limit=20", {
      enabled: scoreFormulaModalOpen,
    });
    const [scoreFormulaSnapshotLabel, setScoreFormulaSnapshotLabel] = useState("");
    const [tradingViewPopup, setTradingViewPopup] = useState({
      open: false,
      row: null,
      symbol: "",
      label: "",
      loading: false,
      error: "",
      data: null,
      targetHistory: null,
      openingExternal: false,
      externalMessage: "",
    });
    const stockChartRequestSeqRef = useRef(0);
    const [sectorMarketCapPopup, setSectorMarketCapPopup] = useState({
      open: false,
      sector: "",
      loading: false,
      error: "",
      payload: null,
    });
    const sectorMarketCapRequestSeqRef = useRef(0);
    const [datePickerMonth, setDatePickerMonth] = useState(function () {
      const today = new Date();
      const fallback = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
      return savedThemeState.lastFileDate ? String(savedThemeState.lastFileDate).slice(0, 7) : fallback;
    });
    const [fullThemesPrimed, setFullThemesPrimed] = useState(false);
    const [calendarPrimed, setCalendarPrimed] = useState(false);
    const themesPageModule = getStockAppModule("themesPage");
    const universeQuery = "&universe=" + encodeURIComponent(universeMode === "etf" ? "etf" : "stock");
    const themesUrl = typeof themesPageModule.buildThemesTodayUrl === "function"
      ? themesPageModule.buildThemesTodayUrl({ universeMode: universeMode, selectedFileDate: selectedFileDate, cacheOnly: true })
      : "/api/themes/today?min_score=0&recent_limit=20&cache_only=1" + universeQuery + (selectedFileDate ? "&file_date=" + encodeURIComponent(selectedFileDate) : "");
    const liteThemesUrl = typeof themesPageModule.buildThemesTodayUrl === "function"
      ? themesPageModule.buildThemesTodayUrl({ universeMode: universeMode, selectedFileDate: selectedFileDate, lite: true })
      : themesUrl + "&lite=1";
    const calendarUrl = typeof themesPageModule.buildSectorCalendarUrl === "function"
      ? themesPageModule.buildSectorCalendarUrl({ calendarScoreBasis: calendarScoreBasis, universeMode: universeMode })
      : "/api/theme-sector-calendar?min_score=0&limit=60&score_basis=" + encodeURIComponent(calendarScoreBasis) + universeQuery;
    const liteThemesRequest = useFetchJson(liteThemesUrl);
    const fullThemesRequest = useFetchJson(themesUrl, {
      enabled: !!liteThemesRequest.data && !!liteThemesRequest.data.runtime_cache_available && fullThemesPrimed,
    });
    function matchesSelectedThemeDate(payload) {
      if (!payload) {
        return false;
      }
      const requestedDate = String(selectedFileDate || "");
      if (!requestedDate) {
        return true;
      }
      if (String(payload.file_date || "") === requestedDate) {
        return true;
      }
      return payload.fallback_reason === "requested_file_missing"
        && String(payload.requested_file_date || "") === requestedDate;
    }
    const matchingLiteThemesData = matchesSelectedThemeDate(liteThemesRequest.data) ? liteThemesRequest.data : null;
    const matchingFullThemesData = matchesSelectedThemeDate(fullThemesRequest.data) ? fullThemesRequest.data : null;
    const themesData = matchingFullThemesData || matchingLiteThemesData || null;
    const themesLoading = !themesData && liteThemesRequest.loading;
    const themesError = themesData ? "" : (liteThemesRequest.error || fullThemesRequest.error || "");
    const themesLabel = fullThemesRequest.loading && liteThemesRequest.loading
      ? [liteThemesRequest.label, fullThemesRequest.label].filter(Boolean).join(" · ")
      : (liteThemesRequest.loading ? liteThemesRequest.label : (fullThemesRequest.loading ? fullThemesRequest.label : liteThemesRequest.label));
    const refreshThemesData = async function (forceRefresh) {
      const litePayload = await liteThemesRequest.refresh(forceRefresh);
      if (!litePayload) {
        return null;
      }
      setFullThemesPrimed(true);
      return fullThemesRequest.refresh(forceRefresh);
    };
    const sectorDbRequest = useFetchJson("/api/sector-db", {
      enabled: themeBoxExpanded,
    });
    const calendarRequest = useFetchJson(calendarUrl, { enabled: !!themesData && calendarPrimed });
    const calendarScoreHistoryUrl = "/api/theme-calendar-index-score?limit=3000&score_basis="
      + encodeURIComponent(calendarScoreBasis)
      + universeQuery
      + "&chart_cache_rev=20260719-01";
    const calendarScoreHistoryRequest = useFetchJson(calendarScoreHistoryUrl, {
      enabled: !!themesData && themeBoxExpanded && calendarChartOpen,
    });

    useEffect(function () {
      persistThemeSectorState({
        stockMap: {},
        sectors: [],
        lastFileDate: selectedFileDate,
        universeMode: universeMode,
      });
    }, [selectedFileDate, universeMode]);

    useEffect(function () {
      setFullThemesPrimed(false);
      setCalendarPrimed(false);
    }, [themesUrl]);

    useEffect(function () {
      if (!liteThemesRequest.data || fullThemesPrimed) {
        return;
      }
      let cancelled = false;
      let idleHandle = null;
      let timeoutHandle = null;
      const prime = function () {
        if (!cancelled) {
          setFullThemesPrimed(true);
        }
      };
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(prime, { timeout: 900 });
      } else {
        timeoutHandle = window.setTimeout(prime, 450);
      }
      return function () {
        cancelled = true;
        if (idleHandle != null && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        }
        if (timeoutHandle != null) {
          window.clearTimeout(timeoutHandle);
        }
      };
    }, [liteThemesRequest.data, fullThemesPrimed, themesUrl]);

    useEffect(function () {
      const payload = liteThemesRequest.data;
      const availableFiles = payload && Array.isArray(payload.available_files) ? payload.available_files : [];
      if (!availableFiles.length) {
        return;
      }
      const activeDate = String((payload && payload.file_date) || selectedFileDate || "");
      const activeIndex = availableFiles.findIndex(function (item) {
        return String((item && item.file_date) || "") === activeDate;
      });
      if (activeIndex < 0) {
        return;
      }
      [activeIndex - 2, activeIndex - 1, activeIndex + 1, activeIndex + 2].forEach(function (index) {
        const item = availableFiles[index];
        const dateText = String((item && item.file_date) || "");
        if (!dateText) {
          return;
        }
        const prefetchUrl = typeof themesPageModule.buildThemesTodayUrl === "function"
          ? themesPageModule.buildThemesTodayUrl({ universeMode: universeMode, selectedFileDate: dateText, lite: true })
          : "/api/themes/today?min_score=0&recent_limit=20&lite=1" + universeQuery + "&file_date=" + encodeURIComponent(dateText);
        prefetchJson(prefetchUrl);
      });
    }, [liteThemesRequest.data, selectedFileDate, universeMode]);

    useEffect(function () {
      function handleAutoDailyBuild(event) {
        const detail = (event && event.detail) || {};
        if (detail.market !== "kr") {
          return;
        }
        refreshThemesData(true).catch(function () {
        });
        if (calendarPrimed) {
          calendarRequest.refresh(true).catch(function () {
          });
        }
      }
      window.addEventListener(AUTO_DAILY_THEME_BUILD_EVENT, handleAutoDailyBuild);
      return function () {
        window.removeEventListener(AUTO_DAILY_THEME_BUILD_EVENT, handleAutoDailyBuild);
      };
    }, [refreshThemesData, calendarRequest, calendarPrimed]);

    useEffect(function () {
      if (!themesData || calendarPrimed) {
        return undefined;
      }
      let cancelled = false;
      let idleHandle = null;
      let timeoutHandle = null;
      const prime = function () {
        if (!cancelled) {
          setCalendarPrimed(true);
        }
      };
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(prime, { timeout: 1200 });
      } else {
        timeoutHandle = window.setTimeout(prime, 900);
      }
      return function () {
        cancelled = true;
        if (idleHandle != null && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        }
        if (timeoutHandle != null) {
          window.clearTimeout(timeoutHandle);
        }
      };
    }, [themesData, calendarPrimed, themesUrl, calendarScoreBasis, universeMode]);

    useEffect(function () {
      if (!sectorDbRequest.data) {
        return;
      }
      const stockMap = {};
      Object.keys(sectorDbRequest.data.stock_map || {}).forEach(function (key) {
        const item = sectorDbRequest.data.stock_map[key] || {};
        if (item.stock_name && item.sector) {
          stockMap[item.stock_name] = item.sector;
          if (item.stock_code) {
            stockMap[item.stock_code] = item.sector;
          }
        }
      });
      setSectorState({
        stockMap: stockMap,
        sectors: ensureArray(sectorDbRequest.data.sectors),
      });
    }, [sectorDbRequest.data]);

    useEffect(function () {
      if (!themesData || !themesData.file_date) {
        return;
      }
      if (!selectedFileDate || themesData.fallback_reason === "requested_file_missing") {
        setSelectedFileDate(themesData.file_date);
        if (themesData.fallback_reason === "requested_file_missing") {
          setReloadMessage("선택했던 " + (themesData.requested_file_date || "날짜") + " 파일이 없어 " + themesData.file_date + " 파일로 다시 불러왔습니다.");
        }
      }
    }, [selectedFileDate, themesData]);

    useEffect(function () {
      const payload = scoreFormulaConfigRequest.data || null;
      if (!payload || !payload.config) {
        return;
      }
      setScoreFormulaDraft(function (current) {
        return current || JSON.parse(JSON.stringify(payload.config));
      });
    }, [scoreFormulaConfigRequest.data]);

    useEffect(function () {
      if (selectedFileDate) {
        setDatePickerMonth(String(selectedFileDate).slice(0, 7));
      }
      setNoteOverrides({});
      setNoteSaveState({ status: "idle", message: "" });
    }, [selectedFileDate]);

    useEffect(function () {
      setThemeTableScrollTop(0);
      if (themeTableScrollRef.current) {
        themeTableScrollRef.current.scrollTop = 0;
      }
    }, [selectedFileDate, sectorFilter, themeTableSortState.key, themeTableSortState.direction, rankFilterMode, universeMode]);

    useEffect(function () {
      setSectorFilter("all");
      setStockSearchMessage("");
      setHighlightedStockKey("");
    }, [universeMode]);

    useEffect(function () {
      return function () {
        stopScoreFormulaJobPolling();
        if (scoreHistoryHoverOpenRef.current) {
          clearTimeout(scoreHistoryHoverOpenRef.current);
        }
        if (scoreHistoryHoverCloseRef.current) {
          clearTimeout(scoreHistoryHoverCloseRef.current);
        }
        if (themeTableScrollRafRef.current) {
          window.cancelAnimationFrame(themeTableScrollRafRef.current);
        }
      };
    }, []);

    useEffect(function () {
      if (!reloadingExcel || !reloadStartedAt) {
        setReloadElapsedSec(0);
        return undefined;
      }
      const tick = function () {
        setReloadElapsedSec(Math.max(0, Math.floor((Date.now() - reloadStartedAt) / 1000)));
      };
      tick();
      const timer = window.setInterval(tick, 1000);
      return function () {
        window.clearInterval(timer);
      };
    }, [reloadingExcel, reloadStartedAt]);

    useEffect(function () {
      if (!highlightedStockKey) {
        return undefined;
      }
      function clearStockHighlight(event) {
        const target = event.target;
        if (!target || !target.closest) {
          setHighlightedStockKey("");
          return;
        }
        if (target.closest(".theme-stock-search-bar")) {
          return;
        }
        const row = target.closest("[data-stock-search-key]");
        if (row && row.getAttribute("data-stock-search-key") === highlightedStockKey) {
          return;
        }
        setHighlightedStockKey("");
      }
      document.addEventListener("pointerdown", clearStockHighlight, true);
      return function () {
        document.removeEventListener("pointerdown", clearStockHighlight, true);
      };
    }, [highlightedStockKey]);

    useEffect(function () {
      if (!pendingStockScrollKeyRef.current || sectorFilter !== "all") {
        return undefined;
      }
      const stockKey = pendingStockScrollKeyRef.current;
      pendingStockScrollKeyRef.current = "";
      const timer = window.setTimeout(function () {
        scrollToStockRow(stockKey, 0);
      }, 80);
      return function () {
        window.clearTimeout(timer);
      };
    }, [sectorFilter, highlightedStockKey, selectedFileDate]);

    useEffect(function () {
      if (!themesData) {
        return;
      }
      const themeRows = ensureArray(themesData.qualified_stocks);
      if (!themeRows.length) {
        return;
      }
      let pending = null;
      try {
        pending = JSON.parse(sessionStorage.getItem(THEME_STOCK_NAV_KEY) || "null");
      } catch (error) {
        pending = null;
      }
      const query = String((pending && pending.query) || "").trim();
      if (!query) {
        return;
      }
      const normalized = normalizeStockSearchText(query);
      const matched = themeRows.find(function (row) {
        return stockSearchHaystack(row).indexOf(normalized) >= 0;
      });
      try {
        sessionStorage.removeItem(THEME_STOCK_NAV_KEY);
      } catch (error) {
      }
      setStockSearchText(query);
      if (matched) {
        chooseStockSearchRow(matched);
      } else {
        setStockSearchMessage("검색 대상 종목을 현재 날짜 데이터에서 찾지 못했습니다.");
      }
    }, [themesData, selectedFileDate]);
    const themes = themesData || {};
    const isEtfUniverse = universeMode === "etf";
    const themePageTitle = isEtfUniverse ? "오늘의 주도주 · 국내 ETF" : "오늘의 주도주";
    const themeUniverseHelp = isEtfUniverse ? "국내 상장 ETF 전체" : "시총 2000억 이상 전체";
    const themeUniverseCountLabel = isEtfUniverse ? "국내 상장 ETF" : "시총 2000억 이상";
    const calendar = calendarRequest.data || {};
    const anchorDate = selectedFileDate || themes.file_date || "";
    const selectedDateValue = selectedFileDate || themes.file_date || "";
    const availableFiles = ensureArray(themes.available_files);
    const availableDateMap = {};
    availableFiles.forEach(function (item) {
      if (item.file_date) {
        availableDateMap[item.file_date] = item;
      }
    });
    const datePickerCells = buildBusinessMonthCells(datePickerMonth);
    const sortedCalendarDays = ensureArray(calendar.days).slice().sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });
    const calendarDayScoreMap = {};
    const chartScoreHistoryPayload = calendarScoreHistoryRequest.data || null;
    ensureArray(chartScoreHistoryPayload && chartScoreHistoryPayload.rows).forEach(function (day) {
      const key = String(day.date || "");
      const score = Number(day.score);
      if (key && Number.isFinite(score)) {
        calendarDayScoreMap[key] = score;
      }
    });
    sortedCalendarDays.forEach(function (day) {
      const key = String(day.date || "");
      if (!key) return;
      const score = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
      if (Number.isFinite(score)) {
        calendarDayScoreMap[key] = score;
      }
    });
    const chartScoreSeriesRows = ensureArray(chartScoreHistoryPayload && chartScoreHistoryPayload.rows).map(function (day) {
      return {
        date: String(day.date || ""),
        score: Number(day.score),
        kospi_close: day.kospi_close == null ? null : Number(day.kospi_close),
        kospi_normalized: day.kospi_normalized == null ? null : Number(day.kospi_normalized),
      };
    }).filter(function (item) {
      return item.date && Number.isFinite(item.score);
    });
    const chartDateRangeLabel = chartScoreSeriesRows.length
      ? (chartScoreSeriesRows[0].date + " ~ " + chartScoreSeriesRows[chartScoreSeriesRows.length - 1].date)
      : "";
    const visibleCalendarDays = filterCalendarDays(sortedCalendarDays, anchorDate, calendarMode);
    const calendarTopSectors = getCalendarTopSectors(visibleCalendarDays, 5);
    function noteKeyForRow(row) {
      return String(row.stock_code || row.stock_name || "");
    }
    const rows = ensureArray(themes.qualified_stocks).map(function (row) {
      const stockMap = sectorState.stockMap || {};
      const hasCodeOverride = row.stock_code && Object.prototype.hasOwnProperty.call(stockMap, row.stock_code);
      const hasNameOverride = row.stock_name && Object.prototype.hasOwnProperty.call(stockMap, row.stock_name);
      const localSector = hasCodeOverride ? stockMap[row.stock_code] : (hasNameOverride ? stockMap[row.stock_name] : undefined);
      const noteKey = noteKeyForRow(row);
      const hasNoteOverride = noteKey && Object.prototype.hasOwnProperty.call(noteOverrides, noteKey);
      return Object.assign({}, row, {
        manual_sector: String(localSector !== undefined ? localSector : (row.manual_sector || "")),
        note: hasNoteOverride ? noteOverrides[noteKey] : (row.note || ""),
      });
    }).reduce(function (accumulator, row) {
      const strictCode = strictKrStockCode(row.stock_code);
      const normalizedName = normalizeStockSearchText(row.stock_name || row.resolved_name || "");
      if (!strictCode && !normalizedName) {
        accumulator.push(row);
        return accumulator;
      }
      const existingIndex = accumulator.findIndex(function (item) {
        const existingCode = strictKrStockCode(item.stock_code);
        const existingName = normalizeStockSearchText(item.stock_name || item.resolved_name || "");
        return (strictCode && existingCode && existingCode === strictCode)
          || (normalizedName && existingName && existingName === normalizedName);
      });
      if (existingIndex < 0) {
        accumulator.push(row);
        return accumulator;
      }
      const existing = accumulator[existingIndex];
      const existingCode = strictKrStockCode(existing.stock_code);
      const currentCode = strictCode;
      if (!existingCode && currentCode) {
        accumulator[existingIndex] = row;
        return accumulator;
      }
      const existingScore = Number(existing.score || 0);
      const currentScore = Number(row.score || 0);
      if (currentScore > existingScore) {
        accumulator[existingIndex] = row;
      }
      return accumulator;
    }, []);
    const usedSectorSet = new Set();
    Object.keys(sectorState.stockMap || {}).forEach(function (key) {
      const sector = String((sectorState.stockMap || {})[key] || "").trim();
      if (sector) {
        usedSectorSet.add(sector);
      }
    });
    rows.forEach(function (row) {
      const sector = String(row.manual_sector || "").trim();
      if (sector) {
        usedSectorSet.add(sector);
      }
    });
    const sectorOptions = Array.from(usedSectorSet);
    const sectorSummary = [];
    const sectorIndexMap = {};
    rows.forEach(function (row, index) {
      const sector = String(row.manual_sector || "").trim();
      if (!sector) {
        return;
      }
      if (!sectorIndexMap[sector]) {
        sectorIndexMap[sector] = {
          sector: sector,
          count: 0,
          changeTotal: 0,
          leaders: [],
          firstIndex: index,
        };
        sectorSummary.push(sectorIndexMap[sector]);
      }
      sectorIndexMap[sector].count += 1;
      sectorIndexMap[sector].changeTotal += Number(row.change_pct || 0);
      if (sectorIndexMap[sector].leaders.length < 4) {
        sectorIndexMap[sector].leaders.push(row.stock_name);
      }
    });
    sectorSummary.forEach(function (item) {
      item.avg_change_pct = item.count ? item.changeTotal / item.count : 0;
    });
    sectorSummary.sort(function (a, b) {
      return Number(b.avg_change_pct || 0) - Number(a.avg_change_pct || 0);
    });


    const visibleRows = sectorFilter === "all"
      ? rows
      : rows.filter(function (row) { return String(row.manual_sector || "").trim() === sectorFilter; });
    const themeTableSortColumns = {
      rank: function (row) { return Number(row.rank || 0); },
      sector: function (row) { return String(row.manual_sector || "").trim(); },
      stock_name: function (row) { return String(row.stock_name || row.resolved_name || row.stock_code || ""); },
      sortino_norm: function (row) { return Number(row.sortino_norm || 0); },
      atr_20: function (row) { return Number(row.atr_20_pct || row.atr_20 || 0); },
      score_o: function (row) { return Number(row.score_o || 0); },
      market_cap_100m: function (row) { return Number(row.market_cap_100m || 0); },
      trading_value_100m: function (row) { return Number(row.trading_value_100m || 0); },
      high_drawdown_pct: function (row) {
        const rawValue = Number(row && row.pct_to_52w_high);
        const tradingValue = Number((row && row.trading_value_100m) || 0);
        if (!Number.isFinite(rawValue) || tradingValue <= 0) {
          return null;
        }
        return rawValue;
      },
      change_pct: function (row) { return Number(row.change_pct || 0); },
      score: function (row) { return Number(row.score || 0); },
      note: function (row) { return String(row.note || ""); },
    };
    const sortKey = themeTableSortState.key || "score";
    const isRank52Mode = sortKey === "rank" && rankFilterMode === "high52";
    const isRankNear52Mode = sortKey === "rank" && rankFilterMode === "high20";
    const preserveCompositeRank = sectorFilter !== "all" || isRank52Mode || isRankNear52Mode;
    const baseVisibleRows = sortKey === "rank"
      ? visibleRows.filter(function (row) {
          if (isRank52Mode) {
            return isTradableHigh52(row);
          }
          if (isRankNear52Mode) {
            return isTradableHigh20(row) && Number(row && row.pct_to_52w_high) <= 30;
          }
          return true;
        })
      : visibleRows;
    const sortedVisibleRows = baseVisibleRows.slice().sort(function (left, right) {
      if (sortKey === "rank") {
        const rankModeScoreKey = (isRank52Mode || isRankNear52Mode) ? "score" : "score_o";
        const primaryGap = Number(right[rankModeScoreKey] || 0) - Number(left[rankModeScoreKey] || 0);
        if (primaryGap !== 0) {
          return primaryGap;
        }
        const secondaryGap = Number(right.score || 0) - Number(left.score || 0);
        if (secondaryGap !== 0) {
          return secondaryGap;
        }
        const dailyGap = Number(right.score_o || 0) - Number(left.score_o || 0);
        if (dailyGap !== 0) {
          return dailyGap;
        }
        return Number(left.rank || 0) - Number(right.rank || 0);
      }
      const valueFactory = themeTableSortColumns[sortKey] || themeTableSortColumns.score;
      const leftValue = valueFactory(left);
      const rightValue = valueFactory(right);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      var result = 0;
      if (sortKey === "high_drawdown_pct") {
        const leftMissing = leftValue === null || leftValue === undefined || !Number.isFinite(leftNumber);
        const rightMissing = rightValue === null || rightValue === undefined || !Number.isFinite(rightNumber);
        if (leftMissing && rightMissing) {
          result = 0;
        } else if (leftMissing) {
          result = 1;
        } else if (rightMissing) {
          result = -1;
        } else {
          result = leftNumber - rightNumber;
        }
      } else if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        result = leftNumber - rightNumber;
      } else {
        result = String(leftValue || "").localeCompare(String(rightValue || ""), "ko");
      }
      if (result === 0) {
        result = Number(left.rank || 0) - Number(right.rank || 0);
      }
      return themeTableSortState.direction === "asc" ? result : -result;
    });
    const themeTableHeaderColumns = [
      { key: "rank", label: "순위" },
      { key: "sector", label: "섹터" },
      { key: "stock_name", label: "종목명" },
      { key: "sortino_norm", label: "Sortino" },
      { key: "atr_20", label: "% ATR(20)" },
      { key: "market_cap_100m", label: "시총(억)" },
      { key: "trading_value_100m", label: "거래대금(억)" },
      { key: "high_drawdown_pct", label: "고점대비" },
      { key: "change_pct", label: "등락률" },
      { key: "score_o", label: "당일점수" },
      { key: "score", label: "종합점수" },
      { key: "note", label: "비고" },
    ];
    const themeTableRowHeight = 38;
    const themeTableViewportHeight = Math.min(620, Math.max(320, sortedVisibleRows.length * themeTableRowHeight + 42));
    const themeTableOverscan = 14;
    const themeTableMaxScrollTop = Math.max(0, sortedVisibleRows.length * themeTableRowHeight - themeTableViewportHeight);
    const themeTableEffectiveScrollTop = Math.min(themeTableScrollTop, themeTableMaxScrollTop);
    const themeTableStartIndex = Math.max(0, Math.floor(themeTableEffectiveScrollTop / themeTableRowHeight) - themeTableOverscan);
    const themeTableEndIndex = Math.min(
      sortedVisibleRows.length,
      Math.ceil((themeTableEffectiveScrollTop + themeTableViewportHeight) / themeTableRowHeight) + themeTableOverscan
    );
    const themeTableTopSpacer = themeTableStartIndex * themeTableRowHeight;
    const themeTableBottomSpacer = Math.max(0, (sortedVisibleRows.length - themeTableEndIndex) * themeTableRowHeight);
    const renderedVisibleRows = sortedVisibleRows.slice(themeTableStartIndex, themeTableEndIndex);
    const visibleRowIndexByKey = {};
    sortedVisibleRows.forEach(function (row, index) {
      visibleRowIndexByKey[buildStockSearchKey(row)] = index;
    });
    const displayFormulaConfig = (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config && scoreFormulaConfigRequest.data.config.display_formula) || {};
    const krCaptureScoreThreshold = Number(displayFormulaConfig.kr_capture_score_threshold || 100);
    const dailyCaptureScoreThreshold = Number(
      displayFormulaConfig.kr_daily_capture_score_threshold == null
        ? 70
        : displayFormulaConfig.kr_daily_capture_score_threshold
    );
    const isRankSort = themeTableSortState.key === "rank";
    const isDailyScoreSort = themeTableSortState.key === "score_o";
    const captureTitle = isRankSort
      ? (isRankNear52Mode ? "종목 추세 순위 · 20일 신고가 · 52주 신고가 30% 이내" : (isRank52Mode ? "종목 추세 순위 · 52주 신고가" : "종목 추세 순위"))
      : (isDailyScoreSort ? "종목 추세 순위 · 당일점수 " + numberFormat(dailyCaptureScoreThreshold, 0) + "점 이상" : "종목 추세 순위 · 종합점수 " + numberFormat(krCaptureScoreThreshold, 0) + "점 이상");
    const captureButtonLabel = isRankSort
      ? (isRankNear52Mode ? "20일 신고가 · 52주 30% 이내 캡쳐" : (isRank52Mode ? "52주 신고가 캡쳐" : "전체 캡쳐"))
      : (isDailyScoreSort ? "당일점수 " + numberFormat(dailyCaptureScoreThreshold, 0) + "점 이상 캡쳐" : "종합점수 " + numberFormat(krCaptureScoreThreshold, 0) + "점 이상 캡쳐");
    const captureSummaryLabel = isRankSort
      ? (isRankNear52Mode ? "20일 신고가 · 52주 신고가 30% 이내" : (isRank52Mode ? "52주 신고가" : "전체"))
      : (isDailyScoreSort ? "당일점수 " + numberFormat(dailyCaptureScoreThreshold, 0) + "점 이상" : "종합점수 " + numberFormat(krCaptureScoreThreshold, 0) + "점 이상");
    const captureEmptyMessage = isRankSort
      ? (isRankNear52Mode ? "20일 신고가이면서 52주 신고가까지 30% 이내인 종목이 없습니다." : (isRank52Mode ? "52주 신고가 종목이 없습니다." : "표시할 종목이 없습니다."))
      : (isDailyScoreSort ? "당일점수 " + numberFormat(dailyCaptureScoreThreshold, 0) + "점 이상 종목이 없습니다." : "종합점수 " + numberFormat(krCaptureScoreThreshold, 0) + "점 이상 종목이 없습니다.");
    const scoreCaptureRows = (isRankSort ? sortedVisibleRows : sortedVisibleRows
      .filter(function (row) {
        return isDailyScoreSort ? Number(row.score_o || 0) >= dailyCaptureScoreThreshold : Number(row.score || 0) >= krCaptureScoreThreshold;
      }))
      .map(function (row, index) {
        const compositeRank = Number(row && row.rank);
        const displayRank = preserveCompositeRank && Number.isFinite(compositeRank) && compositeRank > 0
          ? compositeRank
          : index + 1;
        return Object.assign({}, row, { __display_rank: displayRank });
      });
    const rankHighCountLabel = isRank52Mode
      ? "52주 신고가 " + numberFormat(rows.filter(isTradableHigh52).length, 0) + "개"
      : (isRankNear52Mode
        ? "조건 종목 " + numberFormat(rows.filter(function (row) {
            return isTradableHigh20(row) && Number(row && row.pct_to_52w_high) <= 30;
          }).length, 0) + "개"
        : "");
    const maxLeadCount = sortedVisibleRows.reduce(function (maxValue, row) {
      return Math.max(maxValue, Math.abs(Number(row.lead_count || 0)));
    }, 0);
    const maxAvgLeadScoreAbs = sortedVisibleRows.reduce(function (maxValue, row) {
      return Math.max(maxValue, Math.abs(Number(row.avg_lead_score || 0)));
    }, 0);

    function toggleThemeTableSort(sortKey) {
      if (sortKey === "rank") {
        if (themeTableSortState.key !== "rank") {
          setRankFilterMode("high52");
          setThemeTableSortState({ key: "rank", direction: "desc" });
          return;
        }
        if (rankFilterMode === "high52") {
          setRankFilterMode("high20");
          setThemeTableSortState({ key: "rank", direction: "desc" });
          return;
        }
        if (rankFilterMode === "high20") {
          setRankFilterMode("all");
          setThemeTableSortState({ key: "score", direction: "desc" });
          return;
        }
        setRankFilterMode("high52");
        setThemeTableSortState({ key: "rank", direction: "desc" });
        return;
      }
      setRankFilterMode("all");
      setThemeTableSortState(function (current) {
        if (current && current.key === sortKey) {
          return { key: sortKey, direction: current.direction === "desc" ? "asc" : "desc" };
        }
        return {
          key: sortKey,
          direction: sortKey === "stock_name" || sortKey === "sector" || sortKey === "note" || sortKey === "high_drawdown_pct"
            ? "asc"
            : "desc"
        };
      });
    }

    function normalizeStockSearchText(value) {
      return String(value || "").toLowerCase().replace(/\s+/g, "");
    }

    function strictKrStockCode(value) {
      if (value == null) {
        return "";
      }
      const text = String(value).trim();
      if (/^\d{6}$/.test(text)) {
        return text;
      }
      if (/^\d{5}$/.test(text)) {
        return text.padStart(6, "0");
      }
      if (/^\d+\.0$/.test(text)) {
        const normalized = text.split(".", 1)[0];
        return /^\d{5,6}$/.test(normalized) ? normalized.padStart(6, "0") : "";
      }
      return "";
    }

    function displayStockCode(value) {
      if (value == null) {
        return "";
      }
      const text = String(value).trim();
      if (!text) {
        return "";
      }
      const strictCode = strictKrStockCode(text);
      if (strictCode) {
        return strictCode;
      }
      if (/^\d+\.0$/.test(text)) {
        return text.split(".", 1)[0].toUpperCase();
      }
      return text.toUpperCase();
    }

    function buildStockSearchKey(row) {
      const code = strictKrStockCode((row || {}).stock_code);
      if (code) {
        return code;
      }
      return [
        String((row || {}).stock_name || ""),
        String((row || {}).resolved_name || ""),
        String((row || {}).stock_code || ""),
      ].filter(Boolean).join("|");
    }

    function stockSearchHaystack(row) {
      return normalizeStockSearchText([
        row.stock_name,
        row.resolved_name,
        row.stock_code,
        strictKrStockCode(row.stock_code),
      ].filter(Boolean).join(" "));
    }

    const stockSearchQuery = normalizeStockSearchText(stockSearchText);
    const stockSearchSuggestions = stockSearchOpen && stockSearchQuery
      ? rows.filter(function (row) {
          return stockSearchHaystack(row).indexOf(stockSearchQuery) >= 0;
        }).slice().sort(function (a, b) {
          const aName = normalizeStockSearchText(a.stock_name || "");
          const bName = normalizeStockSearchText(b.stock_name || "");
          const aStarts = aName.indexOf(stockSearchQuery) === 0 ? 0 : 1;
          const bStarts = bName.indexOf(stockSearchQuery) === 0 ? 0 : 1;
          if (aStarts !== bStarts) {
            return aStarts - bStarts;
          }
          return Number(a.rank || 9999) - Number(b.rank || 9999);
        }).slice(0, 10)
      : [];

    function scrollToStockRow(stockKey, delay) {
      window.setTimeout(function () {
        const targetIndex = visibleRowIndexByKey[stockKey];
        if (themeTableScrollRef.current && Number.isFinite(targetIndex)) {
          themeTableScrollRef.current.scrollTop = Math.max(0, targetIndex * themeTableRowHeight - (themeTableViewportHeight / 2));
        }
        const rowElement = stockRowRefs.current[stockKey];
        if (rowElement && rowElement.scrollIntoView) {
          rowElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
      }, delay || 0);
    }

    function handleThemeTableScroll(event) {
      const nextTop = Number((event.currentTarget && event.currentTarget.scrollTop) || 0);
      if (themeTableScrollRafRef.current) {
        window.cancelAnimationFrame(themeTableScrollRafRef.current);
      }
      themeTableScrollRafRef.current = window.requestAnimationFrame(function () {
        themeTableScrollRafRef.current = null;
        setThemeTableScrollTop(nextTop);
      });
    }

    function openScoreFormulaModal() {
      if (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config) {
        setScoreFormulaDraft(JSON.parse(JSON.stringify(scoreFormulaConfigRequest.data.config)));
      }
      setScoreFormulaStatus({ type: "", message: "" });
      setScoreFormulaModalOpen(true);
    }

    function closeScoreFormulaModal() {
      if (scoreFormulaSaving) {
        return;
      }
      setScoreFormulaModalOpen(false);
    }

    function updateScoreFormulaDraft(sectionKey, itemKey, value) {
      setScoreFormulaDraft(function (current) {
        const next = JSON.parse(JSON.stringify(current || {}));
        if (!next[sectionKey] || typeof next[sectionKey] !== "object") {
          next[sectionKey] = {};
        }
        next[sectionKey][itemKey] = value;
        return next;
      });
    }

    function scoreFormulaSectionLabel(sectionKey) {
      const labels = {
        score_formula: "당일점수 산식",
        final_score_formula: "종합점수 산식",
        trend_adjustment_formula: "추세 보너스/패널티",
        display_formula: "화면 표시 기준",
      };
      return labels[sectionKey] || sectionKey;
    }

    function scoreFormulaFieldLabel(fieldKey) {
      const labels = {
        amount_power: "거래대금 지수",
        marcap_power: "시가총액 지수",
        return_base: "등락률 기준값",
        return_power: "등락률 지수",
        log_base: "로그 기준값",
        trading_value_surge_power: "거래대금 증가 강도",
        trading_value_surge_cap: "거래대금 증가 상한",
        bonus_if_52w_high: "52주 신고가 보너스",
        bonus_if_20d_high: "20일 신고가 보너스",
        bonus_if_not_52w_high: "비신고가 패널티",
        offset: "당일점수 오프셋",
        weight_today: "당일 비중",
        weight_1w: "1주 비중",
        weight_1m: "1개월 비중",
        weight_3m: "3개월 비중",
        sortino_power: "Sortino 강도",
        sortino_floor: "Sortino 최소 배율",
        sortino_tanh_scale: "Sortino tanh scale",
        sortino_min_obs: "Sortino 최소 관측수",
        sortino_insufficient_value: "Sortino 부족시 값",
        enabled: "추세 보정 사용",
        today_blend_weight: "당일 혼합 비중",
        trend_floor: "추세 최저 기준",
        acceleration_alignment_bonus: "가속 정렬 보너스",
        acceleration_max_bonus: "가속 최대 보너스",
        acceleration_cap_ratio: "가속 상한 비율",
        break_base_penalty_today_below_1w: "당일<1주 패널티",
        break_base_penalty_1w_below_1m: "1주<1개월 패널티",
        break_base_penalty_1m_below_3m: "1개월<3개월 패널티",
        break_max_penalty: "붕괴 최대 패널티",
        break_cap_ratio: "붕괴 상한 비율",
        kr_capture_score_threshold: "국내 종합점수 캡쳐 기준",
        kr_daily_capture_score_threshold: "국내 당일점수 캡쳐 기준",
        entry_signal_threshold: "진입 시그널 기준점수",
        exit_signal_threshold: "편출 시그널 기준점수",
      };
      return labels[fieldKey] || fieldKey;
    }

    async function saveScoreFormulaConfig() {
      if (!scoreFormulaDraft || scoreFormulaSaving || scoreFormulaRecalculating) {
        return;
      }
      setScoreFormulaSaving(true);
      setScoreFormulaStatus({ type: "", message: "" });
      try {
        const payload = await postJson("/api/themes/score-formula-config", { config: scoreFormulaDraft });
        setScoreFormulaDraft(JSON.parse(JSON.stringify(payload.config || {})));
        await Promise.all([
          scoreFormulaConfigRequest.refresh(true),
          scoreFormulaSnapshotsRequest.refresh(true),
        ]);
        setScoreFormulaStatus({ type: "success", message: "점수 설정을 저장했습니다. 점수 데이터는 재계산 전까지 그대로 유지됩니다." });
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
      } finally {
        setScoreFormulaSaving(false);
      }
    }

    async function saveScoreFormulaSnapshot() {
      if (!scoreFormulaDraft || scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving) {
        return;
      }
      setScoreFormulaSnapshotSaving(true);
      setScoreFormulaStatus({ type: "", message: "" });
      try {
        const payload = await postJson("/api/themes/score-formula-snapshots", {
          market: "kr",
          label: scoreFormulaSnapshotLabel,
          config: scoreFormulaDraft,
        });
        await scoreFormulaSnapshotsRequest.refresh(true);
        setScoreFormulaSnapshotLabel("");
        setScoreFormulaStatus({
          type: "success",
          message: "점수 설정 저장본을 DB에 기록했습니다. " + String((((payload || {}).snapshot || {}).created_at || "")),
        });
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
      } finally {
        setScoreFormulaSnapshotSaving(false);
      }
    }

    function applyScoreFormulaSnapshot(snapshot) {
      if (!snapshot || !snapshot.config) {
        return;
      }
      setScoreFormulaDraft(JSON.parse(JSON.stringify(snapshot.config)));
      setScoreFormulaStatus({ type: "success", message: "저장본을 불러왔습니다. 설정 저장 후 재계산하면 반영됩니다." });
    }

    function scoreFormulaMarketLabel(market) {
      if (market === "us") return "미국";
      if (market === "asia") return "아시아";
      return "국내";
    }

    function stopScoreFormulaJobPolling() {
      if (scoreFormulaJobPollRef.current) {
        window.clearInterval(scoreFormulaJobPollRef.current);
        scoreFormulaJobPollRef.current = null;
      }
    }

    async function pollScoreFormulaJobStatus(market, scope, options) {
      const normalizedMarket = market === "us" || market === "asia" ? market : "kr";
      const normalizedScope = scope === "recent_1y" ? "recent_1y" : "full";
      const marketLabel = scoreFormulaMarketLabel(normalizedMarket);
      const payload = await fetchJson("/api/themes/recalculate-scores/status?market=" + encodeURIComponent(normalizedMarket), { silent: true, noCache: true });
      setScoreFormulaJobState(payload || null);
      const status = String((payload && payload.status) || "").toLowerCase();
      const percent = Number(payload && payload.percent);
      upsertBackgroundTask({
        id: "score-formula-" + normalizedMarket,
        label: marketLabel + " 점수 재계산",
        market: normalizedMarket,
        marketLabel: marketLabel,
        scope: normalizedScope,
        status: status || "running",
        percent: Number.isFinite(percent) ? percent : 0,
        message: (payload && payload.message) || "",
        startedAt: normalizeTimestampMs((payload && payload.started_ts) || (payload && payload.updated_ts) || Date.now()),
      });
      const progressPrefix = Number.isFinite(percent) ? "[" + numberFormat(percent, 0) + "%] " : "";
      if (status === "queued" || status === "running") {
        setScoreFormulaStatus({
          type: "success",
          message: progressPrefix + (payload && payload.message ? payload.message : marketLabel + " 백그라운드 재계산 진행 중"),
        });
        return payload;
      }
      stopScoreFormulaJobPolling();
      setScoreFormulaRecalculating(false);
      if (status === "completed") {
        await Promise.all([
          scoreFormulaConfigRequest.refresh(true),
          refreshThemesData(true),
          calendarRequest.refresh(true),
        ]);
        const result = (payload && payload.result) || {};
        const dateSuffix = result && result.recalculated_dates ? " / " + numberFormat(result.recalculated_dates, 0) + "일자" : "";
        const completeMessage = marketLabel + " " + (normalizedScope === "recent_1y" ? "최근 1년 데이터 재계산" : "전체 과거 재계산") + dateSuffix + " 완료";
        setScoreFormulaStatus({
          type: "success",
          message: completeMessage + (Number.isFinite(Number(result.duration_sec)) ? " (" + numberFormat(Number(result.duration_sec), 2) + "초)" : ""),
        });
        if (!(options && options.silentCompleteAlert)) {
          window.alert(completeMessage);
        }
        return payload;
      }
      removeBackgroundTask("score-formula-" + normalizedMarket);
      const errorMessage = (payload && (payload.error || payload.message)) || (marketLabel + " 점수 재계산 실패");
      setScoreFormulaStatus({ type: "error", message: errorMessage });
      return payload;
    }

    function startScoreFormulaJobPolling(market, scope) {
      stopScoreFormulaJobPolling();
      pollScoreFormulaJobStatus(market, scope).catch(function () {});
      scoreFormulaJobPollRef.current = window.setInterval(function () {
        pollScoreFormulaJobStatus(market, scope).catch(function () {});
      }, 3000);
    }

    async function recalculateScoresFromFormula(scope, market) {
      if (scoreFormulaSaving || scoreFormulaRecalculating) {
        return;
      }
      const effectiveConfig = scoreFormulaDraft || (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config) || null;
      if (!effectiveConfig) {
        setScoreFormulaStatus({ type: "error", message: "점수 지표 설정을 아직 불러오는 중입니다. 잠시 후 다시 시도해 주세요." });
        return;
      }
      setScoreFormulaRecalculating(true);
      setScoreFormulaStatus({ type: "", message: "" });
      try {
        const normalizedScope = scope === "recent_1y" ? "recent_1y" : "full";
        const normalizedMarket = market === "us" || market === "asia" ? market : "kr";
        const payload = await postJson("/api/themes/recalculate-scores/background", { config: effectiveConfig, scope: normalizedScope, market: normalizedMarket });
        setScoreFormulaJobState(payload || null);
        upsertBackgroundTask({
          id: "score-formula-" + normalizedMarket,
          label: scoreFormulaMarketLabel(normalizedMarket) + " 점수 재계산",
          market: normalizedMarket,
          marketLabel: scoreFormulaMarketLabel(normalizedMarket),
          scope: normalizedScope,
          status: String((payload && payload.status) || "queued").toLowerCase(),
          percent: Number(payload && payload.percent) || 0,
          message: (payload && payload.message) || "백그라운드 재계산 시작",
          startedAt: normalizeTimestampMs((payload && payload.started_ts) || Date.now()),
        });
        setScoreFormulaStatus({
          type: "success",
          message: scoreFormulaMarketLabel(normalizedMarket) + " 점수 재계산을 백그라운드에서 시작했습니다. 다른 기능을 계속 사용할 수 있습니다.",
        });
        startScoreFormulaJobPolling(normalizedMarket, normalizedScope);
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
        setScoreFormulaRecalculating(false);
      }
    }

    async function syncScoreFormulaToOracle() {
      if (scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing) {
        return;
      }
      setScoreFormulaOracleSyncing(true);
      setScoreFormulaStatus({ type: "", message: "" });
      try {
        if (scoreFormulaDraft) {
          await postJson("/api/themes/score-formula-config", { config: scoreFormulaDraft, market: "kr" });
          await scoreFormulaConfigRequest.refresh(true);
        }
        const payload = await postJson("/api/oracle-sync/score-formula/push", { markets: ["kr"] });
        const markets = ((payload && payload.markets) || []).join(", ");
        setScoreFormulaStatus({
          type: "success",
          message: "Oracle 서버에 점수 공식을 업데이트했습니다." + (markets ? " (" + markets + ")" : ""),
        });
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
      } finally {
        setScoreFormulaOracleSyncing(false);
      }
    }

    function renderScoreFormulaModal() {
      if (!scoreFormulaModalOpen) {
        return null;
      }
      const config = scoreFormulaDraft || (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config) || {};
      const snapshots = (scoreFormulaSnapshotsRequest.data && scoreFormulaSnapshotsRequest.data.snapshots) || [];
      const jobStatus = String((scoreFormulaJobState && scoreFormulaJobState.status) || "").toLowerCase();
      const jobPercent = Number(scoreFormulaJobState && scoreFormulaJobState.percent);
      const jobRunning = scoreFormulaRecalculating || jobStatus === "queued" || jobStatus === "running";
      const jobScopeLabel = String(scoreFormulaJobState && scoreFormulaJobState.scope || "") === "recent_1y" ? "최근 1년" : "전체";
      return h(
        "div",
        { className: "modal-backdrop", onClick: closeScoreFormulaModal },
        h(
          "div",
          { className: "modal-panel score-formula-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Score Formula"),
              h("h2", null, "점수 지표 수정")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeScoreFormulaModal, disabled: scoreFormulaSaving }, "닫기")
          ),
          scoreFormulaConfigRequest.loading && !scoreFormulaDraft
            ? h(LoadingBlock, { compact: true, title: "점수 설정 불러오는 중", label: scoreFormulaConfigRequest.label })
            : h(
                React.Fragment,
                null,
                h("div", { className: "summary-help" }, "아래 재계산 버튼들은 각 시장의 원천 점수(score_o, 평균, sortino, 종합점수)까지 다시 계산합니다. 최근 1년 버튼은 최근 1년 구간만 정확하게 다시 반영합니다."),
                jobRunning
                  ? h(
                      "div",
                      { className: "score-formula-progress-card" },
                      h(
                        "div",
                        { className: "score-formula-progress-head" },
                        h("strong", null, "백그라운드 재계산 진행 중"),
                        h("span", null, Number.isFinite(jobPercent) ? (numberFormat(jobPercent, 0) + "%") : "-")
                      ),
                      h(
                        "div",
                        { className: "score-formula-progress-meta" },
                        h("span", null, "시장: 국내"),
                        h("span", null, "범위: " + jobScopeLabel),
                        h("span", null, "상태: " + (scoreFormulaJobState && scoreFormulaJobState.message ? scoreFormulaJobState.message : "진행 중"))
                      ),
                      h("div", { className: "score-formula-progress-bar" }, h("span", { style: { width: (Number.isFinite(jobPercent) ? Math.max(4, Math.min(100, jobPercent)) : 8) + "%" } })),
                      h("div", { className: "summary-help" }, "팝업을 닫아도 계산은 계속 진행됩니다. 왼쪽 하단 로딩 표시를 눌러 상세 진행 상황을 볼 수 있습니다.")
                    )
                  : null,
                scoreFormulaStatus.message
                  ? h("div", { className: "summary-help" + (scoreFormulaStatus.type === "error" ? " text-danger" : "") }, scoreFormulaStatus.message)
                  : null,
                h(
                  "div",
                  { className: "score-formula-section" },
                  h("h3", { className: "score-formula-section-title" }, "점수 설정 저장본"),
                  h(
                    "div",
                    { className: "form-grid score-formula-grid", style: { gridTemplateColumns: "2fr 1fr" } },
                    h(
                      "label",
                      { className: "form-field" },
                      h("span", null, "저장본 이름"),
                      h("input", {
                        type: "text",
                        value: scoreFormulaSnapshotLabel,
                        placeholder: "예: 국내 복구 전",
                        onChange: function (event) { setScoreFormulaSnapshotLabel(event.target.value || ""); },
                      })
                    ),
                    h(
                      "div",
                      { className: "form-field", style: { justifyContent: "flex-end" } },
                      h("span", null, "DB 저장"),
                      h("button", {
                        type: "button",
                        className: "secondary-button",
                        onClick: saveScoreFormulaSnapshot,
                        disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving,
                      }, scoreFormulaSnapshotSaving ? "저장 중..." : "현재값 저장")
                    )
                  ),
                  snapshots.length
                    ? h(
                        "div",
                        { className: "data-table-wrap", style: { maxHeight: "220px", overflow: "auto" } },
                        h(
                          "table",
                          { className: "data-table compact-table" },
                          h("thead", null, h("tr", null, h("th", null, "저장시각"), h("th", null, "이름"), h("th", null, "구분"), h("th", null, ""))),
                          h(
                            "tbody",
                            null,
                            snapshots.map(function (snapshot) {
                              return h(
                                "tr",
                                { key: "score-formula-snapshot-kr-" + String(snapshot.id || "") },
                                h("td", null, String(snapshot.created_at || "").replace("T", " ")),
                                h("td", null, snapshot.label || "-"),
                                h("td", null, snapshot.source === "auto" ? "자동" : "수동"),
                                h("td", null, h("button", { type: "button", className: "mini-button", onClick: function () { applyScoreFormulaSnapshot(snapshot); } }, "불러오기"))
                              );
                            })
                          )
                        )
                      )
                    : h("div", { className: "summary-help" }, "저장된 점수 설정 이력이 없습니다."),
                ),
                Object.keys(config).map(function (sectionKey) {
                  const section = config[sectionKey];
                  if (!section || typeof section !== "object") {
                    return null;
                  }
                  return h(
                    "div",
                    { key: sectionKey, className: "score-formula-section" },
                    h("h3", { className: "score-formula-section-title" }, scoreFormulaSectionLabel(sectionKey)),
                    h(
                      "div",
                      { className: "form-grid score-formula-grid" },
                      Object.keys(section).map(function (itemKey) {
                        const rawValue = section[itemKey];
                        const isBoolean = typeof rawValue === "boolean";
                        return h(
                          "label",
                          { key: itemKey, className: "form-field" },
                          h("span", null, scoreFormulaFieldLabel(itemKey)),
                          isBoolean
                            ? h("select", {
                                value: String(rawValue),
                                onChange: function (event) { updateScoreFormulaDraft(sectionKey, itemKey, event.target.value === "true"); },
                              },
                              h("option", { value: "true" }, "true"),
                              h("option", { value: "false" }, "false")
                            )
                            : h("input", {
                                type: "number",
                                step: "any",
                                value: rawValue,
                                onChange: function (event) { updateScoreFormulaDraft(sectionKey, itemKey, event.target.value); },
                              })
                        );
                      })
                    )
                  );
                }),
                h(
                  "div",
                  { className: "score-formula-actions" },
                  h("button", { type: "button", className: "secondary-button", onClick: saveScoreFormulaConfig, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaOracleSyncing }, scoreFormulaSaving ? "저장 중..." : "설정 저장"),
                  h("button", { type: "button", className: "secondary-button", onClick: saveScoreFormulaSnapshot, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing }, scoreFormulaSnapshotSaving ? "저장 중..." : "DB 저장본 만들기"),
                  h("button", { type: "button", className: "secondary-button", onClick: syncScoreFormulaToOracle, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing }, scoreFormulaOracleSyncing ? "업데이트 중..." : "Oracle 공식 업데이트"),
                  h("button", { type: "button", className: "secondary-button", onClick: function () { recalculateScoresFromFormula("recent_1y", "kr"); }, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaOracleSyncing }, scoreFormulaRecalculating ? "재계산 중..." : "국내 최근 1년 재계산"),
                  h("button", { type: "button", className: "primary-button", onClick: function () { recalculateScoresFromFormula("full", "kr"); }, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaOracleSyncing }, scoreFormulaRecalculating ? "재계산 중..." : "국내 전체 재계산")
                )
              )
        )
      );
    }

    function submitStockSearch(event) {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      const query = normalizeStockSearchText(stockSearchText);
      if (!query) {
        setStockSearchMessage("검색할 종목명을 입력해 주세요.");
        return;
      }
      const matched = rows.find(function (row) {
        return stockSearchHaystack(row).indexOf(query) >= 0;
      });
      if (!matched) {
        setStockSearchMessage("조건에 맞는 종목을 찾지 못했습니다.");
        setHighlightedStockKey("");
        return;
      }
      const stockKey = buildStockSearchKey(matched);
      const isVisibleNow = visibleRows.some(function (row) {
        return buildStockSearchKey(row) === stockKey;
      });
      if (!isVisibleNow) {
        pendingStockScrollKeyRef.current = stockKey;
        setSectorFilter("all");
      }
      setHighlightedStockKey(stockKey);
      setStockSearchMessage((matched.stock_name || "종목") + " · " + numberFormat(matched.rank, 0) + "위 위치로 이동합니다.");
      scrollToStockRow(stockKey, 80);
      scrollToStockRow(stockKey, 260);
    }

    function chooseStockSearchRow(row) {
      if (!row) {
        return;
      }
      setStockSearchText(row.stock_name || row.stock_code || "");
      setStockSearchOpen(false);
      setStockSearchActiveIndex(0);
      const stockKey = buildStockSearchKey(row);
      const isVisibleNow = visibleRows.some(function (visibleRow) {
        return buildStockSearchKey(visibleRow) === stockKey;
      });
      if (!isVisibleNow) {
        pendingStockScrollKeyRef.current = stockKey;
        setSectorFilter("all");
      }
      setHighlightedStockKey(stockKey);
      setStockSearchMessage((row.stock_name || "종목") + " · " + numberFormat(row.rank, 0) + "위 위치로 이동합니다.");
      scrollToStockRow(stockKey, 80);
      scrollToStockRow(stockKey, 260);
    }

    function handleStockSearchKeyDown(event) {
      if (!stockSearchOpen || !stockSearchSuggestions.length) {
        if (event.key === "Enter") {
          setStockSearchOpen(false);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setStockSearchActiveIndex(function (current) {
          return Math.min(current + 1, stockSearchSuggestions.length - 1);
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setStockSearchActiveIndex(function (current) {
          return Math.max(current - 1, 0);
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        chooseStockSearchRow(stockSearchSuggestions[stockSearchActiveIndex] || stockSearchSuggestions[0]);
      } else if (event.key === "Escape") {
        setStockSearchOpen(false);
      }
    }

    function renderSignedPercent(value) {
      const number = Number(value);
      let className = "metric-flat";
      if (number > 0) {
        className = "metric-up";
      } else if (number < 0) {
        className = "metric-down";
      }
      return h("span", { className: className }, formatPercent(number, 2));
    }

    function renderHighDrawdownPercent(row) {
      const rawDistance = row && row.pct_to_52w_high;
      if (rawDistance === null || rawDistance === undefined || rawDistance === "") {
        return "-";
      }
      const distance = Number(rawDistance);
      const tradingValue = Number((row && row.trading_value_100m) || 0);
      if (!Number.isFinite(distance) || tradingValue <= 0) {
        return "-";
      }
      const drawdown = distance <= 0 ? 0 : -((distance / (100 + distance)) * 100);
      return h("span", null, formatPercent(drawdown, 2));
    }

    function isHigh52(value) {
      const normalized = String(value || "").trim().toUpperCase();
      return normalized === "O" || normalized === "Y" || normalized === "TRUE" || normalized === "1";
    }

    function isTradableHigh52(row) {
      return isHigh52(row && row.is_52w_high)
        && Number((row && row.trading_value_100m) || 0) > 0
        && Number((row && row.score_o) || 0) > 0;
    }

    function isHigh20(value) {
      const normalized = String(value || "").trim().toUpperCase();
      return normalized === "O" || normalized === "Y" || normalized === "TRUE" || normalized === "1";
    }

    function isTradableHigh20(row) {
      return isHigh20(row && row.is_20d_high)
        && Number((row && row.trading_value_100m) || 0) > 0
        && Number((row && row.score_o) || 0) > 0;
    }

    function renderRankCell(row, rankValue) {
      const high52 = isHigh52(row.is_52w_high);
      const high20 = isHigh20(row.is_20d_high);
      const near52 = high20 && Number(row && row.pct_to_52w_high) <= 30;
      const displayRank = Number(rankValue != null ? rankValue : (row && row.__display_rank != null ? row.__display_rank : row.rank));
      return h(
        "span",
        {
          className: "rank-cell" + (high52 ? " high52" : "") + (!high52 && near52 ? " high20" : ""),
          title: high52 ? "52주 신고가" : (near52 ? "20일 신고가 · 52주 신고가까지 30% 이내" : (high20 ? "20일 신고가" : "")),
        },
        numberFormat(displayRank, 0)
      );
    }

    function resolveThemeTableRank(row, visibleIndex) {
      const compositeRank = Number(row && row.rank);
      if (preserveCompositeRank && Number.isFinite(compositeRank) && compositeRank > 0) {
        return compositeRank;
      }
      return visibleIndex + 1;
    }


  function renderNumberCell(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return numberFormat(number, digits == null ? 2 : digits);
  }

    function scoreHeatColor(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "#f8fafc";
      }
      const clamped = Math.max(0, Math.min(100, number));
      const hue = 120 - clamped * 1.2;
      return "hsl(" + hue.toFixed(0) + " 72% 76%)";
    }

    function renderHeatScore(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return h("span", { className: "heat-score-cell empty" }, "-");
      }
      return h("span", { className: "heat-score-cell" }, numberFormat(number, 2));
    }

    function heatScoreCellProps(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return { className: "heat-score-td empty" };
      }
      return {
        className: "heat-score-td",
        style: { background: scoreHeatColor(number) },
      };
    }

    function scoreHistoryPositionFromEvent(event) {
      const width = 430;
      const height = 360;
      const left = Math.max(10, Math.min((event.clientX || 0) + 14, window.innerWidth - width - 10));
      const top = Math.max(10, Math.min((event.clientY || 0) + 14, window.innerHeight - height - 34));
      return { left: left, top: top };
    }

    function buildScoreHistoryKey(row) {
      const code = String((row || {}).stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = (row || {}).resolved_name || (row || {}).stock_name || "";
      const endDate = selectedDateValue || selectedFileDate || themes.file_date || "";
      const cacheLoadedAt = (themes && themes.cache_loaded_at) ? String(themes.cache_loaded_at) : "";
      return [code, name, endDate, cacheLoadedAt].join("|");
    }

    function openScoreHistory(row, options) {
      if (!row) {
        return;
      }
      const openOptions = options || {};
      const mode = openOptions.mode || "modal";
      const position = openOptions.position || null;
      const activeTab = openOptions.activeTab || "trend";
      const code = String(row.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = row.resolved_name || row.stock_name || "";
      const endDate = selectedDateValue || selectedFileDate || themes.file_date || "";
      const cacheKey = buildScoreHistoryKey(row);
      const cached = scoreHistoryCacheRef.current[cacheKey];
      scoreHistoryRequestSeqRef.current += 1;
      const requestSeq = scoreHistoryRequestSeqRef.current;
      if (cached) {
        setScoreHistoryPopup({
          open: true,
          mode: mode,
          loading: false,
          loadingMore: false,
          hasMore: cached.hasMore !== false,
          error: "",
          row: row,
          payload: cached,
          cacheKey: cacheKey,
          position: position,
          activeTab: activeTab,
        });
        return;
      }
      setScoreHistoryPopup({
        open: true,
        mode: mode,
        loading: true,
        loadingMore: false,
        hasMore: true,
        error: "",
        row: row,
        payload: null,
        cacheKey: cacheKey,
        position: position,
        activeTab: activeTab,
      });
      const params = new URLSearchParams();
      if (code && code !== "000000") {
        params.set("code", code);
      }
      if (name) {
        params.set("name", name);
      }
      if (endDate) {
        params.set("end_date", endDate);
      }
      params.set("days", "365");
      fetchJson("/api/themes/score-history?" + params.toString(), { noCache: true })
        .then(function (payload) {
          payload.hasMore = true;
          scoreHistoryCacheRef.current[cacheKey] = payload;
          if (scoreHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setScoreHistoryPopup({
            open: true,
            mode: mode,
            loading: false,
            loadingMore: false,
            hasMore: true,
            error: "",
            row: row,
            payload: payload,
            cacheKey: cacheKey,
            position: position,
            activeTab: activeTab,
          });
        })
        .catch(function (error) {
          if (scoreHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setScoreHistoryPopup({
            open: true,
            mode: mode,
            loading: false,
            loadingMore: false,
            hasMore: false,
            error: error.message || String(error),
            row: row,
            payload: null,
            cacheKey: cacheKey,
            position: position,
            activeTab: activeTab,
          });
        });
    }

    function loadMoreScoreHistory(beforeDate) {
      const popup = scoreHistoryPopup;
      if (!popup.open || popup.loading || popup.loadingMore || popup.hasMore === false) {
        return;
      }
      const payload = popup.payload || {};
      const historyRows = ensureArray(payload.rows);
      if (!historyRows.length) {
        return;
      }
      const earliestDate = beforeDate || String(historyRows[0].date || "");
      const nextEndDate = shiftIsoDate(earliestDate, -1);
      if (!nextEndDate) {
        setScoreHistoryPopup(function (current) {
          return Object.assign({}, current, { hasMore: false, loadingMore: false });
        });
        return;
      }
      setScoreHistoryPopup(function (current) {
        return Object.assign({}, current, { loadingMore: true });
      });
      const row = popup.row || {};
      const code = String(row.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = row.resolved_name || row.stock_name || "";
      const params = new URLSearchParams();
      if (code && code !== "000000") {
        params.set("code", code);
      }
      if (name) {
        params.set("name", name);
      }
      params.set("end_date", nextEndDate);
      params.set("days", "180");
      fetchJson("/api/themes/score-history?" + params.toString(), { noCache: true })
        .then(function (olderPayload) {
          setScoreHistoryPopup(function (current) {
            const currentPayload = current.payload || {};
            const currentRows = ensureArray(currentPayload.rows);
            const mergedPayload = mergeScoreHistoryPayloadRows(currentPayload, olderPayload || {});
            const mergedRows = ensureArray(mergedPayload.rows);
            const addedOlderRows = mergedRows.length > currentRows.length && mergedRows.length && String(mergedRows[0].date || "") < String(currentRows[0] && currentRows[0].date || "");
            mergedPayload.hasMore = addedOlderRows;
            if (current.cacheKey) {
              scoreHistoryCacheRef.current[current.cacheKey] = mergedPayload;
            }
            return Object.assign({}, current, {
              payload: mergedPayload,
              loadingMore: false,
              hasMore: addedOlderRows,
            });
          });
        })
        .catch(function () {
          setScoreHistoryPopup(function (current) {
            return Object.assign({}, current, { loadingMore: false, hasMore: false });
          });
        });
    }

    function closeScoreHistory() {
      if (scoreHistoryClickTimerRef.current) {
        clearTimeout(scoreHistoryClickTimerRef.current);
        scoreHistoryClickTimerRef.current = null;
      }
      scoreHistoryRequestSeqRef.current += 1;
      setScoreHistoryPopup({
        open: false,
        mode: "modal",
        loading: false,
        loadingMore: false,
        hasMore: true,
        error: "",
        row: null,
        payload: null,
        cacheKey: "",
        position: null,
        activeTab: "trend",
      });
    }

    function setScoreHistoryActiveTab(nextTab) {
      setScoreHistoryPopup(function (current) {
        return Object.assign({}, current, { activeTab: nextTab === "breakdown" ? "breakdown" : "trend" });
      });
    }

    function scheduleScoreHistoryHover(row, event) {
      const position = scoreHistoryPositionFromEvent(event);
      if (scoreHistoryHoverCloseRef.current) {
        clearTimeout(scoreHistoryHoverCloseRef.current);
      }
      if (scoreHistoryHoverOpenRef.current) {
        clearTimeout(scoreHistoryHoverOpenRef.current);
      }
      scoreHistoryHoverOpenRef.current = setTimeout(function () {
        openScoreHistory(row, { mode: "hover", position: position });
      }, 180);
    }

    function updateScoreHistoryHoverPosition(event) {
      if (!scoreHistoryPopup.open || scoreHistoryPopup.mode !== "hover") {
        return;
      }
      const position = scoreHistoryPositionFromEvent(event);
      setScoreHistoryPopup(function (current) {
        if (!current.open || current.mode !== "hover") {
          return current;
        }
        return Object.assign({}, current, { position: position });
      });
    }

    function scheduleScoreHistoryHoverClose() {
      if (scoreHistoryHoverOpenRef.current) {
        clearTimeout(scoreHistoryHoverOpenRef.current);
      }
      if (scoreHistoryHoverCloseRef.current) {
        clearTimeout(scoreHistoryHoverCloseRef.current);
      }
      scoreHistoryHoverCloseRef.current = setTimeout(function () {
        scoreHistoryRequestSeqRef.current += 1;
        setScoreHistoryPopup(function (current) {
          if (current.mode !== "hover") {
            return current;
          }
          return {
            open: false,
            mode: "modal",
            loading: false,
            error: "",
            row: null,
            payload: null,
            position: null,
          };
        });
      }, 160);
    }

    function keepScoreHistoryHoverOpen() {
      if (scoreHistoryHoverCloseRef.current) {
        clearTimeout(scoreHistoryHoverCloseRef.current);
      }
    }

    function renderTodayScore(value, row) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      if (row) {
        return h(
          "button",
          {
            type: "button",
            className: "today-score-cell today-score-button",
            title: "한 번 클릭: 점수 추이 / 더블 클릭: 점수 분해",
            onClick: function () {
              if (scoreHistoryClickTimerRef.current) {
                clearTimeout(scoreHistoryClickTimerRef.current);
              }
              scoreHistoryClickTimerRef.current = setTimeout(function () {
                scoreHistoryClickTimerRef.current = null;
                openScoreHistory(row, { mode: "modal", activeTab: "trend" });
              }, 220);
            },
            onDoubleClick: function () {
              if (scoreHistoryClickTimerRef.current) {
                clearTimeout(scoreHistoryClickTimerRef.current);
                scoreHistoryClickTimerRef.current = null;
              }
              openScoreHistory(row, { mode: "modal", activeTab: "breakdown" });
            },
          },
          numberFormat(number, 2)
        );
      }
      return h("span", { className: "today-score-cell" }, numberFormat(number, 2));
    }

    function renderScoreBreakdownContent(breakdown, payload, popupRow) {
      if (!breakdown) {
        return EmptyState({ message: "선택 기준일 점수 분해 데이터가 없습니다.", compact: true });
      }
      const endDate = payload.end_date || "";
      const stockName = payload.stock_name || popupRow.resolved_name || popupRow.stock_name || "종목";
      const scoreFormulaParams = breakdown.score_formula_params || {};
      const finalScoreFormulaParams = breakdown.final_score_formula_params || {};
      function coerceNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      }
      function formatBreakdownNumber(value, digits) {
        const number = coerceNumber(value);
        if (number == null) {
          return "-";
        }
        const abs = Math.abs(number);
        if ((abs >= 1e12) || (abs > 0 && abs < 1e-4)) {
          return number.toExponential(Math.max(2, digits == null ? 4 : digits));
        }
        return numberFormat(number, digits == null ? 2 : digits);
      }
      const computedReturnTerm = coerceNumber(breakdown.return_term) != null
        ? coerceNumber(breakdown.return_term)
        : (function () {
            const returnBase = coerceNumber(scoreFormulaParams.return_base);
            const returnPower = coerceNumber(scoreFormulaParams.return_power);
            const changePct = coerceNumber(breakdown.change_pct);
            if (returnBase == null || returnPower == null || changePct == null) {
              return null;
            }
            return Math.pow(returnBase + (changePct / 100), returnPower);
          })();
      const computedAmountTerm = coerceNumber(breakdown.amount_term) != null
        ? coerceNumber(breakdown.amount_term)
        : (function () {
            const amountPower = coerceNumber(scoreFormulaParams.amount_power);
            const tradingValue = coerceNumber(breakdown.today_trading_value_100m);
            if (amountPower == null || tradingValue == null) {
              return null;
            }
            return Math.pow(Math.max(tradingValue, 0), amountPower);
          })();
      const computedMarcapTerm = coerceNumber(breakdown.marcap_term) != null
        ? coerceNumber(breakdown.marcap_term)
        : (function () {
            const marcapPower = coerceNumber(scoreFormulaParams.marcap_power);
            const marketCap = coerceNumber(breakdown.market_cap_100m);
            if (marcapPower == null || marketCap == null) {
              return null;
            }
            return Math.pow(Math.max(marketCap, 0), marcapPower);
          })();
      const computedCoreValue = coerceNumber(breakdown.core_value) != null
        ? coerceNumber(breakdown.core_value)
        : (function () {
            const amountTerm = computedAmountTerm;
            const marcapTerm = computedMarcapTerm;
            const surgeFactor = coerceNumber(breakdown.surge_factor);
            if (amountTerm == null || marcapTerm == null || surgeFactor == null || !(marcapTerm > 0)) {
              return null;
            }
            const returnTerm = computedReturnTerm;
            if (returnTerm == null) {
              return null;
            }
            return (amountTerm / marcapTerm) * returnTerm * surgeFactor;
          })();
      const computedLogTerm = coerceNumber(breakdown.log_term) != null
        ? coerceNumber(breakdown.log_term)
        : (function () {
            const coreValue = computedCoreValue;
            const logBase = coerceNumber(scoreFormulaParams.log_base);
            if (coreValue == null || logBase == null || !(coreValue > 0) || !(logBase > 0) || logBase === 1) {
              return null;
            }
            return Math.log(coreValue) / Math.log(logBase);
          })();
      function formatPoint(value, digits) {
        return value != null ? numberFormat(value, digits == null ? 2 : digits) + "점" : "-";
      }
      function formatMultiplier(value, digits) {
        return value != null ? numberFormat(value, digits == null ? 3 : digits) + "배" : "-";
      }
      function format100m(value) {
        return value != null ? numberFormat(value, 1) + "억" : "-";
      }
      function formatFormulaValue(value, digits) {
        return value != null ? numberFormat(value, digits == null ? 4 : digits) : "-";
      }
      function toScoreContributionPoint(value) {
        const number = coerceNumber(value);
        return number == null ? null : number;
      }
      const scoreLogBase = coerceNumber(scoreFormulaParams.log_base);
      const amountContributionPoint = computedAmountTerm != null && scoreLogBase != null && scoreLogBase > 0 && scoreLogBase !== 1 && computedAmountTerm > 0
        ? Math.log(computedAmountTerm) / Math.log(scoreLogBase)
        : null;
      const marcapContributionPoint = computedMarcapTerm != null && scoreLogBase != null && scoreLogBase > 0 && scoreLogBase !== 1 && computedMarcapTerm > 0
        ? -Math.log(computedMarcapTerm) / Math.log(scoreLogBase)
        : null;
      const returnContributionPoint = computedReturnTerm != null && scoreLogBase != null && scoreLogBase > 0 && scoreLogBase !== 1 && computedReturnTerm > 0
        ? Math.log(computedReturnTerm) / Math.log(scoreLogBase)
        : null;
      const surgeContributionPoint = coerceNumber(breakdown.surge_factor) != null && scoreLogBase != null && scoreLogBase > 0 && scoreLogBase !== 1 && coerceNumber(breakdown.surge_factor) > 0
        ? Math.log(coerceNumber(breakdown.surge_factor)) / Math.log(scoreLogBase)
        : null;
      const highBonusPoint = toScoreContributionPoint(breakdown.high_bonus);
      const scoreOContributionValues = [
        Math.abs(Number(amountContributionPoint || 0)),
        Math.abs(Number(marcapContributionPoint || 0)),
        Math.abs(Number(returnContributionPoint || 0)),
        Math.abs(Number(surgeContributionPoint || 0)),
        Math.abs(Number(highBonusPoint || 0)),
      ];
      const scoreOContributionDenom = scoreOContributionValues.reduce(function (acc, value) { return acc + value; }, 0);
      function scoreOContributionShare(value) {
        if (!(scoreOContributionDenom > 0)) {
          return "-";
        }
        return numberFormat((Math.abs(Number(value || 0)) / scoreOContributionDenom) * 100, 1) + "%";
      }
      const highStateText = breakdown.is_52w_high
        ? "52주 신고가"
        : (breakdown.is_20d_high ? "20일 신고가" : "신고가 아님");
      const todayItems = [
        { label: "당일 거래대금", value: format100m(breakdown.today_trading_value_100m), help: "해당 날짜 실제 거래대금" },
        { label: "20일 평균 거래대금", value: format100m(breakdown.avg_value_20d_100m), help: "직전 20거래일 평균 거래대금" },
        { label: "거래대금 증가 배수", value: formatMultiplier(breakdown.surge_ratio_raw, 2), help: "당일 거래대금 / 20일 평균 거래대금" },
        { label: "거래대금 증가 상한 반영", value: formatMultiplier(breakdown.surge_ratio_capped, 2), help: "상한 적용 후 실제 사용된 증가 배수" },
        { label: "거래대금 보정 계수", value: formatMultiplier(breakdown.surge_factor, 3), help: "증가 배수에 surge power를 적용한 today 점수 배수" },
        { label: "등락률 보정값", value: formatBreakdownNumber(computedReturnTerm, 6), help: "(return_base + 등락률)^return_power" },
        { label: "거래대금 항", value: formatBreakdownNumber(computedAmountTerm, 4), help: "거래대금^amount_power" },
        { label: "시가총액 항", value: formatBreakdownNumber(computedMarcapTerm, 4), help: "시가총액^marcap_power" },
        { label: "로그 전 원값", value: formatBreakdownNumber(computedCoreValue, 6), help: "(거래대금 항 / 시총 항) x 등락률 보정 x 거래대금 보정" },
        { label: "로그 점수", value: formatBreakdownNumber(computedLogTerm, 4), help: "log_base 기준 로그 변환값" },
        { label: "거래대금 점수 기여", value: formatPoint(amountContributionPoint, 2), help: "score_o 내부 기여 비중 " + scoreOContributionShare(amountContributionPoint) },
        { label: "시가총액 점수 기여", value: formatPoint(marcapContributionPoint, 2), help: "score_o 내부 기여 비중 " + scoreOContributionShare(marcapContributionPoint) },
        { label: "등락률 점수 기여", value: formatPoint(returnContributionPoint, 2), help: "score_o 내부 기여 비중 " + scoreOContributionShare(returnContributionPoint) },
        { label: "거래대금 증가 점수 기여", value: formatPoint(surgeContributionPoint, 2), help: "score_o 내부 기여 비중 " + scoreOContributionShare(surgeContributionPoint) },
        { label: "신고가 상태", value: highStateText, help: "52주 신고가 / 20일 신고가 / 비신고가 여부" },
        {
          label: "신고가 보너스/패널티",
          value: formatPoint(breakdown.high_bonus, 2),
          help: (breakdown.is_52w_high ? "52주 신고가 보너스 적용" : (breakdown.is_20d_high ? "20일 신고가 보너스 적용" : "비신고가 패널티 적용")) + " · score_o 내부 기여 비중 " + scoreOContributionShare(highBonusPoint),
        },
        { label: "최종 당일점수", value: formatPoint(breakdown.score_o, 2), help: "score_o" },
      ];
      const contributionValues = [
        Math.abs(Number(breakdown.contrib_today || 0)),
        Math.abs(Number(breakdown.contrib_1w || 0)),
        Math.abs(Number(breakdown.contrib_1m || 0)),
        Math.abs(Number(breakdown.contrib_3m || 0)),
      ];
      const contributionDenom = contributionValues.reduce(function (acc, value) { return acc + value; }, 0);
      function contributionShare(value) {
        if (!(contributionDenom > 0)) {
          return "-";
        }
        return numberFormat((Math.abs(Number(value || 0)) / contributionDenom) * 100, 1) + "%";
      }
      const weightItems = [
        {
          label: "당일점수 가중 기여",
          value: formatPoint(breakdown.contrib_today, 2),
          help: "score_o " + formatPoint(breakdown.score_o, 2) + " x 가중치 " + formatFormulaValue(breakdown.weight_today, 4) + " = 절대기여 비중 " + contributionShare(breakdown.contrib_today),
        },
        {
          label: "1주 평균 가중 기여",
          value: formatPoint(breakdown.contrib_1w, 2),
          help: "avg_1w " + formatPoint(breakdown.avg_1w, 2) + " x 가중치 " + formatFormulaValue(breakdown.weight_1w, 4) + " = 절대기여 비중 " + contributionShare(breakdown.contrib_1w),
        },
        {
          label: "1개월 평균 가중 기여",
          value: formatPoint(breakdown.contrib_1m, 2),
          help: "avg_1m " + formatPoint(breakdown.avg_1m, 2) + " x 가중치 " + formatFormulaValue(breakdown.weight_1m, 4) + " = 절대기여 비중 " + contributionShare(breakdown.contrib_1m),
        },
        {
          label: "3개월 평균 가중 기여",
          value: formatPoint(breakdown.contrib_3m, 2),
          help: "avg_3m " + formatPoint(breakdown.avg_3m, 2) + " x 가중치 " + formatFormulaValue(breakdown.weight_3m, 4) + " = 절대기여 비중 " + contributionShare(breakdown.contrib_3m),
        },
        { label: "가중합 기본점수", value: formatPoint(breakdown.composite, 2), help: "위 4개 가중 기여를 합친 composite" },
      ];
      const sortinoItems = [
        { label: "Sortino 정규화값", value: breakdown.sortino_norm != null ? numberFormat(breakdown.sortino_norm, 4) : "-", help: "0~1 구간으로 정규화된 추세 안정성" },
        { label: "Sortino 지수 강도", value: formatFormulaValue(breakdown.sortino_power, 4), help: "exp 계수로 쓰이는 sortino_power 파라미터" },
        { label: "Sortino 지수 입력값", value: breakdown.sortino_adjustment != null ? numberFormat(breakdown.sortino_adjustment, 4) : "-", help: "sortino_power x (sortino_norm - 0.6)" },
        { label: "Sortino 배수", value: formatMultiplier(breakdown.sortino_multiplier, 3), help: "composite에 곱하거나 나누는 최종 배수" },
        { label: "Sortino 반영 점수", value: formatPoint(breakdown.base_score_s, 2), help: "추세 가속/훼손 보정 전 base score_s" },
        { label: "추세 가속 보너스", value: formatPoint(breakdown.acceleration_bonus, 2), help: "짧은 구간 점수가 더 빠르게 강해질 때 가산" },
        { label: "추세 훼손 패널티", value: formatPoint(breakdown.trend_break_penalty, 2), help: "추세가 꺾일 때 차감" },
        { label: "최종 종합점수", value: formatPoint(breakdown.final_score, 2), help: "최종 score_s" },
      ];
      function buildParamItems(params, titlePrefix) {
        const entries = Object.keys(params || {}).map(function (key) {
          return {
            label: key,
            value: formatBreakdownNumber(params[key], 4),
            help: titlePrefix + " 파라미터",
          };
        });
        return entries;
      }
      function renderItems(title, items) {
        return h(
          "div",
          { className: "score-breakdown-section" },
          h("div", { className: "score-breakdown-title" }, title),
          h(
            "div",
            { className: "score-breakdown-table" },
            items.map(function (item) {
              return h(
                "div",
                { key: title + "-" + item.label, className: "score-breakdown-row" },
                h("div", { className: "score-breakdown-label" }, item.label),
                h("div", { className: "score-breakdown-value" }, item.value),
                h("div", { className: "score-breakdown-help" }, item.help)
              );
            })
          )
        );
      }
      return h(
        React.Fragment,
        null,
        h("div", { className: "summary-help score-breakdown-headline" }, stockName + " · " + endDate + " 기준 점수 계산표"),
        renderItems("1. 당일점수(score_o) 계산 요소", todayItems),
        renderItems("2. 종합점수 가중 기여도", weightItems),
        renderItems("3. Sortino 및 추세 보정", sortinoItems),
        renderItems("4. Today 점수 파라미터", buildParamItems(breakdown.score_formula_params, "Today")),
        renderItems("5. 종합점수 파라미터", buildParamItems(breakdown.final_score_formula_params, "종합점수")),
        renderItems("6. 추세 보정 파라미터", buildParamItems(breakdown.trend_adjustment_params, "추세 보정"))
      );
    }

    function buildTradingValueHistoryKey(row) {
      const code = String((row || {}).stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = (row || {}).resolved_name || (row || {}).stock_name || "";
      const endDate = themes.file_date || selectedDateValue || selectedFileDate || "";
      const cacheLoadedAt = (themes && themes.cache_loaded_at) ? String(themes.cache_loaded_at) : "";
      return [code, name, endDate, cacheLoadedAt, "trading"].join("|");
    }

    function closeTradingValueHistory() {
      tradingValueHistoryRequestSeqRef.current += 1;
      setTradingValueHistoryPopup({
        open: false,
        loading: false,
        error: "",
        row: null,
        payload: null,
      });
    }

    function openTradingValueHistory(row) {
      if (!row) {
        return;
      }
      const code = String(row.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      const name = row.resolved_name || row.stock_name || "";
      const endDate = themes.file_date || selectedDateValue || selectedFileDate || "";
      const cacheKey = buildTradingValueHistoryKey(row);
      const cached = tradingValueHistoryCacheRef.current[cacheKey];
      tradingValueHistoryRequestSeqRef.current += 1;
      const requestSeq = tradingValueHistoryRequestSeqRef.current;
      if (cached) {
        setTradingValueHistoryPopup({
          open: true,
          loading: false,
          error: "",
          row: row,
          payload: cached,
        });
        return;
      }
      setTradingValueHistoryPopup({
        open: true,
        loading: true,
        error: "",
        row: row,
        payload: null,
      });
      const params = new URLSearchParams();
      if (code && code !== "000000") {
        params.set("code", code);
      }
      if (name) {
        params.set("name", name);
      }
      if (endDate) {
        params.set("end_date", endDate);
      }
      params.set("days", "92");
      fetchJson("/api/themes/trading-value-history?" + params.toString(), { noCache: true })
        .then(function (payload) {
          tradingValueHistoryCacheRef.current[cacheKey] = payload;
          if (tradingValueHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setTradingValueHistoryPopup({
            open: true,
            loading: false,
            error: "",
            row: row,
            payload: payload,
          });
        })
        .catch(function (error) {
          if (tradingValueHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setTradingValueHistoryPopup({
            open: true,
            loading: false,
            error: error.message || String(error),
            row: row,
            payload: null,
          });
        });
    }

    function renderTradingValueHistory(value, row) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      if (!row) {
        return numberFormat(number, 0);
      }
      return h(
        "button",
        {
          type: "button",
          className: "today-score-cell today-score-button",
          title: "최근 두 달 거래대금 추이 보기",
          onClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            openTradingValueHistory(row);
          },
        },
        numberFormat(number, 0)
      );
    }

    function marketClassName(market) {
      const value = String(market || "").trim().toUpperCase();
      if (value === "KOSPI") {
        return "market-kospi";
      }
      if (value === "KOSDAQ") {
        return "market-kosdaq";
      }
      return "";
    }

    function openStockInTelegramSearch(row) {
      const stockName = String((row && (row.stock_name || row.resolved_name || row.name)) || "").trim();
      if (!stockName) {
        return;
      }
      const previousState = loadTelegramSearchState() || {};
      persistTelegramSearchState(Object.assign({}, previousState, {
        earningsQuery: stockName,
        earningsResults: [],
        earningsMessage: "",
        disclosureCategory: "earnings",
        disclosureNextOffsetId: 0,
        disclosureHasMore: false,
        financialTrend: null,
        financialTrendMessage: "",
        financialTrendExpanded: false,
        businessSegments: null,
        businessSegmentsMessage: "",
        stockOverview: null,
        stockOverviewMessage: "",
      }));
      stashTelegramStockNavigation(stockName);
      requestPageNavigation("telegram", { stockQuery: stockName, source: "themes" });
    }

    function closeKrEtfDetailPopup() {
      setKrEtfDetailPopup({ open: false, loading: false, error: "", row: null, payload: null });
    }

    async function openKrEtfDetailPopup(row) {
      const code = strictKrStockCode((row && row.stock_code) || "");
      if (!code) {
        return;
      }
      const requestSeq = krEtfDetailRequestSeqRef.current + 1;
      krEtfDetailRequestSeqRef.current = requestSeq;
      setKrEtfDetailPopup({ open: true, loading: true, error: "", row: row, payload: null });
      try {
        const payload = await fetchJson("/api/kr-etf/detail?code=" + encodeURIComponent(code), { noCache: true });
        if (krEtfDetailRequestSeqRef.current !== requestSeq) {
          return;
        }
        setKrEtfDetailPopup({ open: true, loading: false, error: "", row: row, payload: payload });
      } catch (err) {
        if (krEtfDetailRequestSeqRef.current !== requestSeq) {
          return;
        }
        setKrEtfDetailPopup({ open: true, loading: false, error: err.message || String(err), row: row, payload: null });
      }
    }

    function renderStockNameWithCode(row) {
      const stockEntryLabel = String((row || {}).entry_signal_label || "").trim();
      const signalType = String((row || {}).entry_signal_type || "").trim();
      const marketWarningLevel = String((row || {}).market_warning_level || "").trim();
      const marketWarningLabel = String((row || {}).market_warning_label || "").trim();
      const capturePlain = !!(row && row.__capture_plain);
      const stockCode = displayStockCode((row && row.stock_code) || "");
      const titleParts = [];
      if (stockEntryLabel) {
        titleParts.push("종목 신호 상태 · " + stockEntryLabel);
      }
      if (marketWarningLabel) {
        titleParts.push("시장 경고 상태 · " + marketWarningLabel);
      }
      return h(
        "div",
        {
          className: "theme-stock-name-cell"
            + (!capturePlain && row.entry_signal_active ? " entry-signal-stock signal-no_leverage" : "")
            + (!capturePlain && marketWarningLevel ? " market-warning-stock market-warning-" + marketWarningLevel : "")
            + (!capturePlain && signalType === "exit" ? " exit-signal-stock" : ""),
          title: titleParts.join("\n"),
        },
        h(
          React.Fragment,
          null,
          capturePlain
            ? h(
                React.Fragment,
                null,
                h("span", { className: "theme-capture-stock-label" }, row.stock_name || "-"),
                stockCode ? h("span", { className: "theme-stock-code-inline muted-code " + (marketClassName(row.market) || "") }, "(" + stockCode + ")") : null
              )
            : h(
                React.Fragment,
                null,
                h(
                  "button",
                  {
                    type: "button",
                    className: "tradingview-stock-link inline-button",
                    title: isEtfUniverse
                      ? "국내 ETF 상세 보기"
                      : "종목정보 검색기에서 " + (row.stock_name || "-") + " 열기",
                    onClick: function (event) {
                      event.preventDefault();
                      event.stopPropagation();
                      if (isEtfUniverse) {
                        openKrEtfDetailPopup(row);
                        return;
                      }
                      openStockInTelegramSearch(row);
                    },
                  },
                  row.stock_name || "-"
                ),
                stockCode ? h("span", { className: "theme-stock-code-inline " + (marketClassName(row.market) || "") }, "(" + stockCode + ")") : null
              )
        )
      );
    }

    function renderDataBar(value, maxAbs, digits) {
      const number = Number(value || 0);
      const width = maxAbs > 0 ? Math.min(Math.abs(number) / maxAbs * 100, 100) : 0;
      return h(
        "div",
        { className: "data-bar-cell" },
        h("span", {
          className: "data-bar-fill" + (number < 0 ? " negative" : ""),
          style: { width: width + "%" },
        }),
        h("span", { className: "data-bar-value" }, numberFormat(number, digits))
      );
    }

    function renderKrEtfDetailPopup() {
      if (!krEtfDetailPopup.open) {
        return null;
      }
      const row = krEtfDetailPopup.row || {};
      const payload = krEtfDetailPopup.payload || {};
      const holdings = ensureArray(payload.holdings).slice().sort(function (a, b) {
        return Number(b.weight_pct || 0) - Number(a.weight_pct || 0);
      });
      const title = String(payload.name || row.stock_name || "-");
      const code = strictKrStockCode(payload.symbol || row.stock_code || "");
      const trackingIndex = String(payload.tracking_index_name || row.tracking_index_name || row.manual_sector || "").trim();
      return h(
        "div",
        { className: "modal-backdrop score-history-backdrop", onClick: closeKrEtfDetailPopup },
        h(
          "div",
          { className: "modal-panel score-history-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "ETF DETAIL"),
              h("h2", null, title + (code ? " (" + code + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeKrEtfDetailPopup }, "닫기")
          ),
          krEtfDetailPopup.loading
            ? h(LoadingBlock, { compact: true, title: "ETF 상세 로드 중", label: "AUM / 보유비중" })
            : krEtfDetailPopup.error
              ? h("div", { className: "notice-box error" }, krEtfDetailPopup.error)
              : h(
                  React.Fragment,
                  null,
                  h(
                    "div",
                    { className: "summary-grid summary-grid-small score-history-summary" },
                    h(SummaryCard, { label: "추종 지수", value: trackingIndex || "-", help: payload.source || "" }),
                    h(SummaryCard, { label: "AUM", value: payload.aum_text || formatMoneyByCurrency(payload.aum, payload.currency || "KRW", true), help: payload.currency || "KRW" }),
                    h(SummaryCard, { label: "1년 순유입", value: formatMoneyByCurrency(payload.flow_1y, payload.currency || "KRW", true), help: payload.flow_1y_text || "-" }),
                    h(SummaryCard, { label: "보유 종목 수", value: numberFormat(payload.holding_count, 0) + "개", help: "보유비중 상위 표시" })
                  ),
                  h(
                    "div",
                    { className: "score-history-list" },
                    holdings.length
                      ? holdings.slice(0, 20).map(function (item, index) {
                          return h(
                            "div",
                            { key: (item.symbol || item.name || "") + "-" + index, className: "score-history-item" },
                            h("strong", null, numberFormat(index + 1, 0) + ". " + (item.name || item.symbol || "-")),
                            h("span", null, item.symbol || "-"),
                            h("span", { className: "metric-up-light" }, formatPercent(item.weight_pct, 2)),
                            h("span", null, item.shares ? numberFormat(item.shares, 0) + "주" : "")
                          );
                        })
                      : h(EmptyState, { compact: true, message: "보유 종목 데이터를 찾지 못했습니다." })
                  )
                )
        )
      );
    }

    function openSectorMarketCapChart(sector) {
      const targetSector = String(sector || "").trim();
      if (!targetSector || targetSector === "all") {
        setSectorFilter("all");
        return;
      }
      const sectorRows = rows.filter(function (row) {
        return String(row.manual_sector || "").trim() === targetSector;
      });
      setSectorFilter(targetSector);
      sectorMarketCapRequestSeqRef.current += 1;
      const requestSeq = sectorMarketCapRequestSeqRef.current;
      setSectorMarketCapPopup({
        open: true,
        sector: targetSector,
        loading: true,
        error: "",
        payload: null,
      });
      postJson("/api/themes/sector-market-cap-chart", {
        sector: targetSector,
        months: 3,
        stocks: sectorRows.map(function (row) {
          return {
            code: row.stock_code || "",
            name: row.resolved_name || row.stock_name || "",
          };
        }),
      }).then(function (payload) {
        if (sectorMarketCapRequestSeqRef.current !== requestSeq) {
          return;
        }
        setSectorMarketCapPopup({
          open: true,
          sector: targetSector,
          loading: false,
          error: "",
          payload: payload,
        });
      }).catch(function (error) {
        if (sectorMarketCapRequestSeqRef.current !== requestSeq) {
          return;
        }
        setSectorMarketCapPopup({
          open: true,
          sector: targetSector,
          loading: false,
          error: error.message || String(error),
          payload: null,
        });
      });
    }

    function closeSectorMarketCapChart() {
      sectorMarketCapRequestSeqRef.current += 1;
      setSectorMarketCapPopup({
        open: false,
        sector: "",
        loading: false,
        error: "",
        payload: null,
      });
    }

    function updateStockSector(stockName, value) {
      const targetRow = rows.find(function (row) { return row.stock_name === stockName; }) || {};
      setSectorState(function (current) {
        const nextMap = Object.assign({}, current.stockMap || {});
        const rawValue = String(value || "");
        const normalized = rawValue.trim();
        nextMap[stockName] = rawValue;
        if (targetRow.stock_code) {
          nextMap[targetRow.stock_code] = rawValue;
        }
        return {
          stockMap: nextMap,
          sectors: ensureArray(current.sectors),
        };
      });
    }

    function commitStockSector(row, value) {
      const normalized = String(value || "").trim();
      const previous = String(row.manual_sector || "").trim();
      if (normalized === previous) {
        return;
      }
      updateStockSector(row.stock_name, normalized);
      rememberSectorName(normalized);
      const requestSeq = sectorSaveSeqRef.current + 1;
      sectorSaveSeqRef.current = requestSeq;
      setSectorSaveState({ status: "saving", message: "섹터 자동 저장 중..." });
      postJson("/api/sector-db/assign", {
        stock_code: row.stock_code || null,
        stock_name: row.stock_name || "",
        sector: normalized,
      })
        .then(function () {
          if (sectorSaveSeqRef.current === requestSeq) {
            setSectorSaveState({ status: "saved", message: "섹터 DB 저장 완료" });
          }
        })
        .catch(function (err) {
          if (sectorSaveSeqRef.current === requestSeq) {
            setSectorSaveState({ status: "error", message: "자동 저장 실패: " + (err.message || String(err)) });
          }
        });
    }

    function commitStockNote(row, value) {
      const normalized = String(value || "").trim();
      const previous = String(row.note || "").trim();
      const noteKey = noteKeyForRow(row);
      if (normalized === previous) {
        return Promise.resolve();
      }
      if (noteKey) {
        setNoteOverrides(function (current) {
          return Object.assign({}, current, { [noteKey]: normalized });
        });
      }
      setNoteSaveState({ status: "saving", message: "비고 SQL에 저장 중..." });
      return postJson("/api/themes/note", {
        file_date: selectedDateValue || null,
        stock_code: row.stock_code || null,
        stock_name: row.stock_name || "",
        note: normalized,
      })
        .then(function (payload) {
          setNoteSaveState({
            status: "saved",
            message: "비고 SQL 저장 완료",
          });
          refreshThemesData();
          return payload;
        })
        .catch(function (err) {
          setNoteSaveState({ status: "error", message: "비고 저장 실패: " + (err.message || String(err)) });
          throw err;
        });
    }

    function refreshLeaderCalendar() {
      if (calendarRefreshing) {
        return;
      }
      setCalendarRefreshing(true);
      invalidateApiCache(function (key) {
        return key.indexOf("/api/theme-sector-calendar") === 0;
      });
      const refreshCalendarUrl = typeof themesPageModule.buildSectorCalendarUrl === "function"
        ? themesPageModule.buildSectorCalendarUrl({ calendarScoreBasis: calendarScoreBasis, universeMode: universeMode, forceRefresh: true, refreshToken: Date.now() })
        : "/api/theme-sector-calendar?min_score=0&limit=60&score_basis=" + encodeURIComponent(calendarScoreBasis) + universeQuery + "&force_refresh=true&refresh=" + Date.now();
      fetchJson(refreshCalendarUrl, { noCache: true })
        .then(function (payload) {
          calendarRequest.refresh();
        })
        .catch(function () {
          return calendarRequest.refresh();
        })
        .finally(function () {
          setCalendarRefreshing(false);
        });
    }

    function copyElementToClipboard(target, setCopyState, options) {
      const captureOptions = options || {};
      function finishWithoutTarget() {
        if (typeof captureOptions.afterFinish === "function") {
          captureOptions.afterFinish();
        }
      }
      if (!target) {
        setCopyState({ status: "error", message: "캘린더 복사 이미지를 만들지 못했습니다." });
        finishWithoutTarget();
        return;
      }
      if (!window.html2canvas) {
        setCopyState({ status: "error", message: "캘린더 캡쳐 이미지를 복사하지 못했습니다." });
        finishWithoutTarget();
        return;
      }
      setCopyState({ status: "working", message: "캡쳐 복사 중..." });
      const scale = captureOptions.scale || Math.max(2, Math.min(3, window.devicePixelRatio || 2));
      const temporaryClass = captureOptions.temporaryClass || "";
      const settleMs = Number(captureOptions.settleMs || 0);
      function finishCapture() {
        if (temporaryClass) {
          target.classList.remove(temporaryClass);
        }
        if (typeof captureOptions.afterFinish === "function") {
          captureOptions.afterFinish();
        }
      }
      if (temporaryClass) {
        target.classList.add(temporaryClass);
      }
      const waitForLayout = function () {
        return new Promise(function (resolve) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              if (settleMs > 0) {
                window.setTimeout(resolve, settleMs);
              } else {
                resolve();
              }
            });
          });
        });
      };
      waitForLayout().then(function () {
        return window.html2canvas(target, {
          backgroundColor: "#ffffff",
          scale: scale,
          useCORS: true,
          logging: false,
          windowWidth: Math.max(document.documentElement.clientWidth || 0, target.scrollWidth || 0),
          windowHeight: Math.max(document.documentElement.clientHeight || 0, target.scrollHeight || 0),
          ignoreElements: function (element) {
            return element && element.getAttribute && element.getAttribute("data-capture-ignore") === "true";
          },
        });
      }).then(function (canvas) {
        const pixelMessage = numberFormat(canvas.width, 0) + " x " + numberFormat(canvas.height, 0) + "px";
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              reject(new Error("이미지 생성에 실패했습니다."));
              return;
            }
            resolve({ blob: blob, pixelMessage: pixelMessage });
          }, "image/png");
        });
      }).then(function (result) {
        return copyImageBlobWithFallback(result.blob).then(function (copyResult) {
          return { pixelMessage: result.pixelMessage, method: copyResult.method };
        });
      }).then(function (result) {
        finishCapture();
        setCopyState({ status: "saved", message: "클립보드에 복사 완료 · " + result.pixelMessage + (result.method === "system" ? " · 시스템 클립보드" : "") });
        window.setTimeout(function () {
          setCopyState(function (current) {
            return current.status === "saved" ? { status: "", message: "" } : current;
          });
        }, 3200);
      }).catch(function (error) {
        finishCapture();
        setCopyState({ status: "error", message: error.message || "캡쳐 복사에 실패했습니다." });
      });
    }

    function copyLeaderCalendarToClipboard() {
      copyElementToClipboard(leaderCalendarRef.current, setCalendarCopyState);
    }

    function copyManualSummaryToClipboard() {
      copyElementToClipboard(manualSummaryRef.current, setManualSummaryCopyState);
    }

    function copyScoreTableToClipboard() {
      setCaptureStageReady(true);
      window.setTimeout(function () {
        if (!scoreTableCaptureRef.current) {
          setCaptureStageReady(false);
          setScoreTableCopyState({ status: "error", message: "캡쳐용 이미지를 만들지 못했습니다." });
          return;
        }
        copyElementToClipboard(scoreTableCaptureRef.current, setScoreTableCopyState, {
          scale: 4,
          temporaryClass: "capture-ultra",
          settleMs: 80,
          afterFinish: function () {
            window.setTimeout(function () { setCaptureStageReady(false); }, 300);
          },
        });
      }, 80);
    }

    function renderLeaderTimelineContent(options) {
      const captureMode = options && options.capture;
      if (!visibleCalendarDays.length) {
        return EmptyState({ message: "오늘의 주도주에서 섹터를 지정하면 날짜별 흐름이 여기에 표시됩니다.", compact: true });
      }
      return h(
        "div",
        { className: "leader-timeline-wrap" + (captureMode ? " capture-mode" : "") },
        h(
          "div",
          {
            className: "leader-timeline",
            style: { gridTemplateColumns: "86px repeat(" + visibleCalendarDays.length + ", minmax(54px, 1fr))" },
          },
          [
            h("div", { key: "corner", className: "leader-timeline-corner" }, "순위"),
          ].concat(visibleCalendarDays.map(function (day) {
            const isSelected = (selectedFileDate || themes.file_date || "") === day.date;
            const top10Avg = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
            const top10LabelPrefix = calendarScoreBasis === "score_o" ? "Top10 당일점수 평균 " : "Top10 종합점수 평균 ";
            const top10Label = Number.isFinite(top10Avg) ? top10LabelPrefix + numberFormat(top10Avg, 1) : top10LabelPrefix + "-";
            return h("button", {
              key: "head-" + day.date,
              className: "leader-timeline-date" + (isSelected ? " active" : ""),
              type: "button",
              title: day.date + " 주도 섹터 흐름\n" + top10Label,
              onClick: captureMode ? null : function () { selectCalendarDate(day.date, "all"); },
            }, [
              h("span", { key: "d", className: "leader-timeline-date-label" }, formatDateLabel(day.date)),
              h("span", { key: "a", className: "leader-timeline-date-score" }, Number.isFinite(top10Avg) ? numberFormat(top10Avg, 1) : "-"),
            ]);
          })).concat([0, 1, 2, 3, 4].flatMap(function (rankIndex) {
            return [
              h("div", { key: "rank-" + rankIndex, className: "leader-timeline-rank" }, (rankIndex + 1) + "위"),
            ].concat(visibleCalendarDays.map(function (day, dayIndex) {
              const linkedDay = Object.assign({}, day, {
                prevDay: visibleCalendarDays[dayIndex - 1],
                nextDay: visibleCalendarDays[dayIndex + 1],
              });
              const ranked = ensureArray(day.sectors).slice(0, 5)[rankIndex];
              if (!ranked) {
                return h("button", {
                  key: "empty-" + rankIndex + "-" + day.date,
                  type: "button",
                  className: "leader-timeline-cell empty-click",
                  title: day.date + " 주도주 파일 열기",
                  onClick: captureMode ? null : function () { selectCalendarDate(day.date, "all"); },
                });
              }
              return h(
                "div",
                { key: ranked.sector + "-" + rankIndex + "-" + day.date, className: "leader-timeline-cell" },
                h(
                  "button",
                  {
                    type: "button",
                    className: calendarRankCellClass(linkedDay, rankIndex, ranked.sector),
                    style: calendarRankCellStyle(linkedDay, rankIndex, ranked.sector, colorForKey(ranked.sector)),
                    title: ranked.sector + "\n섹터강도 " + numberFormat(ranked.sector_strength, 1) + " / 순위파워 " + numberFormat(ranked.rank_power, 1) + "\n평균 " + (calendarScoreBasis === "score_o" ? "당일점수 " : "종합점수 ") + numberFormat(ranked.avg_score, 1) + " / 신뢰도 " + (ranked.confidence || "-") + "\nTop20 " + numberFormat(Number(ranked.top20_ratio || 0) * 100, 0) + "% (" + numberFormat(ranked.top20_count, 0) + "개) / Top50 " + numberFormat(Number(ranked.top50_ratio || 0) * 100, 0) + "% (" + numberFormat(ranked.top50_count, 0) + "개)\n거래집중도 " + numberFormat(Number(ranked.turnover_ratio || 0) * 100, 2) + "% / 거래대금 " + numberFormat(ranked.trading_value_100m, 0) + "억\n대표주: " + ensureArray(ranked.leaders).join(", "),
                    onClick: captureMode ? null : function () { selectCalendarDate(day.date, ranked.sector); },
                  },
                  h("span", null, ranked.sector)
                )
              );
            }));
          }))
        ),
        h(
          "div",
          { className: "leader-timeline-legend" },
          calendarTopSectors.map(function (sector) {
            return h(
              "button",
              {
                key: sector,
                type: "button",
                className: "theme-sector-chip",
                onClick: captureMode ? null : function () { setSectorFilter(sector); },
              },
              h("span", { className: "theme-sector-dot", style: { background: colorForKey(sector) } }),
              h("span", { className: "theme-sector-chip-name" }, sector)
            );
          })
        )
      );
    }

    function rememberSectorName(value) {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }
      setSectorState(function (current) {
        if (ensureArray(current.sectors).indexOf(normalized) >= 0) {
          return current;
        }
        return {
          stockMap: Object.assign({}, current.stockMap || {}),
          sectors: ensureArray(current.sectors).concat([normalized]),
        };
      });
    }

    function selectCalendarDate(date, sector) {
      if (!date) {
        return;
      }
      setSelectedFileDate(date);
      setSectorFilter(sector || "all");
      setReloadMessage("");
    }

    function selectFileDate(date) {
      if (!date || !availableDateMap[date]) {
        return;
      }
      setSelectedFileDate(date);
      setSectorFilter("all");
      setReloadMessage("");
    }

    function reloadThemeExcel() {
      if (reloadingExcel) {
        return;
      }
      setReloadingExcel(true);
      setReloadMessage("");
      setReloadStartedAt(Date.now());
      setReloadElapsedSec(0);
      postJson("/api/themes/reload", {
        file_date: selectedFileDate || themes.file_date || null,
        min_score: 0,
        recent_limit: 20,
        reload_all: false,
      }).then(function (payload) {
        if (payload && payload.file_date) {
          setSelectedFileDate(payload.file_date);
        }
        if (payload && payload.fallback_reason === "requested_file_missing") {
          setReloadMessage("선택했던 " + (payload.requested_file_date || "날짜") + " 파일이 없어 " + payload.file_date + " 파일로 다시 불러왔습니다.");
        } else if (payload && payload.score_average_update) {
          const averageUpdate = payload.score_average_update;
          setReloadMessage(
            "점수 평균값 업데이트를 완료했습니다. "
              + formatNumber(averageUpdate.updated_rows || 0, 0)
              + "개 행 / 소스 "
              + formatNumber(averageUpdate.source_files || 0, 0)
              + "개 파일 / DB 변경 "
              + formatNumber(averageUpdate.db_changed_files || 0, 0)
              + "개"
          );
        } else if (payload && payload.direct_load_script) {
          setReloadMessage("오늘자 데이터 계산 결과를 기준으로 다시 불러왔습니다.");
        } else {
          setReloadMessage("SQL 데이터를 기준으로 화면을 새로고침했습니다.");
        }
        return refreshThemesData();
      }).catch(function (error) {
        setReloadMessage(error.message || "오늘자 데이터 로드 중 문제가 발생했습니다.");
      }).finally(function () {
        setReloadingExcel(false);
        setReloadStartedAt(0);
      });
    }

    function buildTodayThemeExcel() {
      if (reloadingExcel) {
        return;
      }
      setReloadingExcel(true);
      setReloadMessage("");
      setReloadStartedAt(Date.now());
      setReloadElapsedSec(0);
      postJson("/api/themes/build-today-data", {
        min_score: 0,
        recent_limit: 20,
      }).then(function (payload) {
        if (payload && payload.file_date) {
          setSelectedFileDate(payload.file_date);
        }
        if (payload && payload.today_excel_build && payload.today_excel_build.mode === "sql_cached") {
          setReloadMessage("오늘자 데이터가 SQL 캐시 기준으로 이미 반영되어 있어 바로 불러왔습니다.");
        } else {
          setReloadMessage("오늘자 데이터를 새로 계산하고 SQL과 캐시를 갱신했습니다.");
        }
        return refreshThemesData();
      }).catch(function (error) {
        setReloadMessage(error.message || "오늘자 데이터 생성/로드 중 문제가 발생했습니다.");
      }).finally(function () {
        setReloadingExcel(false);
        setReloadStartedAt(0);
      });
    }

    function rebuildSelectedThemeDate() {
      const targetDate = String(selectedDateValue || "").trim();
      if (!targetDate || reloadingExcel || rebuildingSelectedDate) {
        return;
      }
      if (!window.confirm(targetDate + " 데이터를 원천에서 다시 받아 계산할까요?\n새 계산이 성공한 경우에만 기존 날짜 데이터가 교체됩니다.")) {
        return;
      }
      setRebuildingSelectedDate(true);
      setReloadMessage(targetDate + " 데이터를 다시 확인하고 있습니다.");
      postJson("/api/themes/rebuild-date", {
        file_date: targetDate,
        min_score: 0,
        recent_limit: 20,
      }).then(function (payload) {
        const rebuilt = payload && payload.selected_date_rebuild ? payload.selected_date_rebuild : {};
        const rebuiltDate = rebuilt.date || payload.file_date || targetDate;
        setSelectedFileDate(rebuiltDate);
        setReloadMessage(
          rebuiltDate + " 데이터를 다시 계산했습니다. "
            + formatNumber(rebuilt.rows || 0, 0) + "개 종목을 SQL과 캐시에 반영했습니다."
        );
        return refreshThemesData(true);
      }).catch(function (error) {
        setReloadMessage(error.message || targetDate + " 데이터 재생성 중 문제가 발생했습니다.");
      }).finally(function () {
        setRebuildingSelectedDate(false);
      });
    }

    function renderScoreHistoryPopup() {
      if (!scoreHistoryPopup.open) {
        return null;
      }
      const payload = scoreHistoryPopup.payload || {};
      const popupRow = scoreHistoryPopup.row || {};
      const historyRows = ensureArray(payload.rows);
      const summary = payload.summary || {};
      const stockName = payload.stock_name || popupRow.resolved_name || popupRow.stock_name || "종목";
      const stockCode = payload.stock_code || popupRow.stock_code || "";
      const isHover = scoreHistoryPopup.mode === "hover";
      const activeTab = scoreHistoryPopup.activeTab === "breakdown" ? "breakdown" : "trend";
      const latestBreakdown = summary.latest_breakdown || (historyRows.length ? historyRows[historyRows.length - 1].breakdown : null);
      const content = scoreHistoryPopup.loading
        ? h(LoadingBlock, { compact: true, title: "점수 변동 추이 로드 중", label: "최근 1년 주도주 파일 확인" })
        : scoreHistoryPopup.error
          ? h("div", { className: "notice-box error" }, scoreHistoryPopup.error)
          : historyRows.length
            ? h(
                React.Fragment,
                null,
                isHover
                  ? h(
                      "div",
                      { className: "score-history-hover-summary" },
                      h("span", null, "최근 종합점수 " + numberFormat(summary.latest_score, 2)),
                      h("span", null, "평균 종합점수 " + numberFormat(summary.avg_score, 2)),
                      h("span", null, numberFormat(summary.count, 0) + "회")
                    )
                  : null,
                isHover
                  ? null
                  : h(
                      "div",
                      { className: "segmented-control score-history-tabs" },
                      h("button", { type: "button", className: activeTab === "trend" ? "active" : "", onClick: function () { setScoreHistoryActiveTab("trend"); } }, "점수 추이"),
                      h("button", { type: "button", className: activeTab === "breakdown" ? "active" : "", onClick: function () { setScoreHistoryActiveTab("breakdown"); } }, "점수 분해")
                    ),
                activeTab === "breakdown" && !isHover
                  ? renderScoreBreakdownContent(latestBreakdown, payload, popupRow)
                  : h(
                      React.Fragment,
                      null,
                      h(ScoreHistoryChart, {
                        rows: historyRows,
                        hasMore: scoreHistoryPopup.hasMore,
                        loadingMore: scoreHistoryPopup.loadingMore,
                        onNeedMore: loadMoreScoreHistory,
                      }),
                      scoreHistoryPopup.loadingMore
                        ? h("div", { className: "summary-help score-history-subchart-label" }, "이전 구간 로드 중")
                        : null,
                      h(
                        "div",
                        { className: "score-history-list" },
                        historyRows.slice().reverse().map(function (item) {
                          return h(
                            "div",
                            { key: item.date, className: "score-history-item" },
                            h("strong", null, item.date),
                            h("span", null, "점수 " + numberFormat(item.score, 2)),
                            h("span", { className: Number(item.change_pct || 0) >= 0 ? "metric-up-light" : "metric-down-light" }, formatPercent(item.change_pct, 2)),
                            h("span", null, numberFormat(item.rank, 0) + "위")
                          );
                        })
                      )
                    )
              )
            : EmptyState({ message: "최근 1년 안에 해당 종목의 점수 이력이 없습니다.", compact: true });
      if (isHover) {
        const position = scoreHistoryPopup.position || { left: 16, top: 16 };
        return h(
          "div",
          {
            className: "score-history-hover-card",
            style: { left: position.left + "px", top: position.top + "px" },
            onMouseEnter: keepScoreHistoryHoverOpen,
            onMouseLeave: scheduleScoreHistoryHoverClose,
          },
          h(
            "div",
            { className: "score-history-hover-head" },
            h("strong", null, stockName),
            stockCode ? h("span", null, stockCode) : null
          ),
          h("div", { className: "score-history-modal-body" }, content)
        );
      }
      return h(
        "div",
        {
          className: "modal-backdrop score-history-backdrop",
          onClick: closeScoreHistory,
        },
        h(
          "div",
          {
            className: "modal-panel score-history-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Score Trend"),
              h("h2", null, stockName + (stockCode ? " (" + stockCode + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeScoreHistory }, "닫기")
          ),
          h("div", { className: "score-history-modal-body" }, content)
        )
      );
    }

    function renderTradingValueHistoryPopup() {
      if (!tradingValueHistoryPopup.open) {
        return null;
      }
      const payload = tradingValueHistoryPopup.payload || {};
      const popupRow = tradingValueHistoryPopup.row || {};
      const historyRows = ensureArray(payload.rows);
      const summary = payload.summary || {};
      const stockName = payload.stock_name || popupRow.resolved_name || popupRow.stock_name || "종목";
      const stockCode = payload.stock_code || popupRow.stock_code || "";
      const content = tradingValueHistoryPopup.loading
        ? h(LoadingBlock, { compact: true, title: "거래대금 추이 로드 중", label: "최근 두 달 주도주 파일 확인" })
        : tradingValueHistoryPopup.error
          ? h("div", { className: "notice-box error" }, tradingValueHistoryPopup.error)
          : historyRows.length
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "summary-grid summary-grid-small score-history-summary" },
                  h(SummaryCard, { label: "기간", value: (payload.start_date || "").slice(5) + " ~ " + (payload.end_date || "").slice(5), help: "최근 두 달" }),
                  h(SummaryCard, { label: "최근 거래대금", value: numberFormat(summary.latest_trading_value_100m, 1) + "억", help: "선택 기준일" }),
                  h(SummaryCard, { label: "평균 거래대금", value: numberFormat(summary.avg_trading_value_100m, 1) + "억", help: numberFormat(summary.count, 0) + "일" }),
                  h(SummaryCard, { label: "최대 거래대금", value: numberFormat(summary.max_trading_value_100m, 1) + "억", help: "기간 내 최고" })
                ),
                h(TradingValueHistoryChart, { rows: historyRows }),
                h(
                  "div",
                  { className: "score-history-list" },
                  historyRows.slice().reverse().map(function (item) {
                    return h(
                      "div",
                      { key: item.date, className: "score-history-item" },
                      h("strong", null, item.date),
                      h("span", null, "거래대금 " + numberFormat(item.trading_value_100m, 1) + "억"),
                      h("span", { className: Number(item.change_pct || 0) >= 0 ? "metric-up-light" : "metric-down-light" }, formatPercent(item.change_pct, 2)),
                      h("span", null, numberFormat(item.rank, 0) + "위")
                    );
                  })
                )
              )
            : EmptyState({ message: "최근 두 달 안에 해당 종목의 거래대금 이력이 없습니다.", compact: true });
      return h(
        "div",
        {
          className: "modal-backdrop score-history-backdrop",
          onClick: closeTradingValueHistory,
        },
        h(
          "div",
          {
            className: "modal-panel score-history-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "TRADING VALUE TREND"),
              h("h2", null, stockName + (stockCode ? " (" + stockCode + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeTradingValueHistory }, "닫기")
          ),
          h("div", { className: "score-history-modal-body" }, content)
        )
      );
    }

    function closeTradingViewPopup() {
      stockChartRequestSeqRef.current += 1;
      setTradingViewPopup({ open: false, row: null, symbol: "", label: "", loading: false, error: "", data: null, targetHistory: null, openingExternal: false, externalMessage: "" });
    }

    function openStockChartPopup(row, symbol, label) {
      const chartRow = row || {};
      const code = String(chartRow.stock_code || chartRow.code || "").replace(/\D/g, "").padStart(6, "0");
      const stockName = chartRow.stock_name || chartRow.resolved_name || label || "";
      const cacheKey = code && code !== "000000" ? code : stockName;
      stockChartRequestSeqRef.current += 1;
      const requestSeq = stockChartRequestSeqRef.current;
      setTradingViewPopup({
        open: true,
        row: chartRow,
        symbol: symbol || "",
        label: label || stockName || "-",
        loading: true,
        error: "",
        data: null,
        targetHistory: null,
        openingExternal: false,
        externalMessage: "",
      });
      if (cacheKey && CHART_PREVIEW_CACHE[cacheKey] && TARGET_HISTORY_CACHE[cacheKey]) {
        setTradingViewPopup({
          open: true,
          row: chartRow,
          symbol: symbol || "",
          label: label || stockName || "-",
          loading: false,
          error: "",
          data: CHART_PREVIEW_CACHE[cacheKey],
          targetHistory: TARGET_HISTORY_CACHE[cacheKey],
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
      const targetParams = new URLSearchParams();
      if (code && code !== "000000") {
        targetParams.set("code", code);
      }
      if (stockName) {
        targetParams.set("name", stockName);
      }
      targetParams.set("months", "12");
      Promise.all([
        (cacheKey && CHART_PREVIEW_CACHE[cacheKey])
          ? Promise.resolve(CHART_PREVIEW_CACHE[cacheKey])
          : fetchJson("/api/stocks/chart-preview?" + params.toString()),
        (cacheKey && TARGET_HISTORY_CACHE[cacheKey])
          ? Promise.resolve(TARGET_HISTORY_CACHE[cacheKey])
          : fetchJson("/api/stocks/wisereport-targets?" + targetParams.toString()).catch(function () { return null; }),
      ])
        .then(function (results) {
          const payload = results[0];
          const targetHistory = results[1];
          if (cacheKey) {
            CHART_PREVIEW_CACHE[cacheKey] = payload;
            TARGET_HISTORY_CACHE[cacheKey] = targetHistory;
          }
          if (stockChartRequestSeqRef.current !== requestSeq) {
            return;
          }
          setTradingViewPopup({
            open: true,
            row: chartRow,
            symbol: symbol || "",
            label: label || stockName || "-",
            loading: false,
            error: "",
            data: payload,
            targetHistory: targetHistory,
            openingExternal: false,
            externalMessage: "",
          });
        })
        .catch(function (error) {
          if (stockChartRequestSeqRef.current !== requestSeq) {
            return;
          }
          setTradingViewPopup({
            open: true,
            row: chartRow,
            symbol: symbol || "",
            label: label || stockName || "-",
            loading: false,
            error: error.message || String(error),
            data: null,
            targetHistory: null,
            openingExternal: false,
            externalMessage: "",
          });
        });
    }

    function openPopupStockInTradingView() {
      const row = tradingViewPopup.row || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const label = tradingViewPopup.label || row.stock_name || row.resolved_name || "";
      setTradingViewPopup(function (current) {
        return Object.assign({}, current, { openingExternal: true, externalMessage: "" });
      });
      postJson("/api/tradingview/open", {
        stock_code: code && code !== "000000" ? code : null,
        stock_name: label || null,
      }).then(function (payload) {
        setTradingViewPopup(function (current) {
          return Object.assign({}, current, {
            openingExternal: false,
            externalMessage: (payload && payload.message) || "TradingView 앱에서 열었습니다.",
          });
        });
      }).catch(function (error) {
        setTradingViewPopup(function (current) {
          return Object.assign({}, current, {
            openingExternal: false,
            externalMessage: "TradingView 실행 실패: " + (error.message || String(error)),
          });
        });
      });
    }

    function renderTradingViewPopup() {
      if (!tradingViewPopup.open) {
        return null;
      }
      const row = tradingViewPopup.row || {};
      const code = String(row.stock_code || row.code || "").replace(/\D/g, "").padStart(6, "0");
      const label = tradingViewPopup.label || row.stock_name || row.resolved_name || "-";
      const targetHistory = tradingViewPopup.targetHistory || null;
      const targetLatest = targetHistory && targetHistory.latest ? targetHistory.latest : null;
      const latestReports = latestTargetReportRows(targetHistory);
      return h(
        "div",
        {
          className: "modal-backdrop theme-stock-chart-backdrop",
          onClick: closeTradingViewPopup,
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
                onClick: openPopupStockInTradingView,
                disabled: tradingViewPopup.openingExternal,
              }, tradingViewPopup.openingExternal ? "여는 중..." : "TradingView 앱에서 열기"),
              h("button", { type: "button", className: "mini-button", onClick: closeTradingViewPopup }, "닫기")
            )
          ),
          tradingViewPopup.externalMessage
            ? h("div", { className: "summary-help theme-stock-chart-message" }, tradingViewPopup.externalMessage)
            : null,
          targetLatest
            ? h(
                "div",
                { className: "telegram-stock-overview-target-meta theme-stock-target-meta" },
                Number.isFinite(Number(targetHistory && targetHistory.report_count))
                  ? h("span", { className: "telegram-stock-overview-target-pill" }, "리포트 " + numberFormat(targetHistory.report_count, 0) + "건")
                  : null,
                Number.isFinite(Number(targetLatest.gap_pct))
                  ? h("span", { className: "telegram-stock-overview-target-pill" }, "괴리율 " + formatPercent(targetLatest.gap_pct, 1))
                  : null,
                Number.isFinite(Number(targetLatest.avg_target_price))
                  ? h(TargetReportHoverBadge, {
                      className: "telegram-stock-overview-target-pill subtle",
                      label: "평균 목표가 " + numberFormat(targetLatest.avg_target_price, 0),
                      heading: (targetLatest.date || "최근") + " 리포트 상세",
                      reports: latestReports,
                    })
                  : null
              )
            : null,
          h(StockChartPreview, {
            label: label,
            loading: tradingViewPopup.loading,
            error: tradingViewPopup.error,
            data: tradingViewPopup.data,
            tradingView: true,
            targetSeries: targetHistory ? targetHistory.series : null,
            targetReports: targetHistory ? targetHistory.recent_reports : null,
          })
        )
      );
    }

    function renderSectorMarketCapPopup() {
      if (!sectorMarketCapPopup.open) {
        return null;
      }
      const payload = sectorMarketCapPopup.payload || {};
      const sector = payload.sector || sectorMarketCapPopup.sector || "섹터";
      return h(
        "div",
        {
          className: "modal-backdrop sector-market-cap-backdrop",
          onClick: closeSectorMarketCapChart,
        },
        h(
          "div",
          {
            className: "modal-panel sector-market-cap-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Sector Market Cap"),
              h("h2", null, sector + " · 3개월 합산 시가총액")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeSectorMarketCapChart }, "닫기")
          ),
          sectorMarketCapPopup.loading
            ? h(LoadingBlock, { compact: true, title: "섹터 시가총액 차트 계산 중", label: "FinanceDataReader로 섹터 종목의 3개월 시총을 합산합니다." })
            : sectorMarketCapPopup.error
              ? h("div", { className: "notice-box error" }, sectorMarketCapPopup.error)
              : h(SectorMarketCapChart, { data: payload })
        )
      );
    }

    return h(
      React.Fragment,
      null,
      renderScoreHistoryPopup(),
      renderTradingValueHistoryPopup(),
      renderScoreFormulaModal(),
      renderTradingViewPopup(),
      renderSectorMarketCapPopup(),
      h(
        "div",
        { className: "panel leader-calendar-panel", ref: leaderCalendarRef },
        h(
          "div",
          { className: "section-toolbar leader-calendar-head" },
          h(SectionTitle, null, "날짜별 주도 섹터 흐름"),
          h(
            "div",
            { className: "toggle-group" },
            h("button", {
              className: "mini-button capture-button",
              onClick: copyLeaderCalendarToClipboard,
              disabled: calendarCopyState.status === "working",
              "data-capture-ignore": "true",
            }, calendarCopyState.status === "working" ? "복사 중..." : "캡쳐 복사"),
            h("button", {
              className: "mini-button",
              onClick: refreshLeaderCalendar,
              disabled: calendarRefreshing,
            }, calendarRefreshing ? "새로고침 중..." : "흐름 새로고침"),
            h("button", {
              type: "button",
              className: "mini-button" + (calendarMode === "month" ? " active" : ""),
              onClick: function () { setCalendarMode("month"); },
            }, "월간"),
            h("button", {
              type: "button",
              className: "mini-button" + (calendarMode === "week" ? " active" : ""),
              onClick: function () { setCalendarMode("week"); },
            }, "주간"),
            h("button", {
              className: "mini-button" + (calendarScoreBasis === "score" ? " active" : ""),
              onClick: function () { setCalendarScoreBasis("score"); },
            }, "종합"),
            h("button", {
              className: "mini-button" + (calendarScoreBasis === "score_o" ? " active" : ""),
              onClick: function () { setCalendarScoreBasis("score_o"); },
            }, "당일"),
          ),
          h(
            "div",
            { className: "summary-help" + (sectorSaveState.status === "error" || calendarCopyState.status === "error" ? " text-danger" : "") },
            (calendarScoreBasis === "score_o" ? "당일점수 기준 상위 5개 섹터" : "종합점수 기준 상위 5개 섹터")
              + " 흐름 및 선택 날짜 연동 결과"
              + (sectorSaveState.message ? " · " + sectorSaveState.message : "")
              + (calendarCopyState.message ? " · " + calendarCopyState.message : "")
          ),
        ),
        calendarRequest.error
          ? h("div", { className: "notice-box error" }, "날짜별 주도 섹터 흐름을 불러오지 못했습니다: " + calendarRequest.error)
          : calendarRequest.loading && !calendarRequest.data
            ? h(LoadingBlock, { compact: true, title: "날짜별 주도 섹터 흐름 로드 중", label: calendarRequest.label })
            : renderLeaderTimelineContent()
      ),
      h(
        "div",
        { className: "panel hero-panel alt themes-compact-hero" + (themeBoxExpanded ? " expanded" : " collapsed") },
        h(
          "div",
          { className: "themes-compact-titlebar" },
          h(
            "div",
            { className: "themes-compact-titlebar-main" },
            h(
              "button",
              {
                type: "button",
                className: "theme-box-toggle",
                onClick: function () { setThemeBoxExpanded(function (value) { return !value; }); },
                "aria-expanded": themeBoxExpanded ? "true" : "false",
              },
              h("span", { className: "calendar-arrow", "aria-hidden": "true" }, themeBoxExpanded ? "?" : "?"),
              h("span", { className: "theme-box-title-text" },
                h("span", { className: "eyebrow" }, "Daily Theme Radar"),
                h("span", { className: "page-title" }, themePageTitle)
              )
            ),
            h(
              "div",
              { className: "toggle-group", "data-capture-ignore": "true" },
              h("button", {
                type: "button",
                className: "mini-button" + (!isEtfUniverse ? " active" : ""),
                onClick: function () { setUniverseMode("stock"); },
              }, "주식"),
              h("button", {
                type: "button",
                className: "mini-button" + (isEtfUniverse ? " active" : ""),
                onClick: function () { setUniverseMode("etf"); },
              }, "국내 ETF")
            )
          ),
          h("div", { className: "summary-help" }, themeBoxExpanded ? themeUniverseHelp : "접힘 · 화살표를 누르면 조회 파일과 요약을 볼 수 있습니다"),
        ),
        themeBoxExpanded
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "section-toolbar themes-compact-toolbar" },
                h("div", { className: "summary-help" }, "\uc870\ud68c \ud30c\uc77c \ub0a0\uc9dc"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mini-button",
                    onClick: buildTodayThemeExcel,
                    disabled: reloadingExcel,
                    title: "오늘 날짜 기준으로 데이터를 계산하고 SQL과 화면 캐시를 함께 갱신합니다.",
                  },
                  reloadingExcel ? "오늘자 데이터 생성 중..." : "오늘자 데이터 로드"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setCalendarChartOpen(function (value) { return !value; }); },
                    title: "상위 10개 평균 점수 흐름 차트를 열거나 닫습니다.",
                  },
                  calendarChartOpen ? "차트 닫기" : "차트 열기"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mini-button",
                    onClick: rebuildSelectedThemeDate,
                    disabled: !selectedDateValue || reloadingExcel || rebuildingSelectedDate,
                    title: "현재 선택한 날짜의 원천 데이터를 검증한 뒤 SQL과 캐시를 다시 생성합니다.",
                  },
                  rebuildingSelectedDate ? "선택일 재생성 중..." : "선택일 다시 로드"
                ),
                reloadingExcel
                  ? h(
                      "div",
                      { className: "summary-help" },
                      "진행중: 1) 오늘자 데이터 계산  2) SQL/캐시 갱신  3) 화면 재로드 (" + numberFormat(reloadElapsedSec, 0) + "초)"
                    )
                  : null,
                reloadMessage ? h("div", { className: "summary-help" }, reloadMessage) : null
              ),
              calendarChartOpen
                ? h(
                    "div",
                    { className: "leader-calendar-score-block" },
                    h("div", { className: "section-toolbar", style: { marginBottom: "10px" } },
                      h("div", { className: "summary-help" }, calendarScoreBasis === "score_o" ? "일자별 상위 10개 평균 당일점수" : "일자별 상위 10개 평균 종합점수"),
                      h("div", { className: "summary-help" }, chartDateRangeLabel)
                    ),
                    calendarScoreHistoryRequest.error
                      ? h("div", { className: "notice-box error" }, "점수 흐름 차트를 불러오지 못했습니다: " + calendarScoreHistoryRequest.error)
                      : calendarScoreHistoryRequest.loading && !chartScoreHistoryPayload
                        ? h(LoadingBlock, { compact: true, title: "점수 흐름 차트 로드 중", label: calendarScoreHistoryRequest.label })
                        : chartScoreSeriesRows.length
                      ? h(LeaderCalendarScoreChart, {
                          rows: chartScoreSeriesRows,
                          scoreBasis: calendarScoreBasis,
                        })
                      : h(EmptyState, { message: "차트로 표시할 점수 데이터가 없습니다.", compact: true })
                  )
                : null,
              h(
                "div",
                { className: "theme-file-calendar" },
                h(
                  "div",
                  { className: "theme-file-calendar-head" },
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, -1)); },
                  }, "\uc774\uc804\ub2ec"),
                  h("strong", null, monthLabel(datePickerMonth)),
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, 1)); },
                  }, "\ub2e4\uc74c\ub2ec")
                ),
                h(
                  "div",
                  { className: "theme-file-calendar-weekdays" },
                  ["\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08"].map(function (day) {
                    return h("span", { key: day }, day);
                  })
                ),
                h(
                  "div",
                  { className: "theme-file-calendar-grid" },
                  datePickerCells.map(function (cell) {
                    const file = availableDateMap[cell.date];
                    const isSelected = selectedDateValue === cell.date;
                    const top50AvgScore = Number(calendarDayScoreMap[cell.date]);
                    return h(
                      "button",
                      {
                        key: cell.date,
                        type: "button",
                        className:
                          "theme-file-calendar-day" +
                          (cell.inMonth ? "" : " muted") +
                          (file ? " has-file" : "") +
                          (isSelected ? " active" : ""),
                        disabled: !file,
                        title: file ? cell.date + " · " + file.file_name : cell.date + " 엑셀 파일 없음",
                        onClick: function () { selectFileDate(cell.date); },
                      },
                      h("span", { className: "theme-file-calendar-number" }, cell.day),
                      Number.isFinite(top50AvgScore)
                        ? h("span", { className: "theme-file-calendar-score", title: calendarScoreBasis === "score_o" ? "Top10 당일점수 평균" : "Top10 종합점수 평균" }, numberFormat(top50AvgScore, 1))
                        : null,
                      file ? h("span", { className: "theme-file-calendar-dot" }) : null
                    );
                  })
                ),
                h("div", { className: "summary-help" }, selectedDateValue ? "\uc120\ud0dd\ub41c \ub0a0\uc9dc: " + selectedDateValue : "\ub0a0\uc9dc\ub97c \uc120\ud0dd\ud574 \uc8fc\uc138\uc694.")
              ),
              h(
                "div",
                { className: "summary-grid themes-compact-summary" },
                h(SummaryCard, { label: "기준 파일", value: themes.file_name || "-", help: themes.file_date || "" }),
                h(SummaryCard, { label: themeUniverseCountLabel, value: numberFormat(themes.qualified_count, 0) + "개", help: "점수와 관계없이 표시" }),
                h(SummaryCard, { label: "지정된 섹터", value: numberFormat(sectorSummary.length, 0) + "개", help: "직접 입력 기준" })
              )
            )
          : null
      ),
      h(
        "div",
        { className: "panel", ref: manualSummaryRef },
        h(
          "div",
          { className: "section-toolbar" },
          h(SectionTitle, null, "수동 섹터 요약"),
          h(
            "div",
            { className: "toggle-group", "data-capture-ignore": "true" },
            h("button", {
              className: "mini-button capture-button",
              onClick: copyManualSummaryToClipboard,
              disabled: manualSummaryCopyState.status === "working",
            }, manualSummaryCopyState.status === "working" ? "복사 중..." : "캡쳐 복사")
          )
        ),
        manualSummaryCopyState.message
          ? h("div", { className: "summary-help" + (manualSummaryCopyState.status === "error" ? " text-danger" : ""), "data-capture-ignore": "true" }, manualSummaryCopyState.message)
          : null,
        sectorSummary.length
          ? h(
              "div",
              { className: "manual-theme-strip" },
              [
                h(
                  "button",
                  {
                    key: "all",
                    type: "button",
                    className: "theme-sector-chip" + (sectorFilter === "all" ? " active" : ""),
                    onClick: function () { setSectorFilter("all"); },
                  },
                  h("span", { className: "theme-sector-dot", style: { background: "#64748b" } }),
                  h("span", { className: "theme-sector-chip-name" }, "전체"),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(rows.length, 0) + "개")
                )
              ].concat(sectorSummary.map(function (item) {
                const color = colorForKey(item.sector);
                return h(
                  "button",
                  {
                    key: item.sector,
                    type: "button",
                    className: "theme-sector-chip" + (sectorFilter === item.sector ? " active" : ""),
                    title: "평균 등락률이 높은 대표 종목: " + item.leaders.join(", "),
                    onClick: function () { openSectorMarketCapChart(item.sector); },
                  },
                  h("span", { className: "theme-sector-dot", style: { background: color } }),
                  h("span", { className: "theme-sector-chip-name" }, item.sector),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(item.count, 0) + "개 · " + formatPercent(item.avg_change_pct, 2))
                );
              }))
            )
          : EmptyState({ message: "섹터를 입력하면 평균 등락률과 대표 종목이 여기에 모입니다." })
      ),
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h(SectionTitle, null, "종목 추세 순위" + ((selectedDateValue || themes.file_date) ? " (" + (selectedDateValue || themes.file_date) + ")" : "")),
          h(
            "div",
            { className: "toggle-group" },
            h("div", { className: "summary-help" }, sectorFilter === "all" ? "전체 표시" : "선택 섹터: " + sectorFilter),
            h("button", {
              className: "mini-button",
              type: "button",
              onClick: openScoreFormulaModal,
            }, "점수 지표 수정"),
            h("button", {
              className: "mini-button capture-button",
              onClick: copyScoreTableToClipboard,
              disabled: scoreTableCopyState.status === "working",
            }, scoreTableCopyState.status === "working" ? "캡쳐 복사 중..." : captureButtonLabel),
            rankHighCountLabel
              ? h("span", { className: "theme-high-count-badge" }, rankHighCountLabel)
              : null
          )
        ),
        scoreTableCopyState.message
          ? h("div", { className: "summary-help" + (scoreTableCopyState.status === "error" ? " text-danger" : "") }, scoreTableCopyState.message)
          : null,
        noteSaveState.message
          ? h("div", { className: "summary-help" + (noteSaveState.status === "error" ? " text-danger" : "") }, noteSaveState.message)
          : null,
        h(
          "form",
          { className: "theme-stock-search-bar", onSubmit: submitStockSearch },
          h(
            "div",
            { className: "theme-stock-search-wrap" },
            h("input", {
              type: "search",
              value: stockSearchText,
              onFocus: function (event) {
                selectTextOnFocus(event);
                setStockSearchOpen(true);
              },
              onBlur: function () {
                setTimeout(function () { setStockSearchOpen(false); }, 120);
              },
              onKeyDown: handleStockSearchKeyDown,
              onChange: function (event) {
                setStockSearchText(event.target.value);
                setStockSearchActiveIndex(0);
                setStockSearchOpen(true);
                if (stockSearchMessage) {
                  setStockSearchMessage("");
                }
              },
              placeholder: "종목명 또는 종목코드 검색",
              "aria-label": "종목 추세 순위 종목 검색 입력",
            }),
            stockSearchOpen && stockSearchSuggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list inline theme-stock-search-suggestions" },
                  stockSearchSuggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: buildStockSearchKey(item) + ":" + index,
                        type: "button",
                        className: "autocomplete-item" + (index === stockSearchActiveIndex ? " active" : ""),
                        onMouseDown: function (event) { event.preventDefault(); },
                        onMouseEnter: function () { setStockSearchActiveIndex(index); },
                        onClick: function () { chooseStockSearchRow(item); },
                      },
                      h("strong", null, item.stock_name || "-"),
                      h("span", null, [item.stock_code, item.industry, item.rank ? numberFormat(item.rank, 0) + "위" : ""].filter(Boolean).join(" · "))
                    );
                  })
                )
              : null
          ),
          h("button", { type: "submit", className: "mini-button" }, "검색"),
          stockSearchMessage ? h("span", { className: "summary-help" }, stockSearchMessage) : null
        ),
        visibleRows.length
          ? h(
              "div",
              {
                className: "table-wrap theme-table-virtual-wrap",
                ref: themeTableScrollRef,
                onScroll: handleThemeTableScroll,
                style: { maxHeight: themeTableViewportHeight + "px" },
              },
              h(
                "table",
                { key: "theme-edit-table-" + (themes.file_date || selectedDateValue || ""), className: "data-table compact theme-edit-table" },
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    themeTableHeaderColumns.map(function (column) {
                      const active = themeTableSortState.key === column.key;
                      return h(
                        "th",
                        { key: column.key, className: column.key === "change_pct" ? "theme-col-change" : null },
                        h(
                          "button",
                          {
                            type: "button",
                            className: "table-sort-button" + (active ? " active" : ""),
                            onClick: function () { toggleThemeTableSort(column.key); },
                          },
                          column.label,
                          active ? h("span", null, themeTableSortState.direction === "desc" ? " ↓" : " ↑") : null
                        )
                      );
                    })
                  )
                ),
                h(
                  "tbody",
                  null,
                  [
                    themeTableTopSpacer
                      ? h("tr", { key: "top-spacer", className: "virtual-spacer-row", "aria-hidden": "true" }, h("td", { colSpan: 12, style: { height: themeTableTopSpacer + "px", padding: 0, border: 0 } }))
                      : null,
                  ].concat(renderedVisibleRows.map(function (row, rowIndex) {
                    const sector = String(row.manual_sector || "").trim();
                    const color = sector ? colorForKey(sector) : "#d7dee8";
                    const stockKey = buildStockSearchKey(row);
                    return h(
                      "tr",
                      {
                        key: stockKey,
                        ref: function (element) {
                          if (element) {
                            stockRowRefs.current[stockKey] = element;
                          } else {
                            delete stockRowRefs.current[stockKey];
                          }
                        },
                        "data-stock-search-key": stockKey,
                        className: highlightedStockKey === stockKey ? "stock-search-highlight" : "",
                      },
                      h("td", null, renderRankCell(row, resolveThemeTableRank(row, themeTableStartIndex + rowIndex))),
                      h(
                        "td",
                        { className: "theme-sector-cell", style: { borderLeft: "4px solid " + color } },
                        h(
                          "div",
                          {
                            className: "theme-sector-cell-inner",
                            style: { background: sector ? color + "22" : "#f8fafc" },
                            title: "",
                          },
                          h(ThemeSectorInput, {
                            value: row.manual_sector || "",
                            options: sectorOptions,
                            onCommit: function (value) { commitStockSector(row, value); },
                          })
                        )
                      ),
                      h("td", null, renderStockNameWithCode(row)),
                      h("td", null, renderNumberCell(row.sortino_norm, 4)),
                      h("td", null, formatPercent(row.atr_20_pct != null ? row.atr_20_pct : row.atr_20, 2)),
                      h("td", null, renderNumberCell(row.market_cap_100m, 0)),
                      h("td", null, renderTradingValueHistory(row.trading_value_100m, row)),
                      h("td", null, renderHighDrawdownPercent(row)),
                      h("td", { className: "theme-col-change" }, renderSignedPercent(row.change_pct)),
                      h("td", null, renderNumberCell(row.score_o, 2)),
                      h("td", null, renderTodayScore(row.score, row)),
                      h("td", { className: "theme-note-cell" }, h(ThemeNoteInput, {
                        value: row.note || "",
                        onCommit: function (value) { return commitStockNote(row, value); },
                      }))
                    );
                  })).concat([
                    themeTableBottomSpacer
                      ? h("tr", { key: "bottom-spacer", className: "virtual-spacer-row", "aria-hidden": "true" }, h("td", { colSpan: 12, style: { height: themeTableBottomSpacer + "px", padding: 0, border: 0 } }))
                      : null,
                  ])
                )
              )
            )
          : EmptyState({ message: "선택한 섹터에 해당하는 종목이 없습니다." })
      ),
      captureStageReady ? h(
        "div",
        { className: "capture-hidden-stage" },
        h(
          "div",
          { className: "theme-score-capture-bundle", ref: scoreTableCaptureRef },
          h(
            "div",
            { className: "panel theme-score-capture-panel" },
            h(SectionTitle, null, captureTitle),
            h(
              "div",
              { className: "summary-help" },
              [
                themes.file_date || selectedDateValue || "",
                sectorFilter === "all" ? "전체 섹터" : "선택 섹터: " + sectorFilter,
                captureSummaryLabel,
                numberFormat(scoreCaptureRows.length, 0) + "개",
              ].filter(Boolean).join(" · ")
            ),
            scoreCaptureRows.length
              ? h(
                  "table",
                  { className: "data-table compact theme-edit-table theme-capture-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "순위"),
                      h("th", null, "섹터"),
                      h("th", null, "종목"),
                      h("th", null, "Sortino"),
                      h("th", null, "% ATR(20)"),
                      h("th", null, "시총(억)"),
                      h("th", null, "거래대금(억)"),
                      h("th", null, "고점대비"),
                      h("th", null, "등락률"),
                      h("th", null, "당일점수"),
                      h("th", null, "종합점수"),
                      h("th", null, "비고")
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    scoreCaptureRows.map(function (row) {
                      const sector = String(row.manual_sector || "").trim();
                      const color = sector ? colorForKey(sector) : "#d7dee8";
                      const captureRow = Object.assign({}, row, { __capture_plain: true });
                      return h(
                        "tr",
                        { key: "capture-" + row.stock_name },
                        h("td", null, renderRankCell(row)),
                        h("td", { className: "theme-sector-cell", style: { borderLeft: "4px solid " + color } }, sector || "-"),
                        h("td", null, renderStockNameWithCode(captureRow)),
                        h("td", null, renderNumberCell(row.sortino_norm, 4)),
                        h("td", null, formatPercent(row.atr_20_pct != null ? row.atr_20_pct : row.atr_20, 2)),
                        h("td", null, renderNumberCell(row.market_cap_100m, 0)),
                        h("td", null, renderNumberCell(row.trading_value_100m, 0)),
                        h("td", null, renderHighDrawdownPercent(row)),
                        h("td", { className: "theme-col-change" }, renderSignedPercent(row.change_pct)),
                        h("td", null, renderNumberCell(row.score_o, 2)),
                        h("td", null, renderTodayScore(row.score)),
                        h("td", null, row.note || "-")
                      );
                    })
                  )
                )
              : EmptyState({ message: captureEmptyMessage, compact: true })
          )
        )
      ) : null,
      renderKrEtfDetailPopup()
    );
  }


    return ThemesPageV2;
  }

  modules.themesPageFeature = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
