// app/api/market-sales/_lib/marketSalesDate.ts

// "YYYY-MM-DD" -> "YYYYMMDD" (이카운트 IO_DATE 형식, 쿠팡 로켓그로스 paidDateFrom/To 형식 공용)
export function toEcountIoDate(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}${m[2]}${m[3]}`;
}

// "YYYY-MM-DD" + 일수(음수 가능) -> "YYYYMMDD"
export function addDaysToYYYYMMDD(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

// epoch ms -> 한국시간(Asia/Seoul) 기준 "YYYY-MM-DD"
export function epochMsToKstDateString(epochMs: number): string {
  const d = new Date(epochMs);
  // ko-KR Intl 포맷 대신 UTC+9 직접 계산 — 포맷 로케일 차이에 의존하지 않기 위함.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}
