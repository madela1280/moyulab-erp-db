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
 * ✅ 0차연장 2순위(종료일-시작일 자동계산) 규칙 삭제
 * - 더 이상 자동계산/표시/자동기록을 하지 않음
 * - (호환성) 기존 호출부가 남아있어도 동작하지 않도록 항상 null 반환
 */
export function computeZeroExtensionDaysFromDates(
  _startDateRaw: string,
  _endDateRaw: string
): string | null {
  return null;
}