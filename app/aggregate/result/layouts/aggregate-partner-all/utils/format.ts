export function toSafeNumber(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePumpLabel(v: string) {
  const s = String(v ?? "").trim();
  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀레";
  if (s.includes("각시밀")) return "각시밀";
  return s;
}

export function formatNumber(v: number | null | undefined) {
  return toSafeNumber(v).toLocaleString("ko-KR");
}

export function formatDays(v: number | null | undefined) {
  return Math.round(toSafeNumber(v)).toLocaleString("ko-KR");
}