"use client";

// app/views/lotteShipment/filter/useLotteShipmentFilter.ts
//
// 롯데택배 리스트용 컬럼 필터 + 통검색. 통합관리(app/unified/filter/useUnifiedFilter.ts)와
// 같은 방식(컬럼별 체크박스 선택)이지만, 롯데택배 행은 { data: {...} } 구조가 아니라
// 평평한(flat) LotteShipmentRow라서 그에 맞게 따로 둔다.

import type { LotteShipmentRow } from "@/views/lotteShipment/service";

export type ColumnFilterState = {
  selectedByKey: Record<string, Set<string>>;
};

export function createEmptyFilterState(): ColumnFilterState {
  return { selectedByKey: {} };
}

// 통검색 대상 컬럼: 운송장번호 ~ 스캔일시 사이(집하일자/전송상태는 제외)
export const SEARCHABLE_KEYS: (keyof LotteShipmentRow)[] = [
  "운송장번호",
  "주문번호",
  "수하인명",
  "수하인전화번호",
  "수하인주소",
  "기기번호",
  "스캔일시",
];

export function getLotteFilterValueForColumn(
  key: keyof LotteShipmentRow,
  row: LotteShipmentRow,
  formatDateTime: (v: string | null) => string
): string {
  if (key === "스캔일시") return formatDateTime(row.스캔일시);
  const v = row[key];
  return v == null ? "" : String(v);
}

export function getUniqueValuesForColumn(
  rows: LotteShipmentRow[],
  key: keyof LotteShipmentRow,
  formatDateTime: (v: string | null) => string
): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(getLotteFilterValueForColumn(key, r, formatDateTime));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
}

export function applyLotteFilter(
  rows: LotteShipmentRow[],
  filter: ColumnFilterState,
  formatDateTime: (v: string | null) => string
): LotteShipmentRow[] {
  const entries = Object.entries(filter.selectedByKey);
  if (!entries.length) return rows;

  return rows.filter((row) => {
    for (const [key, selectedSet] of entries) {
      if (!selectedSet || selectedSet.size === 0) continue;
      const v = getLotteFilterValueForColumn(key as keyof LotteShipmentRow, row, formatDateTime);
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

export function applyLotteSearch(
  rows: LotteShipmentRow[],
  query: string,
  formatDateTime: (v: string | null) => string
): LotteShipmentRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((row) =>
    SEARCHABLE_KEYS.some((key) => getLotteFilterValueForColumn(key, row, formatDateTime).toLowerCase().includes(q))
  );
}
