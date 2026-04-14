export type ParsedExtendValue = {
  days: number;
  raw: string;
};

function toSafeInt(v: any) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  return Math.floor(n);
}

export function parseExtendValue(rawValue: any): ParsedExtendValue {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { days: 0, raw };

  // "30", "30/계좌/20000/260210", "30/ / / " 모두 첫 토큰 숫자 사용
  const first = raw.split("/")[0] ?? "";
  const days = toSafeInt(first);
  return { days, raw };
}