// app/views/customerReception/refund-request/serviceExport.ts
//
// 환불접수 그리드 엑셀(CSV) 다운로드. 포장재구매/반납접수와 동일한 패턴.

import {
  REFUND_REQUEST_COLUMNS,
  getCellDisplayValue,
  type RefundRequestColumn,
  type RefundRequestRow,
} from "@/views/customerReception/refund-request/columns";

function formatCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getExportColumns(columns?: RefundRequestColumn[]) {
  if (Array.isArray(columns) && columns.length > 0) return columns;
  return REFUND_REQUEST_COLUMNS;
}

function makeCsvText(rows: RefundRequestRow[], columns?: RefundRequestColumn[]) {
  const exportColumns = getExportColumns(columns);
  const headerLine = exportColumns.map((col) => formatCsvCell(col.label)).join(",");

  const bodyLines = (Array.isArray(rows) ? rows : []).map((row) => {
    return exportColumns.map((col) => formatCsvCell(getCellDisplayValue(row, col))).join(",");
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

  return `refund-request_${yyyy}${mm}${dd}_${hh}${mi}.csv`;
}

export function downloadRefundRequestCsv(rows: RefundRequestRow[], columns?: RefundRequestColumn[]) {
  const csvText = makeCsvText(rows, columns);
  const bom = String.fromCharCode(0xfeff); // UTF-8 BOM (엑셀에서 한글 깨짐 방지)
  const blob = new Blob([bom, csvText], { type: "text/csv;charset=utf-8;" });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = makeDownloadFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}
