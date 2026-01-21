"use client";

import type { LactinaSoftColor } from "@/devices/lactina/color/ColorPopover";
import type { ColorApplyMode } from "@/devices/lactina/color/ColorModeToggle";

export type CellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type LactinaRowLike = { id: number; data: Record<string, any> };

function cellKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

/**
 * 참고: 실제 렌더링은 Grid에서 inline style로 처리하는 것을 권장(심포니에서 확정 해결 방식).
 * 여기서는 (호환/디버그용으로) tailwind class 매핑도 같이 제공.
 */
const PALETTE: Record<
  Exclude<LactinaSoftColor, "clear">,
  { bgClass: string; textClass: string }
> = {
  red: { bgClass: "bg-red-200", textClass: "text-red-800" },
  yellow: { bgClass: "bg-yellow-200", textClass: "text-yellow-800" },
  blue: { bgClass: "bg-blue-200", textClass: "text-blue-800" },
  green: { bgClass: "bg-green-200", textClass: "text-green-800" },
  purple: { bgClass: "bg-purple-200", textClass: "text-purple-800" },
  black: { bgClass: "bg-slate-300", textClass: "text-slate-900" },
};

type CellStyle = {
  bg?: Exclude<LactinaSoftColor, "clear">;
  fg?: Exclude<LactinaSoftColor, "clear">;
};

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
export function buildColorBulkPatch<T extends LactinaRowLike>(args: {
  rows: T[];
  viewColumns: string[];
  range: CellRange;
  color: LactinaSoftColor; // "clear" 포함
  mode: ColorApplyMode; // "text" | "cell"
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

export function getCellBgClass(rowData: Record<string, any>, rowId: number, colKey: string) {
  const styleMap = (rowData?.__cellStyle ?? {}) as Record<string, CellStyle>;
  const info = styleMap[cellKey(rowId, colKey)];
  const bg = info?.bg;

  if (!bg) return "";
  const p = PALETTE[bg];
  return p?.bgClass ?? "";
}

export function getCellTextClass(rowData: Record<string, any>, rowId: number, colKey: string) {
  const styleMap = (rowData?.__cellStyle ?? {}) as Record<string, CellStyle>;
  const info = styleMap[cellKey(rowId, colKey)];
  const fg = info?.fg;

  if (!fg) return "";
  const p = PALETTE[fg];
  return p?.textClass ?? "";
}