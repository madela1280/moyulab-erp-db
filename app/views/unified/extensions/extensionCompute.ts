// app/views/unified/extensions/extensionCompute.ts

export const EXTENSION_KEYS = [
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
  "6차연장",
  "7차연장",
] as const;

export type ExtensionKey = (typeof EXTENSION_KEYS)[number];

/**
 * 총연장횟수 계산:
 * - 1차~7차 중 "값이 존재"하는 셀 개수를 카운트
 * - 셀 값은 통상 "연장일수/결제수단/금액/접수일" 포맷 문자열
 * - null/undefined/""/공백은 "없음"으로 처리
 */
export function countExtensionRounds(rowData: Record<string, any> | null | undefined): number {
  const d = rowData ?? {};
  let count = 0;

  for (const key of EXTENSION_KEYS) {
    const v = String((d as any)?.[key] ?? "").trim();
    if (v) count++;
  }

  return count;
}

/**
 * 0차연장(종료일-시작일) 계산 유틸:
 * - 시작일/종료일이 파싱 실패면 null
 * - "1900-01-00" 같은 비정상 날짜는 null
 * - 결과는 "일수" 문자열(예: "30")
 * - end < start 인 경우도 null (데이터 오류로 간주)
 */
export function computeZeroExtensionDaysFromDates(
  startDateRaw: string,
  endDateRaw: string
): string | null {
  const start = parseYMD(startDateRaw);
  const end = parseYMD(endDateRaw);
  if (!start || !end) return null;

  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / 86400000); // 24*60*60*1000

  if (!Number.isFinite(days) || days < 0) return null;
  return String(days);
}

/**
 * 사용자 직접입력/서버 저장값 검증용:
 * - 정수로 해석 가능하면 0 이상만 허용
 * - 그 외는 null
 */
export function normalizeNonNegativeIntString(raw: any): string | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 0) return null;
  return String(i);
}

/* ----------------------- 내부 날짜 파서 ----------------------- */

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