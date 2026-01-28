"use client";

export type SortDir = "asc" | "desc";

export type UnifiedSortState = {
  key: string | null;
  dir: SortDir;
};

export function defaultSortState(): UnifiedSortState {
  return { key: null, dir: "asc" };
}

function toComparable(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * rows를 텍스트 기준으로 정렬(오름/내림)
 * - 원본 rows는 건드리지 않고 복사본을 반환
 */
export function applyUnifiedSort<T extends { data: Record<string, any> }>(
  rows: T[],
  sort: UnifiedSortState
): T[] {
  if (!sort.key) return rows;

  const key = sort.key;
  const dir = sort.dir;

  const copy = [...rows];
  copy.sort((a, b) => {
    const av = toComparable(a.data?.[key]);
    const bv = toComparable(b.data?.[key]);
    const cmp = av.localeCompare(bv, "ko-KR");
    return dir === "asc" ? cmp : -cmp;
  });

  return copy;
}