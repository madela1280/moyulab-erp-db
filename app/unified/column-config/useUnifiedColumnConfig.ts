// app/unified/column-config/useUnifiedColumnConfig.ts
"use client";

import { useCallback, useMemo, useState } from "react";

export function useUnifiedColumnConfig(columns: readonly string[]) {
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...columns]);

  // 폭 조절 unit: 기본 20(=기준폭). 1이면 1/20 수준.
  const [colWidthUnitByKey, setColWidthUnitByKey] = useState<Record<string, number>>(
    () => Object.fromEntries(columns.map((c) => [c, 20]))
  );

  const toggleColumnEditMode = useCallback(() => {
    setIsColumnEditMode((v) => !v);
  }, []);

  const moveColumnLeft = useCallback((key: string) => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveColumnRight = useCallback((key: string) => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const setColumnWidthUnit = useCallback((key: string, unit: number) => {
    const safe = Number.isFinite(unit) ? Math.max(1, Math.min(200, Math.floor(unit))) : 20;
    setColWidthUnitByKey((prev) => ({ ...prev, [key]: safe }));
  }, []);

  const colWidthPxByKey = useMemo(() => {
    const BASE = 200; // unit=20 일 때 기준폭
    const MIN = 40;
    const MAX = 600;

    const out: Record<string, number> = {};
    for (const c of columns) {
      const unit = colWidthUnitByKey[c] ?? 20;
      const px = (BASE * unit) / 20;
      out[c] = Math.max(MIN, Math.min(MAX, Math.round(px)));
    }
    return out;
  }, [columns, colWidthUnitByKey]);

  return {
    isColumnEditMode,
    toggleColumnEditMode,
    columnOrder,
    moveColumnLeft,
    moveColumnRight,
    colWidthUnitByKey,
    setColumnWidthUnit,
    colWidthPxByKey,
  };
}