"use client";

const UNIFIED_DATE_FILTER_KEYS = new Set([
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
  "신청일",
]);

export type ColumnFilterState = {
  selectedByKey: Record<string, Set<string>>;
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

export function isUnifiedDateFilterKey(key: string) {
  return UNIFIED_DATE_FILTER_KEYS.has(String(key ?? ""));
}

function parseUnifiedYearMonth(raw: any): { year: number; month: number } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})[-./](\d{2})[-./](\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;

  return { year, month };
}

function parseUnifiedYearMonthLabel(label: string): { year: number; month: number } | null {
  const s = String(label ?? "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})년\s*(\d{1,2})월$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;

  return { year, month };
}

export function formatUnifiedYearMonthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

export function getUnifiedFilterValueForColumn(key: string, rawValue: any) {
  const text = toText(rawValue);

  if (!isUnifiedDateFilterKey(key)) {
    return text;
  }

  const ym = parseUnifiedYearMonth(text);
  if (!ym) return text;

  return formatUnifiedYearMonthLabel(ym.year, ym.month);
}

function compareUnifiedFilterValues(key: string, a: string, b: string) {
  const av = String(a ?? "");
  const bv = String(b ?? "");

  if (av === "" && bv !== "") return -1;
  if (av !== "" && bv === "") return 1;

  if (isUnifiedDateFilterKey(key)) {
    const aYm = parseUnifiedYearMonthLabel(av);
    const bYm = parseUnifiedYearMonthLabel(bv);

    if (aYm && bYm) {
      if (aYm.year !== bYm.year) return aYm.year - bYm.year;
      if (aYm.month !== bYm.month) return aYm.month - bYm.month;
      return 0;
    }
  }

  return av.localeCompare(bv, "ko-KR");
}

/**
 * 특정 컬럼의 "고유 값 목록" 생성(필터 팝오버 체크리스트용)
 * - 날짜 컬럼은 YYYY-MM-DD → YYYY년 M월 그룹값으로 변환
 */
export function getUniqueValuesForColumn<T extends { data: Record<string, any> }>(
  rows: T[],
  key: string
) {
  const set = new Set<string>();

  for (const r of rows) {
    set.add(getUnifiedFilterValueForColumn(key, r.data?.[key]));
  }

  return Array.from(set).sort((a, b) => compareUnifiedFilterValues(key, a, b));
}

/**
 * rows에 현재 필터 상태를 적용
 * - 컬럼별 selected Set이 존재하면, 그 값들만 통과
 * - 날짜 컬럼은 YYYY-MM-DD 실제값을 YYYY년 M월 그룹값으로 변환 후 비교
 */
export function applyUnifiedFilter<T extends { data: Record<string, any> }>(
  rows: T[],
  filter: ColumnFilterState
): T[] {
  const entries = Object.entries(filter.selectedByKey);

  if (!entries.length) return rows;

  return rows.filter((row) => {
    for (const [key, selectedSet] of entries) {
      if (!selectedSet || selectedSet.size === 0) continue;

      const v = getUnifiedFilterValueForColumn(key, row.data?.[key]);
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