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
    const diffDaysFromToday = deps.diffDaysFromToday;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const fetchJson = deps.fetchJson;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const loadSubscriptionRuntimeCache = deps.loadSubscriptionRuntimeCache;
    const normalizeLooseSearchText = deps.normalizeLooseSearchText;
    const normalizeSubscriptionItem = deps.normalizeSubscriptionItem;
    const numberFormat = deps.numberFormat;
    const persistSubscriptionRuntimeCache = deps.persistSubscriptionRuntimeCache;
    const SectionTitle = deps.SectionTitle;
    const SummaryCard = deps.SummaryCard;
    const todayIsoDate = deps.todayIsoDate;

  function SubscriptionListPage() {
    const runtimeCacheRef = useRef(loadSubscriptionRuntimeCache());
    const cachedRuntime = runtimeCacheRef.current || {};
    const cachedListState = cachedRuntime.list || {};
    const detailCacheRef = useRef(cachedRuntime.detailById || {});
    const briefCacheRef = useRef(cachedRuntime.briefById || {});
    const hasCachedList = ensureArray(cachedListState.items).length > 0;
    const [items, setItems] = useState(ensureArray(cachedListState.items).map(normalizeSubscriptionItem));
    const [offset, setOffset] = useState(Number(cachedListState.offset) || 0);
    const [hasMore, setHasMore] = useState(!!cachedListState.hasMore);
    const [totalCount, setTotalCount] = useState(Number(cachedListState.totalCount) || 0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [applyhomeMeta, setApplyhomeMeta] = useState(cachedListState.applyhomeMeta || null);
    const [query, setQuery] = useState(String(cachedListState.query || ""));
    const [regionFilter, setRegionFilter] = useState(String(cachedListState.regionFilter || "all"));
    const [statusFilter, setStatusFilter] = useState(String(cachedListState.statusFilter || "all"));
    const [yearFilter, setYearFilter] = useState(String(cachedListState.yearFilter || "all"));
    const [message, setMessage] = useState(String(cachedListState.message || ""));
    const [selectedId, setSelectedId] = useState(String(cachedListState.selectedId || ""));
    const [detail, setDetail] = useState(cachedListState.selectedId ? (detailCacheRef.current[cachedListState.selectedId] || null) : null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [brief, setBrief] = useState(cachedListState.selectedId ? (briefCacheRef.current[cachedListState.selectedId] || null) : null);
    const [briefLoading, setBriefLoading] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(!!cachedListState.filtersOpen);
    const [frameworkOpen, setFrameworkOpen] = useState(!!cachedListState.frameworkOpen);
    const [statsOpen, setStatsOpen] = useState(!!cachedListState.statsOpen);
    const [statsData, setStatsData] = useState(cachedRuntime.stats || null);
    const [statsLoading, setStatsLoading] = useState(false);

    useEffect(function () {
      if (!items.length) {
        loadPage(true, false);
      } else if (!message) {
        setMessage("저장된 10년치 청약 목록 캐시를 사용 중입니다. 목록은 수동 새로고침 전까지 다시 불러오지 않습니다.");
      }
    }, []);

    useEffect(function () {
      if (statsOpen && !statsData && !statsLoading) {
        loadStats(false);
      }
    }, [statsOpen, statsData, statsLoading]);

    useEffect(function () {
      persistSubscriptionRuntimeCache({
        list: {
          items: ensureArray(items).map(normalizeSubscriptionItem),
          offset: offset,
          hasMore: hasMore,
          totalCount: totalCount,
          applyhomeMeta: applyhomeMeta,
          query: query,
          regionFilter: regionFilter,
          statusFilter: statusFilter,
          yearFilter: yearFilter,
          message: message,
          selectedId: selectedId,
          filtersOpen: filtersOpen,
          frameworkOpen: frameworkOpen,
          statsOpen: statsOpen,
        },
        detailById: detailCacheRef.current,
        briefById: briefCacheRef.current,
        stats: statsData,
      });
    }, [items, offset, hasMore, totalCount, applyhomeMeta, query, regionFilter, statusFilter, yearFilter, message, selectedId, filtersOpen, frameworkOpen, statsOpen, detail, brief, statsData]);

    async function fetchSubscriptionPage(targetOffset, forceRefresh) {
      return fetchJson("/api/real-estate/subscriptions"
        + "?recent_days=3650"
        + "&offset=" + encodeURIComponent(targetOffset)
        + "&limit=200"
        + (forceRefresh ? "&force_refresh=true" : ""), {
          noCache: !!forceRefresh,
          forceRefresh: !!forceRefresh,
        });
    }

    async function loadStats(forceRefresh) {
      setStatsLoading(true);
      try {
        const payload = await fetchJson("/api/real-estate/subscription-stats?from_year=2020" + (forceRefresh ? "&force_refresh=true" : ""), {
          noCache: !!forceRefresh,
          forceRefresh: !!forceRefresh,
        });
        setStatsData(payload || null);
      } catch (error) {
        setMessage(error.message || String(error));
      } finally {
        setStatsLoading(false);
      }
    }

    async function loadPage(reset, forceRefresh) {
      if (reset && forceRefresh) {
        setStatsData(null);
      }
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const nextOffset = reset ? 0 : offset;
        let payload = await fetchSubscriptionPage(nextOffset, forceRefresh);
        setApplyhomeMeta(payload);
        if (payload && payload.configured) {
          let mergedItems = ensureArray(payload.items).map(normalizeSubscriptionItem);
          let nextCursor = nextOffset + mergedItems.length;
          let nextHasMore = !!payload.has_more;
          while (reset && nextHasMore) {
            payload = await fetchSubscriptionPage(nextCursor, false);
            const pageItems = ensureArray(payload.items).map(normalizeSubscriptionItem);
            if (!pageItems.length) {
              nextHasMore = false;
              break;
            }
            mergedItems = mergedItems.concat(pageItems);
            nextCursor += pageItems.length;
            nextHasMore = !!payload.has_more;
          }
          setItems(function (current) {
            return reset ? mergedItems : current.concat(mergedItems);
          });
          setOffset(reset ? mergedItems.length : nextCursor);
          setHasMore(false);
          setTotalCount(Number(payload.total_count) || mergedItems.length);
          if (reset && mergedItems.length && !selectedId) {
            setSelectedId(mergedItems[0].sourceId || mergedItems[0].id);
          }
          if (payload.message) {
            setMessage(payload.message);
          }
        } else if (payload) {
          setHasMore(false);
          setMessage(payload.message);
        }
      } catch (error) {
        setMessage(error.message || String(error));
      } finally {
        setLoading(false);
        setLoadingMore(false);
        if (reset && forceRefresh && statsOpen) {
          loadStats(true);
        }
      }
    }

    function phaseLabel(item) {
      const announceDate = strToDate(item.announcementDate);
      const startDate = strToDate(item.applicationStart);
      const endDate = strToDate(item.applicationEnd);
      const today = strToDate(todayIsoDate());
      if (startDate && endDate && today >= startDate && today <= endDate) {
        return "접수중";
      }
      if (startDate && today < startDate) {
        return "예정";
      }
      if (announceDate && today > announceDate && endDate && today > endDate) {
        return "과거";
      }
      return item.status || "-";
    }

    function strToDate(value) {
      if (!value) {
        return null;
      }
      const parsed = new Date(String(value).slice(0, 10) + "T00:00:00");
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function daysLabel(item) {
      const daysLeft = diffDaysFromToday(item.applicationEnd);
      if (daysLeft == null) {
        return "-";
      }
      if (daysLeft < 0) {
        return "마감 " + Math.abs(daysLeft) + "일 전";
      }
      if (daysLeft === 0) {
        return "오늘 마감";
      }
      return daysLeft + "일 남음";
    }

    function matchesFilters(item) {
      if (regionFilter !== "all" && item.region !== regionFilter) {
        return false;
      }
      if (statusFilter !== "all" && phaseLabel(item) !== statusFilter) {
        return false;
      }
      if (yearFilter !== "all") {
        const announcementYear = String(item.announcementDate || "").slice(0, 4);
        if (announcementYear !== yearFilter) {
          return false;
        }
      }
      const haystack = normalizeLooseSearchText([
        item.name,
        item.region,
        item.district,
        item.saleType,
        item.note,
        item.address,
        ensureArray(item.tags).join(" "),
      ].join(" "));
      if (query && haystack.indexOf(normalizeLooseSearchText(query)) < 0) {
        return false;
      }
      return true;
    }

    const filteredItems = ensureArray(items)
      .filter(matchesFilters)
      .sort(function (left, right) {
        return String(right.announcementDate || "").localeCompare(String(left.announcementDate || ""));
      });
    const summary = {
      total: totalCount || ensureArray(items).length,
      past: ensureArray(items).filter(function (item) { return phaseLabel(item) === "과거"; }).length,
      future: ensureArray(items).filter(function (item) { return phaseLabel(item) === "예정"; }).length,
      live: ensureArray(items).filter(function (item) { return phaseLabel(item) === "접수중"; }).length,
    };
    const availableRegions = Array.from(new Set(ensureArray(items).map(function (item) { return item.region; }).filter(Boolean)));
    const availableYears = Array.from(new Set(
      ensureArray(items)
        .map(function (item) { return String(item.announcementDate || "").slice(0, 4); })
        .filter(function (value) { return /^\d{4}$/.test(value); })
    )).sort().reverse();
    const selectedItem = filteredItems.find(function (item) { return (item.sourceId || item.id) === selectedId; })
      || ensureArray(items).find(function (item) { return (item.sourceId || item.id) === selectedId; })
      || filteredItems[0]
      || null;

    useEffect(function () {
      if (selectedItem && (selectedItem.sourceId || selectedItem.id) !== selectedId) {
        setSelectedId(selectedItem.sourceId || selectedItem.id);
      }
    }, [selectedItem && (selectedItem.sourceId || selectedItem.id)]);

    useEffect(function () {
      if (!selectedItem || !selectedItem.sourceId) {
        return;
      }
      loadDetail(selectedItem.sourceId);
      loadBrief(selectedItem.sourceId, true);
    }, [selectedItem && selectedItem.sourceId]);

    async function loadDetail(sourceId) {
      setDetail(null);
      setDetailLoading(true);
      try {
        const payload = await fetchJson("/api/real-estate/subscriptions/" + encodeURIComponent(sourceId), { noCache: true });
        detailCacheRef.current[sourceId] = payload;
        setDetail(payload);
      } catch (error) {
        setDetail({ error: error.message || String(error) });
      } finally {
        setDetailLoading(false);
      }
    }

    async function loadBrief(sourceIdOverride, forceRefresh) {
      const sourceId = sourceIdOverride || (selectedItem && selectedItem.sourceId);
      if (!sourceId) {
        return;
      }
      const cached = !forceRefresh && briefCacheRef.current[sourceId];
      if (cached) {
        setBrief(cached);
        setBriefLoading(false);
        return;
      }
      setBrief(null);
      setBriefLoading(true);
      try {
        const payload = await fetchJson("/api/real-estate/subscriptions/" + encodeURIComponent(sourceId) + "/ai-brief", {
          noCache: !!forceRefresh,
          forceRefresh: !!forceRefresh,
        });
        briefCacheRef.current[sourceId] = payload;
        setBrief(payload);
      } catch (error) {
        setBrief({ error: error.message || String(error) });
      } finally {
        setBriefLoading(false);
      }
    }

    function metricDeltaClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "flat";
      }
      return number >= 0 ? "positive" : "negative";
    }

    function specialBreakdownEntries(source) {
      const breakdown = (source && source.specialSupplyBreakdown) || {};
      return Object.keys(breakdown).map(function (label) {
        return {
          label: label,
          count: Number((breakdown[label] || {}).count) || 0,
          ratioTotal: Number((breakdown[label] || {}).ratio_total) || 0,
          ratioSpecial: Number((breakdown[label] || {}).ratio_special) || 0,
        };
      }).sort(function (left, right) {
        return right.ratioTotal - left.ratioTotal;
      });
    }

    function specialBreakdownSummary(source, limit) {
      const entries = specialBreakdownEntries(source).slice(0, limit || 3);
      if (!entries.length) {
        return source && source.specialSupplyRatio ? "특별공급 " + numberFormat(source.specialSupplyRatio, 0) + "%" : "-";
      }
      return entries.map(function (entry) {
        return entry.label + " " + numberFormat(entry.ratioTotal, 1) + "%";
      }).join(", ");
    }

    function subscriptionPriceSummary(item) {
      if (item && item.private84PriceEok) {
        return numberFormat(item.private84PriceEok, 1) + "억";
      }
      if (item && item.maxPriceEok) {
        return "최고가 " + numberFormat(item.maxPriceEok, 1) + "억";
      }
      return (item && item.priceDataStatusLabel) || "-";
    }

    function subscriptionSpecialSummary(item) {
      const summary = specialBreakdownSummary(item, 2);
      if (summary && summary !== "-") {
        return summary;
      }
      if (item && item.specialSupplyRatio) {
        return "특별공급 " + numberFormat(item.specialSupplyRatio, 1) + "%";
      }
      if (item && item.specialSupplyStatus === "special_supply_zero") {
        return "특공 없음";
      }
      return (item && item.specialSupplyStatusLabel) || "-";
    }

    function renderListRow(item) {
      const rowKey = item.sourceId || item.id;
      return h(
        "button",
        {
          key: rowKey,
          type: "button",
          className: "subscription-list-row" + (rowKey === (selectedItem && (selectedItem.sourceId || selectedItem.id)) ? " active" : ""),
          title: specialBreakdownSummary(item, 6),
          onClick: function () { setSelectedId(rowKey); },
        },
        h("span", { className: "subscription-row-date" }, item.announcementDate || "-"),
        h("span", { className: "subscription-row-region" }, [item.region, item.district].filter(Boolean).join(" · ")),
        h("span", { className: "subscription-row-name" }, item.name),
        h("span", { className: "subscription-row-price" }, subscriptionPriceSummary(item)),
        h("span", { className: "subscription-row-special" }, subscriptionSpecialSummary(item)),
        h("span", { className: "subscription-row-phase" }, phaseLabel(item)),
        h("span", { className: "subscription-row-deadline" }, daysLabel(item))
      );
    }

    const modelColumns = [
      { key: "HOUSE_TY", label: "주택형" },
      { key: "SUPLY_HSHLDCO", label: "일반", render: function (row) { return numberFormat(row.SUPLY_HSHLDCO, 0); } },
      { key: "SPSPLY_HSHLDCO", label: "특공", render: function (row) { return numberFormat(row.SPSPLY_HSHLDCO, 0); } },
      { key: "LTTOT_TOP_AMOUNT", label: "분양가", render: function (row) { return row.LTTOT_TOP_AMOUNT ? numberFormat(Number(row.LTTOT_TOP_AMOUNT) / 10000, 2) + "억" : "-"; } },
      { key: "SUPLY_AR", label: "공급면적", render: function (row) { return row.SUPLY_AR ? numberFormat(row.SUPLY_AR, 2) + "㎡" : "-"; } },
    ];

    const tradeRows = ensureArray(detail && detail.current_trade && detail.current_trade.sample_trades);
    const tradeColumns = [
      { key: "deal_date", label: "거래일" },
      { key: "apartment", label: "단지" },
      { key: "area_m2", label: "면적", render: function (row) { return numberFormat(row.area_m2, 1) + "㎡"; } },
      { key: "amount_manwon", label: "실거래가", render: function (row) { return numberFormat(Number(row.amount_manwon) / 10000, 2) + "억"; } },
      { key: "floor", label: "층" },
    ];

    const competitionSummaryColumns = [
      { key: "houseType", label: "Type" },
      { key: "local_rank1", label: "Local 1st" },
      { key: "other_rank1", label: "Etc 1st" },
      { key: "gyeonggi_rank1", label: "Metro 1st" },
      { key: "local_rank2", label: "Local 2nd" },
      { key: "other_rank2", label: "Etc 2nd" }
    ];

    const specialRequestColumns = [
      { key: "supplyName", label: "Special Type" },
      { key: "houseType", label: "Type" },
      { key: "supplyHouseholds", label: "Supply", render: function (row) { return numberFormat(row.supplyHouseholds, 0); } },
      { key: "requestCount", label: "Requests", render: function (row) { return numberFormat(row.requestCount, 0); } },
      { key: "competitionRate", label: "Rate" }
    ];

    const scoreColumns = [
      { key: "houseType", label: "Type" },
      { key: "resideName", label: "Area" },
      { key: "lowestScore", label: "Low" },
      { key: "averageScore", label: "Avg" },
      { key: "highestScore", label: "High" }
    ];

    const complexHistoryColumns = [
      { key: "changedYear", label: "Year" },
      { key: "previousName", label: "Previous Name" },
      { key: "currentName", label: "Current Name" }
    ];

    const statsRegionColumns = [
      { key: "label", label: "지역" },
      { key: "count", label: "건수", render: function (row) { return numberFormat(row.count, 0); } },
      { key: "averageGainEok", label: "평균 차익", render: function (row) { return row.averageGainEok != null ? numberFormat(row.averageGainEok, 2) + "억" : "-"; } },
      { key: "medianGainEok", label: "중앙값 차익", render: function (row) { return row.medianGainEok != null ? numberFormat(row.medianGainEok, 2) + "억" : "-"; } },
      { key: "averageGainPct", label: "평균 차익률", render: function (row) { return row.averageGainPct != null ? numberFormat(row.averageGainPct, 1) + "%" : "-"; } },
      { key: "positiveRatePct", label: "플러스 비율", render: function (row) { return row.positiveRatePct != null ? numberFormat(row.positiveRatePct, 1) + "%" : "-"; } }
    ];

    const statsPriceBandColumns = [
      { key: "label", label: "가격대" },
      { key: "count", label: "건수", render: function (row) { return numberFormat(row.count, 0); } },
      { key: "averageSubscriptionPriceEok", label: "평균 기준 분양가", render: function (row) { return row.averageSubscriptionPriceEok != null ? numberFormat(row.averageSubscriptionPriceEok, 2) + "억" : "-"; } },
      { key: "averageGainEok", label: "평균 차익", render: function (row) { return row.averageGainEok != null ? numberFormat(row.averageGainEok, 2) + "억" : "-"; } },
      { key: "medianGainEok", label: "중앙값 차익", render: function (row) { return row.medianGainEok != null ? numberFormat(row.medianGainEok, 2) + "억" : "-"; } },
      { key: "positiveRatePct", label: "플러스 비율", render: function (row) { return row.positiveRatePct != null ? numberFormat(row.positiveRatePct, 1) + "%" : "-"; } }
    ];

    const statsYearColumns = [
      { key: "label", label: "공고연도" },
      { key: "count", label: "건수", render: function (row) { return numberFormat(row.count, 0); } },
      { key: "averageGainEok", label: "평균 차익", render: function (row) { return row.averageGainEok != null ? numberFormat(row.averageGainEok, 2) + "억" : "-"; } },
      { key: "medianGainEok", label: "중앙값 차익", render: function (row) { return row.medianGainEok != null ? numberFormat(row.medianGainEok, 2) + "억" : "-"; } },
      { key: "averageGainPct", label: "평균 차익률", render: function (row) { return row.averageGainPct != null ? numberFormat(row.averageGainPct, 1) + "%" : "-"; } }
    ];

    const statsRegionPriceColumns = [
      { key: "region", label: "지역" },
      { key: "priceBandLabel", label: "가격대" },
      { key: "count", label: "건수", render: function (row) { return numberFormat(row.count, 0); } },
      { key: "averageGainEok", label: "평균 차익", render: function (row) { return row.averageGainEok != null ? numberFormat(row.averageGainEok, 2) + "억" : "-"; } },
      { key: "medianGainEok", label: "중앙값 차익", render: function (row) { return row.medianGainEok != null ? numberFormat(row.medianGainEok, 2) + "억" : "-"; } },
      { key: "positiveRatePct", label: "플러스 비율", render: function (row) { return row.positiveRatePct != null ? numberFormat(row.positiveRatePct, 1) + "%" : "-"; } }
    ];

    const statsCaseColumns = [
      { key: "announcementDate", label: "공고일" },
      { key: "region", label: "지역" },
      { key: "name", label: "단지명" },
      { key: "subscriptionPriceEok", label: "기준 분양가", render: function (row) { return row.subscriptionPriceEok != null ? numberFormat(row.subscriptionPriceEok, 2) + "억" : "-"; } },
      { key: "currentPriceEok", label: "추정 현재가", render: function (row) { return row.currentPriceEok != null ? numberFormat(row.currentPriceEok, 2) + "억" : "-"; } },
      { key: "gainEok", label: "예상 차익", render: function (row) { return row.gainEok != null ? numberFormat(row.gainEok, 2) + "억" : "-"; } },
      { key: "gainPct", label: "차익률", render: function (row) { return row.gainPct != null ? numberFormat(row.gainPct, 1) + "%" : "-"; } }
    ];

    function renderStatsPanel() {
      if (!statsOpen) {
        return null;
      }
      if (statsLoading && !statsData) {
        return h("section", { className: "panel subscription-detail-panel" }, h(LoadingBlock, { compact: true, title: "통계 집계 중", label: "2020년 이후 실거래 매칭 가능한 청약 차익 통계를 계산하고 있습니다." }));
      }
      if (!statsData || statsData.error) {
        return h("section", { className: "panel subscription-detail-panel" }, h("div", { className: "notice-box compact" }, (statsData && statsData.error) || "통계 데이터를 불러오지 못했습니다."));
      }
      const summary = statsData.summary || {};
      return h(
        "section",
        { className: "panel subscription-detail-panel" },
        h("div", { className: "section-toolbar compact" },
          h(SectionTitle, null, "예상 차익 통계"),
          h("div", { className: "section-actions" },
            h("span", { className: "summary-help" }, String(statsData.fromYear || 2020) + "년~" + String(statsData.throughDate || todayIsoDate()) + " · " + (statsData.cached ? "캐시 사용" : "방금 집계")),
            h("button", { type: "button", className: "mini-button", disabled: statsLoading, onClick: function () { loadStats(true); } }, statsLoading ? "집계 중" : "통계 새로고침")
          )
        ),
        h("div", { className: "summary-grid summary-grid-small" },
          h(SummaryCard, { label: "집계 대상", value: numberFormat(statsData.candidateCount, 0) + "건", help: "2020년 이후 수도권 청약 공고" }),
          h(SummaryCard, { label: "실거래 매칭", value: numberFormat(statsData.matchedCaseCount, 0) + "건", help: "예상 차익 계산 가능 케이스" }),
          h(SummaryCard, { label: "평균 차익", value: summary.averageGainEok != null ? numberFormat(summary.averageGainEok, 2) + "억" : "-", help: "전체 평균" }),
          h(SummaryCard, { label: "중앙값 차익", value: summary.medianGainEok != null ? numberFormat(summary.medianGainEok, 2) + "억" : "-", help: "극단값 제외 중심값" }),
          h(SummaryCard, { label: "평균 차익률", value: summary.averageGainPct != null ? numberFormat(summary.averageGainPct, 1) + "%" : "-", help: "기준 분양가 대비" }),
          h(SummaryCard, { label: "플러스 비율", value: summary.positiveRatePct != null ? numberFormat(summary.positiveRatePct, 1) + "%" : "-", help: "예상 차익 양수 비중" })
        ),
        h("div", { className: "subscription-stats-stack" },
          h("section", { className: "subscription-stats-block" }, h(SectionTitle, null, "지역별"), h(DataTable, { rows: ensureArray(statsData.regionStats), columns: statsRegionColumns, compact: true, emptyMessage: "지역 통계가 없습니다." })),
          h("section", { className: "subscription-stats-block" }, h(SectionTitle, null, "가격대별"), h(DataTable, { rows: ensureArray(statsData.priceBandStats), columns: statsPriceBandColumns, compact: true, emptyMessage: "가격대 통계가 없습니다." })),
          h("section", { className: "subscription-stats-block" }, h(SectionTitle, null, "연도별"), h(DataTable, { rows: ensureArray(statsData.yearStats), columns: statsYearColumns, compact: true, emptyMessage: "연도 통계가 없습니다." })),
          h("section", { className: "subscription-stats-block" }, h(SectionTitle, null, "지역 × 가격대"), h(DataTable, { rows: ensureArray(statsData.regionPriceBandStats), columns: statsRegionPriceColumns, compact: true, emptyMessage: "교차 통계가 없습니다." })),
          h("section", { className: "subscription-stats-block" }, h(SectionTitle, null, "상위 예상 차익"), h(DataTable, { rows: ensureArray(statsData.topPositiveCases), columns: statsCaseColumns, compact: true, emptyMessage: "상위 차익 케이스가 없습니다." })),
          h("section", { className: "subscription-stats-block" }, h(SectionTitle, null, "하위 예상 차익"), h(DataTable, { rows: ensureArray(statsData.topNegativeCases), columns: statsCaseColumns, compact: true, emptyMessage: "하위 차익 케이스가 없습니다." }))
        )
      );
    }

    function renderDetailPanel() {
      if (detailLoading) {
        return h("div", { className: "panel subscription-detail-panel" }, h(LoadingBlock, { compact: true, title: "상세 데이터 불러오는 중", label: "청약홈 상세와 최근 실거래를 분석하고 있습니다." }));
      }
      if (!selectedItem) {
        return h("div", { className: "panel subscription-detail-panel" }, h(EmptyState, { message: "왼쪽 목록에서 단지를 선택해 주세요." }));
      }
      if (detail && detail.error) {
        return h("div", { className: "panel subscription-detail-panel" }, h("div", { className: "notice-box error" }, detail.error));
      }
      const currentTrade = (detail && detail.current_trade) || {};
      const currentItem = (detail && detail.item) || selectedItem;
      const modelSummary = (detail && detail.model_summary) || {};
      const competition = (detail && detail.competition) || {};
      const specialRequestStatus = (detail && detail.special_request_status) || {};
      const winningScores = (detail && detail.winning_scores) || {};
      const complexInfo = (detail && detail.complex_info) || null;
      const complexHistory = ensureArray(detail && detail.complex_history);
      const complexAliases = ensureArray(detail && detail.complex_aliases);
      const competitionSummaryRows = ensureArray(competition.summary);
      const specialRequestRows = ensureArray(specialRequestStatus.rows);
      const scoreRows = ensureArray(winningScores.rows);
      const specialEntries = specialBreakdownEntries(currentItem);
      const subscriptionPriceBasis = currentTrade.subscription_price_basis || (currentItem.private84PriceEok ? "84㎡ 기준" : (currentItem.maxPriceEok ? "최고 분양가 기준" : "분양가 데이터 없음"));
      const subscriptionPriceValue = currentTrade.subscription_price_eok != null && Number(currentTrade.subscription_price_eok) > 0
        ? numberFormat(currentTrade.subscription_price_eok, 2) + "억"
        : (currentItem.private84PriceEok ? numberFormat(currentItem.private84PriceEok, 2) + "억" : (currentItem.maxPriceEok ? numberFormat(currentItem.maxPriceEok, 2) + "억" : "-"));
      return h(
        "div",
        { className: "subscription-detail-stack" },
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h("div", { className: "subscription-detail-head" },
            h("div", null,
              h("h2", null, currentItem.name || "-"),
              h("p", { className: "subscription-detail-subtitle" }, [currentItem.region, currentItem.district, currentItem.saleType, currentItem.announcementDate].filter(Boolean).join(" · "))
            ),
            currentItem.url ? h("a", { className: "secondary-button subscription-link-button", href: currentItem.url, target: "_blank", rel: "noreferrer" }, "청약홈 공고") : null
          ),
          h("div", { className: "subscription-detail-metrics" },
            h(SummaryCard, { label: "기준 분양가", value: subscriptionPriceValue, help: subscriptionPriceBasis }),
            h(SummaryCard, { label: "추정 현재가", value: currentTrade.ok ? numberFormat(currentTrade.latest_price_eok, 2) + "억" : "-", help: currentTrade.ok ? (currentTrade.latest_trade_date || "") : (currentTrade.message || "추정 불가") }),
            h(SummaryCard, { label: "예상 차익", value: currentTrade.ok && currentTrade.estimated_gain_eok != null ? numberFormat(currentTrade.estimated_gain_eok, 2) + "억" : "-", className: currentTrade.ok ? metricDeltaClass(currentTrade.estimated_gain_eok) : "" }),
            h(SummaryCard, { label: "차익률", value: currentTrade.ok && currentTrade.estimated_gain_pct != null ? numberFormat(currentTrade.estimated_gain_pct, 1) + "%" : "-" })
          ),
          h("div", { className: "subscription-detail-grid" },
            h("div", null, h("span", null, "접수"), h("strong", null, (currentItem.applicationStart || "-") + " ~ " + (currentItem.applicationEnd || "-"))),
            h("div", null, h("span", null, "총 세대수"), h("strong", null, numberFormat(currentItem.supplyHouseholds, 0) + "세대")),
            h("div", null, h("span", null, "특공 비중"), h("strong", null, numberFormat(modelSummary.special_ratio || currentItem.specialSupplyRatio, 1) + "%")),
            h("div", null, h("span", null, "입주 예정"), h("strong", null, currentItem.moveInMonth || "-")),
            h("div", null, h("span", null, "위치"), h("strong", null, currentItem.address || "-")),
            h("div", null, h("span", null, "상태"), h("strong", null, phaseLabel(currentItem)))
          ),
          currentItem.note ? h("div", { className: "subscription-inline-note subtle" }, currentItem.note) : null
        ),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h("div", { className: "section-toolbar compact" },
            h(SectionTitle, null, "특별공급 구성"),
            h("span", { className: "summary-help" }, currentItem.specialSupplyRatio ? "총 특별공급 " + numberFormat(currentItem.specialSupplyRatio, 1) + "%" : "")
          ),
          specialEntries.length
            ? h("div", { className: "subscription-special-grid" }, specialEntries.map(function (entry) {
                return h(
                  "div",
                  { key: entry.label, className: "subscription-special-card" },
                  h("strong", null, entry.label),
                  h("span", null, "전체의 " + numberFormat(entry.ratioTotal, 1) + "%"),
                  h("span", null, "특공 내 " + numberFormat(entry.ratioSpecial, 1) + "%"),
                  h("em", null, numberFormat(entry.count, 0) + "세대")
                );
              }))
            : h(EmptyState, { compact: true, message: "특별공급 세부 구성이 없습니다." })
        ),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h("div", { className: "section-toolbar compact" },
            h(SectionTitle, null, "생애최초 케이스 스터디"),
            h("span", { className: "summary-help" }, briefLoading ? "Gemini 분석 중" : "선택 시 자동 분석")
          ),
          currentTrade.ok
            ? h("div", { className: "subscription-case-grid" },
                h("div", { className: "subscription-case-card" },
                  h("span", null, "분양가 기준"),
                  h("strong", null, subscriptionPriceValue),
                  h("em", null, subscriptionPriceBasis)
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "최근 실거래 추정"),
                  h("strong", { className: metricDeltaClass(currentTrade.estimated_gain_eok) }, numberFormat(currentTrade.latest_price_eok, 2) + "억")
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "예상 시세차익"),
                  h("strong", { className: metricDeltaClass(currentTrade.estimated_gain_eok) }, numberFormat(currentTrade.estimated_gain_eok, 2) + "억")
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "표본 실거래"),
                  h("strong", null, numberFormat(currentTrade.matched_trade_count, 0) + "건")
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "지역 평균 시세"),
                  h("strong", { className: metricDeltaClass(currentTrade.district_average_gain_eok) }, currentTrade.district_average_price_eok != null ? numberFormat(currentTrade.district_average_price_eok, 2) + "억" : "-")
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "지역 평균 차익"),
                  h("strong", { className: metricDeltaClass(currentTrade.district_average_gain_eok) }, currentTrade.district_average_gain_eok != null ? numberFormat(currentTrade.district_average_gain_eok, 2) + "억" : "-")
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "지역 평균 차익률"),
                  h("strong", { className: metricDeltaClass(currentTrade.district_average_gain_eok) }, currentTrade.district_average_gain_pct != null ? numberFormat(currentTrade.district_average_gain_pct, 1) + "%" : "-")
                ),
                h("div", { className: "subscription-case-card" },
                  h("span", null, "지역 평균 표본"),
                  h("strong", null, numberFormat(currentTrade.district_trade_count, 0) + "건")
                )
              )
            : h("div", { className: "notice-box compact" }, currentTrade.message || "현재 시세 추정값이 없습니다."),
          brief && brief.error ? h("div", { className: "notice-box compact" }, brief.error) : null,
          brief && brief.brief
            ? h("div", { className: "subscription-ai-brief" },
                h("p", { className: "subscription-ai-summary" }, brief.brief.summary || ""),
                ensureArray(brief.brief.strengths).length ? h("div", null, h("strong", null, "강점"), h("ul", null, ensureArray(brief.brief.strengths).map(function (item, index) { return h("li", { key: "s-" + index }, item); }))) : null,
                ensureArray(brief.brief.price_gap_view).length ? h("div", null, h("strong", null, "시세차익 포인트"), h("ul", null, ensureArray(brief.brief.price_gap_view).map(function (item, index) { return h("li", { key: "p-" + index }, item); }))) : null,
                ensureArray(brief.brief.life_first_view).length ? h("div", null, h("strong", null, "생애최초 관점"), h("ul", null, ensureArray(brief.brief.life_first_view).map(function (item, index) { return h("li", { key: "l-" + index }, item); }))) : null,
                ensureArray(brief.brief.risks).length ? h("div", null, h("strong", null, "리스크"), h("ul", null, ensureArray(brief.brief.risks).map(function (item, index) { return h("li", { key: "r-" + index }, item); }))) : null
              )
            : h("div", { className: "summary-help" }, "선택한 단지의 입지, 분양가, 최근 거래를 기준으로 Gemini가 케이스 스터디 포인트를 정리합니다.")
        ),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h(SectionTitle, null, "주택형 상세"),
          h(DataTable, { rows: ensureArray(detail && detail.models), columns: modelColumns, compact: true, emptyMessage: "주택형 상세가 없습니다." })
        ),
        h(
          "section",
          { className: "panel subscription-detail-panel" },
          h(SectionTitle, null, "최근 실거래 표본"),
          h(DataTable, { rows: tradeRows, columns: tradeColumns, compact: true, emptyMessage: "실거래 표본이 없습니다." })
        )
      );
    }

    return h(
      "div",
      { className: "page subscription-page" },
      h(
        "section",
        { className: "panel hero-panel subscription-hero" },
        h("div", null,
          h("div", { className: "eyebrow" }, "Capital Area Presales"),
          h("h1", { className: "page-title" }, "아파트 청약 리스트"),
          h("p", { className: "page-copy compact-copy" }, "수도권 예정 청약과 과거 청약 사례를 한 화면에 모아 두고, 클릭한 단지의 분양가 대비 최근 실거래 차익을 케이스 스터디 중심으로 봅니다.")
        ),
        h("div", { className: "hero-actions" },
          h("span", { className: "status-pill" }, "기준일 " + todayIsoDate()),
          h("span", { className: "status-pill" }, "10년치 수도권 기준"),
          h("button", { type: "button", className: "secondary-button", disabled: loading, onClick: function () { loadPage(true, false); } }, loading ? "불러오는 중" : "목록 새로고침"),
          h("button", { type: "button", className: "secondary-button", disabled: loading, onClick: function () { loadPage(true, true); } }, "강제 새로고침")
        )
      ),
      applyhomeMeta
        ? h(
            "div",
            { className: "notice-box compact" },
            (applyhomeMeta.configured ? "청약홈 연동 완료" : "청약홈 키 필요")
            + " · "
            + (applyhomeMeta.fetched_at || "미조회")
            + (totalCount ? " · " + numberFormat(totalCount, 0) + "건" : "")
            + (hasCachedList ? " · 저장된 목록 캐시 사용 중" : "")
          )
        : null,
      h(
        "div",
        { className: "summary-grid summary-grid-small" },
        h(SummaryCard, { label: "전체 수도권", value: numberFormat(summary.total, 0) + "건", help: "청약홈 자동 수집" }),
        h(SummaryCard, { label: "과거 사례", value: numberFormat(summary.past, 0) + "건", help: "모집 종료 공고" }),
        h(SummaryCard, { label: "예정 공고", value: numberFormat(summary.future, 0) + "건", help: "향후 접수 예정" }),
        h(SummaryCard, { label: "현재 접수중", value: numberFormat(summary.live, 0) + "건", help: "오늘 기준 진행 중" })
      ),
      message ? h("div", { className: "notice-box compact" }, message) : null,
      renderStatsPanel(),
      h(
        "div",
        { className: "subscription-research-layout" },
        h(
          "div",
          { className: "subscription-list-stack" },
          h(
            "section",
            { className: "panel subscription-list-panel" },
            h("div", { className: "section-toolbar compact" },
              h(SectionTitle, null, "목록"),
              h("span", { className: "summary-help" }, hasCachedList ? "10년치 캐시 목록 우선 사용" : "기본은 무필터 전체 수도권")
            ),
            h("div", { className: "subscription-collapsible-toggle-row" },
              h("button", { type: "button", className: "mini-button", onClick: function () { setFiltersOpen(function (value) { return !value; }); } }, filtersOpen ? "필터 접기" : "필터 펼치기"),
              h("button", { type: "button", className: "mini-button", onClick: function () { setFrameworkOpen(function (value) { return !value; }); } }, frameworkOpen ? "연구 프레임 접기" : "연구 프레임 펼치기"),
              h("button", { type: "button", className: "mini-button", onClick: function () { setStatsOpen(function (value) { return !value; }); } }, statsOpen ? "통계 접기" : "통계 펼치기")
            ),
            filtersOpen
              ? h("div", { className: "subscription-filter-bar" },
                  h("label", { className: "form-field" }, h("span", null, "검색"), h("input", { value: query, placeholder: "단지명, 주소, 지역", onChange: function (event) { setQuery(event.target.value); } })),
                  h("label", { className: "form-field" }, h("span", null, "지역"), h("select", { value: regionFilter, onChange: function (event) { setRegionFilter(event.target.value); } }, [h("option", { value: "all" }, "전체")].concat(availableRegions.map(function (region) { return h("option", { key: region, value: region }, region); })))),
                  h("label", { className: "form-field" }, h("span", null, "년도"), h("select", { value: yearFilter, onChange: function (event) { setYearFilter(event.target.value); } }, [h("option", { value: "all" }, "전체")].concat(availableYears.map(function (year) { return h("option", { key: year, value: year }, year + "년"); })))),
                  h("label", { className: "form-field" }, h("span", null, "상태"), h("select", { value: statusFilter, onChange: function (event) { setStatusFilter(event.target.value); } }, [
                    h("option", { value: "all" }, "전체"),
                    h("option", { value: "예정" }, "예정"),
                    h("option", { value: "접수중" }, "접수중"),
                    h("option", { value: "과거" }, "과거"),
                  ]))
                )
              : null,
            frameworkOpen
              ? h("div", { className: "subscription-inline-note subtle" }, "이 페이지는 생애최초 청약 관점에서 분양가 상한제 지역의 과거 시세차익 사례와 향후 공고를 함께 보는 연구 화면입니다. 필터는 보조 기능이고, 기본은 전체 목록 노출입니다.")
              : null,
            h("div", { className: "subscription-list-header" },
              h("span", null, "모집공고일"),
              h("span", null, "지역"),
              h("span", null, "단지명"),
              h("span", null, "84㎡"),
              h("span", null, "특별공급"),
              h("span", null, "상태"),
              h("span", null, "일정")
            ),
            loading && !items.length
              ? h(LoadingBlock, { compact: true, title: "청약 목록 불러오는 중", label: "수도권 과거/예정 청약 데이터를 읽고 있습니다." })
              : filteredItems.length
                ? h("div", { className: "subscription-list-body" }, filteredItems.map(renderListRow))
                : h(EmptyState, { message: "조건에 맞는 청약 목록이 없습니다." }),
            loadingMore ? h("div", { className: "subscription-load-more" }, h("span", { className: "summary-help" }, "과거 청약 데이터를 이어서 정리 중입니다.")) : null
          ),
          h("div", { className: "subscription-detail-column" }, renderDetailPanel())
        )
      )
    );
  }


    return SubscriptionListPage;
  }

  modules.subscriptionListPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
