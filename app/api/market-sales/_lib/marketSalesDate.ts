// app/api/market-sales/_lib/marketSalesDate.ts

// "YYYY-MM-DD" -> "YYYYMMDD" (이카운트 IO_DATE 형식, 쿠팡 로켓그로스 paidDateFrom/To 형식 공용)
export function toEcountIoDate(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}${m[2]}${m[3]}`;
}
