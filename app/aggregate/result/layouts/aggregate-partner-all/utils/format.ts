export function toSafeNumber(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumber(v: number | null | undefined) {
  return toSafeNumber(v).toLocaleString("ko-KR");
}

export function formatDays(v: number | null | undefined) {
  return Math.round(toSafeNumber(v)).toLocaleString("ko-KR");
}