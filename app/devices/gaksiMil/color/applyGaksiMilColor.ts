"use client";

import type { GaksiMilSoftColor } from "@/devices/gaksiMil/color/ColorPopover";
import type { ColorApplyMode } from "@/devices/gaksiMil/color/ColorModeToggle";

export type CellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type GaksiMilRowLike = { id: number; data: Record<string, any> };

function cellKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

const PALETTE: Record<
  Exclude<GaksiMilSoftColor, "clear">,
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
  bg?: Exclude<GaksiMilSoftColor, "clear">;
  fg?: Exclude<GaksiMilSoftColor, "clear">;
};

export function buildColorBulkPatch<T extends GaksiMilRowLike>(args: {
  rows: T[];
  viewColumns: string[];
  range: CellRange;
  color: GaksiMilSoftColor;
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