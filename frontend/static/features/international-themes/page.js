(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPages(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const AUTO_DAILY_THEME_BUILD_EVENT = deps.AUTO_DAILY_THEME_BUILD_EVENT;
    const buildBusinessMonthCells = deps.buildBusinessMonthCells;
    const calendarRankCellClass = deps.calendarRankCellClass;
    const calendarRankCellStyle = deps.calendarRankCellStyle;
    const colorForKey = deps.colorForKey;
    const copyImageBlobWithFallback = deps.copyImageBlobWithFallback;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const filterCalendarDays = deps.filterCalendarDays;
    const formatDateLabel = deps.formatDateLabel;
    const formatPercent = deps.formatPercent;
    const getCalendarTopSectors = deps.getCalendarTopSectors;
    const h = deps.h;
    const invalidateApiCache = deps.invalidateApiCache;
    const LoadingBlock = deps.LoadingBlock;
    const LoadingPanel = deps.LoadingPanel;
    const mergeScoreHistoryPayloadRows = deps.mergeScoreHistoryPayloadRows;
    const monthLabel = deps.monthLabel;
    const normalizeTimestampMs = deps.normalizeTimestampMs;
    const numberFormat = deps.numberFormat;
    const openStockInGlobalCompany = deps.openStockInGlobalCompany;
    const postJson = deps.postJson;
    const removeBackgroundTask = deps.removeBackgroundTask;
    const renderHighDrawdownPercent = deps.renderHighDrawdownPercent;
    const ScoreHistoryChart = deps.ScoreHistoryChart;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const shiftIsoDate = deps.shiftIsoDate;
    const shiftMonth = deps.shiftMonth;
    const StockChartPreview = deps.StockChartPreview;
    const SummaryCard = deps.SummaryCard;
    const THEME_STOCK_NAV_KEY = deps.THEME_STOCK_NAV_KEY;
    const TradingValueHistoryChart = deps.TradingValueHistoryChart;
    const upsertBackgroundTask = deps.upsertBackgroundTask;
    const useFetchJson = deps.useFetchJson;

  function InternationalThemesBoardPage(config) {
    const [selectedFileDate, setSelectedFileDate] = useState("");
    const [sectorFilter, setSectorFilter] = useState("all");
    const [selectedRegion, setSelectedRegion] = useState(function () {
      const options = ensureArray(config.regionOptions);
      return options.length ? String(options[0].code || "all") : "all";
    });
    const [calendarMode, setCalendarMode] = useState("week");
    const [themeBoxExpanded, setThemeBoxExpanded] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [reloadMessage, setReloadMessage] = useState("");
    const [themeTableSortState, setThemeTableSortState] = useState({ key: "score", direction: "desc" });
    const [rankFilterMode, setRankFilterMode] = useState("all");
    const [chartPopup, setChartPopup] = useState({ open: false, row: null, loading: false, error: "", data: null });
    const scoreHistoryCacheRef = useRef({});
    const scoreHistoryRequestSeqRef = useRef(0);
    const [scoreHistoryPopup, setScoreHistoryPopup] = useState({
      open: false,
      loading: false,
      loadingMore: false,
      hasMore: true,
      error: "",
      row: null,
      payload: null,
      cacheKey: "",
      activeTab: "trend",
    });
    const [stockSearchText, setStockSearchText] = useState("");
    const [stockSearchOpen, setStockSearchOpen] = useState(false);
    const [stockSearchActiveIndex, setStockSearchActiveIndex] = useState(0);
    const [stockSearchMessage, setStockSearchMessage] = useState("");
    const [highlightedStockKey, setHighlightedStockKey] = useState("");
    const [scoreFormulaModalOpen, setScoreFormulaModalOpen] = useState(false);
    const [scoreFormulaDraft, setScoreFormulaDraft] = useState(null);
    const [scoreFormulaStatus, setScoreFormulaStatus] = useState({ type: "", message: "" });
    const [scoreFormulaSaving, setScoreFormulaSaving] = useState(false);
    const [scoreFormulaRecalculating, setScoreFormulaRecalculating] = useState(false);
    const [scoreFormulaSnapshotSaving, setScoreFormulaSnapshotSaving] = useState(false);
    const [scoreFormulaOracleSyncing, setScoreFormulaOracleSyncing] = useState(false);
    const [scoreFormulaJobState, setScoreFormulaJobState] = useState(null);
    const scoreFormulaJobPollRef = useRef(null);
    const [scoreFormulaSnapshotLabel, setScoreFormulaSnapshotLabel] = useState("");
    const [captureStageReady, setCaptureStageReady] = useState(false);
    const [scoreTableCopyState, setScoreTableCopyState] = useState({ status: "", message: "" });
    const stockRowRefs = useRef({});
    const pendingStockScrollKeyRef = useRef("");
    const themeTableScrollRef = useRef(null);
    const scoreTableCaptureRef = useRef(null);
    const [datePickerMonth, setDatePickerMonth] = useState(function () {
      const today = new Date();
      return today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
    });
    const baseThemesParams = ["min_score=0", "recent_limit=20"];
    const scoreFormulaMarket = config.pageKey === "global-themes" ? "us" : "asia";
    const scoreFormulaMarketLabel = config.pageKey === "global-themes" ? "미국" : "아시아";
    const scoreFormulaConfigRequest = useFetchJson("/api/themes/score-formula-config?market=" + encodeURIComponent(scoreFormulaMarket));
    const scoreFormulaSnapshotsRequest = useFetchJson("/api/themes/score-formula-snapshots?market=" + encodeURIComponent(scoreFormulaMarket) + "&limit=20");
    function ensureOwnMarketScoreFormulaConfig(rawConfig) {
      const next = JSON.parse(JSON.stringify(rawConfig || {}));
      if (!next.display_formula || typeof next.display_formula !== "object") {
        next.display_formula = {};
      }
      if (config.pageKey === "global-themes") {
        if (next.display_formula.us_capture_score_threshold == null || next.display_formula.us_capture_score_threshold === "") {
          next.display_formula.us_capture_score_threshold = 15;
        }
      } else if (next.display_formula.asia_capture_score_threshold == null || next.display_formula.asia_capture_score_threshold === "") {
        next.display_formula.asia_capture_score_threshold = 35;
      }
      return next;
    }
    if (selectedFileDate) {
      baseThemesParams.push("file_date=" + encodeURIComponent(selectedFileDate));
    }
    if (selectedRegion && ensureArray(config.regionOptions).length) {
      baseThemesParams.push("region=" + encodeURIComponent(selectedRegion));
    }
    const themesUrl = config.themesTodayUrl + "?" + baseThemesParams.join("&");
    const themesRequest = useFetchJson(themesUrl);
    const baseCalendarParams = ["min_score=0", "limit=60"];
    if (selectedRegion && ensureArray(config.regionOptions).length) {
      baseCalendarParams.push("region=" + encodeURIComponent(selectedRegion));
    }
    const calendarRequest = useFetchJson(config.calendarUrl + "?" + baseCalendarParams.join("&"));

    useEffect(function () {
        emitWindowTitleDetail(config.pageKey, selectedFileDate || "전체");
    }, [selectedFileDate]);

    useEffect(function () {
      if (!themesRequest.data || !themesRequest.data.file_date) {
        return;
      }
      if (!selectedFileDate || themesRequest.data.fallback_reason === "requested_file_missing") {
        setSelectedFileDate(themesRequest.data.file_date);
      }
    }, [selectedFileDate, themesRequest.data]);

    useEffect(function () {
      if (selectedFileDate) {
        setDatePickerMonth(String(selectedFileDate).slice(0, 7));
      }
    }, [selectedFileDate]);

    useEffect(function () {
      function handleAutoDailyBuild(event) {
        const detail = (event && event.detail) || {};
        if ((config.pageKey === "global-themes" && detail.market !== "us")
          || (config.pageKey !== "global-themes" && detail.market !== "asia")) {
          return;
        }
        themesRequest.refresh(true).catch(function () {
        });
        calendarRequest.refresh(true).catch(function () {
        });
      }
      window.addEventListener(AUTO_DAILY_THEME_BUILD_EVENT, handleAutoDailyBuild);
      return function () {
        window.removeEventListener(AUTO_DAILY_THEME_BUILD_EVENT, handleAutoDailyBuild);
      };
    }, [config.pageKey, themesRequest, calendarRequest]);

    useEffect(function () {
      return function () {
        stopOwnMarketScoreFormulaJobPolling();
      };
    }, []);

    useEffect(function () {
      const payload = scoreFormulaConfigRequest.data || null;
      if (!payload || !payload.config) {
        return;
      }
      setScoreFormulaDraft(function (current) {
        return current || ensureOwnMarketScoreFormulaConfig(payload.config);
      });
    }, [scoreFormulaConfigRequest.data]);

    useEffect(function () {
      setSectorFilter("all");
    }, [selectedRegion]);

    useEffect(function () {
      const themesData = themesRequest.data || null;
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
    }, [themesRequest.data, selectedFileDate]);
    const themes = themesRequest.data || {};
    const calendar = calendarRequest.data || {};
    const themesLoading = !themesRequest.data && themesRequest.loading;
    const themesError = themesRequest.data ? "" : (themesRequest.error || "");
    const themesLabel = themesRequest.loading ? "해외 주도주 데이터 불러오는 중" : "해외 주도주 데이터 정리 중";
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
    sortedCalendarDays.forEach(function (day) {
      const key = String(day.date || "");
      if (!key) return;
      const score = Number(day.top10_avg_score != null ? day.top10_avg_score : day.top50_avg_score);
      if (Number.isFinite(score)) {
        calendarDayScoreMap[key] = score;
      }
    });
    const anchorDate = selectedFileDate || themes.file_date || "";
    const visibleCalendarDays = filterCalendarDays(sortedCalendarDays, anchorDate, calendarMode);
    const calendarTopSectors = getCalendarTopSectors(visibleCalendarDays, 5);
    const rows = ensureArray(themes.qualified_stocks);
    const sectorSummary = [];
    const sectorMap = {};
    rows.forEach(function (row) {
      const sector = String(row.manual_sector || row.theme || "Other").trim() || "Other";
      if (!sectorMap[sector]) {
        sectorMap[sector] = { sector: sector, count: 0, changeTotal: 0, leaders: [] };
        sectorSummary.push(sectorMap[sector]);
      }
      sectorMap[sector].count += 1;
      sectorMap[sector].changeTotal += Number(row.change_pct || 0);
      if (sectorMap[sector].leaders.length < 4) {
        sectorMap[sector].leaders.push(row.stock_name || row.stock_code || "-");
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
      : rows.filter(function (row) { return String(row.manual_sector || row.theme || "").trim() === sectorFilter; });
    const sortColumns = {
      rank: function (row) { return Number(row.rank || 0); },
      sector: function (row) { return String(row.manual_sector || row.theme || ""); },
      stock_code: function (row) { return String(row.stock_code || ""); },
      stock_name: function (row) { return String(row.stock_name || row.stock_code || ""); },
      sortino_norm: function (row) { return Number(row.sortino_norm || 0); },
      atr_20: function (row) { return Number(row.atr_20_pct || row.atr_20 || 0); },
      high_drawdown_pct: function (row) {
        const rawValue = Number(row && row.pct_to_52w_high);
        return Number.isFinite(rawValue) ? rawValue : Number.POSITIVE_INFINITY;
      },
      score_o: function (row) { return Number(row.score_o || 0); },
      score: function (row) { return Number(row.score || 0); },
      change_pct: function (row) { return Number(row.change_pct || 0); },
      market_cap_100m: function (row) { return Number(row.market_cap_100m || 0); },
      trading_value_100m: function (row) { return Number(row.trading_value_100m || 0); },
      is_adr: function (row) { return Number(row.is_adr ? 1 : 0); },
      industry: function (row) { return String(row.industry || ""); },
      note: function (row) { return String(row.note || ""); },
    };
    const sortKey = themeTableSortState.key || "score";
    const isRank52Mode = sortKey === "rank" && rankFilterMode === "high52";
    const baseVisibleRows = sortKey === "rank"
      ? visibleRows.filter(function (row) {
          return isRank52Mode ? isTradableHigh52(row) : true;
        })
      : visibleRows;
    const sortedVisibleRows = baseVisibleRows.slice().sort(function (left, right) {
      if (sortKey === "rank") {
        const scoreGap = Number(right.score || 0) - Number(left.score || 0);
        if (scoreGap !== 0) {
          return scoreGap;
        }
        const dailyGap = Number(right.score_o || 0) - Number(left.score_o || 0);
        if (dailyGap !== 0) {
          return dailyGap;
        }
        return Number(left.rank || 0) - Number(right.rank || 0);
      }
      const valueFactory = sortColumns[sortKey] || sortColumns.score;
      const leftValue = valueFactory(left);
      const rightValue = valueFactory(right);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      var result = 0;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        result = leftNumber - rightNumber;
      } else {
        result = String(leftValue || "").localeCompare(String(rightValue || ""), "en");
      }
      if (result === 0) {
        result = Number(left.rank || 0) - Number(right.rank || 0);
      }
      return themeTableSortState.direction === "asc" ? result : -result;
    });
    const showMarketColumn = config.showMarketColumn !== false;
    const showTickerColumn = !!config.showTickerColumn;
    const displayFormulaConfig = (scoreFormulaDraft && scoreFormulaDraft.display_formula) || ((scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config && scoreFormulaConfigRequest.data.config.display_formula) || {});
    const captureScoreThreshold = config.pageKey === "global-themes"
      ? Number(displayFormulaConfig.us_capture_score_threshold || 15)
      : Number(displayFormulaConfig.asia_capture_score_threshold || 35);
    const captureRegionLabel = config.pageKey === "asia-themes"
      ? ((ensureArray(config.regionOptions).find(function (item) {
          return String(item.code || "") === String(selectedRegion || "");
        }) || {}).label || "아시아")
      : "미국";
    const captureTitle = captureRegionLabel + " 주도주 · 종합점수 " + numberFormat(captureScoreThreshold, 0) + "점 이상";
    const captureButtonLabel = captureRegionLabel + " 종합점수 " + numberFormat(captureScoreThreshold, 0) + "점 이상 캡쳐";
    const captureEmptyMessage = "종합점수 " + numberFormat(captureScoreThreshold, 0) + "점 이상 종목이 없습니다.";
    const captureRows = sortedVisibleRows.map(function (row, index) {
      return Object.assign({ __display_rank: index + 1 }, row);
    }).filter(function (row) {
      return Number(row.score || 0) >= captureScoreThreshold;
    });

    function normalizeStockSearchText(value) {
      return String(value || "").toLowerCase().replace(/\s+/g, "");
    }

    function buildStockSearchKey(row) {
      const code = String((row || {}).stock_code || "").trim().toUpperCase();
      return code || String((row || {}).stock_name || "").trim();
    }

    function stockSearchHaystack(row) {
      return normalizeStockSearchText([
        row.stock_name,
        row.stock_code,
        row.industry,
        row.manual_sector,
        row.theme,
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
        const rowElement = stockRowRefs.current[stockKey];
        if (!rowElement) {
          return;
        }
        if (rowElement.scrollIntoView) {
          rowElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
        const scroller = themeTableScrollRef.current;
        if (scroller && typeof rowElement.offsetTop === "number") {
          const targetTop = Math.max(0, rowElement.offsetTop - (scroller.clientHeight / 2) + (rowElement.offsetHeight / 2));
          scroller.scrollTo({ top: targetTop, behavior: "smooth" });
        }
      }, delay || 0);
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
      chooseStockSearchRow(matched);
    }

    function chooseStockSearchRow(row) {
      if (!row) {
        return;
      }
      const stockKey = buildStockSearchKey(row);
      const targetIndex = sortedVisibleRows.findIndex(function (item) {
        return buildStockSearchKey(item) === stockKey;
      });
      setStockSearchText(row.stock_name || row.stock_code || "");
      setStockSearchOpen(false);
      setStockSearchActiveIndex(0);
      setHighlightedStockKey(stockKey);
      if (targetIndex < 0 && sectorFilter !== "all") {
        pendingStockScrollKeyRef.current = stockKey;
        setSectorFilter("all");
        setStockSearchMessage((row.stock_name || "종목") + " 위치로 이동합니다.");
        return;
      }
      const displayRank = targetIndex >= 0 ? targetIndex + 1 : Number(row.rank || 0);
      setStockSearchMessage((row.stock_name || "종목") + " · " + numberFormat(displayRank, 0) + "번 위치로 이동합니다.");
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

    function copyElementToClipboard(target, setCopyState, options) {
      const captureOptions = options || {};
      function finishWithoutTarget() {
        if (typeof captureOptions.afterFinish === "function") {
          captureOptions.afterFinish();
        }
      }
      if (!target) {
        setCopyState({ status: "error", message: "캡쳐용 이미지를 만들지 못했습니다." });
        finishWithoutTarget();
        return;
      }
      if (!window.html2canvas) {
        setCopyState({ status: "error", message: "캡쳐 이미지를 복사하지 못했습니다." });
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
      new Promise(function (resolve) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            if (settleMs > 0) {
              window.setTimeout(resolve, settleMs);
            } else {
              resolve();
            }
          });
        });
      }).then(function () {
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

    useEffect(function () {
      if (!pendingStockScrollKeyRef.current) {
        return;
      }
      const stockKey = pendingStockScrollKeyRef.current;
      const matched = sortedVisibleRows.find(function (row) {
        return buildStockSearchKey(row) === stockKey;
      });
      if (!matched) {
        return;
      }
      pendingStockScrollKeyRef.current = "";
      const displayRank = sortedVisibleRows.findIndex(function (row) {
        return buildStockSearchKey(row) === stockKey;
      }) + 1;
      setStockSearchMessage((matched.stock_name || "종목") + " · " + numberFormat(displayRank, 0) + "번 위치로 이동합니다.");
      scrollToStockRow(stockKey, 80);
      scrollToStockRow(stockKey, 260);
    }, [sortedVisibleRows]);

    function toggleTableSort(sortKey) {
      if (sortKey === "rank") {
        if (themeTableSortState.key !== "rank") {
          setRankFilterMode("high52");
          setThemeTableSortState({ key: "rank", direction: "desc" });
          return;
        }
        if (rankFilterMode === "high52") {
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
        return { key: sortKey, direction: sortKey === "stock_name" || sortKey === "sector" || sortKey === "industry" || sortKey === "note" ? "asc" : "desc" };
      });
    }

    function invalidateOwnCache() {
      invalidateApiCache(function (key) {
        return key.indexOf(config.apiPrefix) === 0 || key.indexOf(config.calendarUrl) === 0;
      });
    }

    function refreshThemeData() {
      setReloading(true);
      setReloadMessage("");
      postJson(config.reloadUrl, {
        file_date: selectedFileDate || null,
        min_score: 0,
        recent_limit: 20,
        reload_all: false,
        region: selectedRegion,
      }).then(function (payload) {
        invalidateOwnCache();
        setReloadMessage("데이터를 다시 불러왔습니다: " + ((payload && payload.file_date) || ""));
      }).catch(function (error) {
        setReloadMessage("데이터 새로고침 실패: " + (error.message || String(error)));
      }).finally(function () {
        setReloading(false);
      });
    }

    function buildTodayData() {
      setReloading(true);
      setReloadMessage("");
      postJson(config.buildTodayUrl, { min_score: 0, recent_limit: 20, region: selectedRegion })
        .then(function (payload) {
          invalidateOwnCache();
          if (payload && payload.file_date) {
            setSelectedFileDate(payload.file_date);
          }
          setReloadMessage(((payload && payload.today_excel_build && payload.today_excel_build.date) || "") + " 데이터 생성/로드 완료");
        })
        .catch(function (error) {
          setReloadMessage("오늘자 데이터 생성 결과 반영 실패: " + (error.message || String(error)));
        })
        .finally(function () {
          setReloading(false);
        });
    }

    function openScoreFormulaModal() {
      if (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config) {
        setScoreFormulaDraft(ensureOwnMarketScoreFormulaConfig(scoreFormulaConfigRequest.data.config));
      }
      setScoreFormulaStatus({ type: "", message: "" });
      setScoreFormulaModalOpen(true);
    }

    function closeScoreFormulaModal() {
      if (scoreFormulaSaving || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing) {
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
        invalid_fill: "무효값 대체",
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
        kr_capture_score_threshold: "캡쳐 기준점수",
        us_capture_score_threshold: "미국 종합점수 캡쳐 기준",
        asia_capture_score_threshold: "아시아 종합점수 캡쳐 기준",
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
        const payload = await postJson("/api/themes/score-formula-config", { market: scoreFormulaMarket, config: scoreFormulaDraft });
        setScoreFormulaDraft(JSON.parse(JSON.stringify(payload.config || {})));
        await scoreFormulaConfigRequest.refresh(true);
        setScoreFormulaStatus({ type: "success", message: scoreFormulaMarketLabel + " 점수 설정을 저장했습니다." });
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
      } finally {
        setScoreFormulaSaving(false);
      }
    }

    async function saveOwnMarketScoreFormulaSnapshot() {
      if (!scoreFormulaDraft || scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving) {
        return;
      }
      setScoreFormulaSnapshotSaving(true);
      setScoreFormulaStatus({ type: "", message: "" });
      try {
        const payload = await postJson("/api/themes/score-formula-snapshots", {
          market: scoreFormulaMarket,
          label: scoreFormulaSnapshotLabel,
          config: scoreFormulaDraft,
        });
        await scoreFormulaSnapshotsRequest.refresh(true);
        setScoreFormulaSnapshotLabel("");
        setScoreFormulaStatus({
          type: "success",
          message: scoreFormulaMarketLabel + " 점수 설정 저장본을 DB에 기록했습니다. " + String((((payload || {}).snapshot || {}).created_at || "")),
        });
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
      } finally {
        setScoreFormulaSnapshotSaving(false);
      }
    }

    function applyOwnMarketScoreFormulaSnapshot(snapshot) {
      if (!snapshot || !snapshot.config) {
        return;
      }
      setScoreFormulaDraft(ensureOwnMarketScoreFormulaConfig(snapshot.config));
      setScoreFormulaStatus({ type: "success", message: scoreFormulaMarketLabel + " 저장본을 불러왔습니다. 설정 저장 후 재계산하면 반영됩니다." });
    }

    function stopOwnMarketScoreFormulaJobPolling() {
      if (scoreFormulaJobPollRef.current) {
        window.clearInterval(scoreFormulaJobPollRef.current);
        scoreFormulaJobPollRef.current = null;
      }
    }

    async function pollOwnMarketScoreFormulaJobStatus(scope, options) {
      const normalizedScope = scope === "recent_1y" ? "recent_1y" : "full";
      const payload = await fetchJson("/api/themes/recalculate-scores/status?market=" + encodeURIComponent(scoreFormulaMarket), { silent: true, noCache: true });
      setScoreFormulaJobState(payload || null);
      const status = String((payload && payload.status) || "").toLowerCase();
      const percent = Number(payload && payload.percent);
      upsertBackgroundTask({
        id: "score-formula-" + scoreFormulaMarket,
        label: scoreFormulaMarketLabel + " 점수 재계산",
        market: scoreFormulaMarket,
        marketLabel: scoreFormulaMarketLabel,
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
          message: progressPrefix + (payload && payload.message ? payload.message : scoreFormulaMarketLabel + " 백그라운드 재계산 진행 중"),
        });
        return payload;
      }
      stopOwnMarketScoreFormulaJobPolling();
      setScoreFormulaRecalculating(false);
      if (status === "completed") {
        await Promise.all([
          scoreFormulaConfigRequest.refresh(true),
          themesRequest.refresh(true),
          calendarRequest.refresh(true),
        ]);
        const result = (payload && payload.result) || {};
        const completeMessage = scoreFormulaMarketLabel + " " + (normalizedScope === "recent_1y" ? "최근 1년 재계산" : "전체 재계산")
          + (result && result.recalculated_dates ? " / " + numberFormat(result.recalculated_dates, 0) + "일자" : "")
          + " 완료";
        setScoreFormulaStatus({
          type: "success",
          message: completeMessage + (Number.isFinite(Number(result.duration_sec)) ? " (" + numberFormat(Number(result.duration_sec), 2) + "초)" : ""),
        });
        if (!(options && options.silentCompleteAlert)) {
          window.alert(completeMessage);
        }
        return payload;
      }
      removeBackgroundTask("score-formula-" + scoreFormulaMarket);
      const errorMessage = (payload && (payload.error || payload.message)) || (scoreFormulaMarketLabel + " 점수 재계산 실패");
      setScoreFormulaStatus({ type: "error", message: errorMessage });
      return payload;
    }

    function startOwnMarketScoreFormulaJobPolling(scope) {
      stopOwnMarketScoreFormulaJobPolling();
      pollOwnMarketScoreFormulaJobStatus(scope).catch(function () {});
      scoreFormulaJobPollRef.current = window.setInterval(function () {
        pollOwnMarketScoreFormulaJobStatus(scope).catch(function () {});
      }, 3000);
    }

    async function recalculateOwnMarketScores(scope) {
      if (scoreFormulaSaving || scoreFormulaRecalculating) {
        return;
      }
      const effectiveConfig = scoreFormulaDraft || (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config) || null;
      if (!effectiveConfig) {
        setScoreFormulaStatus({ type: "error", message: "점수 지표 설정을 아직 불러오는 중입니다. 잠시 후 다시 시도해 주세요." });
        return;
      }
      const scopeLabel = String(scope || "full") === "recent_1y" ? "최근 1년" : "전체";
      setScoreFormulaStatus({ type: "", message: "" });
      setScoreFormulaRecalculating(true);
      try {
        const payload = await postJson("/api/themes/recalculate-scores/background", { config: effectiveConfig, scope: scope, market: scoreFormulaMarket });
        setScoreFormulaJobState(payload || null);
        upsertBackgroundTask({
          id: "score-formula-" + scoreFormulaMarket,
          label: scoreFormulaMarketLabel + " 점수 재계산",
          market: scoreFormulaMarket,
          marketLabel: scoreFormulaMarketLabel,
          scope: scope === "recent_1y" ? "recent_1y" : "full",
          status: String((payload && payload.status) || "queued").toLowerCase(),
          percent: Number(payload && payload.percent) || 0,
          message: (payload && payload.message) || "백그라운드 재계산 시작",
          startedAt: normalizeTimestampMs((payload && payload.started_ts) || Date.now()),
        });
        setScoreFormulaStatus({
          type: "success",
          message: scoreFormulaMarketLabel + " " + scopeLabel + " 재계산을 백그라운드에서 시작했습니다. 다른 기능을 계속 사용할 수 있습니다.",
        });
        startOwnMarketScoreFormulaJobPolling(scope === "recent_1y" ? "recent_1y" : "full");
      } catch (error) {
        setScoreFormulaStatus({ type: "error", message: error.message || String(error) });
        setScoreFormulaRecalculating(false);
      }
    }

    async function syncOwnMarketScoreFormulaToOracle() {
      if (!scoreFormulaDraft || scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing) {
        return;
      }
      setScoreFormulaOracleSyncing(true);
      setScoreFormulaStatus({ type: "", message: "" });
      try {
        await postJson("/api/themes/score-formula-config", { market: scoreFormulaMarket, config: scoreFormulaDraft });
        await scoreFormulaConfigRequest.refresh(true);
        const payload = await postJson("/api/oracle-sync/score-formula/push", { markets: [scoreFormulaMarket] });
        const markets = ((payload && payload.markets) || []).join(", ");
        setScoreFormulaStatus({
          type: "success",
          message: "Oracle 서버에 " + scoreFormulaMarketLabel + " 점수 공식을 업데이트했습니다." + (markets ? " (" + markets + ")" : ""),
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
      const modalConfig = scoreFormulaDraft || (scoreFormulaConfigRequest.data && scoreFormulaConfigRequest.data.config) || {};
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
              h("div", { className: "eyebrow" }, scoreFormulaMarketLabel + " Score Formula"),
              h("h2", null, scoreFormulaMarketLabel + " 점수 지표 수정")
            ),
            h("button", { type: "button", className: "mini-button", onClick: closeScoreFormulaModal, disabled: scoreFormulaSaving || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing }, "닫기")
          ),
          scoreFormulaConfigRequest.loading && !scoreFormulaDraft
            ? h(LoadingBlock, { compact: true, title: scoreFormulaMarketLabel + " 점수 설정 불러오는 중", label: scoreFormulaConfigRequest.label })
            : h(
                React.Fragment,
                null,
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
                        h("span", null, "시장: " + scoreFormulaMarketLabel),
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
                  h("h3", { className: "score-formula-section-title" }, scoreFormulaMarketLabel + " 점수 설정 저장본"),
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
                        placeholder: scoreFormulaMarketLabel + " 복구 전",
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
                        onClick: saveOwnMarketScoreFormulaSnapshot,
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
                                { key: "score-formula-snapshot-" + scoreFormulaMarket + "-" + String(snapshot.id || "") },
                                h("td", null, String(snapshot.created_at || "").replace("T", " ")),
                                h("td", null, snapshot.label || "-"),
                                h("td", null, snapshot.source === "auto" ? "자동" : "수동"),
                                h("td", null, h("button", { type: "button", className: "mini-button", onClick: function () { applyOwnMarketScoreFormulaSnapshot(snapshot); } }, "불러오기"))
                              );
                            })
                          )
                        )
                      )
                    : h("div", { className: "summary-help" }, "저장된 점수 설정 이력이 없습니다."),
                ),
                Object.keys(modalConfig).map(function (sectionKey) {
                  const section = modalConfig[sectionKey];
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
                  h("button", { type: "button", className: "secondary-button", onClick: saveOwnMarketScoreFormulaSnapshot, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing }, scoreFormulaSnapshotSaving ? "저장 중..." : "DB 저장본 만들기"),
                  h("button", { type: "button", className: "secondary-button", onClick: syncOwnMarketScoreFormulaToOracle, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaSnapshotSaving || scoreFormulaOracleSyncing }, scoreFormulaOracleSyncing ? "업데이트 중..." : "Oracle 공식 업데이트"),
                  h("button", { type: "button", className: "secondary-button", onClick: function () { recalculateOwnMarketScores("recent_1y"); }, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaOracleSyncing }, scoreFormulaRecalculating ? "재계산 중..." : (scoreFormulaMarketLabel + " 최근 1년 재계산")),
                  h("button", { type: "button", className: "primary-button", onClick: function () { recalculateOwnMarketScores("full"); }, disabled: scoreFormulaSaving || scoreFormulaRecalculating || scoreFormulaOracleSyncing }, scoreFormulaRecalculating ? "재계산 중..." : (scoreFormulaMarketLabel + " 전체 재계산"))
                )
              )
        )
      );
    }

    function openChart(row) {
      setChartPopup({ open: true, row: row, loading: true, error: "", data: null });
      const params = new URLSearchParams();
      if (row.stock_code) params.set("code", row.stock_code);
      if (row.stock_name) params.set("name", row.stock_name);
      params.set("months", "3");
      fetchJson("/api/stocks/chart-preview?" + params.toString())
        .then(function (payload) {
          setChartPopup({ open: true, row: row, loading: false, error: "", data: payload });
        })
        .catch(function (error) {
          setChartPopup({ open: true, row: row, loading: false, error: error.message || String(error), data: null });
        });
    }

    function selectCalendarDate(date, sector) {
      if (!date) return;
      setSelectedFileDate(date);
      setSectorFilter(sector || "all");
    }

    function selectFileDate(date) {
      if (!date || !availableDateMap[date]) {
        return;
      }
      setSelectedFileDate(date);
      setSectorFilter("all");
    }

    function renderNumberCell(value, digits) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return numberFormat(number, digits == null ? 2 : digits);
    }

    function renderMarketValueCell(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      if (config.pageKey === "global-themes") {
        return numberFormat(number / 10, 2);
      }
      return numberFormat(number, 2);
    }

    function renderSignedPercent(value) {
      const number = Number(value);
      let className = "metric-flat";
      if (number > 0) className = "metric-up";
      else if (number < 0) className = "metric-down";
      return h("span", { className: className }, formatPercent(number, 2));
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

    function renderRankCell(row, rankValue) {
      const high52 = isHigh52(row && row.is_52w_high);
      const displayRank = Number(rankValue != null ? rankValue : (row && row.__display_rank != null ? row.__display_rank : row.rank));
      return h(
        "span",
        {
          className: "rank-cell" + (high52 ? " high52" : ""),
          title: high52 ? "52주 신고가" : "",
        },
        numberFormat(displayRank, 0)
      );
    }

    function buildScoreHistoryKey(row) {
      const code = String((row || {}).stock_code || "").trim().toUpperCase();
      const name = String((row || {}).stock_name || "").trim();
      const endDate = selectedFileDate || themes.file_date || "";
      return [
        config.pageKey,
        selectedRegion || "",
        code,
        name,
        endDate,
      ].join("|");
    }

    function closeScoreHistory() {
      scoreHistoryRequestSeqRef.current += 1;
      setScoreHistoryPopup({
        open: false,
        loading: false,
        loadingMore: false,
        hasMore: true,
        error: "",
        row: null,
        payload: null,
        cacheKey: "",
        activeTab: "trend",
      });
    }

    function openScoreHistory(row, options) {
      if (!row) {
        return;
      }
      const openOptions = options || {};
      const activeTab = openOptions.activeTab || "trend";
      const code = String(row.stock_code || "").trim().toUpperCase();
      const name = String(row.stock_name || "").trim();
      const endDate = selectedFileDate || themes.file_date || "";
      const cacheKey = buildScoreHistoryKey(row);
      const cached = scoreHistoryCacheRef.current[cacheKey];
      scoreHistoryRequestSeqRef.current += 1;
      const requestSeq = scoreHistoryRequestSeqRef.current;
      if (cached) {
        setScoreHistoryPopup({
          open: true,
          loading: false,
          loadingMore: false,
          hasMore: cached.hasMore !== false,
          error: "",
          row: row,
          payload: cached,
          cacheKey: cacheKey,
          activeTab: activeTab,
        });
        return;
      }
      setScoreHistoryPopup({
        open: true,
        loading: true,
        loadingMore: false,
        hasMore: true,
        error: "",
        row: row,
        payload: null,
        cacheKey: cacheKey,
        activeTab: activeTab,
      });
      const params = new URLSearchParams();
      if (code) {
        params.set("code", code);
      }
      if (name) {
        params.set("name", name);
      }
      if (endDate) {
        params.set("end_date", endDate);
      }
      params.set("days", "365");
      if (config.pageKey === "global-themes") {
        params.set("market", "us");
      } else if (config.pageKey === "asia-themes") {
        params.set("market", "asia");
        params.set("region", selectedRegion || "jp");
      }
      fetchJson("/api/themes/score-history?" + params.toString(), { noCache: true })
        .then(function (payload) {
          payload.hasMore = true;
          scoreHistoryCacheRef.current[cacheKey] = payload;
          if (scoreHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setScoreHistoryPopup({
            open: true,
            loading: false,
            loadingMore: false,
            hasMore: true,
            error: "",
            row: row,
            payload: payload,
            cacheKey: cacheKey,
            activeTab: activeTab,
          });
        })
        .catch(function (error) {
          if (scoreHistoryRequestSeqRef.current !== requestSeq) {
            return;
          }
          setScoreHistoryPopup({
            open: true,
            loading: false,
            loadingMore: false,
            hasMore: false,
            error: error.message || String(error),
            row: row,
            payload: null,
            cacheKey: cacheKey,
            activeTab: activeTab,
          });
        });
    }

    function setScoreHistoryActiveTab(nextTab) {
      setScoreHistoryPopup(function (current) {
        return Object.assign({}, current, { activeTab: nextTab === "breakdown" ? "breakdown" : "trend" });
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
      const code = String(row.stock_code || "").trim().toUpperCase();
      const name = String(row.stock_name || "").trim();
      const params = new URLSearchParams();
      if (code) {
        params.set("code", code);
      }
      if (name) {
        params.set("name", name);
      }
      params.set("end_date", nextEndDate);
      params.set("days", "180");
      if (config.pageKey === "global-themes") {
        params.set("market", "us");
      } else if (config.pageKey === "asia-themes") {
        params.set("market", "asia");
        params.set("region", selectedRegion || "jp");
      }
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

    function renderTodayScore(value, row) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      if (!row) {
        return h("span", { className: "today-score-cell" }, numberFormat(number, 2));
      }
      return h(
        "button",
        {
          type: "button",
          className: "today-score-cell today-score-button",
          title: "종합점수 추이 보기",
          onClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            openScoreHistory(row);
          },
        },
        numberFormat(number, 2)
      );
    }

    function renderNameCell(row) {
      const symbol = String((row && row.stock_code) || "").trim().toUpperCase();
      const stockName = String((row && row.stock_name) || "").trim() || symbol || "-";
      const tooltip = symbol && stockName !== symbol
        ? stockName + " (" + symbol + ")"
        : stockName;
      return h(
        "div",
        { className: "theme-stock-name-cell theme-stock-name-cell-global", title: tooltip },
        h(
          "button",
          {
            type: "button",
            className: "tradingview-stock-link inline-button",
            title: tooltip,
            onClick: function (event) {
              event.preventDefault();
              event.stopPropagation();
              openStockInGlobalCompany(row);
            },
          },
          stockName
        )
      );
    }

    function renderChartPopup() {
      if (!chartPopup.open) {
        return null;
      }
      const row = chartPopup.row || {};
      const label = row.stock_name || row.stock_code || "종목";
      return h(
        "div",
        { className: "modal-backdrop theme-stock-chart-backdrop", onClick: function () { setChartPopup({ open: false, row: null, loading: false, error: "", data: null }); } },
        h(
          "div",
          { className: "modal-panel theme-stock-chart-modal", onClick: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-head" },
            h("div", null,
              h("div", { className: "eyebrow" }, config.chartEyebrow),
              h("h2", null, label + (row.stock_code ? " (" + row.stock_code + ")" : ""))
            ),
            h("button", { type: "button", className: "mini-button", onClick: function () { setChartPopup({ open: false, row: null, loading: false, error: "", data: null }); } }, "닫기")
          ),
          h(StockChartPreview, {
            label: label,
            loading: chartPopup.loading,
            error: chartPopup.error,
            data: chartPopup.data,
          })
        )
      );
    }

    function renderScoreBreakdownContent(breakdown, payload, popupRow) {
      if (!breakdown) {
        return EmptyState({ message: "선택 기준일 점수 분해 데이터가 없습니다.", compact: true });
      }
      const endDate = payload.end_date || "";
      const stockName = payload.stock_name || popupRow.stock_name || "종목";
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

    function renderScoreHistoryPopup() {
      if (!scoreHistoryPopup.open) {
        return null;
      }
      const payload = scoreHistoryPopup.payload || {};
      const popupRow = scoreHistoryPopup.row || {};
      const historyRows = ensureArray(payload.rows);
      const summary = payload.summary || {};
      const stockName = payload.stock_name || popupRow.stock_name || "종목";
      const stockCode = payload.stock_code || popupRow.stock_code || "";
      const activeTab = scoreHistoryPopup.activeTab === "breakdown" ? "breakdown" : "trend";
      const latestBreakdown = summary.latest_breakdown || (historyRows.length ? historyRows[historyRows.length - 1].breakdown : null);
      const content = scoreHistoryPopup.loading
        ? h(LoadingBlock, { compact: true, title: "점수 변동 추이 로드 중", label: "최근 1년 주도주 이력 확인" })
        : scoreHistoryPopup.error
          ? h("div", { className: "notice-box error" }, scoreHistoryPopup.error)
          : historyRows.length
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "segmented-control score-history-tabs" },
                  h("button", { type: "button", className: activeTab === "trend" ? "active" : "", onClick: function () { setScoreHistoryActiveTab("trend"); } }, "점수 추이"),
                  h("button", { type: "button", className: activeTab === "breakdown" ? "active" : "", onClick: function () { setScoreHistoryActiveTab("breakdown"); } }, "점수 분해")
                ),
                activeTab === "breakdown"
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
              h("div", { className: "eyebrow" }, "SCORE TREND"),
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

    if (themesLoading) {
      return LoadingPanel({ label: themesLabel });
    }
    if (themesError) {
      return ErrorPanel({ message: themesError });
    }

    return h(
      React.Fragment,
      null,
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
            h("div", { className: "summary-help" }, (selectedFileDate || themes.file_date || "") + " · " + captureRegionLabel + " · " + numberFormat(captureRows.length, 0) + "개"),
            captureRows.length
              ? h(
                  "div",
                  { className: "table-wrap" },
                  h(
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
                        showTickerColumn ? h("th", null, config.codeLabel || "티커") : null,
                        h("th", null, "종목"),
                        h("th", null, config.marketCapLabel),
                        h("th", null, config.tradingValueLabel),
                        h("th", null, "등락률"),
                        h("th", null, "당일점수"),
                        h("th", null, "종합점수"),
                        h("th", null, "Sortino"),
                        showMarketColumn ? h("th", null, config.marketColumnLabel) : null
                      )
                    ),
                    h(
                      "tbody",
                      null,
                      captureRows.map(function (row) {
                        const sector = String(row.manual_sector || row.theme || "").trim() || "Other";
                        const color = colorForKey(sector);
                        const captureRow = Object.assign({}, row, { __capture_plain: true });
                        return h(
                          "tr",
                          { key: "capture-" + (row.stock_code || row.stock_name || row.__display_rank) },
                          h("td", null, numberFormat(row.__display_rank, 0)),
                          h("td", { className: "theme-sector-cell", style: { borderLeft: "4px solid " + color } }, sector),
                          showTickerColumn ? h("td", null, row.stock_code || "-") : null,
                          showAdrColumn ? h("td", null, row.is_adr ? (config.adrLabel || "ADR") : "-") : null,
                          h("td", null, renderNameCell(captureRow)),
                          h("td", null, renderMarketValueCell(row.market_cap_100m)),
                          h("td", null, renderMarketValueCell(row.trading_value_100m)),
                          h("td", null, renderSignedPercent(row.change_pct)),
                          h("td", null, renderNumberCell(row.score_o, 2)),
                          h("td", null, renderNumberCell(row.score, 2)),
                          h("td", null, renderNumberCell(row.sortino_norm, 4)),
                          showMarketColumn ? h("td", null, row.industry || "-") : null
                        );
                      })
                    )
                  )
                )
              : EmptyState({ message: captureEmptyMessage, compact: true })
          )
        )
      ) : null,
      renderScoreHistoryPopup(),
      renderScoreFormulaModal(),
      renderChartPopup(),
      ensureArray(config.regionOptions).length
        ? h(
            "div",
            { className: "panel", style: { padding: "16px 20px" } },
            h(
              "div",
              { className: "segmented-control", role: "tablist", "aria-label": config.regionTabTitle || "시장 선택" },
              ensureArray(config.regionOptions).map(function (option) {
                const code = String(option.code || "");
                const active = selectedRegion === code;
                return h("button", {
                  key: code,
                  type: "button",
                  className: active ? "active" : "",
                  onClick: function () { setSelectedRegion(code); },
                }, option.label || code);
              })
            )
          )
        : null,
      h(
        "div",
        { className: "panel leader-calendar-panel" },
        h("div", { className: "section-toolbar leader-calendar-head" },
          h(SectionTitle, null, config.calendarTitle),
          h(
            "div",
            { className: "toggle-group" },
            h("button", {
              className: "mini-button",
              onClick: refreshThemeData,
              disabled: reloading,
            }, reloading ? "새로고침 중..." : "흐름 새로고침"),
            h("button", {
              className: "mini-button" + (calendarMode === "month" ? " active" : ""),
              onClick: function () { setCalendarMode("month"); },
            }, "월간"),
            h("button", {
              className: "mini-button" + (calendarMode === "week" ? " active" : ""),
              onClick: function () { setCalendarMode("week"); },
            }, "주간")
          )
        ),
        calendarRequest.loading && !calendarRequest.data
          ? h(LoadingBlock, { compact: true, title: config.calendarLoadingTitle, label: calendarRequest.label })
          : calendarRequest.error
            ? h("div", { className: "notice-box error" }, calendarRequest.error)
            : h(
                "div",
                { className: "leader-timeline-wrap" },
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
                    return h("button", {
                      key: "head-" + day.date,
                      className: "leader-timeline-date" + (isSelected ? " active" : ""),
                      type: "button",
                      title: day.date,
                      onClick: function () { selectCalendarDate(day.date, "all"); },
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
                          onClick: function () { selectCalendarDate(day.date, "all"); },
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
                            title: ranked.sector + "\n평균점수 " + numberFormat(ranked.avg_score, 1) + "\n대표주: " + ensureArray(ranked.leaders).join(", "),
                            onClick: function () { selectCalendarDate(day.date, ranked.sector); },
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
                        onClick: function () { setSectorFilter(sector); },
                      },
                      h("span", { className: "theme-sector-dot", style: { background: colorForKey(sector) } }),
                      h("span", { className: "theme-sector-chip-name" }, sector)
                    );
                  })
                )
              )
      ),
      h(
        "div",
        { className: "panel hero-panel alt themes-compact-hero expanded" },
        h(
          "div",
          { className: "hero-panel-head" },
          h(
            "div",
            null,
            h("div", { className: "eyebrow" }, config.eyebrow),
            h("h1", { className: "page-title" }, config.title)
          ),
          h(
            "button",
            {
              type: "button",
              className: "mini-button",
              onClick: function () { setThemeBoxExpanded(!themeBoxExpanded); },
            },
            themeBoxExpanded ? "닫기" : "펼치기"
          )
        ),
        h("div", { className: "summary-help" }, config.copy),
        themeBoxExpanded
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "section-toolbar themes-compact-toolbar" },
                h("div", { className: "summary-help" }, "조회 파일 날짜"),
                h("button", {
                  type: "button",
                  className: "mini-button",
                  onClick: buildTodayData,
                  disabled: reloading,
                }, reloading ? "오늘자 데이터 생성 중..." : "오늘자 데이터 로드"),
                h("button", {
                  type: "button",
                  className: "mini-button",
                  onClick: refreshThemeData,
                  disabled: reloading,
                }, reloading ? "데이터 로드 중..." : "데이터 직접 로드"),
                reloadMessage ? h("div", { className: "summary-help" }, reloadMessage) : null
              ),
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
                  }, "이전달"),
                  h("strong", null, monthLabel(datePickerMonth)),
                  h("button", {
                    type: "button",
                    className: "mini-button",
                    onClick: function () { setDatePickerMonth(shiftMonth(datePickerMonth, 1)); },
                  }, "다음달")
                ),
                h("div", { className: "theme-file-calendar-weekdays" },
                  ["월", "화", "수", "목", "금"].map(function (day) { return h("span", { key: day }, day); })
                ),
                h(
                  "div",
                  { className: "theme-file-calendar-grid" },
                  datePickerCells.map(function (cell) {
                    const file = availableDateMap[cell.date];
                    const isSelected = selectedFileDate === cell.date;
                    const top10AvgScore = Number(calendarDayScoreMap[cell.date]);
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
                        onClick: function () { selectFileDate(cell.date); },
                      },
                      h("span", { className: "theme-file-calendar-number" }, cell.day),
                      Number.isFinite(top10AvgScore)
                        ? h("span", { className: "theme-file-calendar-score" }, numberFormat(top10AvgScore, 1))
                        : null,
                      file ? h("span", { className: "theme-file-calendar-dot" }) : null
                    );
                  })
                ),
                h("div", { className: "summary-help" }, selectedFileDate ? "선택된 날짜: " + selectedFileDate : "날짜를 선택하면 데이터를 불러옵니다.")
              ),
              h(
                "div",
                { className: "summary-grid themes-compact-summary" },
                h(SummaryCard, { label: "기준 파일", value: themes.file_name || "-", help: themes.file_date || "" }),
                h(SummaryCard, { label: "대상 종목수", value: numberFormat(themes.qualified_count, 0) + "개", help: config.universeHelp }),
                h(SummaryCard, { label: "산업군 수", value: numberFormat(sectorSummary.length, 0) + "개", help: config.groupHelp })
              )
            )
          : null
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "산업군 요약"),
        sectorSummary.length
          ? h(
              "div",
              { className: "manual-theme-strip" },
              [
                h("button", {
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
                return h("button", {
                  key: item.sector,
                  type: "button",
                  className: "theme-sector-chip" + (sectorFilter === item.sector ? " active" : ""),
                  onClick: function () { setSectorFilter(item.sector); },
                },
                  h("span", { className: "theme-sector-dot", style: { background: colorForKey(item.sector) } }),
                  h("span", { className: "theme-sector-chip-name" }, item.sector),
                  h("span", { className: "theme-sector-chip-meta" }, numberFormat(item.count, 0) + "개 · " + formatPercent(item.avg_change_pct, 2))
                );
              }))
            )
          : EmptyState({ compact: true, message: "표시할 산업군 요약이 없습니다." })
      ),
      h(
        "div",
        { className: "panel" },
        h("div", { className: "section-toolbar international-score-toolbar" },
          h(SectionTitle, null, config.tableTitle),
          h("div", { className: "summary-help international-score-toolbar-copy" }, "행을 누르면 3개월 차트가 열리고, 종목명을 누르면 해외기업 검색기로 이동합니다."),
          h("div", { className: "toggle-group international-score-toolbar-actions" },
            h("button", {
              type: "button",
              className: "mini-button",
              onClick: openScoreFormulaModal,
            }, "점수 지표 수정"),
            h("button", {
              type: "button",
              className: "mini-button capture-button",
              onClick: copyScoreTableToClipboard,
              disabled: scoreTableCopyState.status === "working",
            }, scoreTableCopyState.status === "working" ? "캡쳐 복사 중..." : captureButtonLabel)
          )
        ),
        scoreTableCopyState.message
          ? h("div", { className: "summary-help" + (scoreTableCopyState.status === "error" ? " text-danger" : "") }, scoreTableCopyState.message)
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
              placeholder: config.pageKey === "global-themes" ? "기업명 또는 티커 검색" : "기업명 또는 티커/코드 검색",
              "aria-label": config.title + " 종목 검색 입력",
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
                      h("span", null, [
                        item.stock_code,
                        item.manual_sector || item.theme || item.industry,
                        item.rank ? numberFormat(item.rank, 0) + "위" : "",
                      ].filter(Boolean).join(" · "))
                    );
                  })
                )
              : null
          ),
          h("button", { type: "submit", className: "mini-button" }, "검색"),
          stockSearchMessage ? h("span", { className: "summary-help" }, stockSearchMessage) : null
        ),
        sortedVisibleRows.length
          ? h(
              "div",
              { className: "table-wrap", ref: themeTableScrollRef },
              h(
                "table",
                { className: "data-table compact theme-edit-table international-theme-table" + (config.pageKey === "global-themes" ? " us-theme-score-table" : "") },
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    [
                      ["rank", "순위"],
                      ["sector", config.sectorLabel || "섹터"],
                      showTickerColumn ? ["stock_code", config.codeLabel || "티커"] : null,
                      ["stock_name", "종목"],
                      ["sortino_norm", "Sortino"],
                      ["atr_20", "% ATR(20)"],
                      ["market_cap_100m", config.marketCapLabel],
                      ["trading_value_100m", config.tradingValueLabel],
                      ["high_drawdown_pct", "고점대비"],
                      ["change_pct", "등락률"],
                      ["score_o", "당일점수"],
                      ["score", "종합점수"],
                    ].filter(Boolean).concat(showMarketColumn ? [["industry", config.marketColumnLabel]] : []).map(function (column) {
                      const key = column[0];
                      const label = column[1];
                      const active = themeTableSortState.key === key;
                      const headerClassName =
                        key === "rank" ? "theme-col-rank" :
                        key === "sector" ? "theme-col-sector" :
                        key === "stock_code" ? "theme-col-stock_code" :
                        key === "stock_name" ? "theme-col-stock_name" :
                         key === "industry" ? "theme-col-industry" :
                         "numeric-cell theme-col-" + key;
                      return h(
                        "th",
                        { key: key, className: headerClassName },
                        h(
                          "button",
                          {
                            type: "button",
                            className: "table-sort-button" + (active ? " active" : ""),
                            onClick: function () { toggleTableSort(key); },
                          },
                          label,
                           active ? h("span", null, themeTableSortState.direction === "desc" ? " ↓" : " ↑") : null
                        )
                      );
                    })
                  )
                ),
                h(
                  "tbody",
                  null,
                  sortedVisibleRows.map(function (row, index) {
                    const sector = String(row.manual_sector || row.theme || "").trim() || "Other";
                    const color = colorForKey(sector);
                    const stockKey = buildStockSearchKey(row);
                    return h(
                      "tr",
                      {
                        key: row.stock_code || row.stock_name || index,
                        ref: function (element) {
                          if (element) {
                            stockRowRefs.current[stockKey] = element;
                          } else {
                            delete stockRowRefs.current[stockKey];
                          }
                        },
                        "data-stock-search-key": stockKey,
                        className: highlightedStockKey === stockKey ? "stock-search-highlight" : "",
                        onClick: function () { openChart(row); },
                      },
                      h("td", { className: "theme-col-rank" }, renderRankCell(row, index + 1)),
                      h("td", { className: "theme-sector-cell", style: { borderLeft: "4px solid " + color } }, sector),
                      showTickerColumn ? h("td", { className: "theme-col-stock_code" }, row.stock_code || "-") : null,
                      h("td", { className: "theme-col-stock_name" }, renderNameCell(row)),
                      h("td", { className: "numeric-cell theme-col-sortino_norm" }, renderNumberCell(row.sortino_norm, 4)),
                      h("td", { className: "numeric-cell theme-col-atr_20" }, formatPercent(row.atr_20_pct != null ? row.atr_20_pct : row.atr_20, 2)),
                      h("td", { className: "numeric-cell theme-col-market_cap_100m" }, renderMarketValueCell(row.market_cap_100m)),
                      h("td", { className: "numeric-cell theme-col-trading_value_100m" }, renderMarketValueCell(row.trading_value_100m)),
                      h("td", { className: "numeric-cell theme-col-high_drawdown_pct" }, renderHighDrawdownPercent(row)),
                      h("td", { className: "numeric-cell theme-col-change_pct" }, renderSignedPercent(row.change_pct)),
                      h("td", { className: "numeric-cell theme-col-score_o" }, renderNumberCell(row.score_o, 2)),
                      h("td", { className: "numeric-cell theme-col-score" }, renderTodayScore(row.score, row)),
                      showMarketColumn ? h("td", { className: "theme-col-industry" }, row.industry || "-") : null
                    );
                  })
                )
              )
            )
          : EmptyState({ message: config.tableEmptyMessage })
      )
    );
  }

  function GlobalThemesPage() {
    return h(InternationalThemesBoardPage, {
      pageKey: "global-themes",
      apiPrefix: "/api/us-themes/",
      themesTodayUrl: "/api/us-themes/today",
      reloadUrl: "/api/us-themes/reload",
      buildTodayUrl: "/api/us-themes/build-today-data",
      calendarUrl: "/api/us-theme-sector-calendar",
      eyebrow: "US Daily Theme Radar",
      title: "미국 주도주",
      copy: "NASDAQ/NYSE/AMEX 기준으로 점수를 계산해 미국 시장의 강한 종목 흐름을 같은 방식으로 확인합니다.",
      universeHelp: "미국 시가총액 100억달러 이상",
      groupHelp: "세부 Industry 기준",
      calendarTitle: "날짜별 미국 주도 섹터 흐름",
      calendarHelp: "미국 Industry 기준 상위 5개 흐름",
      calendarLoadingTitle: "미국 캘린더 불러오는 중",
      calendarEmptyMessage: "표시할 미국 주도주 데이터가 없습니다. 오늘자 데이터를 먼저 로드해 주세요.",
      tableTitle: "미국 점수 테이블",
      tableEmptyMessage: "조건에 맞는 미국 주도주 데이터가 없습니다.",
      sectorLabel: "산업",
      codeLabel: "티커",
      showTickerColumn: true,
      showAdrColumn: false,
      marketColumnLabel: "대분류",
      showMarketColumn: false,
      marketCapLabel: "시총(B)",
      tradingValueLabel: "거래대금(B)",
      chartEyebrow: "US 3개월 주가",
    });
  }

  function AsiaThemesPage() {
    return h(InternationalThemesBoardPage, {
      pageKey: "asia-themes",
      apiPrefix: "/api/asia-themes/",
      themesTodayUrl: "/api/asia-themes/today",
      reloadUrl: "/api/asia-themes/reload",
      buildTodayUrl: "/api/asia-themes/build-today-data",
      calendarUrl: "/api/asia-theme-sector-calendar",
      eyebrow: "Asia Daily Theme Radar",
      title: "아시아 주도주",
      copy: "일본, 중국, 대만 시장을 분리해서 같은 점수 체계로 비교하고 강한 종목 흐름을 확인합니다.",
      universeHelp: "일본/중국/대만 주요 종목",
      groupHelp: "국가별 대분류 Industry 기준",
      calendarTitle: "날짜별 아시아 주도 섹터 흐름",
      calendarHelp: "선택한 시장의 Industry 기준 상위 5개 흐름",
      calendarLoadingTitle: "아시아 캘린더 불러오는 중",
      calendarEmptyMessage: "표시할 아시아 주도주 데이터가 없습니다. 오늘자 데이터를 먼저 로드해 주세요.",
      tableTitle: "아시아 점수 테이블",
      tableEmptyMessage: "조건에 맞는 아시아 주도주 데이터가 없습니다.",
      codeLabel: "티커",
      marketColumnLabel: "시장",
      marketCapLabel: "시총(현지억)",
      tradingValueLabel: "거래대금(현지억)",
      chartEyebrow: "Asia 3개월 주가",
      regionTabTitle: "아시아 시장 선택",
      regionOptions: [
        { code: "jp", label: "일본" },
        { code: "cn", label: "중국" },
        { code: "tw", label: "대만" }
      ],
    });
  }


    return { GlobalThemesPage: GlobalThemesPage, AsiaThemesPage: AsiaThemesPage };
  }

  modules.internationalThemesPages = { createPages: createPages };
  global.StockAppModules = modules;
})(window);
