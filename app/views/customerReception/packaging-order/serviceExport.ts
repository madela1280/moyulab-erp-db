// app/views/customerReception/packaging-order/serviceExport.ts
//
// 포장재구매 그리드 엑셀(CSV) 다운로드.

import {
  PACKAGING_ORDER_COLUMNS,
  type PackagingOrderColumn,
  type PackagingOrderRow,
} from "@/views/customerReception/packaging-order/columns";

function formatCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getExportColumns(columns?: PackagingOrderColumn[]) {
  if (Array.isArray(columns) && columns.length > 0) return columns;
  return PACKAGING_ORDER_COLUMNS;
}

function makeCsvText(rows: PackagingOrderRow[], columns?: PackagingOrderColumn[]) {
  const exportColumns = getExportColumns(columns);
  const headerLine = exportColumns.map((col) => formatCsvCell(col.label)).join(",");

  const bodyLines = (Array.isArray(rows) ? rows : []).map((row) => {
    return exportColumns.map((col) => formatCsvCell(row.data?.[col.key] ?? "")).join(",");
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

  return `packaging-order_${yyyy}${mm}${dd}_${hh}${mi}.csv`;
}

export function downloadPackagingOrderCsv(rows: PackagingOrderRow[], columns?: PackagingOrderColumn[]) {
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
