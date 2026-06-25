import { unifiedColumns } from "@/unified/columns/unifiedColumns";
import type { UnifiedSearchRange } from "@/unified/search/unifiedSearch.types";

export const UNIFIED_SEARCH_RANGE_START_KEY = "기기번호";
export const UNIFIED_SEARCH_RANGE_END_KEY = "반납완료일";

const FALLBACK_UNIFIED_SEARCH_COLUMNS = [
  "기기번호",
  "기종",
  "에러횟수",
  "제품",
  "수취인명",
  "연락처1",
  "연락처2",
  "계약자주소",
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
] as const;

export const UNIFIED_SEARCH_RANGE: UnifiedSearchRange = {
  startKey: UNIFIED_SEARCH_RANGE_START_KEY,
  endKey: UNIFIED_SEARCH_RANGE_END_KEY,
};

function normalizeColumns(input: readonly string[] | string[] | null | undefined) {
  if (!Array.isArray(input)) return [];
  return input.map(String).filter(Boolean);
}

export function getUnifiedSearchColumns(sourceColumns?: readonly string[] | string[]) {
  const source = normalizeColumns(sourceColumns ?? unifiedColumns);
  const startIndex = source.indexOf(UNIFIED_SEARCH_RANGE_START_KEY);
  const endIndex = source.indexOf(UNIFIED_SEARCH_RANGE_END_KEY);

  if (startIndex >= 0 && endIndex >= startIndex) {
    return source.slice(startIndex, endIndex + 1);
  }

  return [...FALLBACK_UNIFIED_SEARCH_COLUMNS];
}

export const UNIFIED_SEARCH_COLUMNS = getUnifiedSearchColumns();

export function getUnifiedSearchRange(): UnifiedSearchRange {
  return { ...UNIFIED_SEARCH_RANGE };
}

export function isUnifiedSearchColumn(key: string, sourceColumns?: readonly string[] | string[]) {
  const columns = getUnifiedSearchColumns(sourceColumns);
  return columns.includes(String(key ?? ""));
}

export function getUnifiedSearchColumnIndexMap(sourceColumns?: readonly string[] | string[]) {
  const columns = getUnifiedSearchColumns(sourceColumns);
  const map: Record<string, number> = {};

  columns.forEach((key, index) => {
    map[key] = index;
  });

  return map;
}