"use client";

export type LactinaSortState = {
  key: string | null;
  dir: "asc" | "desc";
};

export function defaultSortState(): LactinaSortState {
  return { key: null, dir: "asc" };
}

function toText(v: any) {
  return String(v ?? "").trim();
}

type RowLike = { id: number; data: Record<string, any> };

export function applyLactinaSort<T extends RowLike>(rows: T[], sort: LactinaSortState) {
  const key = sort?.key ?? null;
  if (!key) return rows;

  const dir = sort?.dir === "desc" ? "desc" : "asc";

  const out = [...rows].sort((a, b) => {
    const av = toText(a?.data?.[key]);
    const bv = toText(b?.data?.[key]);
    const cmp = av.localeCompare(bv, "ko-KR");
    return dir === "asc" ? cmp : -cmp;
  });

  return out;
}