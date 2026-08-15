(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useState = React.useState;
    const buildEmptySectorGroupV2 = deps.buildEmptySectorGroupV2;
    const buildEmptyStockRow = deps.buildEmptyStockRow;
    const buildSectorSnapshotGroupsFromDb = deps.buildSectorSnapshotGroupsFromDb;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const h = deps.h;
    const LoadingBlock = deps.LoadingBlock;
    const LoadingPanel = deps.LoadingPanel;
    const metricSpan = deps.metricSpan;
    const numberFormat = deps.numberFormat;
    const postDownload = deps.postDownload;
    const postJson = deps.postJson;
    const ratioSpan = deps.ratioSpan;
    const scoreSpan = deps.scoreSpan;
    const SectionTitle = deps.SectionTitle;
    const SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY = deps.SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY;
    const SECTOR_SNAPSHOT_KEY = deps.SECTOR_SNAPSHOT_KEY;
    const selectTextOnFocus = deps.selectTextOnFocus;
    const SortableDataTable = deps.SortableDataTable;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

  function SectorSnapshotPageV2() {
    const sectorDbRequest = useFetchJson("/api/sector-db");
    const [groups, setGroups] = useState([buildEmptySectorGroupV2()]);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [message, setMessage] = useState("");
    const [selectedSectorIds, setSelectedSectorIds] = useState({});
    const [builderCollapsed, setBuilderCollapsed] = useState(function () {
      return localStorage.getItem(SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY) === "1";
    });
    const timerRef = useRef({});
    const saveTimerRef = useRef(null);
    const sectorDbLoadedRef = useRef(false);
    const skipNextSectorSaveRef = useRef(false);

    useEffect(function () {
      return function () {
        Object.keys(timerRef.current).forEach(function (key) {
          clearTimeout(timerRef.current[key]);
        });
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
      };
    }, []);

    useEffect(function () {
      localStorage.setItem(SECTOR_SNAPSHOT_BUILDER_COLLAPSED_KEY, builderCollapsed ? "1" : "0");
    }, [builderCollapsed]);

    useEffect(function () {
      if (sectorDbRequest.data) {
        const nextGroups = buildSectorSnapshotGroupsFromDb(sectorDbRequest.data.groups);
        const nextSelected = {};
        nextGroups.forEach(function (group) {
          nextSelected[group.id] = true;
        });
        localStorage.removeItem(SECTOR_SNAPSHOT_KEY);
        skipNextSectorSaveRef.current = true;
        setGroups(nextGroups);
        setSelectedSectorIds(nextSelected);
        sectorDbLoadedRef.current = true;
      }
    }, [sectorDbRequest.data]);

    useEffect(function () {
      if (!sectorDbLoadedRef.current) {
        return;
      }
      if (skipNextSectorSaveRef.current) {
        skipNextSectorSaveRef.current = false;
        return;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(function () {
        const body = buildRequestBody(false);
        if (!body.groups.length) {
          return;
        }
        postJson("/api/sector-db/groups", body).catch(function () {});
      }, 500);
    }, [groups]);

    if (sectorDbRequest.loading) {
      return LoadingPanel({ label: sectorDbRequest.label });
    }
    if (sectorDbRequest.error) {
      return ErrorPanel({ message: sectorDbRequest.error });
    }

    function updateGroup(groupId, updater) {
      setGroups(function (current) {
        return current.map(function (group) {
          return group.id === groupId ? updater(group) : group;
        });
      });
    }

    function updateSector(groupId, value) {
      updateGroup(groupId, function (group) {
        return Object.assign({}, group, { sector: value });
      });
    }

    function updateStockRow(groupId, rowId, patch) {
      updateGroup(groupId, function (group) {
        return Object.assign({}, group, {
          rows: group.rows.map(function (row) {
            return row.id === rowId ? Object.assign({}, row, patch) : row;
          }),
        });
      });
    }

    function searchStock(groupId, rowId, value) {
      updateStockRow(groupId, rowId, { query: value, name: value, code: "", market: "", suggestions: [] });
      const timerKey = groupId + ":" + rowId;
      if (timerRef.current[timerKey]) {
        clearTimeout(timerRef.current[timerKey]);
      }
      if (!value.trim()) {
        return;
      }
      timerRef.current[timerKey] = setTimeout(async function () {
        try {
          const payload = await fetchJson("/api/stocks/autocomplete?q=" + encodeURIComponent(value.trim()));
          updateStockRow(groupId, rowId, { suggestions: ensureArray(payload.items || []), activeIndex: 0 });
        } catch (err) {
          updateStockRow(groupId, rowId, { suggestions: [] });
        }
      }, 180);
    }

    function chooseStock(groupId, rowId, stock) {
      updateGroup(groupId, function (group) {
        const rows = group.rows.map(function (row) {
          if (row.id !== rowId) {
            return row;
          }
          return {
            id: row.id,
            query: stock.name,
            code: stock.code,
            name: stock.name,
            market: stock.market || "",
            suggestions: [],
            activeIndex: 0,
          };
        });
        const hasBlank = rows.some(function (row) { return !String(row.query || "").trim(); });
        return Object.assign({}, group, { rows: hasBlank ? rows : rows.concat([buildEmptyStockRow()]) });
      });
    }

    function handleStockKeyDown(groupId, row, event) {
      const suggestions = ensureArray(row.suggestions);
      if (!suggestions.length) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        updateStockRow(groupId, row.id, {
          activeIndex: Math.min((row.activeIndex || 0) + 1, suggestions.length - 1),
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateStockRow(groupId, row.id, {
          activeIndex: Math.max((row.activeIndex || 0) - 1, 0),
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        chooseStock(groupId, row.id, suggestions[row.activeIndex || 0]);
      } else if (event.key === "Escape") {
        updateStockRow(groupId, row.id, { suggestions: [] });
      }
    }

    function addStockLine(groupId) {
      updateGroup(groupId, function (group) {
        return Object.assign({}, group, { rows: group.rows.concat([buildEmptyStockRow()]) });
      });
    }

    function removeStockLine(groupId, rowId) {
      updateGroup(groupId, function (group) {
        const rows = group.rows.filter(function (row) { return row.id !== rowId; });
        return Object.assign({}, group, { rows: rows.length ? rows : [buildEmptyStockRow()] });
      });
    }

    function moveStockLine(groupId, rowId, direction) {
      updateGroup(groupId, function (group) {
        const rows = group.rows.slice();
        const index = rows.findIndex(function (row) { return row.id === rowId; });
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) {
          return group;
        }
        const temp = rows[index];
        rows[index] = rows[nextIndex];
        rows[nextIndex] = temp;
        return Object.assign({}, group, { rows: rows });
      });
    }

    function addSector() {
      const nextGroup = buildEmptySectorGroupV2();
      setGroups(function (current) { return current.concat([nextGroup]); });
      setSelectedSectorIds(function (current) {
        return Object.assign({}, current, { [nextGroup.id]: true });
      });
    }

    function removeSector(groupId) {
      const fallbackGroup = buildEmptySectorGroupV2();
      setGroups(function (current) {
        const next = current.filter(function (group) { return group.id !== groupId; });
        return next.length ? next : [fallbackGroup];
      });
      setSelectedSectorIds(function (current) {
        const next = Object.assign({}, current);
        delete next[groupId];
        if (!Object.keys(next).length) {
          next[fallbackGroup.id] = true;
        }
        return next;
      });
    }

    function getGroupStockCount(group) {
      return ensureArray(group.rows).filter(function (row) {
        return String(row.name || row.query || row.code || "").trim();
      }).length;
    }

    function togglePreviewSector(groupId) {
      setSelectedSectorIds(function (current) {
        const next = Object.assign({}, current);
        next[groupId] = current[groupId] === false;
        return next;
      });
    }

    function setAllPreviewSectors(selected) {
      const next = {};
      groups.forEach(function (group) {
        next[group.id] = !!selected;
      });
      setSelectedSectorIds(next);
    }

    function buildRequestBody(selectedOnly) {
      return {
        groups: groups
          .filter(function (group) {
            return !selectedOnly || selectedSectorIds[group.id] !== false;
          })
          .map(function (group) {
            const stocks = ensureArray(group.rows)
              .filter(function (row) { return String(row.name || row.query || row.code || "").trim(); })
              .map(function (row) {
                return { code: row.code || null, name: row.name || row.query };
              });
            return { sector: String(group.sector || "").trim(), stocks: stocks };
          })
          .filter(function (group) {
            return group.sector && group.stocks.length;
          }),
      };
    }

    async function runPreview() {
      const body = buildRequestBody(true);
      if (!body.groups.length) {
        setMessage("엑셀로 출력할 섹터를 하나 이상 선택해 주세요.");
        return;
      }
      setLoading(true);
      setMessage("");
      try {
        await postJson("/api/sector-db/groups", buildRequestBody(false));
        const payload = await postJson("/api/sector-snapshot/preview", body);
        setPreview(payload);
        setMessage(ensureArray(payload.errors).length ? "일부 종목은 데이터를 가져오지 못했습니다." : "");
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    async function runExport() {
      const body = buildRequestBody(true);
      if (!body.groups.length) {
        setMessage("엑셀로 출력할 섹터를 하나 이상 선택해 주세요.");
        return;
      }
      setExporting(true);
      setMessage("");
      try {
        await postJson("/api/sector-db/groups", buildRequestBody(false));
        await postDownload("/api/sector-snapshot/export.xlsx", body, "sector_snapshot.xlsx");
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setExporting(false);
      }
    }

    const sectorColumns = [
      { key: "sector", label: "섹터" },
      { key: "stock_count", label: "종목 수", render: function (row) { return numberFormat(row.stock_count, 0); } },
      { key: "beta_120d", label: "베타", render: function (row) { return row.beta_120d == null ? "-" : numberFormat(row.beta_120d, 2); } },
      { key: "market_cap_100m", label: "시가총액(억)", render: function (row) { return numberFormat(row.market_cap_100m, 1); } },
      { key: "strength_score", label: "강도 점수", render: function (row) { return scoreSpan(row.strength_score); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "ytd_return_pct", label: "YTD Return", render: function (row) { return metricSpan(row.ytd_return_pct, "percent"); } },
      { key: "avg_trading_value_marcap_pct", label: "일평균 거래대금/시총 x1000", render: function (row) { return ratioSpan(row.avg_trading_value_marcap_pct); } },
      { key: "foreigner_net_value_marcap_pct", label: "외국인 순매수/시총 x1000", render: function (row) { return ratioSpan(row.foreigner_net_value_marcap_pct); } },
    ];

    const stockColumns = [
      { key: "stock_name", label: "종목명" },
      { key: "beta_120d", label: "베타", render: function (row) { return row.beta_120d == null ? "-" : numberFormat(row.beta_120d, 2); } },
      { key: "market_cap_100m", label: "시가총액(억)", render: function (row) { return numberFormat(row.market_cap_100m, 1); } },
      { key: "strength_score", label: "강도 점수", render: function (row) { return scoreSpan(row.strength_score); } },
      { key: "w_return_pct", label: "W Return", render: function (row) { return metricSpan(row.w_return_pct, "percent"); } },
      { key: "w1_return_pct", label: "W-1 Return", render: function (row) { return metricSpan(row.w1_return_pct, "percent"); } },
      { key: "m1_return_pct", label: "1M Return", render: function (row) { return metricSpan(row.m1_return_pct, "percent"); } },
      { key: "m3_return_pct", label: "3M Return", render: function (row) { return metricSpan(row.m3_return_pct, "percent"); } },
      { key: "ytd_return_pct", label: "YTD Return", render: function (row) { return metricSpan(row.ytd_return_pct, "percent"); } },
      { key: "avg_trading_value_marcap_pct", label: "일평균 거래대금/시총 x1000", render: function (row) { return ratioSpan(row.avg_trading_value_marcap_pct); } },
      { key: "foreigner_net_value_marcap_pct", label: "외국인 순매수/시총 x1000", render: function (row) { return ratioSpan(row.foreigner_net_value_marcap_pct); } },
    ];

    const previewSectorCandidates = groups.filter(function (group) {
      return String(group.sector || "").trim() && getGroupStockCount(group) > 0;
    });
    const selectedPreviewGroups = previewSectorCandidates.filter(function (group) {
      return selectedSectorIds[group.id] !== false;
    });
    const selectedPreviewStockCount = selectedPreviewGroups.reduce(function (total, group) {
      return total + getGroupStockCount(group);
    }, 0);

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel alt" },
        h("div", { className: "eyebrow" }, "Sector Snapshot"),
        h("h1", { className: "page-title" }, "\uCD94\uAC00 \uC608\uC815 \uD398\uC774\uC9C0"),
        h("p", { className: "page-copy" }, "섹터별 종목을 입력하고 FinanceDataReader 데이터로 수익률, 시가총액, 수급/거래대금 지표를 비교합니다."),
        preview
          ? h(
              "div",
              { className: "summary-grid summary-grid-small" },
              h(SummaryCard, { label: "기준일", value: preview.as_of_date || "-" }),
              h(SummaryCard, { label: "섹터 수", value: numberFormat(preview.summary ? preview.summary.sector_count : 0, 0) }),
              h(SummaryCard, { label: "종목 수", value: numberFormat(preview.summary ? preview.summary.stock_count : 0, 0) }),
              h(SummaryCard, { label: "미수집 종목", value: numberFormat(preview.summary ? preview.summary.error_count : 0, 0) })
            )
          : null,
        h(
          "div",
          { className: "form-actions section-actions" },
          h("button", { className: "mini-button", onClick: addSector }, "섹터 추가"),
          h("button", { className: "primary-button", onClick: runPreview, disabled: loading || !selectedPreviewGroups.length }, loading ? "미리보기 생성 중..." : "선택 섹터 미리보기"),
          h("button", { className: "primary-button", onClick: runExport, disabled: exporting || !selectedPreviewGroups.length }, exporting ? "엑셀 생성 중..." : "선택 섹터 엑셀 출력")
        ),
        message ? h("div", { className: "notice-box" }, message) : null
      ),
      h(
        "div",
        { className: "panel sector-builder-toggle-panel" },
        h(
          "button",
          {
            type: "button",
            className: "sector-builder-toggle",
            onClick: function () { setBuilderCollapsed(function (value) { return !value; }); },
          },
          h("span", { className: "sector-builder-arrow" }, builderCollapsed ? "▼" : "▲"),
          h("strong", null, builderCollapsed ? "섹터 입력/선택 열기" : "섹터 입력/선택 접기"),
          h("span", null, "선택 " + numberFormat(selectedPreviewGroups.length, 0) + "개 섹터 · " + numberFormat(selectedPreviewStockCount, 0) + "종목")
        )
      ),
      h(
        "div",
        { className: "panel sector-preview-picker", style: builderCollapsed ? { display: "none" } : null },
        h(
          "div",
          { className: "section-toolbar" },
          h(SectionTitle, null, "날짜별 주도 섹터 흐름"),
          h(
            "div",
            { className: "toggle-group" },
            h("button", { className: "mini-button", onClick: function () { setAllPreviewSectors(true); } }, "전체 선택"),
            h("button", { className: "mini-button", onClick: function () { setAllPreviewSectors(false); } }, "전체 해제")
          )
        ),
        h(
          "div",
          { className: "summary-help" },
          "선택 " + numberFormat(selectedPreviewGroups.length, 0) + " / " + numberFormat(previewSectorCandidates.length, 0) + "개 섹터 · 예상 수집 종목 " + numberFormat(selectedPreviewStockCount, 0) + "개"
        ),
        previewSectorCandidates.length
          ? h(
              "div",
              { className: "sector-preview-chip-grid" },
              previewSectorCandidates.map(function (group) {
                const selected = selectedSectorIds[group.id] !== false;
                return h(
                  "button",
                  {
                    key: group.id,
                    type: "button",
                    className: "sector-preview-chip" + (selected ? " active" : ""),
                    onClick: function () { togglePreviewSector(group.id); },
                  },
                  h("span", { className: "sector-preview-check" }, selected ? "?" : ""),
                  h("strong", null, group.sector),
                  h("span", null, numberFormat(getGroupStockCount(group), 0) + "종목")
                );
              })
            )
          : EmptyState({ message: "섹터명과 종목을 입력하면 선택 목록이 표시됩니다.", compact: true })
      ),
      h(
        "div",
        { className: "sector-card-grid", style: builderCollapsed ? { display: "none" } : null },
        groups.map(function (group, index) {
          return h(
            "div",
            { key: group.id, className: "panel sector-builder-card" },
            h(
              "div",
              { className: "section-toolbar" },
              h("strong", null, "섹터 " + numberFormat(index + 1, 0)),
              h("button", { className: "mini-button", onClick: function () { removeSector(group.id); } }, "삭제")
            ),
            h("label", { className: "form-field" }, "섹터명", h("input", {
              value: group.sector,
              onChange: function (event) { updateSector(group.id, event.target.value); },
              placeholder: "예: 조선, 반도체, 원전",
            })),
            h(
              "div",
              { className: "stock-input-list" },
              ensureArray(group.rows).map(function (row, rowIndex) {
                const isFirst = rowIndex === 0;
                const isLast = rowIndex === ensureArray(group.rows).length - 1;
                return h(
                  "div",
                  { key: row.id, className: "stock-input-row" },
                  h("div", { className: "row-number" }, numberFormat(rowIndex + 1, 0)),
                  h(
                    "div",
                    { className: "stock-input-cell" },
                    h("input", {
                      value: row.query,
                      onChange: function (event) { searchStock(group.id, row.id, event.target.value); },
                      onKeyDown: function (event) { handleStockKeyDown(group.id, row, event); },
                      onFocus: selectTextOnFocus,
                      placeholder: "종목명 또는 종목코드",
                    }),
                    row.query && ensureArray(row.suggestions).length
                      ? h(
                          "div",
                          { className: "autocomplete-list inline" },
                          row.suggestions.map(function (item) {
                            const itemIndex = row.suggestions.indexOf(item);
                            return h(
                              "button",
                              {
                                key: row.id + "-" + item.code,
                                className: "autocomplete-item" + (itemIndex === (row.activeIndex || 0) ? " active" : ""),
                                onMouseEnter: function () { updateStockRow(group.id, row.id, { activeIndex: itemIndex }); },
                                onClick: function () { chooseStock(group.id, row.id, item); },
                              },
                              h("strong", null, item.name),
                              h("span", null, item.code + (item.market ? " \u00b7 " + item.market : ""))
                            );
                          })
                        )
                      : null
                  ),
                  h("div", { className: "stock-code-cell" }, row.code || "-"),
                  h(
                    "div",
                    { className: "stock-row-actions" },
                    h("button", {
                      className: "icon-button",
                      title: "위로",
                      disabled: isFirst,
                      onClick: function () { moveStockLine(group.id, row.id, -1); },
                    }, "?"),
                    h("button", {
                      className: "icon-button",
                      title: "아래로",
                      disabled: isLast,
                      onClick: function () { moveStockLine(group.id, row.id, 1); },
                    }, "?"),
                    h("button", {
                      className: "icon-button danger",
                      title: "삭제",
                      onClick: function () { removeStockLine(group.id, row.id); },
                    }, "×")
                  )
                );
              })
            ),
            h("button", { className: "mini-button", onClick: function () { addStockLine(group.id); } }, "종목 줄 추가")
          );
        })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "섹터 평균 미리보기"),
        loading
          ? h(LoadingBlock, { compact: true, title: "섹터 평균 미리보기 생성 중", label: "선택한 섹터의 종목 데이터를 수집하고 있습니다." })
          : h(SortableDataTable, {
              rows: preview ? preview.sector_rows : [],
              columns: sectorColumns,
              emptyMessage: "미리보기를 실행하면 섹터 평균 보기가 표시됩니다.",
            })
      ),
      h(
        "div",
        { className: "panel" },
        h(SectionTitle, null, "종목별 미리보기"),
        loading
          ? h(LoadingBlock, { compact: true, title: "종목 상세 데이터 로드 중", label: "FinanceDataReader로 종목 지표를 수집하고 있습니다." })
          : preview && ensureArray(preview.stock_rows).length
            ? h(
                "div",
                { className: "sector-stock-groups" },
                ensureArray(preview.sector_rows).map(function (sectorRow) {
                  const rows = ensureArray(preview.stock_rows).filter(function (row) {
                    return row.sector === sectorRow.sector;
                  });
                  if (!rows.length) {
                    return null;
                  }
                  return h(
                    "div",
                    { key: sectorRow.sector, className: "sector-stock-group" },
                    h(
                      "div",
                      { className: "sector-stock-heading" },
                      h("strong", null, sectorRow.sector),
                      h("span", null, numberFormat(rows.length, 0) + "종목")
                    ),
                    h(SortableDataTable, {
                      rows: rows,
                      columns: stockColumns,
                      emptyMessage: "해당 섹터의 종목 데이터가 없습니다.",
                    })
                  );
                })
              )
            : h(EmptyState, { message: "섹터와 종목을 입력한 뒤 미리보기를 눌러 주세요." }),
        preview && ensureArray(preview.errors).length
          ? h("div", { className: "notice-box" }, ensureArray(preview.errors).join(" / "))
          : null
      )
    );
  }


    return SectorSnapshotPageV2;
  }

  modules.sectorSnapshotPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
