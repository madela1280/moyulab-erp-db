"use client";

export type ColumnFilterState = {
  // 컬럼별로 선택된 값들(문자열) 저장
  selectedByKey: Record<string, Set<string>>;
  // 컬럼별 검색어(팝오버 내부 검색)
  searchByKey: Record<string, string>;
};

export function createEmptyFilterState(): ColumnFilterState {
  return {
    selectedByKey: {},
    searchByKey: {},
  };
}

function toText(v: any) {
  if (v == null) return "";
  return String(v);
}

/**
 * 특정 컬럼의 "고유 값 목록" 생성(필터 팝오버 체크리스트용)
 */
export function getUniqueValuesForColumn<T extends { data: Record<string, any> }>(
  rows: T[],
  key: string
) {
  const set = new Set<string>();
  for (const r of rows) set.add(toText(r.data?.[key]));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
}

/**
 * rows에 현재 필터 상태를 적용
 * - 컬럼별 selected Set이 존재하면, 그 값들만 통과
 */
export function applySymphonyFilter<T extends { data: Record<string, any> }>(
  rows: T[],
  filter: ColumnFilterState
): T[] {
  const entries = Object.entries(filter.selectedByKey);

  // 아무 필터도 없으면 그대로
  if (!entries.length) return rows;

  return rows.filter((row) => {
    for (const [key, selectedSet] of entries) {
      if (!selectedSet || selectedSet.size === 0) continue;
      const v = toText(row.data?.[key]);
      if (!selectedSet.has(v)) return false;
    }
    return true;
  });
}

/**
 * 필터가 "실제로 적용되어 있는지" (UI 표시용)
 */
export function isFilterActive(filter: ColumnFilterState) {
  for (const set of Object.values(filter.selectedByKey)) {
    if (set && set.size > 0) return true;
  }
  return false;
}