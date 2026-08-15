(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const React = deps.React;
    const useState = React.useState;
    const buildMonthCells = deps.buildMonthCells;
    const EmptyState = deps.EmptyState;
    const ensureArray = deps.ensureArray;
    const ErrorPanel = deps.ErrorPanel;
    const fetchJson = deps.fetchJson;
    const formatDateLabel = deps.formatDateLabel;
    const h = deps.h;
    const isoDateOffset = deps.isoDateOffset;
    const LoadingPanel = deps.LoadingPanel;
    const monthLabel = deps.monthLabel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const shiftMonth = deps.shiftMonth;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

  function MarketCalendarPage() {
    const todayMonth = new Date().toISOString().slice(0, 7);
    const [activeMonth, setActiveMonth] = useState(todayMonth);
    const [form, setForm] = useState({
      date: isoDateOffset(0),
      title: "",
      category: "경제지표",
      market: "US",
      time: "",
      importance: "medium",
      note: "",
    });
    const [autoReloading, setAutoReloading] = useState(false);
    const cells = buildMonthCells(activeMonth);
    const calendarStart = cells.length ? cells[0].date : activeMonth + "-01";
    const calendarEnd = cells.length ? cells[cells.length - 1].date : activeMonth + "-31";
    const request = useFetchJson("/api/market-calendar?start=" + encodeURIComponent(calendarStart) + "&end=" + encodeURIComponent(calendarEnd));
    const data = request.data || {};
    const auto = data.auto || {};
    const byDate = data.by_date || {};
    const allEvents = ensureArray(data.events);
    const autoErrors = ensureArray(auto.errors);
    const upcomingEvents = allEvents.filter(function (event) {
      return String(event.date || "") >= isoDateOffset(0);
    }).slice(0, 14);
    const highEvents = allEvents.filter(function (event) {
      return event.importance === "high";
    });

    function updateForm(key, value) {
      setForm(function (current) {
        return Object.assign({}, current, { [key]: value });
      });
    }

    function addEvent() {
      if (!form.date || !form.title.trim()) {
        return;
      }
      fetchJson("/api/market-calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(function () {
        setForm(function (current) {
          return Object.assign({}, current, { title: "", note: "", time: "" });
        });
        request.reload();
      }).catch(function (error) {
        alert(error.message || String(error));
      });
    }

    function reloadAutoCalendar() {
      if (autoReloading) {
        return;
      }
      setAutoReloading(true);
      fetchJson(
        "/api/market-calendar/reload?start=" + encodeURIComponent(calendarStart) + "&end=" + encodeURIComponent(calendarEnd),
        { method: "POST", noCache: true }
      ).then(function () {
        request.reload();
      }).catch(function (error) {
        alert(error.message || String(error));
      }).finally(function () {
        setAutoReloading(false);
      });
    }

    function renderEventChip(event) {
      return h(
        "div",
        {
          key: event.id || event.title,
          className: "market-calendar-event " + (event.importance === "high" ? "high" : event.importance === "low" ? "low" : "medium"),
          title: [event.title, event.time, event.note].filter(Boolean).join(" · "),
        },
        h("span", { className: "market-calendar-category" }, event.category || "기타"),
        event.url
          ? h("a", { href: event.url, target: "_blank", rel: "noreferrer" }, event.title)
          : h("strong", null, event.title),
        h("small", null, [event.market, event.time].filter(Boolean).join(" · "))
      );
    }

    function renderCalendarDay(cell) {
      const events = ensureArray(byDate[cell.date]);
      const isToday = cell.date === isoDateOffset(0);
      return h(
        "button",
        {
          key: cell.date,
          type: "button",
          className: "market-calendar-day" + (cell.inMonth ? "" : " muted") + (isToday ? " today" : "") + (events.length ? " has-events" : ""),
          onClick: function () { updateForm("date", cell.date); },
        },
        h("div", { className: "market-calendar-day-head" },
          h("strong", null, cell.day),
          events.length ? h("span", null, events.length + "개") : null
        ),
        h("div", { className: "market-calendar-day-events" }, events.slice(0, 5).map(renderEventChip)),
        events.length > 5 ? h("em", null, "+" + (events.length - 5) + " more") : null
      );
    }

    function renderSourceCard(source) {
      return h(
        "a",
        { key: source.name, className: "market-calendar-source-card", href: source.url, target: "_blank", rel: "noreferrer" },
        h("strong", null, source.name),
        h("span", null, source.type),
        h("small", null, source.note)
      );
    }

    return h(
      "div",
      { className: "page market-calendar-page" },
      h(
        "div",
        { className: "panel hero-panel market-calendar-hero" },
        h("div", null,
          h("h1", { className: "page-title" }, "증시 일정"),
          h("p", { className: "page-copy compact-copy" }, "휴장, 경제지표, 실적, ETF 상장 같은 주요 일정을 월간 캘린더로 보고 Google Calendar에 가져올 수 있게 정리합니다.")
        ),
        h("div", { className: "market-calendar-actions" },
          h("button", { type: "button", className: "secondary-button", disabled: autoReloading, onClick: reloadAutoCalendar }, autoReloading ? "자동 로드 중" : "자동 일정 새로고침"),
          h("a", { className: "secondary-button", href: "/api/market-calendar.ics" }, "ICS 다운로드"),
          h("a", { className: "secondary-button", href: "https://calendar.google.com/calendar/u/0/r/settings/export", target: "_blank", rel: "noreferrer" }, "Google Calendar 가져오기")
        )
      ),
      h(
        "div",
        { className: "summary-grid-small market-calendar-summary" },
        h(SummaryCard, { label: "이번 화면 일정", value: numberFormat(allEvents.length, 0) + "개" }),
        h(SummaryCard, { label: "중요 일정", value: numberFormat(highEvents.length, 0) + "개" }),
        h(SummaryCard, { label: "다음 일정", value: upcomingEvents.length ? formatDateLabel(upcomingEvents[0].date) : "-", help: upcomingEvents.length ? upcomingEvents[0].title : "예정 없음" }),
        h(SummaryCard, { label: "자동 일정", value: numberFormat(auto.event_count, 0) + "개", help: auto.updated_at ? "최근 로드 " + auto.updated_at : "KIND/Investing.com 자동 로드" }),
        h(SummaryCard, { label: "국내 필터", value: "2000억+", help: "KIND 국내 기업 공시는 시가총액 2000억원 이상만 표시" })
      ),
      autoErrors.length
        ? h("div", { className: "notice-box warning" }, "자동 일정 일부를 불러오지 못했습니다: " + autoErrors.join(" / "))
        : null,
      h(
        "div",
        { className: "panel market-calendar-panel" },
        h("div", { className: "market-calendar-toolbar" },
          h("button", { type: "button", className: "calendar-arrow", onClick: function () { setActiveMonth(shiftMonth(activeMonth, -1)); } }, "?"),
          h("strong", null, monthLabel(activeMonth)),
          h("button", { type: "button", className: "calendar-arrow", onClick: function () { setActiveMonth(shiftMonth(activeMonth, 1)); } }, "?"),
          h("button", { type: "button", className: "secondary-button compact", onClick: function () { setActiveMonth(todayMonth); } }, "이번달")
        ),
        request.loading && !allEvents.length
          ? h(LoadingPanel, { label: request.label })
          : request.error
            ? h(ErrorPanel, { message: request.error, onRetry: request.reload })
            : h(React.Fragment, null,
                h("div", { className: "market-calendar-weekdays" }, ["월", "화", "수", "목", "금", "토", "일"].map(function (day) { return h("span", { key: day }, day); })),
                h("div", { className: "market-calendar-grid" }, cells.map(renderCalendarDay))
              )
      ),
      h(
        "div",
        { className: "market-calendar-bottom-grid" },
        h(
          "div",
          { className: "panel market-calendar-form-panel" },
          h(SectionTitle, null, "새 일정 추가"),
          h("div", { className: "market-calendar-form-grid" },
            h("label", null, h("span", null, "날짜"), h("input", { className: "text-input", type: "date", value: form.date, onChange: function (event) { updateForm("date", event.target.value); } })),
            h("label", null, h("span", null, "시장"), h("select", { className: "select-input", value: form.market, onChange: function (event) { updateForm("market", event.target.value); } }, ["KR", "US", "CN", "JP", "EU", "Global"].map(function (value) { return h("option", { key: value, value: value }, value); }))),
            h("label", null, h("span", null, "분류"), h("select", { className: "select-input", value: form.category, onChange: function (event) { updateForm("category", event.target.value); } }, ["경제지표", "실적", "휴장", "중앙은행", "상장/ETF", "정책", "기타"].map(function (value) { return h("option", { key: value, value: value }, value); }))),
            h("label", null, h("span", null, "중요도"), h("select", { className: "select-input", value: form.importance, onChange: function (event) { updateForm("importance", event.target.value); } }, [
              h("option", { key: "high", value: "high" }, "높음"),
              h("option", { key: "medium", value: "medium" }, "보통"),
              h("option", { key: "low", value: "low" }, "낮음"),
            ])),
            h("label", { className: "wide" }, h("span", null, "제목"), h("input", { className: "text-input", value: form.title, placeholder: "예: 미국 CPI, 엔비디아 실적(장후)", onChange: function (event) { updateForm("title", event.target.value); } })),
            h("label", null, h("span", null, "시간/구분"), h("input", { className: "text-input", value: form.time, placeholder: "장후, 21:30 등", onChange: function (event) { updateForm("time", event.target.value); } })),
            h("label", { className: "wide" }, h("span", null, "메모"), h("input", { className: "text-input", value: form.note, onChange: function (event) { updateForm("note", event.target.value); } })),
            h("button", { type: "button", className: "primary-button", onClick: addEvent }, "일정 추가")
          )
        ),
        h(
          "div",
          { className: "panel market-calendar-side-panel" },
          h(SectionTitle, null, "다가오는 주요 일정"),
          upcomingEvents.length
            ? h("div", { className: "market-calendar-upcoming-list" }, upcomingEvents.map(function (event) {
                return h("div", { key: event.id, className: "market-calendar-upcoming-item" },
                  h("span", null, formatDateLabel(event.date)),
                  h("strong", null, event.title),
                  h("small", null, [event.category, event.market, event.time].filter(Boolean).join(" · "))
                );
              }))
            : h(EmptyState, { compact: true, message: "다가오는 일정이 없습니다." })
        )
      ),
      h(
        "div",
        { className: "panel market-calendar-source-panel" },
        h("div", { className: "section-toolbar compact" },
          h(SectionTitle, null, "자동 수집된 소스"),
          h("span", { className: "summary-help" }, "국내 기업 일정은 KIND 공시, 해외 주요 이벤트는 Investing.com 경제 캘린더를 사용합니다.")
        ),
        h("div", { className: "market-calendar-source-grid" }, ensureArray(data.sources).map(renderSourceCard))
      )
    );
  }


    return MarketCalendarPage;
  }

  modules.marketCalendarPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
