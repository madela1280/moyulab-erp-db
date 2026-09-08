// app/views/customerReception/extend-order/clipboard.ts
//
// 그리드 영역지정 복사/삭제용 헬퍼. packaging-order/clipboard.ts와 같은 로직이지만
// 포장재구매 코드를 건드리지 않기 위해 이 기능 전용으로 분리했다.

import {
  getCellDisplayValue,
  type ExtendOrderColumn,
  type ExtendOrderRow,
} from "@/views/customerReception/extend-order/columns";

export type ExtendOrderCellPoint = {
  rowIndex: number;
  colIndex: number;
};

export type ExtendOrderCellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export function buildExtendOrderCellRange(
  anchor: ExtendOrderCellPoint,
  current: ExtendOrderCellPoint
): ExtendOrderCellRange {
  return {
    startRow: Math.min(anchor.rowIndex, current.rowIndex),
    endRow: Math.max(anchor.rowIndex, current.rowIndex),
    startCol: Math.min(anchor.colIndex, current.colIndex),
    endCol: Math.max(anchor.colIndex, current.colIndex),
  };
}

export function isExtendOrderCellInRange(
  rowIndex: number,
  colIndex: number,
  range: ExtendOrderCellRange | null
) {
  if (!range) return false;

  return (
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol
  );
}

function normalizeCopyText(value: unknown) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

export function makeExtendOrderTSV(
  rows: ExtendOrderRow[],
  columns: ExtendOrderColumn[],
  range: ExtendOrderCellRange | null
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
