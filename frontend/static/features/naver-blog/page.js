(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};
  const PAGE_STATE_KEY = "stock-dashboard:naver-blog-page-state";

  function loadPageState() {
    try {
      const raw = global.localStorage.getItem(PAGE_STATE_KEY);
      if (!raw) {
        return { query: "", category: "all", selectedId: 0 };
      }
      const parsed = JSON.parse(raw);
      return {
        query: String((parsed && parsed.query) || ""),
        category: String((parsed && parsed.category) || "all"),
        selectedId: Number((parsed && parsed.selectedId) || 0) || 0,
      };
    } catch (error) {
      return { query: "", category: "all", selectedId: 0 };
    }
  }

  function persistPageState(payload) {
    try {
      global.localStorage.setItem(PAGE_STATE_KEY, JSON.stringify({
        query: String((payload && payload.query) || ""),
        category: String((payload && payload.category) || "all"),
        selectedId: Number((payload && payload.selectedId) || 0) || 0,
      }));
    } catch (error) {
    }
  }

  function normalizeSearchText(value) {
    return String(value || "").toLowerCase().replace(/[\s\-_·•.,:/\\()\[\]{}<>|]+/g, "");
  }

  function normalizeBlogName(value) {
    let text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.indexOf("네이버 블로그 | ") === 0) {
      text = text.slice("네이버 블로그 | ".length).trim();
    } else if (text.indexOf("NAVER Blog | ") === 0) {
      text = text.slice("NAVER Blog | ".length).trim();
    }
    return text.replace(/\s*[:|]\s*(?:네이버 블로그|NAVER Blog)\s*$/i, "").trim();
  }

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    if (!React || !deps.fetchJson || !deps.postJson) {
      throw new Error("naver-blog page dependencies are incomplete");
    }

    const h = React.createElement;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const ensureArray = deps.ensureArray;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const LoadingBlock = deps.LoadingBlock;
    const EmptyState = deps.EmptyState;
    const ui = deps.ui || {};
    const Button = ui.Button;
    const Badge = ui.Badge;

    function renderButton(variant, props, label) {
      if (Button) {
        return h(Button, Object.assign({ variant: variant }, props), label);
      }
      const element = props && props.href ? "a" : "button";
      const legacyClass = variant === "primary" ? "primary-button" : variant === "mini" ? "mini-button" : "secondary-button";
      return h(element, Object.assign({}, props, { className: [legacyClass, props && props.className].filter(Boolean).join(" ") }), label);
    }

    function renderBadge(label, tone, className) {
      return Badge
        ? h(Badge, { tone: tone || "neutral", className: className || "" }, label)
        : h("span", { className: ["status-pill", className].filter(Boolean).join(" ") }, label);
    }

    return function NaverBlogBriefPage() {
      const savedState = loadPageState();
      const [query, setQuery] = useState(savedState.query || "");
      const [category, setCategory] = useState(savedState.category || "all");
      const [selectedId, setSelectedId] = useState(savedState.selectedId || 0);
      const [items, setItems] = useState([]);
      const [status, setStatus] = useState(null);
      const [detail, setDetail] = useState(null);
      const [loading, setLoading] = useState(false);
      const [detailLoading, setDetailLoading] = useState(false);
      const [actionLoading, setActionLoading] = useState(false);
      const [message, setMessage] = useState("");
      const detailCacheRef = useRef({});

      useEffect(function () {
        persistPageState({ query: query, category: category, selectedId: selectedId });
      }, [query, category, selectedId]);

      useEffect(function () {
        loadStatus(true);
        loadPosts(true);
      }, []);

      useEffect(function () {
        if (!status || !status.login_running) {
          return;
        }
        const timer = global.setInterval(function () { loadStatus(true); }, 4000);
        return function () { global.clearInterval(timer); };
      }, [status && status.login_running]);

      const filteredItems = ensureArray(items).filter(function (item) {
        if (category !== "all" && item.category !== category) {
          return false;
        }
        if (!query) {
          return true;
        }
        const haystack = normalizeSearchText([
          item.title,
          item.blog_name,
          item.summary,
          item.content_text,
          ensureArray(item.keywords).join(" "),
        ].join(" "));
        return haystack.indexOf(normalizeSearchText(query)) >= 0;
      });

      const selectedItem = filteredItems.find(function (item) { return item.id === selectedId; })
        || ensureArray(items).find(function (item) { return item.id === selectedId; })
        || filteredItems[0]
        || null;

      useEffect(function () {
        const detailLabel = selectedItem ? (selectedItem.title || selectedItem.blog_name || "") : "";
        deps.emitWindowTitleDetail("naver-blog", detailLabel ? "블로그: " + detailLabel : "");
      }, [selectedItem && selectedItem.id, selectedItem && selectedItem.title]);

      useEffect(function () {
        if (selectedItem && selectedItem.id !== selectedId) {
          setSelectedId(selectedItem.id);
        }
      }, [selectedItem && selectedItem.id]);

      useEffect(function () {
        if (!selectedItem || !selectedItem.id) {
          setDetail(null);
          return;
        }
        const cached = detailCacheRef.current[selectedItem.id];
        if (cached) {
          setDetail(cached);
          return;
        }
        setDetailLoading(true);
        deps.fetchJson("/api/naver-blog/posts/" + encodeURIComponent(selectedItem.id), { noCache: true })
          .then(function (payload) {
            detailCacheRef.current[selectedItem.id] = payload;
            setDetail(payload);
          })
          .catch(function (error) { setDetail({ error: error.message || String(error) }); })
          .finally(function () { setDetailLoading(false); });
      }, [selectedItem && selectedItem.id]);

      function loadStatus(forceRefresh) {
        deps.fetchJson("/api/naver-blog/status", { noCache: !!forceRefresh, forceRefresh: !!forceRefresh })
          .then(function (payload) { setStatus(payload || null); })
          .catch(function (error) { setMessage(error.message || String(error)); });
      }

      function loadPosts(forceRefresh) {
        setLoading(true);
        deps.fetchJson("/api/naver-blog/posts?limit=120&recent_days=14", { noCache: !!forceRefresh, forceRefresh: !!forceRefresh })
          .then(function (payload) {
            const rows = ensureArray(payload.items);
            setItems(rows);
            if (!rows.length && payload.login_error) {
              setMessage(payload.login_error);
            }
          })
          .catch(function (error) {
            setMessage(error.message || String(error));
            setItems([]);
          })
          .finally(function () { setLoading(false); });
      }

      function startLogin() {
        setActionLoading(true);
        setMessage("");
        deps.postJson("/api/naver-blog/login/start", {})
          .then(function (payload) {
            setStatus(payload || null);
            setMessage((payload && payload.message) || "브라우저에서 네이버 로그인 후 잠시 기다려 주세요.");
          })
          .catch(function (error) { setMessage(error.message || String(error)); })
          .finally(function () { setActionLoading(false); });
      }

      function refreshFeed() {
        setActionLoading(true);
        setMessage("");
        deps.postJson("/api/naver-blog/refresh?limit=120", {})
          .then(function (payload) {
            setMessage("새 글 " + numberFormat(payload.item_count, 0) + "건을 다시 정리했습니다.");
            loadStatus(true);
            loadPosts(true);
          })
          .catch(function (error) { setMessage(error.message || String(error)); })
          .finally(function () { setActionLoading(false); });
      }

      const counts = {
        all: ensureArray(items).length,
        company: ensureArray(items).filter(function (item) { return item.category === "기업분석"; }).length,
        industry: ensureArray(items).filter(function (item) { return item.category === "산업"; }).length,
        market: ensureArray(items).filter(function (item) { return item.category === "시장"; }).length,
      };

      return h(
        "div",
        { className: "page naver-blog-page", "data-page-module": "naver-blog" },
        h(
          "section",
          { className: "panel hero-panel naver-blog-hero" },
          h("div", null,
            h("div", { className: "eyebrow" }, "NAVER Neighbor Feed"),
            h("h1", { className: "page-title" }, "네이버 블로그 브리핑"),
            h("p", { className: "page-copy compact-copy" }, "이웃새글을 불러와서 기업분석, 산업, 시장으로 분류하고 바로 읽을 수 있게 요약합니다.")
          ),
          h("div", { className: "hero-actions" },
            renderBadge(status && status.logged_in ? "로그인 연결됨" : "로그인 필요", status && status.logged_in ? "positive" : "danger"),
            status && status.last_updated_at ? renderBadge("마지막 수집 " + status.last_updated_at.replace("T", " "), "neutral") : null,
            renderButton("secondary", {
              type: "button",
              disabled: actionLoading || (status && status.login_running),
              onClick: startLogin,
            }, status && status.login_running ? "로그인 대기 중" : (status && status.logged_in ? "다시 로그인" : "브라우저 열고 로그인")),
            renderButton("primary", { type: "button", disabled: actionLoading || !(status && status.logged_in), onClick: refreshFeed }, actionLoading ? "수집 중" : "새로고침")
          )
        ),
        h("div", { className: "naver-blog-summary-bar" },
          renderBadge("최근 2주 " + numberFormat(counts.all, 0) + "건", "brand", "naver-blog-summary-chip"),
          renderBadge("기업분석 " + numberFormat(counts.company, 0) + "건", "brand", "naver-blog-summary-chip"),
          renderBadge("산업 " + numberFormat(counts.industry, 0) + "건", "brand", "naver-blog-summary-chip"),
          renderBadge("시장 " + numberFormat(counts.market, 0) + "건", "brand", "naver-blog-summary-chip")
        ),
        message ? h("div", { className: "notice-box compact" }, message) : null,
        status && status.login_running ? h("div", { className: "notice-box compact" }, status.login_message || "브라우저 로그인 완료를 기다리는 중입니다.") : null,
        status && status.logged_in && !status.login_running && !message
          ? h("div", { className: "notice-box compact" }, (status.login_message || "네이버 로그인 세션이 연결되어 있습니다.") + " 새로고침 버튼으로 최신 이웃새글을 다시 불러올 수 있습니다.")
          : null,
        !(status && status.logged_in)
          ? h("section", { className: "panel naver-blog-login-panel" },
              h(SectionTitle, null, "초기 연결"),
              h("p", { className: "summary-help" }, "한 번만 네이버 로그인 세션을 저장하면 이후에는 이 페이지에서 새로고침 버튼으로 이웃새글을 다시 불러올 수 있습니다."),
              renderButton("primary", { type: "button", disabled: actionLoading, onClick: startLogin }, "브라우저 열고 로그인")
            )
          : null,
        h("div", { className: "naver-blog-layout" },
          h("section", { className: "panel naver-blog-list-panel" },
            h("div", { className: "section-toolbar compact" },
              h(SectionTitle, null, "최신 글"),
              h("span", { className: "summary-help" }, loading ? "목록 불러오는 중" : numberFormat(filteredItems.length, 0) + "건")
            ),
            h("div", { className: "naver-blog-filter-bar" },
              h("label", { className: "form-field" }, h("span", null, "검색"), h("input", { value: query, placeholder: "제목, 블로그명, 키워드", onChange: function (event) { setQuery(event.target.value); } })),
              h("label", { className: "form-field" }, h("span", null, "카테고리"), h("select", { value: category, onChange: function (event) { setCategory(event.target.value); } }, [
                h("option", { key: "all", value: "all" }, "전체"),
                h("option", { key: "company", value: "기업분석" }, "기업분석"),
                h("option", { key: "industry", value: "산업" }, "산업"),
                h("option", { key: "market", value: "시장" }, "시장"),
              ]))
            ),
            loading
              ? h(LoadingBlock, { compact: true, title: "이웃새글 목록 정리 중", label: "저장된 최신 글을 읽고 있습니다." })
              : filteredItems.length
                ? h("div", { className: "naver-blog-list" }, filteredItems.map(function (item) {
                    return h("button", {
                      key: item.id,
                      type: "button",
                      className: "naver-blog-row" + (selectedItem && item.id === selectedItem.id ? " active" : ""),
                      onClick: function () { setSelectedId(item.id); },
                    },
                    h("div", { className: "naver-blog-row-head" },
                      h("span", { className: "naver-blog-row-category" }, item.category || "시장"),
                      h("span", { className: "naver-blog-row-date" }, item.published_text || item.updated_at || "")
                    ),
                    h("strong", { className: "naver-blog-row-title" }, item.title || "-"),
                    h("div", { className: "naver-blog-row-blog" }, normalizeBlogName(item.blog_name) || "블로그명 없음"),
                    h("div", { className: "naver-blog-row-meta" }, ensureArray(item.keywords).slice(0, 3).join(" · ")),
                    h("p", { className: "naver-blog-row-summary" }, item.summary || item.feed_snippet || ""));
                  }))
                : h(EmptyState, { message: status && status.logged_in ? "조건에 맞는 글이 없습니다." : "로그인 연결 후 새로고침을 눌러 첫 수집을 진행해 주세요." })
          ),
          h("section", { className: "panel naver-blog-detail-panel" },
            !selectedItem
              ? h(EmptyState, { message: "왼쪽 목록에서 글을 선택해 주세요." })
              : detailLoading
                ? h(LoadingBlock, { compact: true, title: "본문 정리 중", label: "선택한 글의 상세 내용을 불러오는 중입니다." })
                : detail && detail.error
                  ? h("div", { className: "notice-box error" }, detail.error)
                  : h(React.Fragment, null,
                      h("div", { className: "naver-blog-detail-head" },
                        h("div", null,
                          h("div", { className: "eyebrow" }, (detail && detail.category) || selectedItem.category || "시장"),
                          h("h2", null, (detail && detail.title) || selectedItem.title || "-"),
                          h("p", { className: "naver-blog-detail-meta" }, [
                            normalizeBlogName((detail && detail.blog_name) || selectedItem.blog_name),
                            detail && detail.published_text,
                          ].filter(Boolean).join(" · "))
                        ),
                        renderButton("secondary", { as: "a", iconAfter: "external", href: (detail && detail.url) || selectedItem.url, target: "_blank", rel: "noreferrer" }, "원문 열기")
                      ),
                      h("div", { className: "naver-blog-detail-summary" },
                        h("strong", null, "요약"),
                        h("p", null, (detail && detail.summary) || selectedItem.summary || selectedItem.feed_snippet || "")
                      ),
                      ensureArray((detail && detail.keywords) || selectedItem.keywords).length
                        ? h("div", { className: "naver-blog-keywords" }, ensureArray((detail && detail.keywords) || selectedItem.keywords).map(function (keyword) {
                            return h("span", { key: keyword, className: "naver-blog-keyword" }, keyword);
                          }))
                        : null,
                      h("div", { className: "naver-blog-detail-body" }, (detail && detail.content_text) || selectedItem.content_text || selectedItem.feed_snippet || "본문이 비어 있습니다.")
                    )
          )
        )
      );
    };
  }

  modules.naverBlogPage = {
    createPage: createPage,
    loadPageState: loadPageState,
    persistPageState: persistPageState,
  };
  global.StockAppModules = modules;
})(window);
