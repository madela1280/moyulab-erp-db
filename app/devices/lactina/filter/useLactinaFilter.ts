"use client";

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

// ✅ 날짜 전용 그룹 필터(엑셀 느낌): 구매일
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

export function getUniqueValuesForColumn<T extends { data: Record<string, any> }>(
  rows: T[],
  key: string
) {
  if (!DATE_GROUP_KEYS.has(key)) {
    const set = new Set<string>();
    for (const r of rows) set.add(toText(r.data?.[key]).trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
  }

  const set = new Set<string>();

  for (const r of rows) {
    const raw = toText(r.data?.[key]).trim();

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

export function applyLactinaFilter<T extends { data: Record<string, any> }>(
  rows: T[],
  state: ColumnFilterState
): T[] {
  const entries = Object.entries(state.selectedByKey ?? {});
  if (!entries.length) return rows;

  return rows.filter((row) => {
    for (const [key, selectedSet] of entries) {
      if (!selectedSet || selectedSet.size === 0) continue;

      const raw = toText(row.data?.[key]).trim();

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

export function isFilterActive(state: ColumnFilterState) {
  const selectedByKey = state?.selectedByKey ?? {};
  for (const s of Object.values(selectedByKey)) {
    if (s && s.size > 0) return true;
  }
  return false;
}