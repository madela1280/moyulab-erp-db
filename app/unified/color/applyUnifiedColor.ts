"use client";

import type { UnifiedSoftColor } from "@/unified/color/ColorPopover";
import type { ColorApplyMode } from "@/unified/color/ColorModeToggle";

export type CellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type UnifiedRowLike = { id: number; data: Record<string, any> };

function cellKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

type CellStyle = { bg?: Exclude<UnifiedSoftColor, "clear">; fg?: Exclude<UnifiedSoftColor, "clear"> };

/**
 * unified.data.__cellStyle 구조:
 * {
 *   "123:종료일": { bg?: "yellow", fg?: "red" }
 * }
 *
 * - mode === "cell"  -> bg 적용
 * - mode === "text"  -> fg 적용
 * - color === "clear" -> 해당 모드의 색만 제거(남은 색 없으면 키 삭제)
 */
export function buildUnifiedColorBulkPatch<T extends UnifiedRowLike>(args: {
  rows: T[];
  viewColumns: string[];
  range: CellRange;
  color: UnifiedSoftColor;
  mode: ColorApplyMode;
}) {
  const { rows, viewColumns, range, color, mode } = args;

  const updates: Array<{ id: number; patch: Record<string, any> }> = [];

  for (let r = range.startRow; r <= range.endRow; r++) {
    const row = rows[r];
    if (!row) continue;

    const styleMap: Record<string, CellStyle> = {
      ...(row.data?.__cellStyle ?? {}),
    };

    for (let c = range.startCol; c <= range.endCol; c++) {
      const colKey = viewColumns[c];
      if (!colKey) continue;

      const k = cellKey(row.id, colKey);
      const prev: CellStyle = styleMap[k] ?? {};

      if (color === "clear") {
        const next: CellStyle = { ...prev };
        if (mode === "cell") delete next.bg;
        else delete next.fg;

        if (!next.bg && !next.fg) delete styleMap[k];
        else styleMap[k] = next;
      } else {
        const next: CellStyle = { ...prev };
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