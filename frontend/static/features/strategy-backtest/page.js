(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const DataTable = deps.DataTable;
    const deleteJson = deps.deleteJson;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatDateLabel = deps.formatDateLabel;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const isoDateOffset = deps.isoDateOffset;
    const LoadingBlock = deps.LoadingBlock;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const openStockInGlobalCompany = deps.openStockInGlobalCompany;
    const pnlClass = deps.pnlClass;
    const PortfolioDiagnosticChart = deps.PortfolioDiagnosticChart;
    const postJson = deps.postJson;
    const ScoreHistoryChart = deps.ScoreHistoryChart;
    const SectionTitle = deps.SectionTitle;
    const SectorRotationBacktestChart = deps.SectorRotationBacktestChart;
    const StockChartPreview = deps.StockChartPreview;
    const StrategyBacktestChart = deps.StrategyBacktestChart;
    const StrategyRsiChart = deps.StrategyRsiChart;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

  function StrategyBacktestPage() {
    const STRATEGY_BACKTEST_PREFS_LEGACY_KEY = "stock-dashboard-strategy-backtest-leader";
    const STRATEGY_BACKTEST_PREFS_KEYS = {
      kr: "stock-dashboard-strategy-backtest-leader-kr",
      us: "stock-dashboard-strategy-backtest-leader-us",
    };
    function loadSavedLeaderBacktestPrefs(marketMode) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      try {
        let raw = localStorage.getItem(STRATEGY_BACKTEST_PREFS_KEYS[normalizedMarket]);
        if (!raw) {
          const legacyRaw = localStorage.getItem(STRATEGY_BACKTEST_PREFS_LEGACY_KEY);
          if (legacyRaw) {
            const legacyParsed = JSON.parse(legacyRaw);
            const legacyMarket = legacyParsed && legacyParsed.market === "us" ? "us" : "kr";
            if (legacyMarket === normalizedMarket) {
              raw = legacyRaw;
              localStorage.setItem(STRATEGY_BACKTEST_PREFS_KEYS[normalizedMarket], legacyRaw);
            }
          }
        }
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (parsed && parsed.stop_loss_mode === "atr2") {
          parsed.stop_loss_mode = "atr";
          if (!(Number(parsed.stop_loss_pct || 0) > 0)) {
            parsed.stop_loss_pct = 2;
          }
        }
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (error) {
        return null;
      }
    }
    const savedKrLeaderBacktestPrefs = loadSavedLeaderBacktestPrefs("kr");
    const savedUsLeaderBacktestPrefs = loadSavedLeaderBacktestPrefs("us");
    const savedLeaderBacktestPrefs = savedKrLeaderBacktestPrefs;
    const [strategyMode, setStrategyMode] = useState("leader_top10");
    const [leaderUsBenchmark, setLeaderUsBenchmark] = useState(
      savedUsLeaderBacktestPrefs && (savedUsLeaderBacktestPrefs.index === "US500" || savedUsLeaderBacktestPrefs.index === "NDX100")
        ? savedUsLeaderBacktestPrefs.index
        : "US500"
    );
    const [indexKey, setIndexKey] = useState("KS11");
    const [leaderTopN, setLeaderTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100);
    const [leaderExitTopN, setLeaderExitTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_top_n != null ? savedLeaderBacktestPrefs.exit_top_n : (savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100));
    const [leaderUseEntryTopN, setLeaderUseEntryTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_top_n != null ? !!savedLeaderBacktestPrefs.use_entry_top_n : true);
    const [leaderUseExitTopN, setLeaderUseExitTopN] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_exit_top_n != null ? !!savedLeaderBacktestPrefs.use_exit_top_n : true);
    const [leaderEntryThreshold, setLeaderEntryThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.entry_threshold != null ? savedLeaderBacktestPrefs.entry_threshold : 65);
    const [leaderExitThreshold, setLeaderExitThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_threshold != null ? savedLeaderBacktestPrefs.exit_threshold : 50);
    const [leaderUseEntryThreshold, setLeaderUseEntryThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_threshold != null ? !!savedLeaderBacktestPrefs.use_entry_threshold : true);
    const [leaderUseExitThreshold, setLeaderUseExitThreshold] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_exit_threshold != null ? !!savedLeaderBacktestPrefs.use_exit_threshold : true);
    const [leaderStopLossPct, setLeaderStopLossPct] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.stop_loss_pct != null ? savedLeaderBacktestPrefs.stop_loss_pct : 0);
    const [leaderUseStopLoss, setLeaderUseStopLoss] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_stop_loss != null ? !!savedLeaderBacktestPrefs.use_stop_loss : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.stop_loss_pct || 0) > 0));
    const [leaderStopLossMode, setLeaderStopLossMode] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.stop_loss_mode ? savedLeaderBacktestPrefs.stop_loss_mode : "pct");
    const [leaderExitMa20Break, setLeaderExitMa20Break] = useState(!!(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_ma20_break));
    const [leaderExitMa60Break, setLeaderExitMa60Break] = useState(!!(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.exit_ma60_break));
    const [leaderEntryStreakDays, setLeaderEntryStreakDays] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.entry_streak_days != null ? savedLeaderBacktestPrefs.entry_streak_days : 1);
    const [leaderUseEntryStreak, setLeaderUseEntryStreak] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_streak != null ? !!savedLeaderBacktestPrefs.use_entry_streak : true);
    const [leaderRunupLookbackDays, setLeaderRunupLookbackDays] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.runup_lookback_days != null ? savedLeaderBacktestPrefs.runup_lookback_days : 0);
    const [leaderRunupExcludePct, setLeaderRunupExcludePct] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.runup_exclude_pct != null ? savedLeaderBacktestPrefs.runup_exclude_pct : 0);
    const [leaderUseRunupFilter, setLeaderUseRunupFilter] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_runup_filter != null ? !!savedLeaderBacktestPrefs.use_runup_filter : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.runup_lookback_days || 0) > 0));
    const [leaderMinMarketCap100m, setLeaderMinMarketCap100m] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.min_market_cap_100m != null ? savedLeaderBacktestPrefs.min_market_cap_100m : 0);
    const [leaderUseMinMarketCapFilter, setLeaderUseMinMarketCapFilter] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_min_market_cap_filter != null ? !!savedLeaderBacktestPrefs.use_min_market_cap_filter : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.min_market_cap_100m || 0) > 0));
    const [leaderMaxAtr20, setLeaderMaxAtr20] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.max_atr_20 != null ? savedLeaderBacktestPrefs.max_atr_20 : 0);
    const [leaderUseAtrFilter, setLeaderUseAtrFilter] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_atr_filter != null ? !!savedLeaderBacktestPrefs.use_atr_filter : !!(savedLeaderBacktestPrefs && Number(savedLeaderBacktestPrefs.max_atr_20 || 0) > 0));
    const [leaderEntryHighFilter, setLeaderEntryHighFilter] = useState(
      savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.entry_high_filter
        ? String(savedLeaderBacktestPrefs.entry_high_filter)
        : (!!(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.use_entry_52w_high) ? "52w" : "none")
    );
    const [leaderAllocationMode, setLeaderAllocationMode] = useState(savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.allocation_mode ? savedLeaderBacktestPrefs.allocation_mode : "score_weight");
    const [strategyKey, setStrategyKey] = useState("ma20_cross");
    const [startDate, setStartDate] = useState(function () { return savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.start ? savedLeaderBacktestPrefs.start : isoDateOffset(-365); });
    const [endDate, setEndDate] = useState(function () { return savedLeaderBacktestPrefs && savedLeaderBacktestPrefs.end ? savedLeaderBacktestPrefs.end : isoDateOffset(0); });
    const [advancedStartDate, setAdvancedStartDate] = useState(function () { return isoDateOffset(-180); });
    const [advancedEndDate, setAdvancedEndDate] = useState(function () { return isoDateOffset(0); });
    const [advancedMinScore, setAdvancedMinScore] = useState(50);
    const [advancedTopSectors, setAdvancedTopSectors] = useState(4);
    const [advancedStocksCount, setAdvancedStocksCount] = useState(4);
    const [advancedMaxLeverage, setAdvancedMaxLeverage] = useState(1.5);
    const [advancedBenchmark, setAdvancedBenchmark] = useState("KS11");
    const [advancedWeightMethod, setAdvancedWeightMethod] = useState("entry_beta");
    const [advancedBetaWindow, setAdvancedBetaWindow] = useState(63);
    const [advancedMinBreadth, setAdvancedMinBreadth] = useState(60);
    const [advancedMaxDisparity, setAdvancedMaxDisparity] = useState(110);
    const [advancedTradingRankLimit, setAdvancedTradingRankLimit] = useState(20);
    const [advancedStockSelection, setAdvancedStockSelection] = useState("trend_strength");
    const [selectedAdvancedDate, setSelectedAdvancedDate] = useState("");
    const [selectedSectorDate, setSelectedSectorDate] = useState("");
    const [strategyTradeChartPopup, setStrategyTradeChartPopup] = useState({
      open: false,
      trade: null,
      loading: false,
      error: "",
      data: null,
      scoreLoading: false,
      scoreError: "",
      scoreData: null,
    });
    const leaderSnapshotRequest = useFetchJson("/api/strategy/snapshots?strategy_group=leader_kr&limit=60", { refreshOnMount: true });
    const [activeLeaderSnapshot, setActiveLeaderSnapshot] = useState(null);
    const [activeLeaderSnapshotId, setActiveLeaderSnapshotId] = useState(0);
    const [leaderSnapshotSaving, setLeaderSnapshotSaving] = useState(false);
    const [leaderSnapshotMessage, setLeaderSnapshotMessage] = useState("");
    const [compareLeftSnapshotId, setCompareLeftSnapshotId] = useState("");
    const [compareRightSnapshotId, setCompareRightSnapshotId] = useState("");
    const [compareLeftSnapshot, setCompareLeftSnapshot] = useState(null);
    const [compareRightSnapshot, setCompareRightSnapshot] = useState(null);
    const [compareStockKey, setCompareStockKey] = useState("");
    const [sectorStartDate, setSectorStartDate] = useState(function () { return isoDateOffset(-120); });
    const [sectorEndDate, setSectorEndDate] = useState(function () { return isoDateOffset(0); });
    const [sectorMinScore, setSectorMinScore] = useState(50);
    const [sectorTopCount, setSectorTopCount] = useState(4);
    const [sectorStocksCount, setSectorStocksCount] = useState(4);
    const [sectorLeverage, setSectorLeverage] = useState(1);
    const [sectorWeightMethod, setSectorWeightMethod] = useState("strength");
    const [indexBacktestStarted, setIndexBacktestStarted] = useState(false);
    const [leaderBacktestStarted, setLeaderBacktestStarted] = useState(false);
    const [leaderPeriodSummaryMode, setLeaderPeriodSummaryMode] = useState("year");
    const [leaderAiMessagesByMarket, setLeaderAiMessagesByMarket] = useState({ kr: [], us: [] });
    const [leaderAiInputByMarket, setLeaderAiInputByMarket] = useState({ kr: "", us: "" });
    const [leaderAiLoadingByMarket, setLeaderAiLoadingByMarket] = useState({ kr: false, us: false });
    const [leaderAiErrorByMarket, setLeaderAiErrorByMarket] = useState({ kr: "", us: "" });
    const leaderLastQueryByMarketRef = useRef({ kr: null, us: null });
    const [sectorBacktestStarted, setSectorBacktestStarted] = useState(false);
    const [advancedBacktestStarted, setAdvancedBacktestStarted] = useState(false);
    const [queryState, setQueryState] = useState(function () {
      if (savedLeaderBacktestPrefs) {
        return {
          index: savedLeaderBacktestPrefs.index || "KS11",
          market: savedLeaderBacktestPrefs.market || "kr",
          strategy: "leader_custom",
          start: savedLeaderBacktestPrefs.start || isoDateOffset(-365),
          end: savedLeaderBacktestPrefs.end || isoDateOffset(0),
          top_n: savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100,
          exit_top_n: savedLeaderBacktestPrefs.exit_top_n != null ? savedLeaderBacktestPrefs.exit_top_n : (savedLeaderBacktestPrefs.top_n != null ? savedLeaderBacktestPrefs.top_n : 100),
          use_entry_top_n: savedLeaderBacktestPrefs.use_entry_top_n != null ? !!savedLeaderBacktestPrefs.use_entry_top_n : true,
          use_exit_top_n: savedLeaderBacktestPrefs.use_exit_top_n != null ? !!savedLeaderBacktestPrefs.use_exit_top_n : true,
          entry_threshold: savedLeaderBacktestPrefs.entry_threshold != null ? savedLeaderBacktestPrefs.entry_threshold : 65,
          exit_threshold: savedLeaderBacktestPrefs.exit_threshold != null ? savedLeaderBacktestPrefs.exit_threshold : 50,
          use_entry_threshold: savedLeaderBacktestPrefs.use_entry_threshold != null ? !!savedLeaderBacktestPrefs.use_entry_threshold : true,
          use_exit_threshold: savedLeaderBacktestPrefs.use_exit_threshold != null ? !!savedLeaderBacktestPrefs.use_exit_threshold : true,
          stop_loss_pct: savedLeaderBacktestPrefs.stop_loss_pct != null ? savedLeaderBacktestPrefs.stop_loss_pct : 0,
          use_stop_loss: savedLeaderBacktestPrefs.use_stop_loss != null ? !!savedLeaderBacktestPrefs.use_stop_loss : !!Number(savedLeaderBacktestPrefs.stop_loss_pct || 0),
          stop_loss_mode: savedLeaderBacktestPrefs.stop_loss_mode || "pct",
          exit_ma20_break: !!savedLeaderBacktestPrefs.exit_ma20_break,
          exit_ma60_break: !!savedLeaderBacktestPrefs.exit_ma60_break,
          entry_streak_days: savedLeaderBacktestPrefs.entry_streak_days != null ? savedLeaderBacktestPrefs.entry_streak_days : 1,
          use_entry_streak: savedLeaderBacktestPrefs.use_entry_streak != null ? !!savedLeaderBacktestPrefs.use_entry_streak : true,
          runup_lookback_days: savedLeaderBacktestPrefs.runup_lookback_days != null ? savedLeaderBacktestPrefs.runup_lookback_days : 0,
          runup_exclude_pct: savedLeaderBacktestPrefs.runup_exclude_pct != null ? savedLeaderBacktestPrefs.runup_exclude_pct : 0,
          use_runup_filter: savedLeaderBacktestPrefs.use_runup_filter != null ? !!savedLeaderBacktestPrefs.use_runup_filter : !!Number(savedLeaderBacktestPrefs.runup_lookback_days || 0),
          min_market_cap_100m: savedLeaderBacktestPrefs.min_market_cap_100m != null ? savedLeaderBacktestPrefs.min_market_cap_100m : 0,
          use_min_market_cap_filter: savedLeaderBacktestPrefs.use_min_market_cap_filter != null ? !!savedLeaderBacktestPrefs.use_min_market_cap_filter : !!Number(savedLeaderBacktestPrefs.min_market_cap_100m || 0),
          max_atr_20: savedLeaderBacktestPrefs.max_atr_20 != null ? savedLeaderBacktestPrefs.max_atr_20 : 0,
          use_atr_filter: savedLeaderBacktestPrefs.use_atr_filter != null ? !!savedLeaderBacktestPrefs.use_atr_filter : !!Number(savedLeaderBacktestPrefs.max_atr_20 || 0),
          entry_high_filter: savedLeaderBacktestPrefs.entry_high_filter
            ? String(savedLeaderBacktestPrefs.entry_high_filter)
            : (!!savedLeaderBacktestPrefs.use_entry_52w_high ? "52w" : "none"),
          use_entry_52w_high: !!savedLeaderBacktestPrefs.use_entry_52w_high,
          allocation_mode: savedLeaderBacktestPrefs.allocation_mode || "score_weight",
          refresh: String(savedLeaderBacktestPrefs.refresh || Date.now()),
        };
      }
      return {
        index: "KS11",
        market: "kr",
        strategy: "leader_custom",
        start: isoDateOffset(-365),
        end: isoDateOffset(0),
        top_n: 100,
        exit_top_n: 100,
        use_entry_top_n: true,
        use_exit_top_n: true,
        entry_threshold: 65,
        exit_threshold: 50,
        use_entry_threshold: true,
        use_exit_threshold: true,
        stop_loss_pct: 0,
        use_stop_loss: false,
        stop_loss_mode: "pct",
        exit_ma20_break: false,
        exit_ma60_break: false,
        entry_streak_days: 1,
        use_entry_streak: true,
        runup_lookback_days: 0,
        runup_exclude_pct: 0,
        use_runup_filter: false,
        min_market_cap_100m: 0,
        use_min_market_cap_filter: false,
        max_atr_20: 0,
        use_atr_filter: false,
        entry_high_filter: "none",
        use_entry_52w_high: false,
        allocation_mode: "score_weight",
        refresh: String(Date.now()),
      };
    });
    const [sectorQueryState, setSectorQueryState] = useState(function () {
      return {
        start: isoDateOffset(-120),
        end: isoDateOffset(0),
        min_score: 50,
        top_sectors: 4,
        stocks_per_sector: 4,
        leverage: 1,
        weight_method: "strength",
      };
    });
    const [advancedQueryState, setAdvancedQueryState] = useState(function () {
      return {
        start: isoDateOffset(-180),
        end: isoDateOffset(0),
        min_score: 50,
        top_sectors: 4,
        stocks_per_sector: 4,
        max_leverage: 1.5,
        benchmark: "KS11",
        weight_method: "entry_beta",
        beta_window: 63,
        min_breadth: 60,
        max_disparity: 110,
        trading_rank_limit: 20,
        stock_selection: "trend_strength",
      };
    });
    const params = new URLSearchParams({
      index: (strategyMode === "leader_top10" || strategyMode === "us_leader")
        ? String(queryState.index || (strategyMode === "us_leader" ? leaderUsBenchmark : "KS11"))
        : queryState.index,
      market: (strategyMode === "leader_top10" || strategyMode === "us_leader")
        ? String(queryState.market || (strategyMode === "us_leader" ? "us" : "kr"))
        : "kr",
      strategy: (strategyMode === "leader_top10" || strategyMode === "us_leader") ? "leader_custom" : queryState.strategy,
      start: queryState.start,
      end: queryState.end,
    });
    if (strategyMode === "leader_top10" || strategyMode === "us_leader") {
      params.set("strategy", "leader_custom");
      params.set("top_n", String(queryState.top_n || leaderTopN || 100));
      params.set("exit_top_n", String(queryState.exit_top_n || leaderExitTopN || queryState.top_n || leaderTopN || 100));
      params.set("use_entry_top_n", String(!!(queryState.use_entry_top_n != null ? queryState.use_entry_top_n : leaderUseEntryTopN)));
      params.set("use_exit_top_n", String(!!(queryState.use_exit_top_n != null ? queryState.use_exit_top_n : leaderUseExitTopN)));
      params.set("entry_threshold", String(queryState.entry_threshold != null ? queryState.entry_threshold : leaderEntryThreshold));
      params.set("exit_threshold", String(queryState.exit_threshold != null ? queryState.exit_threshold : leaderExitThreshold));
      params.set("use_entry_threshold", String(!!(queryState.use_entry_threshold != null ? queryState.use_entry_threshold : leaderUseEntryThreshold)));
      params.set("use_exit_threshold", String(!!(queryState.use_exit_threshold != null ? queryState.use_exit_threshold : leaderUseExitThreshold)));
      params.set("stop_loss_pct", String(queryState.stop_loss_pct != null ? queryState.stop_loss_pct : leaderStopLossPct || 0));
      params.set("use_stop_loss", String(!!(queryState.use_stop_loss != null ? queryState.use_stop_loss : leaderUseStopLoss)));
      params.set("stop_loss_mode", String(queryState.stop_loss_mode || leaderStopLossMode || "pct"));
      params.set("exit_ma20_break", String(!!(queryState.exit_ma20_break != null ? queryState.exit_ma20_break : leaderExitMa20Break)));
      params.set("exit_ma60_break", String(!!(queryState.exit_ma60_break != null ? queryState.exit_ma60_break : leaderExitMa60Break)));
      params.set("entry_streak_days", String(queryState.entry_streak_days != null ? queryState.entry_streak_days : leaderEntryStreakDays || 1));
      params.set("use_entry_streak", String(!!(queryState.use_entry_streak != null ? queryState.use_entry_streak : leaderUseEntryStreak)));
      params.set("runup_lookback_days", String(queryState.runup_lookback_days != null ? queryState.runup_lookback_days : leaderRunupLookbackDays || 0));
      params.set("runup_exclude_pct", String(queryState.runup_exclude_pct != null ? queryState.runup_exclude_pct : leaderRunupExcludePct || 0));
      params.set("use_runup_filter", String(!!(queryState.use_runup_filter != null ? queryState.use_runup_filter : leaderUseRunupFilter)));
      params.set("min_market_cap_100m", String(queryState.min_market_cap_100m != null ? queryState.min_market_cap_100m : leaderMinMarketCap100m || 0));
      params.set("use_min_market_cap_filter", String(!!(queryState.use_min_market_cap_filter != null ? queryState.use_min_market_cap_filter : leaderUseMinMarketCapFilter)));
      params.set("max_atr_20", String(queryState.max_atr_20 != null ? queryState.max_atr_20 : leaderMaxAtr20 || 0));
      params.set("use_atr_filter", String(!!(queryState.use_atr_filter != null ? queryState.use_atr_filter : leaderUseAtrFilter)));
      params.set("entry_high_filter", String(queryState.entry_high_filter || leaderEntryHighFilter || "none"));
      params.set("use_entry_52w_high", String((queryState.entry_high_filter || leaderEntryHighFilter || "none") === "52w"));
      params.set("allocation_mode", String(queryState.allocation_mode || leaderAllocationMode || "score_weight"));
      params.set("refresh", String(queryState.refresh || Date.now()));
    }
    const sectorParams = new URLSearchParams({
      start: sectorQueryState.start,
      end: sectorQueryState.end,
      min_score: sectorQueryState.min_score,
      top_sectors: sectorQueryState.top_sectors,
      stocks_per_sector: sectorQueryState.stocks_per_sector,
      leverage: sectorQueryState.leverage,
      weight_method: sectorQueryState.weight_method,
    });
    const advancedParams = new URLSearchParams({
      start: advancedQueryState.start,
      end: advancedQueryState.end,
      min_score: advancedQueryState.min_score,
      top_sectors: advancedQueryState.top_sectors,
      stocks_per_sector: advancedQueryState.stocks_per_sector,
      max_leverage: advancedQueryState.max_leverage,
      benchmark: advancedQueryState.benchmark,
      weight_method: advancedQueryState.weight_method,
      beta_window: advancedQueryState.beta_window,
      min_breadth: advancedQueryState.min_breadth,
      max_disparity: advancedQueryState.max_disparity,
      trading_rank_limit: advancedQueryState.trading_rank_limit,
      stock_selection: advancedQueryState.stock_selection,
    });
    const indexRequest = useFetchJson("/api/strategy/backtest?" + params.toString(), {
      enabled: (strategyMode === "index" && indexBacktestStarted) || ((strategyMode === "leader_top10" || strategyMode === "us_leader") && leaderBacktestStarted),
    });
    const sectorRequest = useFetchJson("/api/strategy/sector-rotation?" + sectorParams.toString(), { enabled: strategyMode === "sector_rotation" && sectorBacktestStarted });
    const advancedRequest = useFetchJson("/api/strategy/advanced-sector?" + advancedParams.toString(), { enabled: strategyMode === "advanced_sector" && advancedBacktestStarted });
    const diagnosticRequest = useFetchJson("/api/strategy/portfolio-diagnostic", { enabled: strategyMode === "portfolio_diagnostic" });
    const data = indexRequest.data || {};
    const sectorData = sectorRequest.data || {};
    const advancedData = advancedRequest.data || {};
    const diagnosticData = diagnosticRequest.data || {};
    const rows = ensureArray(data.rows);
    const sectorRows = ensureArray(sectorData.rows);
    const advancedRows = ensureArray(advancedData.rows);
    const diagnosticRows = ensureArray(diagnosticData.rows);
    const summary = data.summary || {};
    const sectorSummary = sectorData.summary || {};
    const advancedSummary = advancedData.summary || {};
    const diagnosticSummary = diagnosticData.summary || {};
    const availableIndexes = ensureArray(data.available_indexes).length
      ? ensureArray(data.available_indexes)
      : [
          { key: "KS11", name: "KOSPI" },
          { key: "KQ11", name: "KOSDAQ" },
          { key: "IXIC", name: "NASDAQ" },
          { key: "US500", name: "S&P 500" },
        ];
    const availableStrategies = ensureArray(data.available_strategies).length
      ? ensureArray(data.available_strategies).filter(function (item) { return item && item.key !== "leader_top10_score70"; })
      : [
          { key: "ma20_cross", name: "20일선 돌파" },
          { key: "ma20_cross_mdd7", name: "20일선 돌파 + MDD 7% 매도" },
          { key: "golden_cross", name: "골든크로스" },
          { key: "rsi_rebound", name: "RSI 반등" },
      ];
    const availableAdvancedBenchmarks = ensureArray(advancedData.available_benchmarks).length
        ? ensureArray(advancedData.available_benchmarks)
        : [
            { key: "leader_avg", name: "시총 2000억 이상 주도주 평균" },
            { key: "portfolio_dashboard", name: "포트폴리오 수익 페이지" },
            { key: "KS11", name: "KOSPI" },
          { key: "KQ11", name: "KOSDAQ" },
          { key: "KRX_BLEND", name: "KOSPI/KOSDAQ 50:50" },
          { key: "IXIC", name: "NASDAQ" },
          { key: "US500", name: "S&P 500" },
        ];
    const savedLeaderSnapshots = ensureArray(leaderSnapshotRequest.data && leaderSnapshotRequest.data.snapshots);

    function leaderSnapshotDefaultLabel() {
      const marketLabel = "국내 주도주";
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mi = String(now.getMinutes()).padStart(2, "0");
      return marketLabel + " " + yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi;
    }

    function hydrateLeaderControlsFromQuery(savedQuery) {
      const query = savedQuery || {};
      if (query.index === "US500" || query.index === "NDX100") {
        setLeaderUsBenchmark(String(query.index));
      }
      setLeaderTopN(query.top_n != null ? Number(query.top_n) : 100);
      setLeaderExitTopN(query.exit_top_n != null ? Number(query.exit_top_n) : (query.top_n != null ? Number(query.top_n) : 100));
      setLeaderUseEntryTopN(query.use_entry_top_n != null ? !!query.use_entry_top_n : true);
      setLeaderUseExitTopN(query.use_exit_top_n != null ? !!query.use_exit_top_n : true);
      setLeaderEntryThreshold(query.entry_threshold != null ? Number(query.entry_threshold) : 65);
      setLeaderExitThreshold(query.exit_threshold != null ? Number(query.exit_threshold) : 50);
      setLeaderUseEntryThreshold(query.use_entry_threshold != null ? !!query.use_entry_threshold : true);
      setLeaderUseExitThreshold(query.use_exit_threshold != null ? !!query.use_exit_threshold : true);
      setLeaderStopLossPct(query.stop_loss_pct != null ? Number(query.stop_loss_pct) : 0);
      setLeaderUseStopLoss(query.use_stop_loss != null ? !!query.use_stop_loss : false);
      setLeaderStopLossMode(String(query.stop_loss_mode || "pct"));
      setLeaderExitMa20Break(!!query.exit_ma20_break);
      setLeaderExitMa60Break(!!query.exit_ma60_break);
      setLeaderEntryStreakDays(query.entry_streak_days != null ? Number(query.entry_streak_days) : 1);
      setLeaderUseEntryStreak(query.use_entry_streak != null ? !!query.use_entry_streak : true);
      setLeaderRunupLookbackDays(query.runup_lookback_days != null ? Number(query.runup_lookback_days) : 0);
      setLeaderRunupExcludePct(query.runup_exclude_pct != null ? Number(query.runup_exclude_pct) : 0);
      setLeaderUseRunupFilter(query.use_runup_filter != null ? !!query.use_runup_filter : false);
      setLeaderMinMarketCap100m(query.min_market_cap_100m != null ? Number(query.min_market_cap_100m) : 0);
      setLeaderUseMinMarketCapFilter(query.use_min_market_cap_filter != null ? !!query.use_min_market_cap_filter : false);
      setLeaderMaxAtr20(query.max_atr_20 != null ? Number(query.max_atr_20) : 0);
      setLeaderUseAtrFilter(query.use_atr_filter != null ? !!query.use_atr_filter : false);
      setLeaderEntryHighFilter(String(query.entry_high_filter || (query.use_entry_52w_high ? "52w" : "none")));
      setLeaderAllocationMode(String(query.allocation_mode || "score_weight"));
      setStartDate(String(query.start || isoDateOffset(-365)));
      setEndDate(String(query.end || isoDateOffset(0)));
    }

    function defaultLeaderQuery(marketMode) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      return {
        index: normalizedMarket === "us" ? "US500" : "KS11",
        market: normalizedMarket,
        strategy: "leader_custom",
        start: isoDateOffset(-365),
        end: isoDateOffset(0),
        top_n: 100,
        exit_top_n: 100,
        use_entry_top_n: true,
        use_exit_top_n: true,
        entry_threshold: 65,
        exit_threshold: 50,
        use_entry_threshold: true,
        use_exit_threshold: true,
        stop_loss_pct: 0,
        use_stop_loss: false,
        stop_loss_mode: "pct",
        exit_ma20_break: false,
        exit_ma60_break: false,
        entry_streak_days: 1,
        use_entry_streak: true,
        runup_lookback_days: 0,
        runup_exclude_pct: 0,
        use_runup_filter: false,
        min_market_cap_100m: 0,
        use_min_market_cap_filter: false,
        max_atr_20: 0,
        use_atr_filter: false,
        entry_high_filter: "none",
        use_entry_52w_high: false,
        allocation_mode: "score_weight",
      };
    }

    function buildLeaderQueryFromControls(marketMode, refreshValue) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      const nextQuery = {
        index: normalizedMarket === "us" ? leaderUsBenchmark : "KS11",
        market: normalizedMarket,
        strategy: "leader_custom",
        start: startDate || isoDateOffset(-365),
        end: endDate || isoDateOffset(0),
        top_n: Number(leaderTopN || 0) > 0 ? Number(leaderTopN) : 9999,
        exit_top_n: Number(leaderExitTopN || 0) > 0 ? Number(leaderExitTopN) : (Number(leaderTopN || 0) > 0 ? Number(leaderTopN) : 9999),
        use_entry_top_n: !!leaderUseEntryTopN,
        use_exit_top_n: !!leaderUseExitTopN,
        entry_threshold: Number(leaderEntryThreshold || 0),
        exit_threshold: Number(leaderExitThreshold || 0),
        use_entry_threshold: !!leaderUseEntryThreshold,
        use_exit_threshold: !!leaderUseExitThreshold,
        stop_loss_pct: Number(leaderStopLossPct || 0),
        use_stop_loss: !!leaderUseStopLoss,
        stop_loss_mode: leaderStopLossMode || "pct",
        exit_ma20_break: !!leaderExitMa20Break,
        exit_ma60_break: !!leaderExitMa60Break,
        entry_streak_days: Number(leaderEntryStreakDays || 1),
        use_entry_streak: !!leaderUseEntryStreak,
        runup_lookback_days: Number(leaderRunupLookbackDays || 0),
        runup_exclude_pct: Number(leaderRunupExcludePct || 0),
        use_runup_filter: !!leaderUseRunupFilter,
        min_market_cap_100m: Number(leaderMinMarketCap100m || 0),
        use_min_market_cap_filter: !!leaderUseMinMarketCapFilter,
        max_atr_20: Number(leaderMaxAtr20 || 0),
        use_atr_filter: !!leaderUseAtrFilter,
        entry_high_filter: String(leaderEntryHighFilter || "none"),
        use_entry_52w_high: String(leaderEntryHighFilter || "none") === "52w",
        allocation_mode: leaderAllocationMode || "score_weight",
      };
      if (refreshValue != null) {
        nextQuery.refresh = String(refreshValue);
      }
      return nextQuery;
    }

    function saveLeaderBacktestPrefs(marketMode, query) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      try {
        localStorage.setItem(STRATEGY_BACKTEST_PREFS_KEYS[normalizedMarket], JSON.stringify(query));
      } catch (error) {
      }
    }

    function switchStrategyMode(nextMode) {
      const currentLeaderMarket = strategyMode === "us_leader" ? "us" : (strategyMode === "leader_top10" ? "kr" : "");
      if (currentLeaderMarket) {
        saveLeaderBacktestPrefs(currentLeaderMarket, buildLeaderQueryFromControls(currentLeaderMarket));
      }
      const nextLeaderMarket = nextMode === "us_leader" ? "us" : (nextMode === "leader_top10" ? "kr" : "");
      if (nextLeaderMarket) {
        const savedPrefs = loadSavedLeaderBacktestPrefs(nextLeaderMarket) || defaultLeaderQuery(nextLeaderMarket);
        hydrateLeaderControlsFromQuery(savedPrefs);
        const lastExecutedQuery = leaderLastQueryByMarketRef.current[nextLeaderMarket];
        setQueryState(lastExecutedQuery || savedPrefs);
        setLeaderBacktestStarted(!!lastExecutedQuery);
        setActiveLeaderSnapshot(null);
        setActiveLeaderSnapshotId(0);
        setLeaderSnapshotMessage("");
      } else {
        setLeaderBacktestStarted(false);
      }
      setStrategyMode(nextMode);
    }

    useEffect(function () {
      const activeMarket = strategyMode === "us_leader" ? "us" : (strategyMode === "leader_top10" ? "kr" : "");
      if (!activeMarket) {
        return;
      }
      saveLeaderBacktestPrefs(activeMarket, buildLeaderQueryFromControls(activeMarket));
    }, [
      strategyMode,
      leaderUsBenchmark,
      leaderTopN,
      leaderExitTopN,
      leaderUseEntryTopN,
      leaderUseExitTopN,
      leaderEntryThreshold,
      leaderExitThreshold,
      leaderUseEntryThreshold,
      leaderUseExitThreshold,
      leaderStopLossPct,
      leaderUseStopLoss,
      leaderStopLossMode,
      leaderExitMa20Break,
      leaderExitMa60Break,
      leaderEntryStreakDays,
      leaderUseEntryStreak,
      leaderRunupLookbackDays,
      leaderRunupExcludePct,
      leaderUseRunupFilter,
      leaderMinMarketCap100m,
      leaderUseMinMarketCapFilter,
      leaderMaxAtr20,
      leaderUseAtrFilter,
      leaderEntryHighFilter,
      leaderAllocationMode,
      startDate,
      endDate,
    ]);

    function extractLeaderSellRows(sourceRows) {
      const results = [];
      ensureArray(sourceRows).forEach(function (row) {
        ensureArray(row && row.entry_exit && row.entry_exit.sell_details).forEach(function (detail) {
          results.push({
            date: row.date,
            signal_date: detail.signal_date || row.signal_date || "",
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            buy_reason: detail.buy_reason || "",
            reason: detail.reason || "-",
            buy_avg_price: detail.avg_buy_price,
            buy_date: detail.buy_date || "",
            sell_avg_price: detail.sell_price,
            sell_date: detail.sell_date || detail.date || row.date,
            sell_return_pct: detail.sell_return_pct,
            markers: strategyTradeMarkers({
              entry_date: detail.buy_date || "",
              exit_date: detail.sell_date || row.date,
              entry_price: detail.avg_buy_price,
              exit_price: detail.sell_price,
              trade_return_pct: detail.sell_return_pct,
            }),
          });
        });
      });
      return results;
    }

    function buildLeaderPeriodMeta(dateText, mode) {
      const raw = String(dateText || "");
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
      }
      const quarter = Math.floor((month - 1) / 3) + 1;
      if (mode === "quarter") {
        return {
          key: year + "-Q" + quarter,
          label: year + "." + quarter + "Q",
          sortValue: year * 10 + quarter,
        };
      }
      return {
        key: String(year),
        label: String(year),
        sortValue: year,
      };
    }

    function calculateLeaderPeriodMdd(navPath) {
      let peak = null;
      let worstDrawdown = 0;
      ensureArray(navPath).forEach(function (value) {
        const nav = Number(value);
        if (!Number.isFinite(nav) || nav <= 0) return;
        if (peak == null || nav > peak) {
          peak = nav;
        }
        if (!peak) return;
        const drawdownPct = ((nav - peak) / peak) * 100;
        if (drawdownPct < worstDrawdown) {
          worstDrawdown = drawdownPct;
        }
      });
      return worstDrawdown;
    }

    function buildLeaderPeriodicSummaryRows(backtestRows, sellRows, mode) {
      const groups = {};
      ensureArray(backtestRows).forEach(function (row) {
        const meta = buildLeaderPeriodMeta(row && row.date, mode);
        if (!meta) return;
        if (!groups[meta.key]) {
          groups[meta.key] = {
            key: meta.key,
            label: meta.label,
            sortValue: meta.sortValue,
            nav: 100,
            navPath: [100],
            tradeReturns: [],
          };
        }
        const group = groups[meta.key];
        const dailyReturnPct = Number(row && row.daily_return_pct);
        if (Number.isFinite(dailyReturnPct)) {
          group.nav *= 1 + (dailyReturnPct / 100);
        }
        group.navPath.push(group.nav);
      });
      ensureArray(sellRows).forEach(function (row) {
        const meta = buildLeaderPeriodMeta((row && (row.sell_date || row.date)) || "", mode);
        if (!meta) return;
        if (!groups[meta.key]) {
          groups[meta.key] = {
            key: meta.key,
            label: meta.label,
            sortValue: meta.sortValue,
            nav: 100,
            navPath: [100],
            tradeReturns: [],
          };
        }
        const returnPct = Number(row && row.sell_return_pct);
        if (Number.isFinite(returnPct)) {
          groups[meta.key].tradeReturns.push(returnPct);
        }
      });
      return Object.keys(groups).map(function (key) {
        const item = groups[key];
        const tradeReturns = ensureArray(item.tradeReturns);
        const winningReturns = tradeReturns.filter(function (value) { return Number(value) > 0; });
        const losingReturns = tradeReturns.filter(function (value) { return Number(value) < 0; });
        const tradeCount = tradeReturns.length;
        return {
          key: item.key,
          label: item.label,
          sortValue: item.sortValue,
          trade_count: tradeCount,
          return_pct: item.nav - 100,
          win_rate_pct: tradeCount ? (winningReturns.length / tradeCount) * 100 : null,
          avg_profit_pct: winningReturns.length
            ? (winningReturns.reduce(function (sum, value) { return sum + Number(value || 0); }, 0) / winningReturns.length)
            : null,
          avg_loss_pct: losingReturns.length
            ? (losingReturns.reduce(function (sum, value) { return sum + Number(value || 0); }, 0) / losingReturns.length)
            : null,
          mdd_pct: calculateLeaderPeriodMdd(item.navPath),
        };
      }).sort(function (a, b) {
        return Number(a.sortValue || 0) - Number(b.sortValue || 0);
      });
    }

    function buildLeaderTradeLookup(snapshotPayload) {
      const byStock = {};
      const rowsToUse = ensureArray(snapshotPayload && snapshotPayload.rows);
      extractLeaderSellRows(rowsToUse).forEach(function (item) {
        const codeKey = String(item.stock_code || "").trim().toUpperCase();
        const nameKey = String(item.stock_name || "").trim();
        const stockKey = codeKey || nameKey;
        if (!stockKey) return;
        if (!byStock[stockKey]) {
          byStock[stockKey] = [];
        }
        byStock[stockKey].push(item);
      });
      Object.keys(byStock).forEach(function (key) {
        byStock[key] = byStock[key].slice().sort(function (a, b) {
          return String(a.sell_date || a.date || "").localeCompare(String(b.sell_date || b.date || ""));
        });
      });
      return byStock;
    }

    function buildLeaderCompareStockOptions(leftSnapshot, rightSnapshot) {
      const stockMap = {};
      [leftSnapshot, rightSnapshot].forEach(function (snapshot) {
        const rowsToUse = ensureArray(snapshot && snapshot.payload && snapshot.payload.rows);
        extractLeaderSellRows(rowsToUse).forEach(function (item) {
          const codeKey = String(item.stock_code || "").trim().toUpperCase();
          const nameKey = String(item.stock_name || "").trim();
          const key = codeKey || nameKey;
          if (!key) return;
          if (!stockMap[key]) {
            stockMap[key] = {
              key: key,
              stock_code: codeKey,
              stock_name: nameKey || codeKey || "-",
            };
          }
        });
      });
      return Object.keys(stockMap).map(function (key) { return stockMap[key]; }).sort(function (a, b) {
        return String(a.stock_name || a.key).localeCompare(String(b.stock_name || b.key), "ko");
      });
    }

    function applyBacktest() {
      setIndexBacktestStarted(true);
      setQueryState({
        index: indexKey,
        strategy: strategyKey,
        start: startDate,
        end: endDate,
      });
    }

    function applyLeaderBacktest(marketMode) {
      var normalizedMarket = marketMode === "us" ? "us" : "kr";
      const nextLeaderQuery = buildLeaderQueryFromControls(normalizedMarket, Date.now());
      setLeaderBacktestStarted(true);
      setIndexKey(normalizedMarket === "us" ? leaderUsBenchmark : "KS11");
      setQueryState(nextLeaderQuery);
      leaderLastQueryByMarketRef.current[normalizedMarket] = nextLeaderQuery;
      saveLeaderBacktestPrefs(normalizedMarket, nextLeaderQuery);
      setActiveLeaderSnapshot(null);
      setActiveLeaderSnapshotId(0);
      setLeaderSnapshotMessage("");
    }

    async function saveCurrentLeaderBacktest() {
      const payloadToSave = (activeLeaderSnapshot && activeLeaderSnapshot.payload) ? activeLeaderSnapshot.payload : data;
      const rowsToSave = ensureArray(payloadToSave && payloadToSave.rows);
      if (!payloadToSave || !rowsToSave.length || String(queryState.market || "kr") !== "kr") {
        setLeaderSnapshotMessage("저장할 국내 주도주 백테스트 결과가 없습니다.");
        return;
      }
      const nextLabel = window.prompt("저장 이름", leaderSnapshotDefaultLabel());
      if (nextLabel == null) {
        return;
      }
      const trimmedLabel = String(nextLabel || "").trim();
      if (!trimmedLabel) {
        setLeaderSnapshotMessage("저장 이름이 비어 있습니다.");
        return;
      }
      setLeaderSnapshotSaving(true);
      setLeaderSnapshotMessage("");
      try {
        const payload = await postJson("/api/strategy/snapshots", {
          strategy_group: "leader_kr",
          market: "kr",
          label: trimmedLabel,
          query: queryState,
          payload: payloadToSave,
        });
        const savedSnapshot = payload && payload.snapshot ? payload.snapshot : null;
        setActiveLeaderSnapshot(savedSnapshot);
        setActiveLeaderSnapshotId(savedSnapshot && savedSnapshot.id ? Number(savedSnapshot.id) : 0);
        setLeaderSnapshotMessage("저장 완료");
        await leaderSnapshotRequest.refresh(true);
      } catch (error) {
        setLeaderSnapshotMessage(error.message || String(error));
      } finally {
        setLeaderSnapshotSaving(false);
      }
    }

    async function loadLeaderSnapshot(snapshotId) {
      const targetId = Number(snapshotId || 0);
      if (!(targetId > 0)) {
        setActiveLeaderSnapshot(null);
        setActiveLeaderSnapshotId(0);
        return;
      }
      try {
        const payload = await fetchJson("/api/strategy/snapshots/" + targetId, { forceRefresh: true, noCache: true });
        const snapshot = payload && payload.snapshot ? payload.snapshot : null;
        if (!snapshot) {
          return;
        }
        const savedQuery = snapshot.query || {};
        hydrateLeaderControlsFromQuery(savedQuery);
        setQueryState(Object.assign({}, savedQuery));
        setStrategyMode("leader_top10");
        setLeaderBacktestStarted(false);
        setActiveLeaderSnapshot(snapshot);
        setActiveLeaderSnapshotId(targetId);
        setLeaderSnapshotMessage("저장 결과 불러옴");
      } catch (error) {
        setLeaderSnapshotMessage(error.message || String(error));
      }
    }

    async function submitLeaderAiChat(marketMode, payload, questionText) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      const question = String(questionText || "").trim();
      if (!question || !payload) {
        return;
      }
      setLeaderAiErrorByMarket(function (prev) {
        return Object.assign({}, prev, { [normalizedMarket]: "" });
      });
      setLeaderAiLoadingByMarket(function (prev) {
        return Object.assign({}, prev, { [normalizedMarket]: true });
      });
      setLeaderAiMessagesByMarket(function (prev) {
        const next = Object.assign({}, prev);
        const rows = ensureArray(next[normalizedMarket]).slice();
        rows.push({ role: "user", text: question, created_at: new Date().toISOString() });
        next[normalizedMarket] = rows;
        return next;
      });
      setLeaderAiInputByMarket(function (prev) {
        return Object.assign({}, prev, { [normalizedMarket]: "" });
      });
      try {
        const response = await postJson("/api/strategy/backtest/ai-chat", {
          market: normalizedMarket,
          question: question,
          query: Object.assign({}, queryState, { market: normalizedMarket }),
          payload: {
            strategy_name: payload.strategy_name,
            index_name: payload.index_name,
            start_date: payload.start_date,
            end_date: payload.end_date,
            summary: payload.summary || {},
            rows: ensureArray(payload.rows).slice(-180),
            signals: ensureArray(payload.signals).slice(-80),
          },
        });
        const result = response && response.result ? response.result : {};
        setLeaderAiMessagesByMarket(function (prev) {
          const next = Object.assign({}, prev);
          const rows = ensureArray(next[normalizedMarket]).slice();
          rows.push({
            role: "assistant",
            text: String(result.answer || "").trim() || "답변을 생성하지 못했습니다.",
            bullet_points: ensureArray(result.bullet_points).filter(Boolean),
            suggested_questions: ensureArray(result.suggested_questions).filter(Boolean),
            created_at: result.generated_at || new Date().toISOString(),
          });
          next[normalizedMarket] = rows;
          return next;
        });
      } catch (error) {
        setLeaderAiErrorByMarket(function (prev) {
          return Object.assign({}, prev, {
            [normalizedMarket]: error && error.message ? error.message : "AI 답변 요청 중 오류가 발생했습니다.",
          });
        });
      } finally {
        setLeaderAiLoadingByMarket(function (prev) {
          return Object.assign({}, prev, { [normalizedMarket]: false });
        });
      }
    }

    function renderLeaderAiPanel(marketMode, payload, mddContributorRows) {
      const normalizedMarket = marketMode === "us" ? "us" : "kr";
      const messages = ensureArray(leaderAiMessagesByMarket[normalizedMarket]);
      const inputValue = String((leaderAiInputByMarket && leaderAiInputByMarket[normalizedMarket]) || "");
      const loading = !!(leaderAiLoadingByMarket && leaderAiLoadingByMarket[normalizedMarket]);
      const error = String((leaderAiErrorByMarket && leaderAiErrorByMarket[normalizedMarket]) || "");
      return h(
        "div",
        { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "subsection-title" }, "AI 전략 리뷰"),
            h("div", { className: "summary-help" }, "현재 백테스트 결과와 20일 신고가→52주 신고가 전이 통계를 함께 사용합니다.")
          ),
          loading ? h("span", { className: "telegram-status-pill" }, "답변 생성 중") : null
        ),
        h(
          "div",
          { className: "mini-table-panel", style: { marginBottom: "10px", background: "#fbfdff" } },
          h("div", { className: "subsection-title" }, "MDD 구간 기여 종목"),
          h(DataTable, {
            rows: ensureArray(mddContributorRows).slice(0, 10),
            emptyMessage: "MDD 기여 종목 데이터가 없습니다.",
            compact: true,
            columns: [
              { key: "stock_name", label: "종목", render: function (row) {
                return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row.trade || row); } }, row.stock_name || row.stock_code || "-");
              } },
              { key: "contribution_pct", label: "누적 기여", render: function (row) {
                return row.contribution_pct == null ? "-" : h("span", { className: pnlClass(row.contribution_pct) }, formatPercent(row.contribution_pct, 2));
              } },
              { key: "active_days", label: "영향 일수", render: function (row) { return numberFormat(row.active_days, 0) + "일"; } },
              { key: "trade_count", label: "매도 건", render: function (row) { return numberFormat(row.trade_count, 0) + "건"; } },
              { key: "latest_sell_date", label: "최근 매도일", render: function (row) { return row.latest_sell_date || "-"; } },
            ],
          })
        ),
        h(
          "div",
          {
            className: "strategy-scroll-panel",
            style: { maxHeight: "360px", overflowY: "auto", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#f8fbff" },
          },
          messages.length
            ? messages.map(function (message, index) {
                const isUser = message.role === "user";
                return h(
                  "div",
                  {
                    key: String(message.created_at || index) + "-" + index,
                    style: { display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "10px" },
                  },
                  h(
                    "div",
                    {
                      style: {
                        maxWidth: "88%",
                        border: "1px solid " + (isUser ? "#c7d8ff" : "#dbe7f5"),
                        background: isUser ? "#eef4ff" : "#ffffff",
                        borderRadius: "12px",
                        padding: "10px 12px",
                      },
                    },
                    h("div", { style: { whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#1e293b", fontSize: "13px" } }, message.text || "-"),
                    ensureArray(message.bullet_points).length
                      ? h("ul", { style: { margin: "8px 0 0", paddingLeft: "18px", color: "#475569", fontSize: "12px", lineHeight: 1.6 } },
                          ensureArray(message.bullet_points).map(function (item, bulletIndex) {
                            return h("li", { key: bulletIndex }, item);
                          })
                        )
                      : null
                  )
                );
              })
            : h("div", { className: "summary-help" }, "현재 전략의 약점, MDD 원인, 신고가 전이 통계 등에 대해 질문할 수 있습니다.")
        ),
        error ? h("div", { className: "summary-help", style: { color: "#dc2626", marginTop: "8px" } }, error) : null,
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", marginTop: "10px", alignItems: "end" } },
          h("textarea", {
            className: "text-input",
            rows: 3,
            value: inputValue,
            placeholder: "예: 20일 신고가 후 52주 신고가까지 평균 상승률과 탈락 비율을 설명해줘",
            onChange: function (event) {
              const nextValue = event.target.value;
              setLeaderAiInputByMarket(function (prev) {
                return Object.assign({}, prev, { [normalizedMarket]: nextValue });
              });
            },
          }),
          h("button", {
            type: "button",
            className: "primary-button",
            disabled: loading || !inputValue.trim(),
            onClick: function () { submitLeaderAiChat(normalizedMarket, payload, inputValue); },
          }, loading ? "답변 생성 중" : "질문하기")
        )
      );
    }

    function BacktestEventCurveChart(props) {
      var series = ensureArray(props && props.series).filter(function (item) {
        return ensureArray(item && item.points).length > 0;
      });
      if (!series.length) {
        return h("div", { className: "summary-help" }, "이벤트 이후 수익률 곡선 데이터가 없습니다.");
      }
      var width = Number(props && props.width) || 920;
      var height = Number(props && props.height) || 280;
      var paddingLeft = 44;
      var paddingRight = 18;
      var paddingTop = 16;
      var paddingBottom = 34;
      var innerWidth = Math.max(10, width - paddingLeft - paddingRight);
      var innerHeight = Math.max(10, height - paddingTop - paddingBottom);
      var palette = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ef4444"];
      var allPoints = [];
      series.forEach(function (item) {
        ensureArray(item.points).forEach(function (point) {
          var day = Number(point && point.day);
          var value = Number(point && point.avg_return_pct);
          if (Number.isFinite(day) && Number.isFinite(value)) {
            allPoints.push({ day: day, value: value });
          }
        });
      });
      if (!allPoints.length) {
        return h("div", { className: "summary-help" }, "이벤트 이후 수익률 곡선 데이터가 없습니다.");
      }
      var minDay = Math.min.apply(null, allPoints.map(function (item) { return item.day; }));
      var maxDay = Math.max.apply(null, allPoints.map(function (item) { return item.day; }));
      var minValue = Math.min(0, Math.min.apply(null, allPoints.map(function (item) { return item.value; })));
      var maxValue = Math.max(0, Math.max.apply(null, allPoints.map(function (item) { return item.value; })));
      if (!(maxDay > minDay)) maxDay = minDay + 1;
      if (!(maxValue > minValue)) {
        maxValue = minValue + 1;
      }
      var xOf = function (day) {
        return paddingLeft + (((day - minDay) / (maxDay - minDay)) * innerWidth);
      };
      var yOf = function (value) {
        return paddingTop + (1 - ((value - minValue) / (maxValue - minValue))) * innerHeight;
      };
      var zeroY = yOf(0);
      var yTicks = 5;
      var gridRows = [];
      for (var i = 0; i <= yTicks; i += 1) {
        var ratio = i / yTicks;
        var value = maxValue - ((maxValue - minValue) * ratio);
        var y = paddingTop + (innerHeight * ratio);
        gridRows.push(
          h("g", { key: "y-grid-" + i },
            h("line", { x1: paddingLeft, y1: y, x2: width - paddingRight, y2: y, stroke: "#e2e8f0", strokeWidth: 1 }),
            h("text", { x: 6, y: y + 4, fill: "#64748b", fontSize: 11 }, formatPercent(value, 1))
          )
        );
      }
      var xTickDays = [1, 5, 10, 20, 40, 60].filter(function (day) {
        return day >= minDay && day <= maxDay;
      });
      var xTickRows = xTickDays.map(function (day) {
        var x = xOf(day);
        return h("g", { key: "x-grid-" + day },
          h("line", { x1: x, y1: paddingTop, x2: x, y2: height - paddingBottom, stroke: "#f1f5f9", strokeWidth: 1 }),
          h("text", { x: x, y: height - 10, fill: "#64748b", fontSize: 11, textAnchor: "middle" }, "D+" + day)
        );
      });
      return h(
        "div",
        null,
        h(
          "div",
          { className: "score-history-lightweight-legend", style: { marginBottom: "8px" } },
          series.map(function (item, index) {
            return h(
              "span",
              { key: item.key || index, className: "legend-item" },
              h("span", { className: "legend-swatch", style: { background: palette[index % palette.length] } }),
              item.label || ("시리즈 " + (index + 1))
            );
          })
        ),
        h(
          "svg",
          { viewBox: "0 0 " + width + " " + height, style: { width: "100%", height: "280px", display: "block" } },
          gridRows,
          xTickRows,
          h("line", { x1: paddingLeft, y1: zeroY, x2: width - paddingRight, y2: zeroY, stroke: "#94a3b8", strokeDasharray: "4 4", strokeWidth: 1 }),
          series.map(function (item, index) {
            var points = ensureArray(item.points).filter(function (point) {
              return Number.isFinite(Number(point && point.day)) && Number.isFinite(Number(point && point.avg_return_pct));
            });
            if (!points.length) return null;
            var path = points.map(function (point, pointIndex) {
              var prefix = pointIndex === 0 ? "M" : "L";
              return prefix + xOf(Number(point.day)) + " " + yOf(Number(point.avg_return_pct));
            }).join(" ");
            return h("path", {
              key: item.key || index,
              d: path,
              fill: "none",
              stroke: palette[index % palette.length],
              strokeWidth: 2.5,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            });
          })
        )
      );
    }

    function renderLeaderBreakoutInsightsPanel(payload) {
      var insights = payload && payload.breakout_insights ? payload.breakout_insights : null;
      var summaryRows = ensureArray(insights && insights.summary_rows);
      var whipsawRows = ensureArray(insights && insights.whipsaw_rows);
      var forwardCurves = ensureArray(insights && insights.forward_curves);
      var clusterRows = ensureArray(insights && insights.cluster_rows);
      if (!summaryRows.length && !whipsawRows.length && !forwardCurves.length && !clusterRows.length) {
        return null;
      }
      return h(
        "div",
        { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "subsection-title" }, "신고가 돌파 분석"),
            h("div", { className: "summary-help" }, "실제 체결된 돌파 매매를 기준으로 분포, 휩소, 이벤트 이후 경로, 유형별 특성을 정리합니다.")
          )
        ),
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table" },
            h("div", { className: "subsection-title" }, "신고가 돌파 분포 요약"),
            h(DataTable, {
              rows: summaryRows,
              compact: true,
              emptyMessage: "돌파 요약 데이터가 없습니다.",
              columns: [
                { key: "label", label: "유형", render: function (row) { return row.label || "-"; } },
                { key: "event_count", label: "건수", render: function (row) { return numberFormat(row.event_count, 0) + "건"; } },
                { key: "avg_return_pct", label: "평균 수익률", render: function (row) { return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2)); } },
                { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
                { key: "avg_peak_return_pct", label: "평균 최대 상승", render: function (row) { return row.avg_peak_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_peak_return_pct) }, formatPercent(row.avg_peak_return_pct, 2)); } },
                { key: "hit_20_pct", label: "+20% 도달", render: function (row) { return row.hit_20_pct == null ? "-" : formatPercent(row.hit_20_pct, 1); } },
                { key: "reached_52w_pct", label: "52주 신고가 도달", render: function (row) { return row.reached_52w_pct == null ? "-" : formatPercent(row.reached_52w_pct, 1); } },
              ],
            })
          ),
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table" },
            h("div", { className: "subsection-title" }, "휩소 분석"),
            h("div", { className: "summary-help", style: { marginBottom: "8px" } }, "손실 또는 본전 이하로 매도된 거래를 매도 사유별로 묶었습니다."),
            h(DataTable, {
              rows: whipsawRows,
              compact: true,
              emptyMessage: "휩소 분석 대상 거래가 없습니다.",
              columns: [
                { key: "reason", label: "매도 사유", render: function (row) { return row.reason || "-"; } },
                { key: "event_count", label: "건수", render: function (row) { return numberFormat(row.event_count, 0) + "건"; } },
                { key: "share_pct", label: "비중", render: function (row) { return row.share_pct == null ? "-" : formatPercent(row.share_pct, 1); } },
                { key: "avg_return_pct", label: "평균 손익", render: function (row) { return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2)); } },
                { key: "avg_hold_days", label: "평균 보유일", render: function (row) { return row.avg_hold_days == null ? "-" : numberFormat(row.avg_hold_days, 1) + "일"; } },
              ],
            })
          )
        ),
        h(
          "div",
          { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
          h("div", { className: "subsection-title" }, "이벤트 이후 수익률 곡선"),
          h("div", { className: "summary-help", style: { marginBottom: "8px" } }, "돌파 이벤트 이후 D+1, 3, 5, 10, 20, 40, 60 거래일 평균 수익률입니다."),
          h(BacktestEventCurveChart, { series: forwardCurves })
        ),
        h(
          "div",
          { className: "mini-table-panel strategy-wide-table", style: { marginTop: "12px" } },
          h("div", { className: "subsection-title" }, "유형별 클러스터 비교"),
          h(DataTable, {
            rows: clusterRows,
            compact: true,
            emptyMessage: "클러스터 비교 데이터가 없습니다.",
            columns: [
              { key: "cluster", label: "클러스터", render: function (row) { return row.cluster || "-"; } },
              { key: "event_count", label: "건수", render: function (row) { return numberFormat(row.event_count, 0) + "건"; } },
              { key: "avg_return_pct", label: "평균 수익률", render: function (row) { return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2)); } },
              { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
              { key: "avg_peak_return_pct", label: "평균 최대 상승", render: function (row) { return row.avg_peak_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_peak_return_pct) }, formatPercent(row.avg_peak_return_pct, 2)); } },
              { key: "whipsaw_rate_pct", label: "휩소 비율", render: function (row) { return row.whipsaw_rate_pct == null ? "-" : formatPercent(row.whipsaw_rate_pct, 1); } },
            ],
          })
        )
      );
    }

    async function deleteLeaderSnapshot(snapshotId) {
      const targetId = Number(snapshotId || 0);
      if (!(targetId > 0)) {
        return;
      }
      if (!window.confirm("저장된 백테스트를 삭제할까요?")) {
        return;
      }
      try {
        await deleteJson("/api/strategy/snapshots/" + targetId);
        if (Number(activeLeaderSnapshotId || 0) === targetId) {
          setActiveLeaderSnapshot(null);
          setActiveLeaderSnapshotId(0);
        }
        if (String(compareLeftSnapshotId || "") === String(targetId)) {
          setCompareLeftSnapshotId("");
          setCompareLeftSnapshot(null);
        }
        if (String(compareRightSnapshotId || "") === String(targetId)) {
          setCompareRightSnapshotId("");
          setCompareRightSnapshot(null);
        }
        setLeaderSnapshotMessage("삭제 완료");
        await leaderSnapshotRequest.refresh(true);
      } catch (error) {
        setLeaderSnapshotMessage(error.message || String(error));
      }
    }

    useEffect(function () {
      if (!savedLeaderSnapshots.length) {
        return;
      }
      if (!compareLeftSnapshotId) {
        setCompareLeftSnapshotId(String(savedLeaderSnapshots[0].id || ""));
      }
      if (!compareRightSnapshotId && savedLeaderSnapshots.length > 1) {
        setCompareRightSnapshotId(String(savedLeaderSnapshots[1].id || ""));
      }
    }, [savedLeaderSnapshots, compareLeftSnapshotId, compareRightSnapshotId]);

    useEffect(function () {
      let cancelled = false;
      const targetId = Number(compareLeftSnapshotId || 0);
      if (!(targetId > 0)) {
        setCompareLeftSnapshot(null);
        return function () { cancelled = true; };
      }
      fetchJson("/api/strategy/snapshots/" + targetId, { forceRefresh: true, noCache: true })
        .then(function (payload) {
          if (!cancelled) {
            setCompareLeftSnapshot(payload && payload.snapshot ? payload.snapshot : null);
          }
        })
        .catch(function () {
          if (!cancelled) {
            setCompareLeftSnapshot(null);
          }
        });
      return function () { cancelled = true; };
    }, [compareLeftSnapshotId]);

    useEffect(function () {
      let cancelled = false;
      const targetId = Number(compareRightSnapshotId || 0);
      if (!(targetId > 0)) {
        setCompareRightSnapshot(null);
        return function () { cancelled = true; };
      }
      fetchJson("/api/strategy/snapshots/" + targetId, { forceRefresh: true, noCache: true })
        .then(function (payload) {
          if (!cancelled) {
            setCompareRightSnapshot(payload && payload.snapshot ? payload.snapshot : null);
          }
        })
        .catch(function () {
          if (!cancelled) {
            setCompareRightSnapshot(null);
          }
      });
      return function () { cancelled = true; };
    }, [compareRightSnapshotId]);

    useEffect(function () {
      const options = buildLeaderCompareStockOptions(compareLeftSnapshot, compareRightSnapshot);
      if (!options.length) {
        if (compareStockKey) {
          setCompareStockKey("");
        }
        return;
      }
      const exists = options.some(function (item) { return String(item.key) === String(compareStockKey || ""); });
      if (!exists) {
        setCompareStockKey(String(options[0].key || ""));
      }
    }, [compareLeftSnapshot, compareRightSnapshot, compareStockKey]);

    function applySectorBacktest() {
      setSectorBacktestStarted(true);
      setSelectedSectorDate("");
      setSectorQueryState({
        start: sectorStartDate,
        end: sectorEndDate,
        min_score: sectorMinScore,
        top_sectors: sectorTopCount,
        stocks_per_sector: sectorStocksCount,
        leverage: sectorLeverage,
        weight_method: sectorWeightMethod,
      });
    }

    function applyAdvancedBacktest() {
      setAdvancedBacktestStarted(true);
      setSelectedAdvancedDate("");
      setAdvancedQueryState({
        start: advancedStartDate,
        end: advancedEndDate,
        min_score: advancedMinScore,
        top_sectors: advancedTopSectors,
        stocks_per_sector: advancedStocksCount,
        max_leverage: advancedMaxLeverage,
        benchmark: advancedBenchmark,
        weight_method: advancedWeightMethod,
        beta_window: advancedBetaWindow,
        min_breadth: advancedMinBreadth,
        max_disparity: advancedMaxDisparity,
        trading_rank_limit: advancedTradingRankLimit,
        stock_selection: advancedStockSelection,
      });
    }

    function renderModeButton(mode, label) {
      return h(
        "button",
        {
          type: "button",
          className: "strategy-mode-button" + (strategyMode === mode ? " active" : ""),
          onClick: function () { switchStrategyMode(mode); },
        },
        label
      );
    }

    function formatWon(value) {
      return numberFormat(Number(value || 0), 0) + "원";
    }

    function closeStrategyTradeChart() {
      setStrategyTradeChartPopup({ open: false, trade: null, loading: false, error: "", data: null, scoreLoading: false, scoreError: "", scoreData: null });
    }

    function strategyTradeMarkers(trade) {
      const markers = [];
      if (trade && trade.entry_date) {
        markers.push({
          date: trade.entry_date,
          type: "buy",
          label: "매수",
          price: trade.entry_price,
        });
      }
      if (trade && trade.exit_date) {
        markers.push({
          date: trade.exit_date,
          type: "sell",
          label: "매도",
          price: trade.exit_price,
          return_pct: trade.trade_return_pct,
        });
      } else if (trade && trade.apply_date && (trade.action === "매수" || trade.action === "증액")) {
        markers.push({
          date: trade.apply_date,
          type: "buy",
          label: trade.action,
        });
      }
      return markers;
    }

    function addDaysToIsoDate(value, days) {
      if (!value) return "";
      const text = String(value).slice(0, 10);
      const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return "";
      const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (Number.isNaN(dt.getTime())) return "";
      dt.setDate(dt.getDate() + Number(days || 0));
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    }

    function openStrategyTradeChart(trade) {
      const row = trade || {};
      const rawCode = String(row.stock_code || "").trim();
      const normalizedDigits = rawCode.replace(/\D/g, "");
      const normalizedSymbol = rawCode.toUpperCase();
      const isGlobalSymbol = !!normalizedSymbol && /[A-Z]/.test(normalizedSymbol) && !normalizedDigits;
      const code = normalizedDigits ? normalizedDigits.padStart(6, "0") : "";
      const name = row.stock_name || row.resolved_name || row.stock_key || normalizedSymbol || "";
      if (isGlobalSymbol) {
        openStockInGlobalCompany({
          stock_code: normalizedSymbol,
          stock_name: name,
        });
        return;
      }
      if (!code || code === "000000") {
        return;
      }
      setStrategyTradeChartPopup({ open: true, trade: row, loading: true, error: "", data: null, scoreLoading: true, scoreError: "", scoreData: null });
      const params = new URLSearchParams();
      params.set("code", code);
      params.set("name", name);
      const focusStartDate = row.entry_date || row.buy_date || row.apply_date || row.date || "";
      const focusEndDate = row.exit_date || row.sell_date || row.date || row.apply_date || focusStartDate;
      const chartStartDate = addDaysToIsoDate(focusStartDate, -14);
      const chartEndDate = addDaysToIsoDate(focusEndDate, 14);
      if (chartStartDate && chartEndDate) {
        params.set("start_date", chartStartDate);
        params.set("end_date", chartEndDate);
      } else {
        params.set("months", "3");
      }
      fetchJson("/api/stocks/chart-preview?" + params.toString())
        .then(function (payload) {
          const tradeMarkers = strategyTradeMarkers(row);
          setStrategyTradeChartPopup({
            open: true,
            trade: row,
            loading: false,
            error: "",
            data: Object.assign({}, payload, {
              entry_markers: ensureArray(payload.entry_markers).concat(tradeMarkers),
            }),
            scoreLoading: true,
            scoreError: "",
            scoreData: null,
          });
        })
        .catch(function (error) {
          setStrategyTradeChartPopup({
            open: true,
            trade: row,
            loading: false,
            error: error.message || String(error),
            data: null,
            scoreLoading: true,
            scoreError: "",
            scoreData: null,
          });
        });

      const scoreParams = new URLSearchParams();
      scoreParams.set("days", "62");
      if (code && code !== "000000") scoreParams.set("stock_code", code);
      if (name) scoreParams.set("stock_name", name);
      if (row.date) scoreParams.set("end_date", row.date);
      fetchJson("/api/themes/score-history?" + scoreParams.toString(), { noCache: true })
        .then(function (payload) {
          setStrategyTradeChartPopup(function (current) {
            if (!current.open) return current;
            return Object.assign({}, current, { scoreLoading: false, scoreError: "", scoreData: payload });
          });
        })
        .catch(function (error) {
          setStrategyTradeChartPopup(function (current) {
            if (!current.open) return current;
            return Object.assign({}, current, { scoreLoading: false, scoreError: error.message || String(error), scoreData: null });
          });
        });
    }

    function renderStrategyTradeChartPopup() {
      if (!strategyTradeChartPopup.open) {
        return null;
      }
      const trade = strategyTradeChartPopup.trade || {};
      const label = trade.stock_name || trade.resolved_name || trade.stock_key || "종목";
      const code = String(trade.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      return h(
        "div",
        { className: "modal-backdrop theme-stock-chart-backdrop", onClick: closeStrategyTradeChart },
        h(
          "div",
          {
            className: "modal-panel theme-stock-chart-modal strategy-trade-chart-modal",
            onClick: function (event) { event.stopPropagation(); },
          },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, "Trade Review"),
              h("h2", null, label + (code && code !== "000000" ? " (" + code + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeStrategyTradeChart }, "닫기")
          ),
          h(
            "div",
            { className: "strategy-trade-chart-summary" },
            h("span", null, "편입 " + (trade.entry_date || trade.apply_date || "-")),
            h("span", null, "편출 " + (trade.exit_date || "-")),
            h("strong", { className: pnlClass(trade.trade_return_pct) }, "수익률 " + (trade.trade_return_pct == null ? "-" : formatPercent(trade.trade_return_pct, 2))),
            trade.holding_days != null ? h("span", null, "보유 " + numberFormat(trade.holding_days, 0) + "일") : null
          ),
          h(StockChartPreview, {
            label: label,
            loading: strategyTradeChartPopup.loading,
            error: strategyTradeChartPopup.error,
            data: strategyTradeChartPopup.data,
          }),
          h(
            "div",
            { className: "mini-table-panel", style: { marginTop: "10px" } },
            h("div", { className: "subsection-title" }, "점수/주가 추이 (2개월)"),
            strategyTradeChartPopup.scoreLoading
              ? h(LoadingBlock, { compact: true, label: "\uc810\uc218 \ucd94\uc774 \ubd88\ub7ec\uc624\ub294 \uc911" })
              : strategyTradeChartPopup.scoreError
                ? h("div", { className: "summary-help danger-text" }, strategyTradeChartPopup.scoreError)
                : (strategyTradeChartPopup.scoreData && ensureArray(strategyTradeChartPopup.scoreData.rows).length
                  ? h(ScoreHistoryChart, {
                      rows: strategyTradeChartPopup.scoreData.rows,
                      markers: ensureArray(trade.markers),
                    })
                  : h(EmptyState, { compact: true, message: "\uc810\uc218 \ucd94\uc774 \ub370\uc774\ud130\uac00 \uc5c6\uc2b5\ub2c8\ub2e4." }))
          )
        )
      );
    }

    function renderDiagnosticResult() {
      const diagnosis = diagnosticData.diagnosis || {};
      const scenarios = ensureArray(diagnosticData.scenarios);
      const tailSummary = diagnosis.tail_summary || {};
      const worstStocks = ensureArray(diagnosis.worst_stocks);
      const topContributors = ensureArray(diagnosis.top_contributors);
      const sectorContribution = ensureArray(diagnosis.sector_contribution);
      const feedback = ensureArray(diagnosis.feedback);
      const tailRule = diagnosis.tail_rule || {};
      const tailRuleExamples = ensureArray(tailRule.examples);
      const tailRuleRules = ensureArray(tailRule.rules);
      const tailRuleModeCounts = ensureArray(tailRule.mode_counts);
      return diagnosticRequest.error
        ? h(ErrorPanel, { message: diagnosticRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel portfolio-diagnostic-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, diagnosticData.strategy_name || "현재 방식 진단"),
                h("div", { className: "summary-help" }, diagnosticData.description || "실제 포트폴리오 수익을 기준으로 개선 시나리오를 비교합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (diagnosticData.start_date || "-") + " ~ " + (diagnosticData.end_date || "-"))
            ),
            diagnosticRequest.loading && !diagnosticRows.length
              ? h(LoadingPanel, { label: diagnosticRequest.label })
              : diagnosticRows.length
                ? h(React.Fragment, null,
                    h(
                      "div",
                      { className: "summary-grid-small strategy-summary-grid sector-rotation-summary-grid" },
                      h(SummaryCard, { label: "현재 수익률", value: formatPercent(diagnosticSummary.total_return_pct, 2), help: "포트폴리오 수익 페이지 기준" }),
                      h(SummaryCard, { label: "꼬리 손실 기여", value: formatPercent(diagnosticSummary.tail_loss_contribution_pct_points, 2), help: "음의 기여 종목 합계" }),
                      h(SummaryCard, { label: "꼬리 종목 수", value: numberFormat(diagnosticSummary.tail_stock_count, 0) + "개", help: "손실 또는 음의 기여도 종목" }),
                      h(SummaryCard, { label: "실전 꼬리룰 비중", value: formatPercent(diagnosticSummary.avg_rule_tail_weight_pct, 1), help: "당시 조건으로 판별한 일별 꼬리 비중" }),
                      h(SummaryCard, { label: "시장 OFF 일수", value: numberFormat(diagnosis.market_off_days, 0) + "일", help: "양 지수 20일선 아래" }),
                      h(SummaryCard, { label: "섹터 신호 일수", value: numberFormat(diagnosis.sector_gate_days, 0) + "일", help: "강한 섹터 신호가 켜진 날" })
                    ),
                    h(PortfolioDiagnosticChart, { rows: diagnosticRows }),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                      h(
                        "div",
                        { className: "strategy-feedback-list" },
                        tailRuleRules.length
                          ? tailRuleRules.map(function (text, index) {
                              return h("div", { key: index, className: "strategy-feedback-item" }, text);
                            })
                          : h("div", { className: "summary-help" }, "꼬리 판별 규칙이 없습니다.")
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "꼬리룰 판별 모드"),
                      h(DataTable, {
                        rows: tailRuleModeCounts,
                        emptyMessage: "섹터 기여도 데이터가 없습니다.",
                        columns: [
                          { key: "mode", label: "모드" },
                          { key: "count", label: "건수", render: function (row) { return numberFormat(row.count, 0) + "건"; } },
                        ],
                      })
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "개선 시나리오 표"),
                        h(DataTable, {
                          rows: scenarios,
                          emptyMessage: "비교 시나리오가 없습니다.",
                          columns: [
                            { key: "name", label: "전략" },
                            { key: "total_return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2)); } },
                            { key: "excess_vs_actual_pct", label: "현재 대비", render: function (row) { return h("span", { className: pnlClass(row.excess_vs_actual_pct) }, formatPercent(row.excess_vs_actual_pct, 2)); } },
                            { key: "mdd_pct", label: "MDD", render: function (row) { return formatPercent(row.mdd_pct, 2); } },
                            { key: "cagr_pct", label: "CAGR", render: function (row) { return row.cagr_pct == null ? "-" : formatPercent(row.cagr_pct, 2); } },
                            { key: "description", label: "의미" },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "전략 피드백"),
                        h(
                          "div",
                          { className: "strategy-feedback-list" },
                          feedback.length
                            ? feedback.map(function (text, index) {
                                return h("div", { key: index, className: "strategy-feedback-item" }, text);
                              })
                            : h("div", { className: "summary-help" }, "피드백 데이터가 없습니다." )
                        )
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "꼬리 규칙 예시"),
                      h(DataTable, {
                        rows: tailRuleExamples,
                        emptyMessage: "실전 꼬리룰에 걸린 종목이 없습니다.",
                        columns: [
                          { key: "date", label: "일자" },
                          { key: "sector", label: "섹터" },
                          { key: "stock_name", label: "종목", render: function (row) { return row.stock_name || row.stock_code || "-"; } },
                          { key: "rule_mode", label: "모드", render: function (row) { return row.rule_mode || "-"; } },
                          { key: "position_state", label: "상태", render: function (row) {
                            const labelMap = { "new": "신규", "increase": "증액", "decrease": "감액", "held": "보유" };
                            return labelMap[row.position_state] || row.position_state || "-";
                          } },
                          { key: "score", label: "점수", render: function (row) { return row.score == null ? "-" : numberFormat(row.score, 1); } },
                          { key: "disparity", label: "이격", render: function (row) { return row.disparity == null ? "-" : formatPercent(row.disparity, 1); } },
                          { key: "prior_contribution_pct_points", label: "누적기여", render: function (row) { return h("span", { className: pnlClass(row.prior_contribution_pct_points) }, formatPercent(row.prior_contribution_pct_points, 2)); } },
                          { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          { key: "reason", label: "적용 근거" },
                        ],
                      })
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "꼬리 손실 후보"),
                        h(DataTable, {
                          rows: worstStocks,
                          emptyMessage: "꼬리 후보가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "resolved_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || row.stock_code || "-"; } },
                            { key: "total_pnl", label: "총손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatWon(row.total_pnl)); } },
                            { key: "total_return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2)); } },
                            { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "수익 기여 종목"),
                        h(DataTable, {
                          rows: topContributors,
                          emptyMessage: "기여 종목이 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "resolved_name", label: "종목", render: function (row) { return row.resolved_name || row.stock_name || row.stock_code || "-"; } },
                            { key: "total_pnl", label: "총손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatWon(row.total_pnl)); } },
                            { key: "total_return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2)); } },
                            { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          ],
                        })
                      )
                    ),
                    h(
                      "div",
                      { className: "mini-table-panel strategy-wide-table" },
                      h("div", { className: "subsection-title" }, "섹터별 기여도"),
                      h(DataTable, {
                        rows: sectorContribution,
                        emptyMessage: "섹터 기여도 데이터가 없습니다.",
                        columns: [
                          { key: "sector", label: "섹터" },
                          { key: "stock_count", label: "종목", render: function (row) { return numberFormat(row.stock_count, 0); } },
                          { key: "total_pnl", label: "총손익", render: function (row) { return h("span", { className: pnlClass(row.total_pnl) }, formatWon(row.total_pnl)); } },
                          { key: "contribution_pct_points", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct_points) }, formatPercent(row.contribution_pct_points, 2)); } },
                          { key: "winners", label: "승/패", render: function (row) { return numberFormat(row.winners, 0) + " / " + numberFormat(row.losers, 0); } },
                        ],
                      })
                    )
                  )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
          );
    }

    function renderIndexControls() {
      return h(
        "div",
        { className: "strategy-control-grid" },
        h("label", null,
          h("span", null, "비교지수"),
          h("select", {
            className: "select-input",
            value: indexKey,
            onChange: function (event) { setIndexKey(event.target.value); },
          }, availableIndexes.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "전략"),
          h("select", {
            className: "select-input",
            value: strategyKey,
            onChange: function (event) { setStrategyKey(event.target.value); },
          }, availableStrategies.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "기간 시작"),
          h("input", {
            className: "text-input",
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "기간 마감"),
          h("input", {
            className: "text-input",
            type: "date",
            value: endDate,
            onChange: function (event) { setEndDate(event.target.value); },
          })
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: applyBacktest,
            disabled: indexRequest.loading,
          },
          indexRequest.loading ? "계산 중" : "백테스트 실행"
        )
      );
    }

    function renderLeaderControls(marketMode) {
      var isUsLeaderMode = marketMode === "us";
      function renderLeaderConditionTitle(label, checked, onChange) {
        return h(
          "span",
          { className: "strategy-condition-title" },
          h("input", {
            type: "checkbox",
            checked: !!checked,
            onChange: function (event) { onChange(event.target.checked); },
          }),
          " " + label
        );
      }
      return h(
        "div",
        { className: "strategy-control-grid" },
        h("label", null,
          renderLeaderConditionTitle("편입 TopN", leaderUseEntryTopN, setLeaderUseEntryTopN),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderTopN,
            disabled: !leaderUseEntryTopN,
            onChange: function (event) { setLeaderTopN(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("편출 TopN", leaderUseExitTopN, setLeaderUseExitTopN),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderExitTopN,
            disabled: !leaderUseExitTopN,
            onChange: function (event) { setLeaderExitTopN(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("편입기준", leaderUseEntryThreshold, setLeaderUseEntryThreshold),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderEntryThreshold,
            disabled: !leaderUseEntryThreshold,
            onChange: function (event) { setLeaderEntryThreshold(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("편출기준", leaderUseExitThreshold, setLeaderUseExitThreshold),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderExitThreshold,
            disabled: !leaderUseExitThreshold,
            onChange: function (event) { setLeaderExitThreshold(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("로스컷", leaderUseStopLoss, setLeaderUseStopLoss),
          h("select", {
            className: "select-input",
            value: leaderStopLossMode,
            disabled: !leaderUseStopLoss,
            onChange: function (event) { setLeaderStopLossMode(event.target.value); },
          },
            h("option", { value: "pct" }, "평가손실 %"),
            h("option", { value: "atr" }, "ATR")
          ),
          leaderStopLossMode === "pct"
            ? h("input", {
                className: "text-input",
                type: "number",
                min: "0",
                step: "0.1",
                value: leaderStopLossPct,
                disabled: !leaderUseStopLoss,
                onChange: function (event) { setLeaderStopLossPct(event.target.value); },
              })
            : h(React.Fragment, null,
                h("input", {
                  className: "text-input",
                  type: "number",
                  min: "0",
                  step: "0.1",
                  value: leaderStopLossPct,
                  disabled: !leaderUseStopLoss,
                  onChange: function (event) { setLeaderStopLossPct(event.target.value); },
                }),
                h("div", { className: "summary-help" }, "매수가 대비 입력한 ATR 배수만큼 역행 시 강제 매도")
              )
        ),
        h("label", null,
          h("span", null, "추세 이탈 매도"),
          h("div", { className: "toggle-group", style: { gap: "12px", alignItems: "center" } },
            h("label", { className: "telegram-all-room-toggle", style: { padding: 0, border: "none", background: "transparent" } },
              h("input", {
                type: "checkbox",
                checked: !!leaderExitMa20Break,
                onChange: function (event) { setLeaderExitMa20Break(event.target.checked); },
              }),
              h("em", null, "20일선")
            ),
            h("label", { className: "telegram-all-room-toggle", style: { padding: 0, border: "none", background: "transparent" } },
              h("input", {
                type: "checkbox",
                checked: !!leaderExitMa60Break,
                onChange: function (event) { setLeaderExitMa60Break(event.target.checked); },
              }),
              h("em", null, "60일선")
            )
          )
        ),
        h("label", null,
          renderLeaderConditionTitle("매수연속일", leaderUseEntryStreak, setLeaderUseEntryStreak),
          h("input", {
            className: "text-input",
            type: "number",
            min: "1",
            step: "1",
            value: leaderEntryStreakDays,
            disabled: !leaderUseEntryStreak,
            onChange: function (event) { setLeaderEntryStreakDays(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("급등 제외 기준일", leaderUseRunupFilter, setLeaderUseRunupFilter),
          h("input", {
            className: "text-input",
            type: "number",
            min: "0",
            step: "1",
            value: leaderRunupLookbackDays,
            disabled: !leaderUseRunupFilter,
            onChange: function (event) { setLeaderRunupLookbackDays(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("급등 제외 상승률", leaderUseRunupFilter, setLeaderUseRunupFilter),
          h("input", {
            className: "text-input",
            type: "number",
            step: "0.1",
            value: leaderRunupExcludePct,
            disabled: !leaderUseRunupFilter,
            onChange: function (event) { setLeaderRunupExcludePct(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("최소 시총(억)", leaderUseMinMarketCapFilter, setLeaderUseMinMarketCapFilter),
          h("input", {
            className: "text-input",
            type: "number",
            min: "0",
            step: "1",
            value: leaderMinMarketCap100m,
            disabled: !leaderUseMinMarketCapFilter,
            onChange: function (event) { setLeaderMinMarketCap100m(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("최대 ATR(%)", leaderUseAtrFilter, setLeaderUseAtrFilter),
          h("input", {
            className: "text-input",
            type: "number",
            min: "0",
            step: "0.1",
            value: leaderMaxAtr20,
            disabled: !leaderUseAtrFilter,
            onChange: function (event) { setLeaderMaxAtr20(event.target.value); },
          })
        ),
        h("label", null,
          renderLeaderConditionTitle("신고가 매수", String(leaderEntryHighFilter || "none") !== "none", function (nextEnabled) {
            setLeaderEntryHighFilter(nextEnabled ? "52w" : "none");
          }),
          h("select", {
            className: "select-input",
            value: leaderEntryHighFilter,
            disabled: String(leaderEntryHighFilter || "none") === "none",
            onChange: function (event) { setLeaderEntryHighFilter(event.target.value || "52w"); },
          },
            h("option", { value: "20d" }, "20일 신고가 매수"),
            h("option", { value: "60d" }, "60일 신고가 매수"),
            h("option", { value: "52w" }, "52주 신고가 매수")
          ),
          h("div", { className: "summary-help" }, "진입 시점 신고가 조건을 만족한 종목만 신규 편입")
        ),
        h("label", null,
          h("span", null, "편입 비중"),
          h("select", {
            className: "select-input",
            value: leaderAllocationMode,
            onChange: function (event) { setLeaderAllocationMode(event.target.value); },
          },
            h("option", { value: "score_weight" }, "\uc810\uc218 \ube44\uc911\ub300\ub85c"),
            h("option", { value: "fixed_20" }, "\uc885\ubaa9\ub2f9 20%"),
            h("option", { value: "vol_inverse" }, "\ubcc0\ub3d9\uc131 \uc5ed\uac00\uc911")
          )
        ),
        isUsLeaderMode ? h("label", null,
          h("span", null, "비교 지수"),
          h("select", {
            className: "select-input",
            value: leaderUsBenchmark,
            onChange: function (event) { setLeaderUsBenchmark(event.target.value || "US500"); },
          },
            h("option", { value: "US500" }, "S&P 500"),
            h("option", { value: "NDX100" }, "NASDAQ 100")
          )
        ) : null,
        h("label", null,
          h("span", null, "기간 시작"),
          h("input", {
            className: "text-input",
            type: "date",
            value: startDate,
            onChange: function (event) { setStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "기간 마감"),
          h("input", {
            className: "text-input",
            type: "date",
            value: endDate,
            onChange: function (event) { setEndDate(event.target.value); },
          })
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: function () { applyLeaderBacktest(isUsLeaderMode ? "us" : "kr"); },
            disabled: indexRequest.loading,
          },
          indexRequest.loading ? "계산 중" : "백테스트 실행"
        )
      );
    }

    function renderLeaderResult() {
      var expectedLeaderMarket = strategyMode === "us_leader" ? "us" : "kr";
      var liveDataMatchesMarket = !data.market || String(data.market) === expectedLeaderMarket;
      var leaderSnapshotPayload = (strategyMode === "leader_top10" && activeLeaderSnapshot && activeLeaderSnapshot.payload)
        ? activeLeaderSnapshot.payload
        : (liveDataMatchesMarket ? data : {});
      var leaderRows = ensureArray(leaderSnapshotPayload && leaderSnapshotPayload.rows);
      var leaderSummary = (leaderSnapshotPayload && leaderSnapshotPayload.summary) || {};
      var leaderMarketMode = String(
        (strategyMode === "leader_top10" && activeLeaderSnapshot && activeLeaderSnapshot.query && activeLeaderSnapshot.query.market)
        || queryState.market
        || (strategyMode === "us_leader" ? "us" : "kr")
      );
      var leaderTitleText = leaderMarketMode === "us" ? "미국 주도주 전략" : "국내 주도주 전략";
      var benchmarkLabel = String((leaderSnapshotPayload && leaderSnapshotPayload.index_name) || (leaderMarketMode === "us"
        ? (String(queryState.index || leaderUsBenchmark) === "NDX100" ? "NASDAQ 100" : "S&P 500")
        : "KOSPI"));
      function leaderPriceText(value) {
        if (value == null || !Number.isFinite(Number(value))) return "-";
        return leaderMarketMode === "us"
          ? "$" + numberFormat(value, 2)
          : numberFormat(value, 0) + "원";
      }
      var leaderAllocationModeValue = queryState.allocation_mode || leaderAllocationMode || "score_weight";
      var leaderAllocationLabel = leaderAllocationModeValue === "fixed_20"
        ? "\uc885\ubaa9\ub2f9 20%"
        : (leaderAllocationModeValue === "vol_inverse" ? "\ubcc0\ub3d9\uc131 \uc5ed\uac00\uc911" : "\uc810\uc218 \ube44\uc911\ub300\ub85c");
      var leaderUseEntryTopNLabel = !!(queryState.use_entry_top_n != null ? queryState.use_entry_top_n : leaderUseEntryTopN);
      var leaderUseExitTopNLabel = !!(queryState.use_exit_top_n != null ? queryState.use_exit_top_n : leaderUseExitTopN);
      var leaderUseEntryThresholdLabel = !!(queryState.use_entry_threshold != null ? queryState.use_entry_threshold : leaderUseEntryThreshold);
      var leaderUseExitThresholdLabel = !!(queryState.use_exit_threshold != null ? queryState.use_exit_threshold : leaderUseExitThreshold);
      var leaderUseStopLossLabel = !!(queryState.use_stop_loss != null ? queryState.use_stop_loss : leaderUseStopLoss);
      var leaderStopLossModeLabel = String(queryState.stop_loss_mode || leaderStopLossMode || "pct");
      var leaderStopLossLabel = Number(queryState.stop_loss_pct != null ? queryState.stop_loss_pct : leaderStopLossPct || 0);
      var leaderExitMa20BreakLabel = !!(queryState.exit_ma20_break != null ? queryState.exit_ma20_break : leaderExitMa20Break);
      var leaderExitMa60BreakLabel = !!(queryState.exit_ma60_break != null ? queryState.exit_ma60_break : leaderExitMa60Break);
      var leaderUseEntryStreakLabel = !!(queryState.use_entry_streak != null ? queryState.use_entry_streak : leaderUseEntryStreak);
      var leaderUseRunupFilterLabel = !!(queryState.use_runup_filter != null ? queryState.use_runup_filter : leaderUseRunupFilter);
      var leaderRunupLookbackLabel = Number(queryState.runup_lookback_days != null ? queryState.runup_lookback_days : leaderRunupLookbackDays || 0);
      var leaderRunupExcludeLabel = Number(queryState.runup_exclude_pct != null ? queryState.runup_exclude_pct : leaderRunupExcludePct || 0);
      var leaderUseMinMarketCapFilterLabel = !!(queryState.use_min_market_cap_filter != null ? queryState.use_min_market_cap_filter : leaderUseMinMarketCapFilter);
      var leaderMinMarketCapLabel = Number(queryState.min_market_cap_100m != null ? queryState.min_market_cap_100m : leaderMinMarketCap100m || 0);
      var leaderUseAtrFilterLabel = !!(queryState.use_atr_filter != null ? queryState.use_atr_filter : leaderUseAtrFilter);
      var leaderMaxAtr20Label = Number(queryState.max_atr_20 != null ? queryState.max_atr_20 : leaderMaxAtr20 || 0);
      var leaderEntryHighFilterLabel = String(queryState.entry_high_filter || leaderEntryHighFilter || "none");
      var leaderEntryHighFilterText = "";
      if (leaderEntryHighFilterLabel === "20d") {
        leaderEntryHighFilterText = "20일 신고가만 매수";
      } else if (leaderEntryHighFilterLabel === "60d") {
        leaderEntryHighFilterText = "60일 신고가만 매수";
      } else if (leaderEntryHighFilterLabel === "52w") {
        leaderEntryHighFilterText = "52주 신고가만 매수";
      }
      var selectedLeaderLabel = leaderTitleText
        + (leaderUseEntryTopNLabel ? " / \uc9c4\uc785Top" + numberFormat(Number(queryState.top_n || leaderTopN || 100), 0) : " / \uc9c4\uc785TopN \ud574\uc81c")
        + (leaderUseExitTopNLabel ? " / \uc720\uc9c0Top" + numberFormat(Number(queryState.exit_top_n || leaderExitTopN || queryState.top_n || leaderTopN || 100), 0) : " / \ud3b8\ucd9cTopN \ud574\uc81c")
        + (leaderUseEntryThresholdLabel ? " / \ub9e4\uc218 " + numberFormat(Number(queryState.entry_threshold != null ? queryState.entry_threshold : leaderEntryThreshold), 1) : "")
        + (leaderUseExitThresholdLabel ? " / \ub9e4\ub3c4 " + numberFormat(Number(queryState.exit_threshold != null ? queryState.exit_threshold : leaderExitThreshold), 1) : "")
        + (leaderUseStopLossLabel ? (leaderStopLossModeLabel === "atr" ? " / " + numberFormat(leaderStopLossLabel, 1) + "ATR \ub85c\uc2a4\ucef7" : " / \ub85c\uc2a4\ucef7 " + numberFormat(leaderStopLossLabel, 1) + "%") : "")
        + (leaderExitMa20BreakLabel ? " / 20\uc77c\uc120 \uc774\ud0c8" : "")
        + (leaderExitMa60BreakLabel ? " / 60\uc77c\uc120 \uc774\ud0c8" : "")
        + (leaderUseEntryStreakLabel ? " / \ub9e4\uc218 " + numberFormat(Number(queryState.entry_streak_days != null ? queryState.entry_streak_days : leaderEntryStreakDays || 1), 0) + "\uc77c \uc5f0\uc18d" : "")
        + (leaderUseRunupFilterLabel && leaderRunupLookbackLabel > 0 ? " / " + numberFormat(leaderRunupLookbackLabel, 0) + "\uc77c " + numberFormat(leaderRunupExcludeLabel, 1) + "% \uae09\ub4f1 \uc81c\uc678" : "")
        + (leaderUseMinMarketCapFilterLabel && leaderMinMarketCapLabel > 0 ? " / \uc2dc\ucd1d " + numberFormat(leaderMinMarketCapLabel, 0) + "\uc5b5+" : "")
        + (leaderUseAtrFilterLabel && leaderMaxAtr20Label > 0 ? " / ATR " + numberFormat(leaderMaxAtr20Label, 1) + "% 이하" : "")
        + (leaderEntryHighFilterText ? " / " + leaderEntryHighFilterText : "")
        + " / " + leaderAllocationLabel;
      var holdingsTimelineRows = leaderRows
        .map(function (row) {
          var holdingsAll = ensureArray(row.holdings)
            .filter(function (item) { return Number(item && item.weight_pct) > 0; })
            .sort(function (a, b) { return Number(b.weight_pct || 0) - Number(a.weight_pct || 0); });
          var holdings = holdingsAll.slice(0, 5);
          var text = holdings.map(function (item) {
              var name = item.stock_name || item.stock_key || "-";
              return name + " " + formatPercent(item.weight_pct, 1);
          }).join(", ");
          var allText = holdingsAll.map(function (item) {
            var name = item.stock_name || item.stock_key || "-";
            return name + " " + formatPercent(item.weight_pct, 1);
          }).join(", ");
          var entryExit = row.entry_exit || {};
          var buys = ensureArray(entryExit.buy).join(", ");
          var sells = ensureArray(entryExit.sell).join(", ");
          var sectors = ensureArray(row.sector_weights).map(function (item) {
            return (item.sector || "-") + " " + formatPercent(item.weight_pct, 1);
          }).join(", ");
          return {
            date: row.date,
            holdings_count: Number(row.holdings_count || holdingsAll.length || 0),
            all_holdings: allText || "-",
            top5_holdings: text || "-",
            entry_exit: (buys ? "\ud3b8\uc785: " + buys : "") + ((buys && sells) ? " | " : "") + (sells ? "\ud3b8\ucd9c: " + sells : "") || "-",
            sector_weight_sum: sectors || "-",
          };
        });
      var tradeEventRows = [];
      leaderRows.forEach(function (row) {
        ensureArray(row.entry_exit && row.entry_exit.buy_details).forEach(function (detail) {
          tradeEventRows.push({
            date: row.date,
            signal_date: detail.signal_date || row.signal_date || "",
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            action: "\ub9e4\uc218",
            buy_reason: detail.reason || "",
            reason: "",
            buy_avg_price: detail.buy_price,
            buy_date: detail.buy_date || row.date,
            sell_avg_price: null,
            sell_date: null,
            sell_return_pct: null,
            markers: [{ date: row.date, type: "buy", label: "\ub9e4\uc218" }],
          });
        });
        ensureArray(row.entry_exit && row.entry_exit.sell_details).forEach(function (detail) {
          tradeEventRows.push({
            date: row.date,
            signal_date: detail.signal_date || row.signal_date || "",
            stock_code: detail.stock_code || "",
            stock_name: detail.stock_name || detail.stock_code || "-",
            action: "\ub9e4\ub3c4",
            buy_reason: detail.buy_reason || "",
            reason: detail.reason || "\uc810\uc218",
            buy_avg_price: detail.avg_buy_price,
            buy_date: detail.buy_date || "",
            sell_avg_price: detail.sell_price,
            sell_date: detail.sell_date || row.date,
            sell_return_pct: detail.sell_return_pct,
            markers: [{ date: row.date, type: "sell", label: "\ub9e4\ub3c4" }],
          });
        });
      });
      var stockMarkerMap = {};
      tradeEventRows.forEach(function (item) {
        var code = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var key = code || String(item.stock_name || "");
        if (!key) return;
        if (!stockMarkerMap[key]) stockMarkerMap[key] = [];
        stockMarkerMap[key] = stockMarkerMap[key].concat(ensureArray(item.markers));
      });
      var holdingDetailRows = tradeEventRows.map(function (item) {
        var code = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var key = code || String(item.stock_name || "");
        return Object.assign({}, item, { markers: ensureArray(stockMarkerMap[key]) });
      }).filter(function (item) {
        return String(item.action || "") === "매도";
      });
      var derivedSellRows = holdingDetailRows.slice();
      var topLossTradeRows = derivedSellRows
        .filter(function (item) { return Number.isFinite(Number(item.sell_return_pct)); })
        .slice()
        .sort(function (a, b) { return Number(a.sell_return_pct || 0) - Number(b.sell_return_pct || 0); })
        .slice(0, 12);
      var topProfitTradeRows = derivedSellRows
        .filter(function (item) { return Number.isFinite(Number(item.sell_return_pct)); })
        .slice()
        .sort(function (a, b) { return Number(b.sell_return_pct || 0) - Number(a.sell_return_pct || 0); })
        .slice(0, 12);
      var profitStockMap = {};
      derivedSellRows.forEach(function (item) {
        var rawCode = String(item.stock_code || "").replace(/\D/g, "").padStart(6, "0");
        var stockKey = rawCode || String(item.stock_name || "");
        if (!stockKey) return;
        var returnPct = Number(item.sell_return_pct);
        if (!Number.isFinite(returnPct)) return;
        if (!profitStockMap[stockKey]) {
          profitStockMap[stockKey] = {
            stock_key: stockKey,
            stock_code: rawCode || item.stock_code || "",
            stock_name: item.stock_name || item.stock_code || "-",
            trade_count: 0,
            winning_count: 0,
            losing_count: 0,
            total_return_pct: 0,
            avg_return_pct: 0,
            best_return_pct: null,
            worst_return_pct: null,
            latest_sell_date: "",
            latest_trade: item,
          };
        }
        var summaryRow = profitStockMap[stockKey];
        summaryRow.trade_count += 1;
        summaryRow.total_return_pct += returnPct;
        if (returnPct > 0) {
          summaryRow.winning_count += 1;
        } else if (returnPct < 0) {
          summaryRow.losing_count += 1;
        }
        if (summaryRow.best_return_pct == null || returnPct > summaryRow.best_return_pct) {
          summaryRow.best_return_pct = returnPct;
        }
        if (summaryRow.worst_return_pct == null || returnPct < summaryRow.worst_return_pct) {
          summaryRow.worst_return_pct = returnPct;
        }
        if (!summaryRow.latest_sell_date || String(item.sell_date || item.date || "") > summaryRow.latest_sell_date) {
          summaryRow.latest_sell_date = String(item.sell_date || item.date || "");
          summaryRow.latest_trade = item;
        }
      });
      var topProfitStockRows = Object.keys(profitStockMap).map(function (key) {
        var item = profitStockMap[key];
        var tradeCount = Number(item.trade_count || 0);
        return Object.assign({}, item, {
          avg_return_pct: tradeCount ? item.total_return_pct / tradeCount : null,
          win_rate_pct: tradeCount ? (Number(item.winning_count || 0) / tradeCount) * 100 : null,
        });
      }).sort(function (a, b) {
        var totalDiff = Number(b.total_return_pct || 0) - Number(a.total_return_pct || 0);
        if (Math.abs(totalDiff) > 0.000001) return totalDiff;
        var avgDiff = Number(b.avg_return_pct || 0) - Number(a.avg_return_pct || 0);
        if (Math.abs(avgDiff) > 0.000001) return avgDiff;
        return Number(b.trade_count || 0) - Number(a.trade_count || 0);
      }).slice(0, 12);
      var derivedSellCount = derivedSellRows.length;
      var derivedWinningSellCount = derivedSellRows.filter(function (item) {
        return Number(item.sell_return_pct) > 0;
      }).length;
      var derivedAverageSellReturnPct = derivedSellRows.length
        ? (derivedSellRows.reduce(function (sum, item) {
            var value = Number(item.sell_return_pct);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0) / derivedSellRows.length)
        : null;
      var effectiveSellCount = leaderSummary.sell_count != null && Number.isFinite(Number(leaderSummary.sell_count))
        ? Number(leaderSummary.sell_count)
        : derivedSellCount;
      var effectiveWinningSellCount = leaderSummary.winning_sell_count != null && Number.isFinite(Number(leaderSummary.winning_sell_count))
        ? Number(leaderSummary.winning_sell_count)
        : derivedWinningSellCount;
      var effectiveAverageSellReturnPct = leaderSummary.avg_sell_return_pct != null && Number.isFinite(Number(leaderSummary.avg_sell_return_pct))
        ? Number(leaderSummary.avg_sell_return_pct)
        : derivedAverageSellReturnPct;
      var derivedWinningSellRows = derivedSellRows.filter(function (item) {
        return Number(item.sell_return_pct) > 0;
      });
      var derivedLosingSellRows = derivedSellRows.filter(function (item) {
        return Number(item.sell_return_pct) < 0;
      });
      var derivedWinningAverageSellReturnPct = derivedWinningSellRows.length
        ? (derivedWinningSellRows.reduce(function (sum, item) {
            var value = Number(item.sell_return_pct);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0) / derivedWinningSellRows.length)
        : null;
      var derivedLosingAverageSellReturnPct = derivedLosingSellRows.length
        ? (derivedLosingSellRows.reduce(function (sum, item) {
            var value = Number(item.sell_return_pct);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0) / derivedLosingSellRows.length)
        : null;
      var effectiveWinRatePct = leaderSummary.win_rate_pct != null && Number.isFinite(Number(leaderSummary.win_rate_pct))
        ? Number(leaderSummary.win_rate_pct)
        : (derivedSellCount ? (derivedWinningSellCount / derivedSellCount) * 100 : null);
      var effectiveWinningAverageSellReturnPct = leaderSummary.avg_winning_sell_return_pct != null && Number.isFinite(Number(leaderSummary.avg_winning_sell_return_pct))
        ? Number(leaderSummary.avg_winning_sell_return_pct)
        : derivedWinningAverageSellReturnPct;
      var effectiveLosingAverageSellReturnPct = leaderSummary.avg_losing_sell_return_pct != null && Number.isFinite(Number(leaderSummary.avg_losing_sell_return_pct))
        ? Number(leaderSummary.avg_losing_sell_return_pct)
        : derivedLosingAverageSellReturnPct;
      var leaderDrawdownPeak = -Infinity;
      var leaderDrawdownMin = 0;
      var leaderDrawdownPeakDate = "";
      var leaderDrawdownTroughDate = "";
      leaderRows.forEach(function (row) {
        var value = Number(row && row.strategy_return_pct);
        if (!Number.isFinite(value)) {
          return;
        }
        if (value > leaderDrawdownPeak) {
          leaderDrawdownPeak = value;
          leaderDrawdownPeakDate = String(row.date || "");
        }
        var drawdown = value - leaderDrawdownPeak;
        if (drawdown < leaderDrawdownMin) {
          leaderDrawdownMin = drawdown;
          leaderDrawdownTroughDate = String(row.date || "");
        }
      });
      var mddContributionMap = {};
      leaderRows.forEach(function (row) {
        var rowDate = String(row && row.date || "");
        if (!rowDate || !leaderDrawdownPeakDate || !leaderDrawdownTroughDate) {
          return;
        }
        if (rowDate < leaderDrawdownPeakDate || rowDate > leaderDrawdownTroughDate) {
          return;
        }
        ensureArray(row.holdings_before_close).forEach(function (item) {
          if (!item || typeof item !== "object") {
            return;
          }
          var stockKey = String(item.stock_key || item.stock_code || item.stock_name || "").trim();
          if (!stockKey) {
            return;
          }
          var contribution = Number(item.daily_contribution_pct);
          if (!Number.isFinite(contribution)) {
            contribution = 0;
          }
          if (!mddContributionMap[stockKey]) {
            var matchedTrade = derivedSellRows.find(function (tradeRow) {
              var tradeCode = String(tradeRow.stock_code || "").trim();
              var itemCode = String(item.stock_code || "").trim();
              return (tradeCode && itemCode && tradeCode === itemCode) || String(tradeRow.stock_name || "") === String(item.stock_name || "");
            }) || null;
            mddContributionMap[stockKey] = {
              stock_key: stockKey,
              stock_code: item.stock_code || "",
              stock_name: item.stock_name || item.stock_code || stockKey,
              contribution_pct: 0,
              active_days: 0,
              trade_count: 0,
              latest_sell_date: "",
              trade: matchedTrade,
            };
          }
          mddContributionMap[stockKey].contribution_pct += contribution;
          mddContributionMap[stockKey].active_days += 1;
        });
      });
      derivedSellRows.forEach(function (tradeRow) {
        var stockKey = String(tradeRow.stock_code || tradeRow.stock_name || "").trim();
        if (!stockKey || !mddContributionMap[stockKey]) {
          return;
        }
        mddContributionMap[stockKey].trade_count += 1;
        var sellDate = String(tradeRow.sell_date || tradeRow.date || "");
        if (sellDate && (!mddContributionMap[stockKey].latest_sell_date || sellDate > mddContributionMap[stockKey].latest_sell_date)) {
          mddContributionMap[stockKey].latest_sell_date = sellDate;
          mddContributionMap[stockKey].trade = tradeRow;
        }
      });
      var mddContributorRows = Object.keys(mddContributionMap).map(function (key) {
        var row = mddContributionMap[key];
        row.contribution_pct = Number(numberFormat(row.contribution_pct, 3));
        return row;
      }).sort(function (a, b) {
        return Number(a.contribution_pct || 0) - Number(b.contribution_pct || 0);
      });
      var leaderPeriodicSummaryRows = buildLeaderPeriodicSummaryRows(leaderRows, holdingDetailRows, leaderPeriodSummaryMode);
      return (((strategyMode !== "leader_top10") || !activeLeaderSnapshot) && indexRequest.error)
        ? h(ErrorPanel, { message: indexRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, "\ubc31\ud14c\uc2a4\ud2b8 \uacb0\uacfc \u00b7 " + selectedLeaderLabel),
                h("div", { className: "summary-help" }, "당일 점수 기준 편입/편출 전략으로, 일부 구간에서는 현금 비중이 커집니다.")
              ),
              h(
                "div",
                { className: "toolbar-actions", style: { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" } },
                strategyMode === "leader_top10"
                  ? h("button", {
                      type: "button",
                      className: "mini-button",
                      onClick: saveCurrentLeaderBacktest,
                      disabled: leaderSnapshotSaving || !leaderRows.length,
                    }, leaderSnapshotSaving ? "저장 중" : "현재 결과 저장")
                  : null,
                h("span", { className: "telegram-status-pill" }, (leaderSnapshotPayload.start_date || startDate) + " ~ " + (leaderSnapshotPayload.end_date || endDate))
              )
            ),
            h(
              "div",
              { className: "strategy-summary-scroll" },
              h(
                "div",
                { className: "strategy-summary-row" },
                h(SummaryCard, { label: benchmarkLabel + " 수익률", value: formatPercent(leaderSummary.index_return_pct, 2) }),
                h(SummaryCard, { label: "포트폴리오 수익률", value: formatPercent(leaderSummary.strategy_return_pct, 2) }),
                h(SummaryCard, { label: "알파", value: formatPercent(leaderSummary.excess_return_pct, 2) }),
                h(SummaryCard, { label: "최대 MDD", value: formatPercent(leaderSummary.mdd_pct, 2), help: benchmarkLabel + " " + formatPercent(leaderSummary.benchmark_mdd_pct, 2) }),
                h(SummaryCard, { label: "총 매도", value: numberFormat(effectiveSellCount, 0) + "회" }),
                h(SummaryCard, { label: "수익 매도", value: numberFormat(effectiveWinningSellCount, 0) + "회" }),
                h(SummaryCard, { label: "평균 매도수익률", value: effectiveAverageSellReturnPct == null ? "-" : formatPercent(effectiveAverageSellReturnPct, 2) }),
                h(SummaryCard, { label: "수익매도 평균", value: effectiveWinningAverageSellReturnPct == null ? "-" : formatPercent(effectiveWinningAverageSellReturnPct, 2) }),
                h(SummaryCard, { label: "손실매도 평균", value: effectiveLosingAverageSellReturnPct == null ? "-" : formatPercent(effectiveLosingAverageSellReturnPct, 2) }),
                h(SummaryCard, { label: "승률", value: effectiveWinRatePct == null ? "-" : formatPercent(effectiveWinRatePct, 1), help: "매도 완료 건 중 수익 거래 비율" }),
                h(SummaryCard, { label: "\ud3c9\uade0 \ubcf4\uc720 \uc885\ubaa9", value: numberFormat(leaderSummary.avg_holdings_count, 1) + "\uac1c" }),
                h(SummaryCard, { label: "\ub204\uc801 \uc218\uc218\ub8cc", value: formatPercent(leaderSummary.total_fee_pct_points, 2) })
              )
            ),
            indexRequest.loading && !leaderRows.length
              ? h(LoadingPanel, { label: indexRequest.label })
              : leaderRows.length
                ? h(
                    React.Fragment,
                    null,
                    h(StrategyBacktestChart, {
                      rows: leaderRows,
                      indexName: benchmarkLabel,
                      strategyName: leaderMarketMode === "us" ? "미국 주도주" : "국내 주도주",
                    }),
                    h(
                      "div",
                      { className: "strategy-detail-single" },
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "최근 편출 로그"),
                        h(DataTable, {
                          rows: holdingDetailRows,
                          emptyMessage: "매도 완료 이벤트 데이터가 없습니다.",
                          columns: [
                            { key: "date", label: "신호일" },
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "buy_reason", label: "매수 사유", render: function (row) { return row.buy_reason || "-"; } },
                            { key: "reason", label: "매도 사유", render: function (row) { return row.reason || "-"; } },
                            { key: "buy_avg_price", label: "\ub9e4\uc218\uac00", render: function (row) { return row.buy_avg_price == null ? "-" : leaderPriceText(row.buy_avg_price) + (row.buy_date ? " (" + row.buy_date + ")" : ""); } },
                            { key: "sell_avg_price", label: "\ub9e4\ub3c4\uac00", render: function (row) { return row.sell_avg_price == null ? "-" : leaderPriceText(row.sell_avg_price) + (row.sell_date ? " (" + row.sell_date + ")" : ""); } },
                            { key: "sell_return_pct", label: "\ub9e4\ub3c4\uc218\uc775\ub960", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      )
                    ),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "손실 상위 거래"),
                        h(DataTable, {
                          rows: topLossTradeRows,
                          emptyMessage: "완료된 매도 거래가 없습니다.",
                          columns: [
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "buy_reason", label: "\ub9e4\uc218 \uc0ac\uc720", render: function (row) { return row.buy_reason || "-"; } },
                            { key: "reason", label: "\ub9e4\ub3c4 \uc0ac\uc720", render: function (row) { return row.reason || "-"; } },
                            { key: "buy_avg_price", label: "매수가", render: function (row) { return leaderPriceText(row.buy_avg_price); } },
                            { key: "buy_date", label: "매수일", render: function (row) { return row.buy_date || "-"; } },
                            { key: "sell_avg_price", label: "매도가", render: function (row) { return leaderPriceText(row.sell_avg_price); } },
                            { key: "sell_date", label: "매도일", render: function (row) { return row.sell_date || row.date || "-"; } },
                            { key: "sell_return_pct", label: "수익률", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "수익 상위 거래"),
                        h(DataTable, {
                          rows: topProfitTradeRows,
                          emptyMessage: "완료된 매도 거래가 없습니다.",
                          columns: [
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "buy_reason", label: "\ub9e4\uc218 \uc0ac\uc720", render: function (row) { return row.buy_reason || "-"; } },
                            { key: "reason", label: "\ub9e4\ub3c4 \uc0ac\uc720", render: function (row) { return row.reason || "-"; } },
                            { key: "buy_avg_price", label: "매수가", render: function (row) { return leaderPriceText(row.buy_avg_price); } },
                            { key: "buy_date", label: "매수일", render: function (row) { return row.buy_date || "-"; } },
                            { key: "sell_avg_price", label: "매도가", render: function (row) { return leaderPriceText(row.sell_avg_price); } },
                            { key: "sell_date", label: "매도일", render: function (row) { return row.sell_date || row.date || "-"; } },
                            { key: "sell_return_pct", label: "수익률", render: function (row) {
                              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
                            } },
                          ],
                          compact: true,
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                        h("div", { className: "subsection-title" }, "수익 상위 종목"),
                        h(DataTable, {
                          rows: topProfitStockRows,
                          emptyMessage: "완료된 매도 거래가 없습니다.",
                          columns: [
                            { key: "stock_name", label: "종목", render: function (row) {
                              var tradeRow = row.latest_trade || {};
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(tradeRow); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "trade_count", label: "매도 수", render: function (row) { return numberFormat(row.trade_count, 0) + "회"; } },
                            { key: "winning_count", label: "수익 매도", render: function (row) { return numberFormat(row.winning_count, 0) + "회"; } },
                            { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
                            { key: "total_return_pct", label: "누적 수익률", render: function (row) {
                              return row.total_return_pct == null ? "-" : h("span", { className: pnlClass(row.total_return_pct) }, formatPercent(row.total_return_pct, 2));
                            } },
                            { key: "avg_return_pct", label: "평균 수익률", render: function (row) {
                              return row.avg_return_pct == null ? "-" : h("span", { className: pnlClass(row.avg_return_pct) }, formatPercent(row.avg_return_pct, 2));
                            } },
                            { key: "latest_sell_date", label: "최근 매도일", render: function (row) { return row.latest_sell_date || "-"; } },
                          ],
                          compact: true,
                        })
                      )
                    ),
                    strategyMode === "leader_top10"
                      ? h(
                          "div",
                          { className: "mini-table-panel strategy-wide-table strategy-scroll-panel", style: { marginTop: "12px" } },
                          h(
                            "div",
                            { className: "section-toolbar" },
                            h("div", { className: "subsection-title" }, "기간별 성과"),
                            h(
                              "div",
                              { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                              h("button", {
                                type: "button",
                                className: "mini-button" + (leaderPeriodSummaryMode === "year" ? " active" : ""),
                                onClick: function () { setLeaderPeriodSummaryMode("year"); },
                              }, "연도별"),
                              h("button", {
                                type: "button",
                                className: "mini-button" + (leaderPeriodSummaryMode === "quarter" ? " active" : ""),
                                onClick: function () { setLeaderPeriodSummaryMode("quarter"); },
                              }, "분기별")
                            )
                          ),
                          h(DataTable, {
                            rows: leaderPeriodicSummaryRows,
                            emptyMessage: "기간별 성과 데이터가 없습니다.",
                            columns: [
                              { key: "label", label: leaderPeriodSummaryMode === "quarter" ? "분기" : "연도", render: function (row) { return row.label || "-"; } },
                              { key: "trade_count", label: "거래건", render: function (row) { return numberFormat(row.trade_count, 0) + "건"; } },
                              { key: "return_pct", label: leaderPeriodSummaryMode === "quarter" ? "분기수익률" : "연수익률", render: function (row) {
                                return row.return_pct == null ? "-" : h("span", { className: pnlClass(row.return_pct) }, formatPercent(row.return_pct, 2));
                              } },
                              { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
                              { key: "avg_profit_pct", label: "평균수익", render: function (row) {
                                return row.avg_profit_pct == null ? "-" : h("span", { className: pnlClass(row.avg_profit_pct) }, formatPercent(row.avg_profit_pct, 2));
                              } },
                              { key: "avg_loss_pct", label: "평균손실", render: function (row) {
                                return row.avg_loss_pct == null ? "-" : h("span", { className: pnlClass(row.avg_loss_pct) }, formatPercent(row.avg_loss_pct, 2));
                              } },
                              { key: "mdd_pct", label: "MDD", render: function (row) {
                                return row.mdd_pct == null ? "-" : h("span", { className: pnlClass(row.mdd_pct) }, formatPercent(row.mdd_pct, 2));
                              } },
                            ],
                            compact: true,
                          })
                        )
                      : null,
                    strategyMode === "leader_top10"
                      ? renderLeaderBreakoutInsightsPanel(leaderSnapshotPayload)
                      : null,
                    renderLeaderAiPanel(leaderMarketMode, leaderSnapshotPayload, mddContributorRows)
                    )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
          );
    }

    function renderLeaderSavedSnapshotsPanel() {
      if (strategyMode !== "leader_top10") {
        return null;
      }
      return h(
        "div",
        { className: "panel strategy-panel" },
        h(
          "div",
          { className: "mini-table-panel" },
          h("div", { className: "subsection-title" }, "저장된 국내 주도주 백테스트"),
          leaderSnapshotMessage ? h("div", { className: "summary-help" }, leaderSnapshotMessage) : null,
          leaderSnapshotRequest.loading && !savedLeaderSnapshots.length
            ? h(LoadingPanel, { label: leaderSnapshotRequest.label })
            : h(DataTable, {
                rows: savedLeaderSnapshots,
                emptyMessage: "저장된 백테스트가 없습니다.",
                columns: [
                  { key: "label", label: "이름", render: function (row) { return h("strong", null, row.label || "-"); } },
                  { key: "created_at", label: "저장시각", render: function (row) { return row.created_at || "-"; } },
                  { key: "strategy_return_pct", label: "수익률", render: function (row) {
                    return row.strategy_return_pct == null ? "-" : h("span", { className: pnlClass(row.strategy_return_pct) }, formatPercent(row.strategy_return_pct, 2));
                  } },
                  { key: "excess_return_pct", label: "알파", render: function (row) {
                    return row.excess_return_pct == null ? "-" : h("span", { className: pnlClass(row.excess_return_pct) }, formatPercent(row.excess_return_pct, 2));
                  } },
                  { key: "mdd_pct", label: "MDD", render: function (row) { return row.mdd_pct == null ? "-" : formatPercent(row.mdd_pct, 2); } },
                  { key: "actions", label: "관리", render: function (row) {
                    var rowId = Number(row.id || 0);
                    return h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                      h("button", { type: "button", className: "mini-button", onClick: function () { loadLeaderSnapshot(rowId); } }, Number(activeLeaderSnapshotId || 0) === rowId ? "불러옴" : "불러오기"),
                      h("button", { type: "button", className: "mini-button danger", onClick: function () { deleteLeaderSnapshot(rowId); } }, "삭제")
                    );
                  } },
                ],
                compact: true,
              })
        )
      );
    }

    function renderLeaderCompareResult() {
      var leftSnapshot = compareLeftSnapshot && compareLeftSnapshot.payload ? compareLeftSnapshot : null;
      var rightSnapshot = compareRightSnapshot && compareRightSnapshot.payload ? compareRightSnapshot : null;
      var stockOptions = buildLeaderCompareStockOptions(leftSnapshot, rightSnapshot);
      var selectedStock = stockOptions.filter(function (item) {
        return String(item.key) === String(compareStockKey || "");
      })[0] || stockOptions[0] || null;
      var leftTradesByStock = buildLeaderTradeLookup(leftSnapshot && leftSnapshot.payload);
      var rightTradesByStock = buildLeaderTradeLookup(rightSnapshot && rightSnapshot.payload);
      var leftStockTrades = selectedStock ? ensureArray(leftTradesByStock[selectedStock.key]) : [];
      var rightStockTrades = selectedStock ? ensureArray(rightTradesByStock[selectedStock.key]) : [];
      var leftRecentRows = extractLeaderSellRows(leftSnapshot && leftSnapshot.payload && leftSnapshot.payload.rows).slice().sort(function (a, b) {
        return String(b.sell_date || b.date || "").localeCompare(String(a.sell_date || a.date || ""));
      }).slice(0, 20);
      var rightRecentRows = extractLeaderSellRows(rightSnapshot && rightSnapshot.payload && rightSnapshot.payload.rows).slice().sort(function (a, b) {
        return String(b.sell_date || b.date || "").localeCompare(String(a.sell_date || a.date || ""));
      }).slice(0, 20);
      function renderSnapshotSummaryColumn(title, snapshot) {
        var payload = (snapshot && snapshot.payload) || {};
        var localSummary = payload.summary || {};
        return h(
          "div",
          { className: "mini-table-panel strategy-wide-table" },
          h("div", { className: "subsection-title" }, title),
          snapshot
            ? h(
                React.Fragment,
                null,
                h("div", { className: "summary-help", style: { marginBottom: "8px" } }, (snapshot.label || "-") + " · " + (snapshot.created_at || "-")),
                h(
                  "div",
                  { className: "summary-grid summary-grid-small" },
                  h(SummaryCard, { label: "수익률", value: formatPercent(localSummary.strategy_return_pct, 2) }),
                  h(SummaryCard, { label: "알파", value: formatPercent(localSummary.excess_return_pct, 2) }),
                  h(SummaryCard, { label: "MDD", value: formatPercent(localSummary.mdd_pct, 2) }),
                  h(SummaryCard, { label: "승률", value: localSummary.win_rate_pct == null ? "-" : formatPercent(localSummary.win_rate_pct, 1) })
                ),
                h("div", { style: { marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" } },
                  h("button", { type: "button", className: "mini-button", onClick: function () { loadLeaderSnapshot(snapshot.id); } }, "국내 주도주 탭에서 열기")
                )
              )
            : h(EmptyState, { compact: true, message: "전략을 선택해 주세요." })
        );
      }
      function comparePriceText(value) {
        return value == null || !Number.isFinite(Number(value)) ? "-" : numberFormat(value, 0) + "원";
      }
      function renderTradeTableRows(rowsToRender) {
        return h(DataTable, {
          rows: rowsToRender,
          emptyMessage: "해당 종목 거래가 없습니다.",
          columns: [
            { key: "stock_name", label: "종목", render: function (row) { return row.stock_name || row.stock_code || "-"; } },
            { key: "buy_date", label: "매수일", render: function (row) { return row.buy_date || "-"; } },
            { key: "buy_avg_price", label: "매수가", render: function (row) { return comparePriceText(row.buy_avg_price); } },
            { key: "sell_date", label: "매도일", render: function (row) { return row.sell_date || row.date || "-"; } },
            { key: "sell_avg_price", label: "매도가", render: function (row) { return comparePriceText(row.sell_avg_price); } },
            { key: "reason", label: "매도 사유", render: function (row) { return row.reason || "-"; } },
            { key: "sell_return_pct", label: "수익률", render: function (row) {
              return row.sell_return_pct == null ? "-" : h("span", { className: pnlClass(row.sell_return_pct) }, formatPercent(row.sell_return_pct, 2));
            } },
          ],
          compact: true,
        });
      }
      return h(
        "div",
        { className: "panel strategy-panel" },
        h(
          "div",
          { className: "section-toolbar" },
          h("div", null,
            h(SectionTitle, null, "국내 주도주 전략 비교"),
            h("div", { className: "summary-help" }, "저장해둔 국내 주도주 백테스트를 좌우로 선택해 매매 결과를 비교합니다.")
          ),
          leaderSnapshotRequest.loading
            ? h("span", { className: "telegram-status-pill" }, "목록 불러오는 중")
            : h("span", { className: "telegram-status-pill" }, "저장 전략 " + numberFormat(savedLeaderSnapshots.length, 0) + "개")
        ),
        h(
          "div",
          { className: "strategy-control-grid" },
          h("label", null,
            h("span", null, "왼쪽 전략"),
            h("select", {
              className: "select-input",
              value: compareLeftSnapshotId,
              onChange: function (event) { setCompareLeftSnapshotId(event.target.value); },
            },
              h("option", { value: "" }, "선택"),
              savedLeaderSnapshots.map(function (item) {
                return h("option", { key: "left-" + item.id, value: String(item.id) }, item.label || ("저장 전략 #" + item.id));
              })
            )
          ),
          h("label", null,
            h("span", null, "오른쪽 전략"),
            h("select", {
              className: "select-input",
              value: compareRightSnapshotId,
              onChange: function (event) { setCompareRightSnapshotId(event.target.value); },
            },
              h("option", { value: "" }, "선택"),
              savedLeaderSnapshots.map(function (item) {
                return h("option", { key: "right-" + item.id, value: String(item.id) }, item.label || ("저장 전략 #" + item.id));
              })
            )
          ),
          h("label", null,
            h("span", null, "종목별 비교"),
            h("select", {
              className: "select-input",
              value: compareStockKey,
              onChange: function (event) { setCompareStockKey(event.target.value); },
            },
              h("option", { value: "" }, stockOptions.length ? "종목 선택" : "비교할 종목 없음"),
              stockOptions.map(function (item) {
                return h("option", { key: item.key, value: item.key }, item.stock_name + (item.stock_code ? " (" + item.stock_code + ")" : ""));
              })
            )
          )
        ),
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          renderSnapshotSummaryColumn("왼쪽 전략", leftSnapshot),
          renderSnapshotSummaryColumn("오른쪽 전략", rightSnapshot)
        ),
        selectedStock
          ? h(
              "div",
              { className: "sector-rotation-table-grid advanced-detail-grid" },
              h(
                "div",
                { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                h("div", { className: "subsection-title" }, "왼쪽 전략 · " + selectedStock.stock_name),
                renderTradeTableRows(leftStockTrades)
              ),
              h(
                "div",
                { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
                h("div", { className: "subsection-title" }, "오른쪽 전략 · " + selectedStock.stock_name),
                renderTradeTableRows(rightStockTrades)
              )
            )
          : null,
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
            h("div", { className: "subsection-title" }, "왼쪽 전략 최근 매도"),
            renderTradeTableRows(leftRecentRows)
          ),
          h(
            "div",
            { className: "mini-table-panel strategy-wide-table strategy-scroll-panel" },
            h("div", { className: "subsection-title" }, "오른쪽 전략 최근 매도"),
            renderTradeTableRows(rightRecentRows)
          )
        )
      );
    }

    function renderSectorControls() {
      return h(
        "div",
        { className: "strategy-control-grid sector-rotation-controls" },
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: sectorStartDate,
            onChange: function (event) { setSectorStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: sectorEndDate,
            onChange: function (event) { setSectorEndDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 100,
            step: 1,
            value: sectorMinScore,
            onChange: function (event) { setSectorMinScore(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 12,
            step: 1,
            value: sectorTopCount,
            onChange: function (event) { setSectorTopCount(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 20,
            step: 1,
            value: sectorStocksCount,
            onChange: function (event) { setSectorStocksCount(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 2.5,
            step: 0.1,
            value: sectorLeverage,
            onChange: function (event) { setSectorLeverage(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: sectorWeightMethod,
            onChange: function (event) { setSectorWeightMethod(event.target.value); },
          }, [
            h("option", { key: "strength", value: "strength" }, "섹터 강도 비례"),
            h("option", { key: "equal", value: "equal" }, "동일 비중"),
          ])
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: applySectorBacktest,
            disabled: sectorRequest.loading,
          },
          sectorRequest.loading ? "계산 중" : "로테이션 실행"
        )
      );
    }

    function renderAdvancedControls() {
      return h(
        "div",
        { className: "strategy-control-grid sector-rotation-controls advanced-strategy-controls" },
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: advancedStartDate,
            onChange: function (event) { setAdvancedStartDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "date",
            value: advancedEndDate,
            onChange: function (event) { setAdvancedEndDate(event.target.value); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: advancedBenchmark,
            onChange: function (event) { setAdvancedBenchmark(event.target.value); },
          }, availableAdvancedBenchmarks.map(function (item) {
            return h("option", { key: item.key, value: item.key }, item.name);
          }))
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 2.5,
            step: 0.1,
            value: advancedMaxLeverage,
            onChange: function (event) { setAdvancedMaxLeverage(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 10,
            step: 1,
            value: advancedTopSectors,
            onChange: function (event) { setAdvancedTopSectors(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 12,
            step: 1,
            value: advancedStocksCount,
            onChange: function (event) { setAdvancedStocksCount(Number(event.target.value) || 1); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 100,
            step: 1,
            value: advancedMinScore,
            onChange: function (event) { setAdvancedMinScore(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 1,
            max: 50,
            step: 1,
            value: advancedTradingRankLimit,
            onChange: function (event) { setAdvancedTradingRankLimit(Number(event.target.value) || 20); },
          })
        ),
        h("label", null,
          h("span", null, "20일선 비율"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 0,
            max: 100,
            step: 5,
            value: advancedMinBreadth,
            onChange: function (event) { setAdvancedMinBreadth(Number(event.target.value) || 0); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("input", {
            className: "text-input",
            type: "number",
            min: 100,
            max: 140,
            step: 1,
            value: advancedMaxDisparity,
            onChange: function (event) { setAdvancedMaxDisparity(Number(event.target.value) || 110); },
          })
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: String(advancedBetaWindow),
            onChange: function (event) { setAdvancedBetaWindow(Number(event.target.value) || 63); },
          }, [
            h("option", { key: "63", value: "63" }, "3개월"),
            h("option", { key: "252", value: "252" }, "1년"),
          ])
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: advancedWeightMethod,
            onChange: function (event) { setAdvancedWeightMethod(event.target.value); },
          }, [
            h("option", { key: "entry_beta", value: "entry_beta" }, "베타 가중"),
            h("option", { key: "equal", value: "equal" }, "동일 비중"),
          ])
        ),
        h("label", null,
          h("span", null, "종목 선별"),
          h("select", {
            className: "select-input",
            value: advancedStockSelection,
            onChange: function (event) { setAdvancedStockSelection(event.target.value); },
          }, [
            h("option", { key: "trend_strength", value: "trend_strength" }, "추세 강도 우선"),
                h("option", { key: "score", value: "score" }, "종합점수 우선"),
          ])
        ),
        h(
          "button",
          {
            type: "button",
            className: "primary-button",
            onClick: applyAdvancedBacktest,
            disabled: advancedRequest.loading,
          },
          advancedRequest.loading ? "계산 중" : "고급 백테스트 실행"
        )
      );
    }

    function renderIndexResult() {
      return indexRequest.error
        ? h(ErrorPanel, { message: indexRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, (data.index_name || "지수") + " · " + (data.strategy_name || "전략")),
                h("div", { className: "summary-help" }, data.strategy_description || "전략 조건을 선택해 백테스트를 실행해 주세요.")
              ),
              h("span", { className: "telegram-status-pill" }, (data.start_date || startDate) + " ~ " + (data.end_date || endDate))
            ),
            h(
              "div",
              { className: "summary-grid-small strategy-summary-grid" },
              h(SummaryCard, { label: "지수 수익률", value: formatPercent(summary.index_return_pct, 2) }),
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(summary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "초과 수익", value: formatPercent(summary.excess_return_pct, 2) }),
              h(SummaryCard, { label: "매매 신호", value: numberFormat(summary.signal_count, 0) + "회" }),
              h(SummaryCard, { label: "승률", value: summary.win_rate_pct == null ? "-" : formatPercent(summary.win_rate_pct, 1) }),
              h(SummaryCard, { label: "수수료", value: "매수/매도 " + formatPercent(summary.trade_fee_rate_pct, 1), help: "누적 비용 " + formatPercent(summary.total_fee_pct_points, 2) })
            ),
            indexRequest.loading && !rows.length
              ? h(LoadingPanel, { label: indexRequest.label })
              : rows.length
                ? h(React.Fragment, null,
                    h(StrategyBacktestChart, {
                      rows: rows,
                      indexName: data.index_name,
                      strategyName: data.strategy_name,
                    }),
                    h(
                      "div",
                      { className: "strategy-rsi-section" },
                      h("div", { className: "section-toolbar compact" },
                        h(SectionTitle, null, "RSI(14)"),
                        h("span", { className: "summary-help" }, "70 이상 과매수 · 30 이하 과매도")
                      ),
                      h(StrategyRsiChart, { rows: rows })
                    ),
                  )
                : h(EmptyState, { compact: true, message: "백테스트 데이터가 없습니다." })
          );
    }

    function renderLatestSectorSelection() {
      const lastRow = sectorRows.length ? sectorRows[sectorRows.length - 1] : null;
      const sectors = ensureArray(lastRow && lastRow.selected_sectors);
      if (!sectors.length) {
        return null;
      }
      return h(
        "div",
        { className: "sector-selection-strip" },
        sectors.map(function (sector) {
          return h(
            "div",
            { key: sector.sector, className: "sector-selection-card" },
            h("div", { className: "sector-selection-head" },
              h("strong", null, sector.sector),
              h("span", null, formatPercent(sector.target_weight_pct, 1))
            ),
            h("div", { className: "sector-selection-stocks" },
              ensureArray(sector.stocks).map(function (stock) {
                return h("span", { key: stock.stock_key || stock.stock_name }, (stock.stock_name || "-") + " " + formatPercent(stock.weight_pct, 1));
              })
            )
          );
        })
      );
    }

    function renderAdvancedExecutionPanel() {
      const execution = advancedData.execution || {};
      const kis = execution.kis || {};
      const latestHoldings = ensureArray(advancedData.latest_holdings);
      return h(
        "div",
        { className: "strategy-execution-panel" },
        h("div", { className: "section-toolbar compact" },
          h("div", null,
            h(SectionTitle, null, "주문 전 포트폴리오"),
            h("div", { className: "summary-help" }, execution.message || "한투 모의투자 계좌로 넘기기 전 목표 포트폴리오를 확인합니다.")
          ),
          h("span", { className: "telegram-status-pill" }, kis.configured ? "KIS 연결됨 · " + (kis.environment || "mock") : "KIS 미설정")
        ),
        h(DataTable, {
          rows: latestHoldings,
          emptyMessage: "최근 목표 포트폴리오가 없습니다.",
          columns: [
            { key: "sector", label: "섹터" },
            { key: "stock_name", label: "종목" },
            { key: "stock_code", label: "코드" },
            { key: "weight_pct", label: "목표비중", render: function (row) { return formatPercent(row.weight_pct, 2); } },
            { key: "beta", label: "β", render: function (row) { return row.beta == null ? "-" : numberFormat(row.beta, 2); } },
            { key: "score", label: "점수", render: function (row) { return row.score == null ? "-" : numberFormat(row.score, 1); } },
          ],
        }),
        h(
          "div",
          { className: "strategy-execution-actions" },
          h("button", { type: "button", className: "secondary-button", disabled: true }, "모의 주문 실행 잠금"),
          h("span", { className: "summary-help" }, "실제 주문 API는 다음 단계에서 주문 전 확인/수량 검증/취소 가능 로그까지 붙인 뒤 열겠습니다.")
        )
      );
    }

    function renderDateSelectorStrip(rows, selectedDate, onSelect) {
      const sourceRows = ensureArray(rows).slice(-18);
      if (!sourceRows.length) {
        return null;
      }
      return h(
        "div",
        { className: "strategy-date-strip" },
        sourceRows.map(function (row) {
          const active = String(row.date || "") === String(selectedDate || "");
          return h(
            "button",
            {
              key: row.date,
              type: "button",
              className: "strategy-date-chip" + (active ? " active" : ""),
              onClick: function () { onSelect(row.date); },
              title: (row.date || "") + " 포트폴리오 보기",
            },
            h("span", null, formatDateLabel(row.date)),
            h("strong", { className: pnlClass(row.daily_return_pct) }, formatPercent(row.daily_return_pct, 1))
          );
        })
      );
    }

    function renderSelectedAdvancedPortfolio() {
      const tradeLog = ensureArray(advancedData.trade_log);
      const timeline = ensureArray(advancedData.holdings_timeline);
      const activeDate = selectedAdvancedDate || (advancedRows.length ? advancedRows[advancedRows.length - 1].date : "");
      const row = advancedRows.find(function (item) { return item.date === activeDate; }) || (advancedRows.length ? advancedRows[advancedRows.length - 1] : null);
      const holdingFrame = timeline.find(function (item) { return item.date === activeDate; }) || (timeline.length ? timeline[timeline.length - 1] : null);
      const holdings = ensureArray(holdingFrame && holdingFrame.holdings);
      const trades = tradeLog.filter(function (item) {
        return String(item.apply_date || item.date || "") === String(activeDate || "");
      });
      return h(
        "div",
        { className: "strategy-selected-portfolio" },
        h("div", { className: "section-toolbar compact" },
          h("div", null,
            h(SectionTitle, null, "선택일 포트폴리오"),
            h("div", { className: "summary-help" }, (activeDate || "-") + " · 차트나 아래 날짜 버튼을 눌러 그날 포트를 확인합니다.")
          ),
          row ? h("span", { className: "telegram-status-pill" }, "노출 " + formatPercent(row.exposure_pct, 1) + " · 일수익 " + formatPercent(row.daily_return_pct, 2)) : null
        ),
        renderDateSelectorStrip(advancedRows, activeDate, setSelectedAdvancedDate),
        h(
          "div",
          { className: "sector-rotation-table-grid advanced-detail-grid" },
          h(
            "div",
            { className: "mini-table-panel" },
            h("div", { className: "subsection-title" }, "보유 종목/비중"),
            h(DataTable, {
              rows: holdings,
              emptyMessage: "해당 일자 보유 종목이 없습니다.",
              columns: [
                { key: "sector", label: "섹터" },
                { key: "stock_name", label: "종목" },
                { key: "weight_pct", label: "비중", render: function (item) { return formatPercent(item.weight_pct, 2); } },
                { key: "beta", label: "β", render: function (item) { return item.beta == null ? "-" : numberFormat(item.beta, 2); } },
                { key: "trend_score", label: "추세", render: function (item) { return item.trend_score == null ? "-" : numberFormat(item.trend_score, 1); } },
                { key: "score", label: "점수", render: function (item) { return item.score == null ? "-" : numberFormat(item.score, 1); } },
              ],
            })
          ),
          h(
            "div",
            { className: "mini-table-panel" },
            h("div", { className: "subsection-title" }, "당일 매수/매도"),
            h(DataTable, {
              rows: trades,
              emptyMessage: "해당 일자 리밸런싱 기록이 없습니다.",
              columns: [
                { key: "action", label: "구분" },
                { key: "sector", label: "섹터" },
                { key: "stock_name", label: "종목", render: function (item) {
                  return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(item); } }, item.stock_name || item.stock_code || "-");
                } },
                { key: "before_weight_pct", label: "전", render: function (item) { return formatPercent(item.before_weight_pct, 2); } },
                { key: "after_weight_pct", label: "후", render: function (item) { return formatPercent(item.after_weight_pct, 2); } },
                { key: "trade_return_pct", label: "매매수익", render: function (item) { return item.trade_return_pct == null ? "-" : h("span", { className: pnlClass(item.trade_return_pct) }, formatPercent(item.trade_return_pct, 2)); } },
                { key: "holding_days", label: "보유", render: function (item) { return item.holding_days == null ? "-" : numberFormat(item.holding_days, 0) + "일"; } },
              ],
            })
          )
        )
      );
    }

    function renderSelectedSectorPortfolio() {
      const activeDate = selectedSectorDate || (sectorRows.length ? sectorRows[sectorRows.length - 1].date : "");
      const row = sectorRows.find(function (item) { return item.date === activeDate; }) || (sectorRows.length ? sectorRows[sectorRows.length - 1] : null);
      const sectors = ensureArray(row && row.selected_sectors);
      const stocks = [];
      sectors.forEach(function (sector) {
        ensureArray(sector.stocks).forEach(function (stock) {
          stocks.push(Object.assign({}, stock, { sector: sector.sector }));
        });
      });
      return h(
        "div",
        { className: "strategy-selected-portfolio" },
        h("div", { className: "section-toolbar compact" },
          h("div", null,
            h(SectionTitle, null, "선택일 포트폴리오"),
            h("div", { className: "summary-help" }, (activeDate || "-") + " · 차트나 아래 날짜 버튼을 눌러 그날 포트를 확인합니다.")
          ),
          row ? h("span", { className: "telegram-status-pill" }, "노출 " + formatPercent(row.exposure_pct, 1) + " · 일수익 " + formatPercent(row.daily_return_pct, 2)) : null
        ),
        renderDateSelectorStrip(sectorRows, activeDate, setSelectedSectorDate),
        h(DataTable, {
          rows: stocks,
          emptyMessage: "해당 일자 선택 종목이 없습니다.",
          columns: [
            { key: "sector", label: "섹터" },
            { key: "stock_name", label: "종목" },
            { key: "stock_code", label: "코드" },
            { key: "score", label: "점수", render: function (item) { return item.score == null ? "-" : numberFormat(item.score, 1); } },
            { key: "weight_pct", label: "비중", render: function (item) { return formatPercent(item.weight_pct, 2); } },
          ],
        })
      );
    }

    function renderAdvancedResult() {
      const tradeLog = ensureArray(advancedData.trade_log).slice().reverse();
      const holdingsTimeline = ensureArray(advancedData.holdings_timeline);
      const latestTimeline = holdingsTimeline.length ? holdingsTimeline[holdingsTimeline.length - 1] : null;
      const latestHoldings = ensureArray(latestTimeline && latestTimeline.holdings);
      return advancedRequest.error
        ? h(ErrorPanel, { message: advancedRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel advanced-strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, advancedData.strategy_name || "고급 섹터 진입 신호 포트폴리오"),
                h("div", { className: "summary-help" }, advancedData.description || "시장 20일선 필터와 섹터 진입 신호를 결합해 주식 노출을 가변 조절합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (advancedData.start_date || advancedStartDate) + " ~ " + (advancedData.end_date || advancedEndDate))
            ),
            h(
              "div",
              { className: "summary-grid-small strategy-summary-grid sector-rotation-summary-grid" },
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(advancedSummary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "비교군 수익률", value: formatPercent(advancedSummary.benchmark_return_pct, 2), help: advancedData.benchmark_name || "-" }),
              h(SummaryCard, { label: "초과 수익", value: formatPercent(advancedSummary.excess_return_pct, 2) }),
              h(SummaryCard, { label: "MDD", value: formatPercent(advancedSummary.mdd_pct, 2), help: "비교군 " + formatPercent(advancedSummary.benchmark_mdd_pct, 2) }),
              h(SummaryCard, { label: "평균/최대 노출", value: formatPercent(advancedSummary.avg_exposure_pct, 1), help: "최대 " + formatPercent(advancedSummary.max_exposure_pct, 1) }),
              h(SummaryCard, { label: "매매/수수료", value: numberFormat(advancedSummary.trade_count, 0) + "건", help: "누적 비용 " + formatPercent(advancedSummary.total_fee_pct_points, 2) })
            ),
            advancedRequest.loading && !advancedRows.length
              ? h(LoadingPanel, { label: advancedRequest.label })
              : advancedRows.length
                ? h(React.Fragment, null,
                    h(SectorRotationBacktestChart, {
                      rows: advancedRows,
                      strategyName: advancedData.strategy_name,
                      benchmarkName: advancedData.benchmark_name,
                      tradeLog: advancedData.trade_log,
                      selectedDate: selectedAdvancedDate || (advancedRows.length ? advancedRows[advancedRows.length - 1].date : ""),
                      onSelectDate: setSelectedAdvancedDate,
                    }),
                    renderSelectedAdvancedPortfolio(),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid advanced-detail-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: latestHoldings,
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "stock_name", label: "종목" },
                            { key: "weight_pct", label: "비중", render: function (row) { return formatPercent(row.weight_pct, 2); } },
                            { key: "beta", label: "β", render: function (row) { return row.beta == null ? "-" : numberFormat(row.beta, 2); } },
                            { key: "trend_score", label: "추세", render: function (row) { return row.trend_score == null ? "-" : numberFormat(row.trend_score, 1); } },
                            { key: "score", label: "점수", render: function (row) { return row.score == null ? "-" : numberFormat(row.score, 1); } },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "최근 편입/제외 로그"),
                        h(DataTable, {
                          rows: tradeLog.slice(0, 80),
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "date", label: "신호일" },
                            { key: "action", label: "구분" },
                            { key: "sector", label: "섹터" },
                            { key: "stock_name", label: "종목", render: function (row) {
                              return h("button", { type: "button", className: "table-link-button", onClick: function () { openStrategyTradeChart(row); } }, row.stock_name || row.stock_code || "-");
                            } },
                            { key: "after_weight_pct", label: "목표", render: function (row) { return formatPercent(row.after_weight_pct, 2); } },
                            { key: "trade_return_pct", label: "매매수익", render: function (row) { return row.trade_return_pct == null ? "-" : h("span", { className: pnlClass(row.trade_return_pct) }, formatPercent(row.trade_return_pct, 2)); } },
                            { key: "holding_days", label: "보유", render: function (row) { return row.holding_days == null ? "-" : numberFormat(row.holding_days, 0) + "일"; } },
                          ],
                        })
                      )
                    ),
                    renderAdvancedExecutionPanel()
                  )
                : h(EmptyState, { compact: true, message: "고급 백테스트 데이터가 없습니다. 기간이나 조건을 완화해 보세요." })
          );
    }

    function renderSectorResult() {
      const sectorPerformance = ensureArray(sectorData.sector_performance);
      const latestScores = ensureArray(sectorData.latest_sector_scores);
      return sectorRequest.error
        ? h(ErrorPanel, { message: sectorRequest.error })
        : h(
            "div",
            { className: "panel strategy-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, sectorData.strategy_name || "주도주 섹터 로테이션"),
                h("div", { className: "summary-help" }, sectorData.description || "오늘의 주도주 점수와 수동 섹터 DB를 이용해 D일 신호를 만들고 D+1일 수익률로 검증합니다.")
              ),
              h("span", { className: "telegram-status-pill" }, (sectorData.start_date || sectorStartDate) + " ~ " + (sectorData.end_date || sectorEndDate))
            ),
            h(
              "div",
              { className: "summary-grid-small strategy-summary-grid sector-rotation-summary-grid" },
              h(SummaryCard, { label: "전략 수익률", value: formatPercent(sectorSummary.strategy_return_pct, 2) }),
              h(SummaryCard, { label: "비교군 수익률", value: formatPercent(sectorSummary.benchmark_return_pct, 2), help: sectorData.benchmark_name || "조건 충족 종목 평균" }),
              h(SummaryCard, { label: "MDD", value: formatPercent(sectorSummary.mdd_pct, 2) }),
              h(SummaryCard, { label: "CAGR", value: formatPercent(sectorSummary.cagr_pct, 1) }),
              h(SummaryCard, { label: "평균 노출", value: formatPercent(sectorSummary.avg_exposure_pct, 1) }),
              h(SummaryCard, { label: "누적 수수료", value: formatPercent(sectorSummary.total_fee_pct_points, 2), help: "회전율 " + formatPercent(sectorSummary.total_turnover_pct, 1) })
            ),
            sectorRequest.loading && !sectorRows.length
              ? h(LoadingPanel, { label: sectorRequest.label })
              : sectorRows.length
                ? h(React.Fragment, null,
                    h(SectorRotationBacktestChart, {
                      rows: sectorRows,
                      strategyName: sectorData.strategy_name,
                      benchmarkName: sectorData.benchmark_name,
                      selectedDate: selectedSectorDate || (sectorRows.length ? sectorRows[sectorRows.length - 1].date : ""),
                      onSelectDate: setSelectedSectorDate,
                    }),
                    renderSelectedSectorPortfolio(),
                    renderLatestSectorSelection(),
                    h(
                      "div",
                      { className: "sector-rotation-table-grid" },
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: latestScores,
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "strength_score", label: "강도", render: function (row) { return numberFormat(row.strength_score, 1); } },
                            { key: "avg_score", label: "평균점수", render: function (row) { return numberFormat(row.avg_score, 1); } },
                            { key: "stock_count", label: "종목", render: function (row) { return numberFormat(row.stock_count, 0); } },
                            { key: "turnover_ratio_pct", label: "거래대금/시총", render: function (row) { return formatPercent(row.turnover_ratio_pct, 2); } },
                            { key: "leaders", label: "대표", render: function (row) { return ensureArray(row.leaders).slice(0, 4).join(", "); } },
                          ],
                        })
                      ),
                      h(
                        "div",
                        { className: "mini-table-panel" },
                        h("div", { className: "subsection-title" }, "섹터별 기여도"),
                        h(DataTable, {
                          rows: sectorPerformance,
                          emptyMessage: "기여도 데이터가 없습니다.",
                          columns: [
                            { key: "sector", label: "섹터" },
                            { key: "selected_days", label: "선택일", render: function (row) { return numberFormat(row.selected_days, 0); } },
                            { key: "contribution_pct", label: "기여", render: function (row) { return h("span", { className: pnlClass(row.contribution_pct) }, formatPercent(row.contribution_pct, 2)); } },
                            { key: "avg_weight_pct", label: "평균비중", render: function (row) { return formatPercent(row.avg_weight_pct, 1); } },
                            { key: "win_rate_pct", label: "승률", render: function (row) { return formatPercent(row.win_rate_pct, 1); } },
                          ],
                        })
                      )
                    )
                  )
                : h(EmptyState, { compact: true, message: "섹터 로테이션 백테스트 데이터가 없습니다. 오늘의 주도주 DB를 먼저 로드해 주세요." })
          );
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel strategy-hero" },
        h("div", { className: "eyebrow" }, "Quant Strategy"),
        h("h1", { className: "page-title" }, "전략 백테스트"),
        h("p", { className: "page-copy compact-copy" }, "현재 투자 방식의 꼬리 손실과 시장 필터, 섹터 진입 신호를 비교해 추세추종 전략을 개선합니다."),
        h(
          "div",
          { className: "strategy-mode-tabs" },
          renderModeButton("leader_top10", "국내 주도주"),
          renderModeButton("us_leader", "미국 주도주"),
          renderModeButton("leader_compare", "전략 비교"),
          renderModeButton("advanced_sector", "고급 섹터 신호"),
          renderModeButton("sector_rotation", "주도주 섹터 로테이션"),
          renderModeButton("index", "지수 전략")
        ),
        strategyMode === "leader_top10"
          ? renderLeaderControls("kr")
          : strategyMode === "us_leader"
            ? renderLeaderControls("us")
          : strategyMode === "leader_compare"
            ? null
          : strategyMode === "advanced_sector" ? renderAdvancedControls() : strategyMode === "sector_rotation" ? renderSectorControls() : renderIndexControls()
      ),
      renderLeaderSavedSnapshotsPanel(),
      strategyMode === "leader_top10" || strategyMode === "us_leader"
        ? (leaderBacktestStarted || (strategyMode === "leader_top10" && activeLeaderSnapshot)
          ? renderLeaderResult()
          : h(EmptyState, { compact: true, message: "설정값을 확인한 뒤 백테스트 실행 버튼을 눌러 주세요." }))
        : strategyMode === "leader_compare"
          ? renderLeaderCompareResult()
        : strategyMode === "advanced_sector" ? renderAdvancedResult() : strategyMode === "sector_rotation" ? renderSectorResult() : renderIndexResult(),
      renderStrategyTradeChartPopup()
    );
  }


    return StrategyBacktestPage;
  }

  modules.strategyBacktestPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
