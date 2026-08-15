(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useState = React.useState;
    const ChartGameChart = deps.ChartGameChart;
    const clearChartGameState = deps.clearChartGameState;
    const emitWindowTitleDetail = deps.emitWindowTitleDetail;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatCurrency = deps.formatCurrency;
    const formatPercent = deps.formatPercent;
    const h = deps.h;
    const isEditableHotkeyTarget = deps.isEditableHotkeyTarget;
    const loadChartGameState = deps.loadChartGameState;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const persistChartGameState = deps.persistChartGameState;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const SummaryCard = deps.SummaryCard;

  function ChartGamePage() {
    const INITIAL_CASH = 100000000;
    const savedChartGameState = loadChartGameState() || {};
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cash, setCash] = useState(function () {
      const value = Number(savedChartGameState.cash);
      return Number.isFinite(value) && value >= 0 ? value : INITIAL_CASH;
    });
    const [position, setPosition] = useState(function () {
      const value = savedChartGameState.position;
      if (!value || typeof value !== "object") {
        return null;
      }
      const shares = Number(value.shares);
      const avgPrice = Number(value.avg_price);
      if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgPrice) || avgPrice <= 0) {
        return null;
      }
      return {
        stock_code: String(value.stock_code || ""),
        stock_name: String(value.stock_name || ""),
        shares: shares,
        avg_price: avgPrice,
      };
    });
    const [turnIndex, setTurnIndex] = useState(function () {
      const value = Number(savedChartGameState.turnIndex);
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    });
    const [weightPct, setWeightPct] = useState(function () {
      const value = Number(savedChartGameState.weightPct);
      return Number.isFinite(value) && value >= 1 && value <= 100 ? value : 100;
    });
    const [customInputMode, setCustomInputMode] = useState(function () {
      const value = String(savedChartGameState.customInputMode || "pct").toLowerCase();
      return value === "shares" ? "shares" : "pct";
    });
    const [customWeightText, setCustomWeightText] = useState(function () {
      return String(savedChartGameState.customWeightText || "100");
    });
    const [notice, setNotice] = useState(function () {
      return String(savedChartGameState.notice || "");
    });
    const [sessionStartAsset, setSessionStartAsset] = useState(function () {
      const value = Number(savedChartGameState.sessionStartAsset);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
      const savedCash = Number(savedChartGameState.cash);
      return Number.isFinite(savedCash) && savedCash >= 0 ? savedCash : INITIAL_CASH;
    });
    const [seenCodes, setSeenCodes] = useState(function () {
      return ensureArray(savedChartGameState.seenCodes).filter(Boolean).slice(-24);
    });
    const [tradeHistory, setTradeHistory] = useState(function () {
      return ensureArray(savedChartGameState.tradeHistory).filter(function (item) {
        return item && item.date && item.type;
      });
    });
    const [pendingSessionSummary, setPendingSessionSummary] = useState(function () {
      const value = savedChartGameState.pendingSessionSummary;
      return value && typeof value === "object" ? value : null;
    });
    const [restoredOnce, setRestoredOnce] = useState(false);

    function normalizedWeightPct() {
      const parsed = Number(weightPct);
      if (!Number.isFinite(parsed)) {
        return 100;
      }
      return Math.max(1, Math.min(parsed, 100));
    }

    function normalizedCustomShares() {
      const parsed = Math.floor(Number(customWeightText));
      if (!Number.isFinite(parsed)) {
        return 0;
      }
      return Math.max(0, parsed);
    }

    async function requestSession(options) {
      const opts = options || {};
      const excludeList = ensureArray(opts.excludeCodes).filter(Boolean);
      const query = "/api/chart-game/session?top_n=30&turns=150&exclude_codes=" + encodeURIComponent(excludeList.join(","));
      setLoading(true);
      setError("");
      setNotice(opts.notice || "");
      setPendingSessionSummary(null);
      try {
        const payload = await fetchJson(query, { forceRefresh: true });
        setSession(payload || null);
        setTurnIndex(0);
        setTradeHistory([]);
        setSessionStartAsset(Number.isFinite(Number(opts.startAsset)) ? Math.max(0, Number(opts.startAsset)) : Math.max(0, cash));
        if (payload && payload.stock_code) {
          setSeenCodes(function (current) {
            const next = current.concat([payload.stock_code]).slice(-12);
            return next;
          });
        }
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () {
      const savedSession = savedChartGameState.session;
      if (savedSession && typeof savedSession === "object" && ensureArray(savedSession.rows).length) {
        setSession(savedSession);
        setLoading(false);
        setError("");
        setRestoredOnce(true);
        return;
      }
      requestSession({ excludeCodes: ensureArray(savedChartGameState.seenCodes).filter(Boolean) });
    }, []);

    useEffect(function () {
      if (!restoredOnce && session) {
        setRestoredOnce(true);
      }
    }, [restoredOnce, session]);

    useEffect(function () {
      if (session) {
        emitWindowTitleDetail("chart-game", "랜덤 세션");
      }
    }, [session]);

    useEffect(function () {
      function handleHotkey(event) {
        if (!session || loading || pendingSessionSummary || !event || event.defaultPrevented || isEditableHotkeyTarget(event.target)) {
          return;
        }
        const key = String(event.key || "").toLowerCase();
        if (key === "b") {
          event.preventDefault();
          handleTrade("buy");
        } else if (key === "h") {
          event.preventDefault();
          handleTrade("hold");
        } else if (key === "s") {
          event.preventDefault();
          handleTrade("sell");
        } else if (key === "n") {
          event.preventDefault();
          handleNextStock();
        }
      }
      window.addEventListener("keydown", handleHotkey);
      return function () {
        window.removeEventListener("keydown", handleHotkey);
      };
    }, [session, loading, cash, position, turnIndex, seenCodes, weightPct, pendingSessionSummary]);

    useEffect(function () {
      if (!restoredOnce || !session) {
        return;
      }
      persistChartGameState({
        session: session,
        cash: cash,
        position: position,
        turnIndex: turnIndex,
        weightPct: weightPct,
        customInputMode: customInputMode,
        customWeightText: customWeightText,
        notice: notice,
        sessionStartAsset: sessionStartAsset,
        seenCodes: seenCodes,
        tradeHistory: tradeHistory,
        pendingSessionSummary: pendingSessionSummary,
        savedAt: new Date().toISOString(),
      });
    }, [restoredOnce, session, cash, position, turnIndex, weightPct, customInputMode, customWeightText, notice, sessionStartAsset, seenCodes, tradeHistory, pendingSessionSummary]);

    if (loading && !session) {
      return h(LoadingPanel, { title: "차트 게임을 준비하는 중입니다.", label: "오늘의 주도주 상위 30개에서 실제 과거 차트 구간을 찾고 있습니다." });
    }
    if (error && !session) {
      return h(ErrorPanel, { message: error });
    }
    if (!session) {
      return h(EmptyState, { message: "차트 게임 세션을 만들지 못했습니다." });
    }

    const sessionRows = ensureArray(session.rows);
    const warmupBars = Math.max(0, Number(session.warmup_bars || 0));
    const visibleAbsoluteIndex = Math.min(sessionRows.length - 1, warmupBars + turnIndex);
    const viewportBars = Math.max(121, Number(session.viewport_bars || 121));
    const visibleStartIndex = Math.max(0, visibleAbsoluteIndex - viewportBars + 1);
    const visibleRows = sessionRows.slice(visibleStartIndex, visibleAbsoluteIndex + 1);
    const currentRow = sessionRows[visibleAbsoluteIndex] || null;
    const currentPrice = currentRow ? Number(currentRow.close) : NaN;
    const currentHoldingShares = position && position.stock_code === session.stock_code ? Number(position.shares || 0) : 0;
    const currentHoldingValue = currentHoldingShares > 0 && Number.isFinite(currentPrice) ? currentHoldingShares * currentPrice : 0;
    const currentAvgPrice = position && currentHoldingShares > 0 ? Number(position.avg_price || 0) : NaN;
    const holdingCostBasis = currentHoldingShares > 0 && Number.isFinite(currentAvgPrice) ? currentHoldingShares * currentAvgPrice : 0;
    const holdingPnl = currentHoldingShares > 0 ? (currentHoldingValue - holdingCostBasis) : 0;
    const holdingReturnPct = currentHoldingShares > 0 && holdingCostBasis > 0 ? ((currentHoldingValue / holdingCostBasis) - 1) * 100 : null;
    const totalAsset = cash + currentHoldingValue;
    const returnPct = INITIAL_CASH > 0 ? ((totalAsset / INITIAL_CASH) - 1) * 100 : 0;
    const sessionReturnPct = sessionStartAsset > 0 ? ((totalAsset / sessionStartAsset) - 1) * 100 : 0;
    const holdingWeightPct = totalAsset > 0 ? (currentHoldingValue / totalAsset) * 100 : 0;
    const currentTurnText = String(turnIndex + 1) + "/" + String(session.turn_count || 150);

    function buildVisibleMa(period) {
      const output = [];
      for (var index = visibleStartIndex; index <= visibleAbsoluteIndex; index += 1) {
        if (index + 1 < period) {
          continue;
        }
        var sum = 0;
        var valid = true;
        for (var pointer = index - period + 1; pointer <= index; pointer += 1) {
          const close = Number(sessionRows[pointer] && sessionRows[pointer].close);
          if (!Number.isFinite(close)) {
            valid = false;
            break;
          }
          sum += close;
        }
        if (valid) {
          output.push(sum / period);
        }
      }
      return output.length ? output[output.length - 1] : null;
    }

    const ma20 = buildVisibleMa(20);
    const ma60 = buildVisibleMa(60);
    const ma120 = buildVisibleMa(120);
    const buyableShares = Number.isFinite(currentPrice) && currentPrice > 0 ? Math.floor(cash / currentPrice) : 0;
    const customShares = normalizedCustomShares();
    const directBuyShares = customInputMode === "shares"
      ? Math.min(buyableShares, customShares)
      : (Number.isFinite(currentPrice) && currentPrice > 0 ? Math.floor((cash * (normalizedWeightPct() / 100)) / currentPrice) : 0);
    const visibleTradeMarkers = tradeHistory.filter(function (item) {
      const date = String(item.date || "").slice(0, 10);
      return visibleRows.some(function (row) { return String(row.date || "").slice(0, 10) === date; });
    });
    const recentTradeHistory = tradeHistory.slice().reverse().slice(0, 12);

    function commitState(nextCash, nextPosition, nextTurnIndex, nextNotice, nextTradeHistory) {
      setCash(nextCash);
      setPosition(nextPosition && nextPosition.shares > 0 ? nextPosition : null);
      setTurnIndex(nextTurnIndex);
      setNotice(nextNotice || "");
      if (Array.isArray(nextTradeHistory)) {
        setTradeHistory(nextTradeHistory);
      }
    }

    function buildSessionSummary(nextCash, nextTradeHistory, closingShares) {
      const normalizedStartAsset = Number.isFinite(sessionStartAsset) && sessionStartAsset >= 0 ? sessionStartAsset : INITIAL_CASH;
      const endAsset = Number.isFinite(nextCash) ? nextCash : normalizedStartAsset;
      const pnl = endAsset - normalizedStartAsset;
      const tradeItems = ensureArray(nextTradeHistory);
      const buyCount = tradeItems.filter(function (item) {
        return String(item.type || "").toLowerCase() === "buy";
      }).length;
      const sellCount = tradeItems.filter(function (item) {
        return String(item.type || "").toLowerCase() === "sell";
      }).length;
      return {
        turnCount: Number(session && session.turn_count || 150),
        startAsset: normalizedStartAsset,
        endAsset: endAsset,
        pnl: pnl,
        returnPct: normalizedStartAsset > 0 ? ((endAsset / normalizedStartAsset) - 1) * 100 : 0,
        tradeCount: tradeItems.length,
        buyCount: buyCount,
        sellCount: sellCount,
        autoClosedShares: Number.isFinite(closingShares) && closingShares > 0 ? closingShares : 0,
      };
    }

    function handleTrade(action) {
      if (!currentRow || !Number.isFinite(currentPrice) || currentPrice <= 0 || loading) {
        return;
      }
      var nextCash = cash;
      var nextPosition = position && position.stock_code === session.stock_code
        ? { stock_code: position.stock_code, stock_name: position.stock_name, shares: Number(position.shares || 0), avg_price: Number(position.avg_price || 0) }
        : null;
      var nextNotice = "";
      var nextTradeHistory = tradeHistory.slice();
      const weightRatio = normalizedWeightPct() / 100;

      if (action === "buy") {
        const shares = customInputMode === "shares"
          ? Math.min(Math.floor(nextCash / currentPrice), normalizedCustomShares())
          : Math.floor((nextCash * weightRatio) / currentPrice);
        if (shares <= 0) {
          setNotice("매수 가능한 수량이 없습니다.");
          return;
        }
        if (nextPosition) {
          const totalShares = nextPosition.shares + shares;
          nextPosition.avg_price = ((nextPosition.avg_price * nextPosition.shares) + (currentPrice * shares)) / totalShares;
          nextPosition.shares = totalShares;
        } else {
          nextPosition = {
            stock_code: session.stock_code,
            stock_name: session.stock_name,
            shares: shares,
            avg_price: currentPrice,
          };
        }
        nextCash -= shares * currentPrice;
        nextNotice = numberFormat(shares, 0) + "주 매수";
        nextTradeHistory.push({
          date: String(currentRow.date || ""),
          type: "buy",
          price: currentPrice,
          avg_price: nextPosition.avg_price,
          shares: shares,
        });
      } else if (action === "sell") {
        if (!nextPosition || nextPosition.shares <= 0) {
          setNotice("매도할 보유 수량이 없습니다.");
          return;
        }
        var sellShares = customInputMode === "shares"
          ? Math.max(1, Math.min(nextPosition.shares, normalizedCustomShares()))
          : (weightRatio >= 0.999 ? nextPosition.shares : Math.max(1, Math.floor(nextPosition.shares * weightRatio)));
        sellShares = Math.min(sellShares, nextPosition.shares);
        nextCash += sellShares * currentPrice;
        nextPosition.shares -= sellShares;
        nextNotice = numberFormat(sellShares, 0) + "주 매도";
        nextTradeHistory.push({
          date: String(currentRow.date || ""),
          type: "sell",
          price: currentPrice,
          avg_price: Number(position && position.avg_price || 0),
          shares: sellShares,
        });
        if (nextPosition.shares <= 0) {
          nextPosition = null;
        }
      } else {
        nextNotice = "관망";
      }

      const isLastTurn = turnIndex >= Number(session.turn_count || 150) - 1;
      if (isLastTurn) {
        var closingShares = 0;
        if (nextPosition && nextPosition.stock_code === session.stock_code && nextPosition.shares > 0) {
          closingShares = nextPosition.shares;
          nextCash += nextPosition.shares * currentPrice;
          nextNotice += " · 세션 종료 정산";
          nextPosition = null;
        }
        setCash(nextCash);
        setPosition(nextPosition);
        setTradeHistory(nextTradeHistory);
        setNotice(nextNotice + " · 종목 결과를 확인해 주세요.");
        setPendingSessionSummary(buildSessionSummary(nextCash, nextTradeHistory, closingShares));
        return;
      }
      commitState(nextCash, nextPosition, turnIndex + 1, nextNotice, nextTradeHistory);
    }

    function handleNextStock() {
      if (loading || pendingSessionSummary) {
        return;
      }
      if (currentHoldingShares > 0) {
        setNotice("보유 수량이 있으면 다음 종목으로 넘어갈 수 없습니다. 먼저 매도해 주세요.");
        return;
      }
      requestSession({
        excludeCodes: seenCodes.concat([session.stock_code]),
        notice: "다음 종목으로 변경",
        startAsset: cash,
      });
    }

    function handleContinueAfterSummary() {
      if (loading || !pendingSessionSummary) {
        return;
      }
      requestSession({
        excludeCodes: seenCodes.concat([session.stock_code]),
        notice: "이번 종목 정리 완료 · 다음 종목으로 이동",
        startAsset: cash,
      });
    }

    function handleResetGame() {
      clearChartGameState();
      setCash(INITIAL_CASH);
      setPosition(null);
      setSessionStartAsset(INITIAL_CASH);
      setPendingSessionSummary(null);
      setSeenCodes([]);
      setTurnIndex(0);
      setNotice("");
      setTradeHistory([]);
      requestSession({ excludeCodes: [], notice: "게임을 초기화했습니다.", startAsset: INITIAL_CASH });
    }

    return h(
      "div",
      { className: "chart-game-page" },
      h(
        "section",
        { className: "panel chart-game-hero" },
        h("div", { className: "eyebrow" }, "Leader Chart Challenge"),
        h("div", { className: "chart-game-hero-head" },
          h("div", null,
            h("h2", null, "차트 게임"),
            h("p", { className: "page-copy compact-copy" }, "오늘의 주도주 상위 30개 안에서 종목만 랜덤으로 고르고, 실제 기업의 과거 구간 차트만 보고 매매를 진행합니다.")
          ),
          h("div", { className: "chart-game-hero-actions" },
            h("button", { type: "button", className: "secondary-button", onClick: handleResetGame, disabled: loading }, "게임 초기화"),
            h("button", { type: "button", className: "secondary-button", onClick: handleNextStock, disabled: loading || currentHoldingShares > 0 || !!pendingSessionSummary }, "다음 종목")
          )
        ),
        h("div", { className: "summary-grid chart-game-summary-grid" },
          h(SummaryCard, { label: "수익률", value: formatPercent(returnPct, 2), className: returnPct >= 0 ? "metric-up" : "metric-down", help: "시작자산 1억원 기준" }),
          h(SummaryCard, { label: "평가자산", value: formatCurrency(totalAsset), help: "현금 + 보유 평가액" }),
          h(SummaryCard, { label: "현재 세션", value: formatPercent(sessionReturnPct, 2), className: sessionReturnPct >= 0 ? "metric-up" : "metric-down", help: "이번 종목 시작 자산 기준" }),
          h(SummaryCard, { label: "턴", value: currentTurnText, help: "최대 150턴 진행" })
        ),
        notice ? h("div", { className: "chart-game-notice" }, notice) : null,
        error ? h("div", { className: "chart-game-notice error" }, error) : null
      ),
      h(
        "section",
        { className: "chart-game-layout" },
        h(
          "div",
          { className: "panel chart-game-chart-panel" },
          h("div", { className: "section-toolbar compact" },
            h("div", null,
              h("div", { className: "eyebrow" }, "TradingView Style"),
              h("div", { className: "section-title chart-game-chart-title" }, "랜덤 차트")
            )
          ),
          currentRow
            ? h("div", { className: "chart-game-chart-meta" },
                h("span", null, "시 " + numberFormat(currentRow.open, 0)),
                h("span", null, "고 " + numberFormat(currentRow.high, 0)),
                h("span", null, "저 " + numberFormat(currentRow.low, 0)),
                h("span", null, "종 " + numberFormat(currentRow.close, 0)),
                h("span", { className: Number(currentRow.change_pct || 0) >= 0 ? "metric-up" : "metric-down" }, "등락 " + formatPercent(currentRow.change_pct, 2)),
                h("span", null, "거래대금 " + numberFormat(currentRow.trading_value_100m, 0) + "억")
              )
            : null,
          h("div", { className: "chart-game-ma-row" },
            h("span", { className: "ma20" }, "MA20 " + (ma20 != null ? numberFormat(ma20, 0) : "-")),
            h("span", { className: "ma60" }, "MA60 " + (ma60 != null ? numberFormat(ma60, 0) : "-")),
            h("span", { className: "ma120" }, "MA120 " + (ma120 != null ? numberFormat(ma120, 0) : "-"))
          ),
          h("div", { className: "global-tradingview-frame chart-game-tv-frame" },
            h(ChartGameChart, {
              rows: visibleRows,
              tradeMarkers: visibleTradeMarkers,
              averagePrice: currentHoldingShares > 0 ? currentAvgPrice : null,
            })
          )
        ),
        h(
          "div",
          { className: "chart-game-side" },
          h(
            "section",
            { className: "panel chart-game-account-panel" },
            h("div", { className: "chart-game-account-head" },
              h("div", null,
                h("span", { className: "summary-label" }, "현금"),
                h("strong", null, formatCurrency(cash))
              ),
              h("div", null,
                h("span", { className: "summary-label" }, "보유 평가"),
                h("strong", null, formatCurrency(currentHoldingValue)),
                h("em", { className: Number(returnPct || 0) >= 0 ? "metric-up" : "metric-down" }, "총자산 수익률 " + formatPercent(returnPct, 2))
              )
            ),
            h("div", { className: "chart-game-holding-box" },
              h("div", null, h("span", null, "보유주식"), h("strong", null, currentHoldingShares > 0 ? numberFormat(currentHoldingShares, 0) + "주" : "없음")),
              h("div", null, h("span", null, "평균단가"), h("strong", null, position && currentHoldingShares > 0 ? formatCurrency(position.avg_price) : "-")),
              h("div", null, h("span", null, "종목 수익률"), h("strong", { className: currentHoldingShares > 0 && Number(holdingReturnPct || 0) >= 0 ? "metric-up" : "metric-down" }, currentHoldingShares > 0 && holdingReturnPct != null ? formatPercent(holdingReturnPct, 2) : "-")),
              h("div", null, h("span", null, "종목 손익"), h("strong", { className: currentHoldingShares > 0 && holdingPnl >= 0 ? "metric-up" : "metric-down" }, currentHoldingShares > 0 ? formatCurrency(holdingPnl) : "-")),
              h("div", null, h("span", null, "보유비중"), h("strong", null, currentHoldingShares > 0 ? formatPercent(holdingWeightPct, 1) : "-"))
            )
          ),
          h(
            "section",
            { className: "panel chart-game-control-panel" },
            h("div", { className: "chart-game-turn-row" },
              h("span", null, "턴"),
              h("div", { className: "chart-game-turn-track" }, h("span", { style: { width: ((turnIndex + 1) / Number(session.turn_count || 150) * 100) + "%" } })),
              h("strong", null, currentTurnText)
            ),
            h("div", { className: "chart-game-weight-head" }, "비중"),
            h("div", { className: "chart-game-weight-grid" },
              [10, 25, 50, 100].map(function (value) {
                return h(
                  "button",
                  {
                    key: value,
                    type: "button",
                    className: "chart-game-weight-button" + (Number(weightPct) === value ? " active" : ""),
                    onClick: function () {
                      setWeightPct(value);
                      setCustomInputMode("pct");
                      setCustomWeightText(String(value));
                    },
                  },
                  String(value) + "%"
                );
              }),
              h("label", { className: "chart-game-weight-custom" },
                h("span", null, "직접"),
                h("div", { className: "chart-game-weight-mode-toggle" },
                  h("button", {
                    type: "button",
                    className: "chart-game-weight-mode-button" + (customInputMode === "pct" ? " active" : ""),
                    onClick: function () { setCustomInputMode("pct"); },
                  }, "%"),
                  h("button", {
                    type: "button",
                    className: "chart-game-weight-mode-button" + (customInputMode === "shares" ? " active" : ""),
                    onClick: function () { setCustomInputMode("shares"); },
                  }, "주")
                ),
                h("input", {
                  type: "number",
                  min: "1",
                  max: customInputMode === "shares" ? "1000000" : "100",
                  step: "1",
                  value: customWeightText,
                  onFocus: selectTextOnFocus,
                  onChange: function (event) {
                    const nextValue = String(event.target.value || "");
                    setCustomWeightText(nextValue);
                    const parsed = customInputMode === "shares" ? Math.floor(Number(nextValue)) : Number(nextValue);
                    if (customInputMode === "pct" && Number.isFinite(parsed)) {
                      setWeightPct(Math.max(1, Math.min(parsed, 100)));
                    }
                  },
                })
              )
            ),
            h("div", { className: "chart-game-available-text" }, "매수 가능: " + formatCurrency(cash) + (buyableShares > 0 ? " (" + numberFormat(buyableShares, 0) + "주)" : "") + (customInputMode === "shares" ? " · 직접 " + numberFormat(directBuyShares, 0) + "주" : "")),
            h("div", { className: "chart-game-action-grid" },
              h("button", { type: "button", className: "chart-game-action buy", onClick: function () { handleTrade("buy"); }, disabled: loading || !!pendingSessionSummary || buyableShares <= 0 }, "매수 (B)"),
              h("button", { type: "button", className: "chart-game-action hold", onClick: function () { handleTrade("hold"); }, disabled: loading || !!pendingSessionSummary }, "다음 (H)"),
              h("button", { type: "button", className: "chart-game-action sell", onClick: function () { handleTrade("sell"); }, disabled: loading || !!pendingSessionSummary || currentHoldingShares <= 0 }, "매도 (S)")
            ),
            h("button", { type: "button", className: "secondary-button chart-game-next-stock-button", onClick: handleNextStock, disabled: loading || currentHoldingShares > 0 || !!pendingSessionSummary }, "다음 종목"),
            h("div", { className: "chart-game-shortcuts" }, "B 매수 · H 다음 · S 매도 · N 다음 종목")
          ),
          h(
            "section",
            { className: "panel chart-game-history-panel" },
            h("div", { className: "section-toolbar compact" },
              h("div", { className: "section-title chart-game-history-title" }, "매매 이력")
            ),
            recentTradeHistory.length
              ? h("div", { className: "chart-game-history-list" },
                  recentTradeHistory.map(function (item, index) {
                    const type = String(item.type || "").toLowerCase();
                    const positive = type !== "sell";
                    return h(
                      "div",
                      { key: String(item.date || "") + "-" + String(item.type || "") + "-" + String(index), className: "chart-game-history-row" },
                      h("div", { className: "chart-game-history-main" },
                        h("strong", { className: positive ? "metric-up" : "metric-down" }, type === "sell" ? "매도" : "매수"),
                        h("span", null, String(index + 1) + "번째 최근 거래")
                      ),
                      h("div", { className: "chart-game-history-meta" },
                        h("span", null, Number.isFinite(Number(item.shares)) ? numberFormat(item.shares, 0) + "주" : "-"),
                        h("span", null, Number.isFinite(Number(item.price)) ? "체결 " + formatCurrency(item.price) : ""),
                        h("span", null, Number.isFinite(Number(item.avg_price)) ? "평단 " + formatCurrency(item.avg_price) : "")
                      )
                    );
                  })
                )
              : h("div", { className: "chart-game-history-empty" }, "아직 매매 이력이 없습니다.")
          )
        )
      ),
      pendingSessionSummary
        ? h(
            "div",
            { className: "modal-backdrop chart-game-summary-backdrop" },
            h(
              "div",
              { className: "modal-panel chart-game-summary-modal", onClick: function (event) { event.stopPropagation(); } },
              h("div", { className: "modal-head" },
                h("div", null,
                  h("h2", null, "이번 종목 결과"),
                  h("p", null, String(pendingSessionSummary.turnCount || 150) + "턴 종료 후 자동 정산되었습니다.")
                )
              ),
              h("div", { className: "chart-game-summary-modal-grid" },
                h("div", { className: "chart-game-summary-stat" },
                  h("span", null, "시작 자산"),
                  h("strong", null, formatCurrency(pendingSessionSummary.startAsset))
                ),
                h("div", { className: "chart-game-summary-stat" },
                  h("span", null, "종료 자산"),
                  h("strong", null, formatCurrency(pendingSessionSummary.endAsset))
                ),
                h("div", { className: "chart-game-summary-stat" },
                  h("span", null, "이번 종목 손익"),
                  h("strong", { className: Number(pendingSessionSummary.pnl || 0) >= 0 ? "metric-up" : "metric-down" }, formatCurrency(pendingSessionSummary.pnl))
                ),
                h("div", { className: "chart-game-summary-stat" },
                  h("span", null, "이번 종목 수익률"),
                  h("strong", { className: Number(pendingSessionSummary.returnPct || 0) >= 0 ? "metric-up" : "metric-down" }, formatPercent(pendingSessionSummary.returnPct, 2))
                )
              ),
              h("div", { className: "chart-game-summary-modal-meta" },
                h("span", null, "매매 " + numberFormat(pendingSessionSummary.tradeCount || 0, 0) + "회"),
                h("span", null, "매수 " + numberFormat(pendingSessionSummary.buyCount || 0, 0) + "회"),
                h("span", null, "매도 " + numberFormat(pendingSessionSummary.sellCount || 0, 0) + "회"),
                pendingSessionSummary.autoClosedShares > 0 ? h("span", null, "종료 정산 " + numberFormat(pendingSessionSummary.autoClosedShares, 0) + "주") : null
              ),
              h("div", { className: "chart-game-summary-modal-actions" },
                h("button", { type: "button", className: "primary-button", onClick: handleContinueAfterSummary, disabled: loading }, loading ? "불러오는 중..." : "다음 종목")
              )
            )
          )
        : null
    );
  }


    return ChartGamePage;
  }

  modules.chartGamePage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
