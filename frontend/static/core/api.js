(function (global) {
  "use strict";

  const { useEffect, useRef, useState } = React;
  const ACTIVE_API_REQUESTS = {};
  const API_GET_CACHE = {};
  let API_REQUEST_SEQ = 0;

  function isCacheableJsonRequest(url, options) {
    const method = String((options && options.method) || "GET").toUpperCase();
    if (method !== "GET" || (options && (options.noCache || options.forceRefresh))) {
      return false;
    }
    if (typeof url !== "string" || url.indexOf("/api/") !== 0) {
      return false;
    }
    if (url.indexOf("/api/telegram/search_jobs/") === 0) return false;
    if (url.indexOf("/api/telegram/earnings_search_jobs/") === 0) return false;
    if (url.indexOf("/api/market-calendar") === 0) return false;
    if (url.indexOf("/api/strategy/backtest") === 0) return false;
    return true;
  }

  function getCachedJson(url) {
    const entry = API_GET_CACHE[url];
    return entry && Object.prototype.hasOwnProperty.call(entry, "data") ? entry.data : null;
  }

  function apiRequestLabel(url, options) {
    const method = String((options && options.method) || "GET").toUpperCase();
    const text = String(url || "");
    if (text.indexOf("/api/portfolio/performance") === 0) return "포트폴리오 수익 데이터";
    if (text.indexOf("/api/app-config") === 0) return "앱 실행 모드";
    if (text.indexOf("/api/portfolio/export") === 0) return "포트폴리오 수익 엑셀";
    if (text.indexOf("/api/strategy/backtest") === 0) return "전략 백테스트 데이터";
    if (text.indexOf("/api/strategy/sector-rotation") === 0) return "섹터 로테이션 백테스트";
    if (text.indexOf("/api/strategy/advanced-sector") === 0) return "고급 섹터 신호 백테스트";
    if (text.indexOf("/api/strategy/portfolio-diagnostic") === 0) return "현재 방식 진단";
    if (text.indexOf("/api/market-calendar") === 0) return "증시 일정";
    if (text.indexOf("/api/themes/today") === 0) return "오늘의 주도주 SQL 데이터";
    if (text.indexOf("/api/chart-game/session") === 0) return "차트 게임 세션";
    if (text.indexOf("/api/us-themes/today") === 0) return "미국 주도주 SQL 데이터";
    if (text.indexOf("/api/asia-themes/today") === 0) return "아시아 주도주 SQL 데이터";
    if (text.indexOf("/api/themes/reload") === 0) return "국내 주도주 데이터 새로고침";
    if (text.indexOf("/api/us-themes/reload") === 0) return "미국 주도주 데이터 새로고침";
    if (text.indexOf("/api/asia-themes/reload") === 0) return "아시아 주도주 데이터 새로고침";
    if (text.indexOf("/api/themes/build-today-data") === 0) return "오늘의 주도주 오늘자 데이터 생성";
    if (text.indexOf("/api/us-themes/build-today-data") === 0) return "미국 주도주 오늘자 데이터 생성";
    if (text.indexOf("/api/asia-themes/build-today-data") === 0) return "아시아 주도주 오늘자 데이터 생성";
    if (text.indexOf("/api/themes/build-today-excel") === 0) return "오늘의 주도주 오늘자 데이터 생성";
    if (text.indexOf("/api/themes/test-excel") === 0) return "주도주 테스트 데이터 점검";
    if (text.indexOf("/api/themes/note") === 0) return "주도주 비고 저장";
    if (text.indexOf("/api/themes/score-history") === 0) return "종목 점수 변동 추이";
    if (text.indexOf("/api/themes/sector-market-cap-chart") === 0) return "섹터 시가총액 차트";
    if (text.indexOf("/api/dart/today") === 0) return "오늘 공시 정리";
    if (text.indexOf("/api/sector-db") === 0) return method === "GET" ? "섹터 데이터베이스" : "섹터 데이터 저장";
    if (text.indexOf("/api/theme-sector-calendar") === 0) return "날짜별 주도 섹터 흐름";
    if (text.indexOf("/api/us-theme-sector-calendar") === 0) return "날짜별 미국 주도 섹터 흐름";
    if (text.indexOf("/api/asia-theme-sector-calendar") === 0) return "날짜별 아시아 주도 섹터 흐름";
    if (text.indexOf("/api/sector-snapshot/preview") === 0) return "섹터 비교 미리보기";
    if (text.indexOf("/api/sector-snapshot/market-ytd") === 0) return "시장 전체 YTD 순위";
    if (text.indexOf("/api/sector-snapshot/entry-signals") === 0) return "섹터 진입 신호";
    if (text.indexOf("/api/sector-snapshot/signal-radar") === 0) return "편입/편출 시그널 레이더";
    if (text.indexOf("/api/sector-snapshot/export") === 0) return "섹터 비교 엑셀";
    if (text.indexOf("/api/global-stocks/search") === 0) return "해외기업 자동완성";
    if (text.indexOf("/api/global-stocks/detail") === 0) return "해외기업 실적 데이터";
    if (text.indexOf("/api/global-stocks/earnings-call") === 0) return "해외기업 최근 실적/컨콜";
    if (text.indexOf("/api/global-stocks/ai-brief") === 0) return "AI 기업 브리프 생성";
    if (text.indexOf("/api/global-indices") === 0) return "지수/가격동향 데이터";
    if (text.indexOf("/api/sector-watch-board") === 0) return "관심종목 보드";
    if (text.indexOf("/api/news/search") === 0) return "뉴스 검색";
    if (text.indexOf("/api/telegram/status") === 0) return "텔레그램 계정/방 목록";
    if (text.indexOf("/api/telegram/ui_state") === 0) return "텔레그램 검색 상태";
    if (text.indexOf("/api/telegram/search_jobs") === 0) return "텔레그램 메시지 검색";
    if (text.indexOf("/api/telegram/market_earnings") === 0) return "시총 2000억 이상 실적 공시";
    if (text.indexOf("/api/telegram/earnings_search") === 0) return "텔레그램 공시 유형 검색";
    if (text.indexOf("/api/kind/business-segments") === 0) return "KIND 사업부문 분석";
    if (text.indexOf("/api/stocks/autocomplete") === 0) return "종목 자동완성";
    if (text.indexOf("/api/stocks/investor-flows") === 0) return "종목 수급 데이터";
    if (text.indexOf("/api/trade/import-export") === 0) return "수출입 데이터";
    if (text.indexOf("/api/dram/prices") === 0) return "DRAM 가격 동향";
    if (text.indexOf("/api/ssd/prices") === 0) return "SSD 가격 동향";
    if (text.indexOf("/api/tourism/inbound-visitors") === 0) return "인바운드 관광객 통계";
    if (text.indexOf("/api/economy/cycle-clock") === 0) return "경기순환시계 데이터";
    if (text.indexOf("/api/naver-blog/status") === 0) return "네이버 블로그 세션 상태";
    if (text.indexOf("/api/naver-blog/login/start") === 0) return "네이버 블로그 로그인 시작";
    if (text.indexOf("/api/naver-blog/refresh") === 0) return "네이버 블로그 새글 수집";
    if (text.indexOf("/api/naver-blog/posts/") === 0) return "네이버 블로그 글 상세";
    if (text.indexOf("/api/naver-blog/posts") === 0) return "네이버 블로그 글 목록";
    if (text.indexOf("/api/real-estate/prices") === 0) return "부동산 가격 지수";
    if (text.indexOf("/api/real-estate/building") === 0) return "건물 관리";
    if (text.indexOf("/api/tradingview/open") === 0) return "TradingView 실행";
    return method === "GET" ? "데이터 요청" : "작업 요청";
  }

  function startApiRequest(url, options) {
    if (typeof url !== "string" || url.indexOf("/api/") !== 0) {
      return "";
    }
    const id = "api-" + (++API_REQUEST_SEQ);
    ACTIVE_API_REQUESTS[id] = {
      id: id,
      url: url,
      label: apiRequestLabel(url, options),
      startedAt: Date.now(),
    };
    window.dispatchEvent(new CustomEvent("stock-api-loading-change"));
    return id;
  }

  function finishApiRequest(id) {
    if (!id || !ACTIVE_API_REQUESTS[id]) {
      return;
    }
    delete ACTIVE_API_REQUESTS[id];
    window.dispatchEvent(new CustomEvent("stock-api-loading-change"));
  }

  async function fetchJson(url, options) {
    const requestOptions = Object.assign({}, options || {});
    delete requestOptions.noCache;
    delete requestOptions.forceRefresh;
    const useCache = isCacheableJsonRequest(url, options);
    if (useCache) {
      const entry = API_GET_CACHE[url];
      if (entry && Object.prototype.hasOwnProperty.call(entry, "data")) return entry.data;
      if (entry && entry.promise) return entry.promise;
    }
    const requestId = startApiRequest(url, options);
    const requestPromise = fetch(url, requestOptions).then(async function (response) {
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.error || payload.detail || "Request failed.");
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      if (useCache) {
        API_GET_CACHE[url] = { data: payload, loadedAt: Date.now() };
      }
      return payload;
    }).catch(function (err) {
      if (useCache && API_GET_CACHE[url] && API_GET_CACHE[url].promise) {
        delete API_GET_CACHE[url];
      }
      throw err;
    }).finally(function () {
      finishApiRequest(requestId);
    });
    if (useCache) {
      API_GET_CACHE[url] = { promise: requestPromise, loadedAt: Date.now() };
    }
    return requestPromise;
  }

  function getActiveApiRequests() {
    return Object.keys(ACTIVE_API_REQUESTS)
      .map(function (key) { return ACTIVE_API_REQUESTS[key]; })
      .sort(function (a, b) { return a.startedAt - b.startedAt; });
  }

  function prefetchJson(url) {
    if (getCachedJson(url) || (API_GET_CACHE[url] && API_GET_CACHE[url].promise)) {
      return;
    }
    fetchJson(url).catch(function () {});
  }

  function invalidateApiCache(match) {
    Object.keys(API_GET_CACHE).forEach(function (key) {
      if (typeof match === "function" ? match(key) : key.indexOf(match) === 0) {
        delete API_GET_CACHE[key];
      }
    });
  }

  async function postJson(url, body) {
    const payload = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (url.indexOf("/api/sector-db") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/sector-db") === 0 || key.indexOf("/api/theme-sector-calendar") === 0 || key.indexOf("/api/sector-watch-board") === 0;
      });
    } else if (url.indexOf("/api/sector-watch-board/order") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/sector-watch-board") === 0 || key.indexOf("/api/sector-db") === 0;
      });
    } else if (url.indexOf("/api/themes/reload") === 0 || url.indexOf("/api/themes/build-today-data") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/themes/") === 0 || key.indexOf("/api/dart/") === 0 || key.indexOf("/api/theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/us-themes/") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/us-themes/") === 0 || key.indexOf("/api/us-theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/asia-themes/") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/asia-themes/") === 0 || key.indexOf("/api/asia-theme-sector-calendar") === 0;
      });
    } else if (url.indexOf("/api/themes/note") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/themes/") === 0;
      });
    } else if (url.indexOf("/api/telegram/send_code") === 0 || url.indexOf("/api/telegram/verify_code") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/telegram/status") === 0;
      });
    } else if (url.indexOf("/api/naver-blog/") === 0) {
      invalidateApiCache(function (key) {
        return key.indexOf("/api/naver-blog/") === 0;
      });
    }
    return payload;
  }

  function makeId(prefix) {
    return (prefix || "id") + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function postDownload(url, body, fallbackName) {
    const requestId = startApiRequest(url, { method: "POST" });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || payload.detail || "Download failed.");
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      anchor.href = objectUrl;
      anchor.download = match ? match[1] : (fallbackName || "export.xlsx");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } finally {
      finishApiRequest(requestId);
    }
  }

  function useFetchJson(url, options) {
    const enabled = !(options && options.enabled === false) && !!url;
    const refreshOnMount = !!(options && options.refreshOnMount);
    const cachedData = enabled && !refreshOnMount ? getCachedJson(url) : null;
    const [data, setData] = useState(cachedData);
    const [loading, setLoading] = useState(enabled && !cachedData);
    const [error, setError] = useState("");
    const requestSeqRef = useRef(0);

    const refresh = async function (forceRefresh) {
      if (!enabled) {
        setLoading(false);
        setError("");
        return null;
      }
      const shouldForceRefresh = forceRefresh !== false;
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      const cached = shouldForceRefresh ? null : getCachedJson(url);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError("");
        return cached;
      }
      setLoading(true);
      setError("");
      try {
        const payload = await fetchJson(url, shouldForceRefresh ? { forceRefresh: true } : undefined);
        if (requestSeqRef.current === requestSeq) {
          setData(payload);
        }
        return payload;
      } catch (err) {
        if (requestSeqRef.current === requestSeq) {
          setError(err.message || String(err));
        }
        return null;
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setLoading(false);
        }
      }
    };

    useEffect(function () {
      if (!enabled) {
        setLoading(false);
        setError("");
        return;
      }
      refresh(refreshOnMount);
    }, [url, enabled, refreshOnMount]);

    return { data, loading, error, refresh, label: apiRequestLabel(url) };
  }

  global.StockAppApi = {
    getCachedJson,
    fetchJson,
    apiRequestLabel,
    startApiRequest,
    finishApiRequest,
    getActiveApiRequests,
    prefetchJson,
    invalidateApiCache,
    postJson,
    makeId,
    postDownload,
    useFetchJson,
  };
})(window);

