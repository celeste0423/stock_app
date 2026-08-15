(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function normalizeUniverseMode(universeMode) {
    return universeMode === "etf" ? "etf" : "stock";
  }

  function universeQuery(universeMode) {
    return "&universe=" + encodeURIComponent(normalizeUniverseMode(universeMode));
  }

  function buildThemesTodayUrl(options) {
    const opts = options || {};
    let url = "/api/themes/today?min_score=0&recent_limit=20" + universeQuery(opts.universeMode);
    if (opts.selectedFileDate) {
      url += "&file_date=" + encodeURIComponent(opts.selectedFileDate);
    }
    if (opts.lite) {
      url += "&lite=1";
    }
    if (opts.cacheOnly) {
      url += "&cache_only=1";
    }
    return url;
  }

  function buildSectorCalendarUrl(options) {
    const opts = options || {};
    let url = "/api/theme-sector-calendar?min_score=0&limit=60&score_basis="
      + encodeURIComponent(opts.calendarScoreBasis || "score")
      + universeQuery(opts.universeMode);
    if (opts.forceRefresh) {
      url += "&force_refresh=true&refresh=" + encodeURIComponent(opts.refreshToken || Date.now());
    }
    return url;
  }

  function buildBackgroundPrefetchUrls(options) {
    const opts = options || {};
    const urls = [
      "/api/sector-watch-board?limit_per_sector=80",
      "/api/portfolio/performance",
      buildThemesTodayUrl({ universeMode: "stock", lite: true }),
      "/api/sector-db",
      buildSectorCalendarUrl({ calendarScoreBasis: "score", universeMode: "stock" }),
      "/api/real-estate/building",
    ];
    if (!opts.publicWeb) {
      urls.push("/api/telegram/status");
    }
    if (opts.lastFileDate) {
      urls.push(buildThemesTodayUrl({ universeMode: "stock", selectedFileDate: opts.lastFileDate, lite: true }));
    }
    return urls;
  }

  modules.themesPage = {
    buildThemesTodayUrl,
    buildSectorCalendarUrl,
    buildBackgroundPrefetchUrls,
  };

  global.StockAppModules = modules;
})(window);
