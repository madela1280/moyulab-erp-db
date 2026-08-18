import { RETURN_REQUEST_LIST_COLUMNS } from "@/customerReception/return-request/columns";
import type {
  ReturnRequestColumn,
  ReturnRequestRow,
} from "@/customerReception/return-request/types";

function formatCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getExportColumns(columns?: ReturnRequestColumn[]) {
  if (Array.isArray(columns) && columns.length > 0) return columns;
  return RETURN_REQUEST_LIST_COLUMNS;
}

function getCellValue(row: ReturnRequestRow, col: ReturnRequestColumn) {
  if (col.key === "receivedAt") return row.receivedAt;
  if (col.key === "processStatus") return row.processStatus;
  return row.data?.[col.key] ?? "";
}

function makeCsvText(rows: ReturnRequestRow[], columns?: ReturnRequestColumn[]) {
  const exportColumns = getExportColumns(columns);
  const headerLine = exportColumns.map((col) => formatCsvCell(col.label)).join(",");

  const bodyLines = (Array.isArray(rows) ? rows : []).map((row) => {
    return exportColumns.map((col) => formatCsvCell(getCellValue(row, col))).join(",");
  });

  return [headerLine, ...bodyLines].join("\r\n");
}

function makeDownloadFileName() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  return `return-request-list_${yyyy}${mm}${dd}_${hh}${mi}.csv`;
}

export function downloadReturnRequestCsv(rows: ReturnRequestRow[], columns?: ReturnRequestColumn[]) {
  const csvText = makeCsvText(rows, columns);
  const bom = "﻿";
  const blob = new Blob([bom, csvText], {
    type: "text/csv;charset=utf-8;",
  });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = makeDownloadFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}
