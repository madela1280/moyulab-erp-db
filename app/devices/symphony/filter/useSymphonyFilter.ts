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

// ✅ 날짜 전용 그룹 필터(엑셀 느낌): 현재는 구매일만 적용
const DATE_GROUP_KEYS = new Set(["구매일"]);

function parseYmd(raw: string) {
  const s = toText(raw).trim();
  if (!s) return null;

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return { y, m, d };
  }

  // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

  return { y, m: mo, d };
}

function yearLabel(y: number) {
  return `${y}년`;
}

function monthLabel(y: number, m: number) {
  return `${y}년 ${m}월`;
}

function parseGroupLabel(s: string) {
  const m = s.match(/^(\d{4})년(?:\s+(\d{1,2})월)?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : null;
  return { y, m: mo };
}

/**
 * 특정 컬럼의 "고유 값 목록" 생성(필터 팝오버 체크리스트용)
 * - 구매일: YYYY년 / YYYY년 M월 그룹 목록 생성
 * - 그 외: 기존 동일
 */
export function getUniqueValuesForColumn<T extends { data: Record<string, any> }>(
  rows: T[],
  key: string
) {
  // 기본 동작
  if (!DATE_GROUP_KEYS.has(key)) {
    const set = new Set<string>();
    for (const r of rows) set.add(toText(r.data?.[key]));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
  }

  // 날짜 그룹 동작(구매일)
  const set = new Set<string>();

  for (const r of rows) {
    const raw = toText(r.data?.[key]).trim();

    // 공란은 기존 규칙 유지("" -> UI에서 (필드 값 없음))
    if (!raw) {
      set.add("");
      continue;
    }

    const parsed = parseYmd(raw);
    if (!parsed) {
      // 날짜 파싱 안 되면 원문 유지
      set.add(raw);
      continue;
    }

    set.add(yearLabel(parsed.y));
    set.add(monthLabel(parsed.y, parsed.m));
  }

  const arr = Array.from(set);

  // 연/월 라벨은 최신 우선 정렬, 그 외 텍스트는 아래쪽
  arr.sort((a, b) => {
    if (a === "" && b !== "") return -1;
    if (b === "" && a !== "") return 1;

    const pa = parseGroupLabel(a);
    const pb = parseGroupLabel(b);

    if (pa && pb) {
      if (pa.y !== pb.y) return pb.y - pa.y;

      const am = pa.m == null ? 0 : pa.m;
      const bm = pb.m == null ? 0 : pb.m;
      return bm - am;
    }

    if (pa && !pb) return -1;
    if (!pa && pb) return 1;

    return a.localeCompare(b, "ko-KR");
  });

  return arr;
}

/**
 * rows에 현재 필터 상태를 적용
 * - 구매일: 선택값(연/월 라벨)이면 해당 범위 날짜를 통과
 * - 그 외: 기존 exact match
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

      const raw = toText(row.data?.[key]).trim();

      // 기본 컬럼
      if (!DATE_GROUP_KEYS.has(key)) {
        if (!selectedSet.has(raw)) return false;
        continue;
      }

      // 날짜 그룹 컬럼(구매일)
      // 공란
      if (!raw) {
        if (!selectedSet.has("")) return false;
        continue;
      }

      const parsed = parseYmd(raw);
      if (!parsed) {
        // 파싱 실패 값은 원문 exact
        if (!selectedSet.has(raw)) return false;
        continue;
      }

      const yLabel = yearLabel(parsed.y);
      const mLabel = monthLabel(parsed.y, parsed.m);

      // 연도 선택 또는 연월 선택 중 하나라도 맞으면 통과
      if (!selectedSet.has(yLabel) && !selectedSet.has(mLabel)) return false;
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