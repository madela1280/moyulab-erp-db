import {
  RETURN_RECOVERY_COLUMNS,
  type ReturnRecoveryRow,
} from "@/views/dataUpload/return-recovery/columns";

function formatCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsvText(rows: ReturnRecoveryRow[]) {
  const headerLine = RETURN_RECOVERY_COLUMNS.map((col) => formatCsvCell(col.label)).join(",");

  const bodyLines = (Array.isArray(rows) ? rows : []).map((row) => {
    return RETURN_RECOVERY_COLUMNS.map((col) => formatCsvCell(row.data?.[col.key] ?? "")).join(",");
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

  return `return-recovery_${yyyy}${mm}${dd}_${hh}${mi}.csv`;
}

export function downloadReturnRecoveryCsv(rows: ReturnRecoveryRow[]) {
  const csvText = makeCsvText(rows);
  const bom = "\uFEFF";
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