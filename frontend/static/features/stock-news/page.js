(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const fetchJson = deps.fetchJson;
    const h = deps.h;
    const loadStockNewsState = deps.loadStockNewsState;
    const numberFormat = deps.numberFormat;
    const persistStockNewsState = deps.persistStockNewsState;
    const SectionTitle = deps.SectionTitle;
    const selectTextOnFocus = deps.selectTextOnFocus;

  function StockNewsPage() {
    const savedState = loadStockNewsState();
    const [query, setQuery] = useState(savedState.query || "");
    const [suggestions, setSuggestions] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [selected, setSelected] = useState(savedState.selected || null);
    const [days, setDays] = useState(savedState.days || 365);
    const [payload, setPayload] = useState(savedState.payload || null);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingNews, setLoadingNews] = useState(false);
    const [message, setMessage] = useState("");
    const searchTimerRef = useRef(null);

    useEffect(function () {
      return function () {
        if (searchTimerRef.current) {
          clearTimeout(searchTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      persistStockNewsState({
        query: query,
        selected: selected,
        days: days,
        payload: payload,
      });
    }, [query, selected, days, payload]);

    useEffect(function () {
      const stock = (payload || {}).stock || selected || {};
      const detail = stock.name || query || "";
      emitWindowTitleDetail("stock-news", detail ? "뉴스: " + detail : "");
    }, [query, selected, payload]);

    function runAutocomplete(value) {
      setQuery(value);
      setSelected(null);
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
        fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()) + "&limit=10")
          .then(function (nextPayload) {
            setSuggestions(ensureArray(nextPayload.items));
            setActiveIndex(0);
          })
          .catch(function () {
            setSuggestions([]);
          })
          .finally(function () {
            setLoadingSearch(false);
          });
      }, 160);
    }

    function searchNews(target) {
      const searchText = String((target && target.name) || query || "").trim();
      if (!searchText) {
        setMessage("검색어를 입력해 주세요.");
        return;
      }
      setSuggestions([]);
      setLoadingNews(true);
      setMessage("");
      fetchJson(
        "/api/news/search?q=" + encodeURIComponent(searchText) +
          "&days=" + encodeURIComponent(days) +
          "&limit=40",
        { noCache: true }
      )
        .then(function (nextPayload) {
          setPayload(nextPayload);
          if (target) {
            setSelected(target);
            setQuery(target.name + (target.code ? " (" + target.code + ")" : ""));
          }
          if (!ensureArray(nextPayload.items).length) {
            setMessage("중요 뉴스로 분류된 결과가 없습니다. 기간을 넓히거나 다른 종목명으로 검색해 보세요.");
          }
        })
        .catch(function (err) {
          setMessage(err.message || String(err));
        })
        .finally(function () {
          setLoadingNews(false);
        });
    }

    function chooseStock(stock) {
      if (!stock) {
        return;
      }
      setSelected(stock);
      setQuery(stock.name + (stock.code ? " (" + stock.code + ")" : ""));
      searchNews(stock);
    }

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
          chooseStock(items[activeIndex || 0]);
        } else {
          searchNews(null);
        }
      } else if (event.key === "Escape") {
        setSuggestions([]);
      }
    }

    const newsItems = ensureArray((payload || {}).items);
    const stock = (payload || {}).stock || selected || {};

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel stock-news-hero" },
        h("div", { className: "eyebrow" }, "Stock News"),
        h("h1", { className: "page-title" }, "지수/가격동향"),
        h("p", { className: "page-copy compact-copy" }, "네이버 뉴스와 구글 뉴스에서 종목 관련 뉴스를 가져온 뒤 시세 단신과 중복 기사를 걷어내고 이벤트성 뉴스만 날짜순으로 보여줍니다."),
        h(
          "div",
          { className: "stock-news-search-row" },
          h(
            "div",
            { className: "global-search-wrap stock-news-search-wrap" },
            h("input", {
              className: "global-search-input",
              value: query,
              placeholder: "예: 삼성전자, HD현대에너지솔루션, 005930",
              onChange: function (event) { runAutocomplete(event.target.value); },
              onKeyDown: handleKeyDown,
              onFocus: selectTextOnFocus,
              onBlur: function () { setTimeout(function () { setSuggestions([]); }, 160); },
            }),
            loadingSearch ? h("span", { className: "global-search-status" }, "종목 찾는 중") : null,
            suggestions.length
              ? h(
                  "div",
                  { className: "autocomplete-list global-autocomplete" },
                  suggestions.map(function (item, index) {
                    return h(
                      "button",
                      {
                        key: item.code || item.name,
                        type: "button",
                        className: "autocomplete-item" + (index === activeIndex ? " active" : ""),
                        onMouseDown: function (event) {
                          event.preventDefault();
                          chooseStock(item);
                        },
                      },
                      h("strong", null, item.name),
                      h("span", null, item.code || "-"),
                      h("em", null, item.market || "")
                    );
                  })
                )
              : null
          ),
          h(
            "select",
            {
              className: "select-input stock-news-days",
              value: days,
              onChange: function (event) { setDays(Number(event.target.value)); },
            },
            h("option", { value: 30 }, "최근 1개월"),
            h("option", { value: 90 }, "최근 3개월"),
            h("option", { value: 365 }, "최근 1년"),
            h("option", { value: 1095 }, "최근 3년")
          ),
          h(
            "button",
            {
              type: "button",
              className: "primary-button",
              disabled: loadingNews,
              onClick: function () { searchNews(selected); },
            },
            loadingNews ? "검색 중" : "뉴스 검색"
          )
        ),
        message ? h("div", { className: "summary-help text-danger" }, message) : null
      ),
      payload
        ? h(
            "div",
            { className: "panel stock-news-results-panel" },
            h(
              "div",
              { className: "section-toolbar" },
              h("div", null,
                h(SectionTitle, null, (stock.name || query || "종목") + " 뉴스"),
                h("div", { className: "summary-help" },
                  "원본 " + numberFormat((payload || {}).raw_count || 0, 0) +
                    "건 중 중요/중복 필터 후 " + numberFormat(newsItems.length, 0) + "건"
                )
              ),
              stock.code ? h("span", { className: "telegram-status-pill" }, stock.code) : null
            ),
            newsItems.length
              ? h(
                  "div",
                  { className: "stock-news-list" },
                  newsItems.map(function (item, index) {
                    return h(
                      "article",
                      { key: (item.url || item.title || "") + index, className: "stock-news-card" },
                      h(
                        "div",
                        { className: "stock-news-meta" },
                        h("span", null, item.published_date || "-"),
                        h("span", null, item.source || "-"),
                        h("span", null, item.source_type || "")
                      ),
                      h(
                        "a",
                        {
                          className: "stock-news-title",
                          href: item.url || "#",
                          target: "_blank",
                          rel: "noreferrer",
                        },
                        item.title || "제목 없음"
                      ),
                      item.summary ? h("p", { className: "stock-news-summary" }, item.summary) : null,
                      ensureArray(item.reason_tags).length
                        ? h(
                            "div",
                            { className: "stock-news-tags" },
                            ensureArray(item.reason_tags).map(function (tag) {
                              return h("span", { key: tag }, tag);
                            })
                          )
                        : null
                    );
                  })
                )
              : h(EmptyState, { compact: true, message: "표시할 뉴스가 없습니다." })
          )
        : h(
            "div",
            { className: "panel stock-news-empty-panel" },
            h(EmptyState, { compact: true, message: "종목명을 입력하고 Enter 또는 뉴스 검색을 눌러 주세요." })
          )
    );
  }


    return StockNewsPage;
  }

  modules.stockNewsPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
