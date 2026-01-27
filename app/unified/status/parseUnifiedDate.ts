// app/unified/status/parseUnifiedDate.ts

export type ParsedCell =
  | { kind: "empty" }
  | { kind: "date"; date: Date }
  | { kind: "text"; text: string };

/**
 * 통합관리 셀 값이 "날짜"인지, "문자(대여취소 등)"인지, "빈값"인지 판별한다.
 * - 날짜로 판정되면 kind:"date"
 * - 날짜가 아니면서 값이 있으면 kind:"text"
 * - null/undefined/""(공백 포함)이면 kind:"empty"
 */
export function parseUnifiedCell(value: unknown): ParsedCell {
  if (value === null || value === undefined) return { kind: "empty" };

  // Date 객체
  if (value instanceof Date) {
    const t = value.getTime();
    if (!Number.isNaN(t)) return { kind: "date", date: startOfDay(value) };
    return { kind: "text", text: String(value) };
  }

  // 숫자 (timestamp(ms)로 들어오는 예외 케이스만 지원)
  if (typeof value === "number" && Number.isFinite(value)) {
    // 2001-09-09 ms 기준(대충)보다 크면 timestamp로 간주
    if (value > 1_000_000_000_000) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return { kind: "date", date: startOfDay(d) };
    }
    return { kind: "text", text: String(value) };
  }

  // 문자열
  const s = String(value).trim();
  if (!s) return { kind: "empty" };

  // ISO datetime이면 날짜부분만 우선 파싱(타임존 흔들림 방지)
  const isoDatePart = s.includes("T") ? s.split("T")[0] : s;

  const ymd = parseYMDLike(isoDatePart) ?? parseYYYYMMDD(isoDatePart);
  if (ymd) {
    const d = new Date(ymd.y, ymd.m - 1, ymd.d);
    if (isValidDate(d) && d.getFullYear() === ymd.y && d.getMonth() === ymd.m - 1 && d.getDate() === ymd.d) {
      return { kind: "date", date: startOfDay(d) };
    }
  }

  // new Date(...)로 마지막 시도(브라우저 파서 의존)
  const loose = new Date(s);
  if (isValidDate(loose)) return { kind: "date", date: startOfDay(loose) };

  return { kind: "text", text: s };
}

export function isValidDate(d: Date) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function todayStart(base: Date = new Date()) {
  return startOfDay(base);
}

function parseYMDLike(s: string): { y: number; m: number; d: number } | null {
  // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function parseYYYYMMDD(s: string): { y: number; m: number; d: number } | null {
  // YYYYMMDD
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}