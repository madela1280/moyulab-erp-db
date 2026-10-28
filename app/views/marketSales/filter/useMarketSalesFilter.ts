"use client";

// app/views/marketSales/filter/useMarketSalesFilter.ts
//
// 마켓매출 화면용 컬럼 필터 + 통검색. 롯데택배(useLotteShipmentFilter.ts)와 동일한 방식.

import type { MarketSalesRow } from "@/views/marketSales/types";

export type ColumnFilterState = {
  selectedByKey: Record<string, Set<string>>;
};

export function createEmptyFilterState(): ColumnFilterState {
  return { selectedByKey: {} };
}

export const SEARCHABLE_KEYS: (keyof MarketSalesRow)[] = ["품목", "품목명"];

export function getFilterValueForColumn(key: keyof MarketSalesRow, row: MarketSalesRow): string {
  const v = row[key];
  return v == null ? "" : String(v);
}

export function getUniqueValuesForColumn(rows: MarketSalesRow[], key: keyof MarketSalesRow): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(getFilterValueForColumn(key, r));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
}

export function applyMarketSalesFilter(rows: MarketSalesRow[], filter: ColumnFilterState): MarketSalesRow[] {
  const entries = Object.entries(filter.selectedByKey);
  if (!entries.length) return rows;

  return rows.filter((row) => {
    for (const [key, selectedSet] of entries) {
      if (!selectedSet || selectedSet.size === 0) continue;
      const v = getFilterValueForColumn(key as keyof MarketSalesRow, row);
      if (!selectedSet.has(v)) return false;
    }
    return true;
  });
}

export function isFilterActive(filter: ColumnFilterState) {
  for (const set of Object.values(filter.selectedByKey)) {
    if (set && set.size > 0) return true;
  }
  return false;
}

export function applyMarketSalesSearch(rows: MarketSalesRow[], queryText: string): MarketSalesRow[] {
  const q = queryText.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((row) =>
    SEARCHABLE_KEYS.some((key) => getFilterValueForColumn(key, row).toLowerCase().includes(q))
  );
}
