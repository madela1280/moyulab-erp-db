// app/views/unified/extensions/extensionCompute.ts

export const EXTENSION_KEYS = [
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
  "6차연장",
  "7차연장",
  "8차연장",
  "9차연장",
  "10차연장",
  "11차연장",
  "12차연장",
  "13차연장",
  "14차연장",
  "15차연장",
] as const;

export type ExtensionKey = (typeof EXTENSION_KEYS)[number];

/**
 * 총연장횟수 계산:
 * - 1차~15차 중 "값이 존재"하는 셀 개수를 카운트
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
 * "n차연장" 셀 텍스트("연장일수/결제수단/금액/접수일")에서 연장일수만 추출
 * - 비어있거나 숫자 파싱 불가면 0
 * - 음수는 0 처리
 */
export function getExtensionDaysFromCellText(raw: any): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;

  const first = s.split("/")[0]?.trim() ?? "";
  const n = Number(first);
  if (!Number.isFinite(n)) return 0;

  const i = Math.floor(n);
  return i > 0 ? i : 0;
}

/**
 * 0차연장(직접입력/업로드) 값 + 1차~15차 연장일수 합계(일수)
 * - 0차연장은 숫자 문자열(예: "14")로 저장된다는 전제
 * - 비어있거나 파싱 실패면 0
 */
export function sumExtensionDaysFromRow(rowData: Record<string, any> | null | undefined): number {
  const d = rowData ?? {};

  const zeroRaw = (d as any)?.["0차연장"];
  const zeroNorm = normalizeNonNegativeIntString(zeroRaw);
  const zeroDays = zeroNorm ? Number(zeroNorm) : 0;

  let total = Number.isFinite(zeroDays) ? zeroDays : 0;

  for (const key of EXTENSION_KEYS) {
    total += getExtensionDaysFromCellText((d as any)?.[key]);
  }

  return Math.max(0, Math.floor(total));
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