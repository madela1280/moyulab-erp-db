"use client";

import type { SimileRow } from "@/devices/simile/service/serviceSimile";

export type ColumnFilterState = {
  selectedByKey: Record<string, Set<string>>;
  searchByKey: Record<string, string>;
};

export function createEmptyFilterState(): ColumnFilterState {
  return { selectedByKey: {}, searchByKey: {} };
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
export function getUniqueValuesForColumn(rows: SimileRow[], key: string) {
  if (!DATE_GROUP_KEYS.has(key)) {
    const set = new Set<string>();
    for (const r of rows) set.add(toText(r?.data?.[key]).trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
  }

  const set = new Set<string>();

  for (const r of rows) {
    const raw = toText(r?.data?.[key]).trim();

    if (!raw) {
      set.add("");
      continue;
    }

    const parsed = parseYmd(raw);
    if (!parsed) {
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
export function applySimileFilter(rows: SimileRow[], state: ColumnFilterState) {
  const selectedByKey = state?.selectedByKey ?? {};
  const entries = Object.entries(selectedByKey);

  if (!entries.length) return rows;

  return rows.filter((row) => {
    for (const [key, selectedSet] of entries) {
      if (!selectedSet || selectedSet.size === 0) continue;

      const raw = toText(row?.data?.[key]).trim();

      if (!DATE_GROUP_KEYS.has(key)) {
        if (!selectedSet.has(raw)) return false;
        continue;
      }

      if (!raw) {
        if (!selectedSet.has("")) return false;
        continue;
      }

      const parsed = parseYmd(raw);
      if (!parsed) {
        if (!selectedSet.has(raw)) return false;
        continue;
      }

      const yLabel = yearLabel(parsed.y);
      const mLabel = monthLabel(parsed.y, parsed.m);

      if (!selectedSet.has(yLabel) && !selectedSet.has(mLabel)) return false;
    }

    return true;
  });
}

/**
 * 필터가 "실제로 적용되어 있는지" (UI 표시용)
 * - 요구사항: selectedByKey 기준
 */
export function isFilterActive(state: ColumnFilterState) {
  const selectedByKey = state?.selectedByKey ?? {};
  for (const s of Object.values(selectedByKey)) {
    if (s && s.size > 0) return true;
  }
  return false;
}