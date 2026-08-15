(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useState = React.useState;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const RealEstatePriceChart = deps.RealEstatePriceChart;
    const useFetchJson = deps.useFetchJson;

  function RealEstatePricePage() {
    const request = useFetchJson("/api/real-estate/prices");
    const data = request.data || {};
    const maps = ensureArray(data.maps);
    const allRegions = maps.reduce(function (items, mapInfo) {
      return items.concat(ensureArray(mapInfo.regions).map(function (region) {
        return Object.assign({ mapTitle: mapInfo.title }, region);
      }));
    }, []);
    const [selectedKey, setSelectedKey] = useState("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [tradePayload, setTradePayload] = useState(null);
    const [tradeLoading, setTradeLoading] = useState(false);
    const [tradeMessage, setTradeMessage] = useState("");
    const [housingType, setHousingType] = useState("apartment");
    const [selectedDong, setSelectedDong] = useState("");
    const selectedRegion = allRegions.find(function (region) { return region.key === selectedKey; }) || allRegions[0] || null;

    useEffect(function () {
      if (!selectedKey && allRegions.length) {
        setSelectedKey(allRegions[0].key);
      }
    }, [selectedKey, allRegions.length]);

    useEffect(function () {
      let cancelled = false;
      async function loadTradeDetail() {
        if (!popupOpen || !selectedRegion) {
          return;
        }
        setTradeLoading(true);
        setTradeMessage("");
        try {
          const payload = await fetchJson(
            "/api/real-estate/trade-detail?region_name=" +
              encodeURIComponent(selectedRegion.name || "") +
              "&full_name=" +
              encodeURIComponent(selectedRegion.full_name || selectedRegion.name || "")
          );
          if (!cancelled) {
            setTradePayload(payload);
            setTradeMessage(payload.message || "");
            const types = ensureArray(payload.housing_types);
            if (types.length && !types.some(function (item) { return item.key === housingType; })) {
              setHousingType(types[0].key);
            }
          }
        } catch (err) {
          if (!cancelled) {
            setTradePayload(null);
            setTradeMessage(err.message || String(err));
          }
        } finally {
          if (!cancelled) {
            setTradeLoading(false);
          }
        }
      }
      loadTradeDetail();
      return function () {
        cancelled = true;
      };
    }, [popupOpen, selectedRegion && selectedRegion.key]);

    function metricClass(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || Math.abs(number) < 0.01) {
        return "flat";
      }
      return number > 0 ? "positive" : "negative";
    }

    function openRegion(region) {
      setSelectedKey(region.key);
      setPopupOpen(true);
      setTradePayload(null);
      setTradeMessage("");
      setHousingType("apartment");
      setSelectedDong("");
    }

    function renderPreview(region) {
      return h(
        "button",
        {
          key: region.key,
          type: "button",
          className: "price-region-row" + (selectedRegion && selectedRegion.key === region.key ? " selected" : ""),
          onClick: function () { openRegion(region); },
        },
        h("span", { className: "region-name" }, region.name),
        h("span", { className: metricClass(region.wow_pct) }, "WoW " + formatPercent(region.wow_pct, 2)),
        h("span", { className: metricClass(region.yoy_pct) }, "YoY " + formatPercent(region.yoy_pct, 2))
      );
    }

    function renderMap(mapInfo) {
      const regions = ensureArray(mapInfo.regions);
      return h(
        "section",
        { key: mapInfo.key, className: "panel price-map-card" },
        h(
          "div",
          { className: "price-map-head" },
          h("div", null, h("h3", null, mapInfo.title), h("p", null, mapInfo.subtitle || "")),
          h("span", { className: "price-map-count" }, regions.length + "개 지역")
        ),
        h(
          "div",
          { className: "price-map-canvas " + mapInfo.key },
          h("div", { className: "price-map-shape", "aria-hidden": "true" }),
          h(
            "div",
            { className: "price-map-bg-labels", "aria-hidden": "true" },
            mapInfo.key === "national"
              ? [
                  h("span", { className: "label-north" }, "수도권"),
                  h("span", { className: "label-east" }, "강원·경북"),
                  h("span", { className: "label-south" }, "영남"),
                  h("span", { className: "label-west" }, "호남·충청"),
                  h("span", { className: "label-jeju" }, "제주")
                ]
              : mapInfo.key === "seoul"
                ? [
                    h("span", { className: "label-north" }, "\ubd81\ubd80"),
                    h("span", { className: "label-east" }, "\ub3d9\ubd80"),
                    h("span", { className: "label-south" }, "\ub0a8\ubd80"),
                    h("span", { className: "label-west" }, "서부")
                  ]
                : [
                    h("span", { className: "label-north" }, "\ubd81\ubd80"),
                    h("span", { className: "label-east" }, "\ub3d9\ubd80"),
                    h("span", { className: "label-south" }, "\ub0a8\ubd80"),
                    h("span", { className: "label-west" }, "서부")
                  ]
          ),
          regions.map(function (region) {
            return h(
              "button",
              {
                key: region.key,
                type: "button",
                className: "price-region-marker " + metricClass(region.yoy_pct) + (selectedRegion && selectedRegion.key === region.key ? " selected" : ""),
                style: { left: region.x + "%", top: region.y + "%" },
                title: region.name + " WoW " + formatPercent(region.wow_pct, 2) + " / YoY " + formatPercent(region.yoy_pct, 2),
                onClick: function () { openRegion(region); },
              },
              h("strong", null, region.name),
              h("small", null, formatPercent(region.yoy_pct, 1))
            );
          })
        ),
        h("div", { className: "price-region-preview" }, regions.map(renderPreview))
      );
    }

    function renderLeaderValue(item) {
      return h(
        React.Fragment,
        null,
        h("strong", { className: metricClass(item.change_pct) }, item.change_pct == null ? "-" : formatPercent(item.change_pct, 2)),
        h("span", null, "최근 " + numberFormat(item.recent_price_per_m2, 1) + "만/㎡"),
        h("span", null, "거래 " + numberFormat(item.recent_count, 0) + "건")
      );
    }

    function openNaverRealEstateComplex(item) {
      const query = [
        selectedRegion && selectedRegion.name,
        item.dong,
        item.apartment,
      ].filter(Boolean).join(" ");
      window.open("https://fin.land.naver.com/map?keyword=" + encodeURIComponent(query) + "&search-expanded=true&zoom=15", "_blank", "noopener,noreferrer");
    }

    function renderTradeDetail() {
      const payload = tradePayload || {};
      const types = ensureArray(payload.housing_types);
      const activeType = types.find(function (item) { return item.key === housingType; }) || types[0] || {};
      const dongRows = ensureArray(activeType.dong_leaders);
      const allApartmentRows = ensureArray(activeType.apartment_leaders);
      const apartmentRows = selectedDong
        ? allApartmentRows.filter(function (item) { return item.dong === selectedDong; })
        : allApartmentRows;
      if (tradeLoading && !tradePayload) {
        return h(LoadingBlock, { compact: true, title: "실거래 상세 조회 중", label: "국토부 실거래가를 동·단지별로 정리하고 있습니다." });
      }
      return h(
        "div",
        { className: "real-estate-trade-detail" },
        h(
          "div",
          { className: "housing-type-tabs" },
          (types.length ? types : [{ key: "apartment", label: "아파트" }, { key: "villa", label: "빌라·연립" }]).map(function (item) {
            return h(
              "button",
              {
                key: item.key,
                type: "button",
                className: "housing-type-tab" + (housingType === item.key ? " active" : ""),
                onClick: function () { setHousingType(item.key); },
              },
              item.label
            );
          })
        ),
        tradeMessage ? h("div", { className: "inline-help compact" }, tradeMessage) : null,
        activeType.message ? h("div", { className: "notice-box compact" }, activeType.message) : null,
        h(
          "div",
          { className: "real-estate-drilldown-grid" },
          h(
            "section",
            { className: "real-estate-drilldown-card" },
            h("h3", null, "동별 상승률"),
            dongRows.length
              ? h("div", { className: "real-estate-leader-list" },
                  dongRows.slice(0, 20).map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: item.dong + index,
                        type: "button",
                        className: "real-estate-leader-row" + (selectedDong === item.dong ? " active" : ""),
                        title: item.dong + "을 주도한 단지는 오른쪽 목록에서 확인할 수 있습니다.",
                        onClick: function () { setSelectedDong(selectedDong === item.dong ? "" : item.dong); },
                      },
                      h("span", { className: "rank" }, index + 1),
                      h("span", { className: "name" }, item.dong),
                      h("span", { className: "leader-metrics" }, renderLeaderValue(item))
                    );
                  })
                )
              : h(EmptyState, { message: "표시할 동 단위 실거래 비교 데이터가 없습니다." })
          ),
          h(
            "section",
            { className: "real-estate-drilldown-card" },
            h(
              "div",
              { className: "real-estate-drilldown-title" },
              h("h3", null, selectedDong ? selectedDong + " 상승 주도 단지" : "상승 주도 단지"),
              selectedDong
                ? h("button", { type: "button", className: "mini-button compact", onClick: function () { setSelectedDong(""); } }, "전체")
                : null
            ),
            apartmentRows.length
              ? h("div", { className: "real-estate-leader-list" },
                  apartmentRows.slice(0, 30).map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: item.dong + item.apartment + index,
                        type: "button",
                        className: "real-estate-leader-row apartment clickable",
                        title: "네이버 부동산에서 " + item.apartment + " 검색",
                        onClick: function () { openNaverRealEstateComplex(item); },
                      },
                      h("span", { className: "rank" }, index + 1),
                      h("span", { className: "name" }, item.apartment, h("small", null, item.dong || "")),
                      h("span", { className: "leader-metrics" }, renderLeaderValue(item))
                    );
                  })
                )
              : h(EmptyState, { message: "표시할 단지별 비교 데이터가 없습니다." })
          )
        )
      );
    }

    function renderPricePopup() {
      if (!popupOpen || !selectedRegion) {
        return null;
      }
      const children = ensureArray(selectedRegion.children);
      return h(
        "div",
        {
          className: "modal-backdrop real-estate-price-backdrop",
          onMouseDown: function (event) {
            if (event.target === event.currentTarget) {
              setPopupOpen(false);
            }
          },
        },
        h(
          "div",
          { className: "modal-panel real-estate-price-modal", onMouseDown: function (event) { event.stopPropagation(); } },
          h(
            "div",
            { className: "modal-header real-estate-price-modal-head" },
            h("div", null, h("h2", null, selectedRegion.mapTitle + " · " + selectedRegion.name), h("p", null, selectedRegion.full_name || "최근 2년 주택가격지수")),
            h(
              "button",
              { type: "button", className: "real-estate-modal-close", "aria-label": "닫기", onClick: function () { setPopupOpen(false); } },
              "↻"
            )
          ),
          h(
            "div",
            { className: "price-chart-metrics modal-metrics" },
            h("span", { className: metricClass(selectedRegion.wow_pct) }, "WoW " + formatPercent(selectedRegion.wow_pct, 2)),
            h("span", { className: metricClass(selectedRegion.yoy_pct) }, "YoY " + formatPercent(selectedRegion.yoy_pct, 2)),
            h("span", null, "지수 " + numberFormat(selectedRegion.latest_index, 2))
          ),
          h(RealEstatePriceChart, { key: selectedRegion.key, region: selectedRegion }),
          children.length
            ? h(
                "section",
                { className: "real-estate-child-card" },
                h("h3", null, "하위 지역 상승률"),
                h("div", { className: "real-estate-child-list" },
                  children.slice(0, 36).map(function (item, index) {
                    return h(
                      "div",
                      { key: item.key || item.name + index, className: "real-estate-child-row" },
                      h("span", null, item.name),
                      h("strong", { className: metricClass(item.yoy_pct) }, "YoY " + formatPercent(item.yoy_pct, 2)),
                      h("em", null, "WoW " + formatPercent(item.wow_pct, 2))
                    );
                  })
                )
              )
            : null,
          renderTradeDetail()
        )
      );
    }

    if (request.loading && !maps.length) {
      return h(LoadingPanel, { label: request.label });
    }
    if (request.error) {
      return h(ErrorPanel, { title: "부동산 가격 데이터를 불러오지 못했습니다.", message: request.error, onRetry: request.reload });
    }

    return h(
      "div",
      { className: "page real-estate-price-page" },
      h(
        "section",
        { className: "panel hero-panel real-estate-price-hero" },
        h("div", null, h("h1", null, "부동산 가격"), h("p", null, "전국, 서울, 경기도 지역별 주택가격지수 변화를 지도와 차트로 확인합니다.")),
        h(
          "div",
          { className: "hero-actions" },
          h("span", { className: "status-pill" }, data.as_of || "-"),
          h("span", { className: "status-pill" }, data.source || "주택가격지수")
        )
      ),
      data.note ? h("div", { className: "inline-help real-estate-price-note" }, data.note) : null,
      h(
        "div",
        { className: "real-estate-price-layout" },
        h("div", { className: "price-map-grid" }, maps.map(renderMap))
      ),
      renderPricePopup()
    );
  }


    return RealEstatePricePage;
  }

  modules.realEstatePricesPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
