// app/views/customerReception/packaging-order/clipboard.ts
//
// 그리드 영역지정 복사/삭제용 헬퍼. dataUpload/return-recovery/clipboard.ts와 같은 로직이지만
// 반납회수 코드를 건드리지 않기 위해 이 기능 전용으로 분리했다.

import type { PackagingOrderColumn, PackagingOrderRow } from "@/views/customerReception/packaging-order/columns";

export type PackagingOrderCellPoint = {
  rowIndex: number;
  colIndex: number;
};

export type PackagingOrderCellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export function buildPackagingOrderCellRange(
  anchor: PackagingOrderCellPoint,
  current: PackagingOrderCellPoint
): PackagingOrderCellRange {
  return {
    startRow: Math.min(anchor.rowIndex, current.rowIndex),
    endRow: Math.max(anchor.rowIndex, current.rowIndex),
    startCol: Math.min(anchor.colIndex, current.colIndex),
    endCol: Math.max(anchor.colIndex, current.colIndex),
  };
}

export function isPackagingOrderCellInRange(
  rowIndex: number,
  colIndex: number,
  range: PackagingOrderCellRange | null
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

export function makePackagingOrderTSV(
  rows: PackagingOrderRow[],
  columns: PackagingOrderColumn[],
  range: PackagingOrderCellRange | null
) {
  if (!range) return "";

  const lines: string[] = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    const cells: string[] = [];

    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const col = columns[colIndex];
      cells.push(normalizeCopyText(row?.data?.[col.key] ?? ""));
    }

    lines.push(cells.join("\t"));
  }

  return lines.join("\n");
}
