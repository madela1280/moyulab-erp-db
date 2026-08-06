import type { ReturnRecoveryColumn, ReturnRecoveryRow } from "@/views/dataUpload/return-recovery/columns";

export type ReturnRecoveryCellPoint = {
  rowIndex: number;
  colIndex: number;
};

export type ReturnRecoveryCellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export function buildReturnRecoveryCellRange(
  anchor: ReturnRecoveryCellPoint,
  current: ReturnRecoveryCellPoint
): ReturnRecoveryCellRange {
  return {
    startRow: Math.min(anchor.rowIndex, current.rowIndex),
    endRow: Math.max(anchor.rowIndex, current.rowIndex),
    startCol: Math.min(anchor.colIndex, current.colIndex),
    endCol: Math.max(anchor.colIndex, current.colIndex),
  };
}

export function isReturnRecoveryCellInRange(
  rowIndex: number,
  colIndex: number,
  range: ReturnRecoveryCellRange | null
) {
  if (!range) return false;

  return (
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol
  );
}

export function normalizeReturnRecoveryCopyText(value: unknown) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

export function makeReturnRecoveryTSV(
  rows: ReturnRecoveryRow[],
  columns: ReturnRecoveryColumn[],
  range: ReturnRecoveryCellRange | null
) {
  if (!range) return "";

  const lines: string[] = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    const cells: string[] = [];

    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const col = columns[colIndex];
      cells.push(normalizeReturnRecoveryCopyText(row?.data?.[col.key] ?? ""));
    }

    lines.push(cells.join("\t"));
  }

  return lines.join("\n");
}