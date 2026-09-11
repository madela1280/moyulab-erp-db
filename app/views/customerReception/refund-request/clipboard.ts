// app/views/customerReception/refund-request/clipboard.ts
//
// 그리드 영역지정 복사/삭제용 헬퍼. 다른 고객접수 그리드들과 동일한 패턴.

import {
  getCellDisplayValue,
  type RefundRequestColumn,
  type RefundRequestRow,
} from "@/views/customerReception/refund-request/columns";

export type RefundRequestCellPoint = { rowIndex: number; colIndex: number };
export type RefundRequestCellRange = { startRow: number; endRow: number; startCol: number; endCol: number };

export function buildRefundRequestCellRange(
  anchor: RefundRequestCellPoint,
  current: RefundRequestCellPoint
): RefundRequestCellRange {
  return {
    startRow: Math.min(anchor.rowIndex, current.rowIndex),
    endRow: Math.max(anchor.rowIndex, current.rowIndex),
    startCol: Math.min(anchor.colIndex, current.colIndex),
    endCol: Math.max(anchor.colIndex, current.colIndex),
  };
}

export function isRefundRequestCellInRange(
  rowIndex: number,
  colIndex: number,
  range: RefundRequestCellRange | null
) {
  if (!range) return false;
  return rowIndex >= range.startRow && rowIndex <= range.endRow && colIndex >= range.startCol && colIndex <= range.endCol;
}

function normalizeCopyText(value: unknown) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

export function makeRefundRequestTSV(
  rows: RefundRequestRow[],
  columns: RefundRequestColumn[],
  range: RefundRequestCellRange | null
) {
  if (!range) return "";

  const lines: string[] = [];
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    const cells: string[] = [];
    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const col = columns[colIndex];
      const value = row ? getCellDisplayValue(row, col) : "";
      cells.push(normalizeCopyText(value));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}
