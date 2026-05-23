import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

function asDateLabel(value) {
  return String(value || "");
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildDailyMatrix(rows) {
  return [
    [
      "Date",
      "Portfolio Return %",
      "Benchmark Return %",
      "Daily Return %",
      "NAV",
      "Trade Count",
      "Stock Weight Total %",
      "Sector Weight Total %",
    ],
    ...rows.map((row) => [
      asDateLabel(row.date),
      numberOrZero(row.portfolio_return_pct),
      numberOrZero(row.benchmark_return_pct),
      numberOrZero(row.daily_return_pct),
      numberOrZero(row.nav),
      numberOrZero(row.trade_count),
      numberOrZero(row.stock_total_pct),
      numberOrZero(row.sector_total_pct),
    ]),
  ];
}

function buildAllocationMatrix(rows, keys) {
  return [
    ["Date", ...keys],
    ...rows.map((row) => [asDateLabel(row.date), ...keys.map((key) => numberOrZero(row[key]))]),
  ];
}

function colorForIndex(index) {
  const palette = [
    "#f6c445",
    "#4c8bf5",
    "#ef8b60",
    "#76c3ad",
    "#d385f2",
    "#67b7dc",
    "#cfa34b",
    "#87d96c",
    "#f47c96",
    "#8bb0ff",
    "#f2a65a",
    "#9bc995",
    "#d7aefb",
    "#7dd3fc",
  ];
  return palette[index % palette.length];
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node portfolio_export_builder.mjs <input.json> <output.xlsx>");
  }

  const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const workbook = Workbook.create();

  const dashboard = workbook.worksheets.add("Dashboard");
  const dailySheet = workbook.worksheets.add("Daily Data");
  const sectorSheet = workbook.worksheets.add("Sector Allocation");
  const stockSheet = workbook.worksheets.add("Stock Allocation");

  const summary = payload.summary || {};
  dashboard.getRange("A1:F6").values = [
    ["Portfolio Backtest Export", null, null, null, null, null],
    ["Start Date", asDateLabel(summary.start_date), "End Date", asDateLabel(summary.end_date), null, null],
    ["Initial Capital", numberOrZero(summary.initial_capital), "Final NAV", numberOrZero(summary.final_nav), null, null],
    ["Total Return %", numberOrZero(summary.total_return_pct), "Rebalance Count", numberOrZero(summary.rebalance_count), null, null],
    ["Latest Holding Count", numberOrZero(summary.holding_count_latest), null, null, null, null],
    ["Exported At", new Date().toISOString().slice(0, 19).replace("T", " "), null, null, null, null],
  ];
  dashboard.getRange("A1:F1").merge();
  dashboard.getRange("A1:F1").format = {
    fill: "#1f3b5c",
    font: { bold: true, color: "#ffffff", size: 16 },
    horizontalAlignment: "center",
  };
  dashboard.getRange("A2:F6").format = {
    font: { size: 11 },
  };
  dashboard.getRange("B3,B4,B5,D3,D4").format.numberFormat = "0.00";
  dashboard.getRange("B3,D3").format.numberFormat = "#,##0";
  dashboard.getRange("B4").format.numberFormat = "0.00";
  dashboard.getRange("A1:F6").format.autofitColumns();

  const dailyMatrix = buildDailyMatrix(payload.daily_rows || []);
  const dailyEndRow = dailyMatrix.length;
  dailySheet.getRange(`A1:H${dailyEndRow}`).values = dailyMatrix;
  dailySheet.getRange("A1:H1").format = {
    fill: "#2d4f73",
    font: { bold: true, color: "#ffffff" },
  };
  dailySheet.getRange(`B2:D${dailyEndRow}`).format.numberFormat = "0.00";
  dailySheet.getRange(`E2:E${dailyEndRow}`).format.numberFormat = "#,##0";
  dailySheet.getRange(`F2:H${dailyEndRow}`).format.numberFormat = "0.00";
  dailySheet.freezePanes.freezeRows(1);
  dailySheet.getRange(`A1:H${dailyEndRow}`).format.autofitColumns();

  const sectorMatrix = buildAllocationMatrix(payload.sector_rows || [], payload.sector_keys || []);
  const sectorEndCol = String.fromCharCode("A".charCodeAt(0) + Math.min((payload.sector_keys || []).length, 25));
  sectorSheet.getRange(`A1:${sectorEndCol}${sectorMatrix.length}`).write(sectorMatrix);
  sectorSheet.getRange(`A1:${sectorEndCol}1`).format = {
    fill: "#2d4f73",
    font: { bold: true, color: "#ffffff" },
  };
  sectorSheet.freezePanes.freezeRows(1);
  sectorSheet.getUsedRange().format.autofitColumns();

  const stockMatrix = buildAllocationMatrix(payload.stock_rows || [], payload.stock_keys || []);
  const stockLastColumnIndex = Math.min((payload.stock_keys || []).length, 25);
  const stockEndCol = String.fromCharCode("A".charCodeAt(0) + stockLastColumnIndex);
  stockSheet.getRange(`A1:${stockEndCol}${stockMatrix.length}`).write(stockMatrix);
  stockSheet.getRange(`A1:${stockEndCol}1`).format = {
    fill: "#2d4f73",
    font: { bold: true, color: "#ffffff" },
  };
  stockSheet.freezePanes.freezeRows(1);
  stockSheet.getUsedRange().format.autofitColumns();

  const categories = (payload.daily_rows || []).map((row) => asDateLabel(row.date));
  const returnChart = dashboard.charts.add("line", {
    title: "Cumulative Return %",
    categories,
    series: [
      {
        name: "Portfolio",
        values: (payload.daily_rows || []).map((row) => numberOrZero(row.portfolio_return_pct)),
        line: { color: "#f6c445", width: 2.2 },
      },
      {
        name: "KOSPI",
        values: (payload.daily_rows || []).map((row) => numberOrZero(row.benchmark_return_pct)),
        line: { color: "#4c8bf5", width: 2.0 },
      },
    ],
    hasLegend: true,
    legend: { position: "top" },
    xAxis: { axisType: "textAxis", tickLabelInterval: Math.max(1, Math.ceil(categories.length / 12)) },
    yAxis: { numberFormatCode: "0.0%" },
    from: { row: 7, col: 0 },
    extent: { widthPx: 860, heightPx: 300 },
  });
  returnChart.title.text = "누적 수익률 차트";

  const sectorSeries = (payload.sector_keys || []).map((key, index) => ({
    name: key,
    values: (payload.sector_rows || []).map((row) => numberOrZero(row[key])),
    fill: { color: colorForIndex(index) },
  }));
  const sectorChart = dashboard.charts.add("bar", {
    title: "Daily Sector Allocation %",
    categories,
    series: sectorSeries,
    hasLegend: true,
    legend: { position: "right" },
    barOptions: { direction: "column", grouping: "stacked", gapWidth: 40 },
    xAxis: { axisType: "textAxis", tickLabelInterval: Math.max(1, Math.ceil(categories.length / 12)) },
    yAxis: { numberFormatCode: "0.0" },
    from: { row: 24, col: 0 },
    extent: { widthPx: 860, heightPx: 340 },
  });
  sectorChart.title.text = "일별 섹터 비중 누적 차트";

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
