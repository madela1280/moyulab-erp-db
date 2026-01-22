"use client";

import type { SwingRow } from "@/devices/swing/service/serviceSwing";

export type ColumnFilterState = {
  selectedByKey: Record<string, Set<string>>;
  searchByKey: Record<string, string>;
};

export function createEmptyFilterState(): ColumnFilterState {
  return { selectedByKey: {}, searchByKey: {} };
}

function toText(v: any) {
  return String(v ?? "").trim();
}

export function applySwingFilter(rows: SwingRow[], state: ColumnFilterState) {
  const selectedByKey = state?.selectedByKey ?? {};
  const searchByKey = state?.searchByKey ?? {};

  return rows.filter((row) => {
    for (const [key, set] of Object.entries(selectedByKey)) {
      if (!set || set.size === 0) continue;
      const v = toText(row?.data?.[key]);
      if (!set.has(v)) return false;
    }

    for (const [key, q] of Object.entries(searchByKey)) {
      const qq = toText(q);
      if (!qq) continue;
      const v = toText(row?.data?.[key]).toLowerCase();
      if (!v.includes(qq.toLowerCase())) return false;
    }

    return true;
  });
}

export function getUniqueValuesForColumn(rows: SwingRow[], key: string) {
  const set = new Set<string>();
  for (const r of rows) {
    set.add(toText(r?.data?.[key]));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
}

export function isFilterActive(state: ColumnFilterState) {
  const selectedByKey = state?.selectedByKey ?? {};
  const searchByKey = state?.searchByKey ?? {};

  for (const s of Object.values(selectedByKey)) {
    if (s && s.size > 0) return true;
  }
  for (const q of Object.values(searchByKey)) {
    if (toText(q)) return true;
  }
  return false;
}