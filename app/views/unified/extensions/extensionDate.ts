// app/views/unified/extensions/extensionDate.ts

/**
 * ✅ 시작일 + 총 연장일수(0차+1차+...n차) => 종료일(YYYY-MM-DD)
 * - 시작일 파싱 실패면 null
 * - totalDays가 0/빈값이면 종료일을 자동 생성하지 않음
 *   → 시작일만 수기 입력했을 때 종료일에 같은 날짜가 자동 표시되는 문제 방지
 */
export function computeEndDateFromStartAndTotalDays(
  startDateRaw: string,
  totalDaysRaw: any
): string | null {
  const start = parseYMD(startDateRaw);
  if (!start) return null;

  const days = Number(String(totalDaysRaw ?? "").trim());
  if (!Number.isFinite(days)) return null;

  const d = Math.floor(days);
  if (d <= 0) return null;

  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
  return toYMD(end);
}

/**
 * (기존 유지) 종료일(YYYY-MM-DD 또는 YYYY.MM.DD 또는 YYYY/MM/DD) + N일 => YYYY-MM-DD
 * - 종료일이 없거나 파싱 실패면 null
 * - days가 0/빈값이면 원본 종료일을 유지(= 그대로 반환)
 */
export function addDaysToEndDate(endDateRaw: string, daysRaw: string): string | null {
  const end = parseYMD(endDateRaw);
  if (!end) return null;

  const days = Number(String(daysRaw ?? "").trim());
  if (!Number.isFinite(days)) return toYMD(end);
  const d = Math.floor(days);
  if (d <= 0) return toYMD(end);

  const next = new Date(end.getFullYear(), end.getMonth(), end.getDate() + d);
  return toYMD(next);
}

/**
 * (기존 유지) 종료일(YYYY-MM-DD 또는 YYYY.MM.DD 또는 YYYY/MM/DD) - N일 => YYYY-MM-DD
 * - 종료일이 없거나 파싱 실패면 null
 * - days가 0/빈값이면 원본 종료일을 유지(= 그대로 반환)
 */
export function subDaysFromEndDate(endDateRaw: string, daysRaw: string): string | null {
  const end = parseYMD(endDateRaw);
  if (!end) return null;

  const days = Number(String(daysRaw ?? "").trim());
  if (!Number.isFinite(days)) return toYMD(end);
  const d = Math.floor(days);
  if (d <= 0) return toYMD(end);

  const next = new Date(end.getFullYear(), end.getMonth(), end.getDate() - d);
  return toYMD(next);
}

function parseYMD(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // "1900-01-00" 같은 비정상 값은 무시
  if (/^1900[-./]01[-./]00(\b|$)/.test(s)) return null;

  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]);
    const d = Number(m1[3]);
    return safeDate(y, mo, d);
  }

  // ISO datetime -> date part만
  if (s.includes("T")) {
    const datePart = s.split("T")[0];
    return parseYMD(datePart);
  }

  return null;
}

function safeDate(y: number, m: number, d: number): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}