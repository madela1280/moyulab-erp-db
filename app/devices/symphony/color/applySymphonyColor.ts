"use client";

import type { SymphonySoftColor } from "@/devices/symphony/color/ColorPopover";

export type CellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type SymphonyRowLike = { id: number; data: Record<string, any> };

function cellKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

/**
 * data 안에 스타일 전용 맵을 저장한다.
 * - 예: data.__cellStyle = { "123:제품명": { bg: "yellow" } }
 * - 값은 "부드러운 색상 키"만 저장하고, 실제 색은 렌더에서 매핑
 */
export function buildColorBulkPatch<T extends SymphonyRowLike>(args: {
  rows: T[];
  viewColumns: string[];
  range: CellRange;
  color: SymphonySoftColor; // "clear" 포함
}) {
  const { rows, viewColumns, range, color } = args;

  const updates: Array<{ id: number; patch: Record<string, any> }> = [];

  for (let r = range.startRow; r <= range.endRow; r++) {
    const row = rows[r];
    if (!row) continue;

    const styleMap: Record<string, any> = {
      ...(row.data?.__cellStyle ?? {}),
    };

    for (let c = range.startCol; c <= range.endCol; c++) {
      const colKey = viewColumns[c];
      if (!colKey) continue;

      const k = cellKey(row.id, colKey);

      if (color === "clear") {
        delete styleMap[k];
      } else {
        styleMap[k] = { bg: color };
      }
    }

    updates.push({
      id: row.id,
      patch: {
        __cellStyle: styleMap,
      },
    });
  }

  return updates;
}

/**
 * 렌더에서 스타일을 조회할 때 사용
 */
export function getCellBgClass(rowData: Record<string, any>, rowId: number, colKey: string) {
  const styleMap = (rowData?.__cellStyle ?? {}) as Record<string, any>;
  const info = styleMap[cellKey(rowId, colKey)];
  const bg = info?.bg as SymphonySoftColor | undefined;

  switch (bg) {
    case "red":
      return "bg-red-100";
    case "yellow":
      return "bg-yellow-100";
    case "blue":
      return "bg-blue-100";
    case "green":
      return "bg-green-100";
    case "purple":
      return "bg-purple-100";
    case "black":
      return "bg-slate-200";
    default:
      return "";
  }
}