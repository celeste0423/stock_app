(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};
  const PORTFOLIO_AUTOCOMPLETE_SOURCE_CACHE = { kr: null, us: null };

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const AllocationChart = deps.AllocationChart;
    const calculateRelativePortfolioStats = deps.calculateRelativePortfolioStats;
    const copyImageBlobWithFallback = deps.copyImageBlobWithFallback;
    const DataTable = deps.DataTable;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatCurrency = deps.formatCurrency;
    const formatMoneyByCurrency = deps.formatMoneyByCurrency;
    const formatMoneyByCurrencyKoreanCompact = deps.formatMoneyByCurrencyKoreanCompact;
    const formatPercent = deps.formatPercent;
    const formatYearMonthLabel = deps.formatYearMonthLabel;
    const h = deps.h;
    const isoDateOffset = deps.isoDateOffset;
    const itemInPortfolioPeriod = deps.itemInPortfolioPeriod;
    const LoadingPanel = deps.LoadingPanel;
    const markPortfolioInvestmentState = deps.markPortfolioInvestmentState;
    const monthLabel = deps.monthLabel;
    const moveArrayItem = deps.moveArrayItem;
    const normalizeBenchmarkForLabels = deps.normalizeBenchmarkForLabels;
    const normalizeLooseSearchText = deps.normalizeLooseSearchText;
    const normalizePortfolioSeriesForPeriod = deps.normalizePortfolioSeriesForPeriod;
    const numberFormat = deps.numberFormat;
    const PerformanceChart = deps.PerformanceChart;
    const pnlClass = deps.pnlClass;
    const portfolioMonthOptions = deps.portfolioMonthOptions;
    const roundNumber = deps.roundNumber;
    const SectionTitle = deps.SectionTitle;
    const shiftIsoDate = deps.shiftIsoDate;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

  function PortfolioPageModern() {
    const request = useFetchJson("/api/portfolio/performance");
    const [periodKey, setPeriodKey] = useState("");
    const [allocationMode, setAllocationMode] = useState("sector");
    const [assetView, setAssetView] = useState("total");
    const [xRange, setXRange] = useState(null);
    const [resetSignal, setResetSignal] = useState(0);
    const [activeAccountType, setActiveAccountType] = useState("kr");
    const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
    const [saveState, setSaveState] = useState({ status: "idle", message: "" });
    const [captureState, setCaptureState] = useState({ status: "idle", message: "" });
    const [portfolioSuggestions, setPortfolioSuggestions] = useState({});
    const [portfolioDragIndex, setPortfolioDragIndex] = useState(-1);
    const captureRef = useRef(null);
    const portfolioSearchTimerRef = useRef({});

    function emptyItem() {
      return {
        item_id: "item-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8),
        sector: "",
        stock_name: "",
        stock_code: "",
        current_price: "",
        avg_price: "",
        weight_pct: "",
        quantity: "",
        quantity_auto: false,
        stop_loss_price: "",
        stop_loss_auto: true,
        sell_price: "",
        note: "",
      };
    }

    function emptyForm(accountType, dateText) {
      return {
        snapshot_id: "",
        trade_date: dateText || isoDateOffset(0),
        account_type: accountType || "kr",
        account_capital: "",
        note: "",
        items: [emptyItem()],
      };
    }

    function snapshotToForm(snapshot) {
      if (!snapshot) {
        return emptyForm(activeAccountType, isoDateOffset(0));
      }
      return {
        snapshot_id: snapshot.snapshot_id || "",
        trade_date: snapshot.trade_date || isoDateOffset(0),
        account_type: snapshot.account_type || activeAccountType || "kr",
        account_capital: snapshot.account_capital != null ? String(snapshot.account_capital) : "",
        note: snapshot.note || "",
        items: ensureArray(snapshot.items).length
          ? ensureArray(snapshot.items).map(function (item) {
              return {
                item_id: item.item_id || ("item-" + Math.random().toString(16).slice(2, 8)),
                sector: item.sector || "",
                stock_name: item.stock_name || "",
                stock_code: item.stock_code || "",
                current_price: item.current_price != null ? String(item.current_price) : "",
                avg_price: item.avg_price != null ? String(item.avg_price) : "",
                weight_pct: item.weight_pct != null ? String(item.weight_pct) : "",
                quantity: item.quantity != null ? String(item.quantity) : "",
                quantity_auto: false,
                stop_loss_price: item.stop_loss_price != null ? String(item.stop_loss_price) : "",
                stop_loss_auto: false,
                sell_price: item.sell_price != null ? String(item.sell_price) : "",
                note: item.note || "",
              };
            })
          : [emptyItem()],
      };
    }

    const [form, setForm] = useState(function () {
      return emptyForm("kr", isoDateOffset(0));
    });

    useEffect(function () {
      if (!request.data) {
        return;
      }
      const monthOptions = portfolioMonthOptions(request.data.series);
      if (!periodKey) {
        setPeriodKey(monthOptions[monthOptions.length - 1] || "all");
      }
    }, [request.data, periodKey]);

    useEffect(function () {
      setXRange(null);
      setResetSignal(function (value) { return value + 1; });
    }, [periodKey]);

    useEffect(function () {
      return function () {
        const timers = portfolioSearchTimerRef.current || {};
        Object.keys(timers).forEach(function (key) {
          clearTimeout(timers[key]);
        });
      };
    }, []);

    const data = request.data || {};
    const accounts = ensureArray(data.manual_accounts);
    const summary = data.summary || {};
    const benchmarkSeriesMap = data.benchmarks || { kospi: ensureArray(data.benchmark) };
    const benchmarkLabelMap = data.benchmark_labels || { kospi: "KOSPI", kosdaq: "KOSDAQ", nasdaq: "NASDAQ", sp500: "S&P 500" };
    const benchmarkColorMap = { kospi: "#4c8bf5", kosdaq: "#14b8a6", nasdaq: "#8b5cf6", sp500: "#ef4444" };
    const monthOptions = portfolioMonthOptions(data.series);
    const activePeriod = periodKey || monthOptions[monthOptions.length - 1] || "all";
    const viewSeries = normalizePortfolioSeriesForPeriod(data.series, activePeriod);
    const viewLabels = viewSeries.map(function (item) { return item.date; });
    const viewAllocations = ensureArray(data.daily_allocations).filter(function (item) {
      return itemInPortfolioPeriod(item, activePeriod);
    });
    const viewSeriesWithInvestmentState = markPortfolioInvestmentState(viewSeries, viewAllocations);
    const details = ensureArray(data.daily_details).filter(function (item) {
      return itemInPortfolioPeriod(item, activePeriod);
    });
    const latestDetail = details[details.length - 1] || null;
    const monthlyStats = ensureArray(data.monthly_stats);
    const captureSets = ensureArray(data.capture_sets);
    const activeAccount = accounts.find(function (account) { return account.account_type === activeAccountType; }) || null;
    const activeSnapshots = ensureArray(activeAccount && activeAccount.snapshots).slice().reverse();
    const selectedSnapshot = activeSnapshots.find(function (snapshot) { return snapshot.snapshot_id === selectedSnapshotId; }) || null;
    const latestCaptureSnapshot = (activeAccount && activeAccount.latest_snapshot) || null;
    const currentCapture = captureSets.find(function (item) {
      return item.snapshot_id === (latestCaptureSnapshot && latestCaptureSnapshot.snapshot_id);
    }) || null;
    const periodLabel = activePeriod === "all" ? "전체 기간" : monthLabel(activePeriod);
    const benchmarkDates = Object.keys(benchmarkSeriesMap).reduce(function (dates, key) {
      return dates.concat(ensureArray(benchmarkSeriesMap[key]).map(function (item) { return item.date; }).filter(Boolean));
    }, []);
    const seriesDates = ensureArray(data.series).map(function (item) { return item.date; }).filter(Boolean);

    function buildAccountSeries(snapshotRows) {
      const rows = ensureArray(snapshotRows);
      if (!rows.length) {
        return [];
      }
      const baseRow = rows.find(function (row) {
        return Number(row && (row.account_capital || row.capital) || 0) > 0 && Number(row && row.nav_close || 0) > 0;
      }) || null;
      const baseCapital = Number(baseRow && (baseRow.account_capital || baseRow.capital) || 0);
      if (!(baseCapital > 0)) {
        return rows.map(function (row) {
          return {
            date: row.trade_date,
            value: null,
            return_pct: null,
            nav: Number(row.nav_close || 0),
            daily_return_pct: Number(row.daily_return_pct || 0),
          };
        });
      }
      return rows.map(function (row) {
        const nav = Number(row.nav_close || 0);
        if (!(nav > 0)) {
          return {
            date: row.trade_date,
            value: null,
            return_pct: null,
            nav: nav,
            capital: baseCapital,
            daily_return_pct: Number(row.daily_return_pct || 0),
          };
        }
        return {
          date: row.trade_date,
          value: roundNumber((nav / baseCapital) * 100, 2),
          return_pct: roundNumber(((nav / baseCapital) - 1) * 100, 2),
          nav: nav,
          capital: baseCapital,
          daily_return_pct: Number(row.daily_return_pct || 0),
        };
      });
    }

    function buildCombinedAssetSeries(accountRows) {
      const buckets = {};
      ensureArray(accountRows).forEach(function (account) {
        ensureArray(account && account.snapshots).forEach(function (snapshot) {
          const dateKey = String(snapshot && snapshot.trade_date || "");
          if (!dateKey) {
            return;
          }
          if (!buckets[dateKey]) {
            buckets[dateKey] = {
              date: dateKey,
              nav: 0,
              capital: 0,
            };
          }
          buckets[dateKey].nav += Number(snapshot && snapshot.nav_close || 0);
          buckets[dateKey].capital += Number(snapshot && (snapshot.account_capital || snapshot.capital) || 0);
        });
      });
      const rows = Object.keys(buckets).sort().map(function (dateKey) {
        return buckets[dateKey];
      });
      if (!rows.length) {
        return [];
      }
      const baseRow = rows.find(function (row) {
        return Number(row && row.capital || 0) > 0 && Number(row && row.nav || 0) > 0;
      }) || null;
      const baseCapital = Number(baseRow && baseRow.capital || 0);
      return rows.map(function (row, index) {
        const nav = Number(row.nav || 0);
        const previousNav = index > 0 ? Number(rows[index - 1].nav || 0) : 0;
        if (!(baseCapital > 0) || !(nav > 0)) {
          return {
            date: row.date,
            value: null,
            return_pct: null,
            nav: roundNumber(nav, 2),
            capital: roundNumber(Number(row.capital || 0), 2),
            daily_return_pct: previousNav > 0 && nav > 0 ? roundNumber(((nav / previousNav) - 1) * 100, 3) : 0,
          };
        }
        return {
          date: row.date,
          value: roundNumber((nav / baseCapital) * 100, 2),
          return_pct: roundNumber(((nav / baseCapital) - 1) * 100, 2),
          nav: roundNumber(nav, 2),
          capital: roundNumber(Number(row.capital || 0), 2),
          daily_return_pct: previousNav > 0 ? roundNumber(((nav / previousNav) - 1) * 100, 3) : 0,
        };
      });
    }

    function roundNumber(value, digits) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return 0;
      }
      const factor = Math.pow(10, digits == null ? 0 : digits);
      return Math.round(number * factor) / factor;
    }

    const krAccount = accounts.find(function (account) { return account.account_type === "kr"; }) || null;
    const usAccount = accounts.find(function (account) { return account.account_type === "us"; }) || null;
    const combinedAssetSeries = buildCombinedAssetSeries(accounts);
    const cashBaseValue = Number((data.daily_details && data.daily_details[0] && data.daily_details[0].cash_close) || 0);
    const cashSeries = ensureArray(data.daily_details).map(function (item, index) {
      const cash = Number(item.cash_close || 0);
      const normalized = cashBaseValue > 0 ? (cash / cashBaseValue) * 100 : 100;
      return {
        date: item.date,
        value: roundNumber(normalized, 2),
        return_pct: cashBaseValue > 0 ? roundNumber(((cash / cashBaseValue) - 1) * 100, 2) : 0,
        nav: cash,
        daily_return_pct: index > 0 && Number(data.daily_details[index - 1].cash_close || 0) > 0
          ? roundNumber(((cash / Number(data.daily_details[index - 1].cash_close || 0)) - 1) * 100, 3)
          : 0,
      };
    });
    const assetSeriesMap = {
      total: combinedAssetSeries,
      kr: buildAccountSeries(krAccount && krAccount.snapshots),
      us: buildAccountSeries(usAccount && usAccount.snapshots),
      other: cashSeries,
    };
    const rawSelectedAssetSeries = assetSeriesMap[assetView] || combinedAssetSeries;
    const selectedAssetSeries = normalizePortfolioSeriesForPeriod(rawSelectedAssetSeries, activePeriod);
    const selectedAssetLatest = selectedAssetSeries.length ? selectedAssetSeries[selectedAssetSeries.length - 1] : null;
    const selectedAssetBenchmarks = assetView === "total"
      ? Object.keys(benchmarkSeriesMap).map(function (key) {
          return {
            key: key,
            label: benchmarkLabelMap[key] || key.toUpperCase(),
            color: benchmarkColorMap[key] || "#64748b",
            rows: normalizeBenchmarkForLabels(benchmarkSeriesMap[key] || [], selectedAssetSeries.map(function (item) { return item.date; })),
          };
        })
      : [];
    const selectedAssetRelativeStatsMap = {};
    selectedAssetBenchmarks.forEach(function (benchmark) {
      selectedAssetRelativeStatsMap[benchmark.key] = calculateRelativePortfolioStats(selectedAssetSeries, benchmark.rows);
    });
    const accountEstimateBaseValue = Number(
      form.account_capital
      || (selectedSnapshot && selectedSnapshot.account_capital)
      || (selectedSnapshot && selectedSnapshot.nav_close)
      || (activeAccount && activeAccount.latest_snapshot && activeAccount.latest_snapshot.nav_close)
      || 0
    );
    const assetViewLabelMap = {
      total: "전체 자산",
      kr: "국장",
      us: "미장",
      other: "기타 자산",
    };
    const assetViewLabel = assetViewLabelMap[assetView] || "전체 자산";

    function nextWeekday(dateText) {
      const shifted = shiftIsoDate(dateText || isoDateOffset(0), 1) || isoDateOffset(0);
      const base = new Date(String(shifted).slice(0, 10) + "T00:00:00");
      if (Number.isNaN(base.getTime())) {
        return isoDateOffset(0);
      }
      while (base.getDay() === 0 || base.getDay() === 6) {
        base.setDate(base.getDate() + 1);
      }
      return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0") + "-" + String(base.getDate()).padStart(2, "0");
    }

    function previousWeekday(dateText) {
      const shifted = shiftIsoDate(dateText || isoDateOffset(0), -1) || isoDateOffset(0);
      const base = new Date(String(shifted).slice(0, 10) + "T00:00:00");
      if (Number.isNaN(base.getTime())) {
        return isoDateOffset(-1);
      }
      while (base.getDay() === 0 || base.getDay() === 6) {
        base.setDate(base.getDate() - 1);
      }
      return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0") + "-" + String(base.getDate()).padStart(2, "0");
    }

    function buildTradeDateOptions() {
      const minTradeDate = "2026-08-01";
      const known = {};
      const todayDate = isoDateOffset(0);
      const latestKnownDate = [isoDateOffset(0)]
        .concat(seriesDates)
        .concat(benchmarkDates)
        .concat(activeSnapshots.map(function (snapshot) { return snapshot && snapshot.trade_date ? String(snapshot.trade_date) : ""; }))
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || todayDate;
      let calendarProbe = minTradeDate;
      const calendarMaxDate = latestKnownDate > todayDate ? todayDate : latestKnownDate;
      while (calendarProbe <= calendarMaxDate) {
        const base = new Date(String(calendarProbe).slice(0, 10) + "T00:00:00");
        if (!Number.isNaN(base.getTime()) && base.getDay() !== 0 && base.getDay() !== 6) {
          known[String(calendarProbe)] = true;
        }
        calendarProbe = shiftIsoDate(calendarProbe, 1) || calendarProbe;
      }
      return Object.keys(known).filter(function (dateText) {
        return String(dateText || "") >= minTradeDate && String(dateText || "") <= todayDate;
      }).sort().reverse();
    }

    const tradeDateOptions = buildTradeDateOptions();

    useEffect(function () {
      if (!request.data) {
        return;
      }
      const snapshots = ensureArray(activeAccount && activeAccount.snapshots);
      if (selectedSnapshotId && snapshots.some(function (snapshot) { return snapshot.snapshot_id === selectedSnapshotId; })) {
        return;
      }
      const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
      if (latest) {
        setSelectedSnapshotId(latest.snapshot_id || "");
        setForm(snapshotToForm(latest));
        return;
      }
      setSelectedSnapshotId("");
      setForm(emptyForm(activeAccountType, isoDateOffset(0)));
    }, [request.data, activeAccountType]);

    function buildLeaderLookup(rows) {
      const lookup = {};
      ensureArray(rows).forEach(function (row) {
        const sector = String(row.manual_sector || row.theme || row.industry || row.sector || "").trim();
        const currentPrice = Number(row.current_price || row.close_price || row.price || 0);
        [
          String(row.stock_name || "").trim(),
          String(row.resolved_name || "").trim(),
          String(row.stock_code || row.symbol || "").trim().toUpperCase(),
        ].forEach(function (key) {
          const normalized = normalizeLooseSearchText(key);
          if (!normalized) {
            return;
          }
          lookup[normalized] = {
            sector: sector,
            current_price: currentPrice > 0 ? currentPrice : null,
          };
        });
      });
      return lookup;
    }

    if (request.loading) {
      return LoadingPanel({ label: request.label });
    }
    if (request.error) {
      return ErrorPanel({ message: request.error });
    }

    function updateFormField(key, value) {
      setForm(function (current) {
        const next = Object.assign({}, current);
        next[key] = value;
        return next;
      });
    }

    function updateAccountCapital(value) {
      setForm(function (current) {
        const next = Object.assign({}, current, { account_capital: value });
        next.items = ensureArray(current.items).map(function (item) {
          return syncEstimatedQuantity(Object.assign({}, item), current.account_type || activeAccountType || "kr", value);
        });
        return next;
      });
    }

    function computeEstimatedQuantity(weightValue, priceValue, accountTypeValue, capitalBaseValue) {
      const weightPct = Number(weightValue || 0);
      const currentPrice = Number(priceValue || 0);
      const baseCapital = Number(capitalBaseValue != null ? capitalBaseValue : accountEstimateBaseValue);
      if (!(baseCapital > 0) || !(weightPct > 0) || !(currentPrice > 0)) {
        return null;
      }
      const raw = (baseCapital * (weightPct / 100)) / currentPrice;
      if (!(raw > 0)) {
        return null;
      }
      return accountTypeValue === "us" ? roundNumber(raw, 2) : Math.max(1, Math.round(raw));
    }

    function stopLossStep(priceValue, accountTypeValue) {
      const price = Number(priceValue || 0);
      if (!(price > 0)) {
        return accountTypeValue === "us" ? 0.1 : 10;
      }
      if (accountTypeValue === "us") {
        if (price >= 100) {
          return 1;
        }
        if (price >= 20) {
          return 0.5;
        }
        if (price >= 5) {
          return 0.25;
        }
        return 0.1;
      }
      if (price >= 100000) {
        return 1000;
      }
      if (price >= 50000) {
        return 500;
      }
      if (price >= 10000) {
        return 100;
      }
      if (price >= 1000) {
        return 50;
      }
      return 10;
    }

    function computeSuggestedStopLoss(avgPriceValue, currentPriceValue, accountTypeValue) {
      const avgPrice = Number(avgPriceValue || 0);
      const currentPrice = Number(currentPriceValue || 0);
      const basePrice = avgPrice > 0 ? avgPrice : currentPrice;
      if (!(basePrice > 0)) {
        return null;
      }
      const rawStopLoss = basePrice * 0.92;
      const step = stopLossStep(basePrice, accountTypeValue);
      if (!(step > 0)) {
        return accountTypeValue === "us" ? roundNumber(rawStopLoss, 2) : Math.max(0, Math.round(rawStopLoss));
      }
      const floored = Math.floor(rawStopLoss / step) * step;
      if (accountTypeValue === "us") {
        return roundNumber(floored, step < 1 ? 2 : 0);
      }
      return Math.max(step, Math.round(floored));
    }

    function syncEstimatedQuantity(item, accountTypeValue, capitalBaseValue) {
      const next = Object.assign({}, item);
      if (!String(next.quantity || "").trim() || next.quantity_auto) {
        const estimate = computeEstimatedQuantity(next.weight_pct, next.current_price, accountTypeValue, capitalBaseValue);
        if (estimate != null) {
          next.quantity = String(estimate);
          next.quantity_auto = true;
        }
      }
      return next;
    }

    function syncSuggestedStopLoss(item, accountTypeValue) {
      const next = Object.assign({}, item);
      if (!String(next.stop_loss_price || "").trim() || next.stop_loss_auto) {
        const suggested = computeSuggestedStopLoss(next.avg_price, next.current_price, accountTypeValue);
        if (suggested != null) {
          next.stop_loss_price = String(suggested);
          next.stop_loss_auto = true;
        }
      }
      return next;
    }

    function portfolioItemExitInfo(item) {
      const manualSellPrice = Number(item && item.sell_price || 0);
      if (manualSellPrice > 0) {
        return { exited: true, price: manualSellPrice, reason: "manual_sell" };
      }
      const stopLossPrice = Number(item && item.stop_loss_price || 0);
      const currentPrice = Number(item && item.current_price || 0);
      if (stopLossPrice > 0 && currentPrice > 0 && currentPrice <= stopLossPrice) {
        return { exited: true, price: stopLossPrice, reason: "stop_loss" };
      }
      return { exited: false, price: currentPrice > 0 ? currentPrice : null, reason: "" };
    }

    function updateItemPatch(index, patch) {
      setForm(function (current) {
        const next = Object.assign({}, current);
        next.items = ensureArray(current.items).map(function (item, itemIndex) {
          if (itemIndex !== index) {
            return item;
          }
          const merged = Object.assign({}, item, patch);
          if (Object.prototype.hasOwnProperty.call(patch, "quantity")) {
            merged.quantity_auto = false;
          }
          if (Object.prototype.hasOwnProperty.call(patch, "stop_loss_price")) {
            merged.stop_loss_auto = false;
          }
          if (
            Object.prototype.hasOwnProperty.call(patch, "weight_pct")
            || Object.prototype.hasOwnProperty.call(patch, "current_price")
            || Object.prototype.hasOwnProperty.call(patch, "stock_name")
            || Object.prototype.hasOwnProperty.call(patch, "avg_price")
          ) {
            return syncSuggestedStopLoss(
              syncEstimatedQuantity(merged, current.account_type || activeAccountType || "kr", current.account_capital),
              current.account_type || activeAccountType || "kr"
            );
          }
          return merged;
        });
        return next;
      });
    }

    function updateItemField(index, key, value) {
      updateItemPatch(index, { [key]: value });
    }

    function cloneSnapshotForward(sourceSnapshot, nextAccount, nextDate) {
      if (!sourceSnapshot) {
        return emptyForm(nextAccount, nextDate);
      }
      const clonedItems = ensureArray(sourceSnapshot.items).filter(function (item) {
        return !portfolioItemExitInfo(item).exited;
      }).map(function (item) {
        return {
          item_id: "item-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8),
          sector: item.sector || "",
          stock_name: item.stock_name || "",
          stock_code: item.stock_code || "",
          current_price: item.current_price != null ? String(item.current_price) : "",
          avg_price: item.avg_price != null ? String(item.avg_price) : "",
          weight_pct: item.weight_pct != null ? String(item.weight_pct) : "",
          quantity: item.quantity != null ? String(item.quantity) : "",
          quantity_auto: false,
          stop_loss_price: item.stop_loss_price != null ? String(item.stop_loss_price) : "",
          stop_loss_auto: false,
          sell_price: "",
          note: item.note || "",
        };
      });
      return {
        snapshot_id: "",
        trade_date: nextDate || nextWeekday(sourceSnapshot.trade_date || isoDateOffset(0)),
        account_type: nextAccount || sourceSnapshot.account_type || "kr",
        account_capital: sourceSnapshot.account_capital != null ? String(sourceSnapshot.account_capital) : "",
        note: "",
        items: clonedItems.length
          ? clonedItems
          : [emptyItem()],
      };
    }

    function addItem() {
      setForm(function (current) {
        return Object.assign({}, current, { items: ensureArray(current.items).concat([emptyItem()]) });
      });
    }

    function reorderPortfolioItems(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return;
      }
      setForm(function (current) {
        return Object.assign({}, current, {
          items: moveArrayItem(ensureArray(current.items), fromIndex, toIndex),
        });
      });
    }

    function removeItem(index) {
      setForm(function (current) {
        const items = ensureArray(current.items).filter(function (_, itemIndex) { return itemIndex !== index; });
        return Object.assign({}, current, { items: items.length ? items : [emptyItem()] });
      });
    }

    function loadSnapshot(snapshot) {
      setSelectedSnapshotId(snapshot && snapshot.snapshot_id ? snapshot.snapshot_id : "");
      setSaveState({ status: "idle", message: "" });
      setCaptureState({ status: "idle", message: "" });
      setPortfolioSuggestions({});
      setPortfolioDragIndex(-1);
      setForm(snapshotToForm(snapshot));
    }

    function focusSnapshot(snapshot) {
      if (!snapshot) {
        return;
      }
      loadSnapshot(snapshot);
      const dateText = snapshot.trade_date || "";
      if (dateText) {
        const focusIndex = selectedAssetSeries.findIndex(function (item) { return item && item.date === dateText; });
        setXRange({
          min: Math.max(0, focusIndex - 2),
          max: Math.max(4, focusIndex + 2),
        });
      }
    }

    function handleTradeDateSelection(dateText) {
      const nextDate = String(dateText || "").trim();
      if (!nextDate) {
        return;
      }
      const matchedSnapshot = activeSnapshots.find(function (snapshot) {
        return String(snapshot && snapshot.trade_date || "") === nextDate;
      }) || null;
      if (matchedSnapshot) {
        focusSnapshot(matchedSnapshot);
        return;
      }
      updateFormField("trade_date", nextDate);
    }

    function startNewSnapshot(accountType) {
      const nextAccount = accountType || activeAccountType || "kr";
      const nextAccountView = accounts.find(function (account) { return account.account_type === nextAccount; }) || null;
      const sourceSnapshot = (selectedSnapshot && selectedSnapshot.account_type === nextAccount)
        ? selectedSnapshot
        : (nextAccountView && ensureArray(nextAccountView.snapshots).length
          ? ensureArray(nextAccountView.snapshots)[ensureArray(nextAccountView.snapshots).length - 1]
          : null);
      const nextDate = sourceSnapshot
        ? nextWeekday(sourceSnapshot.trade_date || isoDateOffset(0))
        : (tradeDateOptions[0] || nextWeekday(isoDateOffset(0)));
      setActiveAccountType(nextAccount);
      setSelectedSnapshotId("");
      setSaveState({ status: "idle", message: "" });
      setCaptureState({ status: "idle", message: "" });
      setPortfolioSuggestions({});
      setPortfolioDragIndex(-1);
      setForm(cloneSnapshotForward(sourceSnapshot, nextAccount, nextDate));
    }

    function setPortfolioSuggestionState(itemId, patch) {
      setPortfolioSuggestions(function (current) {
        return Object.assign({}, current, {
          [itemId]: Object.assign({ items: [], activeIndex: 0, loading: false }, current[itemId] || {}, patch),
        });
      });
    }

    function clearPortfolioSuggestions(itemId) {
      setPortfolioSuggestionState(itemId, { items: [], activeIndex: 0, loading: false });
    }

    function lookupLeaderInfo(accountTypeValue, stockName, stockCode) {
      const cached = PORTFOLIO_AUTOCOMPLETE_SOURCE_CACHE[accountTypeValue === "us" ? "us" : "kr"];
      const lookup = cached && cached.lookup ? cached.lookup : {};
      const codeKey = normalizeLooseSearchText(String(stockCode || "").trim().toUpperCase());
      const nameKey = normalizeLooseSearchText(stockName);
      return lookup[codeKey] || lookup[nameKey] || null;
    }

    async function ensurePortfolioAutocompleteSource(accountTypeValue) {
      const key = accountTypeValue === "us" ? "us" : "kr";
      const cached = PORTFOLIO_AUTOCOMPLETE_SOURCE_CACHE[key];
      if (cached && cached.lookup) {
        return cached.lookup;
      }
      if (cached && cached.promise) {
        return cached.promise;
      }
      const url = key === "us"
        ? "/api/us-themes/today?min_score=50"
        : "/api/themes/today?min_score=50&lite=true&cache_only=true";
      const promise = fetchJson(url, { silent: true }).then(function (payload) {
        const lookup = buildLeaderLookup(payload && payload.qualified_stocks);
        PORTFOLIO_AUTOCOMPLETE_SOURCE_CACHE[key] = { lookup: lookup, loadedAt: Date.now() };
        return lookup;
      }).catch(function () {
        PORTFOLIO_AUTOCOMPLETE_SOURCE_CACHE[key] = { lookup: {}, loadedAt: Date.now() };
        return {};
      });
      PORTFOLIO_AUTOCOMPLETE_SOURCE_CACHE[key] = { promise: promise };
      return promise;
    }

    async function loadPortfolioCurrentPrice(accountTypeValue, stockName, stockCode) {
      try {
        if (accountTypeValue === "us") {
          const detail = await fetchJson("/api/global-stocks/detail?symbol=" + encodeURIComponent(stockCode || stockName), { noCache: true });
          const price = Number(detail && detail.price);
          return Number.isFinite(price) && price > 0 ? price : null;
        }
        const overview = await fetchJson(
          "/api/stocks/overview?" + (stockCode
            ? ("code=" + encodeURIComponent(stockCode))
            : ("name=" + encodeURIComponent(stockName))),
          { noCache: true }
        );
        const price = Number(overview && overview.price);
        return Number.isFinite(price) && price > 0 ? price : null;
      } catch (error) {
        return null;
      }
    }

    function normalizePortfolioSuggestionItem(raw, accountTypeValue) {
      const stockName = String(raw.name || raw.stock_name || "").trim();
      const stockCode = String(raw.code || raw.symbol || raw.stock_code || "").trim().toUpperCase();
      const leaderInfo = lookupLeaderInfo(accountTypeValue, stockName, stockCode) || {};
      return {
        stock_name: stockName,
        stock_code: stockCode,
        market: String(raw.market || raw.exchange || "").trim(),
        sector: String(leaderInfo.sector || "").trim(),
        current_price: leaderInfo.current_price || null,
      };
    }

    function handlePortfolioStockInput(index, item, value) {
      updateItemPatch(index, {
        stock_name: value,
        stock_code: "",
        current_price: "",
      });
      const itemId = item.item_id || ("item-" + index);
      const trimmed = String(value || "").trim();
      if (portfolioSearchTimerRef.current[itemId]) {
        clearTimeout(portfolioSearchTimerRef.current[itemId]);
      }
      if (trimmed.length < 1) {
        clearPortfolioSuggestions(itemId);
        return;
      }
      setPortfolioSuggestionState(itemId, { loading: true, items: [], activeIndex: 0 });
      portfolioSearchTimerRef.current[itemId] = setTimeout(async function () {
        try {
          await ensurePortfolioAutocompleteSource(form.account_type || activeAccountType || "kr");
          const endpoint = form.account_type === "us"
            ? "/api/global-stocks/search?q=" + encodeURIComponent(trimmed) + "&limit=10"
            : "/api/stocks/autocomplete?q=" + encodeURIComponent(trimmed) + "&limit=10";
          const payload = await fetchJson(endpoint, { noCache: true });
          const items = ensureArray(payload.items).map(function (entry) {
            return normalizePortfolioSuggestionItem(entry, form.account_type || activeAccountType || "kr");
          });
          setPortfolioSuggestionState(itemId, { items: items, activeIndex: 0, loading: false });
        } catch (error) {
          setPortfolioSuggestionState(itemId, { items: [], activeIndex: 0, loading: false });
        }
      }, 160);
    }

    async function choosePortfolioSuggestion(index, item, suggestion) {
      const accountTypeValue = form.account_type || activeAccountType || "kr";
      const itemId = item.item_id || ("item-" + index);
      clearPortfolioSuggestions(itemId);
      const leaderInfo = lookupLeaderInfo(accountTypeValue, suggestion.stock_name, suggestion.stock_code) || {};
      updateItemPatch(index, {
        stock_name: suggestion.stock_name || "",
        stock_code: suggestion.stock_code || "",
        sector: String(suggestion.sector || leaderInfo.sector || item.sector || "").trim(),
        current_price: suggestion.current_price || leaderInfo.current_price ? String(suggestion.current_price || leaderInfo.current_price) : "",
      });
      if (suggestion.current_price || leaderInfo.current_price) {
        return;
      }
      const resolvedPrice = await loadPortfolioCurrentPrice(accountTypeValue, suggestion.stock_name, suggestion.stock_code);
      if (resolvedPrice == null) {
        return;
      }
      updateItemPatch(index, {
        current_price: String(resolvedPrice),
      });
    }

    function handlePortfolioSuggestionKeyDown(event, index, item) {
      const itemId = item.item_id || ("item-" + index);
      const state = portfolioSuggestions[itemId] || {};
      const items = ensureArray(state.items);
      if (!items.length) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPortfolioSuggestionState(itemId, { activeIndex: ((state.activeIndex || 0) + 1) % items.length });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setPortfolioSuggestionState(itemId, { activeIndex: ((state.activeIndex || 0) - 1 + items.length) % items.length });
      } else if (event.key === "Enter") {
        event.preventDefault();
        choosePortfolioSuggestion(index, item, items[state.activeIndex || 0] || items[0]);
      } else if (event.key === "Escape") {
        clearPortfolioSuggestions(itemId);
      }
    }

    async function saveSnapshot() {
      const payload = {
        snapshot_id: form.snapshot_id || null,
        trade_date: form.trade_date,
        account_type: form.account_type,
        account_capital: form.account_capital === "" ? null : Number(form.account_capital),
        note: form.note,
        items: ensureArray(form.items).map(function (item) {
            return {
              item_id: item.item_id || null,
              sector: item.sector,
              stock_name: item.stock_name,
              stock_code: item.stock_code,
              avg_price: item.avg_price === "" ? null : Number(item.avg_price),
              weight_pct: item.weight_pct === "" ? null : Number(item.weight_pct),
              quantity: item.quantity === "" ? null : Number(item.quantity),
              stop_loss_price: item.stop_loss_price === "" ? null : Number(item.stop_loss_price),
              sell_price: item.sell_price === "" ? null : Number(item.sell_price),
              note: item.note,
            };
          }),
      };
      setSaveState({ status: "working", message: "저장 중..." });
      try {
        const refreshed = await fetchJson("/api/portfolio/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          noCache: true,
        });
        const snapshots = ensureArray(refreshed && refreshed.manual_journal && refreshed.manual_journal.snapshots);
        const matched = snapshots.filter(function (snapshot) {
          return snapshot.trade_date === payload.trade_date && snapshot.account_type === payload.account_type;
        }).slice(-1)[0];
        if (matched) {
          setSelectedSnapshotId(matched.snapshot_id || "");
          setForm(snapshotToForm(matched));
          setActiveAccountType(matched.account_type || payload.account_type || "kr");
        }
        setSaveState({ status: "done", message: "스냅샷을 저장했다." });
        await request.refresh(true);
      } catch (error) {
        setSaveState({ status: "error", message: error.message || String(error) });
      }
    }

    async function deleteSnapshot() {
      if (!form.snapshot_id) {
        startNewSnapshot(form.account_type || activeAccountType);
        return;
      }
      setSaveState({ status: "working", message: "삭제 중..." });
      try {
        await fetchJson("/api/portfolio/journal?snapshot_id=" + encodeURIComponent(form.snapshot_id), {
          method: "DELETE",
          noCache: true,
        });
        setSaveState({ status: "done", message: "스냅샷을 삭제했다." });
        setSelectedSnapshotId("");
        setForm(emptyForm(form.account_type || activeAccountType, isoDateOffset(0)));
        await request.refresh(true);
      } catch (error) {
        setSaveState({ status: "error", message: error.message || String(error) });
      }
    }

    function copyCapture() {
      const target = captureRef.current;
      if (!target || !currentCapture) {
        setCaptureState({ status: "error", message: "캡쳐할 스냅샷을 먼저 선택해라." });
        return;
      }
      if (!window.html2canvas) {
        setCaptureState({ status: "error", message: "캡쳐 기능을 사용할 수 없다." });
        return;
      }
      setCaptureState({ status: "working", message: "캡쳐 복사 중..." });
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          window.html2canvas(target, {
            backgroundColor: "#ffffff",
            scale: Math.max(2, Math.min(3, window.devicePixelRatio || 2)),
            useCORS: true,
            logging: false,
            windowWidth: Math.max(document.documentElement.clientWidth || 0, target.scrollWidth || 0),
            windowHeight: Math.max(document.documentElement.clientHeight || 0, target.scrollHeight || 0),
          }).then(function (canvas) {
            return new Promise(function (resolve, reject) {
              canvas.toBlob(function (blob) {
                if (!blob) {
                  reject(new Error("이미지 생성에 실패했다."));
                  return;
                }
                resolve(blob);
              }, "image/png");
            });
          }).then(function (blob) {
            return copyImageBlobWithFallback(blob);
          }).then(function () {
            setCaptureState({ status: "done", message: "비중표를 클립보드에 복사했다." });
          }).catch(function (error) {
            setCaptureState({ status: "error", message: error.message || String(error) });
          });
        });
      });
    }

    const formExposure = ensureArray(form.items).reduce(function (sum, item) {
      return sum + Number(item.weight_pct || 0);
    }, 0);
    function roundCaptureWeight5(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return 0;
      }
      return Math.round(number / 5) * 5;
    }

    function computeLiveItemMetrics(item, capitalBaseValue) {
      const exitInfo = portfolioItemExitInfo(item);
      const currentPrice = Number(exitInfo.price || item && item.current_price || 0);
      const avgPrice = Number(item && item.avg_price || 0);
      const quantity = Number(item && item.quantity || 0);
      const capital = Number(capitalBaseValue || 0);
      const currentValue = currentPrice > 0 && quantity > 0 ? currentPrice * quantity : 0;
      const investedValue = avgPrice > 0 && quantity > 0 ? avgPrice * quantity : 0;
      const pnlValue = currentValue - investedValue;
      return {
        is_exited: exitInfo.exited,
        exit_reason: exitInfo.reason,
        mark_price: currentPrice > 0 ? currentPrice : null,
        current_value: currentValue,
        invested_value: investedValue,
        pnl_value: pnlValue,
        pnl_pct: investedValue > 0 ? ((currentValue / investedValue) - 1) * 100 : null,
        actual_weight_pct: exitInfo.exited ? 0 : (capital > 0 ? (currentValue / capital) * 100 : null),
      };
    }

    function sectorToneClass(value) {
      const text = String(value || "").trim();
      if (!text) {
        return "tone-0";
      }
      let hash = 0;
      for (let index = 0; index < text.length; index += 1) {
        hash = ((hash * 31) + text.charCodeAt(index)) % 7;
      }
      return "tone-" + hash;
    }

    function portfolioDisplayDigits(accountTypeValue, fieldKey) {
      if (accountTypeValue === "us") {
        if (fieldKey === "weight_pct") {
          return 1;
        }
        if (fieldKey === "quantity" || fieldKey === "current_price") {
          return 2;
        }
      }
      return 0;
    }

    return h(
      React.Fragment,
      null,
      h(
        "section",
        { className: "panel portfolio-asset-panel" },
        h("div", { className: "section-toolbar" },
          h("div", null,
            h("div", { className: "eyebrow" }, "Manual Portfolio Journal"),
            h("h1", { className: "page-title portfolio-page-title" }, "포트폴리오 수익")
          ),
          h("div", { className: "toggle-group portfolio-asset-toggle" },
            h("button", { className: "mini-button" + (assetView === "total" ? " active" : ""), onClick: function () { setAssetView("total"); } }, "전체 자산"),
            h("button", { className: "mini-button" + (assetView === "kr" ? " active" : ""), onClick: function () { setAssetView("kr"); } }, "국장"),
            h("button", { className: "mini-button" + (assetView === "us" ? " active" : ""), onClick: function () { setAssetView("us"); } }, "미장"),
            h("button", { className: "mini-button" + (assetView === "other" ? " active" : ""), onClick: function () { setAssetView("other"); } }, "기타 자산")
          )
        ),
        h("div", { className: "chart-hint" }, "전체 자산은 KOSPI, KOSDAQ, NASDAQ, S&P 500과 동시에 비교하고, 국장/미장/기타 자산은 포트 자체 흐름만 본다."),
        h(PerformanceChart, {
          series: selectedAssetSeries,
          benchmarks: selectedAssetBenchmarks,
          xRange: xRange,
          onRangeChange: setXRange,
          resetSignal: resetSignal,
        }),
        h("div", { className: "portfolio-chart-legend" },
          h("span", { className: "portfolio-legend-item portfolio-line-portfolio" }, "포트폴리오"),
          selectedAssetBenchmarks.map(function (benchmark) {
            return h("span", { key: benchmark.key, className: "portfolio-legend-item", style: { "--legend-color": benchmark.color } }, benchmark.label);
          })
        ),
        h("div", { className: "portfolio-asset-meta" },
          h("strong", null, assetViewLabel),
          h("span", null, selectedAssetLatest ? ((selectedAssetLatest.date || "-") + " · " + formatPercent(selectedAssetLatest.return_pct, 2)) : "데이터 없음")
        ),
        assetView === "total"
          ? h("div", { className: "portfolio-benchmark-summary-strip" },
              selectedAssetBenchmarks.map(function (benchmark) {
                const stats = selectedAssetRelativeStatsMap[benchmark.key] || {};
                return h("div", { key: "benchmark-summary-" + benchmark.key, className: "portfolio-benchmark-summary-card" },
                  h("strong", null, benchmark.label),
                  h("span", null, "지수 " + (stats.benchmark_return_pct == null ? "-" : formatPercent(stats.benchmark_return_pct, 2))),
                  h("em", { className: pnlClass(stats.alpha_pct) }, "초과 " + (stats.alpha_pct == null ? "-" : formatPercent(stats.alpha_pct, 2)))
                );
              })
            )
          : null,
        h(
          "div",
          { className: "summary-grid portfolio-compact-summary" },
          h(SummaryCard, { label: "누적", value: selectedAssetLatest ? formatPercent(selectedAssetLatest.return_pct, 2) : "-", help: assetViewLabel + " 시드 기준" }),
          h(SummaryCard, { label: "평가금액", value: selectedAssetLatest ? formatCurrency(selectedAssetLatest.nav) : "-", help: selectedAssetLatest ? ((selectedAssetLatest.date || "-") + " 기준") : "데이터 없음" }),
          h(SummaryCard, { label: "스냅샷", value: numberFormat(summary.snapshot_count || 0, 0) + "개", help: "KR + US" }),
          h(SummaryCard, { label: "보유 종목", value: numberFormat(summary.holding_count_latest || 0, 0) + "개", help: "최신 기준" })
        ),
        h(
          "div",
          { className: "toggle-group portfolio-top-toolbar" },
          h("label", { className: "inline-field" },
            h("span", null, "표시 기간"),
            h(
              "select",
              { value: activePeriod, onChange: function (event) { setPeriodKey(event.target.value); } },
              [h("option", { key: "all", value: "all" }, "전체 기간")].concat(
                monthOptions.slice().reverse().map(function (month) {
                  return h("option", { key: month, value: month }, monthLabel(month));
                })
              )
            )
          ),
          h("button", { className: "secondary-button", onClick: function () { startNewSnapshot(activeAccountType); } }, "새 스냅샷"),
          h("button", { className: "primary-button", disabled: saveState.status === "working", onClick: saveSnapshot }, saveState.status === "working" ? "저장 중..." : "스냅샷 저장"),
          h("button", { className: "secondary-button", onClick: function () { window.location.href = "/api/portfolio/export.xlsx"; } }, "엑셀 내보내기")
        ),
        saveState.message ? h("div", { className: "summary-help" + (saveState.status === "error" ? " text-danger" : "") }, saveState.message) : null
      ),
      h(
        "section",
        { className: "panel portfolio-journal-wide-panel" },
        h("div", { className: "section-toolbar" },
          h(SectionTitle, null, "일자별 저널"),
          h("div", { className: "toggle-group" },
            h("button", { className: "mini-button" + (activeAccountType === "kr" ? " active" : ""), onClick: function () { setActiveAccountType("kr"); updateFormField("account_type", "kr"); } }, "국내"),
            h("button", { className: "mini-button" + (activeAccountType === "us" ? " active" : ""), onClick: function () { setActiveAccountType("us"); updateFormField("account_type", "us"); } }, "미장"),
            h("button", { className: "mini-button", onClick: function () { startNewSnapshot(activeAccountType); } }, "최신 입력")
          )
        ),
        h("div", { className: "portfolio-journal-list" },
          activeSnapshots.length
            ? activeSnapshots.map(function (snapshot) {
                const exposure = ensureArray(snapshot.items).reduce(function (sum, item) { return sum + Number(item.weight_pct || 0); }, 0);
                const previewItems = ensureArray(snapshot.items)
                  .slice()
                  .sort(function (a, b) { return Number(b.weight_pct || 0) - Number(a.weight_pct || 0); })
                  .slice(0, 4);
                const previewText = previewItems.map(function (previewItem) {
                  return (previewItem.stock_name || previewItem.resolved_name || "-") + " " + formatPercent(previewItem.weight_pct, 1);
                }).join(" · ");
                return h(
                  "button",
                  {
                    key: snapshot.snapshot_id,
                    type: "button",
                    className: "portfolio-journal-entry one-line" + (selectedSnapshotId === snapshot.snapshot_id ? " active" : ""),
                    onClick: function () { focusSnapshot(snapshot); },
                  },
                  h("div", { className: "portfolio-journal-summary" },
                    h("strong", { className: "portfolio-journal-date" }, snapshot.trade_date || "-"),
                    h("span", { className: "portfolio-journal-meta" }, numberFormat(ensureArray(snapshot.items).length, 0) + "종목 · 총 비중 " + numberFormat(exposure, 1) + "%")
                  ),
                  h("div", { className: "portfolio-journal-chip-strip" },
                    previewItems.length
                      ? previewItems.map(function (previewItem, previewIndex) {
                          return h(
                            "span",
                            {
                              key: (previewItem.item_id || previewItem.stock_code || previewItem.stock_name || "") + "-" + previewIndex,
                              className: "portfolio-journal-inline-chip " + sectorToneClass(previewItem.sector),
                            },
                            h("span", { className: "portfolio-journal-inline-sector" }, previewItem.sector || "미지정"),
                            h("strong", null, previewItem.stock_name || previewItem.resolved_name || "-"),
                            h("em", null, formatPercent(previewItem.weight_pct, 1))
                          );
                        })
                      : h("span", { className: "portfolio-journal-preview-inline empty" }, "보유 종목 없음")
                  )
                );
              })
            : EmptyState({ message: (activeAccountType === "us" ? "미장" : "국내") + " 계좌 스냅샷이 아직 없다.", compact: true })
        ),
        h("div", { className: "portfolio-seed-bar" },
          h("div", { className: "portfolio-seed-bar-head" },
            h("strong", null, "시드금액"),
            h("span", null, "예수금 포함 총 계좌자산 100% 기준이다. 이 금액에 비중을 곱해서 종목별 목표 금액과 수량을 자동 계산한다.")
          ),
          h("div", { className: "portfolio-seed-bar-controls" },
            h("label", null,
              h("span", null, "계좌"),
              h("input", { className: "text-input", value: form.account_type === "us" ? "미장 계좌" : "국내 계좌", readOnly: true })
            ),
            h("label", null,
              h("span", null, "기준 일자"),
              h("select", {
                className: "select-input",
                value: form.trade_date,
                onChange: function (event) { handleTradeDateSelection(event.target.value); },
              }, tradeDateOptions.map(function (dateText) {
                return h("option", { key: dateText, value: dateText }, dateText);
              }))
            ),
            h("label", { className: "portfolio-seed-input" },
              h("span", null, "시드금액(현금 포함)"),
              h("input", { className: "text-input", type: "number", value: form.account_capital, placeholder: form.account_type === "us" ? "USD 시드 입력" : "KRW 시드 입력", onChange: function (event) { updateAccountCapital(event.target.value); } }),
              h("em", { className: "portfolio-seed-caption" }, formatMoneyByCurrencyKoreanCompact(form.account_capital, form.account_type === "us" ? "USD" : "KRW"))
            )
          ),
          h("div", { className: "portfolio-seed-actions" },
            h("button", { className: "primary-button", type: "button", disabled: saveState.status === "working", onClick: saveSnapshot }, saveState.status === "working" ? "저장 중..." : "시드/일자 저장")
          )
        ),
        h("div", { className: "portfolio-inline-form-grid" },
          h("label", null, h("span", null, "모드"), h("input", { className: "text-input", value: form.snapshot_id ? "과거 수정" : "최신 입력", readOnly: true })),
          h("label", { className: "wide" }, h("span", null, "메모"), h("input", { className: "text-input", value: form.note, onChange: function (event) { updateFormField("note", event.target.value); } }))
        ),
        h("div", { className: "portfolio-editor-toolbar compact" },
          h("div", { className: "summary-help" }, "시드금액을 먼저 넣으면 비중 기준 수량이 자동 추정된다. 평단가와 실제 수량은 나중에 수정해도 된다."),
          h("div", { className: "toggle-group" },
            h("button", { className: "mini-button", type: "button", onClick: addItem }, "행 추가"),
            h("button", { className: "mini-button danger", type: "button", onClick: deleteSnapshot }, form.snapshot_id ? "현재 삭제" : "입력 초기화")
          )
        ),
        h("div", { className: "portfolio-item-scroll compact" },
          ensureArray(form.items).map(function (item, index) {
            const suggestionState = portfolioSuggestions[item.item_id] || {};
            const suggestionItems = ensureArray(suggestionState.items);
            const estimatedQuantity = computeEstimatedQuantity(item.weight_pct, item.current_price, form.account_type || activeAccountType || "kr", form.account_capital);
            const liveMetrics = computeLiveItemMetrics(item, form.account_capital || accountEstimateBaseValue);
            return h(
              "div",
              {
                key: item.item_id || index,
                className: "portfolio-item-card compact " + sectorToneClass(item.sector) + (portfolioDragIndex === index ? " dragging" : ""),
                draggable: true,
                onDragStart: function (event) {
                  setPortfolioDragIndex(index);
                  if (event && event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                  }
                },
                onDragOver: function (event) {
                  event.preventDefault();
                  if (event && event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                  }
                },
                onDrop: function (event) {
                  event.preventDefault();
                  reorderPortfolioItems(portfolioDragIndex, index);
                  setPortfolioDragIndex(-1);
                },
                onDragEnd: function () {
                  setPortfolioDragIndex(-1);
                },
              },
              h("div", { className: "portfolio-item-topline" },
                h("div", { className: "portfolio-item-chip-row" },
                  h("span", { className: "portfolio-drag-handle", title: "드래그해서 순서 변경" }, "≡"),
                  h("span", { className: "portfolio-item-order" }, numberFormat(index + 1, 0)),
                  h("span", { className: "portfolio-sector-chip" }, item.sector || "섹터 미지정")
                ),
              h("div", { className: "portfolio-item-topmeta" },
                  item.stock_name ? h("strong", null, item.stock_name) : h("strong", { className: "muted" }, "종목 선택"),
                  h("span", null, [
                    liveMetrics.actual_weight_pct == null ? null : ("실비중 " + numberFormat(liveMetrics.actual_weight_pct, 2) + "%"),
                    liveMetrics.current_value > 0 ? ("평가 " + formatMoneyByCurrency(liveMetrics.current_value, form.account_type === "us" ? "USD" : "KRW")) : null,
                    liveMetrics.is_exited ? (liveMetrics.exit_reason === "manual_sell" ? "직접매도 반영" : "손절청산 반영") : null,
                  ].filter(Boolean).join(" · "))
                )
              ),
              h("div", { className: "portfolio-item-live-row" },
                h("span", null, "목표비중 " + (item.weight_pct ? numberFormat(item.weight_pct, 2) + "%" : "-")),
                h("span", null, "평가금액 " + (liveMetrics.current_value > 0 ? formatMoneyByCurrency(liveMetrics.current_value, form.account_type === "us" ? "USD" : "KRW") : "-")),
                h("span", { className: pnlClass(liveMetrics.pnl_value) }, "손익 " + (liveMetrics.current_value > 0 ? formatMoneyByCurrency(liveMetrics.pnl_value, form.account_type === "us" ? "USD" : "KRW") : "-")),
                h("span", { className: pnlClass(liveMetrics.pnl_pct) }, "수익률 " + (liveMetrics.pnl_pct == null ? "-" : formatPercent(liveMetrics.pnl_pct, 2)))
              ),
              h("div", { className: "portfolio-item-grid wide-grid" },
                h("label", null, h("span", null, "섹터"), h("input", { className: "text-input", value: item.sector, onChange: function (event) { updateItemField(index, "sector", event.target.value); } })),
                h("label", { className: "portfolio-stock-autocomplete" },
                  h("span", null, "종목명"),
                  h("input", {
                    className: "text-input",
                    value: item.stock_name,
                    placeholder: form.account_type === "us" ? "미장 종목 검색" : "국내 종목 검색",
                    autoComplete: "off",
                    onChange: function (event) { handlePortfolioStockInput(index, item, event.target.value); },
                    onKeyDown: function (event) { handlePortfolioSuggestionKeyDown(event, index, item); },
                    onBlur: function () {
                      window.setTimeout(function () {
                        clearPortfolioSuggestions(item.item_id);
                      }, 140);
                    },
                  }),
                  suggestionItems.length
                    ? h("div", { className: "autocomplete-list inline portfolio-autocomplete-list" },
                        suggestionItems.map(function (suggestion, suggestionIndex) {
                          return h(
                            "button",
                            {
                              key: (suggestion.stock_code || suggestion.stock_name || "") + "-" + suggestionIndex,
                              type: "button",
                              className: "autocomplete-item" + (suggestionIndex === (suggestionState.activeIndex || 0) ? " active" : ""),
                              onMouseDown: function (event) {
                                event.preventDefault();
                                choosePortfolioSuggestion(index, item, suggestion);
                              },
                            },
                            h("strong", null, suggestion.stock_name || "-"),
                            h("span", null, [suggestion.stock_code, suggestion.market, suggestion.sector].filter(Boolean).join(" · ")),
                            suggestion.current_price ? h("em", null, "현재가 " + numberFormat(suggestion.current_price, form.account_type === "us" ? 2 : 0)) : null
                          );
                        })
                      )
                    : null
                ),
                h("label", null, h("span", null, "현재가"), h("input", { className: "text-input", value: item.current_price, readOnly: true, placeholder: "종목 선택 시 자동" })),
                h("label", null, h("span", null, "평단가"), h("input", { className: "text-input", type: "number", value: item.avg_price, placeholder: "추후 입력 가능", onChange: function (event) { updateItemField(index, "avg_price", event.target.value); } })),
                h("label", null, h("span", null, "비중 %"), h("input", { className: "text-input", type: "number", value: item.weight_pct, onChange: function (event) { updateItemField(index, "weight_pct", event.target.value); } })),
                h("label", null,
                  h("span", null, "수량"),
                  h("input", {
                    className: "text-input",
                    type: "number",
                    value: item.quantity,
                    placeholder: "비중 입력 시 자동 추정",
                    onChange: function (event) { updateItemPatch(index, { quantity: event.target.value }); },
                  }),
                    estimatedQuantity != null
                    ? h("em", { className: "portfolio-field-hint" }, "현재가 기준 약 " + numberFormat(estimatedQuantity, form.account_type === "us" ? 2 : 0) + (form.account_type === "us" ? "주" : "주"))
                    : null
                ),
                h("label", null, h("span", null, "손절가"), h("input", { className: "text-input", type: "number", value: item.stop_loss_price, onChange: function (event) { updateItemField(index, "stop_loss_price", event.target.value); } })),
                h("label", null, h("span", null, "매도가"), h("input", { className: "text-input", type: "number", value: item.sell_price, placeholder: "직접 매도 시 입력", onChange: function (event) { updateItemField(index, "sell_price", event.target.value); } })),
                h("label", { className: "wide" }, h("span", null, "비고"), h("input", { className: "text-input", value: item.note, onChange: function (event) { updateItemField(index, "note", event.target.value); } })),
                h("div", { className: "portfolio-item-inline-remove" }, h("button", { className: "mini-button danger", type: "button", onClick: function () { removeItem(index); } }, "삭제"))
              )
            );
          })
        ),
        h("div", { className: "portfolio-journal-actions" },
          h("div", { className: "summary-help" }, form.snapshot_id ? "선택한 날짜 스냅샷을 수정 중" : "최신 날짜 스냅샷을 새로 입력 중"),
          h("div", { className: "toggle-group" },
            h("button", { className: "secondary-button", type: "button", onClick: function () { startNewSnapshot(activeAccountType); } }, "새 스냅샷"),
            h("button", { className: "primary-button", type: "button", disabled: saveState.status === "working", onClick: saveSnapshot }, saveState.status === "working" ? "저장 중..." : "일자 저장")
          )
        )
      ),
      h(
        "div",
        { className: "portfolio-chart-grid" },
        h(
          "section",
          { className: "panel" },
          h("div", { className: "chart-toolbar" },
            h(SectionTitle, null, "비중 변화"),
            h("div", { className: "toggle-group" },
              h("button", { className: "mini-button" + (allocationMode === "sector" ? " active" : ""), onClick: function () { setAllocationMode("sector"); } }, "섹터별"),
              h("button", { className: "mini-button" + (allocationMode === "stock" ? " active" : ""), onClick: function () { setAllocationMode("stock"); } }, "종목별")
            )
          ),
          h(AllocationChart, { allocations: viewAllocations, mode: allocationMode, xRange: xRange })
        ),
        h(
          "section",
          { className: "panel portfolio-account-panel" },
          h("div", { className: "section-toolbar" },
            h(SectionTitle, null, (activeAccount && activeAccount.account_label) || "계좌 요약"),
            h("div", { className: "summary-help" }, activeAccount && activeAccount.latest_snapshot ? (activeAccount.latest_snapshot.trade_date || "") : "")
          ),
          activeAccount && activeAccount.latest_snapshot
            ? h(DataTable, {
                rows: ensureArray(activeAccount.latest_snapshot.items),
                compact: true,
                emptyMessage: "보유 종목이 없다.",
                columns: [
                  { key: "sector", label: "섹터", render: function (row) { return row.sector || "-"; } },
                  { key: "stock_name", label: "종목", render: function (row) { return row.stock_name || row.resolved_name || "-"; } },
                  { key: "weight_pct", label: "비중", render: function (row) { return formatPercent(row.weight_pct, portfolioDisplayDigits(activeAccount.account_type, "weight_pct")); } },
                  { key: "quantity", label: "수량", render: function (row) { return numberFormat(row.quantity, portfolioDisplayDigits(activeAccount.account_type, "quantity")); } },
                  { key: "return_pct", label: "수익률", render: function (row) { return row.return_pct == null ? "-" : h("span", { className: pnlClass(row.return_pct) }, formatPercent(row.return_pct, 2)); } },
                ],
              })
            : EmptyState({ message: "계좌 데이터가 없다.", compact: true })
        )
      ),
      h(
        "div",
        { className: "portfolio-chart-grid" },
        h(
          "section",
          { className: "panel" },
          h("div", { className: "section-toolbar" },
            h(SectionTitle, null, "월별 성과"),
            h("div", { className: "summary-help" }, "승률은 수량 감소/청산 이벤트 기준")
          ),
          h(DataTable, {
            rows: monthlyStats.slice().reverse(),
            compact: true,
            emptyMessage: "월별 통계가 아직 없다.",
            columns: [
              { key: "month", label: "월", render: function (row) { return formatYearMonthLabel(row.month); } },
              { key: "account_label", label: "계좌" },
              { key: "month_return_pct", label: "월 수익률", render: function (row) { return h("span", { className: pnlClass(row.month_return_pct) }, formatPercent(row.month_return_pct, 2)); } },
              { key: "trade_count", label: "트레이드 수", render: function (row) { return row.trade_count == null ? "-" : numberFormat(row.trade_count, 0); } },
              { key: "win_rate_pct", label: "승률", render: function (row) { return row.win_rate_pct == null ? "-" : formatPercent(row.win_rate_pct, 1); } },
              { key: "realized_return_pct", label: "실현 수익률", render: function (row) { return row.realized_return_pct == null ? "-" : h("span", { className: pnlClass(row.realized_return_pct) }, formatPercent(row.realized_return_pct, 2)); } },
            ],
          })
        ),
        h(
          "section",
          { className: "panel portfolio-capture-panel" },
          h("div", { className: "section-toolbar" },
            h(SectionTitle, null, "데일리 비중 캡쳐"),
            h("button", { className: "primary-button", disabled: !currentCapture || captureState.status === "working", onClick: copyCapture }, captureState.status === "working" ? "복사 중..." : "비중표 캡쳐 복사")
          ),
          h("div", { className: "summary-help" }, currentCapture ? ("최신 저장 스냅샷 · " + (currentCapture.trade_date || "") + " · " + (currentCapture.account_label || "")) : "최신 저장 스냅샷이 아직 없다."),
          captureState.message ? h("div", { className: "summary-help" + (captureState.status === "error" ? " text-danger" : "") }, captureState.message) : null,
          currentCapture && ensureArray(currentCapture.rows).length
            ? h(DataTable, {
                rows: ensureArray(currentCapture.rows),
                compact: true,
                emptyMessage: "캡쳐할 비중표가 없다.",
                columns: [
                  { key: "sector", label: "섹터", render: function (row) { return row.sector || "-"; } },
                  { key: "stock_name", label: "종목" },
                  { key: "prev_weight_pct", label: "이전", render: function (row) { return formatPercent(roundCaptureWeight5(row.prev_weight_pct), 0); } },
                  { key: "weight_pct", label: "이후", render: function (row) { return formatPercent(roundCaptureWeight5(row.weight_pct), 0); } },
                  { key: "note", label: "비고", render: function (row) { return (row.stop_loss_price ? ("손절가: " + numberFormat(row.stop_loss_price, 0)) : "") + ((row.stop_loss_price && row.note) ? " · " : "") + (row.note || ""); } },
                ],
              })
            : EmptyState({ message: "캡쳐할 스냅샷이 없다.", compact: true })
        )
      ),
      h(
        "div",
        { className: "portfolio-account-grid" },
        ensureArray(accounts.length ? accounts : [
          { account_type: "kr", account_label: "국내 계좌", latest_snapshot: null },
          { account_type: "us", account_label: "미장 계좌", latest_snapshot: null },
        ]).map(function (account) {
          const latestSnapshot = account.latest_snapshot || null;
          return h(
            "section",
            { key: account.account_type || account.account_label, className: "panel portfolio-account-panel" },
            h("div", { className: "section-toolbar" },
              h(SectionTitle, null, account.account_label || "-"),
              h("button", { className: "mini-button", onClick: function () { setActiveAccountType(account.account_type || "kr"); startNewSnapshot(account.account_type || "kr"); } }, "새 스냅샷")
            ),
            latestSnapshot
              ? h(React.Fragment, null,
                  h("div", { className: "portfolio-account-summary-strip" },
                    h(SummaryCard, { label: "최근 날짜", value: latestSnapshot.trade_date || "-", help: numberFormat(ensureArray(latestSnapshot.items).length, 0) + "종목" }),
                    h(SummaryCard, { label: "시드금액", value: formatMoneyByCurrency(latestSnapshot.account_capital || latestSnapshot.capital, account.account_type === "us" ? "USD" : "KRW"), help: "계좌 기준" }),
                    h(SummaryCard, { label: "평가금액", value: formatMoneyByCurrency(latestSnapshot.nav_close, account.account_type === "us" ? "USD" : "KRW"), help: "현금 포함" }),
                    h(SummaryCard, { label: "일간 수익률", value: formatPercent(latestSnapshot.daily_return_pct, 2), help: "직전 스냅샷 대비" })
                  ),
                  h(DataTable, {
                    rows: ensureArray(latestSnapshot.items),
                    compact: true,
                    emptyMessage: "보유 종목이 없다.",
                    columns: [
                      { key: "sector", label: "섹터", render: function (row) { return row.sector || "-"; } },
                      { key: "stock_name", label: "종목", render: function (row) { return row.stock_name || row.resolved_name || "-"; } },
                      { key: "weight_pct", label: "비중", render: function (row) { return formatPercent(row.weight_pct, portfolioDisplayDigits(account.account_type, "weight_pct")); } },
                      { key: "quantity", label: "수량", render: function (row) { return numberFormat(row.quantity, portfolioDisplayDigits(account.account_type, "quantity")); } },
                      { key: "current_price", label: "현재가", render: function (row) { return numberFormat(row.current_price, portfolioDisplayDigits(account.account_type, "current_price")); } },
                      { key: "return_pct", label: "수익률", render: function (row) { return h("span", { className: pnlClass(row.return_pct) }, formatPercent(row.return_pct, 2)); } },
                    ],
                  })
                )
              : EmptyState({ message: "아직 저장된 스냅샷이 없다.", compact: true })
          );
        })
      ),
      h(
        "section",
        { className: "panel" },
        h("div", { className: "section-toolbar" },
          h(SectionTitle, null, "최근 스냅샷 설명"),
          h("div", { className: "summary-help" }, latestDetail ? (latestDetail.date + " 기준") : "데이터 없음")
        ),
        latestDetail
          ? h(React.Fragment, null,
              h("div", { className: "summary-grid summary-grid-small" },
                h(SummaryCard, { label: "일간 수익률", value: formatPercent(latestDetail.daily_return_pct, 3), help: latestDetail.date }),
                h(SummaryCard, { label: "현금 잔액", value: formatCurrency(latestDetail.cash_close), help: "전체 계좌 합산" }),
                h(SummaryCard, { label: "계좌 수", value: numberFormat(ensureArray(latestDetail.account_summaries).length, 0) + "개", help: "해당 일자 기준" })
              ),
              h(DataTable, {
                rows: ensureArray(latestDetail.account_summaries),
                compact: true,
                emptyMessage: "계좌 요약이 없다.",
                columns: [
                  { key: "account_label", label: "계좌" },
                  { key: "nav_close", label: "평가금액", render: function (row) { return formatCurrency(row.nav_close); } },
                  { key: "daily_return_pct", label: "일간 수익률", render: function (row) { return h("span", { className: pnlClass(row.daily_return_pct) }, formatPercent(row.daily_return_pct, 2)); } },
                  { key: "exposure_pct", label: "주식 노출", render: function (row) { return formatPercent(row.exposure_pct, 1); } },
                ],
              })
            )
          : EmptyState({ message: "최근 스냅샷 설명이 아직 없다.", compact: true })
      ),
      currentCapture && ensureArray(currentCapture.rows).length
        ? h(
            "div",
            { className: "capture-hidden-stage" },
            h(
              "div",
              { className: "portfolio-capture-stage", ref: captureRef },
              h("div", { className: "portfolio-capture-stage-title" }, (currentCapture.trade_date || "") + " 비중"),
              h(
                "table",
                { className: "portfolio-capture-table" },
                h("thead", null, h("tr", null,
                  h("th", null, "섹터"),
                  h("th", null, "종목"),
                  h("th", null, "이전"),
                  h("th", null, "이후"),
                  h("th", null, "비고")
                )),
                h("tbody", null,
                  ensureArray(currentCapture.rows).map(function (row, index) {
                    return h("tr", { key: "capture-" + index },
                      h("td", null, row.sector || "-"),
                      h("td", null, row.stock_name || "-"),
                      h("td", null, formatPercent(roundCaptureWeight5(row.prev_weight_pct), 0)),
                      h("td", null, formatPercent(roundCaptureWeight5(row.weight_pct), 0)),
                      h("td", null, (row.stop_loss_price ? ("손절가 : " + numberFormat(row.stop_loss_price, 0)) : "") + ((row.stop_loss_price && row.note) ? " " : "") + (row.note || ""))
                    );
                  })
                )
              )
            )
          )
        : null
    );
  }


    return PortfolioPageModern;
  }

  modules.portfolioPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
