(function (global) {
  "use strict";

  const modules = global.StockAppModules || {};

  function createPage(dependencies) {
    const deps = dependencies || {};
    const h = deps.h;
    const useEffect = deps.useEffect;
    const useMemo = deps.useMemo;
    const useState = deps.useState;
    const ensureArray = deps.ensureArray;
    const formatPercent = deps.formatPercent;
    const LoadingPanel = deps.LoadingPanel;
    const numberFormat = deps.numberFormat;
    const SectionTitle = deps.SectionTitle;
    const SummaryCard = deps.SummaryCard;
    const useFetchJson = deps.useFetchJson;

  function BuildingManagementPage() {
    const request = useFetchJson("/api/real-estate/building");
    const [data, setData] = useState(null);
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [draft, setDraft] = useState(null);
    const [unitEditMode, setUnitEditMode] = useState(false);
    const [serviceEditMode, setServiceEditMode] = useState(false);
    const [serviceEditSnapshot, setServiceEditSnapshot] = useState(null);
    const [calendarOpen, setCalendarOpen] = useState(true);
    const [calendarMonth, setCalendarMonth] = useState(function () {
      return new Date().toISOString().slice(0, 7);
    });
    const [calendarDate, setCalendarDate] = useState("");
    const [calendarDraft, setCalendarDraft] = useState(null);
    const [waterPanelOpen, setWaterPanelOpen] = useState(false);
    const [electricPanelOpen, setElectricPanelOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncingWater, setSyncingWater] = useState(false);
    const [syncingElectric, setSyncingElectric] = useState(false);
    const [syncingBank, setSyncingBank] = useState(false);
    const [exportingBankMonth, setExportingBankMonth] = useState(false);
    const [exportingBuildingSummary, setExportingBuildingSummary] = useState(false);
    const [bankDraft, setBankDraft] = useState(function () {
      return { date: isoToday(), kind: "income", category: "수동입금", amount: "", target: "", memo: "", payment_method: "현금인출" };
    });
    const [message, setMessage] = useState("");

    useEffect(function () {
      if (request.data && !data) {
        setData(request.data);
      }
    }, [request.data, data]);

    function money(value) {
      return numberFormat(Number(value || 0), 0) + "원";
    }

    function manwon(value) {
      return numberFormat(Number(value || 0), 0) + "\ub9cc\uc6d0";
    }

    function cleanNumberInput(value) {
      return String(value == null ? "" : value).replace(/,/g, "").replace(/[^\d.-]/g, "");
    }

    function formatNumberInput(value) {
      const raw = String(value == null ? "" : value);
      if (!raw) return "";
      const cleaned = cleanNumberInput(raw);
      if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return cleaned;
      const isNegative = cleaned.charAt(0) === "-";
      const unsigned = isNegative ? cleaned.slice(1) : cleaned;
      const parts = unsigned.split(".");
      const integerPart = parts[0] || "0";
      const decimalPart = parts.length > 1 ? "." + parts.slice(1).join("") : "";
      const formattedInteger = new Intl.NumberFormat("ko-KR").format(Number(integerPart || 0));
      return (isNegative ? "-" : "") + formattedInteger + decimalPart;
    }

    function parseNumberInput(value) {
      const cleaned = cleanNumberInput(value);
      const parsed = Number(cleaned || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function specialPhaseLabel(phase) {
      if (phase === "rent_free") return "렌트프리";
      if (phase === "settlement_support") return "창업정착지원";
      return "정상청구";
    }

    function areaText(area) {
      const source = area || {};
      const exclusive = Number(source.exclusive_m2 || 0);
      const parking = Number(source.parking_m2 || 0);
      const common = Number(source.common_m2 || 0);
      const salePy = Number(source.sale_py || 0);
      return numberFormat(exclusive + parking + common, 2) + "m² / " + numberFormat(salePy, 2) + "평";
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value || {}));
    }

    function isoToday() {
      return new Date().toISOString().slice(0, 10);
    }

    function calendarMonthLabel(value) {
      const parts = String(value || "").split("-");
      if (parts.length < 2) return value || "";
      return parts[0] + "년 " + Number(parts[1]) + "월";
    }

    function shiftCalendarMonth(delta) {
      const parts = String(calendarMonth || isoToday().slice(0, 7)).split("-");
      let year = Number(parts[0]);
      let monthIndex = Number(parts[1] || 1) - 1 + Number(delta || 0);
      if (!year || Number.isNaN(monthIndex)) return;
      year += Math.floor(monthIndex / 12);
      monthIndex = ((monthIndex % 12) + 12) % 12;
      setCalendarMonth(String(year).padStart(4, "0") + "-" + String(monthIndex + 1).padStart(2, "0"));
    }

    function renderCalendarMonthControls(position) {
      return h(
        "div",
        { className: "building-calendar-controls" + (position === "bottom" ? " bottom" : "") },
        h("button", { type: "button", className: "mini-button", onClick: function () { shiftCalendarMonth(-1); } }, "이전"),
        h("strong", null, calendarMonthLabel(calendarMonth)),
        h("button", { type: "button", className: "mini-button", onClick: function () { shiftCalendarMonth(1); } }, "다음")
      );
    }

    function lastDayOfMonth(monthText) {
      const parts = String(monthText || isoToday().slice(0, 7)).split("-");
      return new Date(Number(parts[0]), Number(parts[1] || 1), 0).getDate();
    }

    function paymentDateForMonth(monthText, ruleText) {
      const rule = String(ruleText || "");
      let day = 1;
      if (rule.indexOf("말일") >= 0) {
        day = lastDayOfMonth(monthText);
      } else {
        const match = rule.match(/매월\s*(\d{1,2})\s*일/);
        if (match) day = Number(match[1]);
      }
      day = Math.max(1, Math.min(day, lastDayOfMonth(monthText)));
      return monthText + "-" + String(day).padStart(2, "0");
    }

    function servicePaymentDateForMonth(monthText, service) {
      const rawDay = Number((service && (service.payment_day || service.due_day)) || 1);
      const day = Math.max(1, Math.min(rawDay || 1, lastDayOfMonth(monthText)));
      return monthText + "-" + String(day).padStart(2, "0");
    }

    function serviceAnnualPaymentDateForMonth(monthText, service) {
      const rawDate = String(
        (service && (service.payment_date || service.annual_payment_date || service.yearly_payment_date)) ||
          (service && service.start_date) ||
          ""
      ).slice(0, 10);
      if (!rawDate || rawDate.length < 10) return "";
      const monthDay = rawDate.slice(5, 10);
      if (!/^\d{2}-\d{2}$/.test(monthDay)) return "";
      const requestedMonth = monthDay.slice(0, 2);
      if (requestedMonth !== String(monthText || "").slice(5, 7)) return "";
      const rawDay = Number(monthDay.slice(3, 5));
      const day = Math.max(1, Math.min(rawDay || 1, lastDayOfMonth(monthText)));
      return monthText + "-" + String(day).padStart(2, "0");
    }

    function managementVatFlag(value) {
      const text = String(value || "").trim().toUpperCase();
      const compact = text.replace(/\s+/g, "");
      if (!compact) return "X";
      if (["O", "Y", "YES", "TRUE", "1"].indexOf(compact) >= 0) return "O";
      if (["X", "N", "NO", "FALSE", "0"].indexOf(compact) >= 0) return "X";
      if (compact.indexOf("미적용") >= 0 || compact.indexOf("없음") >= 0 || compact.indexOf("면세") >= 0 || compact.indexOf("포함") >= 0) return "X";
      if (compact.indexOf("적용") >= 0 || compact.indexOf("별도") >= 0) return "O";
      return "X";
    }

    function managementVatLabel(value) {
      return managementVatFlag(value) === "O" ? "O" : "X";
    }

    function expectedMonthlyChargeParts(contract, rent, managementFee) {
      const rentAmount = Math.max(0, Number(rent || 0));
      const managementAmount = Math.max(0, Number(managementFee || 0));
      const rentVat = Math.round(Number(rent || 0) * 0.1);
      const managementVat = managementVatFlag(contract && contract.vat_note) === "O"
        ? Math.round(managementAmount * 0.1)
        : 0;
      return {
        rent: rentAmount,
        rent_vat: rentVat,
        management_fee: managementAmount,
        management_vat: managementVat,
        vat_total: rentVat + managementVat,
        total: rentAmount + rentVat + managementAmount + managementVat,
      };
    }

    function isDateWithinLease(dateText, contract) {
      const start = String((contract && (contract.balance_date || contract.contract_date)) || "");
      const end = String((contract && contract.lease_end_date) || "");
      if (start && dateText < start.slice(0, 10)) return false;
      if (end && dateText > end.slice(0, 10)) return false;
      return true;
    }

    function monthlyDueDateWithinLease(monthText, contract) {
      const regularDueDate = paymentDateForMonth(monthText, contract && contract.rent_payment_day);
      const leaseStart = String((contract && (contract.balance_date || contract.contract_date)) || "").slice(0, 10);
      if (leaseStart && leaseStart.slice(0, 7) === monthText && regularDueDate < leaseStart) {
        return leaseStart;
      }
      return regularDueDate;
    }

    function expectedRentForDate(unit, dateText) {
      const contract = (unit && unit.contract) || {};
      const special = (unit && unit.special_terms) || {};
      if (special.paid_rent_start_date && dateText < String(special.paid_rent_start_date).slice(0, 10)) return 0;
      return Number(special.contract_monthly_rent || special.discounted_monthly_rent || contract.monthly_rent || 0);
    }

    function expectedManagementFeeForDate(unit, dateText, rent) {
      const contract = (unit && unit.contract) || {};
      const special = (unit && unit.special_terms) || {};
      let managementFee = Number(contract.management_fee || special.management_fee || 0);
      const currentMonthlyDue = Number(special.current_monthly_due || 0);
      const currentRentDue = Number(special.current_rent_due || 0);
      if (!managementFee && currentMonthlyDue > currentRentDue) {
        managementFee = currentMonthlyDue - currentRentDue;
      }
      const baseRent = Number(rent || special.contract_monthly_rent || special.discounted_monthly_rent || contract.monthly_rent || 0);
      if (baseRent && managementFee > Math.max(baseRent * 3, 2000000)) {
        return 0;
      }
      return Math.max(0, managementFee);
    }

    function plannedManagementFeeManwon(unit) {
      const rentPlan = (unit && unit.rent_plan) || {};
      const planned = Number(rentPlan.management_fee_manwon || 0);
      return planned;
    }

    function expectedEntriesForMonth(buildingData, monthText) {
      const rows = [];
      Object.keys((buildingData && buildingData.units) || {}).forEach(function (unitId) {
        const unit = buildingData.units[unitId] || {};
        const contract = unit.contract || {};
        if (!String(contract.tenant || contract.tenant_business || "").trim()) return;
        const target = unitId + "호";
        const memo = contract.tenant_business || contract.tenant || "";
        if (String(contract.contract_date || "").slice(0, 7) === monthText && Number(contract.contract_deposit || 0) > 0) {
          rows.push({ date: String(contract.contract_date).slice(0, 10), target: target, kind: "expected_income", category: "계약금", amount: Number(contract.contract_deposit || 0), signed: Number(contract.contract_deposit || 0), memo: memo });
        }
        if (String(contract.balance_date || "").slice(0, 7) === monthText && Number(contract.balance_amount || 0) > 0) {
          rows.push({ date: String(contract.balance_date).slice(0, 10), target: target, kind: "expected_income", category: "보증금", amount: Number(contract.balance_amount || 0), signed: Number(contract.balance_amount || 0), memo: memo });
        }
        const dueDate = monthlyDueDateWithinLease(monthText, contract);
        if (!isDateWithinLease(dueDate, contract)) return;
        const rent = expectedRentForDate(unit, dueDate);
        const managementFee = expectedManagementFeeForDate(unit, dueDate, rent);
        const charge = expectedMonthlyChargeParts(contract, rent, managementFee);
        if (charge.rent > 0) {
          rows.push({ date: dueDate, target: target, kind: "expected_income", category: "월세", amount: charge.rent, signed: charge.rent, memo: memo });
        }
        if (charge.management_fee > 0) {
          rows.push({ date: dueDate, target: target, kind: "expected_income", category: "관리비", amount: charge.management_fee, signed: charge.management_fee, memo: memo });
        }
        if (charge.vat_total > 0) {
          rows.push({
            date: dueDate,
            target: target,
            kind: "expected_income",
            category: "부가세",
            amount: charge.vat_total,
            signed: charge.vat_total,
            memo: "월세VAT " + money(charge.rent_vat) + " · 관리비VAT " + money(charge.management_vat) + " (" + managementVatLabel(contract.vat_note) + ")",
          });
        }
      });
      ensureArray(buildingData && buildingData.service_contracts).forEach(function (service) {
        const amount = Number(service.amount || 0);
        if (!amount) return;
        const startDate = String(service.start_date || "");
        if (startDate && monthText < startDate.slice(0, 7)) return;
        const cycle = String(service.cycle || "monthly");
        const dueDate = cycle === "yearly" || cycle === "annual"
          ? serviceAnnualPaymentDateForMonth(monthText, service)
          : servicePaymentDateForMonth(monthText, service);
        if (!dueDate) return;
        rows.push({ date: dueDate, target: "공통", kind: "expected_expense", category: service.category || "관리비/용역 예정", amount: amount, signed: -amount, memo: service.vendor || "" });
      });
      return rows;
    }

    function combineMonthlyIncomeExpectedRows(rows) {
      const grouped = {};
      const result = [];
      ensureArray(rows).forEach(function (row) {
        const category = String(row.category || "");
        const isMonthlyIncome = row.kind === "expected_income" && ["월세", "관리비", "부가세"].indexOf(category) >= 0;
        if (!isMonthlyIncome) {
          result.push(row);
          return;
        }
        const key = [row.date, row.target].join("|");
        if (!grouped[key]) {
          grouped[key] = {
            date: row.date,
            target: row.target,
            kind: "expected_income",
            category: "월세+관리비+부가세",
            amount: 0,
            signed: 0,
            memo: row.memo || "",
            parts: {},
          };
          result.push(grouped[key]);
        }
        grouped[key].amount += Number(row.amount || 0);
        grouped[key].signed += Number(row.signed || row.amount || 0);
        grouped[key].parts[category] = Number(grouped[key].parts[category] || 0) + Number(row.amount || 0);
      });
      return result;
    }

    function expectedAmountWithBreakdown(row) {
      const amountText = money(row && row.amount);
      const parts = (row && row.parts) || {};
      const hasMonthlyBreakdown = row && row.category === "월세+관리비+부가세" && (
        Number(parts["\uc6d4\uc138"] || 0) ||
        Number(parts["\ubd80\uac00\uc138"] || 0) ||
        Number(parts["관리비"] || 0)
      );
      if (!hasMonthlyBreakdown) {
        return amountText;
      }
      return amountText + "(" + [
        numberFormat(Number(parts["\uc6d4\uc138"] || 0), 0),
        numberFormat(Number(parts["\uad00\ub9ac\ube44"] || 0), 0),
        numberFormat(Number(parts["\ubd80\uac00\uc138"] || 0), 0),
      ].join("/") + ")";
    }

    function expectedAmountBreakdownTitle(row) {
      const parts = (row && row.parts) || {};
      if (!row || row.category !== "월세+관리비+부가세") return "";
      return "월세 " + money(parts["월세"]) +
        " / 관리비 " + money(parts["관리비"]) +
        " / 부가세 " + money(parts["부가세"]);
    }

    function openCalendarDate(dateText) {
      setCalendarDate(dateText);
      setCalendarDraft({
        target: "common",
        unit_id: "",
        date: dateText,
        kind: "income",
        category: "월세",
        amount: 0,
        memo: "",
      });
      setMessage("");
    }

    function closeCalendarDate() {
      setCalendarDate("");
      setCalendarDraft(null);
    }

    function setCalendarDraftField(field, value) {
      setCalendarDraft(function (current) {
        return { ...(current || {}), [field]: value };
      });
    }

    function openUnit(unitId) {
      const unit = data && data.units && data.units[unitId];
      if (!unit) return;
      setSelectedUnitId(unitId);
      setDraft(clone(unit));
      setUnitEditMode(false);
      setMessage("");
    }

    function closeUnit() {
      setSelectedUnitId("");
      setDraft(null);
      setUnitEditMode(false);
    }

    function setContract(field, value) {
      setDraft(function (current) {
        const next = clone(current);
        next.contract = next.contract || {};
        next.contract[field] = value;
        return next;
      });
    }

    function setWater(field, value) {
      setDraft(function (current) {
        const next = clone(current);
        next.water = next.water || {};
        next.water[field] = value;
        return next;
      });
    }

    function setTransaction(index, field, value) {
      setDraft(function (current) {
        const next = clone(current);
        next.transactions = ensureArray(next.transactions);
        next.transactions[index] = { ...(next.transactions[index] || {}), [field]: value };
        return next;
      });
    }

    function addTransaction() {
      setDraft(function (current) {
        const next = clone(current);
        next.transactions = ensureArray(next.transactions);
        next.transactions.unshift({
          id: Date.now(),
          date: new Date().toISOString().slice(0, 10),
          kind: "income",
          category: "월세",
          amount: 0,
          memo: "",
        });
        return next;
      });
    }

    function removeTransaction(index) {
      setDraft(function (current) {
        const next = clone(current);
        next.transactions = ensureArray(next.transactions).filter(function (_, itemIndex) {
          return itemIndex !== index;
        });
        return next;
      });
    }

    function setService(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = ensureArray(next.service_contracts);
        next.service_contracts[index] = { ...(next.service_contracts[index] || {}), [field]: value };
        return next;
      });
    }

    function addService() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = ensureArray(next.service_contracts);
        next.service_contracts.unshift({
          id: Date.now(),
          category: "CCTV",
          vendor: "",
          amount: 0,
          cycle: "monthly",
          start_date: "",
          payment_day: 1,
          payment_date: "",
          memo: "",
        });
        return next;
      });
    }

    function removeService(index) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = ensureArray(next.service_contracts).filter(function (_, itemIndex) {
          return itemIndex !== index;
        });
        return next;
      });
    }

    function setOperatingTransaction(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.operating_transactions = ensureArray(next.operating_transactions);
        next.operating_transactions[index] = { ...(next.operating_transactions[index] || {}), [field]: value };
        return next;
      });
    }

    function addOperatingTransaction() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.operating_transactions = ensureArray(next.operating_transactions);
        next.operating_transactions.unshift({
          id: Date.now(),
          date: new Date().toISOString().slice(0, 10),
          kind: "expense",
          category: "전기세 예정",
          amount: 0,
          memo: "",
        });
        return next;
      });
    }

    function removeOperatingTransaction(index) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.operating_transactions = ensureArray(next.operating_transactions).filter(function (_, itemIndex) {
          return itemIndex !== index;
        });
        return next;
      });
    }

    function setWaterBillingMonth(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.water_billing = next.water_billing || {};
        next.water_billing.months = ensureArray(next.water_billing.months);
        next.water_billing.months[index] = { ...(next.water_billing.months[index] || {}), [field]: value };
        return next;
      });
    }

    function setWaterReading(monthIndex, unitId, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.water_billing = next.water_billing || {};
        next.water_billing.months = ensureArray(next.water_billing.months);
        const month = { ...(next.water_billing.months[monthIndex] || {}) };
        month.readings = { ...(month.readings || {}), [unitId]: value };
        next.water_billing.months[monthIndex] = month;
        return next;
      });
    }

    function setElectricityBillingMonth(index, field, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.electricity_billing = next.electricity_billing || {};
        next.electricity_billing.months = ensureArray(next.electricity_billing.months);
        next.electricity_billing.months[index] = { ...(next.electricity_billing.months[index] || {}), [field]: value };
        return next;
      });
    }

    function setElectricityBill(monthIndex, unitId, value) {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.electricity_billing = next.electricity_billing || {};
        next.electricity_billing.months = ensureArray(next.electricity_billing.months);
        const month = { ...(next.electricity_billing.months[monthIndex] || {}) };
        month.bills = { ...(month.bills || {}), [unitId]: value };
        month.total_bill = Object.keys(month.bills).reduce(function (sum, key) { return sum + Number(month.bills[key] || 0); }, 0);
        next.electricity_billing.months[monthIndex] = month;
        return next;
      });
    }

    function addElectricityMonth() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.electricity_billing = next.electricity_billing || {};
        next.electricity_billing.months = ensureArray(next.electricity_billing.months);
        next.electricity_billing.months.unshift({ month: calendarMonth, total_bill: 0, bills: {}, memo: "" });
        return next;
      });
      setElectricPanelOpen(true);
    }

    async function saveBuildingData(payload, shouldCloseUnit) {
      const nextData = clone(payload || data || request.data || {});
      setSaving(true);
      setMessage("");
      try {
        const saved = await postJson("/api/real-estate/building", { data: nextData });
        setData(saved);
        setMessage(saved.excel_sync && saved.excel_sync.message ? "저장되었습니다. " + saved.excel_sync.message : "저장되었습니다.");
        if (shouldCloseUnit) closeUnit();
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSaving(false);
      }
    }

    async function importBankFiles() {
      setSyncingBank(true);
      setMessage("");
      try {
        const result = await postJson("/api/real-estate/bank/import-files", {});
        if (result.real_estate) {
          setData(result.real_estate);
        }
        const files = ensureArray(result.files);
        const failed = files.filter(function (file) { return file.error; });
        setMessage(
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            numberFormat(result.imported || 0, 0) +
            "건을 불러왔습니다." +
            (failed.length ? " 확인 필요 파일 " + numberFormat(failed.length, 0) + "개" : "")
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSyncingBank(false);
      }
    }

    async function exportBankMonthlyWorkbook() {
      setExportingBankMonth(true);
      setMessage("");
      try {
        await postDownload(
          "/api/real-estate/bank/export.xlsx",
          { month: calendarMonth },
          "building_bank_" + String(calendarMonth || "").replace("-", "") + ".xlsx"
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setExportingBankMonth(false);
      }
    }

    async function exportBuildingSummaryWorkbook() {
      setExportingBuildingSummary(true);
      setMessage("");
      try {
        await postDownload(
          "/api/real-estate/building/export.xlsx",
          { month: calendarMonth },
          "building_summary_" + String(calendarMonth || "").replace("-", "") + ".xlsx"
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setExportingBuildingSummary(false);
      }
    }

    async function syncWaterFromTelegram() {
      setSyncingWater(true);
      setMessage("");
      try {
        const result = await postJson("/api/real-estate/water/sync-telegram", {
          month: "",
          limit: 500,
        });
        if (result.real_estate) {
          setData(result.real_estate);
        }
        setWaterPanelOpen(true);
        const syncedMonths = ensureArray(result.synced_months);
        const latest = syncedMonths.length ? syncedMonths[syncedMonths.length - 1] : {};
        setMessage(
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            numberFormat(result.synced_count || syncedMonths.length || 0, 0) +
            "건을 반영했습니다. 최근 " +
            (latest.month || result.month || "") +
            " 총사용량 " +
            numberFormat(latest.total_usage_m3 || result.parsed && result.parsed.total_usage_m3 || 0, 2) +
            "m³ / 총요금 " +
            money(latest.total_bill || result.parsed && result.parsed.total_bill || 0)
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSyncingWater(false);
      }
    }

    async function syncElectricityFromTelegram() {
      setSyncingElectric(true);
      setMessage("");
      try {
        const result = await postJson("/api/real-estate/electricity/sync-telegram", {
          month: "",
          limit: 800,
        });
        if (result.real_estate) {
          setData(result.real_estate);
        }
        setElectricPanelOpen(true);
        setMessage(
          "하나은행 사이트에서 내려받은 월별 입출금 엑셀/CSV 파일(예: 거래내역조회_05월)을 상가_관리_데이터 폴더에 넣고 새로고침하면, 예정 월세/관리비와 실제 입출금을 대조합니다." +
            numberFormat(result.synced_count || 0, 0) +
            "건을 반영했습니다." +
            (result.month ? " 최근 " + result.month : "")
        );
      } catch (err) {
        setMessage(err.message || String(err));
      } finally {
        setSyncingElectric(false);
      }
    }

    async function saveCalendarTransaction() {
      if (!calendarDraft) return;
      const nextData = clone(data || request.data || {});
      const tx = {
        id: Date.now(),
        date: calendarDraft.date || calendarDate || isoToday(),
        kind: calendarDraft.kind || "income",
        category: calendarDraft.category || "",
        amount: calendarDraft.amount || 0,
        memo: calendarDraft.memo || "",
      };
      if (calendarDraft.target === "unit" && calendarDraft.unit_id && nextData.units && nextData.units[calendarDraft.unit_id]) {
        nextData.units[calendarDraft.unit_id].transactions = ensureArray(nextData.units[calendarDraft.unit_id].transactions);
        nextData.units[calendarDraft.unit_id].transactions.unshift(tx);
      } else {
        nextData.operating_transactions = ensureArray(nextData.operating_transactions);
        nextData.operating_transactions.unshift(tx);
      }
      await saveBuildingData(nextData, false);
      closeCalendarDate();
    }

    function setBankDraftField(field, value) {
      setBankDraft(function (current) {
        return { ...(current || {}), [field]: value };
      });
    }

    async function saveManualBankTransaction() {
      const amount = parseNumberInput(bankDraft && bankDraft.amount);
      if (!amount) {
        setMessage("\uae08\uc561\uc744 \uc785\ub825\ud55c \ub4a4 \uc800\uc7a5\ud574 \uc8fc\uc138\uc694.");
        return;
      }
      const nextData = clone(data || request.data || {});
      nextData.bank_transactions = ensureArray(nextData.bank_transactions);
      nextData.bank_transactions.unshift({
        id: "manual_" + Date.now(),
        source: "manual_bank_file",
        date: (bankDraft && bankDraft.date) || isoToday(),
        time: "",
        kind: (bankDraft && bankDraft.kind) || "income",
        category: (bankDraft && bankDraft.category) || ((bankDraft && bankDraft.kind) === "expense" ? "수동출금" : "수동입금"),
        target: (bankDraft && bankDraft.target) || "",
        payment_method: (bankDraft && bankDraft.payment_method) || "현금인출",
        amount: Math.round(Math.abs(amount)),
        balance: 0,
        memo: (bankDraft && bankDraft.memo) || "",
        source_file: "수동추가",
        source_row: "",
      });
      await saveBuildingData(nextData, false);
      setBankDraft({ date: isoToday(), kind: "income", category: "수동입금", amount: "", target: "", memo: "", payment_method: "현금인출" });
    }

    async function deleteBankTransaction(tx) {
      if (!tx || !tx.id) return;
      if (!window.confirm("이 입출금 내역을 제거할까요?")) return;
      const nextData = clone(data || request.data || {});
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).filter(function (item) {
        return String(item.id || "") !== String(tx.id || "");
      });
      if (tx.source === "bank_file") {
        nextData.bank_transaction_exclusions = ensureArray(nextData.bank_transaction_exclusions);
        if (nextData.bank_transaction_exclusions.indexOf(String(tx.id)) < 0) {
          nextData.bank_transaction_exclusions.push(String(tx.id));
        }
      }
      await saveBuildingData(nextData, false);
    }

    async function saveBankMemoTarget(tx, targetValue) {
      if (!tx || !tx.id) return;
      const nextData = clone(data || request.data || {});
      const memoKey = String(tx.memo || "").trim();
      const nextTarget = String(targetValue || "").trim();
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).map(function (item) {
        const sameMemo = memoKey && String(item.memo || "").trim() === memoKey;
        const sameId = String(item.id || "") === String(tx.id || "");
        if (!sameMemo && !sameId) return item;
        return { ...item, target: nextTarget };
      });
      nextData.bank_memo_unit_map = { ...(nextData.bank_memo_unit_map || {}) };
      if (memoKey) {
        if (nextTarget) {
          nextData.bank_memo_unit_map[memoKey] = nextTarget;
        } else {
          delete nextData.bank_memo_unit_map[memoKey];
        }
      }
      await saveBuildingData(nextData, false);
    }

    async function saveBankMemoCategory(tx, categoryValue) {
      if (!tx || !tx.id) return;
      const nextData = clone(data || request.data || {});
      const memoKey = String(tx.memo || "").trim();
      const nextCategory = String(categoryValue || "").trim();
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).map(function (item) {
        const sameId = String(item.id || "") === String(tx.id || "");
        if (!sameId) return item;
        return { ...item, category: nextCategory || item.category || "" };
      });
      nextData.bank_memo_category_map = { ...(nextData.bank_memo_category_map || {}) };
      if (memoKey) {
        if (nextCategory) {
          nextData.bank_memo_category_map[memoKey] = nextCategory;
        } else {
          delete nextData.bank_memo_category_map[memoKey];
        }
      }
      await saveBuildingData(nextData, false);
    }

    async function saveBankPaymentMethod(tx, paymentMethodValue) {
      if (!tx || !tx.id) return;
      const nextData = clone(data || request.data || {});
      const nextPaymentMethod = String(paymentMethodValue || "현금인출").trim() || "현금인출";
      nextData.bank_transactions = ensureArray(nextData.bank_transactions).map(function (item) {
        const sameId = String(item.id || "") === String(tx.id || "");
        if (!sameId) return item;
        return { ...item, payment_method: nextPaymentMethod };
      });
      await saveBuildingData(nextData, false);
    }

    async function saveUnit() {
      if (!data || !draft || !selectedUnitId) return;
      const nextData = clone(data);
      const nextDraft = clone(draft);
      nextDraft.contract = {
        ...((nextDraft && nextDraft.contract) || {}),
        vat_note: managementVatFlag(nextDraft && nextDraft.contract && nextDraft.contract.vat_note),
      };
      nextData.units[selectedUnitId] = nextDraft;
      saveBuildingData(nextData, true);
    }

    async function saveServices() {
      await saveBuildingData(building, false);
      setServiceEditMode(false);
      setServiceEditSnapshot(null);
    }

    function beginServiceEdit() {
      setServiceEditSnapshot(clone(serviceContracts));
      setServiceEditMode(true);
    }

    function cancelServiceEdit() {
      setData(function (current) {
        const next = clone(current || data || request.data || {});
        next.service_contracts = clone(serviceEditSnapshot || []);
        return next;
      });
      setServiceEditMode(false);
      setServiceEditSnapshot(null);
    }

    function renderField(label, value, setter, type) {
      const isNumberField = type === "number";
      return h(
        "label",
        { className: "building-field" },
        h("span", null, label),
        h("input", {
          type: isNumberField ? "text" : type || "text",
          inputMode: isNumberField ? "decimal" : undefined,
          value: isNumberField ? formatNumberInput(value) : value == null ? "" : value,
          onChange: function (event) { setter(isNumberField ? cleanNumberInput(event.target.value) : event.target.value); },
        })
      );
    }

    function renderSelectField(label, value, setter, options) {
      const normalizedValue = value == null || value === "" ? (options[0] && options[0].value) || "" : value;
      return h(
        "label",
        { className: "building-field" },
        h("span", null, label),
        h(
          "select",
          {
            value: normalizedValue,
            onChange: function (event) { setter(event.target.value); },
          },
          options.map(function (option) {
            return h("option", { key: option.value, value: option.value }, option.label);
          })
        )
      );
    }

    function renderUnit(unitId) {
      const unit = data && data.units && data.units[unitId] ? data.units[unitId] : {};
      const contract = unit.contract || {};
      const area = unit.area || {};
      const rentPlan = unit.rent_plan || {};
      const special = unit.special_terms || {};
      const monthlyMoney = (unitMonthlyMoneyMap && unitMonthlyMoneyMap[unitId]) || {};
      const tenant = String(contract.tenant || "").trim();
      const tenantBusiness = String(contract.tenant_business || "").trim();
      const displayTenant = tenantBusiness || tenant;
      const occupied = Boolean(tenant || tenantBusiness);
      const rentDue = occupied ? Number(monthlyMoney.expected_rent || 0) : 0;
      const managementDue = occupied ? Number(monthlyMoney.expected_management || 0) : 0;
      const expectedTotal = occupied ? rentDue + managementDue : 0;
      const paidTotal = occupied ? Number(monthlyMoney.paid_total || 0) : 0;
      return h(
        "button",
        {
          key: unitId,
          type: "button",
          className: "building-unit-card" + (occupied ? " occupied" : " vacant"),
          onClick: function () { openUnit(unitId); },
        },
        h("strong", null, unitId),
        h("span", null, displayTenant || "공실"),
        h("small", null, areaText(area)),
        h("small", null, "계획 " + manwon(rentPlan.deposit_manwon) + " / 월 " + manwon(rentPlan.monthly_rent_manwon)),
        special.discount_rate ? h("small", null, "특별조건 " + numberFormat(special.discount_rate, 0) + "% 할인 · " + specialPhaseLabel(special.current_phase)) : null,
        h(
          "div",
          { className: "building-unit-money" },
          h(
            "em",
            { className: "due" },
            h("span", null, calendarMonth + " \uc608\uc815 \uccad\uad6c\uc561"),
            h("strong", null, money(expectedTotal)),
            h("small", null, "월세 " + money(rentDue) + " · 관리 " + money(managementDue))
          ),
          h(
            "em",
            { className: "paid" },
            h("span", null, calendarMonth + " \uc2e4\uc81c \uc785\uae08\uc561"),
            h("strong", null, money(paidTotal)),
            h("small", null, paidTotal >= expectedTotal && expectedTotal > 0 ? "납부 확인" : expectedTotal > 0 ? "미납 " + money(Math.max(0, expectedTotal - paidTotal)) : "입금 없음")
          )
        )
      );
    }

    const building = data || request.data || {};
    const summary = building.summary || {};
    const areaTotals = summary.area_totals || {};
    const layout = ensureArray(building.layout).slice().reverse();
    const serviceContracts = ensureArray(building.service_contracts);
    const operatingTransactions = ensureArray(building.operating_transactions);
    const bankTransactions = ensureArray(building.bank_transactions);
    const waterBillingMonths = ensureArray(building.water_billing && building.water_billing.months);
    const waterBillingRows = ensureArray(summary.water_billing_rows);
    const waterYearlyRows = ensureArray(summary.water_yearly_rows);
    const unitIds = Object.keys(building.units || {});
    const electricityBilling = building.electricity_billing || {};
    const electricityBillingMonths = ensureArray(electricityBilling.months);
    const electricityBillingRows = ensureArray(summary.electricity_billing_rows);
    const unitMonthlyMoneyMap = {};
    function normalizeUnitTarget(target) {
      const compact = String(target || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      return unitIds.find(function (unitId) {
        return compact === String(unitId).toUpperCase() || compact.indexOf(String(unitId).toUpperCase()) === 0;
      }) || "";
    }
    function getUnitMonthlyMoney(unitId) {
      unitMonthlyMoneyMap[unitId] = unitMonthlyMoneyMap[unitId] || {
        expected_total: 0,
        expected_rent: 0,
        expected_management: 0,
        paid_total: 0,
      };
      return unitMonthlyMoneyMap[unitId];
    }
    expectedEntriesForMonth(building, calendarMonth).forEach(function (row) {
      if (row.kind !== "expected_income") return;
      const unitId = normalizeUnitTarget(row.target);
      if (!unitId) return;
      const moneyBucket = getUnitMonthlyMoney(unitId);
      const amount = Number(row.amount || 0);
      const category = String(row.category || "");
      if (category.indexOf("월세") >= 0) {
        moneyBucket.expected_rent += amount;
        moneyBucket.expected_total += amount;
      } else if (category.indexOf("관리") >= 0) {
        moneyBucket.expected_management += amount;
        moneyBucket.expected_total += amount;
      }
    });
    function addActualUnitPayment(tx, fallbackUnitId) {
      if (!tx || String(tx.date || "").slice(0, 7) !== calendarMonth || tx.kind === "expense") return;
      const category = String(tx.category || "");
      const isMonthlyPayment = category.indexOf("월세") >= 0 || category.indexOf("관리") >= 0 || category.indexOf("부가세") >= 0;
      if (!isMonthlyPayment) return;
      const unitId = fallbackUnitId || normalizeUnitTarget(tx.target);
      if (!unitId) return;
      getUnitMonthlyMoney(unitId).paid_total += Number(tx.amount || 0);
    }
    Object.keys((building && building.units) || {}).forEach(function (unitId) {
      ensureArray(building.units[unitId] && building.units[unitId].transactions).forEach(function (tx) {
        addActualUnitPayment(tx, unitId);
      });
    });
    bankTransactions.forEach(function (tx) {
      addActualUnitPayment(tx, "");
    });
    function annualWaterExpectedEntriesForMonth(monthText) {
      if (String(monthText || "").slice(5, 7) !== "12") return [];
      const year = String(monthText || "").slice(0, 4);
      const row = waterYearlyRows.find(function (item) { return String(item.year || "") === year; });
      if (!row) return [];
      return ensureArray(row.units)
        .filter(function (unit) { return Number(unit.amount || 0) > 0; })
        .map(function (unit) {
          const amount = Number(unit.amount || 0);
          return {
            date: year + "-12-31",
            target: unit.unit_id + "호",
            kind: "expected_income",
            category: "수도세",
            amount: amount,
            signed: amount,
            memo: year + "년 수도세 연말 정산",
          };
        });
    }
    function calendarEntryTargetLabel(entry) {
      const target = String((entry && entry.target) || "").trim();
      if (target && target !== "은행") return target;
      if (entry && entry.kind === "event") return "일정";
      if (entry && (entry.kind === "expected_income" || entry.kind === "expected_expense")) return "예정";
      return entry && Number(entry.signed || 0) < 0 ? "출금" : "입금";
    }
    function calendarEntryChipLabel(entry) {
      const parts = [];
      const target = String((entry && entry.target) || "").trim();
      const category = String((entry && entry.category) || "").trim();
      if (target && target !== "은행") parts.push(target);
      if (category) parts.push(category);
      if (entry && entry.kind !== "event") {
        const signed = Number(entry.signed || 0);
        parts.push((signed >= 0 ? "+" : "") + money(signed));
      }
      return parts.join(" ");
    }
    const electricCustomers = ["common"].concat(unitIds).map(function (unitId) {
      const customer = (electricityBilling.customers && electricityBilling.customers[unitId]) || {};
      return {
        unit_id: unitId,
        label: customer.label || (unitId === "common" ? "상가" : unitId + "호"),
        customer_no: customer.customer_no || "",
      };
    });
    const calendarEntriesByDate = useMemo(function () {
      const grouped = {};
      function pushEntry(dateText, entry) {
        if (!dateText) return;
        grouped[dateText] = grouped[dateText] || [];
        grouped[dateText].push(entry);
      }
      Object.keys((building && building.units) || {}).forEach(function (unitId) {
        const unit = building.units[unitId] || {};
        const contract = unit.contract || {};
        [
          ["contract_date", "계약일"],
          ["balance_date", "잔금/인도일"],
          ["lease_end_date", "임대종료일"],
          ["rent_start_date", "월세 개시일"],
        ].forEach(function (pair) {
          const dateText = contract[pair[0]];
          if (dateText) {
            pushEntry(dateText, {
              unit_id: unitId,
              target: unitId + "호",
              kind: "event",
              category: pair[1],
              amount: 0,
              signed: 0,
              memo: contract.tenant || contract.tenant_business || "",
            });
          }
        });
        const special = unit.special_terms || {};
        [
          ["rent_free_end_date", "렌트프리 종료"],
          ["settlement_support_end_date", "창업정착지원 종료"],
          ["paid_rent_start_date", "월세 정상청구 시작"],
        ].forEach(function (pair) {
          const dateText = special[pair[0]];
          if (dateText) {
            pushEntry(dateText, {
              unit_id: unitId,
              target: unitId + "호",
              kind: "event",
              category: pair[1],
              amount: 0,
              signed: 0,
              memo: special.source || "특별임대조건",
            });
          }
        });
        ensureArray(unit.transactions).forEach(function (tx) {
          const amount = Number(tx.amount || 0);
          pushEntry(tx.date, {
            unit_id: unitId,
            target: unitId + "호",
            kind: tx.kind || "income",
            category: tx.category || "",
            amount: amount,
            signed: tx.kind === "expense" ? -amount : amount,
            memo: tx.memo || "",
          });
        });
      });
      ensureArray(building.service_contracts).forEach(function (service) {
        if (service.start_date) {
          pushEntry(service.start_date, {
            unit_id: "",
            target: "공통",
            kind: "event",
            category: "서비스 시작",
            amount: 0,
            signed: 0,
            memo: service.category || "",
          });
        }
      });
      ensureArray(building.operating_transactions).forEach(function (tx) {
        const amount = Number(tx.amount || 0);
        pushEntry(tx.date, {
          unit_id: "",
          target: "\uc6b4\uc601\ube44",
          kind: tx.kind || "expense",
          category: tx.category || "",
          amount: amount,
          signed: tx.kind === "income" ? amount : -amount,
          memo: tx.memo || "",
        });
      });
      ensureArray(building.bank_transactions).forEach(function (tx) {
        const amount = Number(tx.amount || 0);
        pushEntry(tx.date, {
          unit_id: "",
          target: tx.target || "",
          kind: tx.kind || "income",
          category: tx.category || "하나은행 엑셀",
          amount: amount,
          signed: tx.kind === "expense" ? -amount : amount,
          memo: tx.memo || "",
        });
      });
      electricityBillingRows.forEach(function (row) {
        const amount = Number(row.total_bill || 0);
        if (!amount || !row.month) return;
        pushEntry(row.due_date || row.month + "-25", {
          unit_id: "",
          target: "\uc804\uae30\uc694\uae08",
          kind: "expected_expense",
          category: "\uc804\uae30\uc694\uae08 \uccad\uad6c",
          amount: amount,
          signed: -amount,
          memo: "한국전력 고객번호별 청구 합계",
        });
      });
      combineMonthlyIncomeExpectedRows(expectedEntriesForMonth(building, calendarMonth)).forEach(function (entry) {
        pushEntry(entry.date, entry);
      });
      annualWaterExpectedEntriesForMonth(calendarMonth).forEach(function (entry) {
        pushEntry(entry.date, entry);
      });
      return grouped;
    }, [building, calendarMonth, electricityBillingRows, waterYearlyRows]);
    const calendarDays = useMemo(function () {
      const parts = String(calendarMonth || isoToday().slice(0, 7)).split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      if (!year || !month) return [];
      const first = new Date(year, month - 1, 1);
      const daysInMonth = new Date(year, month, 0).getDate();
      const cells = [];
      for (let blank = 0; blank < first.getDay(); blank += 1) {
        cells.push(null);
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateText = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        const entries = ensureArray(calendarEntriesByDate[dateText]);
        const net = entries.reduce(function (sum, item) { return sum + Number(item.signed || 0); }, 0);
        cells.push({ date: dateText, day: day, entries: entries, net: net });
      }
      return cells;
    }, [calendarMonth, calendarEntriesByDate]);
    const selectedCalendarEntries = ensureArray(calendarEntriesByDate[calendarDate]);
    const bankImport = building.bank_import || {};
    const bankImportFiles = ensureArray(bankImport.file_results);
    const bankImportErrors = bankImportFiles.filter(function (file) { return file.error; });
    const bankMemoUnitMap = building.bank_memo_unit_map || {};
    const bankMemoCategoryMap = building.bank_memo_category_map || {};
    const expectedBankRows = combineMonthlyIncomeExpectedRows(expectedEntriesForMonth(building, calendarMonth)).concat(annualWaterExpectedEntriesForMonth(calendarMonth));
    const actualBankRows = [];
    Object.keys((building && building.units) || {}).forEach(function (unitId) {
      ensureArray(building.units[unitId] && building.units[unitId].transactions).forEach(function (tx) {
        if (String(tx.date || "").slice(0, 7) === calendarMonth) actualBankRows.push({ ...tx, target: unitId + "호" });
      });
    });
    operatingTransactions.forEach(function (tx) {
      if (String(tx.date || "").slice(0, 7) === calendarMonth) actualBankRows.push({ ...tx, target: "공통" });
    });
    bankTransactions.forEach(function (tx) {
      if (String(tx.date || "").slice(0, 7) === calendarMonth) {
        const memoKey = String(tx.memo || "").trim();
        const mappedTarget = String(tx.target || bankMemoUnitMap[memoKey] || "");
        actualBankRows.push({
          ...tx,
          target: mappedTarget,
          display_target: mappedTarget || "은행",
          category: defaultBankCategory(tx, mappedTarget),
          source: tx.source || "bank_file",
        });
      }
    });
    const bankExpectedIncome = expectedBankRows.filter(function (row) { return row.kind === "expected_income"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const bankExpectedExpense = expectedBankRows.filter(function (row) { return row.kind === "expected_expense"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const bankActualIncome = actualBankRows.filter(function (row) { return row.kind !== "expense"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const bankActualExpense = actualBankRows.filter(function (row) { return row.kind === "expense"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const selectedMonthActualIncome = actualBankRows
      .filter(function (row) { return row.kind !== "expense"; })
      .reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const selectedMonthActualExpense = actualBankRows
      .filter(function (row) { return row.kind === "expense" && !isProfitWithdrawalCategory(row.category); })
      .reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const selectedMonthActualNet = selectedMonthActualIncome - selectedMonthActualExpense;
    const bankIncomeCategoryOptions = ["가계약금", "계약금", "보증금", "자본납입", "월세+관리비+부가세", "월세", "관리비", "수도세", "부가세", "기타입금"];
    const bankExpenseCategoryOptions = ["세금", "수도세", "전기세", "전기안전관리자", "청소용역", "CCTV", "엘리베이터", "세무사", "보험", "승강기 보험", "화재보험", "기타 결제", "수익 출금"];
    const bankPaymentMethodOptions = ["현금인출", "하나카드", "삼성카드", "신한카드", "현대카드"];
    const serviceCategoryOptions = ["CCTV", "\uc5d8\ub9ac\ubca0\uc774\ud130", "\uc138\ubb34\uc0ac", "\uccad\uc18c\uc6a9\uc5ed", "\uc804\uae30\uc548\uc804\uad00\ub9ac\uc790", "\ubcf4\ud5d8", "\uc2b9\uac15\uae30 \ubcf4\ud5d8", "\ud654\uc7ac\ubcf4\ud5d8"];
    const bankTargetOptions = [
      { value: "", label: "미지정" },
      { value: "공통", label: "공통" },
    ].concat(unitIds.map(function (unitId) {
      return { value: unitId + "호", label: unitId + "호" };
    }));
    function defaultBankCategory(tx, mappedTarget) {
      const isExpense = tx && tx.kind === "expense";
      const memoKey = String((tx && tx.memo) || "").trim();
      const savedCategory = String((isExpense && memoKey && bankMemoCategoryMap[memoKey]) || (tx && tx.category) || "").trim();
      const genericIncome = !savedCategory || savedCategory === "은행입금" || savedCategory === "수동입금" || savedCategory === "기타입금";
      const genericExpense = !savedCategory || savedCategory === "은행출금" || savedCategory === "수동출금" || savedCategory === "기타출금";
      if (isExpense) {
        return genericExpense ? "세금" : savedCategory;
      }
      if (!savedCategory || savedCategory === "은행입금" || savedCategory === "수동입금") {
        return mappedTarget ? "월세+관리비+부가세" : "기타입금";
      }
      return savedCategory;
    }
    function sameBankCategoryForExpected(txCategory, rowCategory) {
      const txText = String(txCategory || "").replace(" 예정", "").trim();
      const rowText = String(rowCategory || "").replace(" 예정", "").trim();
      if (!rowText || !txText) return true;
      if (txText === rowText) return true;
      if (txText === "월세+관리비+부가세") {
        return rowText === "월세" || rowText === "관리비" || rowText === "부가세" ||
          rowText.indexOf("월세") >= 0 || rowText.indexOf("관리") >= 0 || rowText.indexOf("부가세") >= 0;
      }
      if (rowText === "월세+관리비+부가세") {
        return txText === "월세" || txText === "관리비" || txText === "부가세" ||
          txText.indexOf("월세") >= 0 || txText.indexOf("관리") >= 0 || txText.indexOf("부가세") >= 0;
      }
      return false;
    }
    function isProfitWithdrawalCategory(value) {
      return String(value || "").replace(/\s+/g, "") === "수익출금";
    }
    const bankLedgerRows = bankTransactions
      .filter(function (tx) { return String(tx.date || "").slice(0, 7) === calendarMonth; })
      .slice()
      .sort(function (a, b) {
        return (String(b.date || "") + " " + String(b.time || "") + " " + String(b.source_row || "")).localeCompare(String(a.date || "") + " " + String(a.time || "") + " " + String(a.source_row || ""));
      });
    const bankIncomeRows = bankLedgerRows.filter(function (tx) { return tx.kind !== "expense"; });
    const bankExpenseRows = bankLedgerRows.filter(function (tx) { return tx.kind === "expense"; });
    const defaultInvestment = {
      acquired_date: "2025-08-28",
      purchase_price: 1250000000,
      land_supply_price: 890000000,
      building_supply_price: 360000000,
      brokerage_fee: 11250000,
      acquisition_tax_legal_fee: 62209922,
      completion_date: "2024-07-29",
      registration_date: "2025-07-02",
      defect_warranty_years: 5,
    };
    const investment = { ...defaultInvestment, ...((building && building.investment) || {}) };
    const investmentBasis =
      Number(investment.purchase_price || 0) +
      Number(investment.brokerage_fee || 0) +
      Number(investment.acquisition_tax_legal_fee || 0);
    const depositYieldAnnualRate = 0.05;
    const depositYieldMonthly = Math.round(Number(summary.total_deposit || 0) * depositYieldAnnualRate / 12);
    const buildingDepreciationMonthly = Math.round(Number(investment.building_supply_price || 0) / 360);

    function monthKeyFromDate(dateText) {
      const text = String(dateText || "").slice(0, 7);
      return /^\d{4}-\d{2}$/.test(text) ? text : "";
    }

    function shiftMonthKey(monthText, delta) {
      const parts = String(monthText || "").split("-");
      let year = Number(parts[0]);
      let monthIndex = Number(parts[1] || 1) - 1 + Number(delta || 0);
      if (!year || Number.isNaN(monthIndex)) return "";
      year += Math.floor(monthIndex / 12);
      monthIndex = ((monthIndex % 12) + 12) % 12;
      return String(year).padStart(4, "0") + "-" + String(monthIndex + 1).padStart(2, "0");
    }

    function monthRange(startMonth, endMonth) {
      const rows = [];
      let cursor = startMonth;
      let guard = 0;
      while (cursor && cursor <= endMonth && guard < 240) {
        rows.push(cursor);
        cursor = shiftMonthKey(cursor, 1);
        guard += 1;
      }
      return rows;
    }

    function createProfitBucket(month) {
      return {
        month: month,
        income: 0,
        expense: 0,
        deposit_yield_income: 0,
        depreciation_expense: 0,
        net: 0,
        fcf_income: 0,
        fcf_expense: 0,
        fcf_net: 0,
        fcf_cumulative_net: 0,
        fcf_return_pct: 0,
        fcf_cumulative_return_pct: 0,
        cumulative_net: 0,
        return_pct: 0,
        cumulative_return_pct: 0,
      };
    }

    function isDepositProfitCategory(value) {
      const compact = String(value || "").replace(/\s+/g, "");
      return compact.indexOf("보증금") >= 0 || compact.indexOf("계약금") >= 0 || compact.indexOf("가계약금") >= 0 || compact.indexOf("자본납입") >= 0;
    }

    function isAcquisitionCostTransaction(tx) {
      return String(tx && tx.source_file || "") === "취득정보" || String(tx && tx.source_row || "").indexOf("acq_") === 0;
    }

    const monthlyProfitMap = {};
    function addActualProfitFlow(tx, fallbackTarget) {
      if (!tx || !tx.date) return;
      if (isAcquisitionCostTransaction(tx)) return;
      const month = monthKeyFromDate(tx.date);
      const acquiredMonth = monthKeyFromDate(investment.acquired_date);
      if (!month || (acquiredMonth && month < acquiredMonth)) return;
      const memoKey = String(tx.memo || "").trim();
      const mappedTarget = String(tx.target || fallbackTarget || bankMemoUnitMap[memoKey] || "");
      const category = defaultBankCategory(tx, mappedTarget);
      if (String(tx.kind || "") === "expense" && isProfitWithdrawalCategory(category)) return;
      if (String(tx.kind || "") !== "expense" && isDepositProfitCategory(category)) return;
      const amount = Number(tx.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      monthlyProfitMap[month] = monthlyProfitMap[month] || createProfitBucket(month);
      if (String(tx.kind || "") === "expense") {
        monthlyProfitMap[month].expense += amount;
        monthlyProfitMap[month].fcf_expense += amount;
      } else {
        monthlyProfitMap[month].income += amount;
        monthlyProfitMap[month].fcf_income += amount;
      }
    }

    Object.keys((building && building.units) || {}).forEach(function (unitId) {
      ensureArray(building.units[unitId] && building.units[unitId].transactions).forEach(function (tx) {
        addActualProfitFlow(tx, unitId + "호");
      });
    });
    operatingTransactions.forEach(function (tx) {
      addActualProfitFlow(tx, "공통");
    });
    bankTransactions.forEach(function (tx) {
      addActualProfitFlow(tx, "");
    });
    const acquiredMonth = monthKeyFromDate(investment.acquired_date) || "2025-08";
    const latestProfitMonth = Object.keys(monthlyProfitMap).concat([calendarMonth || isoToday().slice(0, 7)]).sort().slice(-1)[0] || acquiredMonth;
    const monthlyProfitRows = monthRange(acquiredMonth, latestProfitMonth).map(function (month) {
      const bucket = monthlyProfitMap[month] || createProfitBucket(month);
      bucket.deposit_yield_income = depositYieldMonthly;
      bucket.depreciation_expense = buildingDepreciationMonthly;
      bucket.income += depositYieldMonthly;
      bucket.expense += buildingDepreciationMonthly;
      bucket.fcf_income += depositYieldMonthly;
      bucket.fcf_net = bucket.fcf_income - bucket.fcf_expense;
      bucket.fcf_return_pct = investmentBasis ? bucket.fcf_net / investmentBasis * 100 : 0;
      bucket.net = bucket.income - bucket.expense;
      bucket.return_pct = investmentBasis ? bucket.net / investmentBasis * 100 : 0;
      return bucket;
    });
    let cumulativeProfitNet = 0;
    let cumulativeFcfNet = 0;
    monthlyProfitRows.forEach(function (row) {
      cumulativeProfitNet += Number(row.net || 0);
      cumulativeFcfNet += Number(row.fcf_net || 0);
      row.cumulative_net = cumulativeProfitNet;
      row.fcf_cumulative_net = cumulativeFcfNet;
      row.cumulative_return_pct = investmentBasis ? cumulativeProfitNet / investmentBasis * 100 : 0;
      row.fcf_cumulative_return_pct = investmentBasis ? cumulativeFcfNet / investmentBasis * 100 : 0;
    });
    const yearlyProfitMap = {};
    monthlyProfitRows.forEach(function (row) {
      const year = String(row.month || "").slice(0, 4);
      yearlyProfitMap[year] = yearlyProfitMap[year] || { year: year, income: 0, expense: 0, net: 0, return_pct: 0, fcf_income: 0, fcf_expense: 0, fcf_net: 0, fcf_return_pct: 0 };
      yearlyProfitMap[year].income += Number(row.income || 0);
      yearlyProfitMap[year].expense += Number(row.expense || 0);
      yearlyProfitMap[year].net += Number(row.net || 0);
      yearlyProfitMap[year].fcf_income += Number(row.fcf_income || 0);
      yearlyProfitMap[year].fcf_expense += Number(row.fcf_expense || 0);
      yearlyProfitMap[year].fcf_net += Number(row.fcf_net || 0);
    });
    const yearlyProfitRows = Object.keys(yearlyProfitMap).sort().map(function (year) {
      const row = yearlyProfitMap[year];
      row.return_pct = investmentBasis ? row.net / investmentBasis * 100 : 0;
      row.fcf_return_pct = investmentBasis ? row.fcf_net / investmentBasis * 100 : 0;
      return row;
    });
    const investmentProfitSummary = monthlyProfitRows.reduce(function (sum, row) {
      sum.income += Number(row.income || 0);
      sum.expense += Number(row.expense || 0);
      sum.net += Number(row.net || 0);
      sum.fcf_income += Number(row.fcf_income || 0);
      sum.fcf_expense += Number(row.fcf_expense || 0);
      sum.fcf_net += Number(row.fcf_net || 0);
      return sum;
    }, { income: 0, expense: 0, net: 0, fcf_income: 0, fcf_expense: 0, fcf_net: 0 });
    investmentProfitSummary.return_pct = investmentBasis ? investmentProfitSummary.net / investmentBasis * 100 : 0;
    investmentProfitSummary.fcf_return_pct = investmentBasis ? investmentProfitSummary.fcf_net / investmentBasis * 100 : 0;

    function renderBankIncomeTable() {
      return h(
        React.Fragment,
        null,
        h("div", { className: "building-ledger-subhead" }, h(SectionTitle, null, "입금 내역"), h("span", null, numberFormat(bankIncomeRows.length, 0) + "건")),
        h(
          "div",
          { className: "building-bank-table-wrap bank-ledger-wrap" },
          h(
            "table",
            { className: "building-bank-table bank-ledger-table" },
            h("thead", null, h("tr", null, h("th", null, "거래일"), h("th", null, "구분"), h("th", null, "실입금액"), h("th", null, "항목"), h("th", null, "호실"), h("th", null, "원본"), h("th", null, "관리"))),
            h(
              "tbody",
              null,
              bankIncomeRows.length
                ? bankIncomeRows.map(function (tx) {
                    const memoKey = String(tx.memo || "").trim();
                    const mappedTarget = String(tx.target || bankMemoUnitMap[memoKey] || "");
                    const mappedCategory = defaultBankCategory(tx, mappedTarget);
                    return h(
                      "tr",
                      { key: tx.id || String(tx.source_file || "") + "-" + String(tx.source_row || "") },
                      h("td", null, tx.date || "-"),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-category-select",
                            value: mappedCategory,
                            onChange: function (event) { saveBankMemoCategory(tx, event.target.value); },
                          },
                          bankIncomeCategoryOptions.map(function (category) {
                            return h("option", { key: category, value: category }, category);
                          })
                        )
                      ),
                      h("td", { className: "ok" }, "+" + money(tx.amount)),
                      h("td", { className: "bank-ledger-memo" }, tx.memo || "-"),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-target-select",
                            value: mappedTarget,
                            onChange: function (event) {
                              const nextTarget = event.target.value;
                              saveBankMemoTarget(tx, nextTarget);
                              if ((mappedCategory === "월세+관리비+부가세" || mappedCategory === "은행입금" || mappedCategory === "수동입금" || !mappedCategory) && !nextTarget) {
                                saveBankMemoCategory(tx, "기타입금");
                              }
                            },
                          },
                          bankTargetOptions.map(function (option) {
                            return h("option", { key: option.value, value: option.value }, option.label);
                          })
                        )
                      ),
                      h("td", null, tx.source === "bank_file" ? (tx.source_file || "은행파일") + (tx.source_row ? " #" + tx.source_row : "") : "수동"),
                      h("td", null, h("button", { type: "button", className: "mini-button danger", onClick: function () { deleteBankTransaction(tx); } }, "제거"))
                    );
                  })
                : h("tr", null, h("td", { colSpan: 7 }, "이번 달 입금 내역이 없습니다."))
            )
          )
        )
      );
    }

    function renderBankExpenseTable() {
      return h(
        React.Fragment,
        null,
        h("div", { className: "building-ledger-subhead" }, h(SectionTitle, null, "출금 내역"), h("span", null, numberFormat(bankExpenseRows.length, 0) + "건")),
        h(
          "div",
          { className: "building-bank-table-wrap bank-ledger-wrap" },
          h(
            "table",
            { className: "building-bank-table bank-ledger-table" },
            h("thead", null, h("tr", null, h("th", null, "거래일"), h("th", null, "구분"), h("th", null, "결제수단"), h("th", null, "실출금액"), h("th", null, "항목"), h("th", null, "원본"), h("th", null, "관리"))),
            h(
              "tbody",
              null,
              bankExpenseRows.length
                ? bankExpenseRows.map(function (tx) {
                    const memoKey = String(tx.memo || "").trim();
                    const mappedTarget = String(tx.target || bankMemoUnitMap[memoKey] || "");
                    const mappedCategory = defaultBankCategory(tx, mappedTarget);
                    return h(
                      "tr",
                      { key: tx.id || String(tx.source_file || "") + "-" + String(tx.source_row || "") },
                      h("td", null, tx.date || "-"),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-target-select",
                            value: mappedCategory,
                            onChange: function (event) { saveBankMemoCategory(tx, event.target.value); },
                          },
                          bankExpenseCategoryOptions.map(function (category) {
                            return h("option", { key: category, value: category }, category);
                          })
                        )
                      ),
                      h(
                        "td",
                        null,
                        h(
                          "select",
                          {
                            className: "bank-ledger-target-select",
                            value: tx.payment_method || "현금인출",
                            onChange: function (event) { saveBankPaymentMethod(tx, event.target.value); },
                          },
                          bankPaymentMethodOptions.map(function (method) {
                            return h("option", { key: method, value: method }, method);
                          })
                        )
                      ),
                      h("td", { className: "warn" }, "-" + money(tx.amount)),
                      h("td", { className: "bank-ledger-memo" }, tx.memo || "-"),
                      h("td", null, tx.source === "bank_file" ? (tx.source_file || "은행파일") + (tx.source_row ? " #" + tx.source_row : "") : "수동"),
                      h("td", null, h("button", { type: "button", className: "mini-button danger", onClick: function () { deleteBankTransaction(tx); } }, "제거"))
                    );
                  })
                : h("tr", null, h("td", { colSpan: 7 }, "이번 달 출금 내역이 없습니다."))
            )
          )
        )
      );
    }

    function renderProfitMoney(value) {
      const number = Number(value || 0);
      return h("span", { className: number >= 0 ? "ok" : "warn" }, (number >= 0 ? "+" : "-") + money(Math.abs(number)));
    }

    function renderProfitRate(value) {
      const number = Number(value || 0);
      return h("span", { className: number >= 0 ? "ok" : "warn" }, (number >= 0 ? "+" : "") + formatPercent(number, 2));
    }

    function renderMonthlyProfitTable() {
      return h(
        "div",
        { className: "building-investment-table-card" },
        h("div", { className: "building-investment-table-title" }, "\uc6d4\ubcc4 \uc218\uc775"),
        h(
          "div",
          { className: "building-investment-table-wrap" },
          h(
            "table",
            { className: "building-bank-table building-investment-table" },
            h("thead", null, h("tr", null, h("th", null, "월"), h("th", null, "수익 입금"), h("th", null, "비용 출금"), h("th", null, "수익금"), h("th", null, "FCF"), h("th", null, "수익률"), h("th", null, "FCF률"), h("th", null, "누적 FCF"))),
            h(
              "tbody",
              null,
              monthlyProfitRows.slice().reverse().map(function (row) {
                return h(
                  "tr",
                  {
                    key: row.month,
                    title: "보증금 운용수익 +" + money(row.deposit_yield_income) + " / 건물 상각비 -" + money(row.depreciation_expense),
                  },
                  h("td", null, row.month),
                  h("td", null, money(row.income)),
                  h("td", null, money(row.expense)),
                  h("td", null, renderProfitMoney(row.net)),
                  h("td", null, renderProfitMoney(row.fcf_net)),
                  h("td", null, renderProfitRate(row.return_pct)),
                  h("td", null, renderProfitRate(row.fcf_return_pct)),
                  h("td", null, renderProfitMoney(row.fcf_cumulative_net))
                );
              })
            )
          )
        )
      );
    }

    function renderYearlyProfitTable() {
      return h(
        "div",
        { className: "building-investment-table-card" },
        h("div", { className: "building-investment-table-title" }, "\uc5f0\ub3c4\ubcc4 \uc218\uc775"),
        h(
          "div",
          { className: "building-investment-table-wrap compact" },
          h(
            "table",
            { className: "building-bank-table building-investment-table" },
            h("thead", null, h("tr", null, h("th", null, "연도"), h("th", null, "수익 입금"), h("th", null, "비용 출금"), h("th", null, "수익금"), h("th", null, "FCF"), h("th", null, "수익률"), h("th", null, "FCF률"))),
            h(
              "tbody",
              null,
              yearlyProfitRows.slice().reverse().map(function (row) {
                return h(
                  "tr",
                  { key: row.year },
                  h("td", null, row.year),
                  h("td", null, money(row.income)),
                  h("td", null, money(row.expense)),
                  h("td", null, renderProfitMoney(row.net)),
                  h("td", null, renderProfitMoney(row.fcf_net)),
                  h("td", null, renderProfitRate(row.return_pct)),
                  h("td", null, renderProfitRate(row.fcf_return_pct))
                );
              })
            )
          )
        )
      );
    }

    function renderInvestmentProfitPanel() {
      return h(
        "div",
        { className: "panel building-investment-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h("div", null, h(SectionTitle, null, "실제 수익금 / 수익률"), h("div", { className: "summary-help" }, "보증금성 입금은 수익에서 제외하고, 보증금 운용수익 5%/년과 건물 30년 정액상각 비용을 월별로 반영합니다.")),
          h("span", { className: "building-bank-status ok" }, "실제 입출금 기준")
        ),
        h(
          "div",
          { className: "summary-grid summary-grid-small building-investment-summary" },
          h(SummaryCard, { label: "투자원금", value: money(investmentBasis), help: "매매대금+중개수수료+취득세/법무사" }),
          h(SummaryCard, { label: "누적 수익 입금", value: money(investmentProfitSummary.income), help: "보증금 제외 실제 입금+보증금 운용수익" }),
          h(SummaryCard, { label: "누적 비용 출금", value: money(investmentProfitSummary.expense), help: "실제 출금+건물 상각비, 수익 출금 제외" }),
          h(SummaryCard, { label: "누적 수익금", value: money(investmentProfitSummary.net), help: "실입금-실출금" }),
          h(SummaryCard, { label: "누적 수익률", value: formatPercent(investmentProfitSummary.return_pct, 2), help: "누적 수익금 / 투자원금" }),
          h(SummaryCard, { label: "FCF 누적 수익", value: money(investmentProfitSummary.fcf_net), help: "취득금액과 건물 상각비 제외" }),
          h(SummaryCard, { label: "FCF 수익률", value: formatPercent(investmentProfitSummary.fcf_return_pct, 2), help: "FCF 누적 수익 / 투자원금" })
        ),
        h(
          "div",
          { className: "building-investment-facts" },
          h("span", null, "취득일 ", h("strong", null, investment.acquired_date || "-")),
          h("span", null, "준공일 ", h("strong", null, investment.completion_date || "-")),
          h("span", null, "등기일 ", h("strong", null, investment.registration_date || "-")),
          h("span", null, "하자보수 ", h("strong", null, "준공 후 " + numberFormat(investment.defect_warranty_years || 0, 0) + "년")),
          h("span", null, "토지 ", h("strong", null, money(investment.land_supply_price))),
          h("span", null, "건물 ", h("strong", null, money(investment.building_supply_price))),
          h("span", null, "보증금 운용수익 ", h("strong", null, money(depositYieldMonthly) + "/월")),
          h("span", null, "건물 상각비 ", h("strong", null, money(buildingDepreciationMonthly) + "/월")),
          h("span", null, "중개수수료 ", h("strong", null, money(investment.brokerage_fee))),
          h("span", null, "취득세/법무사 ", h("strong", null, money(investment.acquisition_tax_legal_fee)))
        ),
        h(
          "div",
          { className: "building-investment-grid" },
          renderMonthlyProfitTable(),
          renderYearlyProfitTable()
        )
      );
    }

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "panel hero-panel building-hero" },
        h("div", { className: "eyebrow" }, "Real Estate"),
        h("h1", { className: "page-title" }, "\uac74\ubb3c \uad00\ub9ac"),
        h("p", { className: "page-copy compact-copy" }, "호실별 계약, 수도세, 입출금 내역을 관리하고 월별/연별 수익을 확인합니다.")
      ),
      request.loading && !data ? h(LoadingPanel, { label: request.label }) : null,
      request.error ? h("div", { className: "notice-box" }, request.error) : null,
      message ? h("div", { className: "notice-box compact" }, message) : null,
      h(
        "div",
        { className: "panel building-calendar-panel" },
        h(
          "div",
          { className: "building-calendar-head" },
          h(
            "button",
            {
              type: "button",
              className: "building-collapse-button",
              onClick: function () { setCalendarOpen(!calendarOpen); },
            },
            h("span", null, calendarOpen ? "?" : "?"),
            h("strong", null, "입출금 캘린더")
          ),
          renderCalendarMonthControls("top")
        ),
        calendarOpen
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "building-calendar-weekdays" },
                ["일", "월", "화", "수", "목", "금", "토"].map(function (label) {
                  return h("span", { key: label }, label);
                })
              ),
              h(
                "div",
                { className: "building-calendar-grid" },
                calendarDays.map(function (day, index) {
                  if (!day) {
                    return h("div", { key: "blank-" + index, className: "building-calendar-day blank" });
                  }
                  const hasEntries = day.entries.length > 0;
                  const hasMoneyEntries = day.entries.some(function (entry) { return entry.kind !== "event"; });
                  const actualMoneyEntries = day.entries.filter(function (entry) { return entry.kind !== "event" && entry.kind !== "expected_income" && entry.kind !== "expected_expense"; });
                  const actualNet = actualMoneyEntries.reduce(function (sum, entry) { return sum + Number(entry.signed || 0); }, 0);
                  const hasActualMoneyEntries = actualMoneyEntries.length > 0;
                  return h(
                    "button",
                    {
                      key: day.date,
                      type: "button",
                      className: "building-calendar-day" + (hasEntries ? " has-entries" : "") + (day.date === isoToday() ? " today" : ""),
                      onClick: function () { openCalendarDate(day.date); },
                    },
                    h("span", { className: "building-calendar-date" }, day.day),
                    hasActualMoneyEntries
                      ? h("strong", { className: actualNet >= 0 ? "positive" : "negative" }, (actualNet >= 0 ? "+" : "") + money(actualNet))
                      : hasMoneyEntries
                        ? h("strong", { className: "expected" }, "예정")
                        : hasEntries ? h("em", null, "일정") : h("em", null, "기록"),
                    h(
                      "div",
                      { className: "building-calendar-chips" },
                      day.entries.map(function (entry, entryIndex) {
                        return h("span", { key: entryIndex, className: entry.kind === "event" ? "event" : entry.kind === "expected_income" ? "expected-income" : entry.kind === "expected_expense" ? "expected-expense" : entry.signed >= 0 ? "income" : "expense" }, calendarEntryChipLabel(entry));
                      })
                    )
                  );
                })
              )
            )
          : h("div", { className: "summary-help" }, "캘린더가 접혀 있습니다. 날짜별 입출금 기록은 펼쳐서 확인할 수 있습니다.")
      ),
      h(
        "div",
        { className: "summary-grid building-summary-grid" },
        h(SummaryCard, { label: "입주율", value: numberFormat(summary.occupancy_rate || 0, 1) + "%", help: numberFormat(summary.occupied_count || 0, 0) + " / " + numberFormat(summary.units_count || 10, 0) + "호" }),
        h(SummaryCard, { label: "예상 월수입", value: money(summary.expected_monthly_income), help: "월세+부가세+관리비+수도세" }),
        h(SummaryCard, { label: "예상 월 순수익", value: money(summary.expected_monthly_net_income), help: "수입-전기세/용역/서비스" }),
        h(SummaryCard, { label: "예상 연 순수익", value: money(summary.expected_yearly_net_income), help: "월 순수익 x 12" }),
        h(SummaryCard, { label: "총 보증금", value: money(summary.total_deposit), help: "입력 계약 기준" }),
        h(SummaryCard, { label: "이번달 순입출금", value: money(selectedMonthActualNet), help: calendarMonth + " 실제 입출금 기준" }),
        h(SummaryCard, { label: "올해 순입출금", value: money(summary.actual_year_net_income), help: "실제 기록 기준" })
      ),
      h(
        "div",
        { className: "panel building-layout-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h(SectionTitle, null, "상가 호실"),
          h(
            "div",
            { className: "building-area-total" },
            h("span", null, "전체 " + numberFormat((Number(areaTotals.exclusive_m2 || 0) + Number(areaTotals.parking_m2 || 0) + Number(areaTotals.common_m2 || 0)), 2) + "m²"),
            h("strong", null, "전용 " + numberFormat(areaTotals.exclusive_py || 0, 2) + "평 / 분양 " + numberFormat(areaTotals.sale_py || 0, 2) + "평")
          )
        ),
        h(
          "div",
          { className: "building-floor-stack" },
          layout.map(function (floor) {
            return h(
              "div",
              { key: floor.floor, className: "building-floor-row" },
              h("div", { className: "building-floor-label" }, floor.floor),
              h("div", { className: "building-unit-grid" }, ensureArray(floor.units).map(renderUnit))
            );
          })
        )
      ),
      h(
        "div",
        { className: "panel building-ledger-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h(SectionTitle, null, "용역/서비스 계약"),
          serviceEditMode
            ? h("div", { className: "button-row compact" },
                h("button", { type: "button", className: "mini-button", onClick: addService }, "항목 추가"),
                h("button", { type: "button", className: "mini-button", onClick: cancelServiceEdit }, "취소"),
                h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: saveServices }, saving ? "저장 중..." : "저장")
              )
            : h("button", { type: "button", className: "mini-button", onClick: beginServiceEdit }, "수정")
        ),
        serviceEditMode
          ? h(
              "div",
              { className: "building-service-list" },
              serviceContracts.length
                ? serviceContracts.map(function (service, index) {
                    return h(
                      "div",
                      { key: service.id || index, className: "building-service-row" },
                      h(
                        "select",
                        { value: service.category || "CCTV", onChange: function (event) { setService(index, "category", event.target.value); } },
                        serviceCategoryOptions.map(function (category) {
                          return h("option", { key: category, value: category }, category);
                        })
                      ),
                      h("input", { value: service.vendor || "", placeholder: "업체/계약처", onChange: function (event) { setService(index, "vendor", event.target.value); } }),
                      h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(service.amount), placeholder: "금액", onChange: function (event) { setService(index, "amount", cleanNumberInput(event.target.value)); } }),
                      h(
                        "select",
                        { value: service.cycle || "monthly", onChange: function (event) { setService(index, "cycle", event.target.value); } },
                        h("option", { value: "monthly" }, "매월"),
                        h("option", { value: "yearly" }, "년에 한번")
                      ),
                      (service.cycle === "yearly" || service.cycle === "annual")
                        ? h("input", { type: "date", value: service.payment_date || service.annual_payment_date || service.yearly_payment_date || "", title: "연 1회 지급일", onChange: function (event) { setService(index, "payment_date", event.target.value); } })
                        : h(
                            "select",
                            { value: String(service.payment_day || service.due_day || "1"), onChange: function (event) { setService(index, "payment_day", Number(event.target.value)); } },
                            Array.from({ length: 31 }).map(function (_, dayIndex) {
                              const day = String(dayIndex + 1);
                              return h("option", { key: day, value: day }, "매월 " + day + "일");
                            })
                          ),
                      h("input", { type: "date", value: service.start_date || "", onChange: function (event) { setService(index, "start_date", event.target.value); } }),
                      h("input", { value: service.memo || "", placeholder: "메모", onChange: function (event) { setService(index, "memo", event.target.value); } }),
                      h("button", { type: "button", className: "mini-button danger", onClick: function () { removeService(index); } }, "삭제")
                    );
                  })
                : h("div", { className: "summary-help" }, "등록된 용역/서비스 계약이 없습니다. 수정을 눌러 항목을 추가하세요.")
            )
          : h(
              "div",
              { className: "building-service-view-list" },
              serviceContracts.length
                ? serviceContracts.map(function (service, index) {
                    const cycle = service.cycle === "yearly" || service.cycle === "annual" ? "년에 한번" : "매월";
                    const payText = cycle === "년에 한번"
                      ? (service.payment_date || service.annual_payment_date || service.yearly_payment_date || "지급일 미정")
                      : "매월 " + String(service.payment_day || service.due_day || 1) + "일";
                    return h(
                      "div",
                      { key: service.id || index, className: "building-service-view-row" },
                      h("strong", null, service.category || "기타"),
                      h("span", null, service.vendor || "-"),
                      h("em", null, money(service.amount)),
                      h("small", null, cycle + " · " + payText + (service.start_date ? " · 시작 " + service.start_date : "")),
                      service.memo ? h("small", { className: "memo" }, service.memo) : null
                    );
                  })
                : h("div", { className: "summary-help" }, "등록된 용역/서비스 계약이 없습니다.")
            )
      ),
      h(
        "div",
        { className: "panel building-ledger-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h(SectionTitle, null, "운영 거래내역"),
          h("div", { className: "button-row compact" },
            h("button", { type: "button", className: "mini-button", onClick: addOperatingTransaction }, "입출금 추가"),
            h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: function () { saveBuildingData(building, false); } }, saving ? "저장 중..." : "저장")
          )
        ),
        h(
          "div",
          { className: "building-transaction-list" },
          operatingTransactions.length
            ? operatingTransactions.map(function (tx, index) {
                return h(
                  "div",
                  { key: tx.id || index, className: "building-transaction-row global" },
                  h("input", { type: "date", value: tx.date || "", onChange: function (event) { setOperatingTransaction(index, "date", event.target.value); } }),
                  h("select", { value: tx.kind || "expense", onChange: function (event) { setOperatingTransaction(index, "kind", event.target.value); } }, h("option", { value: "income" }, "입금"), h("option", { value: "expense" }, "출금")),
                  h("input", { value: tx.category || "", placeholder: "항목", onChange: function (event) { setOperatingTransaction(index, "category", event.target.value); } }),
                  h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(tx.amount), placeholder: "금액", onChange: function (event) { setOperatingTransaction(index, "amount", cleanNumberInput(event.target.value)); } }),
                  h("input", { value: tx.memo || "", placeholder: "메모", onChange: function (event) { setOperatingTransaction(index, "memo", event.target.value); } }),
                  h("button", { type: "button", className: "mini-button danger", onClick: function () { removeOperatingTransaction(index); } }, "삭제")
                );
              })
            : h("div", { className: "summary-help" }, "등록된 운영 거래내역이 없습니다." )
        )
      ),
      h(
        "div",
        { className: "panel building-ledger-panel" },
        h(SectionTitle, null, "수익/비용 계산"),
        h(
          "div",
          { className: "building-profit-table" },
          ensureArray(summary.profit_rows).map(function (row, index) {
            const isWaterRow = String(row.label || "").indexOf("수도세") === 0;
            const isElectricRow = row.label === "전기세 청구";
            return h(
              "div",
              {
                key: row.label || index,
                className: "building-profit-row " + (row.kind || "") + (isWaterRow || isElectricRow ? " clickable" : ""),
                onClick: isWaterRow ? function () { setWaterPanelOpen(!waterPanelOpen); } : isElectricRow ? function () { setElectricPanelOpen(!electricPanelOpen); } : undefined,
                role: isWaterRow || isElectricRow ? "button" : undefined,
                tabIndex: isWaterRow || isElectricRow ? 0 : undefined,
              },
              h("span", null, row.kind === "minus" ? "-" : row.kind === "plus" ? "+" : "="),
              h("strong", null, row.label + (isWaterRow ? (waterPanelOpen ? " 접기" : " 보기") : isElectricRow ? (electricPanelOpen ? " 접기" : " 보기") : "")),
              h("em", null, "월 " + money(row.monthly)),
              h("em", null, "연 " + money(row.yearly))
            );
          })
        ),
        waterPanelOpen
          ? h(
              "div",
              { className: "building-water-panel" },
              h(
                "div",
                { className: "building-section-head" },
                h(SectionTitle, null, "수도 검침/청구 배분표"),
                h(
                  "div",
                  { className: "button-row compact" },
                  h("button", { type: "button", className: "mini-button", disabled: syncingWater, onClick: syncWaterFromTelegram }, syncingWater ? "불러오는 중..." : "텔레그램 수도 알림 불러오기"),
                  h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: function () { saveBuildingData(building, false); } }, saving ? "저장 중..." : "수도 데이터 저장")
                )
              ),
              h("div", { className: "building-ledger-note" }, "총 수도요금과 총 사용량은 텔레그램 엄마 방의 [중부수도사업소 알림]을 불러와 자동 입력할 수 있습니다. 공용 사용량은 총 사용량에서 호실 계량기 합계를 뺀 값으로 계산합니다."),
              h(
                "div",
                { className: "building-water-table-wrap" },
                h(
                  "table",
                  { className: "building-water-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      unitIds.map(function (unitId) { return h("th", { key: unitId }, unitId); })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    waterBillingMonths.map(function (month, monthIndex) {
                      const calculated = waterBillingRows.find(function (row) { return row.month === month.month; }) || {};
                      const calculatedUnits = ensureArray(calculated.units);
                      return h(
                        "tr",
                        { key: month.month || monthIndex },
                        h("td", null, h("input", { value: month.month || "", onChange: function (event) { setWaterBillingMonth(monthIndex, "month", event.target.value); } })),
                        h("td", null, h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.total_usage_m3), placeholder: "예: 15", onChange: function (event) { setWaterBillingMonth(monthIndex, "total_usage_m3", cleanNumberInput(event.target.value)); } })),
                        h("td", null, h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.total_bill), placeholder: "상가 전체 수도요금", onChange: function (event) { setWaterBillingMonth(monthIndex, "total_bill", cleanNumberInput(event.target.value)); } })),
                        h("td", { className: "readonly" }, numberFormat(calculated.common_usage_m3 || 0, 2)),
                        h("td", { className: "readonly" }, money(calculated.common_amount || 0)),
                        unitIds.map(function (unitId) {
                          const unitCalc = calculatedUnits.find(function (item) { return item.unit_id === unitId; }) || {};
                          return h(
                            "td",
                            { key: unitId },
                            h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.readings && month.readings[unitId] != null ? month.readings[unitId] : ""), onChange: function (event) { setWaterReading(monthIndex, unitId, cleanNumberInput(event.target.value)); } }),
                            h("small", null, money(unitCalc.amount || 0))
                          );
                        })
                      );
                    })
                  )
                )
              ),
              h("div", { className: "building-ledger-note" }, "연말에는 아래 연도별 호실 수도세 합계를 기준으로 실제 입금 내역의 '수도세' 항목과 대조합니다."),
              h(
                "div",
                { className: "building-water-table-wrap" },
                h(
                  "table",
                  { className: "building-water-table building-water-yearly-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      h("th", null, "총요금"),
                      unitIds.map(function (unitId) { return h("th", { key: unitId }, unitId); })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    waterYearlyRows.length
                      ? waterYearlyRows.map(function (row) {
                          const units = ensureArray(row.units);
                          return h(
                            "tr",
                            { key: row.year },
                            h("td", null, row.year),
                            h("td", { className: "readonly" }, money(row.total_bill || 0)),
                            h("td", { className: "readonly" }, money(row.charge_amount || 0)),
                            h("td", { className: "readonly" }, money(row.common_amount || 0)),
                            h("td", { className: "readonly ok" }, money(row.paid_total || 0)),
                            h("td", { className: Number(row.outstanding_total || 0) > 0 ? "readonly warn" : "readonly ok" }, money(row.outstanding_total || 0)),
                            unitIds.map(function (unitId) {
                              const unit = units.find(function (item) { return item.unit_id === unitId; }) || {};
                              return h(
                                "td",
                                { key: unitId, className: "readonly" },
                                h("strong", null, money(unit.amount || 0)),
                                h("small", null, "납부 " + money(unit.paid_amount || 0))
                              );
                            })
                          );
                        })
                      : h("tr", null, h("td", { colSpan: unitIds.length + 6 }, "연도별 수도세 정산 데이터가 없습니다."))
                  )
                )
              )
            )
          : null,
        electricPanelOpen
          ? h(
              "div",
              { className: "building-water-panel building-electric-panel" },
              h(
                "div",
                { className: "building-section-head" },
                h(SectionTitle, null, "한국전력 전기요금 청구표"),
                h(
                  "div",
                  { className: "button-row compact" },
                  h("button", { type: "button", className: "mini-button", onClick: addElectricityMonth }, "월 추가"),
                  h("button", { type: "button", className: "mini-button", disabled: syncingElectric, onClick: syncElectricityFromTelegram }, syncingElectric ? "불러오는 중..." : "텔레그램 한국전력 청구서 불러오기"),
                  h("button", { type: "button", className: "primary-button small", disabled: saving, onClick: function () { saveBuildingData(building, false); } }, saving ? "저장 중..." : "전기요금 저장")
                )
              ),
              h("div", { className: "building-ledger-note" }, "텔레그램 엄마 방의 한국전력 모바일 청구서에서 고객번호를 찾아 호실별 전기요금을 정리합니다. 고객번호별 금액은 직접 수정할 수도 있습니다."),
              h(
                "div",
                { className: "building-water-table-wrap" },
                h(
                  "table",
                  { className: "building-water-table building-electric-table" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "\uccad\uad6c\uc6d4"),
                      h("th", null, "\ucd1d\uae08\uc561"),
                      electricCustomers.map(function (customer) {
                        return h("th", { key: customer.unit_id }, customer.label + " " + customer.customer_no);
                      })
                    )
                  ),
                  h(
                    "tbody",
                    null,
                    electricityBillingMonths.length
                      ? electricityBillingMonths.map(function (month, monthIndex) {
                          const calculated = electricityBillingRows.find(function (row) { return row.month === month.month; }) || {};
                          return h(
                            "tr",
                            { key: month.month || monthIndex },
                            h("td", null, h("input", { value: month.month || "", placeholder: "YYYY-MM", onChange: function (event) { setElectricityBillingMonth(monthIndex, "month", event.target.value); } })),
                            h("td", { className: "readonly" }, money(calculated.total_bill || month.total_bill || 0)),
                            electricCustomers.map(function (customer) {
                              return h(
                                "td",
                                { key: customer.unit_id },
                                h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(month.bills && month.bills[customer.unit_id] != null ? month.bills[customer.unit_id] : ""), placeholder: "0", onChange: function (event) { setElectricityBill(monthIndex, customer.unit_id, cleanNumberInput(event.target.value)); } })
                              );
                            })
                          );
                        })
                      : h("tr", null, h("td", { colSpan: electricCustomers.length + 2 }, "등록된 전기요금 청구월이 없습니다. 월 추가 또는 텔레그램 불러오기를 눌러주세요."))
                  )
                )
              )
            )
          : null,
        h("div", { className: "building-ledger-note" }, "일회성 비용은 실제 가계부에는 반영되지만 예상 월 고정비 계산에서는 제외됩니다.")
      ),
      h(
        "div",
        { className: "panel building-ledger-panel building-bank-panel" },
        h(
          "div",
          { className: "building-section-head" },
          h(SectionTitle, null, "하나은행 계좌 입출금 점검"),
          h("span", { className: "building-bank-status " + (bankImportErrors.length ? "warn" : "ok") }, bankImportErrors.length ? "확인 필요" : "파일 기반")
        ),
        h(
          "div",
          { className: "building-bank-actions" },
          h("span", null, "경로: stock app\\data\\real-estate\\계좌입출금내역"),
          h(
            React.Fragment,
            null,
            h(
              "button",
              {
                type: "button",
                className: "mini-button",
                disabled: exportingBankMonth,
                onClick: exportBankMonthlyWorkbook,
              },
              exportingBankMonth ? "엑셀 출력 중..." : calendarMonth + " 엑셀 출력"
            ),
            h(
              "button",
              {
                type: "button",
                className: "mini-button",
                disabled: exportingBuildingSummary,
                onClick: exportBuildingSummaryWorkbook,
              },
              exportingBuildingSummary ? "정리본 생성 중..." : "건물 정리본 엑셀"
            ),
            h(
              "button",
              {
                type: "button",
                className: "mini-button primary",
                disabled: syncingBank,
                onClick: importBankFiles,
              },
              syncingBank ? "새로고침 중..." : "거래내역 새로고침"
            )
          )
        ),
        h(
          "div",
          { className: "building-ledger-note" },
          "하나은행 계좌 입출금 내역은 기본적으로 자동 매칭된 상태로 표시됩니다. 신규 파일은 stock app\\data\\real-estate\\계좌입출금내역 폴더에서 읽고, 과거 데이터는 거래내역조회_기본에서 가져옵니다. 이후에는 거래내역조회_202605 같은 월별 파일명을 추가하면 자동으로 불러옵니다." +
            (bankImport.last_imported_at ? " 마지막 불러오기: " + bankImport.last_imported_at : "")
        ),
        bankImportErrors.length
          ? h("div", { className: "notice-box compact" }, "읽지 못한 파일: " + bankImportErrors.map(function (file) { return file.file; }).join(", "))
          : null,
        h(
          "div",
          { className: "building-bank-summary" },
          h("div", null, h("span", null, "예정 입금"), h("strong", null, money(bankExpectedIncome)), h("em", null, "월세+관리비+연말 수도세")),
          h("div", null, h("span", null, "실제 입금"), h("strong", null, money(bankActualIncome)), h("em", { className: bankActualIncome >= bankExpectedIncome ? "ok" : "warn" }, bankActualIncome >= bankExpectedIncome ? "정상" : "부족 " + money(bankExpectedIncome - bankActualIncome))),
          h("div", null, h("span", null, "예정 출금"), h("strong", null, money(bankExpectedExpense)), h("em", null, "용역/서비스 예정")),
          h("div", null, h("span", null, "실제 출금"), h("strong", null, money(bankActualExpense)), h("em", { className: bankActualExpense <= bankExpectedExpense ? "ok" : "warn" }, bankActualExpense <= bankExpectedExpense ? "범위 내" : "초과 " + money(bankActualExpense - bankExpectedExpense)))
        ),
        h(
          "div",
          { className: "building-bank-table-wrap" },
          h(
            "table",
            { className: "building-bank-table" },
            h("thead", null, h("tr", null, h("th", null, "예정일"), h("th", null, "구분"), h("th", null, "호실"), h("th", null, "항목"), h("th", null, "예정금액"), h("th", null, "실입/출금액"), h("th", null, "상태"))),
            h(
              "tbody",
              null,
              expectedBankRows.length
                ? expectedBankRows.map(function (row, index) {
                    const isIncome = row.kind === "expected_income";
                    const matchedActualRows = actualBankRows.filter(function (tx) {
                        const sameDirection = isIncome ? tx.kind !== "expense" : tx.kind === "expense";
                        const txCategory = String(tx.category || "");
                        const rowCategory = String(row.category || "");
                        const sameTarget = !tx.target || !row.target || row.target === "공통" || tx.target === row.target;
                        const sameCategory = sameBankCategoryForExpected(txCategory, rowCategory);
                        return sameDirection && sameTarget && sameCategory && String(tx.date || "").slice(0, 7) === calendarMonth;
                      });
                    const actualSum = matchedActualRows.reduce(function (sum, tx) { return sum + Number(tx.amount || 0); }, 0);
                    const expectedAmount = Number(row.amount || 0);
                    const diff = actualSum - expectedAmount;
                    const tolerance = 1;
                    const ok = expectedAmount > 0 && Math.abs(diff) <= tolerance;
                    const statusText = ok
                      ? "확인"
                      : actualSum > 0
                        ? (diff > 0 ? "초과 " : "부족 ") + money(Math.abs(diff))
                        : "미확인";
                    const actualHelp = matchedActualRows.length
                      ? matchedActualRows.map(function (tx) {
                          return [tx.date || "", tx.display_target || tx.target || "", tx.category || "", money(tx.amount)].filter(Boolean).join(" · ");
                        }).join("\n")
                      : "조건에 맞는 실제 입출금이 없습니다.";
                    return h(
                      "tr",
                      { key: index, title: actualHelp },
                      h("td", null, row.date),
                      h("td", null, isIncome ? "입금" : "출금"),
                      h("td", null, row.target),
                      h("td", null, row.category),
                      h("td", { className: "building-expected-amount", title: expectedAmountBreakdownTitle(row) }, expectedAmountWithBreakdown(row)),
                      h("td", { className: ok ? "ok" : actualSum > 0 ? "warn" : "" }, money(actualSum)),
                      h("td", { className: ok ? "ok" : "warn" }, statusText)
                    );
                  })
                : h("tr", null, h("td", { colSpan: 7 }, "\ud45c\uc2dc\ud560 \uc6d4\ubcc4 \uc785\ucd9c\uae08 \ub0b4\uc5ed\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."))
            )
          )
        ),
        h(SectionTitle, null, "수동 입출금"),
        h(
          "div",
          { className: "building-bank-manual" },
          h("input", { type: "date", value: bankDraft.date || "", onChange: function (event) { setBankDraftField("date", event.target.value); } }),
          h(
            "select",
            {
              value: bankDraft.kind || "income",
              onChange: function (event) {
                const nextKind = event.target.value;
                setBankDraft(function (current) {
                  return {
                    ...(current || {}),
                    kind: nextKind,
                    category: nextKind === "expense" ? "세금" : ((current && current.target) ? "월세+관리비+부가세" : "기타입금"),
                  };
                });
              },
            },
            h("option", { value: "income" }, "입금"),
            h("option", { value: "expense" }, "출금")
          ),
          bankDraft.kind === "expense"
            ? h(
                "select",
                {
                  value: bankDraft.category || "세금",
                  onChange: function (event) { setBankDraftField("category", event.target.value); },
                },
                bankExpenseCategoryOptions.map(function (category) { return h("option", { key: category, value: category }, category); })
              )
            : h("input", {
                type: "text",
                placeholder: "대상/호실",
                value: bankDraft.target || "",
                onChange: function (event) {
                  const nextTarget = event.target.value;
                  setBankDraft(function (current) {
                    const currentCategory = String((current && current.category) || "").trim();
                    const shouldDefaultCategory = !currentCategory || currentCategory === "수동입금";
                    return {
                      ...(current || {}),
                      target: nextTarget,
                      category: shouldDefaultCategory ? (String(nextTarget || "").trim() ? "월세+관리비+부가세" : "기타입금") : currentCategory,
                    };
                  });
                },
              }),
          bankDraft.kind === "expense"
            ? h("span", { className: "bank-ledger-category-pill" }, "비용분류")
            : h(
                "select",
                { value: bankDraft.category || (bankDraft.target ? "월세+관리비+부가세" : "기타입금"), onChange: function (event) { setBankDraftField("category", event.target.value); } },
                bankIncomeCategoryOptions.map(function (category) { return h("option", { key: category, value: category }, category); })
              ),
          bankDraft.kind === "expense"
            ? h(
                "select",
                {
                  value: bankDraft.payment_method || "현금인출",
                  onChange: function (event) { setBankDraftField("payment_method", event.target.value); },
                },
                bankPaymentMethodOptions.map(function (method) { return h("option", { key: method, value: method }, method); })
              )
            : null,
          h("input", { type: "text", inputMode: "decimal", placeholder: "금액", value: formatNumberInput(bankDraft.amount), onChange: function (event) { setBankDraftField("amount", cleanNumberInput(event.target.value)); } }),
          h("input", { type: "text", placeholder: "메모", value: bankDraft.memo || "", onChange: function (event) { setBankDraftField("memo", event.target.value); } }),
          h("button", { type: "button", className: "mini-button primary", disabled: saving, onClick: saveManualBankTransaction }, "직접 추가")
        ),
        renderBankIncomeTable(),
        renderBankExpenseTable()
      ),
      h(
        "div",
        { className: "panel building-page-bottom-calendar-controls" },
        h("span", null, "입출금 캘린더 월 이동"),
        renderCalendarMonthControls("bottom")
      ),
      renderInvestmentProfitPanel(),
      calendarDraft
        ? h(
            "div",
            { className: "modal-backdrop", onMouseDown: function (event) { if (event.target === event.currentTarget) closeCalendarDate(); } },
            h(
              "div",
              { className: "building-modal building-calendar-modal" },
              h(
                "div",
                { className: "building-modal-head" },
                h("div", null, h("div", { className: "eyebrow" }, "Calendar"), h("h2", null, calendarDate + " 입출금")),
                h("button", { type: "button", className: "mini-button", onClick: closeCalendarDate }, "닫기")
              ),
              h(
                "div",
                { className: "building-calendar-existing" },
                selectedCalendarEntries.length
                  ? selectedCalendarEntries.map(function (entry, index) {
                      return h(
                        "div",
                        { key: index, className: "building-calendar-existing-row " + (entry.kind === "event" ? "event" : entry.kind === "expected_income" ? "expected-income" : entry.kind === "expected_expense" ? "expected-expense" : entry.signed >= 0 ? "income" : "expense") },
                        h("strong", null, calendarEntryTargetLabel(entry)),
                        h("span", null, entry.category || "-"),
                        h("em", null, entry.kind === "event" ? "일정" : (entry.kind === "expected_income" || entry.kind === "expected_expense" ? "예정 " : "") + (entry.signed >= 0 ? "+" : "") + money(entry.signed)),
                        h("small", null, entry.memo || "")
                      );
                    })
                  : h("div", { className: "summary-help" }, "이 날짜의 기존 입출금 기록이 없습니다.")
              ),
              h(SectionTitle, null, "새 기록 추가"),
              h(
                "div",
                { className: "building-form-grid" },
                h(
                  "label",
                  { className: "building-field" },
                  h("span", null, "현재 청구 기준"),
                  h(
                    "select",
                    {
                      value: calendarDraft.target || "common",
                      onChange: function (event) { setCalendarDraftField("target", event.target.value); },
                    },
                    h("option", { value: "common" }, "공통 운영 가계부"),
                    h("option", { value: "unit" }, "호실별 입출금")
                  )
                ),
                calendarDraft.target === "unit"
                  ? h(
                      "label",
                      { className: "building-field" },
                      h("span", null, "호실"),
                      h(
                        "select",
                        {
                          value: calendarDraft.unit_id || "",
                          onChange: function (event) { setCalendarDraftField("unit_id", event.target.value); },
                        },
                        h("option", { value: "" }, "호실 선택"),
                        unitIds.map(function (unitId) {
                          return h("option", { key: unitId, value: unitId }, unitId + "호");
                        })
                      )
                    )
                  : null,
                h(
                  "label",
                  { className: "building-field" },
                  h("span", null, "입출금"),
                  h(
                    "select",
                    {
                      value: calendarDraft.kind || "income",
                      onChange: function (event) { setCalendarDraftField("kind", event.target.value); },
                    },
                    h("option", { value: "income" }, "입금"),
                    h("option", { value: "expense" }, "출금")
                  )
                ),
                renderField("날짜", calendarDraft.date, function (value) { setCalendarDraftField("date", value); }, "date"),
                renderField("항목", calendarDraft.category, function (value) { setCalendarDraftField("category", value); }),
                renderField("금액", calendarDraft.amount, function (value) { setCalendarDraftField("amount", value); }, "number"),
                renderField("메모", calendarDraft.memo, function (value) { setCalendarDraftField("memo", value); })
              ),
              h("div", { className: "building-modal-actions" },
                h("button", { type: "button", className: "secondary-button", onClick: closeCalendarDate }, "취소"),
                h("button", { type: "button", className: "primary-button", disabled: saving || (calendarDraft.target === "unit" && !calendarDraft.unit_id), onClick: saveCalendarTransaction }, saving ? "저장 중..." : "기록 저장")
              )
            )
          )
        : null,
      draft
        ? h(
            "div",
            { className: "modal-backdrop", onMouseDown: function (event) { if (event.target === event.currentTarget) closeUnit(); } },
            h(
              "div",
              { className: "building-modal" },
              h(
                "div",
                { className: "building-modal-head" },
                h("div", null, h("div", { className: "eyebrow" }, "Unit"), h("h2", null, selectedUnitId + "호 계약/입출금")),
                h("button", { type: "button", className: "mini-button", onClick: closeUnit }, "닫기")
              ),
              h(
                "div",
                { className: "building-area-detail" },
                h("div", null, h("span", null, "전용"), h("strong", null, numberFormat((draft.area && draft.area.exclusive_py) || 0, 2) + "평"), h("em", null, numberFormat((draft.area && draft.area.exclusive_m2) || 0, 2) + "m²")),
                h("div", null, h("span", null, "주차"), h("strong", null, numberFormat((draft.area && draft.area.parking_m2) || 0, 2) + "m²")),
                h("div", null, h("span", null, "공용"), h("strong", null, numberFormat((draft.area && draft.area.common_m2) || 0, 2) + "m²")),
                h("div", null, h("span", null, "분양"), h("strong", null, numberFormat((draft.area && draft.area.sale_py) || 0, 2) + "평"), h("em", null, numberFormat(Number((draft.area && draft.area.exclusive_m2) || 0) + Number((draft.area && draft.area.parking_m2) || 0) + Number((draft.area && draft.area.common_m2) || 0), 2) + "m²"))
              ),
              h(
                "div",
                { className: "building-rent-plan" },
                h("div", null, h("span", null, "임대 계획 보증금"), h("strong", null, manwon(draft.rent_plan && draft.rent_plan.deposit_manwon))),
                h("div", null, h("span", null, "임대 계획 월세"), h("strong", null, manwon(draft.rent_plan && draft.rent_plan.monthly_rent_manwon))),
                h("div", null, h("span", null, "예상 관리비(G열)"), h("strong", null, manwon(plannedManagementFeeManwon(draft))))
              ),
              h(
                "div",
                { className: "building-special-terms" },
                h(
                  "div",
                  null,
                  h("span", null, "\ubb34\uc0c1 \uc784\ub300 \uae30\uac04"),
                  h("strong", null, "렌트프리 " + numberFormat((draft.special_terms && draft.special_terms.rent_free_months) || 0, 0) + "개월 + 정착지원 " + numberFormat((draft.special_terms && draft.special_terms.settlement_support_months) || 0, 0) + "개월"),
                  h("em", null, "총 " + numberFormat((draft.special_terms && draft.special_terms.total_zero_rent_months) || 0, 0) + "개월 월세 0원")
                ),
                h(
                  "div",
                  null,
                  h("span", null, "\ud560\uc778\uc728 \uc801\uc6a9"),
                  h("strong", null, numberFormat((draft.special_terms && draft.special_terms.discount_rate) || 0, 0) + "%"),
                  h("em", null, (draft.special_terms && draft.special_terms.discount_label) || "할인 조건 미해당")
                ),
                h(
                  "div",
                  null,
                  h("span", null, "\ud560\uc778 \ud6c4 \uc6d4\uc138"),
                  h("strong", null, money(draft.special_terms && draft.special_terms.discounted_monthly_rent)),
                  h("em", null, "계약 월세 " + money(draft.special_terms && draft.special_terms.contract_monthly_rent))
                ),
                h(
                  "div",
                  null,
                  h("span", null, "\ud604\uc7ac \uccad\uad6c \uae08\uc561"),
                  h("strong", null, money(draft.special_terms && draft.special_terms.current_monthly_due)),
                  h("em", null, specialPhaseLabel(draft.special_terms && draft.special_terms.current_phase) + " · 월세 개시 " + ((draft.special_terms && draft.special_terms.paid_rent_start_date) || "-"))
                )
              ),
              unitEditMode
                ? [
                    h(
                "div",
                { className: "building-form-grid" },
                renderField("계약자", draft.contract && draft.contract.tenant, function (value) { setContract("tenant", value); }),
                renderField("임차인 사업", draft.contract && draft.contract.tenant_business, function (value) { setContract("tenant_business", value); }),
                renderField("계약일", draft.contract && draft.contract.contract_date, function (value) { setContract("contract_date", value); }, "date"),
                renderField("잔금일", draft.contract && draft.contract.balance_date, function (value) { setContract("balance_date", value); }, "date"),
                renderField("보증금", draft.contract && draft.contract.deposit, function (value) { setContract("deposit", value); }, "number"),
                renderField("월세", draft.contract && draft.contract.monthly_rent, function (value) { setContract("monthly_rent", value); }, "number"),
                renderField("실제 관리비", draft.contract && draft.contract.management_fee, function (value) { setContract("management_fee", value); }, "number"),
                renderField("할인율(%)", draft.contract && draft.contract.discount_rate, function (value) { setContract("discount_rate", value); }, "number"),
                renderSelectField("렌트프리기간", draft.contract && draft.contract.rent_free_months, function (value) { setContract("rent_free_months", value); }, [
                  { value: "0", label: "0개월" },
                  { value: "1", label: "1개월" },
                  { value: "2", label: "2개월" },
                  { value: "3", label: "3개월" },
                  { value: "4", label: "4개월" },
                  { value: "5", label: "5개월" },
                  { value: "6", label: "6개월" }
                ]),
                renderSelectField("창업정착지원기간", draft.contract && draft.contract.settlement_support_months, function (value) { setContract("settlement_support_months", value); }, [
                  { value: "0", label: "0개월" },
                  { value: "1", label: "1개월" },
                  { value: "2", label: "2개월" },
                  { value: "3", label: "3개월" },
                  { value: "4", label: "4개월" },
                  { value: "5", label: "5개월" },
                  { value: "6", label: "6개월" }
                ]),
                renderField("월세 개시일", draft.contract && draft.contract.rent_start_date, function (value) { setContract("rent_start_date", value); }, "date"),
                renderField("임대종료일", draft.contract && draft.contract.lease_end_date, function (value) { setContract("lease_end_date", value); }, "date"),
                renderSelectField("임대기간", draft.contract && draft.contract.lease_term, function (value) { setContract("lease_term", value); }, [
                  { value: "24개월", label: "24개월" },
                  { value: "12개월", label: "12개월" },
                  { value: "18개월", label: "18개월" },
                  { value: "30개월", label: "30개월" },
                  { value: "36개월", label: "36개월" },
                  { value: "48개월", label: "48개월" },
                  { value: "60개월", label: "60개월" }
                ]),
                renderSelectField("납부일", draft.contract && draft.contract.rent_payment_day, function (value) { setContract("rent_payment_day", value); }, [
                  { value: "매월 1일(선불)", label: "매월 1일(선불)" },
                  { value: "매월 5일(선불)", label: "매월 5일(선불)" },
                  { value: "매월 10일(선불)", label: "매월 10일(선불)" },
                  { value: "매월 15일(선불)", label: "매월 15일(선불)" },
                  { value: "매월 20일(선불)", label: "매월 20일(선불)" },
                  { value: "매월 25일(선불)", label: "매월 25일(선불)" },
                  { value: "매월 말일(후불)", label: "매월 말일(후불)" }
                ]),
                renderField("등록번호", draft.contract && draft.contract.registration_no, function (value) { setContract("registration_no", value); }),
                renderField("전화번호", draft.contract && draft.contract.phone, function (value) { setContract("phone", value); }),
                renderField("주소", draft.contract && draft.contract.address, function (value) { setContract("address", value); }),
                renderField("계약금", draft.contract && draft.contract.contract_deposit, function (value) { setContract("contract_deposit", value); }, "number"),
                renderField("잔금", draft.contract && draft.contract.balance_amount, function (value) { setContract("balance_amount", value); }, "number"),
                renderSelectField("관리비 부가세", managementVatFlag(draft.contract && draft.contract.vat_note), function (value) { setContract("vat_note", value); }, [
                  { value: "O", label: "O - 관리비에도 10% 부과" },
                  { value: "X", label: "X - 관리비 부가세 없음" }
                ]),
                renderField("비고", draft.contract && draft.contract.memo, function (value) { setContract("memo", value); })
              ),
              h(SectionTitle, null, "\uc218\ub3c4\uc138"),
              h(
                "div",
                { className: "building-form-grid compact" },
                renderField("부과월", draft.water && draft.water.month, function (value) { setWater("month", value); }, "month"),
                renderField("전월 계량기", draft.water && draft.water.meter_start, function (value) { setWater("meter_start", value); }, "number"),
                renderField("당월 계량기", draft.water && draft.water.meter_end, function (value) { setWater("meter_end", value); }, "number"),
                renderField("청구금액", draft.water && draft.water.amount, function (value) { setWater("amount", value); }, "number")
              ),
              h("div", { className: "building-section-head" }, h(SectionTitle, null, "입출금 내역"), h("button", { type: "button", className: "mini-button", onClick: addTransaction }, "내역 추가")),
              h(
                "div",
                { className: "building-transaction-list" },
                ensureArray(draft.transactions).length
                  ? ensureArray(draft.transactions).map(function (tx, index) {
                      return h(
                        "div",
                        { key: tx.id || index, className: "building-transaction-row" },
                        h("input", { type: "date", value: tx.date || "", onChange: function (event) { setTransaction(index, "date", event.target.value); } }),
                        h("select", { value: tx.kind || "income", onChange: function (event) { setTransaction(index, "kind", event.target.value); } }, h("option", { value: "income" }, "입금"), h("option", { value: "expense" }, "출금")),
                        h("input", { value: tx.category || "", placeholder: "항목", onChange: function (event) { setTransaction(index, "category", event.target.value); } }),
                        h("input", { type: "text", inputMode: "decimal", value: formatNumberInput(tx.amount), placeholder: "금액", onChange: function (event) { setTransaction(index, "amount", cleanNumberInput(event.target.value)); } }),
                        h("input", { value: tx.memo || "", placeholder: "메모", onChange: function (event) { setTransaction(index, "memo", event.target.value); } }),
                        h("button", { type: "button", className: "mini-button danger", onClick: function () { removeTransaction(index); } }, "삭제")
                      );
                    })
                  : h("div", { className: "summary-help" }, "입출금 내역이 없습니다.")
              ),
              h("div", { className: "building-modal-actions" }, h("button", { type: "button", className: "secondary-button", onClick: closeUnit }, "취소"), h("button", { type: "button", className: "primary-button", disabled: saving, onClick: saveUnit }, saving ? "저장 중..." : "저장"))
                  ]
                : [
                    h(SectionTitle, { key: "contract-title" }, "계약 정보"),
                    h(
                      "div",
                      { key: "contract-view", className: "building-readonly-grid" },
                      h("div", null, h("span", null, "임차인 사업"), h("strong", null, (draft.contract && draft.contract.tenant_business) || "공실")),
                      h("div", null, h("span", null, "계약자"), h("strong", null, (draft.contract && draft.contract.tenant) || "-")),
                      h("div", null, h("span", null, "주소"), h("strong", null, (draft.contract && draft.contract.address) || "-")),
                      h("div", null, h("span", null, "계약기간"), h("strong", null, ((draft.contract && draft.contract.contract_date) || "-") + " ~ " + ((draft.contract && draft.contract.lease_end_date) || "-"))),
                      h("div", null, h("span", null, "잔금일"), h("strong", null, (draft.contract && draft.contract.balance_date) || "-")),
                      h("div", null, h("span", null, "납부일"), h("strong", null, (draft.contract && draft.contract.rent_payment_day) || "-")),
                      h("div", null, h("span", null, "보증금"), h("strong", null, money(draft.contract && draft.contract.deposit))),
                      h("div", null, h("span", null, "월세"), h("strong", null, money(draft.contract && draft.contract.monthly_rent))),
                      h("div", null, h("span", null, "예상 관리비"), h("strong", null, manwon(plannedManagementFeeManwon(draft)))),
                      h("div", null, h("span", null, "실제 관리비"), h("strong", null, money(draft.contract && draft.contract.management_fee))),
                      h("div", null, h("span", null, "계약금"), h("strong", null, money(draft.contract && draft.contract.contract_deposit))),
                      h("div", null, h("span", null, "잔금"), h("strong", null, money(draft.contract && draft.contract.balance_amount))),
                      h("div", null, h("span", null, "관리비 부가세"), h("strong", null, managementVatLabel(draft.contract && draft.contract.vat_note))),
                      h("div", null, h("span", null, "렌트프리"), h("strong", null, numberFormat((draft.contract && draft.contract.rent_free_months) || 0, 0) + "개월")),
                      h("div", null, h("span", null, "창업정착지원"), h("strong", null, numberFormat((draft.contract && draft.contract.settlement_support_months) || 0, 0) + "개월")),
                      h("div", { className: "wide" }, h("span", null, "비고"), h("strong", null, (draft.contract && draft.contract.memo) || "-"))
                    ),
                    h(SectionTitle, { key: "water-title" }, "수도세"),
                    h(
                      "div",
                      { key: "water-view", className: "building-readonly-grid compact" },
                      h("div", null, h("span", null, "부과월"), h("strong", null, (draft.water && draft.water.month) || "-")),
                      h("div", null, h("span", null, "전월 계량기"), h("strong", null, numberFormat((draft.water && draft.water.meter_start) || 0, 2))),
                      h("div", null, h("span", null, "당월 계량기"), h("strong", null, numberFormat((draft.water && draft.water.meter_end) || 0, 2))),
                      h("div", null, h("span", null, "청구금액"), h("strong", null, money(draft.water && draft.water.amount)))
                    ),
                    h(SectionTitle, { key: "tx-title" }, "입출금 내역"),
                    h(
                      "div",
                      { key: "tx-view", className: "building-readonly-list" },
                      ensureArray(draft.transactions).length
                        ? ensureArray(draft.transactions).map(function (tx, index) {
                            return h(
                              "div",
                              { key: tx.id || index, className: "building-readonly-row" },
                              h("strong", null, tx.date || "-"),
                              h("span", null, (tx.kind === "expense" ? "출금" : "입금") + " · " + (tx.category || "-")),
                              h("em", { className: tx.kind === "expense" ? "warn" : "ok" }, (tx.kind === "expense" ? "-" : "+") + money(tx.amount)),
                              h("small", null, tx.memo || "")
                            );
                          })
                        : h("div", { className: "summary-help" }, "입출금 내역이 없습니다.")
                    ),
                    h("div", { key: "view-actions", className: "building-modal-actions" }, h("button", { type: "button", className: "primary-button", onClick: function () { setUnitEditMode(true); } }, "수정"))
                  ]
            )
          )
        : null
    );
  }


    return BuildingManagementPage;
  }

  modules.buildingManagementPage = { createPage: createPage };
  global.StockAppModules = modules;
})(window);
