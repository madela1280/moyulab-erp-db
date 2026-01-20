"use client";

import type { SymphonySoftColor } from "@/devices/symphony/color/ColorPopover";
import type { ColorApplyMode } from "@/devices/symphony/color/ColorModeToggle";

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
 * data.__cellStyle 구조:
 * {
 *   "123:제품명": { bg?: "yellow", fg?: "red" }
 * }
 *
 * - mode === "cell"  -> bg 적용
 * - mode === "text"  -> fg 적용
 * - color === "clear" -> 해당 모드의 색만 제거(남은 색 없으면 키 삭제)
 */
export function buildColorBulkPatch<T extends SymphonyRowLike>(args: {
  rows: T[];
  viewColumns: string[];
  range: CellRange;
  color: SymphonySoftColor; // "clear" 포함
  mode: ColorApplyMode; // "text" | "cell"
}) {
  const { rows, viewColumns, range, color, mode } = args;

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
      const prev = (styleMap[k] ?? {}) as { bg?: SymphonySoftColor; fg?: SymphonySoftColor };

      if (color === "clear") {
        const next = { ...prev };
        if (mode === "cell") delete next.bg;
        else delete next.fg;

        if (!next.bg && !next.fg) delete styleMap[k];
        else styleMap[k] = next;
      } else {
        const next = { ...prev };
        if (mode === "cell") next.bg = color;
        else next.fg = color;
        styleMap[k] = next;
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

export function getCellTextClass(rowData: Record<string, any>, rowId: number, colKey: string) {
  const styleMap = (rowData?.__cellStyle ?? {}) as Record<string, any>;
  const info = styleMap[cellKey(rowId, colKey)];
  const fg = info?.fg as SymphonySoftColor | undefined;

  switch (fg) {
    case "red":
      return "text-red-600";
    case "yellow":
      return "text-yellow-700";
    case "blue":
      return "text-blue-700";
    case "green":
      return "text-green-700";
    case "purple":
      return "text-purple-700";
    case "black":
      return "text-slate-900";
    default:
      return "";
  }
}