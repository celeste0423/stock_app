(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useState = React.useState;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const KrxMarketMapPanel = deps.KrxMarketMapPanel;
    const LoadingPanel = deps.LoadingPanel;
    const moveArrayItem = deps.moveArrayItem;
    const numberFormat = deps.numberFormat;
    const postJson = deps.postJson;
    const SectionTitle = deps.SectionTitle;
    const StockChartPreview = deps.StockChartPreview;
    const useFetchJson = deps.useFetchJson;

  function SectorWatchBoardPage() {
    const request = useFetchJson("/api/sector-watch-board?limit_per_sector=80");
    const [selectedStock, setSelectedStock] = useState(null);
    const [chartState, setChartState] = useState({ loading: false, error: "", data: null });
    const [orderedSectors, setOrderedSectors] = useState([]);
    const [dragState, setDragState] = useState(null);
    const [savingOrder, setSavingOrder] = useState(false);
    const [refreshingPrices, setRefreshingPrices] = useState(false);

    const data = request.data || {};
    const sectors = orderedSectors.length ? orderedSectors : ensureArray(data.sectors);

    useEffect(function () {
      setOrderedSectors(ensureArray(data.sectors));
    }, [request.data]);

    useEffect(function () {
      if (!selectedStock) {
        return;
      }
      let updatedStock = null;
      ensureArray(data.sectors).some(function (sector) {
        return ensureArray(sector.stocks).some(function (stock) {
          if (stock.stock_code === selectedStock.stock_code) {
            updatedStock = stock;
            return true;
          }
          return false;
        });
      });
      if (updatedStock) {
        setSelectedStock(updatedStock);
      }
    }, [request.data]);

    useEffect(function () {
      if (selectedStock || !sectors.length) {
        return;
      }
      const firstStock = ensureArray(sectors[0].stocks)[0];
      if (firstStock) {
        setSelectedStock(firstStock);
      }
    }, [request.data]);

    useEffect(function () {
      emitWindowTitleDetail(
        "sector-watch",
        selectedStock ? selectedStock.stock_name + " " + selectedStock.stock_code : ""
      );
    }, [selectedStock]);

    useEffect(function () {
      if (!selectedStock) {
        return;
      }
      const code = String(selectedStock.stock_code || "").replace(/\D/g, "").padStart(6, "0");
      if (!code || code === "000000") {
        setChartState({ loading: false, error: "차트 데이터를 가져올 종목코드가 없습니다.", data: null });
        return;
      }
      setChartState({ loading: true, error: "", data: null });
      fetchJson("/api/stocks/chart-preview?code=" + encodeURIComponent(code) + "&months=3")
        .then(function (payload) {
          setChartState({ loading: false, error: "", data: payload });
        })
        .catch(function (error) {
          setChartState({ loading: false, error: error.message || String(error), data: null });
        });
    }, [selectedStock && selectedStock.stock_code]);

    function metricClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "flat";
      return number > 0 ? "positive" : "negative";
    }

    function moveArrayItem(items, fromIndex, toIndex) {
      const next = ensureArray(items).slice();
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length || fromIndex === toIndex) {
        return next;
      }
      const removed = next.splice(fromIndex, 1)[0];
      next.splice(toIndex, 0, removed);
      return next;
    }

    function persistOrder(nextSectors) {
      const body = {
        sectors: ensureArray(nextSectors).map(function (sector) { return sector.sector; }).filter(Boolean),
        stocks_by_sector: {},
      };
      ensureArray(nextSectors).forEach(function (sector) {
        body.stocks_by_sector[sector.sector] = ensureArray(sector.stocks).map(function (stock) { return stock.stock_code; }).filter(Boolean);
      });
      setSavingOrder(true);
      postJson("/api/sector-watch-board/order", body)
        .catch(function () {})
        .finally(function () { setSavingOrder(false); });
    }

    function reorderSectors(fromIndex, toIndex) {
      setOrderedSectors(function (current) {
        const next = moveArrayItem(current, fromIndex, toIndex);
        persistOrder(next);
        return next;
      });
    }

    function reorderStocks(sectorName, fromIndex, toIndex) {
      setOrderedSectors(function (current) {
        const next = ensureArray(current).map(function (sector) {
          if (sector.sector !== sectorName) {
            return sector;
          }
          return { ...sector, stocks: moveArrayItem(sector.stocks, fromIndex, toIndex) };
        });
        persistOrder(next);
        return next;
      });
    }

    function refreshWatchPrices() {
      if (refreshingPrices || request.loading) {
        return;
      }
      setRefreshingPrices(true);
      request.refresh(true).finally(function () {
        setRefreshingPrices(false);
      });
    }

    function formatMarketFlowAmount(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return "-";
      }
      return (number > 0 ? "+" : "") + numberFormat(number, 1);
    }

    function renderMarketInvestorFlows() {
      const payload = data.market_investor_flows || {};
      const columns = ensureArray(payload.columns);
      const markets = ensureArray(payload.markets);
      return h(
        "div",
        { className: "panel market-investor-flow-panel" },
        h(
          "div",
          { className: "market-investor-flow-head" },
          h("div", null,
            h("div", { className: "eyebrow" }, "Market Flow"),
            h("h2", null, "코스피/코스닥 주체별 순매수"),
            h("p", null, payload.as_of_date ? payload.as_of_date + " · 단위 " + (payload.unit || "억원") : "단위 " + (payload.unit || "억원"))
          ),
          h("span", null, payload.source || "한국투자증권 OpenAPI")
        ),
        payload.error
          ? h("div", { className: "notice-box compact" }, payload.error)
          : h(
              React.Fragment,
              null,
              payload.warning ? h("div", { className: "notice-box compact market-flow-warning" }, payload.warning) : null,
              h(
                "div",
                { className: "market-investor-flow-table-wrap" },
                h(
                  "table",
                  { className: "market-investor-flow-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "등락률"),
                      h("th", null, "등락률"),
                      h("th", null, "등락률"),
                      columns.map(function (column) {
                        return h("th", { key: column.key }, column.label);
                      })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    markets.map(function (market) {
                      const values = market.values || {};
                      return h(
                        "tr",
                        { key: market.market || market.name },
                        h("td", { className: "market-investor-name" }, market.name || market.market || "-"),
                        h("td", null, market.index_value == null ? "-" : numberFormat(market.index_value, 2)),
                        h("td", { className: "sector-watch-change " + metricClass(market.change_pct) }, market.change_pct == null ? "-" : formatPercent(market.change_pct, 2)),
                        columns.map(function (column) {
                          return h(
                            "td",
                            { key: column.key, className: "market-flow-number " + metricClass(values[column.key]) },
                            formatMarketFlowAmount(values[column.key])
                          );
                        })
                      );
                    }),
                    markets.length
                      ? null
                      : h("tr", null, h("td", { colSpan: columns.length + 3 }, "수급 데이터가 없습니다."))
                  )
                )
              )
            )
      );
    }

    function renderStockRow(stock, sectorName, stockIndex) {
      const selected = selectedStock && selectedStock.stock_code === stock.stock_code;
      return h(
        "button",
        {
          key: stock.stock_code,
          type: "button",
          draggable: true,
          className: "sector-watch-stock" + (selected ? " active" : "") + (dragState && dragState.type === "stock" && dragState.sector === sectorName && dragState.index === stockIndex ? " dragging" : ""),
          onClick: function () { setSelectedStock(stock); },
          onDragStart: function (event) {
            event.stopPropagation();
            setDragState({ type: "stock", sector: sectorName, index: stockIndex });
            event.dataTransfer.effectAllowed = "move";
          },
          onDragOver: function (event) {
            if (dragState && dragState.type === "stock" && dragState.sector === sectorName) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          },
          onDrop: function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (dragState && dragState.type === "stock" && dragState.sector === sectorName) {
              reorderStocks(sectorName, dragState.index, stockIndex);
            }
            setDragState(null);
          },
          onDragEnd: function () { setDragState(null); },
        },
        h("span", { className: "sector-watch-name" }, stock.stock_name || "-"),
        h("span", { className: "sector-watch-price" }, stock.current_price == null ? "-" : numberFormat(stock.current_price, 0)),
        h("span", { className: "sector-watch-change " + metricClass(stock.change_pct) }, stock.change_pct == null ? "-" : formatPercent(stock.change_pct, 2))
      );
    }

    function renderSectorBox(sector, sectorIndex) {
      const stocks = ensureArray(sector.stocks);
      return h(
        "section",
        {
          key: sector.sector,
          className: "sector-watch-box" + (dragState && dragState.type === "sector" && dragState.index === sectorIndex ? " dragging" : ""),
          draggable: true,
          onDragStart: function (event) {
            setDragState({ type: "sector", index: sectorIndex });
            event.dataTransfer.effectAllowed = "move";
          },
          onDragOver: function (event) {
            if (dragState && dragState.type === "sector") {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          },
          onDrop: function (event) {
            event.preventDefault();
            if (dragState && dragState.type === "sector") {
              reorderSectors(dragState.index, sectorIndex);
            }
            setDragState(null);
          },
          onDragEnd: function () { setDragState(null); },
        },
        h(
          "div",
          { className: "sector-watch-box-head" },
          h("strong", null, h("span", { className: "drag-handle" }, "≡"), "(관) " + sector.sector),
          h("em", { className: metricClass(sector.avg_change_pct) }, sector.avg_change_pct == null ? "-" : formatPercent(sector.avg_change_pct, 2))
        ),
        h(
          "div",
          { className: "sector-watch-table-head" },
          h("span", null, "종목"),
          h("span", null, "현재가"),
          h("span", null, "등락률")
        ),
        stocks.length
          ? h("div", { className: "sector-watch-stock-list" }, stocks.map(function (stock, index) { return renderStockRow(stock, sector.sector, index); }))
          : h("div", { className: "sector-watch-empty" }, "저장된 종목 없음"),
        h("div", { className: "sector-watch-more" }, savingOrder ? "순서 저장 중..." : numberFormat(sector.stock_count || stocks.length, 0) + "개 종목")
      );
    }

    if (request.loading && !sectors.length) {
      return LoadingPanel({ label: request.label });
    }
    if (request.error) {
      return ErrorPanel({ message: request.error });
    }
    if (!sectors.length) {
      return ErrorPanel({ message: "섹터 DB에 저장된 종목이 없습니다. 오늘의 주도주나 섹터 비교 테이블에서 섹터를 먼저 등록해주세요." });
    }

    return h(
      React.Fragment,
      null,
      h(KrxMarketMapPanel),
      renderMarketInvestorFlows(),
      h(
        "div",
        { className: "panel sector-watch-hero" },
        h(
          "div",
          { className: "sector-watch-hero-head" },
          h("div", null,
            h("div", { className: "eyebrow" }, "Watch Board"),
            h("h1", { className: "page-title" }, "관심종목 보드"),
            h("p", { className: "page-copy compact-copy" }, "섹터 DB에 저장된 종목을 섹터별 박스로 모아 현재가와 일간 등락률을 빠르게 확인합니다.")
          ),
          h(
            "button",
            {
              type: "button",
              className: "mini-button sector-watch-refresh-button",
              disabled: refreshingPrices || request.loading,
              onClick: refreshWatchPrices,
            },
            refreshingPrices || request.loading ? "가격 갱신 중..." : "현재가/등락률 새로고침"
          )
        )
      ),
      h(
        "div",
        { className: "sector-watch-layout" },
        h(
          "div",
          { className: "sector-watch-grid" },
          sectors.map(renderSectorBox)
        ),
        h(
          "div",
          { className: "panel sector-watch-detail theme-stock-chart-modal" },
          h(
            "div",
            { className: "section-toolbar" },
            h("div", null, h(SectionTitle, null, selectedStock ? selectedStock.stock_name + " 차트" : "종목 차트"), h("div", { className: "summary-help" }, data.as_of_date ? "가격 기준일 " + data.as_of_date : data.source || "")),
            selectedStock ? h("span", { className: "sector-watch-selected-code" }, selectedStock.stock_code) : null
          ),
          selectedStock
            ? h(StockChartPreview, {
                label: selectedStock.stock_name,
                loading: chartState.loading,
                error: chartState.error,
                data: chartState.data,
              })
            : h("div", { className: "notice-box compact" }, "위 섹터 박스에서 종목을 선택하면 차트가 표시됩니다.")
        )
      )
    );
  }


    return SectorWatchBoardPage;
  }

  modules.sectorWatchPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
